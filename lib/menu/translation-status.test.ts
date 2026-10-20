// ScanMe Menu V1 (K16) — the state of a translation (master §7.7): missing /
// stale / suggested / done, the writers, and the rule that an AI suggestion is
// never published without the owner's confirmation.

import { describe, expect, test } from "vitest";
import { fixtureMenu } from "../../components/menu/fixtures";
import {
  compileSnapshot,
  confirmedTranslation,
  parsePublicPage,
  type MenuDraftSnapshot,
  type SnapshotArticle,
} from "./snapshot";
import {
  countStatuses,
  entityTranslationStatus,
  fieldTranslation,
  sourceHash,
  withConfirmedSuggestion,
  withReviewedTranslation,
  withSuggestion,
  withTypedTranslation,
  withoutSuggestion,
  worstStatus,
  type MenuTranslationEntry,
  type MenuTranslations,
} from "./translation-status";

/** What guests of `lang` would read for a field: confirmed text only. */
const published = (translations: MenuTranslations | undefined, lang: string, field: "name" | "description" | "publicTitle") =>
  confirmedTranslation(translations ?? null, lang, field);

const confirmedEntry = (extra: Partial<MenuTranslationEntry>): MenuTranslationEntry => ({ status: "confirmed", ...extra });

// =============================================================================
// sourceHash
// =============================================================================

describe("sourceHash", () => {
  test("is stable for the same text", () => {
    expect(sourceHash("Teleća čorba")).toBe(sourceHash("Teleća čorba"));
  });

  test("ignores outer and repeated whitespace", () => {
    expect(sourceHash("  Teleća   čorba \n")).toBe(sourceHash("Teleća čorba"));
  });

  test("a different text gives a different hash", () => {
    expect(sourceHash("Teleća čorba")).not.toBe(sourceHash("Paradajz čorba"));
  });

  test("is FNV-1a 32 bit in base 36 (standard test vectors)", () => {
    expect(parseInt(sourceHash(""), 36)).toBe(0x811c9dc5);
    expect(parseInt(sourceHash("a"), 36)).toBe(0xe40c292c);
    expect(parseInt(sourceHash("foobar"), 36)).toBe(0xbf9cf968);
    expect(sourceHash("foobar")).toMatch(/^[0-9a-z]+$/);
  });
});

// =============================================================================
// fieldTranslation
// =============================================================================

