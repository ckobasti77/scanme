# RX
PRESUDA: TREBA DORADA

Okvir, sidebar, Analitika v2 i gamifikacija su urađeni po zadatku i svi gejtovi su zeleni, ali postoje tri nalaza visoke ozbiljnosti: fioka na telefonu ostaje otvorena posle navigacije (§2), pretraga i filteri Događaja su ispod preloma sidebara (§3), a fixtures u javnom repou nisu dovoljno udaljeni od pravih podataka.

## 1. Kako je pregledano

- Tri nezavisna recenzenta: kritičar A (dizajn, Nielsen), kritičar B (audit), provera (kontrolna lista).
- Sam sam proverio regresije, javni repo, jezgro okvira, 3D i dvadesetak snimaka, i svaki visok i srednji nalaz recenzenata u kodu ili na snimku.
- Dev server u ovom koraku ne radi, pa novih snimaka nema. Nalazi o ponašanju označeni sa **(kod)** su potvrđeni čitanjem koda i nisu reprodukovani u pregledaču.
- Stanje posle X5 je snimljeno samo u svetloj temi na 1280, 1440 i 390. Tamna tema i 360 su poslednji put snimljeni u X4.
- Nielsen (kritičar A, 0–4): prosek 2,9. Najslabije su doslednost (2) i minimalizam (2), najjača je efikasnost (4).
- Recenzent provere je upisao svoj plan fajl van repoa; u repou ništa nije menjano.

## 2. Kontrolna lista §1–§10

