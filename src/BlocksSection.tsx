import { useState } from "react";
import { formatClock, parseClock } from "./day";
import { getBlockDuration } from "./blocks";
import type { Block } from "./blocks";
import { getLabelColour } from "./labels";
import type { Label, LabelId } from "./labels";

export interface BlockEditRequest {
  start: number;
  end: number | null;
  labelId: LabelId;
}

interface BlocksSectionProps {
  blocks: Block[];
  labels: Label[];
  now: number;
  dayStart: number;
  dayEnd: number;
  onEditBlock: (id: string, edit: BlockEditRequest) => string | null;
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
  onSplitBlock,
  onDeleteBlock,
}: BlocksSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [splitText, setSplitText] = useState("");
  const [splitError, setSplitError] = useState<string | null>(null);
  const [startText, setStartText] = useState("");
  const [endText, setEndText] = useState("");
  const [labelId, setLabelId] = useState<LabelId>("");
  const [error, setError] = useState<string | null>(null);

  const labelMap = new Map(labels.map((label) => [label.id, label]));

  const todaysBlocks = blocks
    .filter((block) => block.start >= dayStart && block.start < dayEnd)
    .sort((a, b) => a.start - b.start);

  const startEditing = (block: Block) => {
    setEditingId(block.id);
    setStartText(formatClock(block.start - dayStart));
    setEndText(block.end === null ? "" : formatClock(block.end - dayStart));
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

  const saveBlock = (event: React.FormEvent<HTMLFormElement>, block: Block) => {
    event.preventDefault();

    const startOffset = parseClock(startText);
    const endOffset = block.end === null ? null : parseClock(endText);

    if (startOffset === null || (block.end !== null && endOffset === null)) {
      setError("Enter times as HH:MM:SS.");
      return;
    }

    const result = onEditBlock(block.id, {
      start: dayStart + startOffset,
      end: endOffset === null ? null : dayStart + endOffset,
      labelId,
    });

    if (result) {
      setError(result);
      return;
    }

    setEditingId(null);
    setError(null);
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
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
                  <span>
                    {startLabel} – {endLabel}
                  </span>
                  <span className="font-mono tabular-nums">{duration}</span>
                  <button
                    type="button"
                    aria-label="Edit block"
                    onClick={() => startEditing(block)}
                    className="rounded-lg border border-neutral-700 px-3 py-1 text-neutral-200 hover:border-neutral-500"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    aria-label="Split block"
                    onClick={() => startSplitting(block)}
                    className="rounded-lg border border-neutral-700 px-3 py-1 text-neutral-200 hover:border-neutral-500"
                  >
                    Split
                  </button>
                  {block.end === null ? null : (
                    <button
                      type="button"
                      aria-label="Delete block"
                      onClick={() => onDeleteBlock(block.id)}
                      className="rounded-lg border border-neutral-700 px-3 py-1 text-neutral-200 hover:border-red-500"
                    >
                      Delete
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
                    aria-label="Edit block"
                    onSubmit={(event) => saveBlock(event, block)}
                    className="grid w-full gap-3 pt-2"
                  >
                    <div className="flex flex-wrap gap-3">
                      <label className="grid gap-1 text-xs text-neutral-400">
                        Start
                        <input
                          value={startText}
                          aria-invalid={error !== null}
                          onChange={(event) => {
                            setStartText(event.target.value);
                            setError(null);
                          }}
                          className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-100"
                        />
                      </label>
                      {block.end === null ? null : (
                        <label className="grid gap-1 text-xs text-neutral-400">
                          End
                          <input
                            value={endText}
                            aria-invalid={error !== null}
                            onChange={(event) => {
                              setEndText(event.target.value);
                              setError(null);
                            }}
                            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-100"
                          />
                        </label>
                      )}
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
                        Save block
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
    </section>
  );
}
