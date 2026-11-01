/// <reference types="vite/client" />

// ScanMe Menu V1 — K02: standard pages (master §3.2, LOCKED). The client adds,
// renames, duplicates, moves, archives and deletes pages; deleting (or
// archiving) a page that an ACTIVE QR card opens is refused; every page id is
// checked against the caller's tenant.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { pageHasActiveQr } from "./menuPages";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { isMenuKey, newMenuKey } from "../lib/menu/keys";
import { MENU_MAX_PAGES } from "../lib/menu/limits";
import { ORDER_STEP } from "../lib/menu/order";
import {
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  seedQrLink,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

// Typed by the schema (ReturnType<typeof convexTest> would lose the index types).
const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

async function world(t: T) {
  return await t.run(async (ctx) => await seedMenuWorld(ctx));
}

async function pagesOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuPages")
      .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
}

async function pageOf(t: T, pageId: Id<"menuPages">) {
  return await t.run(async (ctx) => ctx.db.get(pageId));
}

async function revisionOf(t: T, menuServiceId: Id<"menuServices">) {
  const state = await t.run(async (ctx) =>
    ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
  );
  if (!state) throw new Error("draft state missing");
  return state.revision;
}

async function sectionsOf(t: T, pageId: Id<"menuPages">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuSections")
      .withIndex("by_pageId_and_order", (q) => q.eq("pageId", pageId))
      .collect(),
  );
}

async function placementsOf(t: T, pageId: Id<"menuPages">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuPlacements")
      .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
      .collect(),
  );
}

async function allArticles(t: T) {
  return await t.run(async (ctx) => ctx.db.query("menuArticles").collect());
}

async function auditOf(t: T, menuServiceId: Id<"menuServices">, action: string) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
  return rows.filter((row) => row.action === action);
}

/** Everything the Menu domain stores for one service, for "nothing changed" checks. */
async function snapshotService(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => ({
    pages: await ctx.db
      .query("menuPages")
      .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    sections: await ctx.db
      .query("menuSections")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    placements: await ctx.db
      .query("menuPlacements")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
    state: await ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
    audit: await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  }));
}

async function keyOf(t: T, pageId: Id<"menuPages">) {
  const page = await pageOf(t, pageId);
  if (!page) throw new Error("page missing");
  return page.key;
}

/** Two sections ("Hladna pića", "Jela sa roštilja") and three placements of three NEW articles. */
async function seedContent(
  t: T,
  menuServiceId: Id<"menuServices">,
  pageId: Id<"menuPages">,
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const sectionIds: Id<"menuSections">[] = [];
    sectionIds.push(
      await ctx.db.insert("menuSections", {
        menuServiceId,
        pageId,
        key: newMenuKey("section"),
        name: "Hladna pića",
        description: "Sve što je ohlađeno",
        iconKey: "glass",
        order: ORDER_STEP,
        visibility: "visible",
        createdAt: now,
        updatedAt: now,
      }),
    );
    sectionIds.push(
      await ctx.db.insert("menuSections", {
        menuServiceId,
        pageId,
        key: newMenuKey("section"),
        name: "Jela sa roštilja",
        order: 2 * ORDER_STEP,
        visibility: "visible",
        createdAt: now,
        updatedAt: now,
      }),
    );
    const articleIds: Id<"menuArticles">[] = [];
    for (const [name, normalized] of [
      ["Kafa", "kafa"],
      ["Sok od narandže", "sok od narandze"],
      ["Ćevapi", "cevapi"],
    ] as const) {
      articleIds.push(
        await ctx.db.insert("menuArticles", {
          menuServiceId,
          key: newMenuKey("article"),
          kind: "item",
          name,
          nameNormalized: normalized,
          basePriceRsd: 250,
          mediaMode: "none",
          createdAt: now,
          updatedAt: now,
        }),
      );
    }
    const placements: Array<[number, number, "visible" | "hidden"]> = [
      [0, 0, "visible"],
      [0, 1, "hidden"],
      [1, 2, "visible"],
    ];
    for (const [index, [sectionIndex, articleIndex, visibility]] of placements.entries()) {
      await ctx.db.insert("menuPlacements", {
        menuServiceId,
        pageId,
        sectionId: sectionIds[sectionIndex],
        articleId: articleIds[articleIndex],
        order: (index + 1) * ORDER_STEP,
        visibility,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(pageId, { placementCount: placements.length });
    return { sectionIds, articleIds };
  });
}

/** `count` extra visible pages with orders after `firstOrder`. */
async function insertPages(
  t: T,
  menuServiceId: Id<"menuServices">,
  count: number,
  firstOrder: number,
) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("menuPages", {
        menuServiceId,
        key: newMenuKey("page"),
        slug: `bulk-${index}`,
        name: `Bulk ${index}`,
        isDefault: false,
        order: firstOrder + index * ORDER_STEP,
        visibility: "visible",
        navigation: "standalone",
        placementCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    }
  });
}

// -----------------------------------------------------------------------------

describe("list", () => {
  test("returns the pages by order with the archived flag, and null for every refusal", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });

    const list = await as(t, w.managerId).query(api.menuPages.list, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(list).toEqual([
      {
        pageId: w.a.defaultPageId,
        key: expect.any(String),
        slug: "glavni",
        name: "Kompletan meni",
        publicTitle: null,
        isDefault: true,
        order: ORDER_STEP,
        visibility: "visible",
        archived: false,
        navigation: "standalone",
        placementCount: 0,
      },
      {
        pageId: wine.pageId,
        key: wine.key,
        slug: "vinska-karta",
        name: "Vinska karta",
        // K34 (intentional): a standard page's name is its public title (was null: guests read "Meni").
        publicTitle: "Vinska karta",
        isDefault: false,
        order: 2 * ORDER_STEP,
        visibility: "visible",
        archived: true,
        navigation: "standalone",
        placementCount: 0,
      },
    ]);

    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      await expect(
        as(t, userId).query(api.menuPages.list, { menuServiceId: w.a.menuServiceId }),
      ).resolves.toBeNull();
    }
    await expect(
      t.query(api.menuPages.list, { menuServiceId: w.a.menuServiceId }),
    ).resolves.toBeNull();
  });
});

