# MENI — ScanMe Menu V1, ugostiteljstvo (noćni run, 16. 10. 2026.)

> Izvor istine za ceo run. Svaki korak ga čita pre rada. Tehničke planove koraci pišu u
> `docs/meni/planovi/<ID>.md`; ovaj fajl se ne prepisuje, samo se dopunjuju ODLUKE na dnu kad baš mora.
> Poslovni izvor istine je master specifikacija; kad se ovaj plan i master ne slažu, važi master.

## 0. Šta pravimo, u jednoj rečenici
Ugostiteljski V1 proizvoda **ScanMe Menu** — javni meni, editor, Room service, nacrt i objava, QR i pozicije, zahtevi gosta, konobarski panel, rezervacije, klijentski panel i analitika — po master specifikaciji, kao niz vertikala sa testovima i proverom u browseru.

Danas u repou postoje Menu, poručivanje i panel konobara po starijim RFC-003/RFC-004, ali master §16.3 pokazuje da model (stranice, zajednička cena, Room service, statusi, rezervacije, panel, analitika) ne odgovara novoj specifikaciji. Posle runa postoji lokalna grana sa jednim commitom po koraku: novi domen kao proširenje šeme, migracione funkcije (nepuštene), sve površine V1 sa izlogom za proveru bez prijave, testovi i izveštaj `docs/MENI-REPORT.md`. Ništa nije push-ovano ni deploy-ovano.

Dokumenti paketa (samo za čitanje):
- master: `ScanMe-Menu-Jovan-Claude-Handoff/docs/SCANME-MENU-MASTER-SPEC.md`
- handoff: `ScanMe-Menu-Jovan-Claude-Handoff/docs/scanme-menu-handoff/SCANME-MENU-JOVAN-CLAUDE-HANDOFF.md`
- mockupovi i korekcije: `ScanMe-Menu-Jovan-Claude-Handoff/docs/scanme-menu-handoff/mockups/` (`README.md` + 14 PNG)

## 1. Odluke (Jovan, 16. 10. 2026.)

| # | Odluka |
|---|---|
| O1 | Gradi se ceo ScanMe Menu V1 po planu iz foldera `ScanMe-Menu-Jovan-Claude-Handoff` (master + handoff + mockupovi), u repou `scanme`. |
| O2 | Sve ide kao jedan noćni PowerShell run Claude Code promptova koji Jovan pusti i koji radi autonomno, koliko god koraka bude. |
| O3 | Modeli: primarno Opus 5.5; Sonnet 5.5 za manje korake; Haiku 5.5 i Sonnet 5.5 kao radnici (subagenti) unutar Opus koraka. |
| O4 | Za svaki prompt je zapisano koji effort se koristi, da li je režim auto, plan ili goal, i da li je sesija prethodna (nastavak) ili nova (tabela §9, `steps.json` i zaglavlje svakog prompta). |
| O5 | Pravila iz paketa (handoff §2, master §17.4) važe kao Jovanova: bez produkcionog deploy-a, produkcione migracije, seed/reset podataka i preseljenja infrastrukture; ne resetovati, stashovati ni odbacivati postojeće izmene; ne dirati nepovezani Sajam rad; Menu rad u posebnoj grani; widen–migrate–narrow umesto destruktivne migracije. |
| O6 | Hijerarhija izvora (handoff §1.1): ZAKLJUČANO u masteru → ostala pravila mastera → handoff → napomene uz mockupove → slike → RFC-003/RFC-004 i zatečeni kod. Mockupovi nisu finalni UI; Claude pravi bolji i koherentniji UI uz očuvanje zaključanih tokova. |

**Predlozi (Claude, čekaju potvrdu)** — izbori koje sam napravio jer odgovor nije postojao; run ih sledi, a izveštaj ih ponovo navodi:

