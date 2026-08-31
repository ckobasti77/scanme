import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Crons that back materialized state so no query ever reads the wall clock:
//   • the daily entitlement-expiry sweep (TASK-03 / RFC-001 §2.3);
//   • the 15-minute Venue event-lifecycle reconcile (TASK-08 / RFC-001 §2.2) —
//     a safety net that flips scheduled→live and live→ended events the scheduler
//     missed. It sweeps events.by_status_and_startsAt / by_status_and_endsAt and
//     no-ops on empty tables.
//   • the 15-minute Memories stale-session sweep (TASK-14 / RFC-001 §2.4 C.5) —
//     the backstop for lost scheduled closeSession calls: closes recurring
//     sessions whose night has rolled over and one_off sessions past windowEndAt.
//   • the hourly purge of stale `reserved` AND `processing` memoriesPhotos
//     rows older than 24h (TASK-14/15 / RFC-001 §2.8–2.9) — quota slots whose
//     client never uploaded, and pipeline runs that crashed between claim and
//     commit, together with their pinned original blobs. This is the reaper
//     half of the reserve→commit protocol: a crash costs storage for one day,
//     not forever.
//   • the daily retention sweep (TASK-20 / RFC-001 §2.9) — per space,
//     tombstones photos older than the plan's retentionDays (30/90/365), in
//     batches with scheduler continuations.
//   • the daily purge sweep (TASK-20 / RFC-001 §2.9–2.10) — walks `deleted`
//     tombstones (from retention AND every deletion request) and removes the
//     processed variants, any pinned original, the asset doc, and the archive
//     pins referencing it, THEN the row. This is where bytes actually die.
const crons = cronJobs();

crons.interval(
  "expire entitlements",
  { hours: 24 },
  internal.entitlements.sweepExpiredEntitlements,
  {},
);

crons.interval(
  "reconcile event lifecycle",
  { minutes: 15 },
  internal.venue.reconcileEventLifecycle,
  {},
);

crons.interval(
  "close stale memories sessions",
  { minutes: 15 },
  internal.memories.sweepStaleSessions,
  {},
);

crons.interval(
  "purge stale upload reservations",
  { hours: 1 },
  internal.memories.purgeStaleReservations,
  {},
);

crons.interval(
  "memories retention sweep",
  { hours: 24 },
  internal.memories.retentionSweep,
  {},
);

crons.interval(
  "memories purge deleted photos",
  { hours: 24 },
  internal.memories.purgeSweep,
  {},
);

//   • the daily export-link expiry (TASK-21 / RFC-001 §2.10) — a ready archive
//     whose 14-day link lifetime elapsed has its blob deleted (so even a leaked
//     URL 404s) and its row flipped to `expired`. This is the ONLY thing that
//     ends an export; a live-photo retention sweep never touches a built archive.
crons.interval(
  "memories purge expired exports",
  { hours: 24 },
  internal.memoriesExport.purgeExpiredExports,
  {},
);

//   • the 15-minute venue reservation-hold sweep (TASK-43) — the backstop for
//     lost per-row scheduled flips: frees pending requests whose 2h soft hold
//     (heldUntil) elapsed by marking them expired, so fullness queries stay
//     clock-free. No-ops when nothing is due.
crons.interval(
  "expire venue reservation holds",
  { minutes: 15 },
  internal.venueReservations.sweepExpiredHolds,
  {},
);

//   • the daily billing-cycle sweep (TASK-32 / RFC-002 §2.5–§2.6) — flips
//     ACTIVE accounts whose paid-through date (accounts.planValidUntil) plus
//     grace has elapsed to "expired", which cuts getEntitlement's account-plan
//     fallback (step 3 requires status "active"). Batched with a
//     self-reschedule; flipped rows leave the index range, so it is resumable
//     and idempotent with no cursor. A recorded payment flips the account back.
crons.interval(
  "billing cycle sweep",
  { hours: 24 },
  internal.billing.sweepBillingCycles,
  {},
);

export default crons;
