# Sajam automobila 2026 — fair backend ugovor (B0)

> Status: **B0 — ugovor i šema; B1 — katalog, import, paketi i QR dodela** (admin funkcije u §11, import u §12); **B2 — anonimni identitet, scan pipeline i javni katalog** (§13–§14); **B3 — ocene, Glas publike, anketa i pasoš** (§15–§16); **B4 — leadovi, saglasnost i email outbox** (§17–§18). Napisano iz stvarnog koda 3. i 4. oktobra 2026.
>
> Vlasnik backend-a: **Jovan**. Vlasnik proizvoda i go/no-go: **Aleksa**.
> Izvori zahteva: `MASTER-KONTEKST.md`, `BACKEND-HANDOFF.md` (§4–§7, §11), `JOVAN-DELTA-2026-10-02.md`.

Ugovor u kodu:

| Fajl | Šta je |
|---|---|
| `lib/fair-contract.ts` | Tipovi, konstante i error kodovi. Čist TypeScript, bez React/Next/Node/Convex importa. |
| `lib/fair-entitlements.ts` | **Jedini autoritet za paketna prava.** Čiste funkcije. |
| `convex/lib/fairValidators.ts` | Convex validatori fair dokumenata + guard `fairCardTargetProblem`. |
| `convex/schema.ts` | 29 `fair*` tabela i aditivne izmene postojećih tabela. |
| `lib/fair-entitlements.test.ts`, `convex/fairSchema.test.ts` | Testovi koji zaključavaju ovaj ugovor. |

Ako se ovaj dokument i kod razilaze, važi kod, a razlika je greška dokumenta.

---

## 1. Funkcijska površina

**B0 ne dodaje nijednu public, internal ni admin funkciju.** Nova je samo šema; tipovi i pravila su čiste funkcije. **B1** dodaje admin funkcije (`requireAdmin`) i jednu internal DEV funkciju; spisak je u §11. **B2** dodaje tri javna read-only upita (`fairPublic.*`), fair granu u postojećem `cards.resolveAndRecord`, dve internal funkcije i jedan Next gateway (§13–§14). **B3** dodaje gateway-facing `fairInteractions.*`, četiri javna upita u `fairPublic`, admin `fairInteractionsAdmin.*` i šest POST ruta (§15–§16). **B4** dodaje gateway-facing `fairLeads.submitLead`, javni `fairPublic.getLeadForm`, internal outbox `fairEmails.*`, Node sender `fairEmailSender.*`, admin `fairLeadsAdmin.*` i rutu `POST /api/fair/lead` (§17–§18).

Planirana površina (HANDOFF §7). Imena se mogu minimalno prilagoditi; odgovornosti ne.

| Modul | Korak | Vrsta | Funkcije |
|---|---|---|---|
| `convex/fairAdmin.ts`, `convex/fairImport.ts` (**urađeno**, §11–§12) | B1 | admin (`requireAdmin`) | upsert event/dan/učešće/štand/model, event-only klijent i `convertEventClientToStandard`, QR inventar + atomski assign/release + resolve test, publish/withdraw, upgrade paketa, import dry-run/commit, validation issues |
| `convex/cards.ts` (hook), `app/r/[cardCode]`, `app/api/fair/**` (**urađeno**, §13) | B2 | postojeći public resolver + server gateway | fair scan u istom `requestId`, visitor hash, server-derived admin isključenje, pečat pasoša |
| `convex/fairPublic.ts` (B2 i B3 deo **urađen**, §14, §15.3) | B2/B3/B5 | public, read-only, bez PII | `getEventBySlug`, `getModelBySlug`, `getModelsByIds` (≤50) — B2; `listAudienceQuestionsForModel`, `getAudienceQuestionResult`, `getSponsoredMapRotation`, `getSponsoredGarageRotation`, `getPassportCatalog`; `getMyPassportProgress` ide kroz POST gateway (HANDOFF §7) |
| `convex/fairInteractions.ts` (B3 deo **urađen**, §15) | B3/B5 | public preko POST gateway-a | `getMyModelState`, `upsertRating`, `upsertAudienceVote`, `submitSurvey`, `upsertBrandFavorite`, `recordSponsoredAction` (samo garaža) |
| `convex/fairLeads.ts`, `convex/fairEmails.ts`, `convex/fairEmailSender.ts`, `convex/fairLeadsAdmin.ts` (**urađeno**, §17–§18) | B4 | gateway + internal + admin | `submitLead`, potvrda (Node `internalAction`), follow-up, suppression, paginiran izvoz |
| `convex/fairAnalytics.ts`, `convex/fairReports.ts` | B6 | internal/admin | metrike, dnevni dataset, report lifecycle (send samo iz `approved`) |
| purge | B7 | internal + admin preview | bounded, retry-safe brisanje PII |

Pravila za sve buduće funkcije:
- object form sa `args` i `returns` validatorima;
- indeksirani i ograničeni upiti;
- PII se nikad ne vraća javnoj funkciji;
- visitor-specifično čitanje ide kroz same-origin `POST` gateway, nikad kroz URL.

## 2. Aditivne izmene postojećih tabela

| Mesto | Izmena | Ponašanje u B0 |
|---|---|---|
| `cardTargetKind` (schema.ts) | `+ "fair_model"`. Deli ga `cardTargets.kind` i `cardScanEvents.targetKind`. | Inertno. Generički API (`cards.createCard/retargetCard`, `cardsAdmin.*`) ga odbija sa `cardTargetInvalid`; `resolveAndRecord` vraća `{ kind: "invalid" }` (generički scan se beleži kao i ranije). B1 i B2 zamenjuju inertne grane (B2: resolver grana, §13). |
| `cardTargets.fairEventModelId?` | `v.id("fairEventModels")` | Obavezno za `fair_model`, zabranjeno za druge kind-ove. Svaki pisac poziva `fairCardTargetProblem`. |
| `cardSplitterItem` | bez izmene | `fair_model` nije dugme splitera. |
| `accounts.clientSegment?` | `standard \| event_only` | Odsutno = `standard` (`fairClientSegmentOf`). |
| `adminClientReadModels.clientSegment?`, `adminVenueReadModels.clientSegment?` | projekcija segmenta | B1 ga upisuje pri sync-u i isključuje `event_only` iz redovnih lista. |
| `convex/cards.ts`, `convex/cardsAdmin.ts` | inertne `case "fair_model"` grane i `SplitterItemSpec` bez `fair_model` | Bez njih `tsc` pada (TS2366/TS2345). Presedan je TASK-62 (`table_ordering`). |
| B1: `accessDestinationKind` (`convex/lib/accessValidators.ts`) | `+ "fair_model"` | Piše ga samo B1 QR dodela. Dele ga `accessSubjects.destinationKind` i `productInventory.destinationKind`. |
| B1: `accessSubjects.destinationInput` | novi validator `accessSubjectDestinationInput` = postojeći `accessDestinationInput` + `{ kind: "fair_model", eventModelId }` | Generički access API (`adminProducts.*`) i dalje prima samo `accessDestinationInput`, pa ne može da napravi fair destinaciju (test). |
| B1: `destinationProblem` (`convex/lib/accessResolution.ts`) | grana za `fair_model` target | Kod otvara model samo dok postoji aktivan `fairQrAssignments` red za taj subjekat; inače `destination_fair_unassigned` (ili `destination_fair_model_missing`). |
| B1: `fairEvents.qrInventoryBusinessId?` | `v.id("businesses")` | Interni business „Sajam automobila 2026 — QR inventar“ čiji se postojeći QR kanali smeju dodeliti modelima tog eventa. Bez njega dodela vraća `FAIR_QR_INVENTORY_NOT_CONFIGURED`. |
| B1: `accounts` | indeks `by_clientSegment` | Bounded lista `event_only` klijenata za `Događaji`. |
| B1: `convex/lib/adminReadModelEngine.ts` | `clientSegment` se projektuje u `adminClientReadModels`/`adminVenueReadModels` samo kad je postavljen | Odsutno ostaje odsutno; standardni klijenti se ne menjaju. |
| B2: `cards.resolveAndRecord` | novi opcioni arg `fairVisitorHash` i ishod `{ kind: "fair_model", path, fairScan }` | Čita ih samo `fair_model` grana. Ostale grane (venue, menu, memories, splitter, ordering, url, event, service) su nepromenjene; hash im se ne upisuje (test). |
| B2: `convex/lib/rateLimits.ts` | bucket `fairScan` | Po posetiocu, ne po IP-u (§13.5). Postojeći bucketi nisu menjani. |
| B2: `app/r/[cardCode]/route.ts` | visitor hash, prosleđena ScanMe sesija, `case "fair_model"` | Ostali `case`-ovi su nepromenjeni. |
| B1: `adminReadModels.clients/listClients/venues` | `.filter(clientSegment != "event_only")` | Redovni direktorijum klijenata i lokala ne prikazuje `event_only`. `adminProductReads.listVenues` namerno nije filtriran: QR inventar mora ostati dostupan za pravljenje kodova. |

U B0 na postojećim tabelama nije dodat nijedan indeks; B1 dodaje samo `accounts.by_clientSegment`. Nijedno postojeće polje nije promenjeno.

## 3. Tabele

Napomene:
- Convex ne nameće jedinstvenost; „jedinstveno“ je pravilo upsert-a mutacije koja piše tabelu.
- **PII** označava redove koje purge (16. 11. 2026, B7) trajno briše.
- Statusi i enumi su u `convex/lib/fairValidators.ts`; tipovi su u `lib/fair-contract.ts`.

### 3.1 Katalog (piše B1)

| Tabela | Polja | Indeksi | Jedinstveno |
|---|---|---|---|
| `fairEvents` | `code`, `slug`, `title`, `venueName`, `timezone: "Europe/Belgrade"`, `startsAt`, `endsAt`, `status: draft\|published\|live\|ended\|archived`, `garagePriority`, `piiPurgeAt`, `minimumPublicVoteCount`, `robotsIndexable`, `qrInventoryBusinessId?` (B1), `createdAt`, `updatedAt` | `by_code`, `by_slug`, `by_status_and_startsAt` | `code` (upsert ključ), `slug` |
| `fairEventDays` | `eventId`, `dateKey`, `label`, `startsAt`, `endsAt`, `sortOrder` | `by_eventId_and_dateKey` | (event, dateKey) |
| `fairParticipations` | `externalKey`, `eventId`, `accountId`, `businessId`, `primaryContactId?`, `reportRecipientEmail?`, `leadDeliveryNote?`, `status: draft\|active\|withdrawn`, `createdAt`, `updatedAt` | `by_eventId_and_externalKey`, `by_eventId_and_businessId`, `by_accountId_and_eventId` | (event, externalKey), (event, business) |
| `fairStands` | `eventId`, `participationId`, `externalKey`, `code`, `displayName`, `mapLocationId`, `status: draft\|active\|withdrawn`¹, `createdAt`, `updatedAt` | `by_eventId_and_externalKey`, `by_eventId_and_participationId`, `by_eventId_and_mapLocationId` | (event, externalKey); (event, mapLocationId) među ne-povučenim štandovima — privremeno pravilo seam-a `validateMapLocationIds` po B1 uputstvu (R0 nalaz 1, §9.17) |
| `fairEventModels` | `externalKey`, `eventId`, `participationId`, `brandId`, `standId`, `slug`, `displayName`, `variant?`, `priceText`, `specifications[]`², `photoStorageId?`, `photoUrl?`, `packageTier`, `packageActivatedAt`, `passportEligible`, `status: draft\|published\|withdrawn`, `sortOrder`, `createdAt`, `updatedAt` | `by_eventId_and_slug`, `by_eventId_and_externalKey`, `by_eventId_and_standId`, `by_eventId_and_brandId`, `by_eventId_and_packageTier` | (event, slug), (event, externalKey) |
| `fairQrAssignments` | `eventId`, `eventModelId`, `accessChannelId`, `accessSubjectId`, `cardId`, `resolverCode`, `status: assigned\|released`, `assignedAt`, `releasedAt?`, `assignedByUserId`, `releasedByUserId?`, `reason?` | `by_eventModelId_and_status`, `by_accessChannelId_and_status`, `by_eventId_and_status` | najviše jedan `assigned` po modelu i po kanalu |
| `fairPackageActivations` | `eventModelId`, `eventId`, `fromTier`, `toTier`, `activatedAt`, `actorUserId`, `note?` | `by_eventModelId_and_activatedAt` | samo dodavanje (append-only) |

