# ADMIN v2: izveštaj lanca i beleška koraka X7

Lanac je radio 11–12. 10. 2026. na grani `codex/jovan-admin-v2-2026-10-11` (osnova `fa6656f3`, od `aleksa/main`). Zadatak je `tmp/admin-v2-2026-10-11/ZADATAK.md` (privatan, nije u repou).

**Šta je admin sada:** jedan trajni okvir (sidebar preko cele visine, navbar bez pozadine, ekran kao jedini skrol), jedan kontekstualni sidebar sa harmonikom filtera i stanjem u URL-u na svim listama, Analitika v2 sa 11 delova i 3D mapom hale, blaga gamifikacija (misije, HUD, odometar, rekordi, prečice, tihi režim), tekst bez programerskog jezika. Trajni standard je `docs/admin/DASHBOARD-STANDARD.md`.

**Šta lanac nije radio:** prijavu na pravi `/admin`, produkciju, deploy, izmenu šeme, javni sajam. Sve je provereno testovima i na `/dev/admin-*-preview` rutama sa TEST podacima.

## 1. Šta je urađeno, po koracima

| Korak | Commit | Šta | Beleška |
|---|---|---|---|
| X0 | `0f397ed` | Plan i dve nezavisne kritike zatečenog admina (Nielsen 20 od 40). Bez izmena koda. | `docs/admin/v2/X0-PLAN.md` |
| X1 | `56289b0` | Trajni layout, okvir (sidebar, navbar, ekran, fioka), registar sidebara, harmonika, URL stanje, tokeni; Događaji kao referentna oblast; recept. | `docs/admin/v2/X1.md`, `docs/admin/ADMIN-V2-ARHITEKTURA.md` |
| X2 | `32ab4f2` | Sve ostale liste u sidebar: Dashboard, Klijenti, Profil klijenta, Inbox, Zadaci, Proizvodi, QR kodovi, Porudžbine, Usluge, Finansije, Tim, Pretraga, Podešavanja, Pošta. | `docs/admin/v2/X2.md` |
| (paketi) | `390edcb` | `three` i `@types/three`, instalirao runner. | — |
| X3 | `d1e6f61` | Analitika v2 (11 delova), dva nova Convex upita samo za čitanje, paleta grafikona, 3D toplotna mapa, fixtures u obliku pravog sajma. | `docs/admin/v2/X3.md` |
| X4 | `e9383b5` | Misije sa napretkom, HUD „Danas“, odometar, medalje, rekordi, prečice, tihi režim; pokret (prelaz stranice, FLIP, čipovi). | `docs/admin/v2/X4.md` |
| X5 | `65070d0` | Rečnik i tekst na svim stranicama, jedan oblik praznog stanja, greške i učitavanja, naslovi u pregledaču. | `docs/admin/v2/X5.md`, `docs/admin/v2/RECNIK.md` |
| RX | `e61742f` | Nezavisni pregled: presuda „treba dorada“, 3 visoka, 8 srednjih i 15 niskih nalaza. Bez izmena koda. | `docs/admin/v2/RX-PREGLED.md` |
| X6 | `3ccc5d3` | Svih 26 nalaza ispravljeno, uz test ili proveru u pregledaču. | `docs/admin/v2/X6.md` |
| X7 | (ovaj korak) | Standard, ovaj izveštaj i preporuke za Auto Moto Fest. Samo dokumenta. | odeljak 7 |

**U brojevima** (do X6, `scripts/tasks/logs/admin-v2/LANAC-stat.txt`): 331 izmenjen fajl, 29.267 dodatih i 4.569 uklonjenih redova. Testovi: sa 262 fajla i 2.370 testova pre lanca na 335 fajlova i 3.421 test; nijedan nije isključen ni oslabljen. Lint: ista dva zatečena upozorenja pre i posle.

**Kako je teklo.** X1, X2 i X3 su prošli tek iz više pokušaja. Razlog nije bio kod: provera cilja u sesiji je tražila stvari koje pravila lanca zabranjuju (prijavu na pravi `/admin`, `harness:check` od koraka). Runner je uslov ispravio, a tok je zapisan u `docs/tasks/BLOCKED.md` (unosi „ADMIN v2 X1“ do „X4“, svi označeni kao rešeni). X4 je jednom prekinut jer je neko van lanca radio u istom folderu.

