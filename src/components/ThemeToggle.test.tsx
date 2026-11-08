import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ThemeToggle from "./ThemeToggle";
import { THEME_DARK, THEME_LIGHT } from "@/data/theme";

describe("ThemeToggle", () => {
  it("reports the dark theme as not pressed and toggles on click", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    render(<ThemeToggle theme={THEME_DARK} onToggle={onToggle} />);

    const button = screen.getByRole("button", { name: "Toggle theme" });

    expect(button).toHaveAttribute("aria-pressed", "false");

    await user.click(button);

    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("reports the light theme as pressed", () => {
    render(<ThemeToggle theme={THEME_LIGHT} onToggle={() => {}} />);

    expect(screen.getByRole("button", { name: "Toggle theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