¹ B0 placeholder: HANDOFF imenuje polje bez vrednosti.

² `specifications`: `{ id, groupId, groupLabel, groupOrder, label, value, order, isHighlight }`. Najviše `FAIR_MAX_SPECIFICATIONS_PER_MODEL` (100, tehnički limit) stavki i najviše 4 `isHighlight` (proverava publish validacija u B1).

### 3.2 Identitet i skeniranja (piše B2)

| Tabela | Polja | Indeksi | Jedinstveno | PII |
|---|---|---|---|---|
| `fairVisitors` | `visitorHash`, `firstSeenAt`, `lastSeenAt` | `by_visitorHash` | hash | da |
| `fairScanEvents` | `requestId`, `visitorId`, `eventId`, `eventModelId`, `standId`, `brandId`, `occurredAt`, `dateKey`, `hourKey`, `isAdminExcluded`, `adminUserId?` | `by_requestId`, `by_eventModelId_and_occurredAt`, `by_standId_and_occurredAt`, `by_eventId_and_occurredAt` | `requestId` | da |
| `fairUniqueScans` | `visitorId`, `eventId`, `eventModelId`, `firstScannedAt`, `lastScannedAt`, `totalScanCount` | `by_visitorId_and_eventModelId`, `by_eventModelId_and_firstScannedAt` | (visitor, model) | da |
| `fairMetricCountShards` | `key`, `shard`, `value` | `by_key_and_shard` | (key, shard) | ne (anonimni agregat) |

### 3.3 Ocene, Glas publike i ankete (piše B3)

| Tabela | Polja | Indeksi | Jedinstveno | PII |
|---|---|---|---|---|
| `fairRatings` | `visitorId`, `eventId`, `eventModelId`, `overall?`, `appearance?`, `specifications?`, `price?`, `createdAt`, `updatedAt` | `by_visitorId_and_eventModelId`, `by_eventModelId_and_updatedAt` | (visitor, model) | da |
| `fairAudienceQuestions` | `eventId`, `eventDayId`, `eventModelId`, `externalKey?`³, `prompt`, `options[{id,label,order}]` (2–5), `status: draft\|published\|closed`, `sortOrder`, `startsAt`, `endsAt?`, `showOnSponsoredRotation`, `createdAt`, `updatedAt` | `by_eventModelId_and_eventDayId`, `by_eventDayId_and_status`, `by_eventId_and_externalKey`³ | (event, externalKey) | ne |
| `fairAudienceVotes` | `visitorId`, `eventId`, `eventModelId`, `questionId`, `optionId`, `createdAt`, `updatedAt` | `by_visitorId_and_questionId`, `by_questionId_and_updatedAt` | (visitor, question) | da |
| `fairSurveys` | `eventId`, `eventModelId`, `title?`⁴, `status: draft\|published\|retired`¹, `questions[{id,prompt,kind,options,required,order}]` (≤5), `version`, `createdAt`, `updatedAt` | `by_eventModelId_and_status` | (model, version) | ne |
| `fairSurveyResponses` | `submissionId`, `visitorId`, `eventId`, `eventModelId`, `surveyId`, `answers[{questionId,value}]`⁵, `submittedAt` | `by_submissionId`, `by_surveyId_and_submittedAt`, `by_visitorId_and_surveyId` | `submissionId`; (visitor, survey) | da |

³ B0 dodatak (nema u HANDOFF §5.3). Import i admin upsert moraju biti idempotentni po event + `externalKey` (HANDOFF §7, §8; DATA-INTAKE `question_external_key`).

⁴ B0 odstupanje: opciono. HANDOFF ga navodi kao obavezno, ali `06-surveys.csv` nema naslov, a naslov se ne sme izmisliti.

⁵ `value` je `"yes"`/`"no"` za `yes_no` pitanje, inače ID izabrane opcije.

### 3.4 Leadovi i email (piše B4)

| Tabela | Polja | Indeksi | Jedinstveno | PII |
|---|---|---|---|---|
| `fairConsentConfigs` | `eventId`, `leadKind`, `version`, `text`, `status: draft\|active\|retired`, `activatedAt?`, `createdAt`, `updatedAt` | `by_eventId_and_leadKind_and_status`, `by_eventId_and_leadKind_and_version` | (event, kind, version) | ne (snapshot teksta je u `fairLeads` i briše se s njim) |
| `fairLeadConfigs` | `eventModelId`, `leadKind`, `contactRequirement: one_of\|email\|phone\|both`, `preferredContact?`, `enabled`, `updatedByUserId`, `createdAt`, `updatedAt` | `by_eventModelId_and_leadKind` | (model, kind) | ne |
| `fairLeads` | `submissionId`, `kind`, `visitorId`, `eventId`, `eventModelId`, `participationId`, `contactName`, `email?`, `phone?`, `consentAccepted: true` (literal), `consentVersion`, `consentTextSnapshot`, `consentedAt`, `status: received\|delivered`, `deliveredAt?`, `followUpSuppressed`, `suppressedAt?`, `suppressedByUserId?`, `createdAt`, `purgeAt` | `by_submissionId`, `by_eventModelId_and_createdAt`, `by_participationId_and_createdAt`, `by_status_and_purgeAt` | `submissionId` | da |
| `fairMessageTemplates` | `eventModelId`, `kind: immediate_confirmation\|post_event_follow_up`, `subject`, `plainText`, `html?`, `status`, `version`, `createdAt`, `updatedAt` | `by_eventModelId_and_kind_and_status` | (model, kind, version) | ne |
| `fairEmailDeliveries` | `dedupeKey`, `leadId?`⁶, `kind`, `recipient`, `status: queued\|sent\|failed\|suppressed`, `scheduledFor`, `attemptCount`, `providerMessageId?`, `lastError?`, `createdAt`, `updatedAt` | `by_dedupeKey`, `by_status_and_scheduledFor`, `by_leadId_and_kind` | `dedupeKey` | da (`recipient`) |

⁶ B0 odstupanje: opciono. `daily_report` i `exhibitor_delivery` nemaju lead.

### 3.5 Pasoš (piše B3)

`fairPassportConfigs` i `fairPassportEligibleModels` su B0 dizajn, jer HANDOFF imenuje tabele bez polja.

| Tabela | Polja | Indeksi | Jedinstveno | PII |
|---|---|---|---|---|
| `fairPassportConfigs` | `eventId`, `brandId`, `participationId`, `status: draft\|published\|withdrawn`, `frozenAt?`, `publishedAt?`, `createdAt`, `updatedAt` | `by_eventId_and_brandId`, `by_eventId_and_status` | (event, brand) | ne |
| `fairPassportEligibleModels` | `passportConfigId`, `eventId`, `brandId`, `eventModelId`, `status: required\|removed`, `removedAt?`, `removedByUserId?`, `createdAt` | `by_passportConfigId_and_status`, `by_eventModelId` | (config, model) | ne |
| `fairPassportStamps` | `visitorId`, `eventId`, `brandId`, `eventModelId`, `scannedAt` | `by_visitorId_and_eventId_and_brandId`, `by_visitorId_and_eventModelId` | (visitor, model) | da |
| `fairBrandFavoriteVotes` | `visitorId`, `eventId`, `brandId`, `eventModelId`, `createdAt`, `updatedAt` | `by_visitorId_and_eventId_and_brandId`, `by_eventId_and_brandId` | (visitor, event, brand) | da |

### 3.6 Izveštaji i sponzorisana rotacija (pišu B5 i B6)

| Tabela | Polja | Indeksi | Napomena |
|---|---|---|---|
| `fairReportRuns` | `eventId`, `eventDayId`, `participationId`, `status`, `dataThrough`, `format: pdf\|xlsx\|csv`, opciono: `storageId`, `recipient`, `providerMessageId`, `error`, `reviewedByUserId`, `reviewedAt`, `approvedByUserId`, `approvedAt`, `correctionOfReportRunId`; `createdAt`, `updatedAt` | `by_eventDayId_and_participationId`, `by_status_and_createdAt` | send samo iz `approved` |
| `fairSponsoredSnapshots` | `eventId`, `version`, `dayKey`, `seed`, `status: draft\|published\|retired`, `publishedAt?`, `publishedByUserId?` | `by_eventId_and_status`, `by_eventId_and_version` | jedan `published` po eventu (proverava mutacija) |
| `fairSponsoredSnapshotItems` | `snapshotId`, `eventModelId`, `order`, `audienceQuestionId?` | `by_snapshotId_and_order` | ograničena lista, poređana pri objavi |
| `fairSponsoredEvents` | `requestId`, `eventId`, `eventModelId`, `surface: "garage"`⁷, `kind: open_model\|garage_add`, `occurredAt`, `dateKey`, `hourKey`, `visitorId?` | `by_requestId`, `by_eventModelId_and_occurredAt`, `by_eventId_and_occurredAt` | PII (`visitorId`) |

⁷ JOVAN-DELTA §2 sužava HANDOFF §5.7 (`map | display | garage`). Mapa i displej nikad ne pišu sponzorisani događaj, a impression ne postoji nigde.

Šta ne postoji:
- `fairExhibitors`, `sajam*` tabele, view tabela ni impression tabela;
- tabela purge audita (HANDOFF §5.6, bez imena) dolazi u B7.

## 4. Tipovi ugovora (`lib/fair-contract.ts`)

| Tip | Sadržaj |
|---|---|
| `FairPackageTier`, `FAIR_PACKAGE_TIERS` | `included < starter < advanced` |
| Statusi i enumi | `FairEventStatus`, `FairModelStatus`, `FairParticipationStatus`, `FairStandStatus`, `FairQrAssignmentStatus`, `FairAudienceQuestionStatus`, `FairSurveyStatus`, `FairSurveyQuestionKind`, `FairLeadKind`, `FairContactRequirement`, `FairPreferredContact`, `FairConsentStatus`, `FairLeadStatus`, `FairMessageTemplateKind/Status`, `FairEmailDeliveryKind/Status`, `FairPassportConfigStatus`, `FairPassportEligibleStatus`, `FairReportStatus`, `FairReportFormat`, `FairSponsoredSnapshotStatus`, `FairSponsoredActionSurface` (`garage`), `FairSponsoredActionKind`, `FairClientSegment` |
| `FairEntitlements` | 14 prava iz HANDOFF §4.1 (`ratingMode` pokriva obe rating vrste) + `passportEligibleTier` |
| `FairModelCapabilities` | `ratingMode`, `canSubmitInterest`, `canRequestTestDrive`, `hasAudienceQuestions`, `hasSurvey`, `isSponsored` |
| `FairPublicEvent` (+ `days`) | javni event za `getEventBySlug` |
| `FairPublicModel` | HANDOFF §6 + `eventTitle`. `specificationGroups[].order` i `items[].order` dolaze sa servera. |
| `FairAudienceQuestionView`, `FairAudienceResultView` | rezultat je `waiting_for_minimum` (samo `myOptionId?`, bez procenta) ili `public` (celobrojni procenti po opciji) |
| `FairRatingState` | **samo lične ocene**; nikad count/sum/prosek/prag (DELTA §1) |
| `FairPassportState` | katalog aktivnih pasoša (eligible modeli, štandovi) + lični `N/M`, `completed`, favorit i rezultat favorita sa pragom |
| `FairSponsoredModelCard`, `FairSponsoredRotationView` | poređane stavke, `epochMs`, `intervalMs`, `seed`, `version`, `dayKey`; `visual: photo\|brand_logo\|event_placeholder` |
| `FairErrorCode`, `FairResult<T>` | vidi §6 |

