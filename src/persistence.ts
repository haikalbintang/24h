import { closeActiveBlock } from './blocks'
import type { Block } from './blocks'
import { getLabelColour } from './labels'
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
  return {
    schemaVersion: STATE_SCHEMA_VERSION,
    anchor: localMidnightBefore(now),
    labels: [],
    blocks: [],
    activeLabelId: null,
    lastSeen: now,
    theme: THEME_DARK,
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

  return resolveOpenBlock(state)
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
    blocks.push(entry)
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

function isBlock(value: unknown): value is Block {
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

function resolveOpenBlock(state: PersistedState): PersistedState {
  const openBlock = state.blocks.find((block) => block.end === null)

  if (openBlock === undefined) {
    return state
  }

  return {
    ...state,
    blocks: closeActiveBlock(state.blocks, state.lastSeen ?? openBlock.start),
    activeLabelId: null,
  }
}

export function loadPersistedState(runtime: Runtime, now: number): PersistedState {
  const restored = decodePersistedState(runtime.storage.getItem(STATE_STORAGE_KEY))

  return restored ?? createFreshPersistedState(now)
}

export function savePersistedState(runtime: Runtime, state: PersistedState): void {
  runtime.storage.setItem(STATE_STORAGE_KEY, JSON.stringify(state))
}
