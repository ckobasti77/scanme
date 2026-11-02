/// <reference types="vite/client" />

// ScanMe Menu V1 — K17: the appearance of the public menu (convex/menuPresentation.ts):
//   get     the DRAFT appearance of a Menu service plus what the account may choose;
//   update  one change by compare-and-set, with the Premium gate on what a change
//           CHOOSES and the automatic contrast check of a brand palette.
//
// An appearance change is draft content: guests see it only after `Objavi`
// (menuPublishing.publish). An account that loses Premium keeps its drafted
// Premium parts, but the next publish falls back to the Standard parts.
//
// Role note: every Menu role (owner, manager, editor) holds menu.edit, and the
// seed roles WITHOUT a Menu role (finance, view-only) are refused as a
// stranger is (`menu/not_found`, requireMenuAccessToRow), so `menu/forbidden`
// is not reachable through `update` with this seed; the tests assert what the
// code does (no existence oracle) instead.
// Fictional venues only (seed.ts). No network is touched.

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import type { FunctionArgs } from "convex/server";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { PRESENTATION_ERROR } from "../lib/menu/errors/presentation";
import { MENU_DEFAULT_PRESENTATION } from "../lib/menu/presentation";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addMenuMember,
  grantAccountPremium,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;
type Change = FunctionArgs<typeof api.menuPresentation.update>["patch"];

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    const text = error instanceof Error ? error.message : String(error);
    return text.match(/\b(?:menu|plan|presentation)\/[a-z_]+/)?.[0] ?? text;
  }
}

async function expectCode(promise: Promise<unknown>, code: string) {
  expect(await codeOf(promise)).toBe(code);
}

function orThrow<R>(value: R | null): R {
  if (value === null) throw new Error("expected a result, got null");
  return value;
}

// -----------------------------------------------------------------------------
// World: tenant A (Standard unless told otherwise) sells "Ćevapi" for 650 in
// "Roštilj" on its only page, so its draft is publishable. Tenant B stays empty.
// -----------------------------------------------------------------------------

async function setup(options: { premium?: boolean } = {}) {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  if (options.premium) {
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });
  }
  const owner = as(t, w.ownerId);
  const section = await owner.mutation(api.menuCatalog.addSection, { pageId: w.a.defaultPageId, name: "Roštilj" });
  const added = await owner.mutation(api.menuCatalog.quickAddArticle, {
    sectionId: section.sectionId,
    name: "Ćevapi",
    priceRsd: 650,
  });
  if (added.status !== "created") throw new Error(`expected created, got ${added.status}`);
  return { t, w, owner, id: w.a.menuServiceId };
}
type World = Awaited<ReturnType<typeof setup>>;

function update(world: Pick<World, "t">, userId: Id<"users">, menuServiceId: Id<"menuServices">, expected: Change, patch: Change) {
  return as(world.t, userId).mutation(api.menuPresentation.update, { menuServiceId, expected, patch });
}

/** `update` as the owner of tenant A on tenant A's service. */
function change(world: World, expected: Change, patch: Change) {
  return update(world, world.w.ownerId, world.id, expected, patch);
}

async function mustChange(world: World, expected: Change, patch: Change) {
  expect(await change(world, expected, patch)).toEqual({ ok: true });
}

function view(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  return as(t, userId).query(api.menuPresentation.get, { menuServiceId });
}

async function ownerView(world: World) {
  return orThrow(await view(world.t, world.w.ownerId, world.id));
}

async function presentationRow(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuPresentation")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .first(),
  );
}

async function draftStatus(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  return orThrow(await as(t, userId).query(api.menuPublishing.draftStatus, { menuServiceId }));
}

/** The draft revision and the stored row: what "writes nothing" is compared against. */
async function stateOf(t: T, w: MenuWorldSeed, menuServiceId: Id<"menuServices">) {
  return { revision: (await draftStatus(t, w.adminId, menuServiceId)).revision, row: await presentationRow(t, menuServiceId) };
}

async function publishNow(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const actor = as(t, userId);
  const preview = orThrow(await actor.query(api.menuPublishing.publishPreview, { menuServiceId }));
  const result = await actor.mutation(api.menuPublishing.publish, {
    menuServiceId,
    expectedRevision: preview.revision,
    acknowledgedWarnings: preview.fingerprint,
  });
  if (!result.ok) throw new Error(`publish refused: ${JSON.stringify(result)}`);
  return result;
}

async function publicPage(t: T) {
  return orThrow(await t.query(api.menuPublic.page, { slug: SLUG_A }));
}

async function publicPresentation(t: T) {
  return (await publicPage(t)).presentation;
}

async function makeStandard(world: World) {
  await world.t.run(async (ctx) => {
    await ctx.db.patch(world.w.a.accountId, { plan: "basic", updatedAt: Date.now() });
  });
}

// =============================================================================
// Access: roles, tenants, client editing
// =============================================================================

describe("menuPresentation.get: who reads the draft appearance", () => {
  test("owner, manager, editor and the ScanMe admin read the same values, the plan and canEdit", async () => {
    const world = await setup();
    const { t, w, id } = world;
    await mustChange(world, { density: "standard" }, { density: "airy" });
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      const read = orThrow(await view(t, userId, id));
      expect(read.values).toEqual({ ...MENU_DEFAULT_PRESENTATION, density: "airy" });
      expect(read.plan).toEqual({ extraLayouts: false, reducedBranding: false });
      expect(read.canEdit).toBe(true);
      expect(typeof read.updatedAt).toBe("number");
    }
  });

  test("finance, view-only, an outsider, the owner of ANOTHER venue and an unauthenticated caller get null", async () => {
    const { t, w, id } = await setup();
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      expect(await view(t, userId, id)).toBeNull();
    }
    expect(await t.query(api.menuPresentation.get, { menuServiceId: id })).toBeNull();
  });

  test("the owner of venue A reads nothing of venue B (and B's owner nothing of A)", async () => {
    const { t, w, id } = await setup();
    expect(await view(t, w.ownerId, w.b.menuServiceId)).toBeNull();
    expect(await view(t, w.otherOwnerId, id)).toBeNull();
    expect(orThrow(await view(t, w.otherOwnerId, w.b.menuServiceId)).values).toEqual(MENU_DEFAULT_PRESENTATION);
  });
});

