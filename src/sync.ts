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

export type FirstSignInChoice = 'merge' | 'replace'

/** True when Shared state holds anything beyond a fresh Unaccounted-only start. */
export function hasUserData(shared: SharedState): boolean {
  return (
    shared.labels.some((label) => !isUnaccountedLabelId(label.id)) ||
    shared.blocks.length > 1
  )
}

/**
 * Resolves the first sign-in into a non-empty Account. Merge combines both
 * sides under the earliest Anchor (Day indices derive from the Anchor, so they
 * rebase with it); Replace keeps the remote Shared state only.
 */
export function resolveFirstSignIn(
  local: SharedState,
  remote: SharedState,
  choice: FirstSignInChoice,
): SharedState {
  return choice === 'merge' ? mergeSharedState(local, remote) : remote
}

export interface SyncCoordinatorOptions {
  sync: SyncAdapter
  getSyncedAccountId?: () => string | null
  onAccountSynced?: (accountId: string) => void
  onFirstSignIn?: (
    local: SharedState,
    remote: SharedState,
  ) => Promise<FirstSignInChoice>

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
  private resolvedAccountId: string | null = null
  private getSyncedAccountId: () => string | null
  private onAccountSynced: (accountId: string) => void
  private onFirstSignIn:
    | ((local: SharedState, remote: SharedState) => Promise<FirstSignInChoice>)
    | undefined

  constructor(options: SyncCoordinatorOptions) {
    this.sync = options.sync
    this.getSyncedAccountId = options.getSyncedAccountId ?? (() => null)
    this.onAccountSynced = options.onAccountSynced ?? (() => {})
    this.onFirstSignIn = options.onFirstSignIn
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

    if (this.queued && !this.needsFirstSync(session.accountId)) {
      await this.flush()
      return
    }

    this.inFlight = true
    let pushAfter = false
    try {
      const result = await this.sync.pull(session.accountId)
      if (result.status !== 'success') {
        return
      }

      const remote = result.document
      if (remote === null) {
        this.markSynced(session.accountId)
      } else if (
        this.needsFirstSync(session.accountId) &&
        hasUserData(this.getSharedState()) &&
        hasUserData(remote.shared)
      ) {
        const choice = await this.onFirstSignIn!(this.getSharedState(), remote.shared)
        if (this.getSession()?.accountId !== session.accountId) {
          return
        }
        // Local edits may land while the choice is pending; resolve against the latest.
        const resolved = resolveFirstSignIn(this.getSharedState(), remote.shared, choice)
        this.baseVersion = remote.version
        this.setSharedState(resolved)
        this.markSynced(session.accountId)
        if (choice === 'merge') {
          // The merged result differs from the remote, so it must be pushed.
          this.queued = true
          this.queuedSince = this.queuedSince ?? Date.now()
        }
      } else if (this.baseVersion === null || remote.version > this.baseVersion) {
        const merged = mergeSharedState(this.getSharedState(), remote.shared)
        this.baseVersion = remote.version
        this.setSharedState(merged)
        this.markSynced(session.accountId)
      } else {
        this.markSynced(session.accountId)
      }
      pushAfter = this.queued
    } finally {
      this.inFlight = false
    }

    if (pushAfter) {
      await this.flush()
    }
  }

  private needsFirstSync(accountId: string): boolean {
    if (!this.onFirstSignIn) {
      return false
    }
    return (this.resolvedAccountId ?? this.getSyncedAccountId()) !== accountId
  }

  private markSynced(accountId: string): void {
    this.resolvedAccountId = accountId
    this.onAccountSynced(accountId)
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

    if (this.needsFirstSync(session.accountId)) {
      // Never push into an Account before its first sign-in has been resolved.
      await this.pull()
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
    this.resolvedAccountId = null
  }
}
