/// <reference types="vite/client" />

// TASK-66 (RFC-004 §2.1, §2.5, §2.6, §2.9, §4) — the two guest actions.
//
// The §4 acceptance criteria under test: a call and an order each insert ONE
// row routed to the open shift; ordering is disabled when the shift is stale OR
// paused OR absent, with ONE guest message; a flood is rejected visibly; and a
// request carries BOTH cardId and guestId.
//
// The guests here are minted through the REAL card-aware hop
// (cards.resolveTableOrdering, TASK-63), not hand-inserted rows — otherwise the
// central claim of this task ("every request carries the table") would be
// tested against a fixture instead of against the only code path that can
// produce a guest in production.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { REQUEST_ERROR } from "./lib/orderingErrors";
import { hashPin } from "./orderingShifts";

const modules = import.meta.glob("./**/*.ts");

const CODE = "KAFANA12";
const OTHER_CODE = "MENZA123";
// Crockford: normalizeCode maps O→0 and I/L→1, so a card code containing
// those letters would never match what was stored. Kept free of them.
const CARD_A = "STAB0001";
const CARD_B = "STAB0002";
const PIN = "1234";

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof newT>;

interface SeedOptions {
  enabled?: boolean;
  callWaiterEnabled?: boolean;
  entitled?: boolean;
  reasons?: string[];
}

/** An active, ordering-entitled venue with a config, a PIN, two table cards. */
async function seedVenue(
  t: T,
  code: string,
  cardCodes: string[],
  opts: SeedOptions = {},
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Dva Jelena",
      slug: `dva-jelena-${code.toLowerCase()}`,
      status: "active",
      createdAt: now,
    });
    if (opts.entitled ?? true) {
      await ctx.db.insert("entitlements", {
        businessId,
        product: "scanme_venue",
        planKey: "premium",
        status: "active",
        source: "manual",
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.insert("orderingConfig", {
      businessId,
      code,
      enabled: opts.enabled ?? true,
      callWaiterEnabled: opts.callWaiterEnabled ?? true,
      overdueMinutes: 7,
      reasons: opts.reasons ?? ["Račun", "Voda"],
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
    return { businessId, cardIds };
  });
}

/** Mint a guest through the real card-aware hop. */
async function mintGuest(t: T, cardCode: string, code: string) {
  const hop = await t.mutation(api.cards.resolveTableOrdering, {
    cardCode,
    venueCode: code,
    ipHash: `ip-${cardCode}`,
  });
  if (hop.kind !== "table_ordering" || !hop.guestKey) {
    throw new Error("hop did not mint an ordering guest");
  }
  return hop.guestKey;
}

async function openShift(t: T, code: string) {
  return t.mutation(api.orderingShifts.openShift, { code, pin: PIN });
}

async function addItem(
  t: T,
  businessId: Id<"businesses">,
  name: string,
  opts: { priceRsd?: number; available?: boolean; order?: number } = {},
) {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert("orderingItems", {
      businessId,
      name,
      priceRsd: opts.priceRsd,
      available: opts.available ?? true,
      order: opts.order ?? 0,
      createdAt: now,
      updatedAt: now,
    });
  });
}

const requests = (t: T) => t.run((ctx) => ctx.db.query("serviceRequests").collect());

// =============================================================================
// The happy paths — a call and an order, each routed to the open shift, each
// carrying the table AND the person.
// =============================================================================

