# ScanMe Menu V1 — završni izveštaj noćnog runa MENI

**Datum:** 21. 10. 2026. **Grana:** `codex/jovan-meni-v1-2026-10-16` (lokalna, nije push-ovana). **Osnova:** `codex/jovan-admin-v2-2026-10-11`.
**Izvori:** `docs/MENI-PLAN.md`, `docs/MENI-PROGRESS.md`, `docs/menu/` (recept, UX, analitika, hardening, rečnik, revizija), `docs/tasks/BLOCKED.md` (odeljci `SCANME MENU V1 — Kxx`).

Ništa iz ovog izveštaja nije potvrdio vlasnik. Svaki izbor koji je poslovna odluka je predlog runa i čeka Jovana.

## 0. Ukratko

- Ugostiteljski V1 postoji na lokalnoj grani: 35 commitova, 894 putanje. Pokriva javni meni, editor, Room service, nacrt i objavu, QR i pozicije, zahteve gosta, konobarski panel, rezervacije, klijentski panel i analitiku.
- Ništa nije pušteno. Šema nije na DEV-u, migracija nije pokrenuta, env ključevi nisu postavljeni, OAuth aplikacije nisu registrovane.
- Testovi: pre runa 4.622 prolazi; sada 14.202 (2 preskočena kao i pre). Typecheck, eslint, `harness:namespace` i build prolaze (rezultat u §9).
- Revizija (K34): 506 zaključanih stavki mastera, 467 ispunjeno, 10 delimično, 7 ne. Svih 7 „ne" su cene paketa (BLOKADA K03).
- Najvažnije otvoreno: cena paketa „Kompletan"; provera uloge u `convex/cards.ts`; pozivnica osobi bez ScanMe naloga; pisci podešavanja stranice (povratak, zajednička navigacija); pun pregled nacrta; pravna provera alergena, kolačića i analitike.
- **Run nije video nijedan ekran iza prave prijave sa pravim podacima.** Sve površine su proverene kroz izlog (izmišljeni podaci) i statički paket stvarnih komponenti, jer je auto-mode odbio dev server.

## 1. Kako da pregledaš granu

```
git log --oneline codex/jovan-admin-v2-2026-10-11..codex/jovan-meni-v1-2026-10-16
git diff --stat codex/jovan-admin-v2-2026-10-11...codex/jovan-meni-v1-2026-10-16
```

Lokalno: `npm run dev`, pa `http://localhost:3000/dev/...`. Izlog ne traži prijavu i ne zove Convex. U produkciji sve rute vraćaju 404. Svaka ruta prima `?tema=svetla|tamna`. Nepoznat parametar daje podrazumevano stanje.

| Ruta | Parametri | Šta pokazuje |
|---|---|---|
| `/dev/menu-public-preview` | `primer=kafic\|restoran\|prestizni`; `layout=tok\|kategorije\|kompaktno`; `mediji=slika\|ikonica\|bez`; `paleta=<id>`, `design=dark`; `stanje=razdelnik\|veliki\|prazno`; `stranica=<slug>`; `detalj=1`; `alergen=mleko,gluten`; `jezik=en`; `valuta=eur`, `kurs=star`; `pretraga=…`, `filter=…`; `pozicija=sto\|soba`, `korpa=1`, `moji-zahtevi=1`, `zahtev=poziv\|racun\|porudzbina`, `stanje-zahteva=…`, `greska=cena\|nedostupno\|limit`, `veza=offline`; `rezervacija=forma\|poslato\|otkazivanje\|otkazano\|nevazece\|greska`, `kontakt=email\|telefon\|oba`, `rezervacije=eksterni\|iskljuceno`; `renderer=stari` | javni meni gosta: tri layouta, razdelnik stranica, detalj, alergeni, jezici, EUR, traka gosta (poziv, račun, korpa), Moji zahtevi, Room service sobe, forma i otkazivanje rezervacije |
| `/dev/menu-editor-preview` | `stanje=prazno\|veliki\|brzi-unos\|izaberi-vise\|konflikt`; `pogled=struktura\|uredi\|pregled`; `fokus=artikal\|varijante\|kombo\|prevodi\|room-service`; `tab=izgled`; `modal=objava\|objava-greske\|objava-zastarelo\|verzije`; `plan=standard\|premium`; stari `state=empty`, `design=dark`, `editor=stari` | editor: Ponuda i Izgled, stranice, sekcije, artikli, inline cena, brzi i tabelarni unos, prevlačenje, Izaberi više, detalj artikla, kombo, prevodi, Room service, objava, verzije, konflikt |
| `/dev/menu-konobar-preview` | `ekran=pin\|red\|detalj\|sala-raspored\|sala-tabela\|sto\|rezervacije`; `stanje=offline\|blokada\|pogresan-pin\|bez-peppera\|prazno\|mnogo`; `uloga=osoblje\|menadzer`; `zauzetost=1`; `rezervacija=1\|rv_XX`; `zona=…`, `zvuk=…` | konobarski panel: PIN, radni red, detalj zahteva, sala (raspored i tabela), detalj stola, zauzetost, rezervacije, offline |
| `/dev/menu-panel-preview` | `sekcija=pocetna\|editor\|operativa\|lokal\|funkcionalnosti\|tim\|analitika\|podesavanja\|primitivi`; `plan=standard\|premium`; `uloga=vlasnik\|menadzer\|urednik\|osoblje\|admin`; `stanje=…` (npr. `malo-podataka`, `prazno`, `bez-sesija`, `bez-zona`); `rezervacije=forma\|eksterni\|iskljuceno`; `posta=povezana\|nije\|nedostupna\|greska`; `modal=pozivnica\|pin\|link-panela`; `poziv=vazeca\|istekla\|…` | klijentski panel: svih osam sekcija, uloge, Premium, prazna stanja, pozivnica |
| `/dev/menu-lokal-preview` | `pogled=lista\|raspored\|kartice`; `stanje=prazno\|bez-zona\|hotel` | Lokal i QR: mesta, zone, šematski raspored, QR kartice |
| `/dev/menu-admin-preview` | `fixture=1`; `modal=rezim\|uvoz` | interni admin: Režim usluge i Uvoz u nacrt |

