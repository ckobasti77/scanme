/// <reference types="vite/client" />

// ScanMe Menu V1 — K05: draft status, publish preview and Objavi (master §6.1).
// What these tests protect:
//   - publishing is ONE transaction: a failure in the middle leaves the live
//     version, its parts and the draft bookkeeping exactly as they were;
//   - errors block, warnings need the fingerprint of exactly those warnings;
//   - a draft that changed after the preview is refused (stale_draft) and a
//     draft equal to the live version is refused (no_changes);
//   - guests read only the published version: no draft edit reaches them until
//     Objavi, except live availability ("Privremeno nedostupno");
//   - roles (owner, manager, editor, admin publish; everyone else does not),
//     editing switched off by ScanMe, and the tenant boundary.
// Content is created through the real catalog mutations; guests are observed
// through convex/menuPublic.ts.

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { executePublish } from "./menuPublishing";
import schema from "./schema";
import { menuKonobarSr } from "../lib/i18n/sr/menu-konobar";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { permissionsOf, roleCan } from "../lib/menu/permissions";
import {
  SLUG_A,
  SLUG_B,
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
// Draft content through the real mutations
// -----------------------------------------------------------------------------

type Created = {
  articleId: Id<"menuArticles">;
  placementId: Id<"menuPlacements">;
  key: string;
};

async function quickAdd(
  t: T,
  userId: Id<"users">,
  sectionId: Id<"menuSections">,
  name: string,
  priceRsd?: number,
): Promise<Created> {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name,
    ...(priceRsd !== undefined ? { priceRsd } : {}),
  });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return { articleId: result.articleId, placementId: result.placementId, key: result.key };
}

/** One section with articles on a page, created by `ownerId`. */
async function buildMenu(
  t: T,
  ownerId: Id<"users">,
  pageId: Id<"menuPages">,
  sectionName: string,
  items: readonly (readonly [name: string, priceRsd: number])[],
) {
  const section = await as(t, ownerId).mutation(api.menuCatalog.addSection, {
    pageId,
    name: sectionName,
  });
  const articles: Created[] = [];
  for (const [name, priceRsd] of items) {
    articles.push(await quickAdd(t, ownerId, section.sectionId, name, priceRsd));
  }
  return { sectionId: section.sectionId, sectionKey: section.key, articles };
}

/** Tenant A: "Roštilj" with Pljeskavica 450, Ćevapi 600 and Kajmak 150. */
async function draftA(t: T, w: MenuWorldSeed) {
  const section = await buildMenu(t, w.ownerId, w.a.defaultPageId, "Roštilj", [
    ["Pljeskavica", 450],
    ["Ćevapi", 600],
    ["Kajmak", 150],
  ]);
  const [pljeskavica, cevapi, kajmak] = section.articles;
  return { sectionId: section.sectionId, sectionKey: section.sectionKey, pljeskavica, cevapi, kajmak };
}

/** Tenant B: "Jela" with Pasta karbonara 890. */
async function draftB(t: T, w: MenuWorldSeed) {
  const section = await buildMenu(t, w.otherOwnerId, w.b.defaultPageId, "Jela", [
    ["Pasta karbonara", 890],
  ]);
  return { sectionId: section.sectionId, pasta: section.articles[0] };
}

async function setPrice(
  t: T,
  userId: Id<"users">,
  articleId: Id<"menuArticles">,
  from: number | null,
  to: number | null,
) {
  const result = await as(t, userId).mutation(api.menuCatalog.setBasePrice, {
    articleId,
    expectedPriceRsd: from,
    priceRsd: to,
  });
  expect(result).toEqual({ ok: true });
}

async function deleteArticleFully(t: T, userId: Id<"users">, articleId: Id<"menuArticles">) {
  const first = await as(t, userId).mutation(api.menuArticleDetails.deleteArticle, { articleId });
  if (first.status !== "confirm") throw new Error("expected the confirmation step");
  const second = await as(t, userId).mutation(api.menuArticleDetails.deleteArticle, {
    articleId,
    confirmToken: first.confirmToken,
  });
  if (second.status !== "deleted") throw new Error("expected the article to be deleted");
}

/** An article that is on no page: it exists in the draft and nowhere else. */
async function unplacedArticle(
  t: T,
  userId: Id<"users">,
  sectionId: Id<"menuSections">,
  name: string,
): Promise<Created> {
  const created = await quickAdd(t, userId, sectionId, name, 300);
  await as(t, userId).mutation(api.menuCatalog.removePlacement, { placementId: created.placementId });
  return created;
}

// -----------------------------------------------------------------------------
// Calling publish
// -----------------------------------------------------------------------------

type PublishResult = FunctionReturnType<typeof api.menuPublishing.publish>;
type RefusalReason = "stale_draft" | "no_changes" | "validation_failed" | "confirmation_required";
type Refusal<R extends RefusalReason> = Extract<PublishResult, { ok: false; reason: R }>;

/** The refusal of the given reason, or a failure that prints what came back. */
function refusal<R extends RefusalReason>(result: PublishResult, reason: R): Refusal<R> {
  if (result.ok || result.reason !== reason) {
    throw new Error(`expected ${reason}, got ${JSON.stringify(result)}`);
  }
  return result as unknown as Refusal<R>;
}

async function previewOf(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const result = await as(t, userId).query(api.menuPublishing.publishPreview, { menuServiceId });
  if (!result) throw new Error("expected a preview");
  return result;
}

async function publishRaw(
  t: T,
  userId: Id<"users">,
  menuServiceId: Id<"menuServices">,
  expectedRevision: number,
  acknowledgedWarnings?: string,
) {
  return await as(t, userId).mutation(api.menuPublishing.publish, {
    menuServiceId,
    expectedRevision,
    ...(acknowledgedWarnings !== undefined ? { acknowledgedWarnings } : {}),
  });
}

/** What the editor does: preview, then publish the revision it reviewed. */
async function tryPublish(
  t: T,
  userId: Id<"users">,
  menuServiceId: Id<"menuServices">,
  acknowledgedWarnings?: string,
) {
  const preview = await previewOf(t, userId, menuServiceId);
  return await publishRaw(t, userId, menuServiceId, preview.revision, acknowledgedWarnings);
}

async function publishOk(
  t: T,
  w: MenuWorldSeed,
  userId: Id<"users"> = w.ownerId,
  menuServiceId: Id<"menuServices"> = w.a.menuServiceId,
) {
  const result = await tryPublish(t, userId, menuServiceId);
  if (!result.ok) throw new Error(`publish was refused: ${JSON.stringify(result)}`);
  return result;
}

async function publishedA(t: T, w: MenuWorldSeed) {
  const draft = await draftA(t, w);
  await publishOk(t, w);
  return draft;
}

async function statusOf(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  return await as(t, userId).query(api.menuPublishing.draftStatus, { menuServiceId });
}

// -----------------------------------------------------------------------------
// What guests see (convex/menuPublic.ts) and what is stored
// -----------------------------------------------------------------------------

type GuestArticle = { key: string; name: string; priceRsd: number | null };
type GuestMenu = {
  versionNumber: number;
  lang: string;
  sections: { key: string; name: string; articles: GuestArticle[] }[];
};

async function guestMenu(t: T, slug: string = SLUG_A, lang?: string): Promise<GuestMenu | null> {
  const result = await t.query(api.menuPublic.page, { slug, ...(lang ? { lang } : {}) });
  if (!result || result.kind !== "page") return null;
  return {
    versionNumber: result.versionNumber,
    lang: result.lang,
    sections: result.sections.map((section) => ({
      key: section.key,
      name: section.name,
      articles: section.articles.map((article) => ({
        key: article.key,
        name: article.name,
        priceRsd: article.priceRsd,
      })),
    })),
  };
}