describe("menuPresentation.update: who may change the draft appearance", () => {
  test("owner, manager, editor and the ScanMe admin can update, and the row records who", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const steps: Array<[Id<"users">, "airy" | "standard" | "dense", "airy" | "standard" | "dense"]> = [
      [w.ownerId, "standard", "airy"],
      [w.managerId, "airy", "dense"],
      [w.editorId, "dense", "standard"],
      [w.adminId, "standard", "airy"],
    ];
    for (const [userId, from, to] of steps) {
      expect(await update(world, userId, id, { density: from }, { density: to })).toEqual({ ok: true });
      const row = await presentationRow(t, id);
      expect(row?.density).toBe(to);
      expect(row?.updatedByUserId).toBe(userId);
    }
    expect(orThrow(await view(t, w.ownerId, id)).values.density).toBe("airy");
  });

  test("finance and view-only members, an outsider and the owner of another venue get menu/not_found (never menu/forbidden) and nothing is written", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const before = await stateOf(t, w, id);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      await expectCode(update(world, userId, id, { density: "standard" }, { density: "dense" }), MENU_ERROR.notFound);
    }
    expect(await stateOf(t, w, id)).toEqual(before);
    expect(before.row).toBeNull();
  });

  test("an unauthenticated caller gets menu/unauthenticated", async () => {
    const { t, w, id } = await setup();
    const before = await stateOf(t, w, id);
    await expectCode(
      t.mutation(api.menuPresentation.update, { menuServiceId: id, expected: { density: "standard" }, patch: { density: "dense" } }),
      MENU_ERROR.unauthenticated,
    );
    expect(await stateOf(t, w, id)).toEqual(before);
  });

  test("an invited or removed Menu member has no role (menu/not_found); the same member once active can update", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const removed = await t.run(async (ctx) =>
      addMenuMember(ctx, {
        menuServiceId: id,
        businessId: w.a.businessId,
        userId: w.outsiderId,
        email: "gost@example.com",
        role: "editor",
        invitedByUserId: w.ownerId,
        status: "removed",
      }),
    );
    await t.run(async (ctx) =>
      addMenuMember(ctx, {
        menuServiceId: id,
        businessId: w.a.businessId,
        userId: w.viewOnlyId,
        email: "pregled@example.com",
        role: "manager",
        invitedByUserId: w.ownerId,
        status: "invited",
      }),
    );
    for (const userId of [w.outsiderId, w.viewOnlyId]) {
      await expectCode(update(world, userId, id, { density: "standard" }, { density: "dense" }), MENU_ERROR.notFound);
      expect(await view(t, userId, id)).toBeNull();
    }
    expect(await presentationRow(t, id)).toBeNull();

    await t.run(async (ctx) => {
      await ctx.db.patch(removed, { status: "active" });
    });
    expect(await update(world, w.outsiderId, id, { density: "standard" }, { density: "dense" })).toEqual({ ok: true });
    expect((await presentationRow(t, id))?.density).toBe("dense");
  });

  test("tenant isolation: the owner of A cannot change B (menu/not_found), B's owner cannot change A, and neither row is touched", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const beforeA = await stateOf(t, w, id);
    const beforeB = await stateOf(t, w, w.b.menuServiceId);

    await expectCode(
      update(world, w.ownerId, w.b.menuServiceId, { density: "standard" }, { density: "dense" }),
      MENU_ERROR.notFound,
    );
    await expectCode(update(world, w.otherOwnerId, id, { density: "standard" }, { density: "dense" }), MENU_ERROR.notFound);
    // The editor of A has a role in A only.
    await expectCode(
      update(world, w.editorId, w.b.menuServiceId, { density: "standard" }, { density: "dense" }),
      MENU_ERROR.notFound,
    );
    expect(await stateOf(t, w, id)).toEqual(beforeA);
    expect(await stateOf(t, w, w.b.menuServiceId)).toEqual(beforeB);

    // Positive control: B's own owner changes B, and A stays on its defaults.
    expect(await update(world, w.otherOwnerId, w.b.menuServiceId, { density: "standard" }, { density: "dense" })).toEqual({ ok: true });
    expect((await presentationRow(t, w.b.menuServiceId))?.density).toBe("dense");
    expect(await presentationRow(t, id)).toBeNull();
    expect((await ownerView(world)).values.density).toBe("standard");
  });

  test("client editing switched off: owner, manager and editor get menu/editing_disabled and nothing is written; reading still works; the admin still edits", async () => {
    const world = await setup();
    const { t, w, id } = world;
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });
    const before = await stateOf(t, w, id);
    for (const userId of [w.ownerId, w.managerId, w.editorId]) {
      await expectCode(update(world, userId, id, { density: "standard" }, { density: "dense" }), MENU_ERROR.editingDisabled);
    }
    expect(await stateOf(t, w, id)).toEqual(before);

    const read = orThrow(await view(t, w.ownerId, id));
    expect(read.values).toEqual(MENU_DEFAULT_PRESENTATION);
    expect(read.canEdit).toBe(false);
    expect(orThrow(await view(t, w.adminId, id)).canEdit).toBe(true);

    expect(await update(world, w.adminId, id, { density: "standard" }, { density: "dense" })).toEqual({ ok: true });
    expect((await presentationRow(t, id))?.density).toBe("dense");
  });
});

// =============================================================================
// Defaults and the plan
// =============================================================================

