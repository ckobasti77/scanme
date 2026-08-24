import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// The ONLY cron in this task (TASK-03 / RFC-001 §2.3): a daily entitlement-
// expiry sweep.
//
// DELIBERATELY ABSENT — do not add here:
//   • retention / purge sweeps (RFC-001 §2.9) — they delete rows in tables that
//     do not exist yet (memoriesPhotos content, mediaAssets blobs); adding them
//     now is untestable dead code. They land with the image pipeline.
//   • the event/session lifecycle-reconcile crons (RFC-001 §2.2) — no events or
//     sessions are written yet; they land with the Venue/Memories lifecycle work.
//   • @convex-dev/rate-limiter is NOT mounted (RFC-001 §2.9) — it has no consumer
//     until the card resolver exists.
// Each belongs with the feature that writes the rows it sweeps.
const crons = cronJobs();

crons.interval(
  "expire entitlements",
  { hours: 24 },
  internal.entitlements.sweepExpiredEntitlements,
  {},
);

export default crons;
