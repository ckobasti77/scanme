# RFC-001: ScanMe Venue + ScanMe Memories

| | |
|---|---|
| **Status** | Draft for review |
| **Date** | 2026-08-24 |
| **Scope** | Architecture for two new products on the existing ScanMe platform: **ScanMe Venue** (one stable, re-dressable event page per business) and **ScanMe Memories** (guest photo uploads at events, no login). A future digital-invitation product with RSVP is a non-goal, but the design leaves room for it. |
| **Baseline** | Branch `jovan/scanme-templates-icons`; Next.js `16.2.12`, React `19.2.8`, `convex ^1.42.1`, `@convex-dev/auth ^0.0.94` ([package.json](../../package.json)) |

**How to read this document.** §1 is the audit of what exists today — every claim cites a file (and where useful a symbol or line range) in this repository; line numbers are as of the baseline above. §2 is the target architecture; the URL scheme, card resolver, guest-identity model, image pipeline, storage (Convex file storage — §0.6), billing port, and i18n decisions were fixed before this RFC and are treated as constraints — §2 records where codebase evidence shaped *how* they are realized, and §4 records where evidence forced a caveat. §3 is the risk register, §5 the ordered implementation sequence with verifiable success criteria, §6 the open questions.

**Glossary.** *Profile* = a row in `serviceProfiles` (one per business per product, carrying that product's public slug). *Config* = the draft/published document for a profile (today only `scanMeLinksConfigs`). *Space* = one Memories installation (`/m/[code]`). *Session* = one "night" of a space. *Card* = one printed QR/NFC unit encoding `/r/[cardCode]`. *Guest* = one anonymous person identified by a cookie, not an account.

---

## 1. Audit of the existing platform

### 1.a The design/"block" system

**Headline finding: there is no block system.** `scanMeDesignV2Validator` ([convex/lib/scanMeDesignValidators.ts:243–348](../../convex/lib/scanMeDesignValidators.ts)) describes exactly one fixed page shape — identity header (logo, title, description), a list of link buttons, a footer — dressed by a flat bag of **page-global** style tokens:

- `colors`: 11 global roles — `page, surface, title, body, accent, border, focus, button, buttonHover, buttonText, icon` (lines 248–260). Not per-block.
- `buttons`: one style object (variant `solid|outline|glass`, radius, borderWidth, paddingX/Y, shadow, animation) applied to **every** button on the page (261–277).
- `effects`: optional shadows for exactly four named elements — global text shadow plus `titleShadow`, `descriptionShadow`, `buttonTextShadow`, `logoShadow` (278–286). This is the only per-element granularity in the entire schema.
- `typography`: a closed 12-member `fontKey` union, heading/body weight, one global alignment, scale, lineHeight, verticalSpacing (287–326).
- `presetKey` and `iconStyle`: two 15-member literal unions locked 1:1 to each other (18–34, 327–343).
- `background`: a genuinely reusable 6-category discriminated union — `flat`, `gradient`, `pattern`, `texture`, `media` (image/video with fit/zoom/position/overlay), `animation` (175–232), plus a reusable shadow object validator (`scanMeShadowValidator`, 234–241).

There are no block types, no ordering, no per-block properties, and no visibility flags (a destination's on/off is data-layer `state`, not design). The "block engine extraction" this RFC was asked to design is therefore a **build** (a new block layer for Venue) plus a **lift** (the reusable token/background/capability subsystems), not a refactor-out of something that exists.

**Templates are vestigial.** The registry has exactly one entry, `"option-two"` ([components/scanme-links/templates/registry.tsx:7–14](../../components/scanme-links/templates/registry.tsx)); `TemplateKey` and `BackgroundKey` are single-member unions ([lib/scanme-links.ts:25–26](../../lib/scanme-links.ts)). Visual variety comes from `presetKey` + 77 `[data-preset]` attribute selectors inside one 1,328-line stylesheet ([components/scanme-links/templates/option-two/option-two-template.module.css](../../components/scanme-links/templates/option-two/option-two-template.module.css)). The template's contract is ~40 CSS custom properties all namespaced `--links-*`, hardcoded in the TS type ([components/scanme-links/templates/types.ts:44–84](../../components/scanme-links/templates/types.ts)) and both stylesheets. The design→CSS step is `designStyle()`, a ~90-line hand-written mapping ([option-two-template.tsx:250–341](../../components/scanme-links/templates/option-two/option-two-template.tsx)); the background→CSS step is `backgroundPresentation()` (141–218), which is content-agnostic but **module-private**. The view model's only content payload is a link list (`ScanMeLinksViewModel.destinations`, [types.ts:20–42](../../components/scanme-links/templates/types.ts)).

**The editors.** Route shells are trivial ([app/[slug]/editor/page.tsx](../../app/%5Bslug%5D/editor/page.tsx), [app/admin/scanme-links/[businessId]/editor/page.tsx](../../app/admin/scanme-links/%5BbusinessId%5D/editor/page.tsx) — both render `ScanMeLinksEditorScreen`). The editor document is a single flat object, not a node tree ([components/admin/scanme-links-editor-types.ts:55–69](../../components/admin/scanme-links-editor-types.ts)); selection is a destination id, not a generic block id. Panels are **hand-written per property**, not schema-driven: `EDITOR_PANEL_IDS` is a closed 10-member union ([-types.ts:18–29](../../components/admin/scanme-links-editor-types.ts)), `EditorPanelContent` is a hand-written switch ([scanme-links-editor-common.tsx:212–289](../../components/admin/scanme-links-editor-common.tsx)), and [scanme-links-editor-panels.tsx](../../components/admin/scanme-links-editor-panels.tsx) is 2,673 lines of bespoke controls. Genuinely generic pieces exist and matter for reuse:

- `useEditorHistory` — past/present/future undo with group coalescing, generic over `T` ([components/admin/use-editor-history.ts:88–125](../../components/admin/use-editor-history.ts)).
- The autosave loop — content-hash diff + 720 ms debounce ([scanme-links-editor.tsx:302–378](../../components/admin/scanme-links-editor.tsx)).
- The desktop/mobile shell split, driven entirely by the `EDITOR_PANEL_IDS` + `panelCopy` maps ([-common.tsx:135–163](../../components/admin/scanme-links-editor-common.tsx), [-mobile.tsx](../../components/admin/scanme-links-editor-mobile.tsx)).
- Leaf field widgets `ShadowControls`, `EditorSelect`, `RadiusField`, `RangeField` ([-panels.tsx:1440–1526, 2377–2497](../../components/admin/scanme-links-editor-panels.tsx)).
- The preview renders **real production markup** — `OptionTwoFrame` + `OptionTwoDestinationContent` inside `@dnd-kit` ([scanme-links-editor-preview.tsx:486–624](../../components/admin/scanme-links-editor-preview.tsx)) — an excellent seam to preserve.
- The capability system: `SCANME_LINKS_PRESET_CAPABILITIES` (per-preset allow-lists for backgrounds, button variants, fonts; [lib/scanme-links-design.ts:340–740](../../lib/scanme-links-design.ts)) and its clamp gate `normalizeDesignForPreset` (1329–1432). Structurally product-agnostic; contents Links-specific.
- The dev harnesses: [app/dev/mobile-editor/page.tsx](../../app/dev/mobile-editor/page.tsx) (fixture-driven shell) and [app/dev/template-gallery/page.tsx](../../app/dev/template-gallery/page.tsx) (renders every preset × variation through the real template — the seed of the compatibility harness in §2.11).

**Defects observed while auditing** (worth fixing, but none block this RFC):

1. Per-element text shadows are silently dropped on every save: `normalizeEditorDesign` rebuilds `effects` with only `textShadow` + `logoShadow` ([convex/scanMeLinks.ts:227–236](../../convex/scanMeLinks.ts)), and the client does the same when the master shadow color changes ([-panels.tsx:2077–2084](../../components/admin/scanme-links-editor-panels.tsx)) — the editor UI, the template, and the validator all support the three overrides, but they never persist.
2. `draftDesignState` is write-only: set to `"ready"` at [scanMeLinks.ts:1417, 1628](../../convex/scanMeLinks.ts), never read.
3. `destinationPresentationValidator` (`button|social`) is dead: every write is a hardcoded `"button"` ([scanMeLinks.ts:1473, 1609–1610, 1696, 1707](../../convex/scanMeLinks.ts)); no UI reads it.
4. `scanMeLegacyDesignValidator` is exported and imported nowhere ([scanMeDesignValidators.ts:173](../../convex/lib/scanMeDesignValidators.ts)); V1 designs are silently reset to preset defaults at read time by `storedDesignV2` ([scanMeLinks.ts:155–164](../../convex/scanMeLinks.ts)) with no migration.
5. Default-background construction is duplicated in [lib/scanme-links-design.ts:940–1004](../../lib/scanme-links-design.ts) and [-panels.tsx:2516–2577](../../components/admin/scanme-links-editor-panels.tsx); two divergent font-family maps exist ([option-two-template.tsx:37–54](../../components/scanme-links/templates/option-two/option-two-template.tsx) vs [-panels.tsx:2657–2673](../../components/admin/scanme-links-editor-panels.tsx)).

**Verdict.**
*Reusable as-is:* background union + `backgroundPresentation` logic; shadow validator + CSS helpers; capability/clamp pattern; `applyVariation` ([lib/scanme-links-variations.ts:1006–1018](../../lib/scanme-links-variations.ts)); the whole generic editor chrome listed above; the preview-renders-production-markup seam.
*Must be generalized:* the `--links-*` token namespace and `designStyle()` compiler (prefix-parameterized compiler, §2.5); the fixed-shape view model (Venue needs a block document); the closed panel-id union and destination-typed selection (per-mode registries, §2.5); the hand-duplicated validator↔TS-type pair; the 12-font enum spread across 4 files.
*Stays Links-specific:* `presetKey`/`iconStyle` unions, the option-two template + its preset CSS, `lib/scanme-links.ts` vocabulary (`DESTINATION_KINDS`, `TEMPLATE_REGISTRY`, icon library), variation payload data, the dead `destinationPresentation` field (delete rather than generalize).

### 1.b The palette / token / font system

- [lib/scanme-color-science.ts](../../lib/scanme-color-science.ts) (454 lines): pure culori math — contrast, OKLCH mixing, `ensureContrast`, `deriveReadableTextVariant`, `harmoniousContrastColor`. Fully generic **except** `resolveBackgroundContext`/`backgroundContrastSamples` (360–454), whose only coupling is the `ScanMeLinksDesignV2` parameter type; the logic itself switches on the reusable background union.
- [lib/scanme-material-color.ts](../../lib/scanme-material-color.ts) (254 lines): the `@material/material-color-utilities` adapter. `generateMaterialRoles` (123–229) returns exactly 5 hex in role order `[background, surface, accent, text, button]`, accent = verbatim logo color. **Zero product coupling.** (MCU is pinned to 0.3.0 for build/test reasons — see project memory; keep the pin.)
- [lib/accent-palette.ts](../../lib/accent-palette.ts) (374 lines): logo extraction via colorthief + `QuantizerCelebi` (127–374) is product-agnostic; `createAccentTokens` (79–99) is legacy V1 accent math (own sRGB helpers, duplicated color code) largely bypassed once `design` exists ([option-two-template.tsx:289–301](../../components/scanme-links/templates/option-two/option-two-template.tsx)).
- [lib/scanme-palette.ts](../../lib/scanme-palette.ts) (379 lines): orchestration. `generateScanMePalette` (104–171) is generic; `deriveColors` (249–296) is the 5-role → 11-role expansion **hardcoded to the Links role set** — the seam that must become per-product (§2.5).
- `paletteAnalysis` ([scanMeDesignValidators.ts:54–61](../../convex/lib/scanMeDesignValidators.ts)) is an **editor-only artifact**: produced on logo upload ([scanme-links-editor.tsx:566–608](../../components/admin/scanme-links-editor.tsx)) and in the smart palette; persisted draft/published; never read by the public renderer (`publicLinksView` does not return it — [convex/scanMeLinks.ts:592–614](../../convex/scanMeLinks.ts)).
- Fonts: a closed 12-key enum duplicated across the Convex validator ([scanMeDesignValidators.ts:288–301](../../convex/lib/scanMeDesignValidators.ts)), `SCANME_LINKS_FONT_KEYS` ([lib/scanme-links-design.ts:158–172](../../lib/scanme-links-design.ts)), the render stack map, and the editor swatch map; every face statically imported via `@fontsource*` in [app/layout.tsx:7–22](../../app/layout.tsx). No dynamic font system.

**Verdict.** The color science, MCU adapter, and logo extraction are reusable as-is (Venue reuses them verbatim). `deriveColors`, `resolveBackgroundContext`'s parameter type, and the font-enum duplication must be generalized. `AccentTokens`/`DEFAULT_ACCENT*` are legacy and should not be carried into new products.

### 1.c The service abstraction

- `serviceProfiles` ([convex/schema.ts:102–117](../../convex/schema.ts)) — per-business, per-type row with its own public `slug`, `status`, `clientEditingEnabled`, and rollup counters — plus `serviceSlugAliases` for renames (119–125) are **genuinely service-agnostic** and are the foundation the new products stand on. Resolution is `serviceBySlug` ([convex/scanMeLinks.ts:357–371](../../convex/scanMeLinks.ts)): profile by slug, else alias → profile.
- But the type system is closed: `serviceType = "scanme_links" | "google_review"` ([schema.ts:23–26](../../convex/schema.ts)), mirrored in `requestedServiceValidator` ([convex/activationRequests.ts:6–9](../../convex/activationRequests.ts)).
- Hard type guards block new services today: `requireEditorAccess` throws for any non-`scanme_links` profile ([scanMeLinks.ts:390–392](../../convex/scanMeLinks.ts)); `setServiceActive` and `setClientEditingEnabled` hard-guard the type (1744, 1767) — **there is currently no way to activate a Venue or Memories profile**; `currentResolution` (684–726) falls through to the links view for unknown types.
- **The client panel is welded to the legacy product**: `requireBusinessAccessBySlug` denies access unless a legacy `dynamicLinks` google_review row exists ([convex/lib/access.ts:68–76](../../convex/lib/access.ts)), and `clientPanel.overview` hardcodes exactly two services ([convex/clientPanel.ts:101–119](../../convex/clientPanel.ts)). A business that buys only Venue or Memories cannot log into its own panel. This is the single most important prerequisite fix (§2.1).
- Profile/config creation happens only in `admin.createBusiness` ([convex/admin.ts:166–313](../../convex/admin.ts)) and the one-shot backfill [convex/migrations.ts:14–239](../../convex/migrations.ts). Slug machinery (`applyBaseSlugSync`, [admin.ts:421–491](../../convex/admin.ts)) is hardcoded to a two-profile tuple; `isBaseSlugAvailable` (496–534) checks five tables; `SLUG_MAX_LENGTH = 66` exists only because of the derived `-google-review` suffix ([lib/scanme-links.ts:206, 219–221](../../lib/scanme-links.ts)). `selectPrimaryLink` is copy-pasted in four files ([lib/access.ts:20](../../convex/lib/access.ts), [scanMeLinks.ts:676](../../convex/scanMeLinks.ts), [admin.ts:38](../../convex/admin.ts), [migrations.ts:6](../../convex/migrations.ts)).
- A favorable signal: `leads.interest` already carries `"venue"` and `"memories"` literals ([schema.ts:365–372](../../convex/schema.ts)), and [app/admin/venue/page.tsx](../../app/admin/venue/page.tsx) / [app/admin/memories/page.tsx](../../app/admin/memories/page.tsx) exist as `AdminPlaceholder` stubs.

**Verdict.** `serviceProfiles` + `serviceSlugAliases` + `serviceBySlug`: reusable as-is. The closed `serviceType` union, the type-guarded mutations, the `dynamicLinks`-coupled panel access, the two-tuple slug sync, and the hardcoded `clientPanel.overview` must all be generalized (§2.1). The legacy `dynamicLinks` mirror and `googleReviewSlug` derivation stay Links/Review-specific.

### 1.d The draft / published / revision pattern

Publishing is a **single atomic mutation**, `publishDraft` ([convex/scanMeLinks.ts:1643–1737](../../convex/scanMeLinks.ts)):

1. Optimistic concurrency: `config.draftRevision !== args.expectedDraftRevision → throw` (1661–1663). The only concurrency control; no row versioning.
2. Draft re-validation (template/background compatibility, media, ≤10 active destinations, HTTPS-only URLs).
3. Copy `draft* → published*`: an 11-pair hand-written field copy on the config (1712–1731) plus a 6-pair copy per destination row (1688–1710).
4. Bookkeeping: `hasUnpublishedChanges: false`, `publishedRevision = draftRevision`, `publishedAt = now`. `draftRevision` is *not* advanced by publish.

Guarantees and caveats, verified:

- **Public reads published state only.** `publicLinksView` (554–615) reads exclusively `published*`; no public function returns draft data (every `draftLinksView`/`businessView` call site sits behind `requireEditorAccess`/`requireAdmin`).
- **`hasUnpublishedChanges` is the only valid dirty flag.** `discardDraft` (1585–1641) bumps `draftRevision` while clearing the flag, so `draftRevision !== publishedRevision` is *not* a dirty check — nothing in the codebase compares them except for display.
- **Publish is not the only writer of `published*`.** Three out-of-band writers exist: `admin.updateDestination` writes draft *and* published in one shot ([admin.ts:373–413](../../convex/admin.ts)); `syncLinksDisplayName` patches `publishedDisplayName` on business rename (562–594); `createBusiness`/migrations insert destination rows with `published*` pre-filled (272–289). New services must not inherit this "two doors" ambiguity.
- **There is no history or rollback.** No history table exists; `discardDraft` is a one-way draft revert; once published, the previous published state is gone.

**Verdict.** The *contract* — the quartet `(draftRevision, publishedRevision, hasUnpublishedChanges, publishedAt)`, OCC via `expectedDraftRevision`, draft-writers bump revision + set the flag, publish validates and copies, public reads published only — is portable and is adopted for Venue configs (§2.4, C.2). The *implementation* is welded to `scanMeLinksConfigs` (table name, Links validations, destination loop) and is not extracted into runtime machinery; the contract is codified as a documented convention instead (§2.4). Memories needs no draft/published at all (guest content is not "published" by an editor).

### 1.e Auth and access boundaries

- Provider: password-only `@convex-dev/auth` ([convex/auth.ts:9–30](../../convex/auth.ts)); registration is closed — invitation or admin-setup only (79–81). `beforeSessionCreation` (95–125) gates sessions on membership or a claimable invitation.
- **Admin = env allowlist**, not a role column: `isAdminEmail` over `SCANME_ADMIN_EMAILS` ([convex/lib/access.ts:28–39](../../convex/lib/access.ts)); `requireAdmin` (49–53) has 24 call sites across `admin.ts`, `scanMeLinks.ts`, `activationRequests.ts`.
- **The authoritative boundary is the Convex function layer.** [proxy.ts](../../proxy.ts) only checks `isAuthenticated` for `/admin/*` (23–29) and redirects unauthenticated `/{slug}/editor` to the client panel (9–22, matcher `/^\/[^/]+\/editor\/?$/`); the client-side `AdminGuard` is cosmetic. `/{slug}/client-panel` has no middleware protection at all — by design, since the server functions enforce.
- Client access: `businessMemberships` (accessRole is the single literal `"viewer"`, [schema.ts:301](../../convex/schema.ts)), created via the invitation flow — token = `HMAC-SHA256(SCANME_INVITE_SECRET, invitationId)`, SHA-256 hash stored ([convex/invitationEmails.ts:55–60](../../convex/invitationEmails.ts)), accepted in [convex/lib/invitations.ts:34–87](../../convex/lib/invitations.ts). **Memberships are per-business, not per-service** — a new service automatically inherits the right audience.
- `serviceActivationRequests`: client-created ([convex/activationRequests.ts:11–71](../../convex/activationRequests.ts) — membership-gated, notably *not* requiring a `dynamicLinks` row), admin `setStatus` flips only the request; profile activation is a separate admin mutation, and the stored `serviceProfileId` is never read by any mutation. Activation and entitlement can drift; §2.3 closes this.
- Public surface inventory (all verified): `scanMeLinks.resolveAndRecord` / `recordClick` (unauthenticated **writes** deduped on client-supplied UUIDs — counters are inflatable by anyone POSTing fresh UUIDs), `redirects.resolveAndRecord` (legacy), `leads.create` (honeypot + dwell + dedupe), `clientPanel.publicLocation` (slug→name oracle), `invitations.getStatus` (token-gated PII), `admin.me`, `demo.seed` (env-key, non-timing-safe compare). No public function returns draft data.
- Unrelated to Convex auth: the marketing-home preview gate is an HMAC cookie checked in [app/page.tsx:88](../../app/page.tsx) via [lib/preview-access.ts](../../lib/preview-access.ts) (timing-safe compare), not in the proxy.

**Verdict.** Reusable as-is: the auth provider, admin allowlist, invitation→membership flow, and the "server functions are the boundary" model. Must be generalized: `requireEditorAccess` (lift to `lib/access.ts`, parameterize by allowed types), `requireBusinessAccessBySlug` (drop the `dynamicLinks` requirement — hard prerequisite), the activation-request service union, and the proxy's editor matcher for nested editors. Must be *learned from*: client-supplied idempotency ids are unacceptable for the new public endpoints — Memories exposes an unauthenticated **storage write**, where inflation is materially more expensive than fake scan counts (§2.6, §2.9).

### 1.f Redirects, scan tracking, and the routing surface

**The live scan pipeline is entirely client-driven.** [app/[slug]/page.tsx](../../app/%5Bslug%5D/page.tsx) is 14 lines and does no server resolution; it renders the client component [scan-redirect.tsx](../../app/%5Bslug%5D/scan-redirect.tsx), which POSTs to [app/api/scans/[slug]/route.ts](../../app/api/scans/%5Bslug%5D/route.ts) with a client-generated `crypto.randomUUID()` requestId (line 28) and navigates via `window.location.replace` (41). The route handler calls `api.scanMeLinks.resolveAndRecord`; every outcome returns HTTP 200 (missing/inactive included); **no server-side redirect exists anywhere in the repo**, no cookies are set, and there is no `not-found.tsx`. Clicks flow through [app/api/scanme-links/click/route.ts](../../app/api/scanme-links/click/route.ts) → `recordClick`. [convex/redirects.ts](../../convex/redirects.ts) is legacy and effectively dead: its only callers are its own tests; the live path never touches it.

**Tracking.** `resolveAndRecord` (728–885) records `serviceScanEvents`, mirrors into legacy `scanEvents`/`dailyScanCounts` for `google_review` (793–841), suppresses totals for bots (843), and records the page view **inside the same mutation** when resolution is `links` (846–853) — there is no separate beacon. Conversion = the first `recordClick` of a links session (933–948); CTR is derived, never stored. All daily rollups are maintained inline in the same transaction (`incrementServiceDaily`/`incrementDestinationDaily`, 495–552); [convex/lib/metrics.ts](../../convex/lib/metrics.ts) and [convex/lib/serviceMetrics.ts](../../convex/lib/serviceMetrics.ts) are read-only aggregators (with the Belgrade `dateKey` helper duplicated three times, and one-`.unique()`-per-day reads — 365 point queries for a 1-year range). Known asymmetries: the conversion rollup keys on `scannedAt` while the click rollup keys on `now` (931 vs 944); clicks are not bot-filtered (927–931).

**There are no crons and no Convex components.** [convex/convex.config.ts](../../convex/convex.config.ts) declares env vars only; [convex/http.ts](../../convex/http.ts) mounts auth routes only. Consequently there is no retention, compaction, or scheduled anything — Memories' retention requirement introduces the first crons (§2.9).

**Routing surface and collision analysis.** The full surface: `/`, `/[slug]`, `/[slug]/editor`, `/[slug]/client-panel(+/activate/[token])`, `/admin/*` (login, scanme-links(+/[businessId]/editor), google-reviews, page/venue/memories stubs), `/client-panel`, `/ponuda(+/pregled)`, `/preview-login`, `/dev/*` (prod-404), `POST /api/scans/[slug]`, `POST /api/scanme-links/click`, `/icon`. Facts that shape §2.7:

- The root dynamic segment is named `[slug]`; Next.js rejects a sibling `[business]` ("You cannot use different slug names for the same dynamic path" — `node_modules/next/dist/shared/lib/router/utils/sorted-routes.js`). New nested routes must live under `app/[slug]/venue/...`. `[slug]` already has static siblings (`editor/`, `client-panel/`), so `venue/` is structurally consistent, and a business slugged `"venue"` does **not** collide (different depth).
- The real collision surface is root static segments vs business slugs: `admin`, `api`, `client-panel`, `dev`, `ponuda`, `preview-login`, `icon` all shadow `/[slug]`, but `RESERVED_SLUGS` is only `{admin, api, icon}` ([convex/lib/validation.ts:3](../../convex/lib/validation.ts)). `m` and `r` currently **pass** `requireSlug` (109–120) and would be shadowed by the new root segments — they must be reserved, with a pre-flight collision scan (§2.11).
- The proxy's editor matcher matches exactly one segment before `/editor` and will not cover `/[slug]/venue/editor` ([proxy.ts:9–11](../../proxy.ts)).
- [next.config.ts](../../next.config.ts) is empty (no redirects/rewrites/headers/images config).

**Next.js 16.2.12 specifics** (verified against the bundled docs; paths relative to `node_modules/next/dist/docs/`):

| Fact | Doc |
|---|---|
| `middleware` is renamed **`proxy`**; the file is `proxy.ts`; the runtime is **Node.js only — edge is not supported** | `01-app/02-guides/upgrading/version-16.md` §"middleware to proxy"; `01-app/03-api-reference/03-file-conventions/proxy.md` |
| `params`/`searchParams`/`cookies()` are **Promise-only** (sync access removed) | `01-app/02-guides/upgrading/version-16.md` §Async Request APIs |
| Generated global types `PageProps<'/route'>` / `RouteContext<'/route'>` (already used in this repo) | `01-app/03-api-reference/03-file-conventions/dynamic-routes.md:115`; `.../route.md:105–121` |
| Route handlers are uncached by default; non-GET methods are never cached | `01-app/01-getting-started/15-route-handlers.md:51, 85` |
| `cacheComponents` is opt-in and OFF here → classic caching semantics; Turbopack is the default; `next lint` is removed | `01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`; `version-16.md` |

Server-side 302 responses from route handlers are fully available — there is simply no precedent in this repo, because the Links flow deliberately renders in place. The card resolver (§2.7) is the first server-side redirect.

### 1.g Summary table

| Area | Reusable as-is | Generalize | Stays product-specific |
|---|---|---|---|
| Design system | background union, shadow validator, capability/clamp pattern, variations | token compiler + namespace, block layer (new), font enum, validator↔type duplication | presets, iconStyle, option-two template + CSS |
| Palette | color science, MCU adapter, logo extraction | `deriveColors` role expansion, `resolveBackgroundContext` param type | `AccentTokens` legacy model |
| Editors | history, autosave, shell split, leaf widgets, real-markup preview | panel/selection registries per mode | the 2,673-line Links panels file |
| Services | `serviceProfiles`, `serviceSlugAliases`, `serviceBySlug` | `serviceType` union, type-guarded mutations, panel access, slug sync | `dynamicLinks` mirror, `googleReviewSlug` |
| Publish | the contract (OCC + quartet + published-only reads) | codify as convention; close out-of-band writers for new tables | `publishDraft` implementation |
| Auth | provider, admin allowlist, invitations, memberships | `requireEditorAccess` lift, panel-access decoupling, activation union | — |
| Tracking | event→daily-rollup pattern, `by_requestId` idempotency | server-generated requestIds for new endpoints; extract generic daily-rollup helper | legacy `scanEvents` mirror |

---

## 2. Target architecture

### 2.0 Constraints (fixed inputs)

The following were decided before this RFC and are treated as requirements: the URL scheme (`/[business]/venue`, `/[business]/venue/[event]`, `/[business]/venue/arhiva`, `/m/[code]`, `/m/[code]/moje`, `/m/[code]/galerija`, `/r/[cardCode]`; codes Crockford base32, 8 chars, excluding I L O U); the `/r/` card resolver as the only thing printed on cards; the HMAC cookie guest identity (HttpOnly, Secure, SameSite=Lax, Path=`/m/[code]`, 1 year, localStorage mirror; card=table, cookie=person; soft limit); the image pipeline (client decode/downscale/JPEG + sequential upload; server sharp EXIF-strip + dual watermark + AVIF/WebP/thumb; no AVIF/watermark on client); Convex file storage as the storage (a future CDN move is out of scope and shapes no decision here — §0.6 / §2.4 C.8); the billing port with stub and manual activation via `serviceActivationRequests`; i18n from day one with Serbian only. **No constraint was found to be unworkable against the codebase.** Two constraints required an implementation-level judgment call, recorded where they occur: sharp runs in a Next.js route handler rather than a Convex `"use node"` action (§2.8), and the one root-URL nuance is that Next.js forces the literal segment name `[slug]`, so "`/[business]/...`" is authored as `app/[slug]/venue/...` (§1.f) — the public URLs are unchanged.

### 2.1 Service registry and access generalization (prerequisites)

1. **Widen `serviceType`** ([convex/schema.ts:23–26](../../convex/schema.ts)) with `v.literal("scanme_venue")` and `v.literal("scanme_memories")`; export one shared `serviceTypeValidator` and reuse it in `requestedServiceValidator` ([convex/activationRequests.ts:6–9](../../convex/activationRequests.ts)) instead of the current duplication. Additive: existing rows validate unchanged; no index key changes.
2. **Decouple panel access.** Split `requireBusinessAccessBySlug` ([convex/lib/access.ts:55–91](../../convex/lib/access.ts)) into `requireBusinessAccess(ctx, businessId|slug)` — auth → business (status check) → admin-or-active-membership, **no `dynamicLinks` lookup** — and `requireGoogleReviewPanelBySlug` = the former plus the existing `selectPrimaryLink` lookup, preserving today's return shape for [convex/clientPanel.ts](../../convex/clientPanel.ts) callers. Behavior-preserving; guarded by the existing tests.
3. **Lift and parameterize editor access.** Move `requireEditorAccess` ([convex/scanMeLinks.ts:386–408](../../convex/scanMeLinks.ts)) to `convex/lib/access.ts` as `requireServiceEditorAccess(ctx, profile, allowedTypes)`; Links passes `["scanme_links"]`. `clientEditingEnabled` stays a per-profile flag, which is already the right granularity.
4. **New profiles, existing pattern.** A `scanme_venue` profile is addressed by route (`/[slug]/venue`), resolved by business slug + the static `venue` segment — **its `serviceProfiles.slug` is never resolved through `serviceBySlug`.** A `scanme_memories` profile needs no public slug at all (spaces are addressed by code). Both are created by a new admin mutation (not by widening `createBusiness`'s hardcoded two-profile block — [admin.ts:237–271](../../convex/admin.ts) stays untouched).

   **Venue-profile slug decision (fixes the ambiguity in the original draft).** The original draft said the venue profile "can share the business slug." That is **unsafe**: `serviceProfiles.by_slug` combined with `serviceBySlug`'s `.unique()` ([scanMeLinks.ts:357–371](../../convex/scanMeLinks.ts)) throws the moment two profiles carry the same slug — the Links profile already carries the bare business slug, so a venue profile sharing it would make every `serviceBySlug(businessSlug)` call throw. **Decision: the venue profile stores the derived value `${businessSlug}-venue`**, distinct from the Links profile's bare slug and from the `-google-review` review slug, and never emitted by any URL, so `serviceBySlug` never needs to (and never will) resolve it and `by_slug` stays unique-per-slug.

   **Consequences (and a flagged contradiction).** This decision *does* introduce a new **derived business slug**, which **contradicts** the earlier statement that "neither new product introduces a new derived business slug." That statement is hereby corrected. Therefore, once venue profiles exist:
   - `isBaseSlugAvailable` ([admin.ts:496–534](../../convex/admin.ts)) must also reject a base slug whose derived `${slug}-venue` is already taken, exactly as it already guards `${slug}-google-review`.
   - `applyBaseSlugSync` ([admin.ts:463–466](../../convex/admin.ts)) must re-derive and rewrite the venue profile's `-venue` slug on business rename, exactly as it rewrites the `-google-review` slug, preserving the old value via `serviceSlugAliases`. The two-profile sync tuple grows to three. Because **this task creates no venue profile**, `applyBaseSlugSync` is left untouched here; the growth lands with the venue provisioning mutation, and §6's flag is updated to say the day *has* come, not "for the day it does."
5. **`clientPanel.overview`** grows entries for the two new services next to its hardcoded two ([clientPanel.ts:101–119](../../convex/clientPanel.ts)); a registry structure is preferable but not required for correctness.

#### 2.1.6 Tenancy and the celebration entity

*This subsection supersedes any earlier notion of modelling a celebration as a "lightweight business".*

Memories is sold through two channels: a **recurring subscription** to a venue (café, club, hall), and a **one-off purchase** by the people celebrating — who may arrive directly from advertising, or be referred by a partner hall. **A celebration is not a business and must not be modelled as one at the product level.** A wedding is not a tenant that logs in and runs a dashboard; it is a product instance with a couple, a date, a channel it was sold through, and a commission owed to whoever sold it.

**Decision: `businesses` remains the tenant row.** It is what auth, memberships, contacts, invitations, cards, `mediaAssets`, entitlements and `memoriesSpaces` key on — and a celebration needs every one of those (an anonymous-guest space, an entitlement, media, a card). Rather than invent a second tenant concept, a celebration is provisioned as a `businesses` row tagged as such, and the *product* semantics live in a dedicated `celebrations` table. Add to `businesses`:

```ts
kind: v.optional(v.union(v.literal("business"), v.literal("celebration")))
```

Absent means `"business"`, so every existing row validates unchanged. A backfill migration is **specified but not run** here (following the [convex/migrations.ts](../../convex/migrations.ts) pattern):

```ts
// convex/migrations.ts — SPECIFIED, not executed in this task.
export const backfillBusinessKind = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.query("businesses").paginate({ cursor: args.cursor ?? null, numItems: 200 });
    for (const business of page.page) {
      if (business.kind === undefined) {
        await ctx.db.patch(business._id, { kind: "business" });
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.migrations.backfillBusinessKind, { cursor: page.continueCursor });
    }
    return { done: page.isDone };
  },
});
```

The backfill is optional (reads already default `undefined → "business"`); it exists only to make the field explicit for reporting queries. It is not a prerequisite for shipping the `kind` field.

**`businesses` is a tenant table whose name is legacy.** It began life meaning "a paying local business" and now also carries celebration tenants; the name no longer describes the contents. Celebrations are **never surfaced as "businesses" in any UI** — the host/admin surfaces filter on `kind` and label a celebration row as an event, never a business. Renaming the table to `tenants` (or splitting the concepts) is **deliberate deferred debt**: the rename would touch every one of the ~15 tables and dozens of functions that reference `v.id("businesses")`, for zero user-visible gain, and would collide head-on with the frozen Links render path and the golden harness (§2.11). The debt is recorded here so the next person understands the name is intentional, not an oversight.

The product entity `celebrations` and the `partnerships` table it depends on are **defined in §2.4 (C.15, C.16)**; the tables exist in `schema.ts`, and the celebration-provisioning mutation that writes them is built when Memories is built. `venueBusinessId` (where the celebration is *held*) and `referredByBusinessId` (who *sold* it) are deliberately distinct fields and must never be conflated: a celebration can be held at a venue that is not a partner, and sold by a partner that is not the venue.

**Provisioning a celebration tenant** must **not** go through `admin.createBusiness` ([admin.ts:166–313](../../convex/admin.ts)), which provisions a Links profile, a `google_review` `dynamicLink`, and the derived-slug machinery — none of it applicable to a celebration. The minimal path (specified here, implemented when Memories is built) is a single mutation that, in one transaction, creates:

1. a `businesses` row with `kind: "celebration"` (name = the celebration title; no `dynamicLinks`, no Links profile, no derived review slug);
2. a `celebrations` row (C.15) linked by `businessId`, carrying the acquisition channel and — when sold by a partner — `referredByBusinessId` + a snapshotted `referralCommissionPercent`;
3. a `scanme_memories` `serviceProfiles` row (no public slug — spaces are addressed by code);
4. one `memoriesSpaces` row in `one_off` mode (C.4), with its `windowStartAt`/`windowEndAt` around the event date.

### 2.2 The `events` backbone

**Topology decision: products attach TO events; `events` never references products.** `venueEventConfigs.eventId` is required (1:1); `memoriesSpaces.eventId` is `v.optional`. Consequences:

- Venue without Memories: event + config, no space.
- Memories without Venue: a space with `eventId: undefined` — recurring mode never needs an event, and a one_off celebration without a venue page keeps its window on the space itself.
- **Pairing later is `ctx.db.patch(spaceId, { eventId })`** — one field write, no migration, no backfill.
- The future invitation/RSVP product is one new table with an `eventId` column; `events` never changes. (This is why the alternative — `events` holding `venueConfigId`/`memoriesSpaceId` pointers — was rejected: every new product would be an `events` schema change.)
- Recurring "per-night" grouping never touches `events`: nights are `memoriesSessions` rows (§2.4 C.5). An event is an occasion with an identity (a concert, a wedding); a Tuesday at a kafana is a session.

**Lifecycle** — `draft → scheduled → live → ended → archived`:

- *draft → scheduled*: editor mutation; validates `startsAt < endsAt`, no overlap with another scheduled/live event of the business, and a published config revision; cancels any prior scheduled functions (`ctx.scheduler.cancel`), bumps `lifecycleRevision`, schedules `internal.venueEvents.goLive` at `startsAt` and `internal.venueEvents.endEvent` at `endsAt` (`ctx.scheduler.runAt`), storing both ids on the doc.
- *scheduled → live*, *live → ended*: scheduler-run internal mutations, idempotent — each no-ops unless `lifecycleRevision` matches the expectation it was scheduled with **and** the status is the expected predecessor. This is the `expectedDraftRevision` OCC idea ([scanMeLinks.ts:1661](../../convex/scanMeLinks.ts)) applied to time. `goLive` additionally asserts no other live event exists (`by_businessId_and_status`).
- *ended → archived*: manual owner action; takes the selected media list (writes `eventArchiveItems`) and sets `archivedAt`.
- **Wall-clock discipline**: public queries read only the materialized `status` — never `Date.now()` (per [convex/_generated/ai/guidelines.md](../../convex/_generated/ai/guidelines.md), "Do not read the wall clock inside a query"). A 15-minute reconcile cron sweeps `by_status_and_startsAt` / `by_status_and_endsAt` for flips missed by scheduler loss.
- "Duplicate the previous event's design": a mutation copies the source config's `published*` into the new config's `draft*` and stamps `duplicatedFromEventId`.

### 2.3 Entitlements and the billing port

**Shape: a dedicated `entitlements` table + a code-resident plan catalog.** Not a `serviceProfiles` extension, because (a) profiles carry high-churn counters and the guidelines say to keep stable config off high-churn docs; (b) the billing port must write entitlements without knowing product internals; (c) an entitlement may exist before the profile is activated.

The plan catalog lives in code — `convex/lib/plans.ts`:

```
PLAN_LIMITS = {
  scanme_memories: {
    basic:    { photosPerGuest: 3,  maxImageDimension: 2048, retentionDays: 30  },
    standard: { photosPerGuest: 5,  maxImageDimension: 2560, retentionDays: 90  },
    premium:  { photosPerGuest: 10, maxImageDimension: 4096, retentionDays: 365 },
  },
  scanme_venue: { basic: { allowedBlockKeys: [...] }, ... },
}
```

(The 3/5/10 quota tiers are the constraint; the retention values 30/90/365 days and per-tier max dimensions 2048/2560/4096 px are **confirmed defaults** — §0.7. The premium 4096 px replaces the earlier 2560 because 1600–2560 is too low for a wedding photo a couple keeps. Being code, tuning them is a deploy, not a migration.) A single helper is the only read path:

```
getEntitlement(ctx, businessId, product, spaceId?) →
  { planKey, limits: { ...PLAN_LIMITS[product][planKey], ...row.overrides }, status } | null
```

**Scope and resolution order (resolves §5 Q3).** `entitlements` gains `spaceId: v.optional(v.id("memoriesSpaces"))`. An entitlement with a `spaceId` is **space-scoped**; one without is **business-scoped**. `getEntitlement` resolves in this order:

1. if `spaceId` is given, an **active** space-scoped entitlement for that space **wins**;
2. otherwise the **active business-scoped** entitlement (`spaceId` unset);
3. otherwise `null`.

A new index `by_spaceId_and_status` serves step 1 alongside the existing `by_businessId_and_product` (step 2). With **celebration tenants** this mostly resolves naturally — one tenant, one space, so the business-scoped entitlement is the only one and space scoping is inert. Space scoping earns its keep for a **venue that holds a Memories subscription *and* buys a premium tier for one specific event**: the premium entitlement is written with that event's `spaceId` and wins only for that space, while the venue's other spaces keep resolving to the base subscription. Because reads pass the `spaceId` when they have one and omit it otherwise, no caller changes shape.

**Write paths.**

- *Manual (now)*: the client keeps using `activationRequests.create`. Admin approval becomes **one mutation** `admin.approveActivation({ requestId, planKey })` that, in a single transaction, (1) sets `serviceProfiles.status = "active"` (what `setServiceActive` does today, [scanMeLinks.ts:1739](../../convex/scanMeLinks.ts)), (2) upserts the entitlement with `source: "manual"`, (3) closes the request. Status and entitlement can no longer drift — fixing the audited gap where `setStatus` flips nothing (§1.e).
- *Billing (later)*: `convex/lib/billingPort.ts` defines `{ createCheckoutSession, verifyWebhook, mapToEntitlement }` with a stub implementation. When the Serbian provider is chosen, an `httpAction` in [convex/http.ts](../../convex/http.ts) receives the webhook → `verifyWebhook` → the same internal upsert (`internal.entitlements.apply({ businessId, product, planKey, validUntil, source: "billing", externalRef })`). **No schema change**: `source`, `externalRef`, `validUntil` exist from day one. Reads never touch the port, so entitlements are readable with zero provider installed — satisfying the constraint verbatim.
- *Expiry*: a daily cron sweeps `by_status_and_validUntil` (`active`, `validUntil <= now`) → `status: "expired"`. Enforcement checks `status === "active"` only.

### 2.4 New-table catalog

Conventions follow [convex/schema.ts](../../convex/schema.ts): literal-union statuses, `createdAt`/`updatedAt` as `v.number()`, child tables instead of unbounded arrays, index names listing all fields (`by_a_and_b`). Every index below is annotated with the query it serves. The **generalized draft/publish contract** (codified as documentation in `convex/lib/draftPublish.ts`, not runtime magic): every editable field appears as `draftF` + `publishedF` (`v.optional`); the quartet `hasUnpublishedChanges`/`draftRevision`/`publishedRevision`/`publishedAt` is present; draft writers bump `draftRevision` and set the flag; publish takes `expectedDraftRevision`, validates, copies, sets `publishedRevision = draftRevision` and clears the flag; public queries read `published*` exclusively; **publish is the only writer of `published*`** (the discipline the Links tables lack, §1.d). `scanMeLinksConfigs` is retro-documented as conforming — with zero changes to it.

#### C.1 `events`

```ts
events: defineTable({
  businessId: v.id("businesses"),
  slug: v.string(),                    // /[business]/venue/[event]; unique per business; "arhiva" reserved
  title: v.string(),
  status: v.union(
    v.literal("draft"), v.literal("scheduled"), v.literal("live"),
    v.literal("ended"), v.literal("archived"),
  ),
  startsAt: v.optional(v.number()),    // required to leave "draft" (enforced in mutation)
  endsAt: v.optional(v.number()),
  lifecycleRevision: v.number(),       // OCC guard for scheduled flips (§2.2)
  scheduledGoLiveId: v.optional(v.id("_scheduled_functions")),
  scheduledEndId: v.optional(v.id("_scheduled_functions")),
  duplicatedFromEventId: v.optional(v.id("events")),
  archivedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_businessId_and_slug` | resolve `/[business]/venue/[event]` (`.unique()`) |
| `by_businessId_and_status` | the single `live` event for `/[business]/venue`; admin/client tabs; single-live guard in `goLive` |
| `by_businessId_and_startsAt` | `/venue/arhiva` listing (`.order("desc")`, archived filter — bounded per business); upcoming strip |
| `by_status_and_startsAt` | reconcile cron: `scheduled` events with `startsAt <= now` that missed their flip |
| `by_status_and_endsAt` | reconcile cron: `live` events with `endsAt <= now` |

#### C.2 `venueEventConfigs` (draft/publish contract; blocks embedded)

```ts
venueEventConfigs: defineTable({
  eventId: v.id("events"),                    // 1:1
  venueProfileId: v.id("serviceProfiles"),    // the type:"scanme_venue" profile
  draftDisplayName: v.optional(v.string()),
  draftDesign: v.optional(venueDesignValidator),      // page-level tokens (§2.5)
  draftBlocks: v.optional(v.array(venueBlockValidator)), // ordered; cap 30 (mutation-enforced)
  draftLogoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  draftBackgroundImageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  draftBackgroundVideoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  publishedDisplayName: v.optional(v.string()),
  publishedDesign: v.optional(venueDesignValidator),
  publishedBlocks: v.optional(v.array(venueBlockValidator)),
  publishedLogoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  publishedBackgroundImageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  publishedBackgroundVideoStorageId: v.optional(v.union(v.id("_storage"), v.null())),
  hasUnpublishedChanges: v.boolean(),
  draftRevision: v.number(),
  publishedRevision: v.number(),
  publishedAt: v.optional(v.number()),
  updatedAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_eventId` | load config for an event page/editor (`.unique()`) |
| `by_venueProfileId` | "duplicate previous design": latest published config for this venue |

**Why blocks are an embedded array, not a child table** (the guidelines forbid *unbounded* arrays): blocks are hard-capped at 30 with per-block item caps (gallery ≤ 24, program ≤ 40, menu ≤ 60), worst case ≈ 240 KB for draft+published against the 1 MB doc limit, realistically ~20 KB. The array buys ordering-by-position (no order columns or fractional indexing), a publish that is **one OCC-guarded patch** (no per-row loop with partial states, unlike the destinations copy in `publishDraft`), and a one-document public read. Unbounded content (reservation submissions, guest photos) lives in separate tables.

#### C.3 `eventArchiveItems`

```ts
eventArchiveItems: defineTable({
  eventId: v.id("events"),
  mediaAssetId: v.id("mediaAssets"),
  sourcePhotoId: v.optional(v.id("memoriesPhotos")),  // set when picked from a paired space
  order: v.number(),
  createdAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_eventId_and_order` | render the archive gallery in order on `/venue/[event]` |
| `by_mediaAssetId` | retention/wipe cross-check: is this asset pinned by an archive? (guest wipe still wins — §2.10) |

#### C.4 `memoriesSpaces`

```ts
memoriesSpaces: defineTable({
  businessId: v.id("businesses"),
  memoriesProfileId: v.id("serviceProfiles"),   // type:"scanme_memories"
  code: v.string(),                             // Crockford base32, 8 chars, no I L O U → /m/[code]
  name: v.string(),
  mode: v.union(v.literal("recurring"), v.literal("one_off")),
  eventId: v.optional(v.id("events")),          // the pairing hook (§2.2)
  status: v.union(v.literal("active"), v.literal("paused"), v.literal("closed"), v.literal("archived")),
  windowStartAt: v.optional(v.number()),        // one_off only
  windowEndAt: v.optional(v.number()),
  nightCutoffHour: v.optional(v.number()),      // recurring; default 6 → a 01:00 photo belongs to yesterday's night
  defaultVisibility: v.union(v.literal("everyone"), v.literal("host_only")),
  guestVisibilityChoice: v.boolean(),           // may guests flip per-photo visibility
  publicGalleryEnabled: v.boolean(),            // default false; gates /m/[code]/galerija (§2.4 C.4)
  wallEnabled: v.boolean(),                      // default false; gates the planned live wall /zid/[code]
  totalPhotos: v.number(),                      // stats rollups only — never used for enforcement
  totalGuests: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_code` | resolve `/m/[code]` (`.unique()`) |
| `by_businessId_and_status` | host panel space list |
| `by_memoriesProfileId` | service-level admin view |
| `by_eventId` | archive photo picker: the space paired to an event |

Code generation: `convex/lib/codes.ts` — alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, 8 chars from `crypto.getRandomValues`, insert-retry on `by_code` collision. Shared with `cards.cardCode`.

**Host-controlled public surfaces (fixes C.4's earlier ambiguity about when guest photos become public).** Both `publicGalleryEnabled` and `wallEnabled` default `false` — a space is private to its guests and host until the host opts in.

- `/m/[code]/galerija` (the public gallery, §2.7) returns **404 unless `publicGalleryEnabled` is `true`**. The gallery query already filters to `status === "ready" && visibility === "everyone"` inside the server (§2.9); this flag is the additional host on/off switch, so `host_only` photos and un-opted spaces never expose a public page at all.
- The **live wall** (`/zid/[code]`) is a **planned** surface, not designed here: it reads `status === "ready" && visibility === "everyone"` for the **current session only**, gated on `wallEnabled`. It is called out solely so the gating field exists in the schema from day one; no wall layout, refresh model, or projection UX is specified in this RFC.

#### C.5 `memoriesSessions` (nights)

```ts
memoriesSessions: defineTable({
  spaceId: v.id("memoriesSpaces"),
  dateKey: v.string(),                 // "YYYY-MM-DD" Belgrade, cutoff-shifted (reuses the serviceMetrics dateKey logic)
  status: v.union(v.literal("open"), v.literal("closed")),
  openedAt: v.number(),
  closedAt: v.optional(v.number()),
  scheduledCloseId: v.optional(v.id("_scheduled_functions")),
  photoCount: v.number(),
  guestCount: v.number(),
  updatedAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_spaceId_and_dateKey` | get-or-create tonight's session; host night list (dateKey sorts lexicographically, `.order("desc")`) |
| `by_status_and_openedAt` | reconcile cron: close stale open sessions |

*Recurring*: the session is lazily get-or-created by the first upload reservation of the night (the mutation computes the cutoff-shifted dateKey from `Date.now()` — legal in mutations); creation schedules `internal.memories.closeSession` at the next cutoff, with the cron as backup. **This is per-night grouping with zero Venue involvement.** *One_off*: exactly one session, created at activation, closed by the scheduler at `windowEndAt`. Photos therefore always hang off a session — one uniform shape for galleries, quota, and stats.

#### C.6 `memoriesGuests`

```ts
memoriesGuests: defineTable({
  spaceId: v.id("memoriesSpaces"),
  guestKey: v.string(),                // 256-bit random, base64url; bearer capability (§2.6)
  cardId: v.optional(v.id("cards")),   // TABLE attribution; the cookie is the PERSON
  nickname: v.optional(v.string()),
  consentVersion: v.optional(v.string()),  // consent text version accepted at first upload (§2.10)
  consentAt: v.optional(v.number()),
  photoCount: v.number(),
  firstSeenAt: v.number(),
  lastSeenAt: v.number(),
  updatedAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_spaceId_and_guestKey` | every guest-authenticated call (`.unique()`) |
| `by_cardId` | per-table (per-card) stats for the host |

#### C.7 `memoriesPhotos`

```ts
memoriesPhotos: defineTable({
  spaceId: v.id("memoriesSpaces"),
  sessionId: v.id("memoriesSessions"),
  guestId: v.id("memoriesGuests"),
  cardId: v.optional(v.id("cards")),           // denormalized at upload: table stats survive re-cookieing
  mediaAssetId: v.optional(v.id("mediaAssets")), // absent while "reserved"
  visibility: v.union(v.literal("everyone"), v.literal("host_only")),
  status: v.union(
    v.literal("reserved"),     // quota slot taken, client uploading
    v.literal("processing"),   // original stored, pipeline running
    v.literal("ready"),
    v.literal("hidden"),       // host moderation (reversible)
    v.literal("deleted"),      // tombstone; purge cron removes blobs then the doc
  ),
  originalStorageId: v.optional(v.id("_storage")),  // deleted after processing
  deletedReason: v.optional(v.union(
    v.literal("guest"), v.literal("host"), v.literal("admin"),
    v.literal("retention"), v.literal("gdpr_wipe"),
  )),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_sessionId_and_status` | public `/m/[code]/galerija` (`ready`, then `visibility === "everyone"` filter — bounded per night); host night gallery |
| `by_sessionId_and_guestId` | `/m/[code]/moje` **and** the quota count (§2.9) |
| `by_guestId` | guest GDPR wipe across sessions |
| `by_spaceId_and_createdAt` | retention sweep range; host "all photos" export |
| `by_status_and_updatedAt` | purge cron: `deleted` tombstones + stale `reserved`/`processing` rows |

#### C.8 `mediaAssets`

```ts
mediaAssets: defineTable({
  businessId: v.id("businesses"),
  kind: v.literal("image"),            // widen to v.union(image, video) later — additive
  provider: v.literal("convex"),       // Convex storage IS the storage (§0.6); field kept for accounting/hygiene
  variants: v.object({                 // bounded object — the variant set is fixed
    avif:  v.object({ ref: v.string(), width: v.number(), height: v.number(), bytes: v.number() }),
    webp:  v.object({ ref: v.string(), width: v.number(), height: v.number(), bytes: v.number() }),
    thumb: v.object({ ref: v.string(), width: v.number(), height: v.number(), bytes: v.number() }),
  }),
  status: v.union(v.literal("ready"), v.literal("purged")),
  createdAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_businessId_and_createdAt` | business offboarding cascade; storage accounting |

**Convex file storage is the storage, full stop (resolves §5 Q10).** There is no R2/Cloudflare migration plan, no migration tooling, and no "swap the adapter later" sequencing — there are no clients, no data, and therefore no migration to plan for. A future CDN move is explicitly **out of scope** for this RFC and must not shape any design decision in it. `variants.*.ref` is a serialized Convex `Id<"_storage">`. The `provider` field is retained (value always `"convex"` today) purely for storage accounting and so a hypothetical future move would be an additive literal rather than a schema change — it is **not** a provider-abstraction hook and no second provider is designed.

A thin `convex/lib/storage.ts` wrapper exposes `put(blob) → ref`, `getUrl(ref)`, `delete(ref)` — justified on **code hygiene only**: storage calls otherwise scatter across the upload pipeline, gallery queries, export, the purge cron, and the archive paths, and centralizing them keeps that one concern in one file. It is **not** a provider abstraction, carries no config switch, and has no second implementation. Video later = widening `kind` and adding variant entries — additive. Serving uses `<picture>` with the AVIF source, WebP fallback (iOS 15 and older), and the thumb for grid views.

#### C.9 `cards` + `cardTargets` (the `/r/[cardCode]` resolver)

```ts
cards: defineTable({
  businessId: v.id("businesses"),
  cardCode: v.string(),                // Crockford base32, 8 chars
  label: v.string(),                   // "Sto 4"
  status: v.union(v.literal("active"), v.literal("disabled")),
  currentTargetId: v.optional(v.id("cardTargets")),
  totalScans: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

cardTargets: defineTable({             // immutable rows = retarget audit trail + rollback
  cardId: v.id("cards"),
  kind: v.union(
    v.literal("memories_space"),  // set guest cookie → 302 /m/[code]
    v.literal("venue"),           // 302 /[business]/venue
    v.literal("event"),           // 302 /[business]/venue/[event]
    v.literal("service_page"),    // 302 /[serviceProfile slug]
    v.literal("url"),             // external; isSafePublicDestination-validated
  ),
  spaceId: v.optional(v.id("memoriesSpaces")),
  eventId: v.optional(v.id("events")),
  serviceProfileId: v.optional(v.id("serviceProfiles")),
  url: v.optional(v.string()),
  createdByUserId: v.id("users"),
  createdAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `cards.by_cardCode` | the `/r/[cardCode]` resolver (`.unique()`) |
| `cards.by_businessId` | host/admin card manager |
| `cardTargets.by_cardId` | retarget history view |

Retargeting = insert a new `cardTargets` row + patch `cards.currentTargetId`. Printed cards never change — the constraint's re-targetability without reprinting, with an audit trail for free.

#### C.10 `cardScanEvents` + `dailyCardMetrics`

```ts
cardScanEvents: defineTable({
  cardId: v.id("cards"),
  requestId: v.string(),               // SERVER-generated in the route handler — never client-supplied
  occurredAt: v.number(),
  targetKind: /* same union as cardTargets.kind */,
  deviceCategory: v.optional(v.union(
    v.literal("mobile"), v.literal("tablet"), v.literal("desktop"),
    v.literal("bot"), v.literal("unknown"),
  )),
})

dailyCardMetrics: defineTable({
  cardId: v.id("cards"),
  dateKey: v.string(),
  scans: v.number(),
  updatedAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `cardScanEvents.by_cardId_and_occurredAt` | per-table scan history |
| `cardScanEvents.by_requestId` | idempotent replay guard (existing pattern, [schema.ts:224](../../convex/schema.ts)) |
| `dailyCardMetrics.by_cardId_and_dateKey` | host per-table daily chart |

The rollup is maintained inline in the same mutation. Rather than duplicating the increment logic a third time, extract `incrementServiceDaily`/`incrementDestinationDaily` ([scanMeLinks.ts:495–552](../../convex/scanMeLinks.ts)) into a generic `incrementDailyRollup` in [convex/lib/serviceMetrics.ts](../../convex/lib/serviceMetrics.ts) — which also de-duplicates the thrice-copied Belgrade `dateKey` helper (§1.f).

#### C.11 `quotaAdjustments` (admin raise/reset)

```ts
quotaAdjustments: defineTable({
  spaceId: v.id("memoriesSpaces"),
  sessionId: v.optional(v.id("memoriesSessions")),  // absent = all sessions of the space
  guestId: v.optional(v.id("memoriesGuests")),      // absent = every guest in scope
  extraPhotos: v.number(),                          // additive grant
  reason: v.optional(v.string()),
  createdByUserId: v.id("users"),
  createdAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_spaceId_and_createdAt` | enforcement read (`.take(50)`, scope-filtered in code — rows are rare) |
| `by_guestId` | guest GDPR wipe |

Additive-grant-only keeps enforcement pure arithmetic: `effectiveLimit = plan.photosPerGuest + Σ matching grants`. Because quota is an index-count of live photos (§2.9), deletions refund automatically, and a "reset" is a grant equal to what the guest has used.

#### C.12 `photoReports` (moderation / takedown intake)

```ts
photoReports: defineTable({
  photoId: v.id("memoriesPhotos"),
  spaceId: v.id("memoriesSpaces"),
  reporterKind: v.union(v.literal("guest"), v.literal("host"), v.literal("admin"), v.literal("public")),
  reporterGuestId: v.optional(v.id("memoriesGuests")),
  reason: v.union(v.literal("inappropriate"), v.literal("privacy"), v.literal("copyright"), v.literal("other")),
  note: v.optional(v.string()),
  status: v.union(v.literal("open"), v.literal("actioned"), v.literal("dismissed")),
  resolvedByUserId: v.optional(v.id("users")),
  resolvedAt: v.optional(v.number()),
  createdAt: v.number(),
})
```

| Index | Query served |
|---|---|
| `by_photoId` | dedupe + photo detail |
| `by_status_and_createdAt` | admin/host moderation queue |

#### C.13 `entitlements` — see §2.3

Carries `businessId`, `product` (serviceType), `planKey`, `spaceId: v.optional(v.id("memoriesSpaces"))` (present = space-scoped; absent = business-scoped, §2.3), `status`, `overrides`, `source` (`manual | billing`), `externalRef`, `validUntil`, timestamps.

Indexes: `by_businessId_and_product` (business-scoped enforcement read, `.unique()`), `by_spaceId_and_status` (space-scoped resolution — step 1 of `getEntitlement`), `by_status_and_validUntil` (daily expiry cron).

#### C.14 `venueReservations` (reservation-block submissions)

Child table keyed by `eventId` (`by_eventId_and_createdAt` — host list, newest first), storing name/party-size/note per the block's field config, rate-limited on write. Kept out of the config doc so submissions can grow unbounded.

#### C.15 `celebrations`

*See §2.1.6. A celebration is a product instance, not a tenant. Its tenant is a `businesses` row with `kind: "celebration"`; this row carries the celebration's product semantics.*

```ts
celebrations: defineTable({
  businessId: v.id("businesses"),            // the tenant row, kind === "celebration"
  kind: v.union(
    v.literal("svadba"), v.literal("rodjendan"), v.literal("krstenje"),
    v.literal("veridba"), v.literal("ispracaj"), v.literal("maturska"),
    v.literal("godisnjica"), v.literal("other"),
  ),
  title: v.string(),                         // e.g. "Jovana i Marko"
  celebrantNames: v.optional(v.string()),
  eventDate: v.number(),
  venueName: v.optional(v.string()),         // free text — where it happens, partner or not
  venueBusinessId: v.optional(v.id("businesses")),   // set only when that venue is on our platform
  acquisitionChannel: v.union(
    v.literal("direct"), v.literal("partner"), v.literal("ads"), v.literal("other"),
  ),
  referredByBusinessId: v.optional(v.id("businesses")),   // WHO SOLD IT
  referralCommissionPercent: v.optional(v.number()),      // snapshotted at sale time
  contactName: v.string(),
  contactPhone: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  status: v.union(
    v.literal("lead"), v.literal("booked"), v.literal("active"),
    v.literal("completed"), v.literal("archived"),
  ),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

`venueBusinessId` (**held at**) and `referredByBusinessId` (**sold by**) are deliberately distinct and must never be conflated (§2.1.6): a celebration can be held at a non-partner venue and sold by a partner that is not the venue. `referralCommissionPercent` is **snapshotted at sale time** (copied from the partnership below) so later renegotiation never rewrites past commissions.

| Index | Query served |
|---|---|
| `by_businessId` | resolve a celebration from its tenant row (`.unique()`) |
| `by_referredByBusinessId_and_status` | **the partner's own dashboard** — "celebrations we referred, and what is owed" (commission = `referralCommissionPercent` × sale, summed over `status` in {booked, active, completed}) |
| `by_status_and_eventDate` | **operations calendar** of upcoming celebrations across all channels (filter to booked/active, order by `eventDate`) |
| `by_venueBusinessId_and_eventDate` | **a venue's view** of celebrations happening at its location, chronological |

#### C.16 `partnerships`

*The standing agreement with a partner (typically a hall that refers couples). The commission **percent is snapshotted onto each `celebrations` row at sale time** (`referralCommissionPercent`), so renegotiating a partnership's terms never rewrites the commission history of celebrations already sold — the partnership row is the current terms, the celebration row is the terms-as-sold.*

```ts
partnerships: defineTable({
  partnerBusinessId: v.id("businesses"),
  status: v.union(v.literal("active"), v.literal("paused"), v.literal("ended")),
  commissionPercent: v.number(),
  productScope: v.array(serviceTypeValidator),   // which products this partner may refer
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  notes: v.optional(v.string()),
})
```

| Index | Query served |
|---|---|
| `by_partnerBusinessId_and_status` | the partner's current terms (`.unique()` on the active row); admin partner list |
| `by_status_and_startedAt` | admin: all active partnerships, newest first |

### 2.5 The design engine, the Venue block system, and editor modes

**Governing decision: Links is never retrofitted into blocks.** The byte-identical requirement (§2.11) is satisfiable only *by construction*: any migration of `scanMeLinksConfigs` fields into a block array would force edits to `publicLinksView`, `normalizeDesignForPreset`, and the option-two render path — each a byte-diff risk multiplied across 15 presets × 77 CSS selectors. Links keeps its fixed shape forever; the engine is a **sibling** that Venue consumes.

**Module layout:**

```
lib/design-engine/
  tokens.ts        NEW  createTokenCompiler(prefix) → prefix-parameterized CSS-var compiler
  shadows.ts       NEW  shadowCss/logoShadowCss — LIFTED from option-two-template.tsx:200–248, then re-imported there
  background.ts    NEW  backgroundPresentation over the V2 background union — LIFTED from option-two-template.tsx:141–218, then re-imported there
  capabilities.ts  NEW  generic Capabilities<TDesign> + clampDesign(), generalizing the
                        SCANME_LINKS_PRESET_CAPABILITIES + normalizeDesignForPreset pattern
  typography.ts    NEW  the 12-font enum as a single exported const + font stacks + typography type
  palette.ts       NEW  deriveRoleColors(roleList, palette) — deriveColors (lib/scanme-palette.ts:249)
                        parameterized over a role list; re-exports scanme-color-science / scanme-material-color

convex/lib/designEngineValidators.ts  NEW  re-exports scanMeDesignV2BackgroundValidator (already exported,
                                           scanMeDesignValidators.ts:175); defines shadow + typography
                                           validators independently (same shape) so the Links validator
                                           file needs ZERO edits
convex/lib/venueValidators.ts         NEW  venueDesignValidator + venueBlockValidator
lib/venue-blocks.ts                   NEW  pure block types/defaults/clamps, importable from convex/
                                           (precedent: convex/scanMeLinks.ts imports lib/scanme-links-design.ts)
components/venue/blocks/registry.tsx  NEW  React registry: { type, defaults, clamp, tokens, Render, EditorPanel, icon, label }
components/venue/venue-template.tsx   NEW  the Venue template, --venue-* namespace, own module CSS
```

**Deliberate composition rule:** `venueDesignValidator` does **not** compose `scanMeDesignValidator` — the audit showed `presetKey`/`iconStyle` are Links-hardcoded 15-member unions (§1.a). Venue reuses the background union by re-export (one source of truth, zero edits to the Links file), defines identical-shape shadow/typography validators, and gets its own preset/capability catalog (`VENUE_PRESET_CAPABILITIES`) built on the generic engine types.

**Lift, do not copy (revised).** `backgroundPresentation` and `shadowCss` are **pure functions** — they take the V2 background/shadow union and return CSS, with no reference to Links state, DOM, or module scope. The earlier plan copied them into the engine and *pinned* both copies to a golden fixture, accepting drift risk (old risk #4). That trade is unnecessary: because they are pure, moving them into `lib/design-engine/{background,shadows}.ts` and importing them **back** into the option-two template is a **provable no-op** — the option-two template calls the same function, now from a new module, producing byte-identical output that the §2.11 golden harness verifies directly. So the plan is a **genuine lift, not a copy**: one source of truth, no fixture-pinning, no cross-referencing comments to keep in sync.

**Sequencing (strict).** The lift edits `option-two-template.tsx` (swapping two local function definitions for two imports), so it is sequenced **strictly after the §2.11 golden harness is green**, and lands as **its own isolated commit** whose entire diff is "define elsewhere, import here" with zero behavioral change. The harness — DOM + computed-style diff against goldens captured on `main` — is the gate: the commit merges only if the diff is empty. This is why it cannot be bundled with any other engine work.

**New residual risk (honest).** The lift *does* touch the frozen Links render path (one file, mechanically), whereas copy-and-pin touched nothing on the Links side. The residual risk is therefore no longer "the two copies silently diverge" (eliminated — there is one copy) but "the mechanical extraction commit is not actually behavior-preserving." That risk is bounded to a single reviewable commit and caught by the golden harness before merge; it is strictly smaller than perpetual drift between two live copies. Risk #4 is downgraded accordingly.

**The block schema.** `venueBlockValidator = v.union(...)` of `v.object({ type: v.literal(x), base: blockBaseValidator, props: v.object({...}) })`. The shared base — the per-block property set the task requires (size, radius, shadow, border, spacing, alignment, typography, color, animation, responsive visibility):

```ts
const blockBaseValidator = v.object({
  id: v.string(),                      // stable uuid — selection, history grouping, React keys
  visible: v.boolean(),                // soft-hide without delete
  responsive: v.optional(v.object({ desktop: v.boolean(), mobile: v.boolean() })),
  size: v.optional(v.union(v.literal("full"), v.literal("wide"), v.literal("narrow"))),
  alignment: v.optional(v.union(v.literal("left"), v.literal("center"), v.literal("right"))),
  spacing: v.optional(v.object({ top: v.number(), bottom: v.number() })),   // px, clamped
  radius: v.optional(v.number()),
  border: v.optional(v.object({ width: v.number(), color: v.string() })),
  shadow: v.optional(designShadowValidator),
  surface: v.optional(v.union(v.literal("none"), v.literal("card"),
    v.object({ kind: v.literal("custom"), color: v.string() }))),
  colorOverride: v.optional(v.object({
    title: v.optional(v.string()), body: v.optional(v.string()), accent: v.optional(v.string()),
  })),
  typographyOverride: v.optional(v.object({
    fontKey: v.optional(designFontKeyValidator), headingWeight: v.optional(weightValidator),
    bodyWeight: v.optional(weightValidator), scale: v.optional(scaleValidator),
  })),
  animation: v.optional(v.union(v.literal("none"), v.literal("fade-up"), v.literal("reveal"))),
});
```

Representative payloads (the rest follow the same pattern):

```ts
// countdown
props: v.object({
  target: v.union(v.literal("eventStart"), v.object({ kind: v.literal("custom"), timestamp: v.number() })),
  units: v.object({ days: v.boolean(), hours: v.boolean(), minutes: v.boolean(), seconds: v.boolean() }),
  style: v.union(v.literal("digits"), v.literal("cards"), v.literal("minimal")),
  completedBehavior: v.union(v.literal("hide"), v.literal("message")),
  completedMessage: v.optional(v.string()),
})

// programTimeline
props: v.object({
  heading: v.optional(v.string()),
  layout: v.union(v.literal("timeline"), v.literal("list"), v.literal("grid")),
  showTimes: v.boolean(),
  items: v.array(v.object({            // ≤ 40, mutation-enforced
    id: v.string(), startsAt: v.optional(v.number()),
    title: v.string(), subtitle: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
  })),
})

// gallery
props: v.object({
  layout: v.union(v.literal("grid"), v.literal("masonry"), v.literal("carousel")),
  columns: v.number(),                 // clamped 1–4
  gap: v.number(),
  aspect: v.union(v.literal("original"), v.literal("square"), v.literal("landscape")),
  lightbox: v.boolean(),
  items: v.array(v.object({            // ≤ 24
    id: v.string(), storageId: v.id("_storage"),
    alt: v.optional(v.string()), caption: v.optional(v.string()),
  })),
})
```

Remaining block types: `eventDateTime` (start/end, venue name/address, Google-Calendar link + generated `.ics` toggles — the add-to-calendar constraint), `map` (address or lat/lng, zoom, pin label, static vs embed), `performerCards`, `menu` (sections → items, currency), `reservation` (field config, capacity, deadline; submissions in `venueReservations`), `share` (channels, prefilled message), `pastEvents` (auto-sourced from archived events), plus `richText` and `spacer` utilities. Every block type's `defaults` and `clamp` live in pure `lib/venue-blocks.ts` so `convex/venue.ts` normalizes on write exactly the way `normalizeDesignForPreset` does for Links today.

**Tokens.** `createTokenCompiler("venue")` compiles page-level design to `--venue-page/-surface/-title/-body/-accent/…` on the template root (structurally parallel to `designStyle`'s output). Each block wrapper re-declares the same page custom properties locally for its overrides — CSS cascade scoping does the inheritance — plus `--venue-block-radius/-shadow/-spacing-*` for base numerics. **Links does not adopt the compiler in this RFC**; `designStyle` stays byte-frozen (a future Links adoption is a separate decision gated on the §2.11 harness).

**Editor modes: parameterize the chrome, don't fork it.** The editor is *not* under the byte-identical constraint (only public pages are), so a mechanical refactor of the shell is acceptable:

```ts
type EditorMode<TDoc, TPanelId extends string, TSelection> = {
  panelIds: readonly TPanelId[];        // replaces the closed EDITOR_PANEL_IDS union
  panelCopy: Record<TPanelId, PanelCopy>;
  PanelContent: ComponentType<PanelContentProps<TDoc, TPanelId, TSelection>>;
  Preview: ComponentType<PreviewProps<TDoc, TSelection>>;
  hashDocument(doc: TDoc): string;      // autosave dirty check
  persist(doc: TDoc): Promise<void>;    // mode-owned Convex mutations
};
```

`ScanMeLinksEditorScreen` becomes a thin wrapper passing `linksMode` — literally the existing `EDITOR_PANEL_IDS`, `panelCopy`, `EditorPanelContent`, and the real preview bundled up. `useEditorHistory<T>` needs zero changes. Selection is a mode type parameter: Links instantiates `{ kind: "destination"; id } | null`; Venue instantiates `{ kind: "block"; id: string } | { kind: "page" } | null`. **The honest call on the 2,673-line panels file: it is not split.** It becomes `linksMode.PanelContent` verbatim; the four leaf widgets are copied into `components/design-editor/fields.tsx` (Links keeps its private copies — consolidation is deferred, deliberately). Venue panels are new and schema-driven from day one: block selection dispatches to `registry[block.type].EditorPanel`, composing the shared field widgets. Venue panel ids: `["blocks", "event", "style", "background", "text", "color", "settings", "analytics", "help"]` — "blocks" is the palette (add/reorder/duplicate/delete); the preview renders the real `VenueTemplate` in the same device frame with a dnd-kit sortable overlay per block, mirroring the destinations pattern. This is the "links mode vs venue mode block palettes" switch the task requires: the palette is the mode's `panelIds` + the block registry, selected by which `EditorMode` the shell is mounted with.

**Amendment (TASK-06, 2026-08-25): editor-shell unification is deferred.** The `EditorMode` parameterization above is **not** built while the ScanMe Links freeze holds. The reason is honest and structural: the §2.11 golden harness covers the **public render path only**, so an "invisible" refactor of the live Links editor shell has no automated proof of being a no-op — exactly the gap risk #1 names. Until that proof exists, Venue gets a **standalone editor** with its own history, autosave loop, and panel shell, duplicating the Links editor chrome. This duplication is deliberate, recorded debt, not an oversight. Unifying the two shells becomes its own task later, gated on the editor E2E smoke test that risk #1 already prescribes (load → edit → undo → autosave settle → publish → public page unchanged) running before and after the mechanical shell commit. The "Lift, do not copy" plan above is unaffected: the lift concerns the public render path, which the harness does cover.

### 2.6 Guest identity

Per the constraint: the card identifies the **table**, the cookie identifies the **person**; quota is per person, statistics per table; the quota is a soft limit, admin-adjustable, and explicitly not a security boundary; no SMS, email, accounts, or fingerprinting.

- The cookie is set by a **Next.js route handler** — a hard requirement, not a preference: HttpOnly cookies cannot be set by client JS, and the Convex client cannot set cookies on the app's domain at all.
- Value: `base64url(guestKey) + "." + base64url(HMAC-SHA256(guestKey + ":" + spaceCode, SCANME_GUEST_SECRET))`; attributes exactly per constraint: `HttpOnly; Secure; SameSite=Lax; Path=/m/[code]; Max-Age=31536000`.
- `guestKey` is 256-bit random → **possession is the capability**. Convex public functions accept `{ code, guestKey }` and look up `memoriesGuests.by_spaceId_and_guestKey`. The HMAC is verified at the Next layer (integrity + scope binding); Convex queries stay deterministic and cacheable with no crypto.
- The localStorage mirror (recovery per constraint) is written client-side; recovery re-POSTs the mirrored value to `/api/m/[code]/restore`, which re-validates the HMAC and re-sets the cookie. A guest who loses both simply becomes a new guest — acceptable by design.
- Forging a *specific other guest's* access requires their key. Minting *new* guests is intentionally cheap (that is what "soft limit" means) and is throttled by the rate limiter (§2.9).

### 2.7 Routing and the card resolver

```
app/[slug]/venue/page.tsx              server — the live event (printed-card target)
app/[slug]/venue/[event]/page.tsx      server — a specific event (sharing, archive)
app/[slug]/venue/arhiva/page.tsx       server — archived-events list
app/[slug]/venue/editor/page.tsx       server shell → client VenueEditorScreen
app/[slug]/venue/not-found.tsx         segment 404 (copy from the i18n dictionary)
app/m/[code]/page.tsx                  guest landing (server shell + client upload UI)
app/m/[code]/moje/page.tsx             guest's own photos (requires a valid guest cookie)
app/m/[code]/galerija/page.tsx         public gallery — 404 unless space.publicGalleryEnabled (§2.4 C.4)
app/r/[cardCode]/route.ts              GET route handler: lookup → Set-Cookie → 302
app/r/nevazeca/page.tsx                "card not active" page (static sibling wins over [cardCode])
app/api/m/[code]/process/route.ts      image pipeline (§2.8)
app/api/m/[code]/restore/route.ts      cookie recovery (§2.6)
```

The public URL scheme is exactly the constraint's; the only authoring nuance is that Next.js forces the existing `[slug]` segment name (§1.f). Venue pages are async server components: `const { slug } = await params` (Promise-only params), `fetchQuery(api.venue.publicVenueView, ...)`, `null → notFound()`, `export const dynamic = "force-dynamic"` matching [app/[slug]/page.tsx:4](../../app/%5Bslug%5D/page.tsx). Interactive blocks (countdown ticking, lightbox, reservation form) are client leaf components inside the server-rendered template.

**`/r/[cardCode]` — a GET route handler with a server-side 302.** The constraint mandates the 302; the codebase justifies the departure from the existing client-side scan pattern on three additional grounds: (a) the HttpOnly guest cookie can only ride a server response; (b) `Set-Cookie` on the redirect means `/m/[code]` arrives already authenticated with a **clean URL** — no card code in the address bar or referrers, per the constraint; (c) a printed-card tap should not depend on JS. Handler flow:

1. `export const dynamic = "force-dynamic"`; `Cache-Control: no-store` on every response (GET handlers can otherwise be cached — §1.f).
2. Generate `requestId = crypto.randomUUID()` **server-side** — closing, for all new endpoints, the client-supplied-UUID inflation hole audited in §1.e.
3. `ConvexHttpClient.mutation(api.cards.resolveAndRecord, { cardCode, requestId, deviceCategory })` — resolves `cards.by_cardCode` → `currentTargetId`, records `cardScanEvents` + `dailyCardMetrics` (idempotent on `by_requestId`), rate-limited per IP.
4. Unknown/disabled card → `302 /r/nevazeca`. `kind: "venue"` → `302 /[slug]/venue`. `kind: "memories_space"` → get-or-create the guest (attributing `memoriesGuests.cardId` — the table), set the HMAC cookie, `302 /m/[code]`. Other kinds → plain 302 (external `url` targets pass `isSafePublicDestination`, [convex/lib/validation.ts:31](../../convex/lib/validation.ts)).

**proxy.ts**: add `createRouteMatcher(/^\/[^/]+\/venue\/editor\/?$/)` with the same unauthenticated→`/${slug}/client-panel` redirect as the existing Links branch; existing matchers untouched (the new regex cannot match `/{slug}` or `/{slug}/editor`). `/m` and `/r` need no proxy branch — their protection is the cookie/capability model, enforced in functions. **`RESERVED_SLUGS`**: add `"m"` and `"r"` ([convex/lib/validation.ts:3](../../convex/lib/validation.ts)); `"venue"` needs no reservation (different depth); reserve `"arhiva"` as an *event* slug (new `RESERVED_EVENT_SLUGS`). Ship the reservation only after the pre-flight collision scan (§2.11 step 1). The pre-existing shadowing of `client-panel`/`dev`/`ponuda`/`preview-login` (§1.f) is flagged for an independent fix — it is not this RFC's scope but the same mechanism.

### 2.8 The image pipeline and Convex storage

Client side (per constraint): decode any format including HEIC via WASM, downscale to the plan's max dimension, encode fast JPEG, upload **sequentially per device** with retry. Server side: sharp strips EXIF (preserving orientation via rotate), applies the watermarks, and produces AVIF (primary) + WebP (iOS ≤ 15 fallback) + thumbnail; serving uses `<picture>`. AVIF encoding and watermarking never happen on the client.

**Watermark spec (confirmed — §0.7).** The **ScanMe logo** is placed **bottom-right at 8% of the image width, 70% opacity, with a subtle shadow** for legibility on light backgrounds — applied to every image. The **business (venue) watermark** is placed bottom-left **only when the business has uploaded a logo**; when there is no logo it is **skipped entirely — never substitute the business name as text.** So an image carries one or two watermarks depending on whether the business has a logo, never zero (ScanMe is always present).

**Placement decision: the sharp stage runs in a Next.js route handler (Node runtime, Vercel function), not a Convex `"use node"` action.** Convex node actions *can* carry sharp via external packages, but it is the fragile path: libvips native binaries must match Convex's runtime, and decoded HEIC buffers put memory near the action ceiling; a breakage there is hard to debug in production. sharp on Vercel Node functions is first-class (and the 5 GB function size + 100 MB request-body limits comfortably cover it). **Stated tradeoff:** the pipeline leaves Convex's transactional world. Mitigations: the reserve→commit protocol below keeps the database authoritative at every step; the commit path is gated by a shared secret (`SCANME_PIPELINE_SECRET`, declared in [convex/convex.config.ts](../../convex/convex.config.ts) env and Vercel env); stale `reserved`/`processing` rows (> 24 h) and their orphan originals are swept by cron.

Flow:

1. `memories.reserveUpload` (Convex mutation, §2.9 quota) → returns `photoId` + a Convex `generateUploadUrl()` (the [scanMeLinks.ts:1229](../../convex/scanMeLinks.ts) primitive).
2. Client PUTs the JPEG to Convex storage; calls `POST /api/m/[code]/process` with `{ photoId, storageId }` + the guest cookie.
3. The handler verifies the cookie HMAC → fetches `uploadContext` from Convex (secret-gated: validates the photo is `reserved` and owned by this guest; returns `maxImageDimension` from the entitlement and the venue logo URL) → fetches the original blob → sharp (EXIF strip, **server-authoritative** dimension clamp, watermark(s) per the §2.8 spec, AVIF + WebP + thumb) → `storage.put` × 3 (the `convex/lib/storage.ts` hygiene wrapper, C.8) → calls the secret-gated commit mutation.
4. Commit (one transaction): `mediaAssets` insert, photo → `ready`, original blob deleted, `photoCount` rollups incremented.

The client's downscale is bandwidth UX only — the server re-clamps unconditionally, so no client can exceed the plan's resolution. Nothing reaches a gallery except `mediaAssets` variants, which only the commit can create, and the commit only accepts `reserved` rows. Video later: a new `kind`, new variant entries, a new processing branch — additive by construction (C.8).

### 2.9 Enforcement-point matrix

Every limit is enforced server-side in code paths the client cannot influence beyond its own inputs; the client-side counterpart is UX only.

| Enforcement point | Lives in | Mechanism | Why it cannot be bypassed |
|---|---|---|---|
| **Guest photo quota (3/5/10)** | Convex mutation `memories.reserveUpload` | Index-count of the guest's non-deleted photos via `by_sessionId_and_guestId` (`.take(limit+1)`), compared to `entitlement.photosPerGuest + Σ quotaAdjustments`, then the `reserved` row inserted **in the same transaction**. Convex mutations are serializable with OCC retry: two concurrent reservations cannot both observe n−1 and both insert. `reserved` rows count, so parallel-upload bypass is impossible. | The only path to an upload URL is this mutation; the commit refuses non-`reserved` rows. `@convex-dev/rate-limiter` was evaluated and **rejected for the quota itself** (it models rates-per-period, not lifetime caps with admin grants and delete-refunds; the guideline's race warning targets cross-transaction window scans, which this is not). Counter docs rejected: deletes/moderation would need drift-prone decrements; counting ≤ ~20 rows is cheap and self-healing. |
| **Abuse throttling** | Convex mutations, via `@convex-dev/rate-limiter` (first component; mount in [convex.config.ts](../../convex/convex.config.ts)) | Per-IP `cardResolve` and guest creation; per-guest `reserveUpload` burst; per-guest `reportPhoto`. | Server-side token buckets; per the guidelines, hand-rolled window scans admit races. |
| **Upload window** | `memories.reserveUpload` | `space.status === "active"` and `session.status === "open"` (materialized by scheduled mutations + reconcile cron); one_off additionally double-checks `windowStartAt <= Date.now() <= windowEndAt` (clock is legal in mutations). | Session state is server-materialized; queries never consult the clock. |
| **Entitlement (plan gates)** | Convex mutations (block allow-list at venue `saveDraft`/`publish`; quota and window above) + the pipeline handler (resolution) | `getEntitlement(ctx, businessId, product, spaceId?)` read inside the same transaction as the gated write; when the gated write belongs to a space (all Memories quota/window/resolution paths), the space's `spaceId` is passed so a space-scoped premium entitlement wins over the business-scoped one (§2.3). | The client never transmits its own limits; the resolution order is server-side; public pages render `published*` only, which publish already gated. |
| **Resolution cap** | `POST /api/m/[code]/process` | sharp clamps to `maxImageDimension` from the server-fetched entitlement, unconditionally. | The client's JPEG is an intermediate; only sharp's outputs are ever served. |
| **Retention** | `convex/crons.ts` daily `retentionSweep` (internal mutation) | Per space: `cutoff = now − retentionDays`; range-delete via `by_spaceId_and_createdAt` in batches with `ctx.scheduler.runAfter(0, …)` continuations (the guidelines' bulk pattern); marks `deleted/retention`. A second `purgeSweep` cron walks `by_status_and_updatedAt` tombstones, deletes blobs through the `convex/lib/storage.ts` wrapper (`ctx.storage.delete`), then deletes docs; also purges stale `reserved`/`processing` rows and orphan originals. | Entirely server-scheduled; no client involvement. |
| **Photo visibility** | Convex queries | `myPhotos({ code, guestKey })` returns only `by_sessionId_and_guestId` rows; the public gallery query filters `status === "ready" && visibility === "everyone"` **inside the query** — `host_only` bytes never leave the server; host queries gated by `requireBusinessAccess`. | Filters run server-side; a guest without the right `guestKey` gets an empty set. |
| **Moderation** | Convex mutations `hidePhoto`/`deletePhoto`/`resolveReport` | Host (`requireBusinessAccess`) or admin (`requireAdmin`); hide is reversible (`hidden`), delete is tombstone → purge; report intake is public but rate-limited. | Status lives server-side; every gallery query excludes `hidden`. |
| **Card scan counting** | `app/r/[cardCode]/route.ts` → `cards.resolveAndRecord` | `requestId` generated **in the handler**, idempotent via `by_requestId`, per-IP rate-limited. | Unlike the audited Links endpoints (§1.e), no client-supplied idempotency token exists to replay or mint. |

### 2.10 GDPR posture

| Data category | Lawful basis | Notes |
|---|---|---|
| Guest photos (upload, host viewing, public gallery, archive inclusion) | **Consent, Art. 6(1)(a)** — the affirmative act of uploading after the notice; `consentVersion`/`consentAt` recorded on `memoriesGuests` at first upload; re-shown when the version changes | Per-photo visibility choice is consent granularity; the notice states that the host may include shared photos in the event archive |
| Guest cookie + localStorage mirror | **Strictly necessary** (ePrivacy exemption — it *is* the service: quota + access to one's own photos); disclosed in the privacy notice; no consent banner | Contains only a random key + MAC; path-scoped; no tracking or cross-site use |
| Scan/visit events (cards, venue pages) | **Legitimate interest, Art. 6(1)(f)** — minimized exactly as the existing pipeline already is: no IP stored, UA reduced to `deviceCategory`, no cross-service identifier | `guestId` on photos is part of the consented service, not analytics |
| Business contact data (existing tables) | Contract — unchanged | |

- **Consent text placement**: inline on the upload screen (the first screen of `/m/[code]`), above the shutter — short Serbian notice + link to the full policy; the upload button is the affirmative act. The string lives in the i18n dictionary (§2.12), versioned so `consentVersion` is meaningful.
- **Deletion mechanics** — everything funnels into the tombstone → `purgeSweep` machinery (§2.9), so blobs and documents actually disappear; guest-initiated wipes additionally schedule an immediate purge (`ctx.scheduler.runAfter(0, …)`):
  - *Per-photo*: the guest deletes their own (guest-key mutation); host/admin delete any.
  - *Guest wipe* ("obriši sve moje slike" on `/m/[code]/moje`): `by_guestId` sweep → tombstone all photos (`gdpr_wipe`), delete matching `eventArchiveItems` (**the guest's wipe beats the host's archive pin**), delete matching `quotaAdjustments`, and delete the guest row itself (quota restart for a re-scanning guest is acceptable by design).
  - *Event/space wipe*: host/admin sweeps via `by_sessionId_and_status` / `by_spaceId_and_createdAt`.
  - *Business offboarding*: admin cascade — spaces → sessions → photos → `mediaAssets` (`by_businessId_and_createdAt`) → cards/targets → events/configs/archive items, batched with scheduler continuations.
- **Export**: (a) *business export* — an action producing a ZIP into storage: all `ready` variants + `metadata.json` (photos, sessions, per-card stats, entitlement snapshot); (b) *guest export* — `/m/[code]/moje` already lists the guest's photos; a "preuzmi sve" ZIP action keyed by `guestKey` possession completes Art. 15/20. Guests have no email or identity on file, so key possession *is* the identity-verification story — documented in the policy.

### 2.11 Migration and byte-identical backwards compatibility

**Existing rows rewritten: none.** Published Links pages read only `published*` fields via `publicLinksView` ([scanMeLinks.ts:554–615](../../convex/scanMeLinks.ts)); no field, validator, or index on `scanMeLinksConfigs`/`serviceDestinations` changes.

Complete change list against existing files (everything else is new files):

| File | Change | Why it cannot alter Links output |
|---|---|---|
| [convex/schema.ts](../../convex/schema.ts) | new tables (C.1–C.16); `serviceType` union +2 literals; **`businesses` gains optional `kind`** (§2.1.6) | additive; existing rows validate unchanged (`kind` absent ⇒ `"business"`); no existing index keys touched; new tables start empty (no `staged:` needed — staged indexes matter only for indexes added to *large existing* tables, none here) |
| [convex/activationRequests.ts](../../convex/activationRequests.ts) | `requestedServiceValidator` → shared `serviceTypeValidator` | widened arg validator; existing requests unchanged |
| [convex/lib/access.ts](../../convex/lib/access.ts) | split `requireBusinessAccessBySlug`; add `requireServiceEditorAccess` | behavior-preserving refactor; the google-review variant preserves today's return shape; existing tests guard it |
| [convex/lib/validation.ts](../../convex/lib/validation.ts) | `RESERVED_SLUGS` + `"m"`, `"r"` | affects only future slug creation; published slugs keep working; pre-flight scan first |
| [convex/convex.config.ts](../../convex/convex.config.ts) | env `SCANME_GUEST_SECRET`, `SCANME_PIPELINE_SECRET`; `app.use(rateLimiter)` | config additions; no data path touched |
| [proxy.ts](../../proxy.ts) | one added matcher branch for `/*/venue/editor` | public Links pages matched no branch before; the new regex cannot match `/{slug}` or `/{slug}/editor` |
| [convex/lib/serviceMetrics.ts](../../convex/lib/serviceMetrics.ts) | add generic `incrementDailyRollup` (used by new tables) | additive export; existing helpers untouched |
| `components/admin/scanme-links-editor*.tsx` | shell parameterization (§2.5) | editor UI is not public-page output; the preview renders the unedited real template |
| **Zero edits**: [convex/lib/scanMeDesignValidators.ts](../../convex/lib/scanMeDesignValidators.ts), [components/scanme-links/**](../../components/scanme-links/templates/registry.tsx), [convex/scanMeLinks.ts](../../convex/scanMeLinks.ts) render path, [lib/scanme-links-design.ts](../../lib/scanme-links-design.ts), [lib/scanme-palette.ts](../../lib/scanme-palette.ts), [lib/scanme-links-variations.ts](../../lib/scanme-links-variations.ts), [app/layout.tsx](../../app/layout.tsx) (Venue reuses the same 12 fonts), `globals.css` | |

Residual byte-risks are environmental, with standing rules: all Venue styles live in new `components/venue/**` module CSS; dependency changes are additive-only in the lockfile; a CI grep gate forbids `--links-` under `components/venue/**` and `--venue-` under `components/scanme-links/**`.

**Verification harness** (built *before* any shared-surface change lands): extend [app/dev/template-gallery/page.tsx](../../app/dev/template-gallery/page.tsx) — which already renders every preset × variation through the real template — into a golden corpus: a Playwright job renders preset × variation × background category, serializes `documentElement.outerHTML` plus the computed styles of the token-bearing root, and diffs against goldens captured on `main` before the branch. The merge gate is green goldens **plus** `git diff --stat` showing zero changes under `components/scanme-links/**`.

**Ordered migration steps** (each independently deployable and reversible; at no point does a Links read path change): (1) pre-flight read-only scan for `m`/`r` collisions across `businesses.by_slug`, `serviceProfiles.by_slug`, `serviceSlugAliases.by_slug`, `dynamicLinkAliases.by_slug`; remedy via the existing alias-rename mechanism ([admin.ts:663–869](../../convex/admin.ts)); (2) schema deploy (new tables + union widening); (3) `validation.ts` reservation + `access.ts` refactor; (4) rate-limiter mount + `convex/crons.ts` (reconcile/retention/purge/expiry — no-ops on empty tables); (5) entitlements + `approveActivation`; (6) product surfaces, gated behind `serviceProfiles.status` exactly as Links is today. One version flag: the repo pins `convex ^1.42.1` while the generated guidelines target `^1.44.0` — bump before relying on `schema.doc(...)`/`paginationResultValidator` in new code.

### 2.12 i18n

**No library.** next-intl's value — locale routing, negotiation, ICU — is all unused with `sr` as the sole locale and no locale prefix in the URLs. The layer is a typed dictionary system (~50 lines of infrastructure, zero runtime dependency):

```
lib/i18n/types.ts          Locale = "sr"; a Dict interface per surface
lib/i18n/format.ts         fmt(template, params) for interpolated strings
lib/i18n/sr/venue.ts       const venueSr = { … } as const satisfies VenueDict
lib/i18n/sr/venue-editor.ts, sr/memories.ts, sr/resolver.ts, sr/consent.ts
lib/i18n/index.ts          getDict("venue") — statically imported per-surface modules keep route bundles lean
```

Plain data, no provider — works in server components, client components, and route handlers (the `/r/nevazeca` copy) alike. The `satisfies` pattern makes a second locale mechanical: implement the same interfaces under `lib/i18n/en/` and extend `getDict`. **All new user-facing strings go through the layer from day one** — including venue template aria-labels, editor `panelCopy`, and the consent text (versioned, §2.10) — satisfying the constraint. Existing inline Serbian (including [option-two-template.tsx:729, 738](../../components/scanme-links/templates/option-two/option-two-template.tsx)) is untouched: migrating it edits the frozen render path for zero user value, and is deferred until the §2.11 harness can prove a no-op.

---

## 3. Risk register

Ranked. Each risk lists blast radius and a concrete mitigation.

| # | Risk | Blast radius | Mitigation |
|---|---|---|---|
| 1 | **Editor-shell parameterization regresses the live Links editor.** This is the honest #1: the shell refactor (§2.5) touches [scanme-links-editor.tsx](../../components/admin/scanme-links-editor.tsx) (1,544 lines) and [-mobile.tsx](../../components/admin/scanme-links-editor-mobile.tsx), where autosave hashing, OCC publish, and history grouping are intertwined. | Every Links customer's editing workflow; worst case, corrupt drafts via a broken autosave/publish interplay. | One **mechanical** commit: prop-threading only, zero logic moves — `linksMode` is literally the existing exports bundled. An editor E2E smoke (load → edit → undo → autosave settle → publish → public page unchanged) runs before and after that commit. Venue mode lands only after it is verified. The public page is additionally guarded by the §2.11 golden harness. |
| 2 | **The image pipeline sits outside Convex's transactions.** A crash between sharp output and commit, or a lost commit call, leaves `processing` rows and orphan blobs; a leaked pipeline secret would allow forged commits. | Individual uploads stuck; storage leakage; with a leaked secret, junk in galleries. | Reserve→commit protocol keeps the DB authoritative at each step; commit is idempotent per `photoId`; `purgeSweep` reaps stale `reserved`/`processing` rows + orphan originals after 24 h; the secret lives only in Vercel/Convex env (never client-visible) and is rotatable; the commit validates the photo's state machine, not just the secret. |
| 3 | **Scheduled lifecycle flips misfire** (event never goes live at `startsAt`, or a session never closes) — scheduler loss, deploy races, or an edit racing a stored schedule. | A venue's public page shows the wrong event during its own party — high-visibility, time-critical. | `lifecycleRevision` OCC makes every stored flip idempotent and cancellable (§2.2); every schedule edit cancels-and-reschedules; the 15-minute reconcile cron sweeps `by_status_and_startsAt`/`by_status_and_endsAt` as the guaranteed backstop; `goLive` asserts single-live. |
| 4 | **(Downgraded — §2.5 "Lift, do not copy")** The engine's `backgroundPresentation`/`shadowCss` are now **lifted**, not copied — one source of truth shared by Links and Venue — so copy drift is eliminated. The residual risk is narrower: the one-time **mechanical extraction commit** on the frozen Links template is not actually behavior-preserving. | A single commit's blast radius on the Links render path; caught before merge. | The lift is its own isolated commit ("define elsewhere, import here", zero logic change), sequenced strictly **after** the §2.11 golden harness is green; the harness (DOM + computed-style diff vs `main` goldens) gates the merge and fails on any byte change; `git diff --stat` confirms the commit's only Links-side change is the import swap. Net risk is strictly smaller than maintaining two live copies. |
| 5 | **Quota/abuse economics on a public storage write.** Quota is per-person and soft *by constraint* — a hostile guest can clear cookies and mint new guests; the cost is storage + pipeline compute, not gallery integrity. | Storage/compute spend; gallery spam at a wedding. | Rate limiter per IP and per space on guest creation and reservation (§2.9); per-session `photoCount`/`guestCount` visible to the host with one-tap `hidePhoto`/space `paused`; retention caps the tail; the constraint explicitly accepts the residual (soft limit, host moderation is the real gate). |
| 6 | **Slug collisions when reserving `m`/`r`** — an existing business slugged `m` or `r` would be shadowed by the new root segments. | That business's QR codes break. | Pre-flight read-only scan is step 1 of the migration order (§2.11); remedy is the existing alias-rename mechanism, which preserves old QR slugs via `serviceSlugAliases`. |
| 7 | **CSS namespace cross-bleed** between `--venue-*` and `--links-*`. | Subtle styling corruption on either product. | No shared stylesheet; new module CSS only; CI grep gate both directions (§2.11). |
| 8 | **GDPR deletion incompleteness** — a wipe that leaves blobs, archive pins, or thumbnails behind. | Legal exposure; broken user trust. | Single funnel: every deletion path writes the same tombstone consumed by one `purgeSweep` that deletes via the `convex/lib/storage.ts` wrapper (all variants + original) and then the doc; `eventArchiveItems.by_mediaAssetId` is explicitly swept on guest wipe; an integration test asserts zero storage references after a wipe. |
| 9 | **Entitlement/status drift under the manual flow** — the audited gap where activation flips nothing (§1.e) re-emerges for new products. | A paying business without limits, or limits without a product. | `approveActivation` is one transaction for profile status + entitlement + request closure (§2.3); enforcement reads only `entitlements.status`. |
| 10 | **Convex doc-size creep on `venueEventConfigs`** if block caps are raised carelessly (draft+published double every byte). | Failed writes at the 1 MB limit on the busiest configs. | Caps enforced in mutations (30 blocks + per-block item caps) with headroom ~4× measured worst case; gallery/menu media are storage IDs, never inline data; a size assertion in the save mutation logs at 512 KB. |

---

## 4. Implementation sequence

Each step has a success criterion a test or check can confirm. Steps 1–5 are pure prerequisites; 6–9 deliver Venue; 10–13 deliver Memories. The two products are independent after step 5 and can be re-ordered by priority.

| # | Step | Verifiable success criterion |
|---|---|---|
| 1 | Golden harness: template-gallery Playwright corpus + `git diff` gate (§2.11) | Corpus renders every preset × variation × background; a deliberate 1-token CSS edit makes the diff fail; reverting makes it pass |
| 2 | Slug pre-flight + `RESERVED_SLUGS` + `"m"`, `"r"` | Internal query returns zero collisions (or aliases created); `convex/scanMeLinks.test.ts`-style test: creating a business slugged `m` throws the reserved error |
| 3 | Schema deploy: new tables + `serviceType` widening + shared `serviceTypeValidator` | `npx convex deploy` succeeds; `npm run check` green; existing `convex/*.test.ts` suites pass unchanged |
| 4 | `access.ts` refactor (`requireBusinessAccess` split, `requireServiceEditorAccess` lift) | Existing client-panel/editor tests pass byte-identically; new test: a business with **no** `dynamicLinks` row passes `requireBusinessAccess` and fails `requireGoogleReviewPanelBySlug` |
| 5 | Rate-limiter mount, `convex/crons.ts` (reconcile/retention/purge/expiry), entitlements + `approveActivation` | convex-test: `approveActivation` in one call yields `status:"active"` + readable entitlement + closed request; expiry cron flips a `validUntil`-past row to `expired`; crons no-op on empty tables |
| 6 | Design engine modules (tokens/shadows/background/capabilities/typography/palette) + golden fixtures | Engine unit tests assert byte-exact CSS output against fixtures captured from the live Links template; harness (step 1) still green |
| 7 | `events` + `venueEventConfigs` + lifecycle machinery | convex-test: full `draft→scheduled→live→ended→archived` walk; a stale-`lifecycleRevision` flip no-ops; `goLive` rejects a second live event; `duplicateEvent` copies published→draft |
| 8 | Venue public routes + template + block renderers | `curl /[slug]/venue` of a live event returns the published blocks; unknown event slug → 404; page-source contains `--venue-` and not `--links-`; `npm run check` green |
| 9 | Standalone Venue editor (own shell, history, autosave) — shell unification deferred (§2.5 amendment) | Venue editor: add/reorder/publish a block round-trips through `expectedDraftRevision`; harness still green. Editor-shell parameterization is its own later task, gated on the risk-#1 E2E smoke (load → edit → undo → autosave settle → publish → public page unchanged) running before and after the mechanical shell commit |
| 10 | Cards + `/r/[cardCode]` resolver | `curl -i /r/<code>` → `302` with `Location` per target kind and, for memories targets, `Set-Cookie` containing `HttpOnly` and `Path=/m/<code>`; repeat with the same server requestId inserts one `cardScanEvents` row; unknown code → `302 /r/nevazeca` |
| 11 | Memories tables + guest identity + quota | convex-test: `reserveUpload` rejects the (limit+1)th photo at each tier; a `quotaAdjustments` grant admits exactly `extraPhotos` more; concurrent reservations never exceed the limit; wrong `guestKey` → empty `myPhotos` |
| 12 | Image pipeline route + `convex/lib/storage.ts` wrapper | Integration: HEIC upload → `ready` photo whose AVIF/WebP/thumb (a) contain no EXIF GPS, (b) carry the ScanMe watermark (plus the business watermark when the business has a logo — §2.8), (c) respect `maxImageDimension`; a stale `reserved` row is reaped by `purgeSweep`; gallery serves `<picture>` with AVIF first |
| 13 | Visibility, moderation, GDPR flows, retention | convex-test: `host_only` photos absent from the public gallery query result; guest wipe leaves zero `memoriesPhotos`/`eventArchiveItems`/storage refs for that guest; retention sweep deletes only rows older than the tier's window |
| 14 | i18n dictionaries + consent versioning | `npm run check` (type-level `satisfies` completeness); bumping `consentVersion` re-shows the notice in an E2E pass |

---

## 5. Open questions

Information this RFC did not have and deliberately did not invent:

1. **Venue plan tiers.** Memories tiers are defined (3/5/10). Venue's tiers — which blocks per tier, event-count limits, archive limits — are unspecified; `allowedBlockKeys` in the plan catalog is a placeholder shape.
2. **Consent and archive wording.** Legal review of the Serbian consent text, and specifically whether archive inclusion (host re-publishing a guest photo on the public venue page) is adequately covered by upload-time consent or needs a separate opt-in.
3. **`cardScanEvents` retention.** Scan events currently accrue forever (no retention exists platform-wide, §1.f). Decide a horizon (e.g., raw events 12 months, dailies forever) — the purge-cron machinery makes this cheap to add.
4. **Serbian payment provider shortlist.** The billing port's `verifyWebhook` shape is provider-agnostic, but a shortlist (e.g., whether the provider supports webhooks at all vs. polling) would de-risk the port's surface.
5. **Google-Review dashboard migration.** The legacy `scanEvents` mirror ([scanMeLinks.ts:791–841](../../convex/scanMeLinks.ts)) exists because those dashboards read legacy tables. Migrating them off would let the mirror die; out of scope here, but the new `incrementDailyRollup` extraction is a natural moment.

**Resolved since the draft (Step 0 amendments; removed from the list above):**

- *Parallel live events* — **confirmed one `live` event per business** (§0.7). The `/venue` single-live guard stands; a card-per-event model (`cardTargets.kind: "event"`) remains available if that ever changes, but is not an open question now.
- *Memories pricing granularity* — **resolved** (§0.2): entitlements are business-scoped by default with **optional space scoping** (`entitlements.spaceId`), so a venue can hold a subscription and buy a premium tier for one specific event.
- *Watermark assets* — **resolved** (§0.7): ScanMe logo bottom-right at 8% width / 70% opacity / subtle shadow; the business watermark is skipped entirely when there is no logo (never text) — see §2.8.
- *Night cutoff default* — **confirmed 06:00 Belgrade** (§0.7; `nightCutoffHour` default 6).
- *Exact retention/resolution numbers per tier* — **confirmed** (§0.7): retention 30/90/365 days; per-tier max dimension **2048/2560/4096** px (raised from 1600/2048/2560 — 1600 is too low for a kept wedding photo).
- *R2 timeline* — **resolved** (§0.6): Convex file storage is the storage; there is no R2 migration to plan and a future CDN move is out of scope.

---

*End of RFC-001.*
