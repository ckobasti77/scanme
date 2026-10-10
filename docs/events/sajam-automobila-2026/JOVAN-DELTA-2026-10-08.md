# Jovan backend delta — 8. oktobar 2026.

> Poslednje ažuriranje: **8. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Produktni izvor: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md) · Tehnički ugovor: [`FAIR-BACKEND-CONTRACT.md`](./FAIR-BACKEND-CONTRACT.md)

## Pregled: sve backend-relevantne izmene 7/8. 10. (oba chata)

Sve su odluke vlasnika proizvoda. Ne vraćati ih i ne „popravljati“. Ako se neka sudara sa tvojim radom, pitaj vlasnika.

- **(a) Polu-zvezdice:** ocene su 1–5 u koraku 0,5, za Starter `overall` i Napredne `appearance` / `specifications` / `price`. Promenjeni su `isFairRatingValue` + `FairRatingValue` + `FAIR_RATING_STEP` u `lib/fair-contract.ts`, return validator `fairRatingValueView` u `convex/lib/fairValidators.ts` (literali 1, 1.5 … 5) i testovi (`lib/fair-entitlements.test.ts`, `convex/fairInteractions.test.ts`). Šema i izveštaji se ne menjaju: `fairRatings` polja su već `v.number()`, a zbir/broj (`bumpFairCount`) i prosek (`fairRatingSummary`, 2 decimale) već rade sa polovinama. Raspodela po zvezdicama ne postoji. Commit `4774a95`, push na DEV `perfect-ant-98`. Detalji su u odeljku 5.
- **(b) Novo `convex/fairSetup.ts`** (paralelni chat, samo internal): `bootstrapEvent`, `importDryRun` / `importCommit` i wrapper za objavu `publishEventModels`. Postojeći fajlovi su promenjeni samo za O4 (odeljci 1–2).
- **(c) Pravi događaj `elektromobilnost-2026`** i 5 `event_only` klijenata postoje u DEV `dev:perfect-ant-98`. Štandovi koriste trenutne `mapLocationId`: JMEV `hala-9`, Foton `hala-6`, Mazda/Chery deljeno `hala-6`, Yudo `hala-1a`, BENTU `hala-1b`. **Ako se id-jevi mape menjaju, ostaju stabilni ili se dostavlja mapiranje staro→novo.**
- **(d) Javne rute** su premeštene pod `/sajam/[eventSlug]/garaza|deli` (samo frontend, bez promene backenda). `/sajam` radi 307 na aktivni sajam.
- **(e) Opt-in „Zapamti moj kontakt na ovom telefonu“** u browseru (MASTER §5 izmena). Pamte se samo ime i email/telefon, nikada saglasnost ni token. Backend se ne menja.

## Pravi događaj `elektromobilnost-2026` i deljena lokacija štanda (O4)

Jovan je ovaj zadatak delegirao, a odobrio ga je vlasnik proizvoda. Urađeno je u worktree-u `scanme-sajam-integracija`.

### 1. Odluka O4: deljena lokacija na mapi

- **Odluka vlasnika (8. 10.):** više različitih učešća/izlagača sme da deli istu lokaciju na mapi. Primer: `hala-6`, gde su AUTO MIG/Foton i Grand Motors/Mazda+Chery. Na štandu radi isti tim, ali se izlagači vode odvojeno (posebni izveštaji i leadovi).
- **Izmena (jedini dozvoljeni izuzetak u postojećim fajlovima):**
  - `convex/lib/fairCatalog.ts` `validateMapLocationIds`: `FAIR_MAP_LOCATION_TAKEN` je sada `warning`, a ne `error`. Važi i za proveru unutar payload-a i za proveru prema bazi. Nepostojeći ili neispravan `mapLocationId` ostaje greška (`FAIR_MAP_LOCATION_INVALID`).
  - `convex/fairAdmin.ts` `listValidationIssues`: isti kod je takođe `warning`.
  - Posledica: `upsertStand`, import i `publishModel` više ne odbijaju deljenu lokaciju. Admin i dalje vidi upozorenje.
  - Testovi: `fairAdmin.test.ts` (drugi štand na istoj lokaciji uspeva, nalaz je samo upozorenje) i `fairImport.test.ts` (TAKEN je među upozorenjima, ne među greškama).
- Kod ugovora (`FAIR_ADMIN_ISSUE_CODES`) i i18n tekst nisu menjani.

### 2. Novo: `convex/fairSetup.ts` (samo internal)

