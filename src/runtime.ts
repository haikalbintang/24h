import type { Auth } from './auth'
import type { SyncAdapter, SyncPullResult, SyncPushResult } from './sync'
import { createSupabaseClient } from './supabase'

export {
  SUPABASE_AUTH_STORAGE_KEY,
  createSupabaseClient,
  createSupabaseSessionManager,
} from './supabase'
export type {
  SupabaseClient,
  SupabaseClientOptions,
  SupabaseSession,
  SupabaseSessionManager,
  SessionStorage,
} from './supabase'

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

  const supabase =
    supabaseUrl && anonKey
      ? createSupabaseClient({
          supabaseUrl,
          anonKey,
          isGoogleConfigured,
        })
      : null

  const auth: Auth =
    supabase?.auth ?? {
      isGoogleConfigured: false,
      getSession: () => null,
      signInWithMagicLink: async () => ({ error: 'Auth not configured' }),
      signOut: async () => ({}),
      subscribe: () => () => {},
    }

  const sync: SyncAdapter =
    supabase?.sync ?? {
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
