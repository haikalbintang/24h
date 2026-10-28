import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { createTestRuntime } from "./test/runtime";

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

  it("closes the Block and adds no Block when deselecting", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(5 * SECOND_MS));
    await user.click(screen.getByRole("button", { name: "Work" }));

    expect(
      screen.getByRole("status", { name: "Active label" }),
    ).toHaveTextContent("Unlabeled");
    expect(blockItems()).toHaveLength(1);
    expect(blockItems()[0]).toHaveTextContent("00:00:05");
    expect(blockItems()[0]).not.toHaveTextContent(/ongoing/i);
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
    expect(blockItems()[0]).toHaveTextContent("Work");
    expect(blockItems()[0]).toHaveTextContent("00:00:05");
    expect(blockItems()[0]).toHaveTextContent(/ongoing/i);

    await user.keyboard("2");

    expect(blockItems()).toHaveLength(2);
    expect(blockItems()[1]).toHaveTextContent("Rest");
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

async function editBlock(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  fields: { start?: string; end?: string; label?: string },
) {
  await user.click(
    within(blockItems()[index]).getByRole("button", { name: "Edit block" }),
  );

  const form = screen.getByRole("form", { name: "Edit block" });

  for (const [name, value] of [
    ["Start", fields.start],
    ["End", fields.end],
  ] as const) {
    if (value !== undefined) {
      const input = within(form).getByRole("textbox", { name });
      await user.clear(input);
      await user.type(input, value);
    }
  }

  if (fields.label !== undefined) {
    await user.selectOptions(
      within(form).getByRole("combobox", { name: "Label" }),
      fields.label,
    );
  }

  await user.click(within(form).getByRole("button", { name: "Save block" }));
}

describe("Block editing", () => {
  it("edits start and end to the second and updates the list", async () => {
    const { user } = await setupTwoBlocks();

    await editBlock(user, 0, { start: "00:29:15", end: "00:38:45" });

    expect(screen.queryByRole("form", { name: "Edit block" })).toBeNull();
    expect(blockItems()[0]).toHaveTextContent("00:29:15 – 00:38:45");
    expect(blockItems()[0]).toHaveTextContent("00:09:30");
  });
});

describe("Block editing validation, reassign, delete, undo", () => {
  const dayTotals = () =>
    screen.getByRole("list", { name: "Selected day totals" });

  it("updates totals immediately after an edit", async () => {
    const { user } = await setupTwoBlocks();

    expect(dayTotals()).toHaveTextContent("00:10:00");

    await editBlock(user, 0, { end: "00:35:00" });

    expect(dayTotals()).toHaveTextContent("00:05:00");
  });

  it.each([
    [
      "end before start",
      { start: "00:40:00", end: "00:35:00" },
      /end must be after/i,
    ],
    ["overlap", { end: "00:45:00" }, /overlap/i],
    ["future time", { start: "00:30:00", end: "01:00:00" }, /future/i],
    ["text that is not a time", { start: "soon" }, /HH:MM:SS/],
  ])("rejects %s and saves nothing", async (_name, fields, message) => {
    const { user } = await setupTwoBlocks();

    await editBlock(user, 0, fields);

    expect(screen.getByRole("alert")).toHaveTextContent(message);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(blockItems()[0]).toHaveTextContent("00:30:00 – 00:40:00");
  });

  it("rejects times outside the selected Day", async () => {
    const { user } = await setupTwoBlocks();

    // The first Block is the earliest on the Day, so it cannot start before 00:00:00,
    // and 24:00:01 is past the Day end.
    await editBlock(user, 1, { end: "25:00:00" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      /future|within the selected day/i,
    );
  });

  it("reassigns a Block to another label", async () => {
    const { user } = await setupTwoBlocks();

    await editBlock(user, 0, { label: "Rest" });

    expect(blockItems()[0]).toHaveTextContent("Rest");
    expect(dayTotals()).toHaveTextContent("00:20:00");
  });

  it("lets the active Block change start and label but not end or deletion", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await createLabel(user, "Rest", "Green");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(10 * MINUTE_MS));

    expect(
      within(blockItems()[0]).queryByRole("button", { name: "Delete block" }),
    ).toBeNull();

    await user.click(
      within(blockItems()[0]).getByRole("button", { name: "Edit block" }),
    );

    expect(screen.queryByRole("textbox", { name: "End" })).toBeNull();

    await editBlock(user, 0, { start: "00:25:00", label: "Rest" });

    expect(blockItems()[0]).toHaveTextContent("Rest");
    expect(blockItems()[0]).toHaveTextContent("00:25:00 – Ongoing");
    expect(
      screen.getByRole("status", { name: "Active label" }),
    ).toHaveTextContent("Rest");
  });

  it("deletes a Block and restores it from the undo toast", async () => {
    const { user } = await setupTwoBlocks();

    await user.click(
      within(blockItems()[1]).getByRole("button", { name: "Delete block" }),
    );

    expect(blockItems()).toHaveLength(1);
    expect(dayTotals()).toHaveTextContent("00:10:00");

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(blockItems()).toHaveLength(2);
    expect(blockItems()[1]).toHaveTextContent("00:40:00 – 00:50:00");
  });

  it("removes the undo toast after about five seconds", async () => {
    const { runtime, user } = await setupTwoBlocks();

    await user.click(
      within(blockItems()[1]).getByRole("button", { name: "Delete block" }),
    );
    act(() => runtime.clock.advance(6 * SECOND_MS));

    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(blockItems()).toHaveLength(1);
  });

  it("refuses an undo when the space has been filled", async () => {
    const { user } = await setupTwoBlocks();

    await user.click(
      within(blockItems()[1]).getByRole("button", { name: "Delete block" }),
    );
    await editBlock(user, 0, { end: "00:50:00" });
    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(screen.getByRole("status", { name: "Undo" })).toHaveTextContent(
      /cannot undo/i,
    );
    expect(blockItems()).toHaveLength(1);
  });

  it("edits Blocks on a past Day", async () => {
    const { runtime, user } = await setupTwoBlocks();

    act(() => runtime.clock.advance(24 * HOUR_MS));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Day" }),
      "Mar 8, 2026",
    );
    await editBlock(user, 0, { end: "00:35:00" });

    expect(blockItems()[0]).toHaveTextContent("00:30:00 – 00:35:00");
  });
});