| # | Predlog | Zašto | Gde se menja |
|---|---|---|---|
| P1 | Grana `codex/jovan-meni-v1-2026-10-16` nastaje lokalno od trenutnog HEAD-a (`codex/jovan-admin-v2-2026-10-11`, `995e26e`). Ništa se ne push-uje. | Runner pravi granu od HEAD-a; admin-v2 dira samo admin, i18n admina i `app/globals.css`, pa se Menu kasnije može prebaciti na `aleksa/main` sa `git rebase --onto aleksa/main codex/jovan-admin-v2-2026-10-11 <grana>`. | `config.json` → `branch` |
| P2 | Kontrolna tačka posle audita (handoff Faza 0) je automatska: K01 završava redom `PRESUDA: NASTAVI` ili `PRESUDA: STOP`; kod STOP korak K02 pravi fajl `.nocni-run/meni/STOP` i run staje. | Jovan je tražio autonoman run, a handoff traži checkpoint. Za ručni checkpoint: `pokreni.cmd -Only K01`, pročitaj `docs/meni/planovi/K01.md`, pa `pokreni.cmd`. | `prompts/K01.md`, `prompts/K02.md` |
| P3 | Šema se samo proširuje. Migracione funkcije postoje i dokazane su testovima, ali se ne puštaju; narrow je kasniji korak uz odobrenje. | O5, master §17.4. | `rules.md` |
| P4 | Ništa ne ide na Convex deployment, ni DEV (`npx convex dev` je zabranjen); `convex/_generated` se osvežava sa `npx convex codegen`. | Run ostaje u granama repoa; DEV deployment je deljen sa drugim granama. Prvi `npx convex dev` posle runa pušta proširenu šemu na DEV. | `config.json` → `deny`, `rules.md` |
| P5 | Nema novih npm paketa; postojeći (`@dnd-kit`, `sharp`, `culori`, `framer-motion`, shadcn/ui, lucide) su dovoljni. | Izmena paketa traži `npm install` i menja lockfile. | `rules.md` |
| P6 | Kurs RSD/EUR: izvor bira K14 (predlog: srednji kurs NBS kroz Convex action i cron, keš sa vremenom osvežavanja); kad kurs nije svež, EUR prekidač se ne prikazuje. | Master §5.3 ostavlja izbor timu. | `docs/menu/MENU-ARHITEKTURA.md` |
| P7 | OAuth Gmail/Microsoft i AI predlog prevoda su iza env ključeva; bez ključeva jasno isključeni; testovi koriste lažni (mock) provajder; nikakvo stvarno slanje ni poziv spoljnog API-ja. | Ključevi aplikacija ne postoje; run ne sme da troši ni šalje. | K16, K26 |
| P8 | Analitika: anonimni identifikator u browser storage-u, bez fingerprintinga; tačka za saglasnost (consent) postoji u kodu, a ponašanje je otvoreno pitanje do pravne provere. | Master §14.4. | K29 |
| P9 | PDV prikaz cena ostaje kakav jeste; konstante cena se usklađuju sa master §2.2.1; pravni tekst alergena je radni tekst iz §7.3. | Master §2.2.1 i §7.3 traže proveru knjigovođe i pravnika. | K03, K14 |
| P10 | Snimci ekrana idu u `output/playwright/meni/` (gitignore) i ne commituju se. | Repo `origin` je javan; snimci su veliki. | `config.json` → `screenshotsDir` |
| P11 | Necommitovani zatečeni folderi (`ScanMe-Menu-Jovan-Claude-Handoff`, `docs/sajam`, `scripts/sajam`, `scripts/admin-v2`) i `next-env.d.ts` ostaju van commitova i stash-a runa. | Ne mešamo nepovezan rad (O5); `next-env.d.ts` se menja pri svakom build-u i dev serveru. | `config.json` → `commitExclude` |
| P12 | Sigurnosni budžet 2.000 USD (procena CLI-ja po API ceni). Na Max pretplati troše se limiti; runner sam čeka reset. | Zaštita od petlje; očekivano je oko četvrtine toga. | `config.json` → `budgetUsd`, ili `pokreni.cmd -BudgetUsd N` |
| P13 | Klijentski panel, editor i konobarski panel poštuju postojeću svetlu i tamnu temu aplikacije (`data-theme`); javni meni koristi paletu lokala (svetlu ili tamnu), ne temu aplikacije. | Aplikacija već ima temu; master §15.2 traži identitet lokala za javni meni. | `docs/menu/MENU-UX.md` |
| P14 | Test fajlovi idu samo u putanje koje `vitest.config.ts` pokreće; konfiguracije (`vitest`, `next`, `tsconfig`, `eslint`, `package.json`) se ne menjaju. | Izmena build konfiguracije traži Jovanovo „može". | `rules.md` |
| P15 | Konačne rute bira K01 i zapisuje ih u recept; polazni predlog: javni meni na `/[slug]/meni` sa podlinkovima stranica, editor na `/[slug]/meni/editor`, konobarski panel na `/panel/[venueCode]`, klijentski panel ScanMe Menu u postojećem klijentskom panelu. | Stabilni javni linkovi i postojeći QR kodovi ne smeju da se pokvare. | `docs/meni/planovi/K01.md` |