| Tačka | Ispunjeno | Dokaz |
|---|---|---|
| §1 Jedno pitanje po ekranu, malo boja u okviru | DELIMIČNO | Analitika: 11 delova, svaki sa pitanjem (`components/admin/events/sections/analitika-view.tsx`). Sidebar Događaja je pretrpan (V2), ima duplikata (N1) |
| §1 HUD osećaj bez poena, nivoa i buke | DA | `components/admin/frame/admin-hud.tsx`, `components/admin/admin-ui/admin-missions.tsx`; nema zvuka ni konfeta |
| §1 Prelazi ≤ 250 ms, okvir ≤ 320 ms | DELIMIČNO | Tokeni u `lib/admin-v2/motion.ts`; sadržaj sidebara i odometar traju do 360 ms sa staggerom (N5) |
| §1 Teški delovi tek kad zatrebaju | DELIMIČNO | `three` je lazy (odeljak 4); grafikoni su u chunk-u rute Događaja (N8) |
| §2 Sidebar pune visine, logo, širina, skrol sa maskom | DA | `components/admin/frame/admin-sidebar.tsx:21-58`, `app/globals.css:361-379`, snimci `scripts/tasks/logs/admin-v2/snimci/X5-a1/` |
| §2 HUD „Danas“ na dnu | DA | `admin-sidebar.tsx:31` |
| §2 Navbar bez pozadine, aktivna zelena, linija klizi | DA, uz odstupanje | `components/admin/frame/admin-navbar.tsx:51-52,153-186,242`; u svetloj temi tekst je `#2f6d23` (X1, odluka 1) |
| §2 Meniji Operativa i Usluge isti | DA | Iste klase u `fa6656f3:components/admin/admin-shell.tsx:222-253` i `admin-navbar.tsx:217-238` |
| §2 Desno: pretraga, podešavanja, obaveštenja, tema, profil | DELIMIČNO | Od 1280 px sve; na 1024–1279 tema je nedostupna i linkovi su odsečeni (S1) |
| §2 Ekran: panel, max 1440, skroluje samo ekran | DA | `components/admin/frame/admin-screen.tsx:63-72`; `okvir.ok` u svih 56 snimaka runnera X1–X5 |
| §2 Tabele bez skrola u kutiji, sticky zaglavlje | DA | `components/admin/admin-ui/admin-table-scroll.tsx`, `app/globals.css:548-570` |
| §2 Zaglavlje: naslov levo, akcije desno, bez duplikata | DELIMIČNO | `components/admin/frame/admin-page-header.tsx`; „Poveži nalepnicu“ jednom; Analitika drži akcije van zaglavlja (S6) |
| §2 Telefon: gornja traka, fioka, „Filteri (N)“ | DELIMIČNO | `components/admin/frame/admin-drawer.tsx`; fioka se ne zatvara posle navigacije (V1), podnožje jede visinu (S2) |
| §2 Fioka: fokus zamka, Escape, prevlačenje, 44 px | DELIMIČNO | `admin-drawer.tsx:26,43-68`; fokus se ne vraća (S3), Escape u grupi zatvara fioku (N3) |
| §2 Trajni layout, URL-ovi, login bez okvira, AdminGuard | DA | `app/admin/layout.tsx`, `components/admin/frame/admin-frame-gate.tsx` i test; `admin-guard.tsx` i `proxy.ts` nisu menjani; Links editor ima svoj čuvar |
| §2 Dev preview isti okvir, ugovor data-atributa | DA | `components/admin/admin-shell.tsx`; logovi runnera: 56 snimaka, 0 problema |
| §3 Jedan komponent, registar, redosled blokova | DA | `components/admin/frame/admin-sidebar-view.tsx:75-233`, `lib/admin-v2/sidebar/registry.ts` |
| §3 Navigacija oblasti | DA | `lib/admin-v2/sidebar/configs/{events,operations,services,pages}.ts`; Podešavanja su „Odeljci“ (X2, odluka 8) |
| §3 Pogledi sa brojevima | DELIMIČNO | Pogledi su tačni; brojevi postoje samo u Događajima i Timu (X0, odluka 5: bez novih upita) |
| §3 Pretraga uvek vidljiva, van harmonike | DELIMIČNO | Van harmonike jeste; u Događajima je ispod preloma (V2) |
| §3 Harmonika, prag 7, izbor odmah, URL | DA | `lib/admin-v2/sidebar/accordion.ts` i test, `components/admin/frame/admin-search-select.tsx`, `components/admin/admin-ui/use-admin-query-state.ts` |
| §3 Tastatura i aria | DELIMIČNO | `aria-expanded`, `aria-controls`, `radiogroup` i Escape postoje; aktivna opcija izlazi iz vidnog polja (S8), strelica sa zaglavlja ne ulazi u opcije (N4) |
| §3 Sve liste drže filtere u URL-u | DA | 13 stranica; argumenti upita su isti (odeljak 4) |
| §3 Šta ide gde | DA, uz odstupanja | Proizvodi nemaju sortiranje u sidebaru (nije postojalo ni pre); QR grupe se zovu „Povezanost“ i „Vrsta kanala“ |
| §4 KPI, levak, matrica, rang modela i detalj, štandovi, paketi, dubina, pasoš, mapa, uređaji, uvidi | DA | `components/admin/events/analytics/**`, snimci `output/playwright/admin-v2/X3/a5-delovi/`; angažovani su bez garaže i pečata (X3, odluka 2) |
| §4 CSV i „Prikaži kao tabelu“ | DA | `components/admin/events/analytics/chart-kit.tsx`; tabela uz svaki grafikon |
| §4 Boje grafikona | DA | `app/globals.css:218-242,285-307`, `lib/admin-v2/analytics/palette.ts` |
| §4 Backend | DA, uz odstupanje | Dva nova upita, samo čitanje; angažman se čita na 5 min, ne na 60 s (N7) |
| §4 Testovi agregacija | DA | `convex/fairEventAnalyticsV2.test.ts` (prazno, pre-event, botovi, Beograd) |
| §4 Fixtures | DELIMIČNO | Oblik i zbirovi su tačni; nazivi i dnevni parovi su preblizu pravim (V3) |
| §5 Misije, HUD, odometar, medalje, rekordi, prečice, tihi režim | DA | `lib/admin-v2/{missions,hud,odometer,shortcuts,quiet-mode}.ts` sa testovima |
| §6 3D | DA, uz odstupanje | `components/admin/events/analytics/heat-map-3d.tsx`; bez instanced mesh (X3, odeljak 6) |
| §7 Tokeni, cleanup, bez framer-motion | DA | `lib/admin-v2/motion.ts`, `components/admin/frame/use-admin-gsap.ts` |
| §7 Trajanja i reduced motion | DELIMIČNO | N5, N6 |
| §8 Tekst, naslovi, Dashboard H1, Tim, Proizvodi | DA | `lib/admin-v2/text-vocabulary.test.ts`, `lib/admin-v2/frame/titles.test.ts` |
| §8 Jedan rečnik kontrola | DELIMIČNO | S7, N2 |
| §9 `docs/admin/DASHBOARD-STANDARD.md` | NE | Ne postoji; po planu ga piše X7 |
| §10 Zabranjene putanje, šema, paketi, beleške, testovi | DA | `LANAC-stat.txt`: nijedna zabranjena putanja; `package.json` samo `three` i `@types/three`; 0 dodatih `skip/only/todo` |
| Gejtovi posle X5 | DA | Build, tsc, lint (2 zatečena upozorenja), namespace i harness (177 × 2) prolaze; testovi: 331 fajl, 3376 testova |

