# RV
PRESUDA: TREBA DORADA

## 1. Presuda

Sve obećano postoji i gejtovi su zeleni, ali postoji jedan nalaz visoke ozbiljnosti (sloj svetla za kursorom ostavlja prazan skrol na ekranu), pet srednjih nalaza na živom putu koji lanac nije mogao da vidi u pregledaču, a art direkcija je 6,5/10, što nije „ovo nisam video nigde“.

Uslovi iz uputstva:

| Uslov | Stanje |
|---|---|
| Nalaz visoke ozbiljnosti | **1** (V1) |
| Reveal na svakoj stranici iz navigacije | radi: 27 stranica proverene u markupu; `V1/kadrovi.jsonl`, deo `sve`: 28 stranica mirno na 900 ms |
| Tri 3D momenta | postoje: Sazvežđe, Živa hala sa Vremeplovom, Vitrina |
| Nove mehanike (cilj 6) | **8**, sve montirane na pravom adminu |
| Značke (cilj 12) | **20** (16 ličnih, 4 sajamske), četiri retkosti |

**Kako je pregled rađen.**
- Četiri nezavisna recenzenta, samo čitanje: art direkcija (Sonnet), 3D inženjerstvo (Sonnet), pokret i igra (Sonnet), kontrolna lista (Haiku).
- Vođa je sam pročitao `reveal-engine.ts`, `admin-reveal-root.tsx`, `gate.ts`, `admin-material.ts`, `ceremony-layer.tsx`, `cause-chain.tsx`, `admin-stage.tsx`, `stage.ts`, `stage-session.ts`, motor i skladište igre, `game-provider.tsx`, kontejnere Pregleda i Analitike, novi Convex upit i deo scena, i pogledao oko 30 kadrova.
- Nalaz V1 i svi srednji nalazi su provereni u kodu. Ništa nije pokretano u pregledaču (plan korak, bez dev servera), pa nijedan nalaz nije reprodukovan uživo.
- Nijedan fajl nije menjan; `git status` je isti kao na početku.

## 2. Kontrolna lista §0–§7

Tabela je sažetak provere od 110 tačaka; dokazi su iz koda ili kadrova.

