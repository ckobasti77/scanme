# Sajam automobila 2026 — fair backend ugovor (B0)

> Status: **B0 — ugovor i šema; B1 — katalog, import, paketi i QR dodela** (admin funkcije u §11, import u §12). Napisano iz stvarnog koda 3. oktobra 2026.
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

**B0 ne dodaje nijednu public, internal ni admin funkciju.** Nova je samo šema; tipovi i pravila su čiste funkcije. **B1** dodaje admin funkcije (`requireAdmin`) i jednu internal DEV funkciju; spisak je u §11. Public fair funkcija još nema.

Planirana površina (HANDOFF §7). Imena se mogu minimalno prilagoditi; odgovornosti ne.

| Modul | Korak | Vrsta | Funkcije |
|---|---|---|---|
| `convex/fairAdmin.ts`, `convex/fairImport.ts` (**urađeno**, §11–§12) | B1 | admin (`requireAdmin`) | upsert event/dan/učešće/štand/model, event-only klijent i `convertEventClientToStandard`, QR inventar + atomski assign/release + resolve test, publish/withdraw, upgrade paketa, import dry-run/commit, validation issues |
| `convex/cards.ts` (hook), `app/r/[cardCode]`, `app/api/fair/**` | B2 | postojeći public resolver + server gateway | fair scan u istom `requestId`, visitor hash, server-derived admin isključenje, pečat pasoša |
| `convex/fairPublic.ts` | B2/B3/B5 | public, read-only, bez PII | `getEventBySlug`, `getModelBySlug`, `getModelsByIds` (≤50), `listAudienceQuestionsForModel`, `getAudienceQuestionResult`, `getSponsoredMapRotation`, `getSponsoredGarageRotation`, `getPassportCatalog`; `getMyPassportProgress` ide kroz POST gateway (HANDOFF §7) |
| `convex/fairInteractions.ts` | B3/B5 | public preko POST gateway-a | `getMyModelState`, `upsertRating`, `upsertAudienceVote`, `submitSurvey`, `upsertBrandFavorite`, `recordSponsoredAction` (samo garaža) |
| `convex/fairLeads.ts`, `convex/fairEmails.ts` | B4 | gateway + internal + admin | `submitLead`, potvrda (Node `internalAction`), follow-up, suppression, paginiran izvoz |
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
| `cardTargetKind` (schema.ts) | `+ "fair_model"`. Deli ga `cardTargets.kind` i `cardScanEvents.targetKind`. | Inertno. Generički API (`cards.createCard/retargetCard`, `cardsAdmin.*`) ga odbija sa `cardTargetInvalid`; `resolveAndRecord` vraća `{ kind: "invalid" }` (generički scan se beleži kao i ranije). B1 i B2 zamenjuju inertne grane. |
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

Detalji greške su samo ne-PII vrednosti. Tekst greške mapira frontend kroz `lib/i18n`.

## 7. Formati i ključevi

| Pojam | Format |
|---|---|
| `dateKey` | `YYYY-MM-DD`, kalendarski dan u `Europe/Belgrade`. B2 ponovo koristi `lib/admin-v1/task-time.ts` (`belgradeDateKey`, `belgradeDayBounds`). |
| `hourKey` | `YYYY-MM-DDTHH` (24 h), `Europe/Belgrade`. Pomoćni moduli su `lib/belgrade-time.ts` i `belgradeParts`. |
| `visitorHash` | lowercase 64-char hex (HMAC na Next serveru). Raw token nikad ne ulazi u Convex, URL ni log. |
| PII purge | `FAIR_PII_PURGE_AT_MS` = 16. 11. 2026. u 00:00 po Beogradu (2026-11-15T23:00Z). Isto važi za `fairEvents.piiPurgeAt`, `fairLeads.purgeAt` i istek cookie-ja. |
| Shard ključ | definiše B2. Predlog: `<metrika>:<opseg>:<id>[:<dateKey>[:<hourKey>]]`, npr. `scan_total:model:<id>:<dateKey>`. |
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

## 10. Šta stiže posle B0

| Korak | Sadržaj |
|---|---|
| **B1** (urađeno, §11–§12) | `fairAdmin`, import (dry-run/commit), QR assign/release kroz `fair_model` destinaciju (isti subject → target → istorija → sync kanala tok kao `applyDestination`), filtriranje `event_only` u admin upitima, upgrade sa auditom, DEV TEST katalog |
| **B1A** | admin tab `Događaji` |
| **B2** | gateway, cookie i HMAC; fair hook u `resolveAndRecord` sa istim `requestId`; admin isključenje preko Convex Auth tokena; shard helper; `fairScan` rate limit; pečat pasoša |
| **B3** | ocene, Glas publike, anketa, pasoš i favorit |
| **B4** | leadovi, saglasnost i email outbox (produkcija čeka pravni tekst) |
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
| `fairAdmin.resolveTest` | admin query | — | isti `cardResolution` i kapije kao `/r/[cardCode]`, bez upisa scan-a; vraća `path` = `/sajam/{eventSlug}/model/{modelSlug}` kada bi se model otvorio. Živa ruta i dalje vraća `invalid` za `fair_model` dok B2 ne poveže granu. |
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