## 2. Obim

**Radimo (handoff §3, master §3–§15):** javni meni; editor ponude i izgleda; standardne stranice menija sa zajedničkim artiklima i cenama; izdvojeni Premium Room service; nacrt, pregled, objava i poslednjih 20 snapshotova; QR kodovi, kartice, stolovi i sobe, opcione zone; poziv konobara, zahtev za račun i porudžbina kao zahtev konobaru; rezervacije preko ScanMe forme ili linka ka eksternom sistemu; odvojen, mobilno orijentisan konobarski panel; klijentski panel vlasnika i menadžera; Standard i Premium analitika; do dva jezika u Standardu; stabilan javni link i direktni podlinkovi stranica; usklađene cene paketa; interni ScanMe admin alat za režim.

**Ne diramo:** režim Usluge, Prodaja i preuzimanje, online plaćanje, avanse i refundacije, napredno zakazivanje, duboke API integracije rezervacija, galerije i video, page builder, Enterprise integracije, SMS; Sajam, ScanMe Links render, Venue, Memories, Links editor, landing i prelaunch, admin osim Menu podstranice, cene drugih proizvoda; produkciju, Convex deployment (ni DEV), naloge i plaćanja.

## 3. Zaključana pravila po oblastima (skraćeno; pun tekst je u masteru)

**Stranice i artikli (§3.2, §5.1–§5.7).** Jedna Menu usluga = jedan lokal i jedan zaključan režim (V1: `Ugostiteljstvo`; klijent ga samo vidi, menja ga samo ScanMe admin, §4). `Kompletan meni` se pravi automatski kao podrazumevana standardna stranica; naziv postoji samo u editoru. U UI-ju se kaže **Stranice menija**; dodavanje, preimenovanje, dupliranje, premeštanje, arhiviranje, brisanje (brisanje stranice vezane za QR je blokirano). Jedan stvarni proizvod = jedan artikal u pozadini; prikaz na stranici nosi redosled i vidljivost, nikad cenu. Biblioteka postoji samo u backendu. Obavezno za objavu: naziv, sekcija, osnovna cena ili bar jedna varijanta sa cenom. Varijante (bira se jedna, sopstvena cena), grupe dodataka (jedan ili više izbora, obavezna ili opciona, min/max kao napredno), slobodna napomena — sve podrazumevano isključeno; povezana grupa na više artikala uz pregled uticaja, „izmeni za sve" ili „nezavisna kopija", `Primeni i na druge artikle`. Kombo: poseban artikal od postojećih, ručna cena, upozorenje „proveri cenu" bez promene objavljene cene. `Privremeno nedostupno` je odmah uživo; `Sakrij`, `Ukloni sa ove stranice`, `Obriši artikal` idu u nacrt.

**Cene i Room service (§2, §5.3).** RSD u celim dinarima je jedini izvor istine. Sve standardne stranice dele osnovnu cenu; nema cenovnog override-a po stranici. Room service je poseban Premium modul (ne stranica): sopstveni izbor, kategorije i redosled; obračun **osnovna → procentualni markup (svi ili izabrani) → ručna RS cena → jednokratna naknada na celu porudžbinu**; markup se zaokružuje na najbliži dinar; ručna cena ostaje tačno uneta; bez ručne cene promena osnovne cene preračunava RS cenu; sa ručnom cenom nastaje upozorenje (stara osnovna, nova osnovna, RS cena; `Zadrži ručnu cenu` / `Ponovo izračunaj prema markup-u`); UI kaže poreklo cene (preuzeta, izračunata, ručna). EUR je informativan (`~`, dve decimale), samo kad je kurs svež. Cene paketa: ScanMe Menu 1.490 / 14.900 RSD; Premium nalog 990 / 9.990 RSD; Menu + ScanMe Links 1.990 / 19.900 RSD. Premium je na nivou naloga i otključava Room service, AI predlog prevoda, zakazane akcije, dodatne layout/dizajn varijante, naprednu analitiku i CSV, smanjen brending; Standard ima najviše 2 jezika po Menu usluzi.