describe("add", () => {
  test("the slug comes from the name, diacritics folded", async () => {
    const t = newTest();
    const w = await world(t);
    const expectations = [
      ["Vinska karta", "vinska-karta"],
      ["Ćevapi i pića", "cevapi-i-pica"],
      ["Đački doručak", "djacki-dorucak"],
      ["  Dnevna   ponuda  ", "dnevna-ponuda"],
      ["!!!", "stranica"],
    ] as const;
    for (const [name, slug] of expectations) {
      const result = await as(t, w.ownerId).mutation(api.menuPages.add, {
        menuServiceId: w.a.menuServiceId,
        name,
      });
      expect(result.slug).toBe(slug);
      expect(isMenuKey(result.key, "page")).toBe(true);
    }
    const pages = await pagesOf(t, w.a.menuServiceId);
    expect(pages.map((page) => page.name)).toEqual([
      "Kompletan meni",
      "Vinska karta",
      "Ćevapi i pića",
      "Đački doručak",
      "Dnevna ponuda",
      "!!!",
    ]);
  });

  test("a taken slug gets -2, -3…; reserved words are never used as a slug", async () => {
    const t = newTest();
    const w = await world(t);
    const add = async (name: string) =>
      (
        await as(t, w.ownerId).mutation(api.menuPages.add, {
          menuServiceId: w.a.menuServiceId,
          name,
        })
      ).slug;
    expect(await add("Vinska karta")).toBe("vinska-karta");
    expect(await add("Vinska karta")).toBe("vinska-karta-2");
    expect(await add("vinska KARTA")).toBe("vinska-karta-3");
    expect(await add("Editor")).toBe("editor-2");
    // "glavni" belongs to the default page ("Kompletan meni").
    expect(await add("Glavni")).toBe("glavni-2");
    expect(await add("Room service")).toBe("room-service-2");
  });

  test("a new page is visible, standalone, empty, last, not the default, and bumps the draft revision by exactly 1", async () => {
    const t = newTest();
    const w = await world(t);
    const before = await revisionOf(t, w.a.menuServiceId);
    const result = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(before + 1);
    const page = await pageOf(t, result.pageId);
    expect(page).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      key: result.key,
      slug: "vinska-karta",
      name: "Vinska karta",
      isDefault: false,
      order: 2 * ORDER_STEP,
      visibility: "visible",
      navigation: "standalone",
      placementCount: 0,
      updatedByUserId: w.ownerId,
    });
    expect(page?.archivedAt).toBeUndefined();
    // K34 (intentional): the public title mirrors the name of a standard page (was undefined).
    expect(page?.publicTitle).toBe("Vinska karta");
    // The default page is untouched.
    const defaultPage = await pageOf(t, w.a.defaultPageId);
    expect(defaultPage).toMatchObject({ isDefault: true, order: ORDER_STEP });
  });

  test("an empty, blank or over-long name is invalid and writes nothing", async () => {
    const t = newTest();
    const w = await world(t);
    const before = await snapshotService(t, w.a.menuServiceId);
    for (const name of ["", "   ", "\n\t", "x".repeat(81)]) {
      await expect(
        as(t, w.ownerId).mutation(api.menuPages.add, { menuServiceId: w.a.menuServiceId, name }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);
    // The 80-character boundary is allowed.
    const ok = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "x".repeat(80),
    });
    expect(await pageOf(t, ok.pageId)).toMatchObject({ name: "x".repeat(80) });
  });

  test("the page ceiling counts archived pages; restoring is not blocked by it", async () => {
    const t = newTest();
    const w = await world(t);
    await insertPages(t, w.a.menuServiceId, MENU_MAX_PAGES - 1, 2 * ORDER_STEP);
    expect(await pagesOf(t, w.a.menuServiceId)).toHaveLength(MENU_MAX_PAGES);
    const before = await snapshotService(t, w.a.menuServiceId);

    await expect(
      as(t, w.ownerId).mutation(api.menuPages.add, {
        menuServiceId: w.a.menuServiceId,
        name: "Jedna previše",
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.duplicate, { pageId: w.a.defaultPageId }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);

    const pages = await pagesOf(t, w.a.menuServiceId);
    const victim = pages[5];
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: victim._id });
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.add, {
        menuServiceId: w.a.menuServiceId,
        name: "Još uvek previše",
      }),
    ).rejects.toThrow(MENU_ERROR.limitReached);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.restore, { pageId: victim._id }),
    ).resolves.toEqual({ changed: true });
    // Deleting makes room again.
    await as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: victim._id });
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.add, {
        menuServiceId: w.a.menuServiceId,
        name: "Sada staje",
      }),
    ).resolves.toMatchObject({ slug: "sada-staje" });
  });
});

