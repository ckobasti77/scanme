/// <reference types="vite/client" />

// TASK-68 (RFC-004 §2.7, §4) — the waiter panel's read model.
//
// Under test: the queue is bearer-guarded; it carries the TABLE (cards.label
// via cardId) so the waiter knows where to walk; it reads only active rows,
// bounded; the materialized overdue flag passes through untouched; a shift that
// closed and reopened still sees the requests routed to its predecessor; and —
// the reason the per-status index exists — a flood of completed rows cannot
// push a still-pending request out of the window.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { hashPin } from "./orderingShifts";
import { PANEL_WINDOW } from "./orderingPanel";

const modules = import.meta.glob("./**/*.ts");

const CODE = "KAFANA12";
const CARD_A = "STAB0001";
const CARD_B = "STAB0002";
const PIN = "1234";

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof newT>;

async function seedVenue(t: T, code: string, cardCodes: string[]) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Dva Jelena",
      slug: `dva-jelena-${code.toLowerCase()}`,
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("entitlements", {
      businessId,
      product: "scanme_venue",
      planKey: "premium",
      status: "active",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("orderingConfig", {
      businessId,
      code,
      enabled: true,
      callWaiterEnabled: true,
      overdueMinutes: 7,
      reasons: ["Račun", "Voda"],
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("staffPins", {
      businessId,
      label: "Šef sale",
      pinHash: await hashPin(PIN),
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const userId = await ctx.db.insert("users", { name: "Vlasnik" });
    const cardIds: Array<Id<"cards">> = [];
    for (const [index, cardCode] of cardCodes.entries()) {
      const cardId = await ctx.db.insert("cards", {
        businessId,
        cardCode,
        label: `Sto ${index + 7}`,
        status: "active",
        totalScans: 0,
        createdAt: now,
        updatedAt: now,
      });
      const targetId = await ctx.db.insert("cardTargets", {
        cardId,
        kind: "table_ordering",
        createdByUserId: userId,
        createdAt: now,
      });
      await ctx.db.patch(cardId, { currentTargetId: targetId });
      cardIds.push(cardId);
    }
    const itemId = await ctx.db.insert("orderingItems", {
      businessId,
      name: "Domaće pivo 0.5",
      priceRsd: 280,
      available: true,
      order: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { businessId, cardIds, itemId };
  });
}

/** Mint a guest through the REAL card-aware hop (never a hand-inserted row). */
async function mintGuest(t: T, cardCode: string, code: string, tag = "a") {
  const hop = await t.mutation(api.cards.resolveTableOrdering, {
    cardCode,
    venueCode: code,
    ipHash: `ip-${cardCode}-${tag}`,
  });
  if (hop.kind !== "table_ordering" || !hop.guestKey) {
    throw new Error("hop did not mint an ordering guest");
  }
  return hop.guestKey;
}

const openShift = (t: T, code: string) =>
  t.mutation(api.orderingShifts.openShift, { code, pin: PIN });

const order = (
  t: T,
  code: string,
  guestKey: string,
  itemId: Id<"orderingItems">,
  qty = 1,
) =>
  t.mutation(api.orderingRequests.submitOrder, {
    code,
    guestKey,
    lines: [{ itemId, qty }],
    note: "bez leda",
  });

const call = (t: T, code: string, guestKey: string) =>
  t.mutation(api.orderingRequests.callWaiter, {
    code,
    guestKey,
    reason: "Račun",
  });

const view = (t: T, code: string, bearer: string) =>
  t.query(api.orderingPanel.panelView, { code, bearer });

describe("TASK-68: panelView guard (RFC-004 §2.7)", () => {
  test("no open shift → no_shift; wrong bearer → invalid_bearer", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A]);
    expect(await view(t, CODE, "0".repeat(64))).toEqual({ status: "no_shift" });
    await openShift(t, CODE);
    expect(await view(t, CODE, "0".repeat(64))).toEqual({
      status: "invalid_bearer",
    });
    expect(await view(t, "NEMA0000", "0".repeat(64))).toEqual({
      status: "no_shift",
    });
  });

  test("a second PIN login re-mints the bearer and the first one is signed out", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A]);
    const first = await openShift(t, CODE);
    const second = await openShift(t, CODE);
    expect((await view(t, CODE, first.bearer)).status).toBe("invalid_bearer");
    expect((await view(t, CODE, second.bearer)).status).toBe("open");
  });
});