Prave rute posle puštanja (traže uslugu novog modela): javni meni `/[slug]/meni` i `/[slug]/meni/[stranica]`, `/[slug]/meni/room-service`, `/[slug]/meni/zahtevi`, `/[slug]/meni/rezervacija`; klijentski panel `/[slug]/client-panel/meni/**`; konobarski panel `/[slug]/konobar/[kod]`; QR hop `/r/[cardCode]/meni`. Pun spisak: `docs/menu/MENU-ARHITEKTURA.md` §8.

## 2. Šta je urađeno, po poglavljima mastera

„Snimci" su folderi u `output/playwright/meni/` (lokalno, van gita). Finalni snimci su u `K35/`.

| Oblast (§) | Šta radi | Gde je kod | Testovi | Snimci |
|---|---|---|---|---|
| §2 Cene i Premium | Premium na nivou naloga otključava Room service, AI predlog prevoda, zakazane akcije, dodatne varijante izgleda, naprednu analitiku i CSV, smanjen potpis; Standard do 2 jezika. **Cene paketa nisu upisane (BLOKADA K03).** | `lib/menu/capabilities.ts`, `convex/lib/menuCapabilities.ts`; `lib/pricing/menu-launch-proposal.test.ts` (predlog, bez izmene konstanti) | `convex/menuCapabilities.test.ts`, `lib/pricing/menu-launch-proposal.test.ts` | — |
| §3 Usluga, stranice, razdelnik | Jedna usluga po lokalu; `Kompletan meni` nastaje sam; stranice se dodaju, preimenuju, dupliraju, premeštaju, arhiviraju i brišu (ne sa aktivnim QR-om); svaka stranica ima javni naslov; razdelnik kad je vidljivo više stranica. | `convex/menuServices.ts`, `convex/menuPages.ts`, `components/menu/javni/razdelnik.tsx` | `convex/menuServices.test.ts`, `convex/menuPages.test.ts`, `components/menu/javni/razdelnik.test.tsx` | K10, K13, K35 |
| §4 Režim | `menuServices.mode` (V1: Ugostiteljstvo); klijent ga vidi, menja samo ScanMe admin (kartica Režim u admin podstranici). | `convex/menuServices.ts`, `components/admin/menu-admin-rezim.tsx` | `convex/menuServices.test.ts`, `components/admin/menu-admin-rezim.test.tsx` | K28 |
| §5 Artikal, cena, Room service | Jedan artikal, jedna osnovna cena za sve stranice; prikaz nosi redosled i vidljivost; varijante, grupe dodataka (povezane), napomena, kombo sa „proveri cenu", akcije, alergeni, oznake, dostupnost uživo. Room service: Premium modul sa svojim izborom, kategorijama i obračunom osnovna → markup → ručna → naknada jednom. | `convex/menuCatalog.ts`, `menuArticleOptions.ts`, `menuCombos.ts`, `menuPromos.ts`, `menuAvailability.ts`, `menuRoomService.ts`, `lib/menu/room-service-pricing.ts` | `convex/menuCatalog.test.ts`, `menuArticleOptions.test.ts`, `menuRoomService.test.ts`, `lib/menu/room-service-pricing.test.ts` | K15, K16 |
| §6 Nacrt, objava, verzije, migracija | Autosave u nacrt; `Objavi` sa greškama, upozorenjima i promenama cena; atomična objava; 20 verzija; vraćanje pravi nacrt; prisustvo i konflikt iste vrednosti. Migracija starog menija i interni uvoz u nacrt (nepušteni). | `convex/menuPublishing.ts`, `menuPresence.ts`, `menuMigration.ts`, `menuAdmin.ts` (`importDraftV2`), `components/menu/studio/{objava,verzije,konflikt}/` | `convex/menuPublishing*.test.ts`, `menuMigration.test.ts`, `menuLegacyCompat.test.ts`, `menuAdminImportV2.test.ts` | K18 |
| §7 Javni meni | Tri layouta, slika/ikonica/bez (ikonica i kad slika ne učita), detalj, pretraga i filteri po izboru lokala, alergeni (upozorenje, ništa se ne sakriva), jezici, EUR uz svež kurs, akcije, stabilan link i podlink, slike do 10 MB. | `components/menu/javni/`, `app/[slug]/meni/**`, `convex/menuPublic.ts`, `convex/menuFx.ts`, `convex/menuMedia.ts`, `app/api/meni/slike/route.ts` | `components/menu/javni/*.test.tsx`, `convex/menuPublic*.test.ts`, `lib/menu/{search,filters,allergen-warnings,currency}.test.ts` | K13, K14, K34, K35 |
| §8 Zahtevi gosta | Pozovi konobara, račun (gotovina/kartica), porudžbina kao zahtev konobaru (cene se ponovo računaju na serveru), Moji zahtevi 12 h, otkazivanje dok je zahtev Novi; statusi `Novi → Prihvaćen → Završen`, `Otkazan`. | `convex/menuGuest.ts`, `convex/lib/menuRequests.ts`, `components/menu/gost/`, `app/[slug]/meni/{zahtevi,room-service}/` | `convex/menuGuestRequests.test.ts`, `lib/menu/{cart,request-status}.test.ts`, `components/menu/gost/gost.test.tsx` | K21 |
| §9 QR i pozicije | Mesta (sto, soba, ostalo), opcione zone, šematski raspored, QR kartice sa dijagnostikom, veza kartica → stranica i mesto, štampa; hop otvara sesiju gosta (pozicija samo u HttpOnly kolačiću); kartica bez veze radi kao pre runa. | `convex/menuFloor.ts`, `menuQr.ts`, `convex/lib/menuQrResolve.ts`, `app/r/[cardCode]/meni/route.ts`, `components/menu/lokal/` | `convex/menuQr*.test.ts`, `menuFloor.test.ts`, `menuGuest.test.ts`, `components/menu/lokal/*.test.tsx` | K20 |
| §10 Konobarski panel | `/[slug]/konobar/[kod]`; trocifren PIN (HMAC + PBKDF2, blokade uređaja i lokala), sesija 12 h; radni red, detalj zahteva, sala (raspored i tabela) sa svim paralelnim stanjima, detalj stola, živi tajmer sa pragom, zvuk i podsetnik, zone, opcioni modul zauzetosti; sat prema serveru. | `convex/menuWaiter.ts`, `menuStaff.ts`, `convex/lib/menuPin.ts`, `components/menu/konobar/` | `convex/menuWaiter*.test.ts`, `menuStaff.test.ts`, `components/menu/konobar/*.test.tsx` | K22, K23, K35 |
| §11 Rezervacije | Isključeno / ScanMe forma / sistem lokala; forma u radnom vremenu, bez izbora stola; prihvati, odbij, predloži; vezivanje stola; dolazak; upozorenje posle zadržavanja (bez automatskog otkazivanja); otkazivanje linkom. Odgovor gostu iz pošte lokala (OAuth), `mailto:` i telefon, šabloni. | `convex/menuReservations.ts`, `convex/lib/menuReservationWriter.ts`, `convex/menuMail*.ts`, `components/menu/{gost/rezervacija,konobar/rezervacije,odgovor}/` | `convex/menuReservations*.test.ts`, `menuMail*.test.ts`, `components/menu/gost/rezervacija.test.tsx` | K25, K26 |
| §13 Klijentski panel | Osam sekcija tačnim redom; uloge Vlasnik, Menadžer, Urednik; Početna (pažnja, meni, stanje u lokalu, 7 dana); Operativa (samo pregled + podsetnik); Lokal i QR; Funkcionalnosti; Tim i pristupi (pozivnice, PIN, link panela, aktivnost); Podešavanja (radno vreme, jezici, pragovi, pošta, šabloni, brend). Editor u panelu: Ponuda, Izgled (palete, pisma, rasporedi), Pregled. | `app/[slug]/client-panel/meni/**`, `components/menu/panel/`, `components/menu/studio/`, `convex/menuPanel.ts`, `menuStudio.ts`, `menuTeam.ts`, `menuSettings.ts`, `menuPresentation.ts` | `components/menu/panel/**/*.test.tsx`, `components/menu/studio/*.test.tsx`, `convex/menuPanel*.test.ts`, `menuTeam.test.ts` | K08, K10, K11, K17, K27, K28, K35 |
| §14 Analitika | Događaji javnog menija i servera, dnevni agregati po Beogradu, retencija 90 dana / 24 meseca; Standard (7/30 dana) i Premium (90 dana, period, poređenje, raspodela, tok gosta, CSV); svaka brojka ima definiciju; procenti tek od 20. Identifikator sesije podrazumevano isključen. | `convex/menuAnalytics*.ts`, `app/api/meni/analitika/route.ts`, `lib/menu/analitika/`, `components/menu/panel/analitika/`, `docs/menu/ANALITIKA-DEFINICIJE.md` | `convex/menuAnalytics*.test.ts`, `lib/menu/analitika/*.test.ts`, `components/menu/panel/analitika/analitika.test.tsx` | K30, K35 |
| §15 UI/UX | Tri identiteta (panel, javni meni u paleti lokala, operativni konobar), svetla i tamna tema, 1440/1024/768/390 bez vodoravnog skrola, tastatura i fokus, mete 44/48 px, reduced motion, prazna, greška, offline stanja, rečnik. | `docs/menu/MENU-UX.md`, `docs/menu/RECNIK.md`, `components/menu/zajednicko/` | `components/menu/zajednicko/*.test.tsx`, `lib/menu/recnik.test.ts`, `lib/menu-naslovi.test.ts` | K31, K32, K33, K35 |

