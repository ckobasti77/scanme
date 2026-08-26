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
//
// DELIBERATELY ABSENT — do not add here:
//   • the retention sweep and the deleted-tombstone blob purge (RFC-001 §2.9
//     retentionSweep / the tombstone half of purgeSweep) — they act on READY
//     media and its mediaAssets variants, which galleries do not serve yet;
//     they land with the remaining Memories tasks.
// Each remaining sweep belongs with the feature that writes the rows it sweeps.
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

export default crons;
