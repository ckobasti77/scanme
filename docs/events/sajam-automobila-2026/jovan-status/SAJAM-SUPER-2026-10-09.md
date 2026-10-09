# SAJAM SUPER — 9. oktobar 2026.

Javna mapa ponovo vidljiva, doslednost sajamske aplikacije, toplotna mapa „Gde je gužva“, admin analitika i provera brojki.

- **Zadatak:** `tmp/sajam-super-2026-10-09/ZADATAK.md` (zamenjuje `analitika-heatmap`).
- **Grana:** `codex/jovan-sajam-super-2026-10-09`, napravljena od `codex/jovan-spoj-aleksa-2026-10-09` (`3cfe71b`).
- **Push:** `origin` i `aleksa`, bez `--force`, nikad na `main`.
- **Deploy:** nije rađen. DEV backend (`dev:expert-pelican-136`) je osvežen sa `npx convex dev --once`.

> **Posle deploy-a je javna mapa vidljiva svima.** `FAIR_PUBLIC_MAP_ENABLED = true` (odluka Jovana, 9. 10. u 13:45). Čim Aleksa deployuje Convex pa Vercel, `/sajam`, adresa mape i QR sa ulaznog panoa (PANEL-2026-EVENT) vode na mapu. Za ponovno sakrivanje dovoljno je vratiti konstantu na `false`.

## Commitovi

| Commit | Korak | Šta |
|---|---|---|
| — | 0 | Ništa za commit: 10 test fajlova sa `TestConvex<typeof schema>` su već u `ec576d6` (radno stablo je bilo čisto, osim tuđih `docs/sajam/` i `scripts/sajam/`, koje nisam dirao) |
| `e93c2b0` | 1 | Javna mapa ponovo vidljiva, testovi putanja |
| `90eda9e` | 2 | Sve strane kao Garaža i Pasoši, referenca u `FAIR-DESIGN-DNA.md` §0 |
| `e577773` | 3 | „Gde je gužva“ — toplotna mapa za posetioce |
| `1dd8b31` | 4 | Admin `Događaji → Analitika` |
| `2658f6b` | 5 | Brojke = baza; „jedinstveni“ jasno imenovan |
| `cc78a89` | 3 | Čuvar mape dozvoljava samo keširano čitanje toplote |
| `e15d9cf` | 2 | Ispravke posle nezavisnog pregleda (okvir platna, zaglavlje prati kolonu, anketa) |
| `364a45d` | 2 | Zaglavlje mape na telefonu zadržava svoj razmak (potvrdni pregled) |
| (ovaj) | — | Beleška, FRONTEND-DELTA |

## Korak 0: polazište

- **Druge sesije:** nijedna druga Claude sesija nije radila; `SajamRun.ps1` nije radio. Radio je jedan `next dev` (port 3000, od 10:39) i njega sam koristio.
- **Testovi pre rada:**
  - tsc 0 grešaka;
  - `vitest run fair` 80/80 fajlova, 702 testa;
  - ceo suite 2337 prolazi, 2 preskočena.
- **DEV:** posle toga `npx.cmd convex dev --once` → `expert-pelican-136`. Uklonjeno je 6 P1 indeksa, očekivano posle reverta P1 (`ff08475`).

## Korak 1: javna mapa

- `FAIR_PUBLIC_MAP_ENABLED = true`. Komentar navodi ko je odlučio i kada.
- Svo skrivanje iz Aleksinog `173fb5b` je vezano za prekidač, pa ručno vraćanje nije bilo potrebno. Tri komentara sada opisuju uslov umesto datuma.
- **Provereno u pregledaču** (DEV):
  - `/sajam` vraća 307 na `/sajam/elektromobilnost-2026`;
  - adresa mape vraća 200 i više ne preusmerava;
  - meni ima Mapa;
  - prazna garaža ima „Otvori mapu sajma“;
  - stranica modela ima čip „Štand 9 · Hala“ sa `?stand=hala-9`;
  - pasoš ima „Na mapi“ sa `?stand=…`.
- **QR panela** `PANEL-2026-EVENT` vodi na `https://scanme.rs/sajam/elektromobilnost-2026` (`convex/fairPrintInventory.ts`), dakle na adresu mape. Ništa nije trebalo menjati.
- **Test:** `components/fair/fair-map-links.test.tsx` (6 testova). Sa `false` svih 6 pada.

### Tabela razlika rasporeda (DEV `expert-pelican-136` prema intake-u i listi organizatora)

