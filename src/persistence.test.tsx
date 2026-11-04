import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import {
  createFreshPersistedState,
  decodePersistedState,
  loadPersistedState,
  STATE_STORAGE_KEY,
  UNACCOUNTED_LABEL_ID,
} from './persistence'
import { createFakeStorage, createTestRuntime } from './test/runtime'

const SECOND_MS = 1000

const at = (iso: string) => new Date(iso).getTime()

function setup(
  now = at('2026-03-08T05:30:00.000Z'),
  storage = createFakeStorage(),
) {
  const runtime = createTestRuntime(now, storage)
  const user = userEvent.setup()

  render(<App runtime={runtime} />)

  return { runtime, user }
}

async function createLabel(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  colour = 'Blue',
) {
  // The create-label form lives behind the "New label" toggle.
  await user.click(screen.getByRole('button', { name: 'New label' }))

  const form = screen.getByRole('form', { name: 'Create label' })

  await user.type(
    within(form).getByRole('textbox', { name: 'New label name' }),
    name,
  )
  await user.click(within(form).getByRole('radio', { name: colour }))
  await user.click(within(form).getByRole('button', { name: 'Create label' }))
}

const status = () => screen.getByRole('status', { name: 'Active label' })
const blocksList = () => screen.getByRole('list', { name: 'Blocks' })
const blockItems = () => within(blocksList()).getAllByRole('listitem')

describe('Persistence', () => {
  it('saves the versioned document after a mutation', async () => {
    const storage = createFakeStorage()
    const { user } = setup(at('2026-03-08T05:30:00.000Z'), storage)

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))

    const stored = JSON.parse(
      storage.getItem(STATE_STORAGE_KEY) ?? 'null',
    ) as {
      schemaVersion: number
      device: { theme: string }
      shared: {
        labels: unknown[]
        blocks: unknown[]
        activeLabelId: string | null
      }
    }

    expect(stored).toMatchObject({
      schemaVersion: 2,
      device: {
        theme: 'dark',
      },
    })
    expect(stored.shared.labels).toHaveLength(2)
    expect(stored.shared.labels).toContainEqual(
      expect.objectContaining({ id: 'label-unaccounted', name: 'Unaccounted' }),
    )
    expect(stored.shared.blocks).toHaveLength(1)
    expect(stored.shared.blocks[0]).toMatchObject({ labelId: 'label-1', end: null })
    expect(stored.shared.activeLabelId).toBe('label-1')
  })

  it('restores labels and Blocks from the versioned document after a reload', async () => {
    const storage = createFakeStorage()
    const firstRuntime = createTestRuntime(
      at('2026-03-08T05:30:00.000Z'),
      storage,
    )
    const firstRender = render(<App runtime={firstRuntime} />)
    const user = userEvent.setup()

    await createLabel(user, 'Work')
    await createLabel(user, 'Rest', 'Green')
    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => firstRuntime.clock.advance(10 * SECOND_MS))
    await user.click(screen.getByRole('button', { name: 'Rest' }))

    firstRender.unmount()

    const secondRuntime = createTestRuntime(
      at('2026-03-08T06:30:00.000Z'),
      storage,
    )
    render(<App runtime={secondRuntime} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'End Block' }))

    expect(screen.getByRole('button', { name: 'Work' })).toBeInTheDocument()
    expect(
      screen.getByRole('timer', { name: 'Day clock' }),
    ).toHaveTextContent('01:30:00')

    const items = blockItems()

    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Work')
    expect(items[0]).toHaveTextContent('00:30:10')
    expect(items[0]).not.toHaveTextContent(/ongoing/i)

    expect(items[1]).toHaveTextContent('Rest')
    expect(items[1]).not.toHaveTextContent(/ongoing/i)

    expect(items[2]).toHaveTextContent('Unaccounted')
    expect(items[2]).toHaveTextContent(/ongoing/i)

    expect(status()).toHaveTextContent('Unaccounted')
  })

  it('closes an open Block at last-seen and starts Unaccounted after a reload', async () => {
    const storage = createFakeStorage()
    const firstRuntime = createTestRuntime(
      at('2026-03-08T05:30:00.000Z'),
      storage,
    )
    const firstRender = render(<App runtime={firstRuntime} />)
    const user = userEvent.setup()

    await createLabel(user, 'Work')
    await user.click(screen.getByRole('button', { name: 'Work' }))
    act(() => firstRuntime.clock.advance(60 * SECOND_MS))

    firstRender.unmount()

    const secondRuntime = createTestRuntime(
      at('2026-03-08T06:30:00.000Z'),
      storage,
    )
    render(<App runtime={secondRuntime} />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'End Block' }))

    expect(status()).toHaveTextContent('Unaccounted')

    const items = blockItems()

    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Work')
    expect(items[0]).toHaveTextContent('00:31:00')
    expect(items[0]).not.toHaveTextContent(/ongoing/i)
    expect(items[1]).toHaveTextContent('Unaccounted')
    expect(items[1]).toHaveTextContent(/ongoing/i)
  })

  it('falls back to a fresh state when the stored document is corrupt', () => {
    const storage = createFakeStorage({ [STATE_STORAGE_KEY]: '{not json' })
    const runtime = createTestRuntime(at('2026-03-08T05:30:00.000Z'), storage)

    render(<App runtime={runtime} />)

    expect(
      screen.getByRole('timer', { name: 'Day clock' }),
    ).toHaveTextContent('00:30:00')
    expect(
      screen.getByRole('button', { name: 'Unaccounted' }),
    ).toBeInTheDocument()
    expect(status()).toHaveTextContent('Unaccounted')
  })

  it('restores the saved theme after a reload', () => {
    const storage = createFakeStorage({
      [STATE_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        anchor: at('2026-03-08T05:00:00.000Z'),
        labels: [],
        blocks: [],
        activeLabelId: null,
        lastSeen: at('2026-03-08T05:30:00.000Z'),
        theme: 'light',
      }),
    })
    const runtime = createTestRuntime(at('2026-03-08T05:30:00.000Z'), storage)

    render(<App runtime={runtime} />)

    expect(screen.getByRole('main')).toHaveAttribute('data-theme', 'light')
  })
})