describe("rename", () => {
  test("keeps the slug, cleans the name, bumps the revision once", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const before = await revisionOf(t, w.a.menuServiceId);
    const result = await as(t, w.managerId).mutation(api.menuPages.rename, {
      pageId: wine.pageId,
      name: "  Vinska   karta — crvena ",
      expectedName: "Vinska karta",
    });
    expect(result).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(before + 1);
    expect(await pageOf(t, wine.pageId)).toMatchObject({
      name: "Vinska karta — crvena",
      slug: "vinska-karta",
      key: wine.key,
      updatedByUserId: w.managerId,
    });
    // The old slug is still taken by the renamed page.
    const again = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    expect(again.slug).toBe("vinska-karta-2");
  });

  test("a stale expectedName is a conflict: the current name comes back and nothing is written", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const before = await snapshotService(t, w.a.menuServiceId);
    const result = await as(t, w.editorId).mutation(api.menuPages.rename, {
      pageId: wine.pageId,
      name: "Piće",
      expectedName: "Stari naziv",
    });
    // K05 (intended change): a conflict also echoes the value this caller tried to write.
    expect(result).toEqual({
      ok: false,
      conflicts: ["name"],
      current: { name: "Vinska karta" },
      attempted: { name: "Piće" },
    });
    expect(await pageOf(t, wine.pageId)).toMatchObject({ name: "Vinska karta" });
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);
  });

  test("the same name is a no-op: ok, no write, no revision bump", async () => {
    const t = newTest();
    const w = await world(t);
    const before = await snapshotService(t, w.a.menuServiceId);
    const result = await as(t, w.ownerId).mutation(api.menuPages.rename, {
      pageId: w.a.defaultPageId,
      name: "  Kompletan  meni ",
      expectedName: "Kompletan meni",
    });
    expect(result).toEqual({ ok: true });
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);
  });

  test("the default page can be renamed; an invalid name or an archived page is refused", async () => {
    const t = newTest();
    const w = await world(t);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.rename, {
        pageId: w.a.defaultPageId,
        name: "Glavna ponuda",
        expectedName: "Kompletan meni",
      }),
    ).resolves.toEqual({ ok: true });
    expect(await pageOf(t, w.a.defaultPageId)).toMatchObject({
      name: "Glavna ponuda",
      slug: "glavni",
      isDefault: true,
    });

    for (const name of ["", "   ", "x".repeat(81)]) {
      await expect(
        as(t, w.ownerId).mutation(api.menuPages.rename, {
          pageId: w.a.defaultPageId,
          name,
          expectedName: "Glavna ponuda",
        }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }

    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.rename, {
        pageId: wine.pageId,
        name: "Novo ime",
        expectedName: "Vinska karta",
      }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
    expect(await pageOf(t, wine.pageId)).toMatchObject({ name: "Vinska karta" });
  });
});

describe("duplicate", () => {
  test("copies sections (new keys) and placements (same articles); the source is unchanged and no article is created", async () => {
    const t = newTest();
    const w = await world(t);
    const content = await seedContent(t, w.a.menuServiceId, w.a.defaultPageId);
    const sourcePageBefore = await pageOf(t, w.a.defaultPageId);
    const sourceSectionsBefore = await sectionsOf(t, w.a.defaultPageId);
    const sourcePlacementsBefore = await placementsOf(t, w.a.defaultPageId);
    const articlesBefore = await allArticles(t);
    const revisionBefore = await revisionOf(t, w.a.menuServiceId);
    expect(articlesBefore).toHaveLength(3);

    const copy = await as(t, w.ownerId).mutation(api.menuPages.duplicate, {
      pageId: w.a.defaultPageId,
    });
    expect(copy.slug).toBe("kompletan-meni-kopija");
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revisionBefore + 1);

    const copyPage = await pageOf(t, copy.pageId);
    expect(copyPage).toMatchObject({
      name: "Kompletan meni (kopija)",
      slug: "kompletan-meni-kopija",
      isDefault: false,
      visibility: "visible",
      navigation: "standalone",
      placementCount: 3,
      order: 2 * ORDER_STEP,
      updatedByUserId: w.ownerId,
    });
    expect(isMenuKey(copyPage!.key, "page")).toBe(true);
    expect(copyPage!.key).not.toBe(sourcePageBefore!.key);

    // Sections: same content, brand-new keys and ids.
    const copiedSections = await sectionsOf(t, copy.pageId);
    expect(copiedSections.map((section) => section.name)).toEqual([
      "Hladna pića",
      "Jela sa roštilja",
    ]);
    expect(copiedSections[0]).toMatchObject({
      description: "Sve što je ohlađeno",
      iconKey: "glass",
      order: ORDER_STEP,
      visibility: "visible",
      menuServiceId: w.a.menuServiceId,
    });
    expect(copiedSections[1].description).toBeUndefined();
    const oldKeys = sourceSectionsBefore.map((section) => section.key);
    for (const section of copiedSections) {
      expect(isMenuKey(section.key, "section")).toBe(true);
      expect(oldKeys).not.toContain(section.key);
      expect(content.sectionIds).not.toContain(section._id);
    }

    // Placements: the SAME articles, mapped to the NEW sections.
    const copiedPlacements = await placementsOf(t, copy.pageId);
    expect(copiedPlacements).toHaveLength(3);
    const sectionNameOf = (sections: Doc<"menuSections">[], id: Id<"menuSections">) =>
      sections.find((section) => section._id === id)?.name;
    const describePlacements = (
      placements: Doc<"menuPlacements">[],
      sections: Doc<"menuSections">[],
    ) =>
      placements
        .map((placement) => ({
          article: placement.articleId,
          section: sectionNameOf(sections, placement.sectionId),
          order: placement.order,
          visibility: placement.visibility,
        }))
        .sort((a, b) => a.order - b.order);
    expect(describePlacements(copiedPlacements, copiedSections)).toEqual(
      describePlacements(sourcePlacementsBefore, sourceSectionsBefore),
    );
    expect(copiedPlacements.map((placement) => placement.articleId).sort()).toEqual(
      [...content.articleIds].sort(),
    );
    for (const placement of copiedPlacements) {
      expect(placement.pageId).toBe(copy.pageId);
      expect(placement.menuServiceId).toBe(w.a.menuServiceId);
    }

    // The source is byte-for-byte unchanged, and no article was created.
    expect(await pageOf(t, w.a.defaultPageId)).toEqual(sourcePageBefore);
    expect(await sectionsOf(t, w.a.defaultPageId)).toEqual(sourceSectionsBefore);
    expect(await placementsOf(t, w.a.defaultPageId)).toEqual(sourcePlacementsBefore);
    expect(await allArticles(t)).toEqual(articlesBefore);
  });

  test("copies publicTitle, icon, navigation and visibility; a second copy gets its own slug", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await t.run(async (ctx) =>
      ctx.db.patch(wine.pageId, {
        publicTitle: "Naša vina",
        iconKey: "wine",
        navigation: "shared",
        visibility: "hidden",
      }),
    );
    const first = await as(t, w.ownerId).mutation(api.menuPages.duplicate, { pageId: wine.pageId });
    const second = await as(t, w.ownerId).mutation(api.menuPages.duplicate, { pageId: wine.pageId });
    expect(first.slug).toBe("vinska-karta-kopija");
    expect(second.slug).toBe("vinska-karta-kopija-2");
    expect(await pageOf(t, first.pageId)).toMatchObject({
      name: "Vinska karta (kopija)",
      publicTitle: "Naša vina",
      iconKey: "wine",
      navigation: "shared",
      visibility: "hidden",
      isDefault: false,
      placementCount: 0,
    });
    const names = (await pagesOf(t, w.a.menuServiceId)).map((page) => page.name);
    expect(names).toEqual([
      "Kompletan meni",
      "Vinska karta",
      "Vinska karta (kopija)",
      "Vinska karta (kopija)",
    ]);
  });

  // K34: before, the copy lost every translation of the page and its sections.
  test("K34: the copy keeps the translations of the page and of its sections", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const section = await as(t, w.ownerId).mutation(api.menuCatalog.addSection, { pageId: wine.pageId, name: "Crvena" });
    await t.run(async (ctx) => {
      await ctx.db.patch(wine.pageId, { translations: { en: { publicTitle: "Wine list", status: "confirmed" } } });
      await ctx.db.patch(section.sectionId, { translations: { en: { name: "Red", status: "confirmed" } } });
    });
    const copy = await as(t, w.ownerId).mutation(api.menuPages.duplicate, { pageId: wine.pageId });
    expect((await pageOf(t, copy.pageId))?.translations).toEqual({ en: { publicTitle: "Wine list", status: "confirmed" } });
    const copiedSections = await sectionsOf(t, copy.pageId);
    expect(copiedSections.map((row) => row.translations)).toEqual([{ en: { name: "Red", status: "confirmed" } }]);
  });

  test("a name at the length limit is shortened so the copy name still fits", async () => {
    const t = newTest();
    const w = await world(t);
    const long = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "A".repeat(80),
    });
    const copy = await as(t, w.ownerId).mutation(api.menuPages.duplicate, { pageId: long.pageId });
    const copyPage = await pageOf(t, copy.pageId);
    expect(copyPage!.name).toBe(`${"A".repeat(71)} (kopija)`);
    expect(copyPage!.name.length).toBe(80);
    expect(copy.slug).toBe(`${"a".repeat(58)}-2`);
  });

  test("an archived page cannot be duplicated", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });
    const before = await snapshotService(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.duplicate, { pageId: wine.pageId }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);
  });
});