§12 (Usluge, prodaja, preuzimanje) je van V1; revizija je proverila da nije izložen. Detalj po stavci: `docs/menu/REVIZIJA.md` §8; scenariji §21.1–§21.5: REVIZIJA §9 (§21.3 delimično zbog N3).

## 3. Šta nije urađeno ili je delimično

**Statusi koraka (iz commit poruka):** K01–K31 i K33–K34 su `OK`. **K32 je `DELIMIČNO`**: tri radnika za ispravke su još radila kad je vreme koraka isteklo, pa ih je runner zaustavio; sekcija u progress-u nije napisana. Commit (49 fajlova, sitne izmene CSS-a i rasporeda za telefon, tablet i tamnu temu) prolazi sve provere, a K33 i K34 su posle njega prošli iste površine. Nijedan korak nema status `BLOKADA`.

Blokade unutar `OK` koraka i delimične stavke:

| Šta | Zašto | Gde |
|---|---|---|
| Cene paketa (7 stavki §2.2.1) | sa novim cenama paket „Kompletan" ruši pravilo cenovnika; cenu paketa bira vlasnik | K03 |
| Povratak i zajednička navigacija stranica, ikonica i vidljivost kartice stranice, opis/ikonica sekcije | model i renderer ih znaju, editor nema pisca; nova funkcija | N3, K34/2 |
| Pun pregled nacrta | pregled uživo nema slike, cene varijanti, akcije, oznake i alergene; traži nov izvor podataka | N7, K34/3 |
| Pozivnica osobi bez ScanMe članstva | `convex/auth.ts` je van obima runa | N10, K34/1 |
| Provera uloge pri izmeni QR kartice | `convex/cards.ts` dele sajamske kartice | K33/1 |
| JS rute `/[slug]/meni` 70,4 KB (budžet 60) | stari renderer je u istom segmentu do prelaska | K14, HARDENING D1 |
| Uvoz iz PDF-a | postoji uvoz teksta/JSON-a u nacrt; PDF izvlači operater spoljnim alatom | REVIZIJA §21.1 |
| Izvor kursa EUR | kod je spreman, izvor i uslovi korišćenja nisu izabrani | K14/1 |
| Identifikator sesije analitike | tačka saglasnosti postoji, ostavljeno `off` do pravne provere | K29/1 |
| Merenja na deploymentu | run ne sme da gađa deployment | K34/9 |
| RTL raspored (arapski, hebrejski) | `dir="rtl"` postoji, raspored nije proveren | K34/11 |
| Ručna RS cena po varijanti u editoru | backend je ima, editor je samo prikazuje | K16/4 |
| Stare fotografije iz migracije | ne pretvaraju se u nove slike automatski | K15/6 |
| Dev server i HTTP status izloga u dev-u | auto-mode je odbio `npm run dev` (K06, K07, K31, K33); rute dokazuje `npm run build` | progress K07, K33 |

