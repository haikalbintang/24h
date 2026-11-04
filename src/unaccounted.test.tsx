import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { UNACCOUNTED_LABEL_ID } from "./labels";
import { STATE_STORAGE_KEY } from "./persistence";
import { createFakeStorage, createTestRuntime } from "./test/runtime";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

const at = (iso: string) => new Date(iso).getTime();

function setup(now = at("2026-03-08T05:00:00.000Z"), storage = createFakeStorage()) {
  const runtime = createTestRuntime(now, storage);
  const user = userEvent.setup();

  render(<App runtime={runtime} />);

  return { runtime, user, storage };
}

async function createLabel(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  colour = "Blue",
) {
  await user.click(screen.getByRole("button", { name: "New label" }));

  const form = screen.getByRole("form", { name: "Create label" });

  await user.type(
    within(form).getByRole("textbox", { name: "New label name" }),
    name,
  );
  await user.click(within(form).getByRole("radio", { name: colour }));
  await user.click(within(form).getByRole("button", { name: "Create label" }));
}

const status = () => screen.getByRole("status", { name: "Active label" });
const blocksList = () => screen.getByRole("list", { name: "Blocks" });
const blockItems = () => within(blocksList()).getAllByRole("listitem");
const labelsList = () => screen.getByRole("list", { name: "Labels" });
const selectedDayTotals = () =>
  screen.getByRole("list", { name: "Selected day totals" });

function storedState(storage: ReturnType<typeof createFakeStorage>) {
  return JSON.parse(storage.getItem(STATE_STORAGE_KEY) ?? "null") as {
    labels: { id: string; name: string; colourId: string; archived?: boolean }[];
    blocks: { id: string; labelId: string; start: number; end: number | null }[];
    activeLabelId: string | null;
  };
}

