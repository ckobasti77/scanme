# Frontend delta — 8. oktobar 2026.

> Pravilo „Cross-team sync rule“ (`AGENTS.md`): kratak unos za svaku backend izmenu na koju se frontend ili integracija oslanja. Detalji su u [`JOVAN-DELTA-2026-10-08.md`](./JOVAN-DELTA-2026-10-08.md) i [`FAIR-BACKEND-CONTRACT.md`](./FAIR-BACKEND-CONTRACT.md).

## Jovan — P1, pre-event (8. 10.)

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