describe("TASK-68: the live queue (RFC-004 §2.7)", () => {
  test("rows carry the TABLE, the kind, the lines and the shift header", async () => {
    const t = newT();
    const { cardIds, itemId } = await seedVenue(t, CODE, [CARD_A, CARD_B]);
    const { bearer } = await openShift(t, CODE);
    const guestA = await mintGuest(t, CARD_A, CODE);
    const guestB = await mintGuest(t, CARD_B, CODE);
    const { requestId: orderId } = await order(t, CODE, guestA, itemId, 2);
    const { requestId: callId } = await call(t, CODE, guestB);

    const result = await view(t, CODE, bearer);
    if (result.status !== "open") throw new Error(result.status);
    expect(result.businessName).toBe("Kafana Dva Jelena");
    expect(result.staffLabel).toBe("Šef sale");
    expect(result.paused).toBe(false);
    expect(result.stale).toBe(false);
    expect(result.requests).toHaveLength(2);

    const orderRow = result.requests.find((r) => r._id === orderId)!;
    expect(orderRow.cardId).toBe(cardIds[0]);
    expect(orderRow.tableLabel).toBe("Sto 7");
    expect(orderRow.kind).toBe("order");
    expect(orderRow.status).toBe("sent");
    expect(orderRow.note).toBe("bez leda");
    expect(orderRow.items).toEqual([
      { name: "Domaće pivo 0.5", qty: 2, priceRsd: 280 },
    ]);

    const callRow = result.requests.find((r) => r._id === callId)!;
    expect(callRow.cardId).toBe(cardIds[1]);
    expect(callRow.tableLabel).toBe("Sto 8");
    expect(callRow.kind).toBe("call");
    expect(callRow.reason).toBe("Račun");
    expect(callRow.items).toEqual([]);
  });

  test("accepted and enroute stay in the queue; completed and withdrawn leave it", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    const { bearer } = await openShift(t, CODE);
    const guest = await mintGuest(t, CARD_A, CODE);
    const a = (await order(t, CODE, guest, itemId)).requestId;
    const b = (await call(t, CODE, guest)).requestId;
    const c = (await call(t, CODE, guest)).requestId;
    const panelArgs = (requestId: Id<"serviceRequests">) => ({
      code: CODE,
      bearer,
      requestId,
    });

    await t.mutation(api.orderingStatus.acceptRequest, panelArgs(a));
    await t.mutation(api.orderingStatus.acceptRequest, panelArgs(b));
    await t.mutation(api.orderingStatus.markEnroute, panelArgs(b));
    await t.mutation(api.orderingStatus.withdrawRequest, {
      code: CODE,
      guestKey: guest,
      requestId: c,
    });
    let result = await view(t, CODE, bearer);
    if (result.status !== "open") throw new Error(result.status);
    expect(result.requests.map((r) => [r._id, r.status]).sort()).toEqual(
      [
        [a, "accepted"],
        [b, "enroute"],
      ].sort(),
    );

    await t.mutation(api.orderingStatus.completeRequest, panelArgs(a));
    await t.mutation(api.orderingStatus.completeRequest, panelArgs(b));
    result = await view(t, CODE, bearer);
    if (result.status !== "open") throw new Error(result.status);
    expect(result.requests).toEqual([]);
  });

  test("the materialized overdue flag passes through; paused passes through", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    const { bearer } = await openShift(t, CODE);
    const guest = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guest, itemId);
    await t.mutation(internal.orderingStatus.markOverdue, { requestId });
    await t.mutation(api.orderingShifts.pauseOrdering, { code: CODE, bearer });

    const result = await view(t, CODE, bearer);
    if (result.status !== "open") throw new Error(result.status);
    expect(result.requests[0].overdue).toBe(true);
    expect(result.requests[0].status).toBe("sent");
    expect(result.paused).toBe(true);
  });

  test("a shift that closed and reopened still sees its predecessor's pending rows", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    const first = await openShift(t, CODE);
    const guest = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guest, itemId);
    await t.mutation(api.orderingShifts.closeShift, {
      code: CODE,
      bearer: first.bearer,
    });
    expect((await view(t, CODE, first.bearer)).status).toBe("no_shift");

    const second = await openShift(t, CODE);
    const result = await view(t, CODE, second.bearer);
    if (result.status !== "open") throw new Error(result.status);
    expect(result.requests.map((r) => r._id)).toEqual([requestId]);
  });

  test("the window is bounded per status, and completed rows cannot hide a pending one", async () => {
    const t = newT();
    const { businessId, cardIds, itemId } = await seedVenue(t, CODE, [CARD_A]);
    const { bearer } = await openShift(t, CODE);
    const guest = await mintGuest(t, CARD_A, CODE);
    const { requestId: pending } = await order(t, CODE, guest, itemId);

    // Bulk rows straight into the table (the bound is about the READ, and the
    // per-guest bucket would refuse a burst this size — which is its job).
    await t.run(async (ctx) => {
      const guestRow = await ctx.db
        .query("orderingGuests")
        .withIndex("by_code_and_guestKey", (q) =>
          q.eq("code", CODE).eq("guestKey", guest),
        )
        .unique();
      const shift = await ctx.db
        .query("orderingShifts")
        .withIndex("by_businessId_and_status", (q) =>
          q.eq("businessId", businessId).eq("status", "open"),
        )
        .first();
      const base = Date.now() + 1_000;
      const insert = (status: "sent" | "completed", offset: number) =>
        ctx.db.insert("serviceRequests", {
          businessId,
          cardId: cardIds[0],
          guestId: guestRow!._id,
          shiftId: shift!._id,
          kind: "call",
          status,
          overdue: false,
          overdueAt: base + offset + 7 * 60_000,
          createdAt: base + offset,
          updatedAt: base + offset,
        });
      // PANEL_WINDOW + 5 completed rows, all NEWER than the pending one.
      for (let i = 0; i < PANEL_WINDOW + 5; i += 1) await insert("completed", i);
      // PANEL_WINDOW newer sent rows on top — one more than the window holds
      // together with `pending`.
      for (let i = 0; i < PANEL_WINDOW; i += 1) {
        await insert("sent", 10_000 + i);
      }
    });

    const result = await view(t, CODE, bearer);
    if (result.status !== "open") throw new Error(result.status);
    const sent = result.requests.filter((r) => r.status === "sent");
    expect(sent).toHaveLength(PANEL_WINDOW);
    // Newest-first: the oldest `sent` (the original) is the one that fell out —
    // never because of the completed rows, only because the window is full.
    expect(sent.some((r) => r._id === pending)).toBe(false);

    // Remove one newer sent row → the original pending one is back in view,
    // proving the sixty-five completed rows never counted against the window.
    await t.run(async (ctx) => {
      const newest = await ctx.db
        .query("serviceRequests")
        .withIndex("by_businessId_and_status_and_createdAt", (q) =>
          q.eq("businessId", businessId).eq("status", "sent"),
        )
        .order("desc")
        .first();
      await ctx.db.delete(newest!._id);
    });
    const again = await view(t, CODE, bearer);
    if (again.status !== "open") throw new Error(again.status);
    expect(again.requests.some((r) => r._id === pending)).toBe(true);
  });
});
