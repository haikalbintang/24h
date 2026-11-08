import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { SyncCoordinator, type FirstSignInChoice } from "@/data/sync";
import type { SharedState, PersistedState } from "@/data/persistence";
import type { AccountSession } from "@/data/auth";
import type { Runtime } from "@/data/runtime";

interface FirstSignInState {
  resolve: (choice: FirstSignInChoice) => void;
}

export interface UseSyncCoordinatorArgs {
  runtime: Runtime;
  currentShared: SharedState;
  session: AccountSession | null;
  syncedAccountId?: string;
  setPersisted: Dispatch<SetStateAction<PersistedState>>;
  applyMergedState: (merged: SharedState) => void;
  now: number;
}

export interface UseSyncCoordinatorResult {
  markDirty: () => void;
  firstSignIn: FirstSignInState | null;
  handoffReady: boolean;
}

const POLL_INTERVAL_MS = 10000;

export function useSyncCoordinator({
  runtime,
  currentShared,
  session,
  syncedAccountId,
  setPersisted,
  applyMergedState,
  now,
}: UseSyncCoordinatorArgs): UseSyncCoordinatorResult {
  const currentSharedRef = useRef<SharedState>(currentShared);
  const sessionRef = useRef(session);
  const syncedAccountIdRef = useRef<string | null>(syncedAccountId ?? null);
  const lastPollRef = useRef<number>(now);
  const isSyncApplyingRef = useRef<boolean>(false);
  const pendingFirstSignInRef = useRef<
    ((choice: FirstSignInChoice) => void) | null
  >(null);
  const [firstSignIn, setFirstSignIn] = useState<FirstSignInState | null>(null);

  useEffect(() => {
    currentSharedRef.current = currentShared;
    sessionRef.current = session;
    syncedAccountIdRef.current = syncedAccountId ?? null;
  });

  const applyMerged = useCallback(
    (merged: SharedState) => {
      isSyncApplyingRef.current = true;
      applyMergedState(merged);
      setTimeout(() => {
        isSyncApplyingRef.current = false;
      }, 0);
    },
    [applyMergedState]
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
          applyMerged(merged);
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
    if (now - lastPollRef.current >= POLL_INTERVAL_MS) {
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

  const handoffReady =
    session !== null &&
    (syncedAccountId ?? null) === session.accountId &&
    firstSignIn === null;

  return { markDirty, firstSignIn, handoffReady };
}