## 3. Nalazi

### Visoka

**V1. Fioka ostaje otvorena posle navigacije linkom iz sadržaja sidebara (kod)**
- **Gde:** `components/admin/frame/admin-drawer.tsx:140`; linkovi u `admin-sidebar-view.tsx:253,466` i `admin-hud.tsx:49` nisu u `SheetClose`; `admin-frame.tsx:48-58` nema zatvaranje na promenu putanje.
- **Zašto:** §2 telefon. Layout je sada trajan, pa se fioka više ne gasi sama. Na telefonu su sekcije Događaja dostupne samo kroz fioku: dodir na „Leadovi“ promeni stranicu, a fioka i dalje pokriva ekran.
- **Kako popraviti:** u `AdminFrame` zatvoriti fioku kad se promeni `pathname` (ne na promenu upita) i kad prozor pređe `lg`.
- **Kako proveriti:** Playwright na 390 px, `/dev/admin-okvir-preview/dogadjaji/modeli`: otvoriti meni, kliknuti „Analitika“, fioke nema. Izbor filtera i otvaranje grupe je ne zatvaraju.

**V2. Pretraga i filteri Događaja su ispod preloma sidebara**
- **Gde:** `components/admin/frame/admin-sidebar-view.tsx:116-159`, `lib/admin-v2/sidebar/configs/events.ts`. Snimak `scripts/tasks/logs/admin-v2/snimci/X5-a1/dev_admin-events-preview_modeli-1280-svetla.png`: na 1280×800 sidebar se završava na „Izveštaji“, polja pretrage nema.
- **Zašto:** §3 kaže da je pretraga stranice uvek vidljiva. Modeli, QR i Leadovi su glavne liste, a HUD tokom sajma uzima još 130 px.
- **Kako popraviti:** na sekcijama koje imaju pretragu ili grupe, navigaciju sekcija crtati kao jednu sklopljenu grupu „Sekcija · Modeli“ (isti `Group` kao izbor događaja). Na sekcijama bez filtera ostaje otvorena. Redosled iz §3 se ne menja.
- **Kako proveriti:** na `/dev/admin-events-preview/{modeli,qr,izlagaci,leadovi,izvestaji}` pri 1280×800 i 1280×720 polje pretrage i prva grupa filtera su u vidljivom delu sidebara bez skrola; test markupa u `admin-sidebar-view.test.tsx`.

