/// <reference types="vite/client" />

// TASK-55 — Menu entitlements & capability gating (RFC-003 §2.7 & §4).
// Tests:
// 1. Matrix: {nema entitlement, basic, premium, enterprise} x {photos on/off}
// 2. Server-side field omission: on Basic (or no entitlement), photoStorageId,
//    videoStorageId, and their signed URLs in blockImageUrls are omitted on the server.
// 3. Gate helpers (menuPhotosEnabled, menuVideoEnabled, menuFeaturedEnabled).
// 4. Existing access/entitlement tests pass byte-identically; access.ts untouched.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  MENU_BASIC_LIMITS,
  MENU_PREMIUM_LIMITS,
  menuPhotosEnabled,
  menuVideoEnabled,
  menuFeaturedEnabled,
  type AccountPlan,
} from "./lib/plans";
import { getEntitlement } from "./lib/entitlements";
import {
  defaults,
  itemDefaults,
  type MenuGroup,
  type MenuModel,
} from "../lib/menu-blocks";

const modules = import.meta.glob("./**/*.ts");
const SLUG = "restoran-beograd";

function group(shape: MenuGroup["shape"], id: string, title: string): MenuGroup {
  const g = defaults(shape);
  return { ...g, base: { ...g.base, id, title } };
}

function sampleModel(withMedia: boolean, storageId: string, videoId: string): MenuModel {
  const hrana = group("lista", "g-hrana", "Glavna jela");
  hrana.items = [
    {
      ...itemDefaults(),
      id: "i-cevapi",
      name: "Ćevapi",
      productType: "jelo",
      priceRsd: 850,
      ...(withMedia
        ? {
            photoStorageId: storageId,
            videoStorageId: videoId,
          }
        : {}),
    },
    {
      ...itemDefaults(),
      id: "i-pljeskavica",
      name: "Pljeskavica",
      productType: "jelo",
      priceRsd: 900,
    },
  ];
  return {
    groups: [hrana],
    dayparts: [],
  };
}

