import { useCallback } from "react";
import { saveBlocksExport, saveJsonExport } from "@/data/export";
import { STATE_SCHEMA_VERSION } from "@/data/persistence";
import type { SharedState } from "@/data/persistence";
import type { AccountSession } from "@/data/auth";
import type { ThemeId } from "@/data/theme";
import type { Runtime } from "@/data/runtime";

interface ExportDeviceState {
  theme: ThemeId;
  session: AccountSession | null;
}

export interface UseExportActionsResult {
  exportJson: () => void;
  exportCsv: () => void;
}

export function useExportActions(
  runtime: Runtime,
  shared: SharedState,
  device: ExportDeviceState,
  now: number
): UseExportActionsResult {
  const exportJson = useCallback(() => {
    saveJsonExport(runtime, {
      schemaVersion: STATE_SCHEMA_VERSION,
      shared,
      device: {
        theme: device.theme,
        session: device.session,
      },
    });
  }, [device.session, device.theme, runtime, shared]);

  const exportCsv = useCallback(() => {
    saveBlocksExport(
      runtime,
      shared.blocks,
      shared.labels,
      shared.anchor,
      now
    );
  }, [now, runtime, shared.anchor, shared.blocks, shared.labels]);

  return { exportJson, exportCsv };
}
