// ScanMe Menu V1 — K04: add-on group rules (master §5.7, §7.5) as pure logic.
// lib/menu/addons.ts is the ONLY source of these rules; convex/menuArticleOptions.ts
// and the editor both call it.

import { describe, expect, test } from "vitest";
import {
  addonBounds,
  isAddonGroupSatisfiable,
  isValidAddonSelection,
  normalizeAddonRules,
  type MenuAddonRules,
} from "./addons";
import { MENU_MAX_ADDON_OPTIONS_PER_GROUP } from "./limits";

function rules(input: Parameters<typeof normalizeAddonRules>[0]): MenuAddonRules {
  const normalized = normalizeAddonRules(input);
  if (normalized === null) throw new Error("expected valid rules");
  return normalized;
}

describe("the four default bounds (no advanced settings)", () => {
  test("single choice, optional: 0 or 1", () => {
    const optionalSingle = rules({ selection: "single", required: false });
    expect(optionalSingle).toEqual({ selection: "single", required: false });
    expect(addonBounds(optionalSingle, 4)).toEqual({ min: 0, max: 1 });
  });

  test("single choice, required: exactly 1", () => {
    const requiredSingle = rules({ selection: "single", required: true });
    expect(requiredSingle).toEqual({ selection: "single", required: true });
    expect(addonBounds(requiredSingle, 4)).toEqual({ min: 1, max: 1 });
  });

  test("several choices, optional: 0 up to all", () => {
    const optionalMultiple = rules({ selection: "multiple", required: false });
    expect(optionalMultiple).toEqual({ selection: "multiple", required: false });
    expect(addonBounds(optionalMultiple, 4)).toEqual({ min: 0, max: 4 });
  });

  test("several choices, required: 1 up to all", () => {
    const requiredMultiple = rules({ selection: "multiple", required: true });
    expect(requiredMultiple).toEqual({ selection: "multiple", required: true });
    expect(addonBounds(requiredMultiple, 4)).toEqual({ min: 1, max: 4 });
  });

  test("the bounds follow the number of options, and 0 options give max 0", () => {
    expect(addonBounds(rules({ selection: "multiple", required: false }), 7)).toEqual({
      min: 0,
      max: 7,
    });
    expect(addonBounds(rules({ selection: "single", required: false }), 0)).toEqual({
      min: 0,
      max: 0,
    });
    expect(addonBounds(rules({ selection: "multiple", required: false }), 0)).toEqual({
      min: 0,
      max: 0,
    });
  });
});

describe("advanced minimum and maximum (several choices only)", () => {
  test("a required group may ask for more than one and cap the choices", () => {
    const advanced = rules({ selection: "multiple", required: true, minSelect: 2, maxSelect: 3 });
    expect(advanced).toEqual({
      selection: "multiple",
      required: true,
      minSelect: 2,
      maxSelect: 3,
    });
    expect(addonBounds(advanced, 5)).toEqual({ min: 2, max: 3 });
    // The maximum never exceeds the options that exist.
    expect(addonBounds(advanced, 2)).toEqual({ min: 2, max: 2 });
  });

  test("an optional group may cap the choices without a minimum", () => {
    const capped = rules({ selection: "multiple", required: false, maxSelect: 2 });
    expect(capped).toEqual({ selection: "multiple", required: false, maxSelect: 2 });
    expect(addonBounds(capped, 6)).toEqual({ min: 0, max: 2 });
    expect(addonBounds(capped, 1)).toEqual({ min: 0, max: 1 });
  });

  test("a required group may cap at exactly the implicit minimum of 1", () => {
    const one = rules({ selection: "multiple", required: true, maxSelect: 1 });
    expect(one).toEqual({ selection: "multiple", required: true, maxSelect: 1 });
    expect(addonBounds(one, 5)).toEqual({ min: 1, max: 1 });
  });

  test("the largest allowed count is MENU_MAX_ADDON_OPTIONS_PER_GROUP", () => {
    const top = MENU_MAX_ADDON_OPTIONS_PER_GROUP;
    expect(
      rules({ selection: "multiple", required: true, minSelect: top, maxSelect: top }),
    ).toEqual({ selection: "multiple", required: true, minSelect: top, maxSelect: top });
    expect(rules({ selection: "multiple", required: false, maxSelect: top })).toEqual({
      selection: "multiple",
      required: false,
      maxSelect: top,
    });
  });
});

