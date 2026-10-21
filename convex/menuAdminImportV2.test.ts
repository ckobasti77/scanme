/// <reference types="vite/client" />

// ScanMe Menu V1 — K06: the internal ScanMe import into the DRAFT of the new
// model (convex/menuAdmin.ts importDraftV2; master §6.2). Covered: the written
// draft (sections, shared articles, placements, variants, order), the audit
// pair, never publishing, the dry-run report, the "only into a draft without
// articles" rule, the MENU_IMPORT_MAX_WRITES refusal before any write,
// duplicates being reported and never merged, who may call it (ScanMe admin
// only), tenant isolation and a skipped nameless item / a rounded price.

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { parseMenuImport } from "../lib/menu-import";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_IMPORT_MAX_WRITES } from "../lib/menu/legacy-mapping";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

const CODE_PATTERN = /\bmenu\/[a-z_]+/;

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    const text = error instanceof Error ? error.message : String(error);
    return text.match(CODE_PATTERN)?.[0] ?? text;
  }
}

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

// -----------------------------------------------------------------------------
// The import call
// -----------------------------------------------------------------------------

type ImportArgs = FunctionArgs<typeof api.menuAdmin.importDraftV2>;
type ImportModel = ImportArgs["model"];

/**
 * The model of the admin screen: lib/menu-import.ts parseMenuImport. The pure
 * MenuModel types storage ids as plain strings, the mutation's validator as
 * Id<"_storage">; an import never carries a storage id, so the cast is safe.
 */
function modelOf(text: string): ImportModel {
  return parseMenuImport(text).model as unknown as ImportModel;
}

async function runImport(
  t: T,
  userId: Id<"users">,
  menuServiceId: Id<"menuServices">,
  model: ImportModel,
  dryRun?: boolean,
) {
  return await as(t, userId).mutation(api.menuAdmin.importDraftV2, {
    menuServiceId,
    model,
    ...(dryRun === undefined ? {} : { dryRun }),
  });
}
type ImportResult = Awaited<ReturnType<typeof runImport>>;

function asImported(result: ImportResult) {
  if (!result.imported) {
    throw new Error(`expected an import, got blockers: ${result.report.blockers.join(", ")}`);
  }
  return result;
}

function asNotImported(result: ImportResult) {
  if (result.imported) throw new Error("expected no import, but the import wrote");
  return result;
}

const IMPORT_TEXT = [
  "# Topli napici | kafa",
  "Espreso | 150",
  "Kapućino |",
  "- mala | 180",
  "- velika | 220",
  "# Roštilj",
  "Pljeskavica | 650 | Sa lukom i kajmakom",
  "Ćevapi 10 kom | 790",
].join("\n");

/** One group with `items` items; item `index` has `variantsOf(index)` priced variants. */
function bigModel(items: number, variantsOf: (index: number) => number): ImportModel {
  return {
    groups: [
      {
        shape: "lista",
        base: { id: "grp-veliki", title: "Veliki meni" },
        items: Array.from({ length: items }, (_, index) => ({
          id: `itm-${index}`,
          name: `Artikal ${index + 1}`,
          productType: "jelo",
          priceRsd: 100 + index,
          available: true,
          variants: Array.from({ length: variantsOf(index) }, (_, variantIndex) => ({
            id: `var-${index}-${variantIndex}`,
            label: `Varijanta ${variantIndex + 1}`,
            priceRsd: 100 + variantIndex,
          })),
          pairings: [],
        })),
      },
    ],
    dayparts: [],
  };
}

// -----------------------------------------------------------------------------
// Reading what the database holds
// -----------------------------------------------------------------------------

/** Every table the import could touch, in full: equal before and after = nothing written. */
async function footprint(t: T) {
  return await t.run(async (ctx) => ({
    sections: await ctx.db.query("menuSections").collect(),
    articles: await ctx.db.query("menuArticles").collect(),
    placements: await ctx.db.query("menuPlacements").collect(),
    variants: await ctx.db.query("menuVariants").collect(),
    availability: await ctx.db.query("menuAvailability").collect(),
    versions: await ctx.db.query("menuVersions").collect(),
    menuAudit: await ctx.db.query("menuAuditLog").collect(),
    adminAudit: await ctx.db.query("adminAuditLog").collect(),
    activityRows: await ctx.db.query("adminActivityRows").collect(),
    draftStates: await ctx.db.query("menuDraftState").collect(),
    pages: await ctx.db.query("menuPages").collect(),
    services: await ctx.db.query("menuServices").collect(),
  }));
}

