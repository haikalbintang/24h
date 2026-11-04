import type { Block } from './blocks'
import type { AccountSession } from './auth'
import {
  isUnaccountedLabelId,
  UNACCOUNTED_LABEL_COLOUR_ID,
  UNACCOUNTED_LABEL_ID,
  UNACCOUNTED_LABEL_NAME,
  type Label,
} from './labels'
import type { SharedState } from './persistence'

export interface RemoteDocument {
  version: number
  shared: SharedState
}

export type SyncPushResult =
  | { status: 'success'; document: RemoteDocument }
  | { status: 'conflict'; remote: RemoteDocument }
  | { status: 'offline'; error?: string }

export type SyncPullResult =
  | { status: 'success'; document: RemoteDocument | null }
  | { status: 'offline'; error?: string }

export interface SyncAdapter {
  pull(accountId: string): Promise<SyncPullResult>
  push(
    accountId: string,
    shared: SharedState,
    baseVersion: number | null,
  ): Promise<SyncPushResult>
}

export function mergeSharedState(
  local: SharedState,
  remote: SharedState,
): SharedState {
  const mergedLabelsMap = new Map<string, Label>()

  const allLabels = [...local.labels, ...remote.labels]
  let unaccountedUpdatedAt = 0

  for (const label of allLabels) {
    if (isUnaccountedLabelId(label.id)) {
      unaccountedUpdatedAt = Math.max(unaccountedUpdatedAt, label.updatedAt ?? 0)
      continue
    }

    // A non-unaccounted id cannot take the name 'Unaccounted' (case-insensitive)
    if (label.name.trim().toLowerCase() === UNACCOUNTED_LABEL_NAME.toLowerCase()) {
      continue
    }

    const existing = mergedLabelsMap.get(label.id)
    if (!existing) {
      mergedLabelsMap.set(label.id, label)
    } else {
      const existingUpdated = existing.updatedAt ?? 0
      const currentUpdated = label.updatedAt ?? 0
      if (currentUpdated > existingUpdated) {
        mergedLabelsMap.set(label.id, label)
      }
    }
  }

  const unaccountedLabel: Label = {
    id: UNACCOUNTED_LABEL_ID,
    name: UNACCOUNTED_LABEL_NAME,
    colourId: UNACCOUNTED_LABEL_COLOUR_ID,
    archived: false,
    updatedAt: unaccountedUpdatedAt,
  }

  const mergedLabels = [unaccountedLabel, ...mergedLabelsMap.values()]

  // Merge blocks
  const mergedBlocksMap = new Map<string, Block>()
  const allBlocks = [...local.blocks, ...remote.blocks]

  for (const block of allBlocks) {
    const existing = mergedBlocksMap.get(block.id)
    if (!existing) {
      mergedBlocksMap.set(block.id, block)
    } else {
      const existingUpdated = existing.updatedAt ?? 0
      const currentUpdated = block.updatedAt ?? 0
      if (currentUpdated > existingUpdated) {
        mergedBlocksMap.set(block.id, block)
      }
    }
  }

  const mergedBlocks = Array.from(mergedBlocksMap.values()).sort(
    (a, b) => a.start - b.start || a.id.localeCompare(b.id),
  )

  // Determine active label: from the winning open block if any
  const openBlocks = mergedBlocks.filter((b) => b.end === null)
  let activeLabelId = local.activeLabelId
  let finalBlocks = mergedBlocks

  if (openBlocks.length > 0) {
    // Winner is the open block with the latest updatedAt or start
    const winningOpenBlock = openBlocks.reduce((latest, current) => {
      const latestTime = latest.updatedAt ?? latest.start
      const currentTime = current.updatedAt ?? current.start
      return currentTime >= latestTime ? current : latest
    }, openBlocks[0])

    activeLabelId = winningOpenBlock.labelId

    if (openBlocks.length > 1) {
      finalBlocks = mergedBlocks.map((block) => {
        if (block.end === null && block.id !== winningOpenBlock.id) {
          return {
            ...block,
            end: Math.max(block.start, winningOpenBlock.start),
            updatedAt: Math.max(block.updatedAt ?? 0, winningOpenBlock.start),
          }
        }
        return block
      })
    }
  } else {
    // If no open blocks, fallback to UNACCOUNTED_LABEL_ID
    activeLabelId = UNACCOUNTED_LABEL_ID
  }

  let mergedHeartbeat: number | null = null
  if (local.heartbeat !== null && remote.heartbeat !== null) {
    mergedHeartbeat = Math.max(local.heartbeat, remote.heartbeat)
  } else if (local.heartbeat !== null) {
    mergedHeartbeat = local.heartbeat
  } else if (remote.heartbeat !== null) {
    mergedHeartbeat = remote.heartbeat
  }

  return {
    anchor: Math.min(local.anchor, remote.anchor),
    labels: mergedLabels,
    blocks: finalBlocks,
    activeLabelId,
    heartbeat: mergedHeartbeat,
  }
}