describe("fieldTranslation", () => {
  const source = "Teleća čorba";

  test("status is null when the source is empty (nothing to translate)", () => {
    expect(fieldTranslation(null, undefined, "description")).toEqual({ status: null, confirmed: null, suggestion: null });
    expect(fieldTranslation("   ", undefined, "name").status).toBeNull();
    expect(fieldTranslation(undefined, null, "name").status).toBeNull();
  });

  test("an empty source still reports an existing confirmed text", () => {
    const entry = confirmedEntry({ description: "Old text" });
    expect(fieldTranslation(null, entry, "description")).toEqual({ status: null, confirmed: "Old text", suggestion: null });
  });

  test("missing when there is no entry or nothing confirmed for the field", () => {
    expect(fieldTranslation(source, undefined, "name")).toEqual({ status: "missing", confirmed: null, suggestion: null });
    expect(fieldTranslation(source, null, "name").status).toBe("missing");
    expect(fieldTranslation(source, confirmedEntry({ description: "Only this" }), "name").status).toBe("missing");
    expect(fieldTranslation(source, confirmedEntry({ name: "   " }), "name").status).toBe("missing");
  });

  test("done when confirmed from the current source text", () => {
    const entry = confirmedEntry({ name: "Veal soup", nameHash: sourceHash(source) });
    expect(fieldTranslation(source, entry, "name")).toEqual({ status: "done", confirmed: "Veal soup", suggestion: null });
  });

  test("a spacing-only change of the source does not make the translation stale", () => {
    const entry = confirmedEntry({ name: "Veal soup", nameHash: sourceHash(source) });
    expect(fieldTranslation("  Teleća   čorba ", entry, "name").status).toBe("done");
  });

  test("stale when the stored hash differs from the current source hash, and the confirmed text stays reported", () => {
    const entry = confirmedEntry({ name: "Veal soup", nameHash: sourceHash("Goveđa čorba") });
    expect(fieldTranslation(source, entry, "name")).toEqual({ status: "stale", confirmed: "Veal soup", suggestion: null });
  });

  test("a translation without a hash is not stale", () => {
    const entry = confirmedEntry({ name: "Veal soup" });
    expect(fieldTranslation(source, entry, "name").status).toBe("done");
  });

  test("each field is compared with its own hash", () => {
    const entry = confirmedEntry({
      name: "Veal soup",
      nameHash: sourceHash(source),
      description: "Hearty",
      descriptionHash: sourceHash("older description"),
    });
    expect(fieldTranslation(source, entry, "name").status).toBe("done");
    expect(fieldTranslation("new description", entry, "description").status).toBe("stale");
    const title = confirmedEntry({ publicTitle: "Wine list", titleHash: sourceHash("Vinska karta") });
    expect(fieldTranslation("Vinska karta", title, "publicTitle").status).toBe("done");
    expect(fieldTranslation("Vina", title, "publicTitle").status).toBe("stale");
  });

  test("suggested when only a suggestion exists; the suggestion is not a confirmed text", () => {
    const entry: MenuTranslationEntry = { status: "suggested", suggestion: { name: "Veal soup", at: 1 } };
    expect(fieldTranslation(source, entry, "name")).toEqual({ status: "suggested", confirmed: null, suggestion: "Veal soup" });
  });

  test("a suggested-status entry with a main text is still not confirmed", () => {
    const entry: MenuTranslationEntry = { status: "suggested", name: "Leaked text", suggestion: { name: "Veal soup", at: 1 } };
    expect(fieldTranslation(source, entry, "name").confirmed).toBeNull();
  });

  test("the confirmed text stays reported while a suggestion is pending", () => {
    const entry = confirmedEntry({ name: "Veal soup", nameHash: sourceHash(source), suggestion: { name: "Calf soup", at: 1 } });
    expect(fieldTranslation(source, entry, "name")).toEqual({ status: "done", confirmed: "Veal soup", suggestion: "Calf soup" });
  });

  test("a suggestion for another field does not change this field", () => {
    const entry: MenuTranslationEntry = { status: "suggested", suggestion: { description: "Tasty", at: 1 } };
    expect(fieldTranslation(source, entry, "name").status).toBe("missing");
    expect(fieldTranslation("Opis", entry, "description").status).toBe("suggested");
  });
});

// =============================================================================
// worstStatus, entityTranslationStatus, countStatuses
// =============================================================================

describe("worstStatus", () => {
  test("missing > stale > suggested > done", () => {
    expect(worstStatus(["done", "suggested", "stale", "missing"])).toBe("missing");
    expect(worstStatus(["done", "suggested", "stale"])).toBe("stale");
    expect(worstStatus(["done", "suggested"])).toBe("suggested");
    expect(worstStatus(["done", "done"])).toBe("done");
    expect(worstStatus(["stale", "missing"])).toBe("missing");
    expect(worstStatus(["suggested", "stale"])).toBe("stale");
  });

  test("nulls are ignored and nothing to translate is null", () => {
    expect(worstStatus([null, "done", null])).toBe("done");
    expect(worstStatus([null, null])).toBeNull();
    expect(worstStatus([])).toBeNull();
  });
});

describe("entityTranslationStatus", () => {
  const sources = { name: "Teleća čorba", description: "Sa povrćem" };

  test("worst state over the fields that have a source text", () => {
    const translations: MenuTranslations = {
      en: confirmedEntry({ name: "Veal soup", nameHash: sourceHash("Teleća čorba") }),
    };
    expect(entityTranslationStatus(sources, translations, "en")).toBe("missing");
    expect(entityTranslationStatus({ name: sources.name, description: null }, translations, "en")).toBe("done");
  });

  test("all fields done gives done; one stale field gives stale", () => {
    const done: MenuTranslations = {
      en: confirmedEntry({
        name: "Veal soup",
        nameHash: sourceHash(sources.name),
        description: "With vegetables",
        descriptionHash: sourceHash(sources.description),
      }),
    };
    expect(entityTranslationStatus(sources, done, "en")).toBe("done");
    const stale: MenuTranslations = { en: { ...done.en, descriptionHash: sourceHash("Sa mesom") } };
    expect(entityTranslationStatus(sources, stale, "en")).toBe("stale");
  });

  test("no translations at all, or another language, is missing", () => {
    expect(entityTranslationStatus(sources, null, "en")).toBe("missing");
    expect(entityTranslationStatus(sources, undefined, "en")).toBe("missing");
    const german: MenuTranslations = { de: confirmedEntry({ name: "Kalbssuppe" }) };
    expect(entityTranslationStatus({ name: sources.name }, german, "en")).toBe("missing");
  });

  test("nothing to translate is null", () => {
    expect(entityTranslationStatus({ name: null, description: "  " }, null, "en")).toBeNull();
    expect(entityTranslationStatus({}, null, "en")).toBeNull();
  });
});