## 4. BLOKADE: šta traži Jovana

1. **Cena paketa „Kompletan"** (K03): dozvoljeno [4.179, 4.424] mesečno i [41.997, 44.492] godišnje; kandidat 4.290 / 42.900 prolazi svih 726 korpi. Posle odluke: jedan commit po receptu u BLOCKED K03.
2. **Uloga u `convex/cards.ts`** (K33/1): `retargetCard`, `disableCard`, `createCard` ne proveravaju ulogu; `finance` / `view_only` član može da preusmeri ili isključi Menu karticu. Treba „može" za izmenu resolvera uz regresione testove svih vrsta kartica (i sajamskih).
3. **Pozivnica bez ScanMe naloga** (K34/1): (a) napisati ograničenje uz „Pozovi člana" ili (b) odobriti izmenu `convex/auth.ts`.
4. **Pisci podešavanja stranice i sekcije** (K34/2): ulazi li u V1 pre lansiranja.
5. **Pun pregled nacrta** (K34/3): jednokratan pregled na dugme ili prošireni podaci reda.
6. **Bezbednosna zaglavlja** (K33/2): `Referrer-Policy`, `frame-ancestors`, CSP traže `next.config.ts` ili `proxy.ts`; CSP utiče na sve proizvode.
7. **Stari renderer i JS budžet** (K14): razdvojiti stari put iz segmenta `/[slug]/meni` ili prihvatiti 70,4 KB do prelaska.
8. **Nestabilan test van obima** (K23/7): `convex/adminMail.test.ts:318` pada u ~1,7 % pokretanja (pao je i u runnerovom prolazu posle K31 i K34; ponovljen prolaz čist). Popravka je jedan red; admin je van obima runa.
9. **Harness i dev server** (K06/9): `harness/run.mjs` prihvata 404 kao spreman server; predlog: čekati 200. `harness/**` je van obima.
10. **Runner:** uslov „nijedan proces nije ostao upaljen" ne može da prođe dok sesija drži Playwright MCP server iz `.nocni-run/meni/mcp.json` (K11, K13, K15–K18, K30, K34). Predlog: izuzeti MCP server ili proveravati posle izlaska `claude.exe`.

## 5. ODLUKE koje traže Jovanov stav

Samo izbori ukusa i politike. Kod radi po izboru iz kolone „Šta". Pun tekst i alternative: `docs/tasks/BLOCKED.md`, odeljak iz kolone „Korak".

