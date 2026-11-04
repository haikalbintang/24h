import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeActiveBlock,
  createLiveBlock,
  fuseWithNeighbours,
  getBlockSplitError,
  relabelBlock as applyRelabel,
  splitAtDayBoundaries,
  splitBlock,
} from "./blocks";
import type { Block, BlockId } from "./blocks";
import { HEARTBEAT_INTERVAL_MS, isReopenGap } from "./heartbeat";
import { UNACCOUNTED_LABEL_ID } from "./labels";
import type { Label, LabelId } from "./labels";

export interface UseBlocksInitialState {
  blocks: Block[];
  labels: Label[];
  activeLabelId: LabelId | null;
  lastSeen: number | null;
}

export const UNDO_WINDOW_MS = 5000;

export interface UseBlocksResult {
  blocks: Block[];
  dynamicBlocks: Block[];
  activeLabelId: LabelId | null;
  lastSeen: number | null;
  reopenPromptOpen: boolean;
  selectLabel: (labelId: LabelId | null) => void;
  toggleLabel: (labelId: LabelId) => void;
  recordHeartbeat: () => number | null;
  endBlockAtLastSeen: () => void;
  keepLabelThroughGap: () => void;
  dismissReopenPrompt: () => void;
  relabelBlock: (id: BlockId, labelId: LabelId) => string | null;
  splitBlock: (id: BlockId, at: number) => string | null;
  deleteBlocksByLabel: (labelId: LabelId) => void;
  adoptExternalState: (state: {
    blocks?: Block[];
    activeLabelId?: LabelId | null;
    lastSeen?: number | null;
  }) => void;
}

