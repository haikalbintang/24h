import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import TourGuide from "./TourGuide";
import { THEME_DARK, THEME_LIGHT } from "@/data/theme";

function renderTour(overrides: Partial<Parameters<typeof TourGuide>[0]> = {}) {
  const props: Parameters<typeof TourGuide>[0] = {
    run: true,
    theme: THEME_DARK,
    onEnd: vi.fn(),
    ...overrides,
  };

  render(
    <>
      <div data-tour="day-clock" />
      <div data-tour="labels" />
      <div data-tour="new-label" />
      <div data-tour="blocks" />
      <div data-tour="totals" />
      <div data-tour="timeline" />
      <TourGuide {...props} />
    </>,
  );

  return props;
}

describe("TourGuide", () => {
  it("shows the welcome step when running", async () => {
    renderTour();

    expect(await screen.findByText("Welcome to Day Labels")).toBeInTheDocument();
    expect(
      screen.getByText(/one label at a time/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Skip tour" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when not running", () => {
    renderTour({ run: false });

    expect(
      screen.queryByText("Welcome to Day Labels"),
    ).not.toBeInTheDocument();
  });

  it("walks the tracking loop and reports the end after finishing", async () => {
    const onEnd = vi.fn();
    const user = userEvent.setup();

    renderTour({ onEnd });

    const titles = [
      "The Day clock",
      "Say what's happening",
      "Make it yours",
      "Your day becomes Blocks",
      "See where the day went",
      "The 24-hour timeline",
      "That's the loop",
    ];

    for (const title of titles) {
      await user.click(await screen.findByRole("button", { name: "Next" }));

      expect(await screen.findByText(title)).toBeInTheDocument();
    }

    // The wrap-up is the last step: skip is hidden, primary says Finish.
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Skip tour" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("That's the loop")).not.toBeInTheDocument();
  });

  it("reports the end when the tour is skipped", async () => {
    const onEnd = vi.fn();
    const user = userEvent.setup();

    renderTour({ onEnd });

    await user.click(await screen.findByRole("button", { name: "Skip tour" }));

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByText("Welcome to Day Labels"),
    ).not.toBeInTheDocument();
  });

  it("styles tooltips for the light theme", async () => {
    renderTour({ theme: THEME_LIGHT });

    const tooltip = (
      await screen.findByText("Welcome to Day Labels")
    ).closest(".react-joyride__tooltip");

    expect(tooltip).toHaveStyle({
      backgroundColor: "rgb(255, 255, 255)",
      border: "1px solid rgb(229, 229, 229)",
    });
  });

  it("styles tooltips for the dark theme", async () => {
    renderTour({ theme: THEME_DARK });

    const tooltip = (
      await screen.findByText("Welcome to Day Labels")
    ).closest(".react-joyride__tooltip");

    expect(tooltip).toHaveStyle({
      backgroundColor: "rgb(38, 38, 38)",
      border: "1px solid rgb(64, 64, 64)",
    });
  });
});