describe("menuPresentation.get: defaults and plan", () => {
  test("a service without a row reads MENU_DEFAULT_PRESENTATION and the Standard plan; no row is created by reading", async () => {
    const world = await setup();
    const read = await ownerView(world);
    expect(await presentationRow(world.t, world.id)).toBeNull();
    expect(read.values).toEqual(MENU_DEFAULT_PRESENTATION);
    expect(read.values).toMatchObject({
      layout: "flow",
      paletteId: "default",
      fontPairId: "default",
      brandColors: null,
      defaultMediaMode: "image",
      density: "standard",
      emphasis: "calm",
      search: false,
      filters: [],
      currencyToggle: false,
      branding: "standard",
    });
    expect(read.values).not.toHaveProperty("layoutVariant");
    expect(read.plan).toEqual({ extraLayouts: false, reducedBranding: false });
    expect(read.updatedAt).toBeNull();
  });

  test.each(["plan", "subscription"] as const)("Premium granted by %s turns both plan flags on", async (via) => {
    const world = await setup();
    expect((await ownerView(world)).plan).toEqual({ extraLayouts: false, reducedBranding: false });
    await world.t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: world.w.a.accountId, via });
    });
    expect((await ownerView(world)).plan).toEqual({ extraLayouts: true, reducedBranding: true });
    // The other venue's account is a different account: still Standard.
    expect(orThrow(await view(world.t, world.w.otherOwnerId, world.w.b.menuServiceId)).plan).toEqual({
      extraLayouts: false,
      reducedBranding: false,
    });
  });

  test("one real change inserts the row with the defaults for the other fields and bumps the draft revision by exactly one", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const before = await draftStatus(t, w.ownerId, id);
    await mustChange(
      world,
      {
        layout: "flow",
        paletteId: "default",
        fontPairId: "default",
        density: "standard",
        emphasis: "calm",
        defaultMediaMode: "image",
        search: false,
        filters: [],
        currencyToggle: false,
        brandColors: null,
      },
      {
        layout: "compact",
        paletteId: "ponoc",
        fontPairId: "klasika",
        density: "dense",
        emphasis: "bold",
        defaultMediaMode: "icon",
        search: true,
        filters: ["vegan", "promo"],
        currencyToggle: true,
        brandColors: ["#8C2633"],
      },
    );
    const after = await draftStatus(t, w.ownerId, id);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.lastEditBy).toMatchObject({ userId: w.ownerId, isMe: true });

    const row = await presentationRow(t, id);
    expect(row).toMatchObject({
      menuServiceId: id,
      layout: "compact",
      paletteId: "ponoc",
      brandColors: ["#8C2633"],
      fontPairId: "klasika",
      density: "dense",
      emphasis: "bold",
      defaultMediaMode: "icon",
      search: true,
      filters: ["vegan", "promo"],
      currencyToggle: true,
      branding: "standard",
      updatedByUserId: w.ownerId,
    });
    expect(row).not.toHaveProperty("layoutVariant");
    expect(orThrow(await view(t, w.editorId, id)).values).toEqual({
      layout: "compact",
      paletteId: "ponoc",
      brandColors: ["#8C2633"],
      fontPairId: "klasika",
      density: "dense",
      emphasis: "bold",
      defaultMediaMode: "icon",
      search: true,
      filters: ["vegan", "promo"],
      currencyToggle: true,
      branding: "standard",
    });
  });

  test("filters are stored in the canonical order without duplicates", async () => {
    const world = await setup();
    await mustChange(world, { filters: [] }, { filters: ["spicy", "vegan", "vegan", "promo"] });
    expect((await ownerView(world)).values.filters).toEqual(["vegan", "spicy", "promo"]);
  });
});

// =============================================================================
// Draft, not live (acceptance)
// =============================================================================

describe("menuPresentation.update is DRAFT content: guests see it only after Objavi", () => {
  test("ACCEPTANCE: an update makes the draft dirty while the public menu keeps the OLD appearance; the next publish makes it public", async () => {
    const world = await setup();
    const { t, w, id } = world;

    const v1 = await publishNow(t, w.ownerId, id);
    expect(v1.versionNumber).toBe(1);
    const pageBefore = await publicPage(t);
    expect(pageBefore.presentation).toMatchObject({ layout: "flow", paletteId: "default" });
    expect(pageBefore.versionNumber).toBe(1);
    expect((await draftStatus(t, w.ownerId, id)).state).toBe("clean");
    const revisionBefore = (await draftStatus(t, w.ownerId, id)).revision;

    await mustChange(world, { layout: "flow", paletteId: "default" }, { layout: "compact", paletteId: "bordo" });

    // The editor sees the draft…
    expect((await ownerView(world)).values).toMatchObject({ layout: "compact", paletteId: "bordo" });
    const dirty = await draftStatus(t, w.ownerId, id);
    expect(dirty.state).toBe("dirty");
    expect(dirty.hasUnpublishedChanges).toBe(true);
    expect(dirty.revision).toBe(revisionBefore + 1);
    // …guests still get exactly the published page, presentation included.
    expect((await publicPage(t)).presentation).toEqual(pageBefore.presentation);
    expect(await publicPage(t)).toEqual(pageBefore);
    expect(orThrow(await t.query(api.menuPublic.live, { slug: SLUG_A })).versionNumber).toBe(1);
    expect(orThrow(await as(t, w.ownerId).query(api.menuPublishing.publishPreview, { menuServiceId: id })).wouldChange).toBe(true);

    // A second change before publishing is still not public.
    await mustChange(world, { density: "standard" }, { density: "airy" });
    expect((await publicPage(t)).presentation).toEqual(pageBefore.presentation);

    const v2 = await publishNow(t, w.ownerId, id);
    expect(v2.versionNumber).toBe(2);
    const pageAfter = await publicPage(t);
    expect(pageAfter.versionNumber).toBe(2);
    expect(pageAfter.presentation).toMatchObject({ layout: "compact", paletteId: "bordo", density: "airy" });
    expect(orThrow(await t.query(api.menuPublic.live, { slug: SLUG_A })).versionNumber).toBe(2);
    expect((await draftStatus(t, w.ownerId, id)).state).toBe("clean");
  });

  test("a never-published menu stays unpublished: an appearance change alone makes nothing public", async () => {
    const world = await setup();
    const { t, w, id } = world;
    expect(await t.query(api.menuPublic.page, { slug: SLUG_A })).toBeNull();
    await mustChange(world, { layout: "flow" }, { layout: "compact" });
    expect(await t.query(api.menuPublic.page, { slug: SLUG_A })).toBeNull();
    expect((await draftStatus(t, w.ownerId, id)).state).toBe("never_published");
  });
});

// =============================================================================
// Compare-and-set
// =============================================================================

