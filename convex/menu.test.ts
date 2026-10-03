/// <reference types="vite/client" />

// TASK-51 — the Menu editor backend, provable with convex-test (no browser):
// the business-access gate, the one-menu-per-business rule, the draft writer
// (normalize + clamp + one-shape-per-group), the publish OCC contract
// (expectedDraftRevision), and the publish → §2.13 rows path that goes through
// lib/menu-rows.ts and reads back to the same inline model.

import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  defaults,
  itemDefaults,
  MAX_VARIANTS_PER_ITEM,
  type MenuGroup,
  type MenuModel,
} from "../lib/menu-blocks";
import { menuRowsToModel, type MenuRows } from "../lib/menu-rows";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const MEMBER_EMAIL = "vlasnik@scanme.test";
const OUTSIDER_EMAIL = "gost@scanme.test";
const ISSUER = "https://test.local";
const SLUG = "kafana-kod-mike";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

type T = ReturnType<typeof convexTest>;

// The pure model types storage ids as strings; the validator brands them.
// Runtime-identical — the same boundary cast convex/menu.ts uses.
type ArgModel = NonNullable<FunctionArgs<typeof api.menu.saveDraft>["model"]>;
const asArgModel = (model: MenuModel) => model as unknown as ArgModel;

function omitId<T extends { id: string }>(value: T): Omit<T, "id"> {
  const copy: Record<string, unknown> = { ...value };
  delete copy.id;
  return copy as Omit<T, "id">;
}

async function seed(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });
    const memberId = await ctx.db.insert("users", {
      email: MEMBER_EMAIL,
      emailVerificationTime: now,
    });
    const outsiderId = await ctx.db.insert("users", {
      email: OUTSIDER_EMAIL,
      emailVerificationTime: now,
    });
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
    // TASK-61: the editor guard is requireServiceEditorAccess(["scanme_menu"]),
    // so the business must own an active scanme_menu profile with client editing
    // on (menuAdmin.grantMenu provisions this in production).
    const serviceProfileId = await ctx.db.insert("serviceProfiles", {
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
    return { adminId, memberId, outsiderId, businessId, serviceProfileId };
  });
}

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: ISSUER });
}

function group(shape: MenuGroup["shape"], id: string, title: string): MenuGroup {
  const g = defaults(shape);
  return { ...g, base: { ...g.base, id, title } };
}

function sampleModel(): MenuModel {
  const pice = group("lista", "g-pice", "Piće");
  pice.items = [
    {
      ...itemDefaults(),
      id: "i-rakija",
      name: "Šljivovica",
      productType: "rakija",
      priceRsd: 250,
      variants: [
        { id: "v-03", label: "0.3 l", priceRsd: 250 },
        { id: "v-05", label: "0.5 l", priceRsd: 390 },
      ],
      pairings: [{ id: "p-1", pairedItemId: "i-meze" }],
    },
    {
      ...itemDefaults(),
      id: "i-kafa",
      name: "Domaća kafa",
      productType: "domaca kafa",
      priceRsd: 180,
    },
  ];
  const jela = group("galerija", "g-jela", "Jela");
  jela.items = [
    {
      ...itemDefaults(),
      id: "i-meze",
      name: "Meze plata",
      productType: "kajmak",
      priceRsd: 1200,
      description: "Kajmak, ajvar, pršuta",
      pairings: [{ id: "p-2", pairedItemId: "i-rakija" }],
    },
  ];
  const vina = group("tabela_varijanti", "g-vina", "Vina");
  vina.items = [
    {
      ...itemDefaults(),
      id: "i-vino",
      name: "Prokupac",
      productType: "vino",
      variants: [
        { id: "v-casa", label: "čaša", priceRsd: 350 },
        { id: "v-flasa", label: "flaša", priceRsd: 1900 },
      ],
    },
  ];
  return {
    groups: [pice, jela, vina, group("traka", "g-dnevno", "Dnevna ponuda"), group("istaknuto", "g-hit", "Specijalitet")],
    dayparts: [
      { id: "d-rucak", key: "rucak", label: "Ručak", startMinute: 660, endMinute: 1020 },
    ],
    daypartOverride: "rucak",
  };
}