Izvor očekivanog:

- `intake/elektromobilnost-2026-2026-10-07/02-brands-stands.csv` i `b1-payload.json`;
- `lib/fair-import/izlagaci-2026.ts` (lista sa sajta).

Na DEV-u postoji 37 aktivnih učešća i 38 aktivnih štandova. Nema duplikata (učešće × lokacija), a nema ni povučenih ostataka sa sajta.

| Izlagač | Očekivano | DEV | Stanje |
|---|---|---|---|
| CUBI d.o.o. (JMEV) | 9 (`hala-9`) | `hala-9` | ✓ |
| Grand Motors (Mazda, Chery) | 6 (`hala-6`) | `hala-6` | ✓ |
| AUTO MIG (Foton) | 6 (`hala-6`) | `hala-6` | ✓ (deli lokaciju sa Grand Motors, odluka O4) |
| Ferum d.o.o. (Yudo) | 1A (`hala-1a`) | `hala-1a` | ✓ |
| Ferum BAW | 1A (`hala-1a`) | `hala-1a` | ✓ |
| BENTU MOTORS | 1B (`hala-1b`) | `hala-1b` | ✓ |
| ScanMe | 14 (`ispred-14`) | `ispred-14` | ✓ (ScanMe zelena) |
| Enigma IT | 14 (`ispred-14`) | `ispred-14` | ✓ |
| Ostalih 28 sa sajta | po listi | po listi | ✓ (Venera Bike na 12, 19 i 20–22, kako organizator navodi) |
| Auto servis Markus Pro | bez lokacije | bez štanda | ✓ (u spisku „tačno mesto još nije na mapi“) |
| **AUTO1.com** | **bez lokacije** (vlasnik 9. 10.) | **štand na `zadnji-deo`** | **razlika u podacima**: mapa ga ne crta, spisak ga vodi bez mesta; isto je na PROD-u (SPOJ-ALEKSA §3) |
| Učešća sa sajta za JMEV, Mazda, Chery, Foton, Ferum Yudo, Bentu | ne postoje (pokriva ih intake) | ne postoje | ✓ |

`fairExhibitorImport:listStandsOffMap` na DEV-u vraća samo AUTO1 (`zadnji-deo`).

**U kodu:** nema razlike. Geometrija `lib/fair-map/elektromobilnost-2026.ts` ima 1A, 1B, 6, 9 i 14 na pravim mestima. Lista i intake se slažu, a ispravke iz `24a0e89` (AUTO1 bez lokacije, bez zone „Zadnji deo“) već važe.

Jedino zastarelo mesto je tekst u `intake/…/DATA-NOTES.md`, „Blokatori“: JMEV 6, Foton 7, Mazda 8. To je istorija iz 8. 10., pre nego što je organizator popunio mapu. CSV i payload su ispravni (9 / 6 / 6), pa ga nisam menjao, jer je to Aleksin dokument.

### Koraci za Aleksu (PROD; ništa od ovoga nisam izvršio)

1. **Provera bez upisa:**
   ```bash
   npx convex run fairExhibitorImport:listStandsOffMap '{"eventCode":"elektromobilnost-2026"}' --prod
   npx convex run fairPublic:getEventMap '{"eventSlug":"elektromobilnost-2026"}' --prod
   ```
   - **Očekivano od `listStandsOffMap`:** samo AUTO1 na `zadnji-deo`.
   - **Očekivano od `getEventMap`:** isto što i tabela iznad:
     - JMEV na 9;
     - Grand Motors i AUTO MIG na 6;
     - Ferum/Yudo i Ferum BAW na 1A;
     - BENTU na 1B;
     - ScanMe i Enigma IT na 14;
     - bez dva štanda istog izlagača na istoj lokaciji.
2. **Ako postoje aktivna učešća `izl26-jmev`, `izl26-mazda`, `izl26-chery`, `izl26-foton`, `izl26-ferum-yudo` ili `izl26-bentu`** (duplikati intake-a), prvo pokrenuti probu:
   ```bash
   npx convex run fairExhibitorImport:reconcileSiteExhibitorsWithIntake '{"ownerEmail":"<admin e-mail>","eventCode":"elektromobilnost-2026","list":"elektromobilnost-2026","dryRun":true}' --prod
   ```
   Pregledati izveštaj, pa isto pokrenuti sa `"dryRun":false`. Učešće sa automobilom se ne povlači (`has_models`); o njemu odlučuje čovek.