describe("menuPresentation.update: compare-and-set", () => {
  test("`expected` must name exactly the fields of `patch`: a missing, an extra or a different field is menu/invalid_input and writes nothing", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const before = await stateOf(t, w, id);
    const invalid: Array<[string, Change, Change]> = [
      ["missing", {}, { density: "airy" }],
      ["extra", { density: "standard", emphasis: "calm" }, { density: "airy" }],
      ["different", { emphasis: "calm" }, { density: "airy" }],
      ["fewer", { density: "standard" }, { density: "airy", emphasis: "bold" }],
      ["nothing at all", {}, {}],
      ["empty patch", { density: "standard" }, {}],
    ];
    for (const [name, expected, patch] of invalid) {
      expect(await codeOf(change(world, expected, patch)), name).toBe(MENU_ERROR.invalidInput);
    }
    expect(await stateOf(t, w, id)).toEqual(before);
  });

  test("null in `expected` counts as naming the field (was absent): layoutVariant and brandColors", async () => {
    const world = await setup({ premium: true });
    await mustChange(world, { layoutVariant: null, brandColors: null }, { layoutVariant: "kartice", brandColors: ["#8C2633"] });
    expect((await ownerView(world)).values).toMatchObject({ layoutVariant: "kartice", brandColors: ["#8C2633"] });
  });

  test("two editors: the stale expected value conflicts, returns current and attempted, and writes nothing", async () => {
    const world = await setup();
    const { t, w, id } = world;
    // A (the owner) changes the density first.
    await mustChange(world, { density: "standard" }, { density: "airy" });
    const afterA = await stateOf(t, w, id);

    // B (the editor) still believed "standard".
    const result = await update(world, w.editorId, id, { density: "standard" }, { density: "dense" });
    expect(result).toEqual({
      ok: false,
      conflicts: ["density"],
      current: { density: "airy" },
      attempted: { density: "dense" },
    });
    expect(await stateOf(t, w, id)).toEqual(afterA);
    expect((await presentationRow(t, id))?.density).toBe("airy");
    expect((await draftStatus(t, w.ownerId, id)).revision).toBe(afterA.revision);

    // With the value B now sees, the change goes through.
    expect(await update(world, w.editorId, id, { density: "airy" }, { density: "dense" })).toEqual({ ok: true });
    expect((await presentationRow(t, id))?.density).toBe("dense");
  });

  test("a conflict on one field refuses the whole patch: the fresh field is not written either", async () => {
    const world = await setup();
    const { t, w, id } = world;
    await mustChange(world, { density: "standard" }, { density: "airy" });
    const before = await stateOf(t, w, id);
    const result = await update(world, w.editorId, id, { density: "standard", emphasis: "calm" }, { density: "dense", emphasis: "bold" });
    expect(result).toEqual({
      ok: false,
      conflicts: ["density"],
      current: { density: "airy", emphasis: "calm" },
      attempted: { density: "dense" },
    });
    expect(await stateOf(t, w, id)).toEqual(before);
    expect((await presentationRow(t, id))?.emphasis).toBe("calm");
  });

  test("a stale 'no variant' conflicts when someone else set one; `current` carries every field the change named", async () => {
    const world = await setup({ premium: true });
    const { t, w, id } = world;
    await mustChange(world, { layout: "flow", layoutVariant: null }, { layout: "flow", layoutVariant: "kartice" });
    const before = await stateOf(t, w, id);
    const result = await update(
      world,
      w.editorId,
      id,
      { layout: "flow", layoutVariant: null },
      { layout: "categories", layoutVariant: "lista" },
    );
    expect(result).toEqual({
      ok: false,
      conflicts: ["layoutVariant"],
      current: { layout: "flow", layoutVariant: "kartice" },
      attempted: { layoutVariant: "lista" },
    });
    expect(await stateOf(t, w, id)).toEqual(before);
  });

  test("arrays compare as JSON text: filters and brandColors conflict with the stored list as text", async () => {
    const world = await setup();
    const { t, w, id } = world;
    await mustChange(world, { filters: [], brandColors: null }, { filters: ["vegan"], brandColors: ["#8C2633"] });
    const before = await stateOf(t, w, id);

    const stale = await update(world, w.editorId, id, { filters: [], brandColors: null }, { filters: ["promo"], brandColors: ["#112233"] });
    expect(stale).toEqual({
      ok: false,
      conflicts: ["brandColors", "filters"],
      current: { brandColors: JSON.stringify(["#8C2633"]), filters: JSON.stringify(["vegan"]) },
      attempted: { brandColors: JSON.stringify(["#112233"]), filters: JSON.stringify(["promo"]) },
    });
    expect(await stateOf(t, w, id)).toEqual(before);

    // An equal list (the same text) is not a conflict.
    expect(await update(world, w.editorId, id, { filters: ["vegan"], brandColors: ["#8C2633"] }, { filters: ["promo"], brandColors: null })).toEqual({
      ok: true,
    });
    const row = await presentationRow(t, id);
    expect(row?.filters).toEqual(["promo"]);
    expect(row?.brandColors).toBeUndefined();
    expect((await ownerView(world)).values.brandColors).toBeNull();
  });

  test("lengths are bounded before any rule runs: an over-long id, colour list or filter list is menu/invalid_input", async () => {
    const world = await setup({ premium: true });
    const { t, w, id } = world;
    const before = await stateOf(t, w, id);
    const tooLong = "a".repeat(41);
    const cases: Array<[string, Change, Change]> = [
      ["palette id", { paletteId: "default" }, { paletteId: tooLong }],
      ["font pair id", { fontPairId: "default" }, { fontPairId: tooLong }],
      ["layout variant id", { layoutVariant: null }, { layoutVariant: tooLong }],
      ["four brand colours", { brandColors: null }, { brandColors: ["#8C2633", "", "", "#000000"] }],
      ["a brand colour over 9 characters", { brandColors: null }, { brandColors: ["#8C2633AAAA"] }],
      ["21 filters", { filters: [] }, { filters: Array.from({ length: 21 }, () => "vegan") }],
      ["a filter code over 40 characters", { filters: [] }, { filters: [tooLong] }],
    ];
    for (const [name, expected, patch] of cases) {
      expect(await codeOf(change(world, expected, patch)), name).toBe(MENU_ERROR.invalidInput);
    }
    expect(await stateOf(t, w, id)).toEqual(before);
  });
});

