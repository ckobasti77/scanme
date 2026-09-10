# RFC-003: ScanMe Menu (Meni)

| | |
|---|---|
| **Status** | Draft for review |
| **Date** | 2026-09-03 |
| **Scope** | The design and architecture of **ScanMe Menu (Meni)** — a QR menu for restaurants and kafanas that is a *living* menu, not a photographed PDF. Four things, tightly coupled: **(1)** the group as the unit of layout (five fixed shapes) and the item/variant/pairing model as a first-class schema, not prose; **(2)** the editor as a **copy-and-fork of the already-shipped ScanMe Venue block editor** on its own route, never an edit of the frozen ScanMe Links editor; **(3)** Basic vs Premium expressed through the existing entitlement chain with **zero change to `convex/lib/access.ts`**; **(4)** a live public render whose availability and price changes reach every open phone instantly (Convex reactivity), inside a hard first-paint budget. Ordering and the waiter panel are a **non-goal** here and are deferred to a future **RFC-004** (§2.0 constraint 8). This RFC produces only the document — **no production code and no schema change land in this task**; the schema and modules below are *specified*, and the tasks in §4 are what create them. |
| **Baseline** | Branch `feat/venue-memories` at `efadfb7`; Next.js `16.2.12`, React `19.2.8`, `convex ^1.44.0` ([package.json](../../package.json)). Sits on top of **[RFC-001](./RFC-001-venue-memories.md)** (Venue + Memories) and **[RFC-002](./RFC-002-pricing-and-purchase.md)** (pricing + purchase + accounts), whose block editor, design engine, entitlement chain, card resolver, i18n layer, and admin subpages are **already shipped** on this branch and are treated here as existing code, not as proposals. |

**How to read this document.** It mirrors [RFC-002](./RFC-002-pricing-and-purchase.md), which mirrored [RFC-001](./RFC-001-venue-memories.md). §1 is the audit of what exists today — every claim cites a file (and where useful a symbol or line range) at the baseline above. §2 is the target architecture; the group shapes, the icon rule, dayparts, and the Basic/Premium split were fixed by the owner before this RFC and are treated as constraints (§2.0) — §2 records where codebase evidence shaped *how* they are realized and where evidence forced a decision. §3 is the risk register, §4 the ordered implementation sequence (the tasks this RFC spawns, numbered **TASK-47** upward, one prompt each), §5 the open questions, §6 the ScanMe-Links freeze ledger. **Every decision states what was rejected and why** — RFC-001 earned its keep through its rejected options, RFC-002 owed the reader the same, and so does this one.

**One decision is load-bearing and is made to the end, not described** (§2.6): a menu is *live*. A `nema više` toggled at 20:30 changes every phone already looking at the page, at that second. This is the single feature a photographed-PDF competitor cannot copy, and it dictates how the public page fetches its data (§2.6) and sets up the one real tension with the first-paint budget (§2.12). If it is left vague, the page is built as a static export and the product's only moat is quietly lost.

**Glossary.** *Meni* = the ScanMe Menu product (Serbian throughout, ekavica). *Grupa* = a menu section and **the unit of layout** — one group renders in exactly one of five shapes (§2.1). *Oblik grupe* = one of **Lista / Galerija / Traka / Istaknuto / Tabela varijanti**. *Stavka* = a menu item. *Varijanta* = a size/quantity/extra of an item (0.3 l / 0.5 l, čaša / flaša) — a first-class row, never text in the description (§2.3). *Ide uz* = a manual pairing between two items (§2.3). *Daypart* = doručak / ručak / večera, a time window that swaps which groups show (§2.5). *Živi meni* = the live-menu property (§2.6). *Pločica* = the coloured icon tile a photo-less item shows in the venue's accent colour — **never** an empty frame (§2.4). *Upit* = an item inquiry sent to the owner by email; Menu is not a shop (§2.10).

---

## 1. Audit of the existing platform

### 1.a ScanMe Venue is the fork substrate — not ScanMe Links

The owner's rule is that the Menu editor is a **copy** of the ScanMe Links editor on a separate route, never an edit of it. The codebase has already paid that debt once: **ScanMe Venue is the Links editor forked into a block model** under RFC-001, and it explicitly reserves this product's name. [lib/venue-blocks.ts](../../lib/venue-blocks.ts) carries the comment, verbatim: *`"priceList", deliberately not "menu": ScanMe Menu is a planned separate product (RFC-001 §2.5) and Venue must not squat its name.`* So the highest-leverage move is to fork **Venue**, which already solved every "reuse Links without touching the frozen render" problem, rather than fork Links a second time from scratch.

- **Links has no block model.** Its editor ([components/admin/scanme-links-editor.tsx](../../components/admin/scanme-links-editor.tsx)) is a fixed page (title / description / logo / palette / design) plus an ordered list of `destinations` — link buttons, not layout blocks. Its public render ([components/scanme-links/public-scanme-links.tsx](../../components/scanme-links/public-scanme-links.tsx) → the `option-two` template) is the **frozen product**; it must not be read *as a fork base* and must not be edited at all.
- **Venue is a block model.** [lib/venue-blocks.ts](../../lib/venue-blocks.ts) is a pure, dependency-free module: a block-kind union, per-kind `defaults`, `clamp`, and bounds; [components/venue/blocks/registry.tsx](../../components/venue/blocks/registry.tsx) is the `{ type, label, icon, Render, EditorPanel }` seam that pairs each block with its editor panel and its renderer. The editor shell ([components/venue/editor/venue-editor.tsx](../../components/venue/editor/venue-editor.tsx)) owns document state through a generic history hook ([components/admin/use-editor-history.ts](../../components/admin/use-editor-history.ts)) with debounced autosave. This is exactly the shape Menu needs: a group is a block, a group shape is a block kind, and the render/edit seam already exists.

