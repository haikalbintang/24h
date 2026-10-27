export const HEARTBEAT_INTERVAL_MS = 60 * 1000
export const REOPEN_GAP_THRESHOLD_MS = 2 * 60 * 1000

export function isReopenGap(lastSeen: number, now: number): boolean {
  return now - lastSeen > REOPEN_GAP_THRESHOLD_MS
}
