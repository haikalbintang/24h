import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "@/app/App";
import { createTestRuntime } from "@/testing/runtime";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

const at = (iso: string) => new Date(iso).getTime();

function setup(now = at("2026-03-08T05:30:00.000Z")) {
  const runtime = createTestRuntime(now);
  const user = userEvent.setup();

  render(<App runtime={runtime} />);

  return { runtime, user };
}

async function createLabel(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  colour = "Blue",
) {
  // The create-label form lives behind the "New label" toggle.
  await user.click(screen.getByRole("button", { name: "New label" }));

  const form = screen.getByRole("form", { name: "Create label" });

  await user.type(
    within(form).getByRole("textbox", { name: "New label name" }),
    name,
  );
  await user.click(within(form).getByRole("radio", { name: colour }));
  await user.click(within(form).getByRole("button", { name: "Create label" }));
}

const blocksList = () => screen.getByRole("list", { name: "Blocks" });
const blockItems = () => within(blocksList()).getAllByRole("listitem");

describe("Blocks", () => {
  it("opens a Block at the current second when a label is chosen", async () => {
    const { user } = setup();

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));

    expect(blockItems()).toHaveLength(1);
    expect(blockItems()[0]).toHaveTextContent("Work");
    expect(blockItems()[0]).toHaveTextContent("00:30:00");
    expect(blockItems()[0]).toHaveTextContent(/ongoing/i);
    expect(blockItems()[0]).toHaveTextContent("00:00:00");
  });

  it("shows a live duration for the ongoing Block", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));

    act(() => runtime.clock.advance(5 * SECOND_MS));

    expect(blockItems()[0]).toHaveTextContent("00:00:05");
    expect(blockItems()[0]).toHaveTextContent(/ongoing/i);
  });

  it("closes the current Block and opens the next at the same instant when switching", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await createLabel(user, "Rest", "Green");

    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(10 * SECOND_MS));
    await user.click(screen.getByRole("button", { name: "Rest" }));

    const items = blockItems();

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Work");
    expect(items[0]).toHaveTextContent("00:30:00");
    expect(items[0]).toHaveTextContent("00:30:10");
    expect(items[0]).not.toHaveTextContent(/ongoing/i);

    expect(items[1]).toHaveTextContent("Rest");
    expect(items[1]).toHaveTextContent("00:30:10");
    expect(items[1]).toHaveTextContent(/ongoing/i);
  });

  it("closes the Block and starts an Unaccounted Block when deselecting", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(5 * SECOND_MS));
    await user.click(screen.getByRole("button", { name: "Work" }));

    expect(
      screen.getByRole("status", { name: "Active label" }),
    ).toHaveTextContent("Unaccounted");
    expect(blockItems()).toHaveLength(2);
    expect(blockItems()[0]).toHaveTextContent("00:00:05");
    expect(blockItems()[0]).not.toHaveTextContent(/ongoing/i);
    expect(blockItems()[1]).toHaveTextContent("Unaccounted");
    expect(blockItems()[1]).toHaveTextContent(/ongoing/i);
  });

  it("lists Blocks chronologically with label, start, end, and duration", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await createLabel(user, "Rest", "Green");

    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * SECOND_MS));
    await user.click(screen.getByRole("button", { name: "Rest" }));
    act(() => runtime.clock.advance(15 * SECOND_MS));

    const items = blockItems();

    expect(items[0]).toHaveTextContent("Work");
    expect(items[0]).toHaveTextContent("00:30:00");
    expect(items[0]).toHaveTextContent("00:30:30");
    expect(items[0]).toHaveTextContent("00:00:30");

    expect(items[1]).toHaveTextContent("Rest");
    expect(items[1]).toHaveTextContent("00:30:30");
    expect(items[1]).toHaveTextContent(/ongoing/i);
    expect(items[1]).toHaveTextContent("00:00:15");
  });

  it("updates its Blocks when a label is renamed and recoloured", async () => {
    const { user } = setup();

    await createLabel(user, "Work", "Blue");
    await user.click(screen.getByRole("button", { name: "Work" }));

    // The label manager lives behind a collapsible panel.
    await user.click(screen.getByRole("button", { name: "Manage labels" }));

    await user.click(screen.getByRole("button", { name: "Edit Work" }));

    const form = screen.getByRole("form", { name: "Edit Work" });
    const nameInput = within(form).getByRole("textbox", { name: "Label name" });

    await user.clear(nameInput);
    await user.type(nameInput, "Focus");
    await user.click(within(form).getByRole("radio", { name: "Amber" }));
    await user.click(
      within(form).getByRole("button", { name: "Save changes" }),
    );

    expect(blockItems()[0]).toHaveTextContent("Focus");
    expect(blockItems()[0]).toHaveAccessibleDescription("Amber");
  });

  it("ends the Block at a Day boundary and resumes under the same label", async () => {
    const { runtime, user } = setup(at("2026-03-10T03:59:59.000Z"));

    expect(screen.getByRole("timer", { name: "Day clock" })).toHaveTextContent(
      "23:59:59",
    );

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));

    expect(blockItems()[0]).toHaveTextContent("23:59:59");

    act(() => runtime.clock.advance(SECOND_MS));

    expect(screen.getByRole("timer", { name: "Day clock" })).toHaveTextContent(
      "00:00:00",
    );
    expect(blockItems()).toHaveLength(1);
    expect(blockItems()[0]).toHaveTextContent("Work");
    expect(blockItems()[0]).toHaveTextContent("00:00:00 – Ongoing");
    expect(blockItems()[0]).toHaveTextContent("00:00:00");

    act(() => runtime.clock.advance(SECOND_MS));

    expect(blockItems()[0]).toHaveTextContent("00:00:00 – Ongoing");
    expect(blockItems()[0]).toHaveTextContent("00:00:01");
  });

  it("splits across every Day boundary when the clock jumps", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));

    act(() => runtime.clock.advance(54 * HOUR_MS));

    expect(screen.getByRole("timer", { name: "Day clock" })).toHaveTextContent(
      "06:30:00",
    );
    expect(screen.getByText("Mar 10, 2026")).toBeInTheDocument();
    expect(blockItems()).toHaveLength(1);
    expect(blockItems()[0]).toHaveTextContent("00:00:00 – Ongoing");
    expect(blockItems()[0]).toHaveTextContent("06:30:00");
  });

  it("keeps the same Block when its number key is pressed again", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await createLabel(user, "Rest", "Green");

    await user.keyboard("1");
    act(() => runtime.clock.advance(5 * SECOND_MS));
    await user.keyboard("1");

    expect(blockItems()).toHaveLength(1);
    expect(blockItems()[0]).toHaveTextContent("Rest");
    expect(blockItems()[0]).toHaveTextContent("00:30:00");
    expect(blockItems()[0]).toHaveTextContent("00:00:05");
    expect(blockItems()[0]).toHaveTextContent(/ongoing/i);

    await user.keyboard("2");

    expect(blockItems()).toHaveLength(2);
    expect(blockItems()[1]).toHaveTextContent("Work");
    expect(blockItems()[1]).toHaveTextContent("00:30:05");
    expect(blockItems()[1]).toHaveTextContent(/ongoing/i);
  });
});