// Read the published §2.13 rows back as the mapping module's row shape.
// TASK-60c: filter to the menu's LIVE generation — publishDraft no longer
// deletes old rows, so after a republish both generations coexist until the
// cleanup continuation runs; an unfiltered read would return a doubled menu.
async function publishedRows(t: T, menuId: Id<"menus">): Promise<MenuRows> {
  return t.run(async (ctx) => {
    const menu = await ctx.db.get(menuId);
    const liveGen = menu?.publishedGeneration;
    const groups = (
      await ctx.db
        .query("menuGroups")
        .filter((q) => q.eq(q.field("menuId"), menuId))
        .collect()
    ).filter((g) => g.publishGeneration === liveGen);
    const items = (
      await ctx.db
        .query("menuItems")
        .filter((q) => q.eq(q.field("menuId"), menuId))
        .collect()
    ).filter((i) => i.publishGeneration === liveGen);
    const itemIds = new Set(items.map((i) => i._id));
    const variants = (await ctx.db.query("itemVariants").collect()).filter((v) =>
      itemIds.has(v.itemId),
    );
    const pairings = (await ctx.db.query("itemPairings").collect()).filter((p) =>
      itemIds.has(p.itemId),
    );
    const dayparts = (
      await ctx.db
        .query("menuDayparts")
        .filter((q) => q.eq(q.field("menuId"), menuId))
        .collect()
    ).filter((d) => d.publishGeneration === liveGen);
    return {
      groups: groups.map((g) => ({
        id: g._id,
        menuId: g.menuId,
        title: g.title,
        shape: g.shape,
        ...(g.iconKey !== undefined ? { iconKey: g.iconKey } : {}),
        ...(g.daypartKey !== undefined ? { daypartKey: g.daypartKey } : {}),
        order: g.order,
      })),
      items: items.map((i) => ({
        id: i._id,
        menuId: i.menuId,
        groupId: i.groupId,
        name: i.name,
        ...(i.description !== undefined ? { description: i.description } : {}),
        productType: i.productType,
        ...(i.priceRsd !== undefined ? { priceRsd: i.priceRsd } : {}),
        ...(i.iconKey !== undefined ? { iconKey: i.iconKey } : {}),
        ...(i.photoStorageId !== undefined ? { photoStorageId: i.photoStorageId } : {}),
        ...(i.videoStorageId !== undefined ? { videoStorageId: i.videoStorageId } : {}),
        available: i.available,
        order: i.order,
      })),
      variants: variants.map((v) => ({
        id: v._id,
        itemId: v.itemId,
        label: v.label,
        priceRsd: v.priceRsd,
        order: v.order,
      })),
      pairings: pairings.map((p) => ({
        id: p._id,
        itemId: p.itemId,
        pairedItemId: p.pairedItemId,
        order: p.order,
      })),
      dayparts: dayparts.map((d) => ({
        id: d._id,
        menuId: d.menuId,
        key: d.key,
        label: d.label,
        startMinute: d.startMinute,
        endMinute: d.endMinute,
        order: d.order,
      })),
    };
  });
}

// Strip ids so a draft (editor uuids) and its published rows (document ids)
// compare on content and structure alone.
function stripIds(model: MenuModel) {
  const idToName = new Map<string, string>();
  for (const g of model.groups) for (const i of g.items) idToName.set(i.id, i.name);
  return {
    dayparts: model.dayparts.map(omitId),
    daypartOverride: model.daypartOverride,
    groups: model.groups.map((g) => ({
      shape: g.shape,
      title: g.base.title,
      iconKey: g.base.iconKey,
      daypartKey: g.base.daypartKey,
      items: g.items.map((item) => {
        const { variants, pairings, ...rest } = omitId(item);
        return {
          ...rest,
          variants: variants.map(omitId),
          pairings: pairings.map(
            (p) => idToName.get(p.pairedItemId) ?? p.pairedItemId,
          ),
        };
      }),
    })),
  };
}

