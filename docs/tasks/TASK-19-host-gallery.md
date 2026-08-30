# TASK-19 — The host's gallery and moderation

**Mode:** goal · **Model:** Fable · **Effort:** xhigh · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md` — including the "Design and UX process" section
2. `convex/_generated/ai/guidelines.md` — **the pagination patterns especially**
3. `docs/architecture/RFC-001-venue-memories.md` — §2.4 C.7/C.11/C.12, §2.9 (visibility and
   moderation rows), §2.10
4. `components/client-panel/memories-panel-section.tsx` — TASK-18's panel, which this extends
5. `components/memories/photo-picture.tsx`, `convex/memories.ts`

## Who this screen is for

The couple, the morning after. In bed, on a phone, hungover, opening it before they open anything
else. Three hundred photos from two hundred people. Or a café owner on Saturday morning going
through last night.

**This is where the customer decides whether they got their money's worth.** It has to feel like
opening a gift, not like administering a database.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links` must print **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Every string through the i18n layer. No hardcoded Serbian.
- Access goes through the existing business-access gate, which already covers both business and
  celebration tenants. Add no new auth path.
- **ZIP export is TASK-21.** Leave the entry point; do not build it.

---

## STEP 1 — Performance is a feature here

Three hundred photos on a phone is where naive implementations die.

- **Paginate** with Convex's documented pagination over `by_sessionId_and_status` — never load a
  whole session at once, never `.collect()` an unbounded set.
- The grid renders **thumbnails only**. Full-size loads on demand, in the detail view.
- `<picture>` with AVIF first and the WebP fallback, via the existing `photo-picture.tsx`.
- No layout shift as images arrive — reserve the aspect ratio from the stored dimensions.
- Report what the grid actually costs: bytes and time for a session of ~300 photos.

## STEP 2 — Browsing

- Photos in the current session, newest first.
- For `recurring` spaces, navigate between nights — `by_spaceId_and_dateKey` sorts
  lexicographically, so `.order("desc")` gives the night list for free.
- **Filter by card**, and show the per-table counts: *"Sto 4 — 22 slike"*. This is the feature the
  hosts will talk about, because it turns a pile of photos into a story about the room. The card
  identifies the table, never the person.
- Filter by visibility: everyone / only-host.
- A detail view: the photo, which table, when, its visibility, and its moderation state.

Guests stay anonymous. Show a stable, non-identifying handle at most — never a raw `guestKey`, and
never anything that would let one guest be traced across events.

## STEP 3 — Moderation, one tap

- **Hide** — reversible, removes the photo from the public gallery and the wall immediately, keeps
  it for the host. This is the default action for "not appropriate for the screen".
- **Delete** — the tombstone path that TASK-15's purge machinery already consumes. Confirm first,
  and say plainly that it is permanent.
- **Block a guest** — stops further uploads from that guest for this space, without touching what
  they already contributed. Reversible.
- **Reports** (`photoReports`, C.12): a "needs attention" area at the top when anything is
  pending. Resolving marks the report, and the host chooses hide, delete or dismiss.
- Bulk select for a batch — going through fifty photos one at a time on a phone is the difference
  between a host who moderates and one who gives up.

Every moderation mutation is host-or-admin gated. Every gallery query excludes `hidden` from the
public paths and keeps showing it to the host, marked.

## STEP 4 — The gift, not the database

Design decisions, not decoration:

- The first thing on screen is **the photos**, not controls or statistics. Counts and filters come
  second.
- One line that makes the night legible: how many photos, how many guests, how many tables took
  part.
- Moderation lives out of the way until needed — a host scrolling their wedding photos should not
  be looking at delete buttons on every tile.
- Empty state: a space with no photos yet tells the host what to expect, not "0 results".

Follow `AGENTS.md`'s design order and name which skills you used.

## STEP 5 — Verify

- On a phone, with a session seeded to **at least 300 photos** — generate them if the seed does
  not go that far. Scroll the whole way. Report what it felt like and what it cost.
- Hide a photo and confirm it vanishes from `/m/{code}/galerija` immediately.
- Delete a photo and confirm the tombstone path runs.
- Block a guest and confirm their next `reserveUpload` is refused while their existing photos stay.
- File a report from the guest side and resolve it from the host side.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links harness/goldens` prints nothing.
2. `npm run check` green; `npm run test` green with existing suites unchanged.
3. **No unbounded query** — every gallery read is paginated or bounded. Show the queries.
4. Measured cost of a ~300-photo session on a phone: bytes, time to first paint, scroll feel.
5. convex-tests: hide removes from public but not from host; delete tombstones; block refuses the
   next reservation but preserves existing photos; a non-host cannot moderate; reports resolve.
6. The Step 5 walk-through, with what you observed at each step.
7. Guests are never identifiable — how you verified.
8. Which design skills you used, and the visual direction.

Report in plain language: how pagination is done, the per-table story, how moderation stays out of
the way until needed, the measured cost, the outputs above, and every assumption you made.
