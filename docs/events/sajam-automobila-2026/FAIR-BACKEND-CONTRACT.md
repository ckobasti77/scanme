# Sajam automobila 2026 — fair backend ugovor (B0)

> Status: **B0 — ugovor i šema; B1 — katalog, import, paketi i QR dodela** (admin funkcije u §11, import u §12); **B2 — anonimni identitet, scan pipeline i javni katalog** (§13–§14); **B3 — ocene, Glas publike, anketa i pasoš** (§15–§16); **B4 — leadovi, saglasnost i email outbox** (§17–§18); **B5 — sponzorisani snapshot, projekcije rotacije i garažne akcije** (§19–§20); **B6 — analitika, dnevni dataset i izveštaji** (§21–§22); **B7 — brisanje PII 16. 11., authz, performanse i integracioni TEST seed** (§23–§26); **K1 — zajednička tajna Next → Convex i limit novih identiteta po IP-u** (§27); **K3 — tvrdi prekidači leadova i follow-upa i zapis pravnog odobrenja** (§28); **K4 — ručni izveštaj tek posle zatvaranja dana, sweep ne blokira raniji run** (§29). Napisano iz stvarnog koda 3. i 4. oktobra 2026.
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

**B0 ne dodaje nijednu public, internal ni admin funkciju.** Nova je samo šema; tipovi i pravila su čiste funkcije. **B1** dodaje admin funkcije (`requireAdmin`) i jednu internal DEV funkciju; spisak je u §11. **B2** dodaje tri javna read-only upita (`fairPublic.*`), fair granu u postojećem `cards.resolveAndRecord`, dve internal funkcije i jedan Next gateway (§13–§14). **B3** dodaje gateway-facing `fairInteractions.*`, četiri javna upita u `fairPublic`, admin `fairInteractionsAdmin.*` i šest POST ruta (§15–§16). **B4** dodaje gateway-facing `fairLeads.submitLead`, javni `fairPublic.getLeadForm`, internal outbox `fairEmails.*`, Node sender `fairEmailSender.*`, admin `fairLeadsAdmin.*` i rutu `POST /api/fair/lead` (§17–§18). **B5** dodaje javne `fairPublic.getSponsoredMapRotation` i `getSponsoredGarageRotation`, gateway-facing `fairInteractions.recordSponsoredAction`, admin `fairSponsoredAdmin.*` i rutu `POST /api/fair/sponsored-action` (§19–§20). **B6** dodaje internal `fairAnalytics.*`, admin `fairReports.*` (upiti, mutacije i akcije za preuzimanje), internal izradu i cron u `fairReports` i granu `daily_report` u B4 outbox-u (§21–§22). **B7** dodaje `convex/fairRetention.ts` (internal purge, cron i CLI preview/dry run; admin `getRetentionOverview`, `startPurgeDryRun`), tabelu `fairPurgeRuns`, internal `fairDevFixtures.seedIntegrationTest` i limit potvrda po adresi u `submitLead` (§23–§26). Nijedna nova javna funkcija bez admina. **K1** ne dodaje funkcije: svih 8 javnih funkcija sa `visitorHash` i fair grana `cards.resolveAndRecord` traže `FAIR_GATEWAY_SECRET`, a nov posetilac troši token po IP HMAC-u (§27). **K3** ne dodaje funkcije: `submitLead`, `getLeadForm` i `claimDelivery` proveravaju Convex env prekidače `FAIR_LEADS_ENABLED` i `FAIR_FOLLOWUP_ENABLED` (podrazumevano isključeni), a `activateConsent` traži zapis pravnog odobrenja (§28). **K4** ne dodaje funkcije: `requestReportBuild` i `createReportCorrection` odbijaju dan koji nije zatvoren, a `sweepDailyReports` ne preskače dan zbog run-a napravljenog pre zatvaranja (§29).

Planirana površina (HANDOFF §7). Imena se mogu minimalno prilagoditi; odgovornosti ne.

| Modul | Korak | Vrsta | Funkcije |
|---|---|---|---|
| `convex/fairAdmin.ts`, `convex/fairImport.ts` (**urađeno**, §11–§12) | B1 | admin (`requireAdmin`) | upsert event/dan/učešće/štand/model, event-only klijent i `convertEventClientToStandard`, QR inventar + atomski assign/release + resolve test, publish/withdraw, upgrade paketa, import dry-run/commit, validation issues |
| `convex/cards.ts` (hook), `app/r/[cardCode]`, `app/api/fair/**` (**urađeno**, §13) | B2 | postojeći public resolver + server gateway | fair scan u istom `requestId`, visitor hash, server-derived admin isključenje, pečat pasoša |
| `convex/fairPublic.ts` (B2, B3 i B5 deo **urađen**, §14, §15.3, §19.2) | B2/B3/B5 | public, read-only, bez PII | `getEventBySlug`, `getModelBySlug`, `getModelsByIds` (≤50) — B2; `listAudienceQuestionsForModel`, `getAudienceQuestionResult`, `getSponsoredMapRotation`, `getSponsoredGarageRotation`, `getPassportCatalog`; `getMyPassportProgress` ide kroz POST gateway (HANDOFF §7) |
| `convex/fairInteractions.ts` (B3 i B5 deo **urađen**, §15, §19.4) | B3/B5 | public preko POST gateway-a | `getMyModelState`, `upsertRating`, `upsertAudienceVote`, `submitSurvey`, `upsertBrandFavorite`, `recordSponsoredAction` (samo garaža) |
| `convex/fairLeads.ts`, `convex/fairEmails.ts`, `convex/fairEmailSender.ts`, `convex/fairLeadsAdmin.ts` (**urađeno**, §17–§18) | B4 | gateway + internal + admin | `submitLead`, potvrda (Node `internalAction`), follow-up, suppression, paginiran izvoz |
| `convex/fairSponsoredAdmin.ts` (**urađeno**, §20) | B5 | admin (`requireAdmin`) | `publishSponsoredSnapshot`, `getSponsoredRotationAdmin`; izbor rezultata ostaje B3 `setSponsoredResultQuestion` |
| `convex/fairAnalytics.ts`, `convex/fairReports.ts` (**urađeno**, §21–§22) | B6 | internal/admin | metrike, dnevni dataset, report lifecycle (send samo iz `approved`), odvojeni PII izvoz i agregat za organizatora |
| `convex/fairRetention.ts` (**urađeno**, §23) | B7 | internal + admin preview | bounded, retry-safe brisanje PII 16. 11., preview, dry run, audit bez PII |

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
| K1: `cards.resolveAndRecord` | novi opcioni argumenti `fairGatewaySecret`, `fairIpHash`; novi `fairScan` ishod `gateway_rejected` | Čita ih samo `fair_model` grana. Bez ispravne tajne nema fair upisa; generički scan i redirect su isti kao pre (§27). |
| K1: `convex/convex.config.ts` | `FAIR_GATEWAY_SECRET: v.optional(v.string())` u `defineApp({ env })` | Opciono namerno: bez vrednosti posetilačke funkcije odbijaju svaki poziv (fail closed). |
| K3: `convex/convex.config.ts` | `FAIR_LEADS_ENABLED`, `FAIR_FOLLOWUP_ENABLED`: `v.optional(v.string())` | Opciono namerno: bez vrednosti (ili sa bilo čim osim tačno `"true"`) lead tok i follow-up su isključeni (§28). |
| K3: `fairConsentConfigs` | `legalApprovedBy?`, `legalApprovedAt?` | Aditivno; upisuje ih samo `activateConsent`. Verzije aktivirane pre K3 ih nemaju. |
| K3: `fairEmailDeliveries.status` | `+ "skipped"` | Lead email čiji je prekidač bio isključen u trenutku slanja; konačno, ništa nije poslato. |
| K1: `convex/lib/rateLimits.ts` | bucket `fairVisitorCreate` | Po IP HMAC-u, troši se samo za nov `fairVisitors` red (§27.4). Postojeći bucketi nisu menjani. |
| K1: `app/r/[cardCode]/route.ts` | šalje tajnu i IP HMAC uz hash | Bez tajne u Next env-u nema hash-a ni cookie-ja; ostali `case`-ovi su nepromenjeni. |
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
| `fairConsentConfigs` | `eventId`, `leadKind`, `version`, `text`, `status: draft\|active\|retired`, `activatedAt?`, `legalApprovedBy?` (K3), `legalApprovedAt?` (K3), `createdAt`, `updatedAt` | `by_eventId_and_leadKind_and_status`, `by_eventId_and_leadKind_and_version` | (event, kind, version) | ne (snapshot teksta je u `fairLeads` i briše se s njim) |
| `fairLeadConfigs` | `eventModelId`, `leadKind`, `contactRequirement: one_of\|email\|phone\|both`, `preferredContact?`, `enabled`, `updatedByUserId`, `createdAt`, `updatedAt` | `by_eventModelId_and_leadKind` | (model, kind) | ne |
| `fairLeads` | `submissionId`, `kind`, `visitorId`, `eventId`, `eventModelId`, `participationId`, `contactName`, `email?`, `phone?`, `consentAccepted: true` (literal), `consentVersion`, `consentTextSnapshot`, `consentedAt`, `status: received\|delivered`, `deliveredAt?`, `followUpSuppressed`, `suppressedAt?`, `suppressedByUserId?`, `createdAt`, `purgeAt` | `by_submissionId`, `by_eventModelId_and_createdAt`, `by_participationId_and_createdAt`, `by_status_and_purgeAt` | `submissionId` | da |
| `fairMessageTemplates` | `eventModelId`, `kind: immediate_confirmation\|post_event_follow_up`, `subject`, `plainText`, `html?`, `status`, `version`, `createdAt`, `updatedAt` | `by_eventModelId_and_kind_and_status` | (model, kind, version) | ne |
| `fairEmailDeliveries` | `dedupeKey`, `leadId?`⁶, `reportRunId?` (B6), `kind`, `recipient`, `status: queued\|sent\|failed\|suppressed\|skipped` (K3), `scheduledFor`, `attemptCount`, `providerMessageId?`, `lastError?`, `createdAt`, `updatedAt` | `by_dedupeKey`, `by_status_and_scheduledFor`, `by_leadId_and_kind`, `by_recipient_and_kind_and_createdAt` (B7, §25.3) | `dedupeKey` | da (`recipient`) |

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
| `fairReportRuns` | `eventId`, `eventDayId`, `participationId`, `status`, `dataThrough`, `format: pdf\|xlsx\|csv`, opciono: `storageId`, `recipient`, `providerMessageId`, `error`, `reviewedByUserId`, `reviewedAt`, `approvedByUserId`, `approvedAt`, `correctionOfReportRunId`, B6: `dataset` (zamrznut dnevni dataset, §21.2), `sendCount`; `createdAt`, `updatedAt` | `by_eventDayId_and_participationId`, `by_status_and_createdAt` | send samo iz `approved` |
| `fairSponsoredSnapshots` | `eventId`, `version`, `dayKey`, `seed`, `status: draft\|published\|retired`, `publishedAt?`, `publishedByUserId?` | `by_eventId_and_status`, `by_eventId_and_version` | jedan `published` po eventu (proverava mutacija) |
| `fairSponsoredSnapshotItems` | `snapshotId`, `eventModelId`, `order`, `audienceQuestionId?` | `by_snapshotId_and_order` | ograničena lista, poređana pri objavi |
| `fairSponsoredEvents` | `requestId`, `eventId`, `eventModelId`, `surface: "garage"`⁷, `kind: open_model\|garage_add`, `occurredAt`, `dateKey`, `hourKey`, `visitorId?` | `by_requestId`, `by_eventModelId_and_occurredAt`, `by_eventId_and_occurredAt` | PII (`visitorId`) |

⁷ JOVAN-DELTA §2 sužava HANDOFF §5.7 (`map | display | garage`). Mapa i displej nikad ne pišu sponzorisani događaj, a impression ne postoji nigde.

Šta ne postoji:
- `fairExhibitors`, `sajam*` tabele, view tabela ni impression tabela;
- tabela purge audita (HANDOFF §5.6, bez imena) je od B7 `fairPurgeRuns` (§23.4); nije PII.

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

B6 admin kodovi: `FAIR_REPORT_NOT_FOUND`, `FAIR_REPORT_STATUS`, `FAIR_REPORT_NOT_APPROVED` (slanje bilo čega osim `approved`), `FAIR_REPORT_RECIPIENT_MISSING`, `FAIR_REPORT_EXPORT_TOO_LARGE`. Novi kodovi isporuke (`FAIR_EMAIL_DELIVERY_ERRORS`): `REPORT_NOT_SENDABLE` (u trenutku slanja izveštaj više nije `approved`/`sent`) i `REPORT_FILE_MISSING`. Greške izrade (`fairReportRuns.error`): `BUILD_FAILED`, `REPORT_CONTEXT_MISSING`.

K4 admin kod (§29): `FAIR_DAY_NOT_CLOSED` (`details.endsAt`, epoch ms) — `requestReportBuild` ili `createReportCorrection` za dan čiji `fairEventDays.endsAt` još nije prošao.

K1 dodaci (Convex, svih 8 posetilačkih funkcija; §27). Convex ih baca pre bilo kog čitanja ili upisa:
- `FAIR_GATEWAY_NOT_CONFIGURED` — Convex deployment nema `FAIR_GATEWAY_SECRET` (ili je kraća od 32 znaka);
- `FAIR_GATEWAY_UNAUTHORIZED` — tajna u pozivu nedostaje ili je pogrešna.

Next gateway oba prikazuje browseru kao 503 `SERVICE_UNAVAILABLE` i jednom loguje kod. Kad Next nema tajnu, Convex se ne zove: 503 `VISITOR_UNAVAILABLE`.

K3 dodaci (§28):
- `LEADS_DISABLED` — `submitLead`, odmah posle provere tajne: Convex env `FAIR_LEADS_ENABLED` nije tačno `"true"`; ništa se ne čita i ne upisuje. Gateway: 409.
- admin kod `FAIR_CONSENT_LEGAL_APPROVAL_REQUIRED` (`details.field`: `legalApprovedBy` ili `legalApprovedAt`) — aktivacija saglasnosti bez zapisa pravnog odobrenja;
- kodovi isporuke (`FAIR_EMAIL_DELIVERY_ERRORS`, uz status `skipped`): `LEADS_DISABLED`, `FOLLOW_UP_DISABLED`.

B5: `recordSponsoredAction` koristi postojeće kodove (`INVALID_INPUT` za `surface` ≠ `garage`, drugu vrstu ili loš `requestId`; `FEATURE_NOT_ENTITLED`, `FAIR_MODEL_NOT_FOUND`, `EVENT_NOT_ACTIVE`, `SUBMISSION_DUPLICATE`, `RATE_LIMITED`). Nov admin kod: `FAIR_SPONSORED_LIMIT` (više od 200 Advanced modela u jednom eventu).

Detalji greške su samo ne-PII vrednosti. Tekst greške mapira frontend kroz `lib/i18n`.