// =============================================================================
// The Premium gate
// =============================================================================

type GateCase = { name: string; expected: Change; patch: Change };
const PREMIUM_CASES: GateCase[] = [
  { name: "Premium palette vino", expected: { paletteId: "default" }, patch: { paletteId: "vino" } },
  { name: "Premium palette sampanjac", expected: { paletteId: "default" }, patch: { paletteId: "sampanjac" } },
  { name: "Premium palette indigo", expected: { paletteId: "default" }, patch: { paletteId: "indigo" } },
  { name: "Premium palette sumrak", expected: { paletteId: "default" }, patch: { paletteId: "sumrak" } },
  { name: "Premium font pair galerija", expected: { fontPairId: "default" }, patch: { fontPairId: "galerija" } },
  { name: "Premium font pair atelje", expected: { fontPairId: "default" }, patch: { fontPairId: "atelje" } },
  { name: "Premium font pair grotesk", expected: { fontPairId: "default" }, patch: { fontPairId: "grotesk" } },
  {
    name: "layout variant kartice of Tok",
    expected: { layout: "flow", layoutVariant: null },
    patch: { layout: "flow", layoutVariant: "kartice" },
  },
  {
    name: "layout variant lista of Kategorije",
    expected: { layout: "flow", layoutVariant: null },
    patch: { layout: "categories", layoutVariant: "lista" },
  },
  {
    name: "layout variant dve-kolone of Kompaktno",
    expected: { layout: "flow", layoutVariant: null },
    patch: { layout: "compact", layoutVariant: "dve-kolone" },
  },
  { name: "reduced branding", expected: { branding: "standard" }, patch: { branding: "reduced" } },
];

describe("the Premium gate on what a change chooses", () => {
  test.each(PREMIUM_CASES)("Standard account: $name is plan/premium_required and nothing is written", async ({ expected, patch }) => {
    const world = await setup();
    const { t, w, id } = world;
    const before = await stateOf(t, w, id);
    await expectCode(change(world, expected, patch), MENU_PLAN_ERROR.premiumRequired);
    expect(await stateOf(t, w, id)).toEqual(before);
    expect(before.row).toBeNull();
  });

  test.each(PREMIUM_CASES)("Premium account: $name succeeds", async ({ expected, patch }) => {
    const world = await setup({ premium: true });
    await mustChange(world, expected, patch);
    const values = (await ownerView(world)).values;
    expect(values).toMatchObject(patch);
  });

  test("Premium granted through a subscription unlocks the same choices", async () => {
    const world = await setup();
    await expectCode(change(world, { paletteId: "default" }, { paletteId: "vino" }), "plan/premium_required");
    await world.t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: world.w.a.accountId, via: "subscription" });
    });
    await mustChange(world, { paletteId: "default" }, { paletteId: "vino" });
    await mustChange(world, { branding: "standard" }, { branding: "reduced" });
    expect((await ownerView(world)).values).toMatchObject({ paletteId: "vino", branding: "reduced" });
  });

  test("Standard account: the Standard palettes and font pairs, every layout without a variant and all other fields are open", async () => {
    const world = await setup();
    await mustChange(world, { paletteId: "default", fontPairId: "default" }, { paletteId: "ponoc", fontPairId: "klasika" });
    await mustChange(world, { layout: "flow" }, { layout: "categories" });
    await mustChange(world, { layout: "categories", layoutVariant: null }, { layout: "compact", layoutVariant: null });
    await mustChange(world, { branding: "standard" }, { branding: "standard" });
    expect((await ownerView(world)).values).toMatchObject({
      paletteId: "ponoc",
      fontPairId: "klasika",
      layout: "compact",
      branding: "standard",
    });
  });
});

