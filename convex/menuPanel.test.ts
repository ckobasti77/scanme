/// <reference types="vite/client" />

// ScanMe Menu V1 — K08: the client panel shell queries (master §13.1).
// `menuPanel.entry` decides whether the existing client panel offers "Otvori
// ScanMe Menu"; `menuPanel.shellContext` tells the shell which screen to draw.
// Both are bounded read models over the one Menu access helper: they never
// throw for access, never reveal which venues have Menu, and never write.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addMenuMember,
  grantAccountPremium,
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

type World = Awaited<ReturnType<typeof world>>;
type Who =
  | "owner"
  | "manager"
  | "editor"
  | "admin"
  | "finance"
  | "viewOnly"
  | "outsider"
  | "otherOwner";

function idOf(w: World, who: Who): Id<"users"> {
  const ids: Record<Who, Id<"users">> = {
    owner: w.ownerId,
    manager: w.managerId,
    editor: w.editorId,
    admin: w.adminId,
    finance: w.financeId,
    viewOnly: w.viewOnlyId,
    outsider: w.outsiderId,
    otherOwner: w.otherOwnerId,
  };
  return ids[who];
}

const NONEXISTENT_SLUG = "nepostojeci-lokal";

const NAME_A = "Kafana kod Mike";
const NAME_B = "Demo restoran";

const SHELL_KEYS = ["actor", "business", "canEdit", "menuServiceId", "mode", "plan", "status"];

const MENU_ROLES_WITH_ACCESS: ReadonlyArray<{ who: Who; actor: string }> = [
  { who: "owner", actor: "owner" },
  { who: "manager", actor: "manager" },
  { who: "editor", actor: "editor" },
  { who: "admin", actor: "admin" },
];

describe("shellContext: roles on venue A", () => {
  test("the owner gets the whole shell context", async () => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({
      status: "available",
      menuServiceId: w.a.menuServiceId,
      business: { name: NAME_A, slug: SLUG_A },
      mode: "hospitality",
      actor: "owner",
      canEdit: true,
      plan: "standard",
    });
  });

  test("the result is bounded: exactly these keys, no permissions, features or foreign ids", async () => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(Object.keys(result).sort()).toEqual(SHELL_KEYS);
    if (result.status !== "available") throw new Error("expected an available shell context");
    expect(Object.keys(result.business).sort()).toEqual(["name", "slug"]);
  });

  test.each(MENU_ROLES_WITH_ACCESS)("$who is available with actor $actor", async ({ who, actor }) => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, idOf(w, who)).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({
      status: "available",
      menuServiceId: w.a.menuServiceId,
      business: { name: NAME_A, slug: SLUG_A },
      mode: "hospitality",
      actor,
      canEdit: true,
      plan: "standard",
    });
  });
});

describe("shellContext: refusals", () => {
  test("no identity is unauthenticated", async () => {
    const t = newTest();
    await world(t);

    const result = await t.query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({ status: "unauthenticated" });
  });

  test.each<Who>(["finance", "viewOnly", "outsider"])("%s is forbidden", async (who) => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, idOf(w, who)).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({ status: "forbidden" });
  });

  test.each<"removed" | "invited">(["removed", "invited"])(
    "an editor whose menuMembers row is %s is forbidden",
    async (status) => {
      const t = newTest();
      const w = await world(t);
      const formerEditorId = await t.run(async (ctx) => {
        const userId = await ctx.db.insert("users", { email: "bivsi-urednik@example.com" });
        await addMenuMember(ctx, {
          menuServiceId: w.a.menuServiceId,
          businessId: w.a.businessId,
          userId,
          email: "bivsi-urednik@example.com",
          role: "editor",
          invitedByUserId: w.ownerId,
          status,
        });
        return userId;
      });

      const result = await as(t, formerEditorId).query(api.menuPanel.shellContext, {
        slug: SLUG_A,
      });

      expect(result).toEqual({ status: "forbidden" });
    },
  );
});

