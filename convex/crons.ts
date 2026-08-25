import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Crons that back materialized state so no query ever reads the wall clock:
//   • the daily entitlement-expiry sweep (TASK-03 / RFC-001 §2.3);
//   • the 15-minute Venue event-lifecycle reconcile (TASK-08 / RFC-001 §2.2) —
//     a safety net that flips scheduled→live and live→ended events the scheduler
//     missed. It sweeps events.by_status_and_startsAt / by_status_and_endsAt and
//     no-ops on empty tables.
//
// DELIBERATELY ABSENT — do not add here:
//   • retention / purge sweeps (RFC-001 §2.9) — they delete rows in tables that
//     do not exist yet (memoriesPhotos content, mediaAssets blobs); adding them
//     now is untestable dead code. They land with the image pipeline.
//   • the Memories session-close reconcile (RFC-001 §2.2 C.5) — no sessions are
//     written yet; it lands with the Memories lifecycle work.
//   • @convex-dev/rate-limiter is NOT mounted (RFC-001 §2.9) — it has no consumer
//     until the card resolver exists.
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

export default crons;