describe("countStatuses", () => {
  test("counts every state and skips nulls", () => {
    expect(countStatuses(["missing", "missing", "stale", "suggested", "done", "done", "done", null])).toEqual({
      missing: 2,
      stale: 1,
      suggested: 1,
      done: 3,
    });
  });

  test("an empty list is all zeros", () => {
    expect(countStatuses([])).toEqual({ missing: 0, stale: 0, suggested: 0, done: 0 });
  });
});

// =============================================================================
// withTypedTranslation
// =============================================================================

describe("withTypedTranslation", () => {
  test("creates a confirmed entry made from the CURRENT source text", () => {
    const result = withTypedTranslation(undefined, "en", "name", "Veal soup", "Teleća čorba");
    expect(result).toEqual({ en: { status: "confirmed", name: "Veal soup", nameHash: sourceHash("Teleća čorba") } });
    expect(fieldTranslation("Teleća čorba", result?.en, "name").status).toBe("done");
  });

  test("cleans the typed text", () => {
    const result = withTypedTranslation(null, "en", "name", "  Veal   soup ", "Teleća čorba");
    expect(result?.en.name).toBe("Veal soup");
  });

  test("keeps the other fields and languages", () => {
    const before: MenuTranslations = {
      en: confirmedEntry({ name: "Veal soup", nameHash: "h1" }),
      de: confirmedEntry({ name: "Kalbssuppe", nameHash: "h2" }),
    };
    const result = withTypedTranslation(before, "en", "description", "Hearty", "Sa povrćem");
    expect(result?.en).toEqual({
      status: "confirmed",
      name: "Veal soup",
      nameHash: "h1",
      description: "Hearty",
      descriptionHash: sourceHash("Sa povrćem"),
    });
    expect(result?.de).toEqual(before.de);
  });

  test("does not mutate its input", () => {
    const before: MenuTranslations = { en: confirmedEntry({ name: "Veal soup", nameHash: "h1", suggestion: { description: "Tasty", at: 1 } }) };
    const copy = structuredClone(before);
    withTypedTranslation(before, "en", "description", "Hearty", "Opis");
    expect(before).toEqual(copy);
  });

  test("clearing a field removes the field and its hash", () => {
    const before: MenuTranslations = {
      en: confirmedEntry({ name: "Veal soup", nameHash: "h1", description: "Hearty", descriptionHash: "h2" }),
    };
    const result = withTypedTranslation(before, "en", "name", null, "Teleća čorba");
    expect(result).toEqual({ en: { status: "confirmed", description: "Hearty", descriptionHash: "h2" } });
  });

  test("typing only spaces clears the field", () => {
    const before: MenuTranslations = {
      en: confirmedEntry({ name: "Veal soup", nameHash: "h1", description: "Hearty", descriptionHash: "h2" }),
    };
    const result = withTypedTranslation(before, "en", "name", "   ", "Teleća čorba");
    expect(result?.en.name).toBeUndefined();
    expect(result?.en.nameHash).toBeUndefined();
    expect(result?.en.description).toBe("Hearty");
  });

  test("the entry is removed when nothing is left; other languages stay", () => {
    const only: MenuTranslations = { en: confirmedEntry({ name: "Veal soup", nameHash: "h1" }) };
    expect(withTypedTranslation(only, "en", "name", null, "Teleća čorba")).toBeUndefined();
    const two: MenuTranslations = { ...only, de: confirmedEntry({ name: "Kalbssuppe" }) };
    expect(withTypedTranslation(two, "en", "name", null, "Teleća čorba")).toEqual({ de: two.de });
  });

  test("clearing a field that was never translated leaves no empty entry", () => {
    expect(withTypedTranslation(undefined, "en", "name", null, "Teleća čorba")).toBeUndefined();
  });

  test("typing on a suggestion-only entry confirms just that field and drops that field's suggestion", () => {
    const before = withSuggestion(
      undefined,
      "en",
      { name: "Calf soup", description: "Hearty" },
      { name: "Teleća čorba", description: "Sa povrćem" },
      7,
    );
    const result = withTypedTranslation(before, "en", "name", "Veal soup", "Teleća čorba");
    expect(result?.en.status).toBe("confirmed");
    expect(result?.en.name).toBe("Veal soup");
    expect(result?.en.nameHash).toBe(sourceHash("Teleća čorba"));
    // The other field's suggestion is kept, still unpublished.
    expect(result?.en.suggestion).toEqual({
      description: "Hearty",
      descriptionHash: sourceHash("Sa povrćem"),
      at: 7,
    });
    expect(published(result, "en", "name")).toBe("Veal soup");
    expect(published(result, "en", "description")).toBeNull();
    expect(fieldTranslation("Sa povrćem", result?.en, "description").status).toBe("suggested");
  });

  test("typing the only suggested field leaves a plain confirmed entry", () => {
    const before = withSuggestion(undefined, "en", { name: "Calf soup" }, { name: "Teleća čorba" }, 7);
    const result = withTypedTranslation(before, "en", "name", "Veal soup", "Teleća čorba");
    expect(result).toEqual({ en: { status: "confirmed", name: "Veal soup", nameHash: sourceHash("Teleća čorba") } });
  });

  test("a confirmed entry stays confirmed and keeps another field's suggestion", () => {
    const before: MenuTranslations = {
      en: confirmedEntry({
        name: "Veal soup",
        nameHash: "h1",
        suggestion: { description: "Hearty", descriptionHash: "h2", at: 3 },
      }),
    };
    const result = withTypedTranslation(before, "en", "name", "Beef soup", "Teleća čorba");
    expect(result?.en.status).toBe("confirmed");
    expect(result?.en.suggestion).toEqual({ description: "Hearty", descriptionHash: "h2", at: 3 });
  });
});