3. **Ako je štand intake-a na pogrešnoj lokaciji**, ispraviti `mapLocationId` istog štanda (isti `externalKey`) kroz admin, bez novog štanda:
   - JMEV → `hala-9`;
   - Grand Motors i AUTO MIG → `hala-6`;
   - Ferum → `hala-1a`;
   - BENTU → `hala-1b`.
4. **Ako izlagaču sa sajta fali štand:** pokrenuti `fairExhibitorImport:placeSiteExhibitors` (idempotentno; preskočeno se prijavi sa razlogom).
5. **AUTO1:** štand na `zadnji-deo` može da ostane (mapa ga ne crta) ili da se povuče u adminu. Otvoreno pitanje je u `docs/tasks/BLOCKED.md`.
6. **Deploy:** prvo `npx convex deploy`, pa Vercel.
   - Nove su funkcije `fairHeat.getMapHeat`, `fairEventAnalytics.getEventAnalytics` i `getEventAudience`.
   - Šema se ne menja, a nove env promenljive nisu potrebne (`FAIR_GATEWAY_SECRET` već postoji).
   - Posle Vercel-a mapa je javna.
7. **Posle deploy-a proveriti:**
   - `https://scanme.rs/sajam` → mapa;
   - QR ulaznog panoa → mapa;
   - „Gde je gužva“ → prazno stanje dok danas nema bar 5 jedinstvenih skenova;
   - admin → Događaji → Analitika.

## Korak 2: doslednost (Garaža i Pasoši su referenca)

Referenca je izvučena metodom design-dna (faza 2, iz koda i izračunatih stilova na snimcima) i upisana u `FAIR-DESIGN-DNA.md` §0, zajedno sa izmenjenim redovima u §2, §9 i JSON-u.

**Primenjeno:**

- **Podloga strane:**
  - `--fair-canvas` je `#f7f8f8`; nov token je `--fair-canvas-glow`, sjaj akcenta 7 % gore desno, kao u garaži;
  - važi za mapu, model, Glas publike, anketu, deli i „nije pronađeno“;
  - deli je imao tvrdo kodiran crveni sjaj Auto Moto Festa i na Elektromobilnosti.
- **Kartice:**
  - kartice strane: `xl` 24, tiha ivica 1 px i senka 2 (hero i specifikacije modela, kartica pitanja, mapa, spisak, panel);
  - trake: `lg` 16 i senka 2 („Oceni model“);
  - režim ekrana ostaje bez senki.
- **Dugmad:**
  - `md` 12 za „Sačuvaj u garažu“ (bilo 16/18 i 1.5 px), akcije modela, zatvaranje sheet-a i nazad u toku;
  - sekundarna dugmad, ikonice, čipovi i kontrole mape imaju tihu ivicu, kao u garaži.
- **Prekidač zona na mapi:** izgleda kao jezičci garaže (traka `lg`, linija akcenta ispod izabrane zone). Indikator i dalje klizi.
- **Naslovi:**
  - deli i „nije pronađeno“ su kao „Moja garaža“;
  - pitanje Glasa publike i naslov sheet-a imaju težinu 760 (bilo 400).
- **Zaglavlje toka** (Glas publike): površina i linija preko cele širine, kao zaglavlje sajma.
- **Prazna stanja:** koraci u praznom panelu mape imaju pločice `accent-soft`/akcenat, kao prazna garaža.
- **Tokeni:** prelazi 160/260 ms `ease-out` na stranici modela su sada tokeni.
- **Ne menja se:**
  - ponašanje i sadržaj;
  - raspored i logika `?prikaz=ekran` (dobio je samo novu podlogu);
  - ScanMe zelena, koja je i dalje samo na ScanMe štandu i „Pronađi ScanMe“.

**Pasoš (`components/fair/passport/**`, Aleksino područje):** nije bilo nijedne izmene. Pasoš je već referenca. Spoljna podloga `.fair-event` sada ima istu boju kao njegova `.page`.

**Pregled nezavisnog subagenta:** videti odeljak „Provera“ na kraju.

## Korak 3: „Gde je gužva“

- **Prekidač:**
  - sa plamenom, prvi u redu sa filterima (`role="switch"`, `aria-checked`);
  - podrazumevano je isključen;
  - stanje i period se pamte za posetu (`sessionStorage`);
  - nema ga na režimu ekrana.
