// ScanMe Menu V1 (K05) — restoring a version into the draft. A page with an
// active QR link is never deleted or archived by a restore; everything else
// follows the restored version. Fictional data only.

import { describe, expect, test } from "vitest";
import { RESTORE_IDENTITY, diffByIdentity, planRestore } from "./restore-plan";
import {
  sortSnapshot,
  type MenuDraftSnapshot,
  type SnapshotAddonGroup,
  type SnapshotAddonOption,
  type SnapshotArticle,
  type SnapshotArticleAddonGroup,
  type SnapshotComboComponent,
  type SnapshotPage,
  type SnapshotPlacement,
  type SnapshotSection,
  type SnapshotVariant,
} from "./snapshot";

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

function page(key: string, order: number, overrides: Partial<SnapshotPage> = {}): SnapshotPage {
  return {
    key,
    slug: key.replace(/^pg_/, ""),
    name: key,
    publicTitle: null,
    isDefault: false,
    order,
    visibility: "visible",
    archivedAt: null,
    iconKey: null,
    navigation: "standalone",
    translations: null,
    ...overrides,
  };
}

function section(
  key: string,
  pageKey: string,
  order: number,
  overrides: Partial<SnapshotSection> = {},
): SnapshotSection {
  return {
    key,
    pageKey,
    name: key,
    description: null,
    iconKey: null,
    order,
    visibility: "visible",
    translations: null,
    ...overrides,
  };
}

function article(
  key: string,
  name: string,
  basePriceRsd: number | null,
  overrides: Partial<SnapshotArticle> = {},
): SnapshotArticle {
  return {
    key,
    kind: "item",
    name,
    description: null,
    quantityValue: null,
    quantityUnit: null,
    basePriceRsd,
    mediaMode: "none",
    imageMediaId: null,
    iconKey: null,
    variantsEnabled: false,
    addonsEnabled: false,
    noteEnabled: false,
    allergens: null,
    tags: null,
    promo: null,
    priceCheck: null,
    translations: null,
    ...overrides,
  };
}

function placement(
  pageKey: string,
  sectionKey: string,
  articleKey: string,
  order: number,
  overrides: Partial<SnapshotPlacement> = {},
): SnapshotPlacement {
  return { pageKey, sectionKey, articleKey, order, visibility: "visible", ...overrides };
}

function variant(key: string, articleKey: string, priceRsd: number | null, order: number): SnapshotVariant {
  return { key, articleKey, name: key, priceRsd, order, translations: null };
}

function group(key: string, overrides: Partial<SnapshotAddonGroup> = {}): SnapshotAddonGroup {
  return {
    key,
    name: key,
    selection: "multiple",
    required: false,
    minSelect: null,
    maxSelect: null,
    translations: null,
    ...overrides,
  };
}

function option(key: string, groupKey: string, priceDeltaRsd: number, order: number): SnapshotAddonOption {
  return { key, groupKey, name: key, priceDeltaRsd, order, translations: null };
}

function link(articleKey: string, groupKey: string, order: number): SnapshotArticleAddonGroup {
  return { articleKey, groupKey, order };
}

function component(comboKey: string, componentKey: string, quantity: number, order: number): SnapshotComboComponent {
  return { comboKey, componentKey, quantity, order };
}

/** An empty draft; tests give it the lists they need. */
function draft(parts: Partial<MenuDraftSnapshot> = {}): MenuDraftSnapshot {
  return {
    formatVersion: 1,
    settings: { languages: null, allergensEnabled: null },
    presentation: null,
    pages: [],
    sections: [],
    articles: [],
    placements: [],
    variants: [],
    addonGroups: [],
    addonOptions: [],
    articleAddonGroups: [],
    comboComponents: [],
    roomService: { config: null, categories: [], items: [] },
    ...parts,
  };
}

/** A deep copy changed by `change` — the original stays as it was. */
function edit(source: MenuDraftSnapshot, change: (copy: MenuDraftSnapshot) => void): MenuDraftSnapshot {
  const copy = JSON.parse(JSON.stringify(source)) as MenuDraftSnapshot;
  change(copy);
  return copy;
}

