/// <reference types="vite/client" />

// ScanMe Menu V1 — K20: the Menu QR cards of a venue (master §9.2). Listing,
// minting for positions or pages, linking a card to a page and/or position,
// switching a card off. Roles (venue.edit), tenant isolation (a card id from
// another tenant is menu/not_found), read-only adopted cards, and "nothing
// is written on a refusal".

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { FLOOR_ERROR } from "../lib/menu/errors/floor";
import { newMenuKey } from "../lib/menu/keys";
import { MENU_MAX_QR_CARDS, MENU_MAX_QR_MINT_BATCH } from "../lib/menu/limits";
import { menuDomenSr } from "../lib/i18n/sr/menu-domen";
import {
  SLUG_A,
  SLUG_B,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  seedQrLink,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Typed by the schema (ReturnType<typeof convexTest> would lose the index types).
const newTest = () => {
  const t = convexTest(schema, modules);
  // Minting does not touch the limiter; registered anyway for the scan test below.
  rateLimiterTest.register(t);
  return t;
};
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

async function world(t: T) {
  return await t.run(async (ctx) => await seedMenuWorld(ctx));
}

const CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

let positionSeq = 0;

async function addPosition(t: T, menuServiceId: Id<"menuServices">, label: string, active = true) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    positionSeq += 1;
    return await ctx.db.insert("menuPositions", {
      menuServiceId,
      key: newMenuKey("position"),
      kind: "table",
      label,
      labelNormalized: label.toLowerCase(),
      order: positionSeq * 1000,
      active,
      createdAt: now,
      updatedAt: now,
    });
  });
}

async function addPage(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">, name: string) {
  return await as(t, userId).mutation(api.menuPages.add, { menuServiceId, name });
}

async function archivePage(t: T, pageId: Id<"menuPages">) {
  await t.run(async (ctx) => {
    await ctx.db.patch(pageId, { archivedAt: Date.now() });
  });
}

async function defaultPageKey(t: T, w: MenuWorldSeed) {
  const page = await t.run(async (ctx) => await ctx.db.get(w.a.defaultPageId));
  if (!page) throw new Error("default page missing");
  return page.key;
}

/** A card of the business; `kind` null = no current target at all. Never linked. */
async function plainCard(
  t: T,
  w: MenuWorldSeed,
  input: { cardCode: string; label: string; kind: "menu" | "url" | null; business?: "a" | "b" },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const seed = input.business === "b" ? w.b : w.a;
    const cardId = await ctx.db.insert("cards", {
      businessId: seed.businessId,
      cardCode: input.cardCode,
      label: input.label,
      status: "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });
    if (input.kind) {
      const targetId = await ctx.db.insert("cardTargets", {
        cardId,
        kind: input.kind,
        ...(input.kind === "url" ? { url: "https://example.com" } : {}),
        createdByUserId: w.ownerId,
        createdAt: now,
      });
      await ctx.db.patch(cardId, { currentTargetId: targetId });
    }
    return cardId;
  });
}

/** `n` Menu cards (current target menu, no link) for the business; for the ceiling tests. */
async function bulkMenuCards(t: T, w: MenuWorldSeed, n: number) {
  await t.run(async (ctx) => {
    const now = Date.now();
    for (let index = 0; index < n; index += 1) {
      const cardId = await ctx.db.insert("cards", {
        businessId: w.a.businessId,
        cardCode: `BULK${String(index).padStart(4, "0")}`,
        label: `Sto ${index + 1}`,
        status: "active",
        totalScans: 0,
        createdAt: now,
        updatedAt: now,
      });
      const targetId = await ctx.db.insert("cardTargets", {
        cardId,
        kind: "menu",
        createdByUserId: w.ownerId,
        createdAt: now,
      });
      await ctx.db.patch(cardId, { currentTargetId: targetId });
    }
  });
}

/** Marks a card as adopted by a ScanMe access channel whose subject points at the card's target. */
async function adoptCard(t: T, w: MenuWorldSeed, cardId: Id<"cards">) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const card = await ctx.db.get(cardId);
    if (!card) throw new Error("card missing");
    const subjectId = await ctx.db.insert("accessSubjects", {
      accountId: w.a.accountId,
      businessId: w.a.businessId,
      destinationKind: "legacy",
      ...(card.currentTargetId ? { currentTargetId: card.currentTargetId } : {}),
      createdAt: now,
      updatedAt: now,
    });
    const channelId = await ctx.db.insert("accessChannels", {
      accountId: w.a.accountId,
      businessId: w.a.businessId,
      subjectId,
      cardId,
      resolverCode: card.cardCode,
      kind: "qr",
      state: "active",
      redirectEnabled: true,
      health: "healthy",
      binding: "digital",
      searchText: card.cardCode.toLowerCase(),
      totalScans: 0,
      lastActor: { kind: "system", source: "menuQr.test" },
      lastReason: "test",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(cardId, { accessChannelId: channelId });
    return { subjectId, channelId };
  });
}

async function cardsOf(t: T, businessId: Id<"businesses">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("cards")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect(),
  );
}

async function cardOf(t: T, cardId: Id<"cards">) {
  const card = await t.run(async (ctx) => await ctx.db.get(cardId));
  if (!card) throw new Error("card missing");
  return card;
}

async function linksOf(t: T, cardId: Id<"cards">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("menuQrLinks")
      .withIndex("by_cardId", (q) => q.eq("cardId", cardId))
      .collect(),
  );
}

async function targetsOf(t: T, cardId: Id<"cards">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("cardTargets")
      .withIndex("by_cardId", (q) => q.eq("cardId", cardId))
      .collect(),
  );
}

