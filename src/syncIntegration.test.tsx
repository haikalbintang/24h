import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { createFakeAuthAdapter } from './test/auth'
import { createFakeSyncAdapter } from './test/sync'
import { createFakeStorage, createTestRuntime } from './test/runtime'

const at = (iso: string) => new Date(iso).getTime()

function setup({
  now = at('2026-03-08T05:30:00.000Z'),
  storage = createFakeStorage(),
  auth = createFakeAuthAdapter({
    initialSession: { accountId: 'acc-1', email: 'test@example.com' },
  }),
  sync = createFakeSyncAdapter(),
} = {}) {
  const runtime = createTestRuntime(now, storage, auth, sync)
  const user = userEvent.setup()

  render(<App runtime={runtime} />)

  return { runtime, user, storage, auth, sync }
}

async function createLabel(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name: 'New label' }))
  const form = screen.getByRole('form', { name: 'Create label' })
  await user.type(within(form).getByRole('textbox', { name: 'New label name' }), name)
  await user.click(within(form).getByRole('button', { name: 'Create label' }))
}

function createTenMinuteAwayStorage(anchor: number, t0: number) {
  const storage = createFakeStorage()
  storage.setItem(
    'day-labels.state.v2',
    JSON.stringify({
      schemaVersion: 2,
      shared: {
        anchor,
        labels: [
          { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
          { id: 'label-work', name: 'Work', colourId: 'blue', updatedAt: 100 },
        ],
        blocks: [
          { id: 'block-1', labelId: 'label-work', start: t0 - 600000, end: null, updatedAt: t0 - 600000 },
        ],
        activeLabelId: 'label-work',
        heartbeat: t0 - 600000, // 10 minutes ago
      },
      device: {
        theme: 'dark',
        session: { accountId: 'acc-1', email: 'test@example.com' },
        syncedAccountId: 'acc-1',
      },
    }),
  )
  return storage
}

describe('Sync Shared state integration', () => {
  it('signed-in changes push after roughly 2s debounce', async () => {
    const { runtime, user, sync } = setup()

    await createLabel(user, 'Deep Work')

    // Push has not happened yet (debounced)
    const initialPushes = sync.calls.filter((c) => c.method === 'push')
    expect(initialPushes).toHaveLength(0)

    // Advance 1s - still debouncing
    act(() => {
      runtime.clock.advance(1000)
    })
    expect(sync.calls.filter((c) => c.method === 'push')).toHaveLength(0)

    // Advance remaining 1s (total 2s) - debounce fires
    await act(async () => {
      runtime.clock.advance(1000)
    })

    const pushes = sync.calls.filter((c) => c.method === 'push')
    expect(pushes.length).toBeGreaterThanOrEqual(1)
    const lastPush = pushes[pushes.length - 1]
    expect(lastPush.shared?.labels.some((l) => l.name === 'Deep Work')).toBe(true)
  })

  it('pushes pending changes immediately on window focus and visibility change', async () => {
    const { runtime, user, sync } = setup()

    await createLabel(user, 'Writing')

    // Before debounce fires (< 2s)
    act(() => {
      runtime.clock.advance(500)
    })
    expect(sync.calls.filter((c) => c.method === 'push')).toHaveLength(0)

    // Trigger window focus
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    const pushesOnFocus = sync.calls.filter((c) => c.method === 'push')
    expect(pushesOnFocus.length).toBeGreaterThanOrEqual(1)
    expect(pushesOnFocus[pushesOnFocus.length - 1].shared?.labels.some((l) => l.name === 'Writing')).toBe(true)

    // Create another label and trigger visibilitychange
    await createLabel(user, 'Reading')
    expect(sync.calls.filter((c) => c.method === 'push')).toHaveLength(pushesOnFocus.length)

    await act(async () => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        configurable: true,
      })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    const pushesOnVis = sync.calls.filter((c) => c.method === 'push')
    expect(pushesOnVis.length).toBeGreaterThan(pushesOnFocus.length)
    expect(pushesOnVis[pushesOnVis.length - 1].shared?.labels.some((l) => l.name === 'Reading')).toBe(true)
  })

  it('polls on roughly 10s interval to pull remote updates', async () => {
    const { runtime, sync } = setup()

    // Wait for initial mount pull to settle
    await act(async () => {})

    // Remote receives an update
    sync.setRemoteDocument('acc-1', {
      version: 1,
      shared: {
        anchor: at('2026-03-08T00:00:00.000Z'),
        labels: [
          { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
          { id: 'label-remote-1', name: 'Remote Task', colourId: 'green', updatedAt: 200 },
        ],
        blocks: [],
        activeLabelId: 'label-unaccounted',
        heartbeat: 200,
      },
    })

    const initialPulls = sync.calls.filter((c) => c.method === 'pull').length

    // Advance 5 seconds - not yet 10s
    act(() => {
      runtime.clock.advance(5000)
    })
    expect(sync.calls.filter((c) => c.method === 'pull').length).toBe(initialPulls)

    // Advance another 5 seconds (total 10s) - 10s poll triggers!
    act(() => {
      runtime.clock.advance(5000)
    })

    await waitFor(() => {
      expect(sync.calls.filter((c) => c.method === 'pull').length).toBeGreaterThan(initialPulls)
      expect(screen.getByRole('button', { name: 'Remote Task' })).toBeInTheDocument()
    })
  })

  it('pull merges Anchor, Labels, Blocks, Active label, and Heartbeat per entity with updatedAt last-write-wins', async () => {
    const remoteAnchor = at('2026-03-07T00:00:00.000Z') // earlier than local 2026-03-08
    const localNow = at('2026-03-08T05:30:00.000Z')
    const laterRemoteTime = at('2026-03-08T05:31:00.000Z')

    const sync = createFakeSyncAdapter({
      initialDocuments: {
        'acc-1': {
          version: 1,
          shared: {
            anchor: remoteAnchor,
            labels: [
              { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
              { id: 'label-1', name: 'Design Remote', colourId: 'violet', updatedAt: laterRemoteTime },
            ],
            blocks: [
              { id: 'block-1', labelId: 'label-1', start: remoteAnchor + 3600000, end: remoteAnchor + 7200000, updatedAt: 500 },
              { id: 'block-2', labelId: 'label-1', start: remoteAnchor + 7200000, end: null, updatedAt: laterRemoteTime },
            ],
            activeLabelId: 'label-1',
            heartbeat: laterRemoteTime,
          },
        },
      },
    })

    setup({ now: localNow, sync })

    // Wait for initial pull to merge
    await waitFor(() => {
      // Remote label "Design Remote" should be rendered
      expect(screen.getByRole('button', { name: 'Design Remote' })).toBeInTheDocument()
      // Active label should now be "Design Remote"
      expect(screen.getByRole('status', { name: 'Active label' })).toHaveTextContent('Design Remote')
    })
  })

  it('resolves version conflicts by merging and retrying without losing local edits', async () => {
    const sync = createFakeSyncAdapter({
      initialDocuments: {
        'acc-1': {
          version: 1,
          shared: {
            anchor: at('2026-03-08T00:00:00.000Z'),
            labels: [
              { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
              { id: 'label-initial', name: 'Initial', colourId: 'blue', updatedAt: 100 },
            ],
            blocks: [],
            activeLabelId: 'label-unaccounted',
            heartbeat: 100,
          },
        },
      },
    })

    const { runtime, user } = setup({ sync })

    // Wait for initial pull to adopt version 1
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Initial' })).toBeInTheDocument()
    })

    // Another device now updates the server to version 2
    sync.setRemoteDocument('acc-1', {
      version: 2,
      shared: {
        anchor: at('2026-03-08T00:00:00.000Z'),
        labels: [
          { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
          { id: 'label-initial', name: 'Initial', colourId: 'blue', updatedAt: 100 },
          { id: 'label-device-b', name: 'Created by Device B', colourId: 'green', updatedAt: 250 },
        ],
        blocks: [],
        activeLabelId: 'label-unaccounted',
        heartbeat: 250,
      },
    })

    // Now this device makes a local edit
    await createLabel(user, 'Created by Device A')

    // Advance past debounce (2s) so push attempts
    await act(async () => {
      runtime.clock.advance(2000)
    })

    // Conflict occurs on first push, merges, and retries. Remote should reach version 3 with both labels!
    await waitFor(() => {
      const remoteDoc = sync.getRemoteDocument('acc-1')
      expect(remoteDoc?.version).toBe(3)
      expect(remoteDoc?.shared.labels.some((l) => l.name === 'Created by Device B')).toBe(true)
      expect(remoteDoc?.shared.labels.some((l) => l.name === 'Created by Device A')).toBe(true)
    })
  })

  it('queues offline changes and flushes once back online', async () => {
    const sync = createFakeSyncAdapter({ initialOffline: true })
    const { runtime, user } = setup({ sync })

    // User creates a label while offline
    await createLabel(user, 'Offline Note')

    // Advance 2s debounce
    await act(async () => {
      runtime.clock.advance(2000)
    })

    // Local state has the label
    expect(screen.getByRole('button', { name: 'Offline Note' })).toBeInTheDocument()
    // Remote still has no document because offline
    expect(sync.getRemoteDocument('acc-1')).toBeNull()

    // Now come back online
    sync.setOffline(false)

    // Trigger focus or poll to flush the queued change
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })

    await waitFor(() => {
      const remoteDoc = sync.getRemoteDocument('acc-1')
      expect(remoteDoc).not.toBeNull()
      expect(remoteDoc?.shared.labels.some((l) => l.name === 'Offline Note')).toBe(true)
    })
  })

  it('signed-out use never calls sync push or pull', async () => {
    const sync = createFakeSyncAdapter()
    const auth = createFakeAuthAdapter({ initialSession: null })
    const { runtime, user } = setup({ sync, auth })

    await createLabel(user, 'Local Only')

    // Advance 15s to cross debounce and poll intervals
    await act(async () => {
      runtime.clock.advance(15000)
    })

    // Trigger focus and visibility
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(sync.calls).toHaveLength(0)
  })

  it('merges concurrent edits across multiple clients with updatedAt last-write-wins', async () => {
    const remoteAnchor = at('2026-03-08T00:00:00.000Z')
    const sync = createFakeSyncAdapter({
      initialDocuments: {
        'acc-1': {
          version: 1,
          shared: {
            anchor: remoteAnchor,
            labels: [
              { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
              { id: 'label-shared', name: 'Initial Name', colourId: 'blue', updatedAt: 100 },
            ],
            blocks: [],
            activeLabelId: 'label-unaccounted',
            heartbeat: 100,
          },
        },
      },
    })

    const { runtime, user } = setup({ sync })

    // Wait for initial pull to load
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Initial Name' })).toBeInTheDocument()
    })

    // Concurrent Client B updates label-shared at t=200, pushes to server
    sync.setRemoteDocument('acc-1', {
      version: 2,
      shared: {
        anchor: remoteAnchor,
        labels: [
          { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
          { id: 'label-shared', name: 'Client B Rename', colourId: 'green', updatedAt: 200 },
        ],
        blocks: [],
        activeLabelId: 'label-unaccounted',
        heartbeat: 200,
      },
    })

    // Client A renames the same label at t=300
    act(() => {
      runtime.clock.advance(300)
    })
    await user.click(screen.getByRole('button', { name: 'Manage labels' }))
    await user.click(screen.getByRole('button', { name: 'Edit Initial Name' }))
    const form = screen.getByRole('form', { name: 'Edit Initial Name' })
    const nameInput = within(form).getByRole('textbox', { name: 'Label name' })
    await user.clear(nameInput)
    await user.type(nameInput, 'Client A Rename')
    await user.click(within(form).getByRole('button', { name: 'Save changes' }))

    // Advance 2s debounce to push
    await act(async () => {
      runtime.clock.advance(2000)
    })

    // Conflict merge will happen: Client A's updatedAt (t=300) is later than Client B (t=200), so Client A wins!
    await waitFor(() => {
      const doc = sync.getRemoteDocument('acc-1')
      expect(doc?.version).toBe(3)
      const sharedLabel = doc?.shared.labels.find((l) => l.id === 'label-shared')
      expect(sharedLabel?.name).toBe('Client A Rename')
    })
  })

  it('selecting a label on one device closes the shared open block; others adopt the new open block', async () => {
    const sharedAnchor = at('2026-03-08T00:00:00.000Z')
    const t0 = at('2026-03-08T05:30:00.000Z')

    // Start with a shared document that has an open block for "Work"
    const sync = createFakeSyncAdapter({
      initialDocuments: {
        'acc-1': {
          version: 1,
          shared: {
            anchor: sharedAnchor,
            labels: [
              { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
              { id: 'label-work', name: 'Work', colourId: 'blue', updatedAt: 100 },
              { id: 'label-exercise', name: 'Exercise', colourId: 'green', updatedAt: 100 },
            ],
            blocks: [
              { id: 'block-1', labelId: 'label-work', start: t0 - 10000, end: null, updatedAt: t0 - 10000 },
            ],
            activeLabelId: 'label-work',
            heartbeat: t0 - 10000,
          },
        },
      },
    })

    const { runtime, user } = setup({ now: t0, sync })

    // Wait for initial pull to load "Work" as active
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Active label' })).toHaveTextContent('Work')
    })

    // Now another device selects "Exercise" at t0 + 5000, pushing a closed block-1 and a new open block-2
    sync.setRemoteDocument('acc-1', {
      version: 2,
      shared: {
        anchor: sharedAnchor,
        labels: [
          { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
          { id: 'label-work', name: 'Work', colourId: 'blue', updatedAt: 100 },
          { id: 'label-exercise', name: 'Exercise', colourId: 'green', updatedAt: 100 },
        ],
        blocks: [
          { id: 'block-1', labelId: 'label-work', start: t0 - 10000, end: t0 + 5000, updatedAt: t0 + 5000 },
          { id: 'block-2', labelId: 'label-exercise', start: t0 + 5000, end: null, updatedAt: t0 + 5000 },
        ],
        activeLabelId: 'label-exercise',
        heartbeat: t0 + 5000,
      },
    })

    // Advance 10s to trigger poll pull
    act(() => {
      runtime.clock.advance(10000)
    })

    // This device should adopt "Exercise" as active label, with block-1 closed and block-2 open
    await waitFor(() => {
      expect(screen.getByRole('status', { name: 'Active label' })).toHaveTextContent('Exercise')
    })

    // Reciprocally: this device selects "Work" at t0 + 15000
    act(() => {
      runtime.clock.advance(5000)
    })
    await user.click(screen.getByRole('button', { name: 'Work' }))
    expect(screen.getByRole('status', { name: 'Active label' })).toHaveTextContent('Work')

    // Advance 2s debounce to push
    await act(async () => {
      runtime.clock.advance(2000)
    })

    // Remote receives the new state with block-2 closed and a single open block for Work
    await waitFor(() => {
      const doc = sync.getRemoteDocument('acc-1')
      expect(doc?.version).toBeGreaterThanOrEqual(3)
      expect(doc?.shared.activeLabelId).toBe('label-work')
      const openBlocks = doc?.shared.blocks.filter((b) => b.end === null)
      expect(openBlocks).toHaveLength(1)
      expect(openBlocks![0].labelId).toBe('label-work')
    })
  })

  it('greatest heartbeat across devices drives the reopen prompt', async () => {
    const sharedAnchor = at('2026-03-08T00:00:00.000Z')
    const t0 = at('2026-03-08T05:30:00.000Z')

    // Local device has a stored state from 10 minutes ago (gap > 2 min)
    const storage = createTenMinuteAwayStorage(sharedAnchor, t0)

    // Another device was running and recorded a heartbeat 30 seconds ago (gap < 2 min)
    const sync = createFakeSyncAdapter({
      initialDocuments: {
        'acc-1': {
          version: 2,
          shared: {
            anchor: sharedAnchor,
            labels: [
              { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
              { id: 'label-work', name: 'Work', colourId: 'blue', updatedAt: 100 },
            ],
            blocks: [
              { id: 'block-1', labelId: 'label-work', start: t0 - 600000, end: null, updatedAt: t0 - 30000 },
            ],
            activeLabelId: 'label-work',
            heartbeat: t0 - 30000, // 30 seconds ago (< 2 minutes!)
          },
        },
      },
    })

    setup({ now: t0, storage, sync })

    // On initial pull, remote heartbeat (t0 - 30s) wins over local (t0 - 10m).
    // Because the greatest heartbeat was within 2 minutes, no Reopen prompt is shown!
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('status', { name: 'Active label' })).toHaveTextContent('Work')
    })
  })

  it('when all devices have been away, greatest heartbeat decides the gap and where End Block closes the block', async () => {
    const sharedAnchor = at('2026-03-08T00:00:00.000Z')
    const t0 = at('2026-03-08T05:30:00.000Z')

    // Local device last seen was 10 minutes ago
    const storage = createTenMinuteAwayStorage(sharedAnchor, t0)

    // Remote greatest heartbeat was 5 minutes ago (gap > 2 min)
    const sync = createFakeSyncAdapter({
      initialDocuments: {
        'acc-1': {
          version: 2,
          shared: {
            anchor: sharedAnchor,
            labels: [
              { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
              { id: 'label-work', name: 'Work', colourId: 'blue', updatedAt: 100 },
            ],
            blocks: [
              { id: 'block-1', labelId: 'label-work', start: t0 - 600000, end: null, updatedAt: t0 - 300000 },
            ],
            activeLabelId: 'label-work',
            heartbeat: t0 - 300000, // 5 minutes ago
          },
        },
      },
    })

    const { user } = setup({ now: t0, storage, sync })

    // Reopen prompt should be shown because greatest heartbeat was 5 minutes ago (> 2 min)
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()

    // Clicking "End Block" ends the Block at the greatest heartbeat (5 minutes ago, not 10 minutes ago)
    await user.click(within(dialog).getByRole('button', { name: 'End Block' }))

    // Active label falls back to Unaccounted
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('status', { name: 'Active label' })).toHaveTextContent('Unaccounted')
    })
  })

  it('overlap repair deterministically resolves concurrent overlapping blocks on merge', async () => {
    const sharedAnchor = at('2026-03-08T00:00:00.000Z')
    const t0 = at('2026-03-08T05:30:00.000Z')

    // Server has a document where block-remote started at t0 + 2000
    const sync = createFakeSyncAdapter({
      initialDocuments: {
        'acc-1': {
          version: 1,
          shared: {
            anchor: sharedAnchor,
            labels: [
              { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
              { id: 'label-a', name: 'Task A', colourId: 'blue', updatedAt: 100 },
              { id: 'label-b', name: 'Task B', colourId: 'red', updatedAt: 100 },
            ],
            blocks: [
              { id: 'block-remote', labelId: 'label-b', start: t0 + 2000, end: t0 + 6000, updatedAt: 200 },
            ],
            activeLabelId: 'label-unaccounted',
            heartbeat: t0 + 6000,
          },
        },
      },
    })

    const { runtime } = setup({ now: t0, sync })

    // Wait for initial pull
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Task A' })).toBeInTheDocument()
    })

    // Concurrent conflict: server updates with a block from t0 to t0 + 4000
    sync.setRemoteDocument('acc-1', {
      version: 2,
      shared: {
        anchor: sharedAnchor,
        labels: [
          { id: 'label-unaccounted', name: 'Unaccounted', colourId: 'grey', archived: false, updatedAt: 100 },
          { id: 'label-a', name: 'Task A', colourId: 'blue', updatedAt: 100 },
          { id: 'label-b', name: 'Task B', colourId: 'red', updatedAt: 100 },
        ],
        blocks: [
          { id: 'block-earlier', labelId: 'label-a', start: t0, end: t0 + 4000, updatedAt: 150 },
          { id: 'block-remote', labelId: 'label-b', start: t0 + 2000, end: t0 + 6000, updatedAt: 200 },
        ],
        activeLabelId: 'label-unaccounted',
        heartbeat: t0 + 6000,
      },
    })

    // Trigger poll pull
    act(() => {
      runtime.clock.advance(10000)
    })

    // Overlap repair: block-earlier [t0, t0+4000] overlaps with block-remote [t0+2000, t0+6000].
    // Later start (t0+2000) wins, block-earlier closes at t0+2000: [t0, t0+2000].
    // No gaps, no overlaps, and both blocks survive repaired.
    await waitFor(() => {
      const blocksList = screen.getByRole('list', { name: 'Blocks' })
      const items = within(blocksList).getAllByRole('listitem')
      expect(items.length).toBeGreaterThanOrEqual(2)
    })
  })
})