function find<T extends { key: string }>(rows: T[], key: string): T {
  const row = rows.find((candidate) => candidate.key === key);
  if (!row) throw new Error(`test fixture: no row ${key}`);
  return row;
}

/** Reverses every list, so the order of the input proves nothing. */
function scramble(source: MenuDraftSnapshot): MenuDraftSnapshot {
  return edit(source, (d) => {
    d.pages.reverse();
    d.sections.reverse();
    d.articles.reverse();
    d.placements.reverse();
    d.variants.reverse();
    d.addonGroups.reverse();
    d.addonOptions.reverse();
    d.articleAddonGroups.reverse();
    d.comboComponents.reverse();
  });
}

const ids = <T>(rows: readonly T[], identity: (row: T) => string): string[] => rows.map(identity).sort();
const keys = (rows: readonly { key: string }[]): string[] => ids(rows, (row) => row.key);

/**
 * The draft as it stands now: the default page, and the "Vinska karta" page
 * with an active QR link, which shows a wine with variants and add-ons, a combo
 * and a coffee that every version has.
 */
function currentDraft(): MenuDraftSnapshot {
  return draft({
    pages: [
      page("pg_main", 1, { isDefault: true, slug: "glavni", name: "Kompletan meni" }),
      page("pg_vino", 2, { slug: "vinska-karta", name: "Vinska karta" }),
    ],
    sections: [section("se_main", "pg_main", 1), section("se_vino", "pg_vino", 1)],
    articles: [
      article("ar_kafa", "Kafa", 200),
      article("ar_vranac", "Vranac", 250, { variantsEnabled: true, addonsEnabled: true }),
      article("ar_sir", "Sirna plata", 300),
      article("ar_set", "Vinski set", 900, { kind: "combo" }),
    ],
    placements: [
      placement("pg_main", "se_main", "ar_kafa", 1),
      placement("pg_vino", "se_vino", "ar_vranac", 1),
      placement("pg_vino", "se_vino", "ar_set", 2),
      placement("pg_vino", "se_vino", "ar_kafa", 3),
    ],
    variants: [variant("va_casa", "ar_vranac", 250, 1), variant("va_flasa", "ar_vranac", 1800, 2)],
    addonGroups: [group("ag_led")],
    addonOptions: [option("ao_led", "ag_led", 0, 1)],
    articleAddonGroups: [link("ar_vranac", "ag_led", 1)],
    comboComponents: [component("ar_set", "ar_sir", 1, 1), component("ar_set", "ar_kafa", 2, 2)],
  });
}

/** An older version: only the default page, and the coffee at an older price. */
function olderVersion(): MenuDraftSnapshot {
  return draft({
    pages: [page("pg_main", 1, { isDefault: true, slug: "glavni", name: "Kompletan meni" })],
    sections: [section("se_main", "pg_main", 1)],
    articles: [article("ar_kafa", "Kafa", 150), article("ar_stari", "Stari artikal", 120)],
    placements: [placement("pg_main", "se_main", "ar_kafa", 1)],
  });
}

const PROTECT_VINO: ReadonlySet<string> = new Set(["pg_vino"]);

// -----------------------------------------------------------------------------
// planRestore
// -----------------------------------------------------------------------------

