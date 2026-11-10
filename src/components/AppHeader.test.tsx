import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AppHeader from "./AppHeader";
import { THEME_DARK } from "@/data/theme";

const dayOptions = [
  { dayIndex: 0, dayLabel: "Mar 8, 2026" },
  { dayIndex: 1, dayLabel: "Mar 9, 2026" },
];

function renderHeader(overrides: Partial<Parameters<typeof AppHeader>[0]> = {}) {
  const props: Parameters<typeof AppHeader>[0] = {
    theme: THEME_DARK,
    onToggleTheme: () => {},
    onOpenAccount: () => {},
    onStartTour: () => {},
    selectedDayIndex: 1,
    dayOptions,
    onSelectDay: () => {},
    onExportJson: () => {},
    onExportCsv: () => {},
    ...overrides,
  };

  render(<AppHeader {...props} />);

  return props;
}

describe("AppHeader", () => {
  it("warns that there is no import and that clearing site data is permanent when signed out", () => {
    renderHeader({ isSignedIn: false });

    expect(screen.getByText(/no import/i)).toBeInTheDocument();
    expect(screen.getByText(/clearing site data/i)).toBeInTheDocument();
  });

  it("hides clearing site data warning when signed in", () => {
    renderHeader({ isSignedIn: true });

    expect(screen.getByText(/no import/i)).toBeInTheDocument();
    expect(screen.queryByText(/clearing site data/i)).not.toBeInTheDocument();
  });

  it("has no import control", () => {
    renderHeader();

    expect(
      screen.queryByRole("button", { name: /import/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /import/i }),
    ).not.toBeInTheDocument();
  });

  it("opens the Account screen", async () => {
    const onOpenAccount = vi.fn();
    const user = userEvent.setup();

    renderHeader({ onOpenAccount });

    await user.click(screen.getByRole("button", { name: "Account" }));

    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  it("starts the tour from the help button", async () => {
    const onStartTour = vi.fn();
    const user = userEvent.setup();

    renderHeader({ onStartTour });

    await user.click(screen.getByRole("button", { name: "Show tour" }));

    expect(onStartTour).toHaveBeenCalledTimes(1);
  });

  it("lists every Day and reports the selected one", async () => {
    const onSelectDay = vi.fn();
    const user = userEvent.setup();

    renderHeader({ onSelectDay });

    const select = screen.getByRole("combobox", { name: "Day" });

    expect(select).toHaveValue("1");
    expect(
      within(select)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Mar 8, 2026", "Mar 9, 2026"]);

    await user.selectOptions(select, "0");

    expect(onSelectDay).toHaveBeenCalledWith(0);
  });
});
