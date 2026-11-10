import { useState } from "react";
import { DAY_MS, formatClock, formatCompactDayLabel } from "@/domain/day";
import {
  UNACCOUNTED_MARKER_CLASS,
  UNACCOUNTED_VISUAL_COLOUR,
  getLabelColour,
  isLabelArchived,
  isUnaccountedLabelId,
} from "@/domain/labels";
import type { Block } from "@/domain/blocks";
import type { Label, LabelId } from "@/domain/labels";
import {
  labelTotalsForDay,
  sevenDayTotals,
  timelineSegmentsForDay,
  unaccountedMsForDay,
} from "@/domain/totals";

function formatScale(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${minutes}m`;
}

export interface TotalsSectionProps {
  labels: Label[];
  activeLabelId?: LabelId | null;
  blocks: Block[];
  anchor: number;
  now: number;
  dayStart: number;
  dayEnd: number;
}

export default function TotalsSection(props: TotalsSectionProps) {
  const [isTotalsOpen, setIsTotalsOpen] = useState(true);
  const totals = labelTotalsForDay(
    props.blocks,
    props.dayStart,
    props.dayEnd,
    props.now,
    props.labels,
  );
  const unaccounted = unaccountedMsForDay(
    props.blocks,
    props.dayStart,
    props.dayEnd,
    props.now,
    props.labels,
  );
  const segments = timelineSegmentsForDay(
    props.blocks,
    props.dayStart,
    props.dayEnd,
    props.now,
    props.labels,
  );
  const selectedDayIndex = Math.round((props.dayStart - props.anchor) / DAY_MS);
  const seven = sevenDayTotals(
    props.blocks,
    props.anchor,
    selectedDayIndex,
    props.now,
    props.labels,
  );
  const futureStart = Math.min(props.now, props.dayEnd);
  const future = futureStart < props.dayEnd;

  const dayHeaders = seven.map((day) => ({
    dayIndex: day.dayIndex,
    label: formatCompactDayLabel(
      props.anchor + day.dayIndex * DAY_MS + DAY_MS / 2,
    ),
  }));

  type SevenDayRow = {
    key: string;
    name: string;
    colourId?: Label["colourId"];
    unaccounted?: boolean;
    dailyMs: number[];
    totalMs: number;
  };

  const byLabel = new Map<LabelId, number[]>();
  for (let i = 0; i < seven.length; i++) {
    for (const [labelId, ms] of seven[i].totals.entries()) {
      if (!ms) continue;
      let arr = byLabel.get(labelId);
      if (!arr) {
        arr = Array(seven.length).fill(0) as number[];
        byLabel.set(labelId, arr);
      }
      arr[i] = ms;
    }
  }

  const labelRows: SevenDayRow[] = Array.from(byLabel.entries())
    .map(([labelId, dailyMs]) => {
      const label = props.labels.find((l) => l.id === labelId);
      return {
        key: labelId,
        name: label?.name ?? labelId,
        colourId: label?.colourId,
        dailyMs,
        totalMs: dailyMs.reduce((a, b) => a + b, 0),
      };
    })
    .sort((a, b) => b.totalMs - a.totalMs);

  const unaccountedDaily = seven.map((d) => d.unaccounted);
  const unaccountedRow: SevenDayRow = {
    key: "unaccounted",
    name: "Unaccounted",
    unaccounted: true,
    dailyMs: unaccountedDaily,
    totalMs: unaccountedDaily.reduce((a, b) => a + b, 0),
  };

  const runningLabelId =
    props.activeLabelId !== undefined
      ? props.activeLabelId
      : (props.blocks.find((block) => block.end === null)?.labelId ?? null);

  // Sort labels descending by total duration
  const sortedLabels = props.labels
    .filter((label) => !isUnaccountedLabelId(label.id) && !isLabelArchived(label))
    .sort((a, b) => {
      const totalA = totals.get(a.id) ?? 0;
      const totalB = totals.get(b.id) ?? 0;
      return totalB - totalA;
    });

  const pieBackground = (() => {
    const stops: string[] = [];
    let cumulative = 0;

    for (const label of sortedLabels) {
      const ms = totals.get(label.id) ?? 0;
      if (ms <= 0) continue;
      const startPct = (cumulative / DAY_MS) * 100;
      cumulative += ms;
      const endPct = (cumulative / DAY_MS) * 100;
      stops.push(
        `${getLabelColour(label.colourId).value} ${startPct}% ${endPct}%`,
      );
    }

    if (unaccounted > 0) {
      const startPct = (cumulative / DAY_MS) * 100;
      cumulative += unaccounted;
      const endPct = (cumulative / DAY_MS) * 100;
      stops.push(`${UNACCOUNTED_VISUAL_COLOUR} ${startPct}% ${endPct}%`);
    }

    if (cumulative < DAY_MS) {
      const endPct = (cumulative / DAY_MS) * 100;
      stops.push(`transparent ${endPct}% 100%`);
    }

    return stops.length > 0 ? `conic-gradient(${stops.join(", ")})` : undefined;
  })();

  return (
    <section
      aria-labelledby="totals-heading"
      className="mt-6 border-t border-neutral-800 pt-6"
    >
      <h2
        id="totals-heading"
        className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase"
      >
        <button
          type="button"
          aria-expanded={isTotalsOpen}
          aria-controls="totals-panel"
          onClick={() => setIsTotalsOpen((open) => !open)}
          className="flex min-h-6 items-center gap-2 py-1 uppercase hover:text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
        >
          <span
            aria-hidden="true"
            className={`inline-block motion-safe:transition-transform ${isTotalsOpen ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          Totals
        </button>
      </h2>

      {isTotalsOpen ? (
        <div id="totals-panel" data-tour="totals">
          <div className="mt-4 grid gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 sm:px-8">
            <h3 className="text-sm font-semibold text-neutral-200">Selected day</h3>
            <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
              <div className="flex justify-center lg:pl-6 lg:pr-8">
                <div
                  role="img"
                  aria-label="Selected day pie chart"
                  className="aspect-square w-full max-w-64 shrink-0 rounded-full border border-neutral-700 bg-neutral-950 shadow-inner forced-color-adjust-none sm:h-56 sm:w-56 sm:max-w-none md:h-72 md:w-72 lg:h-86 lg:w-86"
                  style={{ backgroundImage: pieBackground }}
                />
              </div>
              <ul aria-label="Selected day totals" className="grid min-w-0 gap-2">
                {sortedLabels.map((label) => {
                  const isActive = label.id === runningLabelId;

                  return (
                    <li
                      key={label.id}
                      data-active={isActive ? "true" : undefined}
                      className={`flex items-center justify-between gap-3 py-1.5 text-sm ${isActive
                        ? "rounded-lg border border-neutral-700 bg-neutral-800/80 px-3 font-medium text-neutral-50"
                        : "text-neutral-200 px-3"
                        }`}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 shrink-0 rounded-full forced-color-adjust-none"
                          style={{
                            backgroundColor: getLabelColour(label.colourId).value,
                          }}
                        />
                        <span className="truncate">{label.name}: </span>
                      </span>
                      <span className="shrink-0 font-mono text-xs tabular-nums sm:text-sm">
                        {formatClock(totals.get(label.id) ?? 0)}
                      </span>
                    </li>
                  );
                })}
                <li className="px-3 flex items-center justify-between gap-3 border-t border-neutral-800 pt-3 text-sm text-neutral-400">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={`h-3 w-3 shrink-0 forced-color-adjust-none ${UNACCOUNTED_MARKER_CLASS}`}
                    />
                    <span className="truncate">Unaccounted: </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums sm:text-sm">
                    {formatClock(unaccounted)}
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div
            data-tour="timeline"
            className="mt-4 grid gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5"
          >
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
                const backgroundColor = isUnaccountedLabelId(segment.labelId)
                  ? UNACCOUNTED_VISUAL_COLOUR
                  : label
                    ? getLabelColour(label.colourId).value
                    : undefined;
                const segmentName = isUnaccountedLabelId(segment.labelId)
                  ? "Unaccounted"
                  : (label?.name ?? "Unknown");
                const segmentSummary = `${segmentName}: ${formatClock(segment.start - props.dayStart)} – ${formatClock(segment.end - props.dayStart)}`;

                return (
                  <li
                    key={`${segment.labelId}-${segment.start}`}
                    data-label={segment.labelId ?? undefined}
                    aria-label={segmentSummary}
                    title={segmentSummary}
                    className="absolute top-0 h-full forced-color-adjust-none"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor,
                    }}
                  />
                );
              })}
              {future ? (
                <li
                  data-future="true"
                  aria-label="Future"
                  className="absolute top-0 h-full forced-color-adjust-none"
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
            <div
              tabIndex={0}
              className="overflow-x-auto overflow-y-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
            >
              <div
                aria-label="Seven day totals"
                role="table"
                className="grid min-w-[36rem] gap-3 text-sm"
              >
                <div
                  role="row"
                  className="grid items-end gap-2 text-[11px] font-medium text-neutral-500"
                  style={{
                    gridTemplateColumns:
                      "minmax(6rem, 1.2fr) minmax(3rem, auto) repeat(7, minmax(2.25rem, 1fr)) minmax(3.5rem, auto) minmax(3.5rem, auto)",
                  }}
                >
                  <span role="columnheader">Label</span>
                  <span role="columnheader" className="text-right">
                    Scale
                  </span>
                  {dayHeaders.map((day) => (
                    <span
                      key={day.dayIndex}
                      role="columnheader"
                      className="text-center"
                      title={day.label}
                    >
                      {day.label}
                    </span>
                  ))}
                  <span role="columnheader" className="pl-2 text-right">
                    Avg
                  </span>
                  <span role="columnheader" className="pl-2 text-right">
                    Total
                  </span>
                </div>
                {[...labelRows, unaccountedRow].map((row) => {
                  const maxDailyMs = Math.max(...row.dailyMs, 0);

                  return (
                    <div
                      key={row.key}
                      role="row"
                      className="grid items-center gap-2 border-t border-neutral-800 pt-3"
                      style={{
                        gridTemplateColumns:
                          "minmax(6rem, 1.2fr) minmax(3rem, auto) repeat(7, minmax(2.25rem, 1fr)) minmax(3.5rem, auto) minmax(3.5rem, auto)",
                      }}
                    >
                      <span
                        role="cell"
                        className="flex min-w-0 items-center gap-2 text-neutral-200"
                      >
                        <span
                          aria-hidden="true"
                          className={
                            row.unaccounted
                              ? `h-3 w-3 shrink-0 forced-color-adjust-none ${UNACCOUNTED_MARKER_CLASS}`
                              : "h-3 w-3 shrink-0 rounded-full forced-color-adjust-none"
                          }
                          style={
                            row.unaccounted || !row.colourId
                              ? undefined
                              : {
                                  backgroundColor: getLabelColour(row.colourId)
                                    .value,
                                }
                          }
                        />
                        <span className="truncate">{row.name}</span>
                      </span>
                      <span
                        role="cell"
                        aria-label={`${row.name} scale: 0 to ${formatClock(maxDailyMs)}`}
                        className="flex h-40 flex-col justify-between border-r border-neutral-800 pr-2 text-right font-mono text-xs leading-none tabular-nums text-neutral-500"
                      >
                        <span aria-hidden="true">{formatScale(maxDailyMs)}</span>
                        <span aria-hidden="true">
                          {formatScale(maxDailyMs / 2)}
                        </span>
                        <span aria-hidden="true">0</span>
                      </span>
                      {row.dailyMs.map((ms, i) => {
                        const heightPct =
                          maxDailyMs > 0
                            ? Math.max(0, Math.min(100, (ms / maxDailyMs) * 100))
                            : 0;
                        // Text fits inside the bar once it is at least ~1/5 of the column height.
                        const labelInside = heightPct >= 20;

                        return (
                          <span
                            key={dayHeaders[i].dayIndex}
                            role="cell"
                            aria-label={`${dayHeaders[i].label}: ${formatClock(ms)}`}
                            className="relative h-40 w-11/12 justify-self-center rounded-sm bg-neutral-950/80"
                            title={`${dayHeaders[i].label}: ${formatClock(ms)}`}
                          >
                            <span
                              aria-hidden="true"
                              className="absolute inset-x-0 bottom-0 rounded-sm forced-color-adjust-none"
                              style={{
                                height: `${heightPct}%`,
                                minHeight: ms > 0 ? "2px" : undefined,
                                backgroundColor: row.unaccounted
                                  ? UNACCOUNTED_VISUAL_COLOUR
                                  : row.colourId
                                    ? getLabelColour(row.colourId).value
                                    : undefined,
                              }}
                            />
                            {ms > 0 ? (
                              <span
                                aria-hidden="true"
                                className={`absolute inset-x-0 flex justify-center font-mono text-xs leading-none tabular-nums ${labelInside
                                  ? "bottom-1 text-neutral-50 [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"
                                  : "text-neutral-400"
                                  }`}
                                style={
                                  labelInside
                                    ? undefined
                                    : {
                                      bottom: `calc(${heightPct}% + 0.25rem)`,
                                    }
                                }
                              >
                                {formatScale(ms)}
                              </span>
                            ) : null}
                          </span>
                        );
                      })}
                      <span
                        role="cell"
                        className="pl-2 text-right font-mono text-xs tabular-nums text-neutral-400"
                      >
                        {formatClock(Math.round(row.totalMs / seven.length))}
                      </span>
                      <span
                        role="cell"
                        className="pl-2 text-right font-mono text-xs tabular-nums text-neutral-200"
                      >
                        {formatClock(row.totalMs)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