describe("planRestore: nothing protected", () => {
  test("the final draft is the restored version in canonical order", () => {
    const target = scramble(olderVersion());
    const plan = planRestore(currentDraft(), target, new Set());
    expect(plan.final).toEqual(sortSnapshot(target));
    expect(plan.keptPages).toEqual([]);
    expect(plan.renamedSlugs).toEqual([]);
    expect(plan.keptArticleKeys).toEqual([]);
  });

  test("the final draft is a copy, not the target itself", () => {
    const target = olderVersion();
    const plan = planRestore(currentDraft(), target, new Set());
    expect(plan.final).not.toBe(target);
    expect(plan.final.pages[0]).not.toBe(target.pages[0]);
  });

  test("a page of the current draft that the version lacks is dropped with its sections and articles", () => {
    const plan = planRestore(currentDraft(), olderVersion(), new Set());
    expect(keys(plan.final.pages)).toEqual(["pg_main"]);
    expect(keys(plan.final.sections)).toEqual(["se_main"]);
    expect(keys(plan.final.articles)).toEqual(["ar_kafa", "ar_stari"]);
    expect(plan.final.variants).toEqual([]);
    expect(plan.final.addonGroups).toEqual([]);
    expect(plan.final.comboComponents).toEqual([]);
  });

  test("protected keys that match no page of the current draft change nothing", () => {
    const plan = planRestore(currentDraft(), olderVersion(), new Set(["pg_nepostojeca"]));
    expect(plan.final).toEqual(sortSnapshot(olderVersion()));
    expect(plan.keptPages).toEqual([]);
  });

  test("the version's own data wins over the current draft", () => {
    const plan = planRestore(currentDraft(), olderVersion(), PROTECT_VINO);
    expect(find(plan.final.articles, "ar_kafa").basePriceRsd).toBe(150);
  });
});

