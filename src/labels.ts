export const LABEL_COLOURS = [
  { id: 'red', name: 'Red', value: '#ef4444' },
  { id: 'orange', name: 'Orange', value: '#f97316' },
  { id: 'amber', name: 'Amber', value: '#eab308' },
  { id: 'green', name: 'Green', value: '#22c55e' },
  { id: 'teal', name: 'Teal', value: '#14b8a6' },
  { id: 'blue', name: 'Blue', value: '#3b82f6' },
  { id: 'violet', name: 'Violet', value: '#a855f7' },
  { id: 'pink', name: 'Pink', value: '#ec4899' },
  { id: 'grey', name: 'Grey', value: '#737373' },
] as const

export type LabelColourId = (typeof LABEL_COLOURS)[number]['id']

export type LabelId = string

export interface Label {
  id: LabelId
  name: string
  colourId: LabelColourId
  archived?: boolean
}

export const UNACCOUNTED_LABEL_ID: LabelId = 'label-unaccounted'
export const UNACCOUNTED_LABEL_NAME = 'Unaccounted'
export const UNACCOUNTED_LABEL_COLOUR_ID: LabelColourId = 'grey'

export function createUnaccountedLabel(): Label {
  return {
    id: UNACCOUNTED_LABEL_ID,
    name: UNACCOUNTED_LABEL_NAME,
    colourId: UNACCOUNTED_LABEL_COLOUR_ID,
    archived: false,
  }
}

export function isUnaccountedLabelId(labelId: LabelId | null): boolean {
  return labelId === UNACCOUNTED_LABEL_ID
}

export function isUnaccountedLabel(label: Label): boolean {
  return isUnaccountedLabelId(label.id)
}

export function isLabelArchived(label: Label): boolean {
  return label.archived ?? false
}

export function compareLabels(a: Label, b: Label): number {
  if (isUnaccountedLabel(a)) {
    return isUnaccountedLabel(b) ? 0 : 1
  }

  if (isUnaccountedLabel(b)) {
    return -1
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
}

export function getLabelColour(colourId: LabelColourId) {
  return (
    LABEL_COLOURS.find((colour) => colour.id === colourId) ?? LABEL_COLOURS[0]
  )
}

export function getLabelNameError(
  name: string,
  labels: Label[],
  exceptLabelId?: LabelId,
): string | null {
  if (name === '') {
    return 'Enter a label name.'
  }

  const lowerCaseName = name.toLowerCase()

  if (
    labels.some(
      (label) =>
        label.id !== exceptLabelId &&
        label.name.toLowerCase() === lowerCaseName,
    )
  ) {
    return 'A label with that name already exists.'
  }

  return null
}
