/// <reference types="vite/client" />

// TASK-65 (RFC-004 §2.6, §2.7, §4) — shift, PIN, and tablet heartbeat.
// The §4 acceptance criteria under test: a correct PIN opens a shift and mints
// a bearer; a wrong PIN is refused (constant-time) and never reveals whether the
// venue has a PIN; a stopped heartbeat flips `stale` at the threshold with no
// wall-clock read in a query; a newer heartbeat cancels the scheduled flip; two
// concurrent opens yield exactly one open shift; the cron backstop catches a
// lost runAt. Plus bearer-authenticated pause/resume/close/heartbeat.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { hashPin, SHIFT_ERROR } from "./orderingShifts";

const modules = import.meta.glob("./**/*.ts");

const CODE = "ABCD2345";

function newT() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}
type T = ReturnType<typeof newT>;

// Seed an active, ordering-entitled venue with an enabled config; optionally a
// PIN ("1234", label "Šef sale") written through the production hashPin.
async function seedVenue(t: T, opts: { withPin: boolean }) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Dva Jelena",
      slug: "dva-jelena",
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
      code: CODE,
      enabled: true,
      callWaiterEnabled: true,
      overdueMinutes: 7,
      reasons: ["Račun"],
      createdAt: now,
      updatedAt: now,
    });
    if (opts.withPin) {
      await ctx.db.insert("staffPins", {
        businessId,
        label: "Šef sale",
        pinHash: await hashPin("1234"),
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }
    return { businessId, now };
  });
}

describe("TASK-65: openShift + PIN (RFC-004 §2.7)", () => {
  test("a correct PIN opens a shift and mints a bearer", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });

    const res = await t.mutation(api.orderingShifts.openShift, {
      code: CODE,
      pin: "1234",
    });
    expect(res.bearer).toBeTruthy();
    expect(res.staffLabel).toBe("Šef sale");

    const shifts = await t.run((ctx) =>
      ctx.db.query("orderingShifts").collect(),
    );
    expect(shifts).toHaveLength(1);
    expect(shifts[0].status).toBe("open");
    expect(shifts[0]._id).toBe(res.shiftId);
    expect(shifts[0].paused).toBe(false);
    expect(shifts[0].stale).toBe(false);
    // The raw bearer is NEVER stored — only its SHA-256 (64 hex chars).
    expect(shifts[0].bearerHash).not.toBe(res.bearer);
    expect(shifts[0].bearerHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test("a wrong PIN is refused and opens no shift", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });

    await expect(
      t.mutation(api.orderingShifts.openShift, { code: CODE, pin: "9999" }),
    ).rejects.toThrow(SHIFT_ERROR.invalidPin);

    const shifts = await t.run((ctx) =>
      ctx.db.query("orderingShifts").collect(),
    );
    expect(shifts).toHaveLength(0);
  });

  test("a venue with NO PIN is refused with the SAME code (no existence leak)", async () => {
    const t = newT();
    await seedVenue(t, { withPin: false });

    // Identical rejection to a wrong PIN — "no PIN configured" is
    // indistinguishable from "wrong PIN" (the decoy-derivation path).
    await expect(
      t.mutation(api.orderingShifts.openShift, { code: CODE, pin: "1234" }),
    ).rejects.toThrow(SHIFT_ERROR.invalidPin);
  });

  test("hashPin is salted: the same PIN hashes differently each time, both verify-shaped", async () => {
    const a = await hashPin("1234");
    const b = await hashPin("1234");
    expect(a).not.toBe(b); // random per-PIN salt
    expect(a.startsWith("pbkdf2-sha256$")).toBe(true);
  });

  test("an unknown venue code is refused as not_found", async () => {
    const t = newT();
    await expect(
      t.mutation(api.orderingShifts.openShift, { code: "ZZZZ9999", pin: "1234" }),
    ).rejects.toThrow(SHIFT_ERROR.notFound);
  });

  test("two concurrent opens yield exactly one open shift", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });

    const [a, b] = await Promise.all([
      t.mutation(api.orderingShifts.openShift, { code: CODE, pin: "1234" }),
      t.mutation(api.orderingShifts.openShift, { code: CODE, pin: "1234" }),
    ]);

    const shifts = await t.run((ctx) =>
      ctx.db.query("orderingShifts").collect(),
    );
    expect(shifts).toHaveLength(1);
    expect(shifts[0].status).toBe("open");
    expect(a.shiftId).toBe(b.shiftId);
    expect(a.shiftId).toBe(shifts[0]._id);
  });
});

