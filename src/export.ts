import { DAY_MS, formatDayLabel } from './day'
import { getBlockDuration } from './blocks'
import type { Block } from './blocks'
import type { Label } from './labels'
import type { PersistedState } from './persistence'
import type { Runtime } from './runtime'

export const EXPORT_JSON_FILENAME = 'day-labels-export.json'
export const EXPORT_JSON_MIME_TYPE = 'application/json'
export const EXPORT_CSV_FILENAME = 'day-labels-export.csv'
export const EXPORT_CSV_MIME_TYPE = 'text/csv'

const BLOCKS_CSV_COLUMNS = [
  'Day label',
  'Label name',
  'Start',
  'End',
  'Duration',
] as const

export function encodePersistedStateJson(state: PersistedState): string {
  return JSON.stringify(state, null, 2)
}

function escapeCsvValue(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function csvRow(values: readonly string[]): string {
  return values.map((value) => escapeCsvValue(value)).join(',')
}

export function createBlocksCsv(
  blocks: Block[],
  labels: Label[],
  anchor: number,
  now: number,
): string {
  const sortedBlocks = [...blocks].sort((a, b) => a.start - b.start)
  const rows = [csvRow(BLOCKS_CSV_COLUMNS)]

  for (const block of sortedBlocks) {
    const label = labels.find((candidate) => candidate.id === block.labelId)
    const dayStart = anchor + Math.floor((block.start - anchor) / DAY_MS) * DAY_MS
    const dayLabel = formatDayLabel(dayStart + DAY_MS / 2)
    const end = block.end === null ? '' : String(block.end)
    const duration = getBlockDuration(block, now)

    rows.push(
      csvRow([
        dayLabel,
        label?.name ?? block.labelId,
        String(block.start),
        end,
        String(duration),
      ]),
    )
  }

  return rows.join('\n')
}

export function saveJsonExport(runtime: Runtime, state: PersistedState): void {
  runtime.exportSink.save(
    EXPORT_JSON_FILENAME,
    EXPORT_JSON_MIME_TYPE,
    encodePersistedStateJson(state),
  )
}

export function saveBlocksExport(
  runtime: Runtime,
  blocks: Block[],
  labels: Label[],
  anchor: number,
  now: number,
): void {
  runtime.exportSink.save(
    EXPORT_CSV_FILENAME,
    EXPORT_CSV_MIME_TYPE,
    createBlocksCsv(blocks, labels, anchor, now),
  )
}
