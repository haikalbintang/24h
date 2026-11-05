import { describe, expect, it } from 'vitest'
import {
  createSupabaseClient,
  SUPABASE_AUTH_STORAGE_KEY,
  type SessionStorage,
} from './supabase'

function createMemoryStorage(
  initialValues: Record<string, string> = {},
): SessionStorage {
  const values = new Map(Object.entries(initialValues))

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}

function seedSession(
  storage: SessionStorage,
  session: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    accountId?: string
    email?: string
  },
) {
  storage.setItem(
    SUPABASE_AUTH_STORAGE_KEY,
    JSON.stringify({
      access_token: session.accessToken,
      refresh_token: session.refreshToken,
      expires_at: session.expiresAt,
      user: {
        id: session.accountId ?? 'acc-1',
        email: session.email ?? 'alex@example.com',
      },
    }),
  )
}

function readSession(storage: SessionStorage) {
  const raw = storage.getItem(SUPABASE_AUTH_STORAGE_KEY)
  return raw === null ? null : JSON.parse(raw)
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface RecordedCall {
  url: string
  method: string
  authorization: string | null
  body: unknown
}

function createFetchRecorder(
  handler: (call: RecordedCall) => Response | Promise<Response>,
) {
  const calls: RecordedCall[] = []

  const fetchImpl = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === 'string' ? input : input.toString()
    const headers = new Headers(init?.headers)
    const body =
      typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body
    const call: RecordedCall = {
      url,
      method: init?.method ?? 'GET',
      authorization: headers.get('Authorization'),
      body,
    }
    calls.push(call)
    return handler(call)
  }) as typeof fetch

  return { calls, fetchImpl }
}

const NOW = 1_800_000_000

function createClient(
  storage: SessionStorage,
  fetchImpl: typeof fetch,
  nowSeconds = () => NOW,
) {
  return createSupabaseClient({
    supabaseUrl: 'https://project.supabase.co',
    anonKey: 'anon-key',
    storage,
    fetchImpl,
    nowSeconds,
  })
}