function guestKeys(menu: GuestMenu | null): string[] {
  return menu?.sections.flatMap((section) => section.articles.map((article) => article.key)) ?? [];
}

function guestArticle(menu: GuestMenu | null, key: string): GuestArticle | undefined {
  return menu?.sections.flatMap((section) => section.articles).find((article) => article.key === key);
}

async function guestAvailability(t: T, menuServiceId: Id<"menuServices">) {
  return await t.query(api.menuPublic.availability, { menuServiceId });
}

async function serviceOf(t: T, menuServiceId: Id<"menuServices">) {
  const row = await t.run(async (ctx) => await ctx.db.get(menuServiceId));
  if (!row) throw new Error("menu service missing");
  return row;
}

async function draftStateOf(t: T, menuServiceId: Id<"menuServices">) {
  const row = await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
        .unique(),
  );
  if (!row) throw new Error("draft state missing");
  return row;
}

async function revisionOf(t: T, menuServiceId: Id<"menuServices">) {
  return (await draftStateOf(t, menuServiceId)).revision;
}

async function versionsOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuVersions")
        .withIndex("by_menuServiceId_and_number", (q) => q.eq("menuServiceId", menuServiceId))
        .collect(),
  );
}

async function partsOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("menuVersionParts").collect();
    return rows.filter((row) => row.menuServiceId === menuServiceId);
  });
}

async function auditOf(t: T, menuServiceId: Id<"menuServices">, action = "version.published") {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect();
    return rows.filter((row) => row.action === action);
  });
}

async function availabilityRows(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuAvailability")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
        .collect(),
  );
}

/** Everything a refused or failed publish must leave exactly as it was. */
async function footprint(t: T, menuServiceId: Id<"menuServices">) {
  const service = await serviceOf(t, menuServiceId);
  const state = await draftStateOf(t, menuServiceId);
  return {
    liveVersionId: service.liveVersionId ?? null,
    liveVersionNumber: service.liveVersionNumber ?? null,
    versionNumbers: (await versionsOf(t, menuServiceId)).map((row) => row.number),
    parts: (await partsOf(t, menuServiceId)).length,
    publishedRevision: state.publishedRevision ?? null,
    revision: state.revision,
    publishedAudits: (await auditOf(t, menuServiceId)).length,
  };
}

/** Runs executePublish inside t.run and throws after the version rows were written. */
async function publishFailingAfterParts(t: T, w: MenuWorldSeed) {
  const expectedRevision = await revisionOf(t, w.a.menuServiceId);
  await expect(
    t.run(async (ctx) => {
      const menuService = await ctx.db.get(w.a.menuServiceId);
      if (!menuService) throw new Error("missing menu service");
      return await executePublish(
        ctx,
        { menuService, userId: w.ownerId, actorKind: "user" },
        { expectedRevision },
        {
          afterPartsWritten: () => {
            throw new Error("injected failure");
          },
        },
      );
    }),
  ).rejects.toThrow(/injected failure/);
}

// =============================================================================
// 1. Atomicity
// =============================================================================

describe("publish — atomicity", () => {
  test("a failure after the parts were written changes nothing: live version, parts, draft and guests stay", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    const guestBefore = await guestMenu(t);
    expect(guestArticle(guestBefore, menu.pljeskavica.key)?.priceRsd).toBe(450);

    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 520);
    const before = await footprint(t, w.a.menuServiceId);
    expect(before.versionNumbers).toEqual([1]);

    await publishFailingAfterParts(t, w);

    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    const service = await serviceOf(t, w.a.menuServiceId);
    expect(service.liveVersionNumber).toBe(1);
    expect(await versionsOf(t, w.a.menuServiceId)).toHaveLength(1);
    expect(await guestMenu(t)).toEqual(guestBefore);
    expect(await statusOf(t, w.ownerId, w.a.menuServiceId)).toMatchObject({
      state: "dirty",
      hasUnpublishedChanges: true,
      liveVersionNumber: 1,
    });
  });

  test("after a failed attempt a normal publish succeeds as version 2 and shows the new price", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 520);
    await publishFailingAfterParts(t, w);

    const result = await publishOk(t, w);

    expect(result.versionNumber).toBe(2);
    const guest = await guestMenu(t);
    expect(guest?.versionNumber).toBe(2);
    expect(guestArticle(guest, menu.pljeskavica.key)?.priceRsd).toBe(520);
    expect((await versionsOf(t, w.a.menuServiceId)).map((row) => row.number)).toEqual([1, 2]);
    expect(await auditOf(t, w.a.menuServiceId)).toHaveLength(2);
  });

  test("a failure on the very first publication leaves no version and no public menu", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    const before = await footprint(t, w.a.menuServiceId);

    await publishFailingAfterParts(t, w);

    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    expect(before.versionNumbers).toEqual([]);
    expect(before.liveVersionId).toBeNull();
    expect(await guestMenu(t)).toBeNull();
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({ kind: "none" });
    expect(await statusOf(t, w.ownerId, w.a.menuServiceId)).toMatchObject({ state: "never_published" });
  });

  test("the version and its parts are written before the live pointer moves", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 520);
    const expectedRevision = await revisionOf(t, w.a.menuServiceId);

    const seen = { liveVersionNumber: -1, versionRows: -1, newVersionParts: -1 };
    await t.run(async (ctx) => {
      const menuService = await ctx.db.get(w.a.menuServiceId);
      if (!menuService) throw new Error("missing menu service");
      const result = await executePublish(
        ctx,
        { menuService, userId: w.ownerId, actorKind: "user" },
        { expectedRevision },
        {
          afterPartsWritten: async () => {
            const service = await ctx.db.get(w.a.menuServiceId);
            const versions = await ctx.db
              .query("menuVersions")
              .withIndex("by_menuServiceId_and_number", (q) => q.eq("menuServiceId", w.a.menuServiceId))
              .collect();
            const newest = versions[versions.length - 1];
            const parts = await ctx.db.query("menuVersionParts").collect();
            seen.liveVersionNumber = service?.liveVersionNumber ?? -1;
            seen.versionRows = versions.length;
            seen.newVersionParts = parts.filter((part) => part.versionId === newest._id).length;
          },
        },
      );
      expect(result.ok).toBe(true);
    });

    expect(seen.liveVersionNumber).toBe(1);
    expect(seen.versionRows).toBe(2);
    expect(seen.newVersionParts).toBeGreaterThan(0);
    expect((await serviceOf(t, w.a.menuServiceId)).liveVersionNumber).toBe(2);
  });
});

// =============================================================================
// 2. Errors block
// =============================================================================

