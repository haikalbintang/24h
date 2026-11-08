import { describe, expect, it } from 'vitest'
import { createFakeAuthAdapter } from './auth'

describe('FakeAuthAdapter', () => {
  it('starts signed out with no calls', () => {
    const auth = createFakeAuthAdapter()

    expect(auth.getSession()).toBeNull()
    expect(auth.calls).toHaveLength(0)
  })

  it('records sign in with magic link and notifies subscribers', async () => {
    const auth = createFakeAuthAdapter()
    const sessions: Array<unknown> = []
    auth.subscribe((session) => sessions.push(session))

    const result = await auth.signInWithMagicLink('alex@example.com')

    expect(result.error).toBeUndefined()
    expect(auth.calls).toContainEqual({
      method: 'signInWithMagicLink',
      email: 'alex@example.com',
    })
  })

  it('signs out and notifies subscribers', async () => {
    const auth = createFakeAuthAdapter({
      initialSession: { accountId: 'acc-1', email: 'alex@example.com' },
    })
    const sessions: Array<unknown> = []
    auth.subscribe((session) => sessions.push(session))

    expect(auth.getSession()).toEqual({
      accountId: 'acc-1',
      email: 'alex@example.com',
    })

    await auth.signOut()

    expect(auth.getSession()).toBeNull()
    expect(sessions).toEqual([null])
    expect(auth.calls).toContainEqual({ method: 'signOut' })
  })

  it('supports Google sign in when configured', async () => {
    const auth = createFakeAuthAdapter({ isGoogleConfigured: true })

    expect(auth.isGoogleConfigured).toBe(true)
    const result = await auth.signInWithGoogle()

    expect(result.error).toBeUndefined()
    expect(auth.calls).toContainEqual({ method: 'signInWithGoogle' })
  })
})
