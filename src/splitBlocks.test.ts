import { describe, expect, it } from "vitest";
import { getBlockSplitError, splitBlock } from "./blocks";
import type { Block } from "./blocks";

const MINUTE_MS = 60 * 1000;
const now = 120 * MINUTE_MS;

const block: Block = {
  id: "block-1",
  labelId: "label-1",
  start: 30 * MINUTE_MS,
  end: 40 * MINUTE_MS,
};

describe("splitting Blocks", () => {
  it("splits a Block at a time strictly inside it, keeping the label", () => {
    expect(
      getBlockSplitError([block], "block-1", 35 * MINUTE_MS, now),
    ).toBeNull();
    expect(splitBlock([block], "block-1", 35 * MINUTE_MS, "block-2")).toEqual([
      { ...block, end: 35 * MINUTE_MS },
      {
        id: "block-2",
        labelId: "label-1",
        start: 35 * MINUTE_MS,
        end: 40 * MINUTE_MS,
      },
    ]);
  });

  it("keeps the second half of the active Block running", () => {
    const active: Block = { ...block, end: null };

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
    expect(getBlockSplitError([block], "block-1", at, now)).toMatch(/inside/i);
  });
});