describe("planRestore: a protected page the version does not have", () => {
  test("it is kept with its sections, placements and the articles it shows that the version lacks", () => {
    const plan = planRestore(currentDraft(), olderVersion(), PROTECT_VINO);

    expect(plan.keptPages).toEqual([
      { key: "pg_vino", name: "Vinska karta", reason: "qr_missing_in_version" },
    ]);
    expect(keys(plan.final.pages)).toEqual(["pg_main", "pg_vino"]);
    expect(keys(plan.final.sections)).toEqual(["se_main", "se_vino"]);
    expect(ids(plan.final.placements, RESTORE_IDENTITY.placement)).toEqual([
      "se_main|ar_kafa",
      "se_vino|ar_kafa",
      "se_vino|ar_set",
      "se_vino|ar_vranac",
    ]);
    // The version's articles stay, the lacking ones come from the draft.
    expect(keys(plan.final.articles)).toEqual(["ar_kafa", "ar_set", "ar_sir", "ar_stari", "ar_vranac"]);
    expect(plan.keptArticleKeys.slice().sort()).toEqual(["ar_set", "ar_sir", "ar_vranac"]);
  });

  test("the kept page, section and articles are exactly as in the draft now", () => {
    const current = currentDraft();
    const plan = planRestore(current, olderVersion(), PROTECT_VINO);
    expect(find(plan.final.pages, "pg_vino")).toEqual(find(current.pages, "pg_vino"));
    expect(find(plan.final.sections, "se_vino")).toEqual(find(current.sections, "se_vino"));
    expect(find(plan.final.articles, "ar_vranac")).toEqual(find(current.articles, "ar_vranac"));
    expect(find(plan.final.articles, "ar_set")).toEqual(find(current.articles, "ar_set"));
  });

  test("the closure of a kept article: its variants, add-on links, groups and options, combo components", () => {
    const plan = planRestore(currentDraft(), olderVersion(), PROTECT_VINO);
    expect(keys(plan.final.variants)).toEqual(["va_casa", "va_flasa"]);
    expect(keys(plan.final.addonGroups)).toEqual(["ag_led"]);
    expect(keys(plan.final.addonOptions)).toEqual(["ao_led"]);
    expect(ids(plan.final.articleAddonGroups, RESTORE_IDENTITY.articleAddonGroup)).toEqual(["ar_vranac|ag_led"]);
    expect(ids(plan.final.comboComponents, RESTORE_IDENTITY.comboComponent)).toEqual([
      "ar_set|ar_kafa",
      "ar_set|ar_sir",
    ]);
    expect(find(plan.final.addonOptions, "ao_led")).toEqual(find(currentDraft().addonOptions, "ao_led"));
  });

  test("a component article the version already has is linked, not kept again", () => {
    const plan = planRestore(currentDraft(), olderVersion(), PROTECT_VINO);
    expect(plan.keptArticleKeys).not.toContain("ar_kafa");
    expect(plan.final.articles.filter((row) => row.key === "ar_kafa")).toHaveLength(1);
    expect(find(plan.final.articles, "ar_kafa").basePriceRsd).toBe(150);
    expect(plan.final.comboComponents).toContainEqual(component("ar_set", "ar_kafa", 2, 2));
  });

  test("an add-on group the version already has is linked, not copied again", () => {
    const target = edit(olderVersion(), (d) => {
      d.addonGroups.push(group("ag_led", { name: "Led (iz verzije)" }));
      d.addonOptions.push(option("ao_led", "ag_led", 20, 1));
    });
    const plan = planRestore(currentDraft(), target, PROTECT_VINO);
    expect(plan.final.addonGroups).toHaveLength(1);
    expect(plan.final.addonGroups[0].name).toBe("Led (iz verzije)");
    expect(plan.final.addonOptions).toHaveLength(1);
    expect(plan.final.addonOptions[0].priceDeltaRsd).toBe(20);
    expect(ids(plan.final.articleAddonGroups, RESTORE_IDENTITY.articleAddonGroup)).toEqual(["ar_vranac|ag_led"]);
  });

  test("an article shown by the kept page and by the version keeps the version's row and gets the placement", () => {
    const plan = planRestore(currentDraft(), olderVersion(), PROTECT_VINO);
    const placementRow = plan.final.placements.find(
      (row) => row.sectionKey === "se_vino" && row.articleKey === "ar_kafa",
    );
    expect(placementRow).toEqual(placement("pg_vino", "se_vino", "ar_kafa", 3));
    expect(plan.keptArticleKeys).not.toContain("ar_kafa");
  });

  test("an article shown by two kept pages is kept once", () => {
    const current = edit(currentDraft(), (d) => {
      d.pages.push(page("pg_slatko", 3, { slug: "slatko", name: "Slatko" }));
      d.sections.push(section("se_slatko", "pg_slatko", 1));
      d.placements.push(placement("pg_slatko", "se_slatko", "ar_vranac", 1));
    });
    const plan = planRestore(current, olderVersion(), new Set(["pg_vino", "pg_slatko"]));
    expect(plan.keptPages.map((row) => row.key).sort()).toEqual(["pg_slatko", "pg_vino"]);
    expect(plan.keptArticleKeys.filter((key) => key === "ar_vranac")).toHaveLength(1);
    expect(plan.final.articles.filter((row) => row.key === "ar_vranac")).toHaveLength(1);
    expect(plan.final.variants.filter((row) => row.articleKey === "ar_vranac")).toHaveLength(2);
    expect(ids(plan.final.placements, RESTORE_IDENTITY.placement)).toContain("se_slatko|ar_vranac");
  });

  test("a placement of an article that exists nowhere is dropped", () => {
    const current = edit(currentDraft(), (d) => {
      d.placements.push(placement("pg_vino", "se_vino", "ar_nigde", 9));
    });
    const plan = planRestore(current, olderVersion(), PROTECT_VINO);
    expect(plan.final.placements.some((row) => row.articleKey === "ar_nigde")).toBe(false);
  });

  test("a section the version also has is not duplicated and stays where the version put it", () => {
    const current = edit(currentDraft(), (d) => {
      d.sections.push(section("se_zajednicka", "pg_vino", 2));
      d.placements.push(placement("pg_vino", "se_zajednicka", "ar_sir", 1));
    });
    const target = edit(olderVersion(), (d) => {
      d.sections.push(section("se_zajednicka", "pg_main", 2));
    });
    const plan = planRestore(current, target, PROTECT_VINO);
    expect(plan.final.sections.filter((row) => row.key === "se_zajednicka")).toHaveLength(1);
    expect(find(plan.final.sections, "se_zajednicka").pageKey).toBe("pg_main");
  });
});

