import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { UNACCOUNTED_LABEL_ID } from "@/domain/labels";
import type { SharedState } from "@/data/persistence";
import FirstSignInPrompt from "@/components/FirstSignInPrompt";
import LabelsSection from "@/components/LabelsSection";
import BlocksSection from "@/components/BlocksSection";
import TotalsSection from "@/components/TotalsSection";
import AccountScreen from "@/components/AccountScreen";
import AppHeader from "@/components/AppHeader";
import DayClock from "@/components/DayClock";
import TourGuide from "@/components/TourGuide";
import UndoToast from "@/components/UndoToast";
import { useBlocks } from "@/hooks/useBlocks";
import { useSharedState } from "@/hooks/useSharedState";
import { useDayView } from "@/hooks/useDayView";
import { useLabelActions } from "@/hooks/useLabelActions";
import { useSession } from "@/hooks/useSession";
import { useExportActions } from "@/hooks/useExportActions";
import { useTheme } from "@/hooks/useTheme";
import { useSyncCoordinator } from "@/hooks/useSyncCoordinator";
import type { Runtime } from "@/data/runtime";

export interface AppProps {
  runtime: Runtime;
}

export default function App({ runtime }: AppProps) {
  const { persisted, setPersisted, saveDocument } = useSharedState(runtime);

  const anchor = persisted.shared.anchor;
  const now = useSyncExternalStore(
    runtime.clock.subscribe,
    runtime.clock.now,
    runtime.clock.now
  );
  const { day, selectedDay, dayOptions, selectDay, rebaseForAnchor } =
    useDayView(anchor, now);

  const [accountOpen, setAccountOpen] = useState(false);
  const [tourRunning, setTourRunning] = useState(
    () => !persisted.device.tourSeen
  );

  const {
    blocks,
    dynamicBlocks,
    activeLabelId,
    lastSeen,
    selectLabel,
    toggleLabel,
    recordHeartbeat,
    relabelBlock,
    splitBlock,
    adoptExternalState,
  } = useBlocks(anchor, now, runtime.clock.now, {
    blocks: persisted.shared.blocks,
    activeLabelId: persisted.shared.activeLabelId,
    lastSeen: persisted.shared.heartbeat,
  });

  const currentShared = useMemo<SharedState>(
    () => ({
      anchor: persisted.shared.anchor,
      labels: persisted.shared.labels,
      blocks,
      activeLabelId: activeLabelId ?? UNACCOUNTED_LABEL_ID,
      heartbeat: lastSeen,
    }),
    [
      activeLabelId,
      blocks,
      lastSeen,
      persisted.shared.anchor,
      persisted.shared.labels,
    ]
  );

  const {
    createLabel,
    renameLabel,
    archiveLabel,
    restoreLabel,
    undoArchive,
    undoError,
    archiveUndoVisible,
    adoptMergedLabels,
  } = useLabelActions({
    labels: persisted.shared.labels,
    activeLabelId,
    now,
    clockNow: runtime.clock.now,
    setPersisted,
    selectLabel,
  });

  const applyMergedState = useCallback(
    (merged: SharedState) => {
      rebaseForAnchor(merged.anchor);
      setPersisted((current) => ({
        ...current,
        shared: {
          ...current.shared,
          anchor: merged.anchor,
          labels: merged.labels,
        },
      }));
      adoptExternalState({
        blocks: merged.blocks,
        activeLabelId: merged.activeLabelId,
        lastSeen: merged.heartbeat,
      });
      adoptMergedLabels(merged.labels);
    },
    [adoptExternalState, adoptMergedLabels, rebaseForAnchor, setPersisted]
  );

  const { markDirty, firstSignIn, handoffReady } = useSyncCoordinator({
    runtime,
    currentShared,
    session: persisted.device.session,
    syncedAccountId: persisted.device.syncedAccountId,
    setPersisted,
    applyMergedState,
    now,
  });

  const markTourSeen = useCallback(() => {
    setPersisted((current) =>
      current.device.tourSeen
        ? current
        : {
            ...current,
            device: { ...current.device, tourSeen: true },
          },
    );
  }, [setPersisted]);

  const handleTourEnd = useCallback(() => {
    markTourSeen();
    setTourRunning(false);
  }, [markTourSeen]);

  // An overlay opening mid-tour ends it; every end marks the tour seen.
  // firstSignIn arrives asynchronously from the sync coordinator, so this
  // effect is the seam that reacts to either overlay opening.
  useEffect(() => {
    if (tourRunning && (accountOpen || firstSignIn !== null)) {
      // oxlint-disable-next-line react/set-state-in-effect
      handleTourEnd();
    }
  }, [accountOpen, firstSignIn, handleTourEnd, tourRunning]);

  const isFirstRender = useRef<boolean>(true);

  useEffect(() => {
    saveDocument(currentShared);
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    markDirty();
  }, [currentShared, markDirty, saveDocument]);

  // Visibility changes and page hides freeze the interval, so persist the
  // heartbeat synchronously rather than waiting for the save effect.
  useEffect(() => {
    return runtime.clock.subscribeHeartbeat(() => {
      const heartbeatAt = recordHeartbeat();

      if (heartbeatAt !== null) {
        saveDocument({ ...currentShared, heartbeat: heartbeatAt });
      }
    });
  }, [currentShared, recordHeartbeat, runtime, saveDocument]);

  const { handleSignOut } = useSession(runtime, setPersisted);
  const { exportJson, exportCsv } = useExportActions(
    runtime,
    currentShared,
    persisted.device,
    now
  );
  const { toggleTheme } = useTheme(setPersisted);

  return (
    <main
      className="min-h-screen min-h-dvh bg-neutral-950 text-neutral-100"
      data-theme={persisted.device.theme}
    >
      <div
        className="mx-auto flex min-h-screen min-h-dvh w-full max-w-5xl flex-col px-6 py-8 sm:px-10"
        inert={accountOpen || firstSignIn !== null}
      >
        <AppHeader
          theme={persisted.device.theme}
          onToggleTheme={toggleTheme}
          onOpenAccount={() => setAccountOpen(true)}
          onStartTour={() => setTourRunning(true)}
          selectedDayIndex={selectedDay.dayIndex}
          dayOptions={dayOptions}
          onSelectDay={selectDay}
          onExportJson={exportJson}
          onExportCsv={exportCsv}
          isSignedIn={persisted.device.session !== null}
        />

        <DayClock clock={day.clock} />

        <BlocksSection
          blocks={dynamicBlocks}
          labels={persisted.shared.labels}
          now={now}
          dayStart={selectedDay.dayStart}
          dayEnd={selectedDay.dayEnd}
          onRelabelBlock={relabelBlock}
          onSplitBlock={splitBlock}
        />
        <LabelsSection
          labels={persisted.shared.labels}
          activeLabelId={activeLabelId}
          shortcutsEnabled={!accountOpen && firstSignIn === null}
          onSelectLabel={selectLabel}
          onToggleLabel={toggleLabel}
          onCreateLabel={createLabel}
          onRenameLabel={renameLabel}
          onArchiveLabel={archiveLabel}
          onRestoreLabel={restoreLabel}
        />
        <TotalsSection
          labels={persisted.shared.labels}
          activeLabelId={activeLabelId}
          blocks={blocks}
          anchor={anchor}
          now={now}
          dayStart={selectedDay.dayStart}
          dayEnd={selectedDay.dayEnd}
        />
      </div>

      <UndoToast
        archiveUndoVisible={archiveUndoVisible}
        error={undoError}
        onUndo={undoArchive}
      />

      <TourGuide
        run={tourRunning}
        theme={persisted.device.theme}
        onEnd={handleTourEnd}
      />

      {firstSignIn ? (
        <FirstSignInPrompt
          email={persisted.device.session?.email ?? null}
          onResolve={firstSignIn.resolve}
        />
      ) : null}

      {accountOpen ? (
        <AccountScreen
          session={persisted.device.session}
          handoffReady={handoffReady}
          auth={runtime.auth}
          onClose={() => setAccountOpen(false)}
          onSignOut={handleSignOut}
        />
      ) : null}
    </main>
  );
}