## 7. Formati i ključevi

| Pojam | Format |
|---|---|
| `dateKey` | `YYYY-MM-DD`, kalendarski dan u `Europe/Belgrade`. B2: `fairTimeKeys(at)` u `convex/lib/fairScans.ts` (preko `belgradeParts` iz `lib/belgrade-time.ts`, ista vrednost kao `belgradeDateKey`). |
| `hourKey` | `YYYY-MM-DDTHH` (24 h), `Europe/Belgrade`, isti `fairTimeKeys`. Na jesenji DST prelaz (25. 10.) ponovljeni sat 02 ima isti ključ. |
| `visitorHash` | lowercase 64-char hex (HMAC na Next serveru). Raw token nikad ne ulazi u Convex, URL ni log. |
| PII purge | `FAIR_PII_PURGE_AT_MS` = 16. 11. 2026. u 00:00 po Beogradu (2026-11-15T23:00Z). Isto važi za `fairEvents.piiPurgeAt`, `fairLeads.purgeAt` i istek cookie-ja. |
| Shard ključ | B2 (§13.4): `<metrika>:<opseg>:<id>[:<dateKey>|:<hourKey>]`, metrika `scan_total`/`scan_unique`, opseg `model`/`stand`; npr. `scan_total:model:<id>:2026-10-09T14`. |
| Rotacija | `items` su poređane po `fairSponsoredSnapshotItems.order`. Klijent zove `getFairRotationSlot({ epochMs, nowMs, intervalMs, itemCount: items.length })` iz `lib/fair-client/rotation-slot.ts`. B5: `epochMs` = `publishedAt` objavljenog snapshot-a (§19.3). |
| Sponzorisani brojači | B5: `sponsored_<kind>:model:<id>[:<dateKey>\|:<hourKey>]`, `kind` ∈ `open_model`, `garage_add`. Impression ključ ne postoji. |

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
37. **Pravni tekst saglasnosti (P0)** (B4): nije napisan ni aktiviran, ni na DEV-u. Dok aktivna verzija ne postoji, `submitLead` vraća `CONSENT_NOT_CONFIGURED` i ništa ne čuva, a `getLeadForm` vraća `consent_not_configured`. Tekst mora da sadrži oznaku `{izlagac}`, koju server zamenjuje nazivom izlagača (§9.15). **K3:** aktivacija traži i zapis pravnog odobrenja (`legalApprovedBy`, `legalApprovedAt`), a tok se otvara tek uz Convex env `FAIR_LEADS_ENABLED=true` (§28).
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
49. **Dnevno mešanje bez nove objave** (B5): MASTER §10 kaže „redosled je stabilno izmešan za taj dan“ i „lista se objavljuje/obnavlja ručnom admin akcijom“. Redosled se zato meša po danu **objave**. Ako admin sledećeg dana ne objavi novu listu, ostaje redosled prethodnog dana. Treba li jutarnja automatska objava (cron) ili admin objavljuje svakog jutra?
50. **Epoha rotacije** (B5): `epochMs` = trenutak objave, kako je predloženo u §7. Svaka nova objava vraća rotaciju na prvi model nove liste. Alternativa je početak sajamskog dana.
51. **Rezultat pitanja u snapshot-u** (B5): izbor pitanja se zamrzava pri objavi (HANDOFF §5.7: item ima `audienceQuestionId`). Promena izbora traži novu objavu; tab to prikazuje kao „Potrebna nova objava“.
52. **Akcija za model koji je u međuvremenu ispao iz liste** (B5): `recordSponsoredAction` prima samo model iz trenutno objavljenog snapshot-a. Klik na karticu stare liste posle nove objave vraća `FEATURE_NOT_ENTITLED`.
53. **Admin u garaži** (B5): akcije prijavljenih ScanMe admina se ne isključuju (gateway ne prosleđuje sesiju, a MASTER §5 izuzima samo skenove). Treba li i ovde izuzeće?
54. **„Zatvaranje dana“** (B6): `fairEventDays` nema radno vreme, pa je kraj dana `endsAt` = ponoć po Beogradu (ceo kalendarski dan, isti ključ kao `dateKey`). Dataset je spreman oko 00:15–00:20. Ako izlagač treba presek odmah posle zatvaranja hale (npr. 20:00), potrebno je novo polje `closesAt` na danu i odluka kome pripadaju večernji skenovi.
55. **Format i šablon izveštaja (P1.3)** (B6): šablon PDF/XLSX/CSV je PRIVREMEN (neutralan raspored, tekstovi u `lib/i18n/sr/event-report.ts`). Automatski dnevni run je `pdf`. Admin može ručno da napravi `xlsx`/`csv` run i da preuzme svaki format istog dataseta. Šalje se jedan prilog po run-u. Da li izlagač dobija PDF i XLSX u istom emailu?
56. **Ocene i Glas publike u dnevnom preseku** (B6): brojači nemaju dnevni ključ, pa izveštaj prikazuje ukupno stanje u trenutku izrade (to piše i u izveštaju). Dnevni presek ocena bi tražio nove dnevne brojače.
57. **Ocene posle nadogradnje** (B6): projekcija prati paket na kraju dana. Model nadograđen sa Starter na Napredni prikazuje samo tri dimenzije. Ranije ukupne ocene ostaju u bazi, ali se ne prikazuju (nema „četvrte“ ocene). Treba li ih prikazati posebno?
58. **Izveštaj za osnovni nivo** (B6): `included` nema dnevni presek, pa ga cron ne pravi. Admin može ručno da napravi izveštaj sa ukupnim i jedinstvenim skeniranjima štanda. Kada se on šalje (npr. kao „završni izveštaj“, §9.9)?
59. **Agregat za organizatora** (B6): sadrži samo zbir po danu (skeniranja, jedinstvena, broj leadova po vrsti), bez podele po izlagaču. Preuzima ga admin; slanje organizatoru nije automatizovano. Šta tačno organizator dobija i kojim kanalom?
60. **Predaja leadova** (B6, nastavak §9.46): PII izvoz je poseban CSV/XLSX fajl koji admin preuzima. `fairLeads.status: delivered` se ne menja automatski, jer kanal i primalac (P0.2) nisu dogovoreni.
61. **Adrese izlagača i purge** (B7): `fairParticipations.reportRecipientEmail`, `leadDeliveryNote` i `fairReportRuns.recipient` su podaci klijenta (izlagača), a ne posetioca. Purge ih ne briše, jer MASTER §13 nabraja podatke posetilaca. Briše se ceo outbox, pa i `daily_report` redovi sa adresom izlagača. Ako i ova polja treba obrisati 16. 11., dodaje se jedna kategorija koja briše samo polja, ne redove (§23.2).
62. **Lokalne kopije PII** (MASTER §13: „i svih ScanMe lokalnih kopija“): CSV/XLSX kontakata koje je tim preuzeo na svoje računare backend ne vidi. Potreban je ručni korak 16. 11. za Aleksu, Jovana i Teodoru (§26.4).
63. **Trenutak purge-a** (B7, nastavak §9.11): brisanje kreće od 16. 11. 2026. u 00:00 po Beogradu. Cron proverava na 15 min, pa počinje najkasnije u 00:15.
64. **Stanje limitera posle purge-a** (B7): komponenta `rateLimiter` čuva kratkotrajno stanje bucket-a pod ID-em obrisanog `fairVisitors` reda, ne pod hash-om. Posle purge-a taj ID ne vodi ni do čega; stanje komponente se ne briše posebno.
65. **Poverenje gateway → Convex** (B7, authz nalaz): javne mutacije (`fairInteractions.*`, `fairLeads.submitLead`, `cards.resolveAndRecord`) prihvataju svaki ispravno formiran hash. Ko zaobiđe Next gateway i zove Convex direktno sa izmišljenim hash-evima, može da napumpa glasove, ocene, ankete, pečate i skenove, jer su limiti po posetiocu. PII time ne curi. Predlog: zajednička tajna (npr. `FAIR_GATEWAY_SECRET`) u Next i Convex okruženju, koju svaka visitor mutacija proverava. To traži postavljanje env promenljivih (agent to ne sme) i izmenu `cards.ts` i `app/r/[cardCode]` (van B7 opsega). **Rešeno u K1 (§27):** tajna `FAIR_GATEWAY_SECRET` i limit novih identiteta po IP HMAC-u. Vrednost za produkciju postavljaju Aleksa ili Jovan pre deploya (§27.6).
66. **NAT hale i generički `cardResolve`** (§9.27, B7 test): jedna IP adresa (npr. zajednički Wi-Fi hale) dobija 300 skenova odjednom, pa 5 u sekundi. Iznad toga posetilac dobija stranicu nevažeće kartice. Treba odluka: da li hala ima javni Wi-Fi i da li fair QR treba viši limit (izmena generičkog bucket-a, van fair opsega).
67. **Generalna proba 8. 10.** (B7 seed): TEST sajam elektromobilnosti počinje 8. 10. danom „TEST generalna proba“, a njegovi TEST paketi važe od 8. 10. u 00:00 (pre B7: 9. 10. u 09:00, §9.35). Drugi TEST sajam ostaje budući; paketi mu počinju 30. 10.
68. **HTTPS za telefone 8. 10.**: cookie posetioca je `Secure`, pa telefon dobija identitet samo preko HTTPS-a. DEV TEST QR kodovi postoje samo na DEV Convex-u, pa `/r/<kod>` mora da se otvori na hostu vezanom za DEV. Potreban je HTTPS preview ili tunel vezan za DEV; deploy radi Aleksa ili Jovan.
69. **Limit potvrda po adresi** (B7, nastavak §9.44): najviše 10 neposrednih potvrda na sat za jednu adresu (poređenje malim slovima). Varijante sa `+oznakom` se ne spajaju. Ovo je ublažavanje, ne potpuna zaštita (§9.65).
70. **Run napravljen pre zatvaranja dana** (K4, §29): od K4 novi takav run ne može da nastane. Red koji je već postojao ostaje u listi i i dalje može ručno da se odobri i pošalje, iako ima delimične podatke. Da li `approveReportRun` treba da ga odbije, ili da ga lista posebno označi? Sada ga ne dira ništa osim što ne blokira sweep.

## 10. Šta stiže posle B0

| Korak | Sadržaj |
|---|---|
| **B1** (urađeno, §11–§12) | `fairAdmin`, import (dry-run/commit), QR assign/release kroz `fair_model` destinaciju (isti subject → target → istorija → sync kanala tok kao `applyDestination`), filtriranje `event_only` u admin upitima, upgrade sa auditom, DEV TEST katalog |
| **B1A** | admin tab `Događaji` |
| **B2** (urađeno, §13–§14) | gateway, cookie i HMAC; fair hook u `resolveAndRecord` sa istim `requestId`; admin isključenje preko Convex Auth tokena; shard helper; `fairScan` rate limit; pečat pasoša; `fairPublic` katalog |
| **B3** (urađeno, §15–§16) | ocene, Glas publike, anketa, pasoš i favorit |
| **B4** (urađeno, §17–§18) | leadovi, saglasnost i email outbox (produkcija čeka pravni tekst) |
| **B5** (urađeno, §19–§20) | sponzorisani snapshot i rotacija (samo garažni `open_model`/`garage_add`) |
| **B6** (urađeno, §21–§22) | analitika, dnevni dataset, report lifecycle sa ručnim odobrenjem, PII izvoz i agregat za organizatora |
| **B7** (urađeno, §23–§26) | purge, authz, performance i integracioni test |

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
| `fairDevFixtures.seedTestPassport` (M1) | **internal** mutation | event + brend | jedan TEST pasoš (`TEST Volta`), ista pravila kao `publishPassport` |
| `fairDevFixtures.seedTestSponsoredSnapshot` (M2) | **internal** mutation | event + dan | TEST snapshot svih TEST modela sa KUPLJENIM paketom Advanced; B7: nova verzija i kad se promeni izabrano pitanje |
| `fairDevFixtures.seedIntegrationTest` (B7) | **internal** mutation | sve gore + TEST ključevi | integracioni TEST seed za 8. 10. (§26) |

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
   - B3 gateway mutacije: isto, iz istog cookie-ja;
   - K1: hash uvek ide zajedno sa `FAIR_GATEWAY_SECRET` i HMAC-om IP adrese (`fairGatewaySecret`/`fairIpHash` u `/r`, `gatewaySecret`/`ipHash` u gateway-u). Bez tajne Convex hash ne prihvata (§27).
5. **Gde token NE ide:** URL, query, telo odgovora, Convex (argumenti i tabele), klijentski JavaScript (HttpOnly), log. Hash ne ide u URL ni u klijent; u Convex-u je samo u `fairVisitors.visitorHash`. Rate limiter je ključan po `fairVisitors._id`, ne po hash-u.
6. **Bez tajne:**
   - produkcija (`NODE_ENV=production`): nema identiteta ni cookie-ja; `/r` i dalje beleži generički scan i preusmerava na model (`fairScan: "no_visitor"`); bootstrap vraća `503 VISITOR_UNAVAILABLE`;
   - development: jasno označen DEV-ONLY ključ.
   - K1, bez `FAIR_GATEWAY_SECRET` u Next env-u (u **svakom** okruženju, bez DEV zamene): `/r` ne šalje hash i ne pravi cookie (`fairScan: "no_visitor"`), a interakcije vraćaju `503 VISITOR_UNAVAILABLE` bez poziva Convex-a. Bootstrap ne zove Convex, pa se ne menja.

### 13.2 Šta se loguje

| Gde | Šta | Bez |
|---|---|---|
| Next server (`console.warn`, jednom po procesu) | `[fair] FAIR_VISITOR_SECRET_MISSING` (produkcija bez tajne) ili `[fair] FAIR_VISITOR_SECRET_DEV_FALLBACK: …` (development) | tokena, hash-a, IP-a, kontakta |
| Next server, K1 (jednom po procesu, §27.5) | `[fair] FAIR_GATEWAY_SECRET_MISSING`, `[fair] FAIR_GATEWAY_NOT_CONFIGURED`, `[fair] FAIR_GATEWAY_UNAUTHORIZED`, `[fair] FAIR_GATEWAY_REJECTED` | vrednosti tajne, tokena, hash-a, IP-a |
| Next dev request log | metoda, putanja, status, vreme (npr. `GET /r/0HENT03A 302`) | cookie-ja i tokena |
| Convex | ništa novo (`lib/fairScans.ts` ne loguje) | — |
| `fairScanEvents` | `requestId`, `visitorId` (ID reda, ne hash), model/štand/brend, vreme, `dateKey`, `hourKey`, `isAdminExcluded`, `adminUserId?` | tokena i hash-a |

### 13.3 Fair grana u `cards.resolveAndRecord`

Redosled u istoj transakciji, posle postojećeg generičkog upisa (`cardScanEvents`, brojači kartice i kanala — nepromenjeni):