// =============================================================================
// withSuggestion — never changes what is published
// =============================================================================

describe("withSuggestion", () => {
  test("on an empty record creates an entry with status suggested", () => {
    const result = withSuggestion(undefined, "en", { name: "Veal soup" }, { name: "Teleća čorba" }, 11);
    expect(result).toEqual({
      en: { status: "suggested", suggestion: { name: "Veal soup", nameHash: sourceHash("Teleća čorba"), at: 11 } },
    });
  });

  test("a suggestion is not a confirmed translation", () => {
    const result = withSuggestion(null, "en", { name: "Veal soup" }, { name: "Teleća čorba" }, 11);
    expect(published(result, "en", "name")).toBeNull();
    expect(fieldTranslation("Teleća čorba", result?.en, "name")).toEqual({
      status: "suggested",
      confirmed: null,
      suggestion: "Veal soup",
    });
  });

  test("never changes the confirmed text", () => {
    const before: MenuTranslations = {
      en: confirmedEntry({ name: "Veal soup", nameHash: sourceHash("Teleća čorba"), description: "Hearty", descriptionHash: "h2" }),
    };
    const result = withSuggestion(
      before,
      "en",
      { name: "Calf soup", description: "Rich" },
      { name: "Teleća čorba", description: "Sa povrćem" },
      12,
    );
    for (const field of ["name", "description", "publicTitle"] as const) {
      expect(published(result, "en", field)).toBe(published(before, "en", field));
    }
    expect(result?.en.status).toBe("confirmed");
    expect(result?.en.name).toBe("Veal soup");
    expect(result?.en.description).toBe("Hearty");
    expect(result?.en.suggestion?.name).toBe("Calf soup");
  });

  test("does not mutate its input", () => {
    const before: MenuTranslations = { en: confirmedEntry({ name: "Veal soup" }) };
    const copy = structuredClone(before);
    withSuggestion(before, "en", { name: "Calf soup" }, { name: "Teleća čorba" }, 1);
    expect(before).toEqual(copy);
  });

  test("fields with an empty source are ignored", () => {
    const result = withSuggestion(
      undefined,
      "en",
      { name: "Veal soup", description: "Invented description" },
      { name: "Teleća čorba", description: null },
      5,
    );
    expect(result?.en.suggestion).toEqual({ name: "Veal soup", nameHash: sourceHash("Teleća čorba"), at: 5 });
    expect(result?.en.suggestion?.description).toBeUndefined();
  });

  test("fields without a suggested text are ignored", () => {
    const result = withSuggestion(undefined, "en", { name: "  ", description: "Hearty" }, { name: "Teleća čorba", description: "Sa povrćem" }, 5);
    expect(result?.en.suggestion?.name).toBeUndefined();
    expect(result?.en.suggestion?.description).toBe("Hearty");
  });

  test("nothing usable returns the translations as they were", () => {
    expect(withSuggestion(undefined, "en", { name: "Veal soup" }, { name: null }, 5)).toBeUndefined();
    const before: MenuTranslations = { en: confirmedEntry({ name: "Veal soup" }) };
    expect(withSuggestion(before, "en", {}, { name: "Teleća čorba" }, 5)).toBe(before);
  });

  test("a new suggestion replaces the pending one", () => {
    const first = withSuggestion(undefined, "en", { name: "Calf soup" }, { name: "Teleća čorba" }, 1);
    const second = withSuggestion(first, "en", { name: "Veal soup" }, { name: "Teleća čorba" }, 2);
    expect(second?.en.suggestion?.name).toBe("Veal soup");
    expect(second?.en.suggestion?.at).toBe(2);
  });
});

