import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { createTestRuntime } from "./test/runtime";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

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
  colour = "Blue"
) {
  // The create-label form lives behind the "New label" toggle.
  await user.click(screen.getByRole("button", { name: "New label" }));

  const form = screen.getByRole("form", { name: "Create label" });

  await user.type(
    within(form).getByRole("textbox", { name: "New label name" }),
    name
  );
  await user.click(within(form).getByRole("radio", { name: colour }));
  await user.click(within(form).getByRole("button", { name: "Create label" }));
}

const selectedDayTotals = () =>
  screen.getByRole("list", { name: "Selected day totals" });

const sevenDayTotals = () =>
  screen.getByRole("table", { name: "Seven day totals" });

const timeline = () => screen.getByRole("list", { name: "Timeline" });

const selectedDayTotalItems = () =>
  within(selectedDayTotals()).getAllByRole("listitem");

const pieChart = () =>
  screen.getByRole("img", { name: "Selected day pie chart" });

const blocks = () => screen.getByRole("list", { name: "Blocks" });

describe("Totals", () => {
  it("shows the selected day totals and the Unaccounted total", async () => {
    const { runtime, user } = setup(at("2026-03-08T05:00:00.000Z"));

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));

    const items = selectedDayTotalItems();

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Work: 00:30:00");
    expect(items[1]).toHaveTextContent("Unaccounted: 00:30:00");
  });

  it("updates the totals as the active Block runs", async () => {
    const { runtime, user } = setup(at("2026-03-08T05:00:00.000Z"));

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));

    expect(selectedDayTotalItems()[1]).toHaveTextContent(
      "Unaccounted: 00:00:00"
    );

    act(() => runtime.clock.advance(30 * MINUTE_MS));

    expect(selectedDayTotalItems()[0]).toHaveTextContent("Work: 00:30:00");
    expect(selectedDayTotalItems()[1]).toHaveTextContent(
      "Unaccounted: 00:00:00"
    );
  });

  it("shows per-label rows for the 7-day window with Unaccounted last, bars, Avg, Total, and compact date headers", async () => {
    const { runtime, user } = setup(at("2026-03-08T05:00:00.000Z"));

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));

    const table = sevenDayTotals();
    const rows = within(table).getAllByRole("row");
    // header + Work + Unaccounted
    expect(rows.length).toBeGreaterThanOrEqual(3);

    expect(table).not.toHaveTextContent(/^Day \d/m);
    expect(table).not.toHaveTextContent("Day -");

    const workRow = rows.find((row) => within(row).queryByText("Work"));
    const unaccountedRow = rows.find(
      (row, index) =>
        index > 0 && within(row).queryByText("Unaccounted"),
    );
    expect(workRow).toBeDefined();
    expect(unaccountedRow).toBeDefined();
    expect(within(workRow!).getByText("00:30:00")).toBeInTheDocument();
    expect(within(workRow!).getByText("00:04:17")).toBeInTheDocument(); // avg 30m/7

    const dataRows = rows.slice(1);
    expect(within(dataRows[dataRows.length - 1]).getByText("Unaccounted")).toBeInTheDocument();

    expect(within(table).getByRole("columnheader", { name: "Avg" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Total" })).toBeInTheDocument();
  });

  it("shows label-coloured timeline segments for the selected Day", async () => {
    const { runtime, user } = setup(at("2026-03-08T05:00:00.000Z"));

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));

    const items = within(timeline()).getAllByRole("listitem");
    const segments = items.filter((item) => item.hasAttribute("data-label"));

    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveAttribute("data-label", "label-1");
    expect(segments[1]).toHaveAttribute("data-label", "label-unaccounted");
    expect(selectedDayTotalItems()[1]).toHaveTextContent(
      "Unaccounted: 00:30:00"
    );
  });

  it("marks future time on the current Day as distinct on the timeline", async () => {
    const { runtime, user } = setup(at("2026-03-08T05:00:00.000Z"));

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));
    await user.click(screen.getByRole("button", { name: "Work" }));

    const items = within(timeline()).getAllByRole("listitem");
    const future = items.find((item) => item.hasAttribute("data-future"));

    expect(future).toBeDefined();
    expect(future).toHaveAttribute("data-future", "true");
  });

  it("hides archived labels from Selected day legend, pie, seven day totals, and timeline while keeping them on blocks", async () => {
    const { runtime, user } = setup(at("2026-03-08T05:00:00.000Z"));

    await createLabel(user, "Work", "Blue");
    await createLabel(user, "Rest", "Green");

    // 00:00 - 00:30 Work (30 min)
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));

    // 00:30 - 01:00 Rest (30 min)
    await user.click(screen.getByRole("button", { name: "Rest" }));
    act(() => runtime.clock.advance(30 * MINUTE_MS));

    // Archive Work
    await user.click(screen.getByRole("button", { name: "Manage labels" }));
    await user.click(screen.getByRole("button", { name: "Archive Work" }));

    // Selected day legend: Work is absent, Rest is present, Unaccounted is 30m (Work's time folded in)
    expect(selectedDayTotals()).not.toHaveTextContent("Work:");
    expect(selectedDayTotals()).toHaveTextContent("Rest: 00:30:00");
    expect(selectedDayTotals()).toHaveTextContent("Unaccounted: 00:30:00");

    // Selected day pie: Work's colour is absent from the pie chart gradient
    const pieStyle = pieChart().getAttribute("style") ?? "";
    expect(pieStyle).not.toMatch(/3b82f6|59,\s*130,\s*246/);
    expect(pieStyle).toMatch(/22c55e|34,\s*197,\s*94/); // Rest colour
    expect(pieStyle).toMatch(/525252|82,\s*82,\s*82/); // Unaccounted colour

    // Seven day totals: Work is absent, Rest shows 30m total, Unaccounted is last
    const sevenRows = within(sevenDayTotals()).getAllByRole("row").slice(1);
    expect(sevenDayTotals()).not.toHaveTextContent("Work");
    const restRow = sevenRows.find((row) => within(row).queryByText("Rest"));
    expect(restRow).toBeDefined();
    expect(within(restRow!).getAllByText("00:30:00").length).toBeGreaterThan(0);
    const lastRow = sevenRows[sevenRows.length - 1];
    expect(within(lastRow).getByText("Unaccounted")).toBeInTheDocument();

    // Timeline: no segment for Work
    const segments = within(timeline())
      .getAllByRole("listitem")
      .filter((item) => item.hasAttribute("data-label"));
    expect(segments.some((s) => s.getAttribute("data-label") === "label-1")).toBe(false);

    // Blocks list: Work remains visible with its original label
    const blockListItems = within(blocks()).getAllByRole("listitem");
    expect(blockListItems[0]).toHaveTextContent("Work");
    expect(blockListItems[1]).toHaveTextContent("Rest");
  });
});