### Po oblastima

- **Okvir** (`components/admin/frame/`): `app/admin/layout.tsx` crta `AdminGuard` i `AdminFrame` jednom. Iz 19 stranica su skinuti sopstveni čuvar i okvir; URL-ovi su isti; `/admin/login` i Links editor su bez okvira. Zaštita je ista kao pre (test `admin-frame-gate.test.tsx`; pravi `/admin` bez prijave vodi na `/admin/login`).
- **Sidebar** (`lib/admin-v2/sidebar/`): jedan komponent, konfiguracija po ruti, podaci sa stranice preko `useAdminSidebarLive`. Nijedna lista više nema filter blok iznad sadržaja.
- **URL stanje** (`lib/admin-v2/query/`): filteri, pogledi, pretraga i sortiranje su u adresi. Upiti dobijaju iste argumente kao pre (X2: 218 izbora na pravim komponentama, 0 različitih).
- **Tabele** (`components/admin/admin-ui/admin-table-scroll.tsx`): skroluju sa ekranom, zaglavlje je sticky, prelomi prate širinu liste.
- **Analitika** (`components/admin/events/analytics/`, `lib/admin-v2/analytics/`): brojevi sa trendom, uvidi, levak, dubina, pasoš, dan × sat, rang modela sa detaljem, rang štandova, paketi, mapa 2D i 3D, uređaji. Svaki grafikon ima pitanje, tabelu i tooltip.
- **Backend:** samo dva nova admin upita, `getEventEngagement` i `getModelAnalytics` (`convex/fairEventAnalytics.ts`), pušteni na DEV. Šema i postojeći upiti nisu menjani.
- **Gamifikacija** (`lib/admin-v2/missions.ts`, `hud.ts`, `odometer.ts`, `shortcuts.ts`, `quiet-mode.ts`, `analytics/records.ts`).
- **Tekst** (`lib/i18n/sr/admin*.ts`): test `lib/admin-v2/text-vocabulary.test.ts` čita 21 rečnik i pada na zabranjen izraz.

## 2. Odluke

Svaka je zapisana u belešci svog koraka, sa razlogom. Ovde su one koje menjaju kako se admin koristi ili odstupaju od zadatka.

**Odstupanja od zadatka (za potvrdu vlasnika)**
1. **Aktivna stavka navbara u svetloj temi je `#2f6d23`, ne `#6fc05d`.** Zelena `#6fc05d` kao tekst na svetloj podlozi ima kontrast 2,08:1. Linija ispod je `#6fc05d` u obe teme. Vraćanje je izmena jednog tokena (`--admin-nav-current`).
2. **Angažovani u levku su bez pečata i garaže.** Pečat nastaje sam pri skenu, a garaža nema zapis na serveru.
3. **3D mapa nema instanced mesh.** Štandovi su nepravilni poligoni; svaki je svoj mesh. Na sajmu ih je manje od 40.
4. **Angažovanje se osvežava na 5 minuta**, ostali brojevi na 60 s. Tekst na ekranu to kaže.
5. **Brojevi uz poglede i opcije postoje samo gde ih stranica već ima** (Događaji, Tim, Zadaci). Ostale liste filtrira upit, a novi upiti nisu deo zadatka.

**Okvir i sidebar**
6. Trajni layout je `app/admin/layout.tsx`, bez route group: nijedan fajl se ne seli, pa spajanje sa `main` ostaje lako.
7. Filteri pišu URL preko `history.replaceState`, bez odlaska na server.
8. „Poveži nalepnicu“ postoji samo u zaglavlju ekrana, ne i u navigaciji.
9. Finansije i Pošta su u sidebaru, zbog doslednosti. Pretraga Pošte se piše na Enter, jer je svaka pretraga poziv Zoho-u.
10. Na sekcijama Događaja sa filterima navigacija sekcija je jedna sklopljena grupa („Sekcija · Modeli“), da pretraga ostane iznad preloma.
11. Sticky zaglavlje i vodoravni skrol se isključuju: tabela koja ne staje dobija vodoravni skrol i gubi sticky zaglavlje. Zato tabele staju na 56 rem.