describe("TASK-66: the two guest actions (RFC-004 §2.1)", () => {
  test("a call inserts ONE row routed to the open shift, with cardId and guestId", async () => {
    const t = newT();
    const { cardIds } = await seedVenue(t, CODE, [CARD_A]);
    const { shiftId } = await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);

    const { requestId } = await t.mutation(api.orderingRequests.callWaiter, {
      code: CODE,
      guestKey,
      reason: "Račun",
    });

    const rows = await requests(t);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row._id).toBe(requestId);
    expect(row.kind).toBe("call");
    expect(row.status).toBe("sent");
    expect(row.shiftId).toBe(shiftId);
    expect(row.reason).toBe("Račun");
    expect(row.overdue).toBe(false);
    // THE assertion this task exists for: the table AND the person.
    expect(row.cardId).toBe(cardIds[0]);
    expect(row.guestId).toBeTruthy();
    const guest = await t.run((ctx) => ctx.db.get(row.guestId));
    expect(guest?.cardId).toBe(cardIds[0]);
    // No lines for a call.
    const lines = await t.run((ctx) =>
      ctx.db.query("serviceRequestItems").collect(),
    );
    expect(lines).toHaveLength(0);
  });

  test("an order inserts ONE row plus its lines, snapshotting name and price", async () => {
    const t = newT();
    const { businessId, cardIds } = await seedVenue(t, CODE, [CARD_A]);
    const { shiftId } = await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const pivo = await addItem(t, businessId, "Pivo", {
      priceRsd: 280,
      order: 0,
    });
    const voda = await addItem(t, businessId, "Voda", { order: 1 });

    const res = await t.mutation(api.orderingRequests.submitOrder, {
      code: CODE,
      guestKey,
      lines: [
        { itemId: pivo, qty: 2 },
        { itemId: voda, qty: 1 },
      ],
      note: "  bez leda  ",
    });
    expect(res.lineCount).toBe(2);

    const rows = await requests(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("order");
    expect(rows[0].status).toBe("sent");
    expect(rows[0].shiftId).toBe(shiftId);
    expect(rows[0].cardId).toBe(cardIds[0]);
    expect(rows[0].note).toBe("bez leda");

    const lines = await t.run((ctx) =>
      ctx.db
        .query("serviceRequestItems")
        .withIndex("by_requestId", (q) => q.eq("requestId", res.requestId))
        .collect(),
    );
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => [l.name, l.qty, l.priceRsd, l.order])).toEqual([
      ["Pivo", 2, 280, 0],
      ["Voda", 1, undefined, 1],
    ]);
  });

  test("the price snapshot survives the owner repricing the item afterwards (§2.16 O.7)", async () => {
    const t = newT();
    const { businessId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const pivo = await addItem(t, businessId, "Pivo", { priceRsd: 280 });

    await t.mutation(api.orderingRequests.submitOrder, {
      code: CODE,
      guestKey,
      lines: [{ itemId: pivo, qty: 1 }],
    });
    await t.run((ctx) =>
      ctx.db.patch(pivo, { name: "Pivo 0.5", priceRsd: 350 }),
    );

    const lines = await t.run((ctx) =>
      ctx.db.query("serviceRequestItems").collect(),
    );
    expect(lines[0].name).toBe("Pivo");
    expect(lines[0].priceRsd).toBe(280);
  });

  test("two guests at the SAME table both order — no table lock (§2.5)", async () => {
    const t = newT();
    const { businessId, cardIds } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const pivo = await addItem(t, businessId, "Pivo");
    const guestA = await mintGuest(t, CARD_A, CODE);
    const guestB = await mintGuest(t, CARD_A, CODE);
    expect(guestA).not.toBe(guestB);

    for (const guestKey of [guestA, guestB]) {
      await t.mutation(api.orderingRequests.submitOrder, {
        code: CODE,
        guestKey,
        lines: [{ itemId: pivo, qty: 1 }],
      });
    }

    const rows = await requests(t);
    expect(rows).toHaveLength(2);
    // Identity per person, statistics per table.
    expect(new Set(rows.map((r) => r.guestId)).size).toBe(2);
    expect(new Set(rows.map((r) => String(r.cardId)))).toEqual(
      new Set([String(cardIds[0])]),
    );
  });
});

// =============================================================================
// THE CORE — one disabled state, two causes. Every cause must raise the SAME
// code and write NOTHING. A regression here is invisible in production until a
// guest's order lands in a dead panel.
// =============================================================================

