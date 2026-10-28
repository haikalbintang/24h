import { DAY_MS } from './day'
import type { Block } from './blocks'
import type { LabelId } from './labels'

export interface DayTotals {
  dayIndex: number
  dayStart: number
  dayEnd: number
  totals: Map<LabelId, number>
  unaccounted: number
}

export interface TimelineSegment {
  labelId: LabelId | null
  start: number
  end: number
}

export function dayBounds(anchor: number, dayIndex: number) {
  const dayStart = anchor + dayIndex * DAY_MS
  return { dayStart, dayEnd: dayStart + DAY_MS }
}

export function elapsedMsForDay(dayStart: number, dayEnd: number, now: number) {
  return Math.max(0, Math.min(now, dayEnd) - dayStart)
}

export function blocksInDay(
  blocks: Block[],
  dayStart: number,
  dayEnd: number,
): Block[] {
  return blocks.filter((block) => block.start < dayEnd && (block.end ?? Infinity) > dayStart)
}

export function clippedBlockMs(
  block: Block,
  dayStart: number,
  dayEnd: number,
  now: number,
): number {
  const end = Math.min(block.end ?? now, dayEnd, now)
  const start = Math.max(block.start, dayStart)
  return Math.max(0, end - start)
}

export function accountedMsForDay(
  blocks: Block[],
  dayStart: number,
  dayEnd: number,
  now: number,
): number {
  let total = 0
  for (const block of blocksInDay(blocks, dayStart, dayEnd)) {
    total += clippedBlockMs(block, dayStart, dayEnd, now)
  }
  return total
}

export function labelTotalsForDay(
  blocks: Block[],
  dayStart: number,
  dayEnd: number,
  now: number,
): Map<LabelId, number> {
  const totals = new Map<LabelId, number>()

  for (const block of blocksInDay(blocks, dayStart, dayEnd)) {
    const ms = clippedBlockMs(block, dayStart, dayEnd, now)
    totals.set(block.labelId, (totals.get(block.labelId) ?? 0) + ms)
  }

  return totals
}

export function unaccountedMsForDay(
  blocks: Block[],
  dayStart: number,
  dayEnd: number,
  now: number,
): number {
  const elapsed = elapsedMsForDay(dayStart, dayEnd, now)
  return Math.max(0, elapsed - accountedMsForDay(blocks, dayStart, dayEnd, now))
}

export function sevenDayTotals(
  blocks: Block[],
  anchor: number,
  selectedDayIndex: number,
  now: number,
): DayTotals[] {
  const result: DayTotals[] = []

  for (let offset = 6; offset >= 0; offset--) {
    const dayIndex = selectedDayIndex - offset
    const { dayStart, dayEnd } = dayBounds(anchor, dayIndex)

    result.push({
      dayIndex,
      dayStart,
      dayEnd,
      totals: labelTotalsForDay(blocks, dayStart, dayEnd, now),
      unaccounted: unaccountedMsForDay(blocks, dayStart, dayEnd, now),
    })
  }

  return result
}

export function timelineSegmentsForDay(
  blocks: Block[],
  dayStart: number,
  dayEnd: number,
  now: number,
): TimelineSegment[] {
  const segments = blocksInDay(blocks, dayStart, dayEnd)
    .map((block) => ({
      labelId: block.labelId,
      start: Math.max(block.start, dayStart),
      end: Math.min(block.end ?? now, dayEnd, now),
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((a, b) => a.start - b.start)

  return segments
}
