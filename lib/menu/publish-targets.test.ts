// ScanMe Menu V1 (K18) — where the article of a publish issue is, so the dialog
// can take the owner to it. Fictional data only.

import { describe, expect, test } from "vitest";
import { issueTargets } from "./publish-targets";
import type {
  MenuDraftSnapshot,
  SnapshotArticle,
  SnapshotPage,
  SnapshotPlacement,
  SnapshotRoomServiceItem,
  SnapshotSection,
} from "./snapshot";

// -----------------------------------------------------------------------------
// Builders
// -----------------------------------------------------------------------------

function page(key: string, order: number, overrides: Partial<SnapshotPage> = {}): SnapshotPage {
  return {
    key,
    slug: key.replace(/^pg_/, ""),
    name: `Stranica ${key}`,
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

function section(key: string, pageKey: string, order = 1): SnapshotSection {
  return {
    key,
    pageKey,
    name: key,
    description: null,
    iconKey: null,
    order,
    visibility: "visible",
    translations: null,
  };
}

function article(key: string, name: string): SnapshotArticle {
  return {
    key,
    kind: "item",
    name,
    description: null,
    quantityValue: null,
    quantityUnit: null,
    basePriceRsd: 100,
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
  };
}

function placement(pageKey: string, sectionKey: string, articleKey: string, order = 1): SnapshotPlacement {
  return { pageKey, sectionKey, articleKey, order, visibility: "visible" };
}

function roomServiceItem(articleKey: string): SnapshotRoomServiceItem {
  return {
    articleKey,
    categoryKey: "rc_main",
    order: 1,
    markupApplies: false,
    manualPriceRsd: null,
    priceWarning: null,
    manualVariantPrices: null,
  };
}

/**
 * Pages: the default "Kompletan meni" (order 1), "Pica" (2), "Piće" (3).
 * Articles: Pljeskavica, Margarita, Kafa. Placements are overridden per test.
 */
function snapshot(parts: Partial<MenuDraftSnapshot> = {}): MenuDraftSnapshot {
  return {
    formatVersion: 1,
    settings: { languages: null, allergensEnabled: null },
    presentation: null,
    pages: [
      page("pg_sve", 1, { isDefault: true, name: "Kompletan meni" }),
      page("pg_pica", 2, { name: "Pica" }),
      page("pg_pice", 3, { name: "Piće" }),
    ],
    sections: [section("se_sve", "pg_sve"), section("se_pica", "pg_pica"), section("se_pice", "pg_pice")],
    articles: [
      article("ar_pljeskavica", "Pljeskavica"),
      article("ar_margarita", "Margarita"),
      article("ar_kafa", "Kafa"),
    ],
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

const issue = (articleKey?: string) => ({ articleKey });

/** Freezes the value and everything inside it: any write by the code under test throws. */
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const member of Object.values(value as Record<string, unknown>)) deepFreeze(member);
  }
  return value;
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("issueTargets: which articles", () => {
  test("no issues, no targets", () => {
    expect(issueTargets(snapshot(), [])).toEqual({});
  });

  test("issues without an article key name no article", () => {
    const s = snapshot({ placements: [placement("pg_sve", "se_sve", "ar_kafa")] });
    expect(issueTargets(s, [issue(), issue(undefined), { articleKey: "" }])).toEqual({});
  });

  test("an unknown article key is skipped; the known ones are still answered", () => {
    const s = snapshot({ placements: [placement("pg_sve", "se_sve", "ar_kafa")] });
    const ciljevi = issueTargets(s, [issue("ar_nepoznat"), issue("ar_kafa")]);
    expect(Object.keys(ciljevi)).toEqual(["ar_kafa"]);
  });

  test("only the articles named by an issue are answered, once each however many issues name them", () => {
    const s = snapshot({
      placements: [
        placement("pg_sve", "se_sve", "ar_kafa", 1),
        placement("pg_sve", "se_sve", "ar_margarita", 2),
        placement("pg_sve", "se_sve", "ar_pljeskavica", 3),
      ],
    });
    const ciljevi = issueTargets(s, [issue("ar_kafa"), issue("ar_kafa"), issue("ar_pljeskavica"), issue()]);
    expect(Object.keys(ciljevi).sort()).toEqual(["ar_kafa", "ar_pljeskavica"]);
  });
});

describe("issueTargets: the answer for an article", () => {
  test("its name, one page (key and name) and whether it is in Room service", () => {
    const s = snapshot({
      placements: [placement("pg_pica", "se_pica", "ar_margarita")],
      roomService: { config: null, categories: [], items: [roomServiceItem("ar_margarita")] },
    });
    expect(issueTargets(s, [issue("ar_margarita")])).toEqual({
      ar_margarita: { name: "Margarita", pageKey: "pg_pica", pageName: "Pica", inRoomService: true },
    });
  });

  test("an article that is not in Room service says so", () => {
    const s = snapshot({ placements: [placement("pg_pica", "se_pica", "ar_margarita")] });
    expect(issueTargets(s, [issue("ar_margarita")]).ar_margarita.inRoomService).toBe(false);
  });

  test("Room service is told per article", () => {
    const s = snapshot({
      placements: [placement("pg_sve", "se_sve", "ar_kafa"), placement("pg_sve", "se_sve", "ar_margarita", 2)],
      roomService: { config: null, categories: [], items: [roomServiceItem("ar_kafa")] },
    });
    const ciljevi = issueTargets(s, [issue("ar_kafa"), issue("ar_margarita")]);
    expect(ciljevi.ar_kafa.inRoomService).toBe(true);
    expect(ciljevi.ar_margarita.inRoomService).toBe(false);
  });
});

describe("issueTargets: which page", () => {
  test("an article on several pages gets the default page first", () => {
    const s = snapshot({
      placements: [
        placement("pg_pice", "se_pice", "ar_kafa"),
        placement("pg_pica", "se_pica", "ar_kafa"),
        placement("pg_sve", "se_sve", "ar_kafa"),
      ],
    });
    expect(issueTargets(s, [issue("ar_kafa")]).ar_kafa).toMatchObject({ pageKey: "pg_sve", pageName: "Kompletan meni" });
  });

  test("the default page wins even when its order is the last", () => {
    const s = snapshot({
      pages: [
        page("pg_sve", 9, { isDefault: true, name: "Kompletan meni" }),
        page("pg_pica", 1, { name: "Pica" }),
        page("pg_pice", 2, { name: "Piće" }),
      ],
      placements: [placement("pg_pica", "se_pica", "ar_kafa"), placement("pg_sve", "se_sve", "ar_kafa")],
    });
    expect(issueTargets(s, [issue("ar_kafa")]).ar_kafa.pageKey).toBe("pg_sve");
  });

  test("without the default page, the lowest page order wins, whatever the order of the placements", () => {
    const s = snapshot({
      placements: [placement("pg_pice", "se_pice", "ar_kafa"), placement("pg_pica", "se_pica", "ar_kafa")],
    });
    expect(issueTargets(s, [issue("ar_kafa")]).ar_kafa).toMatchObject({ pageKey: "pg_pica", pageName: "Pica" });
  });

  test("pages with the same order are told apart by their key", () => {
    const s = snapshot({
      pages: [page("pg_b", 5, { name: "B" }), page("pg_a", 5, { name: "A" })],
      sections: [section("se_a", "pg_a"), section("se_b", "pg_b")],
      placements: [placement("pg_b", "se_b", "ar_kafa"), placement("pg_a", "se_a", "ar_kafa")],
    });
    expect(issueTargets(s, [issue("ar_kafa")]).ar_kafa.pageKey).toBe("pg_a");
  });

  test("the same article in two sections of one page is still one page", () => {
    const s = snapshot({
      sections: [section("se_1", "pg_pica", 1), section("se_2", "pg_pica", 2)],
      placements: [placement("pg_pica", "se_1", "ar_margarita"), placement("pg_pica", "se_2", "ar_margarita")],
    });
    expect(issueTargets(s, [issue("ar_margarita")]).ar_margarita.pageKey).toBe("pg_pica");
  });

  test("a hidden page is a page", () => {
    const s = snapshot({
      pages: [page("pg_sve", 1, { isDefault: true }), page("pg_tajna", 2, { visibility: "hidden", name: "Tajna" })],
      sections: [section("se_tajna", "pg_tajna")],
      placements: [placement("pg_tajna", "se_tajna", "ar_kafa")],
    });
    expect(issueTargets(s, [issue("ar_kafa")]).ar_kafa).toMatchObject({ pageKey: "pg_tajna", pageName: "Tajna" });
  });

  test("an archived page is never the answer, even the default one: the next page is", () => {
    const s = snapshot({
      pages: [
        page("pg_sve", 1, { isDefault: true, archivedAt: 1_700_000_000_000 }),
        page("pg_pica", 2, { name: "Pica" }),
        page("pg_pice", 3, { name: "Piće" }),
      ],
      placements: [
        placement("pg_sve", "se_sve", "ar_kafa"),
        placement("pg_pice", "se_pice", "ar_kafa"),
        placement("pg_pica", "se_pica", "ar_kafa"),
      ],
    });
    expect(issueTargets(s, [issue("ar_kafa")]).ar_kafa).toMatchObject({ pageKey: "pg_pica", pageName: "Pica" });
  });

  test("an article only on an archived page is on no page", () => {
    const s = snapshot({
      pages: [page("pg_sve", 1, { isDefault: true }), page("pg_stara", 2, { archivedAt: 1_700_000_000_000, name: "Stara" })],
      sections: [section("se_stara", "pg_stara")],
      placements: [placement("pg_stara", "se_stara", "ar_kafa")],
    });
    expect(issueTargets(s, [issue("ar_kafa")]).ar_kafa).toEqual({
      name: "Kafa",
      pageKey: null,
      pageName: null,
      inRoomService: false,
    });
  });

  test("a placement that points at a page nobody has is ignored", () => {
    const s = snapshot({ placements: [placement("pg_nema", "se_x", "ar_kafa"), placement("pg_pice", "se_pice", "ar_kafa")] });
    expect(issueTargets(s, [issue("ar_kafa")]).ar_kafa.pageKey).toBe("pg_pice");
  });

  test("an article on no page is on no page, with or without Room service", () => {
    const bez = issueTargets(snapshot(), [issue("ar_margarita")]);
    expect(bez.ar_margarita).toEqual({ name: "Margarita", pageKey: null, pageName: null, inRoomService: false });

    const rs = issueTargets(
      snapshot({ roomService: { config: null, categories: [], items: [roomServiceItem("ar_margarita")] } }),
      [issue("ar_margarita")],
    );
    expect(rs.ar_margarita).toEqual({ name: "Margarita", pageKey: null, pageName: null, inRoomService: true });
  });

  test("each article gets its own page", () => {
    const s = snapshot({
      placements: [placement("pg_pica", "se_pica", "ar_margarita"), placement("pg_pice", "se_pice", "ar_kafa")],
    });
    const ciljevi = issueTargets(s, [issue("ar_margarita"), issue("ar_kafa")]);
    expect(ciljevi.ar_margarita.pageKey).toBe("pg_pica");
    expect(ciljevi.ar_kafa.pageKey).toBe("pg_pice");
  });
});

describe("issueTargets: the input", () => {
  test("it is not changed", () => {
    const s = deepFreeze(
      snapshot({
        placements: [placement("pg_pice", "se_pice", "ar_kafa"), placement("pg_sve", "se_sve", "ar_kafa", 2)],
        roomService: { config: null, categories: [], items: [roomServiceItem("ar_kafa")] },
      }),
    );
    const pre = JSON.stringify(s);
    const issues = deepFreeze([issue("ar_kafa"), issue()]);
    expect(issueTargets(s, issues).ar_kafa.pageKey).toBe("pg_sve");
    expect(JSON.stringify(s)).toBe(pre);
  });

  test("an unsorted snapshot gives the same answer as a sorted one", () => {
    const placements = [
      placement("pg_pice", "se_pice", "ar_kafa"),
      placement("pg_pica", "se_pica", "ar_kafa"),
      placement("pg_sve", "se_sve", "ar_kafa"),
    ];
    const jedan = issueTargets(snapshot({ placements }), [issue("ar_kafa")]);
    const drugi = issueTargets(snapshot({ placements: [...placements].reverse(), pages: snapshot().pages.slice().reverse() }), [
      issue("ar_kafa"),
    ]);
    expect(drugi).toEqual(jedan);
  });
});
