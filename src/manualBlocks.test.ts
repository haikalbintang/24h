import { describe, expect, it } from "vitest";
import {
  createManualBlock,
  getBlockSplitError,
  getManualBlockError,
  splitBlock,
} from "./blocks";
import type { Block } from "./blocks";
import type { Label } from "./labels";

const MINUTE_MS = 60 * 1000;
const dayStart = 0;
const dayEnd = 24 * 60 * MINUTE_MS;
const now = 120 * MINUTE_MS;
const bounds = { dayStart, dayEnd, now };

const liveBlock: Block = {
  id: "block-1",
  labelId: "label-1",
  start: 30 * MINUTE_MS,
  end: 40 * MINUTE_MS,
  source: "live",
};

const labels: Label[] = [
  { id: "label-1", name: "Work", colourId: "blue" },
  { id: "label-2", name: "Rest", colourId: "green" },
];

describe("manual Blocks", () => {
  it("creates a manual Block over Unaccounted time", () => {
    const edit = {
      labelId: "label-2",
      start: 50 * MINUTE_MS,
      end: 60 * MINUTE_MS,
    };

    expect(getManualBlockError([liveBlock], edit, bounds, labels)).toBeNull();
    expect(createManualBlock([liveBlock], "block-2", edit)).toEqual([
      liveBlock,
      {
        id: "block-2",
        labelId: "label-2",
        start: 50 * MINUTE_MS,
        end: 60 * MINUTE_MS,
        source: "manual",
      },
    ]);
  });

  it("rejects a manual Block that uses an inactive label", () => {
    const edit = {
      labelId: "label-9",
      start: 50 * MINUTE_MS,
      end: 60 * MINUTE_MS,
    };

    expect(getManualBlockError([liveBlock], edit, bounds, labels)).toMatch(
      /active label/i,
    );
  });

  it.each([
    ["overlaps another Block", 35 * MINUTE_MS, 50 * MINUTE_MS, /overlap/i],
    ["is in the future", 100 * MINUTE_MS, 130 * MINUTE_MS, /future/i],
    [
      "starts before the Day",
      -5 * MINUTE_MS,
      10 * MINUTE_MS,
      /within the selected Day/i,
    ],
    ["ends before it starts", 60 * MINUTE_MS, 50 * MINUTE_MS, /end must be after/i],
  ])("rejects a manual Block that %s", (_name, start, end, message) => {
    expect(
      getManualBlockError([liveBlock], { labelId: "label-2", start, end }, bounds, labels),
    ).toMatch(message);
  });
});

describe("splitting Blocks", () => {
  it("splits a Block at a time strictly inside it, keeping label and source", () => {
    expect(
      getBlockSplitError([liveBlock], "block-1", 35 * MINUTE_MS, now),
    ).toBeNull();
    expect(
      splitBlock([liveBlock], "block-1", 35 * MINUTE_MS, "block-2"),
    ).toEqual([
      { ...liveBlock, end: 35 * MINUTE_MS },
      {
        id: "block-2",
        labelId: "label-1",
        start: 35 * MINUTE_MS,
        end: 40 * MINUTE_MS,
        source: "live",
      },
    ]);
  });

  it("keeps the second half of the active Block running", () => {
    const active: Block = { ...liveBlock, end: null };

    expect(splitBlock([active], "block-1", 60 * MINUTE_MS, "block-2")).toEqual([
      { ...active, end: 60 * MINUTE_MS },
      { ...active, id: "block-2", start: 60 * MINUTE_MS, end: null },
    ]);
  });

  it.each([
    ["at its start", 30 * MINUTE_MS],
    ["at its end", 40 * MINUTE_MS],
    ["outside it", 50 * MINUTE_MS],
  ])("rejects a split %s", (_name, at) => {
    expect(getBlockSplitError([liveBlock], "block-1", at, now)).toMatch(
      /inside/i,
    );
  });
});