async function setupTwoBlocks() {
  const ctx = setup();
  const { runtime, user } = ctx;

  await createLabel(user, "Work");
  await createLabel(user, "Rest", "Green");
  await user.click(screen.getByRole("button", { name: "Work" }));
  act(() => runtime.clock.advance(10 * MINUTE_MS));
  await user.click(screen.getByRole("button", { name: "Rest" }));
  act(() => runtime.clock.advance(10 * MINUTE_MS));
  await user.click(screen.getByRole("button", { name: "Rest" }));

  return ctx;
}

async function openBlockEditForm(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
) {
  await user.click(
    within(blockItems()[index]).getByRole("button", { name: "Block actions" }),
  );
  await user.click(
    within(screen.getByRole("menu", { name: "Block actions" })).getByRole("menuitem", { name: "Edit" }),
  );

  return screen.getByRole("form", { name: "Edit block" });
}

async function relabelBlock(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  label: string,
) {
  const form = await openBlockEditForm(user, index);

  await user.selectOptions(
    within(form).getByRole("combobox", { name: "Label" }),
    label,
  );
  await user.click(within(form).getByRole("button", { name: "Save block" }));
}

const optionNames = (form: HTMLElement) =>
  within(form)
    .getAllByRole("option")
    .map((option) => option.textContent);

