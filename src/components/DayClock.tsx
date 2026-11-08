interface DayClockProps {
  clock: string;
}

export default function DayClock({ clock }: DayClockProps) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center py-16">
      <p className="text-xs font-medium tracking-[0.32em] text-neutral-500 uppercase">
        Day clock
      </p>
      <p
        role="timer"
        aria-live="off"
        aria-label="Day clock"
        className="mt-5 font-mono text-[clamp(3.5rem,16vw,10rem)] leading-none font-semibold tracking-tight text-neutral-50 tabular-nums"
      >
        {clock}
      </p>
    </section>
  );
}
