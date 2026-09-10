/// <reference types="vite/client" />

// TASK-67 (RFC-004 §2.5, §2.6, §2.8, §4) — the guest's live status and the
// 7-minute deadline.
//
// The §4 acceptance criteria under test: a status change on the panel reaches
// the guest's subscription with no reload; at the deadline the status becomes an
// action card and the request STAYS PENDING (no auto-cancel); a guest sees only
// their own requests.
//
// The most important test in this file is the negative one:
// "myRequests reports overdue=false after the deadline passes when the flip has
// not run". It is the only test that can fail if someone later 'simplifies'
// `overdue` into a Date.now() comparison inside the query — a change that would
// pass every other test here (each calls the query afresh) and would silently
// never fire for a real guest holding a phone, whose subscription does not
// re-run because time passed.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { REQUEST_ERROR } from "./lib/orderingErrors";
import { hashPin } from "./orderingShifts";

const modules = import.meta.glob("./**/*.ts");

const CODE = "KAFANA12";
const OTHER_CODE = "MENZA123";
const CARD_A = "STAB0001";
const CARD_B = "STAB0002";
const PIN = "1234";
const OVERDUE_MINUTES = 7;
const OVERDUE_MS = OVERDUE_MINUTES * 60_000;

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof newT>;

/** An active, ordering-entitled venue with a config, a PIN, table cards. */
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
      overdueMinutes: OVERDUE_MINUTES,
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
    for (const cardCode of cardCodes) {
      const cardId = await ctx.db.insert("cards", {
        businessId,
        cardCode,
        label: `Sto ${cardCode}`,
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
  });

const call = (t: T, code: string, guestKey: string) =>
  t.mutation(api.orderingRequests.callWaiter, { code, guestKey });

const status = (t: T, code: string, guestKey: string) =>
  t.query(api.orderingStatus.myRequests, { code, guestKey });

const rowOf = (t: T, requestId: Id<"serviceRequests">) =>
  t.run((ctx) => ctx.db.get(requestId));

async function expectConvexError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toThrow(code);
}

// =============================================================================
// Live status — Poslato → Prihvaćeno → Stiže, driven by the REAL panel
// mutations, read back through the guest's own subscription (§2.6, §4).
// =============================================================================

describe("TASK-67: the guest's live status (RFC-004 §2.6)", () => {
  test("a panel accept/enroute/complete moves the guest's status with no reload", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    const { bearer } = await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guestKey, itemId, 2);

    // Poslato — what the guest sees the instant the order leaves.
    let rows = await status(t, CODE, guestKey);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(requestId);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].overdue).toBe(false);
    expect(rows[0].items).toEqual([
      { name: "Domaće pivo 0.5", qty: 2, priceRsd: 280 },
    ]);

    // Prihvaćeno.
    await t.mutation(api.orderingStatus.acceptRequest, {
      code: CODE,
      bearer,
      requestId,
    });
    rows = await status(t, CODE, guestKey);
    expect(rows[0].status).toBe("accepted");
    expect((await rowOf(t, requestId))!.acceptedAt).toBeGreaterThan(0);

    // Stiže.
    await t.mutation(api.orderingStatus.markEnroute, {
      code: CODE,
      bearer,
      requestId,
    });
    expect((await status(t, CODE, guestKey))[0].status).toBe("enroute");

    // Završeno — the closing beat, still visible to the guest rather than
    // vanishing from under them.
    await t.mutation(api.orderingStatus.completeRequest, {
      code: CODE,
      bearer,
      requestId,
    });
    const done = await status(t, CODE, guestKey);
    expect(done).toHaveLength(1);
    expect(done[0].status).toBe("completed");
  });

  test("a guest sees ONLY their own requests, even at the same table (§2.5)", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    // Two people at ONE table — the §2.5 case: same cardId, separate bearers.
    const guestA = await mintGuest(t, CARD_A, CODE, "a");
    const guestB = await mintGuest(t, CARD_A, CODE, "b");

    const a = await order(t, CODE, guestA, itemId);
    const b = await call(t, CODE, guestB);

    const rowsA = await status(t, CODE, guestA);
    const rowsB = await status(t, CODE, guestB);
    expect(rowsA.map((r) => r._id)).toEqual([a.requestId]);
    expect(rowsB.map((r) => r._id)).toEqual([b.requestId]);

    // Both rows exist and share the table — the split is per person, the
    // grouping (for the waiter) is per card.
    const rows = await t.run((ctx) =>
      ctx.db.query("serviceRequests").collect(),
    );
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.cardId)).size).toBe(1);
  });

  test("an unknown or foreign bearer sees nothing (never someone else's rows)", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    await seedVenue(t, OTHER_CODE, [CARD_B]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    await order(t, CODE, guestKey, itemId);

    expect(await status(t, CODE, "not-a-real-bearer")).toEqual([]);
    // The bearer is real, but presented at the OTHER venue's code: the
    // composite index makes it resolve to nothing.
    expect(await status(t, OTHER_CODE, guestKey)).toEqual([]);
  });

  test("requests come back newest-first and a call carries no lines", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const first = await order(t, CODE, guestKey, itemId);
    const second = await call(t, CODE, guestKey);

    const rows = await status(t, CODE, guestKey);
    expect(rows.map((r) => r._id)).toEqual([second.requestId, first.requestId]);
    expect(rows[0].kind).toBe("call");
    expect(rows[0].items).toEqual([]);
  });
});

