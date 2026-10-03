/// <reference types="vite/client" />

// TASK-43 — the reservation-request workflow: zones with unit capacity, the
// 2h soft hold (reserve→commit), the owner's confirm/decline, the per-IP and
// per-event throttles, and the Premium gate on the whole surface. The HARD
// RULE under test everywhere: nothing here auto-confirms — a submission only
// ever creates a PENDING request the owner decides on.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { Infer } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { venueBlockValidator } from "./lib/venueValidators";
import { defaults, type VenueBlock } from "../lib/venue-blocks";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

type ArgBlock = Infer<typeof venueBlockValidator>;
const asArgBlocks = (blocks: VenueBlock[]) => blocks as unknown as ArgBlock[];

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof newT>;

async function seed(t: T) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Klub Barok",
      slug: "klub-barok",
      status: "active",
      createdAt: now,
    });
    const venueProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_venue",
      slug: "klub-barok-venue",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const entitlementId = await ctx.db.insert("entitlements", {
      businessId,
      product: "scanme_venue",
      planKey: "premium",
      status: "active",
      source: "manual",
      createdAt: now,
      updatedAt: now,
    });
    return { adminId, businessId, venueProfileId, entitlementId };
  });
}

function admin(t: T, adminId: Id<"users">) {
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

type ReservationBlock = Extract<VenueBlock, { type: "reservation" }>;

// Create → save a reservation block with the given props → publish.
async function publishReservationEvent(
  t: T,
  adminId: Id<"users">,
  venueProfileId: Id<"serviceProfiles">,
  slug: string,
  props: Partial<ReservationBlock["props"]>,
) {
  const as = admin(t, adminId);
  const { eventId } = await as.mutation(api.venue.createEvent, {
    venueProfileId,
    slug,
    title: `Naslov ${slug}`,
  });
  const reservation = defaults("reservation") as ReservationBlock;
  reservation.base.id = "res-1";
  reservation.props = { ...reservation.props, ...props };
  await as.mutation(api.venue.saveDraft, {
    eventId,
    blocks: asArgBlocks([reservation]),
  });
  const config = await t.run((ctx) =>
    ctx.db
      .query("venueEventConfigs")
      .filter((q) => q.eq(q.field("eventId"), eventId))
      .unique(),
  );
  await as.mutation(api.venue.publishDraft, {
    eventId,
    expectedDraftRevision: config!.draftRevision,
  });
  return { eventId };
}

const TWO_ZONES: ReservationBlock["props"]["zones"] = [
  { id: "z-table", name: "Sto za dvoje", capacity: 2 },
  { id: "z-bar", name: "Bar", capacity: 3 },
];

// Every submit gets its own ipHash by default so the per-IP bucket stays out
// of tests that target other rules; the dedicated test below pins one key.
let ipCounter = 0;
function submitArgs(eventSlug: string, name: string) {
  ipCounter += 1;
  return {
    businessSlug: "klub-barok",
    eventSlug,
    name,
    phone: "+381 60 123 4567",
    ipHash: `ip-${ipCounter}`,
  };
}

describe("submit (guest requests)", () => {
  test("rejects when no published reservation block exists", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const { eventId } = await as.mutation(api.venue.createEvent, {
      venueProfileId,
      slug: "bez-rezervacija",
      title: "Bez",
    });
    await as.mutation(api.venue.saveDraft, {
      eventId,
      blocks: asArgBlocks([]),
    });
    const config = await t.run((ctx) =>
      ctx.db
        .query("venueEventConfigs")
        .filter((q) => q.eq(q.field("eventId"), eventId))
        .unique(),
    );
    await as.mutation(api.venue.publishDraft, {
      eventId,
      expectedDraftRevision: config!.draftRevision,
    });
    await expect(
      t.mutation(api.venueReservations.submit, {
        ...submitArgs("bez-rezervacija", "Milena"),
      }),
    ).rejects.toThrow(/nisu dostupne/);
  });

  test("a submission is a PENDING request with a 2h soft hold — never auto-confirmed", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "zurka", {
      zones: TWO_ZONES,
    });
    const before = Date.now();
    await t.mutation(api.venueReservations.submit, {
      ...submitArgs("zurka", "Milena Vidaković"),
      zoneId: "z-table",
      partySize: 2,
      desiredAt: before + 3_600_000,
    });
    const rows = await t.run((ctx) => ctx.db.query("venueReservations").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].zoneId).toBe("z-table");
    expect(rows[0].zoneName).toBe("Sto za dvoje");
    expect(rows[0].heldUntil).toBeGreaterThanOrEqual(before + 2 * 3_600_000);
  });

  test("zone capacity: one unit per request; a full zone refuses, siblings stay open", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "kap", {
      zones: TWO_ZONES,
    });
    const submit = (name: string, zoneId: string) =>
      t.mutation(api.venueReservations.submit, {
        ...submitArgs("kap", name),
        zoneId,
        partySize: 4, // party size NEVER affects zone units
      });

    await submit("Prva", "z-table");
    await submit("Druga", "z-table"); // capacity 2 — exactly fits
    await expect(submit("Treća", "z-table")).rejects.toThrow(/popunjena/);
    await submit("Četvrta", "z-bar"); // the other zone is unaffected

    const availability = await t.query(api.venueReservations.availability, {
      businessSlug: "klub-barok",
      eventSlug: "kap",
    });
    expect(availability.kind).toBe("zones");
    if (availability.kind === "zones") {
      const table = availability.zones.find((z) => z.id === "z-table");
      expect(table).toMatchObject({ used: 2, full: true });
      expect(availability.allFull).toBe(false);
    }
  });

  test("zone selection is required and validated when zones exist", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "zone", {
      zones: TWO_ZONES,
    });
    await expect(
      t.mutation(api.venueReservations.submit, submitArgs("zone", "Bez zone")),
    ).rejects.toThrow(/zonu/i);
    await expect(
      t.mutation(api.venueReservations.submit, {
        ...submitArgs("zone", "Laž"),
        zoneId: "ne-postoji",
      }),
    ).rejects.toThrow(/ne postoji/i);
  });

  test("legacy no-zones capacity still counts total seats", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "kapacitet", {
      capacity: 4,
    });
    const submit = (name: string, partySize: number) =>
      t.mutation(api.venueReservations.submit, {
        ...submitArgs("kapacitet", name),
        partySize,
      });
    await submit("Prva grupa", 3);
    await expect(submit("Druga grupa", 2)).rejects.toThrow(/popunjena/);
    await submit("Solo gost", 1); // 3 + 1 = 4 exactly fits
    await expect(submit("Zakasneli", 1)).rejects.toThrow(/popunjena/);
  });

  test("the expired hold frees its unit (scheduled flip + cron backstop)", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "istek", {
      zones: [{ id: "z-1", name: "Separe", capacity: 1 }],
    });
    await t.mutation(api.venueReservations.submit, {
      ...submitArgs("istek", "Prvi"),
      zoneId: "z-1",
    });
    await expect(
      t.mutation(api.venueReservations.submit, {
        ...submitArgs("istek", "Drugi"),
        zoneId: "z-1",
      }),
    ).rejects.toThrow(/popunjena/);

    // The per-row scheduled flip.
    const row = await t.run((ctx) =>
      ctx.db.query("venueReservations").unique(),
    );
    await t.mutation(internal.venueReservations.expireHold, {
      reservationId: row!._id,
    });
    expect(
      (await t.run((ctx) => ctx.db.get(row!._id)))!.status,
    ).toBe("expired");

    // The unit is free again.
    await t.mutation(api.venueReservations.submit, {
      ...submitArgs("istek", "Drugi pokušaj"),
      zoneId: "z-1",
    });

    // The cron backstop flips overdue pending rows the same way.
    const second = await t.run((ctx) =>
      ctx.db
        .query("venueReservations")
        .filter((q) => q.eq(q.field("status"), "pending"))
        .unique(),
    );
    await t.run((ctx) =>
      ctx.db.patch(second!._id, { heldUntil: Date.now() - 60_000 }),
    );
    const swept = await t.mutation(
      internal.venueReservations.sweepExpiredHolds,
      {},
    );
    expect(swept.expired).toBe(1);
  });

  test("honours the field config: disabled fields dropped, enabled name required", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "polja", {
      fields: { name: true, phone: false, email: false, partySize: true, note: false },
    });
    await expect(
      t.mutation(api.venueReservations.submit, {
        ...submitArgs("polja", ""),
        name: undefined,
        partySize: 2,
      }),
    ).rejects.toThrow(/ime i prezime/i);
    await t.mutation(api.venueReservations.submit, {
      ...submitArgs("polja", "Milena Vidaković"),
      note: "ugao do bine",
      partySize: 3,
    });
    const rows = await t.run((ctx) => ctx.db.query("venueReservations").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].partySize).toBe(3);
    expect(rows[0].phone).toBeUndefined(); // disabled → dropped
    expect(rows[0].note).toBeUndefined(); // disabled → dropped
  });

  test("enforces the deadline", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "rok", {
      deadline: Date.now() - 60_000,
    });
    await expect(
      t.mutation(api.venueReservations.submit, submitArgs("rok", "Kasni")),
    ).rejects.toThrow(/rok/i);
  });

  test("rejects once the event has ended", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    const as = admin(t, adminId);
    const { eventId } = await publishReservationEvent(
      t,
      adminId,
      venueProfileId,
      "zavrsen",
      {},
    );
    const now = Date.now();
    const { lifecycleRevision } = await as.mutation(api.venue.scheduleEvent, {
      eventId,
      startsAt: now + 3_600_000,
      endsAt: now + 7_200_000,
    });
    await t.mutation(internal.venue.goLive, {
      eventId,
      expectedRevision: lifecycleRevision,
    });
    await t.mutation(internal.venue.endEvent, {
      eventId,
      expectedRevision: lifecycleRevision,
    });
    await expect(
      t.mutation(api.venueReservations.submit, submitArgs("zavrsen", "Gost")),
    ).rejects.toThrow(/zatvorene/i);
  });

  test("per-IP token bucket throttles a single-source burst", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "flood", {});
    const submit = (name: string) =>
      t.mutation(api.venueReservations.submit, {
        businessSlug: "klub-barok",
        eventSlug: "flood",
        name,
        phone: "+381 60 123 4567",
        ipHash: "one-ip",
      });
    for (let i = 0; i < 5; i += 1) {
      await submit(`Gost ${i}`);
    }
    await expect(submit("Šesti")).rejects.toThrow(/mnogo zahteva/i);
  });

  test("per-event window throttles a distributed burst", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "navala", {});
    for (let i = 0; i < 15; i += 1) {
      await t.mutation(
        api.venueReservations.submit,
        submitArgs("navala", `Gost ${i}`),
      );
    }
    await expect(
      t.mutation(api.venueReservations.submit, submitArgs("navala", "Kasni")),
    ).rejects.toThrow(/mnogo zahteva/i);
  });

  test("the whole surface closes when the plan drops the reservation block", async () => {
    const t = newT();
    const { adminId, entitlementId, venueProfileId } = await seed(t);
    await publishReservationEvent(t, adminId, venueProfileId, "pad", {
      zones: TWO_ZONES,
    });
    await t.run((ctx) => ctx.db.patch(entitlementId, { planKey: "basic" }));
    await expect(
      t.mutation(api.venueReservations.submit, {
        ...submitArgs("pad", "Gost"),
        zoneId: "z-table",
      }),
    ).rejects.toThrow(/nisu dostupne/);
    expect(
      await t.query(api.venueReservations.availability, {
        businessSlug: "klub-barok",
        eventSlug: "pad",
      }),
    ).toEqual({ kind: "none" });
  });

  test("bumps the event's daily reservationSubmits rollup", async () => {
    const t = newT();
    const { adminId, venueProfileId } = await seed(t);
    const { eventId } = await publishReservationEvent(
      t,
      adminId,
      venueProfileId,
      "brojac",
      {},
    );
    await t.mutation(
      api.venueReservations.submit,
      submitArgs("brojac", "Gost"),
    );
    const metric = await t.run((ctx) =>
      ctx.db
        .query("dailyEventMetrics")
        .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", eventId))
        .unique(),
    );
    expect(metric?.reservationSubmits).toBe(1);
  });
});

