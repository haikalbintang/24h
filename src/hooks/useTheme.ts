import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import { THEME_DARK, THEME_LIGHT } from "@/data/theme";
import type { PersistedState } from "@/data/persistence";

export interface UseThemeResult {
  toggleTheme: () => void;
}

export function useTheme(
  setPersisted: Dispatch<SetStateAction<PersistedState>>
): UseThemeResult {
  const toggleTheme = useCallback(() => {
    setPersisted((current) => ({
      ...current,
      device: {
        ...current.device,
        theme:
          current.device.theme === THEME_DARK ? THEME_LIGHT : THEME_DARK,
      },
    }));
  }, [setPersisted]);

  return { toggleTheme };
}