describe("shellContext: tenant isolation", () => {
  test("the owner of venue B is forbidden on venue A", async () => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, w.otherOwnerId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({ status: "forbidden" });
  });

  test("the owner of venue B gets venue B, never venue A", async () => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, w.otherOwnerId).query(api.menuPanel.shellContext, { slug: SLUG_B });

    expect(result).toEqual({
      status: "available",
      menuServiceId: w.b.menuServiceId,
      business: { name: NAME_B, slug: SLUG_B },
      mode: "hospitality",
      actor: "owner",
      canEdit: true,
      plan: "standard",
    });
    expect(JSON.stringify(result)).not.toContain(w.a.menuServiceId);
    expect(JSON.stringify(result)).not.toContain(NAME_A);
  });

  test("the owner of venue A is forbidden on venue B", async () => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_B });

    expect(result).toEqual({ status: "forbidden" });
  });

  test("the editor of venue A (explicit member) is forbidden on venue B", async () => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, w.editorId).query(api.menuPanel.shellContext, { slug: SLUG_B });

    expect(result).toEqual({ status: "forbidden" });
  });

  test("no oracle: an outsider gets the same answer for a missing slug and for a real venue", async () => {
    const t = newTest();
    const w = await world(t);

    const real = await as(t, w.outsiderId).query(api.menuPanel.shellContext, { slug: SLUG_A });
    const missing = await as(t, w.outsiderId).query(api.menuPanel.shellContext, {
      slug: NONEXISTENT_SLUG,
    });

    expect(missing).toEqual(real);
    expect(missing).toEqual({ status: "forbidden" });
  });

  test("no oracle: an owner gets the same answer for a missing slug and for another tenant's venue", async () => {
    const t = newTest();
    const w = await world(t);

    const foreign = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_B });
    const missing = await as(t, w.ownerId).query(api.menuPanel.shellContext, {
      slug: NONEXISTENT_SLUG,
    });

    expect(missing).toEqual(foreign);
  });

  test("no oracle: a signed-out caller is asked to sign in whatever the slug", async () => {
    const t = newTest();
    await world(t);

    const real = await t.query(api.menuPanel.shellContext, { slug: SLUG_A });
    const missing = await t.query(api.menuPanel.shellContext, { slug: NONEXISTENT_SLUG });

    expect(missing).toEqual(real);
    expect(missing).toEqual({ status: "unauthenticated" });
  });

  test("a malformed slug is forbidden for an outsider and does not throw", async () => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, w.outsiderId).query(api.menuPanel.shellContext, {
      slug: "Not A Slug!",
    });

    expect(result).toEqual({ status: "forbidden" });
  });

  test.each(["Not A Slug!", "", "   ", "-kafana-kod-mike-", "a".repeat(81)])(
    "a malformed slug %j is forbidden even for the owner of a real venue",
    async (slug) => {
      const t = newTest();
      const w = await world(t);

      const result = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug });

      expect(result).toEqual({ status: "forbidden" });
    },
  );
});

describe("shellContext: service state", () => {
  test.each<Who>(["owner", "manager", "editor"])(
    "inactive service profile: %s is told the service is inactive",
    async (who) => {
      const t = newTest();
      const w = await world(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
      });

      const result = await as(t, idOf(w, who)).query(api.menuPanel.shellContext, { slug: SLUG_A });

      expect(result).toEqual({ status: "inactive" });
    },
  );

  test("inactive service profile: an outsider is still forbidden (the role is checked before the profile)", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });

    const result = await as(t, w.outsiderId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({ status: "forbidden" });
  });

  test("inactive service profile: admin still gets the available shell", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });

    const result = await as(t, w.adminId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toMatchObject({
      status: "available",
      menuServiceId: w.a.menuServiceId,
      actor: "admin",
      canEdit: true,
    });
  });

  test("archived Menu service: the owner is forbidden", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.menuServiceId, { status: "archived" });
    });

    const result = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({ status: "forbidden" });
  });

  // By slug, the access helper only finds the ACTIVE service of a business (V1:
  // at most one), so an archived service has no panel, not even for ScanMe
  // admin; the admin-passes-first rule applies to a service addressed by id.
  // Kept as is in K08 (docs/MENI-PROGRESS.md, K08 ODLUKE).
  test("archived Menu service: the slug no longer resolves, so even admin gets forbidden", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.menuServiceId, { status: "archived" });
    });

    const result = await as(t, w.adminId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({ status: "forbidden" });
  });

  test("inactive business: the owner is forbidden", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "inactive" });
    });

    const result = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({ status: "forbidden" });
  });

  test("inactive business: admin still gets the available shell", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "inactive" });
    });

    const result = await as(t, w.adminId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toMatchObject({
      status: "available",
      menuServiceId: w.a.menuServiceId,
      actor: "admin",
    });
  });

  test("archived business (archivedAt set): the owner is forbidden", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { archivedAt: Date.now() });
    });

    const result = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toEqual({ status: "forbidden" });
  });

  test.each<Who>(["owner", "manager", "editor"])(
    "client editing switched off: %s is available with canEdit false",
    async (who) => {
      const t = newTest();
      const w = await world(t);
      await t.run(async (ctx) => {
        await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
      });

      const result = await as(t, idOf(w, who)).query(api.menuPanel.shellContext, { slug: SLUG_A });

      expect(result).toMatchObject({
        status: "available",
        menuServiceId: w.a.menuServiceId,
        canEdit: false,
      });
    },
  );

  test("client editing switched off: admin keeps canEdit true", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });

    const result = await as(t, w.adminId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toMatchObject({ status: "available", actor: "admin", canEdit: true });
  });
});