**V3. Javni repo: fixtures su preblizu pravim podacima**
- **Šta:** nijedan ukupni broj po modelu, štandu, izlagaču ili paketu nije jednak pravom. Ali (a) nazivi više TEST modela zadržavaju cifre pravih naziva istim redom u rangu, uz prave šifre štandova, pa se preslikavanje može pogoditi; (b) dva TEST reda imaju današnji par (skenovi, jedinstveni) jednak današnjem paru nekog pravog modela. Provera u X3 je poredila reči i ukupne parove, ne cifre i dnevne parove.
- **Gde:** `components/admin/events/preview-analytics-fixtures.ts:49-63` i testovi koji navode te nazive; `docs/admin/v2/X3.md:247` navodi dva stara TEST naziva sa pravim imenima izlagača.
- **Zašto:** §4 Fixtures i §10 Javni repo. Rizik je mali, ali je objava nepovratna, a popravka jeftina.
- **Kako popraviti:** neutralni nazivi bez zajedničkih cifara i reči (npr. „Model 01“ do „Model 15“); izmešati dnevne vrednosti unutar štanda tako da zbirovi po danu, štandu i paketu ostanu isti; u `X3.md:247` zameniti nazive opisom.
- **Kako proveriti:** skripta u `tmp/admin-v2-rad/` poredi cifre i reči naziva i sve parove (ukupne i dnevne) sa uzorkom i ispisuje samo broj poklapanja: 0. Zatim `npm test`.

### Srednja

**S1. Navbar na 1024–1279 px: tema nedostupna, linkovi odsečeni**
- **Gde:** `admin-navbar.tsx:100` (`hidden … xl:inline-grid`), `:189` (`overflow-x-auto`), `app/globals.css:1096`. Snimak `output/playwright/admin-v2/X4/provere/navbar-1024.png`: „Finansije“ je odsečeno, „Tim“ se ne vidi.
- **Zašto:** §2 traži temu desno. Pre lanca je ispod 1280 px radila fioka sa temom; sada na tom opsegu prekidača nema nigde.
- **Kako popraviti:** stavka „Tema“ u meniju profila za `lg`–`xl` (kao Podešavanja); stegnuti razmake linkova ili dodati „Još“ da svih 9 stavki stane na 1024.
- **Kako proveriti:** snimci na 1024, 1100 i 1279: sve stavke vidljive, tema se menja.

**S2. Podnožje fioke zauzima oko 410 px**
- **Gde:** `admin-drawer.tsx:144-176`; snimak `output/playwright/admin-v2/X4/provere/fioka-390.png`.
- **Zašto:** §2 telefon. Na 390×844 za navigaciju i filtere ostaje oko 330 px, na 375×667 oko 200 px.
- **Kako popraviti:** HUD, identitet, tihi režim, pretragu, podešavanja i odjavu prebaciti u skrol posle sadržaja sidebara, ili ih svesti na jedan red ikonica od 44 px.
- **Kako proveriti:** fioka otvorena na „Filteri“ na 390×844 i 375×667: pretraga i bar dve grupe vidljive bez skrola.

**S3. Fokus se ne vraća posle zatvaranja fioke, detalja modela i liste prečica (kod)**
- **Gde:** `admin-drawer.tsx:79`, `components/admin/events/analytics/model-detail-drawer.tsx:250`, `components/admin/frame/admin-shortcuts.tsx:102`. Radix Dialog bez `Trigger`-a fokusira prazan ref (`node_modules/@radix-ui/react-dialog/dist/index.js:205-208`).
- **Zašto:** §3 tastatura, WCAG 2.4.3. Posle Escape fokus pada na `body`.
- **Kako popraviti:** zapamtiti aktivni element pri otvaranju i vratiti ga u `onCloseAutoFocus` (uzor `components/admin/admin-service-operations.tsx:273`).
- **Kako proveriti:** fokus na red ranga, Enter, Escape: `document.activeElement` je isti red. Isto za dugme menija i `?`.

**S4. Pretraga u sidebaru gubi razmak na kraju (kod)**
- **Gde:** `admin-sidebar-view.tsx:391-394,407-410`.
- **Zašto:** posle 250 ms u URL ide `trim()`, pa se polje prepiše vrednošću iz URL-a. Reč, razmak i pauza daju spojene reči („hotelvrbak“).
- **Kako popraviti:** tekst polja zameniti vrednošću iz URL-a samo kad se razlikuje od `text.trim()`.
- **Kako proveriti:** Playwright na `/dev/admin-tasks-preview`: otkucati „hotel “, sačekati 400 ms, otkucati „vrbak“; polje sadrži „hotel vrbak“.

