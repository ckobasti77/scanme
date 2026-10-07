# Jovan backend delta — 8. oktobar 2026.

> Poslednje ažuriranje: **8. oktobar 2026.**
>
> Vlasnik odluka: **Aleksa**
>
> Produktni izvor: [`MASTER-KONTEKST.md`](./MASTER-KONTEKST.md) · Tehnički ugovor: [`FAIR-BACKEND-CONTRACT.md`](./FAIR-BACKEND-CONTRACT.md)

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