// =============================================================================
// The 7-minute deadline (§2.8) — an ACTION, never a silent cancel.
// =============================================================================

describe("TASK-67: the 7-minute deadline (RFC-004 §2.8)", () => {
  test("the scheduled flip raises `overdue` and the request STAYS pending", async () => {
    const t = newT();
    vi.useFakeTimers();
    try {
      const { itemId } = await seedVenue(t, CODE, [CARD_A]);
      await openShift(t, CODE);
      const guestKey = await mintGuest(t, CARD_A, CODE);
      const { requestId } = await order(t, CODE, guestKey, itemId);

      const before = await rowOf(t, requestId);
      expect(before!.overdue).toBe(false);
      expect(before!.overdueAt).toBe(before!.createdAt + OVERDUE_MS);

      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const after = await rowOf(t, requestId);
      // THE decision of §2.8, asserted three ways: the flag is up, the request
      // still exists, and it is still waiting to be accepted.
      expect(after).not.toBeNull();
      expect(after!.overdue).toBe(true);
      expect(after!.status).toBe("sent");

      const rows = await status(t, CODE, guestKey);
      expect(rows[0].overdue).toBe(true);
      expect(rows[0].status).toBe("sent");
    } finally {
      vi.useRealTimers();
    }
  });

  test("the query does NOT compute overdue from the clock: time passing alone changes nothing", async () => {
    const t = newT();
    vi.useFakeTimers();
    try {
      const { itemId } = await seedVenue(t, CODE, [CARD_A]);
      await openShift(t, CODE);
      const guestKey = await mintGuest(t, CARD_A, CODE);
      await order(t, CODE, guestKey, itemId);

      // Walk the wall clock far past the deadline WITHOUT letting the scheduled
      // flip run. A real guest's subscription is in exactly this state: the
      // deadline has passed and nothing has re-run the query.
      vi.setSystemTime(Date.now() + OVERDUE_MS * 3);

      const rows = await status(t, CODE, guestKey);
      expect(rows[0].overdue).toBe(false);

      // ...and the materialization is what makes it true. Same clock, one flip.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await status(t, CODE, guestKey))[0].overdue).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("an acceptance before the deadline disarms the flip (superseded no-op)", async () => {
    const t = newT();
    vi.useFakeTimers();
    try {
      const { itemId } = await seedVenue(t, CODE, [CARD_A]);
      const { bearer } = await openShift(t, CODE);
      const guestKey = await mintGuest(t, CARD_A, CODE);
      const { requestId } = await order(t, CODE, guestKey, itemId);

      await t.mutation(api.orderingStatus.acceptRequest, {
        code: CODE,
        bearer,
        requestId,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const after = await rowOf(t, requestId);
      expect(after!.overdue).toBe(false);
      expect(after!.status).toBe("accepted");
    } finally {
      vi.useRealTimers();
    }
  });

  test("markOverdue is idempotent and never touches status", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guestKey, itemId);

    const first = await t.mutation(internal.orderingStatus.markOverdue, {
      requestId,
    });
    const second = await t.mutation(internal.orderingStatus.markOverdue, {
      requestId,
    });
    expect(first.overdue).toBe(true);
    expect(second.overdue).toBe(true);
    expect((await rowOf(t, requestId))!.status).toBe("sent");
  });

  test("the cron backstop flags a request whose runAt flip was lost", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    const { bearer } = await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const pending = (await order(t, CODE, guestKey, itemId)).requestId;
    const accepted = (await call(t, CODE, guestKey)).requestId;
    await t.mutation(api.orderingStatus.acceptRequest, {
      code: CODE,
      bearer,
      requestId: accepted,
    });

    // Simulate the lost per-request flip: age both deadlines into the past.
    await t.run(async (ctx) => {
      const past = Date.now() - 1_000;
      await ctx.db.patch(pending, { overdueAt: past });
      await ctx.db.patch(accepted, { overdueAt: past });
    });

    const swept = await t.mutation(
      internal.orderingStatus.sweepOverdueRequests,
      {},
    );
    expect(swept.flagged).toBe(1);
    expect((await rowOf(t, pending))!.overdue).toBe(true);
    expect((await rowOf(t, pending))!.status).toBe("sent");
    // An accepted request is past the window's reach.
    expect((await rowOf(t, accepted))!.overdue).toBe(false);

    // Idempotent: a second tick finds nothing left to do.
    const again = await t.mutation(
      internal.orderingStatus.sweepOverdueRequests,
      {},
    );
    expect(again.flagged).toBe(0);
  });

  test("the sweep leaves a deadline-less legacy row alone", async () => {
    const t = newT();
    const { businessId, cardIds } = await seedVenue(t, CODE, [CARD_A]);
    const { shiftId } = await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);

    // A row in the pre-TASK-67 shape: no overdueAt at all. In a Convex index an
    // absent value sorts below every number, so without the sweep's lower bound
    // this row would be flagged overdue on the very first cron tick.
    const legacy = await t.run(async (ctx) => {
      const guest = await ctx.db
        .query("orderingGuests")
        .withIndex("by_code_and_guestKey", (q) =>
          q.eq("code", CODE).eq("guestKey", guestKey),
        )
        .unique();
      const now = Date.now();
      return ctx.db.insert("serviceRequests", {
        businessId,
        cardId: cardIds[0],
        guestId: guest!._id,
        shiftId,
        kind: "call",
        status: "sent",
        overdue: false,
        createdAt: now,
        updatedAt: now,
      });
    });

    const swept = await t.mutation(
      internal.orderingStatus.sweepOverdueRequests,
      {},
    );
    expect(swept.flagged).toBe(0);
    expect((await rowOf(t, legacy))!.overdue).toBe(false);
  });
});

