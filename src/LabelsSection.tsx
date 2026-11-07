import { useCallback, useEffect, useMemo, useState } from "react";
import ColourRadioGroup from "./ColourRadioGroup";
import {
  UNACCOUNTED_MARKER_CLASS,
  compareLabels,
  getLabelColour,
  isLabelArchived,
  isUnaccountedLabel,
  LABEL_COLOURS,
} from "./labels";
import type { Label, LabelColourId, LabelId } from "./labels";
import BlocksSection from "./BlocksSection";
import type { Block } from "./blocks";

function ManageIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const EditLabelIcon = () => (
  <ManageIcon>
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
  </ManageIcon>
);

const ArchiveLabelIcon = () => (
  <ManageIcon>
    <rect width="20" height="5" x="2" y="3" rx="1" />
    <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
    <path d="M10 12h4" />
  </ManageIcon>
);

const RestoreLabelIcon = () => (
  <ManageIcon>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </ManageIcon>
);

const manageIconButtonClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200 hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600";
const manageDangerIconButtonClass =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-900/60 text-red-400 hover:border-red-700 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600";

interface LabelsSectionProps {
  now: number;
  dayStart: number;
  dayEnd: number;
  labels: Label[];
  activeLabelId: LabelId | null;
  dynamicBlocks: Block[];
  shortcutsEnabled: boolean;
  onRelabelBlock: (id: string, labelId: LabelId) => string | null;
  onSplitBlock: (id: string, at: number) => string | null;
  onSelectLabel: (labelId: LabelId | null) => void;
  onToggleLabel: (labelId: LabelId) => void;
  onCreateLabel: (name: string, colourId: LabelColourId) => string | null;
  onRenameLabel: (
    labelId: LabelId,
    name: string,
    colourId: LabelColourId,
  ) => string | null;
  onArchiveLabel: (labelId: LabelId) => void;
  onRestoreLabel: (labelId: LabelId) => void;
}