1. `openableFairModel`: target je `fair_model`, model je `published`, događaj postoji i kartica pripada **aktivnoj** `fairQrAssignments` dodeli tog modela. Inače `{ kind: "invalid" }` i nema fair upisa.
2. `recordFairScan`:
   - ako je generički red za ovaj `requestId` već postojao → `duplicate`, ništa se ne piše. Fair red nastaje samo u transakciji koja je upisala generički red, pa jedan resolver request daje jedan generički događaj i **najviše jedan** `fairScanEvents` red;
   - nema ispravnog hash-a → `no_visitor`;
   - K1: hash bez ispravne `fairGatewaySecret` (ili Convex bez `FAIR_GATEWAY_SECRET`) → `gateway_rejected`; ništa se ne piše, a generički scan i redirect ostaju;
   - B7: od `FAIR_PII_PURGE_AT_MS` → `no_visitor` (posle purge-a ne nastaje nijedan red vezan za posetioca, ni kad uređaj sa pogrešnim satom pošalje cookie);
   - `fairVisitors` upsert po hash-u (`lastSeenAt`); K1: nov red prvo troši token `fairVisitorCreate` po `fairIpHash` → inače `rate_limited` (§27.4);
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
| `getEventMap` (M1) | `{ eventSlug }` | `{ eventId, stands[] }`: ne-povučeni štandovi sa bar jednim objavljenim modelom; štand ima `standId`, `mapLocationId`, `code`, `displayName`, `exhibitorName`, `brands[{ brandId, brandName, models[{ id, slug, displayName, variant? }] }]`; `null` za `draft`/nepostojeći event |

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
4. Jedan Convex poziv `fairInteractions.*`. K1: uz `gatewaySecret` (i `ipHash` kod mutacija); bez tajne u Next env-u nema poziva → 503 `VISITOR_UNAVAILABLE` (§27).
5. Odgovor `{ ok: true, value }` ili `{ ok: false, code }`, uvek sa `Cache-Control: no-store`.

Redosled u svakoj mutaciji:
0. K1: `FAIR_GATEWAY_SECRET` (pre svega, i u upitima) → `FAIR_GATEWAY_NOT_CONFIGURED` / `FAIR_GATEWAY_UNAUTHORIZED`;
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
   0. K1: `FAIR_GATEWAY_SECRET` pre svega (§27), pa direktan poziv Convex-a ne može da upiše lead ni da pošalje potvrdu; K3: odmah zatim prekidač `FAIR_LEADS_ENABLED` (tačno `"true"`) → inače `LEADS_DISABLED`, bez ikakvog čitanja i upisa (§28);
   1. hash i `submissionId` (`FAIR_SUBMISSION_ID_PATTERN`);
   2. **idempotentnost:** postojeći `submissionId` istog posetioca, modela i vrste vraća sačuvan ishod sa `duplicate: true` i ne piše i ne šalje ništa; tuđi → `SUBMISSION_DUPLICATE`;
   3. objavljen model, event `published`/`live`, pre purge-a;
   4. paket **na snazi u trenutku slanja**: `interest` Starter+, `test_drive` samo Advanced → inače `FEATURE_NOT_ENTITLED`;
   5. `fairLeadConfigs` za model i vrstu mora postojati i biti `enabled` → inače `FEATURE_NOT_ENTITLED`;
   6. **produkcijski gate:** aktivna `fairConsentConfigs` verzija za event i vrstu → inače `CONSENT_NOT_CONFIGURED`;
   7. `consentAccepted: true` i `consentVersion` = aktivna verzija → inače `CONSENT_REQUIRED`;
   8. ime (1–120 znakova) i kontakt po `contactRequirement` (`one_of` | `email` | `phone` | `both`); neispravan format → `INVALID_INPUT`, nedostaje kanal → `CONTACT_REQUIREMENT_NOT_MET`; `preferredContact` nikad ne pravi obavezno polje; **B7:** ako postoji email, a ta adresa (malim slovima) je u poslednjih 60 min već dobila 10 neposrednih potvrda → `RATE_LIMITED` (§25.3); outbox `recipient` je adresa malim slovima;
   9. `fairVisitors` upsert i `fairLeadSubmit` limit → `RATE_LIMITED`;
   10. `fairLeads` red: `consentTextSnapshot` = aktivni tekst sa `{izlagac}` zamenjenim nazivom izlagača (server, ne browser), `consentedAt`, `status: received`, `followUpSuppressed: false`, `purgeAt` = 16. 11. 2026 (`FAIR_PII_PURGE_AT_MS`);
   11. ako postoji email: outbox red neposredne potvrde (`scheduledFor` = sada); ako paket na snazi ima `postEventFollowUp` (Advanced) **i** (K3) `FAIR_FOLLOWUP_ENABLED` je tačno `"true"`: i outbox red follow-upa (§17.3).

   Svako odbijanje baca `ConvexError({ code })`, pa se ne upisuje ništa: ni lead, ni posetilac, ni outbox, ni token limitera.

| HTTP | Kodovi |
|---|---|
| 400 | `INVALID_INPUT` |
| 403 | `FEATURE_NOT_ENTITLED`, `ORIGIN_NOT_ALLOWED` |
| 404 | `FAIR_MODEL_NOT_FOUND` |
| 409 | `CONSENT_NOT_CONFIGURED`, `EVENT_NOT_ACTIVE`, `SUBMISSION_DUPLICATE`, `LEADS_DISABLED` (K3) |
| 422 | `CONSENT_REQUIRED`, `CONTACT_REQUIREMENT_NOT_MET` |
| 429 | `RATE_LIMITED` |
| 502/503 | `SERVICE_UNAVAILABLE`, `VISITOR_UNAVAILABLE` (poruka greške se ne prosleđuje) |

### 17.2 Javni obrazac `fairPublic.getLeadForm({ eventModelId, kind })`

Vraća `FairLeadFormView` (bez PII):
- `leads_disabled` (K3): Convex env `FAIR_LEADS_ENABLED` nije tačno `"true"`; važi za svaki model i vrstu, pre svih ostalih provera (obrazac se ne prikazuje);
- `unavailable`: model nije objavljen, sačuvani paket nema pravo ili obrazac nije uključen;
- `consent_not_configured`: nema aktivne saglasnosti (obrazac se ne prikazuje);
- `open`: `contactRequirement`, `preferredContact?` i `consent: { version, text }`; `text` je već renderovan sa nazivom izlagača. Browser prikazuje taj tekst i šalje nazad `version`.

Kao i `capabilities`, upit čita sačuvani paket (upit ne čita sat); `submitLead` sudi po paketu na snazi.

### 17.3 Outbox `fairEmailDeliveries` i slanje

- `dedupeKey` = `fair-lead/<leadId>/<immediate_confirmation|post_event_follow_up>`; jedan red po ključu, nastaje samo u transakciji koja je upisala lead. Retry submit-a ga ne dodaje.
- Mutacija samo pravi red i zakazuje `fairEmailSender.sendDelivery` (Node `internalAction`). Sender:
  1. `fairEmails.claimDelivery` (internal mutation) uzima samo `queued` red čiji je trenutak došao; K3: za potvrdu i follow-up **ponovo proverava prekidače** (`FAIR_LEADS_ENABLED`, a za follow-up i `FAIR_FOLLOWUP_ENABLED`) → `skipped` sa `lastError` `LEADS_DISABLED` / `FOLLOW_UP_DISABLED`, ništa se ne šalje; zatim ponovo čita lead i za follow-up proverava `followUpSuppressed` (→ `suppressed`) i aktivni tekst izlagača (→ `failed: FOLLOW_UP_TEMPLATE_MISSING`); povećava `attemptCount`;
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

Zakazivanje, audit i ostale visitor tabele su B7 (§9.48). Od B7 brisanje vodi `convex/fairRetention.ts` (§23); `purgeLeadPiiBatch` ostaje kao B4 seam i cron ga ne poziva.

## 18. B4 — admin (`convex/fairLeadsAdmin.ts`, sve sa `requireAdmin`)

| Funkcija | Pravilo |
|---|---|
| `getEventConsents` | Verzije saglasnosti po vrsti, najnovije prve (≤20 po vrsti); K3: uz `legalApprovedBy?`/`legalApprovedAt?`. |
| `saveConsentDraft` | Nova verzija (sledeći broj) ili izmena postojećeg nacrta. `active` i `retired` se ne menjaju (`FAIR_CONSENT_STATUS`). |
| `activateConsent` | `draft → active`, prethodna aktivna → `retired`, u istoj transakciji. **K3:** traži `legalApprovedBy` (1–120 znakova) i `legalApprovedAt` (epoch ms, ne u budućnosti), koje admin unosi; bez njih `FAIR_CONSENT_LEGAL_APPROVAL_REQUIRED` i ništa se ne menja. Oba se čuvaju na verziji i upisuju u `adminAuditLog` (`fair_consent_activated`). Tekst mora imati `{izlagac}` (`FAIR_CONSENT_EXHIBITOR_MISSING`). Aktivira se samo stručno proveren tekst (P0). Sama aktivacija ne otvara tok bez `FAIR_LEADS_ENABLED` (§28). |
| `retireConsent` | `active → retired`; obrazac te vrste se zatvara (`CONSENT_NOT_CONFIGURED`). Audit `fair_consent_retired`. |
| `getModelLeadSettings` | Paket, obrazac `interest` i `test_drive` i aktivni tekst follow-upa modela. |
| `upsertLeadConfig` | Jedan red po modelu i vrsti; `enabled: true` traži pravo u paketu modela (`FAIR_FEATURE_NOT_ENTITLED`). `created`/`updated`/`unchanged`. |
| `upsertFollowUpTemplate` | Samo Advanced. Tekst izlagača (naslov ≤150, tekst ≤5000, samo plain text) postaje nova aktivna verzija, a prethodna se povlači. |
| `exportLeads` | Paginiran izvoz jednog učešća (izlagač na eventu), najnoviji prvi, najviše 100 po strani; uz svaki lead i stanje potvrde i follow-upa. Učešće drugog eventa → `FAIR_LINK_NOT_FOUND`. |
| `setFollowUpSuppressed` | Otkazivanje follow-upa po odgovoru posetioca (`suppressedAt`, `suppressedByUserId`); povratno za grešku admina. Sender ga ponovo čita neposredno pre slanja. |
| `retryEmailDelivery` | `failed → queued`, isti `dedupeKey`/`Idempotency-Key`; ostala stanja → `FAIR_EMAIL_DELIVERY_STATUS`. |

Admin UI je tab `Događaji → Leadovi` (`components/admin/admin-events-leads.tsx`); tekstovi su u `lib/i18n/sr/admin-events.ts`. Sekcija se montira samo dok je tab otvoren, pa se kontakti ne učitavaju u pozadini.

**Nijedna javna funkcija ne vraća kontakt.** `submitLead` vraća samo `FairLeadSubmitResult`, `getLeadForm` samo pravilo i tekst saglasnosti, a funkcija koja po visitor hash-u čita kontakt ne postoji. Test (`convex/fairLeads.test.ts`) prolazi kroz izlaze javnih i visitor funkcija i proverava da u njima nema imena, emaila, telefona, hash-a ni snapshot-a. Proverava i da je jedina javna lead funkcija `submitLead`, da su outbox, sender i purge `internal`, a da admin funkcije odbijaju anonimnog i ne-admin korisnika.

## 19. B5 — sponzorisani snapshot i rotacija (stvarna površina)

Izvori: HANDOFF §5.7, §7, §11 B5, §12; MASTER §6, §10; JOVAN-DELTA §2; V2 §6–§7. Šema se u B5 ne menja; B5 prvi put piše B0 tabele `fairSponsoredSnapshots`, `fairSponsoredSnapshotItems` i `fairSponsoredEvents`. Jezgro je `convex/lib/fairSponsored.ts`.

### 19.1 Snapshot

- Nastaje **samo** ručnom admin objavom (`fairSponsoredAdmin.publishSponsoredSnapshot`, §20). Nema crona ni automatske obnove (§9.49).
- Sadrži svaki model eventa koji je u trenutku objave `published` i čiji je paket **na snazi** Advanced (`fairModelTierAt`; buduća aktivacija se ne primenjuje unapred). Starter, `included`, nacrt i povučen model nikad ne ulaze.
- Redosled: stabilno mešanje po `seed` + `dayKey` (Beograd). Ključ modela je FNV-1a heš niza `seed|dayKey|eventModelId`, a jednakost rešava ID. Isti dan i seed daju isti redosled; model dodat istog dana se ubacuje bez pomeranja ostalih. `seed` = `fair-sponsored-v1:<eventId>` (čuva se na snapshot-u radi provere).
- Immutable: objava nikad ne menja postojeći item. Pravi nov snapshot sa `version` + 1 i `status: published`, a prethodni `published` prelazi u `retired`. Po eventu je najviše jedan `published`.
- `audienceQuestionId` itema = pitanje izabrano sa `setSponsoredResultQuestion` (ne nacrt) u trenutku objave. Promena izbora ulazi u rotaciju tek posle nove objave.
- Prazna lista je dozvoljena: tako se rotacija skida kada nema Advanced modela.
- Tehnički limit je 200 modela po snapshot-u (`FAIR_SPONSORED_LIMIT`).

### 19.2 Javne projekcije (`convex/fairPublic.ts`, query, bez identiteta)

| Funkcija | Args | Vraća |
|---|---|---|
| `getSponsoredMapRotation` | `{ eventSlug }` | `FairSponsoredRotationView` sa `surface: "map"`, `intervalMs: 12000`; stavka ima `audienceResult` ako je pitanje izabrano |
| `getSponsoredGarageRotation` | `{ eventSlug }` | isto, `surface: "garage"`, `intervalMs: 8000`; nikad `audienceResult` |

`null` znači da nema rotacije: nepostojeći ili `draft` event, ili još nije objavljen snapshot. Mapa i svi displeji koriste istu projekciju; poseban display endpoint ne postoji.

`FairSponsoredModelCard`: `eventModelId`, `eventId`, `eventSlug`, `slug`, `brandId`, `brandName`, `displayName`, `variant?`, `priceText`, `visual`, `photoUrl?`, `brandLogoUrl?`, `standMapLocationId`, `order`, `audienceResult?`.

- **Fotografija:** `visual: "photo"` sa `photoUrl` samo iz istog modela (`photoUrl` ili `photoStorageId`). Bez nje `brand_logo` sa `brandLogoUrl` (`brands.logoStorageId`). Bez oba `event_placeholder`, bez URL-a, a frontend crta neutralni event placeholder. Fotografija drugog vozila se nikad ne vraća.
- **Rezultat na mapi:** `{ questionId, prompt, options, result }`. `result` je isti `FairAudienceResultView` kao u B3: ispod 5 glasova `waiting_for_minimum` bez procenta (UI: „Glasanje je u toku“), od 5 celobrojni procenti. Na mapi se ne glasa.
- Model povučen posle objave se preskače, pa javno nikad ne prikazujemo povučen model. Svi klijenti dobijaju istu listu, pa i dalje računaju isti slot.
- **Bez impression polja i bez metrike.** Upit ne može da piše, a test proverava da čitanje ne menja nijednu tabelu.