export function useBlocks(
  anchor: number,
  now: number,
  getNow: () => number,
  initialState: UseBlocksInitialState,
): UseBlocksResult {
  const [blocks, setBlocks] = useState<Block[]>(initialState.blocks);
  const [activeLabelId, setActiveLabelId] = useState<LabelId | null>(
    initialState.activeLabelId ?? UNACCOUNTED_LABEL_ID,
  );
  const [lastSeen, setLastSeen] = useState<number | null>(
    initialState.lastSeen,
  );
  const [reopenDismissed, setReopenDismissed] = useState(false);
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

  const hasOpenBlock = blocks.some((block) => block.end === null);
  const reopenPromptOpen =
    hasOpenBlock && lastSeen !== null && !reopenDismissed && isReopenGap(lastSeen, now);

  useEffect(() => {
    if (!hasOpenBlock || lastSeen === null) {
      return;
    }

    if (isReopenGap(lastSeen, now)) {
      // The gap is long enough that the user must decide how to account for
      // it; the reopen prompt takes over and defers the heartbeat.
      return;
    }

    if (now - lastSeen >= HEARTBEAT_INTERVAL_MS) {
      // The clock is the external system; recording the heartbeat is how this
      // effect synchronizes with it.
      // oxlint-disable-next-line react/set-state-in-effect
      setLastSeen(now);
    }
  }, [hasOpenBlock, lastSeen, now]);

  const selectLabel = useCallback(
    (labelId: LabelId | null) => {
      const targetLabelId = labelId ?? UNACCOUNTED_LABEL_ID;

      if (targetLabelId === activeLabelId) {
        return;
      }

      const at = getNow();

      setBlocks((current) => {
        let next = splitAtDayBoundaries(current, anchor, at);
        const openIndex = next.findIndex((block) => block.end === null);

        if (openIndex !== -1 && next[openIndex].start === at) {
          // A switch in the same second would only add a zero-length Block,
          // so relabel the Block that just started instead.
          return next.map((block, index) =>
            index === openIndex
              ? { ...block, labelId: targetLabelId, updatedAt: at }
              : block,
          );
        }

        if (openIndex !== -1) {
          next = closeActiveBlock(next, at, at);
        }

        next = [
          ...next,
          createLiveBlock(createBlockId(), targetLabelId, at, at),
        ];

        return next;
      });
      setActiveLabelId(targetLabelId);
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

  const recordHeartbeat = useCallback(() => {
    if (!hasOpenBlock || lastSeen === null) {
      return null;
    }

    const at = getNow();

    if (isReopenGap(lastSeen, at)) {
      return null;
    }

    setLastSeen(at);
    return at;
  }, [getNow, hasOpenBlock, lastSeen]);

  const endBlockAtLastSeen = useCallback(() => {
    const at = getNow();
    const endedAt = lastSeen ?? at;

    setBlocks((current) => {
      const closed = closeActiveBlock(
        // Split just before the end so a Block ending exactly on a Day
        // boundary does not leave a zero-length tail.
        splitAtDayBoundaries(current, anchor, endedAt - 1),
        endedAt,
        at,
      );
      const next = splitAtDayBoundaries(closed, anchor, at);

      return [
        ...next,
        createLiveBlock(createBlockId(), UNACCOUNTED_LABEL_ID, at, at),
      ];
    });
    setActiveLabelId(UNACCOUNTED_LABEL_ID);
    setLastSeen(at);
    setReopenDismissed(false);
  }, [anchor, createBlockId, getNow, lastSeen]);

  const keepLabelThroughGap = useCallback(() => {
    const at = getNow();

    setBlocks((current) => splitAtDayBoundaries(current, anchor, at));
    setLastSeen(at);
    setReopenDismissed(false);
  }, [anchor, getNow]);

  const dismissReopenPrompt = useCallback(() => {
    setReopenDismissed(true);
  }, []);

  const relabelBlock = useCallback(
    (id: BlockId, labelId: LabelId) => {
      const at = getNow();
      const current = splitAtDayBoundaries(blocks, anchor, at);
      const target = current.find((block) => block.id === id);

      if (!target) {
        return "That Block no longer exists.";
      }

      setBlocks(
        fuseWithNeighbours(
          applyRelabel(current, id, labelId, at),
          id,
          anchor,
          at,
        ),
      );

      // The active Block keeps running under its new Label.
      if (target.end === null) {
        setActiveLabelId(labelId);
      }

      return null;
    },
    [anchor, blocks, getNow],
  );

  const deleteBlocksByLabel = useCallback(
    (labelId: LabelId) => {
      setBlocks((current) =>
        current.filter((block) => block.labelId !== labelId),
      );
      if (activeLabelId === labelId) {
        setActiveLabelId(UNACCOUNTED_LABEL_ID);
      }
    },
    [activeLabelId],
  );

  const splitBlockAt = useCallback(
    (id: BlockId, splitTime: number) => {
      const at = getNow();
      const current = splitAtDayBoundaries(blocks, anchor, at);
      const error = getBlockSplitError(current, id, splitTime, at);

      if (error) {
        return error;
      }

      setBlocks(splitBlock(current, id, splitTime, createBlockId(), at));

      return null;
    },
    [anchor, blocks, createBlockId, getNow],
  );

  const adoptExternalState = useCallback(
    (state: {
      blocks?: Block[];
      activeLabelId?: LabelId | null;
      lastSeen?: number | null;
    }) => {
      if (state.blocks !== undefined) {
        setBlocks(state.blocks);
        nextBlockId.current =
          Math.max(
            nextBlockId.current,
            ...state.blocks.map(
              (block) =>
                Number(block.id.slice("block-".length).split("-")[0]) || 0,
            ),
          ) + 1;
      }
      if (state.activeLabelId !== undefined) {
        setActiveLabelId(state.activeLabelId ?? UNACCOUNTED_LABEL_ID);
      }
      if (state.lastSeen !== undefined) {
        setLastSeen(state.lastSeen);
      }
    },
    [],
  );

  return {
    blocks,
    dynamicBlocks,
    activeLabelId,
    lastSeen,
    reopenPromptOpen,
    selectLabel,
    toggleLabel,
    recordHeartbeat,
    endBlockAtLastSeen,
    keepLabelThroughGap,
    dismissReopenPrompt,
    relabelBlock,
    splitBlock: splitBlockAt,
    deleteBlocksByLabel,
    adoptExternalState,
  };
}
