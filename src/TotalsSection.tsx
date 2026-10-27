import type { LabelId } from "./labels";
import type { Block } from "./blocks";
import {
  labelTotalsForDay,
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
          <span key={i} data-label={s.labelId} />
        ))}
      </div>
    </section>
  );
}
