// ScanMe Menu V1 — K04: publish validation (master §5.5, §6.1). To PUBLISH, an
// article needs a name, a section and a price; the draft may hold incomplete
// articles, so a hidden one never blocks the rest. These are the acceptance
// tests of that rule.

import { describe, expect, test } from "vitest";
import { MENU_PUBLISH_ERRORS, MENU_PUBLISH_WARNINGS, type MenuPublishIssueCode } from "./errors/publish";
import {
  articlePublishScope,
  validateArticleForPublish,
  validateDraftForPublish,
  type PublishIssue,
  type PublishValidationArticle,
} from "./publish-validation";

const STANDARD = { scheduledPromos: false };
const PREMIUM = { scheduledPromos: true };

/** A complete, public ordinary article; tests override what they want to break. */
function article(overrides: Partial<PublishValidationArticle> = {}): PublishValidationArticle {
  return {
    key: "ar_test00000001",
    kind: "item",
    name: "Vranac",
    basePriceRsd: 250,
    variantsEnabled: false,
    variants: [],
    addonsEnabled: false,
    addonGroups: [],
    promo: null,
    comboComponentCount: 0,
    priceCheckPending: false,
    sectionCount: 1,
    visibleCount: 1,
    inRoomService: false,
    componentOfCombos: 0,
    ...overrides,
  };
}

function combo(overrides: Partial<PublishValidationArticle> = {}): PublishValidationArticle {
  return article({
    key: "ar_combo0000001",
    kind: "combo",
    name: "Vinski set",
    basePriceRsd: 900,
    comboComponentCount: 2,
    ...overrides,
  });
}

function group(
  overrides: Partial<PublishValidationArticle["addonGroups"][number]> = {},
): PublishValidationArticle["addonGroups"][number] {
  return {
    key: "ag_test00000001",
    selection: "multiple",
    required: false,
    minSelect: null,
    maxSelect: null,
    optionCount: 3,
    ...overrides,
  };
}

const codes = (issues: readonly PublishIssue[]) => issues.map((issue) => issue.code);

describe("validateArticleForPublish: the three errors of master §5.5", () => {
  test("a complete article has no error and no warning", () => {
    expect(validateArticleForPublish(article(), STANDARD)).toEqual({ errors: [], warnings: [] });
  });

  test("without a name", () => {
    for (const name of ["", "   ", " \t\n "]) {
      const result = validateArticleForPublish(article({ name }), STANDARD);
      expect(result.errors).toEqual([{ code: "name_missing", articleKey: "ar_test00000001" }]);
      expect(result.warnings).toEqual([]);
    }
  });

  test("without a section", () => {
    const result = validateArticleForPublish(
      article({ sectionCount: 0, visibleCount: 0 }),
      STANDARD,
    );
    expect(result.errors).toEqual([{ code: "section_missing", articleKey: "ar_test00000001" }]);
  });

  test("without a price", () => {
    const result = validateArticleForPublish(article({ basePriceRsd: null }), STANDARD);
    expect(result.errors).toEqual([{ code: "price_missing", articleKey: "ar_test00000001" }]);
  });

  test("a price of 0 is a price", () => {
    expect(validateArticleForPublish(article({ basePriceRsd: 0 }), STANDARD).errors).toEqual([]);
  });

  test("without a name, a section and a price: all three, in that order", () => {
    const result = validateArticleForPublish(
      article({ name: "", sectionCount: 0, visibleCount: 0, basePriceRsd: null }),
      STANDARD,
    );
    expect(codes(result.errors)).toEqual(["name_missing", "section_missing", "price_missing"]);
    expect(result.errors.every((issue) => issue.articleKey === "ar_test00000001")).toBe(true);
  });

  test("a variant with a price satisfies the price rule, but only while variants are on", () => {
    const variants = [
      { key: "va_a", priceRsd: null },
      { key: "va_b", priceRsd: 200 },
    ];
    expect(
      validateArticleForPublish(
        article({ basePriceRsd: null, variantsEnabled: true, variants }),
        STANDARD,
      ).errors,
    ).toEqual([]);
    expect(
      codes(
        validateArticleForPublish(
          article({ basePriceRsd: null, variantsEnabled: false, variants }),
          STANDARD,
        ).errors,
      ),
    ).toEqual(["price_missing"]);
  });

  test("variants without any price do not satisfy the price rule", () => {
    const result = validateArticleForPublish(
      article({
        basePriceRsd: null,
        variantsEnabled: true,
        variants: [
          { key: "va_a", priceRsd: null },
          { key: "va_b", priceRsd: null },
        ],
      }),
      STANDARD,
    );
    expect(codes(result.errors)).toEqual(["price_missing"]);
  });

  test("a combo without its manual price fails, whatever its variants say", () => {
    const failing = validateArticleForPublish(
      combo({
        basePriceRsd: null,
        variantsEnabled: true,
        variants: [{ key: "va_a", priceRsd: 500 }],
      }),
      STANDARD,
    );
    expect(codes(failing.errors)).toEqual(["price_missing"]);
    expect(validateArticleForPublish(combo(), STANDARD).errors).toEqual([]);
  });

  test("an article only in Room service passes the section rule (its RS category is its section)", () => {
    const onlyRoomService = article({ sectionCount: 0, visibleCount: 0, inRoomService: true });
    expect(validateArticleForPublish(onlyRoomService, STANDARD).errors).toEqual([]);
    expect(
      codes(
        validateArticleForPublish({ ...onlyRoomService, inRoomService: false }, STANDARD).errors,
      ),
    ).toEqual(["section_missing"]);
  });
});