| Funkcija | Vrsta | Šta radi |
|---|---|---|
| `bootstrapEvent({ actorEmail })` | internal mutation | Event `elektromobilnost-2026` (`published`, `garagePriority: 1`, 9–11. 10.), 3 dana, 5 `event_only` klijenata kroz `createEventOnlyClient` (placeholder kontakt) i 6 brendova (kao `ensureBrand`) |
| `importDryRun({ payload })` | internal query | `planFairImport` i rezime, kao `fairImport.dryRun` |
| `importCommit({ payload, actorEmail })` | internal mutation | `commitFairImport` |
| `publishEventModels({ eventCode, actorEmail })` | internal mutation | `setFairModelStatus("published")` i audit `fair_model_published` za svaki draft model, atomski |

`actorEmail` mora biti korisnik iz `SCANME_ADMIN_EMAILS`. SMK/SML su fiksni (`SMK-SAJAM-26-<KOD>`), pa isti payload važi i na PROD-u. Postupak za PROD je u [`RUNBOOK-EVENT-SETUP.md`](./RUNBOOK-EVENT-SETUP.md).

Pasoš nije u `fairSetup`: `upsertPassport`/`publishPassport` traže `requireAdmin` i nemaju izvezen helper. Radi se u adminu, pre 9. 10. 00:00.

### 3. Podaci na DEV-u (`perfect-ant-98`)

- 5 učešća, 5 štandova (9/`hala-9`, 6/`hala-6` ×2, 1A/`hala-1a`, 1B/`hala-1b`) i 15 modela, svi objavljeni.
- Payload: [`intake/elektromobilnost-2026-2026-10-07/b1-payload.json`](./intake/elektromobilnost-2026-2026-10-07/b1-payload.json).
- Upozorenja pri objavi: `FAIR_QR_MISSING` ×15 (QR još nije dodeljen), `FAIR_MAP_LOCATION_TAKEN` za 10 modela na `hala-6` (O4) i `FAIR_PRICE_MISSING` za EV3 („Cena na upit“ je izričit podatak izlagača).

### 4. Otvoreno za Jovana / frontend

- `next.config.ts` nema `scanme.rs` u `images.remotePatterns`. Fotografije modela (`https://scanme.rs/fair/...`) zato ruše `next/image` na model stranici i u garaži.
- Mapa (`lib/fair-map/view.ts`) crta dva štanda sa istim `mapLocationId` kao dva preklopljena poligona. Treba proveriti da se na štandu 6 vide i Foton i Mazda/Chery (pretraga, klik, popup).

## 5. Polu-zvezdice (odluka vlasnika, izuzetak za `convex/` samo za ovo)

- `lib/fair-contract.ts`: `FairRatingValue = 1 | 1.5 | … | 5`, novo `FAIR_RATING_STEP = 0.5`, a `isFairRatingValue` prihvata vrednosti u [1, 5] koje su višekratnik 0,5. Odbija 0,5, 1,25, 5,5 i `NaN`.
- `convex/lib/fairValidators.ts`: `fairRatingValueView` (return validator za `upsertRating` / `getMyModelState`) sada sadrži i polovine. Bez toga `upsertRating` pada na validaciji povratne vrednosti.
- `fairRatingInputProblem` (`lib/fair-entitlements.ts`) nije menjan, samo komentar. Gateway `parseRating` već prima bilo koji broj.
- Agregati i izveštaji: bez promene (vidi (a)). Prosek u izveštaju može biti npr. 4,25.

## 6. Frontend P3 (stranica modela na pravom API-ju): šta backend treba da zna

- **Nema posebnog pravnog naziva izlagača.** Saglasnost u `getLeadForm` zamenjuje `{izlagac}` sa `businesses.name` (`fairExhibitorName`), a ne sa pravnim nazivom. Ako saglasnost mora da navede pravni naziv (npr. „CUBI d.o.o.“), potrebno je polje `legalName` (ili slično) na klijentu/učešću, pa da ga `fairRenderConsentText` koristi. Frontend prikazuje tačno tekst sa servera.
- **`FairPublicModel` nema `brandLogoUrl`.** „Chat head“ ankete zato prikazuje monogram brenda umesto logotipa. Predlog: dodati `brandLogoUrl?` u `getModelBySlug`, kao u `FairPassportCatalogEntry`.
- **Anketa je po modelu, a proizvod je traži po izlagaču.** `submitSurvey` / `getMyModelState.survey` rade po paru posetilac + model. Frontend zato posle slanja upisuje lokalnu oznaku `scanme:fair-survey-done:v1:{eventId}:{participationId}`. Kada server za model vrati `submitted`, oznaka se upisuje i tada. Ako se oznaka izgubi (privatni režim ili brisanje podataka), oblačić se može ponovo pojaviti na drugom modelu istog izlagača. Pravo rešenje je backend pravilo „jedan odgovor po posetiocu i učešću“, ako vlasnik to želi.
- **Opcioni kontakt u anketi** šalje se kao zaseban `POST /api/fair/lead` sa `kind: "interest"`, tek posle uspešnog `POST /api/fair/survey`. Koristi saglasnost i `contactRequirement` iz `getLeadForm(interest)` za isti model.
- Leadovi: `contactRequirement` i `preferredContact` frontend čita iz `getLeadForm`. Ništa nije nedostajalo.