Konstante:
- `FAIR_EVENT_TIMEZONE`;
- `FAIR_PUBLIC_VOTE_THRESHOLD = 5`;
- `FAIR_MAX_HIGHLIGHT_SPECIFICATIONS = 4`;
- `FAIR_MAX_SPECIFICATIONS_PER_MODEL = 100` (tehnički limit);
- `FAIR_MAX_MODEL_IDS_PER_READ = 50`;
- `FAIR_MAP_ROTATION_INTERVAL_MS = 12000`, `FAIR_GARAGE_ROTATION_INTERVAL_MS = 8000`;
- `FAIR_SURVEY_MAX_QUESTIONS = 5`;
- `FAIR_AUDIENCE_OPTIONS_MIN = 2`, `FAIR_AUDIENCE_OPTIONS_MAX = 5`;
- `FAIR_RATING_MIN/MAX`;
- `FAIR_PII_PURGE_AT_MS`.

Helperi: `isFairVisitorHash`, `isFairRatingValue`, `fairClientSegmentOf`.

## 5. Paketna prava (`lib/fair-entitlements.ts`)

| Pravo | included | starter | advanced |
|---|---:|---:|---:|
| `publicModelPage` | da | da | da |
| `garage` | da | da | da |
| `standScanTotals` | da | da | da |
| `modelAnalytics` | ne | da | da |
| `ratingMode` | `none` | `overall` | `dimensions` |
| `interest` | ne | da | da |
| `audienceQuestionsPerDay` | 0 | 1 | 5 |
| `dailyReport` | ne | da | da |
| `testDrive` | ne | ne | da |
| `survey` | ne | ne | da |
| `postEventFollowUp` | ne | ne | da |
| `sponsoredMapRotation` | ne | ne | da |
| `sponsoredGarageRotation` | ne | ne | da |
| `passportEligibleTier` | ne | da | da |

Funkcije:

| Funkcija | Pravilo |
|---|---|
| `getFairEntitlements(tier)`, `fairTierRank(tier)` | čitanje kataloga i redosleda |
| `fairPackageChangeProblem(from, to)` → `null \| "same_tier" \| "downgrade"`; `canUpgradeFairPackage` | samo naviše. `included → advanced` je dozvoljen jer je naviše (otvoreno pitanje 9.12). |
| `fairTierAt(history, at)` | aktivacija važi od svog trenutka |
| `fairFeatureActiveAt(history, feature, at)`, `fairFeatureSince(history, feature)` | **bez retroaktivnosti**: plaćena interakcija se sudi po paketu u trenutku interakcije |
| `fairScanCountsInAnalytics()` | uvek `true`: skeniranja pre nadogradnje ostaju |
| `fairAudienceQuestionLimit(tier)` | 0/1/5 |
| `fairAudienceQuestionsRemaining(tierNow, publishedForDay)` | posle nadogradnje u toku dana ukupno 5, uključujući već iskorišćeno Starter pitanje |
| `fairRatingInputProblem(tier, input)` | Starter tačno `overall`; Advanced bez `overall`, neprazan podskup 3 dimenzije; celi brojevi 1–5; `included` → `FEATURE_NOT_ENTITLED` |
| `fairAnalyticsScope(tier)` | `stand_totals` ili `model` |
| `fairBrandPassportEligible(models)` | najmanje 2 izložena modela, svi Starter+ |
| `deriveFairCapabilities(tier, context)` | prava × stvarni sadržaj (otvoreno pitanje danas, objavljena anketa, snapshot, `fairLeadConfigs.enabled`) |

## 6. Error kodovi

Iz HANDOFF §6 i `_ZAJEDNICKO`:
- `FAIR_MODEL_NOT_FOUND`
- `FEATURE_NOT_ENTITLED`
- `CONSENT_REQUIRED`
- `CONSENT_NOT_CONFIGURED`
- `RATE_LIMITED`
- `SUBMISSION_DUPLICATE`
- `EVENT_NOT_ACTIVE`

B0 dodaci (traže ih testovi iz §12):
- `INVALID_INPUT`
- `CONTACT_REQUIREMENT_NOT_MET`
- `QUESTION_NOT_OPEN`
- `SURVEY_ALREADY_SUBMITTED`
- `PASSPORT_NOT_COMPLETE`

B2 dodaci (POST gateway `app/api/fair/**`):
- `ORIGIN_NOT_ALLOWED` (403, zahtev nije same-origin)
- `PAYLOAD_TOO_LARGE` (413)
- `VISITOR_UNAVAILABLE` (503, u produkciji nema `FAIR_VISITOR_HASH_SECRET`)

B3 dodaci:
- `PASSPORT_NOT_ACTIVE` (404, pasoš ne postoji ili nije `published`)
- `SURVEY_NOT_OPEN` (409, verzija ankete nije `published`)
- `SERVICE_UNAVAILABLE` (gateway: Convex nije podešen 503, ili greška bez stabilnog koda 502)

B3 admin kodovi (`FAIR_ADMIN_ISSUE_CODES`): `FAIR_FEATURE_NOT_ENTITLED`, `FAIR_EVENT_DAY_NOT_FOUND`, `FAIR_QUESTION_NOT_FOUND`, `FAIR_QUESTION_LOCKED`, `FAIR_QUESTION_DAY_LIMIT`, `FAIR_QUESTION_STATUS`, `FAIR_SURVEY_NOT_FOUND`, `FAIR_SURVEY_INVALID`, `FAIR_SURVEY_LOCKED`, `FAIR_PASSPORT_NOT_FOUND`, `FAIR_PASSPORT_NOT_ELIGIBLE`, `FAIR_PASSPORT_FROZEN`, `FAIR_PASSPORT_EVENT_STARTED`.

B4: lead tok koristi postojeće kodove (`CONSENT_NOT_CONFIGURED`, `CONSENT_REQUIRED`, `CONTACT_REQUIREMENT_NOT_MET`, `FEATURE_NOT_ENTITLED`, `SUBMISSION_DUPLICATE`, `RATE_LIMITED`, `EVENT_NOT_ACTIVE`, `FAIR_MODEL_NOT_FOUND`, `INVALID_INPUT`). Novi admin kodovi: `FAIR_CONSENT_NOT_FOUND`, `FAIR_CONSENT_STATUS`, `FAIR_CONSENT_EXHIBITOR_MISSING`, `FAIR_LEAD_NOT_FOUND`, `FAIR_EMAIL_DELIVERY_NOT_FOUND`, `FAIR_EMAIL_DELIVERY_STATUS`. Greška isporuke (`fairEmailDeliveries.lastError`) je stabilan prefiks iz `FAIR_EMAIL_DELIVERY_ERRORS` (`RESEND_NOT_CONFIGURED`, `FOLLOW_UP_TEMPLATE_MISSING`, `LEAD_MISSING`, `PROVIDER_REJECTED`, `PROVIDER_UNAVAILABLE`) + `:` + HTTP status ili `network`; nikad poruka provajdera ni adresa.

Detalji greške su samo ne-PII vrednosti. Tekst greške mapira frontend kroz `lib/i18n`.

## 7. Formati i ključevi

| Pojam | Format |
|---|---|
| `dateKey` | `YYYY-MM-DD`, kalendarski dan u `Europe/Belgrade`. B2: `fairTimeKeys(at)` u `convex/lib/fairScans.ts` (preko `belgradeParts` iz `lib/belgrade-time.ts`, ista vrednost kao `belgradeDateKey`). |
| `hourKey` | `YYYY-MM-DDTHH` (24 h), `Europe/Belgrade`, isti `fairTimeKeys`. Na jesenji DST prelaz (25. 10.) ponovljeni sat 02 ima isti ključ. |
| `visitorHash` | lowercase 64-char hex (HMAC na Next serveru). Raw token nikad ne ulazi u Convex, URL ni log. |
| PII purge | `FAIR_PII_PURGE_AT_MS` = 16. 11. 2026. u 00:00 po Beogradu (2026-11-15T23:00Z). Isto važi za `fairEvents.piiPurgeAt`, `fairLeads.purgeAt` i istek cookie-ja. |
| Shard ključ | B2 (§13.4): `<metrika>:<opseg>:<id>[:<dateKey>|:<hourKey>]`, metrika `scan_total`/`scan_unique`, opseg `model`/`stand`; npr. `scan_total:model:<id>:2026-10-09T14`. |
| Rotacija | `items` su poređane po `fairSponsoredSnapshotItems.order`. Klijent zove `getFairRotationSlot({ epochMs, nowMs, intervalMs, itemCount })` iz `lib/fair-client/rotation-slot.ts`. Predlog za B5: `epochMs` = `publishedAt` objavljenog snapshot-a. |

## 8. Za frontend (Kodeksov fixture → ovaj ugovor)

| `lib/fair-client/model-fixtures.ts` | Ugovor | Napomena |
|---|---|---|
| `modelSlug` | `slug` | HANDOFF §6 |
| `eventTitle` / `eventName` | `eventTitle` (= `fairEvents.title`, npr. „Auto Moto Fest“) | krovni „Sajam automobila“ ostaje i18n tekst shell-a |
| nema | `participationId`, `brandId`, `standId`, `standMapLocationId`, `variant?` | novo |
| grupa `{id,label,items}` | `{id,label,order,items}` | redosled dolazi sa servera |
| stavka `shortLabel`, `icon` | nema | nema izvora podataka (pitanje 9.6) |
| `description` | nema | nije u HANDOFF ni CSV-u (pitanje 9.6) |
| `photoPresentation` | nema | prezentacioni izbor UI-ja |
| ocena `design` | `appearance` | HANDOFF §5.3 |
| mod `free` | tier `included` | frontend ionako čita samo `capabilities` |
| `FairModelCapabilitiesFixture` | `FairModelCapabilities` | ista polja |
| procenti Glasa publike iz fixture-a/localStorage | `FairAudienceResultView` sa servera | ispod 5 glasova nema procenata |
| garaža `lastKnown.modelSlug` | `FairPublicModel.slug` | lokalni zapis garaže ostaje Kodeksov |

Konstante rotacije u `lib/fair-contract.ts` imaju ista imena i vrednosti kao u `rotation-slot.ts`.

## 9. Otvorena pitanja (za Aleksu/Jovana)

