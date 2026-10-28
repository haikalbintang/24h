import { useState } from "react";
import { formatClock, parseClock } from "./day";
import { getBlockDuration } from "./blocks";
import type { Block } from "./blocks";
import { getLabelColour } from "./labels";
import type { Label, LabelId } from "./labels";

function Icon({ children }: { children: React.ReactNode }) {
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

const PencilIcon = () => (
  <Icon>
    <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    <path d="m15 5 4 4" />
  </Icon>
);

const ScissorsIcon = () => (
  <Icon>
    <circle cx="6" cy="6" r="3" />
    <path d="M8.12 8.12 12 12" />
    <path d="M20 4 8.12 15.88" />
    <circle cx="6" cy="18" r="3" />
    <path d="M14.8 14.8 20 20" />
  </Icon>
);

const TrashIcon = () => (
  <Icon>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" x2="10" y1="11" y2="17" />
    <line x1="14" x2="14" y1="11" y2="17" />
  </Icon>
);

const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200";

export interface BlockEditRequest {
  start: number;
  end: number | null;
  labelId: LabelId;
}

export interface ManualBlockRequest {
  start: number;
  end: number;
  labelId: LabelId;
}

interface BlocksSectionProps {
  blocks: Block[];
  labels: Label[];
  now: number;
  dayStart: number;
  dayEnd: number;
  onEditBlock: (id: string, edit: BlockEditRequest) => string | null;
  onAddManualBlock: (edit: ManualBlockRequest) => string | null;
  onSplitBlock: (id: string, at: number) => string | null;
  onDeleteBlock: (id: string) => void;
}

export default function BlocksSection({
  blocks,
  labels,
  now,
  dayStart,
  dayEnd,
  onEditBlock,
  onAddManualBlock,
  onSplitBlock,
  onDeleteBlock,
}: BlocksSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [splitText, setSplitText] = useState("");
  const [splitError, setSplitError] = useState<string | null>(null);
  const [manualStartText, setManualStartText] = useState("");
  const [manualEndText, setManualEndText] = useState("");
  const [manualLabelId, setManualLabelId] = useState<LabelId>("");
  const [manualError, setManualError] = useState<string | null>(null);
  const [labelId, setLabelId] = useState<LabelId>("");
  const [error, setError] = useState<string | null>(null);
  const [isManualOpen, setIsManualOpen] = useState(false);

  const labelMap = new Map(labels.map((label) => [label.id, label]));

  const todaysBlocks = blocks
    .filter((block) => block.start >= dayStart && block.start < dayEnd)
    .sort((a, b) => a.start - b.start);

  const startEditing = (block: Block) => {
    setEditingId(block.id);
    setLabelId(block.labelId);
    setError(null);
  };

  const startSplitting = (block: Block) => {
    setSplittingId(block.id);
    setSplitText("");
    setSplitError(null);
  };

  const saveSplit = (event: React.FormEvent<HTMLFormElement>, block: Block) => {
    event.preventDefault();

    const offset = parseClock(splitText);

    if (offset === null) {
      setSplitError("Enter times as HH:MM:SS.");
      return;
    }

    const result = onSplitBlock(block.id, dayStart + offset);

    if (result) {
      setSplitError(result);
      return;
    }

    setSplittingId(null);
    setSplitError(null);
  };

  const addManualBlock = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const startOffset = parseClock(manualStartText);
    const endOffset = parseClock(manualEndText);
    const chosenLabelId = manualLabelId || (labels[0]?.id ?? "");

    if (startOffset === null || endOffset === null) {
      setManualError("Enter times as HH:MM:SS.");
      return;
    }

    if (chosenLabelId === "") {
      setManualError("Create a label first.");
      return;
    }

    const result = onAddManualBlock({
      start: dayStart + startOffset,
      end: dayStart + endOffset,
      labelId: chosenLabelId,
    });

    if (result) {
      setManualError(result);
      return;
    }

    closeManual();
  };

  const saveBlock = (event: React.FormEvent<HTMLFormElement>, block: Block) => {
    event.preventDefault();

    // Preserve exact existing start and end timestamps
    const result = onEditBlock(block.id, {
      start: block.start,
      end: block.end,
      labelId,
    });

    if (result) {
      setError(result);
      return;
    }

    setEditingId(null);
    setError(null);
  };

  const closeManual = () => {
    setIsManualOpen(false);
    setManualStartText("");
    setManualEndText("");
    setManualLabelId("");
    setManualError(null);
  };

  return (
    <section aria-labelledby="blocks-heading" className="grid gap-3">
      <h2
        id="blocks-heading"
        className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase"
      >
        Blocks
      </h2>
      {todaysBlocks.length === 0 ? (
        <p className="text-sm text-neutral-400">No blocks yet.</p>
      ) : (
        <ul aria-label="Blocks" className="grid gap-2">
          {todaysBlocks.map((block) => {
            const label = labelMap.get(block.labelId);
            const colour = label ? getLabelColour(label.colourId) : null;
            const startLabel = formatClock(block.start - dayStart);
            const endLabel =
              block.end === null
                ? "Ongoing"
                : formatClock(block.end - dayStart);
            const duration = formatClock(getBlockDuration(block, now));

            return (
              <li
                key={block.id}
                aria-describedby={`block-${block.id}-colour`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2"
              >
                <div className="flex items-center gap-2">
                  {colour ? (
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: colour.value }}
                    />
                  ) : null}
                  <span className="text-sm font-medium text-neutral-100">
                    {label ? label.name : "Unknown"}
                  </span>
                  {block.source === "manual" ? (
                    <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-xs text-neutral-400">
                      Manual
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
                  <span>
                    {startLabel} – {endLabel}
                  </span>
                  <span className="font-mono tabular-nums">{duration}</span>
                  <button
                    type="button"
                    aria-label="Edit block label"
                    title="Edit label"
                    onClick={() => startEditing(block)}
                    className={`${iconButtonClass} hover:border-neutral-500`}
                  >
                    <PencilIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Split block"
                    title="Split"
                    onClick={() => startSplitting(block)}
                    className={`${iconButtonClass} hover:border-neutral-500`}
                  >
                    <ScissorsIcon />
                  </button>
                  {block.end === null ? null : (
                    <button
                      type="button"
                      aria-label="Delete block"
                      title="Delete"
                      onClick={() => onDeleteBlock(block.id)}
                      className={`${iconButtonClass} hover:border-red-500 hover:text-red-400`}
                    >
                      <TrashIcon />
                    </button>
                  )}
                </div>
                {splittingId === block.id ? (
                  <form
                    aria-label="Split block"
                    onSubmit={(event) => saveSplit(event, block)}
                    className="grid w-full gap-3 pt-2"
                  >
                    <label className="grid gap-1 text-xs text-neutral-400">
                      Split at
                      <input
                        value={splitText}
                        aria-invalid={splitError !== null}
                        onChange={(event) => {
                          setSplitText(event.target.value);
                          setSplitError(null);
                        }}
                        className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-100"
                      />
                    </label>
                    {splitError ? (
                      <p role="alert" className="text-sm text-red-400">
                        {splitError}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded-lg bg-neutral-100 px-4 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-white"
                      >
                        Split
                      </button>
                      <button
                        type="button"
                        onClick={() => setSplittingId(null)}
                        className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-200 hover:border-neutral-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
                {editingId === block.id ? (
                  <form
                    aria-label="Edit block label"
                    onSubmit={(event) => saveBlock(event, block)}
                    className="grid w-full gap-3 pt-2"
                  >
                    <div className="flex flex-wrap gap-3">
                      <label className="grid gap-1 text-xs text-neutral-400">
                        Label
                        <select
                          value={labelId}
                          onChange={(event) => setLabelId(event.target.value)}
                          className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100"
                        >
                          {labels.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {error ? (
                      <p role="alert" className="text-sm text-red-400">
                        {error}
                      </p>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="rounded-lg bg-neutral-100 px-4 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-white"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-200 hover:border-neutral-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
                <span id={`block-${block.id}-colour`} className="sr-only">
                  {colour ? colour.name : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {isManualOpen ? (
        <form
          id="manual-block-form"
          aria-label="Add manual block"
          onSubmit={addManualBlock}
          className="grid gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
        >
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1 text-xs text-neutral-400">
              New start
              <input
                autoFocus
                value={manualStartText}
                aria-invalid={manualError !== null}
                onChange={(event) => {
                  setManualStartText(event.target.value);
                  setManualError(null);
                }}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-100"
              />
            </label>
            <label className="grid gap-1 text-xs text-neutral-400">
              New end
              <input
                value={manualEndText}
                aria-invalid={manualError !== null}
                onChange={(event) => {
                  setManualEndText(event.target.value);
                  setManualError(null);
                }}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-100"
              />
            </label>
            <label className="grid gap-1 text-xs text-neutral-400">
              Label
              <select
                value={manualLabelId || (labels[0]?.id ?? "")}
                onChange={(event) => setManualLabelId(event.target.value)}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100"
              >
                {labels.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {manualError ? (
            <p role="alert" className="text-sm text-red-400">
              {manualError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-lg bg-neutral-100 px-4 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-white"
            >
              Add manual block
            </button>
            <button
              type="button"
              onClick={closeManual}
              className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-200 hover:border-neutral-500"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}