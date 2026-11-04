import { createLiveBlock, getNextBlockId } from './blocks'
import type { Block } from './blocks'
import { isReopenGap } from './heartbeat'
import {
  createUnaccountedLabel,
  getLabelColour,
  isLabelArchived,
  UNACCOUNTED_LABEL_COLOUR_ID,
  UNACCOUNTED_LABEL_ID,
  UNACCOUNTED_LABEL_NAME,
} from './labels'
import type { Label, LabelColourId, LabelId } from './labels'
import { localMidnightBefore } from './day'
import type { Runtime } from './runtime'
import { THEME_DARK, THEME_LIGHT, type ThemeId } from './theme'
import type { AccountSession } from './auth'

export const STATE_STORAGE_KEY = 'day-labels.state.v2'
export const LEGACY_STATE_STORAGE_KEY = 'day-labels.state.v1'
export const STATE_SCHEMA_VERSION = 2
export const LEGACY_STATE_SCHEMA_VERSION = 1
export { UNACCOUNTED_LABEL_ID } from './labels'

export interface SharedState {
  anchor: number
  labels: Label[]
  blocks: Block[]
  activeLabelId: LabelId
  heartbeat: number | null
}

export interface DeviceState {
  theme: ThemeId
  session: AccountSession | null
  /** The Account whose first sign-in was last resolved on this device. */
  syncedAccountId?: string
}

export interface PersistedDocumentV2 {
  schemaVersion: 2
  shared: SharedState
  device: DeviceState
}

export type PersistedState = PersistedDocumentV2

export interface LegacyPersistedStateV1 {
  schemaVersion: 1
  anchor: number
  labels: Array<{
    id: string
    name: string
    colourId: string
    archived?: boolean
    updatedAt?: number
  }>
  blocks: Array<{
    id: string
    labelId: string
    start: number
    end: number | null
    source?: string
    updatedAt?: number
  }>
  activeLabelId: string | null
  lastSeen: number | null
  theme: ThemeId
}

export function createFreshPersistedState(now: number): PersistedState {
  const anchor = localMidnightBefore(now)
  const blocks: Block[] = [
    createLiveBlock(getNextBlockId([]), UNACCOUNTED_LABEL_ID, now, now),
  ]

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    shared: {
      anchor,
      labels: [createUnaccountedLabel(now)],
      blocks,
      activeLabelId: UNACCOUNTED_LABEL_ID,
      heartbeat: now,
    },
    device: {
      theme: THEME_DARK,
      session: null,
    },
  }
}

export function decodePersistedState(
  raw: string | null,
  now: number = 0,
): PersistedState | null {
  if (raw === null) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }

  const candidate = parsed as Record<string, unknown>

  if (candidate.schemaVersion === STATE_SCHEMA_VERSION) {
    return parsePersistedStateV2(candidate, now)
  }

  if (candidate.schemaVersion === LEGACY_STATE_SCHEMA_VERSION) {
    return parseAndMigrateLegacyV1(candidate, now)
  }

  return null
}

function isLabelV2(value: unknown): value is Label {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const label = value as Partial<Label>

  return (
    typeof label.id === 'string' &&
    typeof label.name === 'string' &&
    typeof label.colourId === 'string' &&
    getLabelColour(label.colourId as LabelColourId).id === label.colourId &&
    typeof label.updatedAt === 'number' &&
    Number.isFinite(label.updatedAt)
  )
}

function isBlockV2(value: unknown): value is Block {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const block = value as Partial<Block>
  const endIsValid =
    block.end === null ||
    (typeof block.end === 'number' && Number.isFinite(block.end))

  return (
    typeof block.id === 'string' &&
    typeof block.labelId === 'string' &&
    typeof block.start === 'number' &&
    Number.isFinite(block.start) &&
    endIsValid &&
    typeof block.updatedAt === 'number' &&
    Number.isFinite(block.updatedAt)
  )
}