1. **HANDOFF §17**: B1 počinje pre Aleksinog pregleda B0. To je Jovanova odluka u runneru, ne Aleksino odobrenje.
2. **Status `EVENT-DESIGN-SYSTEM` za mapu**: važi li „zaključan za prvi slice“ i za M1/M2? MASTER §17 i dalje kaže „draft“.
3. **Poddomen `sajam.scanme.rs`** naspram zaključanog glavnog domena (trošak je u `jovan-status/C0.md` §4g).
4. **CSV → JSON normalizator**: ko ga piše? Predlog: Jovan u B1, kao čist modul nad `scripts/events/validate-csv-intake.mjs` (samo import).
5. **Specifikacije**: `04-specifications.csv` nema grupu ni highlight, a DELTA §3 ih traži. Dodati kolone ili uvesti pravilo?
6. **Opis modela, `shortLabel` i ikonice** (fixture, EDS §9) nisu u HANDOFF-u ni CSV-u. Da li ulaze u V1?
7. **Naslov ankete** (sada opciono polje).
8. **„View“ stranice modela** (HANDOFF §5.2) nema tabelu i nije metrika u MASTER §12. Da li ulazi u V1?
9. **PDF obećava „Završni izveštaj“ i agregat za organizatora**, a `fairReportRuns` traži `eventDayId` i `participationId`.
10. **Isti brend kod dva izlagača**: `brands` je account-scoped, pa to znači dva pasoša. Pored toga, kako se `brand/account/business_external_key` vezuju za postojeće zapise (`smkCode`, `smlCode`, naziv)?
11. **Purge trenutak**: početak (predlog) ili kraj 16. 11.?
12. **Direktan `included → advanced`**: B0 ga dozvoljava.
13. **PII primaoci izlagača** (`pii_recipient_*`, kanal): nova polja ili samo `leadDeliveryNote`?
14. **Nalog „Sajam automobila 2026 — QR inventar“**: da li je `event_only`? Da li su nalepnice digitalni QR ili fizički proizvodi (QC gate)?
15. **Saglasnost mora imenovati konkretnog izlagača**, a `fairConsentConfigs` je po eventu i vrsti. B4 renderuje snapshot sa imenom izlagača kad pravni tekst bude odobren.
16. **Početni red u `fairPackageActivations`**: kad se model uvozi direktno kao Starter/Advanced, B1 piše red `included → tier` u trenutku `package_active_from` (`note: "initial_tier"`). Primenjeno kao lako promenljiv seam; čeka potvrdu.
17. **Deljena lokacija na mapi (R0 nalaz 1)**: B1 seam `validateMapLocationIds` odbija dva ne-povučena štanda sa istim `mapLocationId` u istom eventu, kako traži B1 uputstvo. Ako Aleksa potvrdi da je deljena lokacija legitimna, menja se samo provera „taken“ u tom seam-u (`convex/lib/fairCatalog.ts`).
18. **Pisac brendova**: aplikacija nije imala mutaciju koja pravi `brands` red. B1 dodaje `fairAdmin.ensureBrand` (ista `brands` tabela, bez logotipa i boja). Da li brend treba da nastaje ovde ili u redovnom klijentskom toku?
19. **Oslobađanje QR-a**: `accessDestinationHistory.targetId` je obavezan i ne postoji „prazna“ destinacija, pa release ne piše novi target. Prekidač je aktivni `fairQrAssignments` red: posle release kanal prelazi u `problem` (`destination_fair_unassigned`), a ponovna dodela piše novi immutable target i red istorije.
20. **Nadogradnja pre početka paketa**: ako je početni paket uvezen sa budućim `package_active_from`, nadogradnja uneta ranije važi od tog trenutka (`max(sada, packageActivatedAt)`), da istorija nikad ne izgleda kao spuštanje paketa.
21. **Nalog QR inventara**: inventar se vezuje po eventu (`fairEvents.qrInventoryBusinessId`), pa oba sajma mogu deliti isti inventar. Dodeljuje se samo `kind: "qr"` kanal čiji subjekat ima tačno jedan kanal (fizička nalepnica sa QR+NFC na istom subjektu se odbija — vezano za §9.14).
22. **Tajna `FAIR_VISITOR_HASH_SECRET`** (B2): pravu vrednost (32+ nasumičnih znakova) postavljaju Jovan i Aleksa u Next okruženje (Vercel/`.env.local`). Convex je ne treba. Bez nje produkcija ne upisuje fair skenove (redirect radi).
23. **Domen cookie-ja / poddomen** (B2, nastavak §9.3): `FAIR_COOKIE_DOMAIN` je prazan, pa je cookie host-only na glavnom domenu. Poddomen se ne implementira (§13.7).
24. **„Jedinstveno skeniranje štanda“** (B2): implementirano po MASTER §5 kao zbir jedinstvenih parova posetilac+QR modela tog štanda. Ako izveštaj treba „različiti posetioci štanda“, to je nova metrika (računa se iz sirovih redova pre purge-a).
25. **Admin sken i pečat pasoša** (B2): admin sken ne daje pečat (konzervativno: admin je van svih metrika, a pečat vodi do javnog rezultata favorita). B3 može da promeni jednom proverom u `recordFairScan`.
26. **Objavljen model u `draft` događaju** (B2): `/r` i `getModelBySlug` ga otvaraju (kapija je samo status modela, kao B1 `resolveTest`), a `getEventBySlug` za `draft` vraća `null`. Da li i `draft` događaj treba da sakrije modele?
27. **Generički `cardResolve` po IP-u** (300/min, kapacitet 300) i dalje prethodi fair grani. Za halu iza jednog NAT-a to je granica celog sajma u minuti; procena je ispod nje, ali je treba potvrditi testom opterećenja (B7).
28. **Jedinstveni sken po danu/satu** (B2): pripisuje se danu/satu PRVOG skena posetilac+model; zbir dana = ukupno jedinstvenih. „Jedinstveni posetioci po danu“ bi bila nova metrika.
29. **Prozor pitanja Glasa publike** (B3): bez eksplicitnog `endsAt` pitanje važi od početka do kraja svog sajamskog dana (`fairEventDays`), jer je pravo „po sajamskom danu“. Glas van prozora → `QUESTION_NOT_OPEN`. Treba li pitanje da ostane otvoreno i narednih dana?
30. **Zatvoreno pitanje i dnevni limit** (B3): svako pitanje koje je tog dana bilo objavljeno (i kasnije zatvoreno) troši dnevni limit, pa Starter ne može istog dana da zameni pitanje. Ovo je konzervativno tumačenje „jedno pitanje po danu“.
31. **Kandidatura za pasoš** (B3): objava traži da su SVI izloženi (ne-povučeni) modeli brenda objavljeni, `passportEligible` i Starter+. Model sa `passport_eligible=no` blokira pasoš celog brenda (DATA-INTAKE §6.3 + MASTER §11 „svi izloženi modeli“). Ili treba samo da ga isključi iz skupa?
32. **Povlačenje modela iz zamrznutog pasoša** (B3): `fairAdmin.withdrawModel` ne uklanja model iz pasoša automatski; admin to radi hitnom mutacijom `removePassportModel` (MASTER §11 „admin može da ga ukloni“). Dok se model ne ukloni, pasoš ne može da se kompletira.
33. **Pasoš posle otvaranja** (B3): objava i zamrzavanje su dozvoljeni samo pre `fairEvents.startsAt` (`FAIR_PASSPORT_EVENT_STARTED`). Ako Aleksa želi kasnu objavu, menja se samo ta provera.
34. **Rate limit `fairBrandFavorite`** (B3): HANDOFF §9 ga ne imenuje. Dodat je zaseban bucket (kapacitet 5, 10/min), jer promena favorita pomera brojače.
35. **Prikaz pre `package_active_from`** (B3): javne `capabilities` i `getMyModelState.rating.mode` čitaju sačuvani paket (upit ne sme da čita sat). Upis sudi po paketu na snazi u trenutku interakcije. Zato pre početka paketa UI može da prikaže ocenu, a upis vraća `FEATURE_NOT_ENTITLED`. DEV TEST paketi počinju 9. 10. 2026. u 09:00.
36. **Obavezno pitanje ankete** (B3): u V1 su pitanja opciona. Ako admin ipak označi pitanje kao `required`, submit bez tog odgovora vraća `INVALID_INPUT`.
37. **Pravni tekst saglasnosti (P0)** (B4): nije napisan ni aktiviran, ni na DEV-u. Dok aktivna verzija ne postoji, `submitLead` vraća `CONSENT_NOT_CONFIGURED` i ništa ne čuva, a `getLeadForm` vraća `consent_not_configured`. Tekst mora da sadrži oznaku `{izlagac}`, koju server zamenjuje nazivom izlagača (§9.15).
38. **Tekst potvrde i podnožje follow-upa (P1)** (B4): placeholder u `lib/i18n/sr/event-lead-email.ts`. Zamenjuje se pre aktivacije saglasnosti u produkciji.
39. **Adresa za odgovor** (B4): potvrda kaže da posetilac odgovorom otkazuje follow-up. `FAIR_EMAIL_REPLY_TO` nije postavljen ni na jednom deploymentu, pa odgovor ide na `RESEND_FROM_EMAIL`. Koja nadgledana ScanMe adresa prima te odgovore?
40. **Trenutak follow-upa** (B4): prvi 10:00 po Beogradu najmanje 24 h posle `fairEvents.endsAt`, uvek u prozoru 24–48 h. Lead stigao posle tog trenutka, a pre 48 h, dobija follow-up odmah; posle 48 h ga ne dobija. Potvrditi sat i da je `endsAt` „kraj sajma“.
41. **Jedan follow-up po leadu** (B4): posetilac koji na istom Naprednom modelu pošalje i `Zainteresovan sam` i `Probna vožnja` dobija dva follow-upa. Treba li jedan po posetiocu i modelu?
42. **Follow-up bez teksta izlagača** (B4): ne šalje se (`failed: FOLLOW_UP_TEMPLATE_MISSING`); posle unosa teksta admin ga ponovo pokreće (DATA-INTAKE §6.7: „ne izmišljati ponudu“).
43. **Lead samo sa telefonom** (B4): čuva se, ali nema email potvrdu ni follow-up. Potvrdu vidi samo u UI-ju posle uspešnog upisa.
44. **Zloupotreba potvrda** (B4): `fairLeadSubmit` je po posetiocu i modelu. Nov cookie znači nov bucket, a `submitLead` je javna mutacija kao i B3 mutacije, pa neko može da pošalje mnogo potvrda na tuđu adresu. Predlog za B7: limit po primaocu (hash adrese) i/ili zajednička tajna gateway → Convex.
45. **`capabilities` i saglasnost** (B4): `canSubmitInterest`/`canRequestTestDrive` i dalje znače „paket + uključen obrazac“ (B2). Aktivna saglasnost se vidi samo u `getLeadForm.state`; frontend ne prikazuje obrazac za `consent_not_configured`.
46. **Predaja leadova izlagaču** (B4 → B6): `fairLeads.status: delivered`/`deliveredAt` i PII fajl (CSV/XLSX) još ne postoje. B4 daje paginiran admin `exportLeads`. Kanal i primaoci su P0.2.
47. **Import `test_drive_*`** (B4): kolone iz `03-models.csv` još se ne uvoze u `fairLeadConfigs`; admin ih podešava u tabu `Leadovi`. DATA-INTAKE §6.3 piše `any`, a ugovor `one_of`.
48. **Purge leadova** (B4 → B7): `fairEmails.purgeLeadPiiBatch` briše outbox i leadove u ograničenim serijama, i to tek od `FAIR_PII_PURGE_AT_MS` (pre toga samo `dryRun`). Zakazivanje 16. 11., audit i ostale visitor tabele su B7.

## 10. Šta stiže posle B0

