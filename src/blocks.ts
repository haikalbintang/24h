import { DAY_MS } from "./day";
import type { Label, LabelId } from "./labels";

export type BlockId = string;

export type BlockSource = "live" | "manual";

export interface Block {
  id: BlockId;
  labelId: LabelId;
  start: number;
  end: number | null;
  source: BlockSource;
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
      source: result[index].source,
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
  id: BlockId | null,
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

  // if (overlapsAnother(blocks, id, edit.start, effectiveEnd, now)) {
  //   return "A Block cannot overlap another Block.";
  // }

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

export function getManualBlockError(
  blocks: Block[],
  edit: BlockEdit & { end: number },
  bounds: EditBounds,
  labels: Label[],
): string | null {
  if (!labels.some((label) => label.id === edit.labelId)) {
    return "A Manual Block must use an active label.";
  }

  return getBlockEditError(blocks, null, edit, bounds);
}

export function createManualBlock(
  blocks: Block[],
  id: BlockId,
  edit: BlockEdit & { end: number },
): Block[] {
  return [...blocks, { id, ...edit, source: "manual" }];
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

export function fuseWithNeighbours(
  blocks: Block[],
  id: BlockId,
  anchor: number,
): Block[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const i = sorted.findIndex((block) => block.id === id);

  if (i === -1) {
    return blocks;
  }

  const dayOf = (block: Block) => Math.floor((block.start - anchor) / DAY_MS);

  const FUSE_TOLERANCE_MS = 1000;

  const canJoin = (a: Block, b: Block) =>
    a.end !== null &&
    Math.abs(b.start - a.end) < FUSE_TOLERANCE_MS &&
    a.labelId === b.labelId &&
    dayOf(a) === dayOf(b);

  // Fuse with the next block
  const cur = sorted[i];
  const next = sorted[i + 1];

  if (next && canJoin(cur, next)) {
    sorted.splice(i, 2, {
      ...cur,
      id: next.end === null ? next.id : cur.id,
      source: next.end === null ? next.source : cur.source,
      end: next.end,
    });
  }

  // Fuse with the previous block
  const prev = sorted[i - 1];
  const current = sorted[i];

  if (prev && canJoin(prev, current)) {
    sorted.splice(i - 1, 2, {
      ...prev,
      id: current.end === null ? current.id : prev.id,
      source: current.end === null ? current.source : prev.source,
      end: current.end,
    });
  }

  return sorted;
}