describe("publish — validation errors", () => {
  test("a shown article without a price blocks publishing and changes nothing", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    const guestBefore = await guestMenu(t);
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, null);
    const before = await footprint(t, w.a.menuServiceId);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.ok).toBe(false);
    expect(preview.errors).toEqual([{ code: "price_missing", articleKey: menu.pljeskavica.key }]);

    const result = refusal(
      await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision),
      "validation_failed",
    );
    expect(result.errors).toEqual([{ code: "price_missing", articleKey: menu.pljeskavica.key }]);

    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    expect(await guestMenu(t)).toEqual(guestBefore);
    expect(await statusOf(t, w.ownerId, w.a.menuServiceId)).toMatchObject({ state: "dirty" });
  });

  test("an error on the first publication leaves no version and no public menu", async () => {
    const { t, w } = await setup();
    const section = await buildMenu(t, w.ownerId, w.a.defaultPageId, "Roštilj", [["Pljeskavica", 450]]);
    const noPrice = await quickAdd(t, w.ownerId, section.sectionId, "Ćevapi");
    const before = await footprint(t, w.a.menuServiceId);

    const result = refusal(await tryPublish(t, w.ownerId, w.a.menuServiceId), "validation_failed");

    expect(result.errors).toEqual([{ code: "price_missing", articleKey: noPrice.key }]);
    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    expect(before.versionNumbers).toEqual([]);
    expect(await guestMenu(t)).toBeNull();
  });

  test("an acknowledged warning does not let an error through", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    await unplacedArticle(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    await setPrice(t, w.ownerId, menu.cevapi.articleId, 600, null);
    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.errors).toHaveLength(1);
    expect(preview.warnings).toHaveLength(1);
    const before = await footprint(t, w.a.menuServiceId);

    const result = refusal(
      await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision, preview.fingerprint),
      "validation_failed",
    );

    expect(result.errors).toEqual([{ code: "price_missing", articleKey: menu.cevapi.key }]);
    expect(result.warnings).toEqual(preview.warnings);
    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
  });

  test("a shown combo without its own price is an error", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const combo = await as(t, w.ownerId).mutation(api.menuCombos.createCombo, {
      sectionId: menu.sectionId,
      name: "Roštilj meni",
      components: [
        { articleId: menu.pljeskavica.articleId, quantity: 1 },
        { articleId: menu.cevapi.articleId, quantity: 1 },
      ],
    });

    const result = refusal(await tryPublish(t, w.ownerId, w.a.menuServiceId), "validation_failed");

    expect(result.errors).toEqual([{ code: "price_missing", articleKey: combo.key }]);
    expect(await versionsOf(t, w.a.menuServiceId)).toHaveLength(0);
  });

  test("an article that is only a combo component needs neither a page nor a price", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const prilog = await unplacedArticle(t, w.ownerId, menu.sectionId, "Prilog");
    const combo = await as(t, w.ownerId).mutation(api.menuCombos.createCombo, {
      sectionId: menu.sectionId,
      name: "Roštilj meni",
      priceRsd: 500,
      components: [
        { articleId: prilog.articleId, quantity: 1 },
        { articleId: menu.pljeskavica.articleId, quantity: 1 },
      ],
    });
    await setPrice(t, w.ownerId, prilog.articleId, 300, null);
    await as(t, w.ownerId).mutation(api.menuCombos.resolvePriceCheck, {
      comboArticleId: combo.articleId,
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual([]);

    expect(await tryPublish(t, w.ownerId, w.a.menuServiceId)).toMatchObject({ ok: true });
    const guest = await guestMenu(t);
    expect(guestKeys(guest)).toEqual([
      menu.pljeskavica.key,
      menu.cevapi.key,
      menu.kajmak.key,
      combo.key,
    ]);
    expect(guestKeys(guest)).not.toContain(prilog.key);
  });

  test("a hidden incomplete article does not block and never reaches guests", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const incomplete = await quickAdd(t, w.ownerId, menu.sectionId, "Sok od zove");
    await as(t, w.ownerId).mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: incomplete.placementId,
      visibility: "hidden",
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.ok).toBe(true);
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual([]);

    const result = await tryPublish(t, w.ownerId, w.a.menuServiceId);
    expect(result).toMatchObject({ ok: true, versionNumber: 1 });
    const guest = await guestMenu(t);
    expect(guestKeys(guest)).toEqual([menu.pljeskavica.key, menu.cevapi.key, menu.kajmak.key]);
    expect(guestKeys(guest)).not.toContain(incomplete.key);
  });
});

// =============================================================================
// 3. Warnings need a conscious confirmation
// =============================================================================

describe("publish — warnings", () => {
  test("an unplaced article warns; publishing needs exactly the previewed fingerprint", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const unplaced = await unplacedArticle(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.ok).toBe(true);
    expect(preview.warnings).toEqual([{ code: "article_unplaced", articleKey: unplaced.key }]);
    const before = await footprint(t, w.a.menuServiceId);

    const missing = refusal(
      await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision),
      "confirmation_required",
    );
    expect(missing.fingerprint).toBe(preview.fingerprint);
    expect(missing.warnings).toEqual(preview.warnings);

    refusal(
      await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision, "not-the-fingerprint"),
      "confirmation_required",
    );
    refusal(
      await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision, ""),
      "confirmation_required",
    );
    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    expect(await guestMenu(t)).toBeNull();

    const result = await publishRaw(
      t,
      w.ownerId,
      w.a.menuServiceId,
      preview.revision,
      preview.fingerprint,
    );
    expect(result).toMatchObject({ ok: true, versionNumber: 1 });
    expect(guestKeys(await guestMenu(t))).not.toContain(unplaced.key);
    expect(await auditOf(t, w.a.menuServiceId)).toHaveLength(1);
  });

  test("an unplaced article without a price only warns, it does not block", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const noPrice = await quickAdd(t, w.ownerId, menu.sectionId, "Pita sa jabukama");
    await as(t, w.ownerId).mutation(api.menuCatalog.removePlacement, {
      placementId: noPrice.placementId,
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.ok).toBe(true);
    expect(preview.errors).toEqual([]);
    expect(preview.warnings).toEqual([{ code: "article_unplaced", articleKey: noPrice.key }]);
  });

  test("a new warning after the preview changes the fingerprint: the old one is refused", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    await unplacedArticle(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    const first = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(first.warnings).toHaveLength(1);

    await unplacedArticle(t, w.ownerId, menu.sectionId, "Gibanica");
    const second = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(second.warnings).toHaveLength(2);
    expect(second.fingerprint).not.toBe(first.fingerprint);
    const before = await footprint(t, w.a.menuServiceId);

    // A caller that reviewed the first preview is told the revision moved on…
    refusal(
      await publishRaw(t, w.ownerId, w.a.menuServiceId, first.revision, first.fingerprint),
      "stale_draft",
    );
    // …and one that took the new revision but kept the old fingerprint is asked again.
    const asked = refusal(
      await publishRaw(t, w.ownerId, w.a.menuServiceId, second.revision, first.fingerprint),
      "confirmation_required",
    );
    expect(asked.fingerprint).toBe(second.fingerprint);
    expect(asked.warnings).toHaveLength(2);
    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);

    const result = await publishRaw(
      t,
      w.ownerId,
      w.a.menuServiceId,
      second.revision,
      second.fingerprint,
    );
    expect(result).toMatchObject({ ok: true });
  });

  test("a warning that is fixed before publishing needs no confirmation any more", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const unplaced = await unplacedArticle(t, w.ownerId, menu.sectionId, "Pita sa sirom");
    refusal(await tryPublish(t, w.ownerId, w.a.menuServiceId), "confirmation_required");

    await as(t, w.ownerId).mutation(api.menuCatalog.addPlacement, {
      sectionId: menu.sectionId,
      articleId: unplaced.articleId,
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.warnings).toEqual([]);
    expect(await tryPublish(t, w.ownerId, w.a.menuServiceId)).toMatchObject({ ok: true });
    expect(guestKeys(await guestMenu(t))).toContain(unplaced.key);
  });

  test("a combo whose component price changed warns; confirming keeps the combo price", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const combo = await as(t, w.ownerId).mutation(api.menuCombos.createCombo, {
      sectionId: menu.sectionId,
      name: "Roštilj meni",
      priceRsd: 900,
      components: [
        { articleId: menu.pljeskavica.articleId, quantity: 1 },
        { articleId: menu.cevapi.articleId, quantity: 1 },
      ],
    });
    await publishOk(t, w);

    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 480);
    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.ok).toBe(true);
    expect(preview.warnings).toEqual([{ code: "combo_price_check", articleKey: combo.key }]);

    refusal(await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision), "confirmation_required");
    const result = await publishRaw(
      t,
      w.ownerId,
      w.a.menuServiceId,
      preview.revision,
      preview.fingerprint,
    );
    expect(result).toMatchObject({ ok: true, versionNumber: 2 });
    const guest = await guestMenu(t);
    expect(guestArticle(guest, menu.pljeskavica.key)?.priceRsd).toBe(480);
    expect(guestArticle(guest, combo.key)?.priceRsd).toBe(900);
  });

  test("deciding the combo price clears the warning: publishing needs no confirmation", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    const combo = await as(t, w.ownerId).mutation(api.menuCombos.createCombo, {
      sectionId: menu.sectionId,
      name: "Roštilj meni",
      priceRsd: 900,
      components: [{ articleId: menu.pljeskavica.articleId, quantity: 1 }],
    });
    await publishOk(t, w);
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 480);
    expect((await previewOf(t, w.ownerId, w.a.menuServiceId)).warnings).toHaveLength(1);

    await as(t, w.ownerId).mutation(api.menuCombos.resolvePriceCheck, {
      comboArticleId: combo.articleId,
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.warnings).toEqual([]);
    expect(await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision)).toMatchObject({
      ok: true,
      versionNumber: 2,
    });
  });
});