### 19.3 Mapiranje na `lib/fair-client/rotation-slot.ts`

| Polje projekcije | Ulaz u `getFairRotationSlot` / `getFairRotationItem` |
|---|---|
| `epochMs` (= `publishedAt` snapshot-a) | `epochMs` |
| `intervalMs` (`FAIR_MAP_ROTATION_INTERVAL_MS` 12000 / `FAIR_GARAGE_ROTATION_INTERVAL_MS` 8000, iste vrednosti kao u `rotation-slot.ts`) | `intervalMs` |
| `items.length` | `itemCount` (ili `getFairRotationItem(items, …)`) |
| sat uređaja | `nowMs` |
| `seed`, `version`, `dayKey`, `snapshotId` | ne ulaze u formulu. Redosled je već primenjen na serveru; promena `version`/`snapshotId` znači da je objavljena nova lista. |

Formula je Kodeksova i ostaje jedina: `index = floor(max(0, now − epoch) / interval) mod itemCount`. Zato se svaki model prikaže jednom pre ponavljanja, a svi ekrani sa istim satom prikazuju isti model. Pauza garažne trake tokom interakcije (MASTER §6) je frontend ponašanje i ne menja epohu. HANDOFF §5.7 traži „seed/version/epoch vrednosti potrebne za dnevno stabilan ravnopravan round-robin“; ovde ih server primenjuje i vraća, pa konflikta sa `rotation-slot.ts` nema.

### 19.4 `recordSponsoredAction` (`convex/fairInteractions.ts`) i `POST /api/fair/sponsored-action`

Telo rute: `FairSponsoredActionInput` = `{ eventModelId, surface: "garage", kind: "open_model" | "garage_add", requestId }`. Gateway (`lib/fair-server/sponsored.ts`) je isti kao B3/B4: same-origin, strogo telo (bez `visitorHash`), hash iz HttpOnly cookie-ja, `no-store`. Map/display surface i druge vrste odbija već gateway (400), a Convex ponovo (`INVALID_INPUT`).

Redosled u mutaciji: hash → `surface === "garage"` → vrsta → `requestId` (`FAIR_SUBMISSION_ID_PATTERN`) → dedupe po `requestId` (isti posetilac, model i vrsta → `duplicate: true`, ništa novo; inače `SUBMISSION_DUPLICATE`) → objavljen model i aktivan event → paket na snazi ima `sponsoredGarageRotation` → model je u objavljenom snapshot-u (inače `FEATURE_NOT_ENTITLED`) → `upsertFairVisitor` → `fairSponsoredAction` limit → red `fairSponsoredEvents` (`surface: "garage"`, `dateKey`, `hourKey`, `visitorId`) + tri brojača `sponsored_<kind>:model:<id>[:dan|:sat]`.

Vraća `FairSponsoredActionResult` = `{ eventModelId, kind, recordedAt, duplicate }`.

- Nije QR scan: ne piše `fairScanEvents`, `fairUniqueScans`, `cardScanEvents`, pečat pasoša ni `scan_*` brojač (test).
- Ne dodaje model u garažu: garaža je u browseru, a model dodaje samo posetilac.
- Mapa i displej nemaju sponzorisani upis.
- Posle purge-a ostaju samo anonimni brojači (`visitorId` je PII, B7).

Rate limit `fairSponsoredAction`: rate 20/min, kapacitet 10, ključ `fairVisitors._id`. Aritmetika: traka menja karticu na 8 s, pa čovek može najviše oba dugmeta po kartici, 2 na 8 s = 15/min. Retry istog `requestId` ne troši token.

## 20. B5 — admin (`convex/fairSponsoredAdmin.ts`, sve sa `requireAdmin`)

| Funkcija | Pravilo |
|---|---|
| `publishSponsoredSnapshot` | `{ eventId }` → `{ snapshotId, version, dayKey, seed, publishedAt, itemCount, retiredSnapshotIds }`. Nova immutable lista po §19.1; prethodna `published` → `retired`; audit `fair_sponsored_snapshot_published`. |
| `getSponsoredRotationAdmin` | `{ eventId }` → aktivni snapshot sa itemima po redu, poslednjih 10 verzija i kandidati (objavljeni modeli sa sačuvanim paketom Advanced, `packageActivatedAt`, trenutno izabrano pitanje). Bez podataka posetilaca i bez metrike. |

Izbor pitanja ostaje `fairInteractionsAdmin.setSponsoredResultQuestion` (B3, §16).

Admin UI je tab `Događaji → Sponzorisano` (`components/admin/admin-events-sponsored.tsx`). Prikazuje redosled objavljene liste i rezultat uz svaki model, stanje „Ažurno / Potrebna nova objava“ (model nedostaje, više nije objavljen Advanced, promenjen rezultat, paket počinje kasnije), objavu nove liste uz potvrdu, izbor rezultata po Advanced modelu i verzije. Tekstovi su u `lib/i18n/sr/admin-events.ts`.

## 21. B6 — analitika i dnevni dataset (stvarna površina)

Izvori: HANDOFF §5.6, §7 `fairAnalytics`/`fairReports`, §10, §11 B6, §12 „Izveštaji i izolacija“; MASTER §12, §13; V2 §9. Šema: `fairReportRuns` dobija opciona polja `dataset` i `sendCount`, a `fairEmailDeliveries` opciono `reportRunId`. Nijedan indeks nije dodat.

### 21.1 Projekcija po paketu (`lib/fair-entitlements.ts` → `fairReportMetrics(tier)`)

| Grupa | included | starter | advanced |
|---|:-:|:-:|:-:|
| `stand_scans` (ukupno/jedinstveno štanda) | da | da | da |
| `model_scans` (dnevno po modelu) | — | da | da |
| `hourly_scans`, `day_comparison` | — | da | da |
| `interest` | — | da | da |
| `test_drive` | — | — | da |
| `rating_overall` | — | da | — |
| `rating_dimensions` (izgled, specifikacije, cena) | — | — | da |
| `audience` (Glas publike tog dana) | — | da | da |
| `survey` (zbir odgovora, nikad pojedinačni) | — | — | da |
| `sponsored_garage` (`open_model`, `garage_add`; bez impressions) | — | — | da |

Grupa koju paket nema **ne postoji** u datasetu (nema ključa, nema 0). U tabeli izveštaja takav model ima „—“. Paket se čita za kraj dana (`fairModelTierAt(model, day.endsAt - 1)`). Skenovi pre nadogradnje ostaju (B2 brojači).

### 21.2 Dataset (`convex/lib/fairReportDataset.ts`, validator `fairDailyDataset`)

- Jedan dataset = jedno učešće × jedan sajamski dan. Prozor je `[fairEventDays.startsAt, endsAt)`, beogradski kalendarski dan (§9.54).
- Izvori:
  - `scan_*` dnevni i satni ključevi (B2);
  - `rating_*` (B3, kumulativno);
  - `audience_votes:*` za pitanja tog dana (B3);
  - `fairSurveyResponses` u prozoru (zbir po pitanju i odgovoru);
  - `fairLeads` u prozoru (**samo broj**);
  - `sponsored_<kind>:model:<id>:<dateKey>` (B5).
- `stands`: ukupno i jedinstveno štanda u trenutku izrade (svaki paket).
- `hourly`: zbir modela sa `hourly_scans` (24 sata; 23 ili 24 na DST dan, ponovljeni sat jednom).
- `comparison` od drugog dana: `scans_total`, `scans_unique`, `interest`, `test_drive`, `sponsored_open_model`, `sponsored_garage_add`. Red sabira samo modele koji su grupu imali na kraju **oba** dana.
- Limiti: najviše 100 modela po učešću (`modelsTruncated`), najviše 1000 sirovih redova po brojanju (`capped` znači „najmanje“), 10 pitanja po modelu i danu.
- Izolacija: `modelDayRaw` vraća `null` za model drugog učešća ili dan drugog eventa; `reportContext` vraća `null` kad dan i učešće nisu istog eventa.

### 21.3 Internal funkcije (`convex/fairAnalytics.ts`)

| Funkcija | Šta radi |
|---|---|
| `reportContext({ participationId, eventDayId })` | event, dan, prethodni dan (`sortOrder`), izlagač, `reportRecipientEmail`, štandovi sa ukupnim brojevima, ID-evi modela (bez `draft`) |
| `modelDayRaw({ eventModelId, participationId, eventDayId, previousEventDayId? })` | brojevi jednog modela za grupe njegovog paketa i vrednosti prethodnog dana |
| `organizerScope`, `organizerStandDays`, `organizerParticipationLeads` | agregat za organizatora; traže admina |

### 21.4 Rok od 60 minuta (`convex/crons.ts`: „fair daily report sweep“, svakih 15 min)

`fairReports.sweepDailyReports` (internal) radi za događaje `published`/`live`/`ended`. Za svaki dan zatvoren u poslednja 24 h i svako `active` učešće sa bar jednim modelom koji ima dnevni presek pravi po jedan run, koji odmah ide na izradu. Run nastaje najkasnije 15 min posle kraja dana, a izrada traje sekunde, pa je dataset spreman pre roka (`FAIR_REPORT_READY_WITHIN_MS`, test).

Sweep:
- je idempotentan (jedan run po dan × učešće); K4: računa se samo run napravljen u trenutku zatvaranja dana ili posle njega (`createdAt >= endsAt`), pa raniji run ne blokira dnevni izveštaj (§29);
- pravi najviše 100 novih run-ova po pozivu (ostatak nastavlja preko scheduler-a);
- **nikad ne šalje**.

## 22. B6 — izveštaji, slanje i izvozi (`convex/fairReports.ts`)

### 22.1 Lifecycle

`queued → building → pending_review → approved → sent | failed`

| Funkcija | Vrsta | Pravilo |
|---|---|---|
| `requestReportBuild({ eventDayId, participationId, format })` | admin mutation | nov `queued` run i izrada; dan i učešće moraju biti istog eventa (`FAIR_LINK_CONFLICT`); K4: dan mora biti zatvoren (`endsAt <= now`), inače `FAIR_DAY_NOT_CLOSED` i ništa se ne upisuje (§29) |
| `buildReportRun` | internal action | `claimBuild` (`queued → building`) → `reportContext` + `modelDayRaw` po modelu → `assembleFairDailyDataset` → fajl u formatu run-a u storage → `completeBuild` (`pending_review`, `dataset`, `storageId`, primalac iz učešća). Greška → `failed` (`BUILD_FAILED`) |
| `approveReportRun` | admin mutation | **jedini** put do `approved`: samo iz `pending_review` sa datasetom i fajlom; upisuje `reviewed*` i `approved*`; audit `fair_report_approved` |
| `sendReportRun({ reportRunId, recipient? })` | admin mutation | odbija sve osim `approved` (`FAIR_REPORT_NOT_APPROVED`); primalac = argument, `run.recipient` ili `reportRecipientEmail` (inače `FAIR_REPORT_RECIPIENT_MISSING`); drugi klik dok isporuka čeka → `FAIR_REPORT_STATUS` |
| `resendReportRun` | admin mutation | samo iz `sent`; isti odobreni fajl, nov ključ |
| `retryReportRun` | admin mutation | samo iz `failed`: neuspela izrada → `queued` (ponovo na pregled); neuspelo slanje odobrenog run-a → `approved` i nova isporuka |
| `createReportCorrection({ reportRunId, format? })` | admin mutation | nov run sa `correctionOfReportRunId` i svežim podacima; ponovo pregled i odobrenje; K4: isto pravilo zatvorenog dana (`FAIR_DAY_NOT_CLOSED`) |
| `listReportRuns({ eventId })`, `getReportRun({ reportRunId })` | admin query | lista bez dataseta (najviše 500); jedan run sa datasetom za pregled |

### 22.2 Slanje kroz B4 outbox

- `sendReportRun` upisuje red u `fairEmailDeliveries` (`kind: daily_report`, `reportRunId`, `dedupeKey = fair-report/<runId>/<n>`, isto je Resend `Idempotency-Key`) i zakazuje `fairEmailSender.sendDelivery`.
- `fairEmails.claimDelivery` **ponovo proverava** neposredno pre slanja: run postoji, ima `approvedAt`, status je `approved` ili `sent` (resend) i ima dataset i fajl. Inače isporuka postaje `failed` (`REPORT_NOT_SENDABLE`/`REPORT_FILE_MISSING`) i ništa se ne šalje. Test to proverava sa ručno ubačenim redom za neodobren run.
- Sender prilaže sačuvani fajl run-a (base64). Tekst emaila je placeholder iz `event-report`; ispravka dobija rečenicu o ispravljenoj verziji.
- `markSent` → run `sent` (`providerMessageId`). Konačna greška prvog slanja → run `failed`. Greška ponovnog slanja ostavlja `sent` i upisuje `error`.

### 22.3 Fajlovi i izvozi (admin `action`, vraćaju `{ fileName, mimeType, chunks }` kao `menuExport`)

| Funkcija | Sadržaj |
|---|---|
| `downloadReportRun({ reportRunId, format })` | pregledani dataset u PDF/XLSX/CSV; ne pravi nov storage |
| `exportLeadsFile({ eventId, participationId, format: csv\|xlsx })` | **odvojen PII artefakt**: kontakti jednog izlagača (stranice po 200, najviše 5000, inače `FAIR_REPORT_EXPORT_TOO_LARGE`); nikad deo izveštaja ni emaila |
| `exportOrganizerAggregate({ eventId, format })` | zbir po danu za ceo event: skeniranja, jedinstvena, broj leadova po vrsti; bez izlagača, PII i odgovora ankete |

Pisci su u `convex/lib/fairReportFiles.ts`: jedan neutralan dokument se pretvara u CSV (BOM, zaštita od formula), XLSX (zip iz `lib/memories-export/zip.ts`) i PDF (tekstualni primitivi iz `lib/menu-export/pdf.ts`). Postojeći writeri su samo uvezeni, nisu menjani. Nema novog paketa.

### 22.4 Admin UI

Tab `Događaji → Izveštaji` (`components/admin/admin-events-reports.tsx`) ima:
- novu izradu (dan, izlagač, format);
- listu sa statusima i pregled istog dokumenta koji ide u fajl;
- `Odobri` (sa potvrdom), `Pošalji` / `Pošalji ponovo` (opciono druga adresa), `Pokušaj ponovo`, `Napravi ispravku`;
- preuzimanje PDF/XLSX/CSV;
- posebne izvoze: kontakti (uz upozorenje o ličnim podacima) i zbirno za organizatora.

Tekstovi taba su u `lib/i18n/sr/admin-events.ts`, a tekstovi fajlova i emaila u `lib/i18n/sr/event-report.ts`.

## 23. B7 — brisanje PII 16. novembra (`convex/fairRetention.ts`)