// =============================================================================
// The guest's lever at the deadline (§2.8) — withdraw. The ONLY way a request
// ends without a waiter, and it is the guest's own explicit act.
// =============================================================================

describe("TASK-67: withdraw (RFC-004 §2.8)", () => {
  test("a guest withdraws their own pending request; the row survives", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guestKey, itemId);

    await t.mutation(api.orderingStatus.withdrawRequest, {
      code: CODE,
      guestKey,
      requestId,
    });

    const row = await rowOf(t, requestId);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("withdrawn");
    expect((await status(t, CODE, guestKey))[0].status).toBe("withdrawn");
  });

  test("withdraw works when the panel is dead — stale AND paused (the whole point)", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    const { shiftId } = await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guestKey, itemId);

    // The tablet dies and the shift is paused: sending is now refused...
    await t.run((ctx) => ctx.db.patch(shiftId, { stale: true, paused: true }));
    await expectConvexError(
      order(t, CODE, guestKey, itemId),
      REQUEST_ERROR.unavailable,
    );

    // ...but the guest's lever must still work, because this is exactly when
    // they reach for it.
    await t.mutation(api.orderingStatus.withdrawRequest, {
      code: CODE,
      guestKey,
      requestId,
    });
    expect((await rowOf(t, requestId))!.status).toBe("withdrawn");
  });

  test("a guest cannot withdraw someone else's request, even at the same table", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestA = await mintGuest(t, CARD_A, CODE, "a");
    const guestB = await mintGuest(t, CARD_A, CODE, "b");
    const { requestId } = await order(t, CODE, guestA, itemId);

    await expectConvexError(
      t.mutation(api.orderingStatus.withdrawRequest, {
        code: CODE,
        guestKey: guestB,
        requestId,
      }),
      REQUEST_ERROR.requestNotFound,
    );
    expect((await rowOf(t, requestId))!.status).toBe("sent");
  });

  test("an accepted request can no longer be withdrawn — a waiter is walking", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    const { bearer } = await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guestKey, itemId);
    await t.mutation(api.orderingStatus.acceptRequest, {
      code: CODE,
      bearer,
      requestId,
    });

    await expectConvexError(
      t.mutation(api.orderingStatus.withdrawRequest, {
        code: CODE,
        guestKey,
        requestId,
      }),
      REQUEST_ERROR.notWithdrawable,
    );
    expect((await rowOf(t, requestId))!.status).toBe("accepted");
  });
});

