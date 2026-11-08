import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { STATE_STORAGE_KEY } from '@/data/persistence'
import { createFakeStorage, createTestRuntime } from '@/testing/runtime'

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

const at = (iso: string) => new Date(iso).getTime()

const ANCHOR = at('2026-03-08T05:00:00.000Z')
const NOW = at('2026-03-08T05:30:00.000Z')

function stateDocument() {
  return JSON.stringify({
    schemaVersion: 1,
    anchor: ANCHOR,
    labels: [
      { id: 'label-1', name: 'Work', colourId: 'blue', archived: false },
      { id: 'label-2', name: 'Rest', colourId: 'green', archived: true },
    ],
    blocks: [
      {
        id: 'block-1',
        labelId: 'label-1',
        start: ANCHOR + 1 * HOUR_MS,
        end: ANCHOR + 2 * HOUR_MS,
      },
      {
        id: 'block-2',
        labelId: 'label-1',
        start: ANCHOR + 2 * HOUR_MS,
        end: ANCHOR + 3 * HOUR_MS,
      },
      {
        id: 'block-3',
        labelId: 'label-1',
        start: ANCHOR + 15 * MINUTE_MS,
        end: null,
      },
    ],
    activeLabelId: 'label-1',
    lastSeen: NOW,
    theme: 'dark',
  })
}

function setup(
  storage = createFakeStorage({ [STATE_STORAGE_KEY]: stateDocument() }),
) {
  const runtime = createTestRuntime(NOW, storage)
  const user = userEvent.setup()

  render(<App runtime={runtime} />)

  return { runtime, user }
}

describe('Export', () => {
  it('exports the current Shared state and Device theme as versioned JSON', async () => {
    const { runtime, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('menuitem', { name: 'Export JSON' }))

    const call = runtime.exportSink.calls[0]

    expect(call.filename).toBe('day-labels-export.json')
    expect(call.mimeType).toBe('application/json')
    expect(JSON.parse(call.contents)).toMatchObject({
      schemaVersion: 2,
      shared: { anchor: ANCHOR, activeLabelId: 'label-1', heartbeat: NOW },
      device: { theme: 'dark', session: null },
    })
  })

  it('exports every Block as CSV', async () => {
    const { runtime, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Export' }))
    await user.click(screen.getByRole('menuitem', { name: 'Export CSV' }))

    const call = runtime.exportSink.calls[0]

    expect(call.filename).toBe('day-labels-export.csv')
    expect(call.mimeType).toBe('text/csv')
    expect(call.contents.split('\n')).toHaveLength(4)
  })
})