- **Izgled:** menjaju se samo boje.
  - Mek radijalni sjaj oko štandova sa aktivnošću je unapred iscrtan `radialGradient`, bez `filter: blur`. Ide plava → tirkizna → zelena → žuta → narandžasta → crvena; zelena je hladni smaragd, nije ScanMe zelena.
  - Štand dobija blagu nijansu, a osnova se utiša.
  - Nema brojeva ni bedževa. Logoi, brojevi štandova i ScanMe štand ostaju isti; ime bez logoa dobija svetao obris.
- **Pokret:**
  - sloj ulazi za 320 ms;
  - nove boje se pretapaju;
  - uz reduced motion promena je trenutna (provereno: trajanje 0).
- **Legenda** (ispod mape):
  - Danas / Poslednji sat;
  - traka manje → više;
  - „ažurirano pre X min“;
  - prazno stanje „Još nema dovoljno podataka“;
  - na telefonu se sklapa u dva kratka reda.
- **Normalizacija** (`lib/fair-heat.ts`, ista za javnu i admin mapu):
  - vrh perioda je ~95. percentil;
  - vrh je najmanje 8 (danas) ili 4 (sat), pa jedan sken nikad nije crven;
  - ispod 5 (danas) ili 3 (sat) jedinstvena skena ukupno → prazno stanje;
  - gama 0.75.
- **Podaci:**
  - `fairHeat.getMapHeat` čita postojeće brojače `scan_unique` po štandu, od granice 08:00 (`fairDayCountFrom`), bez admina;
  - bot nema sajamski kolačić, pa nema ni sajamski sken;
  - štandovi na istoj lokaciji se sabiraju (6);
  - javnost dobija samo nivoe 0–1, bez brojeva;
  - upit traži `FAIR_GATEWAY_SECRET`, pa ga zove samo Next server;
  - „poslednji sat“ = tekući sat ceo + prethodni sat ponderisan delom koji je još u 60 minuta.
- **Keš:** `GET /api/fair/heat/[eventSlug]` šalje `public, s-maxage=60, stale-while-revalidate=300` i drži odgovor 60 s u memoriji. To je jedan Convex poziv u minuti bez obzira na broj posetilaca, bez žive pretplate. Klijent čita na 60 s dok je prekidač uključen i stranica vidljiva.
- **DEV provera:**
  - na TEST događaju (`/sajam/test-elektromobilnost-2026`) napravljeno je 16 posetilaca i 36 pravih skenova kroz `/r`;
  - toplota: hala-12 = 1, ispred-14 = 0.54, ispred-18 = 0.22;
  - pravi DEV događaj nema dodeljene QR kodove, pa prikazuje prazno stanje.

### Predlog za režim velikih ekrana (nije urađeno)

- **Kada:** na ekranima toplota „Danas“ ide sama, bez prekidača (ekran je pasivan), i samo kad ima dovoljno podataka.
- **Koliko često:** svaki treći slot rotacije, 12 s, uz isto pretapanje kao rotacija.
- **Legenda:** u donjoj traci, „Gde je gužva: manje → više“.
- **Bez brojeva i bez bedževa;** brojevi štandova ostaju veliki.
- **Podaci:** ista keširana ruta, pa ekrani ne povećavaju broj Convex poziva.

## Korak 4: admin analitika

**Gde:** `/admin/dogadjaji/<slug>/analitika`, grupa „Sajam“; ista sekcija postoji u dev pregledu sa TEST brojkama.

**Sadržaj:**

- **KPI:** skenovi, jedinstveni po modelu, jedinstveni posetioci (danas i ceo sajam), leadovi, Glas publike, ankete, pečati i završeni pasoši, deljenja. Uz to ide „Šta koji broj znači“.
- **Grafikoni** (SVG, bez biblioteke, dataviz pravila, boje prošle validator):
  - skenovi po danu;
  - skenovi po satu od 08:00 (izbor dana), sa „Prikaži kao tabelu“.
- **Rang modela i štandova:** skenovi, jedinstveni, posetioci, leadovi, konverzija, glasovi, ocena.
- **Admin toplotna mapa:** ista skala kao javna, tačan broj na štandu, a udeo na tap/hover i u listi.
- **Uređaji:**
  - telefon, tablet, računar; botovi su izdvojeni;
  - `deviceCategory` nema sistem, pa **iOS i Android nisu razdvojeni**: to bi tražilo izmenu `/r`, što je van granica ovog zadatka. To piše i na ekranu.
