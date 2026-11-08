import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import type { RemoteDocument } from '@/data/sync'
import { createFakeAuthAdapter } from '@/testing/auth'
import { createFakeSyncAdapter } from '@/testing/sync'
import { createFakeStorage, createTestRuntime } from '@/testing/runtime'

const at = (iso: string) => new Date(iso).getTime()

const NOW = at('2026-03-08T12:30:00.000Z')
const REMOTE_ANCHOR = at('2026-03-04T00:00:00.000Z') // earlier than the local Anchor

function remoteDocument(name: string, id: string): RemoteDocument {
  return {
    version: 1,
    shared: {
      anchor: REMOTE_ANCHOR,
      labels: [
        { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
        { id, name, colourId: 'violet', archived: false, updatedAt: 200 },
      ],
      blocks: [
        { id: 'block-1', labelId: 'label-unaccounted', start: REMOTE_ANCHOR, end: REMOTE_ANCHOR + 3600000, updatedAt: 150 },
        { id: 'block-2', labelId: id, start: REMOTE_ANCHOR + 3600000, end: REMOTE_ANCHOR + 7200000, updatedAt: 200 },
        { id: 'block-3', labelId: 'label-unaccounted', start: REMOTE_ANCHOR + 7200000, end: null, updatedAt: 250 },
      ],
      activeLabelId: 'label-unaccounted',
      heartbeat: REMOTE_ANCHOR + 7200000,
    },
  }
}

async function setup() {
  const sync = createFakeSyncAdapter({
    initialDocuments: { 'acc-1': remoteDocument('Remote Work', 'label-remote') },
  })
  const auth = createFakeAuthAdapter({ initialSession: null })
  const runtime = createTestRuntime(NOW, createFakeStorage(), auth, sync)
  const user = userEvent.setup()

  render(<App runtime={runtime} />)

  // Local, signed-out user data.
  await user.click(screen.getByRole('button', { name: 'New label' }))
  const form = screen.getByRole('form', { name: 'Create label' })
  await user.type(within(form).getByRole('textbox', { name: 'New label name' }), 'Local Work')
  await user.click(within(form).getByRole('button', { name: 'Create label' }))

  return { runtime, user, auth, sync }
}

const signIn = async (
  auth: ReturnType<typeof createFakeAuthAdapter>,
  accountId = 'acc-1',
) => {
  await act(async () => {
    auth.simulateSignIn({ accountId, email: `${accountId}@example.com` })
  })
}

const firstSignInDialog = () => screen.findByRole('dialog', { name: 'First sign-in' })

describe('First sign-in into a non-empty Account', () => {
  it('prompts once with Merge selected by default and a Replace option', async () => {
    const { auth, sync } = await setup()

    await signIn(auth)

    const dialog = await firstSignInDialog()
    expect(within(dialog).getByRole('radio', { name: /Merge/ })).toBeChecked()
    expect(within(dialog).getByRole('radio', { name: /Replace/ })).not.toBeChecked()
    // Nothing is pushed while the choice is pending.
    expect(sync.calls.filter((c) => c.method === 'push')).toHaveLength(0)
  })

  it('Merge combines both sides, adopts the earliest Anchor and rebases Day indices', async () => {
    const { auth, user, sync } = await setup()
    const daySelect = screen.getByRole('combobox', { name: 'Day' })
    expect(within(daySelect).getAllByRole('option')).toHaveLength(1)

    await signIn(auth)
    const dialog = await firstSignInDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remote Work' })).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Local Work' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'First sign-in' })).not.toBeInTheDocument()
    // Anchor is now the remote (earlier) one: more Days in the chain.
    expect(
      within(screen.getByRole('combobox', { name: 'Day' })).getAllByRole('option').length,
    ).toBeGreaterThanOrEqual(5)

    await waitFor(() => {
      const doc = sync.getRemoteDocument('acc-1')
      expect(doc?.shared.anchor).toBe(REMOTE_ANCHOR)
      expect(doc?.shared.labels.map((l) => l.name)).toEqual(
        expect.arrayContaining(['Local Work', 'Remote Work']),
      )
    })
  })

  it('Replace discards local Shared state only after confirmation', async () => {
    const { auth, user, sync } = await setup()

    await signIn(auth)
    const dialog = await firstSignInDialog()
    await user.click(within(dialog).getByRole('radio', { name: /Replace/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))

    // Confirmation pending: local data is still intact and nothing synced.
    expect(
      screen.getByRole('button', { name: 'Local Work', hidden: true }),
    ).toBeInTheDocument()
    expect(sync.calls.filter((c) => c.method === 'push')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Confirm replace' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remote Work' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: 'Local Work' })).not.toBeInTheDocument()
    expect(sync.getRemoteDocument('acc-1')?.shared.labels.map((l) => l.name)).not.toContain(
      'Local Work',
    )
  })

  it('does not prompt again for the same Account but does for a different one', async () => {
    const { auth, user, sync } = await setup()
    sync.setRemoteDocument('acc-2', remoteDocument('Other Work', 'label-other'))

    await signIn(auth)
    const dialog = await firstSignInDialog()
    await user.click(within(dialog).getByRole('button', { name: 'Continue' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remote Work' })).toBeInTheDocument()
    })

    await act(async () => {
      await auth.signOut()
    })
    await signIn(auth, 'acc-1')
    await waitFor(() => {
      expect(sync.calls.filter((c) => c.method === 'pull').length).toBeGreaterThan(1)
    })
    expect(screen.queryByRole('dialog', { name: 'First sign-in' })).not.toBeInTheDocument()

    await act(async () => {
      await auth.signOut()
    })
    await signIn(auth, 'acc-2')
    expect(await firstSignInDialog()).toBeInTheDocument()
  })

  it('keeps Device handoff disabled while the First sign-in prompt is awaiting resolution', async () => {
    const { auth, user } = await setup()

    await user.click(screen.getByRole('button', { name: 'Account' }))
    const accountDialog = screen.getByRole('dialog', { name: 'Account' })

    await signIn(auth)
    const promptDialog = await firstSignInDialog()
    expect(promptDialog).toBeInTheDocument()

    const handoffBtn = within(accountDialog).getByRole('button', {
      name: /Completing initial sync/i,
    })
    expect(handoffBtn).toBeDisabled()

    await user.click(within(promptDialog).getByRole('button', { name: 'Continue' }))

    await waitFor(() => {
      expect(
        within(accountDialog).getByRole('button', { name: /Send magic link/i }),
      ).toBeEnabled()
    })
  })

  it('silently adopts the Account Shared state without showing First sign-in prompt when a second device has no user-created Shared state', async () => {
    const sync = createFakeSyncAdapter({
      initialDocuments: { 'acc-1': remoteDocument('Remote Work', 'label-remote') },
    })
    const auth = createFakeAuthAdapter({ initialSession: null })
    const runtime = createTestRuntime(NOW, createFakeStorage(), auth, sync)

    render(<App runtime={runtime} />)

    await signIn(auth, 'acc-1')

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remote Work' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog', { name: 'First sign-in' })).not.toBeInTheDocument()
  })
})