**Nacrt i objava (§6.1).** Svaka izmena se automatski čuva u nacrt; javna verzija se menja tek na `Objavi`; jasno stanje ima/nema neobjavljenih izmena; pregled nacrta pre objave; greška u objavi ne kvari javnu verziju; provera novijih izmena od poslednjeg pregleda; greške blokiraju, upozorenja traže svesnu potvrdu; svaka objava pravi snapshot, čuva se poslednjih 20; vraćanje verzije pravi novi nacrt; prikaz ko uređuje isti artikal; konflikt iste vrednosti se ne gazi tiho. Migraciju radi ScanMe (interni alat, uvoz kao nacrt), nikad klijent (§6.2).

**Javni meni (§7).** Layouti `Tok` (sticky/anchor navigacija), `Kategorije` (vizuelni izbor kategorije), `Kompaktno` (samo tekst). Slika, ikonica iz seta ili bez medija (ne u Kompaktno). Pretraga i filteri samo kad ih lokal uključi; prazni filteri se ne prikazuju; nema filtera raspona cena; stanje se čuva pri povratku sa detalja. Alergeni: opcioni sistem lokala; 14 kategorija + `Drugo`; `Sadrži` i `Može sadržati tragove` odvojeno; gost označi alergen, artikli dobijaju upozorenje na kartici i u detalju, ništa se ne sakriva; nepopunjen podatak nikad ne znači bezbedno; radni tekst iz §7.3. Akcija: regularna i akcijska cena ili procenat, oznaka, opcioni početak i kraj; ručna je Standard, zakazana Premium. Jezici: upravljanje u Podešavanjima; ista struktura; nedostajući prevod → izvorni tekst; editor označava nedostajući i zastareo prevod; AI predlog se nikad ne objavljuje sam. Stabilan javni link, podlink stranice, link bez pozicije ne glumi poziciju. Slike: jedna glavna po artiklu, do 10 MB, web format i responsive dimenzije do oko 2.400 px, bez metapodataka, lazy loading, ikonica kao rezerva. Osnovni razdelnik kad ima više stranica (logo, naziv, identitet, kartice stranica sa opcionom slikom ili ikonicom, redosled, vidljivost; §3.4).

**Zahtevi gosta, QR i pozicije (§8, §9).** Radnje (svaka opciona po lokalu): pozovi konobara; zatraži račun uz gotovina/kartica; porudžbina kao zahtev konobaru na proveru (nikad kuhinji, bez plaćanja); zahtev za rezervaciju; eksterni sistem rezervacija. Statusi: `Novi → Prihvaćen → Završen`, poseban ishod `Otkazan`; nema `Konobar je krenuo`. Zvuk kratak i opcion, isključiv u konobarskom panelu; podsetnik po podešavanju lokala; nema automatskog prosleđivanja. QR nosi identitet kartice, stola ili sobe; gost ne bira sto; link bez pozicije ne izmišlja poziciju. Klijent vidi vezu kartica–pozicija, menja naziv/broj, raspoređuje stolove, opciono upisuje broj mesta, vidi status kartice; više QR kartica bez naknade. Zone opcione, prikazane samo kad postoje; `Bez zone` dostupno svima; konobar menja svoju aktivnu zonu, menadžer raspodelu; nema automatskog predloga. Zauzetost je opcioni ručni modul (slobodan, zauzet, rezervisan, van upotrebe); bez modula sto je neutralan (crta), nikad „slobodan"; sistem nikad sam ne oslobađa sto.