describe("move", () => {
  test("reorders the pages, renumbers them and bumps the revision once", async () => {
    const t = newTest();
    const w = await world(t);
    const add = async (name: string) =>
      await as(t, w.ownerId).mutation(api.menuPages.add, {
        menuServiceId: w.a.menuServiceId,
        name,
      });
    const wine = await add("Vinska karta");
    const breakfast = await add("Doručak");
    const namesOf = async () => (await pagesOf(t, w.a.menuServiceId)).map((page) => page.name);
    expect(await namesOf()).toEqual(["Kompletan meni", "Vinska karta", "Doručak"]);

    const before = await revisionOf(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.move, { pageId: breakfast.pageId, toIndex: 0 }),
    ).resolves.toEqual({ changed: true });
    expect(await namesOf()).toEqual(["Doručak", "Kompletan meni", "Vinska karta"]);
    expect((await pagesOf(t, w.a.menuServiceId)).map((page) => page.order)).toEqual([
      ORDER_STEP,
      2 * ORDER_STEP,
      3 * ORDER_STEP,
    ]);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(before + 1);
    // Moving a page does not move the default flag.
    expect(await pageOf(t, w.a.defaultPageId)).toMatchObject({ isDefault: true });

    // An index past the end clamps to the end.
    await as(t, w.ownerId).mutation(api.menuPages.move, { pageId: breakfast.pageId, toIndex: 99 });
    expect(await namesOf()).toEqual(["Kompletan meni", "Vinska karta", "Doručak"]);

    await as(t, w.ownerId).mutation(api.menuPages.move, { pageId: wine.pageId, toIndex: 0 });
    expect(await namesOf()).toEqual(["Vinska karta", "Kompletan meni", "Doručak"]);
  });

  test("moving a page to where it already is changes nothing", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const before = await snapshotService(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.move, { pageId: wine.pageId, toIndex: 1 }),
    ).resolves.toEqual({ changed: false });
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.move, { pageId: wine.pageId, toIndex: 50 }),
    ).resolves.toEqual({ changed: false });
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);
  });

  test("an invalid index or an archived page is refused", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const before = await snapshotService(t, w.a.menuServiceId);
    for (const toIndex of [-1, 0.5, Number.NaN]) {
      await expect(
        as(t, w.ownerId).mutation(api.menuPages.move, { pageId: wine.pageId, toIndex }),
      ).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);

    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.move, { pageId: wine.pageId, toIndex: 0 }),
    ).rejects.toThrow(MENU_ERROR.pageArchived);
  });
});