describe('schema v2 structure', () => {
  it('creates fresh persisted state as schema v2 with shared and device state separated', () => {
    const now = at('2026-03-08T05:30:00.000Z')
    const fresh = createFreshPersistedState(now)

    expect(fresh).toEqual({
      schemaVersion: 2,
      shared: {
        anchor: at('2026-03-08T05:00:00.000Z'),
        labels: [
          {
            id: 'label-unaccounted',
            name: 'Unaccounted',
            colourId: 'grey',
            archived: false,
            updatedAt: now,
          },
        ],
        blocks: [
          {
            id: 'block-1',
            labelId: 'label-unaccounted',
            start: now,
            end: null,
            updatedAt: now,
          },
        ],
        activeLabelId: 'label-unaccounted',
        heartbeat: now,
      },
      device: {
        theme: 'dark',
        session: null,
      },
    })
  })

  it('decodes a valid schema v2 document', () => {
    const now = at('2026-03-08T05:30:00.000Z')
    const raw = JSON.stringify({
      schemaVersion: 2,
      shared: {
        anchor: at('2026-03-08T05:00:00.000Z'),
        labels: [
          {
            id: 'label-unaccounted',
            name: 'Unaccounted',
            colourId: 'grey',
            archived: false,
            updatedAt: now,
          },
          {
            id: 'label-1',
            name: 'Work',
            colourId: 'blue',
            archived: false,
            updatedAt: now,
          },
        ],
        blocks: [
          {
            id: 'block-1',
            labelId: 'label-1',
            start: now,
            end: null,
            updatedAt: now,
          },
        ],
        activeLabelId: 'label-1',
        heartbeat: now,
      },
      device: {
        theme: 'light',
        session: null,
      },
    })

    const decoded = decodePersistedState(raw)

    expect(decoded).toEqual({
      schemaVersion: 2,
      shared: {
        anchor: at('2026-03-08T05:00:00.000Z'),
        labels: [
          {
            id: 'label-unaccounted',
            name: 'Unaccounted',
            colourId: 'grey',
            archived: false,
            updatedAt: now,
          },
          {
            id: 'label-1',
            name: 'Work',
            colourId: 'blue',
            archived: false,
            updatedAt: now,
          },
        ],
        blocks: [
          {
            id: 'block-1',
            labelId: 'label-1',
            start: now,
            end: null,
            updatedAt: now,
          },
        ],
        activeLabelId: 'label-1',
        heartbeat: now,
      },
      device: {
        theme: 'light',
        session: null,
      },
    })
  })
})