describe("Block corrections", () => {
  const dayTotals = () =>
    screen.getByRole("list", { name: "Selected day totals" });

  it("exposes only the Label in the edit form", async () => {
    const { user } = await setupTwoBlocks();

    const form = await openBlockEditForm(user, 0);

    expect(within(form).getByRole("combobox", { name: "Label" })).toBeInTheDocument();
    expect(within(form).queryByRole("textbox")).toBeNull();
  });

  it("relabels a finished Block without moving its boundaries", async () => {
    const { user } = await setupTwoBlocks();

    await relabelBlock(user, 0, "Unaccounted");

    expect(screen.queryByRole("form", { name: "Edit block" })).toBeNull();
    expect(blockItems()[0]).toHaveTextContent("Unaccounted");
    expect(blockItems()[0]).toHaveTextContent("00:30:00 – 00:40:00");
    expect(dayTotals()).toHaveTextContent("00:10:00");
  });

  it("offers every Label for a finished Block, active then archived alphabetically, with Unaccounted last", async () => {
    const { user } = await setupTwoBlocks();

    await user.click(screen.getByRole("button", { name: "Manage labels" }));
    await user.click(screen.getByRole("button", { name: "Archive Work" }));

    const form = await openBlockEditForm(user, 1);

    expect(optionNames(form)).toEqual(["Rest", "Work", "Unaccounted"]);

    await user.selectOptions(
      within(form).getByRole("combobox", { name: "Label" }),
      "Work",
    );
    await user.click(within(form).getByRole("button", { name: "Save block" }));

    // The relabelled Block fuses with the adjacent Work Block.
    expect(blockItems()).toHaveLength(2);
    expect(blockItems()[0]).toHaveTextContent("Work");
    expect(blockItems()[0]).toHaveTextContent("00:30:00 – 00:50:00");
  });

  it("offers only non-archived Labels for the active Block, alphabetically with Unaccounted last", async () => {
    const { user } = await setupTwoBlocks();

    await user.click(screen.getByRole("button", { name: "Manage labels" }));
    await user.click(screen.getByRole("button", { name: "Archive Work" }));

    const form = await openBlockEditForm(user, 2);

    expect(optionNames(form)).toEqual(["Rest", "Unaccounted"]);
  });

  it("relabels the active Block without closing it", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await createLabel(user, "Rest", "Green");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(10 * MINUTE_MS));

    await relabelBlock(user, 0, "Rest");

    expect(blockItems()).toHaveLength(1);
    expect(blockItems()[0]).toHaveTextContent("Rest");
    expect(blockItems()[0]).toHaveTextContent("00:30:00 – Ongoing");
    expect(
      screen.getByRole("status", { name: "Active label" }),
    ).toHaveTextContent("Rest");
  });

  it("offers no Delete action on any Block", async () => {
    const { user } = await setupTwoBlocks();

    for (const index of [0, 2]) {
      await user.click(
        within(blockItems()[index]).getByRole("button", {
          name: "Block actions",
        }),
      );

      const menu = screen.getByRole("menu", { name: "Block actions" });

      expect(within(menu).queryByRole("menuitem", { name: "Delete" })).toBeNull();

      await user.keyboard("{Escape}");
    }
  });

  it("relabels Blocks on a past Day", async () => {
    const { runtime, user } = await setupTwoBlocks();

    act(() => runtime.clock.advance(24 * HOUR_MS));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Day" }),
      "Mar 8, 2026",
    );
    await relabelBlock(user, 0, "Rest");

    expect(blockItems()[0]).toHaveTextContent("Rest");
  });
});

