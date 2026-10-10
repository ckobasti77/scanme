# Frontend delta — 8. oktobar 2026.

> Pravilo „Cross-team sync rule“ (`AGENTS.md`): kratak unos za svaku backend izmenu na koju se frontend ili integracija oslanja. Detalji su u [`JOVAN-DELTA-2026-10-08.md`](./JOVAN-DELTA-2026-10-08.md) i [`FAIR-BACKEND-CONTRACT.md`](./FAIR-BACKEND-CONTRACT.md).

## Aleksa — pre-event pristup (8–9. 10.)

Detalji i razlozi su u [`JOVAN-DELTA-2026-10-08b.md`](./JOVAN-DELTA-2026-10-08b.md) (pre-event pristup).

- `fairPublic.listAudienceQuestionsForModel` ima nov opcioni argument `openAt` (sat pozivaoca). Vraća pitanja današnjeg `dateKey` **i** pitanja otvorena u `openAt`. `loadFairAudienceQuestions` (`lib/fair-server/model-page.ts`) ga šalje sam (`Date.now()`).
- Nova admin mutacija `fairInteractionsAdmin.openAudienceQuestionNow({ questionId })` je povezana kao `InteractionsActions.openQuestionNow` (opciono). `InteractionQuestion` ima opciono `startsAt`.
- Novi admin upit i mutacija `fairPreEvent.previewPreEventReset` / `resetPreEventData` (kartica „Pre-event podaci“ u Pregledu, `components/admin/events/sections/pre-event-reset.tsx`).
- `fairLeadsInbox.listEventLeads` ima nov opcioni argument `includePreEvent`. Bez njega lista počinje od otvaranja sajma.
- Novi kodovi grešaka: `FAIR_PRE_EVENT_RESET_CONFIRM` i `FAIR_PRE_EVENT_RESET_STALE` (`lib/fair-contract.ts` i i18n).
- `FAIR_PASSPORT_EVENT_STARTED` se više ne baca. Kod i tekst su ostali u ugovoru.
- Šema i `mapLocationId` se ne menjaju.
- 9. 10.: `fairPreEvent.previewPreEventReset.cutoff` je za `elektromobilnost-2026` sada 9. 10. 08:00 (otvaranje hale), a ne 00:00. Kartica „Pre-event podaci“ ga prikazuje sama; frontend ne treba menjati.

## Jovan — P1, pre-event (8. 10.) — vraćeno 9. 10.

> Po JOVAN-DELTA-2026-10-08b §6.2 P1 ne ide: zamenjen je Aleksinom verzijom iz odeljka iznad (vraćen pre spoja sa `aleksa/main`, vidi `jovan-status/SPOJ-ALEKSA-2026-10-09.md`). Ovo ispod je samo istorija; `at`, polje `preEvent`, indeksi za reset i `getPreEventSummary` ne postoje.

Oblik zahteva i odgovora za javni frontend je isti: `POST /api/fair/lead`, ocene, glasanje, anketa, `getModelBySlug` i `getLeadForm`. Detalji su u JOVAN-DELTA, sekcija „Jovan — 8. 10. — pre-event (P1)“, i u ugovoru §40.

- **`fairPublic.listAudienceQuestionsForModel`:** novi opcioni argument `at` (vreme zahteva na serveru). Sa njim lista dodaje i pitanje koje je admin otvorio pre njegovog dana; bez njega je odgovor isti kao pre. Odgovor je istog oblika.
- **`lib/fair-server/model-page.ts`:** `loadFairAudienceQuestions(eventModelId, dateKey, at = Date.now())` šalje `at`. Postojeći poziv (`glas-publike/page.tsx`) radi bez izmene.
- **Pre-event (pre `startsAt` događaja):**
  - upisi rade i posetilac vidi svoje stanje, ali se ne broje;
  - javni procenti Glasa publike i omiljenog modela ne uključuju probe;
  - za pre-event lead `followUpScheduled` je `false`.
- **Šema (aditivno):**
  - opciono polje `preEvent` na `fairScanEvents`, `fairUniqueScans`, `fairRatings`, `fairAudienceVotes`, `fairBrandFavoriteVotes` i `fairSponsoredEvents`;
  - 6 novih indeksa za reset;
  - nijedan postojeći validator javnog odgovora nije menjan.
- **Admin (naš):**
  - `fairInteractionsAdmin.openAudienceQuestionNow`;
  - `fairPreEvent.getPreEventSummary` i `fairPreEvent.resetPreEventData`;
  - novi kodovi `FAIR_RESET_CONFIRMATION_MISMATCH` (admin) i `PRE_EVENT` (isporuka mejla).

## Jovan — P2, mapa i nalepnice (8. 10.)

Oblik zahteva i odgovora za javni frontend je isti. Detalji su u JOVAN-DELTA, sekcija „Jovan — 8. 10. — mapa i nalepnice (P2)“, i u ugovoru §41.

- **`fairPublic.getEventMap`:** vraća samo `active` učešća i `active` štandove. Učešće ili štand u nacrtu nisu ni u `stands` ni u `exhibitorsWithoutLocation`.
- **`fairPublic.getModelBySlug`:** za događaj u nacrtu vraća `null` (stranica → 404, kao i događaj).
- **Mapa `elektromobilnost-2026`:**
  - štandovi 9, 6, 1A i 1B su Aleksina intake učešća (CUBI, Grand Motors + AUTO MIG, Ferum, BENTU);
  - sajtni zapisi JMEV, Mazda, Chery, Foton, Ferum Yudo i Bentu se ne prave ili se povlače;
  - `mapLocationId`-jevi su isti; komponente mape nisu menjane;
  - deljeni štand 6 prikazuje oba izlagača.
- **Admin (naš):** `fairAdminQr.linkSticker` ima novi opcioni argument `expectedModelStickerCode`. Nove internal funkcije su `fairExhibitorImport.reconcileSiteExhibitorsWithIntake` i `listStandsOffMap`.

## Jovan — D1, stranica automobila, forme i mapa (8. 10.)

Oblik zahteva i odgovora je isti. Detalji su u JOVAN-DELTA, sekcija „Jovan — 8. 10. — stranica automobila i mapa (D1)“, i u ugovoru §42.

- **`POST /api/fair/lead`:** za `duplicate: true` je `confirmationEmail` sada uvek `false`. `LeadSheet` za duplikat piše „Već smo primili …“ (`fairLeadSentText`, `lib/fair-client/lead-result.ts`; i18n `interestAlreadySent`, `testDriveAlreadySent`).
- **Fotografije:** `fairPhotoUnoptimized(src)` u `lib/fair-client/photo-url.ts`. Spoljni URL ide direktno (`unoptimized`) na stranici automobila, u garaži, u poređenju i na stranici deljenja; lokalni `/fair/…` ostaje optimizovan.
- **Mapa:** `lib/fair-map/touch.ts` (`fairMapTouchZone`, `fairMapTouchLocation`, `FAIR_MAP_TOUCH_MIN_PX`). `fair-map-canvas.tsx` ih koristi samo za tap prstom koji promaši štand. ScanMe `ispred-14` je zelen i bez štanda (tada nije interaktivan); placeholder lokacija (AMF) se ne crta.
- **Ime:** `J.Petrovic` više nije „link“ (`fairLeadNameRisk`).
- **`fairHaptic`:** ne zove `navigator.vibrate` pre prvog dodira (Chrome to blokira i loguje grešku).