describe("access (requireServiceEditorAccess, TASK-61)", () => {
  test("editorBySlug: an outsider gets null, a member and the admin get the editor model", async () => {
    const t = convexTest(schema, modules);
    const { adminId, memberId, outsiderId } = await seed(t);
    expect(await as(t, outsiderId).query(api.menu.editorBySlug, { slug: SLUG })).toBeNull();
    const member = await as(t, memberId).query(api.menu.editorBySlug, { slug: SLUG });
    expect(member?.editorRole).toBe("client");
    expect(member?.menu).toBeNull();
    const admin = await as(t, adminId).query(api.menu.editorBySlug, { slug: SLUG });
    expect(admin?.editorRole).toBe("admin");
    expect(admin?.businessSlug).toBe(SLUG);
  });

  test("an unknown slug is null; an outsider cannot create a menu or mint an upload URL", async () => {
    const t = convexTest(schema, modules);
    const { memberId, outsiderId } = await seed(t);
    expect(await as(t, memberId).query(api.menu.editorBySlug, { slug: "nepoznat" })).toBeNull();
    await expect(
      as(t, outsiderId).mutation(api.menu.createMenu, { slug: SLUG }),
    ).rejects.toThrow();
    const { menuId } = await as(t, memberId).mutation(api.menu.createMenu, { slug: SLUG });
    await expect(
      as(t, outsiderId).mutation(api.menu.generateEditorUploadUrl, { menuId }),
    ).rejects.toThrow();
    await expect(
      as(t, outsiderId).mutation(api.menu.saveDraft, { menuId, model: asArgModel(sampleModel()) }),
    ).rejects.toThrow();
  });
});

describe("createMenu", () => {
  test("creates one empty draft menu per business and refuses a second", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const { menuId } = await as(t, memberId).mutation(api.menu.createMenu, { slug: SLUG });
    const data = await as(t, memberId).query(api.menu.editorBySlug, { slug: SLUG });
    expect(data?.menu?.id).toBe(menuId);
    expect(data?.menu?.status).toBe("draft");
    expect(data?.menu?.draftModel).toEqual({ groups: [], dayparts: [] });
    expect(data?.menu?.draftRevision).toBe(0);
    expect(data?.menu?.publishedRevision).toBe(0);
    expect(data?.menu?.hasUnpublishedChanges).toBe(false);
    expect(data?.menu?.blockImageUrls).toEqual({});
    await expect(
      as(t, memberId).mutation(api.menu.createMenu, { slug: SLUG }),
    ).rejects.toThrow(/već ima meni/);
  });
});

describe("saveDraft", () => {
  test("bumps draftRevision, sets the dirty flag, stores the normalized model", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const first = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(sampleModel()) });
    expect(first).toEqual({ draftRevision: 1, hasUnpublishedChanges: true });
    const second = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(sampleModel()) });
    expect(second.draftRevision).toBe(2);
    const data = await me.query(api.menu.editorBySlug, { slug: SLUG });
    expect(data?.menu?.draftRevision).toBe(2);
    expect(data?.menu?.hasUnpublishedChanges).toBe(true);
    expect(data?.menu?.draftModel.groups.map((g) => g.shape)).toEqual([
      "lista",
      "galerija",
      "tabela_varijanti",
      "traka",
      "istaknuto",
    ]);
  });

  test("clamps numbers and text on write (never trusts the client)", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const model = sampleModel();
    const item = model.groups[0].items[0];
    item.priceRsd = 99_999_999;
    item.name = `  ${"x".repeat(200)}  `;
    item.description = "   ";
    item.variants = Array.from({ length: MAX_VARIANTS_PER_ITEM + 5 }, (_, i) => ({
      id: `v${i}`,
      label: `${i}`,
      priceRsd: -10,
    }));
    await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(model) });
    const data = await me.query(api.menu.editorBySlug, { slug: SLUG });
    const saved = data!.menu!.draftModel.groups[0].items[0];
    expect(saved.priceRsd).toBe(1_000_000);
    expect(saved.name).toBe("x".repeat(120));
    expect("description" in saved && saved.description !== undefined).toBe(false);
    expect(saved.variants).toHaveLength(MAX_VARIANTS_PER_ITEM);
    expect(saved.variants[0].priceRsd).toBe(0);
  });

  test("rejects a group with an unknown shape (one shape per group, §2.1)", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const bad = {
      groups: [{ shape: "koktel", base: { id: "g", title: "x" }, items: [] }],
      dayparts: [],
    };
    await expect(
      me.mutation(api.menu.saveDraft, { menuId, model: bad as unknown as ArgModel }),
    ).rejects.toThrow();
  });

  test("saving only the design leaves the model untouched", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(sampleModel()) });
    await me.mutation(api.menu.saveDraft, {
      menuId,
      design: {
        version: 1,
        colors: {
          page: "#111111",
          surface: "#222222",
          title: "#ffffff",
          body: "#dddddd",
          accent: "#d9a662",
          border: "#333333",
          focus: "#d9a662",
          icon: "#d9a662",
        },
        typography: {
          fontKey: "dm-sans",
          headingWeight: 600,
          bodyWeight: 400,
          alignment: "left",
          scale: "medium",
          lineHeight: 1.5,
          verticalSpacing: 16,
        },
        background: { category: "flat", color: "#111111" },
      },
    });
    const data = await me.query(api.menu.editorBySlug, { slug: SLUG });
    expect(data?.menu?.draftRevision).toBe(2);
    expect(data?.menu?.draftModel.groups).toHaveLength(5);
    expect(data?.menu?.draftDesign?.colors.page).toBe("#111111");
  });
});