export interface SyncCoordinatorOptions {
  sync: SyncAdapter
  getSharedState?: () => SharedState
  setSharedState?: (next: SharedState) => void
  getSession?: () => AccountSession | null
  sharedRef?: { current: SharedState }
  sessionRef?: { current: AccountSession | null }
  onRemoteMerged?: (next: SharedState) => void
  debounceMs?: number
  pollIntervalMs?: number
}

export class SyncCoordinator {
  private sync: SyncAdapter
  private getSharedState: () => SharedState
  private setSharedState: (next: SharedState) => void
  private getSession: () => AccountSession | null
  private baseVersion: number | null = null
  private queued: boolean = false
  private queuedSince: number | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private debounceMs: number
  private inFlight: boolean = false

  constructor(options: SyncCoordinatorOptions) {
    this.sync = options.sync
    this.getSharedState = options.sharedRef
      ? () => options.sharedRef!.current
      : (options.getSharedState ?? (() => { throw new Error('shared state not provided') }))
    this.setSharedState = options.onRemoteMerged
      ? options.onRemoteMerged
      : (options.setSharedState ?? (() => {}))
    this.getSession = options.sessionRef
      ? () => options.sessionRef!.current
      : (options.getSession ?? (() => null))
    this.debounceMs = options.debounceMs ?? 2000
  }

  isQueued(): boolean {
    return this.queued
  }

  getBaseVersion(): number | null {
    return this.baseVersion
  }

  setBaseVersion(version: number | null): void {
    this.baseVersion = version
  }

  notifyMutation(now?: number): void {
    const session = this.getSession()
    if (!session) {
      return
    }
    this.queued = true
    if (this.queuedSince === null) {
      this.queuedSince = now ?? Date.now()
    }
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null
      void this.flush()
    }, this.debounceMs)
  }

  checkDebounce(now: number): void {
    if (
      this.queued &&
      this.queuedSince !== null &&
      now - this.queuedSince >= this.debounceMs
    ) {
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer)
        this.debounceTimer = null
      }
      void this.flush()
    }
  }

  async pull(): Promise<void> {
    const session = this.getSession()
    if (!session || this.inFlight) {
      return
    }

    if (this.queued) {
      await this.flush()
      return
    }

    this.inFlight = true
    try {
      const result = await this.sync.pull(session.accountId)
      if (result.status === 'success' && result.document) {
        if (this.baseVersion === null || result.document.version > this.baseVersion) {
          const currentShared = this.getSharedState()
          const merged = mergeSharedState(currentShared, result.document.shared)
          this.baseVersion = result.document.version
          this.setSharedState(merged)
        }
      }
    } finally {
      this.inFlight = false
    }
  }

  async flush(): Promise<void> {
    const session = this.getSession()
    if (!session) {
      return
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (!this.queued) {
      return
    }

    if (this.inFlight) {
      return
    }

    this.inFlight = true
    try {
      while (this.queued) {
        const currentShared = this.getSharedState()
        const result = await this.sync.push(
          session.accountId,
          currentShared,
          this.baseVersion,
        )

        if (result.status === 'success') {
          this.baseVersion = result.document.version
          this.queued = false
          this.queuedSince = null
          break
        } else if (result.status === 'conflict') {
          // Merge conflict: merge remote with local and retry without losing local edits
          const merged = mergeSharedState(currentShared, result.remote.shared)
          this.baseVersion = result.remote.version
          this.setSharedState(merged)
          // Keep queued = true so it loops and retries pushing the merged state!
        } else if (result.status === 'offline') {
          // Offline changes queue and flush later
          break
        }
      }
    } finally {
      this.inFlight = false
    }
  }

  destroy(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }
    this.queued = false
    this.queuedSince = null
    this.baseVersion = null
  }
}