## Jovan — 8. 10. — pre-event (P1)

Korak P1 lanca SAJAM v2, Aleksin zahtev od 8. 10. (SYNC-1008-KONTEKST §2.1). Tehnički detalji su u [`FAIR-BACKEND-CONTRACT.md`](./FAIR-BACKEND-CONTRACT.md) §40, a status i testovi u [`jovan-status/P1.md`](./jovan-status/P1.md).

### 1. Šta je urađeno

1. **Paket važi od dodele.** Prava paketa počinju u trenutku dodele, a ne 9. 10. To važi za sve puteve: dodela u adminu, import, `fairSetup.importCommit` i nadogradnja.
   - Budući `packageActiveFrom` (u `b1-payload.json` je `2026-10-09T00:00:00+02:00` za svih 15 modela) čita se kao „od dodele“. Payload i intake nisu menjani.
   - `convex/fairSetup.ts` nije menjan: ide kroz isti `upsertFairModel`.
   - Ponovljeni `importCommit` sa istim payload-om i dalje vraća `unchanged` (test).
   - Stari redovi sa aktivacijom u budućnosti se pomeraju internom migracijom (§4 i §5).
2. **Glas publike pre svog dana.**
   - Admin u listi pitanja ima dugme „Otvori sada“ za objavljeno pitanje čiji dan tek dolazi. Pitanje ostaje pitanje svog dana, pa dnevna ograničenja ostaju: Starter 1, Napredni 5.
   - Javna lista i glasanje koriste isto pravilo (`fairQuestionOpen`).
3. **Pre-event oznaka.** Granica je `startsAt` događaja (`fairIsPreEvent`; `elektromobilnost-2026`: 9. 10. u 00:00).
   - Sve što posetilac upiše pre granice se čuva i on vidi svoje stanje, ali to ne ulazi u brojače, analitiku, dnevne izveštaje, dashboard, admin statistiku, izvoz ni javne procente.
   - Pre-event sken ne troši jedinstveni sken: prvi sken istog uređaja tokom sajma se broji kao jedinstven.
   - Isto važi za ocenu, glas, omiljeni model i anketu: prvi upis tokom sajma se računa kao prvi.
4. **„Resetuj pre-event podatke“** je u Događaji → Brisanje → „Pre-event podaci (probe pre sajma)“:
   - brojke po vrsti, dry-run, potvrda ukucanim slugom događaja i ishod;
   - briše samo pre-event podatke posetilaca tog događaja, u serijama;
   - idempotentno je i ispravlja brojače za redove upisane pre ovog koda;
   - nikad ne dira katalog, QR, kartice i `/r/`, saglasnosti, forme, podešavanja, `fairVisitors`, deljene kolekcije ni podatke od granice.
5. **Pre-event lead ne ide izlagaču.** Posetilac dobija potvrdu kao danas, ali lead nema follow-up. Ne ulazi u dnevni izveštaj, izvoz, inbox, predaju ni u par za follow-up. Follow-up koji je zakazan ranije zatvara se kao `skipped`/`PRE_EVENT`.

### 2. Nove funkcije i promene ugovora

| Šta | Vrsta | Napomena |
|---|---|---|
| `fairInteractionsAdmin.openAudienceQuestionNow({ questionId })` | admin mutation | → `{ questionId, startsAt, opened }`; samo `published` pitanje sa otvorenim prozorom, inače `FAIR_QUESTION_STATUS` |
| `fairPreEvent.getPreEventSummary({ eventId })` | admin query | broj pre-event redova po vrsti (≤ 200 po vrsti) |
| `fairPreEvent.resetPreEventData({ eventId, dryRun?, confirmSlug? })` | admin mutation | `dryRun` je podrazumevano `true`; stvarno brisanje traži slug (`FAIR_RESET_CONFIRMATION_MISMATCH`) |
| `fairPreEvent.resetPreEventBatch`, `fairPreEvent.previewPreEventReset({ eventSlug })` | internal | serije brisanja; dry-run za CLI (samo čitanje) |
| `fairPackages.migrateFutureActivations({ dryRun? })` | internal mutation | migracija paketa; `dryRun` je podrazumevano `true` |
| `fairPublic.listAudienceQuestionsForModel` | public query | **aditivno:** opcioni argument `at`. Bez njega je odgovor isti kao pre; sa njim dodaje i ranije otvoreno pitanje. Odgovor je istog oblika. |
| `lib/fair-server/model-page.ts` `loadFairAudienceQuestions(eventModelId, dateKey, at = Date.now())` | server helper | jedini red Aleksinog fajla koji je menjan: šalje `at`. Potpis za postojeće pozive je isti. |
| šema | aditivno | `preEvent?: boolean` na 6 tabela i 6 novih indeksa (§40.3); nijedno polje nije obavezno |
| kodovi | aditivno | admin `FAIR_RESET_CONFIRMATION_MISMATCH`; isporuka `PRE_EVENT` |

