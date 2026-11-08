import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DayClock from "./DayClock";

describe("DayClock", () => {
  it("shows the clock as a timer", () => {
    render(<DayClock clock="00:30:00" />);

    expect(screen.getByRole("timer", { name: "Day clock" })).toHaveTextContent(
      "00:30:00",
    );
  });

  it("does not announce the ticking clock every second", () => {
    render(<DayClock clock="00:30:00" />);

    expect(screen.getByRole("timer", { name: "Day clock" })).toHaveAttribute(
      "aria-live",
      "off",
    );
  });
});