describe('Supabase session refresh', () => {
  it('refreshes an expired access token before a sync request and persists it', async () => {
    const storage = createMemoryStorage()
    seedSession(storage, {
      accessToken: 'expired-access',
      refreshToken: 'refresh-1',
      expiresAt: NOW - 10,
    })

    const { calls, fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/auth/v1/token?grant_type=refresh_token')) {
        expect(call.body).toEqual({ refresh_token: 'refresh-1' })
        return json({
          access_token: 'fresh-access',
          refresh_token: 'refresh-2',
          expires_in: 3600,
          user: { id: 'acc-1', email: 'alex@example.com' },
        })
      }
      if (call.url.includes('/rest/v1/account_states')) {
        expect(call.authorization).toBe('Bearer fresh-access')
        return json([])
      }
      if (call.url.includes('/rest/v1/account_sessions')) {
        return json([])
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const client = createClient(storage, fetchImpl)

    const result = await client.sync.pull('acc-1')

    expect(result.status).toBe('success')
    expect(calls.some((c) => c.url.includes('grant_type=refresh_token'))).toBe(
      true,
    )
    expect(readSession(storage)).toMatchObject({
      access_token: 'fresh-access',
      refresh_token: 'refresh-2',
      expires_at: NOW + 3600,
    })
    expect(client.auth.getSession()).toEqual({
      accountId: 'acc-1',
      email: 'alex@example.com',
    })
  })

  it('does not refresh a token that is still valid', async () => {
    const storage = createMemoryStorage()
    seedSession(storage, {
      accessToken: 'valid-access',
      refreshToken: 'refresh-1',
      expiresAt: NOW + 3600,
    })

    const { calls, fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/rest/v1/account_states')) {
        expect(call.authorization).toBe('Bearer valid-access')
        return json([])
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const client = createClient(storage, fetchImpl)
    await client.sync.pull('acc-1')

    expect(calls.some((c) => c.url.includes('grant_type=refresh_token'))).toBe(
      false,
    )
  })

  it('refreshes a token that is near expiry before it actually expires', async () => {
    const storage = createMemoryStorage()
    seedSession(storage, {
      accessToken: 'almost-expired',
      refreshToken: 'refresh-1',
      expiresAt: NOW + 30,
    })

    const { calls, fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/rest/v1/account_sessions')) {
        return json([])
      }
      if (call.url.includes('/auth/v1/token?grant_type=refresh_token')) {
        return json({
          access_token: 'fresh-access',
          refresh_token: 'refresh-2',
          expires_in: 3600,
          user: { id: 'acc-1', email: 'alex@example.com' },
        })
      }
      if (call.url.includes('/rest/v1/account_states')) {
        expect(call.authorization).toBe('Bearer fresh-access')
        return json([])
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const client = createClient(storage, fetchImpl)
    await client.sync.pull('acc-1')

    expect(calls.some((c) => c.url.includes('grant_type=refresh_token'))).toBe(
      true,
    )
  })

  it('adopts a newer coordinated session instead of rotating a shared refresh token', async () => {
    const storage = createMemoryStorage()
    seedSession(storage, {
      accessToken: 'device-b-old',
      refreshToken: 'shared-refresh-old',
      expiresAt: NOW + 30,
    })

    const { fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/rest/v1/account_sessions')) {
        expect(call.method).toBe('GET')
        expect(call.authorization).toBe('Bearer device-b-old')
        return json([
          {
            access_token: 'device-a-fresh',
            refresh_token: 'shared-refresh-new',
            expires_at: NOW + 3600,
          },
        ])
      }
      if (call.url.includes('/auth/v1/token?grant_type=refresh_token')) {
        throw new Error('Should not rotate a refresh token another device updated')
      }
      if (call.url.includes('/rest/v1/account_states')) {
        expect(call.authorization).toBe('Bearer device-a-fresh')
        return json([])
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const client = createClient(storage, fetchImpl)
    await client.sync.pull('acc-1')

    expect(readSession(storage)).toMatchObject({
      access_token: 'device-a-fresh',
      refresh_token: 'shared-refresh-new',
    })
  })

  it('keeps two linked devices signed in when one device refreshes the session', async () => {
    const deviceAStorage = createMemoryStorage()
    const deviceBStorage = createMemoryStorage()
    const sharedSession = {
      accessToken: 'shared-old',
      refreshToken: 'shared-refresh',
      expiresAt: NOW + 30,
    }
    seedSession(deviceAStorage, sharedSession)
    seedSession(deviceBStorage, sharedSession)

    let coordinatedRow: Record<string, unknown> | null = null

    const { fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/rest/v1/account_sessions')) {
        if (call.method === 'GET') {
          return json(coordinatedRow === null ? [] : [coordinatedRow])
        }
        const body = call.body as {
          access_token: string
          refresh_token: string
          expires_at: number
        }
        coordinatedRow = {
          access_token: body.access_token,
          refresh_token: body.refresh_token,
          expires_at: body.expires_at,
        }
        return json(body)
      }
      if (call.url.includes('/auth/v1/token?grant_type=refresh_token')) {
        expect(call.body).toEqual({ refresh_token: 'shared-refresh' })
        return json({
          access_token: 'rotated-access',
          refresh_token: 'rotated-refresh',
          expires_in: 3600,
          user: { id: 'acc-1', email: 'alex@example.com' },
        })
      }
      if (call.url.includes('/rest/v1/account_states')) {
        return json([])
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const deviceA = createClient(deviceAStorage, fetchImpl)
    await deviceA.sync.pull('acc-1')

    expect(coordinatedRow).toMatchObject({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
    })

    const deviceB = createClient(deviceBStorage, fetchImpl)
    await deviceB.sync.pull('acc-1')

    expect(deviceA.auth.getSession()).not.toBeNull()
    expect(deviceB.auth.getSession()).not.toBeNull()
    expect(readSession(deviceBStorage)).toMatchObject({
      access_token: 'rotated-access',
      refresh_token: 'rotated-refresh',
    })
  })

  it('recovers from a concurrent rotation by re-reading coordinated credentials', async () => {
    const storage = createMemoryStorage()
    seedSession(storage, {
      accessToken: 'device-b-old',
      refreshToken: 'shared-refresh-old',
      expiresAt: NOW + 30,
    })

    let coordinationReads = 0

    const { fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/rest/v1/account_sessions')) {
        coordinationReads += 1
        if (coordinationReads === 1) {
          // Device A has not published its rotation yet.
          return json([])
        }
        return json([
          {
            access_token: 'device-a-fresh',
            refresh_token: 'shared-refresh-new',
            expires_at: NOW + 3600,
          },
        ])
      }
      if (call.url.includes('/auth/v1/token?grant_type=refresh_token')) {
        // Device A rotated first, so device B's refresh token is now invalid.
        return json({ error: 'invalid_grant' }, 400)
      }
      if (call.url.includes('/rest/v1/account_states')) {
        expect(call.authorization).toBe('Bearer device-a-fresh')
        return json([])
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const client = createClient(storage, fetchImpl)
    const result = await client.sync.pull('acc-1')

    expect(result.status).toBe('success')
    expect(coordinationReads).toBe(2)
    expect(readSession(storage)).toMatchObject({
      access_token: 'device-a-fresh',
      refresh_token: 'shared-refresh-new',
    })
  })

  it('adopts coordinated credentials after a 401 instead of rotating again', async () => {
    const storage = createMemoryStorage()
    seedSession(storage, {
      accessToken: 'stale-access',
      refreshToken: 'refresh-1',
      expiresAt: NOW + 3600,
    })

    let accountStateRequests = 0

    const { calls, fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/rest/v1/account_sessions')) {
        return json([
          {
            access_token: 'coordinated-access',
            refresh_token: 'coordinated-refresh',
            expires_at: NOW + 3600,
          },
        ])
      }
      if (call.url.includes('/rest/v1/account_states')) {
        accountStateRequests += 1
        if (accountStateRequests === 1) {
          return json({ message: 'JWT expired' }, 401)
        }
        expect(call.authorization).toBe('Bearer coordinated-access')
        return json([])
      }
      if (call.url.includes('/auth/v1/token?grant_type=refresh_token')) {
        throw new Error('Should adopt coordinated credentials instead of rotating')
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const client = createClient(storage, fetchImpl)
    const result = await client.sync.pull('acc-1')

    expect(result.status).toBe('success')
    expect(accountStateRequests).toBe(2)
    expect(
      calls.some((call) => call.url.includes('grant_type=refresh_token')),
    ).toBe(false)
  })

  it('refreshes and retries once when a sync request is rejected with 401', async () => {
    const storage = createMemoryStorage()
    seedSession(storage, {
      accessToken: 'stale-access',
      refreshToken: 'refresh-1',
      expiresAt: NOW + 3600,
    })

    let accountStateRequests = 0

    const { calls, fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/rest/v1/account_states')) {
        accountStateRequests += 1
        if (accountStateRequests === 1) {
          return json({ message: 'JWT expired' }, 401)
        }
        expect(call.authorization).toBe('Bearer refreshed-access')
        return json([])
      }
      if (call.url.includes('/auth/v1/token?grant_type=refresh_token')) {
        return json({
          access_token: 'refreshed-access',
          refresh_token: 'refresh-2',
          expires_in: 3600,
          user: { id: 'acc-1', email: 'alex@example.com' },
        })
      }
      if (call.url.includes('/rest/v1/account_sessions')) {
        return json([])
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const client = createClient(storage, fetchImpl)
    const result = await client.sync.pull('acc-1')

    expect(result.status).toBe('success')
    expect(accountStateRequests).toBe(2)
    expect(calls.some((c) => c.url.includes('grant_type=refresh_token'))).toBe(
      true,
    )
  })
})

describe('device-local sign-out', () => {
  it('clears only this device session and never calls global logout', async () => {
    const deviceAStorage = createMemoryStorage()
    const deviceBStorage = createMemoryStorage()
    seedSession(deviceAStorage, {
      accessToken: 'a-access',
      refreshToken: 'a-refresh',
      expiresAt: NOW + 3600,
    })
    seedSession(deviceBStorage, {
      accessToken: 'b-access',
      refreshToken: 'b-refresh',
      expiresAt: NOW + 3600,
    })

    const { calls, fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/rest/v1/account_states')) {
        return json([])
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const deviceA = createClient(deviceAStorage, fetchImpl)
    const deviceB = createClient(deviceBStorage, fetchImpl)

    await deviceA.auth.signOut()

    expect(deviceA.auth.getSession()).toBeNull()
    expect(readSession(deviceAStorage)).toBeNull()
    expect(
      calls.some((call) => call.url.includes('/auth/v1/logout')),
    ).toBe(false)

    // The other linked device is untouched and can still sync.
    expect(deviceB.auth.getSession()).not.toBeNull()
    const result = await deviceB.sync.pull('acc-1')
    expect(result.status).toBe('success')
  })

  it('does not make sync requests after signing out', async () => {
    const storage = createMemoryStorage()
    seedSession(storage, {
      accessToken: 'a-access',
      refreshToken: 'a-refresh',
      expiresAt: NOW + 3600,
    })

    const { calls, fetchImpl } = createFetchRecorder((call) => {
      if (call.url.includes('/rest/v1/account_states')) {
        return json([])
      }
      throw new Error(`Unexpected request: ${call.url}`)
    })

    const client = createClient(storage, fetchImpl)
    await client.auth.signOut()

    const result = await client.sync.pull('acc-1')

    expect(result.status).toBe('offline')
    expect(calls).toHaveLength(0)
  })
})

describe('Device handoff magic link redirect URL', () => {
  it('uses publicAppUrl for sendHandoffMagicLink when configured and window.location.origin for signInWithMagicLink', async () => {
    const storage = createMemoryStorage()
    const { calls, fetchImpl } = createFetchRecorder(() => json({}))

    const client = createSupabaseClient({
      supabaseUrl: 'https://project.supabase.co',
      anonKey: 'anon-key',
      publicAppUrl: 'https://daylabels.app/',
      storage,
      fetchImpl,
      nowSeconds: () => NOW,
    })

    await client.auth.signInWithMagicLink('alex@example.com')
    await client.auth.sendHandoffMagicLink('alex@example.com')

    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({
      url: 'https://project.supabase.co/auth/v1/magiclink',
      method: 'POST',
      body: {
        email: 'alex@example.com',
        options: {
          emailRedirectTo: window.location.origin,
        },
      },
    })
    expect(calls[1]).toMatchObject({
      url: 'https://project.supabase.co/auth/v1/magiclink',
      method: 'POST',
      body: {
        email: 'alex@example.com',
        options: {
          emailRedirectTo: 'https://daylabels.app',
        },
      },
    })
  })

  it('falls back to window.location.origin for sendHandoffMagicLink when publicAppUrl is not configured', async () => {
    const storage = createMemoryStorage()
    const { calls, fetchImpl } = createFetchRecorder(() => json({}))

    const client = createClient(storage, fetchImpl)
    await client.auth.sendHandoffMagicLink('alex@example.com')

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      url: 'https://project.supabase.co/auth/v1/magiclink',
      method: 'POST',
      body: {
        email: 'alex@example.com',
        options: {
          emailRedirectTo: window.location.origin,
        },
      },
    })
  })
})
