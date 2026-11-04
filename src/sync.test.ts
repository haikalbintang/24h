import { describe, expect, it } from 'vitest'
import { UNACCOUNTED_LABEL_ID, createUnaccountedLabel } from './labels'
import type { SharedState } from './persistence'
import { hasUserData, mergeSharedState, resolveFirstSignIn, SyncCoordinator } from './sync'
import { createFakeSyncAdapter } from './test/sync'

describe('mergeSharedState', () => {
  it('merges labels by id with later updatedAt winning', () => {
    const local: SharedState = {
      anchor: 1000,
      labels: [
        createUnaccountedLabel(100),
        { id: 'label-1', name: 'Work Local', colourId: 'blue', updatedAt: 200 },
        { id: 'label-2', name: 'Exercise', colourId: 'green', updatedAt: 150 },
      ],
      blocks: [],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 200,
    }

    const remote: SharedState = {
      anchor: 1000,
      labels: [
        createUnaccountedLabel(100),
        { id: 'label-1', name: 'Work Remote', colourId: 'red', updatedAt: 300 },
        { id: 'label-3', name: 'Reading', colourId: 'amber', updatedAt: 250 },
      ],
      blocks: [],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 300,
    }

    const merged = mergeSharedState(local, remote)

    expect(merged.labels).toEqual([
      createUnaccountedLabel(100),
      { id: 'label-1', name: 'Work Remote', colourId: 'red', updatedAt: 300 },
      { id: 'label-2', name: 'Exercise', colourId: 'green', updatedAt: 150 },
      { id: 'label-3', name: 'Reading', colourId: 'amber', updatedAt: 250 },
    ])
  })

  it('preserves Unaccounted identity and prevents duplicate Unaccounted label', () => {
    const local: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100)],
      blocks: [],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 100,
    }

    const remote: SharedState = {
      anchor: 1000,
      labels: [
        // Attempting to overwrite Unaccounted properties with different name/colour/archived
        {
          id: UNACCOUNTED_LABEL_ID,
          name: 'Hacked',
          colourId: 'red',
          archived: true,
          updatedAt: 999,
        },
        // Another label trying to name itself Unaccounted
        {
          id: 'label-rogue',
          name: 'Unaccounted',
          colourId: 'blue',
          updatedAt: 500,
        },
      ],
      blocks: [],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 100,
    }

    const merged = mergeSharedState(local, remote)

    const unaccountedLabels = merged.labels.filter(
      (l) => l.id === UNACCOUNTED_LABEL_ID || l.name.toLowerCase() === 'unaccounted',
    )
    expect(unaccountedLabels).toHaveLength(1)
    expect(unaccountedLabels[0]).toEqual({
      id: UNACCOUNTED_LABEL_ID,
      name: 'Unaccounted',
      colourId: 'grey',
      archived: false,
      updatedAt: 999,
    })
  })

  it('merges blocks by id with later updatedAt winning and adopts active label from winning open block', () => {
    const local: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-1', name: 'Work', colourId: 'blue', updatedAt: 100 }],
      blocks: [
        { id: 'block-1', labelId: 'label-1', start: 1000, end: 2000, updatedAt: 200 },
        { id: 'block-2', labelId: 'label-1', start: 2000, end: null, updatedAt: 300 },
      ],
      activeLabelId: 'label-1',
      heartbeat: 2500,
    }

    const remote: SharedState = {
      anchor: 1000,
      labels: [
        createUnaccountedLabel(100),
        { id: 'label-1', name: 'Work', colourId: 'blue', updatedAt: 100 },
        { id: 'label-2', name: 'Rest', colourId: 'green', updatedAt: 100 },
      ],
      blocks: [
        // block-1 was relabelled remotely with later updatedAt
        { id: 'block-1', labelId: 'label-2', start: 1000, end: 2000, updatedAt: 400 },
        // block-2 was ended remotely at 2500, and block-3 was started
        { id: 'block-2', labelId: 'label-1', start: 2000, end: 2500, updatedAt: 500 },
        { id: 'block-3', labelId: 'label-2', start: 2500, end: null, updatedAt: 500 },
      ],
      activeLabelId: 'label-2',
      heartbeat: 2800,
    }

    const merged = mergeSharedState(local, remote)

    expect(merged.blocks).toEqual([
      { id: 'block-1', labelId: 'label-2', start: 1000, end: 2000, updatedAt: 400 },
      { id: 'block-2', labelId: 'label-1', start: 2000, end: 2500, updatedAt: 500 },
      { id: 'block-3', labelId: 'label-2', start: 2500, end: null, updatedAt: 500 },
    ])
    expect(merged.activeLabelId).toBe('label-2')
    expect(merged.heartbeat).toBe(2800)
  })

  it('repairs overlapping closed blocks deterministically: later start wins and earlier block closes at that instant', () => {
    const local: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-1', name: 'Work', colourId: 'blue', updatedAt: 100 }],
      blocks: [
        { id: 'block-a', labelId: 'label-1', start: 1000, end: 3000, updatedAt: 100 },
      ],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 3000,
    }

    const remote: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-2', name: 'Play', colourId: 'red', updatedAt: 100 }],
      blocks: [
        { id: 'block-b', labelId: 'label-2', start: 2000, end: 4000, updatedAt: 150 },
      ],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 4000,
    }

    const merged = mergeSharedState(local, remote)

    // block-b has later start (2000 > 1000). Later start wins.
    // block-a closes at that instant (2000), leaving no gaps or overlaps.
    expect(merged.blocks).toEqual([
      { id: 'block-a', labelId: 'label-1', start: 1000, end: 2000, updatedAt: 2000 },
      { id: 'block-b', labelId: 'label-2', start: 2000, end: 4000, updatedAt: 150 },
    ])
  })

  it('leaves at most one open Block surviving any merge and closes earlier open Block at later start', () => {
    const local: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-1', name: 'Work', colourId: 'blue', updatedAt: 100 }],
      blocks: [
        { id: 'block-local', labelId: 'label-1', start: 1000, end: null, updatedAt: 1000 },
      ],
      activeLabelId: 'label-1',
      heartbeat: 1000,
    }

    const remote: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-2', name: 'Coding', colourId: 'green', updatedAt: 100 }],
      blocks: [
        { id: 'block-remote', labelId: 'label-2', start: 1500, end: null, updatedAt: 1500 },
      ],
      activeLabelId: 'label-2',
      heartbeat: 1500,
    }

    const merged = mergeSharedState(local, remote)

    // block-remote started at 1500 (> 1000), so it wins.
    // block-local closes at 1500. Exactly one open block survives.
    expect(merged.blocks).toEqual([
      { id: 'block-local', labelId: 'label-1', start: 1000, end: 1500, updatedAt: 1500 },
      { id: 'block-remote', labelId: 'label-2', start: 1500, end: null, updatedAt: 1500 },
    ])
    expect(merged.activeLabelId).toBe('label-2')
  })

  it('deterministically breaks ties when two blocks have identical start times', () => {
    const local: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-1', name: 'Work', colourId: 'blue', updatedAt: 100 }],
      blocks: [
        { id: 'block-1', labelId: 'label-1', start: 1000, end: null, updatedAt: 100 },
      ],
      activeLabelId: 'label-1',
      heartbeat: 1000,
    }

    const remote: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-2', name: 'Exercise', colourId: 'green', updatedAt: 100 }],
      blocks: [
        { id: 'block-2', labelId: 'label-2', start: 1000, end: null, updatedAt: 200 },
      ],
      activeLabelId: 'label-2',
      heartbeat: 1000,
    }

    const merged = mergeSharedState(local, remote)

    // block-2 has higher updatedAt at the same start (1000). It wins.
    // block-1 closes at 1000 (duration 0) and is dropped.
    expect(merged.blocks).toEqual([
      { id: 'block-2', labelId: 'label-2', start: 1000, end: null, updatedAt: 200 },
    ])
    expect(merged.activeLabelId).toBe('label-2')
  })

  it('keeps the greatest Heartbeat across devices', () => {
    const local: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-1', name: 'Work', colourId: 'blue', updatedAt: 100 }],
      blocks: [
        { id: 'block-1', labelId: 'label-1', start: 1000, end: null, updatedAt: 100 },
      ],
      activeLabelId: 'label-1',
      heartbeat: 1200,
    }

    const remote: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-2', name: 'Exercise', colourId: 'green', updatedAt: 100 }],
      blocks: [
        { id: 'block-2', labelId: 'label-2', start: 2000, end: null, updatedAt: 2000 },
      ],
      activeLabelId: 'label-2',
      heartbeat: 1100,
    }

    const merged = mergeSharedState(local, remote)

    // Greatest heartbeat between 1200 and 1100 is 1200
    expect(merged.heartbeat).toBe(1200)
    expect(merged.activeLabelId).toBe('label-2')
  })
})

