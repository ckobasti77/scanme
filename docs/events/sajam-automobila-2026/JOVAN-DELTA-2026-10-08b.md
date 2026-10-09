# Jovan backend delta — 8. oktobar 2026. (b): pre-event pristup

> Poslednje ažuriranje: **8. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Produktni izvor: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md) · Tehnički ugovor: [`FAIR-BACKEND-CONTRACT.md`](./FAIR-BACKEND-CONTRACT.md) · Prethodno: [`JOVAN-DELTA-2026-10-08.md`](./JOVAN-DELTA-2026-10-08.md)

## Pregled

Ovo je odluka vlasnika proizvoda (8. 10.). Ne vraćati je i ne „popravljati“. Ako se sudara sa tvojim radom, pitaj vlasnika.

**Pravilo:** pre 9. 10. ništa ne sme biti blokirano datumom događaja. To važi i na DEV-u i na PROD-u. Mora da radi:

- objava u adminu i povezivanje nalepnica;
- pasoši i pečati, ocene, ankete, Glas publike;
- leadovi (kad je saglasnost aktivna);
- stranice modela i garaža.

Jedino što zavisi od **9. 10. 2026. 00:00 Europe/Belgrade** (`event.startsAt`) je **granica analitike**. Sve što je nastalo pre nje je „pre-event“. Ne ulazi u analitiku, izveštaje, brojače ni izvoz izlagača, a admin ga briše akcijom „Resetuj pre-event podatke“.

- **(a) Paket važi od dodele:**
  - `upsertFairModel` sada postavlja `packageActivatedAt = min(packageActiveFrom ?? now, now)`, pa je budući `package_active_from` (u `b1-payload.json` za svih 15 modela 9. 10.) odsečen na trenutak importa.
  - Provere po paketu (`getFairEntitlements`, `fairRatingInputProblem`, kvota pitanja) su nepromenjene.
  - Za katalog uvezen pre izmene postoji `fairPreEvent:alignFuturePackageActivations` (internal). Pokrenut je na DEV-u: 16 aktivacija pomereno. Na PROD-u je no-op, ako se import radi posle deploy-a.
- **(b) Glas publike:**
  - Nova mutacija `fairInteractionsAdmin.openAudienceQuestionNow` („Otvori odmah“).
  - Javna lista dobija opcioni argument `openAt`.
- **(c) Pasoš:**
  - Uklonjen je `FAIR_PASSPORT_EVENT_STARTED` iz `publishPassport`.
  - Auto-sync pravi pasoš i posle otvaranja kad pasoš ne postoji.
  - `fairSetup.publishEventModels` sada pokreće sync pasoša i sponzorisane liste. Zato JMEV pasoš (EV3, YI, EWIND) nastaje sam.
- **(d) Granica analitike** (`convex/lib/fairPreEvent.ts`) i nov modul `convex/fairPreEvent.ts` (reset).
- **(e) Pre-event lead** ne dobija follow-up. Izlagaču se ionako ništa ne šalje automatski: `exhibitor_delivery` se nigde ne upisuje.

Šema se **ne menja** (nema novih tabela, polja ni indeksa). Pre-event oznaka se izvodi iz vremena nastanka reda.

Testovi:

- nov `convex/fairPreEvent.test.ts`;
- dopunjeni `fairLeads`, `fairSetup`, `fairAuthz`, `fairInteractions`, `fairDashboard`, `fairAdminStats`, `fairAdmin`, `fairImport`, `fairIntegration` i `fairSponsored`;
- svi `convex/fair*` i `lib/fair*` testovi prolaze.

Deploy: DEV `perfect-ant-98` (`npx convex dev --once`).

## 1. Svi vremenski uslovi u kodu sajma i odluka za svaki