describe("TASK-66: ONE disabled state, TWO causes (RFC-004 §2.6)", () => {
  // Each entry sets up an otherwise-perfect venue and then breaks exactly one
  // precondition.
  const causes: Array<{
    name: string;
    apply: (t: T, ctx: { businessId: Id<"businesses"> }) => Promise<void>;
    openShiftFirst: boolean;
  }> = [
    {
      // Cause B — no shift was ever opened.
      name: "no open shift",
      openShiftFirst: false,
      apply: async () => {},
    },
    {
      // Cause B — the waiter closed the shift (end of service).
      name: "the shift was closed",
      openShiftFirst: true,
      apply: async (t) => {
        const shift = await t.run((ctx) =>
          ctx.db.query("orderingShifts").first(),
        );
        await t.run((ctx) =>
          ctx.db.patch(shift!._id, { status: "closed", closedAt: Date.now() }),
        );
      },
    },
    {
      // Cause B — the waiter paused ordering (rush).
      name: "the waiter paused ordering",
      openShiftFirst: true,
      apply: async (t) => {
        const shift = await t.run((ctx) =>
          ctx.db.query("orderingShifts").first(),
        );
        await t.run((ctx) => ctx.db.patch(shift!._id, { paused: true }));
      },
    },
    {
      // Cause A — the tablet went dark and markShiftStale flipped the flag.
      name: "the heartbeat went stale (materialized)",
      openShiftFirst: true,
      apply: async (t) => {
        const shift = await t.run((ctx) =>
          ctx.db.query("orderingShifts").first(),
        );
        await t.run((ctx) => ctx.db.patch(shift!._id, { stale: true }));
      },
    },
    {
      // Cause A, the nastier variant — the heartbeat is past the threshold but
      // the scheduled flip has NOT landed yet, so the materialized flag still
      // reads "alive". Without the mutation's clock belt this order would be
      // accepted into a dead panel and nothing would ever say so.
      name: "the heartbeat is past STALE_MS but the runAt flip has not landed",
      openShiftFirst: true,
      apply: async (t) => {
        const shift = await t.run((ctx) =>
          ctx.db.query("orderingShifts").first(),
        );
        await t.run((ctx) =>
          ctx.db.patch(shift!._id, {
            stale: false,
            lastHeartbeatAt: Date.now() - 120_000,
          }),
        );
      },
    },
    {
      // Cause B — the venue switched ordering off in its own config.
      name: "the venue disabled ordering in its config",
      openShiftFirst: true,
      apply: async (t, { businessId }) => {
        const config = await t.run((ctx) =>
          ctx.db
            .query("orderingConfig")
            .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
            .unique(),
        );
        await t.run((ctx) => ctx.db.patch(config!._id, { enabled: false }));
      },
    },
    {
      // Cause B — the subscription lapsed mid-service (§2.12 capability gate).
      name: "the ordering entitlement lapsed",
      openShiftFirst: true,
      apply: async (t) => {
        const ent = await t.run((ctx) => ctx.db.query("entitlements").first());
        await t.run((ctx) => ctx.db.patch(ent!._id, { status: "expired" }));
      },
    },
  ];

  for (const cause of causes) {
    test(`${cause.name} → the SAME code, and nothing is written`, async () => {
      const t = newT();
      const { businessId } = await seedVenue(t, CODE, [CARD_A]);
      if (cause.openShiftFirst) await openShift(t, CODE);
      // Mint BEFORE breaking the precondition: the guest's phone had a valid
      // identity and a screen that said "available" a moment ago.
      const guestKey = await mintGuest(t, CARD_A, CODE);
      const pivo = await addItem(t, businessId, "Pivo");
      await cause.apply(t, { businessId });

      await expect(
        t.mutation(api.orderingRequests.callWaiter, { code: CODE, guestKey }),
      ).rejects.toThrow(REQUEST_ERROR.unavailable);
      await expect(
        t.mutation(api.orderingRequests.submitOrder, {
          code: CODE,
          guestKey,
          lines: [{ itemId: pivo, qty: 1 }],
        }),
      ).rejects.toThrow(REQUEST_ERROR.unavailable);

      expect(await requests(t)).toHaveLength(0);
      expect(
        await t.run((ctx) => ctx.db.query("serviceRequestItems").collect()),
      ).toHaveLength(0);
    });
  }

  test("the venue's call-button toggle also renders as the SAME calm state", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A], { callWaiterEnabled: false });
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);

    await expect(
      t.mutation(api.orderingRequests.callWaiter, { code: CODE, guestKey }),
    ).rejects.toThrow(REQUEST_ERROR.unavailable);
    expect(await requests(t)).toHaveLength(0);
  });

  test("publicOrderingState exposes ONE boolean and never the cause", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A]);

    // No shift yet.
    const closed = await t.query(api.ordering.publicOrderingState, {
      code: CODE,
    });
    if (closed.status !== "available") throw new Error("expected available");
    expect(closed.acceptingRequests).toBe(false);

    await openShift(t, CODE);
    const open = await t.query(api.ordering.publicOrderingState, {
      code: CODE,
    });
    if (open.status !== "available") throw new Error("expected available");
    expect(open.acceptingRequests).toBe(true);

    // The payload must not carry the diagnostic A/B distinction (§2.6): a guest
    // must not be able to tell "the tablet is asleep" from "the shift is shut".
    const serialized = JSON.stringify(open);
    expect(serialized).not.toContain("stale");
    expect(serialized).not.toContain("paused");
    expect(serialized).not.toContain("lastHeartbeatAt");

    // Pausing flips the one boolean, live, with no clock read in the query.
    const shift = await t.run((ctx) => ctx.db.query("orderingShifts").first());
    await t.run((ctx) => ctx.db.patch(shift!._id, { paused: true }));
    const paused = await t.query(api.ordering.publicOrderingState, {
      code: CODE,
    });
    if (paused.status !== "available") throw new Error("expected available");
    expect(paused.acceptingRequests).toBe(false);
  });
});