// =============================================================================
// withConfirmedSuggestion / withoutSuggestion
// =============================================================================

describe("withConfirmedSuggestion", () => {
  const sources = { name: "Teleća čorba", description: "Sa povrćem" };
  const suggested = () => withSuggestion(undefined, "en", { name: "Veal soup", description: "With vegetables" }, sources, 9);

  test("moves the suggestion to confirmed with the suggestion's hashes; the suggestion is gone", () => {
    const result = withConfirmedSuggestion(suggested(), "en");
    expect(result).toEqual({
      en: {
        status: "confirmed",
        name: "Veal soup",
        nameHash: sourceHash(sources.name),
        description: "With vegetables",
        descriptionHash: sourceHash(sources.description),
      },
    });
    expect(result?.en.suggestion).toBeUndefined();
  });

  test("after confirming, the text is published; before, it is not", () => {
    const before = suggested();
    expect(published(before, "en", "name")).toBeNull();
    const after = withConfirmedSuggestion(before, "en");
    expect(published(after, "en", "name")).toBe("Veal soup");
    expect(published(after, "en", "description")).toBe("With vegetables");
  });

  test("`edited` overrides single fields, the others stay as suggested", () => {
    const result = withConfirmedSuggestion(suggested(), "en", { description: "  Very   hearty " });
    expect(result?.en.name).toBe("Veal soup");
    expect(result?.en.description).toBe("Very hearty");
    // The hash is still the one of the source the suggestion was made from.
    expect(result?.en.descriptionHash).toBe(sourceHash(sources.description));
  });

  test("an empty edit falls back to the suggested text", () => {
    const result = withConfirmedSuggestion(suggested(), "en", { name: "   " });
    expect(result?.en.name).toBe("Veal soup");
  });

  test("a source that changed after the suggestion makes the confirmed text stale", () => {
    const result = withConfirmedSuggestion(suggested(), "en");
    expect(fieldTranslation("Teleća čorba sa knedlama", result?.en, "name").status).toBe("stale");
    expect(fieldTranslation(sources.name, result?.en, "name").status).toBe("done");
  });

  test("on a confirmed entry the suggested fields replace the old ones and the rest stay", () => {
    const before: MenuTranslations = {
      en: confirmedEntry({
        name: "Old name",
        nameHash: "old",
        description: "Old description",
        descriptionHash: "oldd",
        suggestion: { name: "New name", nameHash: sourceHash("Teleća čorba"), at: 4 },
      }),
    };
    const result = withConfirmedSuggestion(before, "en");
    expect(result?.en).toEqual({
      status: "confirmed",
      name: "New name",
      nameHash: sourceHash("Teleća čorba"),
      description: "Old description",
      descriptionHash: "oldd",
    });
  });

  test("keeps other languages and does not mutate its input", () => {
    const base = suggested() as MenuTranslations;
    const before: MenuTranslations = { ...base, de: confirmedEntry({ name: "Kalbssuppe" }) };
    const copy = structuredClone(before);
    const result = withConfirmedSuggestion(before, "en");
    expect(before).toEqual(copy);
    expect(result?.de).toEqual(before.de);
  });

  test("without a suggestion nothing changes", () => {
    const before: MenuTranslations = { en: confirmedEntry({ name: "Veal soup" }) };
    expect(withConfirmedSuggestion(before, "en")).toBe(before);
    expect(withConfirmedSuggestion(before, "de")).toBe(before);
    expect(withConfirmedSuggestion(undefined, "en")).toBeUndefined();
  });
});