| Uslov | Mesto | Odluka |
|---|---|---|
| Paket od `packageActiveFrom` | `convex/lib/fairCatalog.ts` `upsertFairModel` | **Promenjeno:** odsečeno na sada |
| Upgrade „ne pre početka trenutnog paketa“ | `fairCatalog.ts` `upgradeFairModelPackage` | Bez izmene. Posle (a) i poravnanja nema budućih početaka, pa je `max(now, …) = now` |
| Paket u trenutku (`fairModelTierAt` / `fairTierAt`) | `convex/lib/fairInteractions.ts`, `lib/fair-entitlements.ts` | Bez izmene (istorija paketa za izveštaje ostaje) |
| `QUESTION_NOT_OPEN` (`startsAt` pitanja) | `lib/fairInteractions.ts` `fairQuestionOpen` | Bez izmene. „Otvori odmah“ pomera `startsAt` na sada |
| Javna lista samo za današnji `dateKey` | `fairPublic.listAudienceQuestionsForModel`, `glas-publike/page.tsx` | **Promenjeno:** `openAt` vraća i trenutno otvorena pitanja |
| `FAIR_PASSPORT_EVENT_STARTED` | `fairInteractionsAdmin.publishPassport` | **Uklonjeno** |
| Auto-sync „frozen“ od `event.startsAt` i bez pasoša | `convex/lib/fairPassportSync.ts` | **Promenjeno:** bez pasoša nije zamrznut. Postojeći pasoš i dalje zaključava skup na `frozenAt` |
| `publishEventModels` bez synca pasoša i sponzorisane liste | `convex/fairSetup.ts` | **Dodato** |
| Katalog pasoša, pečat pri skenu | `fairPassportState`, `stampFairPassportOnScan` | Nema datuma, bez izmene |
| `fairEventAcceptsInteractions`, cookie, sken, deljenje | PII purge 16. 11. | Bez izmene (nije 9. 10.) |
| QR povezivanje i admin prečica (`endsAt > now`) | `convex/lib/fairQr.ts` | Bez blokade pre 9. 10., bez izmene |
| Zaključavanje garaže | `components/fair/garage/fair-garage.tsx` | Samo `auto-moto-fest-2026`, bez izmene |
| Dnevni izveštaj posle zatvaranja dana | `fairReports` | Bez izmene (sadržaj izveštaja, ne radnja) |
| Follow-up 24–48 h posle sajma | `fairLeads.submitLead` | **Promenjeno:** pre-event lead ga ne dobija |

## 2. Nove funkcije

| Funkcija | Vrsta | Šta radi |
|---|---|---|
| `fairInteractionsAdmin.openAudienceQuestionNow({ questionId })` | mutation (admin) | Nacrt objavi uz istu dnevnu kvotu kao `publishAudienceQuestion`, pa `startsAt = min(startsAt, now)`. Objavljeno pitanje sa kasnijim početkom otvara odmah. Zatvoreno pitanje vraća `FAIR_QUESTION_STATUS`. Pitanje ostaje na svom danu (kvota, dashboard, rezultat) |
| `fairPreEvent.previewPreEventReset({ eventId })` | query (admin) | Dry run: broj pre-event redova po kategoriji (najviše 1000 po kategoriji), `cutoff`, `total` |
| `fairPreEvent.resetPreEventData({ eventId, confirm: "RESETUJ", expected })` | mutation (admin) | Odbija bez reči `RESETUJ` (`FAIR_PRE_EVENT_RESET_CONFIRM`) ili ako se brojevi razlikuju od dry run-a (`FAIR_PRE_EVENT_RESET_STALE`). Audit `fair_pre_event_reset`. Briše u serijama od 200, a ostatak nastavlja `resetPreEventContinue` |
| `fairPreEvent.resetPreEventContinue` | internal mutation | Nastavak reseta |
| `fairPreEvent.alignFuturePackageActivations({ dryRun, eventCode? })` | internal mutation | Budući `packageActivatedAt` i aktivacije pomera na sada, pa radi sync pasoša i sponzorisane liste |

**Reset briše** (samo za taj događaj i samo pre granice):

- leadove sa njihovim `fairEmailDeliveries`;
- odgovore na ankete, ocene, glasove, omiljene modele i pečate;
- sponzorisane akcije, saobraćaj i deljene kolekcije;
- jedinstvene skenove i skenove.

Svaki obrisan red se **oduzima iz brojača** (`fairMetricCountShards`) tačno onim ključevima kojima ga je pisac dodao:

- ocene: count −1, sum −vrednost;
- glas i omiljeni: −1;
- sken i jedinstveni sken: model/štand × sve/dan/sat;
- sponzorisano: sve/dan/sat;
- admin skenovi nikad nisu brojani, pa se i ne oduzimaju.

**Ne dira se:**

- katalog, QR veze, pasoši, pitanja, ankete i podešavanja leadova;
- izveštaji;
- `fairVisitors` (deljeni između događaja);
- sve posle granice.

## 3. Automatsko isključenje pre-event podataka (bez reseta)

- **Leadovi:**
  - `fairLeadsAdmin.exportLeads`, `fairReports.leadsExportPage` / `exportLeadsFile`, `fairAdminStats.getLeadCounts` i `fairDashboard` čitaju samo `createdAt ≥ granica`.
  - `fairLeadsInbox.listEventLeads` takođe, osim sa novim opcionim `includePreEvent: true`.
  - Inbox je kanal predaje izlagaču, pa test leadovi tamo ne smeju da se pojave.
- **Skenovi:**
  - `fairAnalytics.reportContext` (ukupno po štandu u izveštaju) i `fairDashboard` (ukupno i jedinstveno) su sada **zbir bucketa sajamskih dana**, a ne all-time ključ.
  - Izveštaj po modelu je već čitao dnevne buckete.
