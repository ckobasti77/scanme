/// <reference types="vite/client" />

// TASK-58 — the admin Menu surface (RFC-003 §2.9): requireAdmin on every
// function, EXACTLY ONE adminAuditLog row per changing mutation (zero for a
// no-op), the migration stages + deadline, and the hard 2000-item ceiling
// refused BEFORE any write.

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { defaults, itemDefaults, type MenuModel } from "../lib/menu-blocks";
import { MENU_MAX_ITEMS } from "../lib/menu-export/rows";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const OWNER_EMAIL = "vlasnik@scanme.test";
const ISSUER = "https://test.local";
const SLUG = "kafana-kod-mike";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

type T = ReturnType<typeof convexTest>;
type ArgModel = FunctionArgs<typeof api.menuAdmin.importDraft>["model"];
const asArgModel = (model: MenuModel) => model as unknown as ArgModel;

async function seed(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL, emailVerificationTime: now });
    const ownerId = await ctx.db.insert("users", { email: OWNER_EMAIL, emailVerificationTime: now });
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana kod Mike",
      slug: SLUG,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId: ownerId,
      businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { adminId, ownerId, businessId };
  });
}

const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: userId, issuer: ISSUER });

function modelWithItems(count: number): MenuModel {
  const groups = [];
  let made = 0;
  while (made < count) {
    const g = defaults("lista");
    g.base = { id: `g-${groups.length}`, title: `Grupa ${groups.length}` };
    const take = Math.min(100, count - made);
    for (let i = 0; i < take; i += 1) {
      g.items.push({ ...itemDefaults(), id: `i-${made}`, name: `Stavka ${made}`, productType: "jelo", priceRsd: 100 });
      made += 1;
    }
    groups.push(g);
  }
  return { groups, dayparts: [] };
}

function smallModel(): MenuModel {
  const pice = defaults("lista");
  pice.base = { id: "g-pice", title: "Piće" };
  pice.items = [
    { ...itemDefaults(), id: "i-kafa", name: "Kafa", productType: "piće", priceRsd: 180 },
    {
      ...itemDefaults(),
      id: "i-rakija",
      name: "Šljivovica",
      productType: "piće",
      variants: [{ id: "v-1", label: "0.3 l", priceRsd: 250 }],
    },
  ];
  return { groups: [pice], dayparts: [] };
}

// Inside t.run the schema's index types are lost (memory: convex-test gotcha),
// so filter by field; the table is tiny in a test.
const audit = (t: T, businessId: Id<"businesses">) =>
  t.run((ctx) =>
    ctx.db
      .query("adminAuditLog")
      .filter((q) => q.eq(q.field("businessId"), businessId))
      .collect(),
  );