// =============================================================================
// Identity — without cardId there is no table, and an order with no table is
// worthless (§2.2, risk #1).
// =============================================================================

describe("TASK-66: the request always carries the table (RFC-004 §2.2)", () => {
  test("a guest minted without a cardId is refused — no table, no request", async () => {
    const t = newT();
    const { businessId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    // The shape a rate-limited mint (or any future non-card path) would leave
    // behind: a valid bearer with NO table.
    const guestKey = "tableless-guest-key-0000000000000000000000";
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("orderingGuests", {
        businessId,
        code: CODE,
        guestKey,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.mutation(api.orderingRequests.callWaiter, { code: CODE, guestKey }),
    ).rejects.toThrow(REQUEST_ERROR.noTable);
    expect(await requests(t)).toHaveLength(0);
  });

  test("an unknown bearer is refused", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    await expect(
      t.mutation(api.orderingRequests.callWaiter, {
        code: CODE,
        guestKey: "not-a-real-bearer",
      }),
    ).rejects.toThrow(REQUEST_ERROR.invalidGuest);
  });

  test("another venue's bearer cannot act on this venue", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A]);
    await seedVenue(t, OTHER_CODE, [CARD_B]);
    await openShift(t, CODE);
    await openShift(t, OTHER_CODE);
    const foreign = await mintGuest(t, CARD_B, OTHER_CODE);

    await expect(
      t.mutation(api.orderingRequests.callWaiter, {
        code: CODE,
        guestKey: foreign,
      }),
    ).rejects.toThrow(REQUEST_ERROR.invalidGuest);
    expect(await requests(t)).toHaveLength(0);
  });

  test("an unknown venue code is refused", async () => {
    const t = newT();
    await expect(
      t.mutation(api.orderingRequests.callWaiter, {
        code: "ZZZZ9999",
        guestKey: "whatever",
      }),
    ).rejects.toThrow(REQUEST_ERROR.notFound);
  });
});

// =============================================================================
// The payload is the venue's, not the client's (§2.13, §2.3).
// =============================================================================

