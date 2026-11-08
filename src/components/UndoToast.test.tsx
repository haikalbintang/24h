import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import UndoToast from "./UndoToast";

describe("UndoToast", () => {
  it("renders nothing when there is no archive to undo and no error", () => {
    render(
      <UndoToast archiveUndoVisible={false} error={null} onUndo={() => {}} />,
    );

    expect(screen.queryByRole("status", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("offers undo while the archive undo window is open", async () => {
    const onUndo = vi.fn();
    const user = userEvent.setup();

    render(
      <UndoToast archiveUndoVisible error={null} onUndo={onUndo} />,
    );

    expect(screen.getByText("Label archived.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(onUndo).toHaveBeenCalledTimes(1);
  });

  it("shows an undo error when the window has closed", () => {
    render(
      <UndoToast
        archiveUndoVisible={false}
        error="Nothing to undo."
        onUndo={() => {}}
      />,
    );

    expect(screen.getByText("Nothing to undo.")).toBeInTheDocument();
  });
});