**Analitika**
12. 3D je napravljen kao prekidač, 2D je podrazumevan. Visina je broj skenova, boja gužva. Retko kaže više od 2D.
13. Pasoš se meri ljudima (posetioci sa pečatom → završeni pasoši), ne pečatima.
14. Paketi uvek nose „korelacija, ne uzrok“; paket sa jednim modelom nije prosek.
15. Fixtures: zbirni brojevi celog sajma su pravi, brojevi po modelu, štandu i izlagaču izmišljeni, imena neutralna TEST imena. Provera u X6: 0 poklapanja sa uzorkom.

**Gamifikacija**
16. Jedinica napretka je misija i piše u tekstu. Napredak se pamti po danu u pregledaču.
17. Zatečeno stanje, promena obima i smena faze nisu rešen posao.
18. Rekord sata se javlja jednom po satu, ne na svaki poll.
19. HUD postoji samo dok sajam traje; star podatak ne piše „Uživo“.
20. Tihi režim gasi potvrde, proslave i toastove; brojevi i napredak ostaju.

**Tekst i kontrole**
21. Jedno primarno dugme (`adminPrimaryButtonClass`); CSS pravilo po podstringu je obrisano u X6.
22. Šifre izmena i imena sistema nisu u vidljivom tekstu; idu u tooltip.

## 3. Snimci pre i posle

Snimci nisu u repou. Runner ih čuva u `scripts/tasks/logs/admin-v2/snimci/`, koraci u `output/playwright/admin-v2/<KORAK>/` (git ih ignoriše).

### Skupovi runnera (1280 i 390, svetla tema; isto ime fajla pre i posle)

| Skup | Fajlova | Rute |
|---|---|---|
| `snimci/baseline/` (**pre lanca**) | 28 | Dashboard, Klijenti, Inbox, Zadaci, Porudžbine, Proizvodi, QR, Usluge, Finansije, Tim, Podešavanja, Događaji: Pregled, Modeli, Analitika |
| `snimci/X1-a4/` | 10 | Dashboard, Klijenti, Pregled, Modeli, Analitika |
| `snimci/X2-a2/` | 22 | svih 11 lista van Događaja |
| `snimci/X3-a5/` | 4 | Analitika, Pregled |
| `snimci/X4-a2/` | 8 | Dashboard, Zadaci, Analitika, Pregled |
| `snimci/X5-a1/` | 12 | Dashboard, Zadaci, Finansije, Podešavanja, Modeli, Analitika |
| `snimci/X6-a1/` (**posle lanca**) | 14 | Dashboard, Klijenti, Zadaci, Porudžbine, Pregled, Modeli, Analitika |

Par pre / posle je isto ime fajla u `baseline/` i u poslednjem skupu koji tu rutu ima, na primer `dev_admin-tasks-preview-1280-svetla.png`. Za Inbox, Proizvode, QR, Usluge, Finansije, Tim i Podešavanja poslednji skup runnera je `X2-a2/` ili `X5-a1/`; završno stanje tih ruta je u `output/playwright/admin-v2/X6/kraj/`.

### Skupovi koraka

| Putanja | Šta je |
|---|---|
| `output/playwright/admin-v2/X6/kraj/` | **Završno stanje:** 14 ruta × 1440, 1280, 1280×720, 390, 360 × obe teme = 140 snimaka, 0 problema |
| `output/playwright/admin-v2/X2/staro/` | Stari UI iz osnove (`staro-<stranica>-1280.png`, devet stranica) i parovi `uporedi-<stranica>-staro.png` / `-novo.png`, `povezano-<stranica>-staro.png` / `-novo.png` |
| `output/playwright/admin-v2/X5/pre/`, `X5/posle/` | Dashboard, Zadaci, Modeli, Analitika pre i posle rada na tekstu (1440 i 390) |
| `output/playwright/admin-v2/X1/` | Okvir, harmonika, fioka, sticky zaglavlje; `kontakt/` sa 22 kontakt lista |
| `output/playwright/admin-v2/X2/kraj/`, `zavrsno/`, `posta/` | Sve liste posle selidbe u sidebar; Pošta u tri stanja |
| `output/playwright/admin-v2/X3/delovi/`, `provere/`, `dokaz/` | Svaki deo Analitike posebno; 3D, rezerva bez WebGL-a, detalj modela |
| `output/playwright/admin-v2/X4/provere/`, `video/` | Misije, „Sve čisto“, prečice, toast; tri video snimka prelaza |
| `output/playwright/admin-v2/X6/provere/`, `fioka/`, `dugmad/`, `navbar/` | Dokazi za nalaze RX |

