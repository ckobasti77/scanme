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
  // TASK-37: the bare splitter's card-aware Memories hop
  // (cards.resolveSplitterMemories, /r/[cardCode]/m). Same shape and keying
  // as cardResolve, but its OWN bucket: a splitter room's memories entry
  // spends cardResolve at the scan and this at the button tap — sharing the
  // bucket would double-spend cardResolve and halve the 300-guest room burst
  // TASK-25 sized it for. The hop also spends guestCreate (the mint happens
  // here, not at scan time), keeping guestCreate at exactly one token per
  // guest on both the direct and the splitter path.
  splitterMemoriesHop: { kind: "token bucket", rate: 300, period: MINUTE, capacity: 300 },
  // TASK-63 (RFC-004 §2.2): the card-aware ordering hop
  // (cards.resolveTableOrdering, /r/[cardCode]/o). Twin of splitterMemoriesHop
  // — its OWN bucket, keyed by the same ipHash, so an ordering scan spends
  // cardResolve at /r and this at the /o hop without double-spending
  // cardResolve. Separate from Memories on purpose: a hall running both
  // products must not have one starve the other's burst.
  tableOrderingHop: { kind: "token bucket", rate: 300, period: MINUTE, capacity: 300 },
  // TASK-63: the ordering guest mint (cards.mintOrderingGuest). Twin of
  // guestCreate, spent exactly once per ordering guest, in its OWN bucket so
  // ordering never contends with Memories' guestCreate.
  orderGuestCreate: { kind: "token bucket", rate: 300, period: MINUTE, capacity: 300 },
  // TASK-66 (RFC-004 §2.9): the two GUEST ACTIONS. Deliberately keyed
  // differently from each other, and from the per-IP hop buckets above —
  // §2.9 rejects a per-IP action limit outright, because a whole hall sits
  // behind ONE NAT and tables would throttle each other.
  //
  // orderSubmit — keyed per ordering-guest bearer (guest._id), the twin of
  // reserveUpload's keying. The arithmetic: a person at a table sends ONE
  // order, occasionally corrects it, and comes back for a second round twenty
  // minutes later. capacity 3 covers "order, oops, re-order" back-to-back;
  // rate 5/min then refills a token every 12 s, which is above any human
  // ordering cadence and far below a flood. It is smaller than reserveUpload
  // (30/15) on purpose: a reserved upload costs the venue nothing, whereas
  // every order is a row a waiter must walk to a table for.
  orderSubmit: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 3 },
  // callWaiter — keyed per cardId (the TABLE), NOT per guest, and stricter.
  // §2.9: the call is the worst spam vector — one tap buzzes the panel — and
  // the table is the scarce, stable, re-mint-proof identifier (clearing the
  // cookie mints a new guest but cannot conjure a new printed card). A
  // four-top where person A rings, nobody comes, and person B rings again is
  // the legitimate worst case: capacity 3 absorbs it, rate 3/min then allows
  // one more every 20 s. Shared ACROSS guests at that table by construction.
  callWaiter: { kind: "token bucket", rate: 3, period: MINUTE, capacity: 3 },
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
  // Sajam 2026 B2 (HANDOFF §9): the FAIR part of a /r scan, keyed per anonymous
  // visitor (fairVisitors._id — one row per visitorHash), never per IP: the
  // whole hall can sit behind one NAT, so an IP key would let visitors throttle
  // each other. Keyed by the row id rather than the hash so that, once the
  // 16 Nov purge deletes fairVisitors, nothing in the limiter's state still
  // maps back to a cookie. The arithmetic: one physical scan (aim the camera,
  // follow the 302, load the model page) takes a person ≥3 s, so ~20/min is a
  // hard human ceiling; a full tour is ~100 models over hours (≈2/min). One
  // stand with 5 cars plus a few refreshes back-to-back fits capacity 20.
  // Refusal only skips the fair row — the generic scan and the redirect to the
  // model still happen (cards.resolveAndRecord). NOTE: the generic per-IP
  // `cardResolve` (300/min, capacity 300) still runs first for every scan.
  fairScan: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 20 },
  // Sajam 2026 B3 (HANDOFF §9): the interaction writes, each keyed per
  // anonymous visitor (fairVisitors._id) for the same NAT and purge reasons as
  // fairScan. A refusal throws RATE_LIMITED and commits nothing. Duplicate
  // protection is NOT these buckets: rating = one row per visitor+model, vote
  // = one row per visitor+question, survey = submissionId + one response per
  // visitor+model, favorite = one row per visitor+event+brand.
  //
  // fairRating — a person taps stars: Advanced has 3 dimensions, a frontend
  // may send each tap, plus a correction or two ≈ 5 writes per model; a stand
  // with 4 cars rated back-to-back ≈ 20 → capacity 20. Rate 30/min (one write
  // per 2 s sustained) is above any considered rating pace and far below a
  // script.
  fairRating: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 20 },
  // fairAudienceVote — an Advanced model has up to 5 questions a day, answered
  // in one short mobile flow with 2–3 changed answers ≈ 8; two Advanced
  // models at one stand ≈ 15 → capacity 15, refill 30/min as above.
  fairAudienceVote: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 15 },
  // fairSurveySubmit — one final submit per Advanced model (a same-submissionId
  // retry returns before the limiter, so it costs nothing). A stand with up
  // to 5 Advanced models fits capacity 5; 5/min refill.
  fairSurveySubmit: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 5 },
  // fairBrandFavorite — one favorite per completed brand passport, changeable:
  // pick + a couple of changes per brand ≈ 3; capacity 5, 10/min refill.
  fairBrandFavorite: { kind: "token bucket", rate: 10, period: MINUTE, capacity: 5 },
  // Sajam 2026 B4 (HANDOFF §9): fairLeadSubmit — keyed per visitor AND model
  // (`${fairVisitors._id}:${eventModelId}`), stricter than the interaction
  // buckets because every accepted lead stores contact data and queues an
  // email. The arithmetic: on one model a person sends `Zainteresovan sam`
  // once and (Advanced) a test-drive request once, plus one corrected
  // resubmit (typo in the address) = 3 → capacity 3. Refill 2/min (one per
  // 30 s): retyping a form takes a human longer; a script on one model is
  // held at 2 emails/min. A same-submissionId retry returns before the
  // limiter and costs nothing. Each model has its own key, so a visitor
  // leaving leads at ten stands never meets the cap.
  fairLeadSubmit: { kind: "token bucket", rate: 2, period: MINUTE, capacity: 3 },
  // Sajam 2026 B5 (HANDOFF §7, §9): fairSponsoredAction — per visitor
  // (fairVisitors._id), explicit garage strip taps only (`Pogledaj`,
  // `Dodaj u garažu`; passive views never reach the limiter). The strip
  // shows one card per 8 s slot, so a person taps at most both actions per
  // card: 2 per 8 s = 15/min → refill 20/min leaves headroom; capacity 10
  // covers a quick burst on a few cards. A same-requestId retry returns
  // before the limiter and costs nothing.
  fairSponsoredAction: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 10 },
  // 5 Oct traffic/share delta: explicit share/direct actions only. Keyed by
  // fairVisitors._id for NAT safety and erased association after visitor purge.
  fairTraffic: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 20 },
});
