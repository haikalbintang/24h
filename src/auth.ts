export interface AccountSession {
  accountId: string
  email: string
}

export interface AuthResult {
  error?: string
}

export interface HandoffResult extends AuthResult {
  url?: string
}

export interface Auth {
  readonly isGoogleConfigured: boolean
  getSession(): AccountSession | null
  signInWithMagicLink(email: string): Promise<AuthResult>
  sendHandoffMagicLink(email: string): Promise<AuthResult>
  /** Creates a one-time Device handoff link without any external QR service. */
  createHandoff(): Promise<HandoffResult>
  signInWithGoogle?(): Promise<AuthResult>
  signOut(): Promise<AuthResult>
  subscribe(listener: (session: AccountSession | null) => void): () => void
}

export type AuthAdapter = Auth

export function sameAccountSession(
  a: AccountSession | null | undefined,
  b: AccountSession | null | undefined,
): boolean {
  return (
    (a?.accountId ?? null) === (b?.accountId ?? null) &&
    (a?.email ?? null) === (b?.email ?? null)
  )
}