describe('SyncCoordinator', () => {
  it('queues local changes when signed in and pushes after debounce', async () => {
    const fakeSync = createFakeSyncAdapter()
    let currentState: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100)],
      blocks: [],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 100,
    }

    const coordinator = new SyncCoordinator({
      sync: fakeSync,
      getSharedState: () => currentState,
      setSharedState: (next) => {
        currentState = next
      },
      getSession: () => ({ accountId: 'acc-1', email: 'test@example.com' }),
      debounceMs: 2000,
    })

    // Notify of mutation
    coordinator.notifyMutation()
    expect(coordinator.isQueued()).toBe(true)
    expect(fakeSync.calls).toHaveLength(0)

    // Flush after debounce (or advance time)
    await coordinator.flush()
    expect(coordinator.isQueued()).toBe(false)
    expect(fakeSync.calls).toHaveLength(1)
    expect(fakeSync.calls[0]).toMatchObject({
      method: 'push',
      accountId: 'acc-1',
      baseVersion: null,
    })
    expect(coordinator.getBaseVersion()).toBe(1)
  })

  it('merges version conflicts and retries without losing local edits', async () => {
    const fakeSync = createFakeSyncAdapter()
    // Remote already has version 1 with a remote label
    fakeSync.setRemoteDocument('acc-1', {
      version: 1,
      shared: {
        anchor: 1000,
        labels: [
          createUnaccountedLabel(100),
          { id: 'label-remote', name: 'Remote Note', colourId: 'green', updatedAt: 200 },
        ],
        blocks: [],
        activeLabelId: UNACCOUNTED_LABEL_ID,
        heartbeat: 200,
      },
    })

    // Local has baseVersion null (or 0) and added a local label
    let currentState: SharedState = {
      anchor: 1000,
      labels: [
        createUnaccountedLabel(100),
        { id: 'label-local', name: 'Local Note', colourId: 'blue', updatedAt: 300 },
      ],
      blocks: [],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 300,
    }

    const coordinator = new SyncCoordinator({
      sync: fakeSync,
      getSharedState: () => currentState,
      setSharedState: (next) => {
        currentState = next
      },
      getSession: () => ({ accountId: 'acc-1', email: 'test@example.com' }),
    })

    coordinator.notifyMutation()
    // First push will conflict because local baseVersion is null but remote is version 1!
    // Coordinator should catch conflict, merge remote with local, and retry push with baseVersion: 1.
    await coordinator.flush()

    expect(coordinator.isQueued()).toBe(false)
    expect(coordinator.getBaseVersion()).toBe(2) // 1 was bumped to 2 on retry!
    expect(fakeSync.calls.filter((c) => c.method === 'push')).toHaveLength(2)

    // Verify currentState and remoteDoc contain both labels (neither lost)
    expect(currentState.labels).toContainEqual({
      id: 'label-local',
      name: 'Local Note',
      colourId: 'blue',
      updatedAt: 300,
    })
    expect(currentState.labels).toContainEqual({
      id: 'label-remote',
      name: 'Remote Note',
      colourId: 'green',
      updatedAt: 200,
    })
    const remoteDoc = fakeSync.getRemoteDocument('acc-1')
    expect(remoteDoc?.version).toBe(2)
    expect(remoteDoc?.shared.labels).toHaveLength(3) // Unaccounted + local + remote
  })

  it('keeps offline changes queued and flushes once back online', async () => {
    const fakeSync = createFakeSyncAdapter({ initialOffline: true })
    let currentState: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100)],
      blocks: [],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 100,
    }

    const coordinator = new SyncCoordinator({
      sync: fakeSync,
      getSharedState: () => currentState,
      setSharedState: (next) => {
        currentState = next
      },
      getSession: () => ({ accountId: 'acc-1', email: 'test@example.com' }),
    })

    coordinator.notifyMutation()
    await coordinator.flush()

    // Still queued because offline
    expect(coordinator.isQueued()).toBe(true)
    expect(fakeSync.getRemoteDocument('acc-1')).toBeNull()

    // Connection restored
    fakeSync.setOffline(false)
    await coordinator.flush()

    expect(coordinator.isQueued()).toBe(false)
    expect(fakeSync.getRemoteDocument('acc-1')).not.toBeNull()
    expect(coordinator.getBaseVersion()).toBe(1)
  })

  it('pulls remote updates and merges per-entity when remote has newer version', async () => {
    const fakeSync = createFakeSyncAdapter()
    let currentState: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(100), { id: 'label-local', name: 'Local', colourId: 'blue', updatedAt: 100 }],
      blocks: [],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 100,
    }

    fakeSync.setRemoteDocument('acc-1', {
      version: 5,
      shared: {
        anchor: 1000,
        labels: [
          createUnaccountedLabel(100),
          { id: 'label-remote', name: 'Remote', colourId: 'green', updatedAt: 200 },
        ],
        blocks: [],
        activeLabelId: UNACCOUNTED_LABEL_ID,
        heartbeat: 200,
      },
    })

    const coordinator = new SyncCoordinator({
      sync: fakeSync,
      getSharedState: () => currentState,
      setSharedState: (next) => {
        currentState = next
      },
      getSession: () => ({ accountId: 'acc-1', email: 'test@example.com' }),
    })

    await coordinator.pull()

    expect(coordinator.getBaseVersion()).toBe(5)
    expect(currentState.labels).toHaveLength(3) // Unaccounted + Local + Remote
  })
})

