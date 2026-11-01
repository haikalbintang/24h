import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from './App'
import { STATE_STORAGE_KEY } from './persistence'
import { createFakeStorage, createTestRuntime } from './test/runtime'

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
        source: 'live',
      },
      {
        id: 'block-2',
        labelId: 'label-1',
        start: ANCHOR + 2 * HOUR_MS,
        end: ANCHOR + 3 * HOUR_MS,
        source: 'manual',
      },
      {
        id: 'block-3',
        labelId: 'label-1',
        start: ANCHOR + 15 * MINUTE_MS,
        end: null,
        source: 'live',
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
  it('warns that there is no import and that clearing site data is permanent', () => {
    setup()

    expect(screen.getByText(/no import/i)).toBeInTheDocument()
    expect(screen.getByText(/clearing site data/i)).toBeInTheDocument()
  })

  it('has no import control', () => {
    setup()

    expect(
      screen.queryByRole('button', { name: /import/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('textbox', { name: /import/i }),
    ).not.toBeInTheDocument()
  })

  it('exports the full versioned state as JSON', async () => {
    const { runtime, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Export JSON' }))

    const call = runtime.exportSink.calls[0]

    expect(call.filename).toBe('day-labels-export.json')
    expect(call.mimeType).toBe('application/json')

    expect(JSON.parse(call.contents)).toEqual({
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
          source: 'live',
        },
        {
          id: 'block-2',
          labelId: 'label-1',
          start: ANCHOR + 2 * HOUR_MS,
          end: ANCHOR + 3 * HOUR_MS,
          source: 'manual',
        },
        {
          id: 'block-3',
          labelId: 'label-1',
          start: ANCHOR + 15 * MINUTE_MS,
          end: null,
          source: 'live',
        },
      ],
      activeLabelId: 'label-1',
      lastSeen: NOW,
      theme: 'dark',
    })
  })

  it('exports one CSV row per Block with day label, label name, start, end, duration, and source', async () => {
    const { runtime, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    const call = runtime.exportSink.calls[0]

    expect(call.filename).toBe('day-labels-export.csv')
    expect(call.mimeType).toBe('text/csv')
    expect(call.contents).toBe(
      [
        'Day label,Label name,Start,End,Duration,Source',
        `"Mar 8, 2026",Work,${ANCHOR + 15 * MINUTE_MS},,900000,live`,
        `"Mar 8, 2026",Work,${ANCHOR + 1 * HOUR_MS},${ANCHOR + 2 * HOUR_MS},3600000,live`,
        `"Mar 8, 2026",Work,${ANCHOR + 2 * HOUR_MS},${ANCHOR + 3 * HOUR_MS},3600000,manual`,
      ].join('\n'),
    )
  })

  it('exports the active Block with a blank end and duration to export time', async () => {
    const { runtime, user } = setup()

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    const call = runtime.exportSink.calls[0]

    const ongoingRow = `"Mar 8, 2026",Work,${ANCHOR + 15 * MINUTE_MS},,900000,live`

    expect(call.contents).toContain(ongoingRow)
  })
})