**Konobarski panel (§10).** Poseban radni prostor; telefon i tablet primarni, desktop podržan; jedan glavni ekran; vizuelni i tabelarni prikaz sa svim paralelnim stanjima (zvonce = poziv, račun, porudžbina, rezervacija), legenda u tabeli; jedan kontekstualni sidebar/drawer (bez sto: pregled događaja i rezervacija; sa sto: detalj stola); tačno vreme + živo proteklo vreme, posle praga (npr. 15 min) crveno i blag puls; isti format svuda. Trocifreni PIN, jedinstven među aktivnim osobljem lokala, samo hash, blokada posle 5 pogrešnih pokušaja, reset Vlasnik ili Menadžer, prijava uređaja do 12 h ili odjave, audit u pozadini. Uloge: `Vlasnik`, `Menadžer`, `Urednik`, `Osoblje`. Izbačeno: istorija stola na operativnom ekranu, prosečno vreme preuzimanja, automatska preraspodela.

**Rezervacije (§11).** Funkcionalnost Menu usluge, može da se isključi. ScanMe forma: ime, termin, broj gostiju, kontakt po konfiguraciji (email, telefon ili oba), opciona napomena; sva prikazana polja obavezna osim napomene; gost ne bira sto. Obrada ručna: prihvati, odbij ili predloži izmenu; osoblje vezuje sto; u terminu označava realizaciju; sto postaje zauzet samo uz modul zauzetosti. Nema podrazumevanog trajanja ni roka; menadžer podešava koliko se rezervacija drži posle termina; posle praga vizuelno upozorenje, bez automatskog otkazivanja. Odgovor gostu: povezan Gmail/Microsoft preko OAuth-a (bez lozinke), slanje iz mailboxa lokala; inače `mailto:`; telefon; šabloni (prihvatanje, odbijanje, predlog izmene) sa izmenom teksta i potpisa; telefonski ishod opciono. Eksterni sistem: link/redirect, ScanMe ne čuva njegove rezervacije; radno vreme je uvek u Podešavanjima. Otkazivanje gosta do realizacije, preko sigurnog linka i `Moji zahtevi`; konobarski panel jasno i odmah obaveštava.