describe("TASK-66: order lines are the venue's rows (RFC-004 §2.13)", () => {
  test("an item switched to `nema više` fails the WHOLE order", async () => {
    const t = newT();
    const { businessId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const pivo = await addItem(t, businessId, "Pivo");
    const rakija = await addItem(t, businessId, "Rakija", { available: false });

    await expect(
      t.mutation(api.orderingRequests.submitOrder, {
        code: CODE,
        guestKey,
        lines: [
          { itemId: pivo, qty: 1 },
          { itemId: rakija, qty: 1 },
        ],
      }),
    ).rejects.toThrow(REQUEST_ERROR.invalidItems);
    // Nothing partial: no request, and no orphan line for the available half.
    expect(await requests(t)).toHaveLength(0);
    expect(
      await t.run((ctx) => ctx.db.query("serviceRequestItems").collect()),
    ).toHaveLength(0);
  });

  test("another business's item cannot be ordered here", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A]);
    const other = await seedVenue(t, OTHER_CODE, [CARD_B]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const foreignItem = await addItem(t, other.businessId, "Tuđe pivo");

    await expect(
      t.mutation(api.orderingRequests.submitOrder, {
        code: CODE,
        guestKey,
        lines: [{ itemId: foreignItem, qty: 1 }],
      }),
    ).rejects.toThrow(REQUEST_ERROR.invalidItems);
    expect(await requests(t)).toHaveLength(0);
  });

  test("empty, duplicated and out-of-range quantities are refused, not clamped", async () => {
    const t = newT();
    const { businessId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const pivo = await addItem(t, businessId, "Pivo");

    const bad = [
      [],
      [{ itemId: pivo, qty: 0 }],
      [{ itemId: pivo, qty: -3 }],
      [{ itemId: pivo, qty: 1.5 }],
      [{ itemId: pivo, qty: 1000 }],
      [
        { itemId: pivo, qty: 1 },
        { itemId: pivo, qty: 2 },
      ],
    ];
    for (const lines of bad) {
      await expect(
        t.mutation(api.orderingRequests.submitOrder, {
          code: CODE,
          guestKey,
          lines,
        }),
      ).rejects.toThrow(REQUEST_ERROR.invalidItems);
    }
    expect(await requests(t)).toHaveLength(0);
  });

  test("an over-long note is refused rather than silently truncated", async () => {
    const t = newT();
    const { businessId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const pivo = await addItem(t, businessId, "Pivo");

    await expect(
      t.mutation(api.orderingRequests.submitOrder, {
        code: CODE,
        guestKey,
        lines: [{ itemId: pivo, qty: 1 }],
        note: "x".repeat(281),
      }),
    ).rejects.toThrow(REQUEST_ERROR.noteTooLong);
    expect(await requests(t)).toHaveLength(0);
  });

  test("a reason the venue did not configure is refused", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A], { reasons: ["Račun"] });
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);

    await expect(
      t.mutation(api.orderingRequests.callWaiter, {
        code: CODE,
        guestKey,
        reason: "kupi mi cigarete",
      }),
    ).rejects.toThrow(REQUEST_ERROR.invalidReason);
    expect(await requests(t)).toHaveLength(0);
  });
});

// =============================================================================
// Spam ceilings (§2.9) — per guest for orders, per TABLE for calls.
// =============================================================================