describe("archive and restore", () => {
  test("archive hides the page, keeps its content, writes the audit and bumps the revision once; repeating is a no-op", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await seedContent(t, w.a.menuServiceId, wine.pageId);
    const before = await revisionOf(t, w.a.menuServiceId);

    await expect(
      as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId }),
    ).resolves.toEqual({ changed: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(before + 1);
    const page = await pageOf(t, wine.pageId);
    expect(typeof page!.archivedAt).toBe("number");
    expect(page).toMatchObject({ isDefault: false, slug: "vinska-karta", key: wine.key });
    expect(await sectionsOf(t, wine.pageId)).toHaveLength(2);
    expect(await placementsOf(t, wine.pageId)).toHaveLength(3);

    const audit = await auditOf(t, w.a.menuServiceId, "page.archived");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: "user",
      actorUserId: w.ownerId,
      entityType: "menuPages",
      entityKey: wine.key,
      details: { slug: "vinska-karta" },
    });

    const after = await snapshotService(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId }),
    ).resolves.toEqual({ changed: false });
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(after);
  });

  test("a ScanMe admin's archive is audited as admin", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await as(t, w.adminId).mutation(api.menuPages.archive, { pageId: wine.pageId });
    const audit = await auditOf(t, w.a.menuServiceId, "page.archived");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorKind: "admin", actorUserId: w.adminId });
  });

  test("archiving the default page moves the default to the next active page", async () => {
    const t = newTest();
    const w = await world(t);
    const add = async (name: string) =>
      await as(t, w.ownerId).mutation(api.menuPages.add, {
        menuServiceId: w.a.menuServiceId,
        name,
      });
    const wine = await add("Vinska karta");
    const breakfast = await add("Doručak");
    // The archived page in between must be skipped.
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });

    const before = await revisionOf(t, w.a.menuServiceId);
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: w.a.defaultPageId });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(before + 1);

    expect(await pageOf(t, w.a.defaultPageId)).toMatchObject({ isDefault: false });
    expect(await pageOf(t, breakfast.pageId)).toMatchObject({ isDefault: true });
    expect(await pageOf(t, wine.pageId)).toMatchObject({ isDefault: false });
    const pages = await pagesOf(t, w.a.menuServiceId);
    expect(pages.filter((page) => page.isDefault)).toHaveLength(1);
  });

  test("the last active page cannot be archived", async () => {
    const t = newTest();
    const w = await world(t);
    const before = await snapshotService(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: w.a.defaultPageId }),
    ).rejects.toThrow(MENU_ERROR.lastPage);
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);

    // Archived pages do not count as active.
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: w.a.defaultPageId }),
    ).rejects.toThrow(MENU_ERROR.lastPage);
    expect(await pageOf(t, w.a.defaultPageId)).toMatchObject({ isDefault: true });
  });

  test("restore brings a page back (never as the default); restoring an active page is a no-op", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    // Archiving the default page hands the default flag to wine.
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: w.a.defaultPageId });
    expect(await pageOf(t, wine.pageId)).toMatchObject({ isDefault: true });
    const before = await revisionOf(t, w.a.menuServiceId);

    await expect(
      as(t, w.ownerId).mutation(api.menuPages.restore, { pageId: w.a.defaultPageId }),
    ).resolves.toEqual({ changed: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(before + 1);
    const restored = await pageOf(t, w.a.defaultPageId);
    expect(restored!.archivedAt).toBeUndefined();
    expect(restored).toMatchObject({ isDefault: false, slug: "glavni" });
    // The default flag stayed with the page that took it over.
    expect(await pageOf(t, wine.pageId)).toMatchObject({ isDefault: true });

    const after = await snapshotService(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.restore, { pageId: w.a.defaultPageId }),
    ).resolves.toEqual({ changed: false });
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(after);
  });
});