**S5. Nevažeći id u URL filteru i neučitan 3D chunk ruše ceo okvir (kod)**
- **Gde:** `lib/admin-v2/query/url-state.ts:22,37` propušta svaki niz za grupe bez statičnih opcija; `components/admin/admin-tasks.tsx:347-351`, `lib/admin-v2/lists/orders.ts:48`, `lib/admin-v2/lists/inbox.ts:47` ga šalju kao `v.id(...)`. `app/admin/` nema `error.tsx`. `components/admin/events/analytics/heat-map.tsx:27,238` nema granicu oko `lazy`.
- **Zašto:** §3 deljiv link. Pre lanca vrednost nije mogla da stigne iz URL-a; sada greška upita ide do `app/error.tsx`, iznad okvira.
- **Kako popraviti:** `app/admin/error.tsx` u okviru („Pokušaj ponovo“, „Očisti filtere“); obrazac Convex id-ja za grupe čije su vrednosti id-jevi; granica oko 3D koja vraća 2D mapu.
- **Kako proveriti:** test u `url-state.test.ts` (`?assignee=abc` se čita kao odsutno); Playwright `route.abort()` za three chunk daje poruku i 2D mapu.

**S6. Analitika: „Osveži“ i „Izvezi CSV“ su van zaglavlja**
- **Gde:** `analitika-view.tsx:102-115`; snimci X5-a1 analitika 1280 i 390.
- **Zašto:** §2 ih navodi kao primarne akcije desno u zaglavlju. Na telefonu prvi broj počinje tek oko polovine ekrana.
- **Kako popraviti:** okvir događaja prima akcije sekcije; „Poveži nalepnicu“ postaje sekundarno dugme; uvodni pasus skratiti na jedan red.
- **Kako proveriti:** na 390 px mreža brojeva počinje u gornjih 400 px; na 1280 su akcije u redu sa H1.

**S7. Dva sistema dugmadi**
- **Gde:** `app/globals.css:329-337` boji svako `bg-[var(--admin-ink)]` u zeleno; `components/admin/admin-finance.tsx:273` (primarna akcija je `outline`); `components/admin/admin-dashboard-foundation.tsx:75,230` („Reši“ u dva oblika); `components/admin/admin-search-command.tsx:183-189` (sporedni tekst aktivnog reda palete je `text-white/70` na zelenoj, oko 1,8:1).
- **Zašto:** §8 jedan rečnik kontrola. X5 je ovo odložio.
- **Kako popraviti:** klasa `admin-button-primary` u `components/admin/admin-ui/admin-controls.ts`, zamena na svim mestima, pa uklanjanje pravila po podstringu; aktivni red palete na `--admin-surface-muted` sa tekstualnim tokenima.
- **Kako proveriti:** grep `bg-[var(--admin-ink)]` u `components/admin` (bez scanme-links) daje 0; snimci Finansija, Zadataka, Dashboarda i palete.

**S8. Search-select: aktivna opcija izlazi iz vidnog polja**
- **Gde:** `admin-search-select.tsx:41-54,82`; isto u paleti, `admin-search-command.tsx:158`.
- **Zašto:** §3 strelice kroz opcije. Lista ima `max-h-64`, a ništa je ne skroluje.
- **Kako popraviti:** na promenu `active` pozvati `scrollIntoView({ block: "nearest" })`.
- **Kako proveriti:** grupa sa 20 opcija, deset puta strelica nadole, aktivna opcija je vidljiva.

### Niska