describe("TASK-66: rate limits (RFC-004 §2.9)", () => {
  test("the call ceiling is per TABLE — it holds ACROSS guests at that table", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestA = await mintGuest(t, CARD_A, CODE);
    const guestB = await mintGuest(t, CARD_A, CODE);

    // capacity 3 on the cardId bucket: three calls land no matter who sends
    // them, and the fourth is refused VISIBLY (never a silent drop).
    await t.mutation(api.orderingRequests.callWaiter, {
      code: CODE,
      guestKey: guestA,
    });
    await t.mutation(api.orderingRequests.callWaiter, {
      code: CODE,
      guestKey: guestB,
    });
    await t.mutation(api.orderingRequests.callWaiter, {
      code: CODE,
      guestKey: guestA,
    });
    await expect(
      t.mutation(api.orderingRequests.callWaiter, {
        code: CODE,
        guestKey: guestB,
      }),
    ).rejects.toThrow(REQUEST_ERROR.rateLimited);

    expect(await requests(t)).toHaveLength(3);
  });

  test("a different TABLE has its own call bucket", async () => {
    const t = newT();
    await seedVenue(t, CODE, [CARD_A, CARD_B]);
    await openShift(t, CODE);
    const atA = await mintGuest(t, CARD_A, CODE);
    const atB = await mintGuest(t, CARD_B, CODE);

    for (let i = 0; i < 3; i += 1) {
      await t.mutation(api.orderingRequests.callWaiter, {
        code: CODE,
        guestKey: atA,
      });
    }
    await expect(
      t.mutation(api.orderingRequests.callWaiter, {
        code: CODE,
        guestKey: atA,
      }),
    ).rejects.toThrow(REQUEST_ERROR.rateLimited);
    // Table B is untouched by table A's flood — the whole point of not keying
    // this per IP (a hall shares one NAT).
    await t.mutation(api.orderingRequests.callWaiter, {
      code: CODE,
      guestKey: atB,
    });
    expect(await requests(t)).toHaveLength(4);
  });

  test("the order ceiling is per guest bearer", async () => {
    const t = newT();
    const { businessId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const pivo = await addItem(t, businessId, "Pivo");
    const send = () =>
      t.mutation(api.orderingRequests.submitOrder, {
        code: CODE,
        guestKey,
        lines: [{ itemId: pivo, qty: 1 }],
      });

    await send();
    await send();
    await send();
    await expect(send()).rejects.toThrow(REQUEST_ERROR.rateLimited);
    expect(await requests(t)).toHaveLength(3);
  });

  test("an unavailable venue refuses BEFORE spending a token", async () => {
    // A guest must not burn their allowance on a venue that is switched off:
    // when the shift reopens the first tap has to work.
    const t = newT();
    const { businessId } = await seedVenue(t, CODE, [CARD_A]);
    await openShift(t, CODE);
    const guestKey = await mintGuest(t, CARD_A, CODE);
    const pivo = await addItem(t, businessId, "Pivo");
    const shift = await t.run((ctx) => ctx.db.query("orderingShifts").first());
    await t.run((ctx) => ctx.db.patch(shift!._id, { paused: true }));

    for (let i = 0; i < 5; i += 1) {
      await expect(
        t.mutation(api.orderingRequests.submitOrder, {
          code: CODE,
          guestKey,
          lines: [{ itemId: pivo, qty: 1 }],
        }),
      ).rejects.toThrow(REQUEST_ERROR.unavailable);
    }

    await t.run((ctx) => ctx.db.patch(shift!._id, { paused: false }));
    await t.mutation(api.orderingRequests.submitOrder, {
      code: CODE,
      guestKey,
      lines: [{ itemId: pivo, qty: 1 }],
    });
    expect(await requests(t)).toHaveLength(1);
  });
});

// =============================================================================
// No payment, anywhere (§2.3). Guarded here as well as in TASK-70, because the
// seam a "pay" button would enter through is this file.
// =============================================================================

test("an order writes no total, no amount owed and no paid state (§2.3)", async () => {
  const t = newT();
  const { businessId } = await seedVenue(t, CODE, [CARD_A]);
  await openShift(t, CODE);
  const guestKey = await mintGuest(t, CARD_A, CODE);
  const pivo = await addItem(t, businessId, "Pivo", { priceRsd: 280 });

  await t.mutation(api.orderingRequests.submitOrder, {
    code: CODE,
    guestKey,
    lines: [{ itemId: pivo, qty: 3 }],
  });

  const row = (await requests(t))[0];
  const keys = Object.keys(row);
  for (const forbidden of ["total", "amount", "paid", "amountRsd", "totalRsd"]) {
    expect(keys).not.toContain(forbidden);
  }
  // The informational price is stored per line and is NEVER multiplied by qty.
  const line = (
    await t.run((ctx) => ctx.db.query("serviceRequestItems").collect())
  )[0];
  expect(line.priceRsd).toBe(280);
  expect(line.qty).toBe(3);
});