describe("publish — translations", () => {
  async function withEnglish() {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    await as(t, w.ownerId).mutation(api.menuSettings.setLanguages, {
      menuServiceId: w.a.menuServiceId,
      translations: ["en"],
    });
    return { t, w, menu };
  }

  test("a language without translations warns once per language with the number of texts", async () => {
    const { t, w, menu } = await withEnglish();

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    expect(preview.languages).toEqual(["sr", "en"]);
    expect(preview.warnings).toHaveLength(1);
    expect(preview.warnings[0]).toMatchObject({ code: "translation_missing", lang: "en", count: 4 });
    expect(preview.warnings[0].entityKeys).toEqual(
      expect.arrayContaining([
        menu.sectionKey,
        menu.pljeskavica.key,
        menu.cevapi.key,
        menu.kajmak.key,
      ]),
    );
    refusal(await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision), "confirmation_required");
    expect(await versionsOf(t, w.a.menuServiceId)).toHaveLength(0);
  });

  test("only confirmed translations count and are published; suggestions fall back to the source text", async () => {
    const { t, w, menu } = await withEnglish();
    await t.run(async (ctx) => {
      await ctx.db.patch(menu.sectionId, {
        translations: { en: { name: "Grill", status: "confirmed" } },
      });
      await ctx.db.patch(menu.pljeskavica.articleId, {
        translations: { en: { name: "Burger patty", status: "confirmed" } },
      });
      await ctx.db.patch(menu.kajmak.articleId, {
        translations: { en: { name: "Kaymak", status: "confirmed" } },
      });
      await ctx.db.patch(menu.cevapi.articleId, {
        translations: { en: { name: "Cevapi sausages", status: "suggested" } },
      });
    });

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.warnings).toHaveLength(1);
    expect(preview.warnings[0]).toMatchObject({
      code: "translation_missing",
      lang: "en",
      count: 1,
      entityKeys: [menu.cevapi.key],
    });

    const result = await publishRaw(
      t,
      w.ownerId,
      w.a.menuServiceId,
      preview.revision,
      preview.fingerprint,
    );
    expect(result).toMatchObject({ ok: true, versionNumber: 1 });

    const english = await guestMenu(t, SLUG_A, "en");
    expect(english?.lang).toBe("en");
    expect(english?.sections[0].name).toBe("Grill");
    expect(guestArticle(english, menu.pljeskavica.key)?.name).toBe("Burger patty");
    expect(guestArticle(english, menu.kajmak.key)?.name).toBe("Kaymak");
    expect(guestArticle(english, menu.cevapi.key)?.name).toBe("Ćevapi");
    const serbian = await guestMenu(t, SLUG_A);
    expect(serbian?.lang).toBe("sr");
    expect(serbian?.sections[0].name).toBe("Roštilj");
    expect(guestArticle(serbian, menu.pljeskavica.key)?.name).toBe("Pljeskavica");
  });

  test("a translation warning that grows (a new article) asks for a new confirmation", async () => {
    const { t, w, menu } = await withEnglish();
    const first = await previewOf(t, w.ownerId, w.a.menuServiceId);

    await quickAdd(t, w.ownerId, menu.sectionId, "Pomfrit", 200);
    const second = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(second.warnings[0]).toMatchObject({ code: "translation_missing", count: 5 });
    expect(second.fingerprint).not.toBe(first.fingerprint);

    const asked = refusal(
      await publishRaw(t, w.ownerId, w.a.menuServiceId, second.revision, first.fingerprint),
      "confirmation_required",
    );
    expect(asked.fingerprint).toBe(second.fingerprint);
    expect(await versionsOf(t, w.a.menuServiceId)).toHaveLength(0);
  });
});

// =============================================================================
// 4. A draft that changed after the preview is refused
// =============================================================================

describe("publish — newer changes", () => {
  // K33 B6: the owner (who publishes here) sees their own e-mail, never the
  // manager's: that one has no display name, so the neutral label stands in.
  test.each([
    ["owner", "ownerId", "vlasnik@example.com"],
    ["manager", "managerId", menuKonobarSr.zaglavlje.nalogBezImena],
  ] as const)(
    "an edit by the %s after the preview is refused as stale_draft with who edited",
    async (_label, who, shownName) => {
      const { t, w } = await setup();
      const menu = await publishedA(t, w);
      const guestBefore = await guestMenu(t);
      await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 520);
      const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

      await setPrice(t, w[who], menu.cevapi.articleId, 600, 650);
      const before = await footprint(t, w.a.menuServiceId);

      const result = refusal(
        await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision),
        "stale_draft",
      );

      expect(result.revision).toBe(preview.revision + 1);
      expect(result.lastEditBy).toEqual({ userId: w[who], name: shownName });
      expect(typeof result.lastEditAt).toBe("number");
      expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
      expect(await guestMenu(t)).toEqual(guestBefore);
      expect(await auditOf(t, w.a.menuServiceId)).toHaveLength(1);

      // After a new look at the draft the same person can publish.
      const again = await tryPublish(t, w.ownerId, w.a.menuServiceId);
      expect(again).toMatchObject({ ok: true, versionNumber: 2 });
      const guest = await guestMenu(t);
      expect(guestArticle(guest, menu.pljeskavica.key)?.priceRsd).toBe(520);
      expect(guestArticle(guest, menu.cevapi.key)?.priceRsd).toBe(650);
    },
  );

  test("a revision that is not the current one in either direction is stale", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    const current = await revisionOf(t, w.a.menuServiceId);

    for (const expectedRevision of [current - 1, current + 1, current + 10]) {
      const result = refusal(
        await publishRaw(t, w.ownerId, w.a.menuServiceId, expectedRevision),
        "stale_draft",
      );
      expect(result.revision).toBe(current);
    }
    expect(await versionsOf(t, w.a.menuServiceId)).toHaveLength(0);
    expect(await publishRaw(t, w.ownerId, w.a.menuServiceId, current)).toMatchObject({ ok: true });
  });
});

// =============================================================================
// 5. Nothing to publish
// =============================================================================