### Tri para pogledana u ovom koraku

| Ruta | Pre (`baseline/`) | Posle (`X6-a1/`) |
|---|---|---|
| Zadaci, 1280 | Navbar u piluli sa zelenom popunom aktivne stavke; „Tim“ odsečen. Iznad tabele 5 tabova, pretraga i 4 selecta. Značka „DEV pregled“ i „ADMIN-10 interfejsa“. | Sidebar sa pogledima i brojevima („Danas 2“, „Kasni 1“), pretragom, četiri grupe filtera i „Misije danas“; HUD na dnu. Navbar je tekst, aktivna stavka zelena sa linijom, „Ctrl K“. Tabela počinje odmah ispod naslova. „Probni prikaz · nisu stvarni podaci“. |
| Analitika, 1280 | Navigacija sekcija kao kartica u ekranu; H1 je naziv događaja; veliko „Poveži nalepnicu“; osam brojeva u mreži bez trenda. | Sekcije u sidebaru; H1 „Analitika“, akcije desno u redu sa naslovom; „Koliko je danas i kuda ide?“ sa trendom po danu; „Leadovi 0“ označeni kao problem; Uvidi odmah ispod. |
| Modeli, 390 | Pilule sekcija koje se seku, pretraga i tri filtera pre prvog reda liste; lista počinje ispod prvog ekrana. | Gornja traka sa menijem; „Filteri“ i „Poveži nalepnicu“ u jednom redu; prva kartica modela na prvom ekranu. |

Ostali snimci nisu ponovo gledani u ovom koraku; o njima govore beleške koraka koji su ih pravili.

## 4. Uputstvo za korišćenje

### Prečice

