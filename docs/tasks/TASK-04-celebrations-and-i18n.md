# TASK-04 — Finish the table catalog, type the limits, build the i18n layer

**Mode:** goal · **Model:** Opus 4.8 · **Effort:** medium · **Session:** new

## Required reading, in this order

1. `AGENTS.md` and `CLAUDE.md`
2. `convex/_generated/ai/guidelines.md`
3. `docs/architecture/RFC-001-venue-memories.md` — §2.1.6, §2.3, §2.4 C.13/C.15/C.16, §2.12
4. `docs/tasks/TASK-03-schema-and-entitlements.md` — what already landed

---

## STEP 0 — Carry-overs from TASK-03

### 0.1 The two missing tables

`celebrations` (C.15) and `partnerships` (C.16) were specified in the RFC but never added to
`convex/schema.ts`. The cause is stale wording: both RFC section headers still read
*"SPECIFIED, not created in this task"*, which was true of TASK-02 and leaked forward.

Do two things:

1. **Fix the RFC headers.** Change both to `#### C.15 \`celebrations\`` and
   `#### C.16 \`partnerships\`` — drop the "not created in this task" parenthetical, and remove
   the same claim from the italic note under each heading. That wording is now wrong and will
   mislead the next reader.
2. **Add both tables to `convex/schema.ts`**, exactly as C.15 and C.16 specify — every field,
   every index, the RFC's exact index names. If you believe an index is wrong or missing, STOP
   and say so rather than adding, dropping, or renaming one.

### 0.2 Type the entitlement limits

`getEntitlement` (`convex/lib/entitlements.ts`) currently returns
`limits: Record<string, unknown>`. That erases the types `convex/lib/plans.ts` carefully
defines: an enforcement path reading `limits.photosPerGuest` gets `unknown` and has to cast —
and quota enforcement is exactly where a silent cast becomes a bug.

Make the return type generic over `product` so `limits` is the typed limit shape for that
product (`MemoriesPlanLimits` for `scanme_memories`, the Venue shape for `scanme_venue`), with
`overrides` applied as a typed partial. No `any`, no assertion at the call site.

### 0.3 Guard the business-scoped lookup

Step 2 of `getEntitlement` takes up to 50 rows for `(businessId, product)` and picks the first
active one with no `spaceId`. If two active business-scoped rows for the same product ever
exist, the winner is arbitrary and silently non-deterministic. `upsertManualEntitlement`
prevents that on the manual path, but the billing path (RFC §2.3) will not.

Make the invariant explicit: if more than one active business-scoped entitlement is found for a
`(businessId, product)` pair, throw a clear error naming the rows rather than picking one. A
loud failure in an impossible state beats a quiet wrong plan tier. Cover it with a test.

---

## STEP 1 — The i18n layer

Build it exactly as RFC §2.12 specifies: **no library.** next-intl's value (locale routing,
negotiation, ICU) is entirely unused with `sr` as the sole locale and no locale prefix in URLs.
This is a typed dictionary system with zero runtime dependency.

```
lib/i18n/types.ts       Locale = "sr"; one Dict interface per surface
lib/i18n/format.ts      fmt(template, params) for interpolated strings
lib/i18n/sr/…           one module per surface, `as const satisfies XDict`
lib/i18n/index.ts       getDict("venue") — statically imported per-surface modules
```

Requirements:

- Plain data, no React provider, no context. It must work identically in server components,
  client components, and route handlers.
- Per-surface modules, statically imported, so a route bundles only its own strings.
- The `satisfies` pattern must make a missing key a **type error**, so `npm run check` catches an
  incomplete dictionary. Prove this in your report by describing (not committing) what breaks
  when a key is removed.
- Create the surface dictionaries the coming tasks need, each with only the keys that genuinely
  exist today: `venue`, `venue-editor`, `memories`, `resolver`, `consent`. Empty-but-typed is
  correct; **do not invent copy for screens that do not exist yet.**

### 1.1 Wire the one string that is already waiting

`requireServiceEditorAccess` (`convex/lib/access.ts`) carries a `TODO(i18n)` from TASK-03.
Resolve it: the message must no longer hardcode a product name.

Note the constraint honestly in your report: Convex functions cannot import from `lib/i18n` if
that creates a bundling problem — verify whether they can (the precedent is
`convex/scanMeLinks.ts` importing `lib/scanme-links-design.ts`). If they can, use the dictionary.
If they cannot, keep the message parameterized and say exactly why the dictionary was not used.

### 1.2 Do NOT migrate existing strings

Existing inline Serbian — including `option-two-template.tsx` and the Links editor — stays
exactly where it is. Migrating it edits the frozen render path for zero user value before the
golden harness exists (RFC §2.11, §2.12). This is deliberate; state it in your report.

---

## STEP 2 — Record the convention

Add a short rule to `AGENTS.md`, in the existing "Implementation rules" list, stating that every
**new** user-facing string goes through `lib/i18n` and that existing inline Serbian in the
frozen Links render path is deliberately not migrated. Three or four lines, matching the
surrounding style. This is how the rule survives into future sessions.

---

## Do not touch

`convex/lib/scanMeDesignValidators.ts`, `components/**`, `lib/scanme-links*.ts`, the
`scanMeLinks` render path, `app/layout.tsx`, `globals.css`, or any editor component.
If you believe one must change, **STOP and explain why** instead of changing it.

## Definition of done — demonstrate each, do not assert it

1. `npx convex deploy` (or `npx convex dev --once`) succeeds.
2. `npm run check` green; `npm run test` passes with all existing suites unchanged.
3. `celebrations` and `partnerships` exist in `convex/schema.ts`; report each index name matched
   against RFC C.15/C.16, and confirm both RFC headers no longer say "not created in this task".
4. New convex-test: `getEntitlement` throws a clear error when two active business-scoped
   entitlements exist for the same `(businessId, product)`.
5. Type check proof: `limits.photosPerGuest` is `number` at a call site with no cast. Show the
   call site in your report.
6. New test or type-level proof that a missing dictionary key fails `npm run check`.
7. `git diff --stat` shows **zero** changes under `components/`, `lib/scanme-*`, and
   `convex/lib/scanMeDesignValidators.ts`.

Report in plain language: what changed, which commands passed, the index checklist, whether
Convex could import the dictionary and why, and every assumption you made.
