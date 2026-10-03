# TASK-25 — the last one: QA, pristupačnost, i lista za deploy

Twenty-four tasks built the thing. This one asks whether it can be handed to a
real café owner and a real room of guests without someone standing behind it.
It is the last task before the product is either shipped or deliberately held —
so it ends in a **verdict**, not a to-do list.

Three parts, in this order: close the known open ends (they are enumerated
below, no discovery needed); audit what a person actually touches; write the
deploy runbook. Nothing here invents new product surface.

---

## Step 0 — the carried-over list, each one closed with a decision

Every item below was found and deliberately deferred in an earlier task. For
each one: **fix it, or write down why not.** "Not fixed, here is the reason and
here is what would trigger fixing it" is a complete answer. Silence is not.

**Real bugs, expected to be fixed:**

1. **The client's reserve/renew has no timeout and no abort path**
   (`lib/memories-client/backend.ts`, found in TASK-24 Run 2). `ConvexHttpClient`
   queues mutations per instance and its `kick()` has no abort; a phone holding
   a silently-dead socket on a dying hall network sits in `reserving` until the
   OS kills the socket. This is the single most guest-visible defect left in the
   product: the guest sees a spinner that never resolves and concludes the thing
   is broken. Give it a deadline and a classified failure the existing retry
   path can act on. TASK-24's harness already proved the shape of the fix.

2. **The scan-burst ceiling behind one NAT.** `guestCreate` is a per-IP token
   bucket, 60/min with capacity 30. A wedding where 60 people scan their cards
   inside the first minute — which is exactly what happens when the cards land
   on the tables — exhausts the burst and refuses roughly the second half. Those
   guests get no key and must re-scan, at the one moment the product is making
   its first impression. Decide it deliberately: raise the capacity, key it
   more precisely, or accept it and say what the number should be. Whatever is
   chosen goes in the comment beside it, because the comment currently claims
   the buckets "are deliberately generous" and the arithmetic says otherwise.

3. **`venue.archiveEvent` has no cap** while `memoriesArchive` enforces 60. An
   event archived through the old path with more items breaks `currentItems`
   (`.take(61)`) and makes `reorderArchiveItems` permanently reject every list.

4. **`archiveTargets` `.take(100)`** on a business's events — a silent ceiling
   of the same class as the `GALLERY_READ_CAP` bug.

5. **The ~300–400 px vertical gap under the profile-cards block** on the Venue
   page. It was supposed to be fixed in TASK-12 Step 0 and was never verified.
   Confirm on a real render whether it is gone; if not, fix it.

**Measure, then decide:**

6. **Premium ZIP export is unmeasured.** `docs/perf/memories-export.md` covers
   `basic` only (400 photos, 277 s, 640 MiB peak RSS). Premium is 4096 px and up
   to 10 photos per guest; the suspicion on record is 20+ minutes and an OOM
   from `Buffer.concat`. **Run it at premium and write the number into the same
   file.** If it blows the budget, that is a finding worth more than a fix — say
   what the ceiling is and what the host should be told.

7. **The double-lossy export chain.** The exported JPEG was measured *larger*
   (1209 KiB) than the WebP it was re-encoded from (1055 KiB) — bigger and worse
   at once. Decide whether the export should ship the WebP.

**Housekeeping, judgement call:**

8. `memoriesCountShards` rows are never cleaned up. A recurring space accretes
   16 rows per session forever. Harmless at this scale — decide whether it stays
   that way and say so.

**Do not touch:** the pre-existing Links bug where `normalizeEditorDesign`
silently drops per-element text shadows. ScanMe Links is frozen. Record it in
the report; leave the code alone.

---

## Step 1 — pristupačnost, on the three surfaces a person actually touches

Not a checklist sweep of every route. Three surfaces, audited as the person
using them:

- **The guest's phone**, `/m/[code]` — in a dark room, one-handed, on a bad
  connection, by someone who has never seen this app and will not read
  anything. The **per-photo visibility control is the one that must not be
  ambiguous**: this is the consent decision the whole product's promise rests
  on. It must be reachable by keyboard, announced correctly by a screen reader,
  have a touch target big enough for a thumb, and state its meaning in words a
  guest understands — not an icon that could mean either thing.
- **The host's panel** — the gallery, the archive picker, the wall controls.
  Focus order, keyboard reachability, and every destructive action (delete,
  wipe) clearly labelled and confirmable.
- **The public Venue page** — contrast in **both** light and dark themes across
  every one of the twelve block types, at real design-engine token values, not
  defaults. The white labels on gallery tiles were flagged once as unscrimmed:
  check them against a bright photo.

WCAG 2.1 AA as the bar: contrast, focus visibility, target size, `prefers-
reduced-motion` (the wall animates for six hours — respect it), heading order,
`alt` on everything, and forms with real labels. Serbian ekavica for anything
user-visible, through the typed dictionary.

Findings go in `docs/qa/accessibility.md`, each with the file and the fix
applied — or the reason it was not.

---

## Step 2 — the deploy runbook

`docs/deploy/README.md`, written for the person doing it at 23:00 the night
before a party, who did not build this. Every step verifiable, no step
implied:

- Environment variables, per surface, with what breaks if each is missing.
- `npx convex deploy` and what it does to the schema; which indexes are new
  since the last deploy.
- **Crons**: retention sweep and purge sweep must be registered and confirmed
  running in the dashboard. A retention cron that silently is not scheduled is
  a GDPR failure that shows no symptom.
- **The seed modules are internal-only and destructive.** `memoriesLoadSeed`
  and `memoriesDevSeed` are deploy-key-gated, which is correct, but
  `memoriesLoadSeed:reset` hard-deletes photos. State plainly, in the runbook,
  that neither is ever run against a deployment with real data.
- Provisioning a real customer end to end: create the business, grant the
  entitlement (Venue and/or Memories, which plan), mint the cards, hand over
  the editor. If any step of that still has no UI, say so — the owner needs to
  know which parts he does from a console.
- Payments are a stub; state what is not wired so nobody assumes it is.
- Rollback: what to do when a deploy is wrong and a party starts in an hour.
- A pre-flight smoke list: scan a card, upload a photo, see it on the wall,
  pin it to an event, load the venue page, run an export.

---

## Step 3 — the verdict

`docs/qa/RELEASE-READINESS.md`, and be a hostile reader of your own work:

- What is **done and proven**, with the measurement that proves it.
- What is **done but unproven** — built, plausible, never run in anger.
- What is **knowingly missing**: payments, ScanMe Menu, the digital invitation,
  the Links↔Venue navigation affordance (blocked on the freeze).
- The honest answer to: *if a café ran a real party on this next Saturday, what
  is most likely to go wrong?* Ranked. That paragraph is the point of the file.

---

## Constraints

- **ScanMe Links is frozen.** `npm run check` clean, `harness:check` and
  `harness:namespace` included — a golden diff means the frozen render path
  moved.
- Everything stays on Convex. No R2, no CDN, no migrations.
- Serbian ekavica for user-visible strings, through the typed dictionary.
- Every number goes in a file under `docs/perf/` or `docs/qa/`. A measurement
  that lives only in a chat transcript does not exist.