describe("a lost Premium (the account is Standard again)", () => {
  /** Premium world with the whole Premium appearance drafted and published as version 1. */
  async function premiumPublished() {
    const world = await setup({ premium: true });
    await mustChange(
      world,
      { paletteId: "default", fontPairId: "default", layoutVariant: null, branding: "standard" },
      { paletteId: "vino", fontPairId: "galerija", layoutVariant: "kartice", branding: "reduced" },
    );
    await publishNow(world.t, world.w.ownerId, world.id);
    expect((await publicPresentation(world.t))).toMatchObject({
      layout: "flow",
      layoutVariant: "kartice",
      paletteId: "vino",
      fontPairId: "galerija",
      branding: "reduced",
    });
    return world;
  }

  test("the gate applies only to what a change chooses: density still works, a new Premium choice is refused, a Standard one works", async () => {
    const world = await premiumPublished();
    const { t, w, id } = world;
    await makeStandard(world);

    const read = await ownerView(world);
    expect(read.plan).toEqual({ extraLayouts: false, reducedBranding: false });
    expect(read.values).toMatchObject({ paletteId: "vino", fontPairId: "galerija", layoutVariant: "kartice", branding: "reduced" });

    await mustChange(world, { density: "standard" }, { density: "airy" });
    await mustChange(world, { emphasis: "calm", search: false }, { emphasis: "bold", search: true });
    await expectCode(change(world, { paletteId: "vino" }, { paletteId: "sumrak" }), MENU_PLAN_ERROR.premiumRequired);
    await expectCode(change(world, { fontPairId: "galerija" }, { fontPairId: "grotesk" }), MENU_PLAN_ERROR.premiumRequired);
    await expectCode(
      change(world, { layout: "flow", layoutVariant: "kartice" }, { layout: "categories", layoutVariant: "lista" }),
      MENU_PLAN_ERROR.premiumRequired,
    );
    expect((await ownerView(world)).values).toMatchObject({ paletteId: "vino", density: "airy", emphasis: "bold", search: true });

    // Leaving the Premium parts for Standard ones is allowed: a layout change without a variant drops the old variant.
    await mustChange(world, { layout: "flow" }, { layout: "compact" });
    const row = await presentationRow(t, id);
    expect(row).not.toHaveProperty("layoutVariant");
    expect(row?.layout).toBe("compact");
    await mustChange(world, { paletteId: "vino", branding: "reduced" }, { paletteId: "ponoc", branding: "standard" });
    expect(orThrow(await view(t, w.editorId, id)).values).toMatchObject({ paletteId: "ponoc", branding: "standard" });
  });

  test("ACCEPTANCE: the NEXT publish publishes the Standard fallback while the draft (and `get`) keep the drafted Premium parts", async () => {
    const world = await premiumPublished();
    const { t, w, id } = world;
    await makeStandard(world);
    await mustChange(world, { density: "standard" }, { density: "airy" });

    // Until the next publish guests still get version 1 with the Premium look.
    expect(await publicPresentation(t)).toMatchObject({ paletteId: "vino", layoutVariant: "kartice", branding: "reduced" });

    const v2 = await publishNow(t, w.ownerId, id);
    expect(v2.versionNumber).toBe(2);
    const published = await publicPresentation(t);
    expect(published).toMatchObject({
      layout: "flow",
      paletteId: "ponoc", // "vino" is a dark Premium palette: the dark Standard palette
      fontPairId: "default",
      branding: "standard",
      density: "airy",
    });
    expect(published).not.toHaveProperty("layoutVariant");

    const read = await ownerView(world);
    expect(read.values).toMatchObject({
      paletteId: "vino",
      fontPairId: "galerija",
      layoutVariant: "kartice",
      branding: "reduced",
      density: "airy",
    });
    const row = await presentationRow(t, id);
    expect(row).toMatchObject({ paletteId: "vino", layoutVariant: "kartice", branding: "reduced" });
  });

  test("with NO further draft edit the next publish still goes out and carries the fallback (not 'no_changes')", async () => {
    const world = await premiumPublished();
    const { t, w, id } = world;
    await makeStandard(world);
    expect((await draftStatus(t, w.ownerId, id)).state).toBe("clean");

    const preview = orThrow(await as(t, w.ownerId).query(api.menuPublishing.publishPreview, { menuServiceId: id }));
    expect(preview.wouldChange).toBe(true);
    const v2 = await publishNow(t, w.ownerId, id);
    expect(v2.versionNumber).toBe(2);
    const published = await publicPresentation(t);
    expect(published).toMatchObject({ paletteId: "ponoc", fontPairId: "default", branding: "standard" });
    expect(published).not.toHaveProperty("layoutVariant");
    expect((await ownerView(world)).values).toMatchObject({ paletteId: "vino", layoutVariant: "kartice" });
  });

  test("a light Premium palette falls back to the default palette (a dark one to ponoc)", async () => {
    const world = await setup({ premium: true });
    await mustChange(world, { paletteId: "default" }, { paletteId: "indigo" });
    await publishNow(world.t, world.w.ownerId, world.id);
    expect(await publicPresentation(world.t)).toMatchObject({ paletteId: "indigo" });
    await makeStandard(world);
    await publishNow(world.t, world.w.ownerId, world.id);
    expect(await publicPresentation(world.t)).toMatchObject({ paletteId: "default" });
  });
});

// =============================================================================
// Contrast, curated values and the brand palette
// =============================================================================