async function draftStateOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => {
    const state = await ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique();
    if (!state) throw new Error("draft state missing");
    return state;
  });
}

async function pageOf(t: T, pageId: Id<"menuPages">) {
  return await t.run(async (ctx) => {
    const page = await ctx.db.get(pageId);
    if (!page) throw new Error("page missing");
    return page;
  });
}

async function serviceOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => {
    const service = await ctx.db.get(menuServiceId);
    if (!service) throw new Error("service missing");
    return service;
  });
}

/** The default page as the editor shows it: sections in order, placed articles in order, variants in order. */
async function readDraft(t: T, menuServiceId: Id<"menuServices">, pageId: Id<"menuPages">) {
  return await t.run(async (ctx) => {
    const sections = await ctx.db
      .query("menuSections")
      .withIndex("by_pageId_and_order", (q) => q.eq("pageId", pageId))
      .collect();
    const placements = await ctx.db
      .query("menuPlacements")
      .withIndex("by_pageId", (q) => q.eq("pageId", pageId))
      .collect();
    const articles = await ctx.db
      .query("menuArticles")
      .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const variants = await ctx.db
      .query("menuVariants")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    const articleById = new Map(articles.map((article) => [article._id, article]));

    return {
      articleCount: articles.length,
      sections: sections.map((section) => ({
        name: section.name,
        key: section.key,
        order: section.order,
        legacyRef: section.legacyRef,
        visibility: section.visibility,
        articles: placements
          .filter((placement) => placement.sectionId === section._id)
          .sort((left, right) => left.order - right.order)
          .map((placement) => {
            const article = articleById.get(placement.articleId);
            if (!article) throw new Error("placement without an article");
            return {
              name: article.name,
              key: article.key,
              basePriceRsd: article.basePriceRsd,
              description: article.description,
              iconKey: article.iconKey,
              mediaMode: article.mediaMode,
              variantsEnabled: article.variantsEnabled,
              legacyRef: article.legacyRef,
              placementOrder: placement.order,
              placementVisibility: placement.visibility,
              variants: variants
                .filter((variant) => variant.articleId === article._id)
                .sort((left, right) => left.order - right.order)
                .map((variant) => ({
                  name: variant.name,
                  priceRsd: variant.priceRsd,
                  order: variant.order,
                })),
            };
          }),
      })),
    };
  });
}
type DraftRead = Awaited<ReturnType<typeof readDraft>>;

function sectionNamed(draft: DraftRead, name: string) {
  const section = draft.sections.find((candidate) => candidate.name === name);
  if (!section) throw new Error(`section "${name}" not found`);
  return section;
}

function articleNamed(draft: DraftRead, name: string) {
  const article = draft.sections
    .flatMap((section) => section.articles)
    .find((candidate) => candidate.name === name);
  if (!article) throw new Error(`article "${name}" not found`);
  return article;
}

function isAscending(values: number[]) {
  return values.every((value, index) => index === 0 || value > values[index - 1]);
}

async function importAuditRows(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    return rows.filter((row) => row.action === "legacy.imported");
  });
}

async function adminImportRows(t: T) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("adminAuditLog").collect();
    return rows.filter((row) => row.action === "menu_import_draft_v2");
  });
}

// =============================================================================
// 1. The happy path
// =============================================================================