| Tačka | Ispunjeno | Dokaz |
|---|---|---|
| §0 Klik odmah, animacija ne blokira unos | DA | slojevi su `pointer-events: none`; preskakanje ne zaustavlja događaj (`ceremony-layer.tsx:179-180`) |
| §0 Sadržaj ne zavisi od animacije | DA, uz S5 | nijedno CSS pravilo ne cilja `data-admin-*` (`css-contract.test.ts`); skriveno stanje postavlja JS posle `revealMode` (`gate.ts:32-37`) |
| §0 Bez zvuka | DA | nema `Audio`, `AudioContext`, `.play(` u `components/admin/**` i `lib/admin-v2/**` |
| §0 Poeni, nivoi i značke iz pravog rada | DA, uz S3 i N1 | `xp.ts:18-34`; svih 15 akcija iz tabele postoji u `convex/**`; `href` nosi id zadatka i razgovora (`convex/lib/adminActivity.ts:220-232`) |
| §1 Zelena kao energija; tamna dubina; svetla bez sjaja preko teksta | DELIMIČNO | bloom samo u tamnoj temi (`theme.ts:25-29`); zelena je razvodnjena, svetla tema je ravna (§4) |
| §2 Jedan reveal engine, ScrollTrigger sa skrolerom ekrana, registar | DA | `reveal-engine.ts:460-467`; `registry.ts` |
| §2 Ulaz ≤ 900 ms; naslov iz maske; KPI clip-path pa broj od 0 | DA u preview-u; S1 na pravom adminu | `reveal-engine.ts:224-226`, `:388-391`; kadrovi `V1/ulaz-*` |
| §2 Linije, stubići, ćelije talasom, levak | DA | `reveal-engine.ts:307-359`; linija Finansija ide preko `clip-path` (odluka u V1) |
| §2 Kaskada 12 redova; skrol jednom | DA | `reveal-engine.ts:164-172`, `:460-467` |
| §2 Prelaz ≤ 160 ms, okvir stoji | DA | 140 ms (`admin-reveal-root.tsx:100-109`) |
| §2 Svetlo za kursorom, magnet 6 px, nagib 3°, shimmer | DA, uz V1 | `admin-material.ts`; `globals.css` (shimmer) |
| §2 Puls: canvas 2D, otkucaji po vrsti, stoji u tihom režimu | DA | `admin-pulse.tsx`; `pulse.ts`; kadrovi `V1/puls-demo-*` |
| §2 Tokeni u tri sloja | DA, uz N6 | `lib/admin-v2/motion.ts` |
| §2 Ambijent samo WebGL i Puls, pauza, 30 fps | DA | `loop.ts:19-33`; `stage.ts:193-206` |
| §3 Kit: lazy, dispose, pauza, DPR ≤ 2, bloom po temi, 2D rezerva, jedan picker | DA, uz S12 | `admin-stage.tsx:185`; `stage.ts:309-333`; `post.ts`; `picking.ts` |
| §3 `three` nije u početnom bundle-u | DA | `V4/bundle-build.jsonl`: 49 ruta, 0 sa `three` |
| §3.1 Sazvežđe: jezgro, orbite po hitnosti, hover, klik kao red, trag, pad nove, lista ispod, 2D na telefonu | DA | `constellation-scene.ts`; `layout.ts:43-49`; kadrovi `V2/resena-*`, `V2/nova-*` |
| §3.1 Zvezde su klijenti i lokali; veličina je aktivnost | DELIMIČNO | zvezda je stavka „Za reakciju“, veličina je čekanje (odluka u V2; podatak ne stiže klijentu) |
| §3.2 3D hala glavni prikaz, svetleći vrhovi, uvod ≤ 1,6 s, orbit kontrola | DA | `hall-scene.ts`; uvod 1,4 s; kadrovi `V3/uvod-*` |
| §3.2 Čestice skena; mirno stanje | DA | `impulses.ts:31-56`; kadrovi `V3/cestice-*` |
| §3.2 Vremeplov: klizač, „Premotaj dan“ oko 12 s, pauza i povlačenje | DA | `player.ts`; `timelapse-controls.tsx`; kadrovi `V3/premotaj-*` |
| §3.2 Podaci po štandu i satu: nov upit samo za čitanje, ograničen, testiran | DA | `convex/fairEventAnalytics.ts:450-488` (`requireAdmin`, bez `.collect()`); granice 150/1200/800; 18 testova |
| §3.3 Vitrina: 3D medalje, holo shader, prevlačenje, retkost u materijalu, zaključana silueta | DA | `medal-scene.ts`; `medal-art.ts:332-336`; kadrovi `V4/kadrovi/vitrina-*` |
| §3 Aura: ne praviti ako ne donosi vrednost, zapisati zašto | DA | V2 §1.3 |
| §4.1 XP, rangovi, traka u navbaru i HUD-u | DA | `xp-chip.tsx`; `operator-row.tsx`; `admin-navbar.tsx:116-121`; red „Operater“ stoji iznad HUD-a |
| §4.2 Niz dana | DELIMIČNO | `streak.ts:11`: traži i moj rad i „Hitno“ viđeno na nuli; „sve misije rešene“ se ne računa (N2) |
| §4.3 Kombo | DA | `combo.ts`; broji sve akcije sa kombo oznakom, ne samo rešene stavke |
| §4.4 Šef dana | DA, uz S4 | `boss.ts`; `boss-bar.tsx` |
| §4.5 Najmanje 12 znački sa retkošću i datumom | DA | `badges.ts:14-35` (20) |
| §4.6 Nedeljna tabela tima | DA | `team.ts`; `team-board.tsx`; `admin-team.tsx:455` |
| §4.7 Mapa misija i dnevni izazovi | DELIMIČNO | `fair-missions.ts`; nema čvora „test skenovi“ (podatak ne stiže klijentu); S2 |
| §4.8 Ceremonije ≤ 1,8 s, preskok, fokus, tihi režim, `aria-live` | DA, uz S9 | 1,62 s i 1,20 s; `ceremony-layer.tsx:93-101`, `:197` |
| §5 Bez novih paketa; Framer Motion se ne uvodi | DA | diff `ce50f403..HEAD` ne dira `package.json` i dodaje 0 redova sa `framer-motion` (zatečeni uvozi su u zamrznutom Links editoru) |
| §5 Šema se ne menja | DA | `convex/schema.ts` nije u diff-u |
| §5 Svih 10 oblasti testova | DA | `game/*.test.ts`, `hall/*.test.ts`, `constellation/layout.test.ts`, `reveal/gate.test.ts`, `three/budget.test.ts`, `pulse.test.ts` |
| §5 Snimci pokreta: kadrovi i video | DA | `output/playwright/admin-v3/V1…V4/` |
| §6 Telefon: kraći reveal, 2D, kartica umesto ceremonije, Puls ostaje | DA, uz S11 | `motion.ts` (`phone`); kadrovi `V3/telefon-vremeplov-13`, `V4/kadrovi/nivo-390-*` |
| §7 Standard i izveštaj | čeka V6 | `DASHBOARD-STANDARD.md` još ima „Blaga gamifikacija“; `docs/admin/v3/IZVESTAJ.md` ne postoji |

