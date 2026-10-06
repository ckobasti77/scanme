# Izlagači 2026 — Interakcije po izlagaču, izlagači sa sajta, pravi QR i SA26

**Grana:** `codex/jovan-izlagaci-qr-2026-10-06`
**Osnova:** `jovan/sajam-sync-review-2026-10-06` @ `b9ca4f5` (Aleksin `0e8f853` + Jovanovi jedinstveni commitovi).
**Zahtev:** Jovan, 6. 10. 2026. uveče.

## 1. Interakcije: jedan link, kartice izlagača, stranica izlagača

- Navigacija ima jedan link **Interakcije** (`interakcije`). Četiri stare rute (`interakcije/glas-publike|ankete|pasos|forme`) i dalje rade:
  - sa `?izlagac=` vode na stranicu tog izlagača, na isti deo i sa istim modelom, danom i filterima;
  - bez njega vode na listu.
- **Lista** (`interakcije`) je jedna kartica po izlagaču: logo, naziv, sajt, brendovi, automobili po paketu, Glas publike za izabrani dan, ankete i pasoš.
  - Podrazumevano su prikazani samo izlagači sa bar jednim Starter ili Napredni automobilom.
  - „Svi izlagači“, „Ima Napredni“, „Ima Starter“ i „Samo Za sve“ su jedan klik (`?paket=`).
  - „Paketi“ otvara automobile izlagača odmah u listi.
- **Stranica izlagača** (`interakcije/<participationId>`):
  - logo, sajt, „Profil klijenta“ i „Automobili u Modelima“;
  - paketi automobila: pojedinačno ili „Svim automobilima → Starter/Napredni“, uvek sa potvrdom i samo naviše (`fairAdmin.upgradePackage`, jedan poziv po automobilu);
  - Glas publike, Ankete, Pasoš brenda i Forme samo za automobile tog izlagača, jedno ispod drugog, sa skokom na deo (`#glas-publike`, `#ankete`, `#pasos`, `#forme`).
  - Svaki deo čita svoj ključ u URL-u (`model` za Glas publike, `anketa`, `forma`), pa izbor automobila u jednom delu ne otvara druge.
- Linkovi iz detalja modela, Pregleda i Leadova vode na nove rute.

## 2. Izlagači sa sajta organizatora

- `lib/fair-import/izlagaci-2026.ts`: 38 izlagača sa https://sajamautomobila.com/ucesnici-2026/ (hala, ulaz, zadnji deo), sa sajtom koji organizator daje i logom u `public/fair/izlagaci/2026/`. Ništa nije izmišljeno: nema kontakata, e-mailova ni paketa.
- `convex/fairExhibitorImport.ts` (internal, samo CLI):
  - `importSiteExhibitors`: isti event-only klijent kao `createEventClient` + aktivno učešće;
  - idempotentno po kodovima `SMK-IZL26-…`, `SML-IZL26-…`, `izl26-…`;
  - drugo pokretanje ništa ne menja i ne prepisuje ručne izmene;
  - obavezni podrazumevani kontakt je eksplicitni placeholder „Kontakt nije unet“, bez e-maila i telefona.
- `accounts.websiteUrl` (opciono polje): sajt u profilu klijenta sa „Izmeni“ (`adminClientProfiles.setWebsite`, samo http/https, audit) i na karticama izlagača.
- Profil event-only klijenta se otvara i bez ScanMe naloga vlasnika.

## 3. QR: pravi QR, oznaka SA26, test skeniranjem

- Lista QR kodova: kartica ima pravi QR umesto ikonice, a naslov je oznaka nalepnice (`cards.label`, npr. `SA26-001`), pa SMQ i kod.
- Redosled je redosled štampe: `SA26-001…100`, pa paneli, pa ostali.
- Pretraga i „Otvori detalj“ rade i po oznaci (`SA26-007`). Backend `findInventoryCode` traži oznaku samo u inventaru događaja, ograničeno na 1000 kartica.
- Detalj koda: veliki QR, adresa koju kodira (`<origin>/r/<kod>`), „Kopiraj adresu“ i „Otvori adresu“.
- Na produkciji je to tačno adresa sa nalepnice (`https://scanme.rs/r/…`); lokalno je to adresa servera na kom radi admin.
- `fairExhibitorImport.linkEventQrInventory` prebacuje događaj na postojeći inventar (npr. `SML-SAJAM-26-QR` iz `fairPrintInventory`).
  - Postojeće dodele se ne diraju.
  - Kod starog inventara koji još vodi na model ovog događaja ostaje dostupan u detalju („Ukloni vezu“). Nova dodela prima samo kodove trenutnog inventara.

## 4. Provere (kontejner)

- `tsc` i `eslint` za sve izmenjene fajlove su čisti; `next build` prolazi.
- Admin, lib i fair Convex testovi: 1183/1183.
- Ceo `vitest`: dva pada (`adminProducts` 10k perf timeout i `memoriesHost` vremenski prozor) padaju i na osnovi `b9ca4f5`; nisu od ove izmene.
- Novi testovi: `interaction-exhibitors`, `website`, `izlagaci-2026`, QR oznake i slike, stranica izlagača i lista, `fairExhibitorImport` (import, idempotencija, profil, inventar SA26), `fairAuthz` (nove funkcije su internal).

## 5. Pokretanje na DEV-u i produkciji

DEV (posle `npx convex dev --once`; bash/Git Bash — u PowerShell 5.1 navodnike u JSON-u treba escape-ovati):

```bash
npx convex run fairPrintInventory:provisionBatch '{"ownerEmail":"<admin>","startOrdinal":1,"count":25}'   # 26, 51, 76
npx convex run fairPrintInventory:provisionPanels '{"ownerEmail":"<admin>"}'
npx convex run fairExhibitorImport:linkEventQrInventory '{"ownerEmail":"<admin>","eventCode":"test-elektromobilnost-2026","inventorySmlCode":"SML-SAJAM-26-QR"}'
npx convex run fairExhibitorImport:importSiteExhibitors '{"ownerEmail":"<admin>","eventCode":"test-elektromobilnost-2026","list":"elektromobilnost-2026"}'
```

Na DEV-u su SA26 kodovi DEV kopije (drugi resolver kodovi od odštampanih).

Produkcija je Aleksina odluka i deploy:

- odštampani inventar tamo već postoji;
- ostaje `linkEventQrInventory` za produkcijski događaj i `importSiteExhibitors` za njegov kod.
