import { describe, expect, it } from 'vitest'
import {
  createBlocksCsv,
  encodePersistedStateJson,
  saveBlocksExport,
  saveJsonExport,
} from './export'
import { STATE_SCHEMA_VERSION } from './persistence'
import type { PersistedState } from './persistence'
import { createTestRuntime } from '@/testing/runtime'

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

const at = (iso: string) => new Date(iso).getTime()

const ANCHOR = at('2026-03-08T05:00:00.000Z')
const NOW = at('2026-03-08T05:30:00.000Z')

const labels = [
  {
    id: 'label-unaccounted',
    name: 'Unaccounted',
    colourId: 'grey' as const,
    archived: false,
    updatedAt: ANCHOR,
  },
  {
    id: 'label-1',
    name: 'Work',
    colourId: 'blue' as const,
    archived: false,
    updatedAt: ANCHOR,
  },
  {
    id: 'label-2',
    name: 'Rest',
    colourId: 'green' as const,
    archived: true,
    updatedAt: ANCHOR,
  },
]

const blocks = [
  {
    id: 'block-1',
    labelId: 'label-1',
    start: ANCHOR + 1 * HOUR_MS,
    end: ANCHOR + 2 * HOUR_MS,
    updatedAt: ANCHOR,
  },
  {
    id: 'block-2',
    labelId: 'label-1',
    start: ANCHOR + 2 * HOUR_MS,
    end: ANCHOR + 3 * HOUR_MS,
    updatedAt: ANCHOR,
  },
  {
    id: 'block-3',
    labelId: 'label-1',
    start: ANCHOR + 15 * MINUTE_MS,
    end: null,
    updatedAt: ANCHOR,
  },
]

const state: PersistedState = {
  schemaVersion: STATE_SCHEMA_VERSION,
  shared: {
    anchor: ANCHOR,
    labels,
    blocks,
    activeLabelId: 'label-1',
    heartbeat: NOW,
  },
  device: {
    theme: 'dark',
    session: null,
  },
}

describe('JSON export', () => {
  it('encodes the whole versioned document', () => {
    expect(JSON.parse(encodePersistedStateJson(state))).toEqual(state)
  })

  it('writes the versioned state to the export sink', () => {
    const runtime = createTestRuntime(NOW)

    saveJsonExport(runtime, state)

    const call = runtime.exportSink.calls[0]

    expect(call.filename).toBe('day-labels-export.json')
    expect(call.mimeType).toBe('application/json')
    expect(JSON.parse(call.contents)).toEqual(state)
  })
})

describe('CSV export', () => {
  it('writes one row per Block with day label, label name, start, end, and duration', () => {
    expect(createBlocksCsv(blocks, labels, ANCHOR, NOW)).toBe(
      [
        'Day label,Label name,Start,End,Duration',
        `"Mar 8, 2026",Work,${ANCHOR + 15 * MINUTE_MS},,900000`,
        `"Mar 8, 2026",Work,${ANCHOR + 1 * HOUR_MS},${ANCHOR + 2 * HOUR_MS},3600000`,
        `"Mar 8, 2026",Work,${ANCHOR + 2 * HOUR_MS},${ANCHOR + 3 * HOUR_MS},3600000`,
      ].join('\n'),
    )
  })

  it('writes the active Block with a blank end and duration to export time', () => {
    const csv = createBlocksCsv(blocks, labels, ANCHOR, NOW)

    expect(csv).toContain(`"Mar 8, 2026",Work,${ANCHOR + 15 * MINUTE_MS},,900000`)
  })

  it('quotes values that contain commas or quotes', () => {
    const csv = createBlocksCsv(
      [{ id: 'block-1', labelId: 'label-1', start: ANCHOR, end: ANCHOR }],
      [{ id: 'label-1', name: 'Read, "slowly"', colourId: 'blue' }],
      ANCHOR,
      NOW,
    )

    expect(csv).toContain('"Read, ""slowly"""')
  })

  it('writes CSV to the export sink', () => {
    const runtime = createTestRuntime(NOW)

    saveBlocksExport(runtime, blocks, labels, ANCHOR, NOW)

    const call = runtime.exportSink.calls[0]

    expect(call.filename).toBe('day-labels-export.csv')
    expect(call.mimeType).toBe('text/csv')
    expect(call.contents).toBe(createBlocksCsv(blocks, labels, ANCHOR, NOW))
  })
})
