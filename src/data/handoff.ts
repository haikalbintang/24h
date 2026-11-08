export const HANDOFF_QUERY_PARAM = 'handoff'

const TOKEN_BYTES = 32

/** A high-entropy, URL-safe capability token for one Device handoff. */
export function createHandoffToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES)
  globalThis.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  )
}

export function buildHandoffUrl(baseUrl: string, token: string): string {
  const url = new URL(baseUrl)
  url.searchParams.set(HANDOFF_QUERY_PARAM, token)
  return url.toString()
}

export function readHandoffToken(href: string): string | null {
  try {
    const token = new URL(href).searchParams.get(HANDOFF_QUERY_PARAM)
    return token ? token : null
  } catch {
    return null
  }
}

/**
 * Removes the handoff capability from the browser URL bar while preserving any
 * other query parameters and the hash.
 */
export function withoutHandoffParam(href: string): string {
  const url = new URL(href)
  url.searchParams.delete(HANDOFF_QUERY_PARAM)
  return `${url.pathname}${url.search}${url.hash}`
}