describe("publish — no changes", () => {
  test("publishing again without an edit is refused and writes nothing", async () => {
    const { t, w } = await setup();
    await publishedA(t, w);
    const before = await footprint(t, w.a.menuServiceId);
    expect(before.versionNumbers).toEqual([1]);
    const revision = await revisionOf(t, w.a.menuServiceId);

    const result = refusal(await tryPublish(t, w.ownerId, w.a.menuServiceId), "no_changes");

    expect(result.revision).toBe(revision);
    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    expect(await versionsOf(t, w.a.menuServiceId)).toHaveLength(1);
    expect((await guestMenu(t))?.versionNumber).toBe(1);
  });

  test("a double click with the same revision publishes once", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    const revision = await revisionOf(t, w.a.menuServiceId);

    const first = await publishRaw(t, w.ownerId, w.a.menuServiceId, revision);
    const second = await publishRaw(t, w.ownerId, w.a.menuServiceId, revision);

    expect(first).toMatchObject({ ok: true, versionNumber: 1 });
    expect(refusal(second, "no_changes").revision).toBe(revision);
    expect(await versionsOf(t, w.a.menuServiceId)).toHaveLength(1);
    expect(await auditOf(t, w.a.menuServiceId)).toHaveLength(1);
  });

  test("a stale revision is reported before the draft is judged equal to the live version", async () => {
    const { t, w } = await setup();
    await publishedA(t, w);
    const revision = await revisionOf(t, w.a.menuServiceId);

    refusal(await publishRaw(t, w.ownerId, w.a.menuServiceId, revision - 1), "stale_draft");
  });

  test("after another edit publishing works again and numbers the next version", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    refusal(await tryPublish(t, w.ownerId, w.a.menuServiceId), "no_changes");

    await setPrice(t, w.ownerId, menu.kajmak.articleId, 150, 170);

    expect(await tryPublish(t, w.ownerId, w.a.menuServiceId)).toMatchObject({
      ok: true,
      versionNumber: 2,
    });
    refusal(await tryPublish(t, w.ownerId, w.a.menuServiceId), "no_changes");
    expect(await versionsOf(t, w.a.menuServiceId)).toHaveLength(2);
  });
});

// =============================================================================
// 6. The draft does not change the public menu before Objavi
// =============================================================================

type PublishedWorld = Awaited<ReturnType<typeof publishedWorld>>;

async function publishedWorld() {
  const { t, w } = await setup();
  const menu = await publishedA(t, w);
  return { t, w, menu };
}

function mapArticles(
  menu: GuestMenu,
  change: (article: GuestArticle) => GuestArticle | null,
): GuestMenu {
  return {
    ...menu,
    versionNumber: menu.versionNumber + 1,
    sections: menu.sections.map((section) => ({
      ...section,
      articles: section.articles.flatMap((article) => {
        const next = change(article);
        return next ? [next] : [];
      }),
    })),
  };
}

const LIVE_EDITS: {
  label: string;
  edit: (world: PublishedWorld) => Promise<void>;
  after: (world: PublishedWorld, before: GuestMenu) => GuestMenu;
  /** The one warning this edit causes (the person must confirm it to publish). */
  warns?: "article_unplaced";
}[] = [
  {
    label: "changing a price",
    edit: async ({ t, w, menu }) => {
      await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 520);
    },
    after: ({ menu }, before) =>
      mapArticles(before, (article) =>
        article.key === menu.pljeskavica.key ? { ...article, priceRsd: 520 } : article,
      ),
  },
  {
    label: "renaming an article",
    edit: async ({ t, w, menu }) => {
      const result = await as(t, w.ownerId).mutation(api.menuCatalog.updateArticleFields, {
        articleId: menu.cevapi.articleId,
        expected: { name: "Ćevapi" },
        patch: { name: "Ćevapi u lepinji" },
      });
      expect(result).toEqual({ ok: true });
    },
    after: ({ menu }, before) =>
      mapArticles(before, (article) =>
        article.key === menu.cevapi.key ? { ...article, name: "Ćevapi u lepinji" } : article,
      ),
  },
  {
    label: "renaming a section",
    edit: async ({ t, w, menu }) => {
      const result = await as(t, w.ownerId).mutation(api.menuCatalog.renameSection, {
        sectionId: menu.sectionId,
        name: "Sa roštilja",
        expectedName: "Roštilj",
      });
      expect(result).toEqual({ ok: true });
    },
    after: (_world, before) => ({
      ...before,
      versionNumber: before.versionNumber + 1,
      sections: before.sections.map((section) => ({ ...section, name: "Sa roštilja" })),
    }),
  },
  {
    label: "hiding an article",
    edit: async ({ t, w, menu }) => {
      await as(t, w.ownerId).mutation(api.menuCatalog.setPlacementVisibility, {
        placementId: menu.kajmak.placementId,
        visibility: "hidden",
      });
    },
    after: ({ menu }, before) =>
      mapArticles(before, (article) => (article.key === menu.kajmak.key ? null : article)),
  },
  {
    label: "removing an article from the page",
    // The article stays in the draft but on no page, so publishing warns about it.
    warns: "article_unplaced",
    edit: async ({ t, w, menu }) => {
      await as(t, w.ownerId).mutation(api.menuCatalog.removePlacement, {
        placementId: menu.cevapi.placementId,
      });
    },
    after: ({ menu }, before) =>
      mapArticles(before, (article) => (article.key === menu.cevapi.key ? null : article)),
  },
  {
    label: "deleting an article",
    edit: async ({ t, w, menu }) => {
      await deleteArticleFully(t, w.ownerId, menu.pljeskavica.articleId);
    },
    after: ({ menu }, before) =>
      mapArticles(before, (article) => (article.key === menu.pljeskavica.key ? null : article)),
  },
];

describe("publish — the draft does not reach guests before Objavi", () => {
  test.each(LIVE_EDITS)(
    "$label stays out of the guest menu until the next publish",
    async ({ edit, after, warns }) => {
      const world = await publishedWorld();
      const { t, w } = world;
      const before = await guestMenu(t);
      if (!before) throw new Error("expected a published menu");
      expect(before.versionNumber).toBe(1);

      await edit(world);

      expect(await guestMenu(t)).toEqual(before);
      expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({
        kind: "new",
        versionNumber: 1,
      });
      expect(await statusOf(t, w.ownerId, w.a.menuServiceId)).toMatchObject({
        state: "dirty",
        hasUnpublishedChanges: true,
        liveVersionNumber: 1,
      });

      const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
      expect(preview.warnings.map((warning) => warning.code)).toEqual(warns ? [warns] : []);
      const published = await publishRaw(
        t,
        w.ownerId,
        w.a.menuServiceId,
        preview.revision,
        warns ? preview.fingerprint : undefined,
      );
      expect(published).toMatchObject({ ok: true, versionNumber: 2 });

      expect(await guestMenu(t)).toEqual(after(world, before));
      expect(await statusOf(t, w.ownerId, w.a.menuServiceId)).toMatchObject({
        state: "clean",
        hasUnpublishedChanges: false,
        liveVersionNumber: 2,
      });
    },
  );

  test("a new section and a new article stay out until the next publish", async () => {
    const { t, w } = await publishedWorld();
    const before = await guestMenu(t);

    const section = await as(t, w.ownerId).mutation(api.menuCatalog.addSection, {
      pageId: w.a.defaultPageId,
      name: "Deserti",
    });
    const palacinke = await quickAdd(t, w.ownerId, section.sectionId, "Palačinke", 280);

    expect(await guestMenu(t)).toEqual(before);
    expect(guestKeys(await guestMenu(t))).not.toContain(palacinke.key);

    await publishOk(t, w);
    const after = await guestMenu(t);
    expect(after?.sections.map((row) => row.name)).toEqual(["Roštilj", "Deserti"]);
    expect(guestArticle(after, palacinke.key)).toEqual({ key: palacinke.key, name: "Palačinke", priceRsd: 280 });
  });

  test("draftStatus goes never_published, clean, dirty, clean", async () => {
    const { t, w } = await setup();
    const fresh = await statusOf(t, w.ownerId, w.a.menuServiceId);
    expect(fresh).toMatchObject({
      state: "never_published",
      hasUnpublishedChanges: true,
      revision: 0,
      publishedRevision: null,
      liveVersionNumber: null,
    });

    const menu = await draftA(t, w);
    const drafted = await statusOf(t, w.ownerId, w.a.menuServiceId);
    expect(drafted).toMatchObject({ state: "never_published", hasUnpublishedChanges: true });
    expect(drafted?.revision).toBeGreaterThan(0);
    expect(await guestMenu(t)).toBeNull();

    await publishOk(t, w);
    const published = await statusOf(t, w.ownerId, w.a.menuServiceId);
    expect(published).toMatchObject({
      state: "clean",
      hasUnpublishedChanges: false,
      liveVersionNumber: 1,
      revision: drafted?.revision,
      publishedRevision: drafted?.revision,
    });
    expect(typeof published?.livePublishedAt).toBe("number");

    await setPrice(t, w.managerId, menu.pljeskavica.articleId, 450, 480);
    const dirty = await statusOf(t, w.ownerId, w.a.menuServiceId);
    expect(dirty).toMatchObject({
      state: "dirty",
      hasUnpublishedChanges: true,
      revision: (drafted?.revision ?? 0) + 1,
      publishedRevision: drafted?.revision,
      liveVersionNumber: 1,
    });
    // K33 B6: the manager's e-mail is not shown to the owner (no display name: the neutral label).
    expect(dirty?.lastEditBy).toEqual({
      userId: w.managerId,
      name: menuKonobarSr.zaglavlje.nalogBezImena,
      isMe: false,
    });
    expect((await statusOf(t, w.managerId, w.a.menuServiceId))?.lastEditBy?.isMe).toBe(true);

    await publishOk(t, w);
    expect(await statusOf(t, w.ownerId, w.a.menuServiceId)).toMatchObject({
      state: "clean",
      hasUnpublishedChanges: false,
      liveVersionNumber: 2,
    });
  });

  test("a venue with a draft but no version is not public", async () => {
    const { t, w } = await setup();
    await draftA(t, w);

    expect(await guestMenu(t)).toBeNull();
    expect(await t.query(api.menuPublic.entry, { slug: SLUG_A })).toEqual({ kind: "none" });
    expect(await guestAvailability(t, w.a.menuServiceId)).toBeNull();
  });
});

