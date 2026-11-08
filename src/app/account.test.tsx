import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { STATE_STORAGE_KEY } from '@/data/persistence'
import { createFakeAuthAdapter } from '@/testing/auth'
import { createFakeSyncAdapter } from '@/testing/sync'
import {
  createCapturingExportSink,
  createFakeClock,
  createFakeStorage,
  createTestRuntime,
} from '@/testing/runtime'
import {
  createSupabaseClient,
  SUPABASE_AUTH_STORAGE_KEY,
  type SessionStorage,
} from '@/data/supabase'

const at = (iso: string) => new Date(iso).getTime()

function createSessionStorage(
  initial: Record<string, string> = {},
): SessionStorage {
  const values = new Map(Object.entries(initial))
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

function setup({
  now = at('2026-03-08T05:30:00.000Z'),
  storage = createFakeStorage(),
  auth = createFakeAuthAdapter(),
  sync = createFakeSyncAdapter(),
} = {}) {
  const runtime = createTestRuntime(now, storage, auth, sync)
  const user = userEvent.setup()

  render(<App runtime={runtime} />)

  return { runtime, user, storage, auth, sync }
}

describe('Account sign-in, sign-out, and local-only fallback', () => {
  it('signed-out use is fully local and makes no auth network calls', async () => {
    const { runtime, user } = setup()

    // Create a label and click it
    await user.click(screen.getByRole('button', { name: 'New label' }))
    const form = screen.getByRole('form', { name: 'Create label' })
    await user.type(within(form).getByRole('textbox', { name: 'New label name' }), 'Focus')
    await user.click(within(form).getByRole('button', { name: 'Create label' }))
    await user.click(screen.getByRole('button', { name: 'Focus' }))

    // Advance clock
    act(() => runtime.clock.advance(5000))

    // Zero auth calls made
    expect(runtime.auth.calls).toHaveLength(0)
    expect(runtime.auth.getSession()).toBeNull()
  })

  it('Account screen offers magic-link sign-in', async () => {
    const { runtime, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Account' }))

    const dialog = screen.getByRole('dialog', { name: 'Account' })
    expect(dialog).toBeInTheDocument()

    const emailInput = within(dialog).getByRole('textbox', { name: 'Email' })
    await user.type(emailInput, 'alex@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Send magic link' }))

    expect(runtime.auth.calls).toContainEqual({
      method: 'signInWithMagicLink',
      email: 'alex@example.com',
    })
    expect(within(dialog).getByText(/Check your email/i)).toBeInTheDocument()
  })

  it('Account screen only offers Google sign-in when configured', async () => {
    // When Google is not configured:
    const unconfigured = setup({
      auth: createFakeAuthAdapter({ isGoogleConfigured: false }),
    })
    await unconfigured.user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.queryByRole('button', { name: /Google/i })).not.toBeInTheDocument()

    // When Google is configured:
    const configured = setup({
      auth: createFakeAuthAdapter({ isGoogleConfigured: true }),
    })
    const accountButtons = screen.getAllByRole('button', { name: 'Account' })
    await configured.user.click(accountButtons[accountButtons.length - 1])

    const googleBtn = screen.getByRole('button', { name: /Google/i })
    expect(googleBtn).toBeInTheDocument()
    await configured.user.click(googleBtn)

    expect(configured.auth.calls).toContainEqual({
      method: 'signInWithGoogle',
    })
  })

  it('session lives in Device state and updates when signed in', async () => {
    const storage = createFakeStorage()
    const auth = createFakeAuthAdapter()
    const { user } = setup({ storage, auth })

    await user.click(screen.getByRole('button', { name: 'Account' }))

    act(() => {
      auth.simulateSignIn({
        accountId: 'acc-999',
        email: 'alex@example.com',
      })
    })

    const stored = JSON.parse(storage.getItem(STATE_STORAGE_KEY) ?? '{}')
    expect(stored.device.session).toEqual({
      accountId: 'acc-999',
      email: 'alex@example.com',
    })

    const dialog = screen.getByRole('dialog', { name: 'Account' })
    expect(within(dialog).getByText(/alex@example.com/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })

  it('sign-out keeps the local Shared state copy and clears Device session', async () => {
    const storage = createFakeStorage()
    const initialSession = { accountId: 'acc-1', email: 'alex@example.com' }
    const auth = createFakeAuthAdapter({ initialSession })
    const { user } = setup({ storage, auth })

    // Create a local label while signed in
    await user.click(screen.getByRole('button', { name: 'New label' }))
    const form = screen.getByRole('form', { name: 'Create label' })
    await user.type(within(form).getByRole('textbox', { name: 'New label name' }), 'Deep Work')
    await user.click(within(form).getByRole('button', { name: 'Create label' }))

    // Open Account screen and sign out
    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }))

    expect(auth.calls).toContainEqual({ method: 'signOut' })

    // Device state session is cleared
    const stored = JSON.parse(storage.getItem(STATE_STORAGE_KEY) ?? '{}')
    expect(stored.device.session).toBeNull()

    // Local Shared state copy is preserved!
    expect(stored.shared.labels).toContainEqual(
      expect.objectContaining({ name: 'Deep Work' }),
    )
    expect(screen.getByRole('button', { name: 'Deep Work' })).toBeInTheDocument()
  })

  it('closes Account dialog with Close button or Escape key', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Account' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Account' })).not.toBeInTheDocument()
  })

  it('shows error message if magic link sign-in fails', async () => {
    const auth = createFakeAuthAdapter({
      magicLinkError: 'Rate limit exceeded. Try again later.',
    })
    const { user } = setup({ auth })

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })
    const emailInput = within(dialog).getByRole('textbox', { name: 'Email' })
    await user.type(emailInput, 'fail@example.com')
    await user.click(within(dialog).getByRole('button', { name: 'Send magic link' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Rate limit exceeded')
  })

  it('shows error message if Google sign-in fails', async () => {
    const auth = createFakeAuthAdapter({
      isGoogleConfigured: true,
      googleError: 'Google sign-in popup was closed.',
    })
    const { user } = setup({ auth })

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })
    await user.click(within(dialog).getByRole('button', { name: /Google/i }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Google sign-in popup was closed.')
  })

  it('ignores number-key shortcuts while Account dialog is open', async () => {
    const { user } = setup()

    // Initially Unaccounted is active
    expect(screen.getByRole('status', { name: 'Active label' })).toHaveTextContent('Unaccounted')

    // Open Account dialog
    await user.click(screen.getByRole('button', { name: 'Account' }))
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument()

    // Press '1'
    await user.keyboard('1')

    // Active label remains Unaccounted
    expect(screen.getByRole('status', { name: 'Active label' })).toHaveTextContent('Unaccounted')
  })

  it('shows error message if sign-out fails', async () => {
    const initialSession = { accountId: 'acc-1', email: 'alex@example.com' }
    const auth = createFakeAuthAdapter({
      initialSession,
      signOutError: 'Sign-out failed due to network error.',
    })
    const { user } = setup({ auth })

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('Sign-out failed due to network error.')
    expect(within(dialog).getByText(/alex@example.com/i)).toBeInTheDocument()
  })

  it('displays Device handoff section once initial sync has completed and sends a handoff magic link to the signed-in email', async () => {
    const initialSession = { accountId: 'acc-1', email: 'alex@example.com' }
    const auth = createFakeAuthAdapter({ initialSession })
    const { user } = setup({ auth })

    await act(async () => {})

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })

    expect(
      within(dialog).getByRole('heading', { name: /Device handoff/i }),
    ).toBeInTheDocument()

    const handoffBtn = within(dialog).getByRole('button', {
      name: /Send magic link/i,
    })
    expect(handoffBtn).toBeEnabled()

    await user.click(handoffBtn)

    expect(auth.calls).toContainEqual({
      method: 'sendHandoffMagicLink',
      email: 'alex@example.com',
    })
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      /Check your email on the other device/i,
    )
  })

  it('shows an inline SVG QR code for Device handoff once initial sync has completed', async () => {
    const initialSession = { accountId: 'acc-1', email: 'alex@example.com' }
    const auth = createFakeAuthAdapter({
      initialSession,
      handoffUrl: 'https://daylabels.app/?handoff=token-123',
    })
    const { user } = setup({ auth })

    await act(async () => {})

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })

    const qr = await within(dialog).findByRole('img', {
      name: /Device handoff QR code/i,
    })
    expect(qr.tagName.toLowerCase()).toBe('svg')
    expect(auth.calls).toContainEqual({ method: 'createHandoff' })
  })

  it('does not show a QR code until initial sync has completed', async () => {
    const initialSession = { accountId: 'acc-1', email: 'alex@example.com' }
    const auth = createFakeAuthAdapter({ initialSession })
    const sync = createFakeSyncAdapter({ initialOffline: true })
    const { user } = setup({ auth, sync })

    await act(async () => {})

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })

    expect(
      within(dialog).queryByRole('img', { name: /Device handoff QR code/i }),
    ).not.toBeInTheDocument()
    expect(auth.calls).not.toContainEqual({ method: 'createHandoff' })

    sync.setOffline(false)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(
      await within(dialog).findByRole('img', {
        name: /Device handoff QR code/i,
      }),
    ).toBeInTheDocument()
  })

  it('disables Device handoff while initial sync is still pending and enables it once synced', async () => {
    const initialSession = { accountId: 'acc-1', email: 'alex@example.com' }
    const auth = createFakeAuthAdapter({ initialSession })
    const sync = createFakeSyncAdapter({ initialOffline: true })
    const { user } = setup({ auth, sync })

    await act(async () => {})

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })

    const handoffBtn = within(dialog).getByRole('button', {
      name: /Completing initial sync/i,
    })
    expect(handoffBtn).toBeDisabled()

    // Once online and initial pull succeeds, handoff becomes enabled
    sync.setOffline(false)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    const readyBtn = within(dialog).getByRole('button', {
      name: /Send magic link/i,
    })
    expect(readyBtn).toBeEnabled()
  })

  it('shows error feedback in the Account dialog when handoff magic link fails', async () => {
    const initialSession = { accountId: 'acc-1', email: 'alex@example.com' }
    const auth = createFakeAuthAdapter({
      initialSession,
      handoffError: 'Unable to send handoff email.',
    })
    const { user } = setup({ auth })

    await act(async () => {})

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })

    await user.click(
      within(dialog).getByRole('button', { name: /Send magic link/i }),
    )

    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Unable to send handoff email.',
    )
  })

  it('shows error feedback in the Account dialog when QR handoff creation fails', async () => {
    const initialSession = { accountId: 'acc-1', email: 'alex@example.com' }
    const auth = createFakeAuthAdapter({
      initialSession,
      handoffCreateError: 'Could not create a Device handoff link.',
    })
    const { user } = setup({ auth })

    await act(async () => {})

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not create a Device handoff link.',
    )
  })

  it('opening the QR handoff URL on a fresh second device signs in, strips the URL param, persists Device state, and adopts Shared state without prompting', async () => {
    const nowSeconds = () => 1_800_000_000

    const device1SessionStorage = createSessionStorage({
      [SUPABASE_AUTH_STORAGE_KEY]: JSON.stringify({
        access_token: 'device1-access',
        refresh_token: 'shared-refresh-1',
        expires_at: 1_800_003_600,
        user: { id: 'acc-1', email: 'alex@example.com' },
      }),
    })

    let storedHandoff: Record<string, unknown> | null = null
    let coordinatedSession: Record<string, unknown> | null = null
    let remoteShared: unknown = {
      anchor: at('2026-03-08T00:00:00.000Z'),
      labels: [
        {
          id: 'label-unaccounted',
          name: 'Unaccounted',
          colourId: 'grey',
          archived: false,
          updatedAt: 100,
        },
        {
          id: 'label-1',
          name: 'Synced Focus',
          colourId: 'blue',
          archived: false,
          updatedAt: 200,
        },
      ],
      blocks: [],
      activeLabelId: 'label-unaccounted',
      heartbeat: 200,
    }

    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      const method = init?.method ?? 'GET'
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : undefined

      if (url.includes('/rest/v1/handoff_tokens') && method === 'POST') {
        storedHandoff = body
        return new Response('{}', { status: 201 })
      }
      if (url.endsWith('/rest/v1/rpc/consume_handoff_token')) {
        if (
          storedHandoff &&
          body?.handoff_token === storedHandoff.token
        ) {
          const consumed = storedHandoff
          storedHandoff = null
          return new Response(JSON.stringify([consumed]), { status: 200 })
        }
        return new Response('[]', { status: 200 })
      }
      if (url.includes('/rest/v1/account_states')) {
        if (method === 'GET') {
          return new Response(
            JSON.stringify([{ version: 1, shared: remoteShared }]),
            { status: 200 },
          )
        }
        remoteShared = body.shared
        return new Response(
          JSON.stringify([{ version: body.version, shared: remoteShared }]),
          { status: 200 },
        )
      }
      if (url.includes('/rest/v1/account_sessions')) {
        if (method === 'GET') {
          return new Response(
            JSON.stringify(coordinatedSession ? [coordinatedSession] : []),
            { status: 200 },
          )
        }
        coordinatedSession = body
        return new Response(JSON.stringify(body), { status: 200 })
      }
      if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
        return new Response(
          JSON.stringify({
            access_token: 'rotated-access-2',
            refresh_token: 'rotated-refresh-2',
            expires_in: 3600,
            user: { id: 'acc-1', email: 'alex@example.com' },
          }),
          { status: 200 },
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const device1Supabase = createSupabaseClient({
      supabaseUrl: 'https://project.supabase.co',
      anonKey: 'anon-key',
      publicAppUrl: 'https://daylabels.app',
      storage: device1SessionStorage,
      fetchImpl,
      nowSeconds,
    })

    const handoffResult = await device1Supabase.auth.createHandoff!()
    expect(handoffResult.url).toMatch(
      /^https:\/\/daylabels\.app\/\?handoff=[0-9a-f]+$/,
    )

    // Simulate opening the QR handoff URL on a fresh second device
    const handoffUrl = new URL(handoffResult.url!)
    window.history.replaceState(
      null,
      '',
      `${handoffUrl.pathname}${handoffUrl.search}`,
    )

    const device2AppStorage = createFakeStorage()
    const device2Supabase = createSupabaseClient({
      supabaseUrl: 'https://project.supabase.co',
      anonKey: 'anon-key',
      storage: createSessionStorage(),
      fetchImpl,
      nowSeconds,
    })

    const device2Runtime = {
      clock: createFakeClock(at('2026-03-08T05:30:00.000Z')),
      storage: device2AppStorage,
      exportSink: createCapturingExportSink(),
      auth: device2Supabase.auth,
      sync: device2Supabase.sync,
    }

    render(<App runtime={device2Runtime} />)
    await act(async () => {
      await device2Supabase.ready
    })

    // Handoff parameter stripped from URL bar
    expect(window.location.search).toBe('')

    // Session persisted in Device state
    const persisted = JSON.parse(
      device2AppStorage.getItem(STATE_STORAGE_KEY) ?? '{}',
    )
    expect(persisted.device.session).toEqual({
      accountId: 'acc-1',
      email: 'alex@example.com',
    })

    // Fresh second device adopts Shared state immediately with no First sign-in prompt
    expect(
      await screen.findByRole('button', { name: 'Synced Focus' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('dialog', { name: 'First sign-in' }),
    ).not.toBeInTheDocument()

    // Even when Device 1 signs out locally, Device 2 stays signed in
    await device1Supabase.auth.signOut()
    expect(device1Supabase.auth.getSession()).toBeNull()
    expect(device2Supabase.auth.getSession()).toEqual({
      accountId: 'acc-1',
      email: 'alex@example.com',
    })
  })

  it('opening the QR handoff URL on a second device with existing user-created Shared state displays the First sign-in prompt', async () => {
    window.history.replaceState(null, '', '/?handoff=valid-token')

    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.endsWith('/rest/v1/rpc/consume_handoff_token')) {
        return new Response(
          JSON.stringify([
            {
              access_token: 'handoff-access',
              refresh_token: 'handoff-refresh',
              expires_at: 1_800_003_600,
              user_id: 'acc-1',
              email: 'alex@example.com',
            },
          ]),
          { status: 200 },
        )
      }
      if (url.includes('/rest/v1/account_states')) {
        return new Response(
          JSON.stringify([
            {
              version: 1,
              shared: {
                anchor: at('2026-03-08T00:00:00.000Z'),
                labels: [
                  {
                    id: 'label-unaccounted',
                    name: 'Unaccounted',
                    colourId: 'grey',
                    archived: false,
                    updatedAt: 100,
                  },
                  {
                    id: 'label-remote',
                    name: 'Remote Project',
                    colourId: 'blue',
                    archived: false,
                    updatedAt: 200,
                  },
                ],
                blocks: [],
                activeLabelId: 'label-unaccounted',
                heartbeat: 200,
              },
            },
          ]),
          { status: 200 },
        )
      }
      throw new Error(`Unexpected URL: ${url}`)
    }) as typeof fetch

    const appStorage = createFakeStorage()
    appStorage.setItem(
      STATE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        shared: {
          anchor: at('2026-03-08T00:00:00.000Z'),
          labels: [
            {
              id: 'label-unaccounted',
              name: 'Unaccounted',
              colourId: 'grey',
              archived: false,
              updatedAt: 100,
            },
            {
              id: 'label-local',
              name: 'Local Existing',
              colourId: 'green',
              archived: false,
              updatedAt: 150,
            },
          ],
          blocks: [],
          activeLabelId: 'label-unaccounted',
          heartbeat: null,
        },
        device: {
          theme: 'dark',
          session: null,
          syncedAccountId: null,
        },
      }),
    )

    const supabase = createSupabaseClient({
      supabaseUrl: 'https://project.supabase.co',
      anonKey: 'anon-key',
      storage: createSessionStorage(),
      fetchImpl,
      nowSeconds: () => 1_800_000_000,
    })

    const runtime = {
      clock: createFakeClock(at('2026-03-08T05:30:00.000Z')),
      storage: appStorage,
      exportSink: createCapturingExportSink(),
      auth: supabase.auth,
      sync: supabase.sync,
    }

    render(<App runtime={runtime} />)
    await act(async () => {
      await supabase.ready
    })

    expect(window.location.search).toBe('')
    expect(
      await screen.findByRole('dialog', { name: 'First sign-in' }),
    ).toBeInTheDocument()
  })

  it('pushes existing local Shared state to an empty Account on initial sync before enabling Device handoff', async () => {
    const storage = createFakeStorage()
    const sync = createFakeSyncAdapter()
    const auth = createFakeAuthAdapter({ initialSession: null })
    const { user } = setup({ storage, auth, sync })

    // Create local user data while signed out
    await user.click(screen.getByRole('button', { name: 'New label' }))
    const form = screen.getByRole('form', { name: 'Create label' })
    await user.type(
      within(form).getByRole('textbox', { name: 'New label name' }),
      'Pre-existing Local',
    )
    await user.click(within(form).getByRole('button', { name: 'Create label' }))

    // Sign in to a brand-new empty Account
    await act(async () => {
      auth.simulateSignIn({ accountId: 'acc-fresh', email: 'alex@example.com' })
    })

    // Remote Account now holds the local Shared state without waiting for debounce
    expect(
      sync.getRemoteDocument('acc-fresh')?.shared.labels.map((l) => l.name),
    ).toContain('Pre-existing Local')

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const dialog = screen.getByRole('dialog', { name: 'Account' })
    expect(
      within(dialog).getByRole('button', { name: /Send magic link/i }),
    ).toBeEnabled()
  })
})