## 3. Nalazi

### Visoka

**V1. Sloj svetla za kursorom ostavlja nevidljivu kutiju, pa ekran dobija prazan skrol.**
- **Šta:** `.admin-glow` zadržava poslednji `left/top/width/height` i kad svetlo ugasne.
- **Gde:** `components/admin/reveal/admin-material.ts:68-83` (upis kutije), `:116-123` (`onLeave`), `:127-137` (čišćenje); element je dete skrolera u `components/admin/frame/admin-screen.tsx:84`, `:92-95`.
- **Zašto:** element je `position: absolute` u `main` (`relative`, `overflow-y-auto`), pa ulazi u visinu skrola i sa `opacity: 0`. Primer: kursor pređe preko visoke tabele, ode na navbar, korisnik otvori kratku stranicu ili filtrira listu na 3 reda. Ekran tada ima prazan prostor za skrol dok kursor ponovo ne pređe preko nekog panela. Alat za snimke to ne vidi jer ne pomera miša.
- **Popravka:** u `onLeave`, kad nema domaćina i u čišćenju vratiti `width` i `height` na `0px` i `box = null`. Pri promeni putanje ugasiti svetlo.
- **Provera:** Playwright na `/dev/admin-okvir-preview`: hover na poslednji red duge liste, klik na link ka kratkoj stranici, zatim `main.scrollHeight === main.clientHeight`. Isto posle filtera.

### Srednja

**S1. Na pravom adminu pun ulaz zavisi od toga da podaci stignu za 1,2 s.**
- **Šta:** sadržaj koji zameni skeleton posle prozora ulaza dobija samo pretapanje od 180 ms: bez brojanja od nule, bez crtanja grafikona, bez kaskade.
- **Gde:** `components/admin/reveal/reveal-engine.ts:544-571` (u prozoru), `:573-577` (posle prozora); `lib/admin-v2/reveal/gate.ts:136-138`.
- **Zašto:** preview crta fixtures odmah, pa kadrovi pokazuju pun ulaz. Pravi `/admin` čeka upit, i na hladnom učitavanju ili sporoj vezi to prelazi 1,2 s. Tada je admin „v2 plus fade“, što je bila Jovanova primedba.
- **Popravka:** čvor koji zamenjuje skeleton (skup `replaced`) dobija svoju grupnu koreografiju i posle prozora, jednom po regionu. Polling i filter ostaju bez ulaza jer ne uklanjaju skeleton.
- **Provera:** `/dev/admin-dashboard-preview?kasni=1500` i `?kasni=3000`, kadrovi posle dolaska sadržaja: broj kreće od 0, prstenovi se crtaju. `?uzivo=3` ne ponavlja ulaz. Novi slučaj u `gate.test.ts`.

**S2. Dnevni izazovi po satu vide se tek kad isečak hale uđe u ekran.**
- **Šta:** „50 skenova pre podne“, „Prestigni jučerašnje prepodne“ i „Obori rekord sata“ ne postoje dok `hours` nije učitan.
- **Gde:** `components/admin/events/sections/pregled-section.tsx:33-47` (čitanje samo dok je `HallMiniLive` u ekranu), `:66-69`; `pregled-view.tsx:457-459` (izazovi stoje iznad hale); `lib/admin-v2/game/fair-missions.ts:68`, `:76`.
- **Zašto:** na 1440 × 900 hala je ispod izazova, pa izazovi iskaču tek posle skrola i pomeraju stranicu. Događaj bez plana hale ih nikad ne dobija. Preview daje sate direktno (`admin-events-preview.tsx`, `PreviewPregled`), pa kadrovi to ne pokazuju.
- **Popravka:** čitanje podići u `PregledSection` i vezati za vidljivost bloka „izazovi + hala“. Za događaj bez plana čitati dok su izazovi u ekranu.
- **Provera:** izdvojiti čistu funkciju koja odlučuje ključ čitanja i testirati je; test `pregled-view` da izazovi po satu postoje bez `hall`.