describe('v1 migration and edge cases', () => {
  const anchor = at('2026-03-08T05:00:00.000Z')
  const now = at('2026-03-08T05:30:00.000Z')

  it('migrates v1 dropping Manual Blocks, removing source, and giving legacy records stable updatedAt fallback', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      anchor,
      labels: [
        { id: 'label-1', name: 'Work', colourId: 'blue' },
      ],
      blocks: [
        { id: 'block-1', labelId: 'label-1', start: anchor, end: anchor + 1000, source: 'manual' },
        { id: 'block-2', labelId: 'label-1', start: anchor + 1000, end: null, source: 'live' },
      ],
      activeLabelId: 'label-1',
      lastSeen: now,
      theme: 'dark',
    })

    const state = decodePersistedState(raw, now)

    expect(state?.schemaVersion).toBe(2)
    // Manual block is dropped, live block is retained with source removed and updatedAt set to anchor
    expect(state?.shared.blocks).toEqual([
      {
        id: 'block-2',
        labelId: 'label-1',
        start: anchor + 1000,
        end: null,
        updatedAt: anchor,
      },
    ])
    // Legacy labels receive anchor as stable updatedAt fallback
    expect(state?.shared.labels).toContainEqual(
      expect.objectContaining({
        id: 'label-1',
        name: 'Work',
        updatedAt: anchor,
      }),
    )
  })

  it('migrates v1 mapping null active label to Unaccounted and ensures one open Block', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      anchor,
      labels: [
        { id: 'label-1', name: 'Work', colourId: 'blue' },
      ],
      blocks: [
        { id: 'block-1', labelId: 'label-1', start: anchor, end: anchor + 1000 },
      ],
      activeLabelId: null,
      lastSeen: now,
      theme: 'dark',
    })

    const state = decodePersistedState(raw, now)

    expect(state?.shared.activeLabelId).toBe(UNACCOUNTED_LABEL_ID)
    const openBlocks = state?.shared.blocks.filter((b) => b.end === null)
    expect(openBlocks).toHaveLength(1)
    expect(openBlocks?.[0].labelId).toBe(UNACCOUNTED_LABEL_ID)
  })

  it('reuses an existing v1 Unaccounted label rather than duplicating it', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      anchor,
      labels: [
        { id: 'custom-unaccounted', name: 'Unaccounted', colourId: 'blue' },
        { id: 'label-work', name: 'Work', colourId: 'green' },
      ],
      blocks: [
        { id: 'block-1', labelId: 'custom-unaccounted', start: anchor, end: null },
      ],
      activeLabelId: 'custom-unaccounted',
      lastSeen: now,
      theme: 'dark',
    })

    const state = decodePersistedState(raw, now)

    const unaccountedLabels = state?.shared.labels.filter(
      (l) => l.name.toLowerCase() === 'unaccounted',
    )
    expect(unaccountedLabels).toHaveLength(1)
    expect(unaccountedLabels?.[0].id).toBe(UNACCOUNTED_LABEL_ID)
    expect(unaccountedLabels?.[0].colourId).toBe('grey')
    expect(state?.shared.activeLabelId).toBe(UNACCOUNTED_LABEL_ID)
    expect(state?.shared.blocks[0].labelId).toBe(UNACCOUNTED_LABEL_ID)
  })

  it('guarantees exactly one open Block when v1 has no open Block', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      anchor,
      labels: [
        { id: 'label-1', name: 'Work', colourId: 'blue' },
      ],
      blocks: [
        { id: 'block-1', labelId: 'label-1', start: anchor, end: anchor + 1000 },
        { id: 'block-2', labelId: 'label-1', start: anchor + 1000, end: anchor + 2000 },
      ],
      activeLabelId: 'label-1',
      lastSeen: now,
      theme: 'dark',
    })

    const state = decodePersistedState(raw, now)

    const openBlocks = state?.shared.blocks.filter((b) => b.end === null)
    expect(openBlocks).toHaveLength(1)
    expect(openBlocks?.[0].labelId).toBe('label-1')
  })

  it('guarantees exactly one open Block when multiple open blocks exist', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      anchor,
      labels: [
        { id: 'label-1', name: 'Work', colourId: 'blue' },
      ],
      blocks: [
        { id: 'block-1', labelId: 'label-1', start: anchor, end: null },
        { id: 'block-2', labelId: 'label-1', start: anchor + 1000, end: null },
      ],
      activeLabelId: 'label-1',
      lastSeen: now,
      theme: 'dark',
    })

    const state = decodePersistedState(raw, now)

    const openBlocks = state?.shared.blocks.filter((b) => b.end === null)
    expect(openBlocks).toHaveLength(1)
    expect(openBlocks?.[0].id).toBe('block-2')
    expect(state?.shared.blocks[0].end).toBe(anchor + 1000)
  })

  it('migrates v1 with null activeLabelId and an open block by closing the open block', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      anchor,
      labels: [
        { id: 'label-1', name: 'Work', colourId: 'blue' },
      ],
      blocks: [
        { id: 'block-1', labelId: 'label-1', start: anchor, end: null },
      ],
      activeLabelId: null,
      lastSeen: anchor + 500,
      theme: 'dark',
    })

    const state = decodePersistedState(raw, now)

    expect(state?.shared.activeLabelId).toBe(UNACCOUNTED_LABEL_ID)
    expect(state?.shared.blocks[0].end).toBe(anchor + 500)
    const openBlocks = state?.shared.blocks.filter((b) => b.end === null)
    expect(openBlocks).toHaveLength(1)
    expect(openBlocks?.[0].labelId).toBe(UNACCOUNTED_LABEL_ID)
  })

  it('preserves explicit heartbeat: null in v2 documents', () => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      shared: {
        anchor,
        labels: [
          {
            id: 'label-unaccounted',
            name: 'Unaccounted',
            colourId: 'grey',
            archived: false,
            updatedAt: anchor,
          },
        ],
        blocks: [
          {
            id: 'block-1',
            labelId: 'label-unaccounted',
            start: anchor,
            end: null,
            updatedAt: anchor,
          },
        ],
        activeLabelId: 'label-unaccounted',
        heartbeat: null,
      },
      device: {
        theme: 'dark',
        session: null,
      },
    })

    const state = decodePersistedState(raw, now)
    expect(state?.shared.heartbeat).toBeNull()
  })

  it('persists and restores Account session in device state', () => {
    const session = {
      accountId: 'acc-123',
      email: 'alex@example.com',
    }
    const raw = JSON.stringify({
      schemaVersion: 2,
      shared: {
        anchor,
        labels: [
          {
            id: 'label-unaccounted',
            name: 'Unaccounted',
            colourId: 'grey',
            archived: false,
            updatedAt: anchor,
          },
        ],
        blocks: [
          {
            id: 'block-1',
            labelId: 'label-unaccounted',
            start: anchor,
            end: null,
            updatedAt: anchor,
          },
        ],
        activeLabelId: 'label-unaccounted',
        heartbeat: null,
      },
      device: {
        theme: 'dark',
        session,
      },
    })

    const state = decodePersistedState(raw, now)
    expect(state?.device.session).toEqual(session)
  })

  it('falls back to a valid v2 state without crashing on corrupt or unknown data', () => {
    const corruptInputs = [
      '{ not json',
      '123',
      'null',
      JSON.stringify({ schemaVersion: 99 }),
      JSON.stringify({ schemaVersion: 1, anchor: 'not-a-number' }),
      JSON.stringify({ schemaVersion: 2, shared: null }),
    ]

    for (const input of corruptInputs) {
      expect(decodePersistedState(input)).toBeNull()
      const storage = createFakeStorage({ [STATE_STORAGE_KEY]: input })
      const state = loadPersistedState(createTestRuntime(now, storage), now)
      expect(state.schemaVersion).toBe(2)
      expect(state.shared.activeLabelId).toBe(UNACCOUNTED_LABEL_ID)
      expect(state.shared.blocks.some((b) => b.end === null)).toBe(true)
    }
  })
})
