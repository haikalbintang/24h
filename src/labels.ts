export const LABEL_COLOURS = [
  { id: 'red', name: 'Red', value: '#ef4444' },
  { id: 'orange', name: 'Orange', value: '#f97316' },
  { id: 'amber', name: 'Amber', value: '#eab308' },
  { id: 'green', name: 'Green', value: '#22c55e' },
  { id: 'teal', name: 'Teal', value: '#14b8a6' },
  { id: 'blue', name: 'Blue', value: '#3b82f6' },
  { id: 'violet', name: 'Violet', value: '#a855f7' },
  { id: 'pink', name: 'Pink', value: '#ec4899' },
] as const

export type LabelColourId = (typeof LABEL_COLOURS)[number]['id']

export type LabelId = string

export interface Label {
  id: LabelId
  name: string
  colourId: LabelColourId
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