Izvori: HANDOFF §5.6, §12 („purge batch ne prelazi limit…“), §14; MASTER §13, §18; V2 §9 (Retention), §11.

### 23.1 Kako radi

- **Pokretanje.** Cron „fair pii purge“ (`convex/crons.ts`, svakih 15 min) zove `purgeTick`. Pre `FAIR_PII_PURGE_AT_MS` (16. 11. 2026. 00:00 po Beogradu) vraća `not_due` i ništa ne briše. Od tog trenutka pokreće `execute` run. Ručno brisanje (admin ili javno) ne postoji.
- **Serije.** Jedna transakcija briše najviše `FAIR_PURGE_BATCH_SIZE` = 200 redova, pa zakazuje `purgeContinue` (`runAfter(0)`). Redovi se uvek uzimaju od početka tabele, pa je brisanje idempotentno.
- **Redosled** (`FAIR_PURGE_CATEGORIES`): `email_deliveries` → `leads` → `survey_responses` → `ratings` → `audience_votes` → `brand_favorites` → `passport_stamps` → `sponsored_actions` → `traffic_events` → `share_collections` → `unique_scans` → `scan_events` → `visitors`. Kategorija je gotova tek kad je njena tabela prazna. Zato nijedan red ne pokazuje na već obrisan red: traffic događaji se brišu pre kolekcija, outbox pre leadova, a svi redovi sa `visitorId` pre `fairVisitors`.
- **Retry.** Napredak (pozicija kategorije i broj redova) upisuje se u istoj transakciji kao serija. Pala serija se vraća cela. Ako se izgubi nastavak, sledeći cron tick posle `FAIR_PURGE_STALL_MS` (10 min) nastavlja od poslednje završene serije (`resumed`).
- **Posle kraja.** Svaki sledeći tick proverava da li je bilo koji PII red ponovo nastao (npr. ručno poslat izveštaj). Ako jeste, pokreće novi run; inače vraća `clean`.
- **Zaštita od novih redova.** Interakcije, leadovi i garažne akcije posle purge trenutka vraćaju `EVENT_NOT_ACTIVE` (B3/B4). Od B7 i `/r` sken vraća `no_visitor` (§13.3), pa ne nastaje posetilac.

### 23.2 Šta se briše, a šta ostaje

| Kategorija | Tabela | Šta sadrži |
|---|---|---|
| `email_deliveries` | `fairEmailDeliveries` | primaoci potvrda, follow-upa i `daily_report` isporuka |
| `leads` | `fairLeads` | ime, email, telefon, snapshot saglasnosti, suppression |
| `survey_responses` | `fairSurveyResponses` | odgovori vezani za posetioca |
| `ratings` | `fairRatings` | ocene posetioca |
| `audience_votes` | `fairAudienceVotes` | glasovi posetioca |
| `brand_favorites` | `fairBrandFavoriteVotes` | omiljeni model iz pasoša |
| `passport_stamps` | `fairPassportStamps` | pečati |
| `sponsored_actions` | `fairSponsoredEvents` | garažne akcije sa `visitorId` |
| `traffic_events` | `fairTrafficEvents` | odvojene direct/share akcije bez visitor identiteta |
| `share_collections` | `fairShareCollections` | javne kolekcije modela i hash deljenog koda |
| `unique_scans` | `fairUniqueScans` | par posetilac+model |
| `scan_events` | `fairScanEvents` | pojedinačni skenovi (i admin audit redovi) |
| `visitors` | `fairVisitors` | hash identiteta |

Ostaje (anonimno ili nije podatak posetioca): `fairMetricCountShards` (svi brojači i zbirovi), `fairReportRuns` sa zamrznutim datasetom i fajlom, katalog (`fairEvents` … `fairPackageActivations`), pitanja, ankete, pasoši, saglasnosti (tekst bez osobe), lead konfiguracije i tekstovi follow-upa. Generički `cardScanEvents` nema vezu sa posetiocem. Adrese izlagača su otvoreno pitanje §9.61.

### 23.3 Funkcije

| Funkcija | Vrsta | Šta radi |
|---|---|---|
| `purgeTick` | internal mutation (cron) | `not_due` / `running` / `resumed` / `clean` / `started` (§23.1) |
| `purgeContinue({ runId })` | internal mutation (scheduler) | jedna serija aktivnog run-a |
| `previewPurge` | internal query (CLI) | broj redova po kategoriji, najviše `FAIR_PURGE_PREVIEW_CAP` = 200 (`capped`) |
| `startDryRun` | internal mutation (CLI) | `dry_run` istim serijama: samo broji (kursor `_creationTime`), ništa ne briše; postojeći dry run se ne duplira |
| `listPurgeRuns` | internal query (CLI) | poslednjih 10 run-ova (audit) |
| `getRetentionOverview` | admin query | preview + poslednjih 10 run-ova |
| `startPurgeDryRun` | admin mutation | isto kao `startDryRun`, okidač `admin` |

DEV komande (samo `.env.local` DEV, nikad `--prod`): `npx convex run fairRetention:previewPurge`, `fairRetention:startDryRun`, `fairRetention:listPurgeRuns`.

### 23.4 Audit `fairPurgeRuns`

`mode: dry_run | execute`, `trigger: cron | admin | cli`, `status: running | completed`, `startedAt`, `updatedAt`, `finishedAt?`, `position`, `cursorCreationTime?` (samo dry run), `batches`, `categories[{ category, rows, status: pending | running | done, startedAt?, finishedAt? }]`. Indeks `by_mode_and_status`. Nema identifikatora posetioca, leada ni kontakta (test proverava serijalizovan red).

### 23.5 Admin UI

Tab `Događaji → Brisanje podataka` (`components/admin/admin-events-retention.tsx`): datum, šta ostaje, preview po kategoriji redom brisanja („200+“ iznad limita), dugme `Pokreni probno brojanje` i dnevnik run-ova. Dugme za brisanje ne postoji. Tekstovi su u `lib/i18n/sr/admin-events.ts`.

## 24. B7 — authz

Tabela svake fair funkcije (`visitor` / `admin` / `internal`, vraća li PII i koji test to dokazuje) je u `jovan-status/B7.md` §2.4. `convex/fairAuthz.test.ts` je zaključava:
- registracija svakog fair modula mora tačno da odgovara tabeli (nova javna funkcija pada test dok se ne klasifikuje);
- svaka admin funkcija B3–B7 modula odbija anonimnog („Niste prijavljeni.“) i ne-admin („Nemate administratorski pristup.“) poziv pre bilo kakvog upisa; `fairAdmin`/`fairImport` pokriva `fairAdmin.test.ts`;
- izlazi svih 11 `fairPublic` upita, 7 `fairInteractions` funkcija, `submitLead` i fair grane `/r` posle punog toka posetioca ne sadrže ime, email, telefon, hash, ID posetioca ili leada, adresu ili napomenu izlagača, QR kodove, SMK/SML ni ključeve agregata ocena.

Nalaz bez izmene koda (van opsega ili čeka odluku): §9.66 (NAT). §9.65 (poverenje gateway → Convex) je rešen u K1; tabela zaštićenih funkcija je u §27.3.

## 25. B7 — performanse i limiti

### 25.1 Upiti

Nijedan fair upit ne koristi `.collect()`, a svi su indeksirani i ograničeni (`take`, `first`, `unique`, paginacija). Bez indeksa su samo serije purge-a (namerno, po redosledu nastanka) i DEV fixture-i. Najveći čitači i realna gornja granica (ceo QR inventar od 100 modela na jednom sajmu) su u `jovan-status/B7.md` §2.5. `convex/fairPerformance.test.ts` ih poziva na seed-u te veličine: mapa (25 štandova, 100 modela), rotacija (25 Advanced sa rezultatom), katalog pasoša i lični pasoš (10 × 4), `getMyModelState`, `getModelsByIds` (50 da, 51 `INVALID_INPUT`).

B7 izmena: `fairPublic` čita najviše `FAIR_SPONSORED_ITEMS_CAP` = 200 itema snapshot-a (bilo 500), jer objava nikad ne pravi više.

### 25.2 Rate limit (sve token bucket, period 1 min, ključ po posetiocu osim `cardResolve`)

| Bucket | rate | kapacitet | Aritmetika |
|---|---:|---:|---|
| `cardResolve` (generički, po IP hash-u) | 300 | 300 | najveća prostorija iza jednog NAT-a skenira odjednom; 5/s posle toga (§9.66) |
| `fairScan` | 20 | 20 | jedan fizički sken ≥ 3 s → ~20/min ljudski plafon; štand sa 5 vozila + refresh-evi |
| `fairRating` | 30 | 20 | Advanced 3 dimenzije + ispravke ≈ 5 po modelu; 4 vozila ≈ 20 |
| `fairAudienceVote` | 30 | 15 | do 5 pitanja + 2–3 promene ≈ 8 po modelu; dva modela ≈ 15 |
| `fairSurveySubmit` | 5 | 5 | jedan konačan submit po Advanced modelu |
| `fairBrandFavorite` | 10 | 5 | izbor + par promena po brendu |
| `fairLeadSubmit` (posetilac+model) | 2 | 3 | interest + probna vožnja + jedna ispravka |
| `fairSponsoredAction` | 20 | 10 | kartica na 8 s, najviše 2 dugmeta = 15/min |
| K1: `fairVisitorCreate` (po IP HMAC-u, samo nov `fairVisitors` red) | 120 | 300 | navala cele prostorije iza jednog NAT-a staje u 300, vrh ≈ 100 novih/min ispod 120/min; skripta sa jedne adrese ≤ 420 identiteta u prvom minutu, pa 120/min (§27.4) |
| B7: potvrde po adresi (DB provera) | — | 10 / 60 min | posetilac ostavi kontakt na par štandova ≈ 5/h; skripta sa novim hash-evima staje na 10/h po žrtvi |

### 25.3 Limit potvrda po adresi

`submitLead` pre upisa čita najviše 10 redova indeksa `fairEmailDeliveries.by_recipient_and_kind_and_createdAt` (adresa malim slovima, `immediate_confirmation`, poslednjih `FAIR_LEAD_RECIPIENT_WINDOW_MS`). Ako ih je 10 → `RATE_LIMITED` sa `retryAfterMs`, bez upisa leada, posetioca i outbox-a. Lead samo sa telefonom ne dira limit. Redovi indeksa se brišu sa outbox-om 16. 11.

## 26. B7 — integracioni TEST seed za 8. oktobar

### 26.1 Komanda

`npx convex run fairDevFixtures:seedIntegrationTest` (samo DEV; idempotentno). Upisano na `dev:expert-pelican-136` 4. 10. 2026; drugi poziv vraća sve kao `unchanged`.

### 26.2 Sadržaj (sve `test-`/`TEST`)

- Oba TEST sajma: `test-elektromobilnost-2026` (8.–11. 10., uključujući dan „TEST generalna proba“ 8. 10.) i `test-auto-moto-fest-2026` (30. 10.–1. 11., budući).
- 2 TEST izlagača (+ TEST QR inventar), 3 TEST brenda, 4 učešća, 5 štandova.
- 10 TEST modela kroz sva 3 paketa; TEST paketi prvog sajma važe od 8. 10. 00:00 (§9.67).
- TEST digitalni QR za svaki od 10 modela (TEST inventar, ne 100 pravih).
- Pasoš `TEST Volta` (2 modela).
- Pitanje generalne probe za svaki Starter+ model prvog sajma; kod Advanced modela je to rezultat na mapi.
- TEST anketa (2 pitanja) za oba Advanced modela prvog sajma.
- Uključeni lead obrasci (`one_of`), ali **bez saglasnosti**, pa lead vraća `CONSENT_NOT_CONFIGURED`.
- Objavljen TEST snapshot oba sajma.

### 26.3 Kraj-do-kraja

`convex/fairIntegration.test.ts` na istom seed-u: QR → model, 10 skenova = 10 ukupno / 1 jedinstveno, retry bez duplikata, ocena i glas se menjaju na mestu, pasoš 2/2 i favorit, anketa, lead `CONSENT_NOT_CONFIGURED`, rotacija mape (12 s) i garaže (8 s) sa garažnom akcijom, budući sajam bez plaćenih upisa, dnevni dataset po izlagaču bez mešanja, purge preview pa brisanje svih redova TEST posetioca uz iste brojače i datasete.

### 26.4 Ručni scenario

Koraci za Teodoru, Aleksu i Jovana (Android, iPhone, displej 1920×1080, stvarni TEST QR) su u `jovan-status/B7.md` §8.1.

## 27. K1 — zajednička tajna Next → Convex i limit novih identiteta (RF nalaz 1, §9.65)

### 27.1 Problem i pravilo

Javnu Convex funkciju može da pozove svako ko zna URL deploymenta. Do K1 su posetilačke funkcije prihvatale svaki ispravno formiran `visitorHash`. Direktan poziv mimo Next gateway-a (ili gateway bez cookie-ja) mogao je da izmisli neograničen broj posetilaca i da napumpa skenove, jedinstvene skenove, ocene, Glas publike (vidi se na displejima), pečate i favorite, kao i da šalje junk leadove.

Od K1 važi:
- svaka javna funkcija koja prima `visitorHash` ili `fairVisitorHash` prihvata poziv samo uz `FAIR_GATEWAY_SECRET`, koju znaju samo Next server i Convex deployment istog okruženja;
- nov `fairVisitors` red je ograničen po HMAC-u IP adrese pozivaoca;
- generički QR sken i redirect rade kao pre.

### 27.2 Tok tajne

1. **Vrednost:** najmanje 32 nasumična znaka, posebna za svako okruženje, ista u Next env-u (Vercel/`.env.local`) i u Convex env-u tog okruženja. Postavljaju je Aleksa ili Jovan; agent je ne postavlja i ne čita. U `.env.example` je samo ime.
2. **Next** (`lib/fair-server/visitor.ts` → `fairConvexVisitorForRequest`, `import "server-only"`):
   - čita `process.env.FAIR_GATEWAY_SECRET` (bez `NEXT_PUBLIC_`, skraćuje razmake);
   - šalje je samo kao argument Convex poziva iz route handlera (`/r/[cardCode]`, `app/api/fair/**`);
   - tajna nikad ne ide u odgovor, URL, cookie, klijentski JS ni log.
3. **Next bez tajne** (ili sa kraćom od 32 znaka), u svakom okruženju i bez DEV zamene: posetilačke funkcije se ne zovu.
   - Gateway vraća postojeći 503 `VISITOR_UNAVAILABLE`, bez cookie-ja.
   - `/r` beleži generički sken bez hash-a i preusmerava bez fair dela.
4. **Convex** (`convex/lib/fairGateway.ts`):
   - `env.FAIR_GATEWAY_SECRET` je opciono deklarisana u `convex/convex.config.ts`;
   - `requireFairGateway` je **prva naredba** svake zaštićene funkcije, pre validacije i pre bilo kog čitanja;
   - poređenje je konstantnog vremena: XOR preko svih znakova, po obrascu `memoriesPipeline.requirePipelineSecret` (dužina nije tajna).
