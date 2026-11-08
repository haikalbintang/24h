import { useCallback, useRef, useState } from "react";
import { DAY_MS, getDaySnapshot } from "@/domain/day";

export interface UseDayViewResult {
  day: ReturnType<typeof getDaySnapshot>;
  selectedDay: ReturnType<typeof getDaySnapshot>;
  dayOptions: Array<ReturnType<typeof getDaySnapshot>>;
  selectDay: (dayIndex: number) => void;
  rebaseForAnchor: (anchor: number) => void;
}

export function useDayView(anchor: number, now: number): UseDayViewResult {
  const day = getDaySnapshot(anchor, now);
  // null follows today, so rollover advances the view; a chosen past Day stays.
  const [pickedDayIndex, setPickedDayIndex] = useState<number | null>(null);
  const anchorRef = useRef(anchor);

  const selectedDay = getDaySnapshot(
    anchor,
    anchor + (pickedDayIndex ?? day.dayIndex) * DAY_MS
  );
  const dayOptions = Array.from({ length: day.dayIndex + 1 }, (_, index) =>
    getDaySnapshot(anchor, anchor + index * DAY_MS)
  );

  const selectDay = useCallback(
    (dayIndex: number) => {
      setPickedDayIndex(dayIndex === day.dayIndex ? null : dayIndex);
    },
    [day.dayIndex]
  );

  const rebaseForAnchor = useCallback((nextAnchor: number) => {
    // Day indices count from the Anchor, so a changed Anchor rebases a picked Day.
    const anchorShift = Math.round((anchorRef.current - nextAnchor) / DAY_MS);
    anchorRef.current = nextAnchor;

    if (anchorShift === 0) {
      return;
    }

    setPickedDayIndex((picked) => {
      if (picked === null) {
        return null;
      }
      const rebased = picked + anchorShift;
      return rebased < 0 ? null : rebased;
    });
  }, []);

  return { day, selectedDay, dayOptions, selectDay, rebaseForAnchor };
}
