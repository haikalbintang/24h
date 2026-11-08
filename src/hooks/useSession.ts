import { useCallback, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { sameAccountSession, type AccountSession } from "@/data/auth";
import type { PersistedState } from "@/data/persistence";
import type { Runtime } from "@/data/runtime";

export interface UseSessionResult {
  handleSignOut: () => void;
}

export function useSession(
  runtime: Runtime,
  setPersisted: Dispatch<SetStateAction<PersistedState>>
): UseSessionResult {
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
  }, [runtime, setPersisted]);

  const handleSignOut = useCallback(() => {
    setPersisted((current) => ({
      ...current,
      device: {
        ...current.device,
        session: null,
      },
    }));
  }, [setPersisted]);

  return { handleSignOut };
}