function parsePersistedStateV2(
  candidate: Record<string, unknown>,
  now: number,
): PersistedState | null {
  if (typeof candidate.shared !== 'object' || candidate.shared === null) {
    return null
  }
  if (typeof candidate.device !== 'object' || candidate.device === null) {
    return null
  }

  const shared = candidate.shared as Record<string, unknown>
  const device = candidate.device as Record<string, unknown>

  if (typeof shared.anchor !== 'number' || !Number.isFinite(shared.anchor)) {
    return null
  }
  if (!Array.isArray(shared.labels) || !Array.isArray(shared.blocks)) {
    return null
  }
  if (typeof shared.activeLabelId !== 'string') {
    return null
  }
  if (
    shared.heartbeat !== null &&
    (typeof shared.heartbeat !== 'number' || !Number.isFinite(shared.heartbeat))
  ) {
    return null
  }
  if (device.theme !== THEME_DARK && device.theme !== THEME_LIGHT) {
    return null
  }

  let session: AccountSession | null = null
  if (device.session !== undefined && device.session !== null) {
    if (
      typeof device.session !== 'object' ||
      typeof (device.session as Partial<AccountSession>).accountId !== 'string' ||
      typeof (device.session as Partial<AccountSession>).email !== 'string'
    ) {
      return null
    }
    session = {
      accountId: (device.session as AccountSession).accountId,
      email: (device.session as AccountSession).email,
    }
  }

  const labels: Label[] = []
  for (const entry of shared.labels) {
    if (!isLabelV2(entry)) {
      return null
    }
    labels.push({
      id: entry.id,
      name: entry.name,
      colourId: entry.colourId,
      archived: entry.archived ?? false,
      updatedAt: entry.updatedAt,
    })
  }

  const blocks: Block[] = []
  for (const entry of shared.blocks) {
    if (!isBlockV2(entry)) {
      return null
    }
    blocks.push({
      id: entry.id,
      labelId: entry.labelId,
      start: entry.start,
      end: entry.end,
      updatedAt: entry.updatedAt,
    })
  }

  return ensureValidV2State(
    {
      schemaVersion: STATE_SCHEMA_VERSION,
      shared: {
        anchor: shared.anchor,
        labels,
        blocks,
        activeLabelId: shared.activeLabelId,
        heartbeat: shared.heartbeat,
      },
      device: {
        theme: device.theme,
        session,
        ...(typeof device.syncedAccountId === 'string'
          ? { syncedAccountId: device.syncedAccountId }
          : {}),
      },
    },
    now,
  )
}

function parseAndMigrateLegacyV1(
  candidate: Record<string, unknown>,
  now: number,
): PersistedState | null {
  if (typeof candidate.anchor !== 'number' || !Number.isFinite(candidate.anchor)) {
    return null
  }
  if (!Array.isArray(candidate.labels) || !Array.isArray(candidate.blocks)) {
    return null
  }
  if (
    candidate.activeLabelId !== null &&
    typeof candidate.activeLabelId !== 'string'
  ) {
    return null
  }
  if (
    candidate.lastSeen !== null &&
    (typeof candidate.lastSeen !== 'number' || !Number.isFinite(candidate.lastSeen))
  ) {
    return null
  }
  if (candidate.theme !== THEME_DARK && candidate.theme !== THEME_LIGHT) {
    return null
  }

  const fallbackTimestamp = candidate.anchor

  const idMap = new Map<LabelId, LabelId>()
  let adoptedUnaccounted: Label | null = null
  const otherLabels: Label[] = []

  for (const entry of candidate.labels) {
    if (typeof entry !== 'object' || entry === null) {
      return null
    }
    const rawLabel = entry as Partial<Label>
    if (
      typeof rawLabel.id !== 'string' ||
      typeof rawLabel.name !== 'string' ||
      typeof rawLabel.colourId !== 'string' ||
      getLabelColour(rawLabel.colourId as LabelColourId).id !== rawLabel.colourId
    ) {
      return null
    }

    const updatedAt =
      typeof rawLabel.updatedAt === 'number' && Number.isFinite(rawLabel.updatedAt)
        ? rawLabel.updatedAt
        : fallbackTimestamp

    const isUnaccounted =
      rawLabel.id === UNACCOUNTED_LABEL_ID ||
      rawLabel.name.trim().toLowerCase() === UNACCOUNTED_LABEL_NAME.toLowerCase()

    if (isUnaccounted) {
      if (rawLabel.id !== UNACCOUNTED_LABEL_ID) {
        idMap.set(rawLabel.id, UNACCOUNTED_LABEL_ID)
      }
      if (adoptedUnaccounted === null) {
        adoptedUnaccounted = {
          id: UNACCOUNTED_LABEL_ID,
          name: UNACCOUNTED_LABEL_NAME,
          colourId: UNACCOUNTED_LABEL_COLOUR_ID,
          archived: false,
          updatedAt,
        }
      }
    } else {
      otherLabels.push({
        id: rawLabel.id,
        name: rawLabel.name,
        colourId: rawLabel.colourId as LabelColourId,
        archived: rawLabel.archived ?? false,
        updatedAt,
      })
    }
  }

  const labels: Label[] = [
    adoptedUnaccounted ?? createUnaccountedLabel(fallbackTimestamp),
    ...otherLabels,
  ]

  const blocks: Block[] = []
  for (const entry of candidate.blocks) {
    if (typeof entry !== 'object' || entry === null) {
      return null
    }
    const rawBlock = entry as Record<string, unknown>
    const endIsValid =
      rawBlock.end === null ||
      (typeof rawBlock.end === 'number' && Number.isFinite(rawBlock.end))
    if (
      typeof rawBlock.id !== 'string' ||
      typeof rawBlock.labelId !== 'string' ||
      typeof rawBlock.start !== 'number' ||
      !Number.isFinite(rawBlock.start) ||
      !endIsValid
    ) {
      return null
    }

    // Drops Manual Blocks
    if (rawBlock.source === 'manual') {
      continue
    }

    const labelId = idMap.get(rawBlock.labelId) ?? rawBlock.labelId
    const updatedAt =
      typeof rawBlock.updatedAt === 'number' && Number.isFinite(rawBlock.updatedAt)
        ? rawBlock.updatedAt
        : fallbackTimestamp

    // Removes source field and attaches updatedAt
    const isEndNull = rawBlock.end === null
    const end =
      isEndNull && candidate.activeLabelId === null
        ? ((candidate.lastSeen as number | null) ?? (rawBlock.start as number))
        : (rawBlock.end as number | null)

    blocks.push({
      id: rawBlock.id,
      labelId,
      start: rawBlock.start,
      end,
      updatedAt,
    })
  }

  let activeLabelId: LabelId = UNACCOUNTED_LABEL_ID
  if (candidate.activeLabelId !== null) {
    const mapped = idMap.get(candidate.activeLabelId) ?? candidate.activeLabelId
    activeLabelId = mapped
  }

  return ensureValidV2State(
    {
      schemaVersion: STATE_SCHEMA_VERSION,
      shared: {
        anchor: candidate.anchor,
        labels,
        blocks,
        activeLabelId,
        heartbeat: candidate.lastSeen ?? null,
      },
      device: {
        theme: candidate.theme,
        session: null,
      },
    },
    now,
  )
}

