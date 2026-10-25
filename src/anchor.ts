import { localMidnightBefore } from './day'
import type { Runtime } from './runtime'

const ANCHOR_STORAGE_KEY = 'day-labels.anchor.v1'

export function resolveAnchor(runtime: Runtime, now: number): number {
  const storedAnchor = runtime.storage.getItem(ANCHOR_STORAGE_KEY)

  if (storedAnchor !== null && storedAnchor.trim() !== '') {
    const parsedAnchor = Number(storedAnchor)

    if (Number.isFinite(parsedAnchor)) {
      return parsedAnchor
    }
  }

  const anchor = localMidnightBefore(now)
  runtime.storage.setItem(ANCHOR_STORAGE_KEY, String(anchor))
  return anchor
}
