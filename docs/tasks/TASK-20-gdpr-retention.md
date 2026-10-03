# TASK-20 — Pagination fix, then GDPR: consent, retention, deletion

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `convex/_generated/ai/guidelines.md` — **pagination and the bulk/scheduler patterns**
3. `docs/architecture/RFC-001-venue-memories.md` — §2.9 (retention row), §2.10 (the whole section)
4. `convex/memories.ts`, `convex/memoriesPipeline.ts`, `convex/crons.ts`
5. `lib/i18n/sr/consent.ts`

---

## STEP 0 — Fix the gallery cap (do this first; it is a correctness bug)

`convex/memories.ts` (~line 829) sets `GALLERY_READ_CAP = 150` and the public gallery does:

```ts
.withIndex("by_sessionId_and_status", q => q.eq("sessionId", …).eq("status", "ready"))
.order("desc")
.take(GALLERY_READ_CAP);
for (const photo of rows) {
  if (photo.visibility !== "everyone") continue;   // filtered AFTER the cap
```

Two defects:

1. **A session with more than 150 ready photos silently truncates.** The demo has 442; 292 are
   invisible with no "load more" and no indication anything is missing. `.take(n)` is bounded, but
   bounded is not paginated — the requirement was pagination.
2. **Worse: the visibility filter runs after the cap.** If the newest 150 rows happen to be mostly
   `host_only`, the public gallery renders nearly empty while hundreds of `everyone` photos sit
   further back. That is a wrong result, not a slow page.

Fix both:

- Use real cursor pagination (the documented Convex pattern) for the public gallery **and** for
  the host gallery grid, with a "load more" or infinite scroll in the UI.
- Make visibility part of the **indexed** read rather than a post-filter — add the index the query
  actually needs rather than filtering in code after a cap. State which index you added and which
  query it serves.
- Audit every other `.take(...)` in `convex/memories.ts`, `clientPanel.ts` and `memoriesHost.ts`
  for the same shape — a cap standing in for pagination, or a filter applied after a cap. Report
  each one you found and whether it is genuinely bounded by nature or needed fixing.
- Add a test: a session with **more photos than one page** returns every `everyone` photo across
  pages, and never returns a `host_only` one.

---

## STEP 1 — Consent, recorded properly

Per RFC §2.10, the affirmative act of uploading is the lawful basis. The notice already renders
(TASK-17); this task makes the record real:

- `consentVersion` and `consentAt` stamped on `memoriesGuests` at first upload.
- When the version changes, the notice shows again before the next upload.
- The version lives with the text in `lib/i18n/sr/consent.ts` — the two must not drift.
- Test: a guest whose stored version is older than the current one is re-prompted; one who is
  current is not.

## STEP 2 — Retention that actually deletes

The tiers are settled: **30 / 90 / 365 days** by plan.

- A daily `retentionSweep` per space: `cutoff = now − retentionDays`, range-delete via
  `by_spaceId_and_createdAt` in batches with `ctx.scheduler.runAfter(0, …)` continuations — the
  guidelines' bulk pattern, never one giant transaction.
- Marks rows `deleted` with reason `retention`, feeding the existing tombstone path.
- A `purgeSweep` walks `by_status_and_updatedAt` tombstones, deletes **every variant and the
  original** through the storage wrapper, then deletes the document.
- **A photo whose bytes still exist after purge is a failed task.** Test that storage is actually
  empty afterwards, not just that the row is gone.

## STEP 3 — Deletion on request

Every path funnels into the same tombstone → purge machinery, so nothing is special-cased:

- **Per photo** — the guest deletes their own (guest-key gated); host and admin delete any.
- **Guest wipe** — "obriši sve moje slike" on `/m/{code}/moje`: tombstone all their photos,
  delete matching `eventArchiveItems` (**the guest's wipe beats the host's archive pin** — a photo
  the host pinned to a Venue archive must still disappear), delete their `quotaAdjustments`, and
  delete the guest row. Schedule an immediate purge rather than waiting for the daily sweep.
- **Space or event wipe** — host or admin, batched.
- **Business offboarding** — admin cascade: spaces → sessions → photos → mediaAssets → cards and
  targets → configs and archive items, with scheduler continuations.

Test the guest wipe specifically: afterwards there are zero `memoriesPhotos`, zero
`eventArchiveItems` and **zero storage references** for that guest.

## STEP 4 — Say it in the product

- The host panel shows the retention window in plain words and when the oldest photo will go.
- The guest sees, on `/m/{code}/moje`, how long their photos are kept and the wipe control.
- Neither is buried in a settings screen.

## STEP 5 — The policy page

A real privacy page the consent notice links to. Content, per RFC §2.10: lawful basis per data
category, that guest photos are consent-based, that the cookie is strictly necessary, retention
per tier, how to delete, and that the host is the controller while ScanMe is the processor.

Write it as product copy in the i18n layer, in plain Serbian. **State clearly in your report that
this is not legal advice and needs a lawyer's review before launch** — you are drafting content,
not certifying compliance.

---

## Standing constraints

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links` must print **nothing**.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Every string through the i18n layer. No hardcoded Serbian.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links harness/goldens` prints nothing.
2. `npm run check` green; `npm run test` green with existing suites unchanged.
3. **Step 0**: cursor pagination on both galleries; visibility resolved by index, not post-filter;
   the multi-page test passes; the audit of every other `.take(...)` is reported case by case.
4. Consent versioning: the re-prompt test passes.
5. Retention: a test proves rows past the cutoff are tombstoned and then **their bytes are gone
   from storage**.
6. Guest wipe: zero photos, zero archive items, zero storage references — including a photo the
   host had pinned to a Venue archive.
7. The retention window is visible to both host and guest — show where.
8. The privacy page exists, and your report states plainly that it needs legal review.

Report in plain language: what the `.take` audit found, the index you added for visibility, how
the purge proves bytes are gone, how the guest wipe beats the archive pin, and every assumption
you made.
