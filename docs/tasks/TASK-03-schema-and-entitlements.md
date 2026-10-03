# TASK-03 — Full table catalog, plan limits, entitlements

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `convex/_generated/ai/guidelines.md`
3. `docs/architecture/RFC-001-venue-memories.md` — §2.2, §2.3, §2.4 (all of C.1–C.16), §2.9, §2.11
4. `docs/tasks/TASK-02-unblock-and-ownership.md` — what already landed

## Goal

Land the entire data model for Venue and Memories in ONE schema pass, plus the plan catalog,
the entitlement read path, and the activation mutation that keeps profile status and entitlement
from drifting.

**Why one pass:** every table is already fully specified in RFC §2.4. Splitting the schema across
three tasks means three deploys and three chances for index names to drift out of sync with the
RFC. Convex schema additions are additive and empty tables cost nothing. This is specified,
scheduled work — not speculation.

**No product surfaces. No UI. No routes. No image pipeline. No guest identity.** Those are later
tasks. This task creates the shape and the entitlement plumbing, nothing else.

---

## STEP 0 — Fix three carry-overs from TASK-02

1. Delete the now-stale open question in RFC §5 about whether to fix the pre-existing shadowed
   slugs (`client-panel`, `dev`, `ponuda`, `preview-login`) — they were fixed in TASK-02 and are
   in `RESERVED_SLUGS`. Renumber the remaining questions.
2. `requireServiceEditorAccess` (`convex/lib/access.ts`) throws a Links-specific Serbian string:
   *"Uređivanje ScanMe Links stranice nije omogućeno za klijenta."* It is now a shared function
   that Venue will call. Parameterize the product name in the message. Do not build the i18n
   layer here (that is TASK-04) — just stop hardcoding "ScanMe Links" in a generic function, and
   leave a `TODO(i18n)` comment naming TASK-04.
3. Add the missing negative test: `requireServiceEditorAccess` **rejects** a profile whose type
   is not in `allowedTypes`.

---

## STEP 1 — The table catalog

Add every table from RFC §2.4 to `convex/schema.ts`, matching the RFC exactly:

C.1 `events` · C.2 `venueEventConfigs` · C.3 `eventArchiveItems` · C.4 `memoriesSpaces` ·
C.5 `memoriesSessions` · C.6 `memoriesGuests` · C.7 `memoriesPhotos` · C.8 `mediaAssets` ·
C.9 `cards` + `cardTargets` · C.10 `cardScanEvents` + `dailyCardMetrics` · C.11 `quotaAdjustments` ·
C.12 `photoReports` · C.13 `entitlements` · C.14 `venueReservations` · C.15 `celebrations` ·
C.16 `partnerships`

Rules:

- **Every index in the RFC, with the RFC's exact name.** If you believe an index is wrong,
  missing, or unnecessary, STOP and say so — do not silently add, drop, or rename one.
- Follow the conventions already in `convex/schema.ts`: literal-union statuses, `createdAt` /
  `updatedAt` as `v.number()`, index names listing all fields (`by_a_and_b`).
- `entitlements` includes `spaceId: v.optional(v.id("memoriesSpaces"))` and the
  `by_spaceId_and_status` index (RFC §2.3).
- `memoriesSpaces` includes `publicGalleryEnabled` and `wallEnabled` (RFC §2.4 C.4).
- Supporting validators (`venueDesignValidator`, `venueBlockValidator`) do NOT need their full
  block union yet — TASK-06 builds that. Define the smallest validator that satisfies the schema
  and mark it `TODO(TASK-06)`. Do not invent block types here.
- Write the schema so `npx convex deploy` succeeds against the existing deployment. New tables
  start empty, so no `staged:` index handling is needed — confirm this in your report.

## STEP 2 — Plan catalog

Create `convex/lib/plans.ts` per RFC §2.3, with the **confirmed** values:

```
scanme_memories:
  basic:    photosPerGuest 3,  maxImageDimension 2048, retentionDays 30
  standard: photosPerGuest 5,  maxImageDimension 2560, retentionDays 90
  premium:  photosPerGuest 10, maxImageDimension 4096, retentionDays 365
scanme_venue:
  allowedBlockKeys per tier — placeholder shape only; tiers are an open question (RFC §5 Q1)
```

Plain exported consts, fully typed, no database reads. Tuning these must be a deploy, never a
migration — state that in a file comment.

## STEP 3 — Entitlement read path

`getEntitlement(ctx, businessId, product, spaceId?)` per RFC §2.3, resolving in this order:

1. if `spaceId` is given, an **active** space-scoped entitlement for that space wins;
2. otherwise the **active** business-scoped entitlement (`spaceId` unset);
3. otherwise `null`.

Returns `{ planKey, limits: { ...PLAN_LIMITS[product][planKey], ...row.overrides }, status }`.
Only `status === "active"` ever resolves. This is the single read path — no caller may read the
`entitlements` table directly.

## STEP 4 — `admin.approveActivation`

One mutation, one transaction, per RFC §2.3, taking `{ requestId, planKey }` and optionally a
`spaceId` for space-scoped grants. It must:

1. set the `serviceProfiles.status` to `"active"` (what `setServiceActive` does today),
2. upsert the entitlement with `source: "manual"`,
3. close the `serviceActivationRequests` row.

All three in the same transaction, so status and entitlement can never drift — the audited gap
in RFC §1.e where `setStatus` flips nothing. Admin-gated via `requireAdmin`.

## STEP 5 — Entitlement expiry cron

Create `convex/crons.ts` with **one** cron: a daily sweep of `by_status_and_validUntil` flipping
`active` rows whose `validUntil <= now` to `expired`.

Do **not** add the retention, purge, or lifecycle-reconcile crons here. They belong with the
features that write the rows they sweep; adding them now means untestable dead code. Note this
in the file so the next person knows they are deliberately absent.

Do **not** mount `@convex-dev/rate-limiter` in this task — it has no consumer until the card
resolver exists.

---

## Do not touch

`convex/lib/scanMeDesignValidators.ts`, `components/**`, `lib/scanme-links*.ts`, the
`scanMeLinks` render path, `app/layout.tsx`, `globals.css`, or any editor component.
If you believe one must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `npx convex deploy` (or `npx convex dev --once`) succeeds against the current deployment.
2. `npm run check` green; `npm run test` passes with the existing suites **unchanged**.
3. New convex-test: `getEntitlement` returns the space-scoped plan when one exists, falls back to
   the business-scoped plan when it does not, ignores an `expired` row at both scopes, and
   returns `null` when nothing active exists.
4. New convex-test: `approveActivation` in ONE call yields profile `status: "active"`, a readable
   entitlement, and a closed request; and a space-scoped grant resolves only for that space.
5. New convex-test: the expiry cron's internal mutation flips a past-`validUntil` active row to
   `expired` and leaves a future-dated one alone.
6. New convex-test: `requireServiceEditorAccess` rejects a type not in `allowedTypes` (Step 0.3).
7. A table-by-table checklist in your report: for each of C.1–C.16, every index name in
   `schema.ts` matched against the RFC. Report any discrepancy you found rather than hiding it.
8. `git diff --stat` shows **zero** changes under `components/`, `lib/scanme-*`, and
   `convex/lib/scanMeDesignValidators.ts`.

Report in plain language: what changed, which commands passed, the index checklist, and every
assumption you made.