**Oblik zahteva i odgovora koje koristi Aleksin frontend je isti:** `POST /api/fair/lead`, ocene, glasanje, anketa, `getModelBySlug` i `getLeadForm`. Jedina razlika u vrednosti: za pre-event lead `followUpScheduled` je `false`, a polje je postojalo i ranije.

### 3. DEV ishodi (`dev:expert-pelican-136`, 8. 10.)

- `npx convex dev --once` → „Convex functions ready!“ (šema, indeksi i funkcije su na DEV-u).
- `npx convex run fairPackages:migrateFutureActivations '{"dryRun":true}'`:
  - 2 događaja, 10 modela;
  - za pomeranje su 3 TEST modela `test-auto-moto-fest-2026` (30. 10. u 09:00 → trenutak dodele 3. 10. u 18:39).
- `… '{"dryRun":false}'` → 3 pomerena. Ponovljeni dry-run → 0.
- `npx convex run fairPreEvent:previewPreEventReset` (samo dry-run, ništa nije obrisano):
  - `test-elektromobilnost-2026` (granica 8. 10. u 00:00, generalna proba): 32 reda (5 pečata, 12 jedinstvenih skenova, 15 skenova);
  - `test-auto-moto-fest-2026`: 8 redova (4 + 4).
- Stvarni reset nije pokretan ni na jednom deploymentu.

### 4. Komande za produkciju, redom (izvršava Aleksa)

1. Deploy koda sa ove grane na PROD (Convex i frontend, standardni tok), **pre 9. 10. u 00:00**. Posle toga svaki novi pre-event upis dobija oznaku.
2. Ako pravi događaj još nije postavljen: RUNBOOK §1 (paketi od tada važe od importa).
3. `npx convex run fairPackages:migrateFutureActivations '{"dryRun":true}' --prod` → proveri `moved`.
4. `npx convex run fairPackages:migrateFutureActivations '{"dryRun":false}' --prod` → isto `moved`, a ponovljeni korak 3 daje `moved: []`.
5. `npx convex run fairPreEvent:previewPreEventReset '{"eventSlug":"elektromobilnost-2026"}' --prod` (samo čitanje).
6. Admin → Događaji → `elektromobilnost-2026` → Brisanje → „Pre-event podaci“ → „Proveri šta bi bilo obrisano“ → „Resetuj pre-event podatke“ → upiši `elektromobilnost-2026` → „Obriši pre-event podatke“.

### 5. Šta Aleksa radi i kada

- **Danas, pre proba na pravim podacima:** deploy (korak 1), pa koraci 3 i 4. Ako je import urađen pre deploy-a, migracija pomera pakete na trenutak dodele.
- **8. 10. tokom dana:**
  - forme, ocene, anketa i Glas publike rade odmah;
  - za Glas publike objavi pitanje i klikni „Otvori sada“;
  - probe se ne vide u brojkama; posetilac vidi samo svoj izbor (procenat se pojavljuje tek od 5 glasova tokom sajma).
- **8. 10. uveče, posle poslednje probe** (najkasnije pre otvaranja hale 9. 10.): korak 6.
  - Pokretanje posle ponoći je bezbedno: briše samo ono što je upisano pre 9. 10. u 00:00.
  - Bez reseta brojke ostaju tačne, ali probni podaci (npr. probni lead u bazi, posetiočeve probne ocene) ostaju do purge-a 16. 11.
- **9. 10. u 00:00:** sve što se upiše računa se.

### 6. Otvoreno za Aleksu