describe("contradictions are rejected (null)", () => {
  test("a single-choice group has no minimum or maximum", () => {
    expect(normalizeAddonRules({ selection: "single", required: true, minSelect: 1 })).toBeNull();
    expect(normalizeAddonRules({ selection: "single", required: false, maxSelect: 1 })).toBeNull();
    expect(
      normalizeAddonRules({ selection: "single", required: true, minSelect: 1, maxSelect: 2 }),
    ).toBeNull();
  });

  test("a minimum only makes sense for a required group", () => {
    expect(
      normalizeAddonRules({ selection: "multiple", required: false, minSelect: 2 }),
    ).toBeNull();
    expect(
      normalizeAddonRules({ selection: "multiple", required: false, minSelect: 1 }),
    ).toBeNull();
  });

  test("the maximum may not be below the minimum", () => {
    expect(
      normalizeAddonRules({ selection: "multiple", required: true, minSelect: 3, maxSelect: 2 }),
    ).toBeNull();
    // Required without an explicit minimum still means at least 1.
    expect(normalizeAddonRules({ selection: "multiple", required: true, maxSelect: 0 })).toBeNull();
  });

  test("counts must be whole numbers of at least 1", () => {
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        normalizeAddonRules({ selection: "multiple", required: true, minSelect: bad }),
      ).toBeNull();
      expect(
        normalizeAddonRules({ selection: "multiple", required: false, maxSelect: bad }),
      ).toBeNull();
    }
  });

  test("counts above MENU_MAX_ADDON_OPTIONS_PER_GROUP are rejected", () => {
    const over = MENU_MAX_ADDON_OPTIONS_PER_GROUP + 1;
    expect(
      normalizeAddonRules({ selection: "multiple", required: true, minSelect: over }),
    ).toBeNull();
    expect(
      normalizeAddonRules({ selection: "multiple", required: false, maxSelect: over }),
    ).toBeNull();
  });
});

describe("default-only values are dropped, so equal rules compare equal", () => {
  test("a minimum of 1 on a required group is the default and is not stored", () => {
    expect(rules({ selection: "multiple", required: true, minSelect: 1 })).toEqual({
      selection: "multiple",
      required: true,
    });
    expect(
      rules({ selection: "multiple", required: true, minSelect: 1, maxSelect: 4 }),
    ).toEqual({ selection: "multiple", required: true, maxSelect: 4 });
  });

  test("null means 'not set', exactly like absent", () => {
    expect(
      rules({ selection: "multiple", required: true, minSelect: null, maxSelect: null }),
    ).toEqual({ selection: "multiple", required: true });
    expect(rules({ selection: "single", required: false, minSelect: null, maxSelect: null })).toEqual(
      { selection: "single", required: false },
    );
  });

  test("normalizing a stored result again changes nothing", () => {
    const stored = rules({ selection: "multiple", required: true, minSelect: 2, maxSelect: 5 });
    expect(normalizeAddonRules(stored)).toEqual(stored);
    const plain = rules({ selection: "multiple", required: false });
    expect(normalizeAddonRules(plain)).toEqual(plain);
  });
});

describe("satisfiable: could a guest ever make a valid choice?", () => {
  test("a required choice needs at least that many options", () => {
    const needsThree = rules({ selection: "multiple", required: true, minSelect: 3 });
    expect(isAddonGroupSatisfiable(needsThree, 2)).toBe(false);
    expect(isAddonGroupSatisfiable(needsThree, 3)).toBe(true);
    expect(isAddonGroupSatisfiable(needsThree, 10)).toBe(true);
  });

  test("a required group without options can never be satisfied; an optional one always can", () => {
    expect(isAddonGroupSatisfiable(rules({ selection: "single", required: true }), 0)).toBe(false);
    expect(isAddonGroupSatisfiable(rules({ selection: "multiple", required: true }), 0)).toBe(false);
    expect(isAddonGroupSatisfiable(rules({ selection: "single", required: true }), 1)).toBe(true);
    expect(isAddonGroupSatisfiable(rules({ selection: "single", required: false }), 0)).toBe(true);
    expect(isAddonGroupSatisfiable(rules({ selection: "multiple", required: false }), 0)).toBe(
      true,
    );
  });
});

describe("valid selection counts", () => {
  test("single, optional: 0 or 1", () => {
    const r = rules({ selection: "single", required: false });
    expect([0, 1, 2].map((count) => isValidAddonSelection(r, 4, count))).toEqual([
      true,
      true,
      false,
    ]);
  });

  test("single, required: exactly 1", () => {
    const r = rules({ selection: "single", required: true });
    expect([0, 1, 2].map((count) => isValidAddonSelection(r, 4, count))).toEqual([
      false,
      true,
      false,
    ]);
  });

  test("several, optional: 0 up to all options", () => {
    const r = rules({ selection: "multiple", required: false });
    expect([0, 1, 3, 4].map((count) => isValidAddonSelection(r, 3, count))).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });

  test("several, required: 1 up to all options", () => {
    const r = rules({ selection: "multiple", required: true });
    expect([0, 1, 3, 4].map((count) => isValidAddonSelection(r, 3, count))).toEqual([
      false,
      true,
      true,
      false,
    ]);
  });

  test("advanced min 2 / max 3 of 5 options", () => {
    const r = rules({ selection: "multiple", required: true, minSelect: 2, maxSelect: 3 });
    expect([0, 1, 2, 3, 4].map((count) => isValidAddonSelection(r, 5, count))).toEqual([
      false,
      false,
      true,
      true,
      false,
    ]);
  });

  test("a count that is not a non-negative whole number is never valid", () => {
    const r = rules({ selection: "multiple", required: false });
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(isValidAddonSelection(r, 5, bad)).toBe(false);
    }
  });
});
