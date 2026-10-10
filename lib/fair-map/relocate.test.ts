import { describe, expect, test } from "vitest";
import { fairMapRelocationCandidates } from "./relocate";
import { isFairMapStandLocation } from "./index";

// P2 (RN N6) — where a stand on a location of the old map (M0, before the
// organizer's drawing of 7. 10.) can go on today's map. Ids are the real
// ones of both drawings.

const EM = "elektromobilnost-2026";
// Every stand location of the M0 map (6f246b9) that is gone from today's map.
const GONE = ["ispred-12", "ispred-13", "ispred-15", "ispred-20", "ispred-21", "ispred-22", "ispred-s1", "ispred-s2", "ispred-s3", "ispred-s4", "ispred-s5", "scanme"];

describe("fairMapRelocationCandidates", () => {
  test("the ids of the old map really are off today's map", () => {
    for (const id of GONE) expect({ id, onMap: isFairMapStandLocation(EM, id) }).toEqual({ id, onMap: false });
  });

  test("20, 21 and 22 are one outline today: one candidate each", () => {
    for (const id of ["ispred-20", "ispred-21", "ispred-22"]) expect(fairMapRelocationCandidates(EM, id)).toEqual(["ispred-20-22"]);
  });

  test("12, 13 and 15 are groups of boxes: every box is a candidate (the caller must choose)", () => {
    expect(fairMapRelocationCandidates(EM, "ispred-12")).toEqual(["ispred-12-1", "ispred-12-2"]);
    expect(fairMapRelocationCandidates(EM, "ispred-13")).toEqual(["ispred-13-1", "ispred-13-2", "ispred-13-3", "ispred-13-4"]);
    expect(fairMapRelocationCandidates(EM, "ispred-15")).toEqual(["ispred-15-1", "ispred-15-2", "ispred-15-3", "ispred-15-4"]);
  });

  test("S1–S5, the old ScanMe placeholder, an existing location and unknown ids have none", () => {
    for (const id of ["ispred-s1", "ispred-s5", "scanme", "hala-6", "ispred-14", "ispred-20-22", "hala-99", "nepostojeci", ""]) {
      expect({ id, candidates: fairMapRelocationCandidates(EM, id) }).toEqual({ id, candidates: [] });
    }
  });

  test("a TEST event uses the real map; an event without a map has none", () => {
    expect(fairMapRelocationCandidates(`test-${EM}`, "ispred-21")).toEqual(["ispred-20-22"]);
    expect(fairMapRelocationCandidates("nepoznat-sajam", "ispred-21")).toEqual([]);
  });
});