export default function LabelsSection({
  now,
  dayStart,
  dayEnd,
  labels,
  activeLabelId,
  dynamicBlocks,
  shortcutsEnabled,
  onRelabelBlock,
  onSplitBlock,
  onSelectLabel,
  onToggleLabel,
  onCreateLabel,
  onRenameLabel,
  onArchiveLabel,
  onRestoreLabel,
}: LabelsSectionProps) {
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColourId, setNewLabelColourId] = useState<LabelColourId>(
    LABEL_COLOURS[0].id,
  );
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<LabelId | null>(null);
  const [editLabelName, setEditLabelName] = useState("");
  const [editLabelColourId, setEditLabelColourId] = useState<LabelColourId>(
    LABEL_COLOURS[0].id,
  );
  const [editError, setEditError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [isLabelsOpen, setIsLabelsOpen] = useState(true);

  const sortedLabels = useMemo(
    () =>
      [...labels]
        .filter((label) => !isLabelArchived(label))
        .sort(compareLabels),
    [labels],
  );
  const managedLabels = [...labels]
    .filter((label) => !isUnaccountedLabel(label))
    .sort(compareLabels);
  const activeLabel =
    sortedLabels.find((label) => label.id === activeLabelId) ?? null;

  const startEditingLabel = (label: Label) => {
    setEditingLabelId(label.id);
    setEditLabelName(label.name);
    setEditLabelColourId(label.colourId);
    setEditError(null);
  };

  const cancelEditingLabel = () => {
    setEditingLabelId(null);
    setEditError(null);
  };

  const saveLabel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (editingLabelId === null) {
      return;
    }

    const name = editLabelName.trim();
    const error = onRenameLabel(editingLabelId, name, editLabelColourId);

    if (error) {
      setEditError(error);
      return;
    }

    setEditingLabelId(null);
    setEditError(null);
  };

  const toggleCreateForm = () => {
    setIsCreateOpen((open) => !open);
    setCreateError(null);
  };

  const createLabel = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = newLabelName.trim();
    const error = onCreateLabel(name, newLabelColourId);

    if (error) {
      setCreateError(error);
      return;
    }

    setNewLabelName("");
    setNewLabelColourId(LABEL_COLOURS[0].id);
    setCreateError(null);
    setIsCreateOpen(false); // collapse after creating
  };

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!shortcutsEnabled) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const position = Number(event.key);
      if (!Number.isInteger(position) || position < 1 || position > 9) {
        return;
      }

      const label = sortedLabels[position - 1];
      if (label) {
        onSelectLabel(label.id);
      }
    },
    [sortedLabels, onSelectLabel, shortcutsEnabled],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onKeyDown]);

  return (<>
    <BlocksSection
      blocks={dynamicBlocks}
      labels={labels}
      now={now}
      dayStart={dayStart}
      dayEnd={dayEnd}
      onRelabelBlock={onRelabelBlock}
      onSplitBlock={onSplitBlock}
    />
    <section
      aria-labelledby="labels-heading"
      className="grid gap-6 border-t border-neutral-800 pt-6"
    >



      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="labels-heading"
          className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase"
        >
          <button
            type="button"
            aria-expanded={isLabelsOpen}
            aria-controls="labels-panel"
            onClick={() => setIsLabelsOpen((open) => !open)}
            className="flex min-h-6 items-center gap-2 py-1 uppercase hover:text-neutral-200 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
          >
            <span
              aria-hidden="true"
              className={`inline-block motion-safe:transition-transform ${isLabelsOpen ? "rotate-90" : ""}`}
            >
              ▸
            </span>
            Labels
          </button>
        </h2>
        <div className="flex items-center gap-2">
          <p
            role="status"
            aria-label="Active label"
            aria-describedby={activeLabel ? "active-label-colour" : undefined}
            className="flex items-center gap-2 text-lg font-medium text-neutral-100"
          >
            {activeLabel ? (
              isUnaccountedLabel(activeLabel) ? (
                <>
                  <span
                    aria-hidden="true"
                    className={`h-4 w-4 shrink-0 forced-color-adjust-none ${UNACCOUNTED_MARKER_CLASS}`}
                  />
                  {activeLabel.name}
                </>
              ) : (
                <>
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 rounded-full forced-color-adjust-none"
                    style={{
                      backgroundColor: getLabelColour(activeLabel.colourId).value,
                    }}
                  />
                  {activeLabel.name}
                </>
              )
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className={`h-4 w-4 shrink-0 forced-color-adjust-none ${UNACCOUNTED_MARKER_CLASS}`}
                />
                Unaccounted
              </>
            )}
          </p>
          {activeLabel ? (
            <span id="active-label-colour" className="sr-only">
              {getLabelColour(activeLabel.colourId).name}
            </span>
          ) : null}
        </div>
      </div>

      {isLabelsOpen ? (
        <div id="labels-panel" className="grid gap-6">
          {labels.length === 0 ? (
            <p className="text-sm text-neutral-400">No labels yet.</p>
          ) : null}

          <ul aria-label="Labels" className="flex flex-wrap gap-3">
            {sortedLabels.map((label, index) => {
              const colour = getLabelColour(label.colourId);
              const unaccounted = isUnaccountedLabel(label);

              return (
                <li key={label.id}>
                  <button
                    type="button"
                    aria-pressed={activeLabelId === label.id}
                    aria-keyshortcuts={index < 9 ? String(index + 1) : undefined}
                    aria-describedby={`label-${label.id}-colour`}
                    onClick={() => onToggleLabel(label.id)}
                    className="flex items-center gap-2 rounded-full border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600 aria-pressed:border-neutral-200 aria-pressed:bg-neutral-100 aria-pressed:text-neutral-950"
                  >
                    <span
                      aria-hidden="true"
                      className={
                        unaccounted
                          ? `h-3 w-3 shrink-0 forced-color-adjust-none ${UNACCOUNTED_MARKER_CLASS}`
                          : "h-3 w-3 rounded-full forced-color-adjust-none"
                      }
                      style={
                        unaccounted ? undefined : { backgroundColor: colour.value }
                      }
                    />
                    {label.name}
                  </button>
                  <span id={`label-${label.id}-colour`} className="sr-only">
                    {colour.name}
                  </span>
                </li>
              );
            })}

            <li>
              <button
                type="button"
                aria-expanded={isCreateOpen}
                aria-controls="create-label-form"
                onClick={toggleCreateForm}
                className="flex items-center gap-2 rounded-full border border-dashed border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600 aria-expanded:border-neutral-200 aria-expanded:text-neutral-100"
              >
                <span aria-hidden="true">{isCreateOpen ? "−" : "+"}</span>
                New label
              </button>
            </li>
          </ul>

          {isCreateOpen ? (
            <form
              id="create-label-form"
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
                  name="label-name"
                  autoComplete="off"
                  autoFocus
                  value={newLabelName}
                  aria-invalid={createError !== null}
                  aria-describedby={
                    createError ? "new-label-name-error" : undefined
                  }
                  onChange={(event) => {
                    setNewLabelName(event.target.value);
                    setCreateError(null);
                  }}
                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-600"
                />
                {createError ? (
                  <p
                    id="new-label-name-error"
                    role="alert"
                    className="text-sm text-red-400"
                  >
                    {createError}
                  </p>
                ) : null}
              </div>
              <ColourRadioGroup
                name="new-label-colour"
                value={newLabelColourId}
                onChange={setNewLabelColourId}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
                >
                  Create label
                </button>
                <button
                  type="button"
                  onClick={toggleCreateForm}
                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : null}

          <div className="grid gap-3">
            <h3 className="text-xs font-medium tracking-[0.18em] text-neutral-500 uppercase">
              <button
                type="button"
                aria-expanded={isManageOpen}
                aria-controls="manage-labels-panel"
                onClick={() => setIsManageOpen((open) => !open)}
                className="flex min-h-6 items-center gap-2 py-1 uppercase hover:text-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
              >
                <span
                  aria-hidden="true"
                  className={`inline-block motion-safe:transition-transform ${isManageOpen ? "rotate-90" : ""}`}
                >
                  ▸
                </span>
                Manage labels
              </button>
            </h3>

            {isManageOpen ? (
              <div id="manage-labels-panel">
                {managedLabels.length === 0 ? (
                  <p className="text-sm text-neutral-400">
                    Create a label to manage it here.
                  </p>
                ) : (
                  <ul aria-label="Label manager" className="grid gap-3">
                    {managedLabels.map((label) => {
                      const colour = getLabelColour(label.colourId);

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
                                  name="label-name"
                                  autoComplete="off"
                                  value={editLabelName}
                                  aria-invalid={editError !== null}
                                  aria-describedby={
                                    editError
                                      ? `edit-label-name-error-${label.id}`
                                      : undefined
                                  }
                                  onChange={(event) => {
                                    setEditLabelName(event.target.value);
                                    setEditError(null);
                                  }}
                                  className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-400 focus-visible:ring-2 focus-visible:ring-neutral-600"
                                />
                                {editError ? (
                                  <p
                                    id={`edit-label-name-error-${label.id}`}
                                    role="alert"
                                    className="text-sm text-red-400"
                                  >
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
                                  className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
                                >
                                  Save changes
                                </button>
                                <button
                                  type="button"
                                  onClick={cancelEditingLabel}
                                  className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:border-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            </form>
                          ) : (
                            <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span
                                  aria-hidden="true"
                                  className="h-3 w-3 shrink-0 rounded-full forced-color-adjust-none"
                                  style={{ backgroundColor: colour.value }}
                                />
                                <span className="truncate text-sm font-medium text-neutral-100">
                                  {label.name}
                                </span>
                                <span className="hidden shrink-0 text-xs text-neutral-500 sm:inline">
                                  {colour.name}
                                </span>
                                {isLabelArchived(label) ? (
                                  <span className="shrink-0 rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-[11px] font-medium text-neutral-400">
                                    Archived
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                                <button
                                  type="button"
                                  aria-label={`Edit ${label.name}`}
                                  title={`Edit ${label.name}`}
                                  onClick={() => startEditingLabel(label)}
                                  className={manageIconButtonClass}
                                >
                                  <EditLabelIcon />
                                </button>
                                <button
                                  type="button"
                                  aria-label={
                                    isLabelArchived(label)
                                      ? `Restore ${label.name}`
                                      : `Archive ${label.name}`
                                  }
                                  title={
                                    isLabelArchived(label)
                                      ? `Restore ${label.name}`
                                      : `Archive ${label.name}`
                                  }
                                  onClick={() => {
                                    if (editingLabelId === label.id) {
                                      cancelEditingLabel();
                                    }
                                    if (isLabelArchived(label)) {
                                      onRestoreLabel(label.id);
                                    } else {
                                      onArchiveLabel(label.id);
                                    }
                                  }}
                                  className={manageDangerIconButtonClass}
                                >
                                  {isLabelArchived(label) ? (
                                    <RestoreLabelIcon />
                                  ) : (
                                    <ArchiveLabelIcon />
                                  )}
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

    </section></>
  );
}
