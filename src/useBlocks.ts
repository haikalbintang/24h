import { useCallback, useEffect, useRef, useState } from "react";
import {
  closeActiveBlock,
  createLiveBlock,
  editBlock as applyBlockEdit,
  fuseWithNeighbours,
  getBlockEditError,
  getBlockRestoreError,
  getBlockSplitError,
  splitAtDayBoundaries,
  splitBlock,
} from "./blocks";
import type { Block, BlockEdit, BlockId, EditBounds } from "./blocks";
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

export interface DeletedBlock {
  block: Block;
  expiresAt: number;
}

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
  editBlock: (
    id: BlockId,
    edit: Omit<BlockEdit, "end">,
    end: number | null,
    bounds: Omit<EditBounds, "now">,
  ) => string | null;
  splitBlock: (id: BlockId, at: number) => string | null;
  deleteBlock: (id: BlockId) => void;
  deleteBlocksByLabel: (labelId: LabelId) => void;
  deletedBlock: DeletedBlock | null;
  undoDelete: () => string | null;
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
  const [deletedBlock, setDeletedBlock] = useState<DeletedBlock | null>(null);
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
            index === openIndex ? { ...block, labelId: targetLabelId } : block,
          );
        }

        if (openIndex !== -1) {
          next = closeActiveBlock(next, at);
        }

        next = [
          ...next,
          createLiveBlock(createBlockId(), targetLabelId, at),
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
      );
      const next = splitAtDayBoundaries(closed, anchor, at);

      return [
        ...next,
        createLiveBlock(createBlockId(), UNACCOUNTED_LABEL_ID, at),
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

  const editBlock = useCallback(
    (
      id: BlockId,
      edit: Omit<BlockEdit, "end">,
      end: number | null,
      bounds: Omit<EditBounds, "now">,
    ) => {
      const at = getNow();
      const current = splitAtDayBoundaries(blocks, anchor, at);
      const target = current.find((block) => block.id === id);

      if (!target) {
        return "That Block no longer exists.";
      }

      // The active Block has no end to edit; it keeps running.
      const fullEdit = {
        ...edit,
        end: target.end === null ? null : end,
      };
      const error = getBlockEditError(current, id, fullEdit, {
        ...bounds,
        now: at,
      });

      if (error) {
        return error;
      }

      setBlocks(
        fuseWithNeighbours(applyBlockEdit(current, id, fullEdit), id, anchor),
      );

      if (target.end === null) {
        setActiveLabelId(edit.labelId);
      }

      return null;
    },
    [anchor, blocks, getNow],
  );

  const deleteBlock = useCallback(
    (id: BlockId) => {
      const at = getNow();
      const current = splitAtDayBoundaries(blocks, anchor, at);
      const target = current.find((block) => block.id === id);

      // The active Block is still running, so it cannot be deleted.
      if (!target || target.end === null) {
        return;
      }

      setBlocks(current.filter((block) => block.id !== id));
      setDeletedBlock({ block: target, expiresAt: at + UNDO_WINDOW_MS });
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
      if (deletedBlock?.block.labelId === labelId) {
        setDeletedBlock(null);
      }
    },
    [activeLabelId, deletedBlock],
  );

  const splitBlockAt = useCallback(
    (id: BlockId, splitTime: number) => {
      const at = getNow();
      const current = splitAtDayBoundaries(blocks, anchor, at);
      const error = getBlockSplitError(current, id, splitTime, at);

      if (error) {
        return error;
      }

      setBlocks(splitBlock(current, id, splitTime, createBlockId()));

      return null;
    },
    [anchor, blocks, createBlockId, getNow],
  );

  const undoDelete = useCallback(() => {
    const at = getNow();

    if (!deletedBlock || at >= deletedBlock.expiresAt) {
      return "Nothing to undo.";
    }

    const current = splitAtDayBoundaries(blocks, anchor, at);
    const error = getBlockRestoreError(current, deletedBlock.block, at);

    if (error) {
      setDeletedBlock(null);
      return error;
    }

    setBlocks([...current, deletedBlock.block]);
    setDeletedBlock(null);

    return null;
  }, [anchor, blocks, deletedBlock, getNow]);

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
    editBlock,
    splitBlock: splitBlockAt,
    deleteBlock,
    deleteBlocksByLabel,
    deletedBlock,
    undoDelete,
  };
}
