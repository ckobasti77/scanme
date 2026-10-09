# Spoj sa Aleksom i ispravke mape — 9. oktobar 2026.

Grana `codex/jovan-spoj-aleksa-2026-10-09`, napravljena od `codex/jovan-sajam-mapa-raspored-2026-10-09` (`92bae1a`). Pushovana na `origin` i `aleksa`, bez `--force`, nikad na `main`. Bez deploy-a i bez `convex deploy`.

> **Javna mapa je i dalje sakrivena.** `FAIR_PUBLIC_MAP_ENABLED` u `lib/fair-contract.ts` je `false` u svim commitovima ove grane (odluka vlasnika, Aleksin `173fb5b`). Ispravke mape su spremne, ali se mapa vraća tek kad Jovan i Aleksa prebace vrednost na `true`. Za rad i snimke vrednost je bila `true` samo lokalno i vraćena je pre commita.

## Commitovi

| Commit | Šta |
|---|---|
| `ff08475` | Revert P1 (`db7e5cf`) pre spoja |
| `f824c86` | `git merge --no-ff aleksa/main` (`6afd7cb`) |
| `24a0e89` | Ispravke mape: logoi bez pozadine, bez zone „Zadnji deo“, filteri iznad mape |
| (ovaj) | Ova beleška |

## 1. Aleksine grane

`git fetch aleksa --prune` i `git fetch origin --prune`, pa `git for-each-ref refs/remotes/aleksa --sort=-committerdate`.

### Spojeno

- **`aleksa/main` (`6afd7cb`)**: 48 commitova koji nisu bili kod nas, Aleksini i Teodorini (`djteodora018`):
  - ADMIN-V1 (ADMIN-00 … ADMIN-18, Zoho Mail, oporavak lozinke);
  - pre-event pristup (granica analitike 9. 10. 08:00, reset);
  - admin alati na sajmu (`fairAdminDev`, `isAdminExcluded` na 9 tabela);
  - privatnost i nacrti saglasnosti;
  - konačni mejlovi posetiocu;
  - model page v2, garaža, sponzorisani dok, anketa do 10 pitanja;
  - sakrivena javna mapa (`173fb5b`);
  - naš landing koji je Aleksa preuzeo (`6afd7cb`).
- **`aleksa/codex/sajam-integracija-2026-10-04` (`173fb5b`)** je ceo u `main`-u (0 commitova van njega), pa je spojen kroz `main`.

### Nije spojeno

| Grana | Van `aleksa/main` | Šta menja | Zašto nije |
|---|---|---|---|
| `codex/fair-panel-qr-prod-2026` (`266049d`, 6. 10.) | 2 | `convex/fairPrintInventory.ts` (+463): nepromenljiv QR inventar za štampu i alat za QR panela | Starije od 8. 10. i nije u `main`-u. Ne zna se da li je završeno i pokrenuto ili zamenjeno; produkcioni QR alat se ne spaja bez Aleksine potvrde |
| `codex/fair-qr-prod-base-2026` (`bb094e6`, 6. 10.) | 1 | isti fajl, uža verzija (+310) | Podskup prethodne grane |
| `codex/sajam-automobila-2026` (`e08c68b`, 3. 10.) | 2 | rana javna stranica modela (26 fajlova, +4407) | Zamenjena model page v2 iz `main`-a |
| `feat/venue-memories`, `backup/main-sync-2026-08-30`, `jovan/*` | — | stari rad iz avgusta i septembra | Nisu deo sajma i starije su od 8. 10. |

Jovanove grane na `aleksa` remote-u (`codex/jovan-sajam-dizajn`, `jovan-dorade`, `jovan-landing`, `jovan-sajam-sync`, `jovan-sajam-mapa-raspored`) već su cele u ovoj grani.

## 2. Pre spoja: P1 je vraćen (`ff08475`)

