import { useEffect, useRef, useState } from "react";

const iconButtonClass =
  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 text-neutral-200";

function KebabIcon() {
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
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}

export interface BlockMenuItem {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

export default function BlockMenu({ items }: { items: BlockMenuItem[] }) {
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
                className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-neutral-800 focus:bg-neutral-800 focus:outline-none ${
                  item.danger ? "text-red-400" : "text-neutral-200"
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
