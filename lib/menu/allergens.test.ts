// ScanMe Menu V1 — K04: allergens (master §7.3) and tags (§5.5) as pure rules,
// and the guards that keep the code lists, the Convex validators and the Serbian
// dictionary in step. Missing data NEVER means "safe".

import { describe, expect, test } from "vitest";
import {
  menuAllergenCodeValidator,
  menuTagCodeValidator,
} from "../../convex/lib/menuDomainValidators";
import { menuDomenSr } from "../i18n/sr/menu-domen";
import {
  MENU_ALLERGEN_CODES,
  MENU_STANDARD_ALLERGEN_CODES,
  allergenMatch,
  isMenuAllergenCode,
  type MenuAllergenCode,
} from "./allergens";
import { MENU_PUBLISH_ERRORS, MENU_PUBLISH_WARNINGS } from "./errors/publish";
import { MENU_TAG_CODES, isMenuTagCode, normalizeTags } from "./tags";

/** The literal values of a union-of-literals validator. */
function literalsOf(validator: { members: readonly { value: unknown }[] }): string[] {
  return validator.members.map((member) => String(member.value));
}

describe("allergen codes", () => {
  test("the 14 standard categories plus 'other' (Drugo), each once", () => {
    expect(MENU_STANDARD_ALLERGEN_CODES).toHaveLength(14);
    expect(MENU_ALLERGEN_CODES).toHaveLength(15);
    expect(MENU_ALLERGEN_CODES[MENU_ALLERGEN_CODES.length - 1]).toBe("other");
    expect(MENU_STANDARD_ALLERGEN_CODES).not.toContain("other");
    expect(new Set(MENU_ALLERGEN_CODES).size).toBe(MENU_ALLERGEN_CODES.length);
  });

  test("the list equals the literals of menuAllergenCodeValidator", () => {
    expect(literalsOf(menuAllergenCodeValidator).sort()).toEqual([...MENU_ALLERGEN_CODES].sort());
  });

  test("isMenuAllergenCode accepts exactly the codes", () => {
    for (const code of MENU_ALLERGEN_CODES) expect(isMenuAllergenCode(code)).toBe(true);
    expect(isMenuAllergenCode("gluten ")).toBe(false);
    expect(isMenuAllergenCode("Milk")).toBe(false);
    expect(isMenuAllergenCode("")).toBe(false);
  });

  test("every code has a Serbian name, and the dictionary has no stray allergen", () => {
    for (const code of MENU_ALLERGEN_CODES) {
      expect(menuDomenSr.allergens[code].trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(menuDomenSr.allergens).sort()).toEqual([...MENU_ALLERGEN_CODES].sort());
    expect(menuDomenSr.allergens.other).toBe("Drugo");
  });

  test("'Sadrži' and 'Može sadržati tragove' are two separate labels", () => {
    expect(menuDomenSr.allergenKinds.contains).toBe("Sadrži");
    expect(menuDomenSr.allergenKinds.mayContain).toBe("Može sadržati tragove");
  });
});

describe("tag codes", () => {
  test("the list equals the literals of menuTagCodeValidator", () => {
    expect(new Set(MENU_TAG_CODES).size).toBe(MENU_TAG_CODES.length);
    expect(literalsOf(menuTagCodeValidator).sort()).toEqual([...MENU_TAG_CODES].sort());
  });

  test("every tag has a Serbian name, and the dictionary has no stray tag", () => {
    for (const code of MENU_TAG_CODES) {
      expect(menuDomenSr.tags[code].trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(menuDomenSr.tags).sort()).toEqual([...MENU_TAG_CODES].sort());
  });

  test("isMenuTagCode accepts exactly the codes", () => {
    for (const code of MENU_TAG_CODES) expect(isMenuTagCode(code)).toBe(true);
    expect(isMenuTagCode("gluten_free")).toBe(false);
    expect(isMenuTagCode("")).toBe(false);
  });

  test("normalizeTags: unique, canonical order, empty stays empty", () => {
    expect(normalizeTags(["spicy", "vegan", "spicy", "new"])).toEqual(["vegan", "spicy", "new"]);
    expect(normalizeTags(["homemade", "recommended"])).toEqual(["recommended", "homemade"]);
    expect(normalizeTags([])).toEqual([]);
    // The same set always compares equal, whatever the order it was entered in.
    expect(normalizeTags(["new", "vegan"])).toEqual(normalizeTags(["vegan", "new"]));
  });

  test("normalizeTags: one unknown value rejects the whole list", () => {
    expect(normalizeTags(["vegan", "gluten_free"])).toBeNull();
    expect(normalizeTags([""])).toBeNull();
  });
});

describe("publish issue texts", () => {
  test("every error and warning code has a Serbian text, and there is no stray text", () => {
    const codes = [...MENU_PUBLISH_ERRORS, ...MENU_PUBLISH_WARNINGS];
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) {
      expect(menuDomenSr.publishIssues[code].trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(menuDomenSr.publishIssues).sort()).toEqual([...codes].sort());
  });
});

describe("allergenMatch (a highlight, never a filter, never a promise)", () => {
  const record = { contains: ["milk"] as MenuAllergenCode[], mayContain: ["nuts"] as MenuAllergenCode[] };

  test("allergens off for the menu: nothing is shown at all", () => {
    expect(allergenMatch({ enabled: false, marked: ["milk"], allergens: record })).toBe("off");
    expect(allergenMatch({ enabled: false, marked: [], allergens: null })).toBe("off");
  });

  test("nothing marked: none, whatever the article lists", () => {
    expect(allergenMatch({ enabled: true, marked: [], allergens: record })).toBe("none");
    expect(allergenMatch({ enabled: true, marked: [], allergens: null })).toBe("none");
  });

  test("an article without a record is UNKNOWN, never safe", () => {
    expect(allergenMatch({ enabled: true, marked: ["milk"], allergens: null })).toBe("unknown");
    expect(allergenMatch({ enabled: true, marked: ["milk"], allergens: undefined })).toBe("unknown");
  });

  test("a marked allergen the article contains", () => {
    expect(allergenMatch({ enabled: true, marked: ["milk"], allergens: record })).toBe("contains");
    expect(allergenMatch({ enabled: true, marked: ["fish", "milk"], allergens: record })).toBe(
      "contains",
    );
  });

  test("traces only", () => {
    expect(allergenMatch({ enabled: true, marked: ["nuts"], allergens: record })).toBe("may_contain");
  });

  test("contains beats may_contain when both marked allergens match", () => {
    expect(allergenMatch({ enabled: true, marked: ["nuts", "milk"], allergens: record })).toBe(
      "contains",
    );
  });

  test("a recorded article that lists none of the marked ones is 'not_listed', not 'safe'", () => {
    const result = allergenMatch({ enabled: true, marked: ["fish"], allergens: record });
    expect(result).toBe("not_listed");
    expect(result).not.toMatch(/safe/);
  });
});