// =============================================================================
// Panel transitions (§2.7) — the bearer, the venue boundary, the legal order.
// =============================================================================

describe("TASK-67: panel transitions (RFC-004 §2.7)", () => {
  test("a wrong shift bearer is refused", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guestKey, itemId);

    await expectConvexError(
      t.mutation(api.orderingStatus.acceptRequest, {
        code: CODE,
        bearer: "0".repeat(64),
        requestId,
      }),
      "shift/invalid_bearer",
    );
    expect((await rowOf(t, requestId))!.status).toBe("sent");
  });

  test("another venue's panel cannot touch this venue's request", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    await seedVenue(t, OTHER_CODE, [CARD_B]);
    await openShift(t, CODE);
    const other = await openShift(t, OTHER_CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guestKey, itemId);

    await expectConvexError(
      t.mutation(api.orderingStatus.acceptRequest, {
        code: OTHER_CODE,
        bearer: other.bearer,
        requestId,
      }),
      REQUEST_ERROR.requestNotFound,
    );
  });

  test("illegal transitions are refused loudly; accept is idempotent", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    const { bearer } = await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guestKey, itemId);
    const panel = { code: CODE, bearer, requestId };

    // Nothing skips acceptance: a request the panel never took cannot be en
    // route, and cannot have been delivered.
    await expectConvexError(
      t.mutation(api.orderingStatus.markEnroute, panel),
      REQUEST_ERROR.invalidTransition,
    );
    await expectConvexError(
      t.mutation(api.orderingStatus.completeRequest, panel),
      REQUEST_ERROR.invalidTransition,
    );

    // A double tap on a tablet in a loud room is not an error.
    await t.mutation(api.orderingStatus.acceptRequest, panel);
    const again = await t.mutation(api.orderingStatus.acceptRequest, panel);
    expect(again.status).toBe("accepted");

    // A waiter who carries it straight over never taps Stiže.
    await t.mutation(api.orderingStatus.completeRequest, panel);
    await expectConvexError(
      t.mutation(api.orderingStatus.markEnroute, panel),
      REQUEST_ERROR.invalidTransition,
    );
  });

  test("a shift that closed and reopened can still accept the requests left pending", async () => {
    const t = newT();
    const { itemId } = await seedVenue(t, CODE, [CARD_A]);
    const first = await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const { requestId } = await order(t, CODE, guestKey, itemId);

    // End of shift, then a new one opens: a NEW row, so the request's stored
    // shiftId now points at a closed shift. Authorizing on shiftId instead of
    // the venue would strand it, pending and untouchable, forever.
    await t.mutation(api.orderingShifts.closeShift, {
      code: CODE,
      bearer: first.bearer,
    });
    const second = await openShift(t, CODE);
    expect(second.shiftId).not.toBe(first.shiftId);

    await t.mutation(api.orderingStatus.acceptRequest, {
      code: CODE,
      bearer: second.bearer,
      requestId,
    });
    expect((await rowOf(t, requestId))!.status).toBe("accepted");
    expect((await status(t, CODE, guestKey))[0].status).toBe("accepted");
  });
});
