import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { DAY_MS, getDaySnapshot } from "@/domain/day";
import { getLabelNameError, isUnaccountedLabelId, UNACCOUNTED_LABEL_ID } from "@/domain/labels";
import type { LabelColourId, LabelId } from "@/domain/labels";
import { THEME_DARK, THEME_LIGHT } from "@/data/theme";
import {
  loadPersistedState,
  savePersistedState,
  STATE_SCHEMA_VERSION,
  type PersistedState,
  type SharedState,
} from "@/data/persistence";
import { SyncCoordinator, type FirstSignInChoice } from "@/data/sync";
import FirstSignInPrompt from "@/components/FirstSignInPrompt";
import LabelsSection from "@/components/LabelsSection";
import { saveBlocksExport, saveJsonExport } from "@/data/export";
import TotalsSection from "@/components/TotalsSection";
import ReopenPrompt from "@/components/ReopenPrompt";
import AccountScreen from "@/components/AccountScreen";
import AppHeader from "@/components/AppHeader";
import DayClock from "@/components/DayClock";
import UndoToast from "@/components/UndoToast";
import { useBlocks, UNDO_WINDOW_MS } from "@/hooks/useBlocks";
import type { Runtime } from "@/data/runtime";
import { sameAccountSession, type AccountSession } from "@/data/auth";

export interface AppProps {
  runtime: Runtime;
}


