import type { Auth, AccountSession, AuthResult } from './auth'
import type {
  SyncAdapter,
  SyncPullResult,
  SyncPushResult,
  RemoteDocument,
} from './sync'
import type { SharedState } from './persistence'

export interface Clock {
  now(): number
  subscribe(listener: () => void): () => void
  subscribeHeartbeat(listener: () => void): () => void
}

export interface Storage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface ExportSink {
  save(filename: string, mimeType: string, contents: string): void
}

export interface Runtime {
  clock: Clock
  storage: Storage
  exportSink: ExportSink
  auth: Auth
  sync: SyncAdapter
}

interface SupabaseAuthSessionResponse {
  access_token: string
  refresh_token: string
  expires_at?: number
  user: {
    id: string
    email?: string
  }
}

const SUPABASE_AUTH_STORAGE_KEY = 'day-labels:supabase-auth'

function getSavedSupabaseSession(): SupabaseAuthSessionResponse | null {
  try {
    const raw = window.localStorage.getItem(SUPABASE_AUTH_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SupabaseAuthSessionResponse) : null
  } catch {
    return null
  }
}

function saveSupabaseSession(session: SupabaseAuthSessionResponse | null): void {
  try {
    if (session) {
      window.localStorage.setItem(
        SUPABASE_AUTH_STORAGE_KEY,
        JSON.stringify(session),
      )
    } else {
      window.localStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY)
    }
  } catch {
    // Ignore storage quota or access issues
  }
}

function createLiveSupabaseAuth(
  supabaseUrl: string,
  anonKey: string,
  isGoogleConfigured: boolean,
): Auth {
  const subscribers = new Set<(session: AccountSession | null) => void>()
  let currentSession = getSavedSupabaseSession()

  const notify = () => {
    const session = getSession()
    for (const sub of subscribers) {
      sub(session)
    }
  }

  // Parse access_token hash from OAuth / Magic Link redirect if present
  if (typeof window !== 'undefined' && window.location.hash) {
    try {
      const hashParams = new URLSearchParams(
        window.location.hash.replace(/^#/, ''),
      )
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const expiresIn = hashParams.get('expires_in')

      if (accessToken) {
        // Fetch user info with the token
        fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
          },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((user) => {
            if (user && user.id) {
              const newSession: SupabaseAuthSessionResponse = {
                access_token: accessToken,
                refresh_token: refreshToken ?? '',
                expires_at: expiresIn
                  ? Math.floor(Date.now() / 1000) + Number(expiresIn)
                  : undefined,
                user: {
                  id: user.id,
                  email: user.email,
                },
              }
              currentSession = newSession
              saveSupabaseSession(newSession)
              // Clear hash from URL cleanly
              window.history.replaceState(
                null,
                document.title,
                window.location.pathname + window.location.search,
              )
              notify()
            }
          })
          .catch(() => {
            // Ignore token validation errors
          })
      }
    } catch {
      // Ignore hash parsing errors
    }
  }

  function getSession(): AccountSession | null {
    if (!currentSession || !currentSession.user?.id) {
      return null
    }
    return {
      accountId: currentSession.user.id,
      email: currentSession.user.email ?? '',
    }
  }

  return {
    isGoogleConfigured,
    getSession,
    async signInWithMagicLink(email: string): Promise<AuthResult> {
      try {
        const response = await fetch(`${supabaseUrl}/auth/v1/magiclink`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
          },
          body: JSON.stringify({
            email,
            options: {
              emailRedirectTo: window.location.origin,
            },
          }),
        })

        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          return {
            error:
              (body as { msg?: string; error_description?: string; message?: string })
                .msg ??
              (body as { error_description?: string }).error_description ??
              (body as { message?: string }).message ??
              'Failed to send magic link',
          }
        }

        return {}
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
    async signInWithGoogle(): Promise<AuthResult> {
      try {
        const redirectTo = encodeURIComponent(window.location.origin)
        const authUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${redirectTo}`
        window.location.href = authUrl
        return {}
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) }
      }
    },
    async signOut(): Promise<AuthResult> {
      try {
        if (currentSession?.access_token) {
          await fetch(`${supabaseUrl}/auth/v1/logout`, {
            method: 'POST',
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${currentSession.access_token}`,
            },
          }).catch(() => {})
        }
      } finally {
        currentSession = null
        saveSupabaseSession(null)
        notify()
      }
      return {}
    },
    subscribe(listener: (session: AccountSession | null) => void) {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
  }
}

