# TASK-02 — Unblock service types + record the ownership model

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** high · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `convex/_generated/ai/guidelines.md`
3. `docs/architecture/RFC-001-venue-memories.md` — §1.c, §1.e, §1.f, §2.1, §2.3, §2.11, §5

## Goal

Unblock the platform for new service types, and record the ownership model in the RFC.

Today the code physically cannot activate a Venue or Memories profile (`requireEditorAccess`
and `setServiceActive` throw on any type that is not `scanme_links`), and a business owning
neither Links nor Google Review cannot log into its own panel (`requireBusinessAccessBySlug`
requires a `google_review` row in `dynamicLinks`).

This task removes those blocks and amends the RFC. **No new product surfaces. No UI. No new
tables in `schema.ts` beyond what Step 2 lists.**

---

## STEP 0 — Amend the RFC first

Apply these decisions to `docs/architecture/RFC-001-venue-memories.md`, editing the affected
sections in place and removing resolved items from §5. These are product decisions — do not
re-litigate them, but **do** flag any place in the RFC they contradict.

### 0.1 Tenancy and the celebration entity

*New §2.1 subsection. Supersedes the "lightweight business" idea.*

Memories is sold through two channels: a recurring subscription to a venue (café, club, hall),
and a one-off purchase by the people celebrating — who may arrive directly from advertising, or
be referred by a partner hall. **A celebration is not a business and must not be modelled as one
at the product level.**

Decision: `businesses` remains the **tenant** row — it is what auth, memberships, contacts,
invitations, cards, mediaAssets, entitlements and memoriesSpaces key on, and a celebration needs
every one of those. Add to `businesses`:

```ts
kind: v.optional(v.union(v.literal("business"), v.literal("celebration")))
```

Absent means `"business"` so existing rows validate unchanged. Specify (do not run) a backfill
migration following the `convex/migrations.ts` pattern.

Document explicitly in the RFC that `businesses` is a tenant table whose name is legacy, that
celebrations are never surfaced as "businesses" in any UI, and that renaming it is deliberate
deferred debt — with the reason stated.

The product entity is a new first-class table. **Specify it in §2.4; do not add it to
`schema.ts` in this task:**

```
celebrations:
  businessId              -> the tenant row, kind === "celebration"
  kind                    svadba | rodjendan | krstenje | veridba | ispracaj |
                          maturska | godisnjica | other
  title                   e.g. "Jovana i Marko"
  celebrantNames?
  eventDate
  venueName?              free text — where it happens, partner or not
  venueBusinessId?        set only when that venue is on our platform
  acquisitionChannel      direct | partner | ads | other
  referredByBusinessId?   WHO SOLD IT
  referralCommissionPercent?   snapshotted at sale time
  contactName, contactPhone?, contactEmail?
  status                  lead | booked | active | completed | archived
  createdAt, updatedAt
```

`venueBusinessId` and `referredByBusinessId` are deliberately distinct: a celebration can be
**held at** a venue that is not a partner, and **sold by** a partner that is not the venue.
Never conflate them.

Also specify a `partnerships` table: `partnerBusinessId`, `status` (active | paused | ended),
`commissionPercent`, `productScope` (array of serviceType), `startedAt`, `endedAt?`, `notes?`.
The percent is snapshotted onto each celebration at sale time so renegotiating terms never
rewrites the commission history of past celebrations — state this rationale in the RFC.

Propose indexes for both tables with the query each serves, including: the partner's own
dashboard ("celebrations we referred, and what is owed"), the operations calendar of upcoming
celebrations, and a venue's view of celebrations happening at its location.

Finally, specify the minimal provisioning path for a celebration tenant — a `businesses` row
with kind `"celebration"` + a `celebrations` row + a `scanme_memories` serviceProfile + one
`memoriesSpaces` row in `one_off` mode. It must **not** go through `admin.createBusiness`, which
provisions a Links profile, a `google_review` dynamicLink and slug machinery, none of it
applicable. Specify it; do not implement it here.

### 0.2 Entitlement scope

*Fixes §2.3, resolves §5 Q3.*

`entitlements` gains `spaceId: v.optional(v.id("memoriesSpaces"))`. Resolution order in
`getEntitlement`: an active space-scoped entitlement wins; otherwise the business-scoped one;
otherwise null. Add index `by_spaceId_and_status` alongside `by_businessId_and_product`.

Note in the RFC that with celebration tenants this mostly resolves naturally (one tenant, one
space), but space scoping still covers a venue that holds a subscription **and** buys a premium
tier for one specific event. Update the §2.9 enforcement matrix accordingly.

### 0.3 Venue profile slug

*Fixes the ambiguity in §2.1.4.*

"Can share the business slug" is unsafe: `serviceProfiles.by_slug` combined with
`serviceBySlug`'s `.unique()` will throw once two profiles carry the same slug. Decide
explicitly, and document the consequence for `isBaseSlugAvailable` and `applyBaseSlugSync`.

### 0.4 Host-controlled public surfaces

*Fixes §2.4 C.4.*

`memoriesSpaces` gains `publicGalleryEnabled` and `wallEnabled`, both boolean, both default
false. `/m/[code]/galerija` returns 404 unless enabled.

Add a note that the live wall (`/zid/[code]`) is a planned surface reading
`status === "ready" && visibility === "everyone"` for the current session, gated on
`wallEnabled`. Do not design the wall further here.

### 0.5 Lift, do not copy

*Revises §2.5 and risk #4.*