describe("publishDraft — OCC + the rows path through lib/menu-rows.ts", () => {
  test("throws on a mismatched expectedDraftRevision and writes nothing", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(sampleModel()) });
    await expect(
      me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: 999 }),
    ).rejects.toThrow(/izmenjen/);
    const rows = await publishedRows(t, menuId);
    expect(rows.groups).toHaveLength(0);
    const data = await me.query(api.menu.editorBySlug, { slug: SLUG });
    expect(data?.menu?.status).toBe("draft");
  });

  test("publishes the draft into the §2.13 rows; rows read back to the same model", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const model = sampleModel();
    const { draftRevision } = await me.mutation(api.menu.saveDraft, {
      menuId,
      model: asArgModel(model),
    });
    const result = await me.mutation(api.menu.publishDraft, {
      menuId,
      expectedDraftRevision: draftRevision,
    });
    expect(result.publishedRevision).toBe(draftRevision);

    const rows = await publishedRows(t, menuId);
    expect(rows.groups).toHaveLength(5);
    expect(rows.items).toHaveLength(4);
    expect(rows.variants).toHaveLength(4);
    expect(rows.pairings).toHaveLength(2);
    expect(rows.dayparts).toHaveLength(1);

    // The other translator reads the rows back to the draft's content.
    const back = menuRowsToModel(rows, { daypartOverride: "rucak" });
    expect(stripIds(back)).toEqual(stripIds(model));

    const data = await me.query(api.menu.editorBySlug, { slug: SLUG });
    expect(data?.menu?.status).toBe("published");
    expect(data?.menu?.publishedRevision).toBe(draftRevision);
    expect(data?.menu?.draftRevision).toBe(draftRevision); // not advanced
    expect(data?.menu?.hasUnpublishedChanges).toBe(false);
    expect(data?.menu?.publishedAt).not.toBeNull();
    const menuDoc = await t.run((ctx) => ctx.db.get(menuId));
    expect(menuDoc?.daypartOverride).toBe("rucak");
  });

  test("a republish replaces the rows — no duplicates, removed items gone, override cleared", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const first = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(sampleModel()) });
    await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: first.draftRevision });

    const smaller = sampleModel();
    smaller.groups = smaller.groups.slice(0, 1); // only "Piće"
    smaller.groups[0].items = smaller.groups[0].items.slice(1); // only "Domaća kafa"
    delete smaller.daypartOverride;
    const second = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(smaller) });
    await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: second.draftRevision });

    const rows = await publishedRows(t, menuId);
    expect(rows.groups).toHaveLength(1);
    expect(rows.items.map((i) => i.name)).toEqual(["Domaća kafa"]);
    expect(rows.variants).toHaveLength(0);
    expect(rows.pairings).toHaveLength(0);
    const menuDoc = await t.run((ctx) => ctx.db.get(menuId));
    expect(menuDoc?.daypartOverride).toBeUndefined();
    // TASK-60c: the old generation's rows are drained by the cleanup
    // continuation publishDraft scheduled, not synchronously on publish. Drive
    // it to completion here (the scheduler WIRING is proven separately in
    // menuPublishGeneration.test.ts), then assert nothing is orphaned.
    for (let i = 0; i < 100; i += 1) {
      const r = await t.mutation(internal.menu.cleanupOldGenerations, { menuId });
      if (r.done) break;
    }
    const allVariants = await t.run((ctx) => ctx.db.query("itemVariants").collect());
    const allPairings = await t.run((ctx) => ctx.db.query("itemPairings").collect());
    expect(allVariants).toHaveLength(0);
    expect(allPairings).toHaveLength(0);
    // And the old-generation parent rows are gone too — only the live generation
    // remains in the tables.
    const liveGen = menuDoc?.publishedGeneration;
    const allItems = await t.run((ctx) => ctx.db.query("menuItems").collect());
    const allGroups = await t.run((ctx) => ctx.db.query("menuGroups").collect());
    expect(allItems.every((i) => i.publishGeneration === liveGen)).toBe(true);
    expect(allGroups.every((g) => g.publishGeneration === liveGen)).toBe(true);
  });

  test("a pairing to an item that is not in the menu is skipped on publish", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const model = sampleModel();
    model.groups[0].items[0].pairings = [{ id: "p-x", pairedItemId: "i-nepostoji" }];
    const { draftRevision } = await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(model) });
    await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: draftRevision });
    const rows = await publishedRows(t, menuId);
    // Only the meze → rakija pairing survives.
    expect(rows.pairings).toHaveLength(1);
  });
});

