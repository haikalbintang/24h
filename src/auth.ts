export interface AccountSession {
  accountId: string
  email: string
}

export interface AuthResult {
  error?: string
}

export interface Auth {
  readonly isGoogleConfigured: boolean
  getSession(): AccountSession | null
  signInWithMagicLink(email: string): Promise<AuthResult>
  signInWithGoogle?(): Promise<AuthResult>
  signOut(): Promise<AuthResult>
  subscribe(listener: (session: AccountSession | null) => void): () => void
}

export type AuthAdapter = Auth
