import { DAY_MS } from "./day";
import { getLabelColour } from "./labels";
import type { LabelId } from "./labels";
import type { Block } from "./blocks";
import {
  labelTotalsForDay,
  sevenDayTotals,
  timelineSegmentsForDay,
  unaccountedMsForDay,
} from "./totals";

export interface TotalsSectionProps {
  labels: { id: LabelId; name: string; colourId: string }[];
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
    props.now
  );
  const unaccounted = unaccountedMsForDay(
    props.blocks,
    props.dayStart,
    props.dayEnd,
    props.now
  );
  const segments = timelineSegmentsForDay(
    props.blocks,
    props.dayStart,
    props.dayEnd,
    props.now
  );
  const selectedDayIndex = Math.round((props.dayStart - props.anchor) / DAY_MS);
  const seven = sevenDayTotals(
    props.blocks,
    props.anchor,
    selectedDayIndex,
    props.now
  );
  const colourFor = (id: LabelId) =>
    getLabelColour(props.labels.find((l) => l.id === id)?.colourId as any)
      .value;
  const futureStart = Math.min(props.now, props.dayEnd);
  return (
    <section aria-label="Totals">
      <h2>Totals</h2>
      <ul role="list" aria-label="Totals">
        {props.labels.map((l) => (
          <li key={l.id}>
            {l.name}: {totals.get(l.id) ?? 0}
          </li>
        ))}
        <li>Unaccounted: {unaccounted}</li>
      </ul>
      <div role="list" aria-label="Timeline">
        {segments.map((s, i) => (
          <span
            key={i}
            data-label={s.labelId}
            style={{
              backgroundColor: s.labelId ? colourFor(s.labelId) : undefined,
              width: `${((s.end - s.start) / (props.dayEnd - props.dayStart)) * 100}%`,
            }}
          />
        ))}
        {futureStart < props.dayEnd && (
          <span
            data-future="true"
            style={{
              width: `${((props.dayEnd - futureStart) / (props.dayEnd - props.dayStart)) * 100}%`,
            }}
          />
        )}
      </div>
      <ul role="list" aria-label="Seven-day totals">
        {seven.map((d) => (
          <li key={d.dayIndex}>
            Day {d.dayIndex}:{" "}
            {Array.from(d.totals.entries())
              .map(([k, v]) => `${k}:${v}`)
              .join(", ")}{" "}
            Unaccounted:{d.unaccounted}
          </li>
        ))}
      </ul>
    </section>
  );
}
