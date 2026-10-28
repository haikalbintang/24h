import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { decodePersistedState, STATE_STORAGE_KEY } from './persistence'
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
      theme: string
      labels: unknown[]
      blocks: unknown[]
      activeLabelId: string | null
    }

    expect(stored).toMatchObject({
      schemaVersion: 1,
      theme: 'dark',
    })
    expect(stored.labels).toHaveLength(1)
    expect(stored.blocks).toHaveLength(1)
    expect(stored.blocks[0]).toMatchObject({ labelId: 'label-1', end: null })
    expect(stored.activeLabelId).toBe('label-1')
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

    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Work')
    expect(items[0]).toHaveTextContent('00:30:10')
    expect(items[0]).not.toHaveTextContent(/ongoing/i)

    expect(items[1]).toHaveTextContent('Rest')
    expect(items[1]).not.toHaveTextContent(/ongoing/i)

    expect(status()).toHaveTextContent('Unlabeled')
  })

  it('closes an open Block at last-seen and starts Unlabeled after a reload', async () => {
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

    expect(status()).toHaveTextContent('Unlabeled')

    const items = blockItems()

    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Work')
    expect(items[0]).toHaveTextContent('00:31:00')
    expect(items[0]).not.toHaveTextContent(/ongoing/i)
  })

  it('falls back to a fresh state when the stored document is corrupt', () => {
    const storage = createFakeStorage({ [STATE_STORAGE_KEY]: '{not json' })
    const runtime = createTestRuntime(at('2026-03-08T05:30:00.000Z'), storage)

    render(<App runtime={runtime} />)

    expect(
      screen.getByRole('timer', { name: 'Day clock' }),
    ).toHaveTextContent('00:30:00')
    expect(screen.getByText('No labels yet.')).toBeInTheDocument()
    expect(status()).toHaveTextContent('Unlabeled')
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

describe('Block source persistence', () => {
  const documentWith = (blocks: unknown[]) =>
    JSON.stringify({
      schemaVersion: 1,
      anchor: 0,
      labels: [],
      blocks,
      activeLabelId: null,
      lastSeen: 0,
      theme: 'dark',
    })

  it('keeps the manual source of a stored Block', () => {
    const state = decodePersistedState(
      documentWith([
        { id: 'block-1', labelId: 'label-1', start: 0, end: 1000, source: 'manual' },
      ]),
    )

    expect(state?.blocks[0].source).toBe('manual')
  })

  it('treats a stored Block without a source as live', () => {
    const state = decodePersistedState(
      documentWith([{ id: 'block-1', labelId: 'label-1', start: 0, end: 1000 }]),
    )

    expect(state?.blocks[0].source).toBe('live')
  })
})
