import type { AccountSession, Auth, AuthResult } from './auth'
import type { SharedState } from './persistence'
import type {
  RemoteDocument,
  SyncAdapter,
  SyncPullResult,
  SyncPushResult,
} from './sync'

export const SUPABASE_AUTH_STORAGE_KEY = 'day-labels:supabase-auth'

/**
 * Refresh a little early so a request cannot expire while it is in flight.
 */
const REFRESH_SKEW_SECONDS = 60

export interface SupabaseUser {
  id: string
  email?: string
}

export interface SupabaseSession {
  access_token: string
  refresh_token: string
  /** Unix epoch seconds, matching Supabase's `expires_at`. */
  expires_at: number
  user: SupabaseUser
}

export interface SupabaseTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_at?: number
  expires_in?: number
  user?: SupabaseUser
}

export interface SessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface SupabaseClientOptions {
  supabaseUrl: string
  anonKey: string
  isGoogleConfigured?: boolean
  publicAppUrl?: string
  storage?: SessionStorage
  /** Unix epoch seconds. Injectable so tests do not depend on the wall clock. */
  nowSeconds?: () => number
  fetchImpl?: typeof fetch
}

export interface SupabaseSessionManager {
  getSession(): AccountSession | null
  getTokens(): SupabaseSession | null
  getAccessToken(): Promise<string | null>
  refreshAccessToken(): Promise<string | null>
  adoptTokens(response: SupabaseTokenResponse): boolean
  clear(): void
  subscribe(listener: (session: AccountSession | null) => void): () => void
}

function toAccountSession(session: SupabaseSession | null): AccountSession | null {
  if (session === null) {
    return null
  }
  return {
    accountId: session.user.id,
    email: session.user.email ?? '',
  }
}

function sameAccountSession(
  a: AccountSession | null,
  b: AccountSession | null,
): boolean {
  return a?.accountId === b?.accountId && a?.email === b?.email
}