| # | Šta (izbor runa) | Gde se menja | Korak |
|---|---|---|---|
| 1 | P1: grana nastaje od `codex/jovan-admin-v2-2026-10-11`; prenos na `aleksa/main` sa `git rebase --onto`. | git | plan |
| 2 | P2: kontrolna tačka posle audita je automatska (`PRESUDA`). | `.nocni-run/meni/prompts` | plan |
| 3 | P3/P4: šema samo raste; ništa na Convex deploymentu, ni DEV. | `rules.md` | plan |
| 4 | P5: bez novih paketa. | `rules.md` | plan |
| 5 | P6: EUR po srednjem kursu NBS, svež 4 dana; bez svežeg kursa nema prekidača. | `lib/menu/currency.ts`, `convex/menuFx.ts` | K14 |
| 6 | P7: OAuth i AI prevod iza env ključeva; bez ključa isključeno. | `.env.example`, `convex/convex.config.ts` | K16, K26 |
| 7 | P8: anonimni identifikator samo uz odluku; sada `off`. | `MENU_ANALYTICS_IDENTIFIERS` | K29/1 |
| 8 | P9: PDV prikaz nepromenjen; radni tekst alergena iz §7.3. | `lib/i18n/sr/menu-*.ts` | K03, K14/2 |
| 9 | P10–P12: snimci van gita; necommitovani zatečeni folderi van commitova; budžet runa. | `config.json` runa | plan |
| 10 | P13: panel, editor i konobar prate temu aplikacije; javni meni paletu lokala. | `docs/menu/MENU-UX.md` | K07 |
| 11 | P14: bez izmene build konfiguracije. | `rules.md` | plan |
| 12 | P15: rute (`/[slug]/meni`, `/[slug]/client-panel/meni/**`, `/[slug]/konobar/[kod]`). | `docs/menu/MENU-ARHITEKTURA.md` §8 | K01 |
| 13 | Legacy član lokala → Menadžer; `finance` i `view_only` bez Menu pristupa. | `lib/menu/roles.ts` | K02/1–2 |
| 14 | Arhiviranje stranice sa QR vezom je blokirano (ne samo brisanje); slug se ne menja pri preimenovanju. | `convex/menuPages.ts` | K02/5–6 |
| 15 | Room service posle gubitka Premium-a ostaje, sadržaj se ne briše; ulazi u javni meni tek objavom. | `convex/menuRoomService.ts`, `menuPublishing.ts` | K03/1, K05/1 |
| 16 | Spisak oznaka (bez „Bez glutena/laktoze"); nazivi 14 alergena po EU 1169/2011. | `lib/menu/tags.ts`, `lib/i18n/sr/menu-domen.ts` | K04/1–2 |
| 17 | Pravila akcije (ceo dinar, 1–99 %, zakazana traži Premium). | `lib/menu/promo.ts` | K04/4 |
| 18 | Ponovna objava bez izmena se odbija; prazna sekcija se ne prikazuje gostu. | `convex/menuPublishing.ts` | K05/3–4 |
| 19 | Migracija: delovi dana i video se ne prenose; duplikati se ne spajaju; stari artikli dobijaju ikonicu. | `lib/menu/legacy-mapping.ts` | K06/1–4 |
| 20 | Obraćanje „Vi"; potpisni detalji površina; boje vrsta zahteva; prag kašnjenja 15 min. | `docs/menu/MENU-UX.md`, rečnici | K07/1–4 |
| 21 | Urednik vidi samo Početnu i Editor; nema „Odjava" u Menu panelu. | `lib/menu/panel-nav.ts` | K08/1, K08/10 |
| 22 | Grupna promena cena preskače artikle sa varijantama; grupno brisanje traži upis broja; najviše 200 po radnji. | `convex/menuBulk.ts` | K11/1–4 |
| 23 | Javni meni ostaje `noindex`; traka „Meni je osvežen" umesto tihog osvežavanja; razdelnik je lista. | `app/[slug]/meni/**` | K13/2–3, K13/6 |
| 24 | Kurirane palete i parovi pisma (7 + 7) i njihova imena. | `lib/menu/identity/` | K13/7 |
| 25 | Interfejs javnog menija ostaje na srpskom kad je sadržaj preveden; tekst napomene uz EUR. | `lib/i18n/sr/menu-javni.ts` | K14/3–4 |
| 26 | Slike JPG/PNG/WebP do 10 MB (HEIC odbijen), 60 na sat; stare slike se ne brišu. | `lib/menu/image-validation.ts` | K15/1–4 |
| 27 | AI prevod: Anthropic, `claude-opus-5-5`, jedna stavka po kliku, bez ograničenja broja. | `convex/lib/menuAiTranslate.ts` | K16/1–2 |
| 28 | Premium varijante izgleda (3 rasporeda, 4 palete, 3 para pisma); gubitak Premium-a spušta izgled na osnovni; smanjen potpis, ne uklonjen. | `lib/menu/identity/premium.ts` | K17/1–2, K17/4 |
| 29 | „Zatraži prilagođen dizajn" i „promenu režima" idu na `mailto:office@scanme.rs`. | `lib/menu/kontakt.ts` | K17/3, K28/2 |
| 30 | „Uzmi sačuvanu" umesto „Uzmi njegovu"; neuspelo čuvanje ne blokira objavu; „Odbaci izmene nacrta" postoji. | `components/menu/studio/` | K18/1–3 |
| 31 | Soba poručuje samo kroz Room service; gost otkazuje samo Novi zahtev; zahtevi se ne brišu automatski. | `convex/menuGuest.ts` | K19/K20/1–4 |
| 32 | Kolačići gosta `smm_g` 3 h i `smm_d` 180 dana, tretirani kao funkcionalni (traži pravnu proveru). | `lib/menu/signed-cookie.ts` | K19/K20/5 |
| 33 | Akcija ne važi u Room service-u; napomena samo po liniji; cela porudžbina se odbija; granice brzine. | `convex/lib/menuRequests.ts` | K21/1–5 |
| 34 | Sesija gosta 3 h bez produžavanja; prelazak na drugi sto bez potvrde; stari zahtevi se ne zatvaraju sami. | `convex/menuGuest.ts` | K21/9, K21/11–12 |
| 35 | Brojevi blokade PIN-a; ScanMe admin ima PIN radnje; deaktiviran član se ne vraća. | `lib/menu/pin-policy.ts` | K22/2, K22/4, K22/7 |
| 36 | Podsetnik 5 min; zvuk podrazumevano uključen; zona naloga samo na uređaju. | `convex/menuSettings.ts`, `components/menu/konobar/` | K23/1–4 |
| 37 | Bez automatske potvrde prijema rezervacije; gost ne prihvata predlog u aplikaciji. | `convex/menuReservations.ts` | K24/1–2 |
| 38 | Brojevi forme rezervacije (60 dana, 15 min, 50 gostiju, zadržavanje 5–180, podrazumevano 15); nema „zatvoreno na dan". | `lib/menu/working-hours.ts` | K24/3–4 |
| 39 | Statusi rezervacije u ženskom rodu; forma tek uz radno vreme; prihvaćena rezervacija ne stavlja sama „Rezervisan". | rečnici, `convex/menuReservations.ts` | K25/1–4 |
| 40 | Tekstovi šablona odgovora; tekst poslate poruke se ne čuva. | `lib/i18n/sr/menu-odgovor.ts` | K26/2–3 |
| 41 | „Neobjavljene izmene starije od 24 h" od poslednje izmene; Operativa bez imena gosta; ping samo PIN konobaru. | `lib/menu/home-summary.ts` | K27/2–4 |
| 42 | Pozivnica se ne šalje mejlom (link se kopira); menadžer vidi aktivnost; naziv lokala nije izmenljiv iz Menu-a. | `convex/menuTeam.ts` | K28/1, K28/3–4 |
| 43 | Interni saobraćaj se ne broji; jedinstveni posetioci se ne mere; retencija 90 dana / 24 meseca. | `convex/menuAnalytics.ts` | K29/2–4 |
| 44 | Osnovica „malo podataka" su otvaranja dok sesije nisu uključene; CSV sa `;`. | `lib/menu/analitika/prikaz.ts`, `csv.ts` | K30/1–2 |
| 45 | „Poručivanje" ostaje ime radnje gosta; stari ekrani zadržavaju „grupa/stavka". | rečnici | K31/1–2 |
| 46 | Član bez imena se drugima prikazuje kao „Vlasnik ili menadžer" (i Urednik i admin). | `lib/i18n/sr/menu-*.ts` | K33/6 |
| 47 | Zaboravljeni prihvaćeni zahtevi ostaju u prozoru panela (300); nema „Zatvori stare". | `convex/menuWaiter.ts` | K33/4 |
| 48 | Javni meni bez keša; root layout i dalje šalje `gsap` i 16 fontova gostu. | `app/layout.tsx` (van obima) | K33/5 |
| 49 | Pozivnica ne propada sa pozivaocem; kartica koju je isključio admin može ponovo da se uključi. | `convex/menuTeam.ts`, `menuQr.ts` | K34/4–5 |
| 50 | Arapski i hebrejski: zadržati i proći RTL ili skloniti sa liste. | `lib/menu/languages.ts` | K34/11 |

Izmene mastera koje je implementacija pokazala: `docs/menu/PREDLOG-IZMENA-SPECIFIKACIJE.md`.

## 6. Migracije, env i deploy, tačnim redosledom

Run ništa od ovoga nije uradio. Detalj migracije: `docs/menu/MENU-ARHITEKTURA.md` §12.

1. **Pregled i odluke.** Pročitaj §4 i §5; reši bar cene (BLOKADA 1) i `cards.ts` (BLOKADA 2) pre produkcije.
2. **Prvi `npx convex dev` (DEV).** Pušta proširenu šemu (samo nove tabele `menu*` i opciona polja), nove funkcije i 9 novih cronova (verzije, prisustvo, kurs, slike, sesije gosta i osoblja, tri za analitiku; `convex/crons.ts`). DEV je deljen sa drugim granama: push zamenjuje sve funkcije, pa pre toga proveri da grana sadrži sav rad koji DEV trenutno koristi (Sajam, admin). Na DEV postavi (ako već ne postoje) `SCANME_GUEST_SECRET`, `MENU_PIN_PEPPER` (≥ 16 znakova), `SCANME_PIPELINE_SECRET` (i u Next env-u), `MENU_GATEWAY_SECRET` (≥ 32 znaka, ista vrednost u Next env-u i na Convex-u, postaviti istovremeno). Proveri u logu da nema `MENU_GATEWAY_MISMATCH`.
3. **Proba migracije na kopiji podataka.** Na odvojenom deploymentu sa kopijom produkcije, ne na produkciji: `menuAdmin:backfillMenuProfiles` → po lokalu `menuServices.adminProvision` → `menuMigration:planLegacyMigration` (bez upisa; pregled liste §12.3) → `migrateLegacyMenuBatch` dok ne bude `migrated` → ponovo plan (`pendingArticles: 0`, `differenceCount: 0`) → pregled nacrta na telefonu → `Objavi` → `cutoverLegacyMenu`. Probaj i rollback: `revertLegacyCutover`, `purgeMigratedService`. Izmeri grupno brisanje 200 artikala i objavu velikog menija (K34/9).
4. **Narrow tek uz odobrenje.** Gašenje starog editora i javnog puta, odluka o RFC-004 poručivanju, brisanje starih tabela posle bekapa. Ne pre nego što su svi lokali prešli.
5. **Env ključevi i registracija OAuth aplikacija.** Google Cloud OAuth klijent sa `gmail.send` (Google verifikuje aplikaciju), Microsoft Entra aplikacija (`Mail.Send`, `offline_access`, tenant „common"), redirect `https://<sajt>/api/meni/mail/callback`; zatim `MENU_MAIL_ENABLED=true`, `MENU_MAIL_TOKEN_KEY` (32 bajta), `MENU_MAIL_REDIRECT_URI`, `MENU_MAIL_GOOGLE_*`, `MENU_MAIL_MICROSOFT_*`. Opciono: `MENU_AI_TRANSLATE_KEY` (+ `MENU_AI_TRANSLATE_MODEL`, budžet i granica po lokalu), `MENU_FX_ENABLED=true` + `MENU_FX_URL` (posle izbora izvora kursa), `MENU_ANALYTICS_IDENTIFIERS` (posle pravne provere). Sve vrednosti su opisane u `.env.example`.
6. **Pravna provera.** Radni tekst alergena i kratki nazivi (§7.3, K14/2), uključujući prevod; kolačići gosta i obaveštenje (K19/K20/5, K21/6); identifikator sesije i tekst politike privatnosti (K29/1); rok čuvanja zahteva, rezervacija i kontakata (K19/2, K24/6).
7. **PDV sa knjigovođom** i cene paketa (K03, P9), pre javnog cenovnika.
8. **Hosting.** Bezbednosna zaglavlja (K33/2); Vercel firewall ili granica za `POST /api/meni/analitika` (K34/10); kanonski domen za štampu QR-a (K34/7) — do tada štampati samo sa produkcione adrese; odluka o kešu javnog menija (K33/5).
9. **Merge i deploy.** Rebase na glavnu granu (P1), pun `npm run build` i `npm run harness:check`, bekap produkcije, deploy Convex-a pa Next-a, env na produkciji (isti skup kao DEV, tajne nove). Posle: jedan sken stola, jedan PIN, jedna objava, provera loga (`MENU_GATEWAY_MISMATCH`). U produkciji niko ne vidi Menu ulaz dok ScanMe ne napravi uslugu (`adminProvision`) ili ne pusti migraciju.

## 7. Šta ručno proveravaš

**Run nije video nijedan ekran iza prave prijave sa pravim podacima.** Svi ekrani su viđeni kroz izlog sa izmišljenim podacima, u statičkom paketu stvarnih komponenti, bez Next servera i bez Convex-a. Realni tok (prijava, upiti, pretplate, kolačići, upload, OAuth) dokazuju samo testovi.

1. Na DEV-u, prijavljen kao vlasnik: napravi uslugu, uredi i objavi meni, otvori `/[slug]/meni` na telefonu.
2. QR: kartica na stolu → hop → traka gosta → Pozovi konobara → konobarski panel na drugom telefonu (PIN, Preuzmi, Završi). Proveri živi tajmer i zvuk na pravom uređaju.
3. Postojeće QR kartice (i sajamske) posle puštanja vode tamo gde su vodile.
4. Stari javni meni i stari editor lokala koji nije migriran rade kao pre.
5. Otpremanje slike u editoru (traži `SCANME_PIPELINE_SECRET` na oba mesta); slika koja se ne učita pokazuje ikonicu.
6. Rezervacija: forma → konobar prihvata → poveži sto → dolazak → upozorenje posle zadržavanja; otkazivanje linkom.
7. Blokada PIN-a posle niza pogrešnih pokušaja i skidanje u Tim i pristupi.
8. Tim: pozivnica (link) za osobu koja već ima ScanMe nalog; reset PIN-a; promena linka panela.
9. Room service na hotelskom primeru: markup, ručna cena, naknada jednom po porudžbini.
10. Analitika posle nekoliko dana na DEV-u: brojke se slažu sa onim što si radio; CSV u Excelu.
11. Naslovi kartica u browseru (`Analitika | ScanMe Menu`, `Kafana kod Mike — Meni`).
12. Editor na tabletu položeno (fioka strukture ispod 1.280 px) i Izgled › Za goste (izbor filtera).
13. Tastaturom i čitačem ekrana: „Preuzmi" u konobarskom panelu, Escape u detalju, „Pređi na radni red".
14. Ekran greške javnog menija (isključi mrežu pa osveži).

## 8. Brojevi

**Testovi (ceo vitest):**

| Trenutak | Fajlova | Testova prolazi | Preskočeno | Izvor |
|---|---|---|---|---|
| Pre runa (baseline, 17. 10. 17:45) | nije zapisano | 4.622 | 2 | `.nocni-run/meni/logs/baseline_test.json` |
| Posle K02 | 397 | 4.747 | 2 | progress K02 |
| Posle K14 | 476 | 8.288 | 2 | progress K14 |
| Posle K28 | 584 | 13.070 | 2 | progress K28 |
| Posle K33 | 613 | 13.973 | 2 | progress K33 |
| Posle K34 / sada (K35) | 631 | 14.202 | 2 | progress K34; K35 §9 |

Run je dodao 240 test fajlova. Grana: 35 commitova, 894 putanje (+260.879 / −153 reda); po delovima: `components/menu` 355, `lib/menu` 277, `convex/` 126, `app/` 43, `lib/i18n` 22, `docs/` 16.

**Performanse K14 (javni meni; `components/menu/javni/budzet.test.tsx`, build manifest):**

| Mera | Mali (20 artikala) | Veliki (402) | Budžet |
|---|---|---|---|
| HTML gzip (Tok) | 9,3 KB | 38,3 KB (najgori 41,6) | 20 / 110 KB |
| DOM elementi (Tok) | 209 | 4.199 (najgori 5.799) | 1.000 / 8.000 |
| Props granice | 9,3 KB | 152,5 KB | 20 / 220 KB |
| JS rute `/[slug]/meni/[stranica]` | 33,5 KB gzip | | 60 KB |
| JS rute `/[slug]/meni` | 70,4 KB gzip (≈ 54 KB stari renderer) | | 60 KB — **BLOKADA** |
| Vreme do prvog artikla (statički pregled, CPU × 4) | 303 ms | 381 ms | 150 / 800 ms |

**Performanse K33 (convex-test sa stvarnim limitima transakcije, ne deployment; `convex/menuLoadK33.test.ts`):**

| Scenario | Izmereno | Budžet |
|---|---|---|
| Konobarski panel, 300 stolova (600 otvorenih + 5.000 završenih) | 633 dokumenta / 17 upita | ≤ 2 × 301 zahteva + 20 otkazanih |
| Klijentski panel `operations` / `home` / `home` sa 2.000 RS stavki | 616 / 19; 610 / 18; 2.615 / 24 | ≤ 2 × 301 zahteva, ≤ 201 rezervacija po statusu |
| Analitika, 10.000 događaja | `zbir` u 20 transakcija; `pregled` 202 dok. / 223 upita, isti odgovor i bez sirovih | panel čita samo agregate |
| Skenovi, 500 usvojenih kartica | ~2.510 upita (jedna usluga po transakciji) | 4.096 upita |
| Editor, 402 reda | 401 red preskače ponovno crtanje posle sačuvane cene; prevlačenje 423 ms (K11) | ≤ 200 ms pri CPU × 4 (cilj, nije ispunjen) |

Merenja na pravom deploymentu (LCP, grupno brisanje, velika objava) nisu rađena.

## 9. Rezultat provera

Pušteno u K35 (21. 10. 2026.), posle poslednje izmene koda (K34). Logovi: `tmp/meni/k35/` (van gita).

| Provera | Rezultat |
|---|---|
| `node .nocni-run/meni/alati/typecheck.mjs` | prolazi („tsc: bez grešaka") |
| `npx tsc --noEmit -p convex/tsconfig.json` | prolazi |
| `npx eslint --ignore-pattern ".nocni-run/**"` | 0 grešaka; 2 stara upozorenja van runa (`components/admin/venue-admin.tsx`, `convex/purchaseLifecycle.test.ts`) |
| `npx vitest run --testTimeout=30000 --hookTimeout=60000` | 631 fajl prolazi, 2 preskočena; 14.202 testa prolaze, 2 preskočena; 0 padova |
| `npm run harness:namespace` | prolazi (nema tokena tuđeg prostora imena) |
| `npm run build` | prolazi (posle builda `next-env.d.ts` vraćen na sadržaj iz HEAD-a) |
| `npm run harness:check` | nije puštan u K35 (pušta ga runner); poslednji runnerov prolaz posle K34: „177 cases × 2 viewports match the goldens byte-for-byte" |
| Snimci (K35) | 24 PNG + `metrike.json` u `output/playwright/meni/K35/`: editor (390, 1440, obe teme), javni meni Tok, Kategorije, Kompaktno (390, 1440) i Tok u tamnoj paleti lokala, konobarski panel telefon (radni red) i desktop (sala), klijentski panel Početna i Analitika (Premium), 390 i 1440, obe teme. Na svih 24: bez vodoravnog skrola i prelivanja, 0 grešaka konzole, tačno jedan vidljiv `h1`, sve slike imaju `alt`; jedina „mala meta" je skriveni skip-link (1 × 1 dok nema fokus). Statički paket stvarnih komponenti izloga (`tmp/meni/k35-pregled/`), bez servera. |

## 10. Zatečeno

Problemi koji nisu od runa, nađeni usput. Run ih nije menjao.

| Problem | Gde | Napomena |
|---|---|---|
| Nestabilan test: „kvarenje" šifrata zamenom prvog znaka sa `A` ne kvari ništa kad šifrat već počinje sa `A` (~1,7 % pokretanja) | `convex/adminMail.test.ts:318` | pao u runnerovim prolazima posle K31 i K34; ponovljen prolaz čist (K23/7) |
| `harness/run.mjs` `waitForServer` prihvata 404, pa `harness:check` ponekad pada odmah posle build-a | `harness/run.mjs` | K06/9 |
| Pod opterećenjem: „scheduled function did not complete after 10000 timer pumps" | `convex/fairReports.test.ts` (Sajam) | K33; samostalno prolazi |
| Dva stara eslint upozorenja (nekorišćene promenljive) | `components/admin/venue-admin.tsx`, `convex/purchaseLifecycle.test.ts` | od pre runa |
| Root layout šalje svakom gostu `gsap` i 16 fontova | `app/layout.tsx` | K33/5 |
| Isti obrazac `storageId` iz zahteva kao Menu pre K34 N1 | `convex/memoriesPipeline.ts` | K34/6 |
| Klijentske mutacije kartica ne proveravaju ulogu | `convex/cards.ts` | K33/1 (BLOKADA 2) |
| IP heš uzima celu IPv6 adresu (rotacija u /64 daje nove kofe) | `lib/card-resolver-http.ts` | K25/6a |
| Legacy članstvo daje pun pristup uređivanju; pozivnice prave samo legacy članstvo | `convex/lib/access.ts`, `convex/admin.ts` | K01 N1, N2 |
| Stari PIN bez dužine, jedinstvenosti i limita | stari RFC-004 panel | K01 N3 (novi model ga ne koristi) |
| Javni upit starog menija ne proverava `inactive` / `archivedAt` | `convex/menu.ts` | K01 N5 |
| `/dev/menu-admin-preview` nema `noindex` (u produkciji je 404) | `app/dev/menu-admin-preview` | I22 |
| Lična e-adresa u `.env.example` | `.env.example:18` | od pre runa; repo je javan |
| Tuđ `next dev` na portu 3000 je blokirao `harness:check` | lokalni proces | K20 |