| Korak | Sadržaj |
|---|---|
| **B1** (urađeno, §11–§12) | `fairAdmin`, import (dry-run/commit), QR assign/release kroz `fair_model` destinaciju (isti subject → target → istorija → sync kanala tok kao `applyDestination`), filtriranje `event_only` u admin upitima, upgrade sa auditom, DEV TEST katalog |
| **B1A** | admin tab `Događaji` |
| **B2** (urađeno, §13–§14) | gateway, cookie i HMAC; fair hook u `resolveAndRecord` sa istim `requestId`; admin isključenje preko Convex Auth tokena; shard helper; `fairScan` rate limit; pečat pasoša; `fairPublic` katalog |
| **B3** (urađeno, §15–§16) | ocene, Glas publike, anketa, pasoš i favorit |
| **B4** (urađeno, §17–§18) | leadovi, saglasnost i email outbox (produkcija čeka pravni tekst) |
| **B5** | sponzorisani snapshot i rotacija (samo garažni `open_model`/`garage_add`) |
| **B6** | analitika i izveštaji |
| **B7** | purge, authz, performance i integracioni test |

## 11. B1 funkcije (stvarna površina)

Sve funkcije osim DEV fixture-a su `query`/`mutation` sa `requireAdmin`: ne-admin i anonimni poziv se odbijaju (test). Greške su `ConvexError({ code, details? })` sa kodovima iz `FAIR_ADMIN_ISSUE_CODES` (`lib/fair-contract.ts`). Validacioni nalazi su `FairAdminIssue { severity: error|warning, code, path, details? }`. Tekst greške mapira admin UI (B1A) kroz `lib/i18n`.

| Funkcija | Vrsta | Ključ idempotencije | Šta radi |
|---|---|---|---|
| `fairAdmin.upsertEvent` | admin mutation | `code` | event; konstante `timezone`, `piiPurgeAt`, prag 5, `robotsIndexable: false`; `slug` jedinstven; `qrInventoryBusinessId` mora postojati |
| `fairAdmin.upsertEventDay` | admin mutation | (event, `dateKey`) | granice dana u `Europe/Belgrade` (`belgradeDayBounds`); dan mora seći prozor eventa |
| `fairAdmin.upsertParticipation` | admin mutation | (event, `externalKey`) | account, business i kontakt moraju postojati i pripadati istom nalogu; drugi klijent pod istim ključem ili drugi ključ za isti business = hard error |
| `fairAdmin.upsertStand` | admin mutation | (event, `externalKey`) | učešće iz istog eventa; `mapLocationId` kroz seam `validateMapLocationIds` |
| `fairAdmin.ensureBrand` | admin mutation | (account, normalizovan naziv) | pravi brend u postojećoj `brands` tabeli ako ne postoji (§9.18) |
| `fairAdmin.upsertModel` | admin mutation | (event, `externalKey`) | brend mora pripadati nalogu učešća, štand istom učešću; slug iz naziva + varijante pri kreiranju, posle je stabilan; specifikacije se normalizuju (≤100, ≤4 highlight, jedinstven `order`); bez cene → fallback + upozorenje; `photoUrl` samo https; paket se postavlja samo pri kreiranju (+ početna aktivacija), kasnije samo kroz `upgradePackage`; status se ovde ne menja |
| `fairAdmin.publishModel`, `withdrawModel` | admin mutation | ciljni status | publish validacija (§11.1); vraća upozorenja |
| `fairAdmin.upgradePackage` | admin mutation | — | samo naviše (`fairPackageChangeProblem`); `packageTier`, `packageActivatedAt` i `fairPackageActivations` red u istoj mutaciji; QR dodela i target se ne diraju |
| `fairAdmin.createEventClient` | admin mutation | `smkCode` | isti kanonski `accounts` + `accountContacts` + `businesses` zapisi kao kod redovnog klijenta, sa `clientSegment: "event_only"`; zauzet SMK/SML = hard error |
| `fairAdmin.listEventClients` | admin query (paginirano) | — | `accounts.by_clientSegment = "event_only"` |
| `fairAdmin.convertEventClientToStandard` | admin mutation | — | patchuje isti account i njegove read-model redove u `standard`; ništa se ne kopira |
| `fairAdmin.assignQr` | admin mutation | (kanal, model) | postojeći QR kanal inventara eventa → `fairQrAssignments` + novi `cardTargets` (`fair_model`) + `accessDestinationHistory` + sync kanala, atomski; najviše 1 aktivna dodela po kanalu i po modelu |
| `fairAdmin.releaseQr` | admin mutation | aktivna dodela modela | `released` + sync kanala u `problem` (§9.19) |
| `fairAdmin.listQrInventory` | admin query (paginirano, ≤100) | — | kartice inventara + stanje kanala + aktivna dodela |
| `fairAdmin.resolveTest` | admin query | — | isti `cardResolution` i kapije kao `/r/[cardCode]`, bez upisa scan-a; vraća `path` = `/sajam/{eventSlug}/model/{modelSlug}` kada bi se model otvorio. Od B2 živa ruta otvara isti `path` i beleži jedan scan (§13). |
| `fairAdmin.listEvents`, `getEventCatalog`, `listValidationIssues` | admin query | — | bounded (≤500 redova po tabeli po eventu); `listValidationIssues` računa publish nalaze iz jednog snimka, bez čitanja po modelu |
| `fairImport.dryRun` | admin **query** | — | ne može da piše; vraća sve greške, upozorenja i rezime |
| `fairImport.commit` | admin mutation | event + `externalKey` | isti plan; ako ima i jednu grešku, ne piše ništa; drugi identičan commit ne menja nijedan fair/QR red (piše samo audit red) |
| `fairDevFixtures.seedTestCatalog` | **internal** mutation | TEST ključevi | DEV TEST katalog (§11.2) |

### 11.1 Publish validacija

Greške:
- event ne postoji;
- učešće je povučeno;
- štand ne postoji, povučen je ili `mapLocationId` ne prolazi seam;
- broj specifikacija nije 1–100 (DATA-INTAKE §5.6);
- više od 4 `isHighlight`;
- slug nije ispravan ili nije jedinstven u eventu;
- `priceText` je prazan.

Upozorenja:
- cena je fallback `Cena na upit`;
- nema fotografije (fotografija je opciona);
- nema aktivne QR dodele (fizička provera skeniranjem je poseban ljudski korak, DATA-INTAKE §7).

### 11.2 DEV TEST katalog

Komanda je `npx convex run fairDevFixtures:seedTestCatalog` (samo DEV). Upisuje se kroz isti `fairImport` commit tok:
- dva TEST događaja (`test-elektromobilnost-2026`, `test-auto-moto-fest-2026`), po 3 dana u `Europe/Belgrade`, status `published`;
- tri TEST `event_only` klijenta: izlagač A, izlagač B i „TEST Sajam automobila 2026 — QR inventar“ (postavljen kao `qrInventoryBusinessId`);
- 3 TEST brenda, 4 učešća i 5 štandova sa privremenim `test-loc-*` lokacijama;
- 10 objavljenih TEST modela kroz sva 3 paketa: TEST specifikacije, bez fotografija, cena „TEST cena“ ili fallback.

QR kodovi se ne prave.

## 12. Import JSON v1 i mapiranje CSV kolona

Jedan dokument po eventu. Nepoznata polja odbija Convex validator. Datum i vreme su ISO 8601 sa zonom.

```json
{
  "version": 1,
  "eventCode": "elektromobilnost-2026",
  "participations": [
    {
      "externalKey": "elektromobilnost-2026-enigma-motors",
      "accountExternalKey": "SMK-…",
      "businessExternalKey": "SML-…",
      "clientSegment": "event_only",
      "reportEmail": "izvestaji@…",
      "primaryContactEmail": "kontakt@…",
      "leadDeliveryNote": "…",
      "brands": [
        {
          "externalKey": "volta",
          "name": "Volta",
          "stand": { "externalKey": "elektromobilnost-2026-stand-a12", "code": "A12", "displayName": "…", "mapLocationId": "…" },
          "models": [
            {
              "externalKey": "elektromobilnost-2026-volta-x1-premium",
              "displayName": "Volta X1",
              "variant": "Premium",
              "slug": "volta-x1-premium",
              "priceText": "…",
              "packageTier": "starter",
              "packageActiveFrom": "2026-10-09T09:00:00+02:00",
              "assignedResolverCode": "…",
              "specifications": [
                { "label": "Snaga", "value": "…", "order": 1, "id": "snaga", "groupId": "pogon", "groupLabel": "Pogon", "groupOrder": 1, "isHighlight": true }
              ],
              "photoUrl": "https://…",
              "passportEligible": true,
              "sortOrder": 1
            }
          ]
        }
      ]
    }
  ]
}
```

Obavezna polja:
- `version`, `eventCode`;
- `participations[]`: `externalKey`, `accountExternalKey`, `businessExternalKey`, `brands`;
- `brands[]`: `externalKey`, `name`, `stand`, `models`; `stand`: `externalKey`, `code`, `mapLocationId`;
- `models[]`: `externalKey`, `displayName`, `packageTier`, `specifications`, `passportEligible`;
- `specifications[]`: `label`, `value`, `order`.

Sve ostalo je opciono.

Pravila:
- Postojeći klijent se traži po `accounts.smkCode` i `businesses.smlCode` (§9.10), a brend po (nalog, normalizovan `name`). Sve mora postojati i biti povezano, inače je hard error.
- Ako je `clientSegment` naveden, mora biti jednak sačuvanom; konverzija je posebna admin akcija.
- Isti `stand.externalKey` sme da se ponovi samo sa istim podacima i istim učešćem. Bez `stand.displayName` štand dobija naziv brenda.
- Bez `slug` se slug pravi iz `displayName` + `variant`, i to samo pri kreiranju.
- Specifikacija bez `groupId` ide u grupu `general` sa praznim `groupLabel`; bez `isHighlight` je `false`; bez `id` je `spec-<order>`.
- Viši `packageTier` od sačuvanog je nadogradnja sa audit redom; niži je hard error.
- `assignedResolverCode` mora biti postojeći slobodan QR kanal inventara eventa (`fairEvents.qrInventoryBusinessId`). Kod koji je već dodeljen istom modelu ne menja ništa.
- Hard error: nepostojeći ili konfliktan link; dupli ključ, slug, `mapLocationId` (§9.17) ili QR; zauzet QR; downgrade; neispravna specifikacija ili više od 4 highlight-a.
- Upozorenje: nema cene (upisuje se `Cena na upit`), nema fotografije, nema QR-a.
- Limit: najviše 100 učešća i 200 modela po importu.

