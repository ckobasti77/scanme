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
