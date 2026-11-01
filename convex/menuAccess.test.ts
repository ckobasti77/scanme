/// <reference types="vite/client" />

// ScanMe Menu V1 — K02: the single access helper (convex/lib/menuAccess.ts).
// The role × permission matrix enforced through Convex, the mapping of the
// existing memberships onto Menu roles, and the tenant boundary.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  getMenuAccess,
  loadOwned,
  requireMenuAccess,
  requireMenuAccessToRow,
  type MenuTarget,
} from "./lib/menuAccess";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PERMISSIONS, roleCan, type MenuPermission } from "../lib/menu/permissions";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addAccountMember,
  addMenuMember,
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

/** Resolves to the actor, or rejects with the MENU_ERROR code. */
async function check(
  t: T,
  userId: Id<"users"> | null,
  target: MenuTarget,
  permission: MenuPermission,
) {
  const runner = userId ? as(t, userId) : t;
  return await runner.run(async (ctx) => (await requireMenuAccess(ctx, target, permission)).actor);
}

describe("role × permission matrix (master §10.6)", () => {
  test("owner, manager, editor and admin get exactly the permissions of their role", async () => {
    const t = newTest();
    const w = await world(t);
    const target = { menuServiceId: w.a.menuServiceId };
    for (const [userId, actor] of [
      [w.ownerId, "owner"],
      [w.managerId, "manager"],
      [w.editorId, "editor"],
      [w.adminId, "admin"],
    ] as const) {
      for (const permission of MENU_PERMISSIONS) {
        if (roleCan(actor, permission)) {
          await expect(check(t, userId, target, permission)).resolves.toBe(actor);
        } else {
          await expect(check(t, userId, target, permission)).rejects.toThrow(MENU_ERROR.forbidden);
        }
      }
    }
  });

  test("the editor (Urednik) works on the offer but not on team, venue, features or settings", async () => {
    const t = newTest();
    const w = await world(t);
    const target = { menuServiceId: w.a.menuServiceId };
    for (const permission of ["menu.read", "menu.edit", "menu.publish"] as const) {
      await expect(check(t, w.editorId, target, permission)).resolves.toBe("editor");
    }
    for (const permission of ["team.manage", "venue.edit", "features.edit", "settings.edit", "analytics.read"] as const) {
      await expect(check(t, w.editorId, target, permission)).rejects.toThrow(MENU_ERROR.forbidden);
    }
  });

  test("finance, view-only, outsiders and other accounts have no Menu access at all", async () => {
    const t = newTest();
    const w = await world(t);
    const target = { menuServiceId: w.a.menuServiceId };
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      for (const permission of MENU_PERMISSIONS) {
        await expect(check(t, userId, target, permission)).rejects.toThrow(MENU_ERROR.forbidden);
      }
      const nullable = await as(t, userId).run(async (ctx) => getMenuAccess(ctx, target, "menu.read"));
      expect(nullable).toBeNull();
    }
  });

  test("signed-out callers are unauthenticated; only admin gets admin.mode", async () => {
    const t = newTest();
    const w = await world(t);
    await expect(check(t, null, { menuServiceId: w.a.menuServiceId }, "menu.read")).rejects.toThrow(
      MENU_ERROR.unauthenticated,
    );
    await expect(check(t, w.adminId, { menuServiceId: w.a.menuServiceId }, "admin.mode")).resolves.toBe(
      "admin",
    );
    await expect(check(t, w.ownerId, { menuServiceId: w.a.menuServiceId }, "admin.mode")).rejects.toThrow(
      MENU_ERROR.forbidden,
    );
  });
});

describe("existing memberships are extended, not replaced (K01 §4.2)", () => {
  test("a pre-migration business membership maps to manager", async () => {
    const t = newTest();
    const w = await world(t);
    const legacyUserId = await t.run(async (ctx) => {
      // Business A's account is NOT migrated in this test: legacy rows apply.
      await ctx.db.patch(w.a.accountId, { adminV1MigrationVersion: undefined });
      const userId = await ctx.db.insert("users", { email: "stari-clan@example.com" });
      await ctx.db.insert("businessMemberships", {
        userId,
        businessId: w.a.businessId,
        accessRole: "viewer",
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return userId;
    });
    await expect(
      check(t, legacyUserId, { menuServiceId: w.a.menuServiceId }, "team.manage"),
    ).resolves.toBe("manager");
  });

  test("an explicit Menu role wins when it is stronger; removed rows and other services do not count", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await addMenuMember(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        userId: w.managerId,
        email: "menadzer@example.com",
        role: "owner",
        invitedByUserId: w.ownerId,
      });
      await addMenuMember(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        userId: w.financeId,
        email: "finansije@example.com",
        role: "editor",
        invitedByUserId: w.ownerId,
        status: "removed",
      });
      await addMenuMember(ctx, {
        menuServiceId: w.b.menuServiceId,
        businessId: w.b.businessId,
        userId: w.outsiderId,
        email: "gost@example.com",
        role: "owner",
        invitedByUserId: w.otherOwnerId,
      });
    });
    const target = { menuServiceId: w.a.menuServiceId };
    await expect(check(t, w.managerId, target, "menu.read")).resolves.toBe("owner");
    await expect(check(t, w.financeId, target, "menu.read")).rejects.toThrow(MENU_ERROR.forbidden);
    await expect(check(t, w.outsiderId, target, "menu.read")).rejects.toThrow(MENU_ERROR.forbidden);
    await expect(
      check(t, w.outsiderId, { menuServiceId: w.b.menuServiceId }, "menu.read"),
    ).resolves.toBe("owner");
  });

  test("an explicit editor role never lowers a stronger account role", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) =>
      addMenuMember(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        userId: w.ownerId,
        email: "vlasnik@example.com",
        role: "editor",
        invitedByUserId: w.ownerId,
      }),
    );
    await expect(check(t, w.ownerId, { menuServiceId: w.a.menuServiceId }, "team.manage")).resolves.toBe(
      "owner",
    );
  });

  test("venue scope is respected: a manager limited to another venue has no access here", async () => {
    const t = newTest();
    const w = await world(t);
    const scopedId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "smena@example.com" });
      const membershipId = await addAccountMember(ctx, {
        accountId: w.a.accountId,
        userId,
        role: "venue_management",
        venueAccess: "selected",
      });
      return { userId, membershipId };
    });
    const target = { menuServiceId: w.a.menuServiceId };
    await expect(check(t, scopedId.userId, target, "menu.read")).rejects.toThrow(MENU_ERROR.forbidden);
    await t.run(async (ctx) =>
      ctx.db.insert("accountMembershipVenueScopes", {
        membershipId: scopedId.membershipId,
        accountId: w.a.accountId,
        businessId: w.a.businessId,
        createdAt: Date.now(),
      }),
    );
    await expect(check(t, scopedId.userId, target, "menu.read")).resolves.toBe("manager");
  });
});