describe("remove", () => {
  test("a page linked to an ACTIVE QR card is refused with page_has_qr and NOTHING is deleted", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await seedContent(t, w.a.menuServiceId, wine.pageId);
    await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey: wine.key,
        createdByUserId: w.ownerId,
      }),
    );
    const before = await snapshotService(t, w.a.menuServiceId);
    const articlesBefore = await allArticles(t);

    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      await expect(
        as(t, userId).mutation(api.menuPages.remove, { pageId: wine.pageId }),
      ).rejects.toThrow(MENU_ERROR.pageHasQr);
    }
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);
    expect(await allArticles(t)).toEqual(articlesBefore);
    expect(await pageOf(t, wine.pageId)).not.toBeNull();
    expect(await sectionsOf(t, wine.pageId)).toHaveLength(2);
    expect(await placementsOf(t, wine.pageId)).toHaveLength(3);
    expect(await auditOf(t, w.a.menuServiceId, "page.deleted")).toHaveLength(0);

    // Archiving hides the page from the guest just the same, so it is refused too.
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId }),
    ).rejects.toThrow(MENU_ERROR.pageHasQr);
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);
  });

  test("the block also holds for an archived page that an active QR still opens", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });
    await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey: wine.key,
        createdByUserId: w.ownerId,
      }),
    );
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: wine.pageId }),
    ).rejects.toThrow(MENU_ERROR.pageHasQr);
    expect(await pageOf(t, wine.pageId)).not.toBeNull();
  });

  test("the same page can be deleted and archived once the QR link is inactive, the card is disabled, or the card opens a URL", async () => {
    const cases = [
      { name: "inactive link", options: { linkActive: false } },
      { name: "disabled card", options: { cardStatus: "disabled" as const } },
      { name: "card retargeted to a URL", options: { targetKind: "url" as const } },
    ];
    for (const { name, options } of cases) {
      const t = newTest();
      const w = await world(t);
      const add = async (pageName: string) =>
        await as(t, w.ownerId).mutation(api.menuPages.add, {
          menuServiceId: w.a.menuServiceId,
          name: pageName,
        });
      const toDelete = await add("Za brisanje");
      const toArchive = await add("Za arhivu");
      await seedContent(t, w.a.menuServiceId, toDelete.pageId);
      for (const [index, page] of [toDelete, toArchive].entries()) {
        await t.run(async (ctx) =>
          seedQrLink(ctx, {
            menuServiceId: w.a.menuServiceId,
            businessId: w.a.businessId,
            pageKey: page.key,
            createdByUserId: w.ownerId,
            cardCode: `QRCASE0${index}`,
            ...options,
          }),
        );
      }
      await expect(
        as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: toDelete.pageId }),
        name,
      ).resolves.toEqual({ deleted: true });
      expect(await pageOf(t, toDelete.pageId), name).toBeNull();
      await expect(
        as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: toArchive.pageId }),
        name,
      ).resolves.toEqual({ changed: true });
    }
  });

  test("a link of another business's card, or to another page, does not block", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const breakfast = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Doručak",
    });
    // A card of business B that a (corrupt) link of service A points at wine.
    await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.b.businessId,
        pageKey: wine.key,
        createdByUserId: w.ownerId,
        cardCode: "FOREIGN1",
      }),
    );
    // An active link to Doručak does not block Vinska karta.
    await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey: breakfast.key,
        createdByUserId: w.ownerId,
        cardCode: "OTHERPG1",
      }),
    );
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: wine.pageId }),
    ).resolves.toEqual({ deleted: true });
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: breakfast.pageId }),
    ).rejects.toThrow(MENU_ERROR.pageHasQr);
  });

  test("pageHasActiveQr: only an active link + active card of the business + a Menu target blocks", async () => {
    const t = newTest();
    const w = await world(t);
    const key = await keyOf(t, w.a.defaultPageId);
    const probe = async () =>
      await t.run(async (ctx) =>
        pageHasActiveQr(ctx, w.a.menuServiceId, w.a.businessId, key),
      );
    const link = async (
      cardCode: string,
      options: Partial<
        Pick<
          Parameters<typeof seedQrLink>[1],
          "businessId" | "linkActive" | "cardStatus" | "targetKind"
        >
      >,
    ) =>
      await t.run(async (ctx) =>
        seedQrLink(ctx, {
          menuServiceId: w.a.menuServiceId,
          businessId: w.a.businessId,
          pageKey: key,
          createdByUserId: w.ownerId,
          cardCode,
          ...options,
        }),
      );

    expect(await probe()).toBe(false);
    await link("PROBE001", { linkActive: false });
    await link("PROBE002", { cardStatus: "disabled" });
    await link("PROBE003", { targetKind: "url" });
    await link("PROBE004", { businessId: w.b.businessId });
    // A card that has no current target at all does not open the Menu.
    await t.run(async (ctx) => {
      const now = Date.now();
      const cardId = await ctx.db.insert("cards", {
        businessId: w.a.businessId,
        cardCode: "PROBE005",
        label: "Bez odredišta",
        status: "active",
        totalScans: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("menuQrLinks", {
        menuServiceId: w.a.menuServiceId,
        cardId,
        pageKey: key,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });
    expect(await probe()).toBe(false);

    await link("PROBE006", {});
    expect(await probe()).toBe(true);
    // Other pages and other services are unaffected.
    const otherKey = await keyOf(t, w.b.defaultPageId);
    expect(
      await t.run(async (ctx) =>
        pageHasActiveQr(ctx, w.a.menuServiceId, w.a.businessId, otherKey),
      ),
    ).toBe(false);
  });

  // K34: an adopted (ADMIN-12) card is judged like the resolver judges it: its access channel
  // switches it and its destination lives on the access subject; the legacy cards.status and
  // currentTargetId are stale for it. Before K34 the page check read only the legacy fields.
  test("K34: pageHasActiveQr judges an adopted card by its channel and subject, like the resolver", async () => {
    const t = newTest();
    const w = await world(t);
    const key = await keyOf(t, w.a.defaultPageId);
    const probe = async () =>
      await t.run(async (ctx) => pageHasActiveQr(ctx, w.a.menuServiceId, w.a.businessId, key));
    const { cardId, targetId } = await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey: key,
        createdByUserId: w.ownerId,
        cardCode: "ADOPT001",
        cardStatus: "disabled",
      }),
    );
    expect(await probe()).toBe(false);
    // Adopted: the channel is active and the subject still opens the Menu → the page is live.
    const { subjectId, channelId } = await t.run(async (ctx) => {
      const now = Date.now();
      const subjectId = await ctx.db.insert("accessSubjects", {
        accountId: w.a.accountId,
        businessId: w.a.businessId,
        destinationKind: "legacy",
        currentTargetId: targetId,
        createdAt: now,
        updatedAt: now,
      });
      const channelId = await ctx.db.insert("accessChannels", {
        accountId: w.a.accountId,
        businessId: w.a.businessId,
        subjectId,
        cardId,
        resolverCode: "ADOPT001",
        kind: "qr",
        state: "active",
        redirectEnabled: true,
        health: "healthy",
        binding: "digital",
        searchText: "adopt001",
        totalScans: 0,
        lastActor: { kind: "system", source: "menuPages.test" },
        lastReason: "test",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(cardId, { accessChannelId: channelId });
      return { subjectId, channelId };
    });
    expect(await probe()).toBe(true);
    // ScanMe switches the channel off: scans go nowhere, the page no longer counts as linked.
    await t.run(async (ctx) => await ctx.db.patch(channelId, { redirectEnabled: false }));
    expect(await probe()).toBe(false);
    // Channel on again, but ScanMe sends the card elsewhere (the subject's target): not linked either.
    await t.run(async (ctx) => {
      await ctx.db.patch(channelId, { redirectEnabled: true });
      const urlTarget = await ctx.db.insert("cardTargets", {
        cardId,
        kind: "url",
        url: "https://example.com",
        createdByUserId: w.ownerId,
        createdAt: Date.now(),
      });
      await ctx.db.patch(subjectId, { currentTargetId: urlTarget });
    });
    expect(await probe()).toBe(false);
  });

  test("deleting the default page moves the default flag to the next active page", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const before = await revisionOf(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: w.a.defaultPageId }),
    ).resolves.toEqual({ deleted: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(before + 1);
    expect(await pageOf(t, w.a.defaultPageId)).toBeNull();
    expect(await pageOf(t, wine.pageId)).toMatchObject({ isDefault: true });
    const pages = await pagesOf(t, w.a.menuServiceId);
    expect(pages.filter((page) => page.isDefault)).toHaveLength(1);
  });

  test("the last active page cannot be deleted; an archived page can", async () => {
    const t = newTest();
    const w = await world(t);
    const before = await snapshotService(t, w.a.menuServiceId);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: w.a.defaultPageId }),
    ).rejects.toThrow(MENU_ERROR.lastPage);
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);

    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await as(t, w.ownerId).mutation(api.menuPages.archive, { pageId: wine.pageId });
    // wine is archived, so the default page is still the only ACTIVE one.
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: w.a.defaultPageId }),
    ).rejects.toThrow(MENU_ERROR.lastPage);
    await expect(
      as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: wine.pageId }),
    ).resolves.toEqual({ deleted: true });
    expect(await pageOf(t, wine.pageId)).toBeNull();
    expect(await pageOf(t, w.a.defaultPageId)).toMatchObject({ isDefault: true });
  });

  test("delete removes the page's sections and placements, keeps every article and the other pages, and audits", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    const wineContent = await seedContent(t, w.a.menuServiceId, wine.pageId);
    await seedContent(t, w.a.menuServiceId, w.a.defaultPageId);
    // One more placement of a wine-page article on the default page: it must survive.
    await t.run(async (ctx) => {
      const sections = await ctx.db
        .query("menuSections")
        .withIndex("by_pageId_and_order", (q) => q.eq("pageId", w.a.defaultPageId))
        .collect();
      const now = Date.now();
      await ctx.db.insert("menuPlacements", {
        menuServiceId: w.a.menuServiceId,
        pageId: w.a.defaultPageId,
        sectionId: sections[0]._id,
        articleId: wineContent.articleIds[0],
        order: 10 * ORDER_STEP,
        visibility: "visible",
        createdAt: now,
        updatedAt: now,
      });
    });
    const articlesBefore = await allArticles(t);
    const defaultSectionsBefore = await sectionsOf(t, w.a.defaultPageId);
    const defaultPlacementsBefore = await placementsOf(t, w.a.defaultPageId);
    expect(articlesBefore).toHaveLength(6);
    const revisionBefore = await revisionOf(t, w.a.menuServiceId);

    await expect(
      as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: wine.pageId }),
    ).resolves.toEqual({ deleted: true });

    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revisionBefore + 1);
    expect(await pageOf(t, wine.pageId)).toBeNull();
    expect(await sectionsOf(t, wine.pageId)).toHaveLength(0);
    expect(await placementsOf(t, wine.pageId)).toHaveLength(0);
    // Articles are NEVER deleted.
    expect(await allArticles(t)).toEqual(articlesBefore);
    // The other page keeps everything, including the placement of a shared article.
    expect(await sectionsOf(t, w.a.defaultPageId)).toEqual(defaultSectionsBefore);
    expect(await placementsOf(t, w.a.defaultPageId)).toEqual(defaultPlacementsBefore);
    expect(defaultPlacementsBefore).toHaveLength(4);

    const audit = await auditOf(t, w.a.menuServiceId, "page.deleted");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actorKind: "user",
      actorUserId: w.ownerId,
      entityType: "menuPages",
      entityKey: wine.key,
      details: { slug: "vinska-karta", name: "Vinska karta" },
    });
  });
});

