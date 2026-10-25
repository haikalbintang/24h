import { useState, useSyncExternalStore } from 'react'
import { resolveAnchor } from './anchor'
import { getDaySnapshot } from './day'
import LabelsSection from './LabelsSection'
import type { Runtime } from './runtime'

export interface AppProps {
  runtime: Runtime
}

export default function App({ runtime }: AppProps) {
  const [anchor] = useState(() => resolveAnchor(runtime, runtime.clock.now()))
  const now = useSyncExternalStore(
    runtime.clock.subscribe,
    runtime.clock.now,
    runtime.clock.now,
  )
  const day = getDaySnapshot(anchor, now)

  return (
    <main
      className="min-h-screen bg-neutral-950 text-neutral-100"
      data-theme="dark"
    >
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-8 sm:px-10">
        <header className="flex flex-wrap items-baseline justify-between gap-3 border-b border-neutral-800 pb-5">
          <h1 className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase">
            Day Labels
          </h1>
          <p className="text-sm text-neutral-300">{day.dayLabel}</p>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center py-16">
          <p className="text-xs font-medium tracking-[0.32em] text-neutral-500 uppercase">
            Day clock
          </p>
          <p
            role="timer"
            aria-label="Day clock"
            className="mt-5 font-mono text-[clamp(3.5rem,16vw,10rem)] leading-none font-semibold tracking-tight text-neutral-50 tabular-nums"
          >
            {day.clock}
          </p>
        </section>

        <LabelsSection
          anchor={anchor}
          now={now}
          getNow={runtime.clock.now}
          dayStart={day.dayStart}
          dayEnd={day.dayEnd}
        />
      </div>
    </main>
  )
}