`backgroundPresentation` and `shadowCss` are pure functions; moving them into
`lib/design-engine/` and importing them back into the Links template is a provable no-op that
the golden harness verifies. Replace "copy-and-pin" with a genuine lift, sequenced strictly
**after** the golden harness is green, as its own commit. Downgrade risk #4 and state the new
residual risk honestly.

### 0.6 Storage

*Resolves §5 Q10.*

Convex file storage **is** the storage, full stop. Remove the R2/Cloudflare migration plan, the
migration tooling, and the "swap the adapter later" sequencing from §2.8, §2.4 C.8, §4 and §5 —
there are no clients, no data, and therefore no migration to plan for. A future CDN move is
explicitly out of scope for this RFC and must not shape any design decision in it.

Keep `mediaAssets.provider` and a thin `convex/lib/storage.ts` wrapper (`put` / `getUrl` /
`delete`) purely so storage calls are not scattered across the pipeline, gallery queries,
export, purge cron and archive paths. Justify it on **code hygiene only**. Do not add any
provider abstraction, config switch, or second implementation beyond it.

### 0.7 Resolved defaults

Remove these from §5:

- One live event per business — confirmed.
- Night cutoff 06:00 Belgrade — confirmed.
- Retention 30 / 90 / 365 days — confirmed.
- Per-tier max dimension becomes **2048 / 2560 / 4096**, not 1600/2048/2560. 1600px is too low
  for a wedding photo a couple keeps.
- Watermark: the ScanMe logo at 8% of image width, bottom-right, 70% opacity, with a subtle
  shadow for legibility on light backgrounds. The bottom-left business watermark is **skipped
  entirely** when there is no logo — never substitute text.

---

## STEP 1 — Pre-flight collision scan (must actually RUN)

Write an internal Convex query that scans `businesses.by_slug`, `serviceProfiles.by_slug`,
`serviceSlugAliases.by_slug` and `dynamicLinkAliases.by_slug` for slugs shadowed by a root
static segment.

Check the two we are about to reserve (`"m"`, `"r"`) **and** the ones already silently shadowed
today (§1.f: `"client-panel"`, `"dev"`, `"ponuda"`, `"preview-login"`).

**Run it** against the current deployment (`npx convex run`) and report the actual output
verbatim in your final message. Do not perform Step 2(f) until you have reported it. If it
returns collisions, **STOP and report** — rename nothing on your own.

---

## STEP 2 — The unblocking changes

**(a)** Export a shared `serviceTypeValidator` from `convex/schema.ts`, widened with
`"scanme_venue"` and `"scanme_memories"`. Replace the duplicated `requestedServiceValidator` in
`convex/activationRequests.ts` with it. Additive only — no index key changes.

**(b)** Add `kind` to `businesses` as specified in 0.1 — **the field only**. No `celebrations`
table and no `partnerships` table in this task; they are specified in the RFC and created when
Memories is built.

**(c)** Split `requireBusinessAccessBySlug` (`convex/lib/access.ts:55-91`) into:

- `requireBusinessAccess(ctx, slugOrId)` — auth → business → status check →
  admin-or-active-membership. **No `dynamicLinks` lookup.**
- `requireGoogleReviewPanelBySlug(ctx, slug)` — the above plus the existing `selectPrimaryLink`
  lookup, returning **today's exact shape** so every `convex/clientPanel.ts` caller is untouched.

**(d)** Move `requireEditorAccess` (`convex/scanMeLinks.ts:386-408`) into `convex/lib/access.ts`
as `requireServiceEditorAccess(ctx, profile, allowedTypes)`. Links call sites pass
`["scanme_links"]` and must behave identically.

**(e)** Un-gate `setServiceActive` and `setClientEditingEnabled` (`convex/scanMeLinks.ts`
~1739-1780): accept any type in `serviceTypeValidator` instead of throwing on non-Links. Keep
every other guard (admin, archived business) exactly as-is.

**(f)** Add `"m"` and `"r"` to `RESERVED_SLUGS` (`convex/lib/validation.ts:3`) — **only after
Step 1 reports clean.** Also fix the pre-existing shadowed segments found in Step 1; if that
requires renaming a live slug, STOP and report instead.

**(g)** Bump `convex` from `^1.42.1` to `^1.44.x` (the generated guidelines target it). Run
`npm run check` and report anything the bump breaks.

### Do not touch

`convex/lib/scanMeDesignValidators.ts`, `components/scanme-links/**`, `lib/scanme-links*.ts`,
the `scanMeLinks` render path, `app/layout.tsx`, `globals.css`, or any editor component.
If you believe one must change, **STOP and explain why** instead of changing it.

---

## Definition of done — demonstrate each, do not assert it

1. `npm run check` green; `npm run test` passes with the existing suites **unchanged**
   (`convex/admin.test.ts`, `invitations.test.ts`, `redirects.test.ts`, `scanMeLinks.test.ts`,
   `lib/metrics.test.ts`).
2. New convex-test: a business with **no** `dynamicLinks` row passes `requireBusinessAccess` and
   fails `requireGoogleReviewPanelBySlug`.
3. New convex-test: `setServiceActive` succeeds on a `"scanme_venue"` profile.
4. New convex-test: a `businesses` row with no `kind` still validates, and one with kind
   `"celebration"` validates.
5. New convex-test: creating a business slugged `"m"` throws the reserved-slug error; slugged
   `"venue"` still succeeds.
6. The Step 1 scan output is pasted verbatim in the final report.
7. `git diff --stat` shows **zero** changes under `components/`, `lib/scanme-*`, and
   `convex/lib/scanMeDesignValidators.ts`.
8. The Step 0 amendments are in the RFC, and any contradiction found is listed explicitly.

Report in plain language: what changed, which commands passed, the scan output, and every
assumption made.