| Tasteri | Šta radi |
|---|---|
| **Ctrl K** | Pretraga celog admina (paleta). Radi i dok je fokus u polju. |
| **G** pa **D** | Dashboard |
| **G** pa **K** | Klijenti |
| **G** pa **I** | Inbox |
| **G** pa **Z** | Zadaci |
| **G** pa **E** | Događaji |
| **G** pa **F** | Finansije |
| **/** | Pretraga stranice u sidebaru. Na stranici bez pretrage otvara paletu; na telefonu otvara fioku na filterima. |
| **?** | Lista prečica (i u meniju profila) |
| **Esc** | Zatvara najbliži sloj: tooltip, grupu filtera, dijalog, fioku |

- Posle G drugo slovo se čeka 1,5 s.
- Prečice sa jednim tasterom ne rade dok kucaš u polju ni dok je otvoren dijalog ili meni.
- Hint je u tooltipu stavke navbara („Klijenti (G K)“).

### Filteri

- Filteri, pogledi, pretraga i sortiranje su u sidebaru. Izbor važi odmah.
- Otvorena je jedna grupa; grupa sa više od 7 opcija ima polje za pretragu.
- Tastatura: Enter ili Space otvara grupu, strelica nadole ulazi u opcije, Escape zatvara.
- **Adresa nosi filtere:** link se može poslati kolegi, Back vraća listu sa filterima, osvežavanje ih čuva.
- Čip uklanja jedan filter; „Očisti sve“ uklanja pretragu i sve filtere, a pogled i sortiranje ostaju.
- Na telefonu: dugme „Filteri (N)“ u zaglavlju stranice.

### Tihi režim

- Prekidač je u meniju profila; na telefonu u podnožju fioke (ikonica).
- **Gasi:** potvrdu rešene misije, proslavu „Sve čisto“ i toastove o rekordima.
- **Ne gasi:** brojeve, napredak misija, odometar, značke. To je informacija.
- Pamti se u pregledaču, po uređaju. Ostali tabovi istog pregledača ga prate.

### Misije i HUD

- **„Misije danas“** su u sidebaru Dashboarda i Zadataka i uz „Šta treba da uradim“ na Pregledu događaja. Krug pokazuje koliko je misija rešeno danas.
- Napredak je po pregledaču: drugi uređaj ima svoj. „4+“ znači da upit vraća samo prvih nekoliko stavki.
- **HUD „Danas“** je na dnu sidebara dok sajam traje: dan, traka dana, „Uživo“, skenovi danas. „Podatak od 14:32“ znači da se čitanje nije obnovilo duže od 3 minuta.

### Analitika

- Događaji → Analitika. „Na ovoj strani“ u sidebaru skače na deo.
- Klik na model u rangu otvara detalj; adresa dobija `?model=`, pa se detalj može podeliti.
- Mapa hale: prekidač 2D | 3D. U 3D prevlačenje okreće, točkić zumira, „Vrati pogled“ vraća početak.
- Svaki grafikon ima „Prikaži kao tabelu“. „Izvezi CSV“ je u zaglavlju.
- Brojevi se osvežavaju svakog minuta dok je tab vidljiv, angažovanje na 5 minuta; „Osveži“ čita odmah.

### Tema

Dugme teme je u navbaru od 1280 px; na užem prozoru je stavka „Tamna tema“ u meniju profila.

### Za razvoj

- Probni prikazi bez prijave: `/dev/admin-*-preview`, `/dev/admin-events-preview/<sekcija>`, trajni okvir na `/dev/admin-okvir-preview/<oblast>`, stanja čuvara na `/dev/admin-cuvar-preview/<stanje>`.
- `?faza=dan3` na Pregledu događaja prikazuje poslednji sajamski dan; `?uzivo=<korak>` simulira sledeći poll (Analitika i Pregled).
- Nova stranica ide po receptu `docs/admin/ADMIN-V2-ARHITEKTURA.md`, odeljak 5.

## 5. Otvorene stavke

### Za vlasnika

1. **Pregled pravog `/admin` posle prijave.** Lanac se nije prijavljivao. Vredi proći: Dashboard → Klijenti → filter → profil → Back; Zadaci sa klijentom i lokalom; Proizvodi → lokal → Back; Događaji → Analitika, detalj modela, 3D; `/admin/zadaci?assignee=abc` (očekivano: lista bez filtera); u mreži da Modeli ne učitavaju chunk Analitike; Pošta sa pravim nalogom.
2. **Potvrda odstupanja** iz odeljka 2 (tačke 1–5).
3. **Delta za Aleksu** o dva nova Convex upita treba da ode u `docs/events/sajam-automobila-2026/FRONTEND-DELTA-<datum>.md`. Tekst je spreman u `docs/admin/v2/X3.md`, odeljak 7; lanac taj fajl nije smeo da piše.
4. **Alat za snimke** (`scripts/admin-v2/alati/snimi.mjs`) meri prelivanje prozora, a prozor u novom okviru nikad ne skroluje, pa `prelivanje` uvek daje `false`. Treba meriti `main[data-admin-frame="screen"]`.
5. **Nestabilan test van lanca:** `convex/adminMail.test.ts` („a wrong key…“) pada otprilike jednom u 64 pokretanja, zbog samog testa (`docs/admin/v2/X1.md`, odeljak 6). Može nasumično da obori gejt.
6. **Ručni rad u folderu dok lanac traje** se sudara sa runnerom (`docs/tasks/BLOCKED.md`, „ADMIN v2 X4“).
7. **Fixture imena van Događaja** („Bistro Most“, „Hotel Vrbak“…) nisu TEST imena. Zatečeno; testovi zavise od njih.
8. **Koren aplikacije učitava 13 familija fontova** na svakoj stranici (zatečeno, van opsega).

### Za backend (Aleksa)

1. **`getEventAnalytics` i granica od 4.096 opsega indeksa** na većem sajmu; granice čitanja u `getEventEngagement` nisu slučajan uzorak. Detalji i predlog: `docs/events/sajam-automobila-2026/AMF-PREPORUKE-IZ-PODATAKA.md`, odeljak 8.
2. **„Skenovi danas“** u HUD-u i na Pregledu dolaze iz `getEventDashboard`, na Analitici iz `getEventAnalytics`; treba potvrditi da broje isto. Trošak HUD čitanja nije izmeren.
3. **Misije Dashboarda** zavise od ograničenja upita (`adminTasks.dashboardAdapter` vraća do 4 zadatka po grupi); tačan broj traži brojač.
4. **Odložena stavka se broji kao rešena**, jer podaci ne kažu zašto je broj pao.
5. **Garaža** nema brojač na serveru; **posetioci po danu** se računaju iz jedinstvenih skenova; **stabilna boja izlagača** traži id izlagača u `getEventAnalytics`.
6. **Dubinski link `?venue=<id>`** na lokal van prve stranice liste lokala ne nalazi lokal (granica postojala i pre).
7. **Brojevi uz poglede** van Događaja traže nove upite.
8. `convex/adminOrderMigrations.ts` vraća poruke sa servera u starom jeziku; rečnik porudžbina je prepisan, server nije menjan.

### Poznata ograničenja

- Izjednačeni modeli ili štandovi dobijaju različita mesta i medalje (redosled po šifri).
- Usluge uz panel „Izaberi lokal“ prikazuju tabelu tek od oko 1640 px; ispod toga sažete redove.
- Napredak misija je po pregledaču, ne zajednički za tim.
- Značka „Prvi lead“ može da kasni do 5 minuta za toastom.
- FLIP se ne radi preko 80 redova; poslednji čip nestaje bez izlazne animacije.
- Niz „G pa slovo“ nema vidljiv znak da čeka slovo.
- Boja izlagača u rangu štandova zavisi od skupa izlagača: nov izlagač usred sajma pomera boje.
- Stranica greške u okviru (`app/admin/error.tsx`) i lenjo učitavanje Analitike su dokazani testom i čitanjem koda, ne u pregledaču (postoje samo na pravom `/admin`).
- Iz X5: rezervni prikaz sirove vrednosti kad nema prevoda (Porudžbine, Finansije, profil klijenta); „—“ u prikazu podrške; oznaka „Moje“ na Dashboardu; nekoliko ključeva rečnika bez upotrebe; tooltip uz kolonu „Ispravnost“ nije dodat.
- `components/fair/admin/fair-admin-tools.tsx` ispisuje „PROD/DEV“; fajl je u zabranjenoj putanji.

## 6. Fajlovi van dozvoljenih putanja, ceo lanac

| Fajl | Koraci | Razlog |
|---|---|---|
| `lib/i18n/types.ts` | X1–X6 | AGENTS.md traži da svaki novi tekst ima ključ u `Dict` interfejsu, a interfejsi su samo u ovom fajlu. |
| `convex/fairAuthz.test.ts` | X3 | Test drži tabelu zaštite svih fair funkcija; dva nova upita su upisana kao admin funkcije. |
| `lib/i18n/sr/communications.ts` | X5 | Jedna vrednost: značka probnog prikaza Inboxa („Razvojni prikaz ADMIN-08“). |

Zabranjene putanje nisu dirane ni u jednom koraku. `package.json` i `package-lock.json` je menjao samo runner (`three`, `@types/three`).

## 7. Beleška koraka X7

### Šta je urađeno i gde

| Fajl | Šta je |
|---|---|
| `docs/admin/DASHBOARD-STANDARD.md` | Trajni standard: okvir, sidebar i harmonika (pravila 1 otvorena i 7 opcija), tabele, grafikoni i paleta sa tačnim bojama, pokret (tokeni), gamifikacija (da i ne), tekst, pristupačnost, performanse, provera, i šta važi za aplikaciju posetilaca. |
| `docs/admin/v2/IZVESTAJ.md` | Ovaj fajl. |
| `docs/events/sajam-automobila-2026/AMF-PREPORUKE-IZ-PODATAKA.md` | Preporuke za Auto Moto Fest: nula leadova, 1,48 skena po posetiocu, pasoš, Glas publike i ocene, vikend i sati gužve, paketi, metrike sa ciljevima, nalazi za backend, kontrolna lista. |

Kod nije menjan. Očita greška u tekstu nije nađena.

### Odluke i razlozi

1. **Standard opisuje ono što postoji u kodu.** Svaka boja, token i putanja su pročitani iz `app/globals.css`, `lib/admin-v2/motion.ts`, `lib/admin-v2/analytics/palette.ts`, `lib/fair-heat.ts` i komponenti, ne iz zadatka. Primer konfiguracije sidebara je iz `lib/admin-v2/sidebar/configs/clients.ts`.
2. **Standard ima odeljak za aplikaciju posetilaca** (šta važi, šta ne), jer je zadatak imenuje kao čitaoca. Vizuelni identitet te aplikacije ostaje njen (`EVENT-DESIGN-SYSTEM.md`).
3. **AMF preporuke su pisane uz čitanje koda javnog sajma** (`app/r/**`, `components/fair/**`, `convex/fair*.ts`, `lib/fair-*.ts`), jer se iz brojeva ne vidi zašto je nešto nula. Tok je istražio pomoćni agent koji samo čita; ključne navode sam potvrdio u kodu pre pisanja: prekidač `FAIR_LEADS_ENABLED`, prava po paketu, uslov pasoša, pečat pri skenu, redosled blokova na stranici modela, prag od pet glasova, odlaganje ankete, držanje od 1,3 s, granice čitanja.
4. **Glavni nalaz o leadovima je označen kao neproveren.** `PROD-GO-CHECKLIST.md` kaže da se prekidač leadova pred sajam ne postavlja. Stanje produkcije lanac ne sme da čita, pa dokument kaže „najverovatnije“ i stavlja proveru na prvo mesto.
5. **Bez brojeva po izlagaču, modelu i štandu.** Uz to nisu navedeni ni skenovi po modelu po paketu: svaki plaćeni paket je u uzorku bio premali da prosek paketa ne bi otkrio izlagača. Piše „višestruko više“ i prag iz pravila Uvida. Iz istog razloga dokument ne kaže koliko je pasoša postojalo.
6. **Dva broja su izvedena iz zbirova**, uz račun u tekstu: najmanje 61 % posetilaca sa jednim modelom (iz 310 posetilaca i 431 para) i manje od 8 % posetilaca sa nekom radnjom posle skena.
7. **Ciljevi u tabeli metrika su predlog, ne prognoza**, i tako piše iznad tabele. Polazna vrednost je Sajam elektromobilnosti.
8. **Tuđe odluke su otvorena pitanja**, ne preporuke: pravni tekst saglasnosti, rok javljanja izlagača, nagrada pasoša, nagradna igra, lead na besplatnom paketu, izmene backenda.
9. **`FRONTEND-DELTA` nije pisan.** Korak ne menja ništa na šta se integracija oslanja, a dozvoljena putanja u tom direktorijumu je samo fajl sa preporukama. Stavka je u odeljku 5.

### Fajlovi van dozvoljenih putanja

Nijedan. Sva tri fajla su u dozvoljenim putanjama koraka (`docs/admin/**` i `docs/events/sajam-automobila-2026/AMF-PREPORUKE-IZ-PODATAKA.md`). `docs/tasks/BLOCKED.md` nije menjan: nijedan problem iz okruženja se nije ponovio.

Samo čitano: `tmp/admin-v2-2026-10-11/**`, `scripts/**`, `convex/**`, `components/fair/**`, `app/r/**`, `lib/fair-*`, `docs/events/sajam-automobila-2026/*.md`.

### Provere

Korak ne menja kod. `tsc` i testovi su pušteni dva puta (posle standarda i posle sva tri dokumenta), lint jednom; izlaz je oba puta isti:

```
npx tsc --noEmit
  TSC_EXIT=0, bez drugog izlaza

npm test -- --testTimeout=30000 --hookTimeout=60000
  Test Files  335 passed | 2 skipped (337)
       Tests  3421 passed | 2 skipped (3423)

npm run lint
  ✖ 2 problems (0 errors, 2 warnings)
    components/admin/venue-admin.tsx 24:10  'useMemo' is defined but never used
    convex/purchaseLifecycle.test.ts 26:10  'price' is defined but never used
```

Isto kao posle X6 (335 fajlova, 3.421 test, ista dva zatečena upozorenja). `harness:check` i snimke pušta runner. Convex funkcije nisu menjane, pa `npx convex dev --once` nije pokretan.

Provera tri nova fajla skriptom iz komandne linije (samo čita): nijedno ime izlagača, brenda ili modela iz uzorka, nijedan broj po izlagaču, modelu ili štandu, bez razmaka na kraju reda, LF krajevi redova. `git status --short`: tri nova fajla, sva u dozvoljenim putanjama; nijedan praćen fajl nije izmenjen.

### Snimci

Novih snimaka nema: korak ne menja ništa što se vidi. Pogledano je šest postojećih snimaka runnera (tri para iz odeljka 3).