**S3. Sajamske značke nisu vezane za događaj, a ceremonija zavisi od načina dolaska na stranicu.**
- **Šta:** `reportFair` ne nosi događaj. Već tačna činjenica daje ceremoniju pri klijentskoj navigaciji, a pri tvrdom učitavanju ostaje tiha.
- **Gde:** `pregled-view.tsx:446`; `components/admin/events/analytics/records.tsx:58`, `:71`; `lib/admin-v2/game/engine.ts:187-194`, `:241-255`; `store.ts:80-84`, `:107-111`.
- **Zašto:** otvaranje bilo kog događaja sa leadom, i završenog, daje „Nova značka: Prvi lead“ svakom adminu na svakom uređaju, danima posle događaja. Tekst u Vitrini kaže „zajedničke za tim“, a datum je po uređaju.
- **Popravka:** `reportFair` prima šifru događaja i prihvata samo događaj koji nije završen. Prva prijava činjenice u poseti je stanje (datum se upiše, bez ceremonije); ceremonija ide samo kad činjenica postane tačna dok je stranica otvorena. Uskladiti tekst u `lib/i18n/sr/admin-game.ts`.
- **Provera:** testovi motora: prva prijava posle `live` bez efekta ceremonije; prelaz sa netačnog na tačno daje ceremoniju; završen događaj ne daje značku.

**S4. Šef dana i kombo nestaju kad korisnik izabere „Samo lista“.**
- **Gde:** `components/admin/admin-dashboard-foundation.tsx:295-302` (režim liste), `:328-331` (jedino mesto montiranja).
- **Zašto:** dve od osam mehanika zavise od jednog prekidača prikaza.
- **Popravka:** u režimu liste kompaktan šef i kombo u redu sa brojem stavki.
- **Provera:** test markupa: režim liste sadrži `data-game-boss`.

**S5. Reveal engine nema osigurač za izuzetak i za čvor koji čeka.**
- **Šta:** izuzetak iz `SplitText.create` ili `ScrollTrigger.batch` ide iz layout efekta na granicu greške. Čvor ispod preloma je skriven dok ga ne otkrije skrol ili `IntersectionObserver`.
- **Gde:** `reveal-engine.ts:211-234` (linija dobija `visibility: hidden` na `:220`, čišćenje se prijavljuje tek na `:234`), `:443-486`; `admin-reveal-root.tsx:57-90`.
- **Zašto:** greška u animaciji ne sme da obori stranicu (§0). Štampa i „sačuvaj kao PDF“ daju prazna mesta ispod preloma.
- **Popravka:** `try/catch` oko gradnje u `startVisit` (u `catch`: `finish()` i konačno stanje); čišćenje naslova prijaviti pre prve izmene DOM-a; jedan tajmer posle ulaza i `beforeprint` koji puste sve što još čeka.
- **Provera:** test sa lažiranim `SplitText.create` koji baca (bez `visibility: hidden` i bez kopije naslova); test sa lažnim satom za čvor koji čeka.

**S6. Sazvežđe se pri punom ulazu vidi, nestane, pa se ponovo pali.**
- **Gde:** `components/admin/three/admin-stage.tsx:45`, `:198-206`; `constellation-scene.ts:828`; kadrovi `V2/uvod-1440-tamna-0000` (puna 2D slika) i `-0400` (samo jezgro i deo orbita).
- **Zašto:** Skener (0–900 ms) i uvod scene (od oko 1,1 s) se ne preklapaju, pa je prvi utisak treptaj, ne paljenje.
- **Popravka:** potez 1 u §4.
- **Provera:** kadrovi `uvod` na 0, 200, 400, 650, 900 ms: udeo osvetljenih piksela ne pada ispod 2D slike.

**S7. Hala je mala u svojoj kutiji, a kontrole Vremeplova se pomere na klik.**
- **Gde:** `components/admin/events/analytics/heat-map.tsx:398` (`h-[20rem] @2xl:h-[24rem]`); uokvirenje kamere u `hall-scene.ts`; kadrovi `V3/premotaj-tamna-00000` i `-06000`.
- **Zašto:** stubovi zauzimaju oko pola širine kutije; 2D rezerva je veća od „glavnog prikaza“. Natpis ispod scene prelazi iz dva u jedan red i prekidač mere nestane kad premotavanje krene, pa „Pauza“ sklizne oko 20 px pod kursorom (procena iz kadrova).
- **Popravka:** potez 2; rezervisati visinu natpisa i držati prekidač neaktivnim umesto da nestane.
- **Provera:** kadar `uvod-tamna-01600`: stubovi i plan zauzimaju bar 75 % širine kutije. `getBoundingClientRect` bloka kontrola pre klika i 400 ms posle: razlika 0.