describe("importDraftV2 — the admin imports into an empty draft", () => {
  test("sections, articles, prices, variants and order land on the default page; draft state and both audits follow", async () => {
    const { t, w } = await setup();
    expect(parseMenuImport(IMPORT_TEXT).warnings).toEqual([]);
    const stateBefore = await draftStateOf(t, w.a.menuServiceId);
    const pageBefore = await pageOf(t, w.a.defaultPageId);
    expect(stateBefore.articleCount).toBe(0);
    expect(pageBefore.placementCount).toBe(0);

    const result = asImported(await runImport(t, w.adminId, w.a.menuServiceId, modelOf(IMPORT_TEXT)));

    expect(result.ok).toBe(true);
    expect(result.imported).toBe(true);
    expect(result.report.blockers).toEqual([]);
    expect(result.written).toEqual({
      sections: 2,
      articles: 4,
      placements: 4,
      variants: 2,
      availability: 0,
      skippedExisting: 0,
    });

    // The default page: the two groups, in the order of the text.
    const draft = await readDraft(t, w.a.menuServiceId, w.a.defaultPageId);
    expect(draft.sections.map((section) => section.name)).toEqual(["Topli napici", "Roštilj"]);
    expect(isAscending(draft.sections.map((section) => section.order))).toBe(true);
    for (const section of draft.sections) {
      expect(section.visibility).toBe("visible");
      expect(section.legacyRef?.startsWith("import:")).toBe(true);
    }

    const topli = sectionNamed(draft, "Topli napici");
    const rostilj = sectionNamed(draft, "Roštilj");
    expect(topli.articles.map((article) => article.name)).toEqual(["Espreso", "Kapućino"]);
    expect(rostilj.articles.map((article) => article.name)).toEqual(["Pljeskavica", "Ćevapi 10 kom"]);
    expect(draft.articleCount).toBe(4);
    for (const section of draft.sections) {
      expect(isAscending(section.articles.map((article) => article.placementOrder))).toBe(true);
      for (const article of section.articles) {
        expect(article.legacyRef?.startsWith("import:")).toBe(true);
        expect(article.placementVisibility).toBe("visible");
      }
    }

    // Prices in whole dinars; Kapućino has none of its own, only variants.
    const espreso = articleNamed(draft, "Espreso");
    expect(espreso.basePriceRsd).toBe(150);
    expect(espreso.variants).toEqual([]);
    expect(espreso.variantsEnabled).toBeUndefined();
    expect(espreso.iconKey).toBe("kafa");
    expect(espreso.mediaMode).toBe("icon");

    const kapucino = articleNamed(draft, "Kapućino");
    expect(kapucino.basePriceRsd).toBeUndefined();
    expect(kapucino.variantsEnabled).toBe(true);
    expect(kapucino.variants.map((variant) => [variant.name, variant.priceRsd])).toEqual([
      ["mala", 180],
      ["velika", 220],
    ]);
    expect(isAscending(kapucino.variants.map((variant) => variant.order))).toBe(true);

    const pljeskavica = articleNamed(draft, "Pljeskavica");
    expect(pljeskavica.basePriceRsd).toBe(650);
    expect(pljeskavica.description).toBe("Sa lukom i kajmakom");
    expect(articleNamed(draft, "Ćevapi 10 kom").basePriceRsd).toBe(790);

    // Draft bookkeeping: one revision, four articles, the admin as last editor.
    const stateAfter = await draftStateOf(t, w.a.menuServiceId);
    expect(stateAfter.articleCount).toBe(4);
    expect(stateAfter.lastEditByUserId).toBe(w.adminId);
    expect(stateAfter.revision).toBe(stateBefore.revision + 1);
    expect((await pageOf(t, w.a.defaultPageId)).placementCount).toBe(4);

    // Exactly one row in each audit log.
    const menuAudit = await importAuditRows(t, w.a.menuServiceId);
    expect(menuAudit).toHaveLength(1);
    expect(menuAudit[0]).toMatchObject({
      menuServiceId: w.a.menuServiceId,
      actorKind: "admin",
      actorUserId: w.adminId,
      action: "legacy.imported",
      entityType: "menuServices",
      details: {
        sections: 2,
        articles: 4,
        variants: 2,
        warnings: result.report.warningCount,
        duplicates: 0,
      },
    });

    const adminAudit = await adminImportRows(t);
    expect(adminAudit).toHaveLength(1);
    expect(adminAudit[0]).toMatchObject({
      actorUserId: w.adminId,
      accountId: w.a.accountId,
      businessId: w.a.businessId,
      action: "menu_import_draft_v2",
    });
    expect(JSON.parse(adminAudit[0].detail ?? "null")).toEqual({
      menuServiceId: w.a.menuServiceId,
      sections: 2,
      articles: 4,
      variants: 2,
      warnings: result.report.warningCount,
      duplicates: 0,
    });
  });
});

