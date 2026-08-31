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
//    The buckets exist to stop dumb floods, not to shape guest traffic.
//  - reserveUpload is keyed per guest and sized for a person sequentially
//    uploading a night's worth of photos, with headroom for retries.
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  // Per-IP buckets, sized for the scan burst (TASK-25 Step 0 item 2). The
  // arithmetic that sets these numbers: a whole hall sits behind ONE NAT IP,
  // ONE memories scan consumes a cardResolve token AND a guestCreate token
  // (cards.resolveAndRecord mints a fresh guest on EVERY scan — the
  // path-scoped cookie is invisible to /r/), and the burst is instantaneous:
  // when the cards land on the tables, the whole room scans inside the first
  // minute. The largest room this product plausibly meets is a ~300-guest
  // wedding, so CAPACITY must cover the entire room at once — a refused scan
  // 302s to the "kartica nije aktivna" page at the exact moment of the first
  // impression, and a refused guestCreate strands the guest identity-less.
  // rate 300/min (5/s sustained) still hard-stops scripted floods, which run
  // orders of magnitude above that; only the burst allowance is generous.
  cardResolve: { kind: "token bucket", rate: 300, period: MINUTE, capacity: 300 },
  // Same shape as cardResolve on purpose: every memories scan spends both, so
  // a tighter guestCreate would just move the refusal one step later (the
  // guest reaches /m/[code] with no key and cannot upload).
  guestCreate: { kind: "token bucket", rate: 300, period: MINUTE, capacity: 300 },
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
  // Venue reservation requests (TASK-43): keyed by the ipHash the Next route
  // handler computes (the cardResolve pattern). One person legitimately sends
  // a request, maybe corrects it once — capacity 5 covers a family arguing
  // over the zone; rate 10/min stops a script hollowing out an event through
  // 2h soft holds. The per-event in-transaction window (15/min) backstops
  // distributed floods.
  venueReservation: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 5 },
});