**S8. Lanac uzroka se jedva vidi i ostavlja liniju nišana.**
- **Gde:** `components/admin/game/cause-chain.tsx:22`, `:52` (iskra 28 × 6 px, bez sjaja), `:56` (natpis „+XP“ stoji tačno na donjoj ivici navbara, preko Pulsa); `admin-dashboard-foundation.tsx:431-481` (`AimLine` ne proverava ceremoniju ni da li je zvezda u ekranu); kadrovi `V4/kadrovi/lanac-tamna-0300`, `-0600`, `kombo-x2`.
- **Zašto:** „jedan neprekinut let“ je u kadru crtica, a nišan preseca ceremoniju.
- **Popravka:** potez 4; nišan sakriti pri pritisku na „Reši“, tokom ceremonije i kad je hero van ekrana; natpis pomeriti unutar navbara ili mu dati podlogu.
- **Provera:** kadrovi `lanac` na 100, 250, 450, 700 ms: iskra široka bar 80 px na 450 ms; nema putanje u `[data-dashboard-aim]` dok postoji `[data-admin-ceremony]`.

**S9. Ceremonije su vizuelno slabe i imaju tri sitne rupe.**
- **Gde:** `lib/admin-v2/game/ceremonies.ts:18`, `:149-157` (120 čestica od 1,5 do 4,5 px); `ceremony-layer.tsx:56` (šef dobija „običnu“, sivu medalju), `:123-135` (`next` ne čita ponovo okruženje), `:212`, `:287` (3D medalja pravi WebGL kontekst unutar trenutka od 1,6 s); kadar `V4/kadrovi/sef-1440-tamna-0900`.
- **Zašto:** najveći trenutak igre ima najtamniju medalju. Druga ceremonija iz reda može da krene preko polja u koje korisnik upravo kuca; slovo stiže u polje, ali sloj stoji preko njega do prvog tastera.
- **Popravka:** potez 3; u `next` pozvati `readEnv()` i poslati toast ako je fokus u polju, dijalog otvoren ili tab skriven.
- **Provera:** `ceremony-layer.test.tsx`: red od dve ceremonije, fokus u polju pre druge, očekivan toast. Kadrovi `sef-1440-*` na 300, 600, 900 ms.

**S10. Sidebar je pretrpan na niskom prozoru.**
- **Gde:** `components/admin/game/operator-row.tsx:22-55`; `components/admin/frame/admin-sidebar.tsx:34`; kadrovi `V4/kadrovi/stanje-dashboard-720-svetla` i `V4/konacno/dev_admin-tasks-preview-1280-tamna`.
- **Zašto:** red „Operater“ i HUD „Danas“ zauzimaju oko 230 px. Na 1280 × 720 svi „Brzi skokovi“ su iza preloma, na 1280 × 800 je odsečen filter Zadataka.
- **Popravka:** ispod 800 px visine „Operater“ staje u jedan red (rang, nivo, tanka traka).
- **Provera:** snimak 1280 × 720: bar jedan „Brzi skok“ vidljiv bez skrola.

**S11. Mete dodira u 2D Sazvežđu su oko 29 px i preklapaju se.**
- **Gde:** `components/admin/dashboard/constellation-2d.tsx:57-62` (`r="0.085"`); `lib/admin-v2/constellation/geometry.ts:25`; `admin-dashboard-foundation.tsx:317`.
- **Zašto:** na 390 px prečnik mete je oko 29 px, na 360 px oko 26 px. Dodir vodi na stranicu ili otvara dijalog, pa je pogrešna zvezda pogrešna radnja.
- **Popravka:** na gruboj kazaljci birati najbližu zvezdu po koordinati dodira, ili da dodir samo istakne red liste.
- **Provera:** Playwright na 390 px sa dodirom između dve hitne zvezde.

**S12. 3D kit: četiri mesta za učvršćivanje.**
- **Gde i zašto:**
  - `admin-stage.tsx:153` i `stage-session.ts:17-36`: probni WebGL kontekst se pravi sinhrono pri montiranju, pre odlaganja od 1 s, i kad je izabran 2D.
  - `stage.ts:297-308` i `post.ts:44-56`: `compileAsync` ne pokriva prolaze bloom-a; prevode se u prvom frejmu, kad platno počinje da se vidi.
  - `admin-stage.tsx:170-172`, `:235-237`: `created?.dispose()` stoji ispred `stage?.dispose()` bez `try/finally`. Ako scena baci, kontekst i unos u registru ostaju; dva takva ostatka gase 3D do osvežavanja (`stage.ts:77`).
  - `stage.ts:245-246`, `:319`: registar ekskluzivnih scena nije stek. Danas latentno.