export default function App({ runtime }: AppProps) {
  const [persisted, setPersisted] = useState<PersistedState>(() => {
    const loaded = loadPersistedState(runtime, runtime.clock.now());
    return {
      ...loaded,
      device: {
        ...loaded.device,
        session: runtime.auth.getSession(),
      },
    };
  });

  const anchor = persisted.shared.anchor;
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
  const [accountOpen, setAccountOpen] = useState(false);
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
      ...persisted.shared.labels.map(
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
    adoptExternalState,
  } = useBlocks(anchor, now, runtime.clock.now, {
    blocks: persisted.shared.blocks,
    labels: persisted.shared.labels,
    activeLabelId: persisted.shared.activeLabelId,
    lastSeen: persisted.shared.heartbeat,
  });

  const lastPollRef = useRef<number>(now);
  const isSyncApplyingRef = useRef<boolean>(false);
  const isFirstRender = useRef<boolean>(true);

  const currentShared: SharedState = {
    anchor: persisted.shared.anchor,
    labels: persisted.shared.labels,
    blocks,
    activeLabelId: activeLabelId ?? UNACCOUNTED_LABEL_ID,
    heartbeat: lastSeen,
  };
  const currentSharedRef = useRef<SharedState>(currentShared);
  const session = persisted.device.session;
  const sessionRef = useRef(session);
  const syncedAccountIdRef = useRef<string | null>(
    persisted.device.syncedAccountId ?? null
  );
  const anchorRef = useRef(persisted.shared.anchor);
  const pendingFirstSignInRef = useRef<
    ((choice: FirstSignInChoice) => void) | null
  >(null);
  const [firstSignIn, setFirstSignIn] = useState<{
    resolve: (choice: FirstSignInChoice) => void;
  } | null>(null);

  useEffect(() => {
    currentSharedRef.current = currentShared;
    sessionRef.current = session;
    syncedAccountIdRef.current = persisted.device.syncedAccountId ?? null;
  });

  const applyMergedState = useCallback(
    (merged: SharedState) => {
      isSyncApplyingRef.current = true;
      // Day indices count from the Anchor, so a changed Anchor rebases a picked Day.
      const anchorShift = Math.round(
        (anchorRef.current - merged.anchor) / DAY_MS
      );
      anchorRef.current = merged.anchor;
      if (anchorShift !== 0) {
        setPickedDayIndex((picked) => {
          if (picked === null) {
            return null;
          }
          const rebased = picked + anchorShift;
          return rebased < 0 ? null : rebased;
        });
      }
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
      nextLabelId.current =
        Math.max(
          nextLabelId.current,
          ...merged.labels.map(
            (label) => Number(label.id.slice("label-".length)) || 0
          )
        ) + 1;
      setTimeout(() => {
        isSyncApplyingRef.current = false;
      }, 0);
    },
    [adoptExternalState]
  );

  const [coordinator] = useState(
    () =>
      new SyncCoordinator({
        sync: runtime.sync,
        sharedRef: currentSharedRef,
        sessionRef,
        getSyncedAccountId: () => syncedAccountIdRef.current,
        onAccountSynced: (accountId) => {
          if (syncedAccountIdRef.current === accountId) {
            return;
          }
          syncedAccountIdRef.current = accountId;
          // Device state only: it must not queue a push of Shared state.
          isSyncApplyingRef.current = true;
          setPersisted((current) => ({
            ...current,
            device: { ...current.device, syncedAccountId: accountId },
          }));
          setTimeout(() => {
            isSyncApplyingRef.current = false;
          }, 0);
        },
        onFirstSignIn: () =>
          new Promise<FirstSignInChoice>((resolve) => {
            const settle = (choice: FirstSignInChoice) => {
              pendingFirstSignInRef.current = null;
              setFirstSignIn(null);
              resolve(choice);
            };
            pendingFirstSignInRef.current = settle;
            setFirstSignIn({ resolve: settle });
          }),
        onRemoteMerged: (merged) => {
          currentSharedRef.current = merged;
          applyMergedState(merged);
        },
        debounceMs: 2000,
      })
  );

  const markDirty = useCallback(() => {
    if (!sessionRef.current || isSyncApplyingRef.current) {
      return;
    }
    coordinator.notifyMutation(runtime.clock.now());
  }, [coordinator, runtime]);

  useEffect(() => {
    if (!sessionRef.current) {
      return;
    }
    coordinator.checkDebounce(now);
    if (now - lastPollRef.current >= 10000) {
      lastPollRef.current = now;
      void (coordinator.isQueued() ? coordinator.flush() : coordinator.pull());
    }
  }, [coordinator, now]);

  useEffect(() => {
    const onTrigger = () => {
      if (sessionRef.current) {
        void (coordinator.isQueued() ? coordinator.flush() : coordinator.pull());
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        onTrigger();
      }
    };
    window.addEventListener("focus", onTrigger);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onTrigger);

    return () => {
      window.removeEventListener("focus", onTrigger);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onTrigger);
    };
  }, [coordinator]);

  useEffect(() => {
    if (session) {
      void coordinator.pull();
    } else {
      coordinator.destroy();
      // A pending choice is abandoned on sign-out; the coordinator ignores it.
      pendingFirstSignInRef.current?.("merge");
    }
  }, [coordinator, session]);

  const archiveUndoVisible =
    archivedUndo !== null && now < archivedUndo.expiresAt;
  const handoffReady =
    session !== null &&
    persisted.device.syncedAccountId === session.accountId &&
    firstSignIn === null;

  const saveState = useCallback(
    (lastSeenValue: number | null) => {
      savePersistedState(runtime, {
        schemaVersion: STATE_SCHEMA_VERSION,
        shared: {
          anchor: persisted.shared.anchor,
          labels: persisted.shared.labels,
          blocks,
          activeLabelId: activeLabelId ?? UNACCOUNTED_LABEL_ID,
          heartbeat: lastSeenValue,
        },
        device: {
          ...persisted.device,
        },
      });
    },
    [runtime, persisted, blocks, activeLabelId]
  );

  useEffect(() => {
    saveState(lastSeen);
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    markDirty();
  }, [saveState, lastSeen, markDirty]);

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

  useEffect(() => {
    const applySession = (authSession: AccountSession | null) => {
      setPersisted((current) => {
        if (sameAccountSession(current.device.session, authSession)) {
          return current;
        }
        return {
          ...current,
          device: {
            ...current.device,
            session: authSession,
          },
        };
      });
    };

    const unsubscribe = runtime.auth.subscribe(applySession);
    // A handoff redirect can be consumed before this subscription attaches, so
    // read the session once more after subscribing to close that race.
    applySession(runtime.auth.getSession());
    return unsubscribe;
  }, [runtime]);

  const handleSignOut = () => {
    setPersisted((current) => ({
      ...current,
      device: {
        ...current.device,
        session: null,
      },
    }));
  };

  const createLabel = (
    name: string,
    colourId: LabelColourId
  ): string | null => {
    const error = getLabelNameError(name, persisted.shared.labels);

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
            updatedAt: runtime.clock.now(),
          },
        ],
      },
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

    const error = getLabelNameError(name, persisted.shared.labels, labelId);

    if (error) {
      return error;
    }

    setPersisted((current) => ({
      ...current,
      shared: {
        ...current.shared,
        labels: current.shared.labels.map((label) =>
          label.id === labelId
            ? { ...label, name, colourId, updatedAt: runtime.clock.now() }
            : label
        ),
      },
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
      shared: {
        ...current.shared,
        labels: current.shared.labels.map((label) =>
          label.id === labelId
            ? { ...label, archived: true, updatedAt: runtime.clock.now() }
            : label
        ),
      },
    }));
  };

  const restoreLabel = (labelId: LabelId) => {
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
            ? { ...label, archived: false, updatedAt: runtime.clock.now() }
            : label
        ),
      },
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
      shared: {
        ...current.shared,
        labels: current.shared.labels.map((label) =>
          label.id === labelId
            ? { ...label, archived: false, updatedAt: runtime.clock.now() }
            : label
        ),
      },
    }));

    // Undo restores the label and, if it was active, reactivates it.
    if (wasActive) {
      selectLabel(labelId);
    }

    return null;
  };

  const exportJson = () => {
    saveJsonExport(runtime, {
      schemaVersion: STATE_SCHEMA_VERSION,
      shared: {
        anchor: persisted.shared.anchor,
        labels: persisted.shared.labels,
        blocks,
        activeLabelId: activeLabelId ?? UNACCOUNTED_LABEL_ID,
        heartbeat: lastSeen,
      },
      device: {
        theme: persisted.device.theme,
        session: persisted.device.session,
      },
    });
  };

  const exportCsv = () => {
    saveBlocksExport(
      runtime,
      blocks,
      persisted.shared.labels,
      anchor,
      now,
    );
  };

  const toggleTheme = () => {
    setPersisted((current) => ({
      ...current,
      device: {
        ...current.device,
        theme:
          current.device.theme === THEME_DARK ? THEME_LIGHT : THEME_DARK,
      },
    }));
  };

  return (
    <main
      className="min-h-screen min-h-dvh bg-neutral-950 text-neutral-100"
      data-theme={persisted.device.theme}
    >
      <div
        className="mx-auto flex min-h-screen min-h-dvh w-full max-w-5xl flex-col px-6 py-8 sm:px-10"
        inert={reopenPromptOpen || accountOpen || firstSignIn !== null}
      >
        <AppHeader
          theme={persisted.device.theme}
          onToggleTheme={toggleTheme}
          onOpenAccount={() => setAccountOpen(true)}
          selectedDayIndex={selectedDay.dayIndex}
          dayOptions={dayOptions}
          onSelectDay={(index) =>
            setPickedDayIndex(index === day.dayIndex ? null : index)
          }
          onExportJson={exportJson}
          onExportCsv={exportCsv}
        />

        <DayClock clock={day.clock} />

        <LabelsSection
          now={now}
          dayStart={selectedDay.dayStart}
          dayEnd={selectedDay.dayEnd}
          labels={persisted.shared.labels}
          activeLabelId={activeLabelId}
          dynamicBlocks={dynamicBlocks}
          shortcutsEnabled={!reopenPromptOpen && !accountOpen && firstSignIn === null}
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
        onUndo={() => setUndoError(undoArchive())}
      />

      {reopenPromptOpen ? (
        <ReopenPrompt
          labelName={
            persisted.shared.labels.find((label) => label.id === activeLabelId)
              ?.name ?? null
          }
          onEnd={endBlockAtLastSeen}
          onKeep={keepLabelThroughGap}
          onDismiss={dismissReopenPrompt}
        />
      ) : null}

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