Po `JOVAN-DELTA-2026-10-08b.md` §6.2 (vlasnik odluka: Aleksa) Jovanov P1 (`db7e5cf`) ne ide, jer ga zamenjuje Aleksina pre-event verzija (`convex/fairPreEvent.ts`, `convex/lib/fairPreEvent.ts`, `openAudienceQuestionNow`, `openAt`).

Bez reverta bi spoj ostavio:

- dva paralelna pre-event sistema;
- polje `preEvent` i 6 indeksa u šemi, koje produkcija nema.

Kod se vratio bez konflikta. Dokumentacija P1 ostaje kao istorija (`FAIR-BACKEND-CONTRACT` §40 ima napomenu). P2 i D1 ostaju.

Posle reverta:

- tsc je isti kao pre;
- fair i admin testovi: 128 fajlova, 1030 testova prolazi.

## 3. Konflikti i odluke (`f824c86`)

Posle reverta backend (`convex/**`, `lib/fair-contract.ts`, šema) se spojio bez konflikta. Ostalo je 9 fajlova, rešenih jedan po jedan:

| Fajl | Odluka |
|---|---|
| `app/globals.css` | Aleksin `main` je imao **duplikat** starog admin bloka (artefakt njegovog 3-way spoja u `6afd7cb`). Drugi blok nije donosio nijedan nov token, a gazio je zelene admin tokene i uglove. Ostaje jedan blok (naš, isti kao njegov prvi). Fajl je identičan našem, a od Aleksinog se razlikuje samo po uklonjenom duplikatu |
| `app/sajam/fair-event.css` | Aleksin model page v2 je prepisao markup i pravila stranice modela. Naši blokovi u konfliktu bili su tokenizovane stare verzije, mnoge sa klasama koje više ne postoje (`fair-specification*`, `fair-model-disclosure*`, `fair-save-button__surface`, `fair-rating-field`, `fair-checkpoint-note`). Odluke: (1) Aleksina strana; (2) blok tokena: obe strane, naši `--fair-space/radius/border/shadow/dur/ease` uz njegove `--fair-good/star/star-off/bay-mark`; (3) u anketi spojeno po redu: njegova izmena + naš token. Poravnanje je rađeno histogram algoritmom (29 blokova umesto 51 kod myers-a), da se ne meša pravilo sa pogrešnim pravilom |
| `components/fair/garage/fair-garage.module.css` | 5 blokova starih `.sponsored*` stilova koje ništa više ne koristi (Aleksa ih je zamenio dokom `.sp*`). Prihvaćeno brisanje |
| `components/fair/garage/fair-garage.tsx` | Aleksin novi sponzorisani dok. Naša D1 ispravka (`unoptimized` za spoljne fotografije) preneta je u njegov `SponsoredSlideVisual` |
| `components/fair/garage-controls.tsx` | Aleksin save dock (v2). Naš morph, a sa njim i naša izmena radijusa, otišao je zajedno sa efektom |
| `components/fair/lead-sheet.tsx`, `lib/i18n/sr/fair-model.ts` | Ostaje naša D1 logika duplikata (`fairLeadSentText`). Tekstovi su Aleksini konačni („Poslato! {brand} tim će vam se javiti.“, „Zahtev je poslat. {brand} tim će vas kontaktirati za termin.“). „Već poslato“ je usklađeno sa njima. `testDriveSent` sada dobija `{brand}` |
| `FRONTEND-DELTA-2026-10-08.md`, `…-09.md` | Oba unosa zadržana. P1 je obeležen kao vraćen |
| `components/fair/fair-model-page.test.tsx` (naš D1 test, bez konflikta, ali je pukao) | Prilagođen Aleksinom v2 API-ju (`stand`, `audienceTeaser`) i v2 identitetu (ime i cena su u `fair-model-identity`) |

Spoj ne dira ScanMe Links ni `app/r`, pa `harness:check` nije potreban.

### Za Aleksu i dizajn (nije menjano u spoju)

