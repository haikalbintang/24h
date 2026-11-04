import { createLiveBlock, getNextBlockId } from './blocks'
import type { Block } from './blocks'
import { isReopenGap } from './heartbeat'
import {
  createUnaccountedLabel,
  getLabelColour,
  isLabelArchived,
  UNACCOUNTED_LABEL_ID,
  UNACCOUNTED_LABEL_NAME,
} from './labels'
import type { Label, LabelColourId, LabelId } from './labels'
import { localMidnightBefore } from './day'
import type { Runtime } from './runtime'
import { THEME_DARK, THEME_LIGHT, type ThemeId } from './theme'

export const STATE_STORAGE_KEY = 'day-labels.state.v1'
export const STATE_SCHEMA_VERSION = 1

export interface PersistedState {
  schemaVersion: number
  anchor: number
  labels: Label[]
  blocks: Block[]
  activeLabelId: LabelId | null
  lastSeen: number | null
  theme: ThemeId
}

export function createFreshPersistedState(now: number): PersistedState {
  const blocks: Block[] = [
    createLiveBlock(getNextBlockId([]), UNACCOUNTED_LABEL_ID, now),
  ]

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    anchor: localMidnightBefore(now),
    labels: [createUnaccountedLabel()],
    blocks,
    activeLabelId: UNACCOUNTED_LABEL_ID,
    lastSeen: now,
    theme: THEME_DARK,
  }
}

export function migratePersistedState(
  state: PersistedState,
  now: number,
): PersistedState {
  const idMap = new Map<LabelId, LabelId>()
  const labels: Label[] = [createUnaccountedLabel()]

  for (const label of state.labels) {
    const isBuiltIn =
      label.id === UNACCOUNTED_LABEL_ID ||
      label.name.trim().toLowerCase() === UNACCOUNTED_LABEL_NAME.toLowerCase()

    if (isBuiltIn) {
      if (label.id !== UNACCOUNTED_LABEL_ID) {
        idMap.set(label.id, UNACCOUNTED_LABEL_ID)
      }
      continue
    }

    labels.push(label)
  }

  const blocks = state.blocks.map((block) => {
    const labelId = idMap.get(block.labelId) ?? block.labelId
    return labelId === block.labelId ? block : { ...block, labelId }
  })

  const mappedActiveLabelId =
    state.activeLabelId === null
      ? null
      : (idMap.get(state.activeLabelId) ?? state.activeLabelId)

  // A running Block is the strongest evidence of what is active.
  const openBlock = blocks.find((block) => block.end === null)
  const openLabel = openBlock
    ? labels.find((label) => label.id === openBlock.labelId)
    : undefined

  let activeLabelId = mappedActiveLabelId

  if (openLabel !== undefined && !isLabelArchived(openLabel)) {
    activeLabelId = openLabel.id
  }

  if (
    activeLabelId === null ||
    !labels.some(
      (label) => label.id === activeLabelId && !isLabelArchived(label),
    )
  ) {
    activeLabelId = UNACCOUNTED_LABEL_ID
  }

  return ensureOpenBlock(
    { ...state, labels, blocks, activeLabelId },
    now,
  )
}

function ensureOpenBlock(state: PersistedState, now: number): PersistedState {
  if (state.blocks.some((block) => block.end === null)) {
    return state
  }

  const labelId = state.activeLabelId ?? UNACCOUNTED_LABEL_ID

  return {
    ...state,
    blocks: [
      ...state.blocks,
      createLiveBlock(getNextBlockId(state.blocks), labelId, now),
    ],
    activeLabelId: labelId,
    lastSeen: now,
  }
}

export function decodePersistedState(raw: string | null): PersistedState | null {
  if (raw === null) {
    return null
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const state = parsePersistedState(parsed)

  if (state === null) {
    return null
  }

  return state
}

function parsePersistedState(value: unknown): PersistedState | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const candidate = value as Record<string, unknown>

  if (candidate.schemaVersion !== STATE_SCHEMA_VERSION) {
    return null
  }
  if (typeof candidate.anchor !== 'number' || !Number.isFinite(candidate.anchor)) {
    return null
  }
  if (!Array.isArray(candidate.labels)) {
    return null
  }
  if (!Array.isArray(candidate.blocks)) {
    return null
  }
  if (candidate.activeLabelId !== null && typeof candidate.activeLabelId !== 'string') {
    return null
  }
  if (typeof candidate.lastSeen !== 'number' || !Number.isFinite(candidate.lastSeen)) {
    return null
  }
  if (candidate.theme !== THEME_DARK && candidate.theme !== THEME_LIGHT) {
    return null
  }

  const labels: Label[] = []

  for (const entry of candidate.labels) {
    if (!isLabel(entry)) {
      return null
    }
    labels.push(entry)
  }

  const blocks: Block[] = []

  for (const entry of candidate.blocks) {
    if (!isBlock(entry)) {
      return null
    }
    blocks.push({
      ...entry,
      source: (entry as { source?: unknown }).source === 'manual' ? 'manual' : 'live',
    })
  }

  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    anchor: candidate.anchor,
    labels,
    blocks,
    activeLabelId: candidate.activeLabelId,
    lastSeen: candidate.lastSeen,
    theme: candidate.theme,
  }
}

function isLabel(value: unknown): value is Label {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const label = value as Partial<Label>

  return (
    typeof label.id === 'string' &&
    typeof label.name === 'string' &&
    typeof label.colourId === 'string' &&
    getLabelColour(label.colourId as LabelColourId).id === label.colourId
  )
}

function isBlock(value: unknown): value is Omit<Block, 'source'> {
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
    endIsValid
  )
}

function advanceLastSeenWithinSilentWindow(
  state: PersistedState,
  now: number,
): PersistedState {
  const openBlock = state.blocks.find((block) => block.end === null)

  if (openBlock === undefined) {
    return state
  }

  const lastSeen = state.lastSeen ?? openBlock.start

  if (isReopenGap(lastSeen, now)) {
    // The gap is long enough that the user must decide how to account for it;
    // the reopen prompt takes over.
    return state
  }

  // The gap is within the silent window, so the Block simply continues.
  return { ...state, lastSeen: now }
}

export function loadPersistedState(runtime: Runtime, now: number): PersistedState {
  const restored = decodePersistedState(runtime.storage.getItem(STATE_STORAGE_KEY))

  const state =
    restored === null
      ? createFreshPersistedState(now)
      : migratePersistedState(restored, now)

  return advanceLastSeenWithinSilentWindow(state, now)
}

export function savePersistedState(runtime: Runtime, state: PersistedState): void {
  runtime.storage.setItem(STATE_STORAGE_KEY, JSON.stringify(state))
}