async function auditOf(t: T, menuServiceId: Id<"menuServices">, action: string) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
  return rows.filter((row) => row.action === action);
}

async function revisionOf(t: T, menuServiceId: Id<"menuServices">) {
  const state = await t.run(async (ctx) =>
    ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
  );
  if (!state) throw new Error("draft state missing");
  return state.revision;
}

async function listA(t: T, userId: Id<"users">) {
  return await as(t, userId).query(api.menuQr.listCards, { slug: SLUG_A });
}

function cardsByCode(result: Awaited<ReturnType<typeof listA>>) {
  return new Map((result?.cards ?? []).map((card) => [card.cardCode, card] as const));
}

async function mintA(
  t: T,
  w: MenuWorldSeed,
  input: { positionIds?: Id<"menuPositions">[]; pageKey?: string | null; count?: number },
  userId: Id<"users"> = w.ownerId,
) {
  return await as(t, userId).mutation(api.menuQr.mintCards, {
    slug: SLUG_A,
    pageKey: input.pageKey ?? null,
    ...(input.positionIds !== undefined ? { positionIds: input.positionIds } : {}),
    ...(input.count !== undefined ? { count: input.count } : {}),
  });
}

/** A Menu card for Sto 1 minted through the real mutation. */
async function mintedCard(t: T, w: MenuWorldSeed, pageKey: string | null = null) {
  const position = await addPosition(t, w.a.menuServiceId, "Sto 1");
  const { created } = await mintA(t, w, { positionIds: [position], pageKey });
  return { position, card: created[0] };
}

