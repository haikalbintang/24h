import { useEffect, useRef, useState } from "react";

const exportButtonClass =
  "min-h-8 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 transition-colors hover:border-neutral-500 focus:border-neutral-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-600";

interface ExportMenuProps {
  onExportJson: () => void;
  onExportCsv: () => void;
}

export default function ExportMenu({
  onExportJson,
  onExportCsv,
}: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (
        event.key !== "ArrowDown" &&
        event.key !== "ArrowUp" &&
        event.key !== "Home" &&
        event.key !== "End"
      ) {
        return;
      }

      const menu = menuRef.current;
      if (menu === null) return;

      const menuItems = Array.from(
        menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
      ).filter((button) => !button.disabled);

      if (menuItems.length === 0) return;

      event.preventDefault();

      if (event.key === "Home") {
        menuItems[0]?.focus();
        return;
      }
      if (event.key === "End") {
        menuItems[menuItems.length - 1]?.focus();
        return;
      }

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
        ref={triggerRef}
        type="button"
        aria-label="Export"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={exportButtonClass}
      >
        Export
      </button>
      {open ? (
        <ul
          ref={menuRef}
          role="menu"
          aria-label="Export"
          className="absolute right-0 z-10 mt-1 min-w-36 rounded-lg border border-neutral-700 bg-neutral-900 p-1 shadow-lg"
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExportJson();
              }}
              className="flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              Export JSON
            </button>
          </li>
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onExportCsv();
              }}
              className="flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none"
            >
              Export CSV
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