function createLiveSupabaseSync(
  supabaseUrl: string,
  anonKey: string,
): SyncAdapter {
  function getAccessToken(): string | null {
    const session = getSavedSupabaseSession()
    return session?.access_token ?? null
  }

  return {
    async pull(accountId: string): Promise<SyncPullResult> {
      const token = getAccessToken()
      if (!token) {
        return { status: 'offline', error: 'Not authenticated' }
      }

      try {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/account_states?user_id=eq.${encodeURIComponent(
            accountId,
          )}&select=version,shared`,
          {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          },
        )

        if (!response.ok) {
          return { status: 'offline', error: `HTTP ${response.status}` }
        }

        const data = (await response.json()) as Array<{
          version: number
          shared: SharedState
        }>

        if (!Array.isArray(data) || data.length === 0) {
          return { status: 'success', document: null }
        }

        return {
          status: 'success',
          document: {
            version: data[0].version,
            shared: data[0].shared,
          },
        }
      } catch (err) {
        return {
          status: 'offline',
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },

    async push(
      accountId: string,
      shared: SharedState,
      baseVersion: number | null,
    ): Promise<SyncPushResult> {
      const token = getAccessToken()
      if (!token) {
        return { status: 'offline', error: 'Not authenticated' }
      }

      try {
        // First check existing remote version if baseVersion is specified or unknown
        const pullRes = await fetch(
          `${supabaseUrl}/rest/v1/account_states?user_id=eq.${encodeURIComponent(
            accountId,
          )}&select=version,shared`,
          {
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${token}`,
              Accept: 'application/json',
            },
          },
        )

        if (!pullRes.ok) {
          return { status: 'offline', error: `HTTP ${pullRes.status}` }
        }

        const existing = (await pullRes.json()) as Array<{
          version: number
          shared: SharedState
        }>

        const remoteDoc: RemoteDocument | null =
          Array.isArray(existing) && existing.length > 0
            ? { version: existing[0].version, shared: existing[0].shared }
            : null

        // Detect version conflict: remote exists and its version is different from baseVersion
        if (remoteDoc !== null) {
          if (baseVersion === null || remoteDoc.version !== baseVersion) {
            return {
              status: 'conflict',
              remote: remoteDoc,
            }
          }
        }

        const newVersion = (baseVersion ?? 0) + 1
        const payload = {
          user_id: accountId,
          version: newVersion,
          shared,
          updated_at: new Date().toISOString(),
        }

        const upsertRes = await fetch(
          `${supabaseUrl}/rest/v1/account_states?on_conflict=user_id`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: anonKey,
              Authorization: `Bearer ${token}`,
              Prefer: 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(payload),
          },
        )

        if (!upsertRes.ok) {
          return { status: 'offline', error: `HTTP ${upsertRes.status}` }
        }

        return {
          status: 'success',
          document: {
            version: newVersion,
            shared,
          },
        }
      } catch (err) {
        return {
          status: 'offline',
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
  }
}

export function createBrowserRuntime(): Runtime {
  let currentNow = Date.now()

  const refreshNow = (listener: () => void) => {
    currentNow = Date.now()
    listener()
  }

  const watchPageVisibility = (listener: () => void) => {
    const onVisibilityChange = () => refreshNow(listener)

    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onVisibilityChange)
    }
  }

  const supabaseUrl =
    (typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_SUPABASE_URL?.replace(/\/+$/, '')) ||
    ''
  const anonKey =
    (typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_SUPABASE_ANON_KEY) ||
    ''
  const isGoogleConfigured =
    (typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_SUPABASE_GOOGLE_ENABLED === 'true') ||
    false

  const auth =
    supabaseUrl && anonKey
      ? createLiveSupabaseAuth(supabaseUrl, anonKey, isGoogleConfigured)
      : {
          isGoogleConfigured: false,
          getSession: () => null,
          signInWithMagicLink: async () => ({ error: 'Auth not configured' }),
          signOut: async () => ({}),
          subscribe: () => () => {},
        }

  const sync: SyncAdapter =
    supabaseUrl && anonKey
      ? createLiveSupabaseSync(supabaseUrl, anonKey)
      : {
          pull: async (): Promise<SyncPullResult> => ({
            status: 'offline',
            error: 'Sync not configured',
          }),
          push: async (): Promise<SyncPushResult> => ({
            status: 'offline',
            error: 'Sync not configured',
          }),
        }

  return {
    clock: {
      now: () => currentNow,
      subscribe: (listener) => {
        const interval = window.setInterval(
          () => refreshNow(listener),
          1000,
        )
        const stopWatching = watchPageVisibility(listener)

        return () => {
          window.clearInterval(interval)
          stopWatching()
        }
      },
      subscribeHeartbeat: watchPageVisibility,
    },
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => {
        window.localStorage.setItem(key, value)
      },
    },
    exportSink: {
      save: (filename, mimeType, contents) => {
        const url = URL.createObjectURL(new Blob([contents], { type: mimeType }))
        const anchor = document.createElement('a')

        anchor.href = url
        anchor.download = filename
        anchor.click()
        window.setTimeout(() => URL.revokeObjectURL(url), 0)
      },
    },
    auth,
    sync,
  }
}