**Verdict.** *Copy-and-fork:* the Venue editor shell, the pure block model, and the block registry become the Menu editor, `lib/menu-blocks.ts`, and a Menu registry — **new files on a new route** (§2.1, §4 TASK-49/51). *Reusable as-is:* the generic `use-editor-history` hook (parameterized on the document type). *Stays Links-specific and frozen:* everything under [components/scanme-links/**](../../components/scanme-links) and the `scanMeLinks` render path — untouched, and not even used as a fork base.

### 1.b The design engine — token compiler, role palette, accent-from-logo

The engine that colours a page was built to be product-parameterized, and it is the cleanest reuse target in the tree.

- **Token compiler.** [lib/design-engine/tokens.ts](../../lib/design-engine/tokens.ts) exposes `createTokenCompiler(prefix)`, which emits `--{prefix}-*` custom properties from a flat token map. Links uses a hand-written frozen `designStyle()`; Venue calls `createTokenCompiler("venue")`. Menu calls `createTokenCompiler("menu")` — no change to the compiler.
- **Page-design → tokens, with accessibility floors.** [lib/design-engine/venue-tokens.ts](../../lib/design-engine/venue-tokens.ts) compiles a whole page-level design doc into `--venue-*`, deriving readable variants (`accent-text`, `on-accent`, `body-muted`, `input-border`) through contrast-flooring helpers. This is the file Menu clones as `menu-tokens.ts`; the a11y-floor logic transfers verbatim.
- **Role palette.** [lib/design-engine/palette.ts](../../lib/design-engine/palette.ts) — `deriveRoleColors(roleList, palette)` expands a small role subset into the full role set and is **parameterized over any product's roles**; `VENUE_ROLES` shows the shape a `MENU_ROLES` copies.
- **Accent from the logo `[0] + [1]`.** [lib/accent-palette.ts](../../lib/accent-palette.ts) quantizes a logo into a `LogoProfile` and `createAccentTokens(hex)` derives the accent set; the shared colour maths live in [lib/scanme-palette.ts](../../lib/scanme-palette.ts), [lib/scanme-material-color.ts](../../lib/scanme-material-color.ts), [lib/scanme-color-science.ts](../../lib/scanme-color-science.ts). This is the accent that §2.4 paints the icon tiles with. (Note the palette engine uses logo colours `[0]` and `[1]` only — the third is dropped unless the dominant repeats; a known property, not a Menu concern.)

**Verdict.** *Reusable as-is:* the token compiler, `deriveRoleColors`, and the whole accent/colour-science stack (pure, product-agnostic). *Copy-and-fork:* `venue-tokens.ts → menu-tokens.ts` and a `MENU_ROLES` list. *Stays Links-specific:* the frozen `designStyle()` and the Links preset catalog.

### 1.c The entitlements chain — how Basic/Premium plugs in without touching `access.ts`

Two orthogonal gates coexist, and this is the fact §2.7 builds on: *ownership* ("does this location have Menu at all") is `serviceProfiles.status === "active"`; *capability* ("what can this Menu do") is `getEntitlement`. They are separate reads.

- **`getEntitlement` is the single read path** ([convex/lib/entitlements.ts](../../convex/lib/entitlements.ts)) — its header states no caller may read the `entitlements` table directly. Its resolution order, generic over `product`, is **space → business → account plan → null**: a space-scoped active row wins; else a business-scoped active row; else the account's plan maps to a per-product tier via `ACCOUNT_PLAN_TIER[product][account.plan]`; else `null`. It returns `{ planKey, limits, status }`, where `limits` is the product's typed limit interface spread with any overrides.
- **Tiers live in code, not the database** ([convex/lib/plans.ts](../../convex/lib/plans.ts)): `PLAN_LIMITS[product][tier]` and `ACCOUNT_PLAN_TIER[product][plan]` — "tuning a tier is a DEPLOY, never a migration." Venue is the template to copy: `PLAN_LIMITS.scanme_venue = { basic: {...}, premium: {...} }`.
- **The read-time gate is a limit-reader helper.** Venue's premium analytics gate ([convex/venueAnalytics.ts](../../convex/venueAnalytics.ts)) reads `getEntitlement(ctx, businessId, "scanme_venue")`, passes `.limits` to `venueAnalyticsEnabled(...)` ([convex/lib/plans.ts](../../convex/lib/plans.ts)), and returns a `{ status: "locked" }` shape on Basic — each helper defaults a missing/unknown entitlement to the **free Basic tier**. Collection always runs; only the *read* is gated, so "an upgrade shows premium from day one."
- **`access.ts` does not read entitlements.** [convex/lib/access.ts](../../convex/lib/access.ts) is auth/membership/editor-access only; `requireServiceEditorAccess` is already parameterized by an `allowedTypes` list, so a Menu editor guard is a **call** that passes `["scanme_menu"]` — the function itself needs no change.

**Verdict.** *Reusable as-is:* `getEntitlement`'s single-read discipline, `PLAN_LIMITS`-in-code, the two-gate separation, the limit-reader-helper pattern, and `requireServiceEditorAccess`'s `allowedTypes` parameter. *Extend (additively):* a `MenuLimits` interface, `PLAN_LIMITS.scanme_menu`, `ACCOUNT_PLAN_TIER.scanme_menu`, and `menu*Enabled(limits)` helpers (§2.7). *Must not touch:* `convex/lib/access.ts` — a Menu guard is a call, not an edit.

### 1.d The card resolver — Menu is another target kind

A printed card is one code with one destination. [convex/schema.ts](../../convex/schema.ts) already lists the service types (`scanme_links`, `google_review`, `scanme_venue`, `scanme_memories`) and the card-target kinds (`memories_space | venue | event | service_page | url | splitter`). The resolver ([convex/cards.ts](../../convex/cards.ts) `resolveAndRecord`) records the scan behind a server-side `requestId` and returns an outcome the Next handler ([app/r/[cardCode]/route.ts](../../app/r/%5BcardCode%5D/route.ts)) turns into a `302`; the HTTP plumbing (`resolverRedirect`, `resolverIpHash`) is shared in [lib/card-resolver-http.ts](../../lib/card-resolver-http.ts).

The `venue` kind is the exact precedent for Menu: `validateBaseTargetSpec` accepts it with **no stored reference** and the resolver redirects to `/{businessSlug}/venue`. A `menu` kind mirrors this: no stored reference, resolves to `/{businessSlug}/meni`.

**Verdict.** *Reusable as-is:* the whole resolve/record path and the HTTP plumbing. *Extend (additively):* a `menu` value on the card-target-kind union and a `scanme_menu` value on `serviceTypeValidator`; a one-line redirect case. *Rejected here, decided in §2.8:* binding Menu through the generic `service_page` kind.

### 1.e The i18n dictionary layer — a `menu` surface is additive

The dictionary is deliberately not a library: plain typed data + one pure formatter, working identically in server components, client components, route handlers, and Convex functions. `getDict(surface)` indexes the `SR` map ([lib/i18n/index.ts](../../lib/i18n/index.ts)); `fmt(template, params)` interpolates `{name}` placeholders ([lib/i18n/format.ts](../../lib/i18n/format.ts)); each `sr/*` module is `... as const satisfies XDict`, so a missing key is a **type error** caught by `npm run check`. The `Surface` union is `keyof DictBySurface`, so adding a surface to the map extends the union automatically. Existing surfaces include `venue`, `venue-editor`, `venue-admin`, `venue-panel`, `admin-customers`, `admin-location`. A representative pairing is `AdminLocationDict` ([lib/i18n/types.ts](../../lib/i18n/types.ts)) + [lib/i18n/sr/admin-location.ts](../../lib/i18n/sr/admin-location.ts), which already carries the pre-Menu labels `subpageMenuComing: "ScanMe Page"` and `subpageMenuLive: "Meni"`.

**Verdict.** *Reusable as-is:* the whole layer and the four-step "add a surface" recipe (declare `MenuDict` in `types.ts`; create `sr/menu.ts`; register in `index.ts`; read via `getDict("menu")` / `fmt`). *Extend (additively):* new `menu` and `menu-admin` surfaces (§2.11). *Stays Links-specific and unmigrated:* the inline Serbian in the frozen [components/scanme-links/**](../../components/scanme-links) render path (per [AGENTS.md](../../AGENTS.md) — migrating it edits a byte-frozen path for zero user value).

### 1.f Flags, the admin location subpage, and the reserved `menu` slot

The activation seam already exists and is deliberately parked.

- **The flag** ([lib/flags.ts](../../lib/flags.ts)) is a single compile-time constant, `export const MENU_EXISTS = false`, imported directly (no env var, no server/client split). Its own comment states the two steps to ship Menu: flip the flag, and add `scanme_menu` to `serviceTypeValidator`.
- **Two consumers.** [components/admin/admin-shell.tsx](../../components/admin/admin-shell.tsx) and [components/admin/location-admin.tsx](../../components/admin/location-admin.tsx) pick the label `MENU_EXISTS ? subpageMenuLive : subpageMenuComing` — so while `false`, the admin shows "ScanMe Page", not "Meni".
- **The subpage slot is reserved but hard-closed.** [app/admin/customers/[businessId]/[service]/page.tsx](../../app/admin/customers/%5BbusinessId%5D/%5Bservice%5D/page.tsx) 404s any segment not in `SUBPAGE_ORDER = ["links","review","venue","menu"]` — `menu` is already a legal slot. But `location-admin.tsx`'s `subpageActive` returns `false` for `menu` unconditionally (its comment: the subpage 404s until Menu ships **and** `MENU_EXISTS` flips), because no `scanme_menu` service can be active yet. The server-authoritative gate is `admin.location` ([convex/admin.ts](../../convex/admin.ts)), `requireAdmin`-d, returning `isEnterprise` (more than one non-archived location) which is what draws the per-location sidebar.

**Verdict.** *Reusable as-is:* the flag, both label consumers, the reserved `SUBPAGE_ORDER` slot, the `admin.location` gate and its `isEnterprise` sidebar rule. *Extend (additively):* a `menu` case in the subpage body and `requireAdmin`-gated Menu mutations (§2.9). *The flip itself is the terminal task* (§4 TASK-61), never done in an earlier one.

### 1.g Summary table

| Area | Reusable as-is | Extend (additive) | Copy-and-fork | Must not touch |
|---|---|---|---|---|
| Editor | `use-editor-history` hook | — | Venue editor shell + block registry → Menu, new route | Links editor + frozen render |
| Design engine | token compiler, `deriveRoleColors`, accent/colour-science | `MENU_ROLES` | `venue-tokens.ts → menu-tokens.ts` | frozen `designStyle()` |
| Entitlements | `getEntitlement`, `PLAN_LIMITS`-in-code, two-gate split, `allowedTypes` | `MenuLimits`, `PLAN_LIMITS.scanme_menu`, `ACCOUNT_PLAN_TIER.scanme_menu`, gate helpers | — | `convex/lib/access.ts` |
| Cards | resolve/record path, HTTP plumbing | `menu` target kind, `scanme_menu` service type, redirect case | — | direct-resolve minting logic |
| i18n | layer + add-surface recipe | `menu`, `menu-admin` surfaces | — | frozen Links inline Serbian |
| Admin / flag | `MENU_EXISTS`, label consumers, `SUBPAGE_ORDER` slot, `admin.location` + `isEnterprise` | `menu` subpage body + Menu mutations | — | review-welded queries |

---

## 2. Target architecture

### 2.0 Constraints (fixed inputs)

Decided by the owner before this RFC and treated as requirements:

1. **ScanMe Links is frozen.** Extracting a pure function out of it is allowed **only if the output is byte-identical** (proven by the golden harness). The Menu editor is a **copy of the Links editor on a separate route**, never an edit. The public Links render path is not touched. Any decision that would require editing the frozen product is marked **BLOCKED on the owner's decision** and collected in §6.
2. **Everything stays on Convex.** Photos, video, exports, and reactivity all use Convex storage and Convex queries. **No R2, no external CDN.**
3. **All user-facing text is Serbian, ekavica.** New strings go through the typed dictionary (§2.11); no inline literals in new code.
4. **The group is the unit of layout**, and there are exactly **five** group shapes (§2.1). Exactly one shape per group; no mixing within a group.
5. **The item, its product type, and its variants are a first-class model** (§2.3), never text in a description field.
6. **A menu is live** (§2.6): a `nema više` toggled at 20:30 changes every open phone at that second. This is a product property, not an optimization.
7. **Basic has no photos; Premium does** (§2.7). Basic shows coloured icon tiles and has unlimited items and groups; Premium adds photos, in-sheet video, animations, and the Istaknuto group.
8. **Ordering and the waiter panel are out of scope.** Menu here is *read-only for the guest* except for an email inquiry (§2.10). Guest ordering, a running tab, kitchen tickets, and the waiter/staff panel are a separate product and are deferred to **RFC-004**; wherever this RFC's design abuts them, it stops at the boundary and references RFC-004.
9. **`MENU_EXISTS` stays `false` for the life of this RFC's build** except in the single terminal flip task (§4 TASK-61).

No constraint was found unworkable against the codebase. Two forced an implementation-level judgment call, recorded where they occur: the live-menu property versus the first-paint budget is resolved by SSR-then-subscribe (§2.6, §2.12), and the daypart "now" is evaluated in the venue's timezone with a manual override that beats the clock (§2.5).

### 2.1 The group is the unit of layout — five shapes, one per group

A menu is a list of **groups**; a group renders in exactly **one** of five shapes, chosen by the owner per group, and shapes never mix inside a group. Modeled as the Menu block-kind union (`lib/menu-blocks.ts`, forked from [lib/venue-blocks.ts](../../lib/venue-blocks.ts)); the group shape is the block kind, and the block registry pairs each shape with its renderer and its editor panel.

| Shape | Serbian | Render | Typical use |
|---|---|---|---|
| List | **Lista** | one item per row, thumbnail-left | the default; drinks, standard dishes |
| Gallery | **Galerija** | two items per row, photo-forward | dishes worth showing (Premium leans on this) |
| Strip | **Traka** | horizontal scroll, quasi-carousel | daily specials, a themed shelf |
| Featured | **Istaknuto** | full-width, one item, house specialty | one hero item (Premium only, §2.7) |
| Variant table | **Tabela varijanti** | rows of variants with prices | rakije/wines by 0.3 l / 0.5 l, čaša / flaša |

**Visibility rule (owner-fixed): the first 10 items of a group are visible; the rest sit behind a caret-down accordion, and opening one group's accordion closes the previously open one.** This is a bound in the pure block model (a `visibleCount = 10` constant and a single-open accordion state), not a per-theme CSS flourish — so every shape obeys it and it is testable.

**Rejected options.**

- *Free-form per-item layout (each item picks its own render).* Rejected: it turns a menu into a page builder, makes the 10-visible rule impossible to state, and produces the incoherent, mixed-density pages this design exists to prevent. The group, not the item, is the layout unit.
- *A sixth "grid of N-per-row" shape parameterized by column count.* Rejected: `Galerija` is the 2-up answer and the phone is one column wide; an arbitrary column count is a knob nobody on a 375px screen benefits from.
- *Accordion that allows several groups open at once.* Rejected: multiple open accordions on a phone produce a page kilometers long with no sense of place; single-open keeps the scroll-spy (§2.2) honest — one group is "the current one" at any time.

### 2.2 Navigation — a sticky scroll-spy that jumps, never filters

A sticky bar of group names sits at the top of the public page. Tapping a name **scroll-jumps** to that group and the bar highlights the group currently under the scroll position (scroll-spy). It is navigation, not a filter.

**Rejected options.**

- *A filter bar that shows only the tapped group and hides the rest.* Rejected — and this is the whole point: a menu is browsed, not searched. Hiding the rest of the menu breaks the one thing a paper menu does perfectly (you see it all), robs the kitchen of the impulse order two groups down, and makes "what else do they have" a dead end. The bar **jumps**; the rest of the menu is always one scroll away.
- *No nav bar, rely on scrolling.* Rejected: a full kafana menu is long; without a jump target the guest thumb-scrolls past what they wanted. The sticky bar is the table of contents.

### 2.3 The item, its product type, and its variants are first-class

An item is a row, not a paragraph. Its size, quantity, and extras are **rows of their own** (`itemVariants`), and a pairing to another item (`Ide uz`) is a **relation** (`itemPairings`), never a sentence in the description.

- **Product type** is a field on the item (piće, jelo, poslastica, …) that decides the default category icon (§2.4) and which variant axes make sense.
- **Variants** are `{ label, priceRsd, order }` rows: `0.3 l` / `0.5 l`, `čaša` / `flaša`, `mala` / `velika`, plus extras. The **Tabela varijanti** shape (§2.1) renders them as a price table; other shapes render them as chips under the item name. An item priced only through variants has no top-level price.
- **"Ide uz"** is a **manual** pairing an owner draws between two items (a rakija that goes with a meze, a dessert with a coffee). It surfaces in the item sheet (§2.5), never auto-generated.

**Rejected options.**

- *Variants and pairings as free text in the description.* Rejected: prose can't be priced, can't be totaled, can't drive a variant table, and can't be exported to a spreadsheet (§2.9). The whole reason to leave paper is that the data is structured.
- *Auto-derived "goes with" from co-occurrence or category.* Rejected: there is no order history in this product (ordering is RFC-004), and category-based guessing pairs rakija with every meze indiscriminately. The owner's taste is the signal; the pairing is hand-drawn.

### 2.4 Icons and the no-empty-frame rule

Every item shows something in its image slot. **The rule has no exception: an item without a photo shows a coloured tile (`pločica`) bearing its category icon in the venue's accent colour — never an empty frame, never a broken-image glyph, never grey.** On Basic, *every* item is a tile (Basic has no photos, §2.7); on Premium, items with a photo show the photo and the rest show tiles, so a half-populated Premium menu still looks intentional.

- **Icon set = lucide base + ~20 domestic icons.** The base is the existing icon registry ([lib/scanme-icon-libraries.ts](../../lib/scanme-icon-libraries.ts)) with `lucide` as the default library; on top sit **~20 hand-drawn inline SVGs for things lucide has no glyph for** — rakija, domaća kafa, burek, pljeskavica, ćevapi, kajmak, ajvar, and their kin (the exact set is an owner list, §5 / [BLOCKED](../tasks/BLOCKED.md)). These are **inline SVGs** (constraint 2, and the first-paint budget §2.12), not an icon font and not remote assets.
- **Accent flows through a forked token.** The tile is tinted by a `--menu-icon` custom property set from the venue's accent colour (§1.b), exactly as the frozen Links template tints its glyph from `--links-icon` — but Menu's tile CSS is **its own** (the Links template is frozen and not touched; §6). The renderer maps a category/product type to a concrete glyph (lucide or a domestic SVG), reusing the glyph-mapping pattern of [components/scanme-links/template-icon.tsx](../../components/scanme-links/template-icon.tsx) in a new Menu component.

**Rejected options.**

- *Blank/placeholder frame when a photo is missing.* Rejected: it reads as "broken" and makes a Basic (photo-less) menu look unfinished, which is precisely the tier we must make look deliberate. The tile is a feature of Basic, not an apology for it.
- *A generic single "food" icon for everything without a photo.* Rejected: twenty tiles of the same fork-and-knife glyph is visual noise; a rakija tile and a burek tile that actually differ give a photo-less menu real identity.
- *Reusing the frozen Links icon tile CSS directly.* Rejected: that CSS lives in the frozen render path; Menu forks its own tile styling and only reuses the (product-neutral) glyph-mapping pattern.

### 2.5 The item sheet, video, and dayparts

- **The item sheet is a bottom sheet on tap.** Tapping an item opens a bottom sheet with the full description, variants, allergen/notes, `Ide uz` pairings, and the inquiry action (§2.10). The list stays calm; detail is one tap away and dismissible.
- **Video plays only in the sheet, never in the list.** A Premium item may carry a short video (Convex storage, §2.7); it plays **only inside the opened sheet** and **never autoplays in the list**. Autoplaying video in a scrolling list is a data-and-battery tax and a first-paint killer (§2.12); the sheet is a deliberate, single, user-initiated play.
- **Dayparts swap which groups show.** `menuDayparts` are venue-configured time windows (doručak / ručak / večera) with an `order`; a group may be bound to a daypart. The **active daypart is derived at render from the request time in the venue's timezone**, and a **manual override** on the menu pins a daypart and beats the clock (for a kitchen that runs breakfast late). Groups with no daypart show always.

**Rejected options.**

- *Autoplay video thumbnails in the list (the "deliveroo" look).* Rejected by constraint and by budget: it violates "no autoplay" (§2.12) and turns a menu into a battery drain; user-initiated play in the sheet is the whole video experience.
- *Daypart evaluated from the guest's device clock.* Rejected: a guest whose phone is on the wrong timezone (or deliberately off) would see the wrong menu; the venue's timezone is the single source of truth, and the manual override handles the real-world "breakfast till noon today" case honestly.
- *Dayparts as separate published menus the owner switches by hand.* Rejected: it multiplies the surface to maintain and guarantees drift (a price fixed in "lunch" but not "dinner"); one menu with daypart-bound groups keeps a single source of prices.

### 2.6 The living menu — Convex reactivity is the moat

**Decision, made to the end:** the public menu page **subscribes** to its data; it is not a static export. When an owner toggles an item's `available` flag to `nema više` at 20:30, or changes a price, **every phone already looking at that menu updates at that second**, because the public render holds a live Convex query subscription for the availability- and price-bearing fields. This is the one thing a photographed-PDF menu — the whole competitive field — structurally cannot do, and it is why the item's `available` boolean and variant prices live in queried rows, not baked HTML.

This sets up the one real tension in the product, resolved deliberately in favor of both goals rather than one:

> **SSR the first paint from current data (fast — the budget, §2.12), then hydrate a Convex subscription that live-patches availability and prices.** The guest sees a complete page under the 1-second budget; seconds later the same page is live. Neither goal is sacrificed to the other.

**Rejected options.**

- *Fully static ISR/SSG export of the menu.* Rejected: it makes first paint trivially fast but **kills the live-menu moat** — a `nema više` would wait for a revalidation window, and the product's single differentiator evaporates. Unacceptable.
- *Pure client-side render (CSR) subscribing from an empty shell.* Rejected: it is live but blows the first-paint budget — the guest stares at a spinner on a 4G phone at a table. SSR-then-subscribe gets the paint *and* the liveness.

### 2.7 Plans, limits, and the entitlement gate

Basic and Premium are expressed through the existing chain (§1.c), additively, with **no change to `convex/lib/access.ts`**.

- **Basic:** no photos (every item is a coloured tile, §2.4), no in-sheet video, no animations, no Istaknuto group; **unlimited items and unlimited groups.** Basic is a genuine, usable menu — the tile aesthetic is the point, not a nag screen.
- **Premium:** photos, in-sheet video, animations, and the **Istaknuto** group shape; items and groups still unlimited.

The proposed limit shape and mappings (code, so tuning is a deploy — final gating is owner-confirmed, §5):

```ts
// convex/lib/plans.ts — SPECIFIED, not added in this task.
interface MenuLimits {
  photos: boolean;         // false Basic, true Premium
  videoInSheet: boolean;   // false Basic, true Premium
  animations: boolean;     // false Basic, true Premium
  featuredGroup: boolean;  // "Istaknuto" — false Basic, true Premium
  maxGroups: number | null;        // null (unlimited) both tiers
  maxItemsPerGroup: number | null; // null (unlimited) both tiers
}
PLAN_LIMITS.scanme_menu = {
  basic:   { photos: false, videoInSheet: false, animations: false, featuredGroup: false, maxGroups: null, maxItemsPerGroup: null },
  premium: { photos: true,  videoInSheet: true,  animations: true,  featuredGroup: true,  maxGroups: null, maxItemsPerGroup: null },
};
// account plan → per-product tier (planKey), read by getEntitlement step 3.
ACCOUNT_PLAN_TIER.scanme_menu = { basic: "basic", premium: "premium", enterprise: "premium" };
```

**The read-time gate copies the Venue analytics helper exactly** ([convex/venueAnalytics.ts](../../convex/venueAnalytics.ts) → `venueAnalyticsEnabled`): the public Menu query resolves `getEntitlement(ctx, businessId, "scanme_menu")`, passes `.limits` to `menuPhotosEnabled(limits)` / `menuVideoEnabled(limits)` / `menuFeaturedEnabled(limits)`, each defaulting a missing entitlement to Basic — so a photo field is simply **not emitted** to the client on Basic, and an upgrade lights photos up with no content migration. The Menu **editor** guard is a call to `requireServiceEditorAccess(..., ["scanme_menu"])` — `access.ts` unchanged (§1.c).

**Rejected options.**

- *A numeric item/group cap on Basic to push the upgrade.* Rejected: the owner's decision is unlimited items on both tiers; the Basic→Premium lever is **photos and video**, not an artificial ceiling that would make Basic feel broken and punish exactly the small kafana we want on the platform.
- *A third Menu tier.* Rejected: two tiers match the account plan (Basic/Premium) and the feature split is binary (photos or not); a third tier is a fiction with no feature to hang on it. Enterprise resolves to the Premium tier (bespoke deviations ride `account.overrides`, per RFC-002 §2.2.3).

### 2.8 Routing and the card resolver

**Decision: Menu is its own card-target kind that resolves to `/{businessSlug}/meni`, with no stored reference** — the exact shape of the `venue` kind (§1.d). A `menu` value is added to the card-target-kind union and `scanme_menu` to `serviceTypeValidator`; `resolveAndRecord` gains a one-line redirect case; the scan is recorded once per server `requestId` through the unchanged path, and an unknown/inactive code falls through to the existing fallback. The public page lives at `app/[slug]/meni/` beside the shipped `app/[slug]/venue/`.

**Rejected options.**

- *Bind Menu through the generic `service_page` kind (a stored `serviceProfileId`).* Rejected: `venue` already established the "kind that resolves to `/{slug}/<segment>` with no stored ref" pattern; a stored reference is one more thing to keep consistent for zero gain, and the slug already identifies the business. Mirroring `venue` keeps the resolver uniform.
- *A `menu` segment under the Links page.* Rejected: that would couple Menu's route to the frozen product; Menu is a first-class page at `/{slug}/meni`, independent of whether the business owns Links.

### 2.9 Data entry, PDF/Excel export, and the operational flow

**We enter the client's existing menu for them, free of charge, within two working days.** This is an operational promise with a place in the product, not a side agreement.

- **Where it lives:** a `requireAdmin`-gated **Menu management surface** — a new `menu` case in the admin location subpage body ([components/admin/location-admin.tsx](../../components/admin/location-admin.tsx) `SubpageBody`) with `requireAdmin`-gated Menu mutations in a new `convex/menu*.ts` module, provisioned through the same `upsertManualEntitlement` path Venue/Memories use ([convex/admin.ts](../../convex/admin.ts) `approveActivation`). The admin (us) builds the menu; the client reviews it.
- **SLA surfaced:** the location's Menu subpage shows the state of the migration — *primljeno → u izradi → na potvrdi → objavljeno* — so "two working days" is visible, not a promise in an email. Every admin mutation that changes a plan, an activation, or the menu writes one `adminAuditLog` row (RFC-002 §2.6), who/what/when.
- **Export:** the owner is offered **PDF and Excel** exports of the items — a **Convex action** derives both from the queried rows (constraint 2: no R2; the file is streamed to the browser, not parked in external storage). This mirrors the derive-at-export discipline of the Memories ZIP path and must respect the Convex action memory ceiling (§3, and the pattern in [docs/perf/memories-export.md](../perf/memories-export.md)).
- **Later edits we make are billed extra.** The first migration is free; a subsequent owner-requested change we perform is a paid operation. This is a pricing line the owner owns (RFC-002's engine), flagged in §5.

**Rejected options.**

- *Client self-serve only, no data entry.* Rejected: the owner's promise is concierge onboarding — the small kafana that will never build a menu itself is the customer; we type it in. Self-serve editing is Premium's *ongoing* affordance, not the onboarding path.
- *Export via a stored file on external storage.* Rejected by constraint 2: the export is derived on demand from Convex rows and streamed; nothing lands on R2/CDN.

### 2.10 Inquiry, not commerce

**Menu is not a shop.** There is no cart, no price total, no checkout. The item sheet (§2.5) offers a single **Upit** action that sends an **email to the owner** through the platform's existing mail seam (the same seam used elsewhere for owner notifications) — "gost pita za ovu stavku." Ordering, a running tab, and payment are **RFC-004** and do not exist here (constraint 8).

**Rejected option.** *A cart/checkout even as a stub.* Rejected: it invites the guest to expect ordering the product does not have, and it drags in payment questions that belong to RFC-004. The honest surface is an inquiry, and it is one email.

### 2.11 i18n

Two new surfaces via the recipe in §1.e: **`menu`** (public page + item sheet + nav) and **`menu-admin`** (the management/migration surface, §2.9). Each is a `Dict` interface in [lib/i18n/types.ts](../../lib/i18n/types.ts) plus an `sr/menu.ts` / `sr/menu-admin.ts` module registered in [lib/i18n/index.ts](../../lib/i18n/index.ts), read through `getDict` / `fmt`. All copy is Serbian, ekavica (constraint 3). The frozen Links inline Serbian is explicitly **not** in scope (§1.e, §6).

### 2.12 Performance budget — first paint under 1 second on 4G

**The budget is a number, not a wish: first contentful paint under 1000 ms on an emulated 4G profile.** It is met by construction:

- **Inline SVG icons** (§2.4) — the lucide-plus-domestic set ships in the HTML/JS, not as an icon font or remote fetch, so the photo-less first paint needs zero image round-trips.
- **AVIF + WebP, lazy below the fold** — Premium photos are served as `next/image` AVIF/WebP; only above-the-fold images load eagerly, the rest lazily. The photo-less Basic page is essentially all-text-and-SVG and paints far under budget.
- **No autoplay video** (§2.5) — video bytes are fetched only when the guest opens a sheet and plays.
- **SSR-then-subscribe** (§2.6) — the first paint is server-rendered from current data; the live subscription hydrates after, so reactivity costs nothing at paint time.

**How it is measured and where the result is written.** A harness renders the public Menu page under a throttled 4G profile (fixed device + network preset) and records first-contentful/first-paint at p50/p95 with an `n`; the result and the exact command go in a new **[docs/perf/menu-first-paint.md](../perf/menu-first-paint.md)** following the convention of [docs/perf/memories-export.md](../perf/memories-export.md) and [docs/perf/memories-load.md](../perf/memories-load.md): H1, a provenance italic (the harness file + the exact command + the emulated profile and device), a **budget-vs-measured** table, then a verdict with reversal triggers. The budget is a **gate**: a run over 1000 ms p95 fails the task, exactly as the Memories perf docs gate against their ceilings.

### 2.13 New-table / new-type catalog

Conventions follow [convex/schema.ts](../../convex/schema.ts): literal-union statuses, `createdAt`/`updatedAt` as `v.number()`, child tables over unbounded arrays, index names listing all fields, Convex storage ids for media (no R2, constraint 2). **Everything below is additive and *specified, not created in this task*** — new tables start empty; the two touched existing validators gain one union member each.

```ts
menus: defineTable({
  businessId: v.id("businesses"),
  serviceProfileId: v.id("serviceProfiles"),
  status: v.union(v.literal("draft"), v.literal("published")),
  design: v.any(),                                  // the Menu design doc compiled by menu-tokens.ts (§1.b)
  daypartOverride: v.optional(v.string()),          // pins a daypart key, beats the clock (§2.5)
  publishedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_businessId", ["businessId"])
  .index("by_serviceProfileId", ["serviceProfileId"]),

menuGroups: defineTable({
  menuId: v.id("menus"),
  title: v.string(),
  shape: v.union(v.literal("lista"), v.literal("galerija"), v.literal("traka"),
    v.literal("istaknuto"), v.literal("tabela_varijanti")),   // exactly one per group (§2.1)
  iconKey: v.optional(v.string()),                  // category icon for the group's tiles (§2.4)
  daypartKey: v.optional(v.string()),               // bind to a daypart, else always shown (§2.5)
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_menuId_and_order", ["menuId", "order"]),

menuItems: defineTable({
  menuId: v.id("menus"),
  groupId: v.id("menuGroups"),
  name: v.string(),
  description: v.optional(v.string()),
  productType: v.string(),                          // drives default icon + variant axes (§2.3)
  priceRsd: v.optional(v.number()),                 // absent when variant-priced (§2.3)
  iconKey: v.optional(v.string()),                  // per-item override; else productType's default (§2.4)
  photoStorageId: v.optional(v.id("_storage")),     // Premium only; opaque Convex storage id (§2.7)
  videoStorageId: v.optional(v.id("_storage")),     // Premium only; plays in the sheet (§2.5)
  available: v.boolean(),                           // the live "nema više" flag (§2.6)
  order: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_groupId_and_order", ["groupId", "order"])
  .index("by_menuId", ["menuId"]),

itemVariants: defineTable({
  itemId: v.id("menuItems"),
  label: v.string(),                                // "0.3 l" | "flaša" | "velika"
  priceRsd: v.number(),
  order: v.number(),
})
  .index("by_itemId_and_order", ["itemId", "order"]),

itemPairings: defineTable({                         // manual "Ide uz" (§2.3)
  itemId: v.id("menuItems"),
  pairedItemId: v.id("menuItems"),
  order: v.number(),
})
  .index("by_itemId", ["itemId"]),

menuDayparts: defineTable({                         // venue-local time windows (§2.5)
  menuId: v.id("menus"),
  key: v.string(),                                  // "dorucak" | "rucak" | "vecera"
  label: v.string(),
  startMinute: v.number(),                          // minutes from midnight, venue timezone
  endMinute: v.number(),
  order: v.number(),
})
  .index("by_menuId_and_order", ["menuId", "order"]),
```

| # | Table / type | New or Δ | Why it exists | Ref |
|---|---|---|---|---|
| M.1 | `menus` | new | the per-location Menu doc (design + draft/published + daypart override) | §2.5, §2.7 |
| M.2 | `menuGroups` | new | the unit of layout; one shape per group | §2.1 |
| M.3 | `menuItems` | new | the item; carries the live `available` flag and media ids | §2.3, §2.6 |
| M.4 | `itemVariants` | new | size/quantity/extra as priced rows, not prose | §2.3 |
| M.5 | `itemPairings` | new | manual "Ide uz" relation | §2.3 |
| M.6 | `menuDayparts` | new | doručak/ručak/večera windows | §2.5 |
| M.7 | `serviceTypeValidator: "scanme_menu"` | Δ (union +1) | Menu becomes an ownable service | §1.f, §2.8 |
| M.8 | `cardTargets.kind: "menu"` | Δ (union +1) | a card resolves to `/{slug}/meni` | §2.8 |
| M.9 | `lib/menu-blocks.ts` | code | the five group shapes + item/variant model + bounds (fork of `venue-blocks.ts`) | §2.1 |
| M.10 | `lib/design-engine/menu-tokens.ts` + `MENU_ROLES` | code | compile the Menu design → `--menu-*` with a11y floors | §1.b, §2.4 |
| M.11 | `MenuLimits` + `PLAN_LIMITS.scanme_menu` + `ACCOUNT_PLAN_TIER.scanme_menu` + `menu*Enabled` helpers | code | the Basic/Premium capability gate | §2.7 |
| M.12 | ~20 domestic inline-SVG icons + Menu glyph map | code | the no-empty-frame tile set | §2.4 |

No index key on any **existing** table changes, and `entitlements`, `accounts`, `orders`, and `convex/lib/access.ts` are **not** modified — Menu rides the shipped chain.

### 2.14 Change list against existing code (risk-annotated)

| File / area | Change | Risk | Why it is bounded |
|---|---|---|---|
| [convex/schema.ts](../../convex/schema.ts) | 6 new tables; `serviceTypeValidator` +`"scanme_menu"`; `cardTargets.kind` +`"menu"` | low | additive; existing rows validate unchanged; new tables empty |
| [convex/lib/plans.ts](../../convex/lib/plans.ts) | `MenuLimits`, `PLAN_LIMITS.scanme_menu`, `ACCOUNT_PLAN_TIER.scanme_menu`, gate helpers | low | additive consts; no existing export changes |
| [convex/lib/entitlements.ts](../../convex/lib/entitlements.ts) | **no change** — `scanme_menu` resolves through the generic path | — | `getEntitlement` is product-generic; Menu is a new `product` value only |
| [convex/lib/access.ts](../../convex/lib/access.ts) | **no change** | — | the Menu editor guard is a *call* passing `["scanme_menu"]` (§1.c). "No change" holds for every task in this table **except the terminal TASK-61**, where adding `"scanme_menu"` to `serviceTypeValidator` forces `SERVICE_PRODUCT_NAMES` (and five sibling `Record<ServiceType, …>` maps) to gain a `menu` case — that one map edit in TASK-61 is unavoidable and expected, not a freeze violation |
| [convex/cards.ts](../../convex/cards.ts) | `menu` target-kind case in `validateBaseTargetSpec` + a redirect line in `resolveAndRecord` | low | mirrors the `venue` case exactly; the record path is unchanged |
| [components/venue/**](../../components/venue) | **read as a fork base, not edited** → new `components/menu/**` + `app/[slug]/meni/` + Menu editor route | medium | fork lands in new files; the shipped Venue product is untouched |
| [components/admin/location-admin.tsx](../../components/admin/location-admin.tsx) | a `menu` case in `SubpageBody`; new `convex/menu*.ts` admin mutations | low | new case alongside existing ones; `subpageActive("menu")` still false until §4 TASK-61 |
| [lib/i18n/**](../../lib/i18n) | `menu` + `menu-admin` surfaces | low | additive; a missing key is a type error |
| [lib/flags.ts](../../lib/flags.ts) | **no change until §4 TASK-61**, then `MENU_EXISTS = true` | low | one-line flip is the terminal, isolated task |
| **ScanMe Links product** (public render path / editor) | **no change** — see §6 | frozen | Menu forks **Venue**, not Links; the frozen render is neither read as a base nor edited |

---

## 3. Risk register

Ranked. Each risk lists blast radius and a concrete mitigation.

| # | Risk | Blast radius | Mitigation |
|---|---|---|---|
| 1 | **A task edits the frozen ScanMe Links product** — a "small" refactor of a shared component, or reusing the Links tile CSS directly (§2.4), touches the frozen render path. | The frozen golden harness; the owner's hardest constraint. | Menu forks **Venue**, not Links; every task carries the freeze gate `git diff --stat components/scanme-links lib/scanme-links*` must print nothing; `npm run harness:check` proves the goldens byte-for-byte; any *wanted* touch is re-flagged in §6 and blocked. |
| 2 | **The live-menu property is lost to a static export** (§2.6) — a well-meaning perf task ISR-caches the page and `nema više` stops propagating. | The product's only moat versus PDF competitors. | SSR-then-subscribe is written as the decision (§2.6); a test asserts that toggling `available` updates a second open client without a reload; a static/ISR export of the availability-bearing fields is forbidden and called out here. |
| 3 | **The Basic/Premium gate mis-resolves** — a wrong `ACCOUNT_PLAN_TIER.scanme_menu`, or a photo field emitted to a Basic client. | Every Menu on the platform; a free tier leaking Premium media or a paid tier missing photos. | The gate copies the proven `venueAnalyticsEnabled` shape (helper defaults to Basic); a convex-test matrix covers {no entitlement, basic, premium, enterprise} × {photos on/off}; the photo/video field is **omitted server-side** on Basic, never merely hidden in CSS. |
| 4 | **Forked editor drifts from Venue** and re-implements a bug Venue already fixed (mobile portal, image signed URLs). | The Menu editor's authoring UX. | The fork copies Venue's *current* shipped files (post-TASK-12 fixes), not an old Links snapshot; block-image URLs use the shipped signed-URL query pattern (queries ship signed maps; storage ids stay opaque), not guessed URLs. |
| 5 | **Daypart clock ambiguity** — server timezone vs venue timezone vs guest device produces the wrong menu at a boundary (§2.5). | Any venue using dayparts, at meal boundaries. | "Now" is evaluated in the **venue timezone**; the manual override pins a daypart and beats the clock; a test covers a boundary minute in a non-UTC venue timezone and the override path. |
| 6 | **PDF/Excel export exceeds the Convex action memory ceiling** on a large menu (§2.9). | The export action for big menus. | Derive-at-export from queried rows, stream out (no in-memory accumulation of media); the ceiling and a menu-size table are recorded in the export perf note, mirroring [docs/perf/memories-export.md](../perf/memories-export.md). |
| 7 | **First paint misses the 1 s / 4G budget** (§2.12) — a Premium menu of eager photos, or a heavy client bundle. | Every guest at a table on 4G; the product's felt speed. | Inline SVG, AVIF/WebP lazy below the fold, no autoplay, SSR-then-subscribe; the budget is a **gate** in `docs/perf/menu-first-paint.md` — a p95 over 1000 ms fails the task. |
| 8 | **`MENU_EXISTS` flips before Menu is ready**, or a task ships `scanme_menu` as activatable prematurely. | The admin surface and the sellable set (RFC-002). | The flip is the single terminal task (§4 TASK-61); `subpageActive("menu")` stays false and `serviceTypeValidator` stays without `scanme_menu` until that task; no earlier task touches `lib/flags.ts`. |
| 9 | **Publish churns `menuItems._id`** (§2.13) — `publishDraft` replaces rows, so every item's `_id` changes on each publish. | A future ordering task (RFC-004 §2.13) that keys on `menuItems._id` silently loses its bindings after any republish. | Ordering and any cross-table reference to a Menu item **must not** use `menuItems._id` as a stable key; bind to a stable business-level key instead. |
| 11 | **Objava velikog menija ruši `publishDraft`** — do TASK-60c objava je brisala sve postojeće redove pa upisivala nove u JEDNOJ mutaciji; `deletePublishedRows` radi 2 upita po svakoj postojećoj stavci, pa **republish** velikog menija prelazi Convex limit od 4096 upita (izmereno: puca između 700–850 stavki, [docs/perf/menu-publish-ceiling.md](../perf/menu-publish-ceiling.md)). Hard-crash bez delimičnog izlaza; TASK-58 uvozi menije trećih strana čiju veličinu ne kontrolišemo. | Objava/izmena velikog menija (naročito TASK-58 uvoz); vlasnik/admin dobija sirov „Too many reads" na Sačuvaj. | **REŠENO u TASK-60c (generacijski model):** objava upisuje SVEŽU generaciju N+1 bez brisanja starih redova (upis nema per-stavka upite → cena kao „fresh publish", ~0 upita), atomično flipuje `menus.publishedGeneration`, a čišćenje starih generacija ide u scheduler nastavke (`cleanupOldGenerations`) van kritičnog puta, uz cron rezervu (`sweepStuckMenuCleanups`) za izgubljen nastavak. Javni upit filtrira po generaciji (obavezno — stare i nove generacije nakratko koegzistiraju). Preostali plafon je sada JAVNI UPIT (fan-out 2 upita/stavci → ~2000 stavki); TASK-58 ne sme da uvozi veće menije dok se i čitanje ne izbatchuje. |
| 10 | **`setItemAvailable` („nema više") poništava se ponovnom objavom sa nesačuvanim izmenama** — `setItemAvailable` patchuje objavljeni red, a nacrt samo kad nema nesačuvanih izmena. Ako vlasnik drži editor sa nesačuvanim izmenama, prva sledeća objava poništava konobarovo „nema više" i stavka se vraća u ponudu. | Konobar označi „nema više", sledeća objava iz editora vrati stavku u ponudu; gost naruči stavku koje nema. | **REŠENO u TASK-58 (server detektuje, editor pita):** objavljeni red nosi stabilan `menuItems.key` (inline id nacrta); `publishDraft` pre ikakvog upisa čita živu generaciju (1 upit stavki + 1 upit grupa) i svaku stavku koju nacrt vraća u ponudu (`true`) a živi red kaže `false` (po ključu, ili po grupa+naziv kad ključa nema) proglašava konfliktom — bez `onAvailabilityConflict` objava se ODBIJA (`availability_conflict`, ništa se ne upisuje); editor otvara dijalog „Zadrži „nema više"" (`keepLive`: stavka se objavi kao `false` i to se preslika u nacrt) / „Objavi i vrati u ponudu" (`overwrite`). Adminova objava u ime klijenta uvek `keepLive`. Varijanta „objava nikad ne gazi `available`" odbačena jer bi prekidač dostupnosti u editoru postao mrtva kontrola (vlasnik ne bi mogao da vrati stavku iz editora). Testovi: `convex/menuAvailabilityConflict.test.ts`. |

---

## 4. Implementation sequence

Each step has a criterion a test or check can confirm. **Tasks are numbered TASK-47 upward** (TASK-45 and TASK-46 are a deliberate reserved gap); from this table the prompts go out one at a time. TASK-47–49 are pure prerequisites (schema, tokens, block model) and can be built in parallel after this RFC; the public render (52–54) depends on the block model and tokens; entitlements (55), cards (56), and i18n (57) are independent; admin/export (58), inquiry (59), and perf (60) close the product; **TASK-61 (the `MENU_EXISTS` flip) is terminal and done only when everything above is green.**

| # | Task | Verifiable success criterion |
|---|---|---|
| **TASK-47** | Schema catalog (PLAN mode): the 6 new tables + `serviceTypeValidator` +`scanme_menu` + `cardTargets.kind` +`menu` (§2.13) | convex-test: every existing table validates unchanged; a `menus`/`menuGroups`/`menuItems` round-trip inserts and reads; `npm run check` green; **no existing entitlement/access/card test changes** |
| **TASK-48** | Design engine fork: `lib/design-engine/menu-tokens.ts` + `MENU_ROLES` + `createTokenCompiler("menu")` (§1.b, §2.4) | a Menu design doc compiles to `--menu-*` custom properties; the a11y contrast floors produce readable `accent-text`/`on-accent`; unit tests mirror the venue-tokens tests |
| **TASK-49** | Pure `lib/menu-blocks.ts`: five group shapes, one-shape-per-group, item/variant/pairing/daypart model + bounds incl. `visibleCount = 10` (§2.1, §2.3) | a group accepts exactly one shape; `defaults`/`clamp` hold the bounds; the 10-visible/single-open-accordion rule is a testable constant; forked from `venue-blocks.ts` with no import of it |
| **TASK-50** | Domestic icon set (~20 inline SVGs) + Menu glyph map + accent-tile renderer (§2.4) | every product type maps to a glyph; a photo-less item renders a `--menu-icon`-tinted tile, **never** an empty frame (snapshot test over all product types); icons are inline SVG, no remote fetch |
| **TASK-51** | Menu editor fork (copy of the Venue editor shell + block registry) on a **new route**; `use-editor-history` reused (§1.a). A separate, testable **mapping module** converts between the inline `lib/menu-blocks.ts` model (items/variants/pairings nested on their group) and the denormalized §2.13 tables (`menuItems`/`itemVariants`/`itemPairings`, ordered by their `order` columns), in both directions, with a round-trip test — the two translators must not diverge. | the editor creates groups/items/variants and autosaves; **`git diff --stat components/scanme-links lib/scanme-links*` prints nothing**; `npm run harness:check` goldens byte-identical; the mapping module round-trips inline↔denormalized without loss and is covered by its own test |
| **TASK-52** | Public render `app/[slug]/meni/`: the five shapes + sticky scroll-spy (jump, not filter) + 10-visible caret accordion (open-one-closes-previous) + accent tiles (§2.1, §2.2, §2.4). The render **imports** TASK-51's mapping module to go from the denormalized rows to the inline shape it renders — it does not write its own translation. It also **imports** TASK-51's shipped render layer — the five shape renderers (`components/menu/blocks/**`), `components/menu/menu-template.tsx`, and `components/menu/menu-view.ts` — and **must not** re-implement any shape renderer; its own new code is the sticky scroll-spy, the caret accordion, and the SSR-then-subscribe data feed. | each shape renders on a 375px viewport; the nav bar jumps and scroll-spies; opening a group's accordion closes the previously open one; the filter behavior is absent by test; the render has no ad-hoc row→inline mapping code — it calls the shared module |
| **TASK-53** | Item bottom-sheet on tap + in-sheet video (no autoplay in list) + "Ide uz" pairing surfacing (§2.3, §2.5) | tapping an item opens the sheet; video is inert in the list and plays only in the sheet; pairings render from `itemPairings`; keyboard-dismissible sheet |
| **TASK-54** | Dayparts (venue-timezone auto-switch + manual override) + **live reactivity** proof (§2.5, §2.6) | a boundary-minute test in a non-UTC venue selects the right daypart and the override beats the clock; toggling an item's `available` updates a second open client **with no reload** |
| **TASK-55** | Entitlements: `MenuLimits` + `PLAN_LIMITS.scanme_menu` + `ACCOUNT_PLAN_TIER.scanme_menu` + `menu*Enabled` read gates (§2.7) | convex-test matrix {no entitlement, basic, premium, enterprise} × {photos on/off} resolves correctly; a Basic query **omits** photo/video fields server-side; **existing access + entitlement tests pass byte-identically**; `access.ts` untouched |
| **TASK-56** | Card binding + resolver: `menu` kind → `302 /{slug}/meni`; scan recorded once per requestId (§2.8) | `curl -i /r/<code>` for a menu card → `302` to `/{slug}/meni`; the same requestId records exactly one scan row; an unknown/inactive code falls through to the existing fallback |
| **TASK-57** | i18n `menu` + `menu-admin` surfaces (`Dict` ifaces + `sr/*` + `SR` map) (§2.11) | all Menu copy reads through `getDict`/`fmt`; a deliberately missing key fails `npm run check`; no inline Serbian in new code |
| **TASK-58** | Admin Menu subpage (`menu` case in `SubpageBody`) + client-data-entry mutations + migration-state SLA + **PDF & Excel** export action (§2.9); rešava i poništavanje „nema više" statusa pri objavi nacrta sa nesačuvanim izmenama (§3 Rizik 10) | an admin builds a menu for a location; every mutation writes one `adminAuditLog` row; the subpage shows the migration state; the export action streams a PDF and an Excel derived from rows (no R2), within the action memory ceiling; mora da reši slučaj poništavanja `available` statusa pri objavi iz editora sa nesačuvanim izmenama (ili tako što objava ne gazi polje available, ili tako što editor vidno upozorava na razliku pre objave) |
| **TASK-59** | Inquiry-by-email seam (Upit → owner email); no cart, no checkout (§2.10) | the sheet's Upit action sends one email through the existing mail seam; there is no cart or total anywhere in the render |
| **TASK-60** | Perf harness + `docs/perf/menu-first-paint.md`: measured first paint **< 1 s on 4G** (§2.12); **plus the publish ceiling** — `publishDraft` writes all six tables' rows in **one mutation** while §2.7 promises unlimited items, so publish a **100- / 400- / 1000-item** menu and record in `docs/perf/` the size at which the mutation fails or nears the Convex per-mutation limit, with a verdict on whether publish must fan out into **scheduler continuations before TASK-58** imports third-party menus | the harness renders the public menu under a throttled 4G profile and records FCP p50/p95 with `n`; the doc has provenance + budget-vs-measured + verdict; a p95 over 1000 ms **fails**; the publish-ceiling doc records the 100/400/1000-item results and the continuations verdict |
| **TASK-60b** | QA i pristupačnost Menija | sticky scroll-spy traka i „Traka" grupa prohodne tastaturom; caret akordeon ima ispravan `aria-expanded` i fokus se ne gubi pri zatvaranju prethodne grupe; bottom sheet ima focus trap i zatvara se Escape-om; pločice sa ikonicama imaju tekstualnu alternativu; kontrast akcentne boje prolazi AA; nalaz se upisuje u `docs/qa/` |
| **TASK-60c** | Grananje objave menija u nastavke (generacijski model) — TASK-60 je izmerio da `publishDraft` na **REPUBLISH** puca na Convex limitu broja upita (4096) između 700–850 stavki, jer `deletePublishedRows` radi 2 upita po svakoj postojećoj stavci. Brisanje **izlazi iz kritičnog puta**: objavljeni redovi dobijaju `publishGeneration`; `publishDraft` upisuje generaciju N+1 (bez brisanja starih) i atomično flipuje `menus.publishedGeneration`; čišćenje starih generacija ide u scheduler nastavke (`cleanupOldGenerations`) uz cron rezervu (`sweepStuckMenuCleanups`, obrazac TASK-65); javni upit čita SAMO tekuću generaciju. NE dira editor, javni render, ni gejtovanje planova; `MENU_EXISTS`/`access.ts` netaknuti. | convex-test: objava 1000 stavki prolazi 1. i 2. put; javni upit dok N i N+1 koegzistiraju vraća CELU generaciju (nikad mešavinu); čišćenje se završi bez siročadi; izgubljen nastavak pokupi cron; **perf seed na pravom deploymentu** pokazuje da republish upis više ne raste ka 4096 (`databaseQueries` ~ kao fresh), brojevi u `docs/perf/menu-publish-ceiling.md` ispod starih |
| **TASK-61** | Flip `MENU_EXISTS = true` + activation wiring (`scanme_menu` becomes an activatable subpage) — **terminal**. This is also where `"scanme_menu"` is added to `serviceTypeValidator` (deferred by TASK-47, see [BLOCKED](../tasks/BLOCKED.md)) and where all six `Record<ServiceType, …>` maps that union forces total are updated: `convex/lib/access.ts` `SERVICE_PRODUCT_NAMES`, `components/admin/customers-admin.tsx` `SERVICE_LABEL` (+ its i18n key), `convex/checkout.ts` `SPLITTER_BUTTON_LABEL`, `convex/lib/orderSnapshot.ts` `PRICING_SERVICE_BY_SERVICE_TYPE` (the menu → pricing-service mapping), `convex/orders.ts` `SLUG_SUFFIX`, and `convex/lib/plans.ts` (TASK-55 defined standalone `MENU_PLAN_LIMITS` and `MENU_ACCOUNT_PLAN_TIER`; TASK-61 wires them into `PLAN_LIMITS.scanme_menu` and `ACCOUNT_PLAN_TIER.scanme_menu` so `getEntitlement` can resolve `scanme_menu` directly). It also **backfills `serviceProfileId` onto existing `menus` rows** and, if that is possible without breaking existing rows, **tightens `menus.serviceProfileId` from optional back to required** (TASK-51 loosened it because `scanme_menu` was not yet in the service-type union — see [BLOCKED](../tasks/BLOCKED.md) TASK-51 §1). | the admin label flips "ScanMe Page" → "Meni"; a location with an active `scanme_menu` service renders its Menu subpage; `serviceTypeValidator` includes `"scanme_menu"` and all six `Record<ServiceType, …>` maps above compile as total functions with a `menu` case; done only after TASK-47–60 are green |

The **billed** operational line (later owner-requested edits, §2.9) and the exact **prices/limits** are owner inputs, not tasks here; they wait in §5 / [BLOCKED](../tasks/BLOCKED.md).

---

## 5. Open questions

Named, each with who resolves it. Information this RFC did not have and did not invent — all cross-listed in [docs/tasks/BLOCKED.md](../tasks/BLOCKED.md).

1. **Basic/Premium Menu plan mapping and price.** The proposal is `ACCOUNT_PLAN_TIER.scanme_menu = { basic→basic, premium→premium, enterprise→premium }` (§2.7); the Menu price constant is owned by the RFC-002 engine. Confirm the mapping and provide the number. **Owner.**
2. **The ~20 domestic icons — the final set.** Proposed seed: rakija, domaća kafa, burek, pljeskavica, ćevapi, kajmak, ajvar, and their kin (§2.4). Confirm and complete the list of ~20. **Owner / product.**
3. **Daypart default windows.** The proposal is venue-timezone windows for doručak/ručak/večera with a manual override (§2.5); the default boundary minutes are a placeholder. Provide the defaults. **Owner.**
4. **Variant default presets.** The standard variant sets to seed (0.3 l / 0.5 l, čaša / flaša, mala / velika, common extras) (§2.3). **Owner / product.**
5. **Price of later edits we make on the client's behalf.** The first migration is free; a subsequent owner-requested change is billed (§2.9). Set the fee/model. **Owner.**
6. **Is Menu sold as pre-order before `MENU_EXISTS` flips, or hidden from the sellable set** (inherits RFC-002 §5 Q4)? **Owner / product.**
7. **PDF/Excel export — audience and template.** Client-facing self-serve, or admin-only operational tool; branded template or plain (§2.9)? **Owner.**

---

## 6. ScanMe Links freeze ledger

ScanMe Links (the **product** — its public render path and editor) is frozen (§2.0 constraint 1). This RFC touches it in exactly **zero** places, and records here every point where a decision *neighbours* the freeze so nothing is discovered late:

| Neighbouring decision | Does it touch the frozen product? | Disposition |
|---|---|---|
| The Menu editor as a fork (§1.a, §2.1) | **No** — it forks **Venue** (itself the shipped Links fork), into new files on a new route; the Links editor is not the base and is not edited | Allowed; in scope |
| The accent icon tile (§2.4) | **No** — it reuses the product-neutral glyph-mapping *pattern* of `template-icon.tsx` in a **new** Menu component and forks its own tile CSS; `--menu-icon`, not `--links-icon` | Allowed; the frozen tile CSS is not touched |
| Extracting a pure helper from Links (if a task proposes it) | **Only if byte-identical** — permitted just where the golden harness proves the render is unchanged | Conditional; default is **fork, don't extract**; any extraction must pass `harness:check` byte-for-byte or it is blocked |
| The `menu` admin label / `Page → Menu` rename (§1.f, §2.9) | **No** — admin surface; Menu is a separate product (RFC-001 §2.5) | Allowed; lands with §4 TASK-61 |
| Ordering / waiter panel (constraint 8) | **N/A** — deferred to RFC-004; not designed here | Out of scope |

Anything a future task discovers that *does* require editing the ScanMe Links public render path or editor must stop and be re-flagged here as blocked on the owner, exactly as the extraction row is.

---

*End of RFC-003.*
