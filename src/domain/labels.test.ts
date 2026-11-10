import { describe, expect, it } from "vitest";
import {
  LABEL_COLOURS,
  LABEL_SUGGESTIONS,
  UNACCOUNTED_LABEL_COLOUR_ID,
  UNACCOUNTED_LABEL_ID,
  UNACCOUNTED_LABEL_NAME,
  compareLabels,
  createUnaccountedLabel,
  getLabelColour,
  getLabelNameError,
  isLabelArchived,
  isUnaccountedLabel,
  isUnaccountedLabelId,
} from "./labels";
import type { Label } from "./labels";

describe("labels domain", () => {
  describe("createUnaccountedLabel", () => {
    it("creates the built-in Unaccounted label with default attributes", () => {
      const label = createUnaccountedLabel(1234);
      expect(label).toEqual({
        id: UNACCOUNTED_LABEL_ID,
        name: UNACCOUNTED_LABEL_NAME,
        colourId: UNACCOUNTED_LABEL_COLOUR_ID,
        archived: false,
        updatedAt: 1234,
      });
    });

    it("defaults updatedAt to 0", () => {
      const label = createUnaccountedLabel();
      expect(label.updatedAt).toBe(0);
    });
  });

  describe("isUnaccountedLabel and isUnaccountedLabelId", () => {
    it("identifies the Unaccounted label by id or object", () => {
      expect(isUnaccountedLabelId(UNACCOUNTED_LABEL_ID)).toBe(true);
      expect(isUnaccountedLabelId("other-id")).toBe(false);
      expect(isUnaccountedLabelId(null)).toBe(false);

      const unaccounted = createUnaccountedLabel();
      const custom: Label = { id: "custom", name: "Work", colourId: "blue" };

      expect(isUnaccountedLabel(unaccounted)).toBe(true);
      expect(isUnaccountedLabel(custom)).toBe(false);
    });
  });

  describe("isLabelArchived", () => {
    it("returns true only when archived is explicitly true", () => {
      expect(isLabelArchived({ id: "1", name: "Work", colourId: "blue", archived: true })).toBe(true);
      expect(isLabelArchived({ id: "2", name: "Work", colourId: "blue", archived: false })).toBe(false);
      expect(isLabelArchived({ id: "3", name: "Work", colourId: "blue" })).toBe(false);
    });
  });

  describe("compareLabels", () => {
    it("sorts regular labels alphabetically and places Unaccounted last", () => {
      const work: Label = { id: "1", name: "Work", colourId: "blue" };
      const gym: Label = { id: "2", name: "Gym", colourId: "green" };
      const unaccounted = createUnaccountedLabel();

      const sorted = [unaccounted, work, gym].sort(compareLabels);

      expect(sorted).toEqual([gym, work, unaccounted]);
    });

    it("returns 0 when comparing two Unaccounted labels", () => {
      expect(compareLabels(createUnaccountedLabel(), createUnaccountedLabel())).toBe(0);
    });
  });

  describe("getLabelColour", () => {
    it("finds a colour by its colourId", () => {
      const green = getLabelColour("green");
      expect(green.id).toBe("green");
      expect(green.name).toBe("Green");
      expect(green.value).toBe("#22c55e");
    });

    it("falls back to the first colour for an unknown id", () => {
      // @ts-expect-error testing invalid colour id fallback
      const fallback = getLabelColour("unknown");
      expect(fallback).toEqual(LABEL_COLOURS[0]);
    });
  });

  describe("getLabelNameError", () => {
    const existing: Label[] = [
      { id: "1", name: "Work", colourId: "blue" },
      { id: "2", name: "Rest", colourId: "green" },
    ];

    it("rejects an empty name", () => {
      expect(getLabelNameError("", existing)).toBe("Enter a label name.");
    });

    it("rejects duplicates case-insensitively", () => {
      expect(getLabelNameError("work", existing)).toBe("A label with that name already exists.");
      expect(getLabelNameError("WORK", existing)).toBe("A label with that name already exists.");
    });

    it("allows the current label when renaming with exceptLabelId", () => {
      expect(getLabelNameError("Work", existing, "1")).toBeNull();
    });

    it("accepts a unique valid name", () => {
      expect(getLabelNameError("Exercise", existing)).toBeNull();
    });
  });

  describe("LABEL_SUGGESTIONS", () => {
    it("provides the canonical suggestions for new labels in alphabetical order", () => {
      expect(LABEL_SUGGESTIONS).toEqual([
        "Anime",
        "Bath",
        "Book",
        "Code",
        "Eat",
        "Exercise",
        "Game",
        "Manga",
        "Quran",
        "Salah",
        "Scroll",
        "Sleep",
        "Spare",
        "Work",
        "YouTube",
      ]);
    });

    it("contains no duplicates", () => {
      const set = new Set(LABEL_SUGGESTIONS);
      expect(set.size).toBe(LABEL_SUGGESTIONS.length);
    });
  });
});
