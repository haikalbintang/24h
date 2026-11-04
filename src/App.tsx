import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { DAY_MS, getDaySnapshot } from "./day";
import { getLabelNameError, isUnaccountedLabelId } from "./labels";
import type { LabelColourId, LabelId } from "./labels";
import { THEME_DARK, THEME_LIGHT } from "./theme";
import {
  loadPersistedState,
  savePersistedState,
  STATE_SCHEMA_VERSION,
  type PersistedState,
} from "./persistence";
import LabelsSection from "./LabelsSection";
import { saveBlocksExport, saveJsonExport } from "./export";
import TotalsSection from "./TotalsSection";
import ReopenPrompt from "./ReopenPrompt";
import { useBlocks, UNDO_WINDOW_MS } from "./useBlocks";
import type { Runtime } from "./runtime";

export interface AppProps {
  runtime: Runtime;
}

const exportButtonClass =
  "rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600";

const themeToggleButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600";

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9.75 9.75 0 1 1-9-9Z" />
    </svg>
  );
}

export default function App({ runtime }: AppProps) {
  const [persisted, setPersisted] = useState<PersistedState>(() =>
    loadPersistedState(runtime, runtime.clock.now())
  );

  const anchor = persisted.anchor;
  const now = useSyncExternalStore(
    runtime.clock.subscribe,
    runtime.clock.now,
    runtime.clock.now
  );
  const day = getDaySnapshot(anchor, now);

  // null follows today, so rollover advances the view; a chosen past Day stays.
  const [undoError, setUndoError] = useState<string | null>(null);
  const [archivedUndo, setArchivedUndo] = useState<{
    labelId: LabelId;
    expiresAt: number;
    wasActive: boolean;
  } | null>(null);
  const [pickedDayIndex, setPickedDayIndex] = useState<number | null>(null);
  const selectedDay = getDaySnapshot(
    anchor,
    anchor + (pickedDayIndex ?? day.dayIndex) * DAY_MS
  );
  const dayOptions = Array.from({ length: day.dayIndex + 1 }, (_, index) =>
    getDaySnapshot(anchor, anchor + index * DAY_MS)
  );

  const nextLabelId = useRef(
    Math.max(
      0,
      ...persisted.labels.map(
        (label) => Number(label.id.slice("label-".length)) || 0
      )
    ) + 1
  );

  const {
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
    splitBlock,
  } = useBlocks(anchor, now, runtime.clock.now, {
    blocks: persisted.blocks,
    labels: persisted.labels,
    activeLabelId: persisted.activeLabelId,
    lastSeen: persisted.lastSeen,
  });

  const archiveUndoVisible =
    archivedUndo !== null && now < archivedUndo.expiresAt;

  const saveState = useCallback(
    (lastSeenValue: number | null) => {
      savePersistedState(runtime, {
        schemaVersion: STATE_SCHEMA_VERSION,
        anchor: persisted.anchor,
        labels: persisted.labels,
        blocks,
        activeLabelId,
        lastSeen: lastSeenValue,
        theme: persisted.theme,
      });
    },
    [runtime, persisted, blocks, activeLabelId]
  );

  useEffect(() => {
    saveState(lastSeen);
  }, [saveState, lastSeen]);

  // Visibility changes and page hides freeze the interval, so persist the
  // heartbeat synchronously rather than waiting for the save effect.
  useEffect(() => {
    return runtime.clock.subscribeHeartbeat(() => {
      const heartbeatAt = recordHeartbeat();

      if (heartbeatAt !== null) {
        saveState(heartbeatAt);
      }
    });
  }, [runtime, recordHeartbeat, saveState]);

  const createLabel = (
    name: string,
    colourId: LabelColourId
  ): string | null => {
    const error = getLabelNameError(name, persisted.labels);

    if (error) {
      return error;
    }

    setPersisted((current) => ({
      ...current,
      labels: [
        ...current.labels,
        {
          id: `label-${nextLabelId.current++}`,
          name,
          colourId,
          archived: false,
        },
      ],
    }));

    return null;
  };

  const renameLabel = (
    labelId: LabelId,
    name: string,
    colourId: LabelColourId
  ): string | null => {
    if (isUnaccountedLabelId(labelId)) {
      return "The Unaccounted label cannot be changed.";
    }

    const error = getLabelNameError(name, persisted.labels, labelId);

    if (error) {
      return error;
    }

    setPersisted((current) => ({
      ...current,
      labels: current.labels.map((label) =>
        label.id === labelId ? { ...label, name, colourId } : label
      ),
    }));

    return null;
  };

  const archiveLabel = (labelId: LabelId) => {
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
      labels: current.labels.map((label) =>
        label.id === labelId ? { ...label, archived: true } : label,
      ),
    }));
  };

  const restoreLabel = (labelId: LabelId) => {
    if (isUnaccountedLabelId(labelId)) {
      return;
    }

    setArchivedUndo(null);
    setPersisted((current) => ({
      ...current,
      labels: current.labels.map((label) =>
        label.id === labelId ? { ...label, archived: false } : label,
      ),
    }));
  };

  const undoArchive = (): string | null => {
    if (archivedUndo === null) {
      return "Nothing to undo.";
    }

    const { labelId, expiresAt, wasActive } = archivedUndo;

    if (now >= expiresAt) {
      setArchivedUndo(null);
      return "Nothing to undo.";
    }

    setArchivedUndo(null);
    setPersisted((current) => ({
      ...current,
      labels: current.labels.map((label) =>
        label.id === labelId ? { ...label, archived: false } : label,
      ),
    }));

    // Undo restores the label and, if it was active, reactivates it.
    if (wasActive) {
      selectLabel(labelId);
    }

    return null;
  };

  const exportJson = () => {
    saveJsonExport(runtime, persisted);
  };

  const exportCsv = () => {
    saveBlocksExport(
      runtime,
      persisted.blocks,
      persisted.labels,
      anchor,
      now,
    );
  };

  const toggleTheme = () => {
    setPersisted((current) => ({
      ...current,
      theme: current.theme === THEME_DARK ? THEME_LIGHT : THEME_DARK,
    }));
  };

  return (
    <main
      className="min-h-screen bg-neutral-950 text-neutral-100"
      data-theme={persisted.theme}
    >
      <div
        className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-10"
        inert={reopenPromptOpen}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-5">
          <h1 className="text-xs font-semibold tracking-[0.28em] text-neutral-500 uppercase">
            Day Labels
          </h1>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              aria-pressed={persisted.theme === THEME_LIGHT}
              className={themeToggleButtonClass}
            >
              {persisted.theme === THEME_DARK ? <SunIcon /> : <MoonIcon />}
            </button>
            <select
              aria-label="Day"
              value={selectedDay.dayIndex}
              onChange={(event) => {
                const index = Number(event.target.value);
                setPickedDayIndex(index === day.dayIndex ? null : index);
              }}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
            >
              {dayOptions.map((option) => (
                <option key={option.dayIndex} value={option.dayIndex}>
                  {option.dayLabel}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={exportJson}
              className={exportButtonClass}
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className={exportButtonClass}
            >
              Export CSV
            </button>
          </div>
          <p className="w-full text-xs text-neutral-500">
            No import is available; an exported file cannot be restored here.
          </p>
          <p className="w-full text-xs text-neutral-500">
            Clearing site data is permanent and cannot be undone; keep an export
            as a backup.
          </p>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-16">
          <p className="text-xs font-medium tracking-[0.32em] text-neutral-500 uppercase">
            Day clock
          </p>
          <p
            role="timer"
            aria-live="off"
            aria-label="Day clock"
            className="mt-5 font-mono text-[clamp(3.5rem,16vw,10rem)] leading-none font-semibold tracking-tight text-neutral-50 tabular-nums"
          >
            {day.clock}
          </p>
        </section>

        <LabelsSection
          now={now}
          dayStart={selectedDay.dayStart}
          dayEnd={selectedDay.dayEnd}
          labels={persisted.labels}
          activeLabelId={activeLabelId}
          dynamicBlocks={dynamicBlocks}
          shortcutsEnabled={!reopenPromptOpen}
          onRelabelBlock={relabelBlock}
          onSplitBlock={splitBlock}
          onSelectLabel={selectLabel}
          onToggleLabel={toggleLabel}
          onCreateLabel={createLabel}
          onRenameLabel={renameLabel}
          onArchiveLabel={archiveLabel}
          onRestoreLabel={restoreLabel}
        />
        <TotalsSection
          labels={persisted.labels}
          activeLabelId={activeLabelId}
          blocks={blocks}
          anchor={anchor}
          now={now}
          dayStart={selectedDay.dayStart}
          dayEnd={selectedDay.dayEnd}
        />
      </div>

      {archiveUndoVisible || undoError ? (
        <div
          role="status"
          aria-label="Undo"
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm"
        >
          {archiveUndoVisible ? (
            <>
              <span>Label archived.</span>
              <button
                type="button"
                onClick={() => setUndoError(undoArchive())}
                className="font-semibold text-neutral-100 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
              >
                Undo
              </button>
            </>
          ) : (
            <span>{undoError}</span>
          )}
        </div>
      ) : null}

      {reopenPromptOpen ? (
        <ReopenPrompt
          labelName={
            persisted.labels.find((label) => label.id === activeLabelId)
              ?.name ?? null
          }
          onEnd={endBlockAtLastSeen}
          onKeep={keepLabelThroughGap}
          onDismiss={dismissReopenPrompt}
        />
      ) : null}
    </main>
  );
}
