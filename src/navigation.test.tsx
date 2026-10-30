import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import { createTestRuntime } from "./test/runtime";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const at = (iso: string) => new Date(iso).getTime();

// 05:30Z on 2026-03-08 is 00:30 in America/New_York, so the Anchor is 05:00Z.
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
  await user.click(screen.getByRole("button", { name: "New label" }))

  const form = screen.getByRole("form", { name: "Create label" });

  await user.type(
    within(form).getByRole("textbox", { name: "New label name" }),
    name
  );
  await user.click(within(form).getByRole("radio", { name: colour }));
  await user.click(within(form).getByRole("button", { name: "Create label" }));
}

const picker = () => screen.getByRole("combobox", { name: "Day" });
const pickerLabels = () =>
  within(picker())
    .getAllByRole("option")
    .map((option) => option.textContent);
const selectedLabel = () =>
  within(picker())
    .getAllByRole<HTMLOptionElement>("option")
    .find((option) => option.selected)?.textContent;

describe("Day navigation", () => {
  it("opens on today and lists every Day from the Anchor to today", () => {
    const { runtime } = setup();

    act(() => runtime.clock.advance(2 * DAY_MS));

    expect(pickerLabels()).toEqual(["Mar 8, 2026", "Mar 9, 2026", "Mar 10, 2026"]);
    expect(selectedLabel()).toBe("Mar 10, 2026");
  });

  it("offers no Day before the Anchor", () => {
    setup();

    expect(pickerLabels()).toEqual(["Mar 8, 2026"]);
  });

  it("shows the Blocks, totals, and timeline of a selected past Day", async () => {
    const { runtime, user } = setup();

    await createLabel(user, "Work");
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(HOUR_MS));
    await user.click(screen.getByRole("button", { name: "Work" }));
    act(() => runtime.clock.advance(DAY_MS));

    expect(screen.getByText("No blocks yet.")).toBeInTheDocument();

    await user.selectOptions(picker(), "Mar 8, 2026");

    expect(selectedLabel()).toBe("Mar 8, 2026");
    const blocks = within(
      screen.getByRole("list", { name: "Blocks" })
    ).getAllByRole("listitem");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toHaveTextContent("Work");
    expect(
      within(
        screen.getByRole("list", { name: "Selected day totals" })
      ).getAllByRole("listitem")[0]
    ).toHaveTextContent("Work: 01:00:00");
    expect(
      within(screen.getByRole("list", { name: "Timeline" })).getAllByRole(
        "listitem"
      )[0]
    ).toHaveAttribute("data-label", "label-1");
  });
});

describe("Rollover", () => {
  it("advances the view to the new Day when today is selected", () => {
    const { runtime } = setup();
    act(() => runtime.clock.advance(23 * HOUR_MS));

    expect(selectedLabel()).toBe("Mar 8, 2026");

    act(() => runtime.clock.advance(HOUR_MS));

    expect(selectedLabel()).toBe("Mar 9, 2026");
  });

  it("leaves a past Day selected", async () => {
    const { runtime, user } = setup();
    act(() => runtime.clock.advance(23 * HOUR_MS));

    act(() => runtime.clock.advance(HOUR_MS));
    await user.selectOptions(picker(), "Mar 8, 2026");
    act(() => runtime.clock.advance(DAY_MS));

    expect(selectedLabel()).toBe("Mar 8, 2026");
    expect(pickerLabels()).toEqual(["Mar 8, 2026", "Mar 9, 2026", "Mar 10, 2026"]);
  });
});