describe("withoutSuggestion", () => {
  test("a suggestion-only entry disappears", () => {
    const before = withSuggestion(undefined, "en", { name: "Veal soup" }, { name: "Teleća čorba" }, 1);
    expect(withoutSuggestion(before, "en")).toBeUndefined();
  });

  test("the confirmed text stays as it was", () => {
    const before: MenuTranslations = {
      en: confirmedEntry({ name: "Veal soup", nameHash: "h1", suggestion: { name: "Calf soup", at: 1 } }),
    };
    const result = withoutSuggestion(before, "en");
    expect(result).toEqual({ en: { status: "confirmed", name: "Veal soup", nameHash: "h1" } });
    expect(published(result, "en", "name")).toBe("Veal soup");
  });

  test("other languages stay", () => {
    const base = withSuggestion(undefined, "en", { name: "Veal soup" }, { name: "Teleća čorba" }, 1) as MenuTranslations;
    const before: MenuTranslations = { ...base, de: confirmedEntry({ name: "Kalbssuppe" }) };
    expect(withoutSuggestion(before, "en")).toEqual({ de: before.de });
  });

  test("without a suggestion nothing changes", () => {
    const before: MenuTranslations = { en: confirmedEntry({ name: "Veal soup" }) };
    expect(withoutSuggestion(before, "en")).toBe(before);
    expect(withoutSuggestion(undefined, "en")).toBeUndefined();
  });
});

// =============================================================================
// withReviewedTranslation ("Prevod je i dalje dobar")
// =============================================================================

describe("withReviewedTranslation", () => {
  test("a stale translation becomes done", () => {
    const before: MenuTranslations = {
      en: confirmedEntry({ name: "Veal soup", nameHash: sourceHash("Goveđa čorba") }),
    };
    expect(fieldTranslation("Teleća čorba", before.en, "name").status).toBe("stale");
    const result = withReviewedTranslation(before, "en", { name: "Teleća čorba" });
    expect(result?.en.name).toBe("Veal soup");
    expect(result?.en.nameHash).toBe(sourceHash("Teleća čorba"));
    expect(fieldTranslation("Teleća čorba", result?.en, "name").status).toBe("done");
  });

  test("fields without a translation or without a source are left alone", () => {
    const before: MenuTranslations = {
      en: confirmedEntry({ name: "Veal soup", nameHash: "old", description: "Hearty", descriptionHash: "oldd" }),
    };
    const result = withReviewedTranslation(before, "en", { name: "Teleća čorba", description: null, publicTitle: "Naslov" });
    expect(result?.en.descriptionHash).toBe("oldd");
    expect(result?.en.publicTitle).toBeUndefined();
    expect(result?.en.titleHash).toBeUndefined();
  });

  test("an entry that is not confirmed is returned as it was", () => {
    const before = withSuggestion(undefined, "en", { name: "Veal soup" }, { name: "Teleća čorba" }, 1);
    expect(withReviewedTranslation(before, "en", { name: "Teleća čorba" })).toBe(before);
    expect(withReviewedTranslation(undefined, "en", { name: "Teleća čorba" })).toBeUndefined();
  });

  test("does not mutate its input", () => {
    const before: MenuTranslations = { en: confirmedEntry({ name: "Veal soup", nameHash: "old" }) };
    const copy = structuredClone(before);
    withReviewedTranslation(before, "en", { name: "Teleća čorba" });
    expect(before).toEqual(copy);
  });
});

// =============================================================================
// KEY ACCEPTANCE: an AI suggestion is never published without confirmation
// =============================================================================