// =============================================================================
// 2. Never publishes
// =============================================================================

describe("importDraftV2 — never publishes", () => {
  test("after an import there is no live version, guests see nothing and the draft says never_published", async () => {
    const { t, w } = await setup();
    asImported(await runImport(t, w.adminId, w.a.menuServiceId, modelOf(IMPORT_TEXT)));

    const service = await serviceOf(t, w.a.menuServiceId);
    expect(service.liveVersionId).toBeUndefined();
    expect(service.liveVersionNumber).toBeUndefined();
    const versions = await t.run(async (ctx) => await ctx.db.query("menuVersions").collect());
    expect(versions).toEqual([]);

    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({ kind: "none" });

    const status = await as(t, w.ownerId).query(api.menuPublishing.draftStatus, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(status).not.toBeNull();
    expect(status?.state).toBe("never_published");
    expect(status?.hasUnpublishedChanges).toBe(true);
    expect(status?.publishedRevision).toBeNull();
    expect(status?.liveVersionNumber).toBeNull();
  });
});

// =============================================================================
// 3. dryRun
// =============================================================================

describe("importDraftV2 — dryRun", () => {
  test("returns the report and writes nothing, not even an audit row; the real run then matches the report", async () => {
    const { t, w } = await setup();
    const model = modelOf(IMPORT_TEXT);
    const before = await footprint(t);

    const dry = asNotImported(await runImport(t, w.adminId, w.a.menuServiceId, model, true));

    expect(dry.ok).toBe(true);
    expect(dry.imported).toBe(false);
    expect(dry).not.toHaveProperty("written");
    expect(dry.report.blockers).toEqual([]);
    expect(dry.report.source).toMatchObject({ kind: "import", groups: 2, items: 4, variants: 2 });
    expect(dry.report.planned).toMatchObject({
      sections: 2,
      articles: 4,
      variants: 2,
      placements: 4,
      skippedItems: 0,
    });
    expect(dry.report.prices).toMatchObject({ currency: "RSD", min: 150, max: 790 });
    expect(dry.report.duplicateCount).toBe(0);
    expect(await footprint(t)).toEqual(before);

    // A dry run does not block the real one, which does what the report said.
    const real = asImported(await runImport(t, w.adminId, w.a.menuServiceId, model));
    expect(real.report).toEqual(dry.report);
    expect(real.written).toMatchObject({ sections: 2, articles: 4, variants: 2 });
  });
});

// =============================================================================
// 4. Only into a draft without articles
// =============================================================================

describe("importDraftV2 — only into a draft without articles", () => {
  test("a second import into a draft that already has the first one is refused, nothing new is written", async () => {
    const { t, w } = await setup();
    const model = modelOf(IMPORT_TEXT);
    asImported(await runImport(t, w.adminId, w.a.menuServiceId, model));
    const before = await footprint(t);

    const again = asNotImported(await runImport(t, w.adminId, w.a.menuServiceId, model));

    expect(again.ok).toBe(false);
    expect(again.imported).toBe(false);
    expect(again.report.blockers).toContain("import_target_not_empty");
    expect(await footprint(t)).toEqual(before);

    // A dry run says the same.
    const dry = asNotImported(await runImport(t, w.adminId, w.a.menuServiceId, model, true));
    expect(dry.ok).toBe(false);
    expect(dry.report.blockers).toContain("import_target_not_empty");
    expect(await footprint(t)).toEqual(before);
  });

  test("a draft with an article the owner added by hand is refused, and that article stays", async () => {
    const { t, w } = await setup();
    const owner = as(t, w.ownerId);
    const { sectionId } = await owner.mutation(api.menuCatalog.addSection, {
      pageId: w.a.defaultPageId,
      name: "Pića",
    });
    const added = await owner.mutation(api.menuCatalog.quickAddArticle, {
      sectionId,
      name: "Jelen pivo",
      priceRsd: 200,
    });
    expect(added.status).toBe("created");
    const before = await footprint(t);

    const result = asNotImported(await runImport(t, w.adminId, w.a.menuServiceId, modelOf(IMPORT_TEXT)));

    expect(result.ok).toBe(false);
    expect(result.report.blockers).toContain("import_target_not_empty");
    expect(result.report.target.otherArticles).toBe(1);
    expect(await footprint(t)).toEqual(before);

    const draft = await readDraft(t, w.a.menuServiceId, w.a.defaultPageId);
    expect(draft.sections.map((section) => section.name)).toEqual(["Pića"]);
    expect(articleNamed(draft, "Jelen pivo").basePriceRsd).toBe(200);
    expect(await importAuditRows(t, w.a.menuServiceId)).toEqual([]);
    expect(await adminImportRows(t)).toEqual([]);
  });
});

// =============================================================================
// 5. Too large for one transaction
// =============================================================================

describe("importDraftV2 — MENU_IMPORT_MAX_WRITES", () => {
  test("400 items with 20 priced variants each are refused before any write", async () => {
    const { t, w } = await setup();
    const before = await footprint(t);

    const result = asNotImported(
      await runImport(t, w.adminId, w.a.menuServiceId, bigModel(400, () => 20)),
    );

    expect(result.ok).toBe(false);
    expect(result.report.blockers).toContain("import_too_large");
    // The premise: sections + (article + placement) per article + variants is over the ceiling.
    const planned = result.report.planned;
    expect(planned.articles).toBe(400);
    expect(planned.variants).toBe(8000);
    expect(
      planned.sections + 2 * planned.articles + planned.variants + planned.unavailable,
    ).toBeGreaterThan(MENU_IMPORT_MAX_WRITES);
    expect(await footprint(t)).toEqual(before);
  });

  test("the ceiling is exact: 8000 planned writes are accepted, 8001 are not (dry runs)", async () => {
    const { t, w } = await setup();
    // writes = 1 section + 2 per article (article, placement) + 1 per variant.
    // 400 articles, 399 with 18 variants and one with 17: 1 + 800 + 7199 = 8000.
    const atLimit = bigModel(400, (index) => (index < 399 ? 18 : 17));
    // 400 articles with 18 variants: 1 + 800 + 7200 = 8001.
    const overLimit = bigModel(400, () => 18);
    expect(MENU_IMPORT_MAX_WRITES).toBe(8000);

    const accepted = asNotImported(await runImport(t, w.adminId, w.a.menuServiceId, atLimit, true));
    expect(accepted.report.planned.variants).toBe(7199);
    expect(accepted.report.blockers).toEqual([]);
    expect(accepted.ok).toBe(true);

    const refused = asNotImported(await runImport(t, w.adminId, w.a.menuServiceId, overLimit, true));
    expect(refused.report.planned.variants).toBe(7200);
    expect(refused.report.blockers).toEqual(["import_too_large"]);
    expect(refused.ok).toBe(false);
  });
});

// =============================================================================
// 6. Duplicates are reported, never merged
// =============================================================================

describe("importDraftV2 — duplicates", () => {
  test("the same name in two groups is reported once and both articles are written", async () => {
    const { t, w } = await setup();
    const text = [
      "# Topli napici | kafa",
      "Espreso | 150",
      "# Hladni napici | sok",
      "Espreso | 150",
    ].join("\n");

    const result = asImported(await runImport(t, w.adminId, w.a.menuServiceId, modelOf(text)));

    expect(result.report.duplicateCount).toBe(1);
    expect(result.report.duplicates).toMatchObject([
      {
        names: ["Espreso"],
        sections: ["Topli napici", "Hladni napici"],
        occurrences: 2,
        inDraft: 0,
        samePrice: true,
      },
    ]);
    expect(result.report.warningCounts.duplicate_name).toBe(1);
    expect(result.written).toMatchObject({ sections: 2, articles: 2 });

    const draft = await readDraft(t, w.a.menuServiceId, w.a.defaultPageId);
    expect(draft.articleCount).toBe(2);
    const topli = sectionNamed(draft, "Topli napici");
    const hladni = sectionNamed(draft, "Hladni napici");
    expect(topli.articles.map((article) => article.name)).toEqual(["Espreso"]);
    expect(hladni.articles.map((article) => article.name)).toEqual(["Espreso"]);
    expect(topli.articles[0].key).not.toBe(hladni.articles[0].key);
    expect(topli.articles[0].basePriceRsd).toBe(150);
    expect(hladni.articles[0].basePriceRsd).toBe(150);

    const audit = await importAuditRows(t, w.a.menuServiceId);
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ articles: 2, duplicates: 1 });
  });
});