function decodeJwtExpiry(token: string): number | null {
  try {
    const segment = token.split('.')[1]
    if (!segment) {
      return null
    }
    const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded =
      normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const payload = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

function normalizeSession(
  response: SupabaseTokenResponse,
  fallbackUser: SupabaseUser | undefined,
  nowSeconds: number,
): SupabaseSession | null {
  const accessToken = response.access_token
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return null
  }

  const user = response.user ?? fallbackUser
  if (!user?.id) {
    return null
  }

  let expiresAt =
    typeof response.expires_at === 'number' ? response.expires_at : undefined

  if (expiresAt === undefined && typeof response.expires_in === 'number') {
    expiresAt = nowSeconds + response.expires_in
  }

  if (expiresAt === undefined) {
    expiresAt = decodeJwtExpiry(accessToken) ?? nowSeconds + 3600
  }

  return {
    access_token: accessToken,
    refresh_token:
      typeof response.refresh_token === 'string' ? response.refresh_token : '',
    expires_at: expiresAt,
    user: { id: user.id, email: user.email },
  }
}

function readStoredSession(
  storage: SessionStorage,
  nowSeconds: number,
): SupabaseSession | null {
  try {
    const raw = storage.getItem(SUPABASE_AUTH_STORAGE_KEY)
    if (raw === null) {
      return null
    }
    return normalizeSession(
      JSON.parse(raw) as SupabaseTokenResponse,
      undefined,
      nowSeconds,
    )
  } catch {
    return null
  }
}

function getDefaultStorage(): SessionStorage {
  if (typeof window === 'undefined') {
    throw new Error('Supabase session storage is not available')
  }
  return window.localStorage
}

function getDefaultFetch(): typeof fetch {
  return ((input, init) => fetch(input, init)) as typeof fetch
}

export function createSupabaseSessionManager(
  options: SupabaseClientOptions,
): SupabaseSessionManager {
  const supabaseUrl = options.supabaseUrl.replace(/\/+$/, '')
  const storage = options.storage ?? getDefaultStorage()
  const nowSeconds =
    options.nowSeconds ?? (() => Math.floor(Date.now() / 1000))
  const fetchImpl = options.fetchImpl ?? getDefaultFetch()

  const subscribers = new Set<(session: AccountSession | null) => void>()
  let current = readStoredSession(storage, nowSeconds())
  let refreshInFlight: Promise<SupabaseSession | null> | null = null

  const emit = () => {
    const session = toAccountSession(current)
    for (const subscriber of subscribers) {
      subscriber(session)
    }
  }

  const setCurrent = (next: SupabaseSession | null) => {
    const before = toAccountSession(current)
    current = next
    try {
      if (next === null) {
        storage.removeItem(SUPABASE_AUTH_STORAGE_KEY)
      } else {
        storage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify(next))
      }
    } catch {
      // Ignore storage quota or access issues; the in-memory session still works.
    }

    // A refreshed token keeps the same Account identity, so it must not look
    // like a sign-in change to the app (that would queue a needless sync push).
    if (!sameAccountSession(before, toAccountSession(next))) {
      emit()
    }
  }

  const isExpiring = (session: SupabaseSession) =>
    session.expires_at <= nowSeconds() + REFRESH_SKEW_SECONDS

  const fetchCoordinatedSession = async (
    session: SupabaseSession,
  ): Promise<SupabaseSession | null> => {
    try {
      const response = await fetchImpl(
        `${supabaseUrl}/rest/v1/account_sessions?user_id=eq.${encodeURIComponent(
          session.user.id,
        )}&select=access_token,refresh_token,expires_at`,
        {
          headers: {
            apikey: options.anonKey,
            Authorization: `Bearer ${session.access_token}`,
            Accept: 'application/json',
          },
        },
      )

      if (!response.ok) {
        return null
      }

      const rows = (await response.json()) as Array<{
        access_token?: string
        refresh_token?: string
        expires_at?: number
      }>

      const row = Array.isArray(rows) ? rows[0] : undefined
      if (
        !row ||
        typeof row.access_token !== 'string' ||
        typeof row.refresh_token !== 'string' ||
        typeof row.expires_at !== 'number'
      ) {
        return null
      }

      // Ignore a row older than what this device already holds.
      if (row.expires_at < session.expires_at) {
        return null
      }

      return {
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expires_at: row.expires_at,
        user: session.user,
      }
    } catch {
      return null
    }
  }

  const publishCoordinatedSession = async (
    session: SupabaseSession,
  ): Promise<void> => {
    try {
      await fetchImpl(
        `${supabaseUrl}/rest/v1/account_sessions?on_conflict=user_id`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: options.anonKey,
            Authorization: `Bearer ${session.access_token}`,
            Prefer: 'resolution=merge-duplicates',
          },
          body: JSON.stringify({
            user_id: session.user.id,
            access_token: session.access_token,
            refresh_token: session.refresh_token,
            expires_at: session.expires_at,
            updated_at: new Date().toISOString(),
          }),
        },
      )
    } catch {
      // Coordination is best-effort; the device still holds a valid session.
    }
  }

  /**
   * Adopt credentials another linked device published, if they are newer than
   * this device's. Reading with a still-valid access token is what keeps two
   * devices from rotating the same refresh token and logging each other out.
   */
  const adoptCoordinatedSession = async (): Promise<SupabaseSession | null> => {
    if (current === null) {
      return null
    }
    const coordinated = await fetchCoordinatedSession(current)
    if (coordinated === null) {
      return null
    }
    setCurrent(coordinated)
    return coordinated
  }

  const performRefresh = async (): Promise<SupabaseSession | null> => {
    if (current === null) {
      return null
    }

    const adopted = await adoptCoordinatedSession()
    if (adopted !== null && !isExpiring(adopted)) {
      return adopted
    }

    const session = current
    if (session === null || session.refresh_token.length === 0) {
      return adopted
    }

    try {
      const response = await fetchImpl(
        `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: options.anonKey,
          },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        },
      )

      if (!response.ok) {
        // Another device may have rotated the shared refresh token between our
        // read and this attempt; re-read before giving up.
        return (await adoptCoordinatedSession()) ?? adopted
      }

      const body = (await response.json()) as SupabaseTokenResponse
      const next = normalizeSession(body, session.user, nowSeconds())
      if (next === null) {
        return (await adoptCoordinatedSession()) ?? adopted
      }

      // Refreshed sessions may omit an unchanged refresh token.
      if (next.refresh_token.length === 0) {
        next.refresh_token = session.refresh_token
      }

      setCurrent(next)
      await publishCoordinatedSession(next)
      return next
    } catch {
      return (await adoptCoordinatedSession()) ?? adopted
    }
  }

  const ensureRefreshed = (): Promise<SupabaseSession | null> => {
    if (refreshInFlight === null) {
      refreshInFlight = performRefresh().finally(() => {
        refreshInFlight = null
      })
    }
    return refreshInFlight
  }

  return {
    getSession: () => toAccountSession(current),
    getTokens: () => current,
    async getAccessToken(): Promise<string | null> {
      if (current === null) {
        return null
      }
      if (!isExpiring(current)) {
        return current.access_token
      }
      const refreshed = await ensureRefreshed()
      return refreshed?.access_token ?? null
    },
    async refreshAccessToken(): Promise<string | null> {
      const refreshed = await ensureRefreshed()
      return refreshed?.access_token ?? null
    },
    adoptTokens(response: SupabaseTokenResponse): boolean {
      const next = normalizeSession(response, current?.user, nowSeconds())
      if (next === null) {
        return false
      }
      if (next.refresh_token.length === 0 && current !== null) {
        next.refresh_token = current.refresh_token
      }
      setCurrent(next)
      return true
    },
    clear(): void {
      setCurrent(null)
    },
    subscribe(listener) {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
  }
}

export function createSupabaseAuth(
  sessionManager: SupabaseSessionManager,
  options: SupabaseClientOptions,
): Auth {
  const supabaseUrl = options.supabaseUrl.replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? getDefaultFetch()
  const handoffRedirectUrl =
    options.publicAppUrl?.trim().replace(/\/+$/, '') || undefined

  const dispatchMagicLink = async (
    email: string,
    emailRedirectTo: string,
  ): Promise<AuthResult> => {
    try {
      const response = await fetchImpl(
        `${supabaseUrl}/auth/v1/magiclink`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: options.anonKey,
          },
          body: JSON.stringify({
            email,
            options: {
              emailRedirectTo,
            },
          }),
        },
      )

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          msg?: string
          error_description?: string
          message?: string
        }
        return {
          error:
            body.msg ??
            body.error_description ??
            body.message ??
            'Failed to send magic link',
        }
      }

      return {}
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }

  return {
    isGoogleConfigured: options.isGoogleConfigured ?? false,
    getSession: () => sessionManager.getSession(),
    signInWithMagicLink(email: string): Promise<AuthResult> {
      return dispatchMagicLink(email, window.location.origin)
    },
    sendHandoffMagicLink(email: string): Promise<AuthResult> {
      return dispatchMagicLink(
        email,
        handoffRedirectUrl ?? window.location.origin,
      )
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
      // Device-local sign-out: clear this device's session without revoking the
      // server session, so other linked devices stay signed in.
      sessionManager.clear()
      return {}
    },
    subscribe(listener) {
      return sessionManager.subscribe(listener)
    },
  }
}

export function createSupabaseSync(
  sessionManager: SupabaseSessionManager,
  options: SupabaseClientOptions,
): SyncAdapter {
  const supabaseUrl = options.supabaseUrl.replace(/\/+$/, '')
  const fetchImpl = options.fetchImpl ?? getDefaultFetch()

  const send = async (
    path: string,
    init: RequestInit,
    retryOnAuthError: boolean,
  ): Promise<Response | null> => {
    const token = await sessionManager.getAccessToken()
    if (token === null) {
      return null
    }

    const response = await fetchImpl(`${supabaseUrl}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        apikey: options.anonKey,
        Authorization: `Bearer ${token}`,
      },
    })

    if (response.status === 401 && retryOnAuthError) {
      const refreshed = await sessionManager.refreshAccessToken()
      if (refreshed === null) {
        return response
      }
      return send(path, init, false)
    }

    return response
  }

  const readRemote = async (
    accountId: string,
  ): Promise<RemoteDocument | null | { error: string }> => {
    const response = await send(
      `/rest/v1/account_states?user_id=eq.${encodeURIComponent(
        accountId,
      )}&select=version,shared`,
      {
        headers: { Accept: 'application/json' },
      },
      true,
    )

    if (response === null) {
      return { error: 'Not authenticated' }
    }

    if (!response.ok) {
      return { error: `HTTP ${response.status}` }
    }

    const data = (await response.json()) as Array<{
      version: number
      shared: SharedState
    }>

    if (!Array.isArray(data) || data.length === 0) {
      return null
    }

    return { version: data[0].version, shared: data[0].shared }
  }

  return {
    async pull(accountId: string): Promise<SyncPullResult> {
      try {
        const remote = await readRemote(accountId)
        if (remote !== null && 'error' in remote) {
          return { status: 'offline', error: remote.error }
        }
        return { status: 'success', document: remote }
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
      try {
        const remote = await readRemote(accountId)
        if (remote !== null && 'error' in remote) {
          return { status: 'offline', error: remote.error }
        }

        if (remote !== null) {
          if (baseVersion === null || remote.version !== baseVersion) {
            return { status: 'conflict', remote }
          }
        }

        const newVersion = (baseVersion ?? 0) + 1
        const payload = {
          user_id: accountId,
          version: newVersion,
          shared,
          updated_at: new Date().toISOString(),
        }

        const upsert = await send(
          '/rest/v1/account_states?on_conflict=user_id',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates,return=representation',
            },
            body: JSON.stringify(payload),
          },
          true,
        )

        if (upsert === null) {
          return { status: 'offline', error: 'Not authenticated' }
        }

        if (!upsert.ok) {
          return { status: 'offline', error: `HTTP ${upsert.status}` }
        }

        return {
          status: 'success',
          document: { version: newVersion, shared },
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

export interface SupabaseClient {
  auth: Auth
  sync: SyncAdapter
  session: SupabaseSessionManager
}

async function consumeAuthRedirect(
  sessionManager: SupabaseSessionManager,
  options: SupabaseClientOptions,
): Promise<void> {
  if (typeof window === 'undefined' || !window.location.hash) {
    return
  }

  const fetchImpl = options.fetchImpl ?? getDefaultFetch()

  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const accessToken = params.get('access_token')
    if (!accessToken) {
      return
    }

    const refreshToken = params.get('refresh_token') ?? ''
    const expiresIn = params.get('expires_in')

    const response = await fetchImpl(
      `${options.supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`,
      {
        headers: {
          apikey: options.anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    if (!response.ok) {
      return
    }

    const user = (await response.json()) as { id?: string; email?: string }
    if (!user.id) {
      return
    }

    sessionManager.adoptTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn ? Number(expiresIn) : undefined,
      user: { id: user.id, email: user.email },
    })

    window.history.replaceState(
      null,
      document.title,
      window.location.pathname + window.location.search,
    )
  } catch {
    // Ignore malformed redirects and token validation errors.
  }
}

export function createSupabaseClient(
  options: SupabaseClientOptions,
): SupabaseClient {
  const session = createSupabaseSessionManager(options)
  void consumeAuthRedirect(session, options)

  return {
    auth: createSupabaseAuth(session, options),
    sync: createSupabaseSync(session, options),
    session,
  }
}
