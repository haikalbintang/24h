import { useEffect, useRef, useState } from "react";
import { formatClock, parseClock } from "./day";
import { getBlockDuration } from "./blocks";
import type { Block } from "./blocks";
import { compareLabels, getLabelColour, isLabelArchived, isUnaccountedLabel } from "./labels";
import type { Label, LabelId } from "./labels";

function formatSplitClockInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 6);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}:${digits.slice(2)}`;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
}

function getEditLabelOptions(block: Block, labels: Label[]): Label[] {
  const selectable = labels.filter(
    (option) => block.end !== null || !isLabelArchived(option),
  );

  if (block.end === null) {
    return [...selectable].sort(compareLabels);
  }

  const active = selectable.filter(
    (option) => !isLabelArchived(option) && !isUnaccountedLabel(option),
  );
  const archived = selectable.filter(
    (option) => isLabelArchived(option) && !isUnaccountedLabel(option),
  );
  const unaccounted = selectable.filter(isUnaccountedLabel);

  const byName = (a: Label, b: Label) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

  return [
    ...active.sort(byName),
    ...archived.sort(byName),
    ...unaccounted,
  ];
}

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

const KebabIcon = () => (
  <Icon>
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </Icon>
);

interface BlockMenuItem {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

function BlockMenu({ items }: { items: BlockMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

      const menu = menuRef.current;
      if (menu === null) return;

      const menuItems = Array.from(
        menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      ).filter((button) => !button.disabled);

      if (menuItems.length === 0) return;

      const currentIndex = menuItems.findIndex(
        (button) => button === document.activeElement,
      );
      const step = event.key === "ArrowDown" ? 1 : -1;
      let nextIndex = currentIndex + step;

      if (currentIndex === -1) {
        nextIndex = event.key === "ArrowDown" ? 0 : menuItems.length - 1;
      } else if (nextIndex < 0) {
        nextIndex = menuItems.length - 1;
      } else if (nextIndex >= menuItems.length) {
        nextIndex = 0;
      }

      menuItems[nextIndex]?.focus();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Block actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More actions"
        onClick={() => setOpen((value) => !value)}
        className={`${iconButtonClass} hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600`}
      >
        <KebabIcon />
      </button>
      {open ? (
        <ul
          ref={menuRef}
          role="menu"
          aria-label="Block actions"
          className="absolute right-0 z-10 mt-1 min-w-36 rounded-lg border border-neutral-700 bg-neutral-900 p-1 shadow-lg"
        >
          {items.map((item) => (
            <li key={item.label} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none ${item.danger ? "text-red-400" : "text-neutral-200"
                  }`}
              >
                {item.icon}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200";

interface BlocksSectionProps {
  blocks: Block[];
  labels: Label[];
  now: number;
  dayStart: number;
  dayEnd: number;
  onRelabelBlock: (id: string, labelId: LabelId) => string | null;
  onSplitBlock: (id: string, at: number) => string | null;
}