describe("the brand palette and the curated values", () => {
  test("ACCEPTANCE: an unreadable brand palette is presentation/unreadable and nothing is written", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const before = await stateOf(t, w, id);
    // Brand text #AAAAAA on a white page: far below 4.5:1.
    await expectCode(
      change(world, { paletteId: "default", brandColors: null }, { paletteId: "brend", brandColors: ["#8C2633", "#FFFFFF", "#AAAAAA"] }),
      PRESENTATION_ERROR.unreadable,
    );
    await expectCode(
      change(world, { paletteId: "default", brandColors: null }, { paletteId: "brend-tamna", brandColors: ["#8C2633", "#FFFFFF", "#AAAAAA"] }),
      PRESENTATION_ERROR.unreadable,
    );
    expect(await stateOf(t, w, id)).toEqual(before);
    expect(before.row).toBeNull();
  });

  test("a brand palette with only the main colour is readable on Standard (colours derived) and is stored as chosen", async () => {
    const world = await setup();
    await mustChange(world, { paletteId: "default", brandColors: null }, { paletteId: "brend", brandColors: ["#8C2633"] });
    expect((await ownerView(world)).values).toMatchObject({ paletteId: "brend", brandColors: ["#8C2633"] });
    const row = await presentationRow(world.t, world.id);
    expect(row).toMatchObject({ paletteId: "brend", brandColors: ["#8C2633"] });
  });

  test("brand colours are normalised (upper case, trailing empty roles dropped) and the dark brand palette works too", async () => {
    const world = await setup();
    await mustChange(world, { paletteId: "default", brandColors: null }, { paletteId: "brend-tamna", brandColors: ["#8c2633", "", ""] });
    expect((await ownerView(world)).values).toMatchObject({ paletteId: "brend-tamna", brandColors: ["#8C2633"] });
  });

  test("the brand palette is re-checked when only its colours change, and a refusal leaves the stored colours as they were", async () => {
    const world = await setup();
    const { t, w, id } = world;
    await mustChange(world, { paletteId: "default", brandColors: null }, { paletteId: "brend", brandColors: ["#8C2633"] });
    const before = await stateOf(t, w, id);
    await expectCode(
      change(world, { brandColors: ["#8C2633"] }, { brandColors: ["#8C2633", "#FFFFFF", "#AAAAAA"] }),
      PRESENTATION_ERROR.unreadable,
    );
    expect(await stateOf(t, w, id)).toEqual(before);
    // An unrelated change on the brand palette is not blocked.
    await mustChange(world, { density: "standard" }, { density: "dense" });
  });

  test("removing the brand colours while the brand palette is chosen is refused; leaving the brand palette keeps the colours stored", async () => {
    const world = await setup();
    const { t, w, id } = world;
    await mustChange(world, { paletteId: "default", brandColors: null }, { paletteId: "brend", brandColors: ["#8C2633"] });
    const before = await stateOf(t, w, id);
    await expectCode(change(world, { brandColors: ["#8C2633"] }, { brandColors: null }), PRESENTATION_ERROR.invalidBrandColors);
    expect(await stateOf(t, w, id)).toEqual(before);

    await mustChange(world, { paletteId: "brend" }, { paletteId: "ponoc" });
    expect((await ownerView(world)).values).toMatchObject({ paletteId: "ponoc", brandColors: ["#8C2633"] });
    await mustChange(world, { brandColors: ["#8C2633"] }, { brandColors: null });
    expect((await presentationRow(t, id))?.brandColors).toBeUndefined();
  });

  test("choosing the brand palette without usable brand colours is presentation/invalid_brand_colors", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const before = await stateOf(t, w, id);
    await expectCode(change(world, { paletteId: "default" }, { paletteId: "brend" }), PRESENTATION_ERROR.invalidBrandColors);
    await expectCode(
      change(world, { paletteId: "default", brandColors: null }, { paletteId: "brend", brandColors: ["crvena"] }),
      PRESENTATION_ERROR.invalidBrandColors,
    );
    await expectCode(change(world, { brandColors: null }, { brandColors: ["#8C2633", "#12345"] }), PRESENTATION_ERROR.invalidBrandColors);
    await expectCode(change(world, { brandColors: null }, { brandColors: [] }), PRESENTATION_ERROR.invalidBrandColors);
    expect(await stateOf(t, w, id)).toEqual(before);
  });

  test("the ScanMe panel palette and any unknown palette are presentation/unknown_palette, for Standard and Premium alike", async () => {
    for (const premium of [false, true]) {
      const world = await setup({ premium });
      const { t, w, id } = world;
      const before = await stateOf(t, w, id);
      for (const paletteId of ["scanme", "crna-zelena", "brend-x", "Topla"]) {
        await expectCode(change(world, { paletteId: "default" }, { paletteId }), PRESENTATION_ERROR.unknownPalette);
      }
      expect(await stateOf(t, w, id)).toEqual(before);
    }
  });

  test("an unknown font pair is presentation/unknown_font_pair; 'default' and curated Standard pairs are accepted", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const before = await stateOf(t, w, id);
    await expectCode(change(world, { fontPairId: "default" }, { fontPairId: "comic" }), PRESENTATION_ERROR.unknownFontPair);
    expect(await stateOf(t, w, id)).toEqual(before);
    await mustChange(world, { fontPairId: "default" }, { fontPairId: "bistro" });
    await mustChange(world, { fontPairId: "bistro" }, { fontPairId: "default" });
  });

  test("a variant of another layout (or an unknown variant) is presentation/variant_mismatch, before the Premium gate", async () => {
    for (const premium of [false, true]) {
      const world = await setup({ premium });
      const { t, w, id } = world;
      const before = await stateOf(t, w, id);
      await expectCode(
        change(world, { layout: "flow", layoutVariant: null }, { layout: "categories", layoutVariant: "kartice" }),
        PRESENTATION_ERROR.variantMismatch,
      );
      await expectCode(change(world, { layoutVariant: null }, { layoutVariant: "lista" }), PRESENTATION_ERROR.variantMismatch);
      await expectCode(change(world, { layoutVariant: null }, { layoutVariant: "nepoznata" }), PRESENTATION_ERROR.variantMismatch);
      await expectCode(change(world, { layoutVariant: null }, { layoutVariant: "" }), PRESENTATION_ERROR.variantMismatch);
      expect(await stateOf(t, w, id)).toEqual(before);
    }
  });

  test("a filter that is not a known code (a price filter) is menu/invalid_input", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const before = await stateOf(t, w, id);
    await expectCode(change(world, { filters: [] }, { filters: ["price"] }), MENU_ERROR.invalidInput);
    await expectCode(change(world, { filters: [] }, { filters: ["vegan", "price_range"] }), MENU_ERROR.invalidInput);
    await expectCode(change(world, { filters: [] }, { filters: ["Vegan"] }), MENU_ERROR.invalidInput);
    expect(await stateOf(t, w, id)).toEqual(before);
    await mustChange(world, { filters: [] }, { filters: ["vegan", "vegetarian", "spicy", "recommended", "new", "house_special", "homemade", "promo"] });
    expect((await ownerView(world)).values.filters).toHaveLength(8);
  });
});

// =============================================================================
// No-op
// =============================================================================

describe("a change that changes nothing", () => {
  test("on the defaults: { ok: true }, no row is created and the draft revision does not move", async () => {
    const world = await setup();
    const { t, w, id } = world;
    const before = await stateOf(t, w, id);
    for (const [expected, patch] of [
      [{ density: "standard" }, { density: "standard" }],
      [{ layout: "flow", layoutVariant: null }, { layout: "flow", layoutVariant: null }],
      [{ brandColors: null }, { brandColors: null }],
      [{ filters: [] }, { filters: [] }],
      [{ paletteId: "default", fontPairId: "default" }, { paletteId: "default", fontPairId: "default" }],
      [{ search: false, currencyToggle: false, branding: "standard" }, { search: false, currencyToggle: false, branding: "standard" }],
    ] as Array<[Change, Change]>) {
      expect(await change(world, expected, patch)).toEqual({ ok: true });
    }
    expect(await stateOf(t, w, id)).toEqual(before);
    expect(before.row).toBeNull();
    expect((await draftStatus(t, w.ownerId, id)).state).toBe("never_published");
  });

  test("on a stored row: { ok: true }, the row (updatedAt, updatedByUserId) and the revision are untouched, and a published draft stays clean", async () => {
    const world = await setup();
    const { t, w, id } = world;
    await mustChange(world, { density: "standard", filters: [] }, { density: "airy", filters: ["vegan", "spicy"] });
    await publishNow(t, w.ownerId, id);
    const before = await stateOf(t, w, id);

    // The editor re-sends what is already stored (the filters in another order are the same set).
    expect(await update(world, w.editorId, id, { density: "airy" }, { density: "airy" })).toEqual({ ok: true });
    expect(await update(world, w.editorId, id, { filters: ["vegan", "spicy"] }, { filters: ["spicy", "vegan"] })).toEqual({ ok: true });
    expect(await stateOf(t, w, id)).toEqual(before);
    expect((await draftStatus(t, w.ownerId, id)).state).toBe("clean");
    expect((await presentationRow(t, id))?.updatedByUserId).toBe(w.ownerId);
  });
});

