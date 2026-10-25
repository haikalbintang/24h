export const DAY_MS = 24 * 60 * 60 * 1000

export function formatDayLabel(midpoint: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(midpoint))
}

export function localMidnightBefore(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function formatClock(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export function getDaySnapshot(anchor: number, now: number) {
  const elapsedSinceAnchor = Math.max(0, now - anchor)
  const dayIndex = Math.floor(elapsedSinceAnchor / DAY_MS)
  const dayStart = anchor + dayIndex * DAY_MS
  const elapsedInDay = Math.min(
    elapsedSinceAnchor - dayIndex * DAY_MS,
    DAY_MS - 1,
  )
  const midpoint = dayStart + DAY_MS / 2

  return {
    dayIndex,
    dayStart,
    dayEnd: dayStart + DAY_MS,
    midpoint,
    elapsedInDay,
    clock: formatClock(elapsedInDay),
    dayLabel: formatDayLabel(midpoint),
  }
}