describe("validateArticleForPublish: warnings", () => {
  test("variants_empty: variants on and none added; off means no warning", () => {
    const on = validateArticleForPublish(article({ variantsEnabled: true, variants: [] }), STANDARD);
    expect(on.errors).toEqual([]);
    expect(on.warnings).toEqual([{ code: "variants_empty", articleKey: "ar_test00000001" }]);
    expect(
      validateArticleForPublish(article({ variantsEnabled: false, variants: [] }), STANDARD)
        .warnings,
    ).toEqual([]);
  });

  test("variant_price_missing: one per priced-less variant, only without a base price", () => {
    const variants = [
      { key: "va_a", priceRsd: 200 },
      { key: "va_b", priceRsd: null },
      { key: "va_c", priceRsd: null },
    ];
    const withoutBase = validateArticleForPublish(
      article({ basePriceRsd: null, variantsEnabled: true, variants }),
      STANDARD,
    );
    expect(withoutBase.errors).toEqual([]);
    expect(withoutBase.warnings).toEqual([
      { code: "variant_price_missing", articleKey: "ar_test00000001", entityKey: "va_b" },
      { code: "variant_price_missing", articleKey: "ar_test00000001", entityKey: "va_c" },
    ]);
    // With a base price a variant without its own price falls back to it.
    expect(
      validateArticleForPublish(article({ variantsEnabled: true, variants }), STANDARD).warnings,
    ).toEqual([]);
    // Variants that are switched off are not looked at.
    expect(
      validateArticleForPublish(
        article({ basePriceRsd: 250, variantsEnabled: false, variants }),
        STANDARD,
      ).warnings,
    ).toEqual([]);
  });

  test("addon_group_empty: a linked group without options; empty beats unsatisfiable", () => {
    const result = validateArticleForPublish(
      article({
        addonsEnabled: true,
        addonGroups: [
          group({ key: "ag_empty", optionCount: 0 }),
          group({ key: "ag_empty_required", optionCount: 0, required: true, minSelect: 2 }),
        ],
      }),
      STANDARD,
    );
    expect(result.warnings).toEqual([
      { code: "addon_group_empty", articleKey: "ar_test00000001", entityKey: "ag_empty" },
      { code: "addon_group_empty", articleKey: "ar_test00000001", entityKey: "ag_empty_required" },
    ]);
  });

  test("addon_group_unsatisfiable: asks for more choices than it has options", () => {
    const result = validateArticleForPublish(
      article({
        addonsEnabled: true,
        addonGroups: [
          group({ key: "ag_too_many", required: true, minSelect: 3, optionCount: 2 }),
          group({ key: "ag_fine_single", selection: "single", required: true, optionCount: 1 }),
          group({ key: "ag_fine_multi", required: true, minSelect: 2, optionCount: 2 }),
          group({ key: "ag_optional", optionCount: 1 }),
        ],
      }),
      STANDARD,
    );
    expect(result.warnings).toEqual([
      { code: "addon_group_unsatisfiable", articleKey: "ar_test00000001", entityKey: "ag_too_many" },
    ]);
  });

  test("add-on warnings exist only while add-ons are on", () => {
    const result = validateArticleForPublish(
      article({ addonsEnabled: false, addonGroups: [group({ optionCount: 0 })] }),
      STANDARD,
    );
    expect(result.warnings).toEqual([]);
  });

  test("promo_invalid: an active promotion that cannot apply; an inactive one is not judged", () => {
    const notLower = { active: true, mode: "price" as const, priceRsd: 250 };
    expect(codes(validateArticleForPublish(article({ promo: notLower }), STANDARD).warnings)).toEqual(
      ["promo_invalid"],
    );
    expect(
      validateArticleForPublish(article({ promo: { ...notLower, active: false } }), STANDARD)
        .warnings,
    ).toEqual([]);
    // Percent with no regular price at all.
    expect(
      codes(
        validateArticleForPublish(
          article({ basePriceRsd: null, promo: { active: true, mode: "percent", percent: 10 } }),
          STANDARD,
        ).warnings,
      ),
    ).toContain("promo_invalid");
    // A price promotion cannot sit on variants.
    expect(
      codes(
        validateArticleForPublish(
          article({
            variantsEnabled: true,
            variants: [{ key: "va_a", priceRsd: 200 }],
            promo: { active: true, mode: "price", priceRsd: 100 },
          }),
          STANDARD,
        ).warnings,
      ),
    ).toEqual(["promo_invalid"]);
  });

  test("a valid promotion produces no warning", () => {
    expect(
      validateArticleForPublish(
        article({ promo: { active: true, mode: "price", priceRsd: 200 } }),
        STANDARD,
      ).warnings,
    ).toEqual([]);
    expect(
      validateArticleForPublish(
        article({ promo: { active: true, mode: "percent", percent: 15 } }),
        STANDARD,
      ).warnings,
    ).toEqual([]);
  });

  test("promo_schedule_premium: a scheduled promotion without Premium", () => {
    const scheduled = { active: true, mode: "percent" as const, percent: 10, startsAt: 1_000, endsAt: 2_000 };
    expect(codes(validateArticleForPublish(article({ promo: scheduled }), STANDARD).warnings)).toEqual(
      ["promo_schedule_premium"],
    );
    expect(validateArticleForPublish(article({ promo: scheduled }), PREMIUM).warnings).toEqual([]);
    // A promotion without a schedule is Standard.
    expect(
      validateArticleForPublish(
        article({ promo: { active: true, mode: "percent", percent: 10 } }),
        STANDARD,
      ).warnings,
    ).toEqual([]);
    // Both can be true at once.
    const both = validateArticleForPublish(
      article({ promo: { ...scheduled, mode: "price", priceRsd: 300 } }),
      STANDARD,
    );
    expect(codes(both.warnings)).toEqual(["promo_invalid", "promo_schedule_premium"]);
  });

  test("combo_price_check and combo_empty belong to combos only", () => {
    const result = validateArticleForPublish(
      combo({ priceCheckPending: true, comboComponentCount: 0 }),
      STANDARD,
    );
    expect(result.errors).toEqual([]);
    expect(codes(result.warnings)).toEqual(["combo_price_check", "combo_empty"]);

    const ordinary = validateArticleForPublish(
      article({ priceCheckPending: true, comboComponentCount: 0 }),
      STANDARD,
    );
    expect(ordinary.warnings).toEqual([]);
    expect(validateArticleForPublish(combo(), STANDARD).warnings).toEqual([]);
  });

  test("every warning code of the catalogue can be produced (article_unplaced by the draft check)", () => {
    const produced = new Set<MenuPublishIssueCode>();
    const collect = (issues: readonly PublishIssue[]) => {
      for (const issue of issues) produced.add(issue.code);
    };
    collect(validateArticleForPublish(article({ variantsEnabled: true }), STANDARD).warnings);
    collect(
      validateArticleForPublish(
        article({ basePriceRsd: null, variantsEnabled: true, variants: [{ key: "va_a", priceRsd: null }] }),
        STANDARD,
      ).warnings,
    );
    collect(
      validateArticleForPublish(
        article({
          addonsEnabled: true,
          addonGroups: [group({ optionCount: 0 }), group({ required: true, minSelect: 4, optionCount: 2 })],
        }),
        STANDARD,
      ).warnings,
    );
    collect(
      validateArticleForPublish(
        article({
          promo: { active: true, mode: "price", priceRsd: 999, startsAt: 1 },
        }),
        STANDARD,
      ).warnings,
    );
    collect(
      validateArticleForPublish(combo({ priceCheckPending: true, comboComponentCount: 0 }), STANDARD)
        .warnings,
    );
    collect(
      validateDraftForPublish([article({ sectionCount: 0, visibleCount: 0 })], STANDARD).warnings,
    );
    expect([...produced].sort()).toEqual([...MENU_PUBLISH_WARNINGS].sort());
    // The three errors are exactly the catalogue's errors.
    const errors = validateArticleForPublish(
      article({ name: "", sectionCount: 0, visibleCount: 0, basePriceRsd: null }),
      STANDARD,
    ).errors;
    expect(codes(errors).sort()).toEqual([...MENU_PUBLISH_ERRORS].sort());
  });
});

