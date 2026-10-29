import { DAY_MS, formatClock } from "./day";
import { getLabelColour } from "./labels";
import type { Block } from "./blocks";
import type { Label, LabelId } from "./labels";
import {
  labelTotalsForDay,
  sevenDayTotals,
  timelineSegmentsForDay,
  unaccountedMsForDay,
} from "./totals";

export interface TotalsSectionProps {
  labels: Label[];
  blocks: Block[];
  anchor: number;
  now: number;
  dayStart: number;
  dayEnd: number;
}

export default function TotalsSection(props: TotalsSectionProps) {
  const totals = labelTotalsForDay(
    props.blocks,
    props.dayStart,
    props.dayEnd,
    props.now,
  );
  const unaccounted = unaccountedMsForDay(
    props.blocks,
    props.dayStart,
    props.dayEnd,
    props.now,
  );
  const segments = timelineSegmentsForDay(
    props.blocks,
    props.dayStart,
    props.dayEnd,
    props.now,
  );
  const selectedDayIndex = Math.round((props.dayStart - props.anchor) / DAY_MS);
  const seven = sevenDayTotals(
    props.blocks,
    props.anchor,
    selectedDayIndex,
    props.now,
  );
  const futureStart = Math.min(props.now, props.dayEnd);
  const future = futureStart < props.dayEnd;

  const labelName = (labelId: LabelId) =>
    props.labels.find((label) => label.id === labelId)?.name ?? labelId;

  return (
    <section
      aria-label="Totals"
      className="mt-6 border-t border-neutral-800 pt-6"
    >
      <h2 className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase">
        Totals
      </h2>

      <div className="mt-4 grid gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
        <h3 className="text-sm font-semibold text-neutral-200">Selected day</h3>
        <ul aria-label="Selected day totals" className="grid gap-2">
          {props.labels.map((label) => (
            <li
              key={label.id}
              className="flex items-center justify-between gap-3 text-sm text-neutral-200"
            >
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 rounded-full"
                  style={{
                    backgroundColor: getLabelColour(label.colourId).value,
                  }}
                />
                <span>{label.name}: </span>
              </span>
              <span className="font-mono tabular-nums">
                {formatClock(totals.get(label.id) ?? 0)}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-2 text-sm text-neutral-400">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full border border-dashed border-neutral-500"
              />
              <span>Unaccounted: </span>
            </span>
            <span className="font-mono tabular-nums">
              {formatClock(unaccounted)}
            </span>
          </li>
        </ul>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
        <h3 className="text-sm font-semibold text-neutral-200">Timeline</h3>
        <ul
          aria-label="Timeline"
          className="relative h-10 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950"
        >
          {segments.map((segment) => {
            const label = segment.labelId
              ? props.labels.find(
                  (candidate) => candidate.id === segment.labelId,
                )
              : undefined;
            const left = ((segment.start - props.dayStart) / DAY_MS) * 100;
            const width = ((segment.end - segment.start) / DAY_MS) * 100;

            return (
              <li
                key={`${segment.labelId}-${segment.start}`}
                data-label={segment.labelId ?? undefined}
                className="absolute top-0 h-full"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: label
                    ? getLabelColour(label.colourId).value
                    : undefined,
                }}
              />
            );
          })}
          {future ? (
            <li
              data-future="true"
              className="absolute top-0 h-full"
              style={{
                left: `${((futureStart - props.dayStart) / DAY_MS) * 100}%`,
                width: `${((props.dayEnd - futureStart) / DAY_MS) * 100}%`,
                backgroundImage:
                  "repeating-linear-gradient(135deg, #404040 0 2px, transparent 2px 8px)",
                opacity: 0.6,
              }}
            />
          ) : null}
        </ul>
        <div
          aria-hidden="true"
          className="flex justify-between font-mono text-xs text-neutral-500"
        >
          {[0, 6, 12, 18, 24].map((hour) => (
            <span key={hour}>{String(hour).padStart(2, "0")}</span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5">
        <h3 className="text-sm font-semibold text-neutral-200">
          Seven day totals
        </h3>
        <ul aria-label="Seven day totals" className="grid gap-3">
          {seven.map((day) => (
            <li
              key={day.dayIndex}
              className="grid gap-1 border-b border-neutral-800 pb-3 text-sm last:border-b-0 last:pb-0"
            >
              <span className="text-xs font-semibold text-neutral-400 uppercase">
                Day {day.dayIndex}
              </span>
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-neutral-200">
                {Array.from(day.totals.entries()).map(([labelId, ms]) => (
                  <span key={labelId}>
                    {labelName(labelId)}:{" "}
                    <span className="font-mono tabular-nums">
                      {formatClock(ms)}
                    </span>
                  </span>
                ))}
                <span className="text-neutral-400">
                  Unaccounted:{" "}
                  <span className="font-mono tabular-nums">
                    {formatClock(day.unaccounted)}
                  </span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