describe("shellContext: plan", () => {
  test("Premium on the account (plan) shows plan premium to the owner", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });

    const result = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toMatchObject({ status: "available", plan: "premium" });
  });

  test("Premium on the account (plan) shows plan premium to the editor too", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });

    const result = await as(t, w.editorId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toMatchObject({ status: "available", actor: "editor", plan: "premium" });
  });

  test("Premium by subscription is premium as well", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "subscription" });
    });

    const result = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(result).toMatchObject({ status: "available", plan: "premium" });
  });

  test.each(["plan", "subscription"] as const)(
    "Premium on account A (%s) leaves venue B on standard",
    async (via) => {
      const t = newTest();
      const w = await world(t);
      await t.run(async (ctx) => {
        await grantAccountPremium(ctx, { accountId: w.a.accountId, via });
      });

      const result = await as(t, w.otherOwnerId).query(api.menuPanel.shellContext, {
        slug: SLUG_B,
      });

      expect(result).toMatchObject({
        status: "available",
        menuServiceId: w.b.menuServiceId,
        plan: "standard",
      });
    },
  );

  test("Premium changes only the plan: the rest of the context is the same", async () => {
    const t = newTest();
    const w = await world(t);
    const before = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_A });
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" });
    });

    const after = await as(t, w.ownerId).query(api.menuPanel.shellContext, { slug: SLUG_A });

    expect(before).toMatchObject({ plan: "standard" });
    expect(after).toEqual({ ...before, plan: "premium" });
  });
});

describe("entry", () => {
  test.each(MENU_ROLES_WITH_ACCESS)("$who may open ScanMe Menu", async ({ who }) => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, idOf(w, who)).query(api.menuPanel.entry, { slug: SLUG_A });

    expect(result).toEqual({ status: "available" });
  });

  test("the available result has exactly one key: status", async () => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, w.ownerId).query(api.menuPanel.entry, { slug: SLUG_A });

    expect(Object.keys(result)).toEqual(["status"]);
  });

  test.each<Who>(["finance", "viewOnly", "outsider", "otherOwner"])(
    "%s sees no entry",
    async (who) => {
      const t = newTest();
      const w = await world(t);

      const result = await as(t, idOf(w, who)).query(api.menuPanel.entry, { slug: SLUG_A });

      expect(result).toEqual({ status: "none" });
    },
  );

  test("a signed-out caller sees no entry", async () => {
    const t = newTest();
    await world(t);

    const result = await t.query(api.menuPanel.entry, { slug: SLUG_A });

    expect(result).toEqual({ status: "none" });
  });

  test.each<Who>(["owner", "admin"])("a slug that does not exist gives none to %s", async (who) => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, idOf(w, who)).query(api.menuPanel.entry, {
      slug: NONEXISTENT_SLUG,
    });

    expect(result).toEqual({ status: "none" });
  });

  test("a malformed slug gives none and does not throw", async () => {
    const t = newTest();
    const w = await world(t);

    const result = await as(t, w.ownerId).query(api.menuPanel.entry, { slug: "Not A Slug!" });

    expect(result).toEqual({ status: "none" });
  });

  test("the owner of venue B sees the entry on B and none on A", async () => {
    const t = newTest();
    const w = await world(t);

    const onB = await as(t, w.otherOwnerId).query(api.menuPanel.entry, { slug: SLUG_B });
    const onA = await as(t, w.otherOwnerId).query(api.menuPanel.entry, { slug: SLUG_A });

    expect(onB).toEqual({ status: "available" });
    expect(onA).toEqual({ status: "none" });
  });

  test("inactive service profile: the owner sees no entry", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });

    const result = await as(t, w.ownerId).query(api.menuPanel.entry, { slug: SLUG_A });

    expect(result).toEqual({ status: "none" });
  });

  test("archived Menu service: the owner sees no entry", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.menuServiceId, { status: "archived" });
    });

    const result = await as(t, w.ownerId).query(api.menuPanel.entry, { slug: SLUG_A });

    expect(result).toEqual({ status: "none" });
  });

  test("inactive business: the owner sees no entry", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.businessId, { status: "inactive" });
    });

    const result = await as(t, w.ownerId).query(api.menuPanel.entry, { slug: SLUG_A });

    expect(result).toEqual({ status: "none" });
  });

  test("client editing switched off does not hide the entry (opening is a read)", async () => {
    const t = newTest();
    const w = await world(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });

    const result = await as(t, w.ownerId).query(api.menuPanel.entry, { slug: SLUG_A });

    expect(result).toEqual({ status: "available" });
  });
});

describe("neither query writes", () => {
  async function snapshot(t: T) {
    return await t.run(async (ctx) => ({
      services: await ctx.db.query("menuServices").take(100),
      audit: await ctx.db.query("menuAuditLog").take(100),
      members: await ctx.db.query("menuMembers").take(100),
    }));
  }

  test.each<Who>(["owner", "outsider"])(
    "menuServices, menuAuditLog and menuMembers are unchanged after %s calls both queries",
    async (who) => {
      const t = newTest();
      const w = await world(t);
      const before = await snapshot(t);
      expect(before.services).toHaveLength(2);

      const caller = as(t, idOf(w, who));
      await caller.query(api.menuPanel.entry, { slug: SLUG_A });
      await caller.query(api.menuPanel.shellContext, { slug: SLUG_A });
      await caller.query(api.menuPanel.entry, { slug: NONEXISTENT_SLUG });
      await caller.query(api.menuPanel.shellContext, { slug: NONEXISTENT_SLUG });

      const after = await snapshot(t);
      expect(after.services).toHaveLength(before.services.length);
      expect(after.audit).toHaveLength(before.audit.length);
      expect(after.members).toHaveLength(before.members.length);
      expect(after).toEqual(before);
    },
  );
});
