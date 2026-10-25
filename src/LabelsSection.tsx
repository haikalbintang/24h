import { useEffect, useRef, useState } from 'react'
import ColourRadioGroup from './ColourRadioGroup'
import {
  getLabelColour,
  getLabelNameError,
  LABEL_COLOURS,
} from './labels'
import type { Label, LabelColourId, LabelId } from './labels'

export default function LabelsSection() {
  const [labels, setLabels] = useState<Label[]>([])
  const [activeLabelId, setActiveLabelId] = useState<LabelId | null>(null)
  const nextLabelId = useRef(1)
  const [newLabelName, setNewLabelName] = useState('')
  const [newLabelColourId, setNewLabelColourId] = useState<LabelColourId>(
    LABEL_COLOURS[0].id,
  )
  const [createError, setCreateError] = useState<string | null>(null)
  const [editingLabelId, setEditingLabelId] = useState<LabelId | null>(null)
  const [editLabelName, setEditLabelName] = useState('')
  const [editLabelColourId, setEditLabelColourId] = useState<LabelColourId>(
    LABEL_COLOURS[0].id,
  )
  const [editError, setEditError] = useState<string | null>(null)

  const activeLabel =
    labels.find((label) => label.id === activeLabelId) ?? null

  const toggleLabel = (labelId: LabelId) => {
    setActiveLabelId((current) => (current === labelId ? null : labelId))
  }

  const startEditingLabel = (label: Label) => {
    setEditingLabelId(label.id)
    setEditLabelName(label.name)
    setEditLabelColourId(label.colourId)
    setEditError(null)
  }

  const cancelEditingLabel = () => {
    setEditingLabelId(null)
    setEditError(null)
  }

  const saveLabel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (editingLabelId === null) {
      return
    }

    const name = editLabelName.trim()
    const error = getLabelNameError(name, labels, editingLabelId)

    if (error) {
      setEditError(error)
      return
    }

    setLabels((current) =>
      current.map((label) =>
        label.id === editingLabelId
          ? { ...label, name, colourId: editLabelColourId }
          : label,
      ),
    )
    setEditingLabelId(null)
    setEditError(null)
  }

  const createLabel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = newLabelName.trim()
    const error = getLabelNameError(name, labels)

    if (error) {
      setCreateError(error)
      return
    }

    setLabels((current) => [
      ...current,
      { id: `label-${nextLabelId.current++}`, name, colourId: newLabelColourId },
    ])
    setNewLabelName('')
    setNewLabelColourId(LABEL_COLOURS[0].id)
    setCreateError(null)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return
      }

      const position = Number(event.key)
      if (!Number.isInteger(position) || position < 1 || position > 9) {
        return
      }

      const label = labels[position - 1]
      if (label) {
        setActiveLabelId(label.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [labels])

  return (
    <section
      aria-labelledby="labels-heading"
      className="grid gap-6 border-t border-neutral-800 pt-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2
          id="labels-heading"
          className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase"
        >
          Labels
        </h2>
        <div className="flex items-center gap-2">
          <p
            role="status"
            aria-label="Active label"
            aria-describedby={activeLabel ? 'active-label-colour' : undefined}
            className="flex items-center gap-2 text-lg font-medium text-neutral-100"
          >
            {activeLabel ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full"
                  style={{
                    backgroundColor: getLabelColour(activeLabel.colourId).value,
                  }}
                />
                {activeLabel.name}
              </>
            ) : (
              'Unlabeled'
            )}
          </p>
          {activeLabel ? (
            <span id="active-label-colour" className="sr-only">
              {getLabelColour(activeLabel.colourId).name}
            </span>
          ) : null}
        </div>
      </div>

      {labels.length === 0 ? (
        <p className="text-sm text-neutral-400">No labels yet.</p>
      ) : (
        <ul aria-label="Labels" className="flex flex-wrap gap-3">
          {labels.map((label) => {
            const colour = getLabelColour(label.colourId)

            return (
              <li key={label.id}>
                <button
                  type="button"
                  aria-pressed={activeLabelId === label.id}
                  aria-describedby={`label-${label.id}-colour`}
                  onClick={() => toggleLabel(label.id)}
                  className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500 aria-pressed:border-neutral-200 aria-pressed:bg-neutral-100 aria-pressed:text-neutral-950"
                >
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: colour.value }}
                  />
                  {label.name}
                </button>
                <span id={`label-${label.id}-colour`} className="sr-only">
                  {colour.name}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <div className="grid gap-3">
        <h3 className="text-sm font-semibold text-neutral-200">
          Manage labels
        </h3>
        {labels.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Create a label to manage it here.
          </p>
        ) : (
          <ul aria-label="Label manager" className="grid gap-3">
            {labels.map((label) => {
              const colour = getLabelColour(label.colourId)

              return (
                <li
                  key={label.id}
                  className="rounded-xl border border-neutral-800 bg-neutral-900/60"
                >
                  {editingLabelId === label.id ? (
                    <form
                      aria-label={`Edit ${label.name}`}
                      onSubmit={saveLabel}
                      className="grid gap-3 p-4"
                    >
                      <div className="grid gap-2">
                        <label
                          htmlFor={`edit-label-name-${label.id}`}
                          className="text-xs font-medium text-neutral-400"
                        >
                          Label name
                        </label>
                        <input
                          id={`edit-label-name-${label.id}`}
                          value={editLabelName}
                          aria-invalid={editError !== null}
                          onChange={(event) => {
                            setEditLabelName(event.target.value)
                            setEditError(null)
                          }}
                          className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
                        />
                        {editError ? (
                          <p role="alert" className="text-sm text-red-400">
                            {editError}
                          </p>
                        ) : null}
                      </div>
                      <ColourRadioGroup
                        name="edit-label-colour"
                        value={editLabelColourId}
                        onChange={setEditLabelColourId}
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="submit"
                          className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
                        >
                          Save changes
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditingLabel}
                          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: colour.value }}
                        />
                        <span className="text-sm font-medium text-neutral-100">
                          {label.name}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {colour.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => startEditingLabel(label)}
                        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:border-neutral-500"
                      >
                        Edit {label.name}
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <form
        aria-label="Create label"
        onSubmit={createLabel}
        className="grid gap-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-5"
      >
        <h3 className="text-sm font-semibold text-neutral-200">
          Create a label
        </h3>
        <div className="grid gap-2">
          <label
            htmlFor="new-label-name"
            className="text-xs font-medium text-neutral-400"
          >
            New label name
          </label>
          <input
            id="new-label-name"
            value={newLabelName}
            aria-invalid={createError !== null}
            onChange={(event) => {
              setNewLabelName(event.target.value)
              setCreateError(null)
            }}
            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400"
          />
          {createError ? (
            <p role="alert" className="text-sm text-red-400">
              {createError}
            </p>
          ) : null}
        </div>
        <ColourRadioGroup
          name="new-label-colour"
          value={newLabelColourId}
          onChange={setNewLabelColourId}
        />
        <button
          type="submit"
          className="justify-self-start rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
        >
          Create label
        </button>
      </form>
    </section>
  )
}