**Klijentski panel (§13).** Navigacija tačno: Početna, Editor, Operativa, Lokal i QR, Funkcionalnosti, Tim i pristupi, Analitika, Podešavanja (Analitika pretposlednja). Režim se prikazuje nenametljivo („ScanMe Menu · Ugostiteljstvo"), bez promene. Početna: da li nešto traži pažnju, sažetak tekućih događaja bez upravljanja, analitički pregled, brzi ulazi, status objavljene i radne verzije; bez dupliranja brojki. Vizuelni smer: topao svetao okvir, crna i ScanMe zelena kao akcenti, mirne zaobljene kartice, tamnija kartica sa analitikom 7 dana (mockup 01; smer, ne piksel). Editor: direktan ulaz u stvarni meni (bez uvodnog ekrana), režimi `Ponuda` i `Izgled`, stalno dostupni `Pregled`, status čuvanja i `Objavi`; desktop struktura levo, rad u sredini, pregled desno; tablet struktura u draweru, pregled kao preklop; telefon `Struktura / Uredi / Pregled`; ostala pravila §13.4. Operativa: samo pregled stanja i rada osoblja, filteri, jedan nenametljiv ping odgovornom konobaru; za rad menadžer ulazi u konobarski panel. Funkcionalnosti: prekidači sposobnosti, Room service (Premium) ovde se uključuje; bez zvuka; bez rezervacionih polja kad je eksterni sistem. Tim i pristupi: članovi, uloge, PIN osoblja, zone samo kad postoje. Podešavanja: radno vreme, jezici, poslovni email/integracija, pravila brenda i naloga.

**Analitika (§14).** Zasebna sekcija; Standard: zahtevi po vrsti, rezervacioni zahtevi i ishodi, porudžbine i ishodi, otvaranja menija, sesije (kad je pouzdano), najotvaraniji detalji artikala, skenovi po QR kartici, trend 7 i 30 dana; Premium: 90 dana i proizvoljan period, poređenje sa prethodnim periodom, filteri (stranica, QR, jezik, uređaj, vreme), konverzioni tokovi, CSV. Vidljivost artikla pri skrolu nije „pregled". Sesija se završava posle 30 min neaktivnosti; anonimni identifikator bez fingerprintinga; procenti tek od 20 relevantnih sesija; sirovi događaji 90 dana, dnevni agregati 24 meseca; svaka brojka ima pisanu definiciju i proverljiv izvor; nema prosečnog vremena preuzimanja; mockup brojke nisu podaci.

**Nikad kao podrazumevano (§20):** slanje porudžbine kuhinji; online plaćanje; SMS; gost bira sto; zaključivanje da je sto slobodan ili da su gosti otišli; obavezna zauzetost; obavezni alergeni; skrivanje artikala po alergenima; filter raspona cena; klijentska migracija; vidljiva biblioteka kao obavezan korak; klijent menja režim; automatsko prosleđivanje zahteva; podrazumevano trajanje rezervacije; istorija stola na operativnom ekranu; prosečno vreme preuzimanja; neograničen page builder; mockup brojke kao rezultati.

**Korekcije mockupova (README):** ScanMe crno-zelena paleta je za panel i admin, nikad podrazumevana za javni meni (opcija „ScanMe" se ne nudi kao paleta javnog menija); layouti su Tok/Kategorije/Kompaktno, Kompaktno bez slike i ikonice; „Editor · U pripremi", „zahtev za preuzimanje" i „Preuzimanja" ne postoje u V1; Room service je izdvojena grupa `Posebne usluge`, vidljiva samo kad je uključen; `Kompletan meni` ima inline izmenu cene i nije javni naslov; PIN je trocifren (slika ima šest polja); neutralan sto je crta, zauzetost je opciona; statusi `Novi / Prihvaćen / Završen` i `Otkazan`, bez toka ka kuhinji; raspored sale je šematski i podesiv, ne fotorealističan; sadržaj iza modala objave i sve brojke na slikama nisu izvor istine.

**Acceptance scenariji (§21.1–§21.5)** — jednostavan kafić, restoran sa operativom, prestižni restoran, hotel i room service, rezervacija — su kontrolna lista revizije (K34).

## 4. Domen i podaci (tehnika; konačno u K01 i receptu)
- Tabele, polja, indeksi i veze bira K01 (`docs/meni/planovi/K01.md`) i K02 ih zapisuje u recept `docs/menu/MENU-ARHITEKTURA.md`. Postojeće tabele (`menus`, `menuGroups`, `menuItems`, `itemVariants`, `itemPairings`, `menuDayparts`, `orderingConfig`, `orderingItems`, `orderingGuests`, `staffPins`, `orderingShifts`, `serviceRequests`, `serviceRequestItems`, `cards`, `cardTargets`, `accessChannels`, `digitalQrCodes`, `mediaAssets`, `entitlements`, `subscriptions`, `businessMemberships`, `accountMemberships`) ostaju funkcionalne; novi model ide kroz nove tabele i opciona polja.
- Svaka nova javna Convex funkcija proverava identitet i tenant na backendu; identitet se nikad ne uzima iz argumenata. Upiti su indeksirani i ograničeni; nema per-item fanout-a; konobarski panel ima pretplate po lokalu, ne po stolu.
- Sloj kompatibilnosti: stari javni meniji rade dok nisu migrirani; postojeće QR kartice (uključujući sajamske) rade isto kao pre.

## 5. Tehnika i granice
- **Nov kod ide u:** `lib/menu/**` (čista logika, testovi `lib/menu/**/*.test.ts`); `components/menu/**` po oblastima (UI, testovi `components/menu/**/*.test.tsx`); novi Convex moduli sa jasnim imenima, validatori u `convex/lib/`, testovi pored modula; rečnici `lib/i18n/sr/menu*.ts` i tipovi u `lib/i18n/types.ts`; rute po receptu; dokumentacija proizvoda u `docs/menu/` (recept, UX standard, definicije analitike, hardening, rečnik).
- **Paketi:** samo postojeći (P5).
- **Performanse:** javni meni bez per-item upita, SSR i minimalan klijentski JS; budžet i merenja malog (oko 20 artikala) i velikog (oko 400 artikala) menija na produkcionom buildu (K14, K33).
- **Pristupačnost, i18n, teme, telefon:** WCAG 2.1 AA (kontrast 4.5:1, tastatura, vidljiv fokus, aria na srpskom), mete 44 px (konobar 48 px), `prefers-reduced-motion`, svaki nov tekst kroz `lib/i18n`, teme po P13, širine 1440, 1024, 768, 390 bez vodoravnog skrola.
- **Ne dirati:** spisak u `.nocni-run/meni/rules.md` (Apsolutne zabrane).

## 6. Provere posle svakog koraka
`node .nocni-run/meni/alati/typecheck.mjs` (next typegen + tsc), `npx eslint --ignore-pattern ".nocni-run/**"` (isto što i `npm run lint`, bez fajlova runa), `npx vitest run --testTimeout=30000 --hookTimeout=60000`, `npm run harness:namespace`; runner još pušta `npm run build` i `npm run harness:check` (zlatni snimci ScanMe Links renderera, 177 slučajeva × 2 širine).

## 7. Izlog (dev rute) i parametri
Sve rute: samo u dev-u (`notFound()` u produkciji), `noindex`, prave komponente sa tipiziranim fixtures, bez prijave; `?tema=svetla|tamna` za temu aplikacije; nepoznat parametar daje podrazumevano stanje.

| Ruta | Parametri (dodaju ih koraci) |
|---|---|
| `/dev/menu-editor-preview` | postojeći `state=empty`, `design=dark`; `stanje=prazno|veliki|izaberi-vise|brzi-unos|konflikt`; `fokus=artikal|varijante|kombo|room-service|prevodi`; `tab=izgled`; `modal=objava|objava-greske|verzije`; `plan=standard|premium` |
| `/dev/menu-public-preview` | `layout=tok|kategorije|kompaktno`; `mediji=slika|ikonica|bez`; `alergen=<kod>`; `jezik=<kod>`; `valuta=eur`; `stanje=razdelnik|veliki|prazno`; `paleta=<id>`; `pozicija=sto|soba`; `korpa=1`; `moji-zahtevi=1`; `rezervacija=forma|poslato` |
| `/dev/menu-lokal-preview` | `pogled=lista|raspored|kartice` |
| `/dev/menu-konobar-preview` | `ekran=pin|red|detalj|sala-raspored|sala-tabela|sto|rezervacije`; `stanje=offline`; `rezervacija=1` |
| `/dev/menu-panel-preview` | `sekcija=pocetna|editor|operativa|lokal|funkcionalnosti|tim|analitika|podesavanja`; `plan=standard|premium`; `uloga=vlasnik|menadzer|urednik`; `stanje=malo-podataka`; `rezervacije=eksterni` |

## 8. Radnici
Opus vodi svaki Opus korak i sam radi deljene fajlove i ključne odluke. Sonnet 5.5 radnici (`Agent`, `model: "sonnet"`) pišu kod na disjunktnim spiskovima fajlova, kritikuju snimke i rade bezbednosne preglede; Haiku 5.5 radnici (`model: "haiku"`) rade inventar, grep, trijažu testova i snimke alatom. Sonnet koraci (K31, K32) koriste Haiku radnike. Pravila su u `rules.md`.

## 9. Koraci
Tačne vrednosti modela, efforta, režima i sesije su u `.nocni-run/meni/steps.json`. Prompt svakog koraka je u `.nocni-run/meni/prompts/<ID>.md`. Sesija „prethodna" znači nastavak sesije koraka iz zagrade (`ista` u `steps.json`).

| ID | Naslov | Model | Effort | Režim | Sesija |
|---|---|---|---|---|---|
| K01 | Arhitektura i code-gap audit (plan) | Opus 5.5 | max | plan | nova |
| K02 | Temelj domena: recept, šema, uloge, režim, stranice, zajednički artikal | Opus 5.5 | xhigh | goal | prethodna (K01) |
| K03 | Cene, entitlementi i Room service model | Opus 5.5 | xhigh | goal | nova |
| K04 | Model artikla: varijante, dodaci, kombo, akcije, alergeni | Opus 5.5 | xhigh | goal | nova |
| K05 | Nacrt, objava, snapshotovi i konflikti (backend) | Opus 5.5 | xhigh | goal | nova |
| K06 | Migracija starog modela i sloj kompatibilnosti | Opus 5.5 | xhigh | goal | nova |
| K07 | UX temelj i izlog: MENU-UX, tokeni, primitivi, dev rute | Opus 5.5 | xhigh | goal | nova |
| K08 | Klijentski panel: shell, navigacija, uloge, rute | Opus 5.5 | xhigh | goal | nova |
| K09 | Plan: Editor | Opus 5.5 | high | plan | nova |
| K10 | Editor: ulaz, autosave, stranice, inline cena, brzi unos | Opus 5.5 | xhigh | goal | prethodna (K09) |
| K11 | Editor: prevlačenje, Premesti, Izaberi više, stanja artikla | Opus 5.5 | xhigh | goal | nova |
| K12 | Plan: Javni meni | Opus 5.5 | high | plan | nova |
| K13 | Javni meni: linkovi, razdelnik, tri layouta, mediji, detalj | Opus 5.5 | xhigh | goal | prethodna (K12) |
| K14 | Javni meni: pretraga, alergeni, jezici, valuta, performanse | Opus 5.5 | high | goal | nova |
| K15 | Editor: detalj artikla, slike, varijante, alergeni, akcije | Opus 5.5 | high | goal | nova |
| K16 | Editor: kombo, prevodi, Room service kontekst | Opus 5.5 | high | goal | nova |
| K17 | Editor: Izgled (layout, palete, fontovi, pregled) | Opus 5.5 | xhigh | goal | nova |
| K18 | Editor: objava, verzije, prisustvo i konflikti | Opus 5.5 | xhigh | goal | nova |
| K19 | Plan: Lokal i QR, zahtevi gosta, konobarski panel | Opus 5.5 | high | plan | nova |
| K20 | Lokal i QR: pozicije, zone, raspored, kartice, sken | Opus 5.5 | xhigh | goal | prethodna (K19) |
| K21 | Gost: poziv konobara, račun, porudžbina kao zahtev, Moji zahtevi | Opus 5.5 | xhigh | goal | nova |
| K22 | Konobarski panel: PIN, sesija, radni red, detalj zahteva | Opus 5.5 | xhigh | goal | nova |
| K23 | Konobarski panel: sala, sto, vreme, zvuk, zone, zauzetost | Opus 5.5 | xhigh | goal | nova |
| K24 | Plan: Rezervacije i sekcije panela | Opus 5.5 | high | plan | nova |
| K25 | Rezervacije: forma, obrada, sto, kašnjenje, otkazivanje | Opus 5.5 | xhigh | goal | prethodna (K24) |
| K26 | Odgovor gostu: mailbox (OAuth), mailto, šabloni | Opus 5.5 | high | goal | nova |
| K27 | Panel: Početna, Operativa, Lokal i QR, Funkcionalnosti | Opus 5.5 | xhigh | goal | nova |
| K28 | Panel: Tim i pristupi, Podešavanja, interni admin alat | Opus 5.5 | high | goal | nova |
| K29 | Analitika: definicije, događaji, sesije, agregati | Opus 5.5 | xhigh | goal | nova |
| K30 | Analitika: sekcija, Premium, CSV, pregled na Početnoj | Opus 5.5 | high | goal | nova |
| K31 | Prolaz: tekst, rečnik, prazna stanja i greške | Sonnet 5.5 | high | goal | nova |
| K32 | Prolaz: telefon, tablet i tamna tema | Sonnet 5.5 | high | goal | nova |
| K33 | Hardening: pristupačnost, stanja, performanse, bezbednost | Opus 5.5 | xhigh | goal | nova |
| K34 | Revizija: regresije, bezbednost, specifikacija | Opus 5.5 | max | goal | nova |
| K35 | Završni izveštaj i snimci | Opus 5.5 | high | auto | nova |

## 10. Kraj runa
- `docs/MENI-REPORT.md`: šta je urađeno po oblasti mastera, šta nije, BLOKADE, odluke i predlozi koji traže Jovanov stav, šta ručno proverava, i tačan redosled za deploy (migracije, env, OAuth, pravna provera) — ništa od toga se ne radi u runu.
- Dokumentacija proizvoda u `docs/menu/` (recept, UX standard, definicije analitike, hardening, rečnik, predlog izmena specifikacije).
- Snimci u `output/playwright/meni/<ID>/` (lokalno, ne u gitu).

<!-- Odluke koje koraci donesu tokom noći idu u njihove sekcije u docs/MENI-PROGRESS.md (red ODLUKE:), ne ovde. -->