- **Popravka:** probu pomeriti iza posmatrača i idle-a i preskočiti je za 2D; prvi frejm nacrtati dok 2D slika još pokriva platno; `try/finally` na oba mesta; registar pamti redosled.
- **Provera:** `addInitScript` koji beleži prvi `getContext("webgl2")` (posle 1000 ms od navigacije, nikad uz 2D); test sa scenom čiji `dispose` baca; test registra.

**S13. Skrim dijaloga je svetao u tamnoj temi.**
- **Gde:** `components/ui/dialog.tsx:15` (`bg-foreground/50`); kadar `V4/kadrovi/vitrina-tamna-savr-ena-nedelja`.
- **Zašto:** kad se Vitrina otvori, stranica iza nje posvetli i dubina tamne teme se izgubi. Zatečeno iz v2, ali kvari treći 3D momenat.
- **Popravka:** pravilo u `app/globals.css` za `[data-slot="dialog-overlay"]` u tamnoj temi, ograničeno na admin. `components/ui` se ne dira.
- **Provera:** kadar Vitrine u tamnoj temi: pozadina tamnija od panela dijaloga.

### Niska

V5 ih radi ako stane; ostatak ide u izveštaj V6 kao poznato ograničenje.

| # | Šta | Gde | Zašto | Popravka | Provera |
|---|---|---|---|---|---|
| N1 | XP jeftinih akcija nema dnevnu granicu | `lib/admin-v2/game/xp.ts:28-33` | prazni zadaci i prebacivanje nalepnica pune tabelu tima | dnevna granica po vrsti | test sa 50 redova istog dana |
| N2 | Niz traži „Hitno“ viđeno na nuli na ovom uređaju | `streak.ts:11`; `engine.ts:224-229` | u zauzetom timu niz možda nikad ne krene; zadatak dopušta i „sve misije rešene“ | dodati taj uslov ili zapisati odstupanje | `streak.test.ts` |
| N3 | Zastavica `popstate` ostaje posle Back-a na istoj putanji | `admin-screen.tsx:42-61` | sledeći klik se vodi kao Back: kratak ulaz i stara pozicija skrola | postaviti je samo kad se putanja razlikuje | Playwright: filter, Back, klik |
| N4 | Kaskada i FLIP u prvih 900 ms | `reveal-engine.ts:528-533`; `use-admin-flip.ts:24-61` | FLIP meri pre nego što engine prekine kaskadu, pa klizanje tiho izostane | prekinuti kaskadu pre merenja ili ispraviti komentar | Playwright: filter 300 ms posle ulaza |
| N5 | `aria-hidden` na broju koji sadrži link | `reveal-engine.ts:264`; `admin-ui/admin-kpi.tsx:33-36` | link je do 0,6 s u skrivenom podstablu | ne brojati cilj sa linkom | test markupa |
| N6 | Trajanja van tokena | `boss-bar.tsx:24` (0,6 s); `admin-stage.tsx:254` (300 ms); `cause-chain.tsx:22`; `ceremony-layer.tsx:272`; `globals.css` (živi red, prsten hale, ivica) | sloj interakcije je do 250 ms, a ovo nije u `motion.ts` | preneti u tokene ili ih imenovati kao reveal | `motion.test.ts` |
| N7 | Čitanje layouta u posmatraču i posle prozora | `reveal-engine.ts:133`, `:575` | svaka grupa novih čvorova forsira layout, iako se ništa ne animira | posle prozora samo označiti viđeno | profil kucanja u filter |
| N8 | `Flip` nije registrovan ni korišćen | `components/admin/reveal/gsap-plugins.ts:12-14`; V1 §7 | zadatak ga navodi; komentar kaže da ga registruje V4 | upotrebiti ga za iskru ili ispraviti komentar i belešku | grep |
| N9 | `listAdmins` je pretplaćen uvek | `game-provider.tsx:165` | treba samo dok je tabela tima na ekranu | `"skip"` kad niko ne gleda | čitanje koda |
| N10 | Zelena ispuna na svetloj temi ispod 3:1 | `xp-chip.tsx:34`; `operator-row.tsx:47`; `fair-challenges.tsx:53`; `combo-meter.tsx:45` | netekstualno; vrednosti stoje i kao tekst | `--admin-success` u svetloj temi, kao Puls | merenje kontrasta |
| N11 | Nivo se ne vidi na telefonu; prsten oko profila je bez broja | `admin-navbar.tsx:116`, `:121` | od 1024 do 1399 px zeleni krug liči na fokus | broj u prstenu; mali prsten u gornjoj traci telefona | snimci 390 i 1280 |
| N12 | Traka XP-a skače bez prelaza | `operator-row.tsx:47` | dobitak se ne vidi kao pokret | `transition` na `transform`, 180–240 ms | kadar posle dobitka |
| N13 | Hala: klik na prazan štand bira id bez podataka; oznake se dodiruju; redosled slušalaca točkića; alokacije po frejmu | `hall-scene.ts:536`, `:230` prema `:611`, `:500-527` | obod bez detalja; stariji Safari može da zumira točkićem | preskočiti blok bez visine; slušaoce prijaviti pre `OrbitControls` | Playwright; profil premotavanja |
| N14 | Testovi čuvari imaju rupe | `admin-stage.test.tsx:75-82`; `import-boundary.test.ts:53`, `:91` | teksture i ciljevi crtanja nisu pokriveni; regex promašuje neke višelinijske uvoze | proširiti obrasce | namerno pokvaren primer |
| N15 | Preview: imena tima nisu TEST; brojevi se ne slažu između stranica | `components/admin/game/game-fixtures.ts:19-21` (isto u zatečenim fixtures Tima) | pravilo lanca traži TEST imena; HUD se u preview-u Analitike okrene na drugi broj | TEST imena; jedan izvor broja | grep; kadar |
| N16 | Puls čita reduced motion jednom | `admin-pulse.tsx:30` | promena podešavanja važi tek posle osvežavanja | slušati `change` | ručno |
| N17 | Novi upit čita brojače jedan po jedan (do 2.150) | `convex/lib/fairEventAnalytics.ts:352-376` | trajanje nije mereno, samo broj čitanja | pitanje za Aleksu | bez izmene u V5 |

