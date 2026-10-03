# Sajam automobila 2026 — fair backend ugovor (B0)

> Status: **B0 — ugovor i šema**, bez business funkcija. Napisano iz stvarnog koda 3. oktobra 2026.
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

**B0 ne dodaje nijednu public, internal ni admin funkciju.** Nova je samo šema; tipovi i pravila su čiste funkcije.

Planirana površina (HANDOFF §7). Imena se mogu minimalno prilagoditi; odgovornosti ne.

| Modul | Korak | Vrsta | Funkcije |
|---|---|---|---|
| `convex/fairAdmin.ts` (+ import) | B1 | admin (`requireAdmin`) | upsert event/dan/učešće/štand/model, event-only klijent i `convertEventClientToStandard`, QR inventar + atomski assign/release + resolve test, publish/withdraw, upgrade paketa, import dry-run/commit, validation issues |
| `convex/cards.ts` (hook), `app/r/[cardCode]`, `app/api/fair/**` | B2 | postojeći public resolver + server gateway | fair scan u istom `requestId`, visitor hash, server-derived admin isključenje, pečat pasoša |
| `convex/fairPublic.ts` | B2/B3/B5 | public, read-only, bez PII | `getEventBySlug`, `getModelBySlug`, `getModelsByIds` (≤50), `listAudienceQuestionsForModel`, `getAudienceQuestionResult`, `getSponsoredMapRotation`, `getSponsoredGarageRotation`, `getPassportCatalog` |
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

Na postojećim tabelama nije dodat nijedan indeks. Nijedno postojeće polje nije promenjeno.

## 3. Tabele

Napomene:
- Convex ne nameće jedinstvenost; „jedinstveno“ je pravilo upsert-a mutacije koja piše tabelu.
- **PII** označava redove koje purge (16. 11. 2026, B7) trajno briše.
- Statusi i enumi su u `convex/lib/fairValidators.ts`; tipovi su u `lib/fair-contract.ts`.

### 3.1 Katalog (piše B1)

| Tabela | Polja | Indeksi | Jedinstveno |
|---|---|---|---|
| `fairEvents` | `code`, `slug`, `title`, `venueName`, `timezone: "Europe/Belgrade"`, `startsAt`, `endsAt`, `status: draft\|published\|live\|ended\|archived`, `garagePriority`, `piiPurgeAt`, `minimumPublicVoteCount`, `robotsIndexable`, `createdAt`, `updatedAt` | `by_code`, `by_slug`, `by_status_and_startsAt` | `code` (upsert ključ), `slug` |
| `fairEventDays` | `eventId`, `dateKey`, `label`, `startsAt`, `endsAt`, `sortOrder` | `by_eventId_and_dateKey` | (event, dateKey) |
| `fairParticipations` | `externalKey`, `eventId`, `accountId`, `businessId`, `primaryContactId?`, `reportRecipientEmail?`, `leadDeliveryNote?`, `status: draft\|active\|withdrawn`, `createdAt`, `updatedAt` | `by_eventId_and_externalKey`, `by_eventId_and_businessId`, `by_accountId_and_eventId` | (event, externalKey), (event, business) |
| `fairStands` | `eventId`, `participationId`, `externalKey`, `code`, `displayName`, `mapLocationId`, `status: draft\|active\|withdrawn`¹, `createdAt`, `updatedAt` | `by_eventId_and_externalKey`, `by_eventId_and_participationId`, `by_eventId_and_mapLocationId` | (event, externalKey); (event, mapLocationId) među aktivnim |
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
| `fairConsentConfigs` | `eventId`, `leadKind`, `version`, `text`, `status: draft\|active\|retired`, `activatedAt?`, `createdAt`, `updatedAt` | `by_eventId_and_leadKind_and_status`, `by_eventId_and_leadKind_and_version` | (event, kind, version) | snapshot se briše |
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
16. **Početni red u `fairPackageActivations`**: kad se model uvozi direktno kao Starter/Advanced, predlog za B1 je red `included → tier` u trenutku `package_active_from`.

## 10. Šta stiže posle B0

| Korak | Sadržaj |
|---|---|
| **B1** | `fairAdmin`, import (dry-run/commit), QR assign/release kroz `accessValidators` (`fair_model` destinacija) i `applyDestination`, filtriranje `event_only` u admin upitima, upgrade sa auditom, DEV TEST katalog |
| **B1A** | admin tab `Događaji` |
| **B2** | gateway, cookie i HMAC; fair hook u `resolveAndRecord` sa istim `requestId`; admin isključenje preko Convex Auth tokena; shard helper; `fairScan` rate limit; pečat pasoša |
| **B3** | ocene, Glas publike, anketa, pasoš i favorit |
| **B4** | leadovi, saglasnost i email outbox (produkcija čeka pravni tekst) |
| **B5** | sponzorisani snapshot i rotacija (samo garažni `open_model`/`garage_add`) |
| **B6** | analitika i izveštaji |
| **B7** | purge, authz, performance i integracioni test |