- **Izvoz:** CSV (BOM, zaštita od formula).

**Pravila:**

- pristup samo admin (`requireAdmin`, `fairAuthz`);
- osvežavanje na dugme i samo na 60 s dok je kartica vidljiva, bez žive pretplate.

## Korak 5: brojke

### Šta znači koji broj

| Broj | Izvor | Definicija |
|---|---|---|
| Skenovi | `fairScanEvents` bez admina od granice = brojač `scan_total` | svako skeniranje |
| Jedinstveni po modelu | redovi `fairUniqueScans` od granice = brojač `scan_unique` | jedan posetilac × jedan model |
| Brojač štanda (`scan_unique:stand`) | zbir jedinstvenih po modelu štanda | posetilac sa 2 modela istog štanda = 2 |
| Jedinstveni posetioci | različiti `visitorId` u tim redovima | jedan telefon = 1 |
| „Pre-event podaci“ (Pregled) | redovi pre granice 9. 10. 08:00 | samo ono što bi reset obrisao |

### Šta je Jovan video

- 33 reda u `fairUniqueScans` posle 12:00 su pravi skenovi sajma.
- Kartica „Pre-event podaci“ broji samo ono pre 08:00, pa je „1 sken“ tačno.
- U Pregledu tih 33 stoji kao „jedinstveni po modelu“.

### Provera

- **U kodu:** `fairDashboard` sabira brojače štanda od granice. Analitika sabira brojače modela, isto od granice. Svaki sken pomera oba istovremeno, pa su zbirovi jednaki.
- **Na DEV-u** (TEST događaj), Pregled = Analitika = redovi u bazi:
  - skenovi 36 = 36 = 36;
  - jedinstveni po modelu 36 = 36 = 36;
  - posetioci 15;
  - 12 starijih redova (3–4. 10.) su pre granice i nigde se ne broje.
- **Računskih grešaka nema.** Ispravljeno je imenovanje:
  - Pregled sada piše „ceo sajam {n} · jedinstveni po modelu {n}“. Ranije je pisalo „ukupno · jedinstveni“ ispod naslova „danas“, što je mešalo dan i ceo sajam.
  - „Jedinstvena skeniranja po posetiocu“ (pre-event i brisanje) sada je „Jedinstveni skenovi (posetilac i model)“.
- **Test:** `convex/fairEventAnalytics.test.ts` proverava:
  - Pregled = Analitika = redovi;
  - pre-event i admin su isključeni;
  - brojač štanda je 3, a posetioci štanda 2;
  - dani i sati daju isti zbir.

### Kako Jovan sam proverava u produkciji

1. Admin → Događaji → Elektromobilnost → **Analitika**:
   - „Skenovi · ceo sajam“;
   - „Jedinstveni po modelu · ceo sajam“;
   - „Jedinstveni posetioci“.
2. Admin → **Pregled** → kartica „Skenovi“: hint „ceo sajam X · jedinstveni po modelu Y“ mora biti isti kao u Analitici.
3. Baza (samo čitanje), granica je `1791525600000` (9. 10. 08:00):
   ```bash
   npx convex data fairUniqueScans --prod --limit 5000 --format jsonLines
   ```
   - redovi sa `firstScannedAt ≥ 1791525600000` za `eventId` Elektromobilnosti daju „Jedinstveni po modelu“;
   - različiti `visitorId` u njima daju „Jedinstvene posetioce“.
   ```bash
   npx convex data fairScanEvents --prod --limit 5000 --format jsonLines
   ```
   - redovi sa `occurredAt ≥ 1791525600000` i bez `isAdminExcluded: true` daju „Skenove“.

## Redosled deploy-a i trošak

1. **Convex:** `npx convex deploy`. Funkcije su nove, šema je ista.
2. **Vercel:** posle Convex-a. Tada je mapa javna.

**Trošak u minutu:**

| Šta | Koliko | Čitanja po pozivu |
|---|---|---|
| Javna toplota | 1 poziv po događaju (CDN `s-maxage=60` + memorija instance), bez obzira na broj posetilaca | ~5 štandova sa modelima × (≤17 satnih + 2) ključa × ≤8 šardova ≈ ≤800 dokumenata |
| Admin analitika | 2 upita po otvorenoj i vidljivoj admin kartici | `getEventAnalytics` ≈ 15 modela × 36 ključeva + satna serija ≈ nekoliko hiljada malih dokumenata; `getEventAudience` je ograničen (≤5000 jedinstvenih, ≤1500 skenova za uređaje, ≤2500 pečata) |

