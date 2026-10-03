/// <reference types="vite/client" />

// TASK-58 — the live "nema više" trap (RFC-003 §3 Risk 10): `setItemAvailable`
// patches the published row but the draft only when it is clean, so a publish
// from a stale draft used to resurrect the item. publishDraft now detects a
// draft `true` over a live `false` (matched by the stable `menuItems.key`,
// falling back to group-title + name) and refuses to publish silently.

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { defaults, itemDefaults, type MenuGroup, type MenuModel } from "../lib/menu-blocks";
import { AVAILABILITY_CONFLICT_CODE } from "../lib/menu-publish";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const MEMBER_EMAIL = "vlasnik@scanme.test";
const ISSUER = "https://test.local";
const SLUG = "kafana-kod-mike";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

type T = ReturnType<typeof convexTest>;
type ArgModel = NonNullable<FunctionArgs<typeof api.menu.saveDraft>["model"]>;
const asArgModel = (model: MenuModel) => model as unknown as ArgModel;

async function seed(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL, emailVerificationTime: now });
    const memberId = await ctx.db.insert("users", { email: MEMBER_EMAIL, emailVerificationTime: now });
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana kod Mike",
      slug: SLUG,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId: memberId,
      businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    // TASK-61: the editor guard needs an active scanme_menu profile.
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
    return { adminId, memberId, businessId };
  });
}

const as = (t: T, userId: Id<"users">) => t.withIdentity({ subject: userId, issuer: ISSUER });

function group(id: string, title: string, items: MenuGroup["items"]): MenuGroup {
  const g = defaults("lista");
  return { ...g, base: { ...g.base, id, title }, items };
}

const item = (id: string, name: string, priceRsd: number) => ({
  ...itemDefaults(),
  id,
  name,
  productType: "piće",
  priceRsd,
});

// Piće: Kafa, Čaj — Jela: Supa. No dayparts, so the public view shows all.
function model(): MenuModel {
  return {
    groups: [
      group("g-pice", "Piće", [item("i-kafa", "Kafa", 180), item("i-caj", "Čaj", 150)]),
      group("g-jela", "Jela", [item("i-supa", "Supa", 250)]),
    ],
    dayparts: [],
  };
}

const read = (t: T) => t.query(api.menu.publicMenuBySlug, { slug: SLUG, activeDaypart: null });
type View = Awaited<ReturnType<typeof read>>;
const find = (view: View, name: string) =>
  view!.groups.flatMap((g) => g.items).find((i) => i.name === name);

async function setup(t: T) {
  const ids = await seed(t);
  const me = as(t, ids.memberId);
  const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
  const { draftRevision } = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(model()) });
  await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: draftRevision });
  return { ...ids, me, menuId };
}

// The trap: the floor flips Kafa off while the draft is DIRTY (mirror skipped),
// then the owner saves a stale model (Kafa true) and publishes.
async function armTrap(t: T, me: ReturnType<typeof as>, menuId: Id<"menus">, draft: MenuModel = model()) {
  const dirty = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(model()) });
  const kafaId = find(await read(t), "Kafa")!.id as Id<"menuItems">;
  await me.mutation(api.menu.setItemAvailable, { itemId: kafaId, available: false });
  expect(find(await read(t), "Kafa")?.available).toBe(false);
  const stale = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(draft) });
  return { rev: stale.draftRevision, dirtyRev: dirty.draftRevision };
}

const generationOf = (t: T, menuId: Id<"menus">) =>
  t.run(async (ctx) => (await ctx.db.get(menuId))!.publishedGeneration);

