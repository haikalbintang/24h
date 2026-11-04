import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { STATE_STORAGE_KEY } from './persistence'
import { createFakeAuthAdapter } from './test/auth'
import { createFakeStorage, createTestRuntime } from './test/runtime'

const at = (iso: string) => new Date(iso).getTime()

function setup({
  now = at('2026-03-08T05:30:00.000Z'),
  storage = createFakeStorage(),
  auth = createFakeAuthAdapter(),
} = {}) {
  const runtime = createTestRuntime(now, storage, auth)
  const user = userEvent.setup()

  render(<App runtime={runtime} />)

  return { runtime, user, storage, auth }
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
})