describe("publicMenuBySlug — the public read model (TASK-52)", () => {
  test("serves ONLY a published menu, needs no identity, and is null otherwise", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    // Unknown slug: null (no identity — this is the guest page).
    expect(
      await t.query(api.menu.publicMenuBySlug, { slug: "nepoznat" }),
    ).toBeNull();
    // A draft-only menu is NOT public (the "authority in the query" gate).
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const { draftRevision } = await me.mutation(api.menu.saveDraft, {
      menuId,
      model: asArgModel(sampleModel()),
    });
    expect(await t.query(api.menu.publicMenuBySlug, { slug: SLUG })).toBeNull();
    // After an explicit publish, the guest (no identity) sees it.
    await me.mutation(api.menu.publishDraft, {
      menuId,
      expectedDraftRevision: draftRevision,
    });
    const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
    expect(view).not.toBeNull();
    expect(view?.businessName).toBe("Kafana kod Mike");
  });

  test("the published groups round-trip to the draft and carry live fields", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const model = sampleModel();
    model.groups[0].items[1].available = false; // "Domaća kafa" — nema više
    const { draftRevision } = await me.mutation(api.menu.saveDraft, {
      menuId,
      model: asArgModel(model),
    });
    await me.mutation(api.menu.publishDraft, {
      menuId,
      expectedDraftRevision: draftRevision,
    });

    const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
    const publicModel: MenuModel = {
      groups: view!.groups,
      dayparts: [],
      daypartOverride: model.daypartOverride,
    };
    expect(stripIds(publicModel).groups).toEqual(stripIds(model).groups);
    // The availability boolean and a variant price survive to the render layer.
    const kafa = view!.groups[0].items.find((i) => i.name === "Domaća kafa");
    expect(kafa?.available).toBe(false);
    const rakija = view!.groups[0].items.find((i) => i.name === "Šljivovica");
    expect(rakija?.variants.map((v) => v.priceRsd)).toEqual([250, 390]);
  });

  test("ships a signed URL for a stored photo id, keeping the opaque id on the item (Premium)", async () => {
    const t = convexTest(schema, modules);
    const { memberId, businessId } = await seed(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      const accountId = await ctx.db.insert("accounts", {
        name: "Premium Account",
        plan: "premium",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(businessId, { accountId });
    });
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["slika"], { type: "image/jpeg" })),
    );
    const model = sampleModel();
    model.groups[1].items[0].photoStorageId = storageId;
    const { draftRevision } = await me.mutation(api.menu.saveDraft, {
      menuId,
      model: asArgModel(model),
    });
    await me.mutation(api.menu.publishDraft, {
      menuId,
      expectedDraftRevision: draftRevision,
    });
    const view = await t.query(api.menu.publicMenuBySlug, { slug: SLUG });
    expect(Object.keys(view!.blockImageUrls)).toEqual([storageId]);
    expect(view!.blockImageUrls[storageId]).toMatch(/^https?:\/\//);
    const meze = view!.groups[1].items[0];
    expect(meze.photoStorageId).toBe(storageId);
  });
});