function ensureValidV2State(
  state: PersistedState,
  now: number,
): PersistedState {
  const { shared, device } = state
  let blocks = [...shared.blocks]
  const labels = [...shared.labels]

  if (!labels.some((l) => l.id === UNACCOUNTED_LABEL_ID)) {
    labels.unshift(createUnaccountedLabel(shared.anchor))
  }

  let activeLabelId = shared.activeLabelId
  if (
    !labels.some(
      (l) => l.id === activeLabelId && !isLabelArchived(l),
    )
  ) {
    activeLabelId = UNACCOUNTED_LABEL_ID
  }

  const openBlocks = blocks.filter((b) => b.end === null)

  if (openBlocks.length === 0) {
    blocks.push(createLiveBlock(getNextBlockId(blocks), activeLabelId, now, now))
  } else if (openBlocks.length > 1) {
    const sorted = [...blocks].sort((a, b) => a.start - b.start)
    const lastOpen = sorted.filter((b) => b.end === null).pop()!

    blocks = blocks.map((b) => {
      if (b.end === null && b !== lastOpen) {
        const nextBlock = sorted.find((other) => other.start > b.start)
        const closedEnd = nextBlock ? nextBlock.start : (shared.heartbeat ?? now)
        return {
          ...b,
          end: Math.max(b.start, closedEnd),
          updatedAt: Math.max(b.updatedAt ?? b.start, closedEnd),
        }
      }
      return b
    })
  }

  const finalOpenBlockIndex = blocks.findIndex((b) => b.end === null)
  const finalOpenBlock = blocks[finalOpenBlockIndex]

  if (finalOpenBlock.labelId !== activeLabelId) {
    const openLabel = labels.find((l) => l.id === finalOpenBlock.labelId)
    if (openLabel && !isLabelArchived(openLabel)) {
      activeLabelId = openLabel.id
    } else {
      blocks[finalOpenBlockIndex] = {
        ...finalOpenBlock,
        labelId: activeLabelId,
        updatedAt: now,
      }
    }
  }

  const heartbeat =
    shared.heartbeat === undefined
      ? finalOpenBlock.start
      : shared.heartbeat

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    shared: {
      ...shared,
      labels,
      blocks,
      activeLabelId,
      heartbeat,
    },
    device,
  }
}

export function migratePersistedState(
  state: unknown,
  now: number,
): PersistedState {
  if (typeof state === 'string') {
    return decodePersistedState(state, now) ?? createFreshPersistedState(now)
  }
  if (typeof state === 'object' && state !== null) {
    return (
      decodePersistedState(JSON.stringify(state), now) ??
      createFreshPersistedState(now)
    )
  }
  return createFreshPersistedState(now)
}

function advanceHeartbeatWithinSilentWindow(
  state: PersistedState,
  now: number,
): PersistedState {
  const openBlock = state.shared.blocks.find((block) => block.end === null)

  if (openBlock === undefined) {
    return state
  }

  const heartbeat = state.shared.heartbeat ?? openBlock.start

  if (isReopenGap(heartbeat, now)) {
    return state
  }

  return {
    ...state,
    shared: {
      ...state.shared,
      heartbeat: now,
    },
  }
}

export function loadPersistedState(runtime: Runtime, now: number): PersistedState {
  let raw = runtime.storage.getItem(STATE_STORAGE_KEY)
  if (raw === null) {
    raw = runtime.storage.getItem(LEGACY_STATE_STORAGE_KEY)
  }

  const restored = decodePersistedState(raw, now)

  const state =
    restored === null
      ? createFreshPersistedState(now)
      : restored

  return advanceHeartbeatWithinSilentWindow(state, now)
}

export function savePersistedState(runtime: Runtime, state: PersistedState): void {
  runtime.storage.setItem(STATE_STORAGE_KEY, JSON.stringify(state))
}
