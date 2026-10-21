# ScanMe Menu — definicije analitike (K29)

> Izvor istine za svaku brojku sekcije **Analitika** i kartice „Poslednjih 7 dana" na Početnoj.
> K30 odavde piše objašnjenja u UI-ju („šta se tačno broji"). Master §14, §2.4; MENI-PLAN P8.
> Kod: `lib/menu/analitika/**` (čista pravila), `convex/menuAnalytics.ts` (prijem i upiti),
> `convex/menuAnalyticsRollup.ts` (agregati, skenovi, retencija), `convex/lib/menuAnalytics.ts`
> (upis događaja iz drugih modula), `app/api/meni/analitika/route.ts` (ulaz iz browsera).
> Testovi: `convex/menuAnalytics.test.ts` (upiti), `convex/menuAnalyticsRollup.test.ts` (prijem, zbir,
> sesije, skenovi, retencija) i `lib/menu/analitika/*.test.ts` (čista pravila); oznaka u zagradi
> (npr. `[otvaranja]`) je deo naziva testa koji dokazuje pravilo (`npx vitest run -t "[otvaranja]"`).

## 1. Načela

1. Svaka brojka pomaže odluku i ima ovde napisanu definiciju: događaj, uslov, prozor, isključenja, granicu pouzdanosti, izvor i test.
2. Ne merimo ono što ne možemo pouzdano da objasnimo (§14.3). Kad podatak nije pouzdan, upit vraća `null` sa razlogom, nikad nulu koja izgleda kao rezultat.
3. Operativno stanje (šta se sada dešava u sali) nije analitika; analitika je istorija po danima.
4. Mockup brojke nisu podaci ni definicije.
5. Nema prosečnog vremena preuzimanja zahteva, ni u jednom planu (§14.3; master §20).

## 2. Zajednička pravila

| Pravilo | Vrednost | Gde | Test |
|---|---|---|---|
| Dan | Kalendarski dan po **beogradskom** vremenu (`Europe/Belgrade`, letnje i zimsko vreme), po trenutku **prijema na serveru** (ne po satu telefona). Ključ `YYYY-MM-DD`. | `lib/menu/analitika/vreme.ts` (`danUBeogradu`, `satUBeogradu`) | `[dan-beograd]` |
| Sat (filter „vreme") | Sat prijema po beogradskom vremenu, 0–23. | isto | `[dan-beograd]` |
| Prozori | Standard: poslednjih **7** i **30** dana, uključujući današnji. Premium: i **90** dana i proizvoljan period od najviše **366** dana unutar čuvanja agregata (24 meseca). | `lib/menu/analitika/period.ts` | `[period]`, `[premium]` |
| Poređenje (Premium) | Prethodni period iste dužine, odmah pre izabranog. Razlika je uvek broj; **procenat promene** samo kad prethodni period ima najmanje 20 (pravilo 20). | `period.ts` (`prethodniPeriod`, `poredi`) | `[poredjenje]` |
| Pravilo 20 | Svaki procenat i svaka konverzija se prikazuje tek kad je **imenilac najmanje 20** (za konverzije su to sesije, za udeo ishoda broj poslatih zahteva ili rezervacija). Ispod toga upit vraća `null` sa razlogom `malo_podataka`. | `lib/menu/analitika/definicije.ts` (`procenat`, `MIN_IMENILAC`) | `[pravilo-20]` |
| Kašnjenje | Brojke iz browsera i operativni događaji ulaze u agregate kroz cron na 15 minuta, sa zaštitnim razmakom od 2 minuta: današnji broj kasni najviše oko 17 minuta. Skenovi današnjeg dana se čitaju uživo; završeni dani iz agregata. | `convex/menuAnalyticsRollup.ts` | `[zbir]` |
| Botovi | Zahtev bez `User-Agent` zaglavlja ili sa oznakom bota (`bot`, `crawler`, `spider`, `preview`, `facebookexternalhit`, `whatsapp`, `headless`, `lighthouse`) se ne beleži. Skenove botova već isključuje resolver kartica. | `lib/menu/analitika/uredjaj.ts` | `[uredjaj]` |
| Pregled nacrta, editor i izlog | Ne šalju ništa: događaje šalje samo javni meni kad stranica dobije `analitika` kontekst (`app/[slug]/meni/_lib/prikaz.tsx`, Room service i strana rezervacije). Editor (`ugradjen`) i izlog (`/dev/...`) ga nemaju. | `components/menu/javni/javni-meni.tsx`, `lib/menu/analitika/track.ts` | `[izlog]` |
| Interni saobraćaj | Browser sa prijavljenom ScanMe sesijom (vlasnik, menadžer, urednik, ScanMe admin) se ne broji. Osoblje koje otvara meni bez prijave na nalog broji se kao gost (ograničenje, §9). | `app/api/meni/analitika/route.ts` | `[interni]` (`lib/menu/analitika/ulaz.test.ts`) |
| Ograničenje upisa | Najviše 10 događaja po pozivu; kofa `menuAnalyticsIp` (po soljenom hešu IP adrese, 300 događaja u minuti). Višak se tiho odbacuje. Sirova IP adresa nikad ne ide u Convex. | `convex/menuAnalytics.ts`, `convex/lib/rateLimits.ts` | `[prijem]` |
| Provera ključeva | Vrsta događaja mora biti poznata; ključ stranice i artikla mora imati oblik ključa (`pg_…`, `ar_…`; Room service je `room_service`), kartica mora biti ID kartice, jezik dvoslovni kod. Neispravno polje se izbacuje iz događaja ili se ceo događaj odbacuje (stranica, detalj bez artikla). Postojanje ključa proverava upit pri čitanju, po artiklima menija (`menuArticles`): artikal kog više nema u meniju ne ulazi u „najotvaranije". Provera po živoj verziji po događaju bi čitala celu objavljenu verziju za svaki poziv (ODLUKA K29). | `lib/menu/analitika/prijem.ts` | `[prijem]` |
| Izolacija | Svaki događaj i agregat nosi `menuServiceId`; upiti traže pravo `analytics.read` (Vlasnik, Menadžer, ScanMe admin; ne Urednik ni Osoblje) za tu uslugu; tuđa usluga vraća `null`. | `convex/menuAnalytics.ts` | `[izolacija]` |

## 3. Sesija, anonimni identifikator i saglasnost (master §14.4, P8)

- **Sesija** je niz događaja jednog browsera na meniju jednog lokala bez pauze od **30 minuta ili duže**. Pauza od tačno 30:00 završava sesiju; sledeći događaj počinje novu. Sesija se broji u **danu u kom je počela** (sesija koja prelazi ponoć ne broji se dva puta).
- Pravilo se primenjuje dva puta, nezavisno: u browseru (`lib/menu/analitika/sesija.ts`, novi identifikator posle pauze) i na serveru pri sabiranju (`convex/menuAnalyticsRollup.ts`: isti identifikator posle pauze od 30 min postaje nova sesija). Testovi: `[sesija-30]`.
- **Identifikator** je slučajan niz od 16 znakova, napravljen u browseru (`crypto.getRandomValues`), čuva se u `localStorage` pod ključem `smm_an:<slug>` zajedno sa vremenom poslednje aktivnosti. Poseban je za **svaki lokal** (nema povezivanja posetioca između lokala), menja se posle svake pauze od 30 min (nema trajnog „posetioca" kroz dane), bez fingerprintinga (ne čitaju se ekran, fontovi, plug-inovi ni drugi signali uređaja) i bez povezivanja uređaja. Brisanje podataka browsera ili incognito prozor pravi novu sesiju; to je prihvaćeno ograničenje (§14.4).
- **Jedinstveni posetioci se u V1 ne mere** i trajni identifikator posetioca se ne pravi: nijedna metrika iz §14.2 ga ne traži, a manje podataka je bezbednije (ODLUKA K29).
- **Tačka saglasnosti** je `lib/menu/analitika/saglasnost.ts`:
  - `analitikaRezim(process.env.MENU_ANALYTICS_IDENTIFIERS)` → `iskljuceno` (podrazumevano, i za svaku nepoznatu vrednost), `ukljuceno` ili `saglasnost`;
  - `smeIdentifikator(rezim, izbor)`: `ukljuceno` → da; `saglasnost` → samo kad je gost izričito pristao (`localStorage` `smm_an_saglasnost` = `da`); inače ne.
  - Ulaz u Convex (`/api/meni/analitika`) briše identifikator sesije iz svakog događaja kad je režim `iskljuceno`, pa ni prepravljen browser ne može da ga upiše.
  - Ponašanje (da li je identifikator dozvoljen bez pitanja, tekst pitanja, tekst politike privatnosti) je **otvoreno pitanje vlasnika i pravnika**: `docs/tasks/BLOCKED.md`, „SCANME MENU V1 — K29". Do odluke je režim `iskljuceno`, pa sesije i konverzije pokazuju „nije dostupno", a sve ostale brojke rade.
- **Pouzdanost sesija:** broj sesija se prikazuje samo kad je u periodu najmanje **95%** otvaranja menija imalo identifikator sesije (`pokrivenost`), inače `null` sa razlogom `sesije_nepouzdane`. Test `[sesije-pouzdane]`.

## 4. Događaji

Sirovi događaj (`menuAnalyticsEvents`): `menuServiceId`, `vrsta`, `occurredAt` (prijem na serveru), `dayKey`, `sat`, i samo polja koja vrsta ima. Nikad ime, kontakt, IP, `User-Agent`, `deviceKeyHash` ni token.

| Vrsta | Izvor i trenutak | Polja | Napomena |
|---|---|---|---|
| `stranica` | browser: prikaz javne stranice menija (prvo učitavanje i svaki prelazak na drugu stranicu; ponovno učitavanje je novo otvaranje) | `stranica`, `kartica?`, `jezik`, `uredjaj`, `sesija?` | razdelnik se ne broji kao otvaranje |
| `detalj` | browser: gost je **kliknuo** artikal i otvorio detalj | `stranica`, `artikal`, `jezik`, `uredjaj`, `sesija?` | vidljivost pri skrolu NIJE događaj (§14.2) |
| `korak` (`zahtev`, `porudzbina`, `rezervacija`) | browser: posle uspešno poslatog poziva/računa, porudžbine ili rezervacije | `korak`, `sesija` | samo za konverzione tokove; bez identifikatora sesije se odbacuje |
| `zahtev_poslat` | server: novi red u `menuRequests` (`convex/menuGuest.ts`, `insertRequest`); ponovljen isti zahtev (dedupe) se ne broji | `zahtev` (`call`, `bill`, `order`), `kanal`, `kartica?` | |
| `zahtev_prihvacen`, `zahtev_zavrsen`, `zahtev_otkazan` | server: stvarna promena statusa u `applyRequestAction` (`convex/lib/menuRequests.ts`) | `zahtev`, `kanal`, `ko?` (otkazao: `guest`/`staff`) | „Završi" novog zahteva u jednom koraku broji i prihvatanje |
| `rezervacija_poslata` | server: novi red u `menuReservations` (`convex/menuReservations.ts`, `submit`; dedupe se ne broji) | — | |
| `rezervacija_prihvacena`, `_odbijena`, `_predlog`, `_realizovana`, `_otkazana` | server: stvarna promena statusa u `applyReservationAction` (`convex/lib/menuReservationWriter.ts`) | `ko?` za otkazivanje | prihvaćen predlog izmene je i prihvatanje |
| sken | resolver štampane kartice `/r/<kod>` (`convex/cards.ts`, `dailyCardMetrics`; postojeći izvor, ne menja se) | kartica, dan | botovi isključeni u resolveru |

## 5. Metrike

Kolona „Plan": S = Standard, P = samo Premium. Prozor je uvek izabrani period po §2. Izvor agregata: `menuAnalyticsDaily` (zbir po danu) i `menuAnalyticsDailyDims` (raspodele po danu).

| ID | Naziv u UI-ju | Plan | Događaj i tačan uslov | Isključenja | Pouzdanost | Raspodele (filteri, P) | Test |
|---|---|---|---|---|---|---|---|
| `otvaranja` | Otvaranja menija | S | broj događaja `stranica` | botovi, nacrt, editor, izlog, prijavljeni ScanMe korisnici, višak iznad kofe | browser sa isključenim JavaScript-om se ne vidi; reklame i blokatori mogu da uklone zahtev (potcenjeno, nikad precenjeno) | `stranica`, `kartica`, `jezik`, `uredjaj`, `sat` | `[otvaranja]` |
| `detalji` | Otvaranja detalja artikla | S | broj događaja `detalj` | isto | samo klik; isti artikal otvoren dva puta = 2 | `artikal`, `stranica`, `jezik`, `uredjaj`, `sat` | `[detalji]` |
| `najotvaraniji` | Najotvaraniji artikli | S | 10 artikala sa najviše `detalji` u periodu; naziv je trenutni naziv artikla u meniju (izvorni jezik); artikal kog više nema u meniju ne ulazi u listu (proverava se najviše 50 najotvaranijih ključeva, granica čitanja) | isto | jednako kao `detalji` | — | `[najotvaraniji]` |
| `skenovi` | Skeniranja QR kartica | S | zbir `dailyCardMetrics.scans` po danu za Menu kartice usluge (kartica čiji je trenutni cilj Menu ili ima vezu sa ovom uslugom, `menuCardRows`) | botovi (resolver) | prijavljeni korisnici se ovde **ne** isključuju (resolver deli više usluga); kartica premeštena u drugu uslugu ostaje u danima kad je bila Menu | po `kartica` (naziv kartice) | `[skenovi]` |
| `zahtevi` | Poslati zahtevi po vrsti (Poziv konobara, Račun, Porudžbina) | S | broj `zahtev_poslat`, odvojeno po `zahtev` | dedupe istog zahteva | potpuno (server) | `zahtev`, `kanal`, `kartica`, `sat` | `[zahtevi]` |
| `zahteviPrihvaceni`, `zahteviZavrseni`, `zahteviOtkazani` | Ishodi zahteva: Prihvaćeni, Završeni, Otkazani (gost / osoblje) | S | broj stvarnih prelaza u taj status **u periodu** (po danu prelaza, ne po danu slanja) | prelaz koji ništa ne menja | potpuno (server) | `zahtev`, `kanal`, `ko` | `[ishodi]` |
| `porudzbine` + ishodi | Porudžbine i ishodi | S | broj `zahtev_poslat` sa `zahtev = order`, po kanalu (standardne stranice / Room service); ishodi porudžbina su ishodi zahteva sa vrstom `order` | isto | potpuno | `kanal` | `[ishodi]` |
| `rezervacije` | Zahtevi za rezervaciju | S | broj `rezervacija_poslata` | dedupe; eksterni sistem rezervacija se ne vidi (ScanMe ne čuva te rezervacije, §11.6) | potpuno za ScanMe formu | `sat` | `[rezervacije]` |
| `rezervacijePrihvacene`, `…Odbijene`, `…Predlozi`, `…Realizovane`, `…Otkazane` | Ishodi rezervacija: Prihvaćene, Odbijene, Predložena izmena, Realizovane, Otkazane (gost / osoblje) | S | broj stvarnih prelaza u taj status u periodu | — | „nije došao" ne postoji kao status i ne meri se (bez automatike, §11.5) | `ko` za otkazane | `[rezervacije]` |
| `sesije` | Sesije | S, kad je pouzdano | broj sesija koje su počele u periodu (§3) | isto kao `otvaranja` | samo uz identifikator i pokrivenost ≥ 95%; inače `null` | — | `[sesija-30]`, `[sesije-pouzdane]` |
| `otvaranjaSaSesijom` | — (interna; panel prikazuje samo „Sesije" ili „nije dostupno") | S | broj događaja `stranica` koji su nosili identifikator sesije; služi samo za pokrivenost = `otvaranjaSaSesijom / otvaranja` (§3) | isto kao `otvaranja` | — | — | `[sesije-pouzdane]` |
| `udeo…` | Udeo ishoda (npr. prihvaćene rezervacije od poslatih) | S | ishod / poslato u istom periodu | — | pravilo 20 (imenilac = poslato); ishod može biti za zahtev poslat pre perioda, pa je udeo približan i nikad se ne prikazuje iznad 100% | — | `[pravilo-20]` |
| `trend` | Trend 7 i 30 dana | S | dnevni niz svake metrike za dane perioda, dani bez događaja su 0 | — | kao metrika | — | `[trend]` |
| `konverzije` | Konverzioni tok: sesije → sa otvorenim detaljem → sa poslatim zahtevom (bilo koje vrste) → sa porudžbinom; i sesije sa rezervacijom | P | broj sesija (po danu početka) u kojima se desio bar jedan `detalj`, `korak zahtev` ili `porudzbina`, `korak rezervacija`; korak se vezuje za sesiju samo iz istog browsera | sesije bez identifikatora | pravilo 20 (imenilac = sesije) i pokrivenost ≥ 95%; ne filtrira se po dimenzijama u V1 | — | `[konverzije]` |
| `poredjenje` | Poređenje sa prethodnim periodom | P | ista metrika za prethodni period iste dužine; razlika i procenat (pravilo 20 na prethodni period) | — | kao metrika | — | `[poredjenje]` |
| filteri | Po stranici, QR kartici, jeziku, uređaju i satu | P | raspodela jedne metrike po jednoj dimenziji za period, sa dnevnim nizom za najviše 20 vrednosti; ostale vrednosti su „Ostalo" | — | najviše 500 različitih vrednosti po metrici i dimenziji u danu, višak ide u `ostalo`; kartica koja više nije Menu kartica lokala nema svoj red nego ulazi u `ostalo` (zbir ostaje tačan); kombinovani filteri (npr. stranica I uređaj) se u V1 ne nude | — | `[raspodela]` |

Uređaj: `telefon`, `tablet`, `racunar`, po `User-Agent` zaglavlju u ulaznoj ruti (grubo, kao resolver kartica; nije fingerprint, ništa se ne čuva osim klase). Jezik: jezik u kom je stranica prikazana (izvorni ili prevod). QR kartica: kartica sa koje je gost otvorio meni u sesiji pozicije (`menuGuestSessions.cardId`); običan link nema karticu.

## 6. Šta ne merimo (i zašto)

- Prosečno ili srednje vreme preuzimanja zahteva — zabranjeno (§14.3).
- Vidljivost artikla pri skrolu kao „pregled" — nije namera gosta (§14.2).
- Jedinstveni posetioci, povratni posetioci, vreme na stranici, dubina skrola — ne objašnjavaju se pouzdano bez praćenja koje ne želimo.
- Vrednost porudžbina u dinarima — porudžbina je zahtev konobaru, ne naplata; cena i ishod se menjaju posle slanja.
- Ishod eksterne rezervacije i klik na eksterni sistem — ScanMe to ne vidi (kandidat za kasnije: broj klikova).
- „Gost nije došao" — nema tog statusa, sistem ne zaključuje sam.
- Kombinacija više filtera — traži sirove događaje i neograničena čitanja.

## 7. Tabele i retencija

| Tabela | Sadržaj | Čuva se | Brisanje |
|---|---|---|---|
| `menuAnalyticsEvents` | sirovi događaji (§4) | **90 dana** od prijema | cron „menu analytics retention" (1 h), po 500 redova u transakciji, najviše 20 nastavaka po pokretanju; test `[retencija-90]` |
| `menuAnalyticsSessions` | otvorene sesije (identifikator, početak, poslednja aktivnost, koraci) | 24 h posle poslednje aktivnosti | isti cron; test `[retencija-sesije]` |
| `menuAnalyticsDaily` | zbir metrika po usluzi i danu | **24 meseca** (dan stariji od istog datuma pre 24 meseca se briše) | isti cron, po `dayKey`; test `[retencija-24m]` |
| `menuAnalyticsDailyDims` | raspodele po usluzi i danu | 24 meseca | isti cron; test `[retencija-24m]` |
| `menuAnalyticsCursors` | dokle je stigao zbir događaja i prenos skenova | trajno (dva reda) | — |

Sabiranje: cron „menu analytics rollup" (15 min) čita sirove događaje po `_creationTime` iza kursora, najviše 500 po transakciji i najviše 20 nastavaka po pokretanju, i upisuje dnevne redove; isti događaj se nikad ne sabira dva puta (kursor i zbir su u istoj transakciji). Cron „menu analytics scans" (1 h) prenosi skenove završenih dana iz `dailyCardMetrics` (dan po dan, 5 usluga po transakciji); pri prvom pokretanju prenosi poslednjih 30 dana.

## 8. Upiti (ugovor za K30)

Svi upiti primaju `menuServiceId` i `danas` (`YYYY-MM-DD` po Beogradu, šalje uređaj; upit ne čita sat) i vraćaju `null` bez prava `analytics.read`.

- `menuAnalytics.pregled({ menuServiceId, danas, dana: 7 | 30 })` — Standard i Premium. Vraća `period`, `dani` (najstariji prvi), `metrike[id] = { ukupno, poDanu }` za svaku metriku, `zahtevi[call|bill|order] = { poslato, prihvaceno, zavrseno, otkazano }`, `zahteviOtkazao { gost, osoblje }`, `porudzbinePoKanalu { standard, roomService }`, `rezervacije { poslato, prihvaceno, odbijeno, predlozeno, realizovano, otkazano, otkazao }`, `sesije { broj | null, pokrivenost }`, `najotvaraniji [{ artikal, naziv, broj }]`, `skenovi [{ kartica, naziv, broj }]`; `konverzije` i `prethodni` su `null`. Procente računa panel sa `procenat()` iz `lib/menu/analitika/definicije.ts` (pravilo 20).
- `menuAnalytics.period({ menuServiceId, danas, od, do, poredi })` — **Premium** (`advancedAnalytics`): bilo koji period do 366 dana unutar 24 meseca, isto što i `pregled` plus `konverzije { sesije, saDetaljem, saZahtevom, saPorudzbinom, saRezervacijom, udeo }` (ili `null` kad sesije nisu pouzdane) i, uz `poredi`, `prethodni { period, ukupno, poredjenje[id] = { razlika, procenat | null } }`. Standard dobija grešku `plan/premium_required`, neispravan period `analytics/invalid_period`.
- `menuAnalytics.raspodela({ menuServiceId, danas, od, do, metrika, dimenzija })` — **Premium**: raspodela jedne metrike po jednoj dimenziji (filteri): `vrednosti [{ vrednost, naziv | null, ukupno, poDanu }]` (najviše 20; nazive za stranicu, artikal i karticu daje upit, ostale panel kroz i18n) i `ostalo { ukupno, poDanu }`.
- Kartica „Poslednjih 7 dana" na Početnoj (K30) čita `pregled` sa `dana: 7`; ne duplira operativne brojke (master §13.2).

## 9. Procena opterećenja (master §2.4)

Procena, ne merenje: pre produkcije je potvrditi load testom (K33/Jovan). Pretpostavke za prosečan lokal u danu: 120 otvaranja i 50 otvaranja detalja (170 događaja iz browsera u ~85 poziva, jer se šalju u paketima), 60 operativnih događaja (20 zahteva, 20 prihvatanja, 18 završetaka, 2 otkazivanja), 5 događaja rezervacija; ukupno ~235 sirovih događaja; 20 Menu kartica; vlasnik otvori Analitiku 2 puta i Početnu 5 puta dnevno. Identifikatori sesije su isključeni (podrazumevano).

Po lokalu dnevno:
- **Upisi ≈ 640:** 170 sirovih iz browsera + 85 kofa (rate limit) + 65 operativnih (u postojećim mutacijama, bez novih poziva) + ~80 dnevnih redova iz zbira (2 reda × ~40 aktivnih pokretanja) + 2 iz skenova + ~237 brisanja posle 90 dana (stabilno stanje).
- **Čitanja ≈ 1.300 dokumenata:** prijem ~255 (lokal po slug-u, usluga, kofa), zbir ~315 (događaji + dnevni redovi), skenovi ~63 (kartice, ciljevi, dnevni skenovi), retencija ~240, panel ~410 (30 dana: 30 + 30 dnevnih redova, 41 za kartice, 20 današnjih skenova; kartica 7 dana; ponovna izvršavanja dok je panel otvoren).
- **Pozivi funkcija ≈ 92:** 85 prijema + ~7 upita panela; cronovi su zajednički (96 + 24 + 24 pokretanja dnevno, plus nastavci).
- **Prostor:** ~300 B po sirovom događaju sa indeksom → ~6,3 MB po lokalu za 90 dana; dnevni agregati ~3 KB po danu → ~2,1 MB za 24 meseca.

| Profil | Sirovi događaji / dan | Pozivi prijema / dan | Upisi / dan | Čitanja / dan | Pozivi funkcija / mesec | Sirovi (90 d) | Agregati (24 m) |
|---|---|---|---|---|---|---|---|
| ~50 lokala | ~11.800 | ~4.300 | ~32.000 | ~65.000 | ~0,14 M | ~0,3 GB | ~0,1 GB |
| ~250 lokala | ~59.000 | ~21.000 | ~160.000 | ~325.000 | ~0,7 M | ~1,6 GB | ~0,5 GB |
| ~500 lokala | ~118.000 | ~43.000 | ~320.000 | ~650.000 | ~1,4 M | ~3,2 GB | ~1,1 GB |
| ~1.000 lokala | ~235.000 | ~85.000 | ~640.000 | ~1,3 M | ~2,8 M | ~6,3 GB | ~2,1 GB |

Uključeni identifikatori sesije dodaju po lokalu ~60 redova sesija i ~120 izmena dnevno, i događaje `korak`. Najveći trošak je prostor sirovih događaja; ako troškovna provera traži manje, master dozvoljava kraće čuvanje (`MENU_ANALYTICS_RAW_DAYS` u `lib/menu/analitika/definicije.ts`, jedna konstanta). Agregati se pišu samo iz crona, pa nema sukoba upisa (OCC) na vrućim redovima; prijem samo dodaje redove.

## 10. Otvorena pitanja

- Saglasnost i politika privatnosti za identifikator sesije: `docs/tasks/BLOCKED.md`, „SCANME MENU V1 — K29".
- Da li Urednik vidi Analitiku (BLOCKED, K24/K28) — danas ne.
- Brisanje starih `menuRequests` i `menuReservations` (K19, K25) nije deo ove retencije: analitika ih ne čita.

## 11. Prikaz u panelu (K30)

- Tekst objašnjenja svake brojke je u `lib/i18n/sr/menu-analitika.ts` i prati redove §5; kad se definicija promeni, menja se i rečenica. Render test „svaka prikazana brojka ima objašnjenje“ (`components/menu/panel/analitika/analitika.test.tsx`) proverava da svaka prikazana brojka pokazuje na svoje objašnjenje.
- **Malo podataka** (`lib/menu/analitika/prikaz.ts`, `stanjePodataka`): osnovica ekrana su sesije kad se mere (`sesije.broj`), inače otvaranja menija. Ispod 20 panel ne prikazuje nijedan procenat (udeo ishoda, promenu, udeo u raspodeli ni tok gosta) i kaže „Još je malo podataka". Iznad toga svaki procenat i dalje traži svoj imenilac od 20 (§2). Testovi: `[pravilo-20]` (`lib/menu/analitika/prikaz.test.ts`) i render test „ispod 20 sesija nema procenata“ (`components/menu/panel/analitika/analitika.test.tsx`).
- **Poređenje** se prikazuje kao razlika rečima („28 više nego prethodnih 30 dana") i procentom samo kad prethodni period ima najmanje 20; boja ne govori da li je promena dobra. Test `[poredjenje]`.
- **CSV** (Premium, `lib/menu/analitika/csv.ts`): izabrani period dan po dan (kolone su metrike §5 osim interne `otvaranjaSaSesijom`; sesije i tok gosta samo kad su pouzdani) sa redom „Ukupno", ili izabrana raspodela dan po dan (vrednosti, „Ostalo", „Ukupno"). UTF-8 sa BOM-om, `;`, CRLF, ISO datumi, zaštita od formula. Samo zbirne brojke: nema identifikatora sesije, imena, kontakta ni ključeva artikala i kartica (nazivi su nazivi iz menija). Test `[csv]`.
- **Kartica „Poslednjih 7 dana"** na Početnoj čita `pregled` sa `dana: 7` i prikazuje samo otvaranja menija, otvaranja artikala, skeniranja i najotvaraniji artikal (bez zahteva i rezervacija, koje su operativni blokovi Početne).
