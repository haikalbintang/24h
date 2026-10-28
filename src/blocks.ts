import { DAY_MS } from "./day";
import type { LabelId } from "./labels";

export type BlockId = string;

export interface Block {
  id: BlockId;
  labelId: LabelId;
  start: number;
  end: number | null;
}

export function getBlockDuration(block: Block, now: number): number {
  return Math.max(0, (block.end ?? now) - block.start);
}

export function splitAtDayBoundaries(
  blocks: Block[],
  anchor: number,
  now: number,
): Block[] {
  const activeIndex = blocks.findIndex((block) => block.end === null);

  if (activeIndex === -1) {
    return blocks;
  }

  let result = blocks;
  let index = activeIndex;
  let didSplit = false;

  while (true) {
    const dayEnd =
      anchor +
      (Math.floor((result[index].start - anchor) / DAY_MS) + 1) * DAY_MS;

    if (now < dayEnd) {
      break;
    }

    if (!didSplit) {
      result = blocks.map((block) => ({ ...block }));
      didSplit = true;
    }

    const labelId = result[index].labelId;

    result[index] = { ...result[index], end: dayEnd };
    result.push({
      id: `${result[index].id}-${dayEnd}`,
      labelId,
      start: dayEnd,
      end: null,
    });
    index = result.length - 1;
  }

  return didSplit ? result : blocks;
}

export function closeActiveBlock(blocks: Block[], atTime: number): Block[] {
  return blocks.map((block) =>
    block.end === null
      ? { ...block, end: Math.max(block.start, atTime) }
      : block,
  );
}

export interface BlockEdit {
  start: number;
  end: number | null;
  labelId: LabelId;
}

export interface EditBounds {
  dayStart: number;
  dayEnd: number;
  now: number;
}

function overlapsAnother(
  blocks: Block[],
  id: BlockId | null,
  start: number,
  end: number,
  now: number,
): boolean {
  return blocks.some(
    (other) =>
      other.id !== id && other.start < end && start < (other.end ?? now),
  );
}

export function getBlockEditError(
  blocks: Block[],
  id: BlockId,
  edit: BlockEdit,
  bounds: EditBounds,
): string | null {
  const { dayStart, dayEnd, now } = bounds;
  const effectiveEnd = edit.end ?? now;

  if (effectiveEnd <= edit.start) {
    return "The end must be after the start.";
  }

  if (edit.start > now || effectiveEnd > now) {
    return "A Block cannot be in the future.";
  }

  if (edit.start < dayStart || effectiveEnd > dayEnd) {
    return "A Block must stay within the selected Day.";
  }

  if (overlapsAnother(blocks, id, edit.start, effectiveEnd, now)) {
    return "A Block cannot overlap another Block.";
  }

  return null;
}

export function editBlock(
  blocks: Block[],
  id: BlockId,
  edit: BlockEdit,
): Block[] {
  return blocks.map((block) =>
    block.id === id ? { ...block, ...edit } : block,
  );
}

export function getBlockSplitError(
  blocks: Block[],
  id: BlockId,
  at: number,
  now: number,
): string | null {
  const target = blocks.find((block) => block.id === id);

  if (!target) {
    return "That Block no longer exists.";
  }

  if (at <= target.start || at >= (target.end ?? now)) {
    return "A split must fall strictly inside the Block.";
  }

  return null;
}

export function splitBlock(
  blocks: Block[],
  id: BlockId,
  at: number,
  newId: BlockId,
): Block[] {
  return blocks.flatMap((block) =>
    block.id === id
      ? [
          { ...block, end: at },
          { ...block, id: newId, start: at },
        ]
      : [block],
  );
}

export function getBlockRestoreError(
  blocks: Block[],
  block: Block,
  now: number,
): string | null {
  if (
    block.end !== null &&
    overlapsAnother(blocks, null, block.start, block.end, now)
  ) {
    return "Cannot undo: the space is now taken by another Block.";
  }

  return null;
}