| CSV (`templates/`) | Kolona | JSON v1 |
|---|---|---|
| `01-exhibitors.csv` | `event_code` | `eventCode` |
| | `participation_external_key` | `participations[].externalKey` |
| | `account_external_key` / `business_external_key` | `accountExternalKey` (SMK kod) / `businessExternalKey` (SML kod) |
| | `client_segment` | `clientSegment` |
| | `report_email` | `reportEmail` |
| | `primary_contact_email` | `primaryContactEmail` (kontakt mora već postojati na nalogu) |
| | `pii_recipient_*`, `pii_delivery_channel`, `report_delivery_time_note` | nema polja (§9.13); po dogovoru u `leadDeliveryNote` |
| | `exhibitor_name`, `primary_contact_name`, `primary_contact_phone`, `source_reference`, `internal_notes` | ne uvozi se (klijent i kontakt već postoje) |
| `02-brands-stands.csv` | `brand_external_key`, `brand_name` | `brands[].externalKey`, `brands[].name` |
| | `stand_external_key`, `stand_code`, `map_location_id` | `brands[].stand.externalKey`, `.code`, `.mapLocationId` |
| | `logo_source` | ne uvozi se (logo ostaje u `brands`) |
| `03-models.csv` | `model_external_key`, `display_name`, `variant` | `models[].externalKey`, `.displayName`, `.variant` |
| | `price_text` (+ `price_confirmed=no`) | `models[].priceText`; prazno → fallback + upozorenje |
| | `package_tier`, `package_active_from` | `.packageTier`, `.packageActiveFrom` |
| | `passport_eligible` (`yes`/`no`) | `.passportEligible` (`true`/`false`; prazno se ne sme normalizovati u `false` — dopuniti pre importa) |
| | `photo_source` | `.photoUrl`, samo kad je odobren https URL |
| | `publication_status` | ne uvozi se; objava je `fairAdmin.publishModel` |
| | `test_drive_*` | B4 (`fairLeadConfigs`), ne B1 |
| `04-specifications.csv` | `display_order`, `label`, `value` | `models[].specifications[].order`, `.label`, `.value`; grupa i highlight nemaju kolonu (§9.5) |
| `08-qr-assignments.csv` | `resolver_code` | `models[].assignedResolverCode` |
| | `assignment_status`, `verification_*` | ne uvozi se (fizička provera je ljudski korak) |
| `05`–`07` | pitanja, ankete, follow-up | B3/B4 |

Normalizator CSV → JSON još ne postoji (§9.4); ovaj oblik je njegova meta. `scripts/events/validate-csv-intake.mjs` ostaje lokalna priprema pre `dryRun`.

## 13. B2 — anonimni identitet i scan pipeline (stvarna površina)

### 13.1 Tok podataka cookie → hash → Convex

1. **Ulaz.** Štampani QR vodi samo na postojeći `GET /r/[cardCode]`. Direktna poseta (bez skena) može da pozove `POST /api/fair/visitor` (bootstrap) da uređaj dobije identitet.
2. **Cookie** (`lib/fair-server/visitor.ts`, `import "server-only"`):
   - ime `scanme_fair_visitor`; vrednost je `visitorToken` = 32 bajta (256 bita) iz CSPRNG-a (`crypto.randomBytes`), base64url, 43 znaka;
   - atributi `Path=/; HttpOnly; Secure; SameSite=Lax`, `Expires`/`Max-Age` do `FAIR_PII_PURGE_AT_MS` (16. 11. 2026. 00:00 po Beogradu = `Sun, 15 Nov 2026 23:00:00 GMT`);
   - `Domain` samo ako je postavljen `FAIR_COOKIE_DOMAIN` (validan domen); prazno = host-only na glavnom domenu;
   - postojeći ispravan cookie se ponovo koristi (nema novog `Set-Cookie`); neispravan se zamenjuje novim tokenom; posle trenutka purge-a identitet se ne pravi.
3. **Hash** (na Next serveru): `visitorHash = HMAC-SHA256(FAIR_VISITOR_HASH_SECRET, "scanme-fair-visitor-v1:" + token)` kao lowercase hex (64 znaka). Tajna je samo u Next okruženju, najmanje 32 znaka.
4. **Convex** dobija samo `visitorHash`:
   - `/r`: kao arg `fairVisitorHash` u `cards.resolveAndRecord`, uz isti serverski `requestId` (`crypto.randomUUID()`);
   - B3 gateway mutacije: isto, iz istog cookie-ja.
5. **Gde token NE ide:** URL, query, telo odgovora, Convex (argumenti i tabele), klijentski JavaScript (HttpOnly), log. Hash ne ide u URL ni u klijent; u Convex-u je samo u `fairVisitors.visitorHash`. Rate limiter je ključan po `fairVisitors._id`, ne po hash-u.
6. **Bez tajne:**
   - produkcija (`NODE_ENV=production`): nema identiteta ni cookie-ja; `/r` i dalje beleži generički scan i preusmerava na model (`fairScan: "no_visitor"`); bootstrap vraća `503 VISITOR_UNAVAILABLE`;
   - development: jasno označen DEV-ONLY ključ.

### 13.2 Šta se loguje

| Gde | Šta | Bez |
|---|---|---|
| Next server (`console.warn`, jednom po procesu) | `[fair] FAIR_VISITOR_SECRET_MISSING` (produkcija bez tajne) ili `[fair] FAIR_VISITOR_SECRET_DEV_FALLBACK: …` (development) | tokena, hash-a, IP-a, kontakta |
| Next dev request log | metoda, putanja, status, vreme (npr. `GET /r/0HENT03A 302`) | cookie-ja i tokena |
| Convex | ništa novo (`lib/fairScans.ts` ne loguje) | — |
| `fairScanEvents` | `requestId`, `visitorId` (ID reda, ne hash), model/štand/brend, vreme, `dateKey`, `hourKey`, `isAdminExcluded`, `adminUserId?` | tokena i hash-a |

### 13.3 Fair grana u `cards.resolveAndRecord`

Redosled u istoj transakciji, posle postojećeg generičkog upisa (`cardScanEvents`, brojači kartice i kanala — nepromenjeni):

1. `openableFairModel`: target je `fair_model`, model je `published`, događaj postoji i kartica pripada **aktivnoj** `fairQrAssignments` dodeli tog modela. Inače `{ kind: "invalid" }` i nema fair upisa.
2. `recordFairScan`:
   - ako je generički red za ovaj `requestId` već postojao → `duplicate`, ništa se ne piše. Fair red nastaje samo u transakciji koja je upisala generički red, pa jedan resolver request daje jedan generički događaj i **najviše jedan** `fairScanEvents` red;
   - nema ispravnog hash-a → `no_visitor`;
   - `fairVisitors` upsert po hash-u (`lastSeenAt`);
   - `fairScan` rate limit po posetiocu → `rate_limited` (preusmerenje i dalje radi);
   - admin iz **sesije** (Convex Auth token koji `/r` prosleđuje; `getAuthUserId` + `isAdminEmail` iz `convex/lib/access.ts`, samo uvoz) → red sa `isAdminExcluded: true` i `adminUserId`, bez unique reda, brojača i pečata (`admin_excluded`). Javni arg za ovo ne postoji (validator odbija `isAdmin` i slična polja);
   - inače `fairScanEvents` + `fairUniqueScans` upsert (`totalScanCount`) + brojači + pečat pasoša → `recorded`.
3. Ishod `{ kind: "fair_model", path: "/sajam/{eventSlug}/model/{modelSlug}", fairScan }`; ruta šalje 302 (`Cache-Control: no-store`, `Referrer-Policy: no-referrer`) i `Set-Cookie` samo kad je token tek napravljen.

Ne filtrira se po radnom vremenu, uređaju ni botu (MASTER §5). Generički brojači kartice zadržavaju postojeće ponašanje (bot se tamo ne broji).

Ako `/r` ima prijavljenu sesiju čiji token Convex odbije, ruta ponavlja isti poziv bez tokena; mutacija je idempotentna po `requestId`.

### 13.4 Brojači (`convex/lib/fairCountShards.ts`, tabela `fairMetricCountShards`)

- 8 shardova po ključu, nasumičan shard po upisu, čitanje sabira najviše 16 redova (obrazac `countShards.ts`, nikad `memoriesCountShards`).
- Jedan `recorded` sken uvećava `scan_total` za 6 ključeva: model i štand × (ukupno, `dateKey`, `hourKey`). Prvi sken para posetilac+model uvećava i istih 6 `scan_unique` ključeva.
- Jedinstveni sken se pripisuje danu/satu prvog skena (§9.28); štand unique = zbir unique parova njegovih modela (§9.24).
- Sirovi redovi ostaju izvor istine; brojači su anonimni agregat koji preživljava purge.

### 13.5 Rate limit `fairScan`

`{ kind: "token bucket", rate: 20, period: MINUTE, capacity: 20 }`, ključ `fairVisitors._id`. Aritmetika: jedan fizički sken (kamera, 302, učitavanje stranice) traje čoveku najmanje 3 s, pa je oko 20/min ljudski plafon; obilazak cele hale je oko 100 modela za više sati (≈2/min); štand sa 5 vozila plus nekoliko refresh-eva staje u kapacitet 20. Ključ po posetiocu znači da posetioci iza istog NAT-a ne dele tokene (test). Generički `cardResolve` (po IP-u, 300/min) ostaje ispred (§9.27).

### 13.6 Funkcije i rute

| Ime | Vrsta | Šta radi |
|---|---|---|
| `cards.resolveAndRecord` | postojeća public mutation (proširena) | + `fairVisitorHash?`; `fair_model` grana iz §13.3 |
| `fairScans.modelScanCounts` | **internal** query | total/unique po modelu i štandu, opciono za `dateKey`/`hourKey`, plus kontrola iz sirovih redova; bez visitor ID-a i hash-a |
| `fairDevFixtures.seedTestQr` | **internal** mutation (samo DEV) | jedan TEST digitalni QR u TEST inventaru (isti koraci kao `adminProducts.createDigital`), dodeljen TEST modelu kroz `assignFairQr`; idempotentno |
| `GET /r/[cardCode]` | Next route (postojeća) | čita/pravi cookie, šalje hash i sesiju, 302 na model |
| `POST /api/fair/visitor` | Next route (nova) | bootstrap identiteta: same-origin, telo najviše 1 KB, `no-store`; odgovor `{ ok: true }` (+ `Set-Cookie` samo za nov token); ne piše u Convex |

Zajednički gateway (`lib/fair-server/gateway.ts`) za B3:
- `fairGatewayRequest`: same-origin preko `Sec-Fetch-Site`, inače `Origin` = origin zahteva; telo najviše 8 KB po `Content-Length` i po stvarno pročitanim bajtovima; prazno telo = `{}`;
- `fairGatewayJson` / `fairGatewayError`: `Cache-Control: no-store`; greška je samo `{ ok: false, code }`.

Pečat pasoša (`stampFairPassportOnScan`): no-op dok model nije `required` član `published` pasoša svog događaja; najviše jedan pečat po posetilac+model; uklonjen član više ne daje pečat, a stečeni ostaju. B3 objavljuje pasoše.

### 13.7 Domen

Domen nije zaključan u kodu. `FAIR_COOKIE_DOMAIN` prazno = host-only cookie na glavnom domenu (MASTER i V2: glavni domen, bez poddomena). Vrednost `.scanme.rs` bi omogućila da `/r/[cardCode]` na glavnom domenu i stranice na poddomenu dele isti identitet. Poddomen bi još tražio (C0 §4g):
- rewrite po hostu u `proxy.ts` (B2 ga ne dira);
- DNS i TLS na Vercelu;
- isti host za sve sajamske stranice zbog localStorage garaže;
- prihvatanje `same-site` umesto `same-origin` u gateway-u;
- fair base URL za email;
- noindex i na poddomenu.

To je Aleksina odluka (§9.3, §9.23).

## 14. B2 — javni katalog `convex/fairPublic.ts`

Javni, read-only upiti bez identiteta i bez PII. Ne vraćaju kontakte, email izveštaja, napomene, QR kodove, string paketa, brojače ni agregate ocena (DELTA §1). Pošto su upiti, čitanje stranice modela ili kartice iz garaže **ne može** da zabeleži sken.

