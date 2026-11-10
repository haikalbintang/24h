import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "./App";
import {
  createFreshPersistedState,
  STATE_STORAGE_KEY,
} from "@/data/persistence";
import { createFakeStorage, createTestRuntime } from "@/testing/runtime";

const at = (iso: string) => new Date(iso).getTime();
const NOW = at("2026-03-08T05:30:00.000Z");

function storageWithTourSeen(now: number, tourSeen: boolean) {
  const state = createFreshPersistedState(now);
  state.device.tourSeen = tourSeen;

  return createFakeStorage({
    [STATE_STORAGE_KEY]: JSON.stringify(state),
  });
}

function storedTourSeen(storage: ReturnType<typeof createFakeStorage>) {
  const parsed = JSON.parse(storage.getItem(STATE_STORAGE_KEY) ?? "null");

  return parsed?.device?.tourSeen ?? null;
}

describe("Guided tour", () => {
  it("starts automatically for a fresh device", async () => {
    render(<App runtime={createTestRuntime(NOW, createFakeStorage())} />);

    expect(await screen.findByText("Welcome to Day Labels")).toBeInTheDocument();
  });

  it("does not start for a device that has already seen it", () => {
    render(
      <App runtime={createTestRuntime(NOW, storageWithTourSeen(NOW, true))} />,
    );

    expect(
      screen.queryByText("Welcome to Day Labels"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show tour" })).toBeInTheDocument();
  });

  it("marks the tour seen when finished and stays done after a reload", async () => {
    const storage = createFakeStorage();
    const user = userEvent.setup();
    const view = render(<App runtime={createTestRuntime(NOW, storage)} />);

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

    await user.click(screen.getByRole("button", { name: "Finish" }));

    expect(storedTourSeen(storage)).toBe(true);

    view.unmount();
    render(<App runtime={createTestRuntime(NOW, storage)} />);

    expect(
      screen.queryByText("Welcome to Day Labels"),
    ).not.toBeInTheDocument();
  });

  it("marks the tour seen when skipped", async () => {
    const storage = createFakeStorage();
    const user = userEvent.setup();
    render(<App runtime={createTestRuntime(NOW, storage)} />);

    await user.click(await screen.findByRole("button", { name: "Skip tour" }));

    expect(storedTourSeen(storage)).toBe(true);
  });

  it("replays the tour from the header help button", async () => {
    const user = userEvent.setup();
    render(
      <App runtime={createTestRuntime(NOW, storageWithTourSeen(NOW, true))} />,
    );

    await user.click(screen.getByRole("button", { name: "Show tour" }));

    expect(await screen.findByText("Welcome to Day Labels")).toBeInTheDocument();
  });

  it("ends the tour and marks it seen when the Account screen opens", async () => {
    const storage = createFakeStorage();
    const user = userEvent.setup();
    render(<App runtime={createTestRuntime(NOW, storage)} />);

    expect(await screen.findByText("Welcome to Day Labels")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Account" }));

    expect(
      screen.queryByText("Welcome to Day Labels"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Account" })).toBeInTheDocument();
    expect(storedTourSeen(storage)).toBe(true);
  });
});