describe("articlePublishScope", () => {
  test("public: a visible placement, or Room service", () => {
    expect(articlePublishScope(article())).toBe("public");
    expect(
      articlePublishScope(article({ sectionCount: 0, visibleCount: 0, inRoomService: true })),
    ).toBe("public");
  });

  test("hidden: on a page but nothing shows it (even when it is also inside a combo)", () => {
    expect(articlePublishScope(article({ visibleCount: 0 }))).toBe("hidden");
    expect(articlePublishScope(article({ visibleCount: 0, componentOfCombos: 2 }))).toBe("hidden");
  });

  test("component: only inside combos", () => {
    expect(
      articlePublishScope(article({ sectionCount: 0, visibleCount: 0, componentOfCombos: 1 })),
    ).toBe("component");
  });

  test("unplaced: nowhere", () => {
    expect(articlePublishScope(article({ sectionCount: 0, visibleCount: 0 }))).toBe("unplaced");
  });
});

describe("validateDraftForPublish: the draft keeps incomplete articles (master §5.5)", () => {
  const incomplete = { name: "", basePriceRsd: null };

  test("a PUBLIC incomplete article blocks publishing", () => {
    const verdict = validateDraftForPublish([article(incomplete)], STANDARD);
    expect(verdict.ok).toBe(false);
    expect(codes(verdict.errors)).toEqual(["name_missing", "price_missing"]);
  });

  test("the SAME article, hidden, produces no issue at all: the draft keeps it", () => {
    const verdict = validateDraftForPublish([article({ ...incomplete, visibleCount: 0 })], STANDARD);
    expect(verdict).toEqual({ ok: true, errors: [], warnings: [] });
  });

  test("a component-only article produces nothing", () => {
    const verdict = validateDraftForPublish(
      [article({ ...incomplete, sectionCount: 0, visibleCount: 0, componentOfCombos: 1 })],
      STANDARD,
    );
    expect(verdict).toEqual({ ok: true, errors: [], warnings: [] });
  });

  test("an unplaced article produces only the warning article_unplaced", () => {
    const verdict = validateDraftForPublish(
      [article({ ...incomplete, sectionCount: 0, visibleCount: 0 })],
      STANDARD,
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.errors).toEqual([]);
    expect(verdict.warnings).toEqual([{ code: "article_unplaced", articleKey: "ar_test00000001" }]);
  });

  test("a Room service article is public and gets the strict check", () => {
    const roomService = article({ sectionCount: 0, visibleCount: 0, inRoomService: true });
    expect(validateDraftForPublish([roomService], STANDARD).ok).toBe(true);
    const broken = validateDraftForPublish([{ ...roomService, basePriceRsd: null }], STANDARD);
    expect(broken.ok).toBe(false);
    expect(codes(broken.errors)).toEqual(["price_missing"]);
  });

  test("a hidden incomplete article does not block the rest; a public one does, alone", () => {
    const fine = article({ key: "ar_fine00000001" });
    const hidden = article({ key: "ar_hide00000001", ...incomplete, visibleCount: 0 });
    expect(validateDraftForPublish([fine, hidden], STANDARD).ok).toBe(true);

    const broken = article({ key: "ar_brok00000001", basePriceRsd: null });
    const verdict = validateDraftForPublish([fine, hidden, broken], STANDARD);
    expect(verdict.ok).toBe(false);
    expect(verdict.errors).toEqual([{ code: "price_missing", articleKey: "ar_brok00000001" }]);
  });

  test("warnings of public articles are reported and do not block", () => {
    const verdict = validateDraftForPublish(
      [article({ variantsEnabled: true }), combo({ priceCheckPending: true })],
      STANDARD,
    );
    expect(verdict.ok).toBe(true);
    expect(verdict.warnings).toEqual([
      { code: "variants_empty", articleKey: "ar_test00000001" },
      { code: "combo_price_check", articleKey: "ar_combo0000001" },
    ]);
  });

  test("an empty draft is publishable", () => {
    expect(validateDraftForPublish([], STANDARD)).toEqual({ ok: true, errors: [], warnings: [] });
  });
});