describe("menuQr.listCards: roles", () => {
  test("owner, manager and ScanMe admin see the cards; every other caller gets null", async () => {
    const t = newTest();
    const w = await world(t);
    await plainCard(t, w, { cardCode: "PLAIN001", label: "Sto 1", kind: "menu" });

    for (const userId of [w.ownerId, w.managerId, w.adminId]) {
      const result = await listA(t, userId);
      expect(result).not.toBeNull();
      expect(result?.cards).toHaveLength(1);
    }
    for (const userId of [w.editorId, w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      expect(await listA(t, userId)).toBeNull();
    }
    // Not signed in, and an unknown or malformed slug.
    expect(await t.query(api.menuQr.listCards, { slug: SLUG_A })).toBeNull();
    expect(await as(t, w.ownerId).query(api.menuQr.listCards, { slug: "nema-takvog-lokala" })).toBeNull();
    expect(await as(t, w.ownerId).query(api.menuQr.listCards, { slug: "" })).toBeNull();
  });

  test("a tenant's cards are listed only under its own slug", async () => {
    const t = newTest();
    const w = await world(t);
    await plainCard(t, w, { cardCode: "PLAIN001", label: "Sto 1", kind: "menu" });
    await plainCard(t, w, { cardCode: "PLAIN002", label: "Tuđ sto", kind: "menu", business: "b" });

    const own = await listA(t, w.ownerId);
    expect(own?.cards.map((card) => card.cardCode)).toEqual(["PLAIN001"]);
    // The owner of B cannot read A's slug, and A's owner cannot read B's.
    expect(await as(t, w.otherOwnerId).query(api.menuQr.listCards, { slug: SLUG_A })).toBeNull();
    expect(await as(t, w.ownerId).query(api.menuQr.listCards, { slug: SLUG_B })).toBeNull();
    const other = await as(t, w.otherOwnerId).query(api.menuQr.listCards, { slug: SLUG_B });
    expect(other?.cards.map((card) => card.cardCode)).toEqual(["PLAIN002"]);
  });
});

describe("menuQr.listCards: which cards, which fields", () => {
  test("includes Menu cards, excludes other destinations, keeps a retargeted card that still has a link", async () => {
    const t = newTest();
    const w = await world(t);
    const pageKey = await defaultPageKey(t, w);

    const linked = await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey,
        createdByUserId: w.ownerId,
        cardCode: "LINKED01",
      }),
    );
    await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey,
        createdByUserId: w.ownerId,
        cardCode: "RETARGT1",
        targetKind: "url",
      }),
    );
    await plainCard(t, w, { cardCode: "OLDMENU1", label: "Stari meni", kind: "menu" });
    await plainCard(t, w, { cardCode: "URLONLY1", label: "Sajt", kind: "url" });
    await plainCard(t, w, { cardCode: "NOTARGT1", label: "Bez odredišta", kind: null });
    await plainCard(t, w, { cardCode: "TUDJA001", label: "Tuđa kartica", kind: "menu", business: "b" });

    const result = await listA(t, w.ownerId);
    const byCode = cardsByCode(result);
    expect([...byCode.keys()].sort()).toEqual(["LINKED01", "OLDMENU1", "RETARGT1"]);

    expect(byCode.get("LINKED01")).toEqual({
      id: linked.cardId,
      cardCode: "LINKED01",
      label: "Sto 1",
      status: "active",
      managedByScanMe: false,
      opensMenu: true,
      link: { pageKey, positionId: null, active: true },
      totalScans: 0,
      lastScanAt: null,
      createdAt: expect.any(Number),
    });
    // Retargeted away, but its link remains: shown, no longer opens the Menu.
    expect(byCode.get("RETARGT1")).toMatchObject({
      opensMenu: false,
      link: { pageKey, active: true },
    });
    // A pre-K20 Menu card without a link row.
    expect(byCode.get("OLDMENU1")).toMatchObject({ opensMenu: true, link: null });
    expect(result?.truncated).toBe(false);
  });

  test("link: position and an inactive row are reported; a link row of another service is ignored", async () => {
    const t = newTest();
    const w = await world(t);
    const position = await addPosition(t, w.a.menuServiceId, "Sto 7");
    const onPosition = await plainCard(t, w, { cardCode: "ONPOS001", label: "Sto 7", kind: "menu" });
    const inactive = await plainCard(t, w, { cardCode: "INACT001", label: "Neaktivna", kind: "menu" });
    const foreign = await plainCard(t, w, { cardCode: "FOREIGN1", label: "Tuđa veza", kind: "menu" });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("menuQrLinks", {
        menuServiceId: w.a.menuServiceId,
        cardId: onPosition,
        positionId: position,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("menuQrLinks", {
        menuServiceId: w.a.menuServiceId,
        cardId: inactive,
        active: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("menuQrLinks", {
        menuServiceId: w.b.menuServiceId,
        cardId: foreign,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    });

    const byCode = cardsByCode(await listA(t, w.ownerId));
    expect(byCode.get("ONPOS001")?.link).toEqual({ pageKey: null, positionId: position, active: true });
    expect(byCode.get("INACT001")?.link).toEqual({ pageKey: null, positionId: null, active: false });
    expect(byCode.get("FOREIGN1")?.link).toBeNull();
  });

  test("lastScanAt is the newest scan event; totalScans comes from the card", async () => {
    const t = newTest();
    const w = await world(t);
    const scanned = await plainCard(t, w, { cardCode: "SCANNED1", label: "Skenirana", kind: "menu" });
    await plainCard(t, w, { cardCode: "NEVER001", label: "Nikad", kind: "menu" });
    await t.run(async (ctx) => {
      await ctx.db.patch(scanned, { totalScans: 3 });
      for (const [index, occurredAt] of [1_000, 5_000, 3_000].entries()) {
        await ctx.db.insert("cardScanEvents", {
          cardId: scanned,
          requestId: `req-${index}`,
          occurredAt,
          targetKind: "menu",
        });
      }
    });

    const byCode = cardsByCode(await listA(t, w.ownerId));
    expect(byCode.get("SCANNED1")).toMatchObject({ lastScanAt: 5_000, totalScans: 3 });
    expect(byCode.get("NEVER001")).toMatchObject({ lastScanAt: null, totalScans: 0 });
  });

  test("sort: active first, then the label in natural order; disabled cards last", async () => {
    const t = newTest();
    const w = await world(t);
    for (const [index, label] of ["Sto 10", "Sto 2", "Sto 1", "Bar"].entries()) {
      await plainCard(t, w, { cardCode: `SORT000${index}`, label, kind: "menu" });
    }
    const disabled = await plainCard(t, w, { cardCode: "SORT0009", label: "Aaa", kind: "menu" });
    await t.run(async (ctx) => {
      await ctx.db.patch(disabled, { status: "disabled" });
    });

    const labels = (await listA(t, w.ownerId))?.cards.map((card) => card.label);
    expect(labels).toEqual(["Bar", "Sto 1", "Sto 2", "Sto 10", "Aaa"]);
  });

  test("pages: the active pages of the service in order, archived ones left out", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const breakfast = await addPage(t, w.ownerId, w.a.menuServiceId, "Doručak");
    await archivePage(t, breakfast.pageId);
    await addPage(t, w.otherOwnerId, w.b.menuServiceId, "Tuđa stranica");

    const result = await listA(t, w.ownerId);
    expect(result?.pages).toEqual([
      { key: expect.any(String), name: "Kompletan meni", slug: expect.any(String), isDefault: true },
      { key: wine.key, name: "Vinska karta", slug: wine.slug, isDefault: false },
    ]);
  });

  test("an adopted card is listed as managed by ScanMe, with the destination of its subject", async () => {
    const t = newTest();
    const w = await world(t);
    const cardId = await plainCard(t, w, { cardCode: "ADOPTED1", label: "Sto 3", kind: "menu" });
    const other = await plainCard(t, w, { cardCode: "ADOPTED2", label: "Sto 4", kind: "url" });
    await adoptCard(t, w, cardId);
    await adoptCard(t, w, other);

    const byCode = cardsByCode(await listA(t, w.ownerId));
    expect(byCode.get("ADOPTED1")).toMatchObject({ managedByScanMe: true, opensMenu: true });
    expect(byCode.has("ADOPTED2")).toBe(false); // adopted, not the Menu, no link
  });

  test("truncated is set when the business has more cards than the section reads", async () => {
    const t = newTest();
    const w = await world(t);
    await bulkMenuCards(t, w, MENU_MAX_QR_CARDS);
    const exact = await listA(t, w.ownerId);
    expect(exact?.cards).toHaveLength(MENU_MAX_QR_CARDS);
    expect(exact?.truncated).toBe(false);

    await plainCard(t, w, { cardCode: "EXTRA001", label: "Višak", kind: "menu" });
    const over = await listA(t, w.ownerId);
    expect(over?.truncated).toBe(true);
    expect(over?.cards).toHaveLength(MENU_MAX_QR_CARDS);
  }, 60_000);
});

describe("menuQr.mintCards: roles", () => {
  test("owner, manager and admin mint; editor, finance, view-only, outsiders and anonymous do not", async () => {
    const t = newTest();
    const w = await world(t);
    for (const userId of [w.ownerId, w.managerId, w.adminId]) {
      const { created } = await mintA(t, w, { count: 1 }, userId);
      expect(created).toHaveLength(1);
    }
    for (const userId of [w.editorId, w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      await expect(mintA(t, w, { count: 1 }, userId)).rejects.toThrow(MENU_ERROR.forbidden);
    }
    await expect(
      t.mutation(api.menuQr.mintCards, { slug: SLUG_A, pageKey: null, count: 1 }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    expect(await cardsOf(t, w.a.businessId)).toHaveLength(3);
    expect(await cardsOf(t, w.b.businessId)).toHaveLength(0);
  });

  test("an unknown slug is menu/not_found", async () => {
    const t = newTest();
    const w = await world(t);
    await expect(
      as(t, w.ownerId).mutation(api.menuQr.mintCards, { slug: "nema-takvog-lokala", pageKey: null, count: 1 }),
    ).rejects.toThrow(MENU_ERROR.notFound);
  });
});

describe("menuQr.mintCards: for positions", () => {
  test("one Menu card per position: label, target, link, unique 8-character codes, audit", async () => {
    const t = newTest();
    const w = await world(t);
    const revisionBefore = await revisionOf(t, w.a.menuServiceId);
    const positions = [
      await addPosition(t, w.a.menuServiceId, "Sto 1"),
      await addPosition(t, w.a.menuServiceId, "Sto 2"),
      await addPosition(t, w.a.menuServiceId, "Soba 5"),
    ];

    const { created } = await mintA(t, w, { positionIds: positions });
    expect(created.map((card) => card.label)).toEqual(["Sto 1", "Sto 2", "Soba 5"]);
    expect(new Set(created.map((card) => card.cardCode)).size).toBe(3);

    for (const [index, entry] of created.entries()) {
      expect(entry.cardCode).toMatch(CODE_PATTERN);
      const card = await cardOf(t, entry.cardId);
      expect(card).toMatchObject({
        businessId: w.a.businessId,
        cardCode: entry.cardCode,
        label: entry.label,
        status: "active",
        totalScans: 0,
      });
      expect(card.accessChannelId).toBeUndefined();
      const targets = await targetsOf(t, entry.cardId);
      expect(targets).toHaveLength(1);
      expect(targets[0]).toMatchObject({ kind: "menu", createdByUserId: w.ownerId });
      expect(card.currentTargetId).toBe(targets[0]._id);

      const links = await linksOf(t, entry.cardId);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({
        menuServiceId: w.a.menuServiceId,
        positionId: positions[index],
        active: true,
      });
      expect(links[0].pageKey).toBeUndefined();
    }

    const audit = await auditOf(t, w.a.menuServiceId, "qr.minted");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorKind: "user", actorUserId: w.ownerId, details: { count: 3 } });
    // Operational: the draft is untouched.
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revisionBefore);
  });

  test("with a page: every card opens that page on its table", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const position = await addPosition(t, w.a.menuServiceId, "Sto 9");

    const { created } = await mintA(t, w, { positionIds: [position], pageKey: wine.key });
    expect(created[0].label).toBe("Sto 9"); // the position's label, not the page's
    expect((await linksOf(t, created[0].cardId))[0]).toMatchObject({
      pageKey: wine.key,
      positionId: position,
    });
  });

  test("the minted cards show up in listCards and a scan resolves them through the hop", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const position = await addPosition(t, w.a.menuServiceId, "Sto 4");
    const { created } = await mintA(t, w, { positionIds: [position], pageKey: wine.key });

    const listed = await listA(t, w.ownerId);
    expect(listed?.cards).toEqual([
      expect.objectContaining({
        id: created[0].cardId,
        label: "Sto 4",
        opensMenu: true,
        link: { pageKey: wine.key, positionId: position, active: true },
        lastScanAt: null,
      }),
    ]);

    const outcome = await t.mutation(api.cards.resolveAndRecord, {
      cardCode: created[0].cardCode,
      requestId: "scan-1",
      deviceCategory: "mobile" as const,
      ipHash: "test-ip-hash",
    });
    expect(outcome).toEqual({
      kind: "menu",
      businessSlug: SLUG_A,
      pagePath: wine.slug,
      hop: true,
      cardCode: created[0].cardCode,
    });
    const after = await listA(t, w.ownerId);
    expect(after?.cards[0].totalScans).toBe(1);
    expect(after?.cards[0].lastScanAt).toEqual(expect.any(Number));
  });

  test("a batch of the maximum size is accepted", async () => {
    const t = newTest();
    const w = await world(t);
    const positions: Id<"menuPositions">[] = [];
    for (let index = 1; index <= MENU_MAX_QR_MINT_BATCH; index += 1) {
      positions.push(await addPosition(t, w.a.menuServiceId, `Sto ${index}`));
    }
    const { created } = await mintA(t, w, { positionIds: positions });
    expect(created).toHaveLength(MENU_MAX_QR_MINT_BATCH);
    expect(new Set(created.map((card) => card.cardCode)).size).toBe(MENU_MAX_QR_MINT_BATCH);
  });

  test("an archived position refuses the whole batch and writes nothing", async () => {
    const t = newTest();
    const w = await world(t);
    const live = await addPosition(t, w.a.menuServiceId, "Sto 1");
    const archived = await addPosition(t, w.a.menuServiceId, "Sto 2", false);

    await expect(mintA(t, w, { positionIds: [live, archived] })).rejects.toThrow(FLOOR_ERROR.positionArchived);
    expect(await cardsOf(t, w.a.businessId)).toHaveLength(0);
    expect(await auditOf(t, w.a.menuServiceId, "qr.minted")).toHaveLength(0);
  });

  test("a position of another tenant is menu/not_found", async () => {
    const t = newTest();
    const w = await world(t);
    const own = await addPosition(t, w.a.menuServiceId, "Sto 1");
    const foreign = await addPosition(t, w.b.menuServiceId, "Tuđ sto");

    await expect(mintA(t, w, { positionIds: [own, foreign] })).rejects.toThrow(MENU_ERROR.notFound);
    expect(await cardsOf(t, w.a.businessId)).toHaveLength(0);
    expect(await cardsOf(t, w.b.businessId)).toHaveLength(0);
  });
});

