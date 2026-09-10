/// <reference types="vite/client" />

// TASK-62 (RFC-004 §2.16 & §4) — proves the seven new ordering tables validate
// and round-trip through the real Convex schema, and existing tables validate
// unchanged. The former table_ordering inertness checks now assert the wired
// behavior TASK-63 (§2.2, §2.14) added: the kind is creatable, bindable as a
// splitter button, and a direct card 302s to the card-aware hop.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

type T = ReturnType<typeof convexTest>;

async function seedOrderingShell(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Dva Jelena",
      slug: "dva-jelena",
      status: "active",
      createdAt: now,
    });
    const serviceProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: "dva-jelena-venue",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const cardId = await ctx.db.insert("cards", {
      businessId,
      cardCode: "ABCD1234",
      label: "Sto 1",
      status: "active",
      totalScans: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { adminId, businessId, serviceProfileId, cardId, now };
  });
}

function asAdmin(t: T, adminId: Id<"users">) {
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

describe("ordering schema catalog (RFC-004 §2.16, TASK-62)", () => {
  test("round-trip: orderingConfig, orderingItems, staffPins, orderingShifts", async () => {
    const t = newT();
    const { businessId, now } = await seedOrderingShell(t);

    const configId = await t.run(async (ctx) =>
      ctx.db.insert("orderingConfig", {
        businessId,
        code: "jeleni-order",
        enabled: true,
        callWaiterEnabled: true,
        overdueMinutes: 7,
        reasons: ["Račun", "Voda", "Pomoć", "Ostalo"],
        createdAt: now,
        updatedAt: now,
      }),
    );

    const itemId = await t.run(async (ctx) =>
      ctx.db.insert("orderingItems", {
        businessId,
        name: "Ćevapi 10 kom",
        priceRsd: 850,
        available: true,
        order: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const pinId = await t.run(async (ctx) =>
      ctx.db.insert("staffPins", {
        businessId,
        label: "Konobar Marko",
        pinHash: "mocked-sha256-hash",
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const shiftId = await t.run(async (ctx) =>
      ctx.db.insert("orderingShifts", {
        businessId,
        status: "open",
        staffLabel: "Konobar Marko",
        bearerHash: "mocked-bearer-token-hash",
        paused: false,
        lastHeartbeatAt: now,
        stale: false,
        openedAt: now,
        updatedAt: now,
      }),
    );

    const [config, item, pin, shift] = await t.run(async (ctx) => [
      await ctx.db.get(configId),
      await ctx.db.get(itemId),
      await ctx.db.get(pinId),
      await ctx.db.get(shiftId),
    ]);

    expect(config?.businessId).toBe(businessId);
    expect(config?.code).toBe("jeleni-order");
    expect(config?.enabled).toBe(true);
    expect(config?.callWaiterEnabled).toBe(true);
    expect(config?.overdueMinutes).toBe(7);
    expect(config?.reasons).toEqual(["Račun", "Voda", "Pomoć", "Ostalo"]);

    expect(item?.businessId).toBe(businessId);
    expect(item?.name).toBe("Ćevapi 10 kom");
    expect(item?.priceRsd).toBe(850);
    expect(item?.available).toBe(true);

    expect(pin?.businessId).toBe(businessId);
    expect(pin?.label).toBe("Konobar Marko");
    expect(pin?.active).toBe(true);

    expect(shift?.businessId).toBe(businessId);
    expect(shift?.status).toBe("open");
    expect(shift?.staffLabel).toBe("Konobar Marko");
    expect(shift?.paused).toBe(false);
    expect(shift?.stale).toBe(false);
  });

  test("round-trip: orderingGuests, serviceRequests, serviceRequestItems", async () => {
    const t = newT();
    const { businessId, cardId, now } = await seedOrderingShell(t);

    const shiftId = await t.run(async (ctx) =>
      ctx.db.insert("orderingShifts", {
        businessId,
        status: "open",
        staffLabel: "Šef sale",
        bearerHash: "shift-bearer-abc",
        paused: false,
        lastHeartbeatAt: now,
        stale: false,
        openedAt: now,
        updatedAt: now,
      }),
    );

    const guestId = await t.run(async (ctx) =>
      ctx.db.insert("orderingGuests", {
        businessId,
        code: "jeleni-order",
        guestKey: "256-bit-guest-bearer-token",
        cardId,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      }),
    );

    const orderRequestId = await t.run(async (ctx) =>
      ctx.db.insert("serviceRequests", {
        businessId,
        cardId,
        guestId,
        shiftId,
        kind: "order",
        status: "sent",
        note: "Bez crnog luka molim",
        overdue: false,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const callRequestId = await t.run(async (ctx) =>
      ctx.db.insert("serviceRequests", {
        businessId,
        cardId,
        guestId,
        shiftId,
        kind: "call",
        status: "sent",
        reason: "Račun",
        overdue: false,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const orderItemId = await t.run(async (ctx) =>
      ctx.db.insert("serviceRequestItems", {
        requestId: orderRequestId,
        name: "Šopska salata",
        priceRsd: 420,
        qty: 2,
        order: 0,
      }),
    );

    const [guest, orderReq, callReq, reqItem] = await t.run(async (ctx) => [
      await ctx.db.get(guestId),
      await ctx.db.get(orderRequestId),
      await ctx.db.get(callRequestId),
      await ctx.db.get(orderItemId),
    ]);

    expect(guest?.cardId).toBe(cardId);
    expect(guest?.code).toBe("jeleni-order");

    expect(orderReq?.kind).toBe("order");
    expect(orderReq?.status).toBe("sent");
    expect(orderReq?.note).toBe("Bez crnog luka molim");
    expect(orderReq?.overdue).toBe(false);

    expect(callReq?.kind).toBe("call");
    expect(callReq?.status).toBe("sent");
    expect(callReq?.reason).toBe("Račun");

    expect(reqItem?.requestId).toBe(orderRequestId);
    expect(reqItem?.name).toBe("Šopska salata");
    expect(reqItem?.priceRsd).toBe(420);
    expect(reqItem?.qty).toBe(2);
  });

  test("wired (TASK-63): direct table_ordering card target is creatable", async () => {
    const t = newT();
    const { adminId, businessId } = await seedOrderingShell(t);
    const admin = asAdmin(t, adminId);

    const result = await admin.mutation(api.cards.createCard, {
      businessId,
      label: "Sto 2",
      target: {
        kind: "table_ordering",
      },
    });
    expect(result.targetId).not.toBeNull();

    const target = await t.run(async (ctx) =>
      result.targetId ? ctx.db.get(result.targetId) : null,
    );
    expect(target?.kind).toBe("table_ordering");
  });

  test("wired (TASK-63): table_ordering splitter button is creatable", async () => {
    const t = newT();
    const { adminId, businessId } = await seedOrderingShell(t);
    const admin = asAdmin(t, adminId);

    const result = await admin.mutation(api.cards.createCard, {
      businessId,
      label: "Sto 3",
      target: {
        kind: "splitter",
        splitterItems: [
          { kind: "venue", label: "Ponuda" },
          { kind: "table_ordering", label: "Naruči sa stola" },
        ],
      },
    });
    expect(result.targetId).not.toBeNull();

    const target = await t.run(async (ctx) =>
      result.targetId ? ctx.db.get(result.targetId) : null,
    );
    expect(
      target?.splitterItems?.some((item) => item.kind === "table_ordering"),
    ).toBe(true);
  });

  test("wired (TASK-63): resolveAndRecord routes a table_ordering card to the hop", async () => {
    const t = newT();
    const { adminId, businessId, now } = await seedOrderingShell(t);

    // A direct table_ordering card binds to its business's ordering config; the
    // resolver records the scan and hands the venue code to the card-aware hop
    // /r/[cardCode]/o. Codes are 8-char Crockford (normalizeCode), the same
    // family as memoriesSpaces.code — "jeleni-order" would not survive it.
    const VENUE_CODE = "KAFANA12";
    await t.run(async (ctx) => {
      await ctx.db.insert("orderingConfig", {
        businessId,
        code: VENUE_CODE,
        enabled: true,
        callWaiterEnabled: true,
        overdueMinutes: 7,
        reasons: [],
        createdAt: now,
        updatedAt: now,
      });
    });

    const { cardCode } = await t.run(async (ctx) => {
      const cardId = await ctx.db.insert("cards", {
        businessId,
        cardCode: "KARTA234",
        label: "Sto Test",
        status: "active",
        totalScans: 0,
        createdAt: now,
        updatedAt: now,
      });

      const targetId = await ctx.db.insert("cardTargets", {
        cardId,
        kind: "table_ordering",
        createdByUserId: adminId,
        createdAt: now,
      });

      await ctx.db.patch(cardId, { currentTargetId: targetId });
      return { cardCode: "KARTA234" };
    });

    const result = await t.mutation(api.cards.resolveAndRecord, {
      cardCode,
      requestId: "test-req-12345",
      deviceCategory: "mobile",
      ipHash: "hash-123",
    });

    expect(result).toEqual({
      kind: "table_ordering",
      cardCode: "KARTA234",
      venueCode: VENUE_CODE,
    });
  });
});