describe("Unaccounted label", () => {
  it("seeds one built-in Unaccounted label on first launch and makes it active", async () => {
    const { user } = setup();

    expect(status()).toHaveTextContent("Unaccounted");
    expect(blockItems()).toHaveLength(1);
    expect(blockItems()[0]).toHaveTextContent("Unaccounted");
    expect(blockItems()[0]).toHaveTextContent(/ongoing/i);

    const items = within(labelsList()).getAllByRole("listitem");
    const unaccounted = within(items[0]).getByRole("button", {
      name: "Unaccounted",
    });

    expect(unaccounted).toHaveAccessibleDescription("Grey");
    expect(
      within(labelsList()).getAllByRole("button", { name: "Unaccounted" }),
    ).toHaveLength(1);

    await user.click(screen.getByRole("button", { name: "Manage labels" }));

    expect(
      screen.queryByRole("button", { name: "Edit Unaccounted" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Archive Unaccounted" }),
    ).not.toBeInTheDocument();
  });

  it("seeds the built-in label after corrupt stored data", () => {
    const storage = createFakeStorage({ [STATE_STORAGE_KEY]: "{not json" });

    setup(at("2026-03-08T05:30:00.000Z"), storage);

    expect(status()).toHaveTextContent("Unaccounted");
    expect(
      within(labelsList()).getByRole("button", { name: "Unaccounted" }),
    ).toBeInTheDocument();
    expect(blockItems()).toHaveLength(1);
    expect(blockItems()[0]).toHaveTextContent("Unaccounted");
    expect(blockItems()[0]).toHaveTextContent(/ongoing/i);
  });

  it("offers Unaccounted in the picker and number shortcuts", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await createLabel(user, "Rest", "Green");

    expect(
      within(labelsList()).getByRole("button", { name: "Unaccounted" }),
    ).toBeInTheDocument();

    await user.keyboard("2");
    expect(status()).toHaveTextContent("Work");

    act(() => runtime.clock.advance(SECOND_MS));

    await user.keyboard("3");

    expect(status()).toHaveTextContent("Unaccounted");
    expect(blockItems()).toHaveLength(2);
    expect(blockItems()[1]).toHaveTextContent("Unaccounted");
    expect(blockItems()[1]).toHaveTextContent(/ongoing/i);
  });

  it("deselecting the active label returns to Unaccounted and starts an Unaccounted Block", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));

    expect(status()).toHaveTextContent("Unaccounted");
    expect(blockItems()).toHaveLength(2);
    expect(blockItems()[0]).toHaveTextContent("Work");
    expect(blockItems()[0]).not.toHaveTextContent(/ongoing/i);
    expect(blockItems()[1]).toHaveTextContent("Unaccounted");
    expect(blockItems()[1]).toHaveTextContent(/ongoing/i);

    const totals = within(selectedDayTotals()).getAllByRole("listitem");

    expect(totals).toHaveLength(2);
    expect(totals[0]).toHaveTextContent("Work: 00:30:00");
    expect(totals[1]).toHaveTextContent("Unaccounted: 00:30:00");
  });

  it("turns an old Unlabeled document into Unaccounted without losing Blocks", async () => {
    const anchor = at("2026-03-08T05:00:00.000Z");
    const now = at("2026-03-08T05:30:00.000Z");
    const storage = createFakeStorage({
      [STATE_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        anchor,
        labels: [{ id: "label-1", name: "Work", colourId: "blue" }],
        blocks: [
          {
            id: "block-1",
            labelId: "label-1",
            start: anchor,
            end: now,
          },
        ],
        activeLabelId: null,
        lastSeen: now,
        theme: "dark",
      }),
    });

    setup(now, storage);

    expect(status()).toHaveTextContent("Unaccounted");
    expect(blockItems()).toHaveLength(2);
    expect(blockItems()[0]).toHaveTextContent("Work");
    expect(blockItems()[1]).toHaveTextContent("Unaccounted");
    expect(blockItems()[1]).toHaveTextContent(/ongoing/i);

    const stored = storedState(storage);

    expect(stored.activeLabelId).toBe(UNACCOUNTED_LABEL_ID);
    expect(stored.labels.some((label) => label.id === UNACCOUNTED_LABEL_ID)).toBe(
      true,
    );
  });

  it("reuses an old label named Unaccounted as the built-in identity", () => {
    const anchor = at("2026-03-08T05:00:00.000Z");
    const now = at("2026-03-08T05:30:00.000Z");
    const storage = createFakeStorage({
      [STATE_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        anchor,
        labels: [
          { id: "label-1", name: "Unaccounted", colourId: "blue" },
          { id: "label-2", name: "Work", colourId: "green" },
        ],
        blocks: [
          {
            id: "block-1",
            labelId: "label-1",
            start: anchor,
            end: now,
          },
        ],
        activeLabelId: "label-1",
        lastSeen: now,
        theme: "dark",
      }),
    });

    setup(now, storage);

    expect(
      within(labelsList()).getAllByRole("button", { name: "Unaccounted" }),
    ).toHaveLength(1);
    expect(
      within(labelsList()).getByRole("button", { name: "Unaccounted" }),
    ).toHaveAccessibleDescription("Grey");

    const stored = storedState(storage);

    expect(stored.labels.filter((label) => label.name === "Unaccounted")).toEqual([
      expect.objectContaining({ id: UNACCOUNTED_LABEL_ID, colourId: "grey" }),
    ]);
    expect(stored.blocks[0].labelId).toBe(UNACCOUNTED_LABEL_ID);
    expect(stored.activeLabelId).toBe(UNACCOUNTED_LABEL_ID);
  });

  it("restores the built-in label's fixed identity if stored data changes it", () => {
    const anchor = at("2026-03-08T05:00:00.000Z");
    const now = at("2026-03-08T05:30:00.000Z");
    const storage = createFakeStorage({
      [STATE_STORAGE_KEY]: JSON.stringify({
        schemaVersion: 1,
        anchor,
        labels: [
          {
            id: UNACCOUNTED_LABEL_ID,
            name: "Hacked",
            colourId: "red",
            archived: true,
          },
        ],
        blocks: [],
        activeLabelId: UNACCOUNTED_LABEL_ID,
        lastSeen: now,
        theme: "dark",
      }),
    });

    setup(now, storage);

    expect(status()).toHaveTextContent("Unaccounted");
    expect(
      within(labelsList()).getByRole("button", { name: "Unaccounted" }),
    ).toHaveAccessibleDescription("Grey");
    expect(
      within(labelsList()).queryByRole("button", { name: "Hacked" }),
    ).not.toBeInTheDocument();

    const stored = storedState(storage);

    expect(stored.labels).toEqual([
      expect.objectContaining({
        id: UNACCOUNTED_LABEL_ID,
        name: "Unaccounted",
        colourId: "grey",
        archived: false,
      }),
    ]);
  });

  it("counts an Unaccounted Block's time in the Unaccounted total", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(HOUR_MS));
    await user.click(screen.getByRole("button", { name: "Unaccounted" }));
    act(() => runtime.clock.advance(2 * HOUR_MS));

    const totals = within(selectedDayTotals()).getAllByRole("listitem");

    expect(totals).toHaveLength(2);
    expect(totals[0]).toHaveTextContent("Work: 01:00:00");
    expect(totals[1]).toHaveTextContent("Unaccounted: 02:00:00");
  });
});
