import { formatClock } from './day'
import { getBlockDuration } from './blocks'
import type { Block } from './blocks'
import { getLabelColour } from './labels'
import type { Label } from './labels'

interface BlocksSectionProps {
  blocks: Block[]
  labels: Label[]
  now: number
  dayStart: number
  dayEnd: number
}

export default function BlocksSection({
  blocks,
  labels,
  now,
  dayStart,
  dayEnd,
}: BlocksSectionProps) {
  const labelMap = new Map(labels.map((label) => [label.id, label]))

  const todaysBlocks = blocks
    .filter((block) => block.start >= dayStart && block.start < dayEnd)
    .sort((a, b) => a.start - b.start)

  return (
    <section aria-labelledby="blocks-heading" className="grid gap-3">
      <h2
        id="blocks-heading"
        className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase"
      >
        Blocks
      </h2>
      {todaysBlocks.length === 0 ? (
        <p className="text-sm text-neutral-400">No blocks yet.</p>
      ) : (
        <ul aria-label="Blocks" className="grid gap-2">
          {todaysBlocks.map((block) => {
            const label = labelMap.get(block.labelId)
            const colour = label ? getLabelColour(label.colourId) : null
            const startLabel = formatClock(block.start - dayStart)
            const endLabel =
              block.end === null
                ? 'Ongoing'
                : formatClock(block.end - dayStart)
            const duration = formatClock(getBlockDuration(block, now))

            return (
              <li
                key={block.id}
                aria-describedby={`block-${block.id}-colour`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2"
              >
                <div className="flex items-center gap-2">
                  {colour ? (
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: colour.value }}
                    />
                  ) : null}
                  <span className="text-sm font-medium text-neutral-100">
                    {label ? label.name : 'Unknown'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
                  <span>
                    {startLabel} – {endLabel}
                  </span>
                  <span className="font-mono tabular-nums">{duration}</span>
                </div>
                <span id={`block-${block.id}-colour`} className="sr-only">
                  {colour ? colour.name : ''}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
