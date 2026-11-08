import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ReopenPrompt from "./ReopenPrompt";

describe("ReopenPrompt", () => {
  it("renders the dialog with label name and action buttons", () => {
    render(
      <ReopenPrompt
        labelName="Deep Work"
        onEnd={() => {}}
        onKeep={() => {}}
        onDismiss={() => {}}
      />,
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "You were away" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Deep Work/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "End Block" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Keep Label" }),
    ).toBeInTheDocument();
  });

  it("calls onEnd when End Block is clicked", async () => {
    const user = userEvent.setup();
    const onEnd = vi.fn();

    render(
      <ReopenPrompt
        labelName="Work"
        onEnd={onEnd}
        onKeep={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "End Block" }));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it("calls onKeep when Keep Label is clicked", async () => {
    const user = userEvent.setup();
    const onKeep = vi.fn();

    render(
      <ReopenPrompt
        labelName="Work"
        onEnd={() => {}}
        onKeep={onKeep}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Keep Label" }));
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss when Escape is pressed", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();

    render(
      <ReopenPrompt
        labelName="Work"
        onEnd={() => {}}
        onKeep={() => {}}
        onDismiss={onDismiss}
      />,
    );

    await user.keyboard("{Escape}");
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("traps focus within the dialog buttons when pressing Tab and Shift+Tab", async () => {
    const user = userEvent.setup();

    render(
      <ReopenPrompt
        labelName="Work"
        onEnd={() => {}}
        onKeep={() => {}}
      />,
    );

    const endBtn = screen.getByRole("button", { name: "End Block" });
    const keepBtn = screen.getByRole("button", { name: "Keep Label" });

    // Focus first button
    endBtn.focus();
    expect(endBtn).toHaveFocus();

    // Tab to Keep Label
    await user.keyboard("{Tab}");
    expect(keepBtn).toHaveFocus();

    // Tab wraps back to End Block
    await user.keyboard("{Tab}");
    expect(endBtn).toHaveFocus();

    // Shift+Tab wraps back to Keep Label
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(keepBtn).toHaveFocus();
  });
});
