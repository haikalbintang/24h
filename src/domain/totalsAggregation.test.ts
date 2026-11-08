import { describe, expect, it } from "vitest";
import {
  accountedMsForDay,
  labelTotalsForDay,
  sevenDayTotals,
  timelineSegmentsForDay,
  unaccountedMsForDay,
} from "./totals";
import type { Block } from "./blocks";
import { UNACCOUNTED_LABEL_ID } from "./labels";
import type { Label } from "./labels";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const dayStart = 0;
const dayEnd = DAY_MS;

const labels: Label[] = [
  { id: UNACCOUNTED_LABEL_ID, name: "Unaccounted", colourId: "grey" },
  { id: "label-work", name: "Work", colourId: "blue" },
  { id: "label-archived", name: "Old Project", colourId: "red", archived: true },
];

describe("Totals aggregation with archived labels and gaps", () => {
  it("excludes archived labels from labelTotalsForDay and includes their time in unaccountedMsForDay", () => {
    // 0h - 1h: Work (active)
    // 1h - 2h: Old Project (archived)
    // 2h - 3h: Unaccounted
    // 3h - 4h: Gap (no block)
    // now = 4h
    const now = 4 * HOUR_MS;
    const blocks: Block[] = [
      { id: "b1", labelId: "label-work", start: 0, end: 1 * HOUR_MS },
      { id: "b2", labelId: "label-archived", start: 1 * HOUR_MS, end: 2 * HOUR_MS },
      { id: "b3", labelId: UNACCOUNTED_LABEL_ID, start: 2 * HOUR_MS, end: 3 * HOUR_MS },
    ];

    const totals = labelTotalsForDay(blocks, dayStart, dayEnd, now, labels);
    expect(totals.get("label-work")).toBe(1 * HOUR_MS);
    expect(totals.has("label-archived")).toBe(false);

    const accounted = accountedMsForDay(blocks, dayStart, dayEnd, now, labels);
    expect(accounted).toBe(1 * HOUR_MS);

    const unaccounted = unaccountedMsForDay(blocks, dayStart, dayEnd, now, labels);
    // Unaccounted total = Unaccounted Blocks (1h) + archived Blocks (1h) + Gaps (1h) = 3h
    expect(unaccounted).toBe(3 * HOUR_MS);

    // Verify invariant explicitly: Unaccounted Blocks + archived-label Blocks + Gaps === Unaccounted total
    const unaccountedBlocksMs = 1 * HOUR_MS;
    const archivedBlocksMs = 1 * HOUR_MS;
    const gapsMs = 1 * HOUR_MS;
    expect(unaccounted).toBe(unaccountedBlocksMs + archivedBlocksMs + gapsMs);
  });

  it("excludes archived labels from sevenDayTotals", () => {
    const now = 4 * HOUR_MS;
    const blocks: Block[] = [
      { id: "b1", labelId: "label-work", start: 0, end: 1 * HOUR_MS },
      { id: "b2", labelId: "label-archived", start: 1 * HOUR_MS, end: 2 * HOUR_MS },
    ];

    const seven = sevenDayTotals(blocks, 0, 0, now, labels);
    const day0 = seven[6];
    expect(day0.totals.get("label-work")).toBe(1 * HOUR_MS);
    expect(day0.totals.has("label-archived")).toBe(false);
    expect(day0.unaccounted).toBe(3 * HOUR_MS);
  });

  it("excludes archived labels from timelineSegmentsForDay", () => {
    const now = 4 * HOUR_MS;
    const blocks: Block[] = [
      { id: "b1", labelId: "label-work", start: 0, end: 1 * HOUR_MS },
      { id: "b2", labelId: "label-archived", start: 1 * HOUR_MS, end: 2 * HOUR_MS },
      { id: "b3", labelId: UNACCOUNTED_LABEL_ID, start: 2 * HOUR_MS, end: 3 * HOUR_MS },
    ];

    const segments = timelineSegmentsForDay(blocks, dayStart, dayEnd, now, labels);
    const labelIds = segments.map((s) => s.labelId);
    expect(labelIds).toContain("label-work");
    expect(labelIds).toContain(UNACCOUNTED_LABEL_ID);
    expect(labelIds).not.toContain("label-archived");
  });
});