| Funkcija | Args | Vraća |
|---|---|---|
| `getEventBySlug` | `{ slug }` | `FairPublicEvent` sa danima po `sortOrder`; `null` za `draft`, nepostojeći ili predugačak slug |
| `getModelBySlug` | `{ eventSlug, modelSlug }` | `FairPublicModel` za `published` model; inače `null` |
| `getModelsByIds` | `{ ids: string[] }` (najviše 50) | modeli lokalne garaže (oba događaja) redom unosa; nepoznati, neispravni, neobjavljeni i ponovljeni ID-evi se preskaču; više od 50 → `ConvexError({ code: "INVALID_INPUT" })` |

- `exhibitorName` je `businesses.name` učešća.
- `specificationGroups` grupiše server po `groupId`, a grupe i stavke ređa po `groupOrder`/`order`.
- `photoUrl` = odobreni `photoUrl` ili URL iz `photoStorageId`; bez fotografije polje izostaje.
- `capabilities` = `deriveFairCapabilities(packageTier, kontekst)` iz `lib/fair-entitlements.ts`. Kontekst: objavljeno (`published`) pitanje modela (B3: upit ne čita sat, dnevnu listu daje `listAudienceQuestionsForModel({ dateKey })`, §15.3), objavljena anketa, objavljeni sponzorisani snapshot, `fairLeadConfigs.enabled` za `interest`/`test_drive`. Bez tih redova sve je `false`.
- Validatori `fairPublicEventView` i `fairPublicModelView` (`convex/lib/fairValidators.ts`) imaju test tipova protiv `FairPublicEvent`/`FairPublicModel`.
- „View“ stranice modela se ne beleži: tabela ne postoji u ugovoru, a MASTER §12 ga nema kao metriku (§9.8).

## 15. B3 — interakcije (stvarna površina)

### 15.1 Tok

1. Klijent šalje same-origin `POST /api/fair/<ruta>`.
2. `lib/fair-server/interactions.ts` proverava telo striktno: nepoznat ključ (pa i `visitorHash`) → `INVALID_INPUT`.
3. `visitorHash` dolazi iz HttpOnly cookie-ja; pri prvom korišćenju pravi se nov token.
4. Jedan Convex poziv `fairInteractions.*`.
5. Odgovor `{ ok: true, value }` ili `{ ok: false, code }`, uvek sa `Cache-Control: no-store`.

Redosled u svakoj mutaciji:
1. validacija ulaza;
2. objavljen model, a event u stanju `published`/`live` i pre purge-a;
3. paket **na snazi u trenutku interakcije** (`fairModelTierAt`, po istoriji aktivacija);
4. rate limit po `fairVisitors._id`;
5. izvorni red i projekcija u istoj transakciji.

Svako odbijanje **baca** `ConvexError({ code })`. Zato se tada ništa ne upisuje: ni `fairVisitors` red, ni token limitera.

| Ruta | Convex | Telo | Odgovor |
|---|---|---|---|
| `POST /api/fair/model-state` | query `getMyModelState` | `{ eventModelId }` | `FairMyModelState` |
| `POST /api/fair/passport` | query `getMyPassportProgress` | `{ eventSlug }` | `FairPassportState` ili `null` |
| `POST /api/fair/rating` | mutation `upsertRating` | `{ eventModelId, overall? }` ili `{ eventModelId, appearance?, specifications?, price? }` | `FairRatingState` (samo svoje) |
| `POST /api/fair/audience-vote` | mutation `upsertAudienceVote` | `{ questionId, optionId }` | `FairAudienceResultView` sa `myOptionId` |
| `POST /api/fair/survey` | mutation `submitSurvey` | `{ surveyId, submissionId, answers }` (najviše 5) | `FairSurveySubmitResult` |
| `POST /api/fair/passport/favorite` | mutation `upsertBrandFavorite` | `{ passportId, eventModelId }` | `FairPassportProgress` |

HTTP statusi grešaka:
- 400: `INVALID_INPUT`;
- 403: `FEATURE_NOT_ENTITLED`;
- 404: `FAIR_MODEL_NOT_FOUND`, `PASSPORT_NOT_ACTIVE`;
- 409: `EVENT_NOT_ACTIVE`, `QUESTION_NOT_OPEN`, `SURVEY_NOT_OPEN`, `SUBMISSION_DUPLICATE`, `SURVEY_ALREADY_SUBMITTED`, `PASSPORT_NOT_COMPLETE`;
- 429: `RATE_LIMITED`;
- greška bez stabilnog koda → 502 `SERVICE_UNAVAILABLE`; poruka greške se ne prosleđuje.

### 15.2 Pravila

| Tok | Pravilo | Zaštita od duplikata |
|---|---|---|
| Ocena | Starter: tačno `overall` 1–5. Advanced: neprazan podskup `appearance`/`specifications`/`price`, nikad `overall`, bez izvedene ocene (`fairRatingInputProblem`). `included` → `FEATURE_NOT_ENTITLED`. Posle nadogradnje stari `overall` ostaje, a novi unosi su dimenzije. | jedan red po posetilac+model; ponovni unos patchuje samo poslata polja |
| Glas | pitanje je `published` i `startsAt ≤ sada < endsAt`; paket ima Glas publike; opcija postoji | jedan red po posetilac+pitanje; promena pomera brojač sa stare na novu opciju |
| Anketa | samo Advanced; najmanje 1 odgovor; `yes_no` = `yes`/`no`, `single_choice` = ID opcije; bez ponovljenog pitanja; `required` pitanja moraju imati odgovor | `submissionId`: isti posetilac i ista anketa → `duplicate: true`, inače `SUBMISSION_DUPLICATE`. Jedan odgovor po posetilac+model za bilo koju verziju → `SURVEY_ALREADY_SUBMITTED` |
| Favorit | pasoš je `published`; model je u `required` skupu; posetilac ima pečat za svaki `required` model | jedan red po posetilac+event+brend; promena pomera brojač |

Pečat (B2 `stampFairPassportOnScan`) nastaje samo za `required` člana `published` pasoša, najviše jedan po posetilac+model.

### 15.3 Javni upiti (`convex/fairPublic.ts`, bez identiteta)

| Funkcija | Args | Vraća |
|---|---|---|
| `listAudienceQuestionsForModel` | `{ eventModelId, dateKey? }` | `FairAudienceQuestionView[]`: `published` pitanja, po danu pa po `sortOrder`; `dateKey` sužava na jedan dan |
| `getAudienceQuestionResult` | `{ questionId }` | `FairAudienceResultView` bez `myOptionId` za `published`/`closed`, inače `null` |
| `getSurveyForModel` | `{ eventModelId }` | `FairSurveyView` objavljene verzije Advanced modela, bez rezultata; inače `null` |
| `getPassportCatalog` | `{ eventSlug }` | `{ eventId, catalog: FairPassportCatalogEntry[] }`: objavljeni pasoši, `required` modeli, `standMapLocationIds` i logo brenda ako postoji |

Prag je `max(FAIR_PUBLIC_VOTE_THRESHOLD, fairEvents.minimumPublicVoteCount)` = 5:
- ispod praga: `waiting_for_minimum`, bez procenta;
- od praga: celobrojni procenti (metod najvećeg ostatka, zbir je 100).

**Nijedna javna ni visitor funkcija ne vraća count, sum ni prosek ocena.** Test prolazi kroz izlaze svih javnih funkcija.

`capabilities.hasAudienceQuestions` znači „postoji `published` pitanje modela“. Upit ne čita sat; listu za jedan dan daje `dateKey`.

### 15.4 Brojači (`fairMetricCountShards`)

| Ključ | Ko čita |
|---|---|
| `rating_count_<polje>:model:<id>`, `rating_sum_<polje>:model:<id>` (polje: `overall`, `appearance`, `specifications`, `price`) | samo admin i izveštaji (`getModelInteractionSummary`, B6) |
| `audience_votes:question:<questionId>:<optionId>` | javni rezultat (od praga) i admin |
| `brand_favorite:passport:<passportId>:<eventModelId>` | rezultat favorita (od praga) |

Prvi unos polja: count +1 i sum + vrednost. Izmena: samo sum ± razlika. Brojači su anonimni i ostaju posle purge-a.

### 15.5 Rate limit (`convex/lib/rateLimits.ts`, ključ `fairVisitors._id`)

| Bucket | rate/min | kapacitet | Aritmetika |
|---|---:|---:|---|
| `fairRating` | 30 | 20 | Advanced: 3 dimenzije + 1–2 ispravke ≈ 5 upisa po modelu; 4 vozila na štandu ≈ 20 |
| `fairAudienceVote` | 30 | 15 | do 5 pitanja + 2–3 promene ≈ 8 po Advanced modelu; dva modela ≈ 15 |
| `fairSurveySubmit` | 5 | 5 | jedan konačan submit po Advanced modelu; retry istog `submissionId` ne troši token |
| `fairBrandFavorite` | 10 | 5 | izbor + par promena po brendu (§9.34) |

## 16. B3 — admin (`convex/fairInteractionsAdmin.ts`, sve sa `requireAdmin`)

| Funkcija | Pravilo |
|---|---|
| `upsertAudienceQuestion` | Pravi nacrt. 2–5 opcija sa jedinstvenim ID-em; dan istog eventa; prozor je podrazumevano sajamski dan. Idempotentno po `questionId` ili event+`externalKey`. Posle prvog glasa prompt i opcije su zaključani (`FAIR_QUESTION_LOCKED`). Paket bez Glasa publike → `FAIR_FEATURE_NOT_ENTITLED`. |
| `publishAudienceQuestion` | `draft → published`. Limit po danu prema paketu NA SNAZI (`fairAudienceQuestionsRemaining`). Broje se sva objavljena i zatvorena pitanja tog modela i dana, pa je na dan nadogradnje ukupno 5, uključujući Starter pitanje. |
| `closeAudienceQuestion` | `published → closed`; rezultat ostaje čitljiv. |
| `setSponsoredResultQuestion` | Samo Advanced. Tačno jedno pitanje po modelu koje nije nacrt; `null` briše izbor. |
| `upsertSurveyDraft` | Samo Advanced. 1–5 pitanja; `yes_no` bez opcija; `single_choice` sa 2–5 opcija. Menja se samo nacrt; objavljena verzija → `FAIR_SURVEY_LOCKED`, izmena ide u novu verziju. |
| `publishSurvey`, `retireSurvey` | Objava povlači prethodnu objavljenu verziju; odgovori ostaju. |
| `upsertPassport` | Nacrt po event+brend. Vraća `problem`: `fewer_than_two_models`, `model_not_published`, `model_not_candidate` ili `model_below_starter`. |
| `publishPassport` | Samo pre `startsAt` eventa. Traži ≥2 izložena modela, svi objavljeni, kandidati i Starter+. Upisuje `required` redove i `frozenAt`; skup se posle toga ne gradi ponovo. |
| `removePassportModel` | Hitno: `required → removed` (`removedAt`, `removedByUserId`). Pečati se ne brišu, a M se smanjuje. |
| `withdrawPassport` | `published → withdrawn`; pečati i favoriti ostaju. |
| `getEventInteractions` | Pitanja, verzije anketa (Advanced modeli) i pasoši eventa za tab `Događaji → Interakcije`; bez podataka posetilaca. |
| `getModelInteractionSummary` | **Jedino mesto** gde se čitaju count, sum i prosek ocena; vraća i broj glasova po opciji. |

Admin UI je tab `Događaji → Interakcije` (`components/admin/admin-events-interactions.tsx`); tekstovi su u `lib/i18n/sr/admin-events.ts`.

## 17. B4 — leadovi i email (stvarna površina)

