import { internalMutation } from "./_generated/server";

const EXPIRY_BATCH = 200;

// Entitlement-expiry sweep (RFC-001 §2.3), invoked by the daily cron
// (convex/crons.ts). Flips ACTIVE rows whose `validUntil` has passed to
// "expired"; enforcement reads only status === "active". Rows without a
// `validUntil` are perpetual (manual grants) and are never expired.
//
// `by_status_and_validUntil` orders missing/undefined validUntil BEFORE all
// numbers, so a `.lte(now)` range still scans those rows — the `undefined`
// guard below skips them. Batched with a self-reschedule so a large backlog
// stays within one transaction's limits.
export const sweepExpiredEntitlements = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("entitlements")
      .withIndex("by_status_and_validUntil", (q) =>
        q.eq("status", "active").lte("validUntil", now),
      )
      .take(EXPIRY_BATCH);

    let expired = 0;
    for (const row of due) {
      if (row.validUntil === undefined) continue; // perpetual — never expires
      await ctx.db.patch(row._id, { status: "expired", updatedAt: now });
      expired += 1;
    }

    return { scanned: due.length, expired };
  },
});