// =============================================================================
// 7. Who may import
// =============================================================================

describe("importDraftV2 — ScanMe admin only", () => {
  const DENIED = [
    { label: "the owner", key: "ownerId" },
    { label: "the manager", key: "managerId" },
    { label: "the editor", key: "editorId" },
    { label: "finance", key: "financeId" },
    { label: "view-only", key: "viewOnlyId" },
    { label: "an outsider", key: "outsiderId" },
    { label: "the owner of the other venue", key: "otherOwnerId" },
  ] as const;

  test.each(DENIED)("$label is refused and nothing is written", async ({ key }) => {
    const { t, w } = await setup();
    const before = await footprint(t);

    await expect(
      runImport(t, w[key], w.a.menuServiceId, modelOf(IMPORT_TEXT)),
    ).rejects.toThrow();
    await expect(
      runImport(t, w[key], w.a.menuServiceId, modelOf(IMPORT_TEXT), true),
    ).rejects.toThrow();

    expect(await footprint(t)).toEqual(before);
  });

  test("a signed-out caller is refused and nothing is written", async () => {
    const { t, w } = await setup();
    const before = await footprint(t);

    await expect(
      t.mutation(api.menuAdmin.importDraftV2, {
        menuServiceId: w.a.menuServiceId,
        model: modelOf(IMPORT_TEXT),
      }),
    ).rejects.toThrow();

    expect(await footprint(t)).toEqual(before);
  });
});