## 4. Utisak

**Ocena art direkcije: 6,5 / 10.**

| Koreografija | Materijal | 3D | Igra | Doslednost | Čitljivost |
|---|---|---|---|---|---|
| 7 | 6,5 | 7 | 6,5 | 6 | 7 |

Rad je ozbiljan i disciplinovan. Skener, hitnost kao udaljenost od jezgra, sat kao sloj stuba i igra bez izmišljenog broja jesu prave ideje, a ne šablon. Do „ovo nisam video nigde“ ne stiže iz četiri razloga:
- Najjače ideje se čitaju tek uz natpis. „Bliže jezgru je hitnije“ stoji u sivom tekstu od 11 px.
- Pokret koji treba da proda ideju je premali: iskra je crtica, ceremonija su tačkice, Sazvežđe trepne umesto da se upali.
- Svetla tema dobija najslabiju verziju: ravne diskove bez dubine (`scripts/tasks/logs/admin-v2/snimci/V4-a1/dev_admin-dashboard-preview-1280-svetla.png`).
- Van Dashboard-a, Događaja i Vitrine admin je v2 sa uvodom, a Skener se vidi jednom po stranici na 20 minuta.

Hala sa slojevima i Vremeplov u tamnoj temi su najjači momenat (`V3/premotaj-tamna-06000.png`).

**Pet poteza za V5 (bez novih funkcija, upita i izmene šeme):**

1. **Skener pali Sazvežđe.** Uvod scene kreće kad linija Skenera pređe hero (oko 0,35 s). 2D slika ostaje ispod kao senka od oko 15 %, pa nema praznog kadra. Zvezde se pale jednom, od jezgra ka spolja. Rešava S6.
2. **Hala kao glavna slika.** Kutija 28–30 rem od 1280 px; kamera uokviruje štandove sa skenovima, ostatak plana viri. Na svaki ceo sat premotavanja prsten po podu (900 ms, gasne), u ritmu preslaganja ranga. Rešava prvi deo S7.
3. **Ceremonija sa celim ekranom.** `--admin-energy` na 1 dok traje (živa ivica zasvetli bez troška); jedan prsten udara; čestice 2–7 px kao tragovi iz čipa; medalja ulazi sa 0,4 preko 1,12 na 1 krivom `adminIgnite`; šef dobija zlatnu medalju. Sve ostaje ≤ 1,8 s i preskočivo. Rešava vizuelni deo S9.
4. **Komet iskre.** Glava 8–10 px, rep 100–140 px, bljesak i trzaj trake šefa pri udaru, mali prsten oko XP čipa pri dolasku. Rešava S8.
5. **Svetla tema dobija dubinu, zelena disciplinu.** Zvezde i medalje u svetloj temi dobijaju meku senku i gradijent umesto ravnog diska. Zelena ispuna ostaje za ono što se upravo dešava (iskra, Puls, čestice, ivica). Da li „Reši“ prelazi u obrub je odluka vlasnika; V5 je zapisuje kao otvoreno pitanje.

