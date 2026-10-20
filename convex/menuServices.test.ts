/// <reference types="vite/client" />

// ScanMe Menu V1 — K02: the Menu service (master §3.2, §4.1). Every new
// service gets "Kompletan meni"; the mode is chosen at creation, the client
// only sees it, and only ScanMe admin changes it.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { DEFAULT_PAGE_SLUG } from "../lib/menu/slugs";
import { menuDomenSr } from "../lib/i18n/sr/menu-domen";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addAccountMember,
  seedMenuWorld,
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

/** A business with an active scanme_menu profile but no Menu service yet. */
async function freshBusiness(t: T, adminId: Id<"users">) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const accountId = await ctx.db.insert("accounts", {
      name: "Hotel Primer",
      plan: "basic",
      status: "active",
      adminV1MigrationVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Hotel Primer",
      slug: "hotel-primer",
      status: "active",
      accountId,
      createdAt: now,
    });
    await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_menu",
      slug: "hotel-primer-meni",
      status: "active",
      clientEditingEnabled: true,
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const ownerId = await ctx.db.insert("users", { email: "hotel@example.com" });
    const managerId = await ctx.db.insert("users", { email: "recepcija@example.com" });
    const financeId = await ctx.db.insert("users", { email: "racuni@example.com" });
    await addAccountMember(ctx, { accountId, userId: ownerId, role: "full_access" });
    await addAccountMember(ctx, { accountId, userId: managerId, role: "venue_management" });
    await addAccountMember(ctx, { accountId, userId: financeId, role: "finance" });
    void adminId;
    return { accountId, businessId, ownerId, managerId, financeId };
  });
}

async function pagesOf(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuPages")
      .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
}

describe("Kompletan meni is created automatically", () => {
  test("ensureForBusiness creates the service, its draft state and exactly one default page", async () => {
    const t = newTest();
    const w = await world(t);
    const fresh = await freshBusiness(t, w.adminId);

    const result = await as(t, fresh.ownerId).mutation(api.menuServices.ensureForBusiness, {
      businessSlug: "hotel-primer",
    });
    expect(result.created).toBe(true);

    const pages = await pagesOf(t, result.menuServiceId);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      name: menuDomenSr.defaultPageName,
      slug: DEFAULT_PAGE_SLUG,
      isDefault: true,
      visibility: "visible",
      placementCount: 0,
    });
    // Master §3.2: the internal name is not a public title.
    expect(pages[0].publicTitle).toBeUndefined();

    const state = await t.run(async (ctx) =>
      ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", result.menuServiceId))
        .unique(),
    );
    expect(state).toMatchObject({ revision: 0, articleCount: 0 });

    const service = await t.run(async (ctx) => ctx.db.get(result.menuServiceId));
    expect(service).toMatchObject({ mode: "hospitality", status: "active" });
    expect(service?.features).toEqual({
      callWaiter: false,
      billRequest: false,
      ordering: false,
      roomService: false,
      occupancy: false,
      reservations: "off",
    });
  });

  test("ensureForBusiness is idempotent: no second service, no second default page", async () => {
    const t = newTest();
    const w = await world(t);
    const fresh = await freshBusiness(t, w.adminId);
    const first = await as(t, fresh.ownerId).mutation(api.menuServices.ensureForBusiness, {
      businessSlug: "hotel-primer",
    });
    const second = await as(t, fresh.managerId).mutation(api.menuServices.ensureForBusiness, {
      businessSlug: "hotel-primer",
    });
    expect(second).toEqual({ menuServiceId: first.menuServiceId, created: false });
    expect(await pagesOf(t, first.menuServiceId)).toHaveLength(1);
  });

  test("adminProvision creates the service with Kompletan meni and writes both audit trails", async () => {
    const t = newTest();
    const w = await world(t);
    const fresh = await freshBusiness(t, w.adminId);
    const result = await as(t, w.adminId).mutation(api.menuServices.adminProvision, {
      businessId: fresh.businessId,
      mode: "hospitality",
    });
    expect(result).toMatchObject({ created: true, mode: "hospitality" });
    const pages = await pagesOf(t, result.menuServiceId);
    expect(pages.map((page) => page.name)).toEqual([menuDomenSr.defaultPageName]);
    const audits = await t.run(async (ctx) => ({
      menu: await ctx.db
        .query("menuAuditLog")
        .withIndex("by_menuServiceId_and_createdAt", (q) =>
          q.eq("menuServiceId", result.menuServiceId),
        )
        .collect(),
      admin: await ctx.db
        .query("adminAuditLog")
        .withIndex("by_businessId_and_createdAt", (q) => q.eq("businessId", fresh.businessId))
        .collect(),
    }));
    expect(audits.menu.map((row) => row.action)).toEqual(["service.provisioned"]);
    expect(audits.admin.map((row) => row.action)).toEqual(["menu_provision"]);
  });

  test("a legacy menu of the business is linked, not touched", async () => {
    const t = newTest();
    const w = await world(t);
    const fresh = await freshBusiness(t, w.adminId);
    const legacyMenuId = await t.run(async (ctx) =>
      ctx.db.insert("menus", {
        businessId: fresh.businessId,
        status: "draft",
        design: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const before = await t.run(async (ctx) => ctx.db.get(legacyMenuId));
    const result = await as(t, fresh.ownerId).mutation(api.menuServices.ensureForBusiness, {
      businessSlug: "hotel-primer",
    });
    const service = await t.run(async (ctx) => ctx.db.get(result.menuServiceId));
    expect(service?.legacyMenuId).toBe(legacyMenuId);
    expect(await t.run(async (ctx) => ctx.db.get(legacyMenuId))).toEqual(before);
  });
});

describe("who may open a Menu service", () => {
  test("finance, outsiders and other accounts cannot create it; nothing is written", async () => {
    const t = newTest();
    const w = await world(t);
    const fresh = await freshBusiness(t, w.adminId);
    for (const userId of [fresh.financeId, w.outsiderId, w.otherOwnerId, w.ownerId]) {
      await expect(
        as(t, userId).mutation(api.menuServices.ensureForBusiness, { businessSlug: "hotel-primer" }),
      ).rejects.toThrow(MENU_ERROR.forbidden);
    }
    const services = await t.run(async (ctx) =>
      ctx.db
        .query("menuServices")
        .withIndex("by_businessId", (q) => q.eq("businessId", fresh.businessId))
        .collect(),
    );
    expect(services).toHaveLength(0);
  });

  test("without the ScanMe-granted active profile the client cannot open it", async () => {
    const t = newTest();
    const w = await world(t);
    const fresh = await freshBusiness(t, w.adminId);
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", fresh.businessId).eq("type", "scanme_menu"),
        )
        .unique();
      await ctx.db.patch(profile!._id, { status: "inactive" });
    });
    await expect(
      as(t, fresh.ownerId).mutation(api.menuServices.ensureForBusiness, { businessSlug: "hotel-primer" }),
    ).rejects.toThrow(MENU_ERROR.serviceInactive);
  });

  test("signed-out callers are refused", async () => {
    const t = newTest();
    await world(t);
    await expect(
      t.mutation(api.menuServices.ensureForBusiness, { businessSlug: SLUG_A }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
  });
});

