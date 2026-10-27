import { DAY_MS } from './day'
import type { Block } from './blocks'
import type { LabelId } from './labels'

export interface LabelTotal {
  labelId: LabelId
  ms: number
}

export function dayBounds(anchor: number, dayIndex: number) {
  const dayStart = anchor + dayIndex * DAY_MS
  return { dayStart, dayEnd: dayStart + DAY_MS }
}

export function blocksInDay(blocks: Block[], dayStart: number, dayEnd: number): Block[] {
  return blocks.filter((b) => b.start < dayEnd && (b.end ?? Infinity) > dayStart)
}

export function clipToDay(block: Block, dayStart: number, dayEnd: number, now: number): number {
  const end = block.end ?? now
  const s = Math.max(block.start, dayStart)
  const e = Math.min(end, dayEnd, now)
  return Math.max(0, e - s)
}

export function labelTotalsForDay(
  blocks: Block[],
  _anchor: number,
  dayStart: number,
  dayEnd: number,
  now: number,
): Map<LabelId, number> {
  const totals = new Map<LabelId, number>()
  for (const block of blocksInDay(blocks, dayStart, dayEnd)) {
    const ms = clipToDay(block, dayStart, dayEnd, now)
    totals.set(block.labelId, (totals.get(block.labelId) ?? 0) + ms)
  }
  return totals
}

export function accountedMsForDay(
  blocks: Block[],
  dayStart: number,
  dayEnd: number,
  now: number,
): number {
  let total = 0
  for (const block of blocksInDay(blocks, dayStart, dayEnd)) {
    total += clipToDay(block, dayStart, dayEnd, now)
  }
  return total
}

export function unaccountedMsForDay(
  blocks: Block[],
  dayStart: number,
  dayEnd: number,
  now: number,
): number {
  const elapsed = Math.min(now, dayEnd) - dayStart
  const available = Math.max(0, elapsed)
  return Math.max(0, available - accountedMsForDay(blocks, dayStart, dayEnd, now))
}

export function sevenDayTotals(
  blocks: Block[],
  anchor: number,
  selectedDayIndex: number,
  now: number,
): { dayIndex: number; dayStart: number; dayEnd: number; totals: Map<LabelId, number>; unaccounted: number }[] {
  const result: { dayIndex: number; dayStart: number; dayEnd: number; totals: Map<LabelId, number>; unaccounted: number }[] = []
  for (let i = 0; i < 7; i++) {
    const dayIndex = selectedDayIndex - (6 - i)
    const { dayStart, dayEnd } = dayBounds(anchor, dayIndex)
    const totals = labelTotalsForDay(blocks, anchor, dayStart, dayEnd, now)
    const unaccounted = unaccountedMsForDay(blocks, dayStart, dayEnd, now)
    result.push({ dayIndex, dayStart, dayEnd, totals, unaccounted })
  }
  return result
}

export interface TimelineSegment {
  labelId: LabelId | null
  start: number
  end: number
}

export function timelineSegmentsForDay(
  blocks: Block[],
  dayStart: number,
  dayEnd: number,
  now: number,
): TimelineSegment[] {
  const clipped = blocksInDay(blocks, dayStart, dayEnd)
    .map((b) => ({
      labelId: b.labelId,
      start: Math.max(b.start, dayStart),
      end: Math.min(b.end ?? now, dayEnd, now),
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start)
  return clipped
}