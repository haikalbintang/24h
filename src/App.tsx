import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { DAY_MS, getDaySnapshot } from "./day";
import { getLabelNameError } from "./labels";
import type { LabelColourId, LabelId } from "./labels";
import {
  loadPersistedState,
  savePersistedState,
  STATE_SCHEMA_VERSION,
  type PersistedState,
} from "./persistence";
import LabelsSection from "./LabelsSection";
import TotalsSection from "./TotalsSection";
import ReopenPrompt from "./ReopenPrompt";
import { useBlocks } from "./useBlocks";
import type { Runtime } from "./runtime";

export interface AppProps {
  runtime: Runtime;
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
    editBlock,
    addManualBlock,
    splitBlock,
    deleteBlock,
    deletedBlock,
    undoDelete,
  } = useBlocks(anchor, now, runtime.clock.now, {
    blocks: persisted.blocks,
    activeLabelId: persisted.activeLabelId,
    lastSeen: persisted.lastSeen,
  });

  const undoVisible = deletedBlock !== null && now < deletedBlock.expiresAt;

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
        { id: `label-${nextLabelId.current++}`, name, colourId },
      ],
    }));

    return null;
  };

  const renameLabel = (
    labelId: LabelId,
    name: string,
    colourId: LabelColourId
  ): string | null => {
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

  return (
    <main
      className="min-h-screen bg-neutral-950 text-neutral-100"
      data-theme={persisted.theme}
    >
      <div
        className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-10"
        inert={reopenPromptOpen}
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-800 pb-5">
          <h1 className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase">
            Day Labels
          </h1>
          <select
            aria-label="Day"
            value={selectedDay.dayIndex}
            onChange={(event) => {
              const index = Number(event.target.value);
              setPickedDayIndex(index === day.dayIndex ? null : index);
            }}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-300"
          >
            {dayOptions.map((option) => (
              <option key={option.dayIndex} value={option.dayIndex}>
                {option.dayLabel}
              </option>
            ))}
          </select>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-16">
          <p className="text-xs font-medium tracking-[0.32em] text-neutral-500 uppercase">
            Day clock
          </p>
          <p
            role="timer"
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
          onEditBlock={(id, edit) =>
            editBlock(
              id,
              { start: edit.start, labelId: edit.labelId },
              edit.end,
              { dayStart: selectedDay.dayStart, dayEnd: selectedDay.dayEnd }
            )
          }
          onAddManualBlock={(edit) =>
            addManualBlock(edit, {
              dayStart: selectedDay.dayStart,
              dayEnd: selectedDay.dayEnd,
            })
          }
          onSplitBlock={splitBlock}
          onDeleteBlock={(id) => {
            setUndoError(null);
            deleteBlock(id);
          }}
          onSelectLabel={selectLabel}
          onToggleLabel={toggleLabel}
          onCreateLabel={createLabel}
          onRenameLabel={renameLabel}
        />
        <TotalsSection
          labels={persisted.labels}
          blocks={blocks}
          anchor={anchor}
          now={now}
          dayStart={selectedDay.dayStart}
          dayEnd={selectedDay.dayEnd}
        />
      </div>

      {undoVisible || undoError ? (
        <div
          role="status"
          aria-label="Undo"
          className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm"
        >
          {undoVisible ? (
            <>
              <span>Block deleted.</span>
              <button
                type="button"
                onClick={() => setUndoError(undoDelete())}
                className="font-semibold text-neutral-100 underline"
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
        />
      ) : null}
    </main>
  );
}

