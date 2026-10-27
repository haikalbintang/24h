import { describe, expect, it } from "vitest";
import { DAY_MS } from "./day";
import type { Block } from "./blocks";
import {
  accountedMsForDay,
  labelTotalsForDay,
  sevenDayTotals,
  timelineSegmentsForDay,
  unaccountedMsForDay,
} from "./totals";

const L = (id: string) => id as any;
const B = (labelId: string, start: number, end: number | null): Block => ({
  id: `${start}`,
  labelId: L(labelId),
  start,
  end,
});

describe("totals", () => {
  it("per-label totals", () => {
    const now = 2 * 60 * 60 * 1000;
    const blocks: Block[] = [
      B("a", 0, 30 * 60 * 1000),
      B("b", 30 * 60 * 1000, 60 * 60 * 1000),
    ];
    const totals = labelTotalsForDay(blocks, 0, DAY_MS, now);
    expect(totals.get(L("a"))).toBe(30 * 60 * 1000);
    expect(totals.get(L("b"))).toBe(30 * 60 * 1000);
  });

  it("unaccounted includes unlabeled and gaps", () => {
    const now = 2 * 60 * 60 * 1000;
    const blocks: Block[] = [B("a", 0, 30 * 60 * 1000)];
    const un = unaccountedMsForDay(blocks, 0, DAY_MS, now);
    expect(un).toBe(90 * 60 * 1000);
    const acc = accountedMsForDay(blocks, 0, DAY_MS, now);
    expect(acc).toBe(30 * 60 * 1000);
  });

  it("seven day totals", () => {
    const now = DAY_MS * 3 + 1000;
    const blocks: Block[] = [B("a", 0, 1000), B("a", DAY_MS, 2000)];
    const res = sevenDayTotals(blocks, 0, 2, now);
    expect(res).toHaveLength(7);
    expect(res[6].dayIndex).toBe(2);
  });

  it("timeline segments", () => {
    const now = 60 * 60 * 1000;
    const blocks: Block[] = [
      B("a", 0, 30 * 60 * 1000),
      B("b", 40 * 60 * 1000, null),
    ];
    const segs = timelineSegmentsForDay(blocks, 0, DAY_MS, now);
    expect(segs).toHaveLength(2);
    expect(segs[0].labelId).toBe(L("a"));
    expect(segs[1].end).toBe(now);
  });
});