describe("the mode is locked for clients", () => {
  test("context shows the mode to every client role, read-only", async () => {
    const t = newTest();
    const w = await world(t);
    for (const [userId, actor] of [
      [w.ownerId, "owner"],
      [w.managerId, "manager"],
      [w.editorId, "editor"],
    ] as const) {
      const context = await as(t, userId).query(api.menuServices.context, { businessSlug: SLUG_A });
      expect(context).toMatchObject({ mode: "hospitality", actor });
      expect(context?.permissions).not.toContain("admin.mode");
    }
  });

  test("no client role can change the mode — adminSetMode refuses and nothing changes", async () => {
    const t = newTest();
    const w = await world(t);
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.financeId, w.otherOwnerId, w.outsiderId]) {
      for (const mode of ["hospitality", "services", "retail"] as const) {
        await expect(
          as(t, userId).mutation(api.menuServices.adminSetMode, {
            menuServiceId: w.a.menuServiceId,
            mode,
          }),
        ).rejects.toThrow();
      }
    }
    const service = await t.run(async (ctx) => ctx.db.get(w.a.menuServiceId));
    expect(service).toMatchObject({ mode: "hospitality" });
    const audits = await t.run(async (ctx) =>
      ctx.db
        .query("menuAuditLog")
        .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", w.a.menuServiceId))
        .collect(),
    );
    expect(audits.map((row) => row.action)).toEqual(["service.provisioned"]);
  });

  test("adminSetMode: modes reserved for later phases are refused; the same mode is a no-op", async () => {
    const t = newTest();
    const w = await world(t);
    for (const mode of ["services", "retail"] as const) {
      await expect(
        as(t, w.adminId).mutation(api.menuServices.adminSetMode, {
          menuServiceId: w.a.menuServiceId,
          mode,
        }),
      ).rejects.toThrow(MENU_ERROR.modeNotAvailable);
    }
    const same = await as(t, w.adminId).mutation(api.menuServices.adminSetMode, {
      menuServiceId: w.a.menuServiceId,
      mode: "hospitality",
    });
    expect(same).toEqual({ changed: false, droppedFeatures: [] });
  });

  test("adminProvision refuses modes that V1 does not build, before any write", async () => {
    const t = newTest();
    const w = await world(t);
    const fresh = await freshBusiness(t, w.adminId);
    await expect(
      as(t, w.adminId).mutation(api.menuServices.adminProvision, {
        businessId: fresh.businessId,
        mode: "services",
      }),
    ).rejects.toThrow(MENU_ERROR.modeNotAvailable);
    for (const userId of [fresh.ownerId, fresh.managerId]) {
      await expect(
        as(t, userId).mutation(api.menuServices.adminProvision, {
          businessId: fresh.businessId,
          mode: "hospitality",
        }),
      ).rejects.toThrow();
    }
    const services = await t.run(async (ctx) =>
      ctx.db
        .query("menuServices")
        .withIndex("by_businessId", (q) => q.eq("businessId", fresh.businessId))
        .collect(),
    );
    expect(services).toHaveLength(0);
  });
});
