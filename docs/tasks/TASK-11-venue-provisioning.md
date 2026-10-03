# TASK-11 — Venue provisioning: admin surface + dev seed

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `convex/_generated/ai/guidelines.md`
3. `docs/architecture/RFC-001-venue-memories.md` — §2.1 (all subsections), §2.3, §2.7
4. `convex/admin.ts` — `createBusiness` (~166–313) and the slug machinery, as the pattern
5. `convex/demo.ts` — the env-key-gated seed pattern
6. `convex/venue.ts`, `components/venue/editor/**`

## The gap this closes

The Venue backend (TASK-08), the public pages (TASK-09) and the editor (TASK-10) are all built
and all work — but **nothing creates a `scanme_venue` service profile**, so no business can reach
any of it. `app/admin/venue/page.tsx` is still the original `AdminPlaceholder`, and no mutation
anywhere inserts a Venue profile.

This task makes Venue reachable: an admin can grant it to a business, and a developer can seed a
working example in one command.

## Standing constraints (non-negotiable)

- **ScanMe Links is frozen.** `git diff --stat components/scanme-links` must print **nothing**.
  `components/admin/**` may be modified **only** to replace the `app/admin/venue` placeholder's
  own screen — do not touch any `scanme-links-editor*` file, the Links admin screens, or
  `admin-shell`/`admin-guard` beyond adding a nav entry if one is genuinely required.
- **Zero golden changes.** Never run `harness:capture`, never edit a golden.
- Do **not** widen `admin.createBusiness` (RFC §2.1.4 keeps its hardcoded two-profile block
  untouched). Venue provisioning is a separate mutation.

---

## STEP 1 — The provisioning mutation

Add to `convex/venue.ts` (or a new `convex/venueAdmin.ts` if that reads better — say which and
why) an admin-gated mutation that grants Venue to an existing business, in one transaction:

1. creates the `scanme_venue` `serviceProfiles` row — decide its `slug` per the RFC §2.1.4 rule
   settled in TASK-02, and state that rule in your report;
2. creates its first `events` row in `draft` with an empty `venueEventConfigs` document, so the
   editor has something to open;
3. sets the profile `status` and upserts the entitlement — reuse `admin.approveActivation`'s
   transaction shape from TASK-03 rather than duplicating it, or explain why it cannot be reused.

Idempotent: granting Venue twice to the same business must not create a second profile. It should
return the existing one and say so.

Also add the matching **revoke/deactivate** path — an admin must be able to turn Venue off without
deleting the business's content.

## STEP 2 — The admin screen

Replace `app/admin/venue/page.tsx`'s placeholder with a real screen, following the conventions of
the existing `app/admin/scanme-links/page.tsx`:

- list businesses, showing which have Venue and at which plan tier;
- grant Venue to a business, choosing the plan tier;
- deactivate Venue;
- link straight to `/{slug}/venue/editor` and to the public `/{slug}/venue`;
- show each Venue business's current event and its lifecycle status.

Every string through the i18n layer. No hardcoded Serbian.

## STEP 3 — The dev seed

Add an env-key-gated seed mutation following `convex/demo.ts` exactly — same guard shape, same
minimum key length, the same "clearly marked as demo" discipline. It must create, in one call:

- a demo business with a `scanme_venue` profile and an entitlement;
- a published event with a **representative** block set — enough to exercise the render: a
  countdown, an event date/time, a program timeline, a gallery, profile cards, a price list, a
  map, a reservation block and share;
- the event scheduled so it is currently **live**, so `/{slug}/venue` shows the live state
  immediately.

Document the exact commands in the README's existing "Lokalni primer" section — the env var to
set, the `npx convex run` line, and the two URLs to open (editor and public page). A developer
must be able to go from a clean checkout to a working Venue editor by copying three commands.

Re-running the seed must be safe: update the existing demo rather than creating duplicates.

## STEP 4 — Verify end to end

Actually run it, and report what you saw:

1. Seed the demo.
2. Open `/{slug}/venue` — the live state renders.
3. Open `/{slug}/venue/editor` — the editor loads with the seeded blocks.
4. Add a block, reorder, undo, let autosave settle, publish.
5. Reload the public page — the change is there.

---

## Do not touch

`components/scanme-links/**`, `components/admin/scanme-links-editor*`, `convex/scanMeLinks.ts`,
`convex/lib/scanMeDesignValidators.ts`, `lib/scanme-links*.ts`, `lib/scanme-palette.ts`,
`harness/goldens/**`, `app/[slug]/page.tsx`, `app/[slug]/editor/**`, `globals.css`.

If you believe something else must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `git --no-optional-locks diff --stat components/scanme-links` prints nothing; the only
   `components/admin/**` change is the Venue admin screen (plus a nav entry if required) — paste
   the diff stat.
2. `git --no-optional-locks diff --stat harness/goldens` prints nothing.
3. `npm run check` green; `npm run test` green.
4. convex-tests: granting Venue twice is idempotent; a non-admin is rejected; deactivation leaves
   the event and config rows intact.
5. The Step 4 walk-through, described with what you actually observed at each step.
6. The three README commands, pasted exactly as a developer would run them.
7. The slug rule you used for the Venue profile, stated explicitly.

Report in plain language: where the provisioning mutation lives and why, the slug rule, the seed's
contents, the end-to-end walk-through, and every assumption you made.
