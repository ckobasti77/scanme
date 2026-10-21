import { describe, expect, test } from "vitest";
import { MENU_TRANSLATION_LANGUAGES } from "./languages";
import {
  addLanguage,
  canAddLanguage,
  isOverLanguageLimit,
  remainingLanguages,
  removeLanguage,
  sameLanguages,
  totalLanguages,
} from "./settings-view";

describe("totalLanguages", () => {
  test("counts the source language too", () => {
    expect(totalLanguages([])).toBe(1);
    expect(totalLanguages(["en", "de"])).toBe(3);
  });
});

describe("isOverLanguageLimit", () => {
  test("Standard (2) with sr + en is at the limit, not over", () => {
    expect(isOverLanguageLimit(["en"], 2)).toBe(false);
  });
  test("Standard (2) with sr + en + de is over", () => {
    expect(isOverLanguageLimit(["en", "de"], 2)).toBe(true);
  });
  test("a large limit is never over", () => {
    expect(isOverLanguageLimit(["en", "de", "fr"], 100)).toBe(false);
  });
});

describe("remainingLanguages", () => {
  test("everything but the chosen codes, in the list's order", () => {
    const left = remainingLanguages(["de", "en"]);
    expect(left).not.toContain("de");
    expect(left).not.toContain("en");
    expect(left[0]).toBe("fr");
    expect(left).toHaveLength(MENU_TRANSLATION_LANGUAGES.length - 2);
  });
  test("the source language is never offered and nothing is left when all are chosen", () => {
    expect(remainingLanguages([])).not.toContain("sr");
    expect(remainingLanguages([...MENU_TRANSLATION_LANGUAGES])).toEqual([]);
  });
});

describe("canAddLanguage", () => {
  test("Standard: one translation fits, the second does not", () => {
    expect(canAddLanguage([], 2)).toBe(true);
    expect(canAddLanguage(["en"], 2)).toBe(false);
  });
  test("over the limit nothing can be added", () => {
    expect(canAddLanguage(["en", "de", "fr"], 2)).toBe(false);
  });
  test("Premium: adds until every language is chosen", () => {
    expect(canAddLanguage(["en", "de", "fr"], 28)).toBe(true);
    expect(canAddLanguage([...MENU_TRANSLATION_LANGUAGES], 100)).toBe(false);
  });
});

describe("addLanguage / removeLanguage", () => {
  test("adds a free code at the end", () => {
    expect(addLanguage(["en"], "de", 3)).toEqual(["en", "de"]);
  });
  test("refuses past the limit, a duplicate, the source and an unknown code", () => {
    expect(addLanguage(["en"], "de", 2)).toEqual(["en"]);
    expect(addLanguage(["en"], "en", 5)).toEqual(["en"]);
    expect(addLanguage(["en"], "sr", 5)).toEqual(["en"]);
    expect(addLanguage(["en"], "xx", 5)).toEqual(["en"]);
  });
  test("removes only the named code", () => {
    expect(removeLanguage(["en", "de", "fr"], "de")).toEqual(["en", "fr"]);
    expect(removeLanguage(["en"], "de")).toEqual(["en"]);
  });
  test("an over-limit list can shrink", () => {
    expect(isOverLanguageLimit(removeLanguage(["en", "de"], "de"), 2)).toBe(false);
  });
});

describe("sameLanguages", () => {
  test("compares order and content", () => {
    expect(sameLanguages(["en", "de"], ["en", "de"])).toBe(true);
    expect(sameLanguages(["en", "de"], ["de", "en"])).toBe(false);
    expect(sameLanguages(["en"], [])).toBe(false);
  });
});