- **Ankete i leadovi u izveštaju** su već bili vezani za prozor dana.
- **Ocene, glasovi i omiljeni** su all-time brojači. Za njih važi reset, i to je izbor vlasnika („reset + automatika“). Pre otvaranja ostaju vidljivi radi demoa.

## 4. Stanje DEV podataka (`perfect-ant-98`)

- `alignFuturePackageActivations`:
  - pomereno 16 aktivacija na 27 modela (pravi događaj i TEST review događaji);
  - ponovljen dry run vraća 0.
- JMEV pasoš na `elektromobilnost-2026` je objavljen (EV3, YI, EWIND) i vidi se u `getPassportCatalog`.

## 5. Otvoreno za Jovana / frontend

- Admin UI (mali, već urađen u ovom commitu):
  - dugme **„Otvori odmah“** u `interakcije-glas-publike-view.tsx`;
  - kartica **„Pre-event podaci“** sa resetom u Pregledu (`pre-event-reset.tsx`);
  - i18n ključevi u `lib/i18n/sr/admin-events.ts`.
- Lead inbox više ne prikazuje pre-event leadove. Ako adminu treba da ih vidi, poziv dobija `includePreEvent: true`.
- Pre-event jedinstveni sken posetioca koji je skenirao i na sajmu: posle reseta se taj jedinstveni sken ne računa ponovo. To je retko i tiče se samo test telefona.

## 6. Dopuna 9. 10. 2026. (odluke vlasnika, posle ponoći)

### 6.1 Granica analitike je otvaranje hale: 9. 10. 2026. 08:00 Europe/Belgrade

- **Jedno mesto za podešavanje:** `FAIR_ANALYTICS_CUTOFF_BY_EVENT_CODE` u `convex/lib/fairPreEvent.ts`, `"elektromobilnost-2026": 2026-10-09T08:00+02:00`. Ostali događaji (i TEST) i dalje koriste `event.startsAt`.
- **Šta je pre-event:** sve pre 08:00, uključujući noćne probe i lepljenje nalepnica. Ne ulazi u analitiku, izveštaje, brojače ni izvoz izlagača, a „Resetuj pre-event podatke“ to briše i oduzima iz brojača.
- **Dan u kom pada granica:** pošto 08:00 pada usred 1. sajamskog dana, `fairDayCountFrom` za taj dan čita satne buckete od 08:00 umesto dnevnog bucketa. Tako rade:
  - izveštaj (`modelDayRaw`: skenovi, sponzorisano, satni skenovi; leadovi i ankete od `max(day.startsAt, granica)`);
  - ukupno po štandu u izveštaju (`reportContext`);
  - `fairDashboard` (ukupno i danas).
- **Ocene, glasovi i omiljeni** (all-time brojači) i zbirni pregled organizatora čiste se resetom.
- **Testovi:** `convex/fairPreEvent.test.ts` („analytics cutoff: the hall opening“):
  - granica za pravi kod je 08:00, a za TEST kod `startsAt`;
  - čitanje bucketa od granice;
  - na pravom događaju je sken u 02:00 pre-event, a sken u 10:00 se broji; reset briše samo prvi.

### 6.2 Šta ide u koji deploy

- **Prvi deploy (9. 10.):** ova grana, spojena sa `main`-om (`release/sajam-2026-10-08`), sa pre-event verzijom iz ovog dokumenta. Razlog:
  - posle ponoći ne zamrzava ništa;
  - JMEV pasoš nastaje objavljen sa EV3, YI i EWIND i kad se događaj pravi posle otvaranja.
- **Drugi deploy (posle pregleda):** Jovanove ispravke P2 i D1 sa `codex/jovan-sajam-sync-2026-10-08` (`c8c392f`, `ef661e5`):
  - normalizator nalepnica (ćirilica, `#7`, `SA26/7`);
  - odbijanje zamene na zastarelim podacima;
  - mapa po intake-u i `reconcileSiteExhibitorsWithIntake` / `listStandsOffMap`;
  - spoljne fotografije van `/_next/image`;
  - dorada forme i zona dodira.
- **Jovanov P1** (`db7e5cf`: polje `preEvent` u šemi, `migrateFutureActivations`, potvrda reseta slugom) **ne ide**, jer ga ova verzija zamenjuje. Ako se P2/D1 prenose cherry-pick-om, delove koji zavise od P1 treba prilagoditi ovom API-ju (`openAudienceQuestionNow`, `openAt`, `fairPreEvent.*`).

### 6.3 DEV `perfect-ant-98`

- `test-elektromobilnost-2026` i `test-auto-moto-fest-2026` su arhivirani (`status: "archived"`, može da se vrati), pa admin otvara `elektromobilnost-2026`.
- TEST događaji se nikad ne prave na produkciji.