**Redosled za V5:** V1, zatim S1–S5, zatim potezi 1–5 (pokrivaju S6–S9), zatim S10–S13, na kraju niske po izboru.

## 5. Regresije v2

| Oblast | Stanje | Dokaz |
|---|---|---|
| Okvir | regresija V1; inače čisto | `scripts/tasks/logs/admin-v2/V4-a1-snimci.log`: 8 snimaka, 0 problema, okvir prolazi, bez vodoravnog prelivanja i grešaka konzole |
| Sidebar | meka regresija S10 | kadrovi 1280 × 720 i 1280 × 800 |
| Harmonika | bez regresije | ista provera snimaka: najviše jedna otvorena grupa |
| URL stanje i filteri | bez regresije | filter nije prelaz stranice (`gate.ts:158-162`); kod stanja upita nije diran; sitnica N3 |
| Testovi | zeleni | `V4-a1-gate-test.log`: 383 fajla i 4433 testa prošla, 2 zatečena preskočena; nema `.skip`, `.todo`, `.only` u novim testovima; namerno izmenjeni testovi su navedeni u beleškama V1–V4 |
| Tipovi i lint | zeleni | `npx tsc --noEmit --incremental false`: exit 0; isto za `convex/tsconfig.json`: exit 0; `npm run lint`: 0 grešaka, 2 zatečena upozorenja (pokrenuto u ovom koraku, bez upisa) |
| Harness | zelen | `V4-a1-gate-harness.log`: 177 slučajeva × 2 širine, bajt u bajt |
| `three` van glavnog bundle-a | potvrđeno | `V4/bundle-build.jsonl`: 49 ruta, 0 sa `three`; 6 lenjih chunk-ova, 178 kB gzip (budžet 300); `three` kao vrednost uvoze samo `components/admin/three/{stage,post,picking,particles}.ts` i `scenes/*` |
| Paketi, konfiguracije, šema | bez izmene | diff `ce50f403..HEAD` ih ne dira |
| Fajlovi van dozvoljenih putanja | tri, sva tri zapisana | `lib/i18n/types.ts`, `convex/fairAuthz.test.ts`, `docs/tasks/BLOCKED.md` |

## 6. Javni repo

Nalaza visoke ozbiljnosti nema.

- **Pravi brojevi po izlagaču, modelu ili štandu:** nisu nađeni. Zbirovi po štandu i modelu izvedeni iz `components/admin/events/preview-analytics-fixtures.ts` upoređeni su sa tabelama privatnog uzorka (`tmp/admin-v2-2026-10-11/PODACI-SAJAM-2026.md`, naveden samo putanjom): nijedan par se ne poklapa. Zbirni brojevi celog sajma su dozvoljeni i samo oni su pravi.
- **Jedna slučajna podudarnost:** u `components/admin/game/game-display.test.tsx` jedna izmišljena vrednost dnevnog izazova jednaka je jednom broju iz privatne tabele štandova. Druga je metrika i nema šifre štanda, pa nije curenje. V5 treba da uporedi konstante novih testova i fixtures sa privatnim tabelama i zameni podudarne.
- **Imena:** izlagači, brendovi i modeli su TEST. U `game-fixtures.ts` stoje tri lična imena članova tima, preuzeta iz zatečenih fixtures stranice Tim. Bez prezimena i adresa (N15).
- **Tajne i adrese:** u dodatim redovima su samo TEST tajne u `convex/fairEventAnalyticsV3.test.ts` i dve test adrese (`.test`, `.invalid`).
- **Privatni fajl:** nije kopiran; beleške ga navode samo putanjom.
- **TEST podaci igre u pravom adminu:** `V4/bundle-build.jsonl` ih nalazi samo u dve dev rute; okvir uvozi samo `game-preview.ts` bez podataka.

## Šta ovaj pregled nije potvrdio

- Ništa nije gledano u pregledaču u ovom koraku; V1 i S1–S5 su zaključci iz koda.
- Pravi `/admin` sa živim podacima niko u lancu nije video (`GameLive`, čitanje sati, ponašanje reveala uz spore upite). Posle V5 treba ga ručno pogledati.
- FPS, regulator kvaliteta i sjaj na pravoj grafici nisu mereni; kadrovi su sa softverskim WebGL-om.
- Video snimci nisu pregledani; ocena pokreta je iz kadrova i koda.
- Dodir na tabletu i stariji Safari nisu vežbani.
