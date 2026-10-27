import { useRef } from "react";
import type { KeyboardEvent } from "react";

interface ReopenPromptProps {
  labelName: string | null;
  onEnd: () => void;
  onKeep: () => void;
}

export default function ReopenPrompt({
  labelName,
  onEnd,
  onKeep,
}: ReopenPromptProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") {
      return;
    }

    const container = dialogRef.current;
    if (container === null) {
      return;
    }

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((button) => !button.disabled);
    const first = buttons[0];
    const last = buttons[buttons.length - 1];

    if (first === undefined || last === undefined) {
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/80 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reopen-prompt-title"
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6"
      >
        <h2
          id="reopen-prompt-title"
          className="text-lg font-semibold text-neutral-50"
        >
          You were away
        </h2>
        <p className="mt-3 text-sm text-neutral-300">
          No heartbeat was recorded for over two minutes.
        </p>
        {labelName ? (
          <p className="mt-1 text-sm text-neutral-400">
            Your Block for {labelName} is still open.
          </p>
        ) : (
          <p className="mt-1 text-sm text-neutral-400">
            Your Block is still open.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onEnd}
            autoFocus
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-white"
          >
            End Block
          </button>
          <button
            type="button"
            onClick={onKeep}
            className="rounded-lg border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-100 hover:border-neutral-500"
          >
            Keep Label
          </button>
        </div>
      </div>
    </div>
  );
}