`convex/leads.ts` je prelaunch lead i ne koristi se. Sajamski leadovi pišu samo B0 tabele iz §3.4; šema se u B4 ne menja.

### 17.1 Tok `POST /api/fair/lead` → `fairLeads.submitLead`

1. Gateway (`lib/fair-server/leads.ts`):
   - same-origin, telo najviše 8 KB, striktna polja `{ eventModelId, kind, submissionId, contactName, email?, phone?, consentAccepted, consentVersion }`; nepoznat ključ (i `visitorHash` ili tekst saglasnosti) → 400;
   - `consentAccepted: false` → 422 `CONSENT_REQUIRED`, a kontakt ne napušta Next proces;
   - `visitorHash` je HMAC HttpOnly cookie-ja; odgovor je `{ ok: true, value: FairLeadSubmitResult }`, bez ijednog kontakta, uvek `no-store`.
2. `submitLead`, u jednoj transakciji:
   1. hash i `submissionId` (`FAIR_SUBMISSION_ID_PATTERN`);
   2. **idempotentnost:** postojeći `submissionId` istog posetioca, modela i vrste vraća sačuvan ishod sa `duplicate: true` i ne piše i ne šalje ništa; tuđi → `SUBMISSION_DUPLICATE`;
   3. objavljen model, event `published`/`live`, pre purge-a;
   4. paket **na snazi u trenutku slanja**: `interest` Starter+, `test_drive` samo Advanced → inače `FEATURE_NOT_ENTITLED`;
   5. `fairLeadConfigs` za model i vrstu mora postojati i biti `enabled` → inače `FEATURE_NOT_ENTITLED`;
   6. **produkcijski gate:** aktivna `fairConsentConfigs` verzija za event i vrstu → inače `CONSENT_NOT_CONFIGURED`;
   7. `consentAccepted: true` i `consentVersion` = aktivna verzija → inače `CONSENT_REQUIRED`;
   8. ime (1–120 znakova) i kontakt po `contactRequirement` (`one_of` | `email` | `phone` | `both`); neispravan format → `INVALID_INPUT`, nedostaje kanal → `CONTACT_REQUIREMENT_NOT_MET`; `preferredContact` nikad ne pravi obavezno polje;
   9. `fairVisitors` upsert i `fairLeadSubmit` limit → `RATE_LIMITED`;
   10. `fairLeads` red: `consentTextSnapshot` = aktivni tekst sa `{izlagac}` zamenjenim nazivom izlagača (server, ne browser), `consentedAt`, `status: received`, `followUpSuppressed: false`, `purgeAt` = 16. 11. 2026 (`FAIR_PII_PURGE_AT_MS`);
   11. ako postoji email: outbox red neposredne potvrde (`scheduledFor` = sada); ako paket na snazi ima `postEventFollowUp` (Advanced): i outbox red follow-upa (§17.3).

   Svako odbijanje baca `ConvexError({ code })`, pa se ne upisuje ništa: ni lead, ni posetilac, ni outbox, ni token limitera.

| HTTP | Kodovi |
|---|---|
| 400 | `INVALID_INPUT` |
| 403 | `FEATURE_NOT_ENTITLED`, `ORIGIN_NOT_ALLOWED` |
| 404 | `FAIR_MODEL_NOT_FOUND` |
| 409 | `CONSENT_NOT_CONFIGURED`, `EVENT_NOT_ACTIVE`, `SUBMISSION_DUPLICATE` |
| 422 | `CONSENT_REQUIRED`, `CONTACT_REQUIREMENT_NOT_MET` |
| 429 | `RATE_LIMITED` |
| 502/503 | `SERVICE_UNAVAILABLE`, `VISITOR_UNAVAILABLE` (poruka greške se ne prosleđuje) |

### 17.2 Javni obrazac `fairPublic.getLeadForm({ eventModelId, kind })`

Vraća `FairLeadFormView` (bez PII):
- `unavailable`: model nije objavljen, sačuvani paket nema pravo ili obrazac nije uključen;
- `consent_not_configured`: nema aktivne saglasnosti (obrazac se ne prikazuje);
- `open`: `contactRequirement`, `preferredContact?` i `consent: { version, text }`; `text` je već renderovan sa nazivom izlagača. Browser prikazuje taj tekst i šalje nazad `version`.

Kao i `capabilities`, upit čita sačuvani paket (upit ne čita sat); `submitLead` sudi po paketu na snazi.

### 17.3 Outbox `fairEmailDeliveries` i slanje

- `dedupeKey` = `fair-lead/<leadId>/<immediate_confirmation|post_event_follow_up>`; jedan red po ključu, nastaje samo u transakciji koja je upisala lead. Retry submit-a ga ne dodaje.
- Mutacija samo pravi red i zakazuje `fairEmailSender.sendDelivery` (Node `internalAction`). Sender:
  1. `fairEmails.claimDelivery` (internal mutation) uzima samo `queued` red čiji je trenutak došao, ponovo čita lead i za follow-up proverava `followUpSuppressed` (→ `suppressed`) i aktivni tekst izlagača (→ `failed: FOLLOW_UP_TEMPLATE_MISSING`); povećava `attemptCount`;
  2. šalje kroz Resend seam (`convex/lib/fairEmails.ts`, isti obrazac kao `activationRequestEmails.ts`) sa `Idempotency-Key` = `dedupeKey`;
  3. `markSent` (`providerMessageId`) ili `markFailed`.
- Retry: 409/429/5xx/mreža se ponavljaju na istom redu i sa istim ključem posle 1 min i 10 min (`FAIR_EMAIL_MAX_ATTEMPTS = 3`); ostale 4xx i `RESEND_NOT_CONFIGURED` odmah prelaze u `failed`. Admin `retryEmailDelivery` vraća `failed` u `queued` sa istim ključem. `sent` je konačno.
- **Neposredna potvrda:** tačno jedna po leadu sa emailom. Tekst je ScanMe placeholder (P1, `lib/i18n/sr/event-lead-email.ts`): imenuje model, događaj i izlagača; za probnu vožnju kaže da termin nije zakazan. Rečenicu da se odgovorom otkazuje follow-up sadrži samo kad je follow-up zaista zakazan.
- **Advanced follow-up:** jedan po leadu, zakazan pri upisu za prvi 10:00 po Beogradu najmanje 24 h posle `fairEvents.endsAt` (uvek u prozoru 24–48 h; §9.40). Lead pre nadogradnje ga nikad ne dobija naknadno. Telo je aktivni tekst izlagača (`fairMessageTemplates`, `post_event_follow_up`) + ScanMe podnožje; bez teksta se ne šalje (§9.42).
- Linkovi: `FAIR_PUBLIC_BASE_URL` (Convex env; https origin, za `localhost` i http), inače `https://scanme.rs`. `Reply-To`: `FAIR_EMAIL_REPLY_TO`, ako je postavljen (§9.39).
- Resend env: `RESEND_API_KEY` (mora početi sa `re_`) i `RESEND_FROM_EMAIL`. Na DEV-u (`dev:expert-pelican-136`) oba imena postoje (`scripts/sajam/tools/env-imena.mjs`, 4. 10. 2026); vrednosti nisu čitane.
- `lastError` je stabilan kod (§6), nikad poruka provajdera.

### 17.4 Rate limit `fairLeadSubmit`

`{ kind: "token bucket", rate: 2, period: MINUTE, capacity: 3 }`, ključ `fairVisitors._id` + `:` + `eventModelId`. Aritmetika: na jednom modelu čovek pošalje `Zainteresovan sam` jednom i (Advanced) probnu vožnju jednom, plus jednu ispravku = 3. Dopuna 1 na 30 s zadržava skriptu na 2 emaila u minuti po modelu. Retry istog `submissionId` vraća se pre limitera i ne troši token. Svaki model ima svoj ključ (§9.44).

### 17.5 Purge seam

`fairEmails.purgeLeadPiiBatch({ limit, dryRun })` (internal):
- najviše `limit` (≤ 200) redova po pozivu;
- prvo outbox (primaoci), a leadovi tek kad outbox ostane prazan, pa referenca ne ostaje bez para;
- pre `FAIR_PII_PURGE_AT_MS` vraća `not_due`; `dryRun` samo broji;
- ne dira `fairConsentConfigs`, `fairLeadConfigs`, `fairMessageTemplates` ni `fairMetricCountShards`;
- bezbedan za ponavljanje (`hasMore`).

Zakazivanje, audit i ostale visitor tabele su B7 (§9.48).

## 18. B4 — admin (`convex/fairLeadsAdmin.ts`, sve sa `requireAdmin`)

| Funkcija | Pravilo |
|---|---|
| `getEventConsents` | Verzije saglasnosti po vrsti, najnovije prve (≤20 po vrsti). |
| `saveConsentDraft` | Nova verzija (sledeći broj) ili izmena postojećeg nacrta. `active` i `retired` se ne menjaju (`FAIR_CONSENT_STATUS`). |
| `activateConsent` | **Produkcijski prekidač.** `draft → active`, prethodna aktivna → `retired`, u istoj transakciji. Tekst mora imati `{izlagac}` (`FAIR_CONSENT_EXHIBITOR_MISSING`). Upisuje `adminAuditLog` (`fair_consent_activated`). Aktivira se samo stručno proveren tekst (P0). |
| `retireConsent` | `active → retired`; obrazac te vrste se zatvara (`CONSENT_NOT_CONFIGURED`). Audit `fair_consent_retired`. |
| `getModelLeadSettings` | Paket, obrazac `interest` i `test_drive` i aktivni tekst follow-upa modela. |
| `upsertLeadConfig` | Jedan red po modelu i vrsti; `enabled: true` traži pravo u paketu modela (`FAIR_FEATURE_NOT_ENTITLED`). `created`/`updated`/`unchanged`. |
| `upsertFollowUpTemplate` | Samo Advanced. Tekst izlagača (naslov ≤150, tekst ≤5000, samo plain text) postaje nova aktivna verzija, a prethodna se povlači. |
| `exportLeads` | Paginiran izvoz jednog učešća (izlagač na eventu), najnoviji prvi, najviše 100 po strani; uz svaki lead i stanje potvrde i follow-upa. Učešće drugog eventa → `FAIR_LINK_NOT_FOUND`. |
| `setFollowUpSuppressed` | Otkazivanje follow-upa po odgovoru posetioca (`suppressedAt`, `suppressedByUserId`); povratno za grešku admina. Sender ga ponovo čita neposredno pre slanja. |
| `retryEmailDelivery` | `failed → queued`, isti `dedupeKey`/`Idempotency-Key`; ostala stanja → `FAIR_EMAIL_DELIVERY_STATUS`. |

Admin UI je tab `Događaji → Leadovi` (`components/admin/admin-events-leads.tsx`); tekstovi su u `lib/i18n/sr/admin-events.ts`. Sekcija se montira samo dok je tab otvoren, pa se kontakti ne učitavaju u pozadini.

**Nijedna javna funkcija ne vraća kontakt.** `submitLead` vraća samo `FairLeadSubmitResult`, `getLeadForm` samo pravilo i tekst saglasnosti, a funkcija koja po visitor hash-u čita kontakt ne postoji. Test (`convex/fairLeads.test.ts`) prolazi kroz izlaze javnih i visitor funkcija i proverava da u njima nema imena, emaila, telefona, hash-a ni snapshot-a. Proverava i da je jedina javna lead funkcija `submitLead`, da su outbox, sender i purge `internal`, a da admin funkcije odbijaju anonimnog i ne-admin korisnika.