describe('first sign-in resolution', () => {
  const remote: SharedState = {
    anchor: 5000,
    labels: [
      createUnaccountedLabel(100),
      { id: 'label-r', name: 'Remote', colourId: 'blue', updatedAt: 200 },
    ],
    blocks: [{ id: 'block-r', labelId: 'label-r', start: 5000, end: null, updatedAt: 300 }],
    activeLabelId: 'label-r',
    heartbeat: 300,
  }
  const local: SharedState = {
    anchor: 1000,
    labels: [
      createUnaccountedLabel(100),
      { id: 'label-l', name: 'Local', colourId: 'green', updatedAt: 150 },
    ],
    blocks: [{ id: 'block-l', labelId: 'label-l', start: 1000, end: null, updatedAt: 160 }],
    activeLabelId: 'label-l',
    heartbeat: 160,
  }

  it('merge keeps the earliest Anchor and both sides data', () => {
    const resolved = resolveFirstSignIn(local, remote, 'merge')

    expect(resolved.anchor).toBe(1000)
    expect(resolved.labels.map((l) => l.id)).toEqual(['label-unaccounted', 'label-l', 'label-r'])
    expect(resolved.blocks.map((b) => b.id).sort()).toEqual(['block-l', 'block-r'])
  })

  it('merge picks the remote Anchor when it is earlier', () => {
    const resolved = resolveFirstSignIn({ ...local, anchor: 9000 }, remote, 'merge')

    expect(resolved.anchor).toBe(5000)
  })

  it('replace keeps the remote Shared state and discards local', () => {
    expect(resolveFirstSignIn(local, remote, 'replace')).toEqual(remote)
  })

  it('treats a fresh Unaccounted-only state as having no user data', () => {
    const fresh: SharedState = {
      anchor: 1000,
      labels: [createUnaccountedLabel(1000)],
      blocks: [
        { id: 'block-1', labelId: UNACCOUNTED_LABEL_ID, start: 1000, end: null, updatedAt: 1000 },
      ],
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: 1000,
    }

    expect(hasUserData(fresh)).toBe(false)
    expect(hasUserData(local)).toBe(true)
    expect(hasUserData({ ...fresh, blocks: [...fresh.blocks, ...local.blocks] })).toBe(true)
  })
})
