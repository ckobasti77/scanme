# TASK-23 — Memories → Venue archive (the host pulls the night out)

This is the task that joins the two products. Everything up to now has kept them
apart: Memories is a night that expires, Venue is a page that persists. The
owner's actual sentence when he described this product was *"da te memorije budu
vezane za tu žurku koju posle vlasnik može da izvuče"* — the night ends, and
what was good about it gets pulled out onto the venue's public page, where it
sells the next one.

The plumbing already exists and was built for exactly this:

- `eventArchiveItems` (schema C) already carries `sourcePhotoId:
  v.optional(v.id("memoriesPhotos"))`. That field has never been written. This
  task writes it.
- `venue.archiveEvent` already accepts `mediaAssetIds` and writes
  `eventArchiveItems` on ended → archived.
- The Venue `pastEvents` block already renders `ctx.pastEvents[].items[].thumbUrl`
  from those rows.
- `components/client-panel/memories-host-gallery.tsx` (TASK-19) is where the
  host already sees every photo of a session.

So do not invent a new archive model. Fill in the one that is waiting.

---

## Step 0 — THE decision this task exists to make: retention vs. the pin

Read `convex/memories.ts` around `purgePhotoBytes` before writing any code.
TASK-20 wrote a rule in that block header:

> 2. The guest's wipe beats the host's archive pin. […] Retention, host delete,
>    and admin delete beat the pin by the exact same line — uniformly.

Half of that rule is right and half of it makes this product pointless. A
`basic` space has `retentionDays: 30`. If retention beats the pin, then every
photo the host curated onto his venue page vanishes from the page thirty days
later, silently, with no host action and nothing on screen to explain it. A
`pastEvents` block that empties itself is worse than no block.

**The amendment this task makes, and it is the load-bearing change:**

- **An explicit deletion still beats the pin, exactly as today.** A guest
  deleting one photo, a guest wiping their whole contribution, the host deleting
  a photo, an admin deleting a photo, a space wipe — every one of these still
  reaches `purgePhotoBytes` and still deletes the `eventArchiveItems` rows. Do
  not touch that path. Someone who wants their face off the internet gets it off
  the internet, and gets it off the venue's public page too.
- **Retention alone no longer beats the pin.** `retentionSweepSpace` must skip a
  photo that has at least one live `eventArchiveItems` row. The pin is the host
  saying *this one is not part of the night, it is part of the venue* — it is a
  deliberate act on a specific photo, and the retention clock is a storage
  policy, not a promise made to the guest.

Implement the skip as a read on `by_mediaAssetId` for the photo's
`mediaAssetId`, inside the existing loop. Update the header comment in
`convex/memories.ts` so the rule as written is the rule as implemented — a
comment that lies to the next agent is how the `GALLERY_READ_CAP` bug survived.
Update `convex/memoriesRetention.test.ts` where it asserts the old behaviour, and
**add** a test named for what it protects: a pinned photo survives a retention
sweep whose cutoff is far past it, and the same photo, once the guest deletes
it, is gone from `eventArchiveItems` too.

Amend `docs/architecture/RFC-001-venue-memories.md` §2.9 in the same commit.

---

## Step 1 — `memoriesArchive.ts`: pin and unpin

New file `convex/memoriesArchive.ts`. Do not grow `convex/memories.ts` further.

`pinPhotosToEvent({ eventId, photoIds })` — mutation.

Gates, all of them, and each one is a test:

1. `requireBusinessAccess(ctx, event.businessId)` — same gate as
   `hostDeletePhoto`.
2. Every photo's space must belong to the **same business** as the event. A pin
   that crosses tenants is a hard error, not a filter.
3. **`visibility === "everyone"` and `status === "ready"`, or refuse.** This is
   the same class of failure as a `host_only` photo on the projector wall, and
   it is worse here, because the Venue page is public and indexed and permanent.
   A guest who tapped "samo ja i vlasnik" did not consent to the venue's front
   page. Refuse with the non-disclosing `photoNotFound` error, exactly as
   `setPhotoWallApproval` does. Assert it in a test that is named after the
   failure, not after the function.
4. The photo must have a `mediaAssetId` (a committed asset) — a `reserved` or
   `processing` row has no bytes to pin.
5. Idempotent per `(eventId, mediaAssetId)`: pinning what is already pinned is a
   silent success that does not create a second row and does not renumber.
6. Cap the archive at **`ARCHIVE_MAX_ITEMS = 60`** per event, exported from
   `lib/venue-blocks.ts` beside the other caps so the picker's UI and the server
   read one constant. Over the cap → `ConvexError`, never a silent truncation.

Writes `eventArchiveItems` with `sourcePhotoId` set (this is what makes the row
traceable back to the night) and `order` continuing from the current max.

`unpinPhotoFromEvent({ eventId, photoId })` — removes the row; does not touch
the photo. `reorderArchiveItems({ eventId, itemIds })` — full ordered list,
rewrites `order`; reject a list that is not a permutation of the event's current
items rather than partially applying it.

Everything here reads no wall clock beyond `Date.now()` for `createdAt`
(RFC §2.9).

---

## Step 2 — the picker, inside the host gallery

Extend `components/client-panel/memories-host-gallery.tsx`. Do not build a
second gallery: the host is already looking at the photos: give him selection
where he stands.

- A selection mode: tap-to-select, a running count, one "Prikaži na stranici"
  action.
- Photos that cannot be pinned are visibly not selectable, with the reason
  stated: `host_only` reads *"Gost je izabrao da bude privatna"*. The host must
  never tap a photo, wait, and get a red error he does not understand.
- Already-pinned photos show as pinned and toggle off.
- **Which event.** `mode: "one_off"` → `space.eventId`, no choice to make; only
  fall back to a picker if that space has no event. `mode: "recurring"` → a
  select of the business's events, ordered newest first, defaulting to the one
  whose window contains the session. An event in any lifecycle state may receive
  pins — the host curates the archive of an event that ended weeks ago.
- After pinning: a line saying where they went and a link to that Venue page.
  The whole point is that he sees the result.

Serbian, ekavica, through the typed dictionary (`lib/i18n/sr/memories-panel.ts`
or a new `memories-archive.ts` — follow whichever the panel already uses).

---

## Step 3 — the Venue side tells the truth

`pastEvents` renders `event.items[0]?.thumbUrl` as the cover and nothing else
from the archive. With a curated set of up to 60, the cover being whatever
landed at `order: 0` is arbitrary. Let the host set the cover: reordering
already decides it (`order: 0` is the cover), so Step 1's reorder is enough —
just say so in the picker's UI, and make the first tile in the picker's ordered
view visibly "naslovna".

Do not add a new block type. Do not touch anything in ScanMe Links.

---

## Step 4 — verification, and one number written down

- `npm run check` clean (this includes `harness:check` and `harness:namespace` —
  a golden diff means you changed the Links render path, which is frozen).
- Convex tests for every gate in Step 1, plus the two retention tests from
  Step 0.
- Write `docs/perf/memories-archive.md` with a **measured** number, not an
  estimate: pin 60 photos to one event in one call and record the mutation's
  wall time and the number of documents read and written; then load the Venue
  page for that event and record its server render time with all 60 archived
  items present and the `pastEvents` block set to `limit: 24`. If either is
  slow, say so in the file rather than tuning silently. Measurements that live
  only in a chat transcript are measurements that do not exist.