describe("Manual Blocks and splitting", () => {
  const dayTotals = () =>
    screen.getByRole("list", { name: "Selected day totals" });

  async function addManualBlock(
    user: ReturnType<typeof userEvent.setup>,
    fields: { start: string; end: string; label?: string },
  ) {
    const form = screen.getByRole("form", { name: "Add manual block" });

    await user.type(within(form).getByRole("textbox", { name: "New start" }), fields.start);
    await user.type(within(form).getByRole("textbox", { name: "New end" }), fields.end);

    if (fields.label !== undefined) {
      await user.selectOptions(
        within(form).getByRole("combobox", { name: "Label" }),
        fields.label,
      );
    }

    await user.click(within(form).getByRole("button", { name: "Add manual block" }));
  }

  async function splitBlock(
    user: ReturnType<typeof userEvent.setup>,
    index: number,
    time: string,
  ) {
    await user.click(
      within(blockItems()[index]).getByRole("button", { name: "Split block" }),
    );

    const form = screen.getByRole("form", { name: "Split block" });

    await user.type(within(form).getByRole("textbox", { name: "Split at" }), time);
    await user.click(within(form).getByRole("button", { name: "Split" }));
  }

  it("adds a manual Block over Unaccounted time and updates totals", async () => {
    const { user } = await setupTwoBlocks();

    await addManualBlock(user, { start: "00:10:00", end: "00:20:00", label: "Work" });

    expect(blockItems()).toHaveLength(3);
    expect(blockItems()[0]).toHaveTextContent("00:10:00 – 00:20:00");
    expect(blockItems()[0]).toHaveTextContent("Work");
    expect(blockItems()[0]).toHaveTextContent(/manual/i);
    expect(blockItems()[1]).not.toHaveTextContent(/manual/i);
    expect(dayTotals()).toHaveTextContent("00:20:00");
  });

  it("rejects a manual Block that overlaps and adds nothing", async () => {
    const { user } = await setupTwoBlocks();

    await addManualBlock(user, { start: "00:25:00", end: "00:35:00" });

    expect(screen.getByRole("alert")).toHaveTextContent(/overlap/i);
    expect(blockItems()).toHaveLength(2);
  });

  it("only offers labels that exist when adding a manual Block", async () => {
    await setupTwoBlocks();

    const form = screen.getByRole("form", { name: "Add manual block" });
    const options = within(
      within(form).getByRole("combobox", { name: "Label" }),
    ).getAllByRole("option");

    expect(options.map((option) => option.textContent)).toEqual(["Work", "Rest"]);
  });

  it("splits a Block at a time inside it", async () => {
    const { user } = await setupTwoBlocks();

    await splitBlock(user, 0, "00:35:00");

    expect(blockItems()).toHaveLength(3);
    expect(blockItems()[0]).toHaveTextContent("00:30:00 – 00:35:00");
    expect(blockItems()[1]).toHaveTextContent("00:35:00 – 00:40:00");
    expect(blockItems()[1]).toHaveTextContent("Work");
    expect(dayTotals()).toHaveTextContent("00:10:00");
  });

  it("rejects a split outside the Block", async () => {
    const { user } = await setupTwoBlocks();

    await splitBlock(user, 0, "00:45:00");

    expect(screen.getByRole("alert")).toHaveTextContent(/inside/i);
    expect(blockItems()).toHaveLength(2);
  });
});