describe("menuQr.mintCards: for a page", () => {
  test("count cards with no position, labelled with the page name, all opening the page", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");

    const { created } = await mintA(t, w, { count: 3, pageKey: wine.key });
    expect(created.map((card) => card.label)).toEqual(["Vinska karta", "Vinska karta", "Vinska karta"]);
    expect(new Set(created.map((card) => card.cardCode)).size).toBe(3);
    for (const entry of created) {
      expect(entry.cardCode).toMatch(CODE_PATTERN);
      const links = await linksOf(t, entry.cardId);
      expect(links).toHaveLength(1);
      expect(links[0]).toMatchObject({ pageKey: wine.key, active: true });
      expect(links[0].positionId).toBeUndefined();
      expect((await targetsOf(t, entry.cardId))[0].kind).toBe("menu");
    }
    expect((await auditOf(t, w.a.menuServiceId, "qr.minted"))[0].details).toEqual({ count: 3 });
  });

  test("the default page and 'no page' get the neutral label, not the internal page name", async () => {
    const t = newTest();
    const w = await world(t);
    const entryKey = await defaultPageKey(t, w);

    const onDefault = await mintA(t, w, { count: 1, pageKey: entryKey });
    const noPage = await mintA(t, w, { count: 1, pageKey: null });
    expect(onDefault.created[0].label).toBe(menuDomenSr.qrCardDefaultLabel);
    expect(noPage.created[0].label).toBe(menuDomenSr.qrCardDefaultLabel);
    expect(onDefault.created[0].label).not.toBe(menuDomenSr.defaultPageName);
    expect((await linksOf(t, onDefault.created[0].cardId))[0].pageKey).toBe(entryKey);
    expect((await linksOf(t, noPage.created[0].cardId))[0].pageKey).toBeUndefined();
  });

  test("the maximum batch is accepted", async () => {
    const t = newTest();
    const w = await world(t);
    const { created } = await mintA(t, w, { count: MENU_MAX_QR_MINT_BATCH });
    expect(created).toHaveLength(MENU_MAX_QR_MINT_BATCH);
    expect(await cardsOf(t, w.a.businessId)).toHaveLength(MENU_MAX_QR_MINT_BATCH);
  });

  test("an archived page, an unknown key and another tenant's page are floor/page_unavailable", async () => {
    const t = newTest();
    const w = await world(t);
    const archived = await addPage(t, w.ownerId, w.a.menuServiceId, "Doručak");
    await archivePage(t, archived.pageId);
    const foreign = await addPage(t, w.otherOwnerId, w.b.menuServiceId, "Tuđa stranica");
    const position = await addPosition(t, w.a.menuServiceId, "Sto 1");

    for (const pageKey of [archived.key, "pg_nepostojeca", "", foreign.key]) {
      await expect(mintA(t, w, { count: 1, pageKey })).rejects.toThrow(FLOOR_ERROR.pageUnavailable);
      await expect(mintA(t, w, { positionIds: [position], pageKey })).rejects.toThrow(
        FLOOR_ERROR.pageUnavailable,
      );
    }
    expect(await cardsOf(t, w.a.businessId)).toHaveLength(0);
  });
});