describe("an AI suggestion is never published without confirmation (compileSnapshot)", () => {
  const SOURCE_NAME = "Teleća čorba";
  const SUGGESTED = "Calf broth by the machine";
  const CONFIRMED = "Veal soup";

  function menuWith(translations: MenuTranslations | undefined): { snapshot: MenuDraftSnapshot; articleKey: string; pageKey: string } {
    const { snapshot } = fixtureMenu("srednji");
    const article = snapshot.articles.find((a) => a.name === SOURCE_NAME) as SnapshotArticle;
    const page = snapshot.pages.find((p) => p.isDefault)!;
    return {
      snapshot: {
        ...snapshot,
        settings: { ...snapshot.settings, languages: { source: "sr", translations: ["en"] } },
        articles: snapshot.articles.map((a) => (a.key === article.key ? { ...a, translations: translations ?? null } : a)),
      },
      articleKey: article.key,
      pageKey: page.key,
    };
  }

  function compiled(snapshot: MenuDraftSnapshot, lang: string, pageKey: string, articleKey: string) {
    const version = compileSnapshot(snapshot, { languages: ["sr", "en"], roomService: false, scheduledPromos: false });
    const pageParts = version.parts
      .filter((row) => row.scope === "public" && row.lang === lang && row.pageKey === pageKey)
      .sort((a, b) => a.part - b.part)
      .map((row) => row.data);
    const doc = parsePublicPage(pageParts);
    const article = doc?.sections.flatMap((s) => s.articles).find((a) => a.key === articleKey);
    const publicText = version.parts.filter((row) => row.scope === "public").map((row) => row.data);
    return { name: article?.name, publicText };
  }

  test("a suggested-only article name compiles to the Serbian source text in the EN page part", () => {
    const suggestion = withSuggestion(undefined, "en", { name: SUGGESTED }, { name: SOURCE_NAME }, 1);
    const { snapshot, articleKey, pageKey } = menuWith(suggestion);
    const en = compiled(snapshot, "en", pageKey, articleKey);
    expect(en.name).toBe(SOURCE_NAME);
    expect(en.publicText.some((data) => data.includes(SUGGESTED))).toBe(false);
  });

  test("the English text appears only after withConfirmedSuggestion", () => {
    const suggestion = withSuggestion(undefined, "en", { name: CONFIRMED }, { name: SOURCE_NAME }, 1);
    const before = menuWith(suggestion);
    expect(compiled(before.snapshot, "en", before.pageKey, before.articleKey).name).toBe(SOURCE_NAME);

    const after = menuWith(withConfirmedSuggestion(suggestion, "en"));
    const en = compiled(after.snapshot, "en", after.pageKey, after.articleKey);
    expect(en.name).toBe(CONFIRMED);
    // Serbian guests still read the source text.
    expect(compiled(after.snapshot, "sr", after.pageKey, after.articleKey).name).toBe(SOURCE_NAME);
  });

  test("a pending suggestion next to a confirmed text does not replace the published text", () => {
    const confirmed = withTypedTranslation(undefined, "en", "name", CONFIRMED, SOURCE_NAME);
    const both = withSuggestion(confirmed, "en", { name: SUGGESTED }, { name: SOURCE_NAME }, 2);
    const { snapshot, articleKey, pageKey } = menuWith(both);
    const en = compiled(snapshot, "en", pageKey, articleKey);
    expect(en.name).toBe(CONFIRMED);
    expect(en.publicText.some((data) => data.includes(SUGGESTED))).toBe(false);
  });

  test("a rejected suggestion never reaches guests either", () => {
    const suggestion = withSuggestion(undefined, "en", { name: SUGGESTED }, { name: SOURCE_NAME }, 1);
    const { snapshot, articleKey, pageKey } = menuWith(withoutSuggestion(suggestion, "en"));
    expect(compiled(snapshot, "en", pageKey, articleKey).name).toBe(SOURCE_NAME);
  });

  test("confirmedTranslation reads the same value before and after a suggestion is added", () => {
    const confirmed = withTypedTranslation(undefined, "en", "name", CONFIRMED, SOURCE_NAME);
    const withPending = withSuggestion(confirmed, "en", { name: SUGGESTED }, { name: SOURCE_NAME }, 3);
    expect(confirmedTranslation(withPending ?? null, "en", "name")).toBe(confirmedTranslation(confirmed ?? null, "en", "name"));
    expect(confirmedTranslation(withPending ?? null, "en", "name")).toBe(CONFIRMED);
  });
});