// =============================================================================
// 7. Live availability is outside the versions
// =============================================================================

describe("publish — live availability", () => {
  test("marking unavailable is live at once, publishes nothing else and moves neither version nor revision", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    expect(await guestAvailability(t, w.a.menuServiceId)).toEqual({ articleKeys: [] });
    await setPrice(t, w.ownerId, menu.cevapi.articleId, 600, 650);
    const guestBefore = await guestMenu(t);
    const revisionBefore = await revisionOf(t, w.a.menuServiceId);

    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: menu.pljeskavica.articleId,
      available: false,
    });

    expect(await guestAvailability(t, w.a.menuServiceId)).toEqual({
      articleKeys: [menu.pljeskavica.key],
    });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revisionBefore);
    expect(await versionsOf(t, w.a.menuServiceId)).toHaveLength(1);
    expect((await serviceOf(t, w.a.menuServiceId)).liveVersionNumber).toBe(1);
    expect(await guestMenu(t)).toEqual(guestBefore);
    expect(guestArticle(await guestMenu(t), menu.cevapi.key)?.priceRsd).toBe(600);
    expect(await statusOf(t, w.ownerId, w.a.menuServiceId)).toMatchObject({
      state: "dirty",
      revision: revisionBefore,
      liveVersionNumber: 1,
    });

    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: menu.pljeskavica.articleId,
      available: true,
    });
    expect(await guestAvailability(t, w.a.menuServiceId)).toEqual({ articleKeys: [] });
  });

  test("toggling availability alone leaves the draft clean, so publishing finds no changes", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);

    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: menu.kajmak.articleId,
      available: false,
    });

    expect(await statusOf(t, w.ownerId, w.a.menuServiceId)).toMatchObject({ state: "clean" });
    refusal(await tryPublish(t, w.ownerId, w.a.menuServiceId), "no_changes");
    expect(await guestAvailability(t, w.a.menuServiceId)).toEqual({ articleKeys: [menu.kajmak.key] });
  });

  test("an unavailable article stays unavailable through the next publish", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: menu.kajmak.articleId,
      available: false,
    });
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 480);

    await publishOk(t, w);

    expect(await guestAvailability(t, w.a.menuServiceId)).toEqual({ articleKeys: [menu.kajmak.key] });
    expect(await availabilityRows(t, w.a.menuServiceId)).toHaveLength(1);
  });

  test("deleting an unavailable article keeps its availability row until the next publish deletes it", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: menu.kajmak.articleId,
      available: false,
    });

    await deleteArticleFully(t, w.ownerId, menu.kajmak.articleId);

    // The live version still shows the article, so it is still marked unavailable.
    expect(await availabilityRows(t, w.a.menuServiceId)).toHaveLength(1);
    expect(await guestAvailability(t, w.a.menuServiceId)).toEqual({ articleKeys: [menu.kajmak.key] });
    expect(guestKeys(await guestMenu(t))).toContain(menu.kajmak.key);

    await publishOk(t, w);

    expect(await availabilityRows(t, w.a.menuServiceId)).toHaveLength(0);
    expect(await guestAvailability(t, w.a.menuServiceId)).toEqual({ articleKeys: [] });
    expect(guestKeys(await guestMenu(t))).not.toContain(menu.kajmak.key);
  });

  test("only rows of articles gone from the draft are deleted: a hidden unavailable article keeps its row", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: menu.kajmak.articleId,
      available: false,
    });
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: menu.cevapi.articleId,
      available: false,
    });
    await as(t, w.ownerId).mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: menu.kajmak.placementId,
      visibility: "hidden",
    });
    await deleteArticleFully(t, w.ownerId, menu.cevapi.articleId);

    await publishOk(t, w);

    expect(await guestAvailability(t, w.a.menuServiceId)).toEqual({ articleKeys: [menu.kajmak.key] });
    expect(guestKeys(await guestMenu(t))).not.toContain(menu.kajmak.key);
  });
});

// =============================================================================
// 8. Roles
// =============================================================================

