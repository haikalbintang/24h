import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import BlockMenu from "./BlockMenu";
import type { BlockMenuItem } from "./BlockMenu";

describe("BlockMenu", () => {
  it("renders trigger button closed by default", () => {
    render(<BlockMenu items={[]} />);

    const trigger = screen.getByRole("button", { name: "Block actions" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens the menu and lists all items on click", async () => {
    const user = userEvent.setup();
    const items: BlockMenuItem[] = [
      { label: "Edit label", icon: <span>✏️</span>, onSelect: vi.fn() },
      { label: "Split block", icon: <span>✂️</span>, onSelect: vi.fn() },
    ];

    render(<BlockMenu items={items} />);

    await user.click(screen.getByRole("button", { name: "Block actions" }));

    const menu = screen.getByRole("menu", { name: "Block actions" });
    expect(menu).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Edit label/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: /Split block/i }),
    ).toBeInTheDocument();
  });

  it("calls onSelect and closes the menu when an item is selected", async () => {
    const user = userEvent.setup();
    const onSelectEdit = vi.fn();
    const items: BlockMenuItem[] = [
      { label: "Edit label", icon: <span>✏️</span>, onSelect: onSelectEdit },
    ];

    render(<BlockMenu items={items} />);

    await user.click(screen.getByRole("button", { name: "Block actions" }));
    await user.click(screen.getByRole("menuitem", { name: /Edit label/i }));

    expect(onSelectEdit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the menu on Escape and restores focus to trigger", async () => {
    const user = userEvent.setup();
    const items: BlockMenuItem[] = [
      { label: "Edit label", icon: <span>✏️</span>, onSelect: vi.fn() },
    ];

    render(<BlockMenu items={items} />);

    const trigger = screen.getByRole("button", { name: "Block actions" });
    await user.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("supports roving focus through menu items with ArrowDown, ArrowUp, Home, and End", async () => {
    const user = userEvent.setup();
    const items: BlockMenuItem[] = [
      { label: "First", icon: null, onSelect: vi.fn() },
      { label: "Second", icon: null, onSelect: vi.fn() },
      { label: "Third", icon: null, onSelect: vi.fn() },
    ];

    render(<BlockMenu items={items} />);

    await user.click(screen.getByRole("button", { name: "Block actions" }));

    const first = screen.getByRole("menuitem", { name: "First" });
    const second = screen.getByRole("menuitem", { name: "Second" });
    const third = screen.getByRole("menuitem", { name: "Third" });

    await user.keyboard("{ArrowDown}");
    expect(first).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(second).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(third).toHaveFocus();

    // Loops back to first
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveFocus();

    // ArrowUp loops to end
    await user.keyboard("{ArrowUp}");
    expect(third).toHaveFocus();

    // Home jumps to start
    await user.keyboard("{Home}");
    expect(first).toHaveFocus();

    // End jumps to last
    await user.keyboard("{End}");
    expect(third).toHaveFocus();
  });

  it("closes on pointer down outside the menu", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Outside</button>
        <BlockMenu
          items={[{ label: "Edit label", icon: null, onSelect: vi.fn() }]}
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Block actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("renders danger styling on danger items", async () => {
    const user = userEvent.setup();
    render(
      <BlockMenu
        items={[
          { label: "Delete", icon: null, onSelect: vi.fn(), danger: true },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Block actions" }));
    const item = screen.getByRole("menuitem", { name: "Delete" });
    expect(item).toHaveClass("text-red-400");
  });
});
