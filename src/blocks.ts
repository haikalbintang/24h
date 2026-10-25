import { DAY_MS } from './day'
import type { LabelId } from './labels'

export type BlockId = string

export interface Block {
  id: BlockId
  labelId: LabelId
  start: number
  end: number | null
}

export function getBlockDuration(block: Block, now: number): number {
  return Math.max(0, (block.end ?? now) - block.start)
}

export function splitAtDayBoundaries(
  blocks: Block[],
  anchor: number,
  now: number,
): Block[] {
  const activeIndex = blocks.findIndex((block) => block.end === null)

  if (activeIndex === -1) {
    return blocks
  }

  let result = blocks
  let index = activeIndex
  let didSplit = false

  while (true) {
    const dayEnd =
      anchor +
      (Math.floor((result[index].start - anchor) / DAY_MS) + 1) * DAY_MS

    if (now < dayEnd) {
      break
    }

    if (!didSplit) {
      result = blocks.map((block) => ({ ...block }))
      didSplit = true
    }

    const labelId = result[index].labelId

    result[index] = { ...result[index], end: dayEnd }
    result.push({
      id: `${result[index].id}-${dayEnd}`,
      labelId,
      start: dayEnd,
      end: null,
    })
    index = result.length - 1
  }

  return didSplit ? result : blocks
}

export function closeActiveBlock(blocks: Block[], atTime: number): Block[] {
  return blocks.map((block) =>
    block.end === null ? { ...block, end: Math.max(block.start, atTime) } : block,
  )
}