describe("planRestore: a protected page the version has", () => {
  test("a visible page of the version is left as the version has it, nothing is reported", () => {
    const target = edit(olderVersion(), (d) => {
      d.pages.push(page("pg_vino", 2, { slug: "vino", name: "Vina (stara verzija)" }));
      d.sections.push(section("se_stari_vino", "pg_vino", 1));
    });
    const plan = planRestore(currentDraft(), target, PROTECT_VINO);
    expect(plan.keptPages).toEqual([]);
    expect(plan.keptArticleKeys).toEqual([]);
    expect(find(plan.final.pages, "pg_vino").name).toBe("Vina (stara verzija)");
    expect(keys(plan.final.sections)).toEqual(["se_main", "se_stari_vino"]);
    expect(plan.final).toEqual(sortSnapshot(target));
  });

  test("a page archived in the version stays unarchived", () => {
    const target = edit(olderVersion(), (d) => {
      d.pages.push(page("pg_vino", 2, { slug: "vino", name: "Vina (stara verzija)", archivedAt: 1_700_000_000_000 }));
    });
    const plan = planRestore(currentDraft(), target, PROTECT_VINO);
    expect(plan.keptPages).toEqual([{ key: "pg_vino", name: "Vinska karta", reason: "qr_archived_in_version" }]);
    const restored = find(plan.final.pages, "pg_vino");
    expect(restored.archivedAt).toBeNull();
    // Only the archive date changes, the page is otherwise the version's.
    expect(restored.name).toBe("Vina (stara verzija)");
    expect(restored.slug).toBe("vino");
    // Nothing of the draft's own content is brought back.
    expect(keys(plan.final.sections)).toEqual(["se_main"]);
    expect(plan.keptArticleKeys).toEqual([]);
    expect(plan.renamedSlugs).toEqual([]);
  });

  test("an unprotected page archived in the version stays archived", () => {
    const target = edit(olderVersion(), (d) => {
      d.pages.push(page("pg_vino", 2, { archivedAt: 1_700_000_000_000 }));
    });
    const plan = planRestore(currentDraft(), target, new Set());
    expect(find(plan.final.pages, "pg_vino").archivedAt).toBe(1_700_000_000_000);
    expect(plan.keptPages).toEqual([]);
  });
});

describe("planRestore: pages that are not protected", () => {
  test("an unprotected page missing in the version is dropped with what only it showed", () => {
    const current = edit(currentDraft(), (d) => {
      d.pages.push(page("pg_stara", 3, { slug: "stara", name: "Stara ponuda" }));
      d.sections.push(section("se_stara", "pg_stara", 1));
      d.articles.push(article("ar_samo_stara", "Samo na staroj", 99));
      d.placements.push(placement("pg_stara", "se_stara", "ar_samo_stara", 1));
    });
    const plan = planRestore(current, olderVersion(), PROTECT_VINO);
    expect(keys(plan.final.pages)).toEqual(["pg_main", "pg_vino"]);
    expect(plan.final.sections.some((row) => row.key === "se_stara")).toBe(false);
    expect(plan.final.articles.some((row) => row.key === "ar_samo_stara")).toBe(false);
    expect(plan.final.placements.some((row) => row.sectionKey === "se_stara")).toBe(false);
    expect(plan.keptPages.map((row) => row.key)).toEqual(["pg_vino"]);
  });
});

describe("planRestore: one default page", () => {
  test("the version's default wins over a kept default page", () => {
    const current = edit(currentDraft(), (d) => {
      find(d.pages, "pg_main").isDefault = false;
      find(d.pages, "pg_vino").isDefault = true;
    });
    const plan = planRestore(current, olderVersion(), PROTECT_VINO);
    expect(plan.final.pages.filter((row) => row.isDefault).map((row) => row.key)).toEqual(["pg_main"]);
    expect(find(plan.final.pages, "pg_vino").isDefault).toBe(false);
    expect(plan.keptPages.map((row) => row.key)).toEqual(["pg_vino"]);
  });

  test("a kept default page stays the default when the version has none", () => {
    const current = edit(currentDraft(), (d) => {
      find(d.pages, "pg_main").isDefault = false;
      find(d.pages, "pg_vino").isDefault = true;
    });
    const target = edit(olderVersion(), (d) => {
      find(d.pages, "pg_main").isDefault = false;
    });
    const plan = planRestore(current, target, PROTECT_VINO);
    expect(plan.final.pages.filter((row) => row.isDefault).map((row) => row.key)).toEqual(["pg_vino"]);
  });

  test("with a non-default kept page the version's default stays the only one", () => {
    const plan = planRestore(currentDraft(), olderVersion(), PROTECT_VINO);
    expect(plan.final.pages.filter((row) => row.isDefault).map((row) => row.key)).toEqual(["pg_main"]);
  });
});