1. **Deljene kolekcije** napravljene pre sajma se ne brišu, jer je to javni link koji je možda već poslat; njihov pre-event saobraćaj se briše. Da li ih ipak brisati?
2. **MASTER §5 i §18** („skeniranja se računaju 24/7“) treba dopuniti odlukom P1 (pre-event se ne računa) u dnevniku §20. Kanonski dokument menja vlasnik.
3. Bez reseta, posetilac posle granice i dalje vidi svoju probnu ocenu, glas ili anketu dok ne upiše novu. Brojke su i bez toga tačne.
4. Tabela za import (A5) i dalje ima kolonu „paket od“. Budući datum se sada čita kao „od uvoza“. Da li kolonu ukloniti iz šablona?

## Jovan — 8. 10. — mapa i nalepnice (P2)

Korak P2 lanca SAJAM v2, Aleksini zahtevi od 8. 10. (SYNC-1008-KONTEKST §2.3 i §2.4) i nalazi RN N3, N4, N6 i info. Tehnički detalji su u [`FAIR-BACKEND-CONTRACT.md`](./FAIR-BACKEND-CONTRACT.md) §41, a status i testovi u [`jovan-status/P2.md`](./jovan-status/P2.md). `convex/fairSetup.ts`, intake, RUNBOOK i `/r/[cardCode]` nisu menjani.

### 1. Usklađivanje intake-a i izlagača sa sajta

Mapa prati Aleksin intake. Izlagači sa sajta organizatora (38, `lib/fair-import/izlagaci-2026.ts`) za iste brendove ne prave drugi zapis:

| Brend sa sajta | Pravo učešće (intake) | Štand / lokacija |
|---|---|---|
| JMEV | CUBI d.o.o. (`elektromobilnost-2026-jmev`) | 9 / `hala-9` |
| Mazda, Chery | Grand Motors d.o.o. (`elektromobilnost-2026-grand-motors`) | 6 / `hala-6` |
| Foton | AUTO MIG d.o.o. Niš (`elektromobilnost-2026-auto-mig`) | 6 / `hala-6` (deljeno, O4) |
| Ferum Yudo | Ferum d.o.o. (`elektromobilnost-2026-ferum`) | 1A / `hala-1a` (pored sajtnog Ferum BAW, drugi brend) |
| Bentu | BENTU MOTORS D.O.O (`elektromobilnost-2026-bentu`) | 1B / `hala-1b` |

- Kad je intake učešće u događaju, `importSiteExhibitors` i `placeSiteExhibitors` preskaču ovih šest brendova.
- Sajtni zapis napravljen pre intake-a povlači `reconcileSiteExhibitorsWithIntake` (prvo dry-run). Intake učešće dobija samo ono što mu fali: kategoriju „Automobili“, a logo i sajt organizatora kad ga predstavlja jedan brend. Grand Motors (dva brenda) dobija samo kategoriju i na mapi ima monogram, bez logotipa.
- Nijedno Aleksino učešće, brend, model ni slug nije preimenovan ni dupliran.

### 2. Nove funkcije i promene ugovora

| Šta | Vrsta | Napomena |
|---|---|---|
| `fairExhibitorImport.reconcileSiteExhibitorsWithIntake({ ownerEmail, eventCode, list, dryRun? })` | internal mutation | `dryRun` je podrazumevano `true` |
| `fairExhibitorImport.listStandsOffMap({ eventCode })` | internal query | samo čitanje; štandovi na lokacijama kojih nema na današnjoj mapi, sa predlogom (RN N6) |
| `fairExhibitorImport.importSiteExhibitors` | internal | aditivno: polje `covered` u odgovoru |
| `fairExhibitorImport.placeSiteExhibitors` | internal | aditivno: razlog `covered_by_intake` |
| `fairAdminQr.linkSticker` | admin mutation | aditivno: `expectedModelStickerCode`. Zamena nalepnice koju admin nije video → `FAIR_QR_HOLDER_CHANGED`, bez upisa (RN N3) |
| `fairPublic.getEventMap` | public query | samo aktivna učešća i štandovi; nacrt se više ne vidi (RN N4). Oblik isti. |
| `fairPublic.getModelBySlug` | public query | događaj u nacrtu → `null` (RN info). Oblik isti. |
| `lib/fair-qr-label.ts` | čista funkcija | prima i `СА26-7`, `SA-26-7`, `SA 26 7`, `#7`, `SA26/7` |

**Aleksin frontend:** oblik zahteva i odgovora je isti. Razlika je samo u vrednosti: učešće ili štand u nacrtu više nisu na mapi, a model događaja u nacrtu daje 404 kao i sam događaj.

### 3. DEV ishodi (`dev:expert-pelican-136`, 8. 10.)