// =============================================================================
// layoutVariant round trip
// =============================================================================

describe("layoutVariant", () => {
  test("round trip: set kartice on Tok, then Kategorije with `layoutVariant: null` removes the field from the row", async () => {
    const world = await setup({ premium: true });
    const { t, id } = world;
    await mustChange(world, { layout: "flow", layoutVariant: null }, { layout: "flow", layoutVariant: "kartice" });
    expect((await presentationRow(t, id))?.layoutVariant).toBe("kartice");
    expect((await ownerView(world)).values).toMatchObject({ layout: "flow", layoutVariant: "kartice" });

    await mustChange(world, { layout: "flow", layoutVariant: "kartice" }, { layout: "categories", layoutVariant: null });
    const row = await presentationRow(t, id);
    expect(row?.layout).toBe("categories");
    expect(row?.layoutVariant).toBeUndefined();
    expect(row).not.toHaveProperty("layoutVariant");
    const values = (await ownerView(world)).values;
    expect(values.layout).toBe("categories");
    expect(values).not.toHaveProperty("layoutVariant");
  });

  test("`layoutVariant: null` alone removes the variant and keeps the layout", async () => {
    const world = await setup({ premium: true });
    await mustChange(world, { layout: "flow", layoutVariant: null }, { layout: "compact", layoutVariant: "dve-kolone" });
    await mustChange(world, { layoutVariant: "dve-kolone" }, { layoutVariant: null });
    const row = await presentationRow(world.t, world.id);
    expect(row?.layout).toBe("compact");
    expect(row).not.toHaveProperty("layoutVariant");
  });

  test("a layout change that names no variant drops the variant of the old layout; the same layout keeps it", async () => {
    const world = await setup({ premium: true });
    await mustChange(world, { layout: "flow", layoutVariant: null }, { layout: "flow", layoutVariant: "kartice" });
    // Another field changes: the variant stays.
    await mustChange(world, { density: "standard" }, { density: "dense" });
    expect((await presentationRow(world.t, world.id))?.layoutVariant).toBe("kartice");
    // The layout changes: the variant of Tok cannot stay on Kompaktno.
    await mustChange(world, { layout: "flow" }, { layout: "compact" });
    const row = await presentationRow(world.t, world.id);
    expect(row?.layout).toBe("compact");
    expect(row).not.toHaveProperty("layoutVariant");
  });
});

// =============================================================================
// Restore
// =============================================================================

describe("restoring a version puts its appearance back into the draft", () => {
  async function restore(world: World, versionNumber: number) {
    const { t, w, id } = world;
    const { revision } = await draftStatus(t, w.ownerId, id);
    return await as(t, w.ownerId).mutation(api.menuPublishing.restoreVersion, {
      menuServiceId: id,
      versionNumber,
      expectedRevision: revision,
    });
  }

  test("version 1 has no variant, version 2 has one: restoring version 1 removes layoutVariant from the row; guests keep version 2 until the next publish", async () => {
    const world = await setup({ premium: true });
    const { t, w, id } = world;
    await mustChange(world, { density: "standard" }, { density: "airy" });
    await publishNow(t, w.ownerId, id);
    await mustChange(world, { layout: "flow", layoutVariant: null }, { layout: "flow", layoutVariant: "kartice" });
    await publishNow(t, w.ownerId, id);
    expect((await presentationRow(t, id))?.layoutVariant).toBe("kartice");
    expect(await publicPresentation(t)).toMatchObject({ layoutVariant: "kartice" });

    const restored = await restore(world, 1);
    expect(restored).toMatchObject({ ok: true, versionNumber: 1, state: "dirty" });

    const row = await presentationRow(t, id);
    expect(row).not.toHaveProperty("layoutVariant");
    expect(row).toMatchObject({ layout: "flow", density: "airy" });
    expect((await ownerView(world)).values).not.toHaveProperty("layoutVariant");
    // The public menu is still version 2.
    expect(await publicPresentation(t)).toMatchObject({ layoutVariant: "kartice" });
    expect((await draftStatus(t, w.ownerId, id)).state).toBe("dirty");

    await publishNow(t, w.ownerId, id);
    const published = await publicPresentation(t);
    expect(published).toMatchObject({ layout: "flow", density: "airy" });
    expect(published).not.toHaveProperty("layoutVariant");
  });

  test("restoring the LIVE version discards the draft appearance change: the variant is gone and the draft is clean", async () => {
    const world = await setup({ premium: true });
    const { t, w, id } = world;
    await mustChange(world, { density: "standard" }, { density: "airy" });
    await publishNow(t, w.ownerId, id);
    await mustChange(world, { layout: "flow", layoutVariant: null }, { layout: "flow", layoutVariant: "kartice" });
    expect((await draftStatus(t, w.ownerId, id)).state).toBe("dirty");

    expect(await restore(world, 1)).toMatchObject({ ok: true, versionNumber: 1, state: "clean" });
    expect(await presentationRow(t, id)).not.toHaveProperty("layoutVariant");
    expect((await draftStatus(t, w.ownerId, id)).state).toBe("clean");
  });

  test("a version published without any appearance row restores to the defaults: the row is removed", async () => {
    const world = await setup({ premium: true });
    const { t, w, id } = world;
    await publishNow(t, w.ownerId, id);
    expect(await presentationRow(t, id)).toBeNull();
    await mustChange(world, { layout: "flow", layoutVariant: null }, { layout: "flow", layoutVariant: "kartice" });
    expect(await presentationRow(t, id)).not.toBeNull();

    expect(await restore(world, 1)).toMatchObject({ ok: true, versionNumber: 1 });
    expect(await presentationRow(t, id)).toBeNull();
    const read = await ownerView(world);
    expect(read.values).toEqual(MENU_DEFAULT_PRESENTATION);
    expect(read.values).not.toHaveProperty("layoutVariant");
  });
});
