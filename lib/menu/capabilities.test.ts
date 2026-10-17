// ScanMe Menu V1 — K03: what Premium unlocks (master §2.2) and the Standard
// language limit (§7.7), as pure logic. The account-level resolution through
// getEntitlement is proven in convex/menuCapabilities.test.ts.

import { describe, expect, test } from "vitest";
import {
  MENU_MAX_LANGUAGES,
  MENU_PREMIUM,
  MENU_PREMIUM_CAPABILITIES,
  MENU_STANDARD,
  MENU_STANDARD_MAX_LANGUAGES,
  menuCapabilitiesFor,
} from "./capabilities";
import { MENU_SOURCE_LANGUAGE, MENU_TRANSLATION_LANGUAGES, checkLanguageChange } from "./languages";

describe("capabilities", () => {
  test("Premium unlocks exactly the master §2.2 list", () => {
    expect([...MENU_PREMIUM_CAPABILITIES].sort()).toEqual(
      [
        "advancedAnalytics",
        "aiTranslations",
        "csvExport",
        "extraLayouts",
        "reducedBranding",
        "roomService",
        "scheduledPromos",
      ].sort(),
    );
    for (const capability of MENU_PREMIUM_CAPABILITIES) {
      expect(MENU_PREMIUM[capability]).toBe(true);
      expect(MENU_STANDARD[capability]).toBe(false);
    }
  });

  test("Standard has two languages per service, the source included; Premium the technical ceiling", () => {
    expect(MENU_STANDARD.maxLanguages).toBe(2);
    expect(MENU_STANDARD_MAX_LANGUAGES).toBe(2);
    expect(MENU_PREMIUM.maxLanguages).toBe(MENU_MAX_LANGUAGES);
    expect(MENU_MAX_LANGUAGES).toBe(10);
  });

  test.each([
    ["premium", "premium"],
    ["basic", "standard"],
    ["standard", "standard"],
    ["enterprise", "standard"],
    ["", "standard"],
    [null, "standard"],
    [undefined, "standard"],
  ] as const)("plan key %s → %s", (planKey, tier) => {
    expect(menuCapabilitiesFor(planKey).tier).toBe(tier);
  });
});

describe("languages", () => {
  const standard = { maxLanguages: 2, technicalMax: 10 };
  const premium = { maxLanguages: 10, technicalMax: 10 };

  test("the source language is Serbian and never a translation", () => {
    expect(MENU_SOURCE_LANGUAGE).toBe("sr");
    expect(MENU_TRANSLATION_LANGUAGES).not.toContain(MENU_SOURCE_LANGUAGE);
    expect(checkLanguageChange({ current: [], next: ["sr"], ...premium })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  test.each([
    [[], ["en"], true],
    [[], ["en", "de"], false],
    [["en"], ["de"], true],
    [["en"], [], true],
  ])("Standard: %j → %j allowed: %s", (current, next, ok) => {
    expect(checkLanguageChange({ current, next, ...standard }).ok).toBe(ok);
  });

  test("Standard refuses the third language with reason limit", () => {
    expect(checkLanguageChange({ current: ["en"], next: ["en", "de"], ...standard })).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  test("Premium has no commercial limit up to the technical ceiling", () => {
    const nine = MENU_TRANSLATION_LANGUAGES.slice(0, 9);
    const ten = MENU_TRANSLATION_LANGUAGES.slice(0, 10);
    expect(checkLanguageChange({ current: [], next: nine, ...premium })).toEqual({ ok: true });
    expect(checkLanguageChange({ current: nine, next: ten, ...premium })).toEqual({
      ok: false,
      reason: "limit",
    });
  });

  test("after losing Premium languages can be removed or reordered, never added", () => {
    const current = ["en", "de", "it"];
    expect(checkLanguageChange({ current, next: ["en", "de"], ...standard }).ok).toBe(true);
    expect(checkLanguageChange({ current, next: ["it", "en", "de"], ...standard }).ok).toBe(true);
    expect(checkLanguageChange({ current, next: ["en", "fr"], ...standard })).toEqual({
      ok: false,
      reason: "limit",
    });
    expect(checkLanguageChange({ current, next: ["en"], ...standard }).ok).toBe(true);
  });

  test.each([[["xx"]], [["en", "en"]], [["EN"]], [[""]]])("invalid list %j", (next) => {
    expect(checkLanguageChange({ current: [], next, ...premium })).toEqual({
      ok: false,
      reason: "invalid",
    });
  });
});
