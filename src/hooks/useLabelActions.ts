import { useCallback, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getLabelNameError, isUnaccountedLabelId } from "@/domain/labels";
import type { Label, LabelColourId, LabelId } from "@/domain/labels";
import type { PersistedState } from "@/data/persistence";
import { UNDO_WINDOW_MS } from "./useBlocks";

interface ArchivedUndo {
  labelId: LabelId;
  expiresAt: number;
  wasActive: boolean;
}

export interface UseLabelActionsArgs {
  labels: Label[];
  activeLabelId: LabelId | null;
  now: number;
  clockNow: () => number;
  setPersisted: Dispatch<SetStateAction<PersistedState>>;
  selectLabel: (labelId: LabelId | null) => void;
}

export interface UseLabelActionsResult {
  createLabel: (name: string, colourId: LabelColourId) => string | null;
  renameLabel: (
    labelId: LabelId,
    name: string,
    colourId: LabelColourId
  ) => string | null;
  archiveLabel: (labelId: LabelId) => void;
  restoreLabel: (labelId: LabelId) => void;
  undoArchive: () => void;
  undoError: string | null;
  archiveUndoVisible: boolean;
  adoptMergedLabels: (labels: Label[]) => void;
}

export function useLabelActions({
  labels,
  activeLabelId,
  now,
  clockNow,
  setPersisted,
  selectLabel,
}: UseLabelActionsArgs): UseLabelActionsResult {
  const nextLabelId = useRef(
    Math.max(
      0,
      ...labels.map(
        (label) => Number(label.id.slice("label-".length)) || 0
      )
    ) + 1
  );
  const [undoError, setUndoError] = useState<string | null>(null);
  const [archivedUndo, setArchivedUndo] = useState<ArchivedUndo | null>(null);

  const archiveUndoVisible =
    archivedUndo !== null && now < archivedUndo.expiresAt;

  const createLabel = useCallback(
    (name: string, colourId: LabelColourId): string | null => {
      const error = getLabelNameError(name, labels);

      if (error) {
        return error;
      }

      setPersisted((current) => ({
        ...current,
        shared: {
          ...current.shared,
          labels: [
            ...current.shared.labels,
            {
              id: `label-${nextLabelId.current++}`,
              name,
              colourId,
              archived: false,
              updatedAt: clockNow(),
            },
          ],
        },
      }));

      return null;
    },
    [clockNow, labels, setPersisted]
  );

  const renameLabel = useCallback(
    (
      labelId: LabelId,
      name: string,
      colourId: LabelColourId
    ): string | null => {
      if (isUnaccountedLabelId(labelId)) {
        return "The Unaccounted label cannot be changed.";
      }

      const error = getLabelNameError(name, labels, labelId);

      if (error) {
        return error;
      }

      setPersisted((current) => ({
        ...current,
        shared: {
          ...current.shared,
          labels: current.shared.labels.map((label) =>
            label.id === labelId
              ? { ...label, name, colourId, updatedAt: clockNow() }
              : label
          ),
        },
      }));

      return null;
    },
    [clockNow, labels, setPersisted]
  );

  const archiveLabel = useCallback(
    (labelId: LabelId) => {
      if (isUnaccountedLabelId(labelId)) {
        return;
      }

      const wasActive = activeLabelId === labelId;

      setArchivedUndo({
        labelId,
        expiresAt: now + UNDO_WINDOW_MS,
        wasActive,
      });

      // Archiving the active label closes the current Block and returns to
      // Unaccounted; past Blocks keep their identity either way.
      if (wasActive) {
        selectLabel(null);
      }

      setPersisted((current) => ({
        ...current,
        shared: {
          ...current.shared,
          labels: current.shared.labels.map((label) =>
            label.id === labelId
              ? { ...label, archived: true, updatedAt: clockNow() }
              : label
          ),
        },
      }));
    },
    [activeLabelId, clockNow, now, selectLabel, setPersisted]
  );

  const restoreLabel = useCallback(
    (labelId: LabelId) => {
      if (isUnaccountedLabelId(labelId)) {
        return;
      }

      setArchivedUndo(null);
      setPersisted((current) => ({
        ...current,
        shared: {
          ...current.shared,
          labels: current.shared.labels.map((label) =>
            label.id === labelId
              ? { ...label, archived: false, updatedAt: clockNow() }
              : label
          ),
        },
      }));
    },
    [clockNow, setPersisted]
  );

  const undoArchive = useCallback(() => {
    if (archivedUndo === null) {
      setUndoError("Nothing to undo.");
      return;
    }

    const { labelId, expiresAt, wasActive } = archivedUndo;

    if (now >= expiresAt) {
      setArchivedUndo(null);
      setUndoError("Nothing to undo.");
      return;
    }

    setArchivedUndo(null);
    setPersisted((current) => ({
      ...current,
      shared: {
        ...current.shared,
        labels: current.shared.labels.map((label) =>
          label.id === labelId
            ? { ...label, archived: false, updatedAt: clockNow() }
            : label
        ),
      },
    }));

    // Undo restores the label and, if it was active, reactivates it.
    if (wasActive) {
      selectLabel(labelId);
    }

    setUndoError(null);
  }, [archivedUndo, clockNow, now, selectLabel, setPersisted]);

  const adoptMergedLabels = useCallback((mergedLabels: Label[]) => {
    nextLabelId.current =
      Math.max(
        nextLabelId.current,
        ...mergedLabels.map(
          (label) => Number(label.id.slice("label-".length)) || 0
        )
      ) + 1;
  }, []);

  return {
    createLabel,
    renameLabel,
    archiveLabel,
    restoreLabel,
    undoArchive,
    undoError,
    archiveUndoVisible,
    adoptMergedLabels,
  };
}
