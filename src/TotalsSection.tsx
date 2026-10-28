import { DAY_MS, formatClock } from './day'
import { getLabelColour } from './labels'
import type { Block } from './blocks'
import type { Label, LabelId } from './labels'
import {
  labelTotalsForDay,
  sevenDayTotals,
  timelineSegmentsForDay,
  unaccountedMsForDay,
  type DayTotals,
} from './totals'

export interface TotalsSectionProps {
  labels: Label[]
  blocks: Block[]
  anchor: number
  now: number
  dayStart: number
  dayEnd: number
}

export default function TotalsSection(props: TotalsSectionProps) {
  const totals = labelTotalsForDay(props.blocks, props.dayStart, props.dayEnd, props.now)
  const unaccounted = unaccountedMsForDay(props.blocks, props.dayStart, props.dayEnd, props.now)
  const segments = timelineSegmentsForDay(props.blocks, props.dayStart, props.dayEnd, props.now)
  const selectedDayIndex = Math.round((props.dayStart - props.anchor) / DAY_MS)
  const seven = sevenDayTotals(props.blocks, props.anchor, selectedDayIndex, props.now)
  const futureStart = Math.min(props.now, props.dayEnd)
  const future = futureStart < props.dayEnd

  const labelName = (labelId: LabelId) =>
    props.labels.find((label) => label.id === labelId)?.name ?? labelId

  const daySummary = (day: DayTotals) => {
    const parts = Array.from(day.totals.entries()).map(
      ([labelId, ms]) => `${labelName(labelId)}: ${formatClock(ms)}`,
    )

    parts.push(`Unaccounted: ${formatClock(day.unaccounted)}`)

    return `Day ${day.dayIndex}: ${parts.join(' ')}`
  }

  return (
    <section aria-label="Totals">
      <h2 className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase">
        Totals
      </h2>

      <div className="grid gap-3">
        <h3 className="text-sm font-semibold text-neutral-200">Selected day</h3>
        <ul aria-label="Selected day totals" className="grid gap-1">
          {props.labels.map((label) => (
            <li key={label.id}>
              {label.name}: {formatClock(totals.get(label.id) ?? 0)}
            </li>
          ))}
          <li>Unaccounted: {formatClock(unaccounted)}</li>
        </ul>
      </div>

      <div className="grid gap-3">
        <h3 className="text-sm font-semibold text-neutral-200">Timeline</h3>
        <ul aria-label="Timeline" className="relative mt-4 h-16 w-full">
          {segments.map((segment) => {
            const label = segment.labelId
              ? props.labels.find((candidate) => candidate.id === segment.labelId)
              : undefined
            const left = ((segment.start - props.dayStart) / DAY_MS) * 100
            const width = ((segment.end - segment.start) / DAY_MS) * 100

            return (
              <li
                key={`${segment.labelId}-${segment.start}`}
                data-label={segment.labelId ?? undefined}
                className="absolute top-0 h-full"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: label ? getLabelColour(label.colourId).value : undefined,
                }}
              />
            )
          })}
          {future ? (
            <li
              data-future="true"
              className="absolute top-0 h-full"
              style={{
                left: `${((futureStart - props.dayStart) / DAY_MS) * 100}%`,
                width: `${((props.dayEnd - futureStart) / DAY_MS) * 100}%`,
                backgroundColor: 'transparent',
                outline: '2px dashed #a3a3a3',
              }}
            />
          ) : null}
        </ul>
      </div>

      <div className="grid gap-3">
        <h3 className="text-sm font-semibold text-neutral-200">Seven day totals</h3>
        <ul aria-label="Seven day totals" className="grid gap-1">
          {seven.map((day) => (
            <li key={day.dayIndex}>{daySummary(day)}</li>
          ))}
        </ul>
      </div>
    </section>
  )
}
