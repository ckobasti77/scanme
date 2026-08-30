import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { components } from "../_generated/api";

// Abuse throttling for the new public Memories/cards surfaces (RFC-001 §2.9).
// This is the rate limiter's ONLY job here: it is deliberately NOT used for the
// guest photo quota — that is a lifetime cap with admin grants and
// delete-refunds, enforced as a same-transaction index count in
// memories.reserveUpload. The limiter models rates per period; the quota does
// not fit that model.
//
// Key choices:
//  - cardResolve / guestCreate are keyed by an IP hash the Next.js resolver
//    computes (the raw IP never reaches Convex — GDPR minimization, §2.10).
//    The rates are deliberately generous: a whole venue can sit behind ONE NAT
//    IP, so a big party legitimately produces many scans per minute from one
//    key. The buckets exist to stop dumb floods, not to shape guest traffic.
//  - reserveUpload is keyed per guest and sized for a person sequentially
//    uploading a night's worth of photos, with headroom for retries.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Per-IP card resolution (/r/[cardCode] → cards.resolveAndRecord).
  cardResolve: { kind: "token bucket", rate: 120, period: MINUTE, capacity: 60 },
  // Per-IP guest creation (the memories_space branch of the resolver mints a
  // guest row + cookie). Tighter than cardResolve: only memories scans mint.
  guestCreate: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 30 },
  // Per-guest reservation bursts (memories.reserveUpload). Capacity must
  // comfortably exceed the largest quota tier (premium = 10): a guest
  // legitimately reserves their whole allowance in one sequential burst, and
  // the quota — not this throttle — must be what says "no" after it.
  reserveUpload: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 15 },
  // Per-guest upload-URL renewals (memories.renewUploadUrl, TASK-16). A retry
  // loop on a dying hall network legitimately renews on every attempt, so this
  // is a SEPARATE bucket with the same budget — retries must never starve
  // fresh reservations, and vice versa. What it stops: a hostile guest minting
  // unbounded upload URLs (each accepts one blob nothing references).
  renewUploadUrl: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 15 },
  // Public offer-logo reservations. The opaque per-tab token scopes the bucket;
  // three immediate attempts leave room for a correction without enabling floods.
  offerLogoUpload: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 3 },
});
