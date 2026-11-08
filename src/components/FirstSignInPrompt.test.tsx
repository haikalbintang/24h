import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import FirstSignInPrompt from "./FirstSignInPrompt";

describe("FirstSignInPrompt", () => {
  it("prompts with Merge selected by default and allows resolving with Merge", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    render(
      <FirstSignInPrompt email="alex@example.com" onResolve={onResolve} />,
    );

    expect(screen.getByRole("dialog", { name: "First sign-in" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Combine with this Account?" }),
    ).toBeInTheDocument();

    const mergeRadio = screen.getByRole("radio", { name: /Merge/i });
    const replaceRadio = screen.getByRole("radio", { name: /Replace/i });

    expect(mergeRadio).toBeChecked();
    expect(replaceRadio).not.toBeChecked();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith("merge");
  });

  it("requires confirmation when Replace is chosen before calling onResolve", async () => {
    const user = userEvent.setup();
    const onResolve = vi.fn();

    render(
      <FirstSignInPrompt email="alex@example.com" onResolve={onResolve} />,
    );

    const replaceRadio = screen.getByRole("radio", { name: /Replace/i });
    await user.click(replaceRadio);
    expect(replaceRadio).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(onResolve).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Replacing discards the Shared state on this device/i),
    ).toBeInTheDocument();

    // Clicking Back returns to the choices
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.getByRole("radiogroup", { name: "First sign-in choice" }),
    ).toBeInTheDocument();

    // Advance to confirmation again and confirm
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(screen.getByRole("button", { name: "Confirm replace" }));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith("replace");
  });

  it("traps focus within the modal during tab navigation", async () => {
    const user = userEvent.setup();

    render(
      <FirstSignInPrompt email="alex@example.com" onResolve={() => {}} />,
    );

    const mergeRadio = screen.getByRole("radio", { name: /Merge/i });
    const continueBtn = screen.getByRole("button", { name: "Continue" });

    mergeRadio.focus();
    expect(mergeRadio).toHaveFocus();

    await user.keyboard("{Tab}");
    expect(continueBtn).toHaveFocus();

    await user.keyboard("{Tab}");
    expect(mergeRadio).toHaveFocus();

    await user.keyboard("{Shift>}{Tab}{/Shift}");
    expect(continueBtn).toHaveFocus();
  });
});