- Aleksini novi delovi imaju njegove boje, a ne sajamske tokene i ScanMe zelenu:
  - sponzorisani dok u garaži: tamna kartica, plavi akcenti `#7fd4ff`;
  - save dock i stranica modela v2: plavo dugme `--fair-accent`, tamni hero `#2a2d33`.
- Prevođenje na tokene je poseban posao.
- Pasoši imaju 9 `<Image>` bez `unoptimized` za spoljne URL-ove. To je bilo i pre spoja, van D1 obima.

## 4. Provere

| Provera | Pre spoja (`92bae1a`) | Posle spoja (`f824c86`) | Posle mape (`24a0e89`) |
|---|---|---|---|
| `npx tsc --noEmit` | 35 grešaka | 35, iste | 35, iste |
| `npm run lint` | 0 grešaka / 3 upozorenja | 0 / 2 | 0 / 2 |
| `npm test` (vitest) | 2 pala / 2312 prolazi | 2 pala / 2336 prolazi | 2 pala / 2335 prolazi |
| `npm run build` | prolazi | prolazi | prolazi |
| `npx vitest run fair` | — | — | 80 fajlova, 702 testa, sve prolazi |

- Svih 35 tsc grešaka su postojeće, u test fajlovima van sajma (`convex/admin*.test.ts`, `checkout`, `subscriptions`, `emailSyncEngine`, `enterpriseProvisioning`, `lib/memories-*`). Nijedna nije nova.
- Uvek isti 2 pala testa:
  - `convex/adminProducts.test.ts`: perf test „500 venues…“;
  - `convex/memoriesHost.test.ts`: „extend then close a one_off window“.
- Posle ispravki mape jedan test manje, jer je test oblasti „Zadnji deo“ u `layout.test.ts` uklonjen sa zonom.

## 5. Ispravke mape (`24a0e89`)

### Logoi bez belog kvadrata

- **Uzrok su obe stvari:**
  - CSS: `.logoBox { background: #ffffff }` i `.chip rect { fill: #ffffff }`;
  - slike: svih 38 WebP kopija u `public/sajam/izlagaci/2026/` bilo je bez alfa kanala, sa belom podlogom iz organizatorovih JPG-ova.
- **Skripta `scripts/fair/map-logos-transparent.mjs`** (sharp 0.35.3 iz projekta, bez novih paketa) od originala u `public/fair/izlagaci/2026/` pravi providne WebP kopije u `public/sajam/izlagaci/2026/providni/`. Kopije imaju tačno deklarisanu veličinu (`FAIR_MAP_LOGO_THUMBS`) i svaka je ≤ 12 KB (ukupno ~198 KB):
  - bela oblast povezana sa ivicom i male zatvorene bele oblasti (rupe u slovima) postaju providne;
  - veće bele površine unutar znaka ostaju;
  - ivica dobija „boju u alfu“, pa nema belog oboda.
- `FAIR_MAP_LOGO_THUMB_BASE` pokazuje na nove kopije. Stare neprovidne kopije su obrisane. `logos.test.ts` proverava alfa kanal.
- `.logoBox` i čip na mapi nemaju podlogu ni okvir. Samo inicijal (izlagač bez logoa) ima tihu podlogu.
- Na zelenom ScanMe štandu ScanMe logo je jednobojan taman, jer bi bez pločice svetlo zeleno „Me“ nestalo.
- **Teme:** sajam u tamnoj temi sajta zadržava svoje svetle površine (`--fair-surface #fffdf8`, `--fair-canvas #f1eee7`), pa logoi stoje na svetlom u obe teme. Provereno na 390 px, svetla i tamna tema (mapa, spisak, sheet).

### Zona „Zadnji deo“ je uklonjena