describe("TASK-65: heartbeat + materialized stale (RFC-004 §2.6, §1.b)", () => {
  test("a stopped heartbeat flips `stale` at the threshold via the scheduled flip (no clock in a query)", async () => {
    const t = newT();
    // Fake timers must be installed BEFORE the mutation schedules its runAt, so
    // the future flip is registered as a drainable timer (the enterprise/
    // checkout/billing convex-test idiom). crypto/promises are unaffected.
    vi.useFakeTimers();
    try {
      await seedVenue(t, { withPin: true });
      await t.mutation(api.orderingShifts.openShift, { code: CODE, pin: "1234" });

      const before = await t.run((ctx) =>
        ctx.db.query("orderingShifts").unique(),
      );
      expect(before!.stale).toBe(false);

      // Drain the runAt flip openShift scheduled at openedAt + STALE_MS. No new
      // heartbeat arrived, so it materializes stale = true. The value is READ
      // back with a plain db.get — nothing computes it from the clock.
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const after = await t.run((ctx) => ctx.db.get(before!._id));
      expect(after!.stale).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a newer heartbeat cancels a previously scheduled markShiftStale (superseded no-op)", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });
    await t.mutation(api.orderingShifts.openShift, { code: CODE, pin: "1234" });

    const opened = await t.run((ctx) =>
      ctx.db.query("orderingShifts").unique(),
    );
    const hb0 = opened!.lastHeartbeatAt;

    // A heartbeat lands, moving lastHeartbeatAt forward. We set a distinct
    // timestamp directly so the assertion is exact.
    await t.run((ctx) =>
      ctx.db.patch(opened!._id, { lastHeartbeatAt: hb0 + 5_000 }),
    );

    // Fire the ORIGINAL flip (expected = the old heartbeat). It must no-op,
    // because a newer heartbeat has arrived.
    const res = await t.mutation(internal.orderingShifts.markShiftStale, {
      shiftId: opened!._id,
      expectedHeartbeatAt: hb0,
    });
    expect(res.stale).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(opened!._id)))!.stale).toBe(false);

    // Sanity: the CURRENT heartbeat's own flip does mark it stale.
    const res2 = await t.mutation(internal.orderingShifts.markShiftStale, {
      shiftId: opened!._id,
      expectedHeartbeatAt: hb0 + 5_000,
    });
    expect(res2.stale).toBe(true);
  });

  test("a heartbeat clears a stale flag and refreshes presence", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });
    const { bearer } = await t.mutation(api.orderingShifts.openShift, {
      code: CODE,
      pin: "1234",
    });

    const opened = await t.run((ctx) =>
      ctx.db.query("orderingShifts").unique(),
    );
    await t.run((ctx) =>
      ctx.db.patch(opened!._id, { stale: true, lastHeartbeatAt: 1 }),
    );

    await t.mutation(api.orderingShifts.heartbeat, { code: CODE, bearer });

    const after = await t.run((ctx) => ctx.db.get(opened!._id));
    expect(after!.stale).toBe(false);
    expect(after!.lastHeartbeatAt).toBeGreaterThan(1);
  });

  test("the cron backstop flips a shift whose runAt flip was lost", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });
    await t.mutation(api.orderingShifts.openShift, { code: CODE, pin: "1234" });

    // Simulate a lost per-heartbeat flip: age the heartbeat well past any
    // placeholder STALE_MS WITHOUT ever draining the scheduler.
    const shift = await t.run((ctx) =>
      ctx.db.query("orderingShifts").unique(),
    );
    await t.run((ctx) =>
      ctx.db.patch(shift!._id, { lastHeartbeatAt: Date.now() - 10 * 60_000 }),
    );

    const swept = await t.mutation(
      internal.orderingShifts.sweepStaleShifts,
      {},
    );
    expect(swept.staled).toBe(1);

    const after = await t.run((ctx) => ctx.db.get(shift!._id));
    expect(after!.stale).toBe(true);

    // Idempotent: a second sweep finds nothing (already stale is filtered out).
    const again = await t.mutation(
      internal.orderingShifts.sweepStaleShifts,
      {},
    );
    expect(again.staled).toBe(0);
  });
});

describe("TASK-65: bearer-authenticated panel actions (RFC-004 §2.7)", () => {
  test("a wrong bearer is refused on heartbeat", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });
    await t.mutation(api.orderingShifts.openShift, { code: CODE, pin: "1234" });

    await expect(
      t.mutation(api.orderingShifts.heartbeat, {
        code: CODE,
        bearer: "not-the-real-bearer",
      }),
    ).rejects.toThrow(SHIFT_ERROR.invalidBearer);
  });

  test("pause and resume toggle the manual off-switch", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });
    const { bearer } = await t.mutation(api.orderingShifts.openShift, {
      code: CODE,
      pin: "1234",
    });

    await t.mutation(api.orderingShifts.pauseOrdering, { code: CODE, bearer });
    let shift = await t.run((ctx) => ctx.db.query("orderingShifts").unique());
    expect(shift!.paused).toBe(true);

    await t.mutation(api.orderingShifts.resumeOrdering, { code: CODE, bearer });
    shift = await t.run((ctx) => ctx.db.query("orderingShifts").unique());
    expect(shift!.paused).toBe(false);
  });

  test("closeShift closes the shift; a fresh open then creates a new one", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });
    const first = await t.mutation(api.orderingShifts.openShift, {
      code: CODE,
      pin: "1234",
    });

    const closed = await t.mutation(api.orderingShifts.closeShift, {
      code: CODE,
      bearer: first.bearer,
    });
    expect(closed.alreadyClosed).toBe(false);

    // No open shift remains, so heartbeat with the closed bearer is refused.
    await expect(
      t.mutation(api.orderingShifts.heartbeat, {
        code: CODE,
        bearer: first.bearer,
      }),
    ).rejects.toThrow(SHIFT_ERROR.noOpenShift);

    // A new open works and is a distinct shift row.
    const second = await t.mutation(api.orderingShifts.openShift, {
      code: CODE,
      pin: "1234",
    });
    expect(second.shiftId).not.toBe(first.shiftId);

    const all = await t.run((ctx) => ctx.db.query("orderingShifts").collect());
    expect(all).toHaveLength(2);
    expect(all.filter((s) => s.status === "open")).toHaveLength(1);
  });

  test("closeShift is idempotent when nothing is open", async () => {
    const t = newT();
    await seedVenue(t, { withPin: true });
    const res = await t.mutation(api.orderingShifts.closeShift, {
      code: CODE,
      bearer: "anything",
    });
    expect(res).toEqual({ ok: true, alreadyClosed: true });
  });
});