// =============================================================================
// 8. Tenant isolation and the service gate
// =============================================================================

describe("importDraftV2 — one service at a time", () => {
  test("an import into B writes only B's rows on B's default page; A stays empty and can still be imported", async () => {
    const { t, w } = await setup();
    const stateABefore = await draftStateOf(t, w.a.menuServiceId);
    const pageABefore = await pageOf(t, w.a.defaultPageId);

    asImported(await runImport(t, w.adminId, w.b.menuServiceId, modelOf(IMPORT_TEXT)));

    const all = await footprint(t);
    expect(all.sections).toHaveLength(2);
    expect(all.articles).toHaveLength(4);
    expect(all.placements).toHaveLength(4);
    expect(all.variants).toHaveLength(2);
    for (const row of [...all.sections, ...all.articles, ...all.placements, ...all.variants]) {
      expect(row.menuServiceId).toBe(w.b.menuServiceId);
    }
    for (const row of [...all.sections, ...all.placements]) {
      expect(row.pageId).toBe(w.b.defaultPageId);
    }

    const draftB = await readDraft(t, w.b.menuServiceId, w.b.defaultPageId);
    expect(draftB.articleCount).toBe(4);
    expect(draftB.sections.map((section) => section.name)).toEqual(["Topli napici", "Roštilj"]);
    const draftA = await readDraft(t, w.a.menuServiceId, w.a.defaultPageId);
    expect(draftA.articleCount).toBe(0);
    expect(draftA.sections).toEqual([]);

    // Service A is untouched: draft state, page counter and both audit trails.
    expect(await draftStateOf(t, w.a.menuServiceId)).toEqual(stateABefore);
    expect(await pageOf(t, w.a.defaultPageId)).toEqual(pageABefore);
    expect(await importAuditRows(t, w.a.menuServiceId)).toEqual([]);
    expect(await importAuditRows(t, w.b.menuServiceId)).toHaveLength(1);
    const adminAudit = await adminImportRows(t);
    expect(adminAudit).toHaveLength(1);
    expect(adminAudit[0]).toMatchObject({ businessId: w.b.businessId, accountId: w.b.accountId });
    expect((await draftStateOf(t, w.b.menuServiceId)).lastEditByUserId).toBe(w.adminId);

    // B's articles do not make A's draft "not empty".
    const intoA = asImported(await runImport(t, w.adminId, w.a.menuServiceId, modelOf(IMPORT_TEXT)));
    expect(intoA.written).toMatchObject({ sections: 2, articles: 4 });
    expect((await readDraft(t, w.b.menuServiceId, w.b.defaultPageId)).articleCount).toBe(4);
    expect((await readDraft(t, w.a.menuServiceId, w.a.defaultPageId)).articleCount).toBe(4);
  });

  test("an archived service is menu/not_found and nothing is written", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.menuServiceId, { status: "archived" });
    });
    const before = await footprint(t);

    expect(await codeOf(runImport(t, w.adminId, w.a.menuServiceId, modelOf(IMPORT_TEXT)))).toBe(
      MENU_ERROR.notFound,
    );
    expect(
      await codeOf(runImport(t, w.adminId, w.a.menuServiceId, modelOf(IMPORT_TEXT), true)),
    ).toBe(MENU_ERROR.notFound);

    expect(await footprint(t)).toEqual(before);
  });

  test("a service that does not exist (any more) is menu/not_found and nothing is written", async () => {
    const { t, w } = await setup();
    await t.run(async (ctx) => {
      await ctx.db.delete(w.b.menuServiceId);
    });
    const before = await footprint(t);

    expect(await codeOf(runImport(t, w.adminId, w.b.menuServiceId, modelOf(IMPORT_TEXT)))).toBe(
      MENU_ERROR.notFound,
    );

    expect(await footprint(t)).toEqual(before);
  });
});

