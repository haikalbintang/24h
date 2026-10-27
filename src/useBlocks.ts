import { useCallback, useRef, useState } from "react";
import { closeActiveBlock, splitAtDayBoundaries } from "./blocks";
import type { Block } from "./blocks";
import type { LabelId } from "./labels";

export interface UseBlocksInitialState {
  blocks: Block[];
  activeLabelId: LabelId | null;
  lastSeen: number | null;
}

export function useBlocks(
  anchor: number,
  now: number,
  getNow: () => number,
  initialState: UseBlocksInitialState,
) {
  const [blocks, setBlocks] = useState<Block[]>(initialState.blocks);
  const [activeLabelId, setActiveLabelId] = useState<LabelId | null>(
    initialState.activeLabelId,
  );
  const [lastSeen, setLastSeen] = useState<number | null>(initialState.lastSeen);
  const nextBlockId = useRef(
    Math.max(
      0,
      ...initialState.blocks.map(
        (block) => Number(block.id.slice("block-".length).split("-")[0]) || 0,
      ),
    ) + 1,
  );

  const createBlockId = useCallback(() => `block-${nextBlockId.current++}`, []);

  const dynamicBlocks = splitAtDayBoundaries(blocks, anchor, now);

  const selectLabel = useCallback(
    (labelId: LabelId | null) => {
      if (labelId !== null && labelId === activeLabelId) {
        return;
      }

      const at = getNow();

      setBlocks((current) => {
        let next = splitAtDayBoundaries(current, anchor, at);

        if (next.some((block) => block.end === null)) {
          next = closeActiveBlock(next, at);
        }

        if (labelId !== null) {
          next = [
            ...next,
            {
              id: createBlockId(),
              labelId,
              start: at,
              end: null,
            },
          ];
        }

        return next;
      });
      setActiveLabelId(labelId);
      setLastSeen(at);
    },
    [activeLabelId, anchor, createBlockId, getNow],
  );

  const toggleLabel = useCallback(
    (labelId: LabelId) => {
      selectLabel(activeLabelId === labelId ? null : labelId);
    },
    [activeLabelId, selectLabel],
  );

  const hasOpenBlock = blocks.some((block) => block.end === null);
  const lastSeenAt = hasOpenBlock ? now : lastSeen;

  return {
    blocks,
    dynamicBlocks,
    activeLabelId,
    lastSeen: lastSeenAt,
    selectLabel,
    toggleLabel,
  };
}
