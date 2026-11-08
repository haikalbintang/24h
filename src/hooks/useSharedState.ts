import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  loadPersistedState,
  savePersistedState,
  STATE_SCHEMA_VERSION,
  type PersistedState,
  type SharedState,
} from "@/data/persistence";
import type { Runtime } from "@/data/runtime";

export interface UseSharedStateResult {
  persisted: PersistedState;
  setPersisted: Dispatch<SetStateAction<PersistedState>>;
  saveDocument: (shared: SharedState) => void;
}

export function useSharedState(runtime: Runtime): UseSharedStateResult {
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

  const saveDocument = useCallback(
    (shared: SharedState) => {
      savePersistedState(runtime, {
        schemaVersion: STATE_SCHEMA_VERSION,
        shared,
        device: {
          ...persisted.device,
        },
      });
    },
    [runtime, persisted.device]
  );

  return { persisted, setPersisted, saveDocument };
}