| # | Šta | Gde | Zašto | Kako popraviti | Kako proveriti |
|---|---|---|---|---|---|
| N1 | „Zadaci koji kasne“ i „Zadaci za danas“ stoje i u misijama i u skokovima | `lib/admin-v2/sidebar/configs/pages.ts:29-40` | §2 duplikati | Izbaciti ih iz `jumps` | Snimak Dashboarda |
| N2 | Isti zadatak je žut na Zadacima, zelen na Timu | `components/admin/admin-team.tsx:135-141`, `admin-tasks.tsx:153-157` | §8 | Izvesti `statusTone` i koristiti ga u Timu | Test tona, dva snimka |
| N3 | Escape u grupi unutar fioke zatvara celu fioku | `admin-sidebar-view.tsx:274-278` | §3 | `onEscapeKeyDown` na `SheetContent` dok je fokus u otvorenoj grupi | 390 px: grupa se zatvara, fioka ostaje |
| N4 | Strelica nadole sa zaglavlja grupe ne ulazi u opcije | `admin-sidebar-view.tsx:281-295` | §3 | `onKeyDown` na zaglavlju | Tastaturom |
| N5 | Sadržaj sidebara i odometar traju do 360 ms | `components/admin/frame/admin-sidebar-content.tsx:84-91`, `components/admin/admin-ui/admin-odometer.tsx:53-62` | §1, §7 | 180 ms i stagger do 70 ms | Izmeriti trajanje |
| N6 | Reduced motion gasi animaciju umesto da pretapa | `app/globals.css:569-582` | §7 | Zadržati opacity 120 ms | Emulacija, otvoriti meni |
| N7 | Tekst kaže „svakih 60 sekundi“, angažman se čita na 5 min | `lib/i18n/sr/admin-events.ts:1803`, `components/admin/events/sections/analitika-section.tsx:25` | §4, §8 | Uskladiti tekst ili interval | Pročitati uvod |
| N8 | Grafikoni Analitike su u chunk-u svih sekcija Događaja | `components/admin/events/event-section.tsx:3-14` | §1 | `lazy` za `AnalitikaSection` | Mreža na Modelima |
| N9 | Mete ispod 44 px na telefonu | `components/admin/admin-ui/admin-view-toggle.tsx:65`, `admin-toast.tsx:73` | §2 | `min-h-11 lg:min-h-9` | Izmeriti na 390 |
| N10 | Oznaka izbora u sidebaru je 2,08:1 u svetloj temi | `admin-sidebar-view.tsx:363,474` | WCAG 1.4.11 | Linija u `--admin-nav-current` | Izračunati odnos |
| N11 | Tooltip grafikona se ne zatvara na Escape | `chart-kit.tsx:208-246` | WCAG 1.4.13 | Escape listener | Fokus na ćeliju, Escape |
| N12 | Kolona „Model“ na 1280 lomi naziv u tri reda | Snimak X5-a1 modeli 1280; `components/admin/events/sections/modeli-view.tsx` | §2 tabele | Najmanja širina kolone, Brend tek od 72 rem | Snimak sa dugim nazivom |
| N13 | „Filter lokala“ kao naziv grupe; „Jedinstveni po modelu“ bez objašnjenja | `lib/i18n/sr/admin-products.ts`, `admin-events.ts:1817` | §8 | Naziv „Stanje lokala“; `title` uz KPI | Snimci |
| N14 | H1 nije na istoj visini na svim stranicama | `admin-page-header.tsx:31-32` | §8 | Eyebrow svuda ili nigde | Uporediti snimke |
| N15 | Zadaci nemaju brojeve uz „Kasni“ i „Danas“, iako ih stranica već čita | `lib/admin-v2/sidebar/configs/tasks.ts`, `lib/admin-v2/lists/tasks.ts:124` | §3 | Poslati `viewCounts` iz `dashboardAdapter` („12+“ na granici) | Sidebar Zadataka |

## 4. Regresije ponašanja