5. **Fail closed:**
   - Convex bez vrednosti (ili sa kraćom od 32) → `FAIR_GATEWAY_NOT_CONFIGURED`;
   - poziv bez vrednosti ili sa pogrešnom → `FAIR_GATEWAY_UNAUTHORIZED`;
   - u oba slučaja ništa se ne čita i ne upisuje.
6. **Rotacija:** nova vrednost na obe strane istovremeno. Dok se vrednosti razlikuju, posetilačke funkcije odbijaju pozive, a fair deo `/r` ćuti; QR redirect radi. Rotacija ne menja `visitorHash`, jer je on vezan za drugu tajnu (`FAIR_VISITOR_HASH_SECRET`).

### 27.3 Zaštićene funkcije (authz)

| Funkcija | Vrsta | Bez tajne, sa pogrešnom, Convex bez env-a | Sa ispravnom tajnom |
|---|---|---|---|
| `fairInteractions.getMyModelState` | query | `FAIR_GATEWAY_UNAUTHORIZED` / `FAIR_GATEWAY_UNAUTHORIZED` / `FAIR_GATEWAY_NOT_CONFIGURED` | kao B3 (§15) |
| `fairInteractions.getMyPassportProgress` | query | isto | kao B3 |
| `fairInteractions.upsertRating` | mutation | isto; ništa se ne upisuje | kao B3 |
| `fairInteractions.upsertAudienceVote` | mutation | isto; ništa se ne upisuje | kao B3 |
| `fairInteractions.submitSurvey` | mutation | isto; ništa se ne upisuje | kao B3 |
| `fairInteractions.upsertBrandFavorite` | mutation | isto; ništa se ne upisuje | kao B3 |
| `fairInteractions.recordSponsoredAction` | mutation | isto; ništa se ne upisuje | kao B5 (§19.4) |
| `fairLeads.submitLead` | mutation | isto; nema leada, posetioca ni outbox reda | kao B4 (§17) |
| `fairSharing.createShareCollection` | mutation | isto; nema kolekcije ni posetioca | kao share delta (`JOVAN-DELTA-2026-10-05.md` §3, §5) |
| `fairSharing.recordTraffic` | mutation | isto; nema traffic reda ni posetioca | kao share delta (`JOVAN-DELTA-2026-10-05.md` §4, §5) |
| `cards.resolveAndRecord`, fair grana | postojeća mutation | generički sken i redirect kao pre; `fairScan: "gateway_rejected"`; bez fair reda, posetioca, brojača i pečata | kao B2 (§13.3) |

- Javni `fairPublic.*` upiti ne primaju identitet i ostaju bez tajne. Isto važi za `fairSharing.getShareCollectionByCodeHash`.
- Sync 5. 10. 2026: dve `fairSharing` mutacije iz Aleksinog checkpointa `8e72c10` primaju `visitorHash`, pa su dobile isto pravilo. `lib/fair-server/sharing.ts` im šalje tajnu i `ipHash` kao i ostali gateway-i.
- Admin i internal funkcije se ne menjaju (B7 §2.4).
- Ova tabela zamenjuje kolonu „Pristup“ za redove `fairInteractions`, `fairLeads` i `cards (B2 grana)` u B7 §2.4: „visitor“ sada znači „samo Next server sa `FAIR_GATEWAY_SECRET`“.

Novi argumenti su svi `v.optional(v.string())`, da poziv bez tajne dobije stabilan kod, a ne grešku validatora:
- `gatewaySecret` — svih 10 funkcija;
- `ipHash` — 8 mutacija (upit nikad ne pravi posetioca);
- `cards.resolveAndRecord`: `fairGatewaySecret` i `fairIpHash`.

### 27.4 Limit novih identiteta `fairVisitorCreate`

- **Ključ:** `ipHash` = HMAC-SHA256(`FAIR_VISITOR_HASH_SECRET`, `"scanme-fair-ip-v1:"` + prva adresa iz `x-forwarded-for`), lowercase hex. Računa ga Next, pa sirov IP ne napušta Next proces. Ključ HMAC-a je tajna koju Convex nema, pa Convex ne može da vrati hash u IP.
- **Kad se troši:** samo kad nastaje **nov** `fairVisitors` red (`upsertFairVisitor`), u `/r` i u svih 8 mutacija, iz istog bucket-a po istom ključu. Postojeći posetilac ne troši token.
- **Veličina:** `{ kind: "token bucket", rate: 120, period: MINUTE, capacity: 300 }`.
- **Aritmetika:**
  - dan sajma ima oko 5–10 hiljada posetilaca za oko 8 h, što je oko 20 novih uređaja u minuti;
  - navala na otvaranju je 3–5 puta više, oko 100 u minuti, a cela prostorija može da stigne odjednom;
  - kapacitet 300 (isto kao generički `cardResolve` ispred `/r`) prima navalu iza jednog NAT-a, a dopuna od 120/min (2/s) je iznad vrha;
  - skripta sa jedne adrese dobija najviše 300 + 120 = 420 identiteta u prvom minutu, pa 120/min. Hiljade u minuti nisu moguće.
- **Odbijanje ne piše ništa:** `/r` i dalje beleži generički sken i preusmerava (`fairScan: "rate_limited"`), a interakcija baca `RATE_LIMITED`.
- Bez `ipHash` (to može samo direktan poziv koji ionako zna tajnu) svi dele jedan bucket `shared`.
- **Granica:** napadač sa mnogo IP adresa i dalje dobija više. Potpuna zaštita nije cilj V1 (MASTER §5).

### 27.5 Šta se loguje

| Gde | Šta | Bez |
|---|---|---|
| Next (`console.warn`, jednom po procesu) | `[fair] FAIR_GATEWAY_SECRET_MISSING` — Next nema tajnu | vrednosti tajne, tokena, hash-a, IP-a |
| Next (`console.warn`, jednom po procesu) | `[fair] FAIR_GATEWAY_NOT_CONFIGURED` ili `[fair] FAIR_GATEWAY_UNAUTHORIZED` — Convex odbio gateway poziv | isto |
| Next (`console.warn`, jednom po procesu) | `[fair] FAIR_GATEWAY_REJECTED` — Convex odbio tajnu u `/r` | isto |
| Convex | ništa novo | — |
| Tabele | tajna se nigde ne upisuje (test prolazi kroz sve tabele); `ipHash` je samo ključ u stanju komponente `rateLimiter` | — |

### 27.6 Deploy čeklista (pre produkcije)

1. Generisati novu vrednost za produkciju, različitu od DEV vrednosti.
2. Postaviti je u Convex prod env i u Vercel prod env (server, bez `NEXT_PUBLIC_`), pa tek onda pustiti kod iz K1. Inače su svi fair skenovi i interakcije ugašeni, a redirect radi.
3. Posle deploya: jedan sken TEST QR-a mora da poveća `fairScans:modelScanCounts` za 1, a u Next logu ne sme biti `FAIR_GATEWAY_*`.

### 27.7 Testovi

- `convex/fairGateway.test.ts` (na integracionom TEST seed-u):
  - svih 10 funkcija bez tajne, sa pogrešnom (iste dužine), sa skraćenom, sa praznom, i kad Convex nema env ili ima prekratku: stabilan kod, nijedan red u bazi se ne menja; ista provera i za nov i za postojeći hash;
  - istih 10 poziva sa ispravnom tajnom uspeva, a tajna nije ni u jednom izlazu ni u jednoj tabeli;
  - tajna se proverava pre validacije: neispravan hash bez tajne daje `FAIR_GATEWAY_UNAUTHORIZED`, a sa tajnom `INVALID_INPUT`;
  - `resolveAndRecord` bez tajne, sa pogrešnom i bez Convex env-a: postoji generički događaj i redirect, `fairScan: "gateway_rejected"`, nema fair reda, posetioca, brojača ni pečata; sa tajnom sken se broji;
  - 300 novih identiteta sa jedne IP adrese prolazi, 301. dobija `rate_limited` (generički sken postoji), nov posetilac sa te adrese dobija `RATE_LIMITED` u oceni bez upisa, postojeći posetilac i druga adresa rade normalno, a posle 30 s prolazi tačno 60 novih.
- `convex/fairSharing.test.ts`: bez tajne, sa pogrešnom i bez Convex env-a nema kolekcije, traffic reda ni posetioca.
- `lib/fair-server/interactions.test.ts`, `leads.test.ts`, `sponsored.test.ts`, `sharing.test.ts`:
  - bez tajne (ili sa kratkom, i u developmentu) nema Convex poziva ni cookie-ja: 503 `VISITOR_UNAVAILABLE`;
  - svaki poziv nosi tajnu, a mutacije i `ipHash` (HMAC, ne sirov IP);
  - odgovor ne sadrži tajnu;
  - Convex kodovi `FAIR_GATEWAY_*` postaju 503 `SERVICE_UNAVAILABLE`.
- Postojeći Convex fair testovi postavljaju TEST tajnu u env i šalju je; nijedno očekivanje nije promenjeno.
- U postojećim Next gateway testovima tačna očekivanja argumenata (`toEqual`, `toHaveBeenCalledWith`) dopunjena su poljima `gatewaySecret` i `ipHash`, jer ih backend sada prima. Poređenje je ostalo tačno, nije oslabljeno.

## 28. K3 — tvrdi prekidači leadova i follow-upa i zapis pravnog odobrenja (RF nalaz 3)

### 28.1 Problem i pravilo

Do K3 je jedan admin klik, aktivacija verzije saglasnosti, otvarao lead tok. Zapis pravnog odobrenja nije postojao, a follow-up nije imao poseban prekidač.

Od K3 lead tok radi tek kad važi sve troje:
1. Convex env `FAIR_LEADS_ENABLED` je tačno `"true"`;
2. postoji aktivna verzija saglasnosti, aktivirana uz zapis pravnog odobrenja (§28.3);
3. paket i uključen obrazac modela (B4, §17.1).

Follow-up traži još i Convex env `FAIR_FOLLOWUP_ENABLED` = tačno `"true"`.

Vrednosti postavljaju Aleksa ili Jovan na ciljnom deploymentu (`npx convex env set …`); agent ih ne postavlja. Bez vrednosti je sve isključeno, i na DEV-u i u produkciji. Imena su u `.env.example` (Convex sekcija) i deklarisana su kao opciona u `convex/convex.config.ts`.

### 28.2 Prekidači (`convex/lib/fairLeads.ts`: `fairLeadsEnabled()`, `fairFollowUpEnabled()`)

| Mesto | `FAIR_LEADS_ENABLED` nije `"true"` | `FAIR_FOLLOWUP_ENABLED` nije `"true"` |
|---|---|---|
| `fairLeads.submitLead` | `LEADS_DISABLED` odmah posle provere tajne (K1), pre validacije hash-a i svakog čitanja: nema leada, posetioca, outbox reda, zakazane funkcije ni tokena limitera | lead i potvrda kao pre; follow-up se **ne zakazuje** (`followUpScheduled: false`) |
| `fairPublic.getLeadForm` | `leads_disabled` za svaki model i vrstu | bez uticaja |
| `fairEmails.claimDelivery`, potvrda | red postaje `skipped`, `lastError: LEADS_DISABLED`; ništa se ne šalje | potvrda odlazi, ali bez rečenice o otkazivanju follow-upa |
| `fairEmails.claimDelivery`, follow-up | `skipped`, `LEADS_DISABLED` | `skipped`, `FOLLOW_UP_DISABLED` |
| `daily_report` | bez uticaja (izveštaj ima svoj gate, ručno odobrenje, §22) | bez uticaja |

- „Tačno `"true"`“: `"TRUE"`, `" true"`, `"true "`, `"1"`, `"yes"`, prazna vrednost i odsustvo vrednosti znače isključeno (test).
- `submitLead` i `claimDelivery` čitaju vrednost pri svakom pozivu. Provera u `claimDelivery` je **neposredno pre slanja**: prekidač ugašen između zakazivanja i slanja zatvara red, a Node sender ne dobija ni primaoca.
- `skipped` je konačno. Ponovno uključivanje ne šalje preskočen red, a admin `retryEmailDelivery` važi samo za `failed` (`FAIR_EMAIL_DELIVERY_STATUS`).
- Lead primljen dok je follow-up isključen nikad ne dobija follow-up naknadno, ni kad se prekidač kasnije uključi, jer ga njegova potvrda nije najavila (MASTER §8). Ako se follow-up želi, `FAIR_FOLLOWUP_ENABLED` se uključuje pre otvaranja sajma.
- `capabilities` (`canSubmitInterest`/`canRequestTestDrive`) i dalje znače „paket + obrazac“ (§9.45). Frontend prikazuje obrazac samo za `getLeadForm.state === "open"`.
- Next gateway (`lib/fair-server/leads.ts`): `LEADS_DISABLED` → 409 `{ ok: false, code: "LEADS_DISABLED" }`.

### 28.3 Zapis pravnog odobrenja

`fairLeadsAdmin.activateConsent({ consentId, legalApprovedBy, legalApprovedAt })`:
- `legalApprovedBy`: ko je stručno pravno proverio tekst (osoba ili kancelarija). Razmaci se skraćuju i sažimaju; 1–120 znakova (`FAIR_CONSENT_LEGAL_APPROVER_MAX`).
- `legalApprovedAt`: kada (epoch ms), veće od 0 i ne u budućnosti.
- Oba argumenta su u validatoru `v.optional`, da nedostajuća vrednost dobije stabilan kod `FAIR_CONSENT_LEGAL_APPROVAL_REQUIRED` (`details.field`), a ne grešku validatora. Tada verzija ostaje `draft` i audit se ne piše.
- Upis: `fairConsentConfigs.legalApprovedBy`/`legalApprovedAt` i `adminAuditLog` `fair_consent_activated` sa `{ eventId, leadKind, version, legalApprovedBy, legalApprovedAt }`; aktera daje `requireAdmin`.
- `getEventConsents` (admin) vraća oba polja. Javni `getLeadForm` ih ne vraća.
- Verzije aktivirane pre K3 nemaju zapis i ostaju važeće, jer su polja opciona. Na DEV-u nijedna verzija nije aktivirana (B4), a K3 nije aktivirao ništa.
- Admin UI (`Događaji → Leadovi`): uz dugme „Aktiviraj verziju N“ su polja „Tekst je stručno proverio (osoba ili kancelarija)“ i „Datum stručne provere“ (kalendarski dan po Beogradu, 00:00, najkasnije danas). Dugme je onemogućeno dok oba polja nisu popunjena. Aktivna verzija prikazuje „Pravno odobrenje: {ko}, {datum}“.
- Zapis je trag ko je i kada potvrdio tekst. Backend ne može da proveri da je stručna provera stvarno urađena; to je odgovornost admina koji aktivira (P0).

### 28.4 Redosled uključivanja (produkcija)