describe("menuQr.mintCards: input and ceilings", () => {
  test("exactly one of positionIds or count, and a sensible size", async () => {
    const t = newTest();
    const w = await world(t);
    const one = await addPosition(t, w.a.menuServiceId, "Sto 1");
    const many: Id<"menuPositions">[] = [];
    for (let index = 0; index <= MENU_MAX_QR_MINT_BATCH; index += 1) {
      many.push(await addPosition(t, w.a.menuServiceId, `Soba ${index}`));
    }
    expect(many).toHaveLength(MENU_MAX_QR_MINT_BATCH + 1);

    const bad: { positionIds?: Id<"menuPositions">[]; count?: number }[] = [
      {}, // neither
      { positionIds: [one], count: 1 }, // both
      { positionIds: [] },
      { positionIds: many }, // 51 distinct positions
      { positionIds: [one, one] }, // duplicate
      { count: 0 },
      { count: -1 },
      { count: MENU_MAX_QR_MINT_BATCH + 1 },
      { count: 1.5 },
      { count: Number.NaN },
    ];
    for (const input of bad) {
      await expect(mintA(t, w, input)).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await cardsOf(t, w.a.businessId)).toHaveLength(0);
    expect(await auditOf(t, w.a.menuServiceId, "qr.minted")).toHaveLength(0);
  });

  test("the ceiling counts every card of the business, so a minted card is never past what listCards reads", async () => {
    const t = newTest();
    const w = await world(t);
    await bulkMenuCards(t, w, MENU_MAX_QR_CARDS - 2);
    // A card of another destination takes a place in the window too.
    await plainCard(t, w, { cardCode: "URLONLY1", label: "Sajt", kind: "url" });

    await expect(mintA(t, w, { count: 2 })).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await cardsOf(t, w.a.businessId)).toHaveLength(MENU_MAX_QR_CARDS - 1);

    const { created } = await mintA(t, w, { count: 1 });
    expect(created).toHaveLength(1);
    await expect(mintA(t, w, { count: 1 })).rejects.toThrow(MENU_ERROR.limitReached);
    expect(await cardsOf(t, w.a.businessId)).toHaveLength(MENU_MAX_QR_CARDS);

    const listed = await listA(t, w.ownerId);
    expect(listed?.truncated).toBe(false);
    expect(listed?.cards.map((card) => card.cardCode)).toContain(created[0].cardCode);
    expect(listed?.cards).toHaveLength(MENU_MAX_QR_CARDS - 1); // every card but the url one
  }, 60_000);

  test("gives up with limit_reached when no free code is found in 8 attempts, writing nothing", async () => {
    const t = newTest();
    const w = await world(t);
    await plainCard(t, w, { cardCode: "00000000", label: "Zauzeta šifra", kind: "url" });
    const original = crypto.getRandomValues.bind(crypto);
    const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation(((array: ArrayBufferView) => {
      if (array instanceof Uint8Array && array.length === 8) {
        array.fill(0); // always the taken code "00000000"
        return array;
      }
      return original(array);
    }) as unknown as typeof crypto.getRandomValues);

    await expect(mintA(t, w, { count: 1 })).rejects.toThrow(MENU_ERROR.limitReached);
    const attempts = spy.mock.calls.filter(([array]) => (array as Uint8Array).length === 8).length;
    expect(attempts).toBe(8);
    spy.mockRestore();
    expect(await cardsOf(t, w.a.businessId)).toHaveLength(1);
    expect(await auditOf(t, w.a.menuServiceId, "qr.minted")).toHaveLength(0);
  });
});