describe("roles", () => {
  test("owner, manager, editor (explicit member) and ScanMe admin can add and rename", async () => {
    const t = newTest();
    const w = await world(t);
    const people = [
      ["owner", w.ownerId],
      ["manager", w.managerId],
      ["editor", w.editorId],
      ["admin", w.adminId],
    ] as const;
    for (const [role, userId] of people) {
      const added = await as(t, userId).mutation(api.menuPages.add, {
        menuServiceId: w.a.menuServiceId,
        name: `Stranica ${role}`,
      });
      await expect(
        as(t, userId).mutation(api.menuPages.rename, {
          pageId: added.pageId,
          name: `Preimenovana ${role}`,
          expectedName: `Stranica ${role}`,
        }),
        role,
      ).resolves.toEqual({ ok: true });
      expect(await pageOf(t, added.pageId)).toMatchObject({
        name: `Preimenovana ${role}`,
        slug: `stranica-${role}`,
      });
    }
    // The editor can also run the rest of the page life cycle.
    const mine = await as(t, w.editorId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Urednikova",
    });
    await as(t, w.editorId).mutation(api.menuPages.duplicate, { pageId: mine.pageId });
    await as(t, w.editorId).mutation(api.menuPages.move, { pageId: mine.pageId, toIndex: 0 });
    await as(t, w.editorId).mutation(api.menuPages.archive, { pageId: mine.pageId });
    await as(t, w.editorId).mutation(api.menuPages.restore, { pageId: mine.pageId });
    await as(t, w.editorId).mutation(api.menuPages.remove, { pageId: mine.pageId });
  });

  test("finance, view-only, outsiders, the owner of another business and signed-out callers cannot write; nothing is written", async () => {
    const t = newTest();
    const w = await world(t);
    const before = await snapshotService(t, w.a.menuServiceId);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      // Addressed by service: the caller has no Menu role there.
      await expect(
        as(t, userId).mutation(api.menuPages.add, {
          menuServiceId: w.a.menuServiceId,
          name: "Upad",
        }),
      ).rejects.toThrow(MENU_ERROR.forbidden);
      // Addressed by page id: indistinguishable from a page that does not exist.
      await expect(
        as(t, userId).mutation(api.menuPages.rename, {
          pageId: w.a.defaultPageId,
          name: "Upad",
          expectedName: "Kompletan meni",
        }),
      ).rejects.toThrow(MENU_ERROR.notFound);
    }
    await expect(
      t.mutation(api.menuPages.add, { menuServiceId: w.a.menuServiceId, name: "Upad" }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    await expect(
      t.mutation(api.menuPages.rename, {
        pageId: w.a.defaultPageId,
        name: "Upad",
        expectedName: "Kompletan meni",
      }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);
  });

  test("with client editing switched off the owner cannot edit pages (editing_disabled) but can read; the admin still edits", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await t.run(async (ctx) => ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false }));
    const before = await snapshotService(t, w.a.menuServiceId);

    const owner = as(t, w.ownerId);
    const attempts: Array<[string, () => Promise<unknown>]> = [
      ["add", () => owner.mutation(api.menuPages.add, { menuServiceId: w.a.menuServiceId, name: "Nova" })],
      [
        "rename",
        () =>
          owner.mutation(api.menuPages.rename, {
            pageId: wine.pageId,
            name: "Nova",
            expectedName: "Vinska karta",
          }),
      ],
      ["duplicate", () => owner.mutation(api.menuPages.duplicate, { pageId: wine.pageId })],
      ["move", () => owner.mutation(api.menuPages.move, { pageId: wine.pageId, toIndex: 0 })],
      ["archive", () => owner.mutation(api.menuPages.archive, { pageId: wine.pageId })],
      ["restore", () => owner.mutation(api.menuPages.restore, { pageId: wine.pageId })],
      ["remove", () => owner.mutation(api.menuPages.remove, { pageId: wine.pageId })],
    ];
    for (const [name, attempt] of attempts) {
      await expect(attempt(), name).rejects.toThrow(MENU_ERROR.editingDisabled);
    }
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(before);

    const list = await owner.query(api.menuPages.list, { menuServiceId: w.a.menuServiceId });
    expect(list).toHaveLength(2);

    await expect(
      as(t, w.adminId).mutation(api.menuPages.add, {
        menuServiceId: w.a.menuServiceId,
        name: "Admin dodaje",
      }),
    ).resolves.toMatchObject({ slug: "admin-dodaje" });
    await expect(
      as(t, w.adminId).mutation(api.menuPages.rename, {
        pageId: wine.pageId,
        name: "Admin menja",
        expectedName: "Vinska karta",
      }),
    ).resolves.toEqual({ ok: true });
  });
});

