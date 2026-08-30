# Memories → Venue archive — pin & render cost (TASK-23)

Two operations decide whether the host-curated archive is cheap enough to be
boring: **pinning a full set in one call** (the host taps "Prikaži na stranici"
with everything selected) and **rendering the Venue page** once that set is
public. Both are bounded by the cap — `ARCHIVE_MAX_ITEMS = 60` per event — so
neither grows with the night's total photo count. This records what was measured
and the exact document I/O behind each number.

## Method

Measured through `convex-test` (the in-memory function simulator the suite
already runs on), against a real schema and the real
`memoriesArchive.pinPhotosToEvent` / `venue.archivedEvents` code — no mocks of
the mutation or query logic. One space, one event, **60 committed
(`ready`, `everyone`) photos**, each with three stored variant blobs. Timings
are `performance.now()` deltas around the single mutation call and the single
query call; five runs on the dev machine (Windows, Node 24).

Two honesty notes about the numbers:

- `convex-test` runs the function body against an in-memory store on the local
  CPU. The **wall times are indicative of the shape of the work** (bounded,
  linear in 60, no N+1 surprise) — not production Convex latency, which adds
  network and storage round-trips. What is exact and production-true is the
  **document read/write count**, which is a property of the code, not the
  harness; those were derived from the implementation and asserted in the
  measurement run.
- `venue.archivedEvents` is the Venue page's server data source (the page's
  `pastEvents` block is fed from its result). The React server render of the
  block itself is trivial — it renders **one card per event using `items[0]`** —
  so the query is where the cost is, and it is what was timed.

## Results (5 runs, 60 items each)

| Operation | Wall time (min–max) | Docs read | Docs written | `storage.getUrl` |
|---|---|---:|---:|---:|
| `pinPhotosToEvent` — 60 in one call | **146–161 ms** (median ~154) | ~121 | 60 | 0 |
| `archivedEvents` — resolve 60 items | **45–72 ms** (median ~51) | ~121 | 0 | 120 |

### Where the document I/O comes from

**Pinning 60** — `pinPhotosToEvent`:

- 1 index scan of the event's existing archive rows (`by_eventId_and_order`,
  `.take(61)`) — 0 docs on a fresh event.
- Per photo (×60): `get(photoId)` + `get(photo.spaceId)` = **120 reads** — the
  ownership/tenancy/visibility gate reads the photo and its space.
- **60 inserts** into `eventArchiveItems`, each with `sourcePhotoId` set.

No read scales with the night's photo count; the loop is exactly `photoIds.length`
gets plus one bounded index scan. The cap makes the write count hard-bounded at
60 — the 61st pin is a `ConvexError`, never a silent truncation.

**Rendering** — `archivedEvents`:

- 1 index scan of the business's events (`by_businessId_and_startsAt`,
  `.take(200)`) — 1 event here; **reads one doc per event** the business has.
- Per archived event: 1 item scan (`by_eventId_and_order`, `.take(240)`) → 60
  docs, then `get(mediaAssetId)` per item = 60 more reads.
- **120 `storage.getUrl`** — webp + thumb per item.

## The honest finding: `archivedEvents` over-resolves

The `pastEvents` block shows only the **cover** of each event (`items[0]`), but
`archivedEvents` resolves a signed URL for **every** archived item — 120
`getUrl` calls to render 1 visible thumbnail per event. At 60 items that is ~50 ms
of work whose output is mostly unused by `pastEvents`.

This is left as-is deliberately: the same query feeds `/[slug]/venue/arhiva` and
`/[slug]/venue/[event]`, which **do** show every item, and TASK-23's scope is the
host-curated pin path, not a rework of the archive read model (the task's own
constraint: "do not invent a new archive model"). It is recorded here rather than
tuned silently. If the `pastEvents`-on-the-home-page path ever shows up in a
trace, the fix is a cover-only projection (resolve `items[0]` when the caller
only needs covers), not a schema change — the cap already bounds the worst case
to 60 items per event, so nothing here degrades with scale, it is merely
wasteful at the ceiling.