describe("signed media URLs (RFC-003 §3 Risk #4)", () => {
  test("editorBySlug ships a signed URL for every stored photo id and omits missing files", async () => {
    const t = convexTest(schema, modules);
    const { memberId } = await seed(t);
    const me = as(t, memberId);
    const { menuId } = await me.mutation(api.menu.createMenu, { slug: SLUG });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob(["slika"], { type: "image/jpeg" })),
    );
    const model = sampleModel();
    model.groups[1].items[0].photoStorageId = storageId;
    await me.mutation(api.menu.saveDraft, { menuId, model: asArgModel(model) });
    const data = await me.query(api.menu.editorBySlug, { slug: SLUG });
    const urls = data!.menu!.blockImageUrls;
    expect(Object.keys(urls)).toEqual([storageId]);
    expect(urls[storageId]).toMatch(/^https?:\/\//);
    // The stored draft keeps the opaque id, never a URL.
    expect(data!.menu!.draftModel.groups[1].items[0].photoStorageId).toBe(storageId);
  });
});

// ---------------------------------------------------------------------------
// TASK-54 — dayparts (venue-timezone auto-switch + override) + live reactivity.
// The venue-timezone clock math is unit-tested in lib/menu-dayparts.test.ts;
// here we prove the QUERY filters by the client-supplied daypart, the override
// beats it, and an `available` toggle reaches a second open client with no
// reload (§2.5, §2.6, §3 Risk #2 & #5, §4).
// ---------------------------------------------------------------------------

// A menu with daypart-bound groups: a doručak group, a ručak group, and an
// always-on "Piće" group whose "Kafa" is the live-toggle target.
function daypartModel(): MenuModel {
  const breakfast = group("lista", "g-dorucak", "Doručak");
  breakfast.base.daypartKey = "dorucak";
  breakfast.items = [
    { ...itemDefaults(), id: "i-jaja", name: "Jaja", productType: "jaja", priceRsd: 300 },
  ];
  const lunch = group("lista", "g-rucak", "Ručak");
  lunch.base.daypartKey = "rucak";
  lunch.items = [
    { ...itemDefaults(), id: "i-supa", name: "Supa", productType: "supa", priceRsd: 250 },
  ];
  const always = group("lista", "g-pice", "Piće");
  always.items = [
    { ...itemDefaults(), id: "i-kafa", name: "Kafa", productType: "kafa", priceRsd: 180 },
  ];
  return {
    groups: [breakfast, lunch, always],
    dayparts: [
      { id: "d-dorucak", key: "dorucak", label: "Doručak", startMinute: 420, endMinute: 660 },
      { id: "d-rucak", key: "rucak", label: "Ručak", startMinute: 660, endMinute: 1020 },
      { id: "d-vecera", key: "vecera", label: "Večera", startMinute: 1020, endMinute: 1440 },
    ],
  };
}

async function publishModel(
  t: T,
  me: ReturnType<typeof as>,
  slug: string,
  model: MenuModel,
): Promise<Id<"menus">> {
  const { menuId } = await me.mutation(api.menu.createMenu, { slug });
  const { draftRevision } = await me.mutation(api.menu.saveDraft, {
    menuId,
    model: asArgModel(model),
  });
  await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: draftRevision });
  return menuId;
}