describe("publish — roles", () => {
  test.each([
    ["owner", "ownerId", "user"],
    ["manager", "managerId", "user"],
    ["editor", "editorId", "user"],
    ["admin", "adminId", "admin"],
  ] as const)("the %s can preview and publish", async (_label, who, actorKind) => {
    const { t, w } = await setup();
    await draftA(t, w);

    const preview = await previewOf(t, w[who], w.a.menuServiceId);
    expect(preview.canPublish).toBe(true);
    expect(await statusOf(t, w[who], w.a.menuServiceId)).toMatchObject({ state: "never_published" });

    const result = await tryPublish(t, w[who], w.a.menuServiceId);

    expect(result).toMatchObject({ ok: true, versionNumber: 1 });
    const [version] = await versionsOf(t, w.a.menuServiceId);
    expect(version).toMatchObject({ publishedByUserId: w[who], actorKind });
    const [audit] = await auditOf(t, w.a.menuServiceId);
    expect(audit).toMatchObject({ actorUserId: w[who], actorKind });
    expect(guestKeys(await guestMenu(t))).toHaveLength(3);
  });

  test.each(["financeId", "viewOnlyId", "outsiderId"] as const)(
    "%s has no Menu role: publish is not_found, preview and status are null, nothing is written",
    async (who) => {
      const { t, w } = await setup();
      await draftA(t, w);
      const before = await footprint(t, w.a.menuServiceId);

      expect(
        await codeOf(
          publishRaw(t, w[who], w.a.menuServiceId, await revisionOf(t, w.a.menuServiceId)),
        ),
      ).toBe(MENU_ERROR.notFound);
      expect(
        await as(t, w[who]).query(api.menuPublishing.publishPreview, {
          menuServiceId: w.a.menuServiceId,
        }),
      ).toBeNull();
      expect(await statusOf(t, w[who], w.a.menuServiceId)).toBeNull();
      expect(
        await as(t, w[who]).query(api.menuPublishing.listVersions, { menuServiceId: w.a.menuServiceId }),
      ).toBeNull();

      expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    },
  );

  test.each(["removed", "invited"] as const)(
    "an editor whose membership is %s cannot publish",
    async (status) => {
      const { t, w } = await setup();
      await draftA(t, w);
      await t.run(async (ctx) => {
        const row = await ctx.db
          .query("menuMembers")
          .withIndex("by_menuServiceId_and_userId", (q) =>
            q.eq("menuServiceId", w.a.menuServiceId).eq("userId", w.editorId),
          )
          .unique();
        if (!row) throw new Error("editor membership missing");
        await ctx.db.patch(row._id, { status });
      });
      const before = await footprint(t, w.a.menuServiceId);

      expect(
        await codeOf(
          publishRaw(t, w.editorId, w.a.menuServiceId, await revisionOf(t, w.a.menuServiceId)),
        ),
      ).toBe(MENU_ERROR.notFound);
      expect(
        await as(t, w.editorId).query(api.menuPublishing.publishPreview, {
          menuServiceId: w.a.menuServiceId,
        }),
      ).toBeNull();
      expect(await statusOf(t, w.editorId, w.a.menuServiceId)).toBeNull();
      expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    },
  );

  test("staff (PIN) has no publish permission", () => {
    expect(roleCan("staff", "menu.publish")).toBe(false);
    expect(roleCan("staff", "menu.edit")).toBe(false);
    expect(roleCan("staff", "menu.read")).toBe(false);
    expect(permissionsOf("staff")).toEqual(["waiter.work"]);
  });

  test("publishing needs a signed-in account user", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    const before = await footprint(t, w.a.menuServiceId);

    expect(
      await codeOf(
        t.mutation(api.menuPublishing.publish, {
          menuServiceId: w.a.menuServiceId,
          expectedRevision: await revisionOf(t, w.a.menuServiceId),
        }),
      ),
    ).toBe(MENU_ERROR.unauthenticated);
    expect(
      await t.query(api.menuPublishing.publishPreview, { menuServiceId: w.a.menuServiceId }),
    ).toBeNull();
    expect(await t.query(api.menuPublishing.draftStatus, { menuServiceId: w.a.menuServiceId })).toBeNull();
    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
  });

  test.each(["ownerId", "managerId", "editorId"] as const)(
    "with client editing switched off the %s cannot publish, but the admin still can",
    async (who) => {
      const { t, w } = await setup();
      await draftA(t, w);
      await t.run(async (ctx) => {
        await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
      });
      const before = await footprint(t, w.a.menuServiceId);

      expect(
        await codeOf(
          publishRaw(t, w[who], w.a.menuServiceId, await revisionOf(t, w.a.menuServiceId)),
        ),
      ).toBe(MENU_ERROR.editingDisabled);
      expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
      expect((await previewOf(t, w[who], w.a.menuServiceId)).canPublish).toBe(false);

      const preview = await previewOf(t, w.adminId, w.a.menuServiceId);
      expect(preview.canPublish).toBe(true);
      expect(await publishRaw(t, w.adminId, w.a.menuServiceId, preview.revision)).toMatchObject({
        ok: true,
        versionNumber: 1,
      });
    },
  );

  test("an inactive Menu profile stops the owner", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });
    const before = await footprint(t, w.a.menuServiceId);

    expect(
      await codeOf(
        publishRaw(t, w.ownerId, w.a.menuServiceId, await revisionOf(t, w.a.menuServiceId)),
      ),
    ).toBe(MENU_ERROR.serviceInactive);
    expect(
      await as(t, w.ownerId).query(api.menuPublishing.publishPreview, {
        menuServiceId: w.a.menuServiceId,
      }),
    ).toBeNull();
    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
  });
});

// =============================================================================
// 9. Tenant boundary
// =============================================================================

describe("publish — tenant isolation", () => {
  test("another venue's owner cannot publish, preview or read the status of this menu", async () => {
    const { t, w } = await setup();
    const menu = await draftA(t, w);
    await publishOk(t, w);
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 520);
    const revision = await revisionOf(t, w.a.menuServiceId);
    const before = await footprint(t, w.a.menuServiceId);
    const guestBefore = await guestMenu(t);

    expect(
      await codeOf(publishRaw(t, w.otherOwnerId, w.a.menuServiceId, revision)),
    ).toBe(MENU_ERROR.notFound);
    expect(
      await as(t, w.otherOwnerId).query(api.menuPublishing.publishPreview, {
        menuServiceId: w.a.menuServiceId,
      }),
    ).toBeNull();
    expect(await statusOf(t, w.otherOwnerId, w.a.menuServiceId)).toBeNull();
    expect(
      await as(t, w.otherOwnerId).query(api.menuPublishing.listVersions, {
        menuServiceId: w.a.menuServiceId,
      }),
    ).toBeNull();

    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    expect(await guestMenu(t)).toEqual(guestBefore);
  });

  test("this venue's owner cannot publish another venue's menu", async () => {
    const { t, w } = await setup();
    await draftB(t, w);
    const revision = await revisionOf(t, w.b.menuServiceId);
    const before = await footprint(t, w.b.menuServiceId);

    expect(await codeOf(publishRaw(t, w.ownerId, w.b.menuServiceId, revision))).toBe(
      MENU_ERROR.notFound,
    );

    expect(await footprint(t, w.b.menuServiceId)).toEqual(before);
    expect(await guestMenu(t, SLUG_B)).toBeNull();
  });

  test("each venue's guests see only that venue's articles", async () => {
    const { t, w } = await setup();
    const a = await draftA(t, w);
    const b = await draftB(t, w);

    await publishOk(t, w);
    expect(await guestMenu(t, SLUG_B)).toBeNull();
    expect(await guestAvailability(t, w.b.menuServiceId)).toBeNull();

    await publishOk(t, w, w.otherOwnerId, w.b.menuServiceId);
    const guestA = await guestMenu(t, SLUG_A);
    const guestB = await guestMenu(t, SLUG_B);

    expect(guestKeys(guestA)).toEqual([a.pljeskavica.key, a.cevapi.key, a.kajmak.key]);
    expect(guestKeys(guestB)).toEqual([b.pasta.key]);
    expect(guestArticle(guestB, b.pasta.key)).toEqual({
      key: b.pasta.key,
      name: "Pasta karbonara",
      priceRsd: 890,
    });
    // Both menus start at version 1: numbers are per venue.
    expect(guestA?.versionNumber).toBe(1);
    expect(guestB?.versionNumber).toBe(1);
  });

  test("publishing one venue does not change the other venue", async () => {
    const { t, w } = await setup();
    const a = await draftA(t, w);
    await draftB(t, w);
    await publishOk(t, w);
    await publishOk(t, w, w.otherOwnerId, w.b.menuServiceId);
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: a.kajmak.articleId,
      available: false,
    });
    const bBefore = await footprint(t, w.b.menuServiceId);
    const guestBBefore = await guestMenu(t, SLUG_B);

    await setPrice(t, w.ownerId, a.pljeskavica.articleId, 450, 520);
    expect(await publishOk(t, w)).toMatchObject({ versionNumber: 2 });

    expect(await footprint(t, w.b.menuServiceId)).toEqual(bBefore);
    expect(await guestMenu(t, SLUG_B)).toEqual(guestBBefore);
    expect(await guestAvailability(t, w.b.menuServiceId)).toEqual({ articleKeys: [] });
    expect(await guestAvailability(t, w.a.menuServiceId)).toEqual({ articleKeys: [a.kajmak.key] });
  });

  test("a version's parts belong to its own venue", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    await draftB(t, w);
    await publishOk(t, w);
    await publishOk(t, w, w.otherOwnerId, w.b.menuServiceId);

    const [versionA] = await versionsOf(t, w.a.menuServiceId);
    const [versionB] = await versionsOf(t, w.b.menuServiceId);
    const partsA = await partsOf(t, w.a.menuServiceId);
    const partsB = await partsOf(t, w.b.menuServiceId);

    expect(partsA.length).toBeGreaterThan(0);
    expect(partsB.length).toBeGreaterThan(0);
    expect(partsA.every((part) => part.versionId === versionA._id)).toBe(true);
    expect(partsB.every((part) => part.versionId === versionB._id)).toBe(true);
    expect(partsA.some((part) => part.data.includes("Pasta karbonara"))).toBe(false);
    expect(partsB.some((part) => part.data.includes("Pljeskavica"))).toBe(false);
  });
});