- `npx convex dev --once` → „Convex functions ready!“. TEST mape (`test-elektromobilnost-2026`: 42 štanda, `test-auto-moto-fest-2026`: 2) i TEST stranica `test-volta-x1-test-premium` su bajt-za-bajt iste pre i posle. Oba TEST događaja su `published`.
- RUNBOOK §1 bez `--prod`, actor je Jovanov admin:
  - `bootstrapEvent`: događaj, 3 dana, 5 klijenata i 6 brendova `created`;
  - `importDryRun`: `ok`, 0 grešaka, `FAIR_QR_MISSING` ×15 i `FAIR_MAP_LOCATION_TAKEN` ×1 (`hala-6`);
  - `importCommit`: 5 učešća, 5 štandova i 15 modela `created`;
  - `publishEventModels`: 15 objavljeno.
- Izlagači sa sajta na `elektromobilnost-2026`:
  - `importSiteExhibitors`: 32 učešća (klijenti već postoje na DEV-u), `covered` 6;
  - `placeSiteExhibitors`: 33 štanda, preskočeni 6 × `covered_by_intake` i Markus Pro.
- `reconcileSiteExhibitorsWithIntake`:
  - dry-run: 0 povlačenja (sajtnih duplikata nije bilo), dopuna za 5 intake učešća;
  - stvarno: isto;
  - ponovni dry-run: sve 0.
- `getEventMap('elektromobilnost-2026')`:
  - 9: CUBI d.o.o. (JMEV: EV3, YI, EWIND);
  - 6: AUTO MIG (Foton ×4) i Grand Motors (Chery ×3, Mazda ×3);
  - 1A: Ferum BAW i Ferum d.o.o. (Yudo Air);
  - 1B: BENTU (Mango);
  - nijedan sajtni duplikat, 37 izlagača, 15 modela, bez lokacije samo Markus Pro.
- `listStandsOffMap`: prazno za `elektromobilnost-2026`, `test-elektromobilnost-2026` i `test-auto-moto-fest-2026`.
- `linkEventQrInventory` za `elektromobilnost-2026` → `SML-SAJAM-26-QR`, samo DEV, da „Poveži nalepnicu“ radi za pravi događaj. Admin katalog na DEV-u kroz isti kod kao ekran daje redom:
  - 1A Ferum d.o.o. (Yudo, 1);
  - 1B BENTU (1);
  - 6 AUTO MIG (Foton, 4);
  - 6 Grand Motors (Chery i Mazda, 6);
  - 9 CUBI (JMEV, 3).

  Svih 15 je objavljeno i bez nalepnice. `getQrDetail` za `СА26-1`, `SA-26-15`, `#7` i `SA26/12` nalazi SA26-001, 015, 007 i 012. Nijedna nalepnica nije povezana na DEV-u.

### 4. Komande za produkciju, redom (izvršava Aleksa)

`<admin>` je admin e-mail iz `SCANME_ADMIN_EMAILS`. Kod događaja proveri u adminu pre pokretanja.

1. Deploy koda sa ove grane: Convex prod, pa Vercel (standardni tok).
2. Ako pravi događaj još nije postavljen: RUNBOOK §1, koraci 1–4.
3. `npx convex run fairExhibitorImport:linkEventQrInventory '{"ownerEmail":"<admin>","eventCode":"elektromobilnost-2026","inventorySmlCode":"SML-SAJAM-26-QR"}' --prod`
4. `npx convex run fairExhibitorImport:importSiteExhibitors '{"ownerEmail":"<admin>","eventCode":"elektromobilnost-2026","list":"elektromobilnost-2026"}' --prod` → očekivano `covered` 6.
5. `npx convex run fairExhibitorImport:placeSiteExhibitors '{"ownerEmail":"<admin>","eventCode":"elektromobilnost-2026","list":"elektromobilnost-2026"}' --prod` → 6 × `covered_by_intake` i `markus-pro`.
6. `npx convex run fairExhibitorImport:reconcileSiteExhibitorsWithIntake '{"ownerEmail":"<admin>","eventCode":"elektromobilnost-2026","list":"elektromobilnost-2026","dryRun":true}' --prod` → pregledaj `rows`. Ako je lista sajta puštena pre intake-a, `site: "withdraw"` za sajtne duplikate. `has_models` znači da sajtni zapis drži automobil: odluči ručno.
7. Isto sa `"dryRun":false`. Ponovljeni korak 6 mora dati `summary` sa nulama.
8. `npx convex run fairExhibitorImport:listStandsOffMap '{"eventCode":"elektromobilnost-2026"}' --prod` → za svaki red prebaci štand ručno na `proposal` ili na jednog od `candidates`: admin → Događaji → „Import kataloga“, isti `externalKey` štanda sa novim `mapLocationId`, prvo provera pa uvoz. Ništa se ne prebacuje samo.
9. `npx convex run fairPublic:getEventMap '{"eventSlug":"elektromobilnost-2026"}' --prod` → štandovi 9, 6 (dva izlagača), 1A i 1B kao u tabeli §1.
10. U adminu, na telefonu: Događaji → „Poveži nalepnicu“ → 5 izlagača po štandu i 15 automobila. Poveži SA26-001 … 015, pa skeniraj svaku nalepnicu u privatnom prozoru.