1. Stručno proveren tekst saglasnosti (P0) i konačni tekstovi potvrde i follow-upa (P1).
2. Admin aktivira verziju uz zapis pravnog odobrenja.
3. Aleksa ili Jovan postavlja `FAIR_LEADS_ENABLED=true` na produkcijskom Convex deploymentu.
4. Ako se follow-up šalje: prvo `FAIR_EMAIL_REPLY_TO` (§9.39), pa `FAIR_FOLLOWUP_ENABLED=true`, pre otvaranja sajma.

Gašenje: uklanjanje vrednosti (ili bilo koja vrednost osim `"true"`). Novi leadovi se odmah odbijaju, a redovi koji čekaju slanje postaju `skipped` u trenutku slanja.

### 28.5 Testovi (ništa se stvarno ne šalje: globalni `fetch` je mock, Resend ključ je lažan)

- `convex/fairLeads.test.ts`, blok „K3 hard switches…“:
  - prekidač leadova isključen (bez vrednosti, `""`, `"false"`, `"TRUE"`, `" true"`, `"true "`, `"1"`, `"yes"`): `LEADS_DISABLED` i pre provere hash-a i paketa, ali posle tajne; `getLeadForm` je `leads_disabled` za sve modele i vrste; nijedan red ni zakazana funkcija; 0 poziva `fetch`-a. Sa tačno `"true"` isti submit se čuva i potvrđuje;
  - sa isključenim prekidačem nema efekta ni postojeća saglasnost; sa uključenim i bez saglasnosti i dalje važi `CONSENT_NOT_CONFIGURED`;
  - follow-up prekidač isključen: Advanced lead dobija potvrdu bez rečenice o otkazivanju, a follow-up se ne zakazuje, ni kad se prekidač posle uključi;
  - provera neposredno pre slanja: prekidač leadova ugašen posle zakazivanja → potvrda i follow-up `skipped` (`LEADS_DISABLED`), 0 poziva; ponovno uključivanje i admin retry ne šalju; follow-up prekidač ugašen između potvrde i follow-upa → follow-up `skipped` (`FOLLOW_UP_DISABLED`); ugašen pre potvrde → potvrda bez najave follow-upa; prekidač leadova ugašen do trenutka follow-upa → `skipped` (`LEADS_DISABLED`);
  - aktivacija bez pravnog odobrenja (bez polja, prazno ili predugo ime, datum 0, negativan ili u budućnosti) → `FAIR_CONSENT_LEGAL_APPROVAL_REQUIRED` sa poljem, verzija ostaje nacrt, bez audita; ne-admin i anonimni ne mogu; sa zapisom se oba polja čuvaju, vraća ih `getEventConsents`, audit ih sadrži, a javni obrazac ne.
- Postojeći Convex testovi leadova (`fairLeads`, `fairAuthz`, `fairGateway`, `fairIntegration`, `fairPerformance`) postavljaju oba prekidača na `"true"` u TEST env-u (`beforeEach`, brišu se u `afterEach`) i aktiviraju saglasnost uz TEST zapis odobrenja; nijedno očekivanje nije promenjeno.
- `lib/fair-server/leads.test.ts`: `LEADS_DISABLED` → 409 sa stabilnim kodom.
- `components/admin/admin-events-leads.test.tsx`: polja pravnog odobrenja su uz dugme za aktivaciju; dugme je onemogućeno dok su prazna; aktivna verzija prikazuje zapis (ili da ga nema); `skipped` isporuka ima srpski razlog, bez sirovih kodova.

## 29. K4 — izveštaj tek posle zatvaranja dana (RF nalaz 4)

### 29.1 Problem i pravilo

Do K4 je ručni `requestReportBuild` pre kraja dana pravio run sa delimičnim podacima i `dataThrough = endsAt`. Sweep je zatim video run za taj dan × učešće i preskakao ga, pa pravi dnevni izveštaj nikad nije nastao.

Od K4 važe dva pravila, oba nad istim `fairEventDays.endsAt` (ponoć po Beogradu, §9.54):

1. **Odbijanje pre zatvaranja.** `requestReportBuild` i `createReportCorrection` odbijaju dan čiji `endsAt` je posle trenutnog vremena: `FAIR_DAY_NOT_CLOSED` (`details.endsAt`). Ništa se ne upisuje i ništa se ne zakazuje. Tačno u trenutku `endsAt` izrada je dozvoljena. Redosled provera u `requestReportBuild`: admin → dan postoji → učešće postoji → isti event (`FAIR_LINK_CONFLICT`) → dan zatvoren.
2. **Sweep ne blokira raniji run.** Za dan × učešće sweep čita samo najnoviji run (indeks `by_eventDayId_and_participationId`, `order("desc").first()`). Preskače ga samo ako je taj run napravljen u trenutku zatvaranja ili posle (`createdAt >= endsAt`). Run napravljen ranije (postojeći redovi iz vremena pre K4) ne sprečava automatski dnevni izveštaj. Raniji run ostaje netaknut: ne briše se, ne gradi ponovo i ne menja status (§9.70).

Ručna izrada posle zatvaranja i dalje važi kao dnevni run, pa je sweep za to učešće ne duplira. Šema, indeksi i javna površina se ne menjaju.

### 29.2 Admin UI

- Pomoć uz „Nova izrada“: „… tek kad se taj dan zatvori.“
- Odbijanje prikazuje tekst iz `adminEventsSr.issues.FAIR_DAY_NOT_CLOSED` („Sajamski dan još nije zatvoren. …“), kroz isti mehanizam kao ostali admin kodovi; sirovi kod se ne prikazuje.

### 29.3 Testovi

- `convex/fairReports.test.ts`, blok „K4 report build before the day closes“:
  - `requestReportBuild` u 23:30, minut pre ponoći (`endsAt − 1`) i za drugi, još otvoren dan → `FAIR_DAY_NOT_CLOSED`, 0 run-ova i posle izvršenja svih zakazanih funkcija; tačno u `endsAt` izrada prolazi; ispravka run-a čiji dan je još otvoren → `FAIR_DAY_NOT_CLOSED`;
  - sweep posle zatvaranja pravi dnevni run za izlagača koji ima raniji run iz 23:30. Novi run je izgrađen (`pending_review`, `builtAt − endsAt < 60 min`), sadrži sken iz 23:30, a raniji red ostaje netaknut. Ručni run posle zatvaranja (drugi izlagač) i dalje sprečava duplikat. Drugi sweep ne pravi ništa, i ništa se ne šalje.
- Postojeći B6 testovi koji ručno grade izveštaj za dan 1 sada pre izrade pomeraju sat na 00:05 posle zatvaranja dana (`DAY1_CLOSED`); nijedno očekivanje nije promenjeno.
- `components/admin/admin-events-reports.test.tsx`: pomoć uz izradu i srpski razlog odbijanja, bez sirovog koda.

## 30. A3 — brojevi za admin listu modela (`convex/fairAdminStats.ts`)

Samo čitanje, oba upita počinju sa `requireAdmin`, rezultat nema kontakt ni visitor podatke. Šema i indeksi se ne menjaju.

| Funkcija | Vrsta | Args → returns | Indeksi / granice |
|---|---|---|---|
| `getLeadCounts` | admin query | `{ eventId }` → `{ byModel: { eventModelId, interest, testDrive, undelivered }[], byParticipation: { participationId, total, undelivered }[], capped }` | učešća `fairParticipations.by_eventId_and_externalKey` (≤ `FAIR_ADMIN_LIST_LIMIT`), leadovi `fairLeads.by_participationId_and_createdAt`; zajednički budžet `FAIR_LEAD_COUNT_LIMIT` = 4000 redova po pozivu, iznad njega `capped: true` (brojevi su delimični) |
| `getModelQrCodes` | admin query | `{ eventId }` → `{ eventModelId, resolverCode, smqCode \| null }[]` | aktivne dodele `fairQrAssignments.by_eventId_and_status` (≤ `FAIR_ADMIN_LIST_LIMIT`), svaki kanal jednom po id-u (SMQ) |

- `undelivered` = lead čiji status nije `delivered` (status `delivered` postavlja tek A8).
- Koriste ih: lista i detalj modela (A3), Izlagači (A5), Pregled (A10).
- Testovi: `convex/fairAdminStats.test.ts` (brojevi po modelu i učešću, izolacija između događaja, `capped`, SMQ samo za dodele događaja, anonimni i ne-admin odbijeni) i `convex/fairAuthz.test.ts` (klasifikacija `admin`, odbijanje pre čitanja podataka).

## 31. A4 — QR inventar: detalj, promena odredišta i dodela u većem broju (`convex/fairAdminQr.ts`)

Sve funkcije počinju sa `requireAdmin`. Upisi idu kroz `convex/lib/fairQr.ts`, istim tokom subject → target → kanal kao `assignQr` (novi nepromenljivi `cardTargets` red, `accessDestinationHistory`, sinhronizacija kanala). `/r/[cardCode]` ostaje jedina štampana ruta i jedino mesto koje beleži sken; nijedna funkcija ovde ne upisuje ni ne broji sken. Šema i indeksi se ne menjaju.

Kod se zadaje kao resolver kod (8 znakova, ista normalizacija kao resolver: velika slova, I/L → 1, O → 0) ili kao SMQ (`SMQ-…`, preko `digitalQrCodes.by_smqCode`). Kod mora biti `qr` kanal QR inventara događaja (`fairEvents.qrInventoryBusinessId`).

| Funkcija | Vrsta | Args → returns | Indeksi / granice |
|---|---|---|---|
| `getQrDetail` | admin query | `{ eventId, code }` → `null` (kod nije u inventaru događaja) ili `{ cardId, accessChannelId, resolverCode, smqCode, channelState, problemReason, redirectEnabled, totalScansAllTime, current \| null, history[], historyCapped, stats \| null, lastScanAt }` | kanal `accessChannels.by_resolverCode` ili `digitalQrCodes.by_smqCode`; istorija `fairQrAssignments.by_accessChannelId_and_status` (aktivna + do `FAIR_QR_HISTORY_LIMIT` = 50 zatvorenih, najnovije prvo); `stats` = `readFairCount(scan_total\|scan_unique:model:<id>)` modela na koji kod vodi u ovom događaju (bez admin skenova); `lastScanAt` = najnoviji `cardScanEvents.by_cardId_and_occurredAt` (generički sken koda, uključuje i probne skenove); `totalScansAllTime` = `cards.totalScans` |
| `getQrScanStats` | admin query | `{ eventId, cardIds }` (≤ `FAIR_QR_SCAN_STATS_MAX` = 100) → `{ cardId, eventModelId \| null, total \| null, unique \| null, lastScanAt \| null }[]` | po kartici: kanal, aktivna dodela, dva `readFairCount` (≤ 16 redova svaki), jedan `cardScanEvents`; kartice van inventara se preskaču; slobodan kod ili kod drugog događaja nema brojeve |
| `reassignQr` | admin mutation | `{ eventId, code, toEventModelId, reason }` → `{ fromAssignmentId, toAssignmentId, fromEventModelId, toEventModelId }` | jedna transakcija: stari red `released` (`releasedAt`, `releasedByUserId`, `reason`), novi `assigned` kroz `assignFairQr`; audit `fair_qr_reassigned`; kanal ne prolazi kroz `problem` |
| `bulkAssignQrDryRun` | admin query | `{ eventId, rows: { code, model }[] }` (≤ `FAIR_QR_BULK_MAX_ROWS` = 100) → `{ rows: { index, code, model, status: ok\|unchanged\|error, issue?, resolverCode?, smqCode?, eventModelId?, assignedEventModelId? }[], summary: { ok, unchanged, errors } }` | `model` = `externalKey` (`fairEventModels.by_eventId_and_externalKey`) ili Convex ID modela; ništa se ne upisuje |
| `bulkAssignQrCommit` | admin mutation | isti `{ eventId, rows }` + opcioni `reason` → `{ rows: { index, status: applied\|unchanged\|error, issue? }[], summary: { applied, unchanged, errors } }` | isti plan (`planBulkQrAssign`) ponovo u transakciji commit-a; primenjuje samo `ok` redove kroz `assignFairQr` (razlog `fair_qr_bulk_assigned` ako nije zadat); ponovni commit daje `unchanged`, bez duplikata; audit `fair_qr_bulk_assigned` sa brojevima |

**Pravila `reassignQr`** (ništa se ne menja pri grešci):

- razlog posle `trim` ima 3–300 znakova (`FAIR_QR_REASON_MIN_LENGTH` / `MAX_LENGTH`), inače `FAIR_REASON_REQUIRED`;
- kod nepoznat → `FAIR_QR_NOT_FOUND`; postoji, ali nije u inventaru događaja → `FAIR_QR_NOT_IN_INVENTORY`; nije dodeljen → `FAIR_QR_NOT_ASSIGNED`; dodeljen modelu drugog događaja → `FAIR_QR_OTHER_EVENT`;
- ciljni model ne postoji → `FAIR_MODEL_NOT_FOUND`; pripada drugom događaju → `FAIR_MODEL_OTHER_EVENT`; isti kao trenutni → `FAIR_QR_SAME_TARGET`; već ima aktivan QR → `FAIR_MODEL_ALREADY_ASSIGNED`;
- dalje važe ista pravila kao `assignQr` (subject sa jednim kanalom, `FAIR_QR_SUBJECT_SHARED`).

**Pravila plana dodele u većem broju** (redosled provere po redu):

1. prazna ćelija ili predug unos → `FAIR_BULK_ROW_INVALID`;
2. kod: `FAIR_QR_NOT_FOUND` / `FAIR_QR_NOT_IN_INVENTORY`; model: `FAIR_MODEL_NOT_FOUND` / `FAIR_MODEL_OTHER_EVENT`;
3. isti kod u više redova → `FAIR_BULK_DUPLICATE_CODE` u **svakom** takvom redu; isti model u više redova → `FAIR_BULK_DUPLICATE_MODEL` u svakom (nije jasno koja nalepnica ide na koji auto);
4. kod već vodi na isti model → `unchanged`; kod vodi na drugi model → `FAIR_QR_ALREADY_ASSIGNED` (`assignedEventModelId`); model već ima drugi QR → `FAIR_MODEL_ALREADY_ASSIGNED`; deljeni subject → `FAIR_QR_SUBJECT_SHARED`;
5. inače `ok`.

Više od 100 redova → `FAIR_BULK_TOO_LARGE` za ceo poziv (granica drži commit unutar Convex limita transakcije). Masovna dodela ne zamenjuje fizičku proveru (MASTER §15): rezime u adminu traži da druga osoba skenira svaki kod.

**Uklanjanje veze** ostaje postojeći `fairAdmin.releaseQr` (razlog obavezan). U adminu se zove „Ukloni vezu“; dugme „Oslobodi“ ne postoji. Posle uklanjanja kod vodi na neutralnu stranu `/r/nevazeca` i ne beleži sajamske skenove.

