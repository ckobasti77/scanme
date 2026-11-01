/// <reference types="vite/client" />

// ScanMe Menu V1 — K34: two review fixes on the Menu QR cards (convex/menuQr.ts).
//   C3  setCardActive switches Menu cards only (as linkCard): a Memories, Links,
//       ordering or any other card of the same venue is floor/card_not_menu and
//       keeps its status.
//   C2  "Lokal i QR" shows an adopted (ScanMe-managed) card by the state a scan
//       sees. The resolver ignores cards.status for those cards and goes by the
//       access channel (redirectEnabled and state "active"), so listCards does
//       too, and the diagnosis (lib/menu/qr-diagnostics.ts) follows the view model.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { FLOOR_ERROR } from "../lib/menu/errors/floor";
import { dijagnozaKartice } from "../lib/menu/qr-diagnostics";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

// Typed by the schema (ReturnType<typeof convexTest> would lose the index types).
const newTest = () => {
  const t = convexTest(schema, modules);
  // The parity test below scans through the real resolver, which spends a cardResolve token.
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

type TargetKind = "menu" | "url" | "memories_space" | "service_page" | "table_ordering" | "venue";

function targetFields(kind: TargetKind) {
  return kind === "url" ? { url: "https://example.com" } : {};
}

/** A card of the business; `kind` null = no destination at all. Never linked. */
async function cardWith(
  t: T,
  w: MenuWorldSeed,
  input: {
    cardCode: string;
    label: string;
    kind: TargetKind | null;
    status?: "active" | "disabled";
    business?: "a" | "b";
  },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const seed = input.business === "b" ? w.b : w.a;
    const cardId = await ctx.db.insert("cards", {
      businessId: seed.businessId,
      cardCode: input.cardCode,
      label: input.label,
      status: input.status ?? "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });
    if (input.kind) {
      const targetId = await ctx.db.insert("cardTargets", {
        cardId,
        kind: input.kind,
        ...targetFields(input.kind),
        createdByUserId: w.ownerId,
        createdAt: now,
      });
      await ctx.db.patch(cardId, { currentTargetId: targetId });
    }
    return cardId;
  });
}

/** Cards keep their destination history: a retarget adds a row and moves the pointer to it. */
async function retarget(t: T, w: MenuWorldSeed, cardId: Id<"cards">, kind: TargetKind) {
  await t.run(async (ctx) => {
    const targetId = await ctx.db.insert("cardTargets", {
      cardId,
      kind,
      ...targetFields(kind),
      createdByUserId: w.ownerId,
      createdAt: Date.now(),
    });
    await ctx.db.patch(cardId, { currentTargetId: targetId });
  });
}

type ChannelState = { state: "active" | "inactive" | "problem"; redirectEnabled: boolean };

/**
 * Adopts the card into a ScanMe access channel, consistent enough for the real
 * resolver: the subject is anchored on the card and carries its current target,
 * the channel is healthy and maps back to the card. `channel` is the part under
 * test (what ScanMe switched).
 */
async function adoptCard(
  t: T,
  w: MenuWorldSeed,
  cardId: Id<"cards">,
  channel: ChannelState = { state: "active", redirectEnabled: true },
) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const card = await ctx.db.get(cardId);
    if (!card) throw new Error("card missing");
    const subjectId = await ctx.db.insert("accessSubjects", {
      accountId: w.a.accountId,
      businessId: w.a.businessId,
      anchorCardId: cardId,
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
      state: channel.state,
      redirectEnabled: channel.redirectEnabled,
      health: "healthy",
      binding: "digital",
      searchText: card.cardCode.toLowerCase(),
      totalScans: 0,
      lastActor: { kind: "system", source: "menuQrK34.test" },
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

async function auditOf(t: T, menuServiceId: Id<"menuServices">, action: string) {
  const rows = await t.run(async (ctx) =>
    ctx.db
      .query("menuAuditLog")
      .withIndex("by_menuServiceId_and_createdAt", (q) => q.eq("menuServiceId", menuServiceId))
      .collect(),
  );
  return rows.filter((row) => row.action === action);
}

async function listedA(t: T, userId: Id<"users">) {
  const result = await as(t, userId).query(api.menuQr.listCards, { slug: SLUG_A });
  if (!result) throw new Error("listCards returned null");
  return result;
}

type Listed = Awaited<ReturnType<typeof listedA>>;

/** The listed card and what the panel's diagnosis says about it (the same view model). */
function diagnose(listed: Listed, cardCode: string) {
  const card = listed.cards.find((entry) => entry.cardCode === cardCode);
  if (!card) throw new Error(`card ${cardCode} is not listed`);
  return { card, dijagnoza: dijagnozaKartice(card, { pages: listed.pages, positions: [] }) };
}

describe("K34 C3: menuQr.setCardActive switches Menu cards only", () => {
  test("a Memories, Links, ordering, venue or url card is floor/card_not_menu, off or on, and stays exactly as it was", async () => {
    const t = newTest();
    const w = await world(t);
    const kinds = ["memories_space", "service_page", "table_ordering", "venue", "url"] as const;
    const active: Id<"cards">[] = [];
    const disabled: Id<"cards">[] = [];
    for (const [index, kind] of kinds.entries()) {
      active.push(await cardWith(t, w, { cardCode: `CARD000${index}`, label: `Aktivna ${kind}`, kind }));
      disabled.push(
        await cardWith(t, w, { cardCode: `ZGAS000${index}`, label: `Ugasena ${kind}`, kind, status: "disabled" }),
      );
    }
    const before = await cardsOf(t, w.a.businessId);

    for (const userId of [w.ownerId, w.managerId]) {
      for (const cardId of active) {
        await expect(
          as(t, userId).mutation(api.menuQr.setCardActive, { cardId, active: false }),
        ).rejects.toThrow(FLOOR_ERROR.cardNotMenu);
      }
      // Switching ON is refused too: a card switched off for another reason is not the Menu's to revive.
      for (const cardId of disabled) {
        await expect(
          as(t, userId).mutation(api.menuQr.setCardActive, { cardId, active: true }),
        ).rejects.toThrow(FLOOR_ERROR.cardNotMenu);
      }
    }

    expect(await cardsOf(t, w.a.businessId)).toEqual(before);
    for (const cardId of active) expect((await cardOf(t, cardId)).status).toBe("active");
    for (const cardId of disabled) expect((await cardOf(t, cardId)).status).toBe("disabled");
    expect(await auditOf(t, w.a.menuServiceId, "qr.card_status")).toHaveLength(0);
  });

  test("the CURRENT destination decides: a card retargeted away from the Menu is refused, one retargeted to it switches", async () => {
    const t = newTest();
    const w = await world(t);
    const away = await cardWith(t, w, { cardCode: "AWAY0001", label: "Sto 1", kind: "menu" });
    await retarget(t, w, away, "url");
    const towards = await cardWith(t, w, { cardCode: "BACK0001", label: "Sto 2", kind: "url" });
    await retarget(t, w, towards, "menu");

    await expect(
      as(t, w.ownerId).mutation(api.menuQr.setCardActive, { cardId: away, active: false }),
    ).rejects.toThrow(FLOOR_ERROR.cardNotMenu);
    expect((await cardOf(t, away)).status).toBe("active");

    await as(t, w.managerId).mutation(api.menuQr.setCardActive, { cardId: towards, active: false });
    expect((await cardOf(t, towards)).status).toBe("disabled");
    await as(t, w.managerId).mutation(api.menuQr.setCardActive, { cardId: towards, active: true });
    expect((await cardOf(t, towards)).status).toBe("active");

    const audit = await auditOf(t, w.a.menuServiceId, "qr.card_status");
    expect(audit.map((row) => row.entityKey)).toEqual(["BACK0001", "BACK0001"]);
  });

  test("the Menu check comes after the access checks: the same answers as before for other tenants and roles, and an adopted card stays read-only", async () => {
    const t = newTest();
    const w = await world(t);
    const own = await cardWith(t, w, { cardCode: "SAJT0001", label: "Sajt", kind: "url" });
    const foreign = await cardWith(t, w, { cardCode: "TUDJ0001", label: "Tudja", kind: "url", business: "b" });
    const adopted = await cardWith(t, w, { cardCode: "ADPT0001", label: "Sto 3", kind: "url" });
    await adoptCard(t, w, adopted);
    const off = (cardId: Id<"cards">) => ({ cardId, active: false });

    // Not the Menu's card and not the caller's tenant: no existence oracle, not card_not_menu.
    await expect(as(t, w.ownerId).mutation(api.menuQr.setCardActive, off(foreign))).rejects.toThrow(MENU_ERROR.notFound);
    await expect(as(t, w.otherOwnerId).mutation(api.menuQr.setCardActive, off(own))).rejects.toThrow(MENU_ERROR.notFound);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId]) {
      await expect(as(t, userId).mutation(api.menuQr.setCardActive, off(own))).rejects.toThrow(MENU_ERROR.notFound);
    }
    await expect(as(t, w.editorId).mutation(api.menuQr.setCardActive, off(own))).rejects.toThrow(MENU_ERROR.forbidden);
    await expect(t.mutation(api.menuQr.setCardActive, off(own))).rejects.toThrow(MENU_ERROR.unauthenticated);
    // ADMIN-12 cards stay refused as before, whatever they open.
    await expect(as(t, w.ownerId).mutation(api.menuQr.setCardActive, off(adopted))).rejects.toThrow(FLOOR_ERROR.cardReadOnly);

    for (const cardId of [own, foreign, adopted]) expect((await cardOf(t, cardId)).status).toBe("active");
    expect(await auditOf(t, w.a.menuServiceId, "qr.card_status")).toHaveLength(0);
  });
});

describe("K34 C2: menuQr.listCards shows an adopted card by its access channel", () => {
  type ChannelCase = { name: string; channel: ChannelState; live: "active" | "disabled" };

  // What the resolver does with an adopted card: it answers unless the channel has
  // redirectEnabled AND state "active" (convex/cards.ts resolveAndRecord).
  const CHANNEL_CASES: ChannelCase[] = [
    { name: "enabled and active", channel: { state: "active", redirectEnabled: true }, live: "active" },
    { name: "switched off", channel: { state: "inactive", redirectEnabled: false }, live: "disabled" },
    { name: "in problem, redirect still on", channel: { state: "problem", redirectEnabled: true }, live: "disabled" },
    { name: "in problem, redirect off", channel: { state: "problem", redirectEnabled: false }, live: "disabled" },
    { name: "state active, redirect off", channel: { state: "active", redirectEnabled: false }, live: "disabled" },
    { name: "redirect on, state inactive", channel: { state: "inactive", redirectEnabled: true }, live: "disabled" },
  ];

  test("the live state and the diagnosis follow the channel, whatever cards.status says, and the real scan agrees", async () => {
    const t = newTest();
    const w = await world(t);
    const planned: { cardCode: string; legacy: "active" | "disabled"; case: ChannelCase }[] = [];
    for (const legacy of ["active", "disabled"] as const) {
      for (const channelCase of CHANNEL_CASES) {
        // Resolver-safe codes: no I, L, O, U (the resolver normalises those).
        const cardCode = `ADPT${String(planned.length).padStart(4, "0")}`;
        const cardId = await cardWith(t, w, {
          cardCode,
          label: `Sto ${planned.length + 1}`,
          kind: "menu",
          status: legacy,
        });
        await adoptCard(t, w, cardId, channelCase.channel);
        planned.push({ cardCode, legacy, case: channelCase });
      }
    }

    const listed = await listedA(t, w.ownerId);
    for (const { cardCode, legacy, case: channelCase } of planned) {
      const what = `${channelCase.name}, cards.status ${legacy}`;
      const { card, dijagnoza } = diagnose(listed, cardCode);
      expect(card.managedByScanMe, what).toBe(true);
      expect(card.opensMenu, what).toBe(true);
      expect(card.status, what).toBe(channelCase.live);
      // A channel that is off shows as the existing "iskljucena" state; an enabled one as "aktivna".
      expect(dijagnoza.stanje, what).toBe(channelCase.live === "active" ? "aktivna" : "iskljucena");
      expect(dijagnoza.otvara === null, what).toBe(channelCase.live === "disabled");
      expect(dijagnoza.samoCitanje, what).toBe(true);
    }

    // The panel and a printed card cannot disagree: the real resolver opens the menu exactly when the panel says active.
    for (const [index, { cardCode, legacy, case: channelCase }] of planned.entries()) {
      const outcome = await t.mutation(api.cards.resolveAndRecord, {
        cardCode,
        requestId: `k34-scan-${index}`,
        deviceCategory: "mobile" as const,
        ipHash: "test-ip-hash",
      });
      expect(outcome.kind, `${channelCase.name}, cards.status ${legacy}`).toBe(
        channelCase.live === "active" ? "menu" : "invalid",
      );
    }
  });

  test("an adopted card whose channel is active is active even though its legacy cards.status is disabled", async () => {
    const t = newTest();
    const w = await world(t);
    const cardId = await cardWith(t, w, { cardCode: "ADPT0001", label: "Sto 1", kind: "menu", status: "disabled" });
    await adoptCard(t, w, cardId);

    const { card, dijagnoza } = diagnose(await listedA(t, w.ownerId), "ADPT0001");
    expect(card).toMatchObject({ status: "active", managedByScanMe: true, opensMenu: true });
    expect(dijagnoza).toMatchObject({
      stanje: "aktivna",
      otvara: { stranica: null, pozicija: null },
      problemi: [],
      samoCitanje: true,
    });
  });

  test("an adopted card whose channel ScanMe switched off is disabled even though its legacy cards.status is active", async () => {
    const t = newTest();
    const w = await world(t);
    const cardId = await cardWith(t, w, { cardCode: "ADPT0001", label: "Sto 1", kind: "menu", status: "active" });
    await adoptCard(t, w, cardId, { state: "inactive", redirectEnabled: false });

    const { card, dijagnoza } = diagnose(await listedA(t, w.ownerId), "ADPT0001");
    expect(card).toMatchObject({ status: "disabled", managedByScanMe: true, opensMenu: true });
    expect(dijagnoza).toMatchObject({ stanje: "iskljucena", otvara: null, problemi: [], samoCitanje: true });
  });

  test("a channel that is gone (broken mapping, the resolver refuses it) is disabled", async () => {
    const t = newTest();
    const w = await world(t);
    const cardId = await cardWith(t, w, { cardCode: "ADPT0001", label: "Sto 1", kind: "menu" });
    const { channelId } = await adoptCard(t, w, cardId);
    // A card with no destination of its own is listed only through its Menu link row.
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("menuQrLinks", {
        menuServiceId: w.a.menuServiceId,
        cardId,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.delete(channelId);
    });

    const { card, dijagnoza } = diagnose(await listedA(t, w.ownerId), "ADPT0001");
    expect(card).toMatchObject({ status: "disabled", managedByScanMe: true });
    expect(dijagnoza.stanje).toBe("iskljucena");
    expect(dijagnoza.otvara).toBeNull();
  });

  test("a legacy card is still switched by cards.status, and the list sorts by the live state", async () => {
    const t = newTest();
    const w = await world(t);
    const adoptedOff = await cardWith(t, w, { cardCode: "ADPT0001", label: "Sto 1", kind: "menu" });
    await adoptCard(t, w, adoptedOff, { state: "inactive", redirectEnabled: false });
    const adoptedOn = await cardWith(t, w, { cardCode: "ADPT0002", label: "Sto 2", kind: "menu", status: "disabled" });
    await adoptCard(t, w, adoptedOn);
    await cardWith(t, w, { cardCode: "KART0003", label: "Sto 3", kind: "menu" });
    await cardWith(t, w, { cardCode: "KART0004", label: "Sto 4", kind: "menu", status: "disabled" });

    const listed = await listedA(t, w.ownerId);
    expect(listed.cards.map((card) => [card.label, card.status, card.managedByScanMe])).toEqual([
      ["Sto 2", "active", true], // adopted, channel on (its legacy status is disabled)
      ["Sto 3", "active", false],
      ["Sto 1", "disabled", true], // adopted, channel off (its legacy status is active)
      ["Sto 4", "disabled", false],
    ]);
  });
});

// K34 (lead): the position guard uses the same resolver rule (convex/lib/menuQrResolve.ts
// cardOpensMenu) as the page guard. Before, ANY adopted card on a position counted as live,
// even one whose channel ScanMe had switched off.
describe("K34: positionHasActiveQr judges an adopted card by its channel", () => {
  test("an adopted Menu card blocks archiving only while its channel serves scans", async () => {
    const { positionHasActiveQr } = await import("./lib/menuQrResolve");
    const t = newTest();
    const w = await world(t);
    const cardId = await cardWith(t, w, { cardCode: "POZK34A1", label: "Sto 9", kind: "menu", status: "disabled" });
    const positionId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("menuPositions", {
        menuServiceId: w.a.menuServiceId,
        key: "ps_k34000000001",
        kind: "table",
        label: "Sto 9",
        labelNormalized: "sto 9",
        order: 1000,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("menuQrLinks", {
        menuServiceId: w.a.menuServiceId,
        cardId,
        positionId: id,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });
    const probe = async () =>
      await t.run(async (ctx) =>
        positionHasActiveQr(ctx, { menuServiceId: w.a.menuServiceId, businessId: w.a.businessId, positionId }),
      );
    // Legacy card switched off: not live.
    expect(await probe()).toBe(false);
    // Adopted with the channel off: still not live (before K34 this counted as live).
    const { channelId } = await adoptCard(t, w, cardId, { state: "active", redirectEnabled: false });
    expect(await probe()).toBe(false);
    // Channel on: live, whatever the stale legacy cards.status says.
    await t.run(async (ctx) => await ctx.db.patch(channelId, { redirectEnabled: true }));
    expect(await probe()).toBe(true);
    await t.run(async (ctx) => await ctx.db.patch(channelId, { state: "problem" }));
    expect(await probe()).toBe(false);
  });
});
