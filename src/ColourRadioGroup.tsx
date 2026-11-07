import { LABEL_COLOURS } from './labels'
import type { LabelColourId } from './labels'

export interface ColourRadioGroupProps {
  name: string
  value: LabelColourId
  onChange: (colourId: LabelColourId) => void
}

export default function ColourRadioGroup({
  name,
  value,
  onChange,
}: ColourRadioGroupProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-xs font-medium text-neutral-400">
        Colour
      </legend>
      <div className="flex flex-wrap gap-4">
        {LABEL_COLOURS.map((colour) => {
          const inputId = `${name}-${colour.id}`
          return (
            <label
              key={colour.id}
              htmlFor={inputId}
              className="flex min-h-6 cursor-pointer items-center gap-2 text-sm text-neutral-200"
            >
              <input
                id={inputId}
                type="radio"
                name={name}
                value={colour.id}
                checked={value === colour.id}
                onChange={() => onChange(colour.id)}
                className="accent-neutral-300"
              />
              <span
                aria-hidden="true"
                className="h-3 w-3 rounded-full forced-color-adjust-none"
                style={{ backgroundColor: colour.value }}
              />
              {colour.name}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