async function setupBusinessAndMenu(
  t: ReturnType<typeof convexTest>,
  opts: {
    withMedia: boolean;
    accountPlan?: AccountPlan;
  },
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const userId = await ctx.db.insert("users", {
      email: "vlasnik@restoran.test",
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Restoran Beograd",
      slug: SLUG,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId,
      businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    // TASK-61: the editor guard is requireServiceEditorAccess(["scanme_menu"]),
    // so the business owns an active scanme_menu profile with client editing on.
    await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_menu",
      slug: `${SLUG}-meni`,
      status: "active",
      clientEditingEnabled: true,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });

    let accountId: Id<"accounts"> | undefined = undefined;
    if (opts.accountPlan) {
      accountId = await ctx.db.insert("accounts", {
        name: "Test Account",
        plan: opts.accountPlan,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(businessId, { accountId });
    }

    const photoStorageId = await ctx.storage.store(
      new Blob(["slika-cevapi"], { type: "image/jpeg" }),
    );
    const videoStorageId = await ctx.storage.store(
      new Blob(["video-cevapi"], { type: "video/mp4" }),
    );

    const model = sampleModel(opts.withMedia, photoStorageId, videoStorageId);

    // Seed published menu directly using existing schema tables
    const menuId = await ctx.db.insert("menus", {
      businessId,
      status: "published",
      design: null,
      draftModel: model as unknown as NonNullable<Doc<"menus">["draftModel"]>,
      draftRevision: 1,
      publishedRevision: 1,
      hasUnpublishedChanges: false,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const groupId = await ctx.db.insert("menuGroups", {
      menuId,
      title: "Glavna jela",
      shape: "lista",
      order: 0,
      createdAt: now,
      updatedAt: now,
    });

    const item1Id = await ctx.db.insert("menuItems", {
      menuId,
      groupId,
      name: "Ćevapi",
      productType: "jelo",
      priceRsd: 850,
      available: true,
      order: 0,
      ...(opts.withMedia
        ? {
            photoStorageId,
            videoStorageId,
          }
        : {}),
      createdAt: now,
      updatedAt: now,
    });

    const item2Id = await ctx.db.insert("menuItems", {
      menuId,
      groupId,
      name: "Pljeskavica",
      productType: "jelo",
      priceRsd: 900,
      available: true,
      order: 1,
      createdAt: now,
      updatedAt: now,
    });

    return {
      businessId,
      userId,
      menuId,
      photoStorageId,
      videoStorageId,
      item1Id,
      item2Id,
    };
  });
}

describe("TASK-55: Menu entitlements & limits", () => {
  describe("Gate helpers (menuPhotosEnabled, menuVideoEnabled, menuFeaturedEnabled)", () => {
    test("defaults null/undefined to Basic (false)", () => {
      expect(menuPhotosEnabled(null)).toBe(false);
      expect(menuPhotosEnabled(undefined)).toBe(false);
      expect(menuVideoEnabled(null)).toBe(false);
      expect(menuVideoEnabled(undefined)).toBe(false);
      expect(menuFeaturedEnabled(null)).toBe(false);
      expect(menuFeaturedEnabled(undefined)).toBe(false);
    });

    test("evaluates MENU_BASIC_LIMITS to false", () => {
      expect(menuPhotosEnabled(MENU_BASIC_LIMITS)).toBe(false);
      expect(menuVideoEnabled(MENU_BASIC_LIMITS)).toBe(false);
      expect(menuFeaturedEnabled(MENU_BASIC_LIMITS)).toBe(false);
    });

    test("evaluates MENU_PREMIUM_LIMITS to true", () => {
      expect(menuPhotosEnabled(MENU_PREMIUM_LIMITS)).toBe(true);
      expect(menuVideoEnabled(MENU_PREMIUM_LIMITS)).toBe(true);
      expect(menuFeaturedEnabled(MENU_PREMIUM_LIMITS)).toBe(true);
    });

    test("evaluates partial overrides accurately", () => {
      expect(menuPhotosEnabled({ photos: true })).toBe(true);
      expect(menuPhotosEnabled({ photos: false })).toBe(false);
      expect(menuVideoEnabled({ videoInSheet: true })).toBe(true);
      expect(menuVideoEnabled({ videoInSheet: false })).toBe(false);
      expect(menuFeaturedEnabled({ featuredGroup: true })).toBe(true);
      expect(menuFeaturedEnabled({ featuredGroup: false })).toBe(false);
    });
  });

  describe("getEntitlement('scanme_menu') resolution matrix", () => {
    test("no entitlement (no account) resolves to null", async () => {
      const t = convexTest(schema, modules);
      const { businessId } = await setupBusinessAndMenu(t, { withMedia: false });
      const entitlement = await t.run((ctx) => getEntitlement(ctx, businessId, "scanme_menu"));
      expect(entitlement).toBeNull();
      expect(menuPhotosEnabled(entitlement?.limits)).toBe(false);
      expect(menuVideoEnabled(entitlement?.limits)).toBe(false);
    });

    test("basic account plan resolves to planKey 'basic' with MENU_BASIC_LIMITS", async () => {
      const t = convexTest(schema, modules);
      const { businessId } = await setupBusinessAndMenu(t, {
        withMedia: false,
        accountPlan: "basic",
      });
      const entitlement = await t.run((ctx) => getEntitlement(ctx, businessId, "scanme_menu"));
      expect(entitlement).not.toBeNull();
      expect(entitlement?.planKey).toBe("basic");
      expect(entitlement?.status).toBe("active");
      expect(entitlement?.limits).toEqual(MENU_BASIC_LIMITS);
      expect(menuPhotosEnabled(entitlement?.limits)).toBe(false);
      expect(menuVideoEnabled(entitlement?.limits)).toBe(false);
    });

    test("premium account plan resolves to planKey 'premium' with MENU_PREMIUM_LIMITS", async () => {
      const t = convexTest(schema, modules);
      const { businessId } = await setupBusinessAndMenu(t, {
        withMedia: true,
        accountPlan: "premium",
      });
      const entitlement = await t.run((ctx) => getEntitlement(ctx, businessId, "scanme_menu"));
      expect(entitlement).not.toBeNull();
      expect(entitlement?.planKey).toBe("premium");
      expect(entitlement?.status).toBe("active");
      expect(entitlement?.limits).toEqual(MENU_PREMIUM_LIMITS);
      expect(menuPhotosEnabled(entitlement?.limits)).toBe(true);
      expect(menuVideoEnabled(entitlement?.limits)).toBe(true);
    });

    test("enterprise account plan resolves to planKey 'premium' with MENU_PREMIUM_LIMITS", async () => {
      const t = convexTest(schema, modules);
      const { businessId } = await setupBusinessAndMenu(t, {
        withMedia: true,
        accountPlan: "enterprise",
      });
      const entitlement = await t.run((ctx) => getEntitlement(ctx, businessId, "scanme_menu"));
      expect(entitlement).not.toBeNull();
      expect(entitlement?.planKey).toBe("premium");
      expect(entitlement?.status).toBe("active");
      expect(entitlement?.limits).toEqual(MENU_PREMIUM_LIMITS);
      expect(menuPhotosEnabled(entitlement?.limits)).toBe(true);
      expect(menuVideoEnabled(entitlement?.limits)).toBe(true);
    });
  });

  describe("Server-side omission matrix in publicMenuBySlug: {no entitlement, basic, premium, enterprise} x {photos on/off}", () => {
    // 1. No entitlement x photos ON
    test("no entitlement + photos ON in DB -> server OMITS photoStorageId, videoStorageId, and signed URLs", async () => {
      const t = convexTest(schema, modules);
      const { photoStorageId, videoStorageId } = await setupBusinessAndMenu(t, {
        withMedia: true,
      });
      const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
      expect(view).not.toBeNull();
      const cevapi = view!.groups[0].items.find((i) => i.name === "Ćevapi")!;
      expect(cevapi.photoStorageId).toBeUndefined();
      expect(cevapi.videoStorageId).toBeUndefined();
      expect("photoStorageId" in cevapi).toBe(false);
      expect("videoStorageId" in cevapi).toBe(false);
      expect(view!.blockImageUrls[photoStorageId]).toBeUndefined();
      expect(view!.blockImageUrls[videoStorageId]).toBeUndefined();
      expect(Object.keys(view!.blockImageUrls)).toHaveLength(0);
    });

    // 2. No entitlement x photos OFF
    test("no entitlement + photos OFF in DB -> server emits no media fields", async () => {
      const t = convexTest(schema, modules);
      await setupBusinessAndMenu(t, { withMedia: false });
      const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
      expect(view).not.toBeNull();
      const cevapi = view!.groups[0].items.find((i) => i.name === "Ćevapi")!;
      expect(cevapi.photoStorageId).toBeUndefined();
      expect(cevapi.videoStorageId).toBeUndefined();
      expect(Object.keys(view!.blockImageUrls)).toHaveLength(0);
    });

    // 3. Basic tier x photos ON
    test("basic tier + photos ON in DB -> server OMITS photoStorageId, videoStorageId, and signed URLs", async () => {
      const t = convexTest(schema, modules);
      const { photoStorageId, videoStorageId } = await setupBusinessAndMenu(t, {
        withMedia: true,
        accountPlan: "basic",
      });
      const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
      expect(view).not.toBeNull();
      const cevapi = view!.groups[0].items.find((i) => i.name === "Ćevapi")!;
      expect(cevapi.photoStorageId).toBeUndefined();
      expect(cevapi.videoStorageId).toBeUndefined();
      expect("photoStorageId" in cevapi).toBe(false);
      expect("videoStorageId" in cevapi).toBe(false);
      expect(view!.blockImageUrls[photoStorageId]).toBeUndefined();
      expect(view!.blockImageUrls[videoStorageId]).toBeUndefined();
      expect(Object.keys(view!.blockImageUrls)).toHaveLength(0);
    });

    // 4. Basic tier x photos OFF
    test("basic tier + photos OFF in DB -> server emits no media fields", async () => {
      const t = convexTest(schema, modules);
      await setupBusinessAndMenu(t, {
        withMedia: false,
        accountPlan: "basic",
      });
      const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
      expect(view).not.toBeNull();
      const cevapi = view!.groups[0].items.find((i) => i.name === "Ćevapi")!;
      expect(cevapi.photoStorageId).toBeUndefined();
      expect(cevapi.videoStorageId).toBeUndefined();
      expect(Object.keys(view!.blockImageUrls)).toHaveLength(0);
    });

    // 5. Premium tier x photos ON
    test("premium tier + photos ON in DB -> server INCLUDES photoStorageId, videoStorageId, and signed URLs", async () => {
      const t = convexTest(schema, modules);
      const { photoStorageId, videoStorageId } = await setupBusinessAndMenu(t, {
        withMedia: true,
        accountPlan: "premium",
      });
      const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
      expect(view).not.toBeNull();
      const cevapi = view!.groups[0].items.find((i) => i.name === "Ćevapi")!;
      expect(cevapi.photoStorageId).toBe(photoStorageId);
      expect(cevapi.videoStorageId).toBe(videoStorageId);
      expect(view!.blockImageUrls[photoStorageId]).toMatch(/^https?:\/\//);
      expect(view!.blockImageUrls[videoStorageId]).toMatch(/^https?:\/\//);
    });

    // 6. Premium tier x photos OFF
    test("premium tier + photos OFF in DB -> server emits items without media, empty blockImageUrls", async () => {
      const t = convexTest(schema, modules);
      await setupBusinessAndMenu(t, {
        withMedia: false,
        accountPlan: "premium",
      });
      const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
      expect(view).not.toBeNull();
      const cevapi = view!.groups[0].items.find((i) => i.name === "Ćevapi")!;
      expect(cevapi.photoStorageId).toBeUndefined();
      expect(cevapi.videoStorageId).toBeUndefined();
      expect(Object.keys(view!.blockImageUrls)).toHaveLength(0);
    });

    // 7. Enterprise tier x photos ON
    test("enterprise tier + photos ON in DB -> server INCLUDES photoStorageId, videoStorageId, and signed URLs", async () => {
      const t = convexTest(schema, modules);
      const { photoStorageId, videoStorageId } = await setupBusinessAndMenu(t, {
        withMedia: true,
        accountPlan: "enterprise",
      });
      const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
      expect(view).not.toBeNull();
      const cevapi = view!.groups[0].items.find((i) => i.name === "Ćevapi")!;
      expect(cevapi.photoStorageId).toBe(photoStorageId);
      expect(cevapi.videoStorageId).toBe(videoStorageId);
      expect(view!.blockImageUrls[photoStorageId]).toMatch(/^https?:\/\//);
      expect(view!.blockImageUrls[videoStorageId]).toMatch(/^https?:\/\//);
    });

    // 8. Enterprise tier x photos OFF
    test("enterprise tier + photos OFF in DB -> server emits items without media, empty blockImageUrls", async () => {
      const t = convexTest(schema, modules);
      await setupBusinessAndMenu(t, {
        withMedia: false,
        accountPlan: "enterprise",
      });
      const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
      expect(view).not.toBeNull();
      const cevapi = view!.groups[0].items.find((i) => i.name === "Ćevapi")!;
      expect(cevapi.photoStorageId).toBeUndefined();
      expect(cevapi.videoStorageId).toBeUndefined();
      expect(Object.keys(view!.blockImageUrls)).toHaveLength(0);
    });
  });

  describe("Editor guard is requireServiceEditorAccess(['scanme_menu']) (TASK-61)", () => {
    test("member can access editorBySlug on Basic tier", async () => {
      const t = convexTest(schema, modules);
      const { userId } = await setupBusinessAndMenu(t, {
        withMedia: false,
        accountPlan: "basic",
      });
      const me = t.withIdentity({ subject: userId, issuer: "https://test.local" });
      const editorModel = await me.query(api.menu.editorBySlug, { slug: SLUG });
      expect(editorModel).not.toBeNull();
      expect(editorModel?.businessSlug).toBe(SLUG);
      expect(editorModel?.editorRole).toBe("client");
    });

    test("outsider is refused by editorBySlug (returns null)", async () => {
      const t = convexTest(schema, modules);
      await setupBusinessAndMenu(t, {
        withMedia: false,
        accountPlan: "premium",
      });
      const outsiderId = await t.run((ctx) =>
        ctx.db.insert("users", {
          email: "stranac@test.local",
          emailVerificationTime: Date.now(),
        }),
      );
      const outsider = t.withIdentity({
        subject: outsiderId,
        issuer: "https://test.local",
      });
      const editorModel = await outsider.query(api.menu.editorBySlug, { slug: SLUG });
      expect(editorModel).toBeNull();
    });
  });
});