export default function BlocksSection({
  blocks,
  labels,
  now,
  dayStart,
  dayEnd,
  onRelabelBlock,
  onSplitBlock,
}: BlocksSectionProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [splittingId, setSplittingId] = useState<string | null>(null);
  const [splitText, setSplitText] = useState("");
  const [splitError, setSplitError] = useState<string | null>(null);
  const [labelId, setLabelId] = useState<LabelId>("");
  const [error, setError] = useState<string | null>(null);
  const [isBlocksOpen, setIsBlocksOpen] = useState(true);
  const splitInputRef = useRef<HTMLInputElement | null>(null);
  const editLabelRef = useRef<HTMLSelectElement | null>(null);

  const labelMap = new Map(labels.map((label) => [label.id, label]));

  useEffect(() => {
    if (splittingId === null) return;
    splitInputRef.current?.focus();
  }, [splittingId]);

  useEffect(() => {
    if (editingId === null) return;
    editLabelRef.current?.focus();
  }, [editingId]);

  const todaysBlocks = blocks
    .filter((block) => block.start >= dayStart && block.start < dayEnd)
    .sort((a, b) => a.start - b.start);

  const startEditing = (block: Block) => {
    setEditingId(block.id);
    setLabelId(block.labelId);
    setError(null);
  };

  const startSplitting = (block: Block) => {
    const effectiveEnd = block.end ?? now;
    const midpoint = block.start + Math.floor((effectiveEnd - block.start) / 2);
    const min = block.start + 1;
    const max = effectiveEnd - 1;
    const clampedAt = Math.min(Math.max(midpoint, min), Math.max(min, max));

    setSplittingId(block.id);
    setSplitText(formatClock(clampedAt - dayStart));
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

    const result = onRelabelBlock(block.id, labelId);

    if (result) {
      setError(result);
      return;
    }

    setEditingId(null);
    setError(null);
  };

  return (
    <section
      aria-labelledby="blocks-heading"
      className="grid gap-6 border-t border-neutral-800 py-6"
    >
      <h2
        id="blocks-heading"
        className="text-xs font-semibold tracking-[0.28em] text-neutral-400 uppercase"
      >
        <button
          type="button"
          aria-expanded={isBlocksOpen}
          aria-controls="blocks-panel"
          onClick={() => setIsBlocksOpen((open) => !open)}
          className="flex items-center gap-2 uppercase hover:text-neutral-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
        >
          <span
            aria-hidden="true"
            className={`inline-block transition-transform ${isBlocksOpen ? "rotate-90" : ""}`}
          >
            ▸
          </span>
          Blocks
        </button>
      </h2>
      {isBlocksOpen ? (
        <div id="blocks-panel" className="grid gap-3">
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

                const compactStartLabel = formatClock(block.start - dayStart).slice(0, 5);
                const compactEndLabel =
                  block.end === null
                    ? "Now"
                    : formatClock(block.end - dayStart).slice(0, 5);

                return (
                  <li
                    key={block.id}
                    aria-describedby={`block-${block.id}-colour`}
                    className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 sm:px-4"
                  >
                    <div className="flex min-w-0 items-center gap-2 text-xs sm:flex-wrap sm:justify-between sm:gap-3 sm:text-sm">
                      <div className="flex min-w-0 items-center gap-2 sm:shrink-0">
                        {colour ? (
                          <span
                            aria-hidden="true"
                            className="relative flex h-3 w-3 shrink-0"
                          >
                            {block.end === null ? (
                              <span
                                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                                style={{ backgroundColor: colour.value }}
                              />
                            ) : null}
                            <span
                              className="relative inline-flex h-3 w-3 rounded-full"
                              style={{ backgroundColor: colour.value }}
                            />
                          </span>
                        ) : null}
                        <span className="truncate font-medium text-neutral-100">
                          {label ? label.name : "Unknown"}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-neutral-400 sm:flex-wrap sm:gap-3">
                        <span className="tabular-nums">
                          <span className="sm:hidden">
                            {compactStartLabel}–{compactEndLabel}
                          </span>
                          <span className="hidden sm:inline">
                            {startLabel} – {endLabel}
                          </span>
                        </span>
                        <span
                          className={`font-mono tabular-nums ${
                            block.end === null ? "font-medium text-neutral-100" : ""
                          }`}
                        >
                          {duration}
                        </span>
                        <BlockMenu
                          items={[
                            {
                              label: "Split",
                              icon: <ScissorsIcon />,
                              onSelect: () => startSplitting(block),
                            },
                            {
                              label: "Edit",
                              icon: <PencilIcon />,
                              onSelect: () => startEditing(block),
                            },
                          ]}
                        />
                      </div>
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
                            ref={splitInputRef}
                            value={splitText}
                            aria-invalid={splitError !== null}
                            inputMode="numeric"
                            placeholder="HH:MM:SS"
                            maxLength={8}
                            onChange={(event) => {
                              setSplitText(formatSplitClockInput(event.target.value));
                              setSplitError(null);
                            }}
                            className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-neutral-100 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
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
                            className="rounded-lg bg-neutral-100 px-4 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
                          >
                            Split
                          </button>
                          <button
                            type="button"
                            onClick={() => setSplittingId(null)}
                            className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
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
                            Label
                            <select
                              ref={editLabelRef}
                              value={labelId}
                              onChange={(event) => setLabelId(event.target.value)}
                              className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100"
                            >
                              {getEditLabelOptions(block, labels).map((option) => (
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
                            className="rounded-lg bg-neutral-100 px-4 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
                          >
                            Save block
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-neutral-700 px-4 py-1.5 text-sm text-neutral-200 hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
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
        </div>
      ) : null}
    </section>
  );
}