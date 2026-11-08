import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ExportMenu from "./ExportMenu";

describe("ExportMenu", () => {
  it("opens the menu and lists both export formats", async () => {
    const user = userEvent.setup();

    render(<ExportMenu onExportJson={() => {}} onExportCsv={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Export" }));

    expect(screen.getByRole("menu", { name: "Export" })).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Export JSON" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Export CSV" }),
    ).toBeInTheDocument();
  });

  it("exports JSON and closes the menu", async () => {
    const onExportJson = vi.fn();
    const onExportCsv = vi.fn();
    const user = userEvent.setup();

    render(
      <ExportMenu onExportJson={onExportJson} onExportCsv={onExportCsv} />,
    );

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Export JSON" }));

    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportCsv).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("exports CSV and closes the menu", async () => {
    const onExportJson = vi.fn();
    const onExportCsv = vi.fn();
    const user = userEvent.setup();

    render(
      <ExportMenu onExportJson={onExportJson} onExportCsv={onExportCsv} />,
    );

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("menuitem", { name: "Export CSV" }));

    expect(onExportCsv).toHaveBeenCalledTimes(1);
    expect(onExportJson).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes with Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();

    render(<ExportMenu onExportJson={() => {}} onExportCsv={() => {}} />);

    const trigger = screen.getByRole("button", { name: "Export" });

    await user.click(trigger);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("moves focus through the menu items with the arrow, Home, and End keys", async () => {
    const user = userEvent.setup();

    render(<ExportMenu onExportJson={() => {}} onExportCsv={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Export" }));

    const json = screen.getByRole("menuitem", { name: "Export JSON" });
    const csv = screen.getByRole("menuitem", { name: "Export CSV" });

    await user.keyboard("{ArrowDown}");
    expect(json).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(csv).toHaveFocus();

    await user.keyboard("{ArrowDown}");
    expect(json).toHaveFocus();

    await user.keyboard("{ArrowUp}");
    expect(csv).toHaveFocus();

    await user.keyboard("{Home}");
    expect(json).toHaveFocus();

    await user.keyboard("{End}");
    expect(csv).toHaveFocus();
  });

  it("closes when a pointer press happens outside the menu", async () => {
    const user = userEvent.setup();

    render(
      <>
        <ExportMenu onExportJson={() => {}} onExportCsv={() => {}} />
        <button type="button">Outside</button>
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
