import { DAY_MS } from "./day";
import type { LabelId } from "./labels";

export type BlockId = string;

export interface Block {
  id: BlockId;
  labelId: LabelId;
  start: number;
  end: number | null;
  updatedAt?: number;
}

export function createLiveBlock(
  id: BlockId,
  labelId: LabelId,
  start: number,
  updatedAt: number = start,
): Block {
  return { id, labelId, start, end: null, updatedAt };
}

export function getNextBlockId(blocks: Block[]): BlockId {
  const highest = Math.max(
    0,
    ...blocks.map(
      (block) =>
        Number(block.id.slice("block-".length).split("-")[0]) || 0,
    ),
  )

  return `block-${highest + 1}`;
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

    result[index] = { ...result[index], end: dayEnd, updatedAt: dayEnd };
    result.push({
      id: `${result[index].id}-${dayEnd}`,
      labelId,
      start: dayEnd,
      end: null,
      updatedAt: dayEnd,
    });
    index = result.length - 1;
  }

  return didSplit ? result : blocks;
}

export function closeActiveBlock(
  blocks: Block[],
  atTime: number,
  updatedAt?: number,
): Block[] {
  return blocks.map((block) =>
    block.end === null
      ? {
        ...block,
        end: Math.max(block.start, atTime),
        ...(updatedAt !== undefined
          ? { updatedAt }
          : block.updatedAt !== undefined
            ? { updatedAt: atTime }
            : {}),
      }
      : block,
  );
}

export function relabelBlock(
  blocks: Block[],
  id: BlockId,
  labelId: LabelId,
  updatedAt?: number,
): Block[] {
  return blocks.map((block) =>
    block.id === id
      ? { ...block, labelId, ...(updatedAt !== undefined ? { updatedAt } : {}) }
      : block,
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
  updatedAt?: number,
): Block[] {
  return blocks.flatMap((block) =>
    block.id === id
      ? [
        {
          ...block,
          end: at,
          ...(updatedAt !== undefined
            ? { updatedAt }
            : block.updatedAt !== undefined
              ? { updatedAt }
              : {}),
        },
        {
          ...block,
          id: newId,
          start: at,
          ...(updatedAt !== undefined
            ? { updatedAt }
            : block.updatedAt !== undefined
              ? { updatedAt }
              : {}),
        },
      ]
      : [block],
  );
}

export function fuseWithNeighbours(
  blocks: Block[],
  id: BlockId,
  anchor: number,
  updatedAt?: number,
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
      end: next.end,
      ...(updatedAt !== undefined
        ? { updatedAt }
        : cur.updatedAt !== undefined
          ? { updatedAt: Math.max(cur.updatedAt, next.updatedAt ?? 0) }
          : {}),
    });
  }

  // Fuse with the previous block
  const prev = sorted[i - 1];
  const current = sorted[i];

  if (prev && canJoin(prev, current)) {
    sorted.splice(i - 1, 2, {
      ...prev,
      id: current.end === null ? current.id : prev.id,
      end: current.end,
      ...(updatedAt !== undefined
        ? { updatedAt }
        : prev.updatedAt !== undefined
          ? { updatedAt: Math.max(prev.updatedAt, current.updatedAt ?? 0) }
          : {}),
    });
  }

  return sorted;
}

