import type { AccountSession, AuthAdapter, AuthResult } from '../auth'

export interface FakeAuthCall {
  method: string
  [key: string]: unknown
}

export interface FakeAuthAdapter extends AuthAdapter {
  readonly calls: FakeAuthCall[]
  signInWithGoogle(): Promise<AuthResult>
  simulateSignIn(session: AccountSession): void
}

export interface FakeAuthOptions {
  initialSession?: AccountSession | null
  isGoogleConfigured?: boolean
  magicLinkError?: string
  handoffError?: string
  googleError?: string
  signOutError?: string
}

export function createFakeAuthAdapter(
  options: FakeAuthOptions = {},
): FakeAuthAdapter {
  let currentSession: AccountSession | null = options.initialSession ?? null
  const listeners = new Set<(session: AccountSession | null) => void>()
  const calls: FakeAuthCall[] = []

  const notify = () => {
    for (const listener of listeners) {
      listener(currentSession)
    }
  }

  return {
    isGoogleConfigured: options.isGoogleConfigured ?? false,
    calls,
    getSession: () => currentSession,
    signInWithMagicLink: async (email: string): Promise<AuthResult> => {
      calls.push({ method: 'signInWithMagicLink', email })
      if (options.magicLinkError) {
        return { error: options.magicLinkError }
      }
      return {}
    },
    sendHandoffMagicLink: async (email: string): Promise<AuthResult> => {
      calls.push({ method: 'sendHandoffMagicLink', email })
      if (options.handoffError ?? options.magicLinkError) {
        return { error: options.handoffError ?? options.magicLinkError }
      }
      return {}
    },
    signInWithGoogle: async (): Promise<AuthResult> => {
      calls.push({ method: 'signInWithGoogle' })
      if (options.googleError) {
        return { error: options.googleError }
      }
      return {}
    },
    signOut: async (): Promise<AuthResult> => {
      calls.push({ method: 'signOut' })
      if (options.signOutError) {
        return { error: options.signOutError }
      }
      currentSession = null
      notify()
      return {}
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    simulateSignIn: (session: AccountSession) => {
      currentSession = session
      notify()
    },
  }
}