### 5. Otvoreno za Aleksu

1. Grand Motors (Mazda i Chery) na mapi nema logo, jer bi bilo koji od dva brenda bio pogrešan. Pravi logo firme se može otpremiti u profilu klijenta.
2. Nazivi na mapi su pravni nazivi iz intake-a („CUBI d.o.o.“, „AUTO MIG d.o.o. Niš“). Pretraga i detalj štanda pokazuju brendove. Da li na mapi treba kraći javni naziv (npr. „JMEV“)? To bi bilo novo polje, ne preimenovanje.
3. Na DEV-u oba događaja (`test-elektromobilnost-2026` i `elektromobilnost-2026`) dele SA26 inventar. Admin prečica za slobodnu nalepnicu bira događaj koji traje (N1 §7). Na produkciji TEST događaj ne vezivati za SA26.

## Jovan — 8. 10. — stranica automobila i mapa (D1)

Korak D1 lanca SAJAM v2 (SYNC-1008-KONTEKST §2.2, §3), nalazi RN N1, N2, N5, N7 i dva niska. Stranica automobila i forme su Aleksine (`5532038`): nisu pravljene ponovo, izgled i tok su isti. Status i testovi su u [`jovan-status/D1.md`](./jovan-status/D1.md), a ugovor u [`FAIR-BACKEND-CONTRACT.md`](./FAIR-BACKEND-CONTRACT.md) §42.

### 1. Tačka montaže `new-stamp-card.tsx` (Aleksa §2.2)

D1 karticu nije montirao. `components/fair/passport/**` nije diran. Mesto je slobodno i izmereno; potvrđuje Aleksinu MOUNT-NOTE iz `1be0feb`.

| Šta | Vrednost |
|---|---|
| Fajl | `components/fair/fair-model-page.tsx` |
| Komponenta | `FairModelPage` (server komponenta) |
| Mesto u JSX-u | poslednje dete `<section className="fair-model-hero…">`, odmah posle `<SurveyChatHead />` (danas red 249), pre `</section>` |
| Kako | kroz mali klijentski omotač (npr. `NewStampSlot`), jer `FairModelPage` nije klijentska komponenta; omotač čita pasoš i drži `onDismiss` |
| Uslov prikaza | samo pravi model (`interactions !== null`); model je u pasošu svog brenda (`FairPassportCatalogEntry.models[].eventModelId === model.id`); posetilac ima pečat (`stampedModelIds` iz `POST /api/fair/passport`); pečat je još nepročitan: `unreadPassportModelIds(window.localStorage, model.eventId, passportId, stampedModelIds).includes(model.id)` (`lib/fair-client/passport-visit-store.ts`); posle „×“ skriven do kraja sesije |
| `brandName` | `model.brandName` |
| `brandSlug` | `fairPassportBrandSlug(entry.brandName)` iz `lib/fair-passport.ts`, gde je `entry` stavka kataloga pasoša. Isto pravilo koristi ruta `/sajam/[eventSlug]/pasosi/[brandSlug]`. Ne računati ga iz očišćenog `model.brandName`, jer kod TEST brenda prefiks pravi drugi slug. |
| `modelSlug` | `model.modelSlug` |
| `eventSlug` | `model.eventSlug` (javni slug iz URL-a) |
| `onDismiss` | sakriva karticu za sesiju |

**Prostor (izmereno u D1, Playwright, px od vrha hero-a).** Kartica ima `bottom: var(--fair-new-stamp-bottom, 100px)` i visinu 60 px. Chat-head ankete je gore desno (`top: 12px; right: 12px`, `.fair-survey-head-wrap`) i sa oblačićem se završava na 95 px. Ni na jednoj širini nema fiksnog ni lepljivog elementa preko donje polovine hero-a.

| Model | Širina | Visina hero-a | Kartica | Identitet počinje | Ishod |
|---|---|---|---|---|---|
| pravi, sa fotografijom (`jmev-ev3`) | 360 / 390 / 412 / 1280 | 383 / 487 / 558 / 435 | 223–283 / 327–387 / 398–458 / 275–335 | 293 / 395 / 464 / 336 | staje između chat-head-a i identiteta |
| TEST bez fotografije | 390 / 412 / 1280 | 287 / 358 / 300 | 127–187 / 198–258 / 140–200 | 195 / 264 / 201 | staje |
| TEST bez fotografije | 360 | 212 | 52–112 | 122 | **ne staje**: preklapa chat-head (13–95), a nijedna vrednost `--fair-new-stamp-bottom` ne odvaja ga i od chat-head-a i od identiteta |

