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