// =============================================================================
// 9. A nameless item and a fractional price
// =============================================================================

describe("importDraftV2 — nameless item and fractional price", () => {
  test("the nameless item is skipped with item_name_empty; 149.6 is rounded to 150 with price_rounded", async () => {
    const { t, w } = await setup();
    // parseMenuImport already drops empty names, so the model is built by hand.
    const model: ImportModel = {
      groups: [
        {
          shape: "lista",
          base: { id: "grp-rucno", title: "Ručni unos" },
          items: [
            {
              id: "itm-bez-naziva",
              name: "",
              productType: "jelo",
              priceRsd: 200,
              available: true,
              variants: [],
              pairings: [],
            },
            {
              id: "itm-kafa",
              name: "Domaća kafa",
              productType: "kafa",
              priceRsd: 149.6,
              available: true,
              variants: [],
              pairings: [],
            },
          ],
        },
      ],
      dayparts: [],
    };

    const result = asImported(await runImport(t, w.adminId, w.a.menuServiceId, model));

    expect(result.report.blockers).toEqual([]);
    expect(result.report.source).toMatchObject({ groups: 1, items: 2 });
    expect(result.report.planned).toMatchObject({ sections: 1, articles: 1, skippedItems: 1 });
    expect(result.report.warnings).toContainEqual({ code: "item_name_empty", section: "Ručni unos" });
    expect(result.report.warnings).toContainEqual({
      code: "price_rounded",
      section: "Ručni unos",
      article: "Domaća kafa",
    });
    expect(result.report.warningCounts).toMatchObject({ item_name_empty: 1, price_rounded: 1 });
    expect(result.report.prices).toMatchObject({ rounded: 1, min: 150, max: 150 });
    expect(result.written).toMatchObject({ sections: 1, articles: 1, placements: 1 });

    const draft = await readDraft(t, w.a.menuServiceId, w.a.defaultPageId);
    expect(draft.articleCount).toBe(1);
    expect(draft.sections.map((section) => section.name)).toEqual(["Ručni unos"]);
    const section = sectionNamed(draft, "Ručni unos");
    expect(section.articles.map((article) => article.name)).toEqual(["Domaća kafa"]);
    expect(section.articles[0].basePriceRsd).toBe(150);
    expect((await draftStateOf(t, w.a.menuServiceId)).articleCount).toBe(1);
    expect((await pageOf(t, w.a.defaultPageId)).placementCount).toBe(1);
  });
});