// =============================================================================
// 10. What a version records
// =============================================================================

describe("publish — the version and its audit trail", () => {
  test("the first version records who published, the draft revision, languages and the summary", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    const revision = await revisionOf(t, w.a.menuServiceId);

    const result = await publishOk(t, w, w.managerId);

    expect(result).toMatchObject({ ok: true, versionNumber: 1, revision });
    expect(result.summary).toMatchObject({ changedPrices: 0, newArticles: 3, removedArticles: 0 });
    const [version] = await versionsOf(t, w.a.menuServiceId);
    expect(version).toMatchObject({
      number: 1,
      publishedByUserId: w.managerId,
      actorKind: "user",
      draftRevision: revision,
      languages: ["sr"],
      pageCount: 1,
      articleCount: 3,
      summary: {
        changedPrices: 0,
        newArticles: 3,
        removedArticles: 0,
        structural: { hidden: 0, removedFromPage: 0, deleted: 0, reordered: 0 },
      },
    });
    expect(version.restoredFromNumber).toBeUndefined();
    expect(version.retiredAt).toBeUndefined();
    expect(version.bytes).toBeGreaterThan(0);
    expect(version.contentHash).not.toBe("");
    expect(version.partCount).toBe((await partsOf(t, w.a.menuServiceId)).length);
    const service = await serviceOf(t, w.a.menuServiceId);
    expect(service.liveVersionId).toBe(version._id);
    expect(service.liveVersionNumber).toBe(1);
  });

  test("a price change is counted in the summary of the next version", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 520);
    const revision = await revisionOf(t, w.a.menuServiceId);
    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    expect(preview.summary).toMatchObject({
      changedPrices: 1,
      newArticles: 0,
      removedArticles: 0,
      priceChanges: [{ articleKey: menu.pljeskavica.key, name: "Pljeskavica", before: 450, after: 520 }],
    });

    const result = await publishOk(t, w);

    expect(result.versionNumber).toBe(2);
    const versions = await versionsOf(t, w.a.menuServiceId);
    expect(versions.map((row) => row.number)).toEqual([1, 2]);
    expect(versions[1]).toMatchObject({
      publishedByUserId: w.ownerId,
      draftRevision: revision,
      languages: ["sr"],
      summary: {
        changedPrices: 1,
        newArticles: 0,
        removedArticles: 0,
        structural: { hidden: 0, removedFromPage: 0, deleted: 0, reordered: 0 },
      },
    });
    expect(versions[1].contentHash).not.toBe(versions[0].contentHash);
    expect(versions[1].partCount).toBe(
      (await partsOf(t, w.a.menuServiceId)).filter((part) => part.versionId === versions[1]._id).length,
    );
    // The previous version stays intact: guests can be moved back to it, parts included.
    expect(
      (await partsOf(t, w.a.menuServiceId)).filter((part) => part.versionId === versions[0]._id),
    ).toHaveLength(versions[0].partCount);
  });

  test("hidden, removed and deleted articles are counted as structural changes", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await as(t, w.ownerId).mutation(api.menuCatalog.setPlacementVisibility, {
      placementId: menu.kajmak.placementId,
      visibility: "hidden",
    });
    await as(t, w.ownerId).mutation(api.menuCatalog.removePlacement, {
      placementId: menu.cevapi.placementId,
    });
    await deleteArticleFully(t, w.ownerId, menu.pljeskavica.articleId);

    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);
    // The removed-from-page article is now in no section: it only warns.
    expect(preview.warnings).toEqual([{ code: "article_unplaced", articleKey: menu.cevapi.key }]);
    const result = await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision, preview.fingerprint);

    expect(result).toMatchObject({ ok: true, versionNumber: 2 });
    const [, second] = await versionsOf(t, w.a.menuServiceId);
    expect(second.summary).toMatchObject({
      changedPrices: 0,
      newArticles: 0,
      removedArticles: 3,
      structural: { hidden: 1, removedFromPage: 1, deleted: 1 },
    });
    expect(second.articleCount).toBe(0);
  });

  test("the languages of the version are the source and the confirmed-plan translations", async () => {
    const { t, w } = await setup();
    await draftA(t, w);
    await as(t, w.ownerId).mutation(api.menuSettings.setLanguages, {
      menuServiceId: w.a.menuServiceId,
      translations: ["en"],
    });
    const preview = await previewOf(t, w.ownerId, w.a.menuServiceId);

    const result = await publishRaw(t, w.ownerId, w.a.menuServiceId, preview.revision, preview.fingerprint);

    expect(result).toMatchObject({ ok: true });
    const [version] = await versionsOf(t, w.a.menuServiceId);
    expect(version.languages).toEqual(["sr", "en"]);
    expect((await guestMenu(t, SLUG_A, "en"))?.lang).toBe("en");
    // A language the version does not carry falls back to the source language.
    expect((await guestMenu(t, SLUG_A, "de"))?.lang).toBe("sr");
    const [audit] = await auditOf(t, w.a.menuServiceId);
    expect(audit.details).toMatchObject({ warnings: 1 });
  });

  test("a successful publish writes one version.published audit row with the counts", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, 520);
    const revision = await revisionOf(t, w.a.menuServiceId);

    await publishOk(t, w, w.adminId);

    const rows = await auditOf(t, w.a.menuServiceId);
    expect(rows).toHaveLength(2);
    const [first, second] = rows;
    expect(first).toMatchObject({
      action: "version.published",
      entityType: "menuVersions",
      entityKey: "1",
      actorKind: "user",
      actorUserId: w.ownerId,
    });
    expect(second).toMatchObject({
      action: "version.published",
      entityType: "menuVersions",
      entityKey: "2",
      actorKind: "admin",
      actorUserId: w.adminId,
      details: {
        number: 2,
        draftRevision: revision,
        changedPrices: 1,
        newArticles: 0,
        removedArticles: 0,
        warnings: 0,
      },
    });
  });

  test("listVersions shows the newest first with the live one marked and who published", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await setPrice(t, w.managerId, menu.pljeskavica.articleId, 450, 520);
    await publishOk(t, w, w.managerId);

    const listing = await as(t, w.ownerId).query(api.menuPublishing.listVersions, {
      menuServiceId: w.a.menuServiceId,
    });

    expect(listing?.liveVersionNumber).toBe(2);
    expect(listing?.versions.map((row) => [row.number, row.isLive])).toEqual([
      [2, true],
      [1, false],
    ]);
    expect(listing?.versions[0].publishedBy).toEqual({
      userId: w.managerId,
      name: menuKonobarSr.zaglavlje.nalogBezImena,
    });
    expect(listing?.versions[0].summary).toMatchObject({ changedPrices: 1 });
    expect(listing?.versions[1].publishedBy.userId).toBe(w.ownerId);
  });

  test("a refused publish writes no version and no audit row", async () => {
    const { t, w } = await setup();
    const menu = await publishedA(t, w);
    await setPrice(t, w.ownerId, menu.pljeskavica.articleId, 450, null);
    const before = await footprint(t, w.a.menuServiceId);

    refusal(await tryPublish(t, w.ownerId, w.a.menuServiceId), "validation_failed");
    refusal(
      await publishRaw(t, w.ownerId, w.a.menuServiceId, (await revisionOf(t, w.a.menuServiceId)) - 1),
      "stale_draft",
    );

    expect(await footprint(t, w.a.menuServiceId)).toEqual(before);
    expect(await auditOf(t, w.a.menuServiceId)).toHaveLength(1);
  });
});