- **Filteri daju iste rezultate.** Uporedio sam stare i nove argumente upita za Porudžbine, Zadatke, Inbox, Proizvode (lokali i inventar) i Usluge: isti su. Za QR sam čitao samo novu funkciju. X2 navodi poređenje 37.926 kombinacija bez razlike; to nisam ponavljao.
- **Namerne razlike:** pojam pretrage se šalje bez razmaka na krajevima i do 120 znakova; Inbox traži posle 250 ms umesto na Enter; „Moji razgovori“ čeka upit `me`.
- **Novi načini pada:** S4 i S5.
- **Mutacije nisu menjane.** U diff-u nema nijednog dodatog ni uklonjenog `useMutation` ili `useAction`; u `convex/**` su samo dva nova upita i testovi.
- **Convex upiti su ograničeni.** `getEventEngagement` i `getModelAnalytics` počinju sa `requireAdmin`, nemaju `.collect()`, a svako čitanje ide kroz `take()` pod granicom (`convex/lib/fairEventAnalytics.ts:46-60,177-186`). Šema nije menjana. Čitanje pečata koristi isti obrazac kao postojeći `getEventAudience`.
- **Granica čitanja posetilaca nije slučajan uzorak.** Kad se dostigne 5000 redova, dubina i angažovani se računaju iz redova prvih modela po redu. Ekran pokazuje napomenu, ali brojevi su tada pristrasni; to ide u AMF preporuke (X7).
- **Nova čitanja okvira:** pretplata na `fairAdmin.listEvents` (do 50 redova) na svakoj stranici; `getEventDashboard` na 60 s samo tokom sajma; `dashboardAdapter` na Zadacima. Trošak HUD čitanja nije izmeren.
- **`three` nije u glavnom bundle-u.** U buildu iz X5 gejta nalazi se u jednom chunk-u od 586 KB koji nije ni u jednom manifestu stranice; učitava ga samo dinamički uvoz.
- **Čuvar je isti.** `admin-guard.tsx` i `proxy.ts` nisu menjani.

## 5. Javni repo

- **Brojevi:** zbirovi celog sajma u fixtures su pravi, što je dozvoljeno. Uporedio sam svih 15 TEST redova, štandove, lokacije, mapu, pakete i ocene sa uzorkom: nijedan ukupni broj nije jednak pravom. Izuzetak su dva dnevna para iz V3.
- **Imena:** svi izlagači i brendovi su TEST. Ostaju nazivi modela iz V3 i dva stara naziva u `docs/admin/v2/X3.md:247`.
- **Lični podaci i tajne:** nema. Adrese su `example.invalid` i test domeni, telefon je `+381 60 000 00 00`, tajne postoje samo kao test konstante.
- **Uzorak:** `PODACI-SAJAM-2026.md` nije kopiran; beleške ga navode samo putanjom.

## 6. Šta valja

1. **Okvir prati zadatak.** Sidebar pune visine, navbar bez pozadine sa linijom koja klizi, ekran kao jedini skrol; ugovor prolazi na svih 56 snimaka runnera.
2. **Sidebar je stvarno jedan.** Registar, URL šema i čiste funkcije argumenata po stranici, svaka sa testom.
3. **Levak kaže glavnu vest.** Nula leadova je označena kao problem, sa tri provere i dva linka na pravo mesto.
4. **3D je uredno urađen.** Crta samo na promenu, sve oslobađa pri izlasku, vraća se na 2D bez WebGL-a i stoji iza dinamičkog uvoza.
5. **Gamifikacija ne laže.** Misije ne proglašavaju „Sve čisto“ dok widgeti stižu, rekord sata se javlja jednom, tihi režim gasi samo proslave.

## 7. Za vlasnika

- **Odstupanja koja su koraci zapisali i koja prihvatam:** aktivna stavka navbara u svetloj temi je `#2f6d23` (kontrast); angažovani bez garaže i pečata; 3D bez instanced mesh; brojevi uz poglede samo gde podaci postoje.
- **Alat runnera:** `scripts/admin-v2/alati/snimi.mjs:163` meri širinu prozora, a prozor u novom okviru nikad ne skroluje, pa `prelivanje` uvek daje `false`. Treba meriti `main[data-admin-frame="screen"]`. Koraci taj fajl ne smeju da menjaju.
- **Delta za Aleksu:** dva nova Convex upita su opisana u `docs/admin/v2/X3.md` (odeljak 7); prenos u `docs/events/sajam-automobila-2026/FRONTEND-DELTA-<datum>.md` lanac ne sme da uradi.
- **Redosled za X6:** V1, V2, V3, pa S1–S8, pa niski nalazi po redu.