describe("publishDraft vs the live 'nema više' (TASK-58, §3 Risk 10)", () => {
  test("a stale draft over a live 'nema više' is REFUSED and nothing is written", async () => {
    const t = convexTest(schema, modules);
    const { me, menuId } = await setup(t);
    const { rev } = await armTrap(t, me, menuId);
    const before = await generationOf(t, menuId);

    await expect(
      me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: rev }),
    ).rejects.toMatchObject({
      data: { code: AVAILABILITY_CONFLICT_CODE, items: [{ key: "i-kafa", name: "Kafa" }] },
    });

    expect(await generationOf(t, menuId)).toBe(before);
    expect(find(await read(t), "Kafa")?.available).toBe(false);
    const editor = await me.query(api.menu.editorBySlug, { slug: SLUG });
    expect(editor!.menu!.hasUnpublishedChanges).toBe(true);
  });

  test("keepLive publishes Kafa as unavailable, mirrors the draft, and does not re-ask", async () => {
    const t = convexTest(schema, modules);
    const { me, menuId } = await setup(t);
    const { rev } = await armTrap(t, me, menuId);

    const result = await me.mutation(api.menu.publishDraft, {
      menuId,
      expectedDraftRevision: rev,
      onAvailabilityConflict: "keepLive",
    });
    expect(result.keptUnavailable).toEqual([{ key: "i-kafa", name: "Kafa" }]);
    expect(find(await read(t), "Kafa")?.available).toBe(false);
    expect(find(await read(t), "Čaj")?.available).toBe(true);

    const editor = await me.query(api.menu.editorBySlug, { slug: SLUG });
    const draftKafa = editor!.menu!.draftModel.groups.flatMap((g) => g.items).find((i) => i.name === "Kafa");
    expect(draftKafa?.available).toBe(false);
    expect(editor!.menu!.hasUnpublishedChanges).toBe(false);
    expect(editor!.menu!.draftRevision).toBe(rev);

    // A second plain publish resolves: the draft now agrees with the floor.
    const again = await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: rev });
    expect(again.keptUnavailable).toEqual([]);
    expect(find(await read(t), "Kafa")?.available).toBe(false);
  });

  test("overwrite publishes the draft as-is (the owner's explicit choice)", async () => {
    const t = convexTest(schema, modules);
    const { me, menuId } = await setup(t);
    const { rev } = await armTrap(t, me, menuId);
    const result = await me.mutation(api.menu.publishDraft, {
      menuId,
      expectedDraftRevision: rev,
      onAvailabilityConflict: "overwrite",
    });
    expect(result.keptUnavailable).toEqual([]);
    expect(find(await read(t), "Kafa")?.available).toBe(true);
  });

  test("draft false over live true is NOT a conflict (the editor shows the switch off)", async () => {
    const t = convexTest(schema, modules);
    const { me, menuId } = await setup(t);
    const draft = model();
    draft.groups[0].items[0].available = false;
    const { draftRevision } = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(draft) });
    await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: draftRevision });
    expect(find(await read(t), "Kafa")?.available).toBe(false);
  });

  test("the stable key survives a rename AND a move to another group", async () => {
    const t = convexTest(schema, modules);
    const { me, menuId } = await setup(t);
    const draft = model();
    const kafa = draft.groups[0].items.shift()!;
    draft.groups[1].items.unshift({ ...kafa, name: "Domaća kafa" });
    const { rev } = await armTrap(t, me, menuId, draft);

    await expect(
      me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: rev }),
    ).rejects.toMatchObject({ data: { items: [{ key: "i-kafa", name: "Domaća kafa" }] } });

    await me.mutation(api.menu.publishDraft, {
      menuId,
      expectedDraftRevision: rev,
      onAvailabilityConflict: "keepLive",
    });
    const view = await read(t);
    expect(view!.groups.map((g) => g.base.title)).toEqual(["Piće", "Jela"]);
    expect(find(view, "Domaća kafa")?.available).toBe(false);
  });

  test("a deleted item is no conflict; a new item publishes with its draft flag", async () => {
    const t = convexTest(schema, modules);
    const { me, menuId } = await setup(t);
    const draft = model();
    draft.groups[0].items = [item("i-caj", "Čaj", 150), item("i-sok", "Sok", 200)];
    const { rev } = await armTrap(t, me, menuId, draft);
    const result = await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: rev });
    expect(result.keptUnavailable).toEqual([]);
    const view = await read(t);
    expect(find(view, "Kafa")).toBeUndefined();
    expect(find(view, "Sok")?.available).toBe(true);
  });

  test("a re-entered menu (all-new ids) falls back to group-title + name; renamed too → no match", async () => {
    const t = convexTest(schema, modules);
    const { me, menuId } = await setup(t);
    const reentered = model();
    for (const g of reentered.groups) {
      g.base.id = `new-${g.base.id}`;
      for (const i of g.items) i.id = `new-${i.id}`;
    }
    const { rev } = await armTrap(t, me, menuId, reentered);
    await expect(
      me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: rev }),
    ).rejects.toMatchObject({ data: { items: [{ key: "new-i-kafa", name: "Kafa" }] } });

    // Renamed AND re-keyed: no key, no place → the documented boundary.
    reentered.groups[0].items[0].name = "Turska kafa";
    const { draftRevision } = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(reentered) });
    const result = await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: draftRevision });
    expect(result.keptUnavailable).toEqual([]);
    expect(find(await read(t), "Turska kafa")?.available).toBe(true);
  });

  test("round trip: keepLive → the floor re-enables → a plain publish keeps it on", async () => {
    const t = convexTest(schema, modules);
    const { me, menuId } = await setup(t);
    const { rev } = await armTrap(t, me, menuId);
    await me.mutation(api.menu.publishDraft, {
      menuId,
      expectedDraftRevision: rev,
      onAvailabilityConflict: "keepLive",
    });
    const kafaId = find(await read(t), "Kafa")!.id as Id<"menuItems">;
    await me.mutation(api.menu.setItemAvailable, { itemId: kafaId, available: true });
    expect(find(await read(t), "Kafa")?.available).toBe(true);
    const result = await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: rev });
    expect(result.keptUnavailable).toEqual([]);
    expect(find(await read(t), "Kafa")?.available).toBe(true);
  });

  test("an ADMIN publishing through the editor leaves one audit row; a member leaves none", async () => {
    const t = convexTest(schema, modules);
    const { me, menuId, adminId, businessId } = await setup(t);
    const audit = () =>
      t.run((ctx) =>
        ctx.db
          .query("adminAuditLog")
          .withIndex("by_businessId_and_createdAt", (q) => q.eq("businessId", businessId))
          .collect(),
      );
    expect(await audit()).toHaveLength(0);

    const { draftRevision } = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(model()) });
    await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: draftRevision });
    expect(await audit()).toHaveLength(0);

    const admin = as(t, adminId);
    await admin.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: draftRevision });
    const rows = await audit();
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe("publish_menu");
    expect(rows[0].actorUserId).toBe(adminId);
    expect(JSON.parse(rows[0].detail ?? "{}")).toMatchObject({ via: "editor", items: 3 });
  });
});