describe("menuQr.linkCard", () => {
  test("upserts one link row: change the page and position, then keep the same row", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const bar = await addPage(t, w.ownerId, w.a.menuServiceId, "Bar");
    const second = await addPosition(t, w.a.menuServiceId, "Sto 2");
    const { card } = await mintedCard(t, w);
    const revisionBefore = await revisionOf(t, w.a.menuServiceId);
    const [initial] = await linksOf(t, card.cardId);

    await as(t, w.ownerId).mutation(api.menuQr.linkCard, {
      cardId: card.cardId,
      pageKey: wine.key,
      positionId: second,
    });
    let links = await linksOf(t, card.cardId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ _id: initial._id, pageKey: wine.key, positionId: second, active: true });

    await as(t, w.managerId).mutation(api.menuQr.linkCard, {
      cardId: card.cardId,
      pageKey: bar.key,
      positionId: null,
    });
    links = await linksOf(t, card.cardId);
    expect(links).toHaveLength(1);
    expect(links[0]._id).toBe(initial._id);
    expect(links[0].pageKey).toBe(bar.key);
    expect(links[0].positionId).toBeUndefined(); // removed, not left stale

    const linked = await auditOf(t, w.a.menuServiceId, "qr.linked");
    expect(linked).toHaveLength(2);
    expect(linked[0]).toMatchObject({
      actorKind: "user",
      actorUserId: w.ownerId,
      entityType: "cards",
      entityKey: card.cardCode,
    });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revisionBefore);
    // The card itself keeps its destination history: no new cardTargets row.
    expect(await targetsOf(t, card.cardId)).toHaveLength(1);
  });

  test("both null unlinks: the row stays without page and position, audited as qr.unlinked", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const { card } = await mintedCard(t, w, wine.key);

    await as(t, w.ownerId).mutation(api.menuQr.linkCard, {
      cardId: card.cardId,
      pageKey: null,
      positionId: null,
    });
    const links = await linksOf(t, card.cardId);
    expect(links).toHaveLength(1);
    expect(links[0].pageKey).toBeUndefined();
    expect(links[0].positionId).toBeUndefined();
    expect(links[0].active).toBe(true);

    const unlinked = await auditOf(t, w.a.menuServiceId, "qr.unlinked");
    expect(unlinked).toHaveLength(1);
    expect(unlinked[0]).toMatchObject({ entityType: "cards", entityKey: card.cardCode });
    expect(await auditOf(t, w.a.menuServiceId, "qr.linked")).toHaveLength(0);

    const listed = await listA(t, w.ownerId);
    expect(listed?.cards[0].link).toEqual({ pageKey: null, positionId: null, active: true });
  });

  test("a card with no link row gets one; an inactive link is switched on again", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const position = await addPosition(t, w.a.menuServiceId, "Sto 5");
    const bare = await plainCard(t, w, { cardCode: "OLDMENU1", label: "Stari meni", kind: "menu" });
    const off = await plainCard(t, w, { cardCode: "OFFLINK1", label: "Ugašena veza", kind: "menu" });
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("menuQrLinks", {
        menuServiceId: w.a.menuServiceId,
        cardId: off,
        pageKey: wine.key,
        active: false,
        createdAt: now,
        updatedAt: now,
      });
    });

    await as(t, w.ownerId).mutation(api.menuQr.linkCard, { cardId: bare, pageKey: wine.key, positionId: position });
    expect(await linksOf(t, bare)).toEqual([
      expect.objectContaining({ menuServiceId: w.a.menuServiceId, pageKey: wine.key, positionId: position, active: true }),
    ]);

    await as(t, w.ownerId).mutation(api.menuQr.linkCard, { cardId: off, pageKey: wine.key, positionId: null });
    const links = await linksOf(t, off);
    expect(links).toHaveLength(1);
    expect(links[0].active).toBe(true);
  });

  test("linking what is already linked writes and audits nothing", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const { position, card } = await mintedCard(t, w, wine.key);
    const before = await linksOf(t, card.cardId);

    await as(t, w.ownerId).mutation(api.menuQr.linkCard, {
      cardId: card.cardId,
      pageKey: wine.key,
      positionId: position,
    });
    expect(await linksOf(t, card.cardId)).toEqual(before);
    expect(await auditOf(t, w.a.menuServiceId, "qr.linked")).toHaveLength(0);
  });

  test("an archived or unknown page and an archived position are refused; the link stays as it was", async () => {
    const t = newTest();
    const w = await world(t);
    const archivedPage = await addPage(t, w.ownerId, w.a.menuServiceId, "Doručak");
    await archivePage(t, archivedPage.pageId);
    const archivedPosition = await addPosition(t, w.a.menuServiceId, "Sto 8", false);
    const { card } = await mintedCard(t, w);
    const before = await linksOf(t, card.cardId);
    const call = (pageKey: string | null, positionId: Id<"menuPositions"> | null) =>
      as(t, w.ownerId).mutation(api.menuQr.linkCard, { cardId: card.cardId, pageKey, positionId });

    await expect(call(archivedPage.key, null)).rejects.toThrow(FLOOR_ERROR.pageUnavailable);
    await expect(call("pg_nepostojeca", null)).rejects.toThrow(FLOOR_ERROR.pageUnavailable);
    await expect(call(null, archivedPosition)).rejects.toThrow(FLOOR_ERROR.positionArchived);
    expect(await linksOf(t, card.cardId)).toEqual(before);
    expect(await auditOf(t, w.a.menuServiceId, "qr.linked")).toHaveLength(0);
    expect(await auditOf(t, w.a.menuServiceId, "qr.unlinked")).toHaveLength(0);
  });

  test("a position or page of another tenant is refused", async () => {
    const t = newTest();
    const w = await world(t);
    const foreignPosition = await addPosition(t, w.b.menuServiceId, "Tuđ sto");
    const foreignPage = await addPage(t, w.otherOwnerId, w.b.menuServiceId, "Tuđa stranica");
    const { card } = await mintedCard(t, w);

    await expect(
      as(t, w.ownerId).mutation(api.menuQr.linkCard, {
        cardId: card.cardId,
        pageKey: null,
        positionId: foreignPosition,
      }),
    ).rejects.toThrow(MENU_ERROR.notFound);
    await expect(
      as(t, w.ownerId).mutation(api.menuQr.linkCard, {
        cardId: card.cardId,
        pageKey: foreignPage.key,
        positionId: null,
      }),
    ).rejects.toThrow(FLOOR_ERROR.pageUnavailable);
  });

  test("a card whose current destination is not the Menu is floor/card_not_menu", async () => {
    const t = newTest();
    const w = await world(t);
    const pageKey = await defaultPageKey(t, w);
    const retargeted = await t.run(async (ctx) =>
      seedQrLink(ctx, {
        menuServiceId: w.a.menuServiceId,
        businessId: w.a.businessId,
        pageKey,
        createdByUserId: w.ownerId,
        cardCode: "RETARGT1",
        targetKind: "url",
      }),
    );
    const url = await plainCard(t, w, { cardCode: "URLONLY1", label: "Sajt", kind: "url" });
    const none = await plainCard(t, w, { cardCode: "NOTARGT1", label: "Bez odredišta", kind: null });

    for (const cardId of [retargeted.cardId, url, none]) {
      await expect(
        as(t, w.ownerId).mutation(api.menuQr.linkCard, { cardId, pageKey: null, positionId: null }),
      ).rejects.toThrow(FLOOR_ERROR.cardNotMenu);
    }
    expect(await auditOf(t, w.a.menuServiceId, "qr.unlinked")).toHaveLength(0);
  });

  test("an adopted card is read-only, even when its channel is gone", async () => {
    const t = newTest();
    const w = await world(t);
    const wine = await addPage(t, w.ownerId, w.a.menuServiceId, "Vinska karta");
    const adopted = await plainCard(t, w, { cardCode: "ADOPTED1", label: "Sto 3", kind: "menu" });
    const dangling = await plainCard(t, w, { cardCode: "ADOPTED2", label: "Sto 4", kind: "menu" });
    await adoptCard(t, w, adopted);
    const { channelId } = await adoptCard(t, w, dangling);
    // The refusal comes before the channel is read: a dangling channel id is the same answer.
    await t.run(async (ctx) => {
      await ctx.db.delete(channelId);
    });

    for (const cardId of [adopted, dangling]) {
      await expect(
        as(t, w.ownerId).mutation(api.menuQr.linkCard, { cardId, pageKey: wine.key, positionId: null }),
      ).rejects.toThrow(FLOOR_ERROR.cardReadOnly);
    }
    expect(await linksOf(t, adopted)).toEqual([]);
    expect(await linksOf(t, dangling)).toEqual([]);
  });

  test("another business's card, a missing card and an unauthorised caller", async () => {
    const t = newTest();
    const w = await world(t);
    const { card } = await mintedCard(t, w);
    const foreignCard = await plainCard(t, w, { cardCode: "TUDJA001", label: "Tuđa", kind: "menu", business: "b" });
    const gone = await plainCard(t, w, { cardCode: "GONE0001", label: "Obrisana", kind: "menu" });
    await t.run(async (ctx) => {
      await ctx.db.delete(gone);
    });
    const unlink = (cardId: Id<"cards">) => ({ cardId, pageKey: null, positionId: null });

    // Tenant isolation: the same answer as for a card that does not exist.
    await expect(as(t, w.ownerId).mutation(api.menuQr.linkCard, unlink(foreignCard))).rejects.toThrow(MENU_ERROR.notFound);
    await expect(as(t, w.otherOwnerId).mutation(api.menuQr.linkCard, unlink(card.cardId))).rejects.toThrow(MENU_ERROR.notFound);
    await expect(as(t, w.ownerId).mutation(api.menuQr.linkCard, unlink(gone))).rejects.toThrow(MENU_ERROR.notFound);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId]) {
      await expect(as(t, userId).mutation(api.menuQr.linkCard, unlink(card.cardId))).rejects.toThrow(MENU_ERROR.notFound);
    }
    // A member without the permission is told so.
    await expect(as(t, w.editorId).mutation(api.menuQr.linkCard, unlink(card.cardId))).rejects.toThrow(MENU_ERROR.forbidden);
    await expect(t.mutation(api.menuQr.linkCard, unlink(card.cardId))).rejects.toThrow(MENU_ERROR.unauthenticated);
    // Admin may.
    await as(t, w.adminId).mutation(api.menuQr.linkCard, unlink(card.cardId));
    expect(await auditOf(t, w.a.menuServiceId, "qr.unlinked")).toEqual([
      expect.objectContaining({ actorKind: "admin", actorUserId: w.adminId }),
    ]);
  });
});