describe("tenant isolation", () => {
  async function attemptsOn(
    t: T,
    userId: Id<"users">,
    pageId: Id<"menuPages">,
    menuServiceId: Id<"menuServices">,
  ) {
    const caller = as(t, userId);
    const attempts: Array<[string, () => Promise<unknown>]> = [
      [
        "rename",
        () =>
          caller.mutation(api.menuPages.rename, {
            pageId,
            name: "Hakovano",
            expectedName: "Kompletan meni",
          }),
      ],
      ["duplicate", () => caller.mutation(api.menuPages.duplicate, { pageId })],
      ["move", () => caller.mutation(api.menuPages.move, { pageId, toIndex: 0 })],
      ["archive", () => caller.mutation(api.menuPages.archive, { pageId })],
      ["restore", () => caller.mutation(api.menuPages.restore, { pageId })],
      ["remove", () => caller.mutation(api.menuPages.remove, { pageId })],
    ];
    for (const [name, attempt] of attempts) {
      await expect(attempt(), name).rejects.toThrow(MENU_ERROR.notFound);
    }
    await expect(
      caller.mutation(api.menuPages.add, { menuServiceId, name: "Upad" }),
    ).rejects.toThrow(MENU_ERROR.forbidden);
    await expect(caller.query(api.menuPages.list, { menuServiceId })).resolves.toBeNull();
  }

  async function twoTenants(t: T) {
    const w: MenuWorldSeed = await world(t);
    await seedContent(t, w.a.menuServiceId, w.a.defaultPageId);
    await seedContent(t, w.b.menuServiceId, w.b.defaultPageId);
    const wineB = await as(t, w.otherOwnerId).mutation(api.menuPages.add, {
      menuServiceId: w.b.menuServiceId,
      name: "Vinska karta B",
    });
    return { w, wineB };
  }

  test("the owner of A gets not_found for every page action on a page of B, and B is unchanged", async () => {
    const t = newTest();
    const { w, wineB } = await twoTenants(t);
    const beforeA = await snapshotService(t, w.a.menuServiceId);
    const beforeB = await snapshotService(t, w.b.menuServiceId);
    const articlesBefore = await allArticles(t);

    await attemptsOn(t, w.ownerId, w.b.defaultPageId, w.b.menuServiceId);
    await attemptsOn(t, w.ownerId, wineB.pageId, w.b.menuServiceId);

    expect(await snapshotService(t, w.b.menuServiceId)).toEqual(beforeB);
    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(beforeA);
    expect(await allArticles(t)).toEqual(articlesBefore);
  });

  test("the owner of B cannot touch the pages of A either, and A is unchanged", async () => {
    const t = newTest();
    const { w } = await twoTenants(t);
    const beforeA = await snapshotService(t, w.a.menuServiceId);
    const beforeB = await snapshotService(t, w.b.menuServiceId);

    await attemptsOn(t, w.otherOwnerId, w.a.defaultPageId, w.a.menuServiceId);

    expect(await snapshotService(t, w.a.menuServiceId)).toEqual(beforeA);
    expect(await snapshotService(t, w.b.menuServiceId)).toEqual(beforeB);
  });

  test("a page that does not exist (any more) is not_found, not an error about permissions", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await as(t, w.ownerId).mutation(api.menuPages.add, {
      menuServiceId: w.a.menuServiceId,
      name: "Vinska karta",
    });
    await as(t, w.ownerId).mutation(api.menuPages.remove, { pageId: wine.pageId });
    for (const userId of [w.ownerId, w.outsiderId]) {
      await expect(
        as(t, userId).mutation(api.menuPages.rename, {
          pageId: wine.pageId,
          name: "Duh",
          expectedName: "Vinska karta",
        }),
      ).rejects.toThrow(MENU_ERROR.notFound);
      await expect(
        as(t, userId).mutation(api.menuPages.remove, { pageId: wine.pageId }),
      ).rejects.toThrow(MENU_ERROR.notFound);
    }
  });

  test("duplicating a page never copies content of another service", async () => {
    const t = newTest();
    const { w } = await twoTenants(t);
    const copy = await as(t, w.ownerId).mutation(api.menuPages.duplicate, {
      pageId: w.a.defaultPageId,
    });
    const sections = await sectionsOf(t, copy.pageId);
    const placements = await placementsOf(t, copy.pageId);
    expect(sections).toHaveLength(2);
    expect(placements).toHaveLength(3);
    for (const row of [...sections, ...placements]) {
      expect(row.menuServiceId).toBe(w.a.menuServiceId);
    }
    expect(await pagesOf(t, w.b.menuServiceId)).toHaveLength(2);
  });
});