describe("owner workflow (confirm / decline — the OWNER decides)", () => {
  async function seedWithRequest(t: T) {
    const { adminId, entitlementId, venueProfileId } = await seed(t);
    const { eventId } = await publishReservationEvent(
      t,
      adminId,
      venueProfileId,
      "odluka",
      { zones: [{ id: "z-1", name: "Separe", capacity: 1 }] },
    );
    await t.mutation(api.venueReservations.submit, {
      ...submitArgs("odluka", "Milena Vidaković"),
      zoneId: "z-1",
      partySize: 2,
    });
    const row = await t.run((ctx) =>
      ctx.db.query("venueReservations").unique(),
    );
    return { adminId, entitlementId, eventId, reservationId: row!._id };
  }

  test("listForEvent needs editor access and returns rows + zone usage", async () => {
    const t = newT();
    const { adminId, eventId } = await seedWithRequest(t);
    await expect(
      t.query(api.venueReservations.listForEvent, { eventId }),
    ).rejects.toThrow();
    const list = await admin(t, adminId).query(
      api.venueReservations.listForEvent,
      { eventId },
    );
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0].status).toBe("pending");
    expect(list.zoneUsage).toEqual([
      { id: "z-1", name: "Separe", capacity: 1, used: 1 },
    ]);
  });

  test("confirm keeps the unit; decline frees it", async () => {
    const t = newT();
    const { adminId, reservationId } = await seedWithRequest(t);
    const as = admin(t, adminId);

    await as.mutation(api.venueReservations.confirm, { reservationId });
    let row = await t.run((ctx) => ctx.db.get(reservationId));
    expect(row!.status).toBe("confirmed");
    // A confirmed unit still blocks the zone…
    await expect(
      t.mutation(api.venueReservations.submit, {
        ...submitArgs("odluka", "Drugi"),
        zoneId: "z-1",
      }),
    ).rejects.toThrow(/popunjena/);

    // …and the scheduled hold-expiry can no longer touch it.
    await t.mutation(internal.venueReservations.expireHold, { reservationId });
    row = await t.run((ctx) => ctx.db.get(reservationId));
    expect(row!.status).toBe("confirmed");

    await as.mutation(api.venueReservations.decline, { reservationId });
    row = await t.run((ctx) => ctx.db.get(reservationId));
    expect(row!.status).toBe("declined");
    await t.mutation(api.venueReservations.submit, {
      ...submitArgs("odluka", "Drugi"),
      zoneId: "z-1",
    });
  });

  test("confirming a freed (expired) request re-checks capacity", async () => {
    const t = newT();
    const { adminId, reservationId } = await seedWithRequest(t);
    const as = admin(t, adminId);

    // The hold expires; another guest takes the only unit.
    await t.mutation(internal.venueReservations.expireHold, { reservationId });
    await t.mutation(api.venueReservations.submit, {
      ...submitArgs("odluka", "Preoteo"),
      zoneId: "z-1",
    });

    // The owner tries to confirm the expired one late — the zone is full now.
    await expect(
      as.mutation(api.venueReservations.confirm, { reservationId }),
    ).rejects.toThrow(/popunjena/);
  });

  test("only editors may confirm or decline", async () => {
    const t = newT();
    const { reservationId } = await seedWithRequest(t);
    await expect(
      t.mutation(api.venueReservations.confirm, { reservationId }),
    ).rejects.toThrow();
    await expect(
      t.mutation(api.venueReservations.decline, { reservationId }),
    ).rejects.toThrow();
  });
});