describe("Block actions menu", () => {
  it("moves keyboard focus through the menu actions with the arrow keys", async () => {
    const { user } = await setupTwoBlocks();

    const menuButton = within(blockItems()[0]).getByRole("button", {
      name: "Block actions",
    });
    menuButton.focus();
    await user.keyboard("{Enter}");

    const menu = screen.getByRole("menu", { name: "Block actions" });

    await user.keyboard("{ArrowDown}");
    expect(
      within(menu).getByRole("menuitem", { name: "Split" }),
    ).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(
      within(menu).getByRole("menuitem", { name: "Edit" }),
    ).toHaveFocus();
  });
});

describe("Block edit/split UX", () => {
  it("focuses the label select when editing a block", async () => {
    const { user } = await setupTwoBlocks();

    const form = await openBlockEditForm(user, 0);

    expect(
      within(form).getByRole("combobox", { name: "Label" }),
    ).toHaveFocus();
  });

  it("focuses the split input and prefills a valid midpoint", async () => {
    const { user } = await setupTwoBlocks();

    await user.click(
      within(blockItems()[0]).getByRole("button", { name: "Block actions" }),
    );
    await user.click(
      within(screen.getByRole("menu", { name: "Block actions" })).getByRole(
        "menuitem",
        { name: "Split" },
      ),
    );

    const form = screen.getByRole("form", { name: "Split block" });
    const input = within(form).getByRole("textbox", { name: "Split at" });

    expect(input).toHaveFocus();
    expect(input).toHaveValue("00:35:00");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("placeholder", "HH:MM:SS");
  });

  it("auto-formats typed digits into HH:MM:SS", async () => {
    const { user } = await setupTwoBlocks();

    await user.click(
      within(blockItems()[0]).getByRole("button", { name: "Block actions" }),
    );
    await user.click(
      within(screen.getByRole("menu", { name: "Block actions" })).getByRole(
        "menuitem",
        { name: "Split" },
      ),
    );

    const form = screen.getByRole("form", { name: "Split block" });
    const input = within(form).getByRole("textbox", { name: "Split at" });

    await user.clear(input);
    await user.type(input, "003700");

    expect(input).toHaveValue("00:37:00");
  });
});

describe("splitting Blocks", () => {
  const dayTotals = () =>
    screen.getByRole("list", { name: "Selected day totals" });

  async function splitBlock(
    user: ReturnType<typeof userEvent.setup>,
    index: number,
    time: string,
  ) {
    await user.click(
      within(blockItems()[index]).getByRole("button", { name: "Block actions" }),
    );
    await user.click(
      within(screen.getByRole("menu", { name: "Block actions" })).getByRole("menuitem", { name: "Split" }),
    );

    const form = screen.getByRole("form", { name: "Split block" });
    const input = within(form).getByRole("textbox", { name: "Split at" });

    await user.clear(input);
    await user.type(input, time);
    await user.click(within(form).getByRole("button", { name: "Split" }));
  }

  it("splits a Block at a time inside it", async () => {
    const { user } = await setupTwoBlocks();

    await splitBlock(user, 0, "00:35:00");

    expect(blockItems()).toHaveLength(4);
    expect(blockItems()[0]).toHaveTextContent("00:30:00 – 00:35:00");
    expect(blockItems()[1]).toHaveTextContent("00:35:00 – 00:40:00");
    expect(blockItems()[1]).toHaveTextContent("Work");
    expect(dayTotals()).toHaveTextContent("00:10:00");
  });

  it("rejects a split outside the Block", async () => {
    const { user } = await setupTwoBlocks();

    await splitBlock(user, 0, "00:45:00");

    expect(screen.getByRole("alert")).toHaveTextContent(/inside/i);
    expect(blockItems()).toHaveLength(3);
  });
});