describe("dayparts + live reactivity (TASK-54)", () => {
  test("the query filters groups by the client's activeDaypart argument", async () => {
    const t = convexTest(schema, modules);
    const { adminId } = await seed(t);
    const me = as(t, adminId);
    await publishModel(t, me, SLUG, daypartModel());

    const dorucak = await t.query(api.menu.publicMenuBySlug, {
      slug: SLUG,
      activeDaypart: "dorucak",
    });
    expect(dorucak?.groups.map((g) => g.base.title)).toEqual(["Doručak", "Piće"]);
    expect(dorucak?.activeDaypartKey).toBe("dorucak");

    const rucak = await t.query(api.menu.publicMenuBySlug, {
      slug: SLUG,
      activeDaypart: "rucak",
    });
    expect(rucak?.groups.map((g) => g.base.title)).toEqual(["Ručak", "Piće"]);

    // No daypart active ⇒ only the always-on group shows.
    const none = await t.query(api.menu.publicMenuBySlug, {
      slug: SLUG,
      activeDaypart: null,
    });
    expect(none?.groups.map((g) => g.base.title)).toEqual(["Piće"]);

    // The windows ride along so the client can recompute at the boundary.
    expect(dorucak?.dayparts.map((d) => d.key)).toEqual(["dorucak", "rucak", "vecera"]);
  });

  test("the override beats the client's clock argument (§2.5) at both boundary sides", async () => {
    const t = convexTest(schema, modules);
    const { adminId } = await seed(t);
    const me = as(t, adminId);
    const model = daypartModel();
    model.daypartOverride = "rucak";
    await publishModel(t, me, SLUG, model);

    // Whatever clock daypart the client sends (before OR after the boundary),
    // the override wins and the query returns the ručak view.
    for (const clock of ["dorucak", "rucak", "vecera"] as const) {
      const view = await t.query(api.menu.publicMenuBySlug, {
        slug: SLUG,
        activeDaypart: clock,
      });
      expect(view?.activeDaypartKey).toBe("rucak");
      expect(view?.daypartOverride).toBe("rucak");
      expect(view?.groups.map((g) => g.base.title)).toEqual(["Ručak", "Piće"]);
    }
  });

  test("live: an `available` toggle reaches a second open client with no reload, and mirrors into the draft", async () => {
    const t = convexTest(schema, modules);
    const { adminId } = await seed(t);
    const me = as(t, adminId);
    const menuId = await publishModel(t, me, SLUG, daypartModel());

    const read = () =>
      t.query(api.menu.publicMenuBySlug, { slug: SLUG, activeDaypart: "rucak" });
    const kafaOf = (view: Awaited<ReturnType<typeof read>>) =>
      view!.groups.flatMap((g) => g.items).find((i) => i.name === "Kafa");

    // Two independent reads (two open clients) both see it available.
    expect(kafaOf(await read())?.available).toBe(true);
    expect(kafaOf(await read())?.available).toBe(true);

    // The owner flips "nema više" on the published item (the id the query ships).
    const kafaId = kafaOf(await read())!.id as Id<"menuItems">;
    await me.mutation(api.menu.setItemAvailable, { itemId: kafaId, available: false });

    // A second client re-reads with the SAME args — no re-publish, no re-seed:
    // "no reload" — and sees the change. This is the moat (§2.6).
    expect(kafaOf(await read())?.available).toBe(false);

    // Mirrored into the draft so the next publish does not revert it (§2b).
    const editor = await me.query(api.menu.editorBySlug, { slug: SLUG });
    const draftKafa = editor!.menu!.draftModel.groups
      .flatMap((g) => g.items)
      .find((i) => i.name === "Kafa");
    expect(draftKafa?.available).toBe(false);

    // The live flip did not bump the draft revision (invisible to publish OCC).
    const rev = editor!.menu!.draftRevision;
    await me.mutation(api.menu.publishDraft, { menuId, expectedDraftRevision: rev });
    expect(kafaOf(await read())?.available).toBe(false);
  });

  test("setItemAvailable requires business access (owner auth, not the tier gate)", async () => {
    const t = convexTest(schema, modules);
    const { adminId, outsiderId } = await seed(t);
    const me = as(t, adminId);
    await publishModel(t, me, SLUG, daypartModel());
    const kafaId = (await t.query(api.menu.publicMenuBySlug, {
      slug: SLUG,
      activeDaypart: "rucak",
    }))!.groups
      .flatMap((g) => g.items)
      .find((i) => i.name === "Kafa")!.id as Id<"menuItems">;
    await expect(
      as(t, outsiderId).mutation(api.menu.setItemAvailable, {
        itemId: kafaId,
        available: false,
      }),
    ).rejects.toThrow();
  });

  test("menuDaypartStateBySlug returns the windows + override for the SSR resolve", async () => {
    const t = convexTest(schema, modules);
    const { adminId } = await seed(t);
    const me = as(t, adminId);
    const model = daypartModel();
    model.daypartOverride = "vecera";
    await publishModel(t, me, SLUG, model);

    const state = await t.query(api.menu.menuDaypartStateBySlug, { slug: SLUG });
    expect(state?.businessName).toBe("Kafana kod Mike");
    expect(state?.daypartOverride).toBe("vecera");
    expect(state?.dayparts.map((d) => d.startMinute)).toEqual([420, 660, 1020]);
    // A draft-only or unknown menu is null (same gate as the public read).
    expect(await t.query(api.menu.menuDaypartStateBySlug, { slug: "nepoznat" })).toBeNull();
  });
});