Svih 15 pravih modela ima fotografiju, pa se poslednji red na sajmu ne javlja. Ako model ostane bez fotografije, odluka je Aleksina: na primer, karticu prikazati tek kad chat-head nije vidljiv, ili hero bez fotografije na 360 px učiniti višim.

### 2. Promene ugovora

Oblik zahteva i odgovora koji koristi Aleksin frontend je isti.

| Šta | Promena |
|---|---|
| `POST /api/fair/lead` (`fairLeads.submitLead`) | samo vrednost: za `duplicate: true` je `confirmationEmail` uvek `false` (RN N2) |
| `fairLeadNameRisk` (`lib/fair-contract.ts`) | `J.Petrovic` i `Ana J.Petrovic` više nisu `link`; `x.com`, `X.com`, `bit.ly`, `J.bit.ly` jesu |

### 3. Šta je urađeno

- **RN N1, fotografija:** spoljni URL (fotografija ili logo brenda) ne ide kroz `/_next/image` na stranici automobila, u garaži, u poređenju i na stranici deljenja (`fairPhotoUnoptimized`). Lokalni `/fair/…` ostaje optimizovan, a `next.config` nije menjan. Mapa i rotacija su to već imale (`fair-map-rotation.tsx:80,82`, `fair-map-logo.tsx:15`).
- **RN N2, duplikat:** server vraća `confirmationEmail: false`. `LeadSheet` piše „Već smo primili vaše interesovanje. {brand} će vas kontaktirati.“ ili „Već smo primili vašu prijavu za probnu vožnju. Diler će vas kontaktirati.“
- **Forme:** Aleksine forme ispunjavaju sva pravila; dodati su samo testovi (`components/fair/lead-sheet.test.tsx`).
- **RN N5, ScanMe:** `ispred-14` je zelen i bez štanda u podacima; tada nije interaktivan. Hover važi samo pod `@media (hover: hover)` i nikad na ScanMe. Placeholder ScanMe na AMF mapi se ne crta.
- **RN N7, zona dodira:** tap prstom koji promaši štand bira najbliži crtež u zoni od najmanje 44 CSS px (`lib/fair-map/touch.ts`). Izgled mape je isti.
- **Niski nalazi:** „3 m²“ se ne lomi (neprelomni razmak); kutija grupe piše „12 m² ukupno“; ime „J.Petrovic“ prolazi.
- **Usput:** `fairHaptic` ne zove `navigator.vibrate` pre prvog dodira. To je bila greška u konzoli na stranici automobila, zbog chat-head-a ankete.

### 4. Šta je ostalo (za Aleksu / D2)

1. **Pasoš:** `components/fair/passport/**` (Aleksin, zabranjen u ovom lancu) i dalje šalje `photoUrl` i `brandLogoUrl` kroz `next/image` bez `unoptimized`. To je isti uzrok kao RN N1 ako fotografija ili logo nije na `scanme.rs/fair/` ili `*.convex.cloud`. Mesta: `fair-passport.tsx:129, 387, 620, 717`, `passport-finale.tsx:179`, `passport-unlock-card.tsx:403, 410`. Predlog: `unoptimized={fairPhotoUnoptimized(src)}` iz `lib/fair-client/photo-url.ts`. Svih 15 pravih fotografija je na `scanme.rs/fair/`, pa danas ništa ne pada.
2. **`adminProducts.linkDigital`** nema sajamsku zaštitu, a admin UI ne prikazuje `skipped` iz `bulkRetarget`. Ostavljeno: `linkDigital` nema poziv iz UI-ja, a pravi test traži ceo ADMIN-12 lanac fizičkog proizvoda u sajamskom inventaru.
3. **Preklop kod `hala-12`** (bedž, marker pasoša, pin rotacije) i **sažeta upozorenja na traci „Poveži“ na 360 px**: vizuelno, ostavljeno za posle sajma. „Poveži“ se danas koristi na terenu.
4. **Pravi modeli bez istaknutih specifikacija** (intake nema `isHighlight`): ispod hero-a ostaje prazna mreža sa tankom linijom. Aleksin izgled, nije menjan.
5. **DEV:** TEST saglasnost još nije aktivna, pa forme na DEV-u pokazuju „Trenutno nedostupno“. Izgled forme je proveren SSR testom.