describe("menuAdmin (TASK-58)", () => {
  test("every function refuses a non-admin (owner) and an anonymous caller", async () => {
    const t = convexTest(schema, modules);
    const { ownerId, businessId } = await seed(t);
    const owner = as(t, ownerId);
    await expect(owner.query(api.menuAdmin.overview, { businessId })).rejects.toThrow("administratorski");
    await expect(owner.mutation(api.menuAdmin.grantMenu, { businessId })).rejects.toThrow("administratorski");
    await expect(t.query(api.menuAdmin.overview, { businessId })).rejects.toThrow();
    expect(await audit(t, businessId)).toHaveLength(0);
  });

  test("grant: one audit row, stage 'received' + deadline; a second grant is a no-op with no row", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const admin = as(t, adminId);

    const before = await admin.query(api.menuAdmin.overview, { businessId });
    expect(before?.menu).toBeNull();

    const first = await admin.mutation(api.menuAdmin.grantMenu, { businessId });
    expect(first.created).toBe(true);
    const rows = await audit(t, businessId);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("grant_menu");
    expect(rows[0].actorUserId).toBe(adminId);

    const view = await admin.query(api.menuAdmin.overview, { businessId });
    expect(view?.menu?.migrationStage).toBe("received");
    expect(view?.menu?.migrationReceivedAt).not.toBeNull();
    expect(view?.menu?.deadlineAt).toBeGreaterThan(view!.menu!.migrationReceivedAt!);
    expect(view?.menu?.itemsCount).toBe(0);

    const second = await admin.mutation(api.menuAdmin.grantMenu, { businessId });
    expect(second.created).toBe(false);
    expect(second.menuId).toBe(first.menuId);
    expect(await audit(t, businessId)).toHaveLength(1);
  });

  test("grant provisions an ACTIVE scanme_menu profile and binds it to the menu (TASK-61)", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const admin = as(t, adminId);

    const { menuId } = await admin.mutation(api.menuAdmin.grantMenu, { businessId });

    const state = await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("serviceProfiles")
        .filter((q) => q.eq(q.field("businessId"), businessId))
        .filter((q) => q.eq(q.field("type"), "scanme_menu"))
        .unique();
      const menu = await ctx.db.get(menuId);
      return { profile, serviceProfileId: menu?.serviceProfileId };
    });

    // The active profile is what makes subpageActive("menu") true and the editor
    // guard (requireServiceEditorAccess) pass.
    expect(state.profile).not.toBeNull();
    expect(state.profile?.status).toBe("active");
    expect(state.profile?.clientEditingEnabled).toBe(true);
    expect(state.profile?.slug).toBe(`${SLUG}-meni`);
    // The menu is bound to the very profile the grant created.
    expect(state.serviceProfileId).toBe(state.profile?._id);
  });

  test("stage change: one row with from/to; the same stage again writes none", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const admin = as(t, adminId);
    const { menuId } = await admin.mutation(api.menuAdmin.grantMenu, { businessId });

    const changed = await admin.mutation(api.menuAdmin.setMigrationStage, { menuId, stage: "review" });
    expect(changed.changed).toBe(true);
    const rows = await audit(t, businessId);
    expect(rows).toHaveLength(2);
    expect(rows[1].action).toBe("set_menu_stage");
    expect(JSON.parse(rows[1].detail ?? "{}")).toMatchObject({ from: "received", to: "review" });

    const same = await admin.mutation(api.menuAdmin.setMigrationStage, { menuId, stage: "review" });
    expect(same.changed).toBe(false);
    expect(await audit(t, businessId)).toHaveLength(2);
  });

  test("import: 2001 items are REFUSED before any write; 2000 import with one row", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const admin = as(t, adminId);
    const { menuId } = await admin.mutation(api.menuAdmin.grantMenu, { businessId });

    await expect(
      admin.mutation(api.menuAdmin.importDraft, { menuId, model: asArgModel(modelWithItems(MENU_MAX_ITEMS + 1)) }),
    ).rejects.toThrow(/2001 stavki prelazi granicu od 2000/);
    const untouched = await t.run((ctx) => ctx.db.get(menuId));
    expect(untouched?.draftRevision).toBe(0);
    expect(untouched?.migrationStage).toBe("received");
    expect(await audit(t, businessId)).toHaveLength(1);

    const ok = await admin.mutation(api.menuAdmin.importDraft, { menuId, model: asArgModel(modelWithItems(MENU_MAX_ITEMS)) });
    expect(ok.items).toBe(MENU_MAX_ITEMS);
    expect(ok.draftRevision).toBe(1);
    const rows = await audit(t, businessId);
    expect(rows).toHaveLength(2);
    expect(rows[1].action).toBe("import_menu_draft");
    expect(JSON.parse(rows[1].detail ?? "{}")).toMatchObject({ items: MENU_MAX_ITEMS, replacedItems: 0 });
    const view = await admin.query(api.menuAdmin.overview, { businessId });
    expect(view?.menu?.itemsCount).toBe(MENU_MAX_ITEMS);
    expect(view?.menu?.migrationStage).toBe("in_progress");
    expect(view?.menu?.hasUnpublishedChanges).toBe(true);
  });

  test("import normalizes like saveDraft (text bounds) and replaces the previous draft", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const admin = as(t, adminId);
    const { menuId } = await admin.mutation(api.menuAdmin.grantMenu, { businessId });
    await admin.mutation(api.menuAdmin.importDraft, { menuId, model: asArgModel(smallModel()) });

    const longName = smallModel();
    longName.groups[0].items = [{ ...longName.groups[0].items[0], name: "x".repeat(200) }];
    const result = await admin.mutation(api.menuAdmin.importDraft, { menuId, model: asArgModel(longName) });
    expect(result.items).toBe(1);
    const menu = await t.run((ctx) => ctx.db.get(menuId));
    const items = menu!.draftModel!.groups.flatMap((g) => g.items);
    expect(items).toHaveLength(1);
    expect(items[0].name).toHaveLength(120);
    const rows = await audit(t, businessId);
    expect(rows).toHaveLength(3);
    expect(JSON.parse(rows[2].detail ?? "{}")).toMatchObject({ replacedItems: 2, items: 1 });
  });

  test("publishForClient publishes, sets stage 'published', keeps a live 'nema više', one row", async () => {
    const t = convexTest(schema, modules);
    const { adminId, ownerId, businessId } = await seed(t);
    const admin = as(t, adminId);
    const owner = as(t, ownerId);
    const { menuId } = await admin.mutation(api.menuAdmin.grantMenu, { businessId });
    await admin.mutation(api.menuAdmin.importDraft, { menuId, model: asArgModel(smallModel()) });

    const first = await admin.mutation(api.menuAdmin.publishForClient, { menuId });
    expect(first.items).toBe(2);
    expect(first.keptUnavailable).toEqual([]);
    let view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG, activeDaypart: null });
    expect(view?.groups[0].items.map((i) => i.name)).toEqual(["Kafa", "Šljivovica"]);
    expect((await admin.query(api.menuAdmin.overview, { businessId }))?.menu?.migrationStage).toBe("published");

    // The floor takes Kafa off; the admin re-imports the SAME menu with fresh
    // ids (concierge re-entry) and publishes — the live "nema više" is kept.
    const kafaId = view!.groups[0].items[0].id as Id<"menuItems">;
    await owner.mutation(api.menu.setItemAvailable, { itemId: kafaId, available: false });
    const reentered = smallModel();
    for (const g of reentered.groups) {
      g.base.id = `new-${g.base.id}`;
      for (const i of g.items) i.id = `new-${i.id}`;
    }
    await admin.mutation(api.menuAdmin.importDraft, { menuId, model: asArgModel(reentered) });
    const second = await admin.mutation(api.menuAdmin.publishForClient, { menuId });
    expect(second.keptUnavailable.map((i) => i.name)).toEqual(["Kafa"]);
    view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG, activeDaypart: null });
    expect(view?.groups[0].items.find((i) => i.name === "Kafa")?.available).toBe(false);

    const rows = await audit(t, businessId);
    // grant, import, publish, import, publish = 5 rows, one per mutation.
    expect(rows.map((r) => r.action)).toEqual([
      "grant_menu",
      "import_menu_draft",
      "publish_menu",
      "import_menu_draft",
      "publish_menu",
    ]);
    expect(JSON.parse(rows[4].detail ?? "{}")).toMatchObject({ via: "admin", keptUnavailable: ["Kafa"] });
  });
});