describe("planRestore: slugs", () => {
  function collisionDrafts(extraTargetSlugs: string[] = []) {
    const current = edit(currentDraft(), (d) => {
      find(d.pages, "pg_vino").slug = "pica";
      find(d.pages, "pg_vino").name = "Pića";
    });
    const target = edit(olderVersion(), (d) => {
      d.pages.push(page("pg_novi", 2, { slug: "pica", name: "Novo piće" }));
      extraTargetSlugs.forEach((slug, i) => d.pages.push(page(`pg_dodatni_${i}`, 3 + i, { slug, name: slug })));
    });
    return { current, target };
  }

  test("a kept page whose slug the version uses gets a free slug and is reported", () => {
    const { current, target } = collisionDrafts();
    const plan = planRestore(current, target, PROTECT_VINO);
    expect(plan.renamedSlugs).toEqual([{ pageKey: "pg_vino", from: "pica", to: "pica-2" }]);
    expect(find(plan.final.pages, "pg_vino").slug).toBe("pica-2");
    // The version keeps its own slug.
    expect(find(plan.final.pages, "pg_novi").slug).toBe("pica");
  });

  test("the free slug skips slugs the version already uses", () => {
    const { current, target } = collisionDrafts(["pica-2"]);
    const plan = planRestore(current, target, PROTECT_VINO);
    expect(plan.renamedSlugs).toEqual([{ pageKey: "pg_vino", from: "pica", to: "pica-3" }]);
    expect(find(plan.final.pages, "pg_vino").slug).toBe("pica-3");
  });

  test("all slugs are unique after the restore", () => {
    const { current, target } = collisionDrafts(["pica-2"]);
    const plan = planRestore(current, target, PROTECT_VINO);
    const slugs = plan.final.pages.map((row) => row.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("a kept page without a collision keeps its slug", () => {
    const plan = planRestore(currentDraft(), olderVersion(), PROTECT_VINO);
    expect(find(plan.final.pages, "pg_vino").slug).toBe("vinska-karta");
    expect(plan.renamedSlugs).toEqual([]);
  });

  test("a protected page the version has keeps the version's slug, even if the draft's differs", () => {
    const target = edit(olderVersion(), (d) => {
      d.pages.push(page("pg_vino", 2, { slug: "vino-stari", name: "Vina" }));
    });
    const plan = planRestore(currentDraft(), target, PROTECT_VINO);
    expect(find(plan.final.pages, "pg_vino").slug).toBe("vino-stari");
    expect(plan.renamedSlugs).toEqual([]);
  });
});

describe("planRestore: inputs and output shape", () => {
  test("neither snapshot nor the protected set is mutated", () => {
    const current = scramble(currentDraft());
    const target = scramble(olderVersion());
    const protectedKeys = new Set(["pg_vino"]);
    const currentJson = JSON.stringify(current);
    const targetJson = JSON.stringify(target);
    planRestore(current, target, protectedKeys);
    expect(JSON.stringify(current)).toBe(currentJson);
    expect(JSON.stringify(target)).toBe(targetJson);
    expect([...protectedKeys]).toEqual(["pg_vino"]);
  });

  test("the final draft shares no rows with the inputs", () => {
    const current = currentDraft();
    const target = olderVersion();
    const plan = planRestore(current, target, PROTECT_VINO);
    find(plan.final.pages, "pg_vino").name = "Promenjeno";
    find(plan.final.articles, "ar_vranac").name = "Promenjeno";
    find(plan.final.variants, "va_casa").name = "Promenjeno";
    find(plan.final.pages, "pg_main").name = "Promenjeno";
    expect(find(current.pages, "pg_vino").name).toBe("Vinska karta");
    expect(find(current.articles, "ar_vranac").name).toBe("Vranac");
    expect(find(current.variants, "va_casa").name).toBe("va_casa");
    expect(find(target.pages, "pg_main").name).toBe("Kompletan meni");
  });

  test("the final draft is in canonical order", () => {
    const plan = planRestore(scramble(currentDraft()), scramble(olderVersion()), PROTECT_VINO);
    expect(plan.final).toEqual(sortSnapshot(plan.final));
  });

  test("the order of the input lists does not change the plan", () => {
    const plain = planRestore(currentDraft(), olderVersion(), PROTECT_VINO);
    const shuffled = planRestore(scramble(currentDraft()), scramble(olderVersion()), PROTECT_VINO);
    expect(shuffled.final).toEqual(plain.final);
    expect(shuffled.keptPages).toEqual(plain.keptPages);
    expect(shuffled.renamedSlugs).toEqual(plain.renamedSlugs);
    expect(shuffled.keptArticleKeys.slice().sort()).toEqual(plain.keptArticleKeys.slice().sort());
  });

  test("the draft's room service and settings are not part of what a kept page brings back", () => {
    const current = edit(currentDraft(), (d) => {
      d.settings = { languages: { source: "sr", translations: ["en"] }, allergensEnabled: true };
    });
    const plan = planRestore(current, olderVersion(), PROTECT_VINO);
    expect(plan.final.settings).toEqual(olderVersion().settings);
    expect(plan.final.roomService).toEqual(olderVersion().roomService);
  });
});

// -----------------------------------------------------------------------------
// diffByIdentity and RESTORE_IDENTITY
// -----------------------------------------------------------------------------

describe("diffByIdentity", () => {
  type Row = { key: string; price?: number; meta?: Record<string, number> };
  const byKey = (row: Row) => row.key;

  test("inserts, updates and deletes", () => {
    const current: Row[] = [
      { key: "a", price: 1 },
      { key: "b", price: 2 },
      { key: "c", price: 3 },
    ];
    const final: Row[] = [
      { key: "a", price: 10 },
      { key: "b", price: 2 },
      { key: "d", price: 4 },
    ];
    expect(diffByIdentity(current, final, byKey)).toEqual({
      inserts: [{ key: "d", price: 4 }],
      updates: [{ before: { key: "a", price: 1 }, after: { key: "a", price: 10 } }],
      deletes: [{ key: "c", price: 3 }],
    });
  });

  test("unchanged rows are not reported", () => {
    const rows: Row[] = [{ key: "a", price: 1 }, { key: "b", price: 2 }];
    expect(diffByIdentity(rows, rows.map((row) => ({ ...row })), byKey)).toEqual({
      inserts: [],
      updates: [],
      deletes: [],
    });
  });

  test("equality does not depend on key order, at any depth", () => {
    const current: Row[] = [{ key: "a", price: 1, meta: { x: 1, y: 2 } }];
    const final = [{ meta: { y: 2, x: 1 }, price: 1, key: "a" }];
    expect(diffByIdentity(current, final, byKey)).toEqual({ inserts: [], updates: [], deletes: [] });
  });

  test("a change inside a nested value is an update", () => {
    const current: Row[] = [{ key: "a", meta: { x: 1, y: 2 } }];
    const final: Row[] = [{ key: "a", meta: { x: 1, y: 3 } }];
    const diff = diffByIdentity(current, final, byKey);
    expect(diff.updates).toEqual([{ before: current[0], after: final[0] }]);
    expect(diff.inserts).toEqual([]);
    expect(diff.deletes).toEqual([]);
  });

  test("from nothing everything is inserted in the order of the final list", () => {
    const final: Row[] = [{ key: "z" }, { key: "m" }, { key: "a" }];
    expect(diffByIdentity([], final, byKey)).toEqual({ inserts: final, updates: [], deletes: [] });
  });

  test("to nothing everything is deleted in the order of the current list", () => {
    const current: Row[] = [{ key: "z" }, { key: "m" }, { key: "a" }];
    expect(diffByIdentity(current, [], byKey)).toEqual({ inserts: [], updates: [], deletes: current });
  });

  test("the order of the rows alone is not a change", () => {
    const current: Row[] = [{ key: "a", price: 1 }, { key: "b", price: 2 }];
    const final: Row[] = [{ key: "b", price: 2 }, { key: "a", price: 1 }];
    expect(diffByIdentity(current, final, byKey)).toEqual({ inserts: [], updates: [], deletes: [] });
  });

  test("reports the rows themselves, not copies", () => {
    const added: Row = { key: "n" };
    const removed: Row = { key: "o" };
    const diff = diffByIdentity([removed], [added], byKey);
    expect(diff.inserts[0]).toBe(added);
    expect(diff.deletes[0]).toBe(removed);
  });

  test("a row with a null member differs from one with the member missing", () => {
    const current = [{ key: "a", note: null as string | null }];
    const final = [{ key: "a" }];
    expect(diffByIdentity<{ key: string; note?: string | null }>(current, final, (row) => row.key).updates).toHaveLength(1);
  });
});

describe("RESTORE_IDENTITY", () => {
  test("a placement is identified by its section and article", () => {
    expect(RESTORE_IDENTITY.placement(placement("pg_main", "se_main", "ar_kafa", 1))).toBe("se_main|ar_kafa");
  });

  test("an add-on link is identified by its article and group", () => {
    expect(RESTORE_IDENTITY.articleAddonGroup(link("ar_vranac", "ag_led", 1))).toBe("ar_vranac|ag_led");
  });

  test("a combo component is identified by the combo and the component article", () => {
    expect(RESTORE_IDENTITY.comboComponent(component("ar_set", "ar_sir", 1, 1))).toBe("ar_set|ar_sir");
  });

  test("a Room service item is identified by its article", () => {
    expect(RESTORE_IDENTITY.roomServiceItem({ articleKey: "ar_kafa" })).toBe("ar_kafa");
  });

  test("the same article in two sections has two identities", () => {
    const first = RESTORE_IDENTITY.placement(placement("pg_main", "se_a", "ar_kafa", 1));
    const second = RESTORE_IDENTITY.placement(placement("pg_main", "se_b", "ar_kafa", 1));
    expect(first).not.toBe(second);
  });

  test("the order and the visibility of a placement are not part of its identity", () => {
    const first = RESTORE_IDENTITY.placement(placement("pg_main", "se_a", "ar_kafa", 1));
    const second = RESTORE_IDENTITY.placement(placement("pg_main", "se_a", "ar_kafa", 7, { visibility: "hidden" }));
    expect(first).toBe(second);
  });

  test("diffing placements: a new order is an update, a new section is a delete and an insert", () => {
    const current = [placement("pg_main", "se_a", "ar_kafa", 1), placement("pg_main", "se_a", "ar_sir", 2)];
    const final = [
      placement("pg_main", "se_a", "ar_kafa", 3),
      placement("pg_main", "se_b", "ar_sir", 1),
    ];
    const diff = diffByIdentity(current, final, RESTORE_IDENTITY.placement);
    expect(diff.updates).toEqual([{ before: current[0], after: final[0] }]);
    expect(diff.deletes).toEqual([current[1]]);
    expect(diff.inserts).toEqual([final[1]]);
  });

  test("diffing combo components: a changed quantity is an update", () => {
    const current = [component("ar_set", "ar_sir", 1, 1)];
    const final = [component("ar_set", "ar_sir", 2, 1)];
    const diff = diffByIdentity(current, final, RESTORE_IDENTITY.comboComponent);
    expect(diff.updates).toEqual([{ before: current[0], after: final[0] }]);
  });

  test("diffing the final draft against the current one lists only what the restore must write", () => {
    const current = currentDraft();
    const plan = planRestore(current, olderVersion(), PROTECT_VINO);
    const articles = diffByIdentity(sortSnapshot(current).articles, plan.final.articles, (row) => row.key);
    // Coffee changes its price back, the old article comes back; the kept ones are untouched.
    expect(articles.updates.map((row) => row.after.key)).toEqual(["ar_kafa"]);
    expect(articles.inserts.map((row) => row.key)).toEqual(["ar_stari"]);
    expect(articles.deletes).toEqual([]);
    const placements = diffByIdentity(
      sortSnapshot(current).placements,
      plan.final.placements,
      RESTORE_IDENTITY.placement,
    );
    expect(placements).toEqual({ inserts: [], updates: [], deletes: [] });
  });
});