- **Provera na DEV-u (`expert-pelican-136`, samo čitanje):** `npx convex run fairPublic:getEventMap '{"eventSlug":"elektromobilnost-2026"}'`. U toj zoni je aktivno učešće sa aktivnim štandom:
  - **AUTO1.com**;
  - učešće `ps7j8zsyjctgsj9mq82p0cpb7x8fwr7s`;
  - štand `r57mj615tvgwn5dzg8s22jmf0h8fwtzw`;
  - `mapLocationId: "zadnji-deo"`, kategorija `usluge`.
- Po fajlu zadatka zona tada ne bi bila uklonjena. **Vlasnik je u četu 9. 10. odlučio da se ukloni skroz:** „Zadnji deo“ (zadnji deo hale) ne postoji, postoje samo Hala i Ispred hale.
- **Urađeno:**
  - zona, natpis, CSS (telefon, ≥ 1440, `?prikaz=ekran`) i testovi su uklonjeni, a slika `elektro-zadnji-deo.jpg` je obrisana;
  - `FairMapZoneId` je `hala | ispred`;
  - `isFairMapStandLocation` i `validateMapLocationIds` više ne primaju `zadnji-deo` za nov štand;
  - AUTO1 je u listi organizatora u Hali, bez lokacije (`noLocationReason`), kao Markus Pro.
- **Nije dirano:**
  - podaci na DEV/PROD: štand AUTO1 na `zadnji-deo` ostaje; na mapi ga nema, a u spisku piše „Tačno mesto još nije na mapi organizatora“;
  - `FAIR_MAP_ZONE_IDS` i Convex `fairMapZoneId` i dalje primaju `zadnji-deo`, jer je vrednost sačuvana u podacima. Uklanjanje traži čišćenje podataka i Convex deploy (Aleksa). Sačuvan `zadnji-deo` na učešću bez štanda mapa čita kao Hala.
- **Kako Aleksa proverava na produkciji (samo čitanje):**
  - `npx convex run fairPublic:getEventMap '{"eventSlug":"elektromobilnost-2026"}' --prod`: traži štand sa `"mapLocationId": "zadnji-deo"`;
  - ili `npx convex run fairExhibitorImport:listStandsOffMap '{"eventCode":"elektromobilnost-2026"}' --prod`: posle ovog deploy-a lista svaki štand čiji `mapLocationId` nije na mapi, a AUTO1 će biti tu.
- **Otvoreno** (`docs/tasks/BLOCKED.md`): gde u hali stoji AUTO1, ili da li ga treba skloniti sa sajma.

### Filteri ponovo tik iznad mape

Redosled je sada:

1. pretraga i „Pronađi ScanMe“;
2. prekidač zona;
3. filteri (Sve, Automobili, Moto i mikromobilnost, Punjenje i energija, Usluge i grad, Hrana i smeštaj, Ostalo, ScanMe);
4. mapa sa kontrolama ispod nje;
5. ostalo.

`map-v2-ssr.test.ts` proverava baš ovaj redosled. Na ≥ 1440 px prekidač zona je skriven (obe zone su vidljive), pa filteri idu odmah ispod pretrage.

### Snimci (pregledani, nisu u repou)

- 360 px: Ispred hale, ScanMe štand.
- 390 px: svetla tema; tamna tema sa spiskom i sheet-om.
- 1280 px.
- 1440 px: dve zone jedna pored druge.
- `?prikaz=ekran` (1920×1080): dve zone i legenda. Desna kolona je prazna dok DEV nema stavke rotacije, kao i ranije; nekad je tu bio uložak „Zadnji deo“.

Nigde nema horizontalnog preloma. U konzoli nema grešaka.

## 6. Okruženje

- Druga Claude sesija nije radila, a ni `SajamRun.ps1`.
- Od prethodne sesije (10:39) ostali su `next dev` i `convex dev`:
  - `next dev` (port 3000) je korišćen kao jedini dev server;
  - `convex dev` watcher je ugašen pre spoja, jer bi usred spoja gurao Aleksin backend na DEV.
- DEV backend i dalje ima kod pre spoja; ništa nije pushovano na Convex.