**Novi kodovi grešaka** (`FAIR_ADMIN_ISSUE_CODES`, tekst u `adminEventsSr.issues`): `FAIR_QR_NOT_FOUND`, `FAIR_QR_OTHER_EVENT`, `FAIR_QR_SAME_TARGET`, `FAIR_MODEL_OTHER_EVENT`, `FAIR_REASON_REQUIRED`, `FAIR_BULK_TOO_LARGE`, `FAIR_BULK_ROW_INVALID`, `FAIR_BULK_DUPLICATE_CODE`, `FAIR_BULK_DUPLICATE_MODEL`. Postojeći `FAIR_QR_NOT_ASSIGNED` sada koristi `reassignQr` (kod bez aktivne dodele).

**Čitanje u adminu:** `getQrDetail` i `getQrScanStats` čitaju brojače koji se menjaju pri svakom skenu, pa ih admin čita jednokratno i osvežava na 60 s dok je tab vidljiv (`components/admin/admin-ui/use-polled-query.ts`), nikad reaktivnim `useQuery`. Lista inventara ostaje `fairAdmin.listQrInventory` (paginirano, ≤ 100 po stranici).

**Testovi:** `convex/fairAdminQr.test.ts` (reassign: uspeh u jednoj transakciji sa razlogom i istorijom, novi resolver cilj, kanal bez prolaza kroz `problem`; zauzet ciljni model, model drugog događaja, bez razloga, isti model, slobodan kod, kod drugog događaja — ništa se ne menja; dry run svih grešaka bez upisa; commit samo ispravnih, ponovni commit bez duplikata; `getQrDetail` istorija, SMQ, brojevi posle 2 TEST skena istog posetioca = 2/1; `getQrScanStats`; authz) i `convex/fairAuthz.test.ts` (klasifikacija `admin`, odbijanje pre čitanja podataka).

## 32. A5 — tabela → import JSON v1 (`lib/fair-import/*`, samo klijent)

Backend se ne menja: admin vodič za import koristi postojeći `fairImport.dryRun` i `fairImport.commit`, a JSON v1 iz §12 ostaje isti (i dalje dostupan kao „JSON v1 (napredno)“). Ovo je normalizator iz §12 / §9.4, ali u adminu, ne kao skripta.

- `parse.ts`: ručni TSV/CSV parser (tab iz Excela/Sheets, `;` iz srpskog Excela, `,`), navodnici sa separatorom, tabom, `""` i prelomom reda u ćeliji, BOM, `\r\n`, prazni redovi. Prvi neprazan red je zaglavlje; broj reda je stvarni red izvora.
- `columns.ts`: zaglavlje → polje po srpskim i engleskim sinonimima, bez obzira na velika slova, dijakritike i interpunkciju. Specifikacije su uređeni parovi: kolona `Spec: <naziv>` ili par `Spec N naziv` + `Spec N vrednost`, redosled = redosled kolona. Svako mapiranje se ručno menja.
- `to-payload.ts`: red tabele = jedan model. Izlagač se nalazi po SMK/SML, pa po nazivu učešća ovog događaja, pa iz podrazumevane vrednosti; nov izlagač traži SMK i SML. Štand po oznaci postojećeg štanda događaja, inače nov sa `Lokacija na mapi`. `externalKey` modela: kolona, pa ključ istog modela koji događaj već ima (isti izlagač, brend, naziv, varijanta), pa deterministički `<eventCode>-<brend>-<model varijanta>`. Prazna cena se ne šalje (backend upisuje „Cena na upit“ uz `FAIR_PRICE_MISSING`); prazno „Pasoš“ bez podrazumevane vrednosti je greška reda (§12: ne normalizuje se u `false`). Redovi sa greškom tabele (`IMPORT_*`, samo klijent) se preskaču i broje.
- Greške dry-run-a (`path`) se vraćaju na red i kolonu tabele (`locateImportIssue`).
- `template.ts`: šablon CSV (`;`, BOM) sa svim podržanim kolonama i jednim TEST redom.

## 33. A7 — automatski pasoš brenda i forme po izlagaču

### 33.1 Odluka za Aleksin pregled (ADMIN-UX-ZAHTEVI §12, tačka 2)

MASTER §11 zadaje uslov pasoša (najmanje dva izložena modela, svi najmanje Starter) i zamrzavanje skupa pre otvaranja, ali ne i mehanizam. B3 je pasoš pravio samo ručno (`upsertPassport` → `publishPassport`). Po ADMIN-UX §6 i §12.2 pasoš je sada **automatski**: brend koji ispunjava uslov dobija objavljen pasoš bez klika, a admin ga može **sakriti**. Ručne B3 funkcije ostaju kao rezerva. Ovo je razlika prema dosadašnjem pravilu i čeka Aleksin pregled; vraćanje na ručni režim je uklanjanje četiri okidača iz §33.3, bez promene šeme.

### 33.2 Uslov (`fairBrandPassportProblems`, `lib/fair-entitlements.ts`)

Ista pravila kao B3 `publishPassport` (§9.31), sada na jednom mestu i sa svim razlozima i brojevima:

| Kod | Kada | Primer u adminu |
|---|---|---|
| `fewer_than_two_models` | manje od 2 izložena (ne-povučena) modela | „Samo 1 izložen model; potrebna su bar dva.“ |
| `model_not_published` | izložen model u nacrtu | „1 od 3 modela nije objavljeno.“ |
| `model_not_candidate` | `passportEligible = false` (DATA-INTAKE §6.3) | „1 od 3 modela nije kandidat za pasoš.“ |
| `model_below_starter` | model sa paketom „Za sve izlagače“ | „1 od 3 modela nema Starter.“ |
| `multiple_exhibitors` | modeli brenda kod više učešća | „Modeli brenda su kod 2 izlagača.“ |

ADMIN-UX i uputstvo A7 kažu „najmanje 2 objavljena modela, svi Starter“. Kod zadržava strože B3 tumačenje (svi izloženi modeli moraju biti objavljeni kandidati), jer MASTER §11 traži da „svi relevantni modeli brenda“ budu u pasošu; §9.31 ostaje otvoreno. `fairInteractionsAdmin.passportProblem` sada zove ovu funkciju (prvi razlog), pa ručna i automatska objava ne mogu da se raziđu.

### 33.3 Sinhronizacija (`convex/lib/fairPassportSync.ts`, `convex/fairPassports.ts`)

`syncFairBrandPassport(ctx, { event, brandId, now })`, idempotentno (bez razlike nema upisa):

- **zamrznut skup** (`now ≥ min(frozenAt, startsAt)`): ništa se ne menja → `frozen`. Automatski pasoš čuva `frozenAt = startsAt` (planirani trenutak zamrzavanja, usklađuje se dok skup nije zamrznut). Ručna objava (`publishPassport`) i ručno povlačenje (`withdrawPassport`, od A7 postavlja `frozenAt = now`) zamrzavaju odmah, pa automatika ne gazi ručnu odluku;
- **uslov ispunjen**: pasoš postoji i `published` (`publishedAt` pri prvoj objavi, `autoSyncedAt` pri svakoj izmeni); `required` članovi = izloženi modeli brenda. Nov model se dodaje, povučen model prelazi u `removed` (red i pečati ostaju), vraćen model ponovo postaje `required`. Član koji je admin hitno uklonio (`removedByUserId`) se nikad ne vraća. Ručni nacrt (`draft`) se usvaja;
- **uslov nije ispunjen**: objavljen pasoš → `withdrawn` (članovi, pečati i favoriti ostaju; kad brend ponovo ispuni uslov, isti pasoš se ponovo objavljuje). Brend bez pasoša ga ne dobija;
- brend sa više od `PASSPORT_MODELS_CAP` (40) modela → `too_many_models`, bez upisa;
- `hiddenAt` sinhronizacija nikad ne menja.

| Okidač | Kako |
|---|---|
| `fairAdmin.publishModel`, `withdrawModel` (kad se status stvarno promeni), `upgradePackage` | u istoj transakciji se računa plan za brend modela; **samo ako bi se pasoš promenio**, zakazuje se `internal.fairPassports.syncBrandPassport` (`runAfter(0)`), koji radi u sopstvenoj transakciji. Problem sinhronizacije nikad ne blokira objavu modela, a no-op ne pravi posao. |
| `fairImport.commit` (posle `committed: true`) | `runAfter(0, internal.fairPassports.syncEventPassports, { eventId })` za sve brendove događaja |
| „Osveži pasoše“ | `refreshPassports` (admin) odmah, za sve brendove; audit `fair_passports_refreshed` sa brojevima |

DEV fixture-i (`fairDevFixtures`) i lib helperi kataloga nemaju okidač; seed i postojeći B3 testovi ručnog toka zato rade kao pre A7.

| Funkcija | Vrsta | Args → returns | Granice |
|---|---|---|---|
| `getPassportOverview` | admin query | `{ eventId }` → `{ eventStartsAt, brands: { brandId, participationId \| null, eligible, exhibited, problems[], tooManyModels, freezesAt, passport \| null, members[] }[] }` | brendovi iz `fairEventModels.by_eventId_and_brandId` (≤ `FAIR_ADMIN_LIST_LIMIT`) + `fairPassportConfigs` (≤ 100); po brendu ≤ 41 model i ≤ 80 članova. Ne čita sat: stanje (Aktivan / Zamrznut / Sakriven / Nema uslov / Nije napravljen) računa klijent iz `freezesAt` (`lib/admin-v1/passport-overview.ts`). |
| `refreshPassports` | admin mutation | `{ eventId }` → `{ created, updated, withdrawn, unchanged, frozen, too_many_models }` | isti budžet |
| `setPassportHidden` | admin mutation | `{ passportId, hidden }` → `{ passportId, hidden, changed }` | `hiddenAt`, `hiddenByUserId`; audit `fair_passport_hidden` / `fair_passport_shown`; idempotentno |
| `syncBrandPassport` | internal mutation | `{ eventId, brandId }` → rezultat ili `null` | jedan brend |
| `syncEventPassports` | internal mutation | `{ eventId }` → brojevi ili `null` | ceo događaj |

### 33.4 Sakriven pasoš

Javno je samo `status === "published" && hiddenAt === undefined` (`fairIsPublicPassport`, `convex/lib/fairInteractions.ts`): `getPassportCatalog` (mapa, garaža), `getMyPassportProgress`, `getMyModelState.passport` (stranica modela) i `upsertBrandFavorite` (`PASSPORT_NOT_ACTIVE`). Pečat pri skenu (`stampFairPassportOnScan`) se ne menja: sakriven pasoš i dalje beleži pečate, pa „Prikaži“ vraća sav napredak, uključujući pečate skupljene dok je bio sakriven. `getEventInteractions.passports` dobija `hiddenAt` (detalj modela).

### 33.5 Forme „Zainteresovan sam“ i „Probna vožnja“ po izlagaču

Šema (aditivno): `fairParticipationLeadDefaults` `{ eventId, participationId, leadKind, enabled, contactRequirement, preferredContact?, updatedByUserId, createdAt, updatedAt }`, indeksi `by_participationId_and_leadKind` (jedinstveno) i `by_eventId`; `fairLeadConfigs.source?: "default" | "override"` (red bez polja je izuzetak, kao pre A7).

| Funkcija (`convex/fairLeadsAdmin.ts`) | Vrsta | Args → returns |
|---|---|---|
| `getEventLeadForms` | admin query | `{ eventId }` → `{ defaults[], models: { eventModelId, participationId, packageTier, interest, testDrive }[] }`; ćelija = `{ entitled, config: { enabled, contactRequirement, preferredContact?, source, updatedAt } \| null }`; izloženi modeli (≤ `FAIR_ADMIN_LIST_LIMIT`), dva indeksirana čitanja po modelu |
| `upsertParticipationLeadDefault` | admin mutation | `{ participationId, leadKind, enabled, contactRequirement, preferredContact? }` → `{ defaultId, result }` |
| `applyLeadDefaultsToModels` | admin mutation | `{ participationId, leadKind? }` → `{ created, updated, unchanged, skippedOverride, notEntitled: { eventModelId, leadKind }[], missingDefault: leadKind[] }` |
| `clearLeadOverride` | admin mutation | `{ eventModelId, leadKind }` → `{ result, enabled, entitled }`; bez podrazumevanog `FAIR_LEAD_DEFAULT_MISSING` |
| `getLeadSwitches` | admin query | `{}` → `{ leadsEnabled, followUpEnabled }` (samo boolean, nikad vrednost env-a) |

Pravila:

- „Primeni na sve modele izlagača“ je jedna transakcija, najviše 100 izloženih modela (`FAIR_BULK_TOO_LARGE`), idempotentna (drugi put sve `unchanged`). Piše `fairLeadConfigs` sa `source: "default"`; izuzetak (`override`) preskače i broji;
- paket odlučuje kao i ranije (`getFairEntitlements`): „Zainteresovan sam“ od Starter-a, „Probna vožnja“ samo Napredni. Model bez prava dobija formu **isključenu** i nalazi se u `notEntitled` (jasan razlog, ne tiho preskakanje);
- `upsertLeadConfig` je izuzetak modela (`source: "override"`), sa istom zabranom uključivanja bez prava (`FAIR_FEATURE_NOT_ENTITLED`); `clearLeadOverride` vraća model na podrazumevano izlagača;
- `contactRequirement` ostaje `one_of | email | phone | both`; „any“ iz uputstva A7 je `one_of` („bar jedan“);
- javni tok se ne menja: `getLeadForm` i `submitLead` čitaju samo `fairLeadConfigs`, uz K3 prekidač i aktivnu saglasnost (§17, §28). Audit `fair_lead_defaults_applied`.

### 33.6 Testovi

- `convex/fairPassports.test.ts`: uslov i razlozi (čista funkcija); brend sa 2 Starter modela dobija objavljen pasoš sam, bez posla za no-op; Starter koji fali i jedan model daju razlog; nadogradnja dovršava uslov; gubitak uslova povlači, ponovni uslov ponovo objavljuje uz zadržane pečate; povučen model izlazi iz skupa i vraća se; sakriven pasoš nije u katalogu, garaži, stranici modela ni favoritu, a pečati se beleže i „Prikaži“ ih vraća; ponovna sinhronizacija bez duplikata i bez prepisivanja; posle otvaranja skup se ne menja, hitno uklanjanje radi i ne vraća se; ručno povučen pasoš automatika ne objavljuje; import zakazuje sinhronizaciju događaja; authz.
- `convex/fairLeadForms.test.ts`: primena podrazumevanog na izlagača (drugi izlagač netaknut, idempotentno, promena podrazumevanog); izuzetak pobeđuje dok se ne obriše; model bez paketa ne dobija probnu vožnju; `getLeadForm` stanje posle primene i K3 prekidač; `getLeadSwitches`; povučeni modeli i authz.
- `convex/fairAuthz.test.ts` klasifikuje sve nove funkcije; `convex/fairSchema.test.ts` novu tabelu i indekse.