describe("service state gates", () => {
  test("an inactive service profile blocks clients but not admin", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => ctx.db.patch(w.a.serviceProfileId, { status: "inactive" }));
    const target = { menuServiceId: w.a.menuServiceId };
    await expect(check(t, w.ownerId, target, "menu.read")).rejects.toThrow(MENU_ERROR.serviceInactive);
    await expect(check(t, w.adminId, target, "menu.edit")).resolves.toBe("admin");
  });

  test("client editing switched off: reading works, editing and publishing do not; admin still edits", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false }));
    const target = { menuServiceId: w.a.menuServiceId };
    await expect(check(t, w.ownerId, target, "menu.read")).resolves.toBe("owner");
    for (const permission of ["menu.edit", "menu.publish"] as const) {
      await expect(check(t, w.ownerId, target, permission)).rejects.toThrow(MENU_ERROR.editingDisabled);
    }
    await expect(check(t, w.adminId, target, "menu.edit")).resolves.toBe("admin");
  });

  test("an archived service or an inactive business is not found for clients", async () => {
    const t = newTest();
    const w = await world(t);
    const target = { menuServiceId: w.a.menuServiceId };
    await t.run(async (ctx) => ctx.db.patch(w.a.menuServiceId, { status: "archived" }));
    await expect(check(t, w.ownerId, target, "menu.read")).rejects.toThrow(MENU_ERROR.notFound);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.menuServiceId, { status: "active" });
      await ctx.db.patch(w.a.businessId, { status: "inactive" });
    });
    await expect(check(t, w.ownerId, target, "menu.read")).rejects.toThrow(MENU_ERROR.notFound);
  });
});

describe("tenant boundary", () => {
  test("the business slug resolves to that business's service only; malformed slugs are not found", async () => {
    const t = newTest();
    const w = await world(t);
    await expect(check(t, w.ownerId, { businessSlug: SLUG_A }, "menu.read")).resolves.toBe("owner");
    await expect(check(t, w.otherOwnerId, { businessSlug: SLUG_A }, "menu.read")).rejects.toThrow(
      MENU_ERROR.forbidden,
    );
    await expect(check(t, w.ownerId, { businessSlug: "Nije Slug!" }, "menu.read")).rejects.toThrow(
      MENU_ERROR.notFound,
    );
  });

  test("row-addressed access: no role there is not found, a member without the permission is forbidden", async () => {
    const t = newTest();
    const w = await world(t);
    const rowAccess = (userId: Id<"users">, permission: MenuPermission) =>
      as(t, userId).run(
        async (ctx) => (await requireMenuAccessToRow(ctx, w.a.menuServiceId, permission)).actor,
      );
    for (const userId of [w.otherOwnerId, w.outsiderId, w.financeId]) {
      await expect(rowAccess(userId, "menu.edit")).rejects.toThrow(MENU_ERROR.notFound);
    }
    await expect(rowAccess(w.editorId, "team.manage")).rejects.toThrow(MENU_ERROR.forbidden);
    await expect(rowAccess(w.editorId, "menu.edit")).resolves.toBe("editor");
    await t.run(async (ctx) => ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false }));
    await expect(rowAccess(w.ownerId, "menu.edit")).rejects.toThrow(MENU_ERROR.editingDisabled);
  });

  test("loadOwned reports another tenant's row as not found", async () => {
    const t = newTest();
    const w = await world(t);
    await expect(
      t.run(async (ctx) => loadOwned(ctx, w.b.defaultPageId, w.a.menuServiceId)),
    ).rejects.toThrow(MENU_ERROR.notFound);
    const own = await t.run(async (ctx) => loadOwned(ctx, w.a.defaultPageId, w.a.menuServiceId));
    expect(own._id).toBe(w.a.defaultPageId);
  });
});