Nema pretplata, pa sken ne pokreće ponovna izvršavanja kod posetilaca ni u adminu.

## DEV podaci napravljeni tokom rada (samo `expert-pelican-136`)

- **TEST događaj** `test-elektromobilnost-2026`: 16 anonimnih posetilaca i 36 skenova kroz `/r` (kodovi `0HENT03A`, `0D92RHQZ`, `W8DDX3AT`, `BJWQRW7E`, `V3YW6S16`, `1H4Z6AFB`), sa pečatima koje ti skenovi daju.
- **Pravi DEV događaj:** jedna deljena kolekcija (`L4UJ9M5ZRdPL6c6zd-qTax-B`) za snimke strane „deli“.
- **Admin upiti** su na DEV-u pozvani preko `npx convex run --identity` (samo čitanje).

## Snimci

Snimci su u `tmp/sajam-super-2026-10-09/snimci/` (ne commituju se):

- `pre/` — pre Koraka 2 (mapa odmah posle Koraka 1);
- `posle/`;
- `k2/`, `k3/`, `k4/` — međukoraci.

## Provera

| Provera | Rezultat |
|---|---|
| tsc | 0 grešaka |
| lint | 0 grešaka. 2 stara upozorenja (`components/admin/venue-admin.tsx`, `convex/purchaseLifecycle.test.ts`), nisu iz ovog rada |
| ceo suite (`vitest run`, `--maxWorkers=4`) | 262 fajla prolaze, 2 preskočena; 2366 testova prolazi, 2 preskočena (pre rada: 2337) |
| `vitest run fair` | 85/85 fajlova, 726 testova (pre rada: 80 / 702) |
| build (`next build`) | prolazi |
| impeccable detektor | u izmenjenim fajlovima nema nalaza. Dva stara pravila su iz Aleksinih redova: `side-tab` na statusu forme u sheet-u (`518b32e`) i `transition: width` na zvezdicama (`b177729`); nisu dirana |
| snimci | `tmp/…/snimci/posle/`: 25 snimaka, bez horizontalnog skrola i bez grešaka u konzoli |

**Napomena o testovima:** na ovoj mašini, uz `next dev` od 2,3 GB i oko 3,5 GB slobodne memorije, `vitest run fair` sa podrazumevanim brojem radnika pada na rok od 5 s (Convex testovi traju 144 s umesto 20 s). Sa `--maxWorkers=4` sve prolazi. Pad koji je ostao sam od sebe je ponovo pokrenut sam i prošao je.

**Usput ispravljen test:** `lib/fair-map/map-guards.test.ts` (`cc78a89`) dozvoljava jedino keširano čitanje toplote. Sve ostale zabrane važe i dalje: bez upisa, bez pretplate, bez rute i bez drugih tajmera.

### Nezavisni pregled doslednosti (subagent koji nije video rad)

**Prva runda.** Presuda je bila „uglavnom“. Ispravljeno je u `e15d9cf`:

- bež okvir platna mape;
- zaglavlje koje nije pratilo kolonu sadržaja (mapa, deli);
- natpis i X u anketi.

„Isprani“ bočni paneli nisu bili greška aplikacije. Snimanje cele strane menja visinu prozora i ponovo pokreće `@starting-style` ulaz; skripta za snimke sada prikazuje krajnja stanja.

**Svesno nije menjano:**

| Šta | Zašto |
|---|---|
| Plavo „Sačuvaj u garažu“ | Primarna radnja je akcenat, kao „Otvori mapu“ u praznoj garaži; crno je dugme-alat („Pogledaj“) |
| Zaglavlje toka Glasa publike | Struktura toka, ne izgled |
| Footer na deli | Sadržaj |
| TEST oznake na mapi („0/2“, „Izdvojeni štand“) | Pasoš i rotacija TEST događaja |
| Sjaj štanda 12 koji seče ivica plana | Štand je na ivici mape |
| Skraćen placeholder pretrage na telefonu | Postojeći dizajn reda |
| Admin navigacija | Nije sajamska strana |

**Potvrda.** Stavke su rešene. Presuda: „**da**, sajamske strane sada izgledaju kao Garaža i Pasoši“. Jedini novi nalaz (logo mape na telefonu pomeren 4 px) ispravljen je u `364a45d`.