describe("menuQr.setCardActive", () => {
  test("disables and re-enables a card, audited; the destination and link are untouched", async () => {
    const t = newTest();
    const w = await world(t);
    const { card } = await mintedCard(t, w);
    const created = await cardOf(t, card.cardId);
    const linksBefore = await linksOf(t, card.cardId);
    const revisionBefore = await revisionOf(t, w.a.menuServiceId);

    await as(t, w.ownerId).mutation(api.menuQr.setCardActive, { cardId: card.cardId, active: false });
    const disabled = await cardOf(t, card.cardId);
    expect(disabled.status).toBe("disabled");
    expect(disabled.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    expect(disabled.currentTargetId).toBe(created.currentTargetId);
    expect((await listA(t, w.ownerId))?.cards[0]).toMatchObject({ status: "disabled", opensMenu: true });

    await as(t, w.managerId).mutation(api.menuQr.setCardActive, { cardId: card.cardId, active: true });
    expect((await cardOf(t, card.cardId)).status).toBe("active");

    const audit = await auditOf(t, w.a.menuServiceId, "qr.card_status");
    expect(audit.map((row) => row.details)).toEqual([{ active: false }, { active: true }]);
    expect(audit[0]).toMatchObject({ actorKind: "user", actorUserId: w.ownerId, entityType: "cards", entityKey: card.cardCode });
    expect(await linksOf(t, card.cardId)).toEqual(linksBefore);
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revisionBefore);
  });

  // K34 (intentional): this test used to assert that setCardActive "works for any
  // card of the business, not only Menu cards". That let a Menu manager switch off
  // (or on) a Memories, Links or ordering card of the venue through the Menu API.
  // Now only a card whose CURRENT destination is the Menu switches (as linkCard
  // checks); any other card is floor/card_not_menu and keeps its status.
  test("switches Menu cards only: any other destination is floor/card_not_menu and unchanged; repeating it is a no-op", async () => {
    const t = newTest();
    const w = await world(t);
    const url = await plainCard(t, w, { cardCode: "URLONLY1", label: "Sajt", kind: "url" });
    const none = await plainCard(t, w, { cardCode: "NOTARGT1", label: "Bez odredišta", kind: null });
    const menu = await plainCard(t, w, { cardCode: "OLDMENU1", label: "Stari meni", kind: "menu" });

    for (const cardId of [url, none]) {
      await expect(
        as(t, w.ownerId).mutation(api.menuQr.setCardActive, { cardId, active: false }),
      ).rejects.toThrow(FLOOR_ERROR.cardNotMenu);
      expect((await cardOf(t, cardId)).status).toBe("active");
    }
    expect(await auditOf(t, w.a.menuServiceId, "qr.card_status")).toHaveLength(0);

    await as(t, w.ownerId).mutation(api.menuQr.setCardActive, { cardId: menu, active: false });
    expect((await cardOf(t, menu)).status).toBe("disabled");
    await as(t, w.ownerId).mutation(api.menuQr.setCardActive, { cardId: menu, active: false });
    expect(await auditOf(t, w.a.menuServiceId, "qr.card_status")).toHaveLength(1);
  });

  test("an adopted card is read-only; other tenants and unauthorised callers are refused", async () => {
    const t = newTest();
    const w = await world(t);
    const adopted = await plainCard(t, w, { cardCode: "ADOPTED1", label: "Sto 3", kind: "menu" });
    await adoptCard(t, w, adopted);
    const { card } = await mintedCard(t, w);
    const foreignCard = await plainCard(t, w, { cardCode: "TUDJA001", label: "Tuđa", kind: "menu", business: "b" });
    const off = (cardId: Id<"cards">) => ({ cardId, active: false });

    await expect(as(t, w.ownerId).mutation(api.menuQr.setCardActive, off(adopted))).rejects.toThrow(FLOOR_ERROR.cardReadOnly);
    expect((await cardOf(t, adopted)).status).toBe("active");

    await expect(as(t, w.ownerId).mutation(api.menuQr.setCardActive, off(foreignCard))).rejects.toThrow(MENU_ERROR.notFound);
    await expect(as(t, w.otherOwnerId).mutation(api.menuQr.setCardActive, off(card.cardId))).rejects.toThrow(MENU_ERROR.notFound);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId]) {
      await expect(as(t, userId).mutation(api.menuQr.setCardActive, off(card.cardId))).rejects.toThrow(MENU_ERROR.notFound);
    }
    await expect(as(t, w.editorId).mutation(api.menuQr.setCardActive, off(card.cardId))).rejects.toThrow(MENU_ERROR.forbidden);
    await expect(t.mutation(api.menuQr.setCardActive, off(card.cardId))).rejects.toThrow(MENU_ERROR.unauthenticated);

    expect((await cardOf(t, card.cardId)).status).toBe("active");
    expect((await cardOf(t, foreignCard)).status).toBe("active");
    expect(await auditOf(t, w.a.menuServiceId, "qr.card_status")).toHaveLength(0);

    await as(t, w.adminId).mutation(api.menuQr.setCardActive, off(card.cardId));
    expect((await cardOf(t, card.cardId)).status).toBe("disabled");
  });
});
