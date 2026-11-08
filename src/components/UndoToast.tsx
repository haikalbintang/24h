interface UndoToastProps {
  archiveUndoVisible: boolean;
  error: string | null;
  onUndo: () => void;
}

export default function UndoToast({
  archiveUndoVisible,
  error,
  onUndo,
}: UndoToastProps) {
  if (!archiveUndoVisible && !error) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Undo"
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm shadow-lg"
    >
      {archiveUndoVisible ? (
        <>
          <span>Label archived.</span>
          <button
            type="button"
            onClick={onUndo}
            className="min-h-6 px-1 font-semibold text-neutral-100 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600"
          >
            Undo
          </button>
        </>
      ) : (
        <span>{error}</span>
      )}
    </div>
  );
}
