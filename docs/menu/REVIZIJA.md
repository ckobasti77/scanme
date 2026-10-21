# ScanMe Menu V1 — revizija runa (K34)

**Datum:** 21. 10. 2026. **Grana:** `codex/jovan-meni-v1-2026-10-16`. **Obim:** `git diff codex/jovan-admin-v2-2026-10-11...HEAD` (34 commita, K00–K33, 874 putanje) prema `SCANME-MENU-MASTER-SPEC.md`, `docs/MENI-PLAN.md`, korekcijama mockupova i pravilima repoa, plus K34 popravke u radnom stablu.

## 1. Metod i zbir

- **Pregled po oblastima:** četiri nezavisna recenzenta (Sonnet), samo čitanje: A domen i backend modela, B editor i javni meni, C QR kartice, tok gosta i konobarski panel, D rezervacije, pošta, klijentski panel, tim, analitika i interni admin. Kontrolnu listu ZAKLJUČANO stavki popunila su dva Haiku radnika (§2–§7 i §8–§15).
- **Provera:** glavni recenzent je svaki nalaz potvrdio u kodu pre upisa ili popravke; tvrdnje koje nisu mogle da se dokažu bez deploymenta ostale su procene i idu u BLOKADU. U kontrolnoj listi je 93 reda ispravljeno ili dopunjeno posle provere (najčešće: radnik je tražio dokaz samo u `components/` i `app/`, ili je dao „da” bez dokaza).
- **Popravke:** pet Sonnet radnika u odvojenim fajlovima (editor, javni meni, backend i analitika, QR kartice, hop i konobar) i glavni recenzent. Svaki diff radnika je pročitan, a testovi pokrenuti ponovo; dve sitnice iz njihovih izveštaja dovršene su ručno (`detalj-stola.tsx` prosleđuje sat panela, dokumentacija analitike).
- **Ozbiljnost:** kritično = pogrešan ishod za klijenta ili gosta u osnovnom toku ili bezbednosni proboj; srednje = prekršeno zaključano pravilo ili tok bez izlaza; nisko = ograničen uticaj ili retka okolnost; info = bez štete ili namerno.

| Ozbiljnost | Ukupno | Ispravljeno | Delimično | BLOKADA | Prihvaćeno |
|---|---|---|---|---|---|
| kritično | 2 | 2 | 0 | 0 | 0 |
| srednje | 9 | 6 | 1 (+ BLOKADA) | 2 | 0 |
| nisko | 25 | 20 | 2 (jedna + BLOKADA) | 3 | 0 |
| info | 26 | 11 | 0 | 1 | 14 |

Nijedan kritičan nalaz nije otvoren. BLOKADE i pitanja za vlasnika: `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K34` (11 stavki).

## 2. Regresije

| Oblast | Šta je provereno | Dokaz | Ishod |
|---|---|---|---|
| ScanMe Links render | `git diff codex/jovan-admin-v2-2026-10-11...HEAD` nad `components/scanme-links/**`, `lib/scanme-links*`, `convex/scanMeLinks*`, `harness/**`: prazan. Golden snimci posle K33 (poslednje stanje koda pre K34). K34 ne dira nijedan fajl iz grafa korpusa harness-a (K20: 17 fajlova, ScanMe Links šabloni, `lib/scanme-links*`, `lib/design-engine/*`, `lib/utils.ts`). | `.nocni-run/meni/logs/K33_harness.txt`: „harness:check passed — 177 cases × 2 viewports match the goldens byte-for-byte"; `npm run harness:namespace` prolazi (K34) | bez regresije |
| Druge usluge u klijentskom panelu | `components/client-panel/client-panel.tsx` +25/−0: samo blok `MenuUlaz` sa sopstvenim upitom (`menuPanel.entry`), bez Menu usluge panel je isti | `components/menu/panel/klijentski-panel-regresija.test.tsx` (8 snimaka napravljenih iz NEIZMENJENOG koda pre K08, bajt-identični) | bez regresije |
| QR kartice, uključujući sajamske | `convex/cards.ts`: jedan uvoz, tip ishoda i grana `case "menu"`; `app/r/[cardCode]/route.ts`: samo grana `menu`. `menuCardOutcomeFields` za karticu bez aktivne Menu veze vraća `{}`, pa je ishod tačno stari `{ kind: "menu", businessSlug }`. Grane `venue`, `event`, `service_page`, `url`, `memories_space`, `splitter`, `table_ordering`, `fair_model`, `fair_admin_link` netaknute. K34 ne menja ni `cards.ts` ni `app/r/**` | `convex/menuGuest.test.ts:134` („a card with no Menu link resolves EXACTLY as before K20"), `convex/menuLegacyCompat.test.ts` (4 faze migracije); ceo skup sa svim `cards*`, `fair*`, `ordering*` testovima prolazi | bez regresije |
| Venue rezervacije | `convex/venueReservations.ts`, `components/venue/**` nepromenjeni; Menu moduli ne čitaju ni pišu Venue tabele | `convex/menuReservations.test.ts` („Venue rezervacije prazne posle celog toka") | bez regresije |
| Cene drugih proizvoda | `lib/pricing/constants.ts` i golden nepromenjeni; dodat samo test predloga | `git diff --stat … -- lib/pricing` (samo `menu-launch-proposal.test.ts`) | bez regresije (cene Menu-a su BLOKADA K03) |
| Admin osim Menu podstranice | menjani samo `components/admin/menu-admin-subpage.tsx` (kartice Režim i Uvoz) i nov `components/admin/menu-admin-rezim.tsx`, plus dev izlog `app/dev/menu-admin-preview`; `app/admin/**` netaknut. `menuAdmin.overview` više ne vraća `overdue` (K33 C1: upit ne čita sat); jedini potrošač je podstranica, koja ga računa sama | grep potrošača `overdue` | bez regresije |
| Stari javni meni, stari editor, stari konobarski panel | `app/[slug]/meni/_stari/stari-meni.tsx` je doslovno premeštena stara stranica (razlika: potpis funkcije i komentari, `noindex` ostaje). K31 je namerno promenio naslove starih površina („{name} — Meni", „Konobarski panel · {name}", „Editor"). K33 je promenio izračun `--menu-input-border` u `lib/design-engine/menu-tokens.ts`; nijedan stari CSS taj token ne koristi | diff stare stranice (`tmp/meni/k34/stari-page-base.tsx`), `lib/i18n/i18n.test.ts` | bez regresije ponašanja |
| Zabranjeni fajlovi i konfiguracija | skeniranih 874 putanje diff-a: nijedna iz zabrana (`app/sajam/**`, `components/fair/**`, `lib/fair-*`, `convex/fair*`, `docs/events/**`, `harness/**`, `components/venue/**`, `app/admin/**` osim Menu, `package*.json`, `next.config.*`, `tsconfig.json`, `vitest.config.*`, `eslint.config.*`, `postcss.config.*`, `components.json`, `convex.json`, `proxy.ts`, `app/layout.tsx`, `app/globals.css`, `AGENTS.md`, `CLAUDE.md`, `.claude/**`, handoff). `.gitignore` je menjao start runa (logovi runnera), `.env.example` ima samo dopisane placeholder-e, `convex/convex.config.ts` samo opcione env deklaracije | skripta u `tmp/meni/k34` (grep po listi zabrana) | u redu |
| K34 popravke | 103 putanje K34 izmena (izmenjene i nove, sa dokumentima): nijedna iz zabrana; `convex/cards.ts`, `app/r/**`, `convex/lib/access*.ts` i `convex/auth.ts` netaknuti; šema dobija samo opciono `menuMediaUploads.declaredSize` | skripta po listi zabrana nad `git diff --name-only` i novim fajlovima | u redu |

## 3. Bezbednost i privatnost

| Tema | Šta je provereno | Ishod |
|---|---|---|
| Tenant izolacija | Sve javne funkcije novih modula prolaze `requireMenuAccess` / `requireMenuAccessToRow` / `getMenuAccess`, sesiju osoblja ili sesiju gosta; ID iz argumenta kroz `loadOwned` ili proveru usluge. Izuzetak koji je K34 našao: `storageId` u `menuMedia.uploadContext` (N1, kritično) — ispravljeno. Presečni test `convex/menuTenantIsolationK33.test.ts` (37) prolazi; K34 dodaje testove napada sa tuđim fajlom u `convex/menuMedia.test.ts`. | ispravljeno N1 |
| PIN | Trocifren, jedinstven među aktivnim osobljem, HMAC sa pepper-om + PBKDF2, 5 promašaja / 15 min po uređaju, brojači lokala sa eskalacijom (K33), reset samo V/M, sesija 12 h, opoziv pri resetu, deaktivaciji i promeni koda; PIN drugog lokala ne otvara panel. Info: fiksni prozor dozvoljava rafal na granici (I11), PIN se odmah oslobađa (I12). | u redu |
| Tokeni otkazivanja i OAuth | Token otkazivanja 256 bita, u bazi samo heš, prikazan jednom; link radi bez JS-a, `noindex`, `no-referrer`. OAuth: `state` jednokratan, vezan za osobu i uslugu, PKCE S256, tokeni AES-GCM sa AAD, nijedan upit ih ne vraća, primalac samo adresa gosta iz rezervacije, callback bez otvorenog preusmerenja, bez ključeva sve isključeno. | u redu |
| Rate limit | Kofe za sve javne ulaze (gost, rezervacije, analitika, PIN, pošta, AI). K34 dodaje kofu analitike po lokalu (N5). | ispravljeno N5 |
| Lični podaci u javnim upitima | Javni upiti ne vraćaju imena, adrese ni telefone; drugim članovima tima ime ili neutralna oznaka; Operativa bez imena gosta; CSV bez ličnih podataka i sa zaštitom od formula; događaji analitike bez IP-a i UA-a. | u redu |
| Premium kapija na serveru | `period` i `raspodela` traže Premium; K34 je našao da Standard `pregled` ipak nosi Premium korake toka (N4) — ispravljeno. | ispravljeno N4 |
| Dev rute | Svih šest `app/dev/menu-*-preview/page.tsx` ima `if (process.env.NODE_ENV === "production") notFound();`; pet ima `robots: noindex, nofollow` (zatečeni `menu-admin-preview` ga nema od ranije, I22). | u redu |
| Tajne i pravi podaci u repou (javan) | Pretraga diff-a: nijedan ključ (`sk-ant`, `sk_live`, `AIza`, `ghp_`, privatni ključevi, JWT); e-adrese samo `example.*`, `scanme.rs`, izmišljene `primer.rs`; jedina lična adresa je zatečena u `.env.example:18` (pre runa); nazivi deploymenta samo u zatečenim delovima BLOCKED.md. Telefoni u testovima formata (`+381 64 123 4567`) su uobičajeni primeri, ne kontakti iz fixtures (I21). | u redu |

## 4. Pravila repoa

| Pravilo | Dokaz | Ishod |
|---|---|---|
| i18n za nove tekstove | `lib/menu/recnik.test.ts` (zabranjene varijante; K34 dodaje „biblioteka"), `lib/menu-naslovi.test.ts`; skeniranje JSX teksta i `aria-label`/`title`/`placeholder` literala u 249 TSX fajlova runa (`tmp/meni/k34/inline-tekst.mjs`): nijedan korisnički tekst van `lib/i18n` (pogoci su samo zatečeni stari klijentski panel i TS generici) | u redu |
| shadcn/ui i tokeni umesto hex | Hex u TSX-u runa: QR (crno na belom, namerno), štampa (`stampa-qr.tsx`, papir), primer šifre boje i rezerva birača (`brend-paleta.tsx`) i `#8a918b` u `kartica.tsx` — K34 ga je zamenio tokenom `--mp-ivica-kontrole-na-istaknutom` (sa testom kontrasta). Providni `rgb(...)` slojevi i senke ostaju (N21). | ispravljeno |
| Testovi u putanjama koje vitest pokreće | svih 222 novih test fajlova runa (i K34 fajlovi) su u `include` putanjama (`convex/**/*.test.ts`, `lib/**/*.test.ts`, `components/menu/**/*.test.tsx`, `components/admin/**/*.test.tsx`) | u redu |
| Šema samo proširena | `git diff --numstat … -- convex/schema.ts`: 1031 dodato / 0 obrisano, dva bloka (uvozi i nove tabele na kraju); K34 dodaje samo opciono `menuMediaUploads.declaredSize` | u redu |
| Nijedan nov paket | `tmp/meni/k34/paketi.mjs`: svi uvozi 803 fajla runa su iz `package.json` ili Node-a | u redu |
| Zabranjene konfiguracije | vidi §2, poslednji red | u redu |

## 5. Kvalitet

| Tema | Šta je provereno | Ishod |
|---|---|---|
| Čiste funkcije bez testova | Svih 157 modula `lib/menu/**` runa (skripta po putanji i imenu modula u svim test fajlovima): samo `lib/menu/audit.ts` i `lib/menu/errors/versions.ts` nemaju test, a nijedan nema funkciju (konstante i tipovi). Na početku revizije su bez testa bili i `lib/menu/studio/prevodi-pogled.ts` i `lib/menu/kontakt.ts`; K34 je dodao testove i našao jednu grešku (I23). | u redu |
| Mrtav kod | `SekcijaUPripremi` (I18) ostaje zbog testova koji je koriste; `Dugme asChild` je gubio `onClick` (I4, ispravljeno). | zapisano |
| Duplikati | Tri pretrage artikala u editoru (I3, prihvaćeno), dva `tel:` linka (I19, ispravljeno), dve konstante iste adrese (I24, ispravljeno), `kanonskiAlergeni` u modulu izloga (N20, ispravljeno). Pravilo „otvara li kartica Menu” je sada jedno (`cardOpensMenu`, N11, N25). | ispravljeno osim I3 |
| Nedosledna imena | Oznake nalaza u testovima prate izveštaje oblasti (A, B, C, D); tri komentara u kojima se oznaka sudarala sa brojem ovde (N1, N2 analitike) preimenovana su u N4 i N5. Ostala imena prate rečnik (`docs/menu/RECNIK.md`, test `lib/menu/recnik.test.ts`). | u redu |

## 6. Ništa iz §20 nije podrazumevano

| Zabranjeno kao podrazumevano | Dokaz |
|---|---|
| porudžbina direktno kuhinji | `convex/menuGuestRequests.test.ts:1824` (tabele zahteva nemaju kuhinjsko ni platno stanje) |
| online plaćanje | isto; samo `paymentPreference` (gotovina/kartica) |
| SMS | nema SMS koda ni ključa (grep `sms` u Menu kodu: 0) |
| gost bira sto | `convex/menuGuest.test.ts:225` (pozicija samo iz sesije QR-a, nikad iz adrese), `convex/menuReservations.test.ts:397` |
| sistem zaključuje da je sto slobodan / gosti otišli | `lib/menu/occupancy.test.ts`, `convex/menuWaiterFloor.test.ts` (strukturni test: zauzetost piše samo osoblje i `markArrived` uz modul) |
| obavezna zauzetost | `convex/menuServices.ts:49` (`occupancy: false` podrazumevano) |
| obavezni alergeni | `convex/menuArticleDetails.test.ts:412` (isključeni podrazumevano) |
| skrivanje artikala po alergenima | `components/menu/javni/pretraga-alergeni.test.tsx:216` (artikal ostaje vidljiv) |
| filter raspona cena | `lib/menu/filters.test.ts:81`, `convex/menuPresentation.test.ts` (filter `price` odbijen) |
| klijentska migracija | `lib/menu/panel-nav.test.ts:48` (tačno osam sekcija, bez uvoza) |
| vidljiva biblioteka | nema sekcije ni taba; K34: ni reč „biblioteka" u UI-ju (`lib/menu/recnik.test.ts`) |
| klijent menja režim | `convex/menuServices.test.ts:260`, `components/menu/panel/podesavanja/podesavanja.test.tsx:243` |
| automatsko prosleđivanje | `convex/menuPanelOperations.test.ts:480` (niko nije odgovoran = nema podsetnika), `lib/menu/reminder.ts` (samo zvuk istom uređaju) |
| podrazumevano trajanje rezervacije | `components/menu/panel/rezervacije-podesavanja.test.tsx:310` |
| istorija stola na operativnom ekranu | `components/menu/konobar/konobar.test.tsx:674` (zabranjene reči), `sto/detalj-stola.tsx` |
| prosečno vreme preuzimanja | `components/menu/panel/analitika/analitika.test.tsx:719` |
| neograničen page builder | Izgled je kuriran izbor (`components/menu/studio/k17.test.tsx`), server prima samo vrednosti iz kataloga (`convex/menuPresentation.test.ts`) |
| mockup brojke kao rezultati | `components/menu/panel/pocetna/pocetna.test.tsx`, `components/menu/panel/sekcija-stanja.test.tsx:319` |

## 7. Korekcije mockupova

| Korekcija (README) | Dokaz | Ishod |
|---|---|---|
| ScanMe crno-zelena nije paleta javnog menija | `components/menu/studio/k17.test.tsx:236`, `lib/menu/identity/identity.test.ts` (nijedna paleta nije ScanMe zelena) | poštovano |
| `Kompaktno` bez slike i ikonice | `components/menu/javni/javni.test.tsx:628`, `k17-varijante.test.tsx:264` | poštovano |
| „Editor · U pripremi" ne postoji | sve sekcije su prave (`components/menu/izlog/panel-izlog.test.tsx`, K30) | poštovano (I18: komponenta `SekcijaUPripremi` ostala neiskorišćena) |
| nema „zahtev za preuzimanje" ni „Preuzimanja" | `components/menu/konobar/konobar.test.tsx:674` | poštovano |
| Room service je `Posebne usluge`, samo kad je uključen | `components/menu/studio/k16.test.tsx:268`, `:277` | poštovano |
| `Kompletan meni` sa inline cenom, nije javni naslov | `components/menu/studio/studio.test.tsx`, `convex/menuPublic.test.ts` (podrazumevana stranica bez naslova) | poštovano; K34 N2: ostale stranice sada nose svoje ime |
| PIN trocifren | `components/menu/konobar/konobar.test.tsx:156` | poštovano |
| neutralan sto je crta, zauzetost opciona | `components/menu/konobar/sala.test.tsx:349` | poštovano |
| statusi `Novi / Prihvaćen / Završen` i `Otkazan`, bez kuhinje | `lib/menu/request-status.test.ts` | poštovano |
| raspored šematski i podesiv | `components/menu/lokal/raspored/raspored.test.tsx` (mreža od 24 polja) | poštovano |
| sadržaj iza modala objave i brojke na slikama nisu izvor | objava po K05/K18 pravilima, analitika iz definicija | poštovano |

## 8. Kontrolna lista ZAKLJUČANO stavki (master §2–§15)

Jedna stavka po redu, onako kako je u masteru; „Ispunjeno” je `da`, `ne`, `delimično`, `n/p` (poslovno ili procesno pravilo bez koda) ili `van obima V1` (master ga sam odlaže). Redovi su prvo popunjeni iz koda i testova (Haiku), pa ih je glavni recenzent proverio; redovi sa K34 ispravkom nose oznaku nalaza.

Zbir 506 stavki: **467 da**, **10 delimično**, **7 ne**, **20 n/p**, **2 van obima V1**. Svih sedam „ne” su cene i paketi (BLOKADA K03, `lib/pricing/constants.ts` nije menjan). Deset „delimično”: Premium za druge usluge (§2.2), uvoz iz PDF-a bez OCR-a (§2.3, §6.2), merenje na deploymentu (§2.4), povratak i zajednička navigacija stranica (§3.3, N3), ikonica i vidljivost kartice stranice (§3.4, N3), izvor kursa EUR (§5.3, BLOCKED K14-1), pun pregled nacrta (§6.1, N7), pozivnica bez ScanMe članstva (13.8.a, N10) i pravna provera identifikatora sesije (14.4.4, BLOCKED K29/1).

#### §2.1 Cena usluge (ZAKLJUČANO ZA POČETNO LANSIRANJE, linije 93–104)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Mesečna pretplata za ScanMe Menu 1.490 RSD | ne | lib/pricing/constants.ts:74 (menu: monthly 890); docs/tasks/BLOCKED.md:2054 (BLOKADA cene) | BLOKADA K03: cena paketa „Kompletan” je odluka vlasnika (docs/tasks/BLOCKED.md → SCANME MENU V1 — K03); `lib/pricing/constants.ts` nije menjan |
| 2 | Godišnja pretplata 14.900 RSD (približno dva meseca besplatno) | ne | lib/pricing/constants.ts:74 (menu: annual 8990) | BLOKADA K03: cena paketa „Kompletan” je odluka vlasnika (docs/tasks/BLOCKED.md → SCANME MENU V1 — K03); `lib/pricing/constants.ts` nije menjan |
| 3 | Inicijalno postavljanje ili standardna migracija uključeno, bez posebne naplate | n/p | Menu kod nema naplatu postavljanja ni migracije | poslovno pravilo naplate, van koda runa |
| 4 | Generisanje dodatnog QR koda se ne naplaćuje | da | `convex/menuQr.ts` `mintCards` (bez ikakve naplate; granica 500 kartica po lokalu); `convex/menuQr.test.ts:644` | Odsustvo stavke. Nema testa. |
| 5 | Fizička kartica ili proizvod sa QR kodom naplaćuje se kao fizički proizvod | n/p | prodaja fizičkih kartica je postojeći ScanMe tok, van Menu koda | Nema cene za fizičku karticu u kodu. |
| 6 | Veliki ili nestandardni sistem: Enterprise, cena na upit | da | lib/pricing/constants.ts:55 (plan cene su `Exclude<PlanId, "enterprise">`) | Enterprise nije u tabeli cena. Tekst "na upit" u kodu nije nađen. |
| 7 | Godišnja cena je izračunata kao deset mesečnih pretplata (pasus posle tabele) | ne | lib/pricing/constants.ts:74 (890 x 10 = 8.900, a annual je 8.990); constants.ts:79 (Premium 990 x 10 = 9.900, a annual je 9.990) | BLOKADA K03: cena paketa „Kompletan” je odluka vlasnika (docs/tasks/BLOCKED.md → SCANME MENU V1 — K03); `lib/pricing/constants.ts` nije menjan; za Menu 1.490 × 10 = 14.900 važi u masteru |
| 8 | Pre javnog cenovnika potvrditi PDV i zaokruživanje sa knjigovođom | n/p | procesni uslov (P9, BLOCKED K03) | Procesni uslov, nije u kodu. |

#### §2.2 Premium nalog (ZAKLJUČANO, linije 110–117)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Premium se vodi na nivou ScanMe naloga, ne kao posebna verzija usluge | da | convex/menuCapabilities.test.ts:114 (describe "Premium is a fact of the account, not of one service") |  |
| 2 | Aktivni Premium nalog otključava Premium opcije u ScanMe Menu i drugim ScanMe uslugama | delimično | convex/menuCapabilities.test.ts:115 (plan Premium na nalogu: oba lokala su Premium); convex/lib/menuCapabilities.ts | za ScanMe Menu da (`convex/menuCapabilities.test.ts`: Premium naloga važi za sve lokale naloga); druge usluge su van obima runa |
| 3 | Premium nalog ne ukida osnovnu pretplatu po lokalu ili usluzi | n/p | naplata pretplata je van Menu koda | convex/menuCapabilities.test.ts:114–131 dokazuje dodavanje Premium-a, ne očuvanje osnovne pretplate. Nema eksplicitnog testa. |
| 4 | Premium košta 990 RSD mesečno ili 9.990 RSD godišnje | da | lib/pricing/constants.ts:79 (premium: monthly 990, annual 9990) | Iznos je usklađen. Vidi napomenu u §2.1 red 7 (990 x 10 = 9.900). |
| 5 | Premium otključava Room service | da | convex/menuRoomService.test.ts:394 (describe "A. the Premium gate") | Room service je u V1 po §4.2, a zaključan je Premium-om po §2.2. Nije protivrečnost, ali treba znati. |
| 6 | Premium otključava AI pomoć za prevode | da | convex/menuTranslations.test.ts:6 (zaglavlje: AI predlog samo uz Premium i ključ); (MP K16: AI predlog a–g, translation/ai_disabled, MENI-PROGRESS.md:1233) |  |
| 7 | Premium otključava zakazane akcije | da | convex/menuPromos.test.ts:373 (describe "scheduled promotions need Premium") |  |
| 8 | Premium otključava dodatne layout i dizajn varijante | da | convex/menuPresentation.test.ts (MP K17: Premium kapija za 4 palete, 3 para i 3 varijante, MENI-PROGRESS.md:1288) |  |
| 9 | Premium otključava naprednu analitiku | da | components/menu/panel/analitika/analitika.test.tsx:333 ("[malo-podataka] Premium: poređenje je u rečima...") |  |
| 10 | Premium otključava CSV export | da | UI: `components/menu/panel/analitika/analitika.test.tsx:449` (CSV zaključan na Standardu uz razlog); podaci za CSV dolaze samo iz Premium upita (`period`, `raspodela`); K34 N4: ni Standard `pregled` više ne nosi Premium korake toka | CSV i Premium capability postoje. Nije potvrđeno da je dugme zaključano na Standardu. |
| 11 | Premium otključava uklanjanje ili smanjivanje ScanMe brendinga | da | `components/menu/javni/okvir.tsx:93` (smanjen potpis), Premium kapija `convex/menuPresentation.test.ts` (smanjen potpis samo uz Premium) | Capability postoji i testira se. "reducedBranding" nije korišćen u components/menu (grep). Stari renderer components/menu/menu-template.tsx:83 prikazuje "poweredBy" bez uslova. |
| 12 | Standard podržava najviše dva jezika po Menu usluzi; Premium nema komercijalni limit broja jezika | da | convex/menuSettings.test.ts:129 (describe "Standard: at most two languages, the source included"); convex/menuSettings.test.ts:159 (describe "Premium: no commercial limit, technical maximum ten") | Premium ima tehničku granicu od 10 jezika. To nije komercijalni limit, ali nije ni "bez ikakve granice". |
| 13 | Potpuno prilagođen dizajn nije neograničeno uključen u Premium; naplaćuje se posebno | da | components/menu/studio/k17.test.tsx (MP K17: "mailto:" bez cene, MENI-PROGRESS.md:1291) | Realizovano kao kontakt bez cene. |
| 14 | Premium može kasnije otključavati dodatne funkcije u svim kupljenim ScanMe uslugama | van obima V1 | master §2.2: "može kasnije" | Buduća mogućnost, nije V1 zahtev. Ovo je tumačenje (master ne kaže doslovno "kasnija faza"). |

#### §2.2.1 Početna matrica cena i paketa (ZAKLJUČANO ZA POČETNO LANSIRANJE, linije 121–131)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Tabela: ScanMe Menu 1.490 RSD / 14.900 RSD | ne | lib/pricing/constants.ts:74 | BLOKADA K03: cena paketa „Kompletan” je odluka vlasnika (docs/tasks/BLOCKED.md → SCANME MENU V1 — K03); `lib/pricing/constants.ts` nije menjan |
| 2 | Tabela: Premium nalog 990 RSD / 9.990 RSD | da | lib/pricing/constants.ts:79 | Vidi §2.1 red 7. |
| 3 | Tabela: Menu + ScanMe Links 1.990 RSD / 19.900 RSD | ne | lib/pricing/constants.ts:83 (paket "lokal": links + menu, 1590 / 15990); docs/tasks/BLOCKED.md:2054 | BLOKADA K03: cena paketa „Kompletan” je odluka vlasnika (docs/tasks/BLOCKED.md → SCANME MENU V1 — K03); `lib/pricing/constants.ts` nije menjan |
| 4a | Standard Menu uključuje: puni editor | da | components/menu/studio/studio.test.tsx (MP K10: 55 testova); convex/menuStudio.test.ts |  |
| 4b | Standard Menu uključuje: slike, ikonice, tekstualni prikaz | da | convex/menuMedia.test.ts; components/menu/studio/k15.test.tsx:317 (describe "fokus=artikal: the image...") |  |
| 4c | Standard Menu uključuje: tri osnovna layouta | da | components/menu/javni/javni.test.tsx:315 (describe "Tok (primer kafic)"); (MP K13: "the three primers are intentionally different", MENI-PROGRESS.md:963) |  |
| 4d | Standard Menu uključuje: standardne stranice bez doplate | da | convex/menuPages.test.ts:387 ("the page ceiling counts archived pages"); lib/menu/limits.ts:2 (komentar: standard pages have no commercial limit); lib/menu/limits.ts:8 (MENU_MAX_PAGES = 50) | 50 je tehnička granica, a ne komercijalni limit. |
| 4e | Standard Menu uključuje: do dva jezika | da | convex/menuSettings.test.ts:129 |  |
| 4f | Standard Menu uključuje: ručne prevode | da | convex/menuTranslations.test.ts:341 ("Standard: two translations are refused (plan/language_limit), one is accepted") |  |
| 4g | Standard Menu uključuje: pretragu, filtere, alergene | da | components/menu/javni/pretraga-alergeni.test.tsx:216; lib/menu/filters.test.ts:81 (describe "there is no price filter"); lib/menu/search.test.ts:58 |  |
| 4h | Standard Menu uključuje: QR kodove i pozicije | da | convex/menuQr.test.ts:510 (describe "menuQr.mintCards: for positions"); convex/menuQr.test.ts:558 ("with a page: every card opens that page on its table") |  |
| 4i | Standard Menu uključuje: konobarske zahteve | da | convex/menuGuestRequests.test.ts:585 (describe "call the waiter and ask for the bill") |  |
| 4j | Standard Menu uključuje: račun | da | convex/menuGuestRequests.test.ts:665 ("a bill stores the payment preference; another one updates it while the bill is new") |  |
| 4k | Standard Menu uključuje: porudžbinu kao zahtev | da | convex/menuGuestRequests.test.ts:723 (describe "an order is a snapshot") |  |
| 4l | Standard Menu uključuje: rezervacije | da | convex/menuReservations.test.ts:201 (describe "publicEntry"); convex/menuReservations.test.ts:212 ("form: the contact and the working hours, no ids") |  |
| 4m | Standard Menu uključuje: osnovnu analitiku | da | components/menu/panel/analitika/analitika.test.tsx:255 (describe "Analitika: every number has its explanation") |  |
| 4n | Standard Menu uključuje: realno potreban broj članova osoblja za jedan lokal | da | lib/menu/limits.ts:75 (MENU_MAX_STAFF = 100, aktivnih članova osoblja po usluzi) | "Realno potrebno" je poslovna procena. Konstanta je 100. |
| 5 | Pre javnog cenovnika sa knjigovođom potvrditi prikaz sa i bez PDV-a | n/p | procesni uslov (P9) | Procesni uslov. |
| 6 | Zatečene vrednosti u lib/pricing/constants.ts nisu aktuelna odluka i moraju se uskladiti u implementacionoj fazi | ne | lib/pricing/constants.ts:74 i :83 (vrednosti nisu usklađene); docs/tasks/BLOCKED.md:2054 | BLOKADA K03: cena paketa „Kompletan” je odluka vlasnika (docs/tasks/BLOCKED.md → SCANME MENU V1 — K03); `lib/pricing/constants.ts` nije menjan |

#### §2.3 Migracija i trošak rada (ZAKLJUČANO, linije 135–142; blok PRIVREMENO preskočen)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Migraciju radi ScanMe, a ne klijent | da | convex/menuAdminImportV2.test.ts:5–8 (zaglavlje: uvoz u nacrt, samo ScanMe admin); (MP K06: sve klijentske uloge odbijene, MENI-PROGRESS.md:471) |  |
| 2 | Klijent ne vidi opciju "Migracija postojećeg menija" u svom panelu | da | grep "Migracija postojeć" u repou: samo ScanMe-Menu-Jovan-Claude-Handoff/docs/SCANME-MENU-MASTER-SPEC.md; nema u components/menu ni u app/[slug]/client-panel | Dokaz odsustvom stringa. |
| 3 | Za fizički ili postojeći digitalni meni koriste se interni i AI alati za ekstrakciju i unos | delimično | interni uvoz u nacrt: `convex/menuAdmin.ts` `importDraftV2`, admin „Uvoz u nacrt” (`components/admin/menu-admin-rezim.tsx`), `convex/menuAdminImportV2.test.ts:291` | ekstrakcija iz PDF-a ili fotografije (OCR/AI) nije u kodu: operater je radi spoljnim alatom pa uvozi tekst/JSON |
| 4 | Standardni cilj je približno 20 minuta automatizovanog rada plus ručna provera | n/p | cilj merenja, ne kod | Cilj bez merenja u kodu, docs/qa/menu.md i docs/perf/. |
| 5 | Radna gornja pretpostavka je do približno jednog sata ukupnog ljudskog rada | n/p | procena, ne kod | Procena. Nema merenja. |
| 6 | Stvarno vreme se meri na prvih deset migracija | n/p | merenje na prvih deset migracija posle lansiranja | Procesna stavka. Nije nađen zapis merenja. |

#### §2.4 Infrastrukturna polazna tačka (ZAKLJUČANO POSLOVNO; TEHNIČKA REALIZACIJA JE PREPORUKA, linije 151–161)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Convex ostaje backend platforma | da | convex/schema.ts:3445–3446 (indeksi menu tabela u Convex šemi) |  |
| 2 | Obaveštenja se prvenstveno prikazuju u ScanMe klijentskom i operativnom panelu | da | konobarski panel (zvuk, traka podsetnika: `components/menu/konobar/zvuk.ts`, `components/menu/konobar/podsetnik.test.tsx`) i Početna „Pažnja” (`lib/menu/home-summary.test.ts:670`) | Klijentski panel: nije nađen modul obaveštenja (grep "obaveštenj\|notif" u components/menu/panel bez pogodaka). |
| 3 | SMS nije planirani kanal i ne ulazi u operativni trošak | da | convex/menuReservationSettings.test.ts:576–578 (kontakt "sms" se šalje i očekuje se odbijanje, rejects.toThrow); convex/memories.ts:48 (komentar: ne dodavati SMS) |  |
| 4 | Frontend hosting može biti na Hostingeru samo ako Jovan potvrdi da odgovara | n/p | odluka vlasnika o hostingu | Uslovna dozvola i odluka vlasnika. Nije proverljivo u kodu. |
| 5 | Implementacija ne seli Convex niti unapred zaključava Hostinger plan | da | run ne seli infrastrukturu: sve je u Convex-u, bez deploy-a | Deo o Convexu je ispunjen. Deo o Hostinger planu nije proverljiv u kodu. |
| 6 | Merenje otvaranja, bandwidth, storage, obrada slika, real-time pretplate i analitički događaji; profili 50, 250, 500, 1.000 lokala | delimično | procena opterećenja K29 (`docs/MENI-PROGRESS.md` K29), simulacije `convex/menuLoadK33.test.ts`, budžeti `components/menu/javni/budzet.test.tsx` | merenje na pravom deploymentu za 50–1.000 lokala nije rađeno: run ne sme da gađa deployment (BLOKADA, `docs/tasks/BLOCKED.md` → K34) |
| 7 | Paginacija, indeksirani upiti, optimizovane slike i agregirana analitika jesu ciljevi | da | indeksi i ograničena čitanja (`docs/menu/HARDENING.md` §5, nijedan `.collect()` u novim modulima), agregati analitike (`convex/menuAnalyticsRollup.ts`), slike (`lib/menu/http/image-transform.test.ts`) | Javni meni čita ograničenim budžetom (convex/menuPublicK13.test.ts:1042). Paginacija nije u javnom putu. Ciljevi su delimično ostvareni. |
| 8 | Jovan i Claude dokumentuju razlog, merenje i posledice po trošak i skaliranje | da | `docs/menu/MENU-ARHITEKTURA.md` §14 (budžeti), ODLUKE po koraku u `docs/MENI-PROGRESS.md` | Nema dokumenta o trošku i skaliranju. |

#### §3.2 Jedna pretplata naspram dodatnog menija (ZAKLJUČANO, linije 187–220)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Jedna Menu pretplata može sadržati više odredišta (kompletan meni, hrana, piće, vino, deserti) | da | convex/menuPages.test.ts:428 (describe "rename"), :537 (describe "duplicate"), :692 (describe "move") | Više stranica po usluzi. Tehnička granica 50 (lib/menu/limits.ts:8). |
| 2 | "Kompletan meni" je podrazumevana stranica koja se automatski pravi za svaku novu Menu uslugu | da | convex/menuServices.test.ts:92–93 (describe "Kompletan meni is created automatically"; test "ensureForBusiness creates the service, its draft state and exactly one default page") |  |
| 3 | Naslov "Kompletan meni" se ne prikazuje gostu kao javni naslov | da | components/menu/javni/razdelnik.test.tsx:121 (`the default page is "Meni" ... never the editor's "Kompletan meni"`); (MP K10/K13: javni-pregled.test.ts, "Kompletan meni nikad nije naslov") |  |
| 4 | Odredišta ostaju deo jedne usluge kada dele isti režim rada | da | convex/menuServices.test.ts:245 (describe "the mode is locked for clients"); convex/schema.ts:3445 (stranice vezane za menuServiceId) |  |
| 5 | Odredišta dele zajednički identitet i osnovni dizajnerski sistem | da | (MP K17: izgled je jedan zapis po usluzi, MENI-PROGRESS.md:1288–1289); convex/menuPresentation.test.ts | Nije proveravano po stranici. |
| 6 | Odredišta dele zajedničku konfiguraciju funkcionalnosti | da | convex/schema.ts (menuServices.features: callWaiter, billRequest, ordering, roomService, occupancy, reservations; MENI-PROGRESS.md:16) |  |
| 7 | Odredišta dele zajedničku bazu artikala u pozadini | da | convex/menuCatalog.test.ts:176 (describe "one article, one price, many pages") |  |
| 8 | Svako odredište može imati sopstveni QR kod ili biti dostupno sa zajedničkog razdelnika | da | convex/menuQr.test.ts:558 ("with a page: every card opens that page on its table"); convex/menuQr.test.ts:643 (describe "menuQr.mintCards: for a page") |  |
| 9 | Standardna odredišta su različiti prikazi iste ponude; ista cena na svim mestima | da | convex/menuStudio.test.ts:431 ("a single setBasePrice shows the new price on BOTH pages and dirties only the draft"); convex/menuCatalog.test.ts:176 |  |
| 10 | Room service nije obično odredište; poseban modul; vizuelno i funkcionalno izdvojen; ne prikazuje se lokalima koji ga ne koriste | da | components/menu/studio/k16.test.tsx:267–277 (describe "K16 Room service in the structure": Standard bez grupe "Posebne usluge"; Premium: u grupi "Posebne usluge", ne među stranicama); convex/menuRoomService.test.ts:394 | Vizuelna izdvojenost u javnom rendereru nije posebno proverena. |
| 11 | Room service može preuzeti ceo glavni meni ili samo izabrane artikle | da | convex/menuRoomService.test.ts:326–357 (helperi importWholeMenu i addItems); (MP K03: MENI-PROGRESS.md:92) |  |
| 12 | Room service artikal zadržava zajednički identitet; RS ima sopstveni izbor, kategorije i redosled | da | (MP K03: MENI-PROGRESS.md:93–95, RS čuva samo ručnu cenu); convex/menuRoomService.test.ts (redosled, sopstvene kategorije; MP) |  |
| 13 | Room service nasleđuje dizajn i osnovni layout; nema potpuno nezavisan editor izgleda | da | convex/menuPresentation.ts: nema polja za Room service (grep "room\|Room\|roomService" bez pogodaka) | Negativni dokaz. |
| 14 | Zasebna pretplata se naplaćuje kada klijent želi nezavisan meni (režim, dizajn, konfiguracija, životni ciklus) | n/p | pravilo naplate (Enterprise / zasebna pretplata), van koda | Pravilo naplate. Nema koda za drugu Menu uslugu po lokalu. Pitanje "jedna usluga po lokalu" je otvoreno u BLOCKED K02 (MENI-PROGRESS.md:45). |
| 15 | Veliki sistemi (mnogo nezavisnih menija, lokala, hotelskih jedinica, integracija) prelaze u Enterprise ponudu | n/p | Enterprise ponuda, van koda | Poslovno pravilo. Vidi §2.1 red 6. |
| 16 | U klijentskom interfejsu koristi se naziv "Stranice menija" | da | lib/i18n/sr/menu-studio.ts:44 (naslov: "Stranice menija"); :113; :417 |  |
| 17 | Standardne stranice unutar jedne usluge nemaju unapred zadat komercijalni limit | da | lib/menu/limits.ts:2 (komentar: standard pages have no commercial limit); lib/menu/limits.ts:8 (MENU_MAX_PAGES = 50) | Tehnička granica 50 nije komercijalni limit. |
| 18 | Klijent može dodati, preimenovati, duplirati, premestiti, arhivirati i obrisati standardnu stranicu | da | convex/menuPages.test.ts:387 (arhiviranje), :418 (remove), :428 (rename), :537 (duplicate), :692 (move) |  |
| 19 | Brisanje stranice povezane sa QR karticom nije dozvoljeno dok se QR veza ne preusmeri ili isključi | da | convex/menuPages.test.ts:4–5 (zaglavlje: brisanje ili arhiviranje stranice sa aktivnom QR karticom se odbija); (MP K02: "remove › page_has_qr") | Dozvoljeno kad je veza neaktivna, kartica isključena ili preusmerena (MENI-PROGRESS.md:53). |

#### §3.3 Sekcije nisu posebni meniji (ZAKLJUČANO, linije 224–228)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Sekcije "Hrana", "Piće", "Vino", "Deserti" u jednom kontinuiranom meniju nisu dodatni meniji; gost skroluje ili koristi anchor | da | components/menu/javni/javni.test.tsx:339 (navigacija href="#sekcija"); (MP K13: skok na poslednju sekciju je tačan, MENI-PROGRESS.md:947) |  |
| 2 | Odredišta su odvojeni prikazi, prelaz preko razdelnika ili QR koda; gost na vinskoj karti ne vidi hranu osim ako klijent omogući povratak | delimično | podrazumevano `navigation: "standalone"` (gost na vinskoj karti ne vidi hranu); renderer zna `back` i `shared` (`components/menu/javni/razdelnik.test.tsx:339`) | klijent NE MOŽE da uključi povratak ili zajedničku navigaciju: nema pisca polja `navigation` (K34 N3, BLOKADA) |

#### §3.4 Razdelnik i ScanMe Links (ZAKLJUČANO, linije 232–239)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Menu dobija jednostavan osnovni razdelnik kada ima više odredišta | da | components/menu/javni/razdelnik.test.tsx:121, :192 (zero pages: prazan meni) |  |
| 2 | Bogatiji, detaljnije prilagodljiv razdelnik može biti razlog za povezivanje ili prodaju ScanMe Links | n/p | poslovna napomena o ScanMe Links | Poslovna napomena. Nije zahtev implementacije u Menu-u. |
| 3 | Klijent koji ne uzme ScanMe Links i dalje ima funkcionalan, uredan i brendiran osnovni izbor odredišta | da | components/menu/javni/razdelnik.test.tsx:203 ("a logo replaces the monogram..."); :211 ("without a logo the monogram is the first letter of the name") |  |
| 4 | Osnovni Menu razdelnik podržava logo i naziv lokala, boje ili identitet, kartice stranica, opcionu sliku ili ikonicu, redosled i vidljivost | delimično | logo, naziv, identitet, kartice stranica i redosled: `components/menu/javni/razdelnik.test.tsx`; K34: kartica stranice nosi ime stranice, ne „Meni” (`convex/menuPublic.test.ts` „K34: the public title of a standard page”) | ikonica i vidljivost stranice nemaju pisca u editoru (K34 N3, BLOKADA); naslovna slika (`coverMediaId`) nije uvedena |
| 5 | ScanMe Links dodaje naprednije blokove, kontakte, društvene mreže i veću kontrolu dizajna | n/p | opis usluge ScanMe Links | Opis usluge ScanMe Links (zamrznuti put components/scanme-links). Nije stavka Menu V1 i nije proveravano. |
| 6 | Početni Menu + Links paket košta 1.990 RSD mesečno ili 19.900 RSD godišnje | ne | lib/pricing/constants.ts:83; docs/tasks/BLOCKED.md:2054 | BLOKADA K03: cena paketa „Kompletan” je odluka vlasnika (docs/tasks/BLOCKED.md → SCANME MENU V1 — K03); `lib/pricing/constants.ts` nije menjan |

#### §4.1 Pravilo režima (ZAKLJUČANO, linije 247–255)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Režim se bira pri kreiranju Menu usluge | da | convex/menuServices.test.ts:149 (describe "adminProvision creates the service with Kompletan meni..."); :155 (mode: "hospitality") | U V1 je jedini izbor Ugostiteljstvo (lib/menu/modes.ts:9, AVAILABLE_MENU_MODES). |
| 2 | Režim je zaključan za uslugu; klijent ga kasnije ne menja iz editora | da | convex/menuServices.test.ts:245–274 (describe "the mode is locked for clients": "no client role can change the mode") |  |
| 3 | U klijentskom panelu režim se nenametljivo prikazuje ("ScanMe Menu · Ugostiteljstvo") | da | lib/i18n/sr/menu-domen.ts:12 (serviceLabel: "ScanMe Menu · {mode}"); :8 (hospitality: "Ugostiteljstvo"); components/menu/panel/shell.test.tsx:347 (describe "the mode line") |  |
| 4 | Režim se ne prikazuje kao ravnopravna padajuća opcija pored promenljivih podešavanja | da | components/menu/panel/shell.test.tsx:363 ("the mode is shown, never a control (master §4.1)") |  |
| 5 | Ako klijent pogreši ili promeni poslovanje, šalje zahtev ScanMe timu | da | `components/menu/panel/podesavanja/brend-nalog.tsx` (link „Zatraži promenu režima”, e-pošta ScanMe timu); `podesavanja.test.tsx:243` | Tekst i dugme postoje. Nije proveren ishod linka (da li zaista šalje zahtev ScanMe timu). |
| 6 | ScanMe administrator može promeniti režim i sprovesti potrebnu migraciju podataka | da | `convex/menuServices.ts` `adminSetMode` (`requireAdmin`), admin „Režim usluge” (`components/admin/menu-admin-rezim.tsx`); `convex/menuK28.test.ts` „Režim menja samo ScanMe admin” | V1 ima samo režim Ugostiteljstvo, pa migracija podataka između režima još nije potrebna |
| 7 | Podaci i podešavanja se ne prenose slepo između režima ako strukture nisu kompatibilne | da | `lib/menu/modes.ts` (funkcije koje novi režim ne podržava se isključuju i beleže u audit); `convex/menuServices.test.ts:284` | Nije testiran prenos podataka između dva režima (V1 ima samo Ugostiteljstvo). |

#### §4.3 Režim nije vizuelni stil (ZAKLJUČANO, linije 269–271)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Režim određuje poslovnu logiku i dozvoljene funkcije | da | lib/menu/modes.ts:8–9 (V1 builds hospitality only; services je V1.1, retail kasnija faza); lib/menu/modes.ts:28–39 (funkcije po režimu) |  |
| 2 | Vizuelni stil određuje kako sadržaj izgleda | da | lib/menu/identity/identity.test.ts (MP K17: paleta, font, kontrast); convex/menuPresentation.test.ts (MP K17) |  |
| 3 | Lokal u ugostiteljskom režimu može birati više podržanih stilova i rasporeda bez promene režima | da | components/menu/studio/k17.test.tsx:231 (describe "K17 A: the colours are the curated palettes, never the ScanMe palette"); components/menu/javni/javni.test.tsx:315 (tri layouta) |  |

#### §5.1 Zajednički identitet artikla (ZAKLJUČANO, linije 279–284)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Jedan stvarni proizvod ili usluga je jedan artikal u pozadini | da | convex/menuCatalog.test.ts:176 (describe "one article, one price, many pages"); convex/schema.ts (menuArticles, MENI-PROGRESS.md:20) |  |
| 2 | Isti artikal može biti prikazan na više odredišta i u više sekcija | da | convex/menuCatalog.test.ts:196–197 (artikal na dve stranice); (MP K02: isti artikal sme u više sekcija iste stranice, MENI-PROGRESS.md:42) |  |
| 3 | Dodavanje postojećeg vina u kompletnu ponudu i vinsku kartu ne stvara automatski dva nepovezana artikla | da | convex/menuCatalog.test.ts:176 i (MP K02: brzi unos i duplikati, menuCatalog.test.ts, MENI-PROGRESS.md:54) |  |
| 4 | Promena zajedničkih podataka artikla može da se odrazi na sva mesta na kojima se prikazuje | da | convex/menuStudio.test.ts:431 (cena na obe stranice) | Provereno za cenu. Naziv i opis su jedan red artikla. |

#### §5.2 Biblioteka postoji u backendu (ZAKLJUČANO, linije 288–294)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Zajednička biblioteka je način organizacije podataka u pozadini | da | convex/schema.ts (menuArticles po menuServiceId; MENI-PROGRESS.md:20) |  |
| 2 | Klijent ne prolazi kroz poseban tok "napravi artikal u biblioteci, pa ga prebaci u meni" | da | components/menu/studio (MP K10: "+ Dodaj" direktno na stranici, MENI-PROGRESS.md:735); grep "Biblioteka\|biblioteka" u components/menu bez pogodaka | Negativni dokaz. |
| 3 | Klijent upravlja ponudom direktno kroz editor i kontekst menija | da | components/menu/studio/studio.test.tsx (MP K10: 55 testova) |  |
| 4 | Sistem u pozadini sprečava nepotrebne duplikate i omogućava ponovnu upotrebu artikla | da | convex/menuCatalog.test.ts:234 (describe "quickAddArticle"); (MP K02: brzi unos i duplikati) |  |
| 5 | U klijentskom panelu se ne prikazuje zaseban tehnički modul biblioteke | da | grep "Biblioteka\|biblioteka" u components/menu i app/[slug]/client-panel/meni bez pogodaka | Negativni dokaz. |

#### §5.3 Zajednička cena i Room service izuzetak (ZAKLJUČANO, linije 300–320)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Artikal ima osnovnu cenu | da | convex/menuCatalog.test.ts:176 (MP: setBasePrice); convex/schema.ts (basePriceRsd, MENI-PROGRESS.md:20) |  |
| 2 | Sve standardne stranice koriste istu cenu artikla; standardna stranica ne može imati sopstvenu cenu | da | convex/menuCatalog.test.ts:176; convex/menuStudio.test.ts:431; (MP K02: prikaz nosi samo redosled i vidljivost, MENI-PROGRESS.md:28) |  |
| 3 | U glavnom pregledu Kompletan meni klijent može direktno promeniti cenu u redu artikla, bez otvaranja detalja | da | components/menu/studio/studio.test.tsx (MP K10: "red u konfliktu i grešci"); lib/menu/studio/price-input.test.ts; Playwright: tmp/meni/k10-pregled/interakcije.mjs (inline cena 2.200 -> 1.990, MENI-PROGRESS.md:762) | Potvrda je i kroz Playwright skriptu. Naziv testa u studio.test.tsx nije grep-ovan. |
| 4 | Direktna izmena jasno pokazuje uspešno čuvanje i eventualnu grešku; promena ostaje u nacrtu do objave | da | convex/menuStudio.test.ts (MP: "zastarela cena vraća konflikt", MENI-PROGRESS.md:757); convex/menuBulk.test.ts (MP K11: "draft only", nacrt ne menja menuPublic.page do objave) |  |
| 5 | Room service može imati procentualni markup za sve ili izabrane artikle | da | lib/menu/room-service-pricing.test.ts:36 ("450 + 15 % = 518"); :45–46 ("selected scope, article selected -> computed") |  |
| 6 | Room service pojedinačna cena može nadjačati procentualni markup samo unutar Room service modula | da | lib/menu/room-service-pricing.test.ts:48 ("manual 600 beats the 15 % markup") |  |
| 7 | Room service može imati opcionu fiksnu naknadu za dostavu, dodaje se jednom na celu porudžbinu | da | convex/menuGuestRequests.test.ts:1228 ("a room orders at the Room service prices (markup, half up) and the delivery fee is added once") | Naknada 0 znači bez naknade (MP K03: MENI-PROGRESS.md:108). |
| 8 | Redosled obračuna: osnovna cena -> procentualni markup -> ručna Room service cena -> jednokratna naknada | da | lib/menu/room-service-pricing.test.ts:58 (describe "roomServiceUnitPrice (base -> markup -> manual)"); convex/menuGuestRequests.test.ts:1228 |  |
| 9 | Ne postoji fiksno uvećanje koje se automatski dodaje svakom pojedinačnom artiklu | da | lib/menu/room-service-pricing.ts (model: markupBps, markupScope, ručna cena, naknada po porudžbini; MENI-PROGRESS.md:96) | Negativni dokaz. Nema eksplicitnog testa. |
| 10 | U Room service interfejsu je jasno da li je cena preuzeta iz glavne ponude, izračunata ili ručno promenjena | da | lib/menu/rs-price-origin.test.ts (fajl postoji); (MP K16: tačno jedno poreklo po redu, MENI-PROGRESS.md:1232) | Naziv testa nije grep-ovan. |
| 11 | Kada artikal nema ručnu Room service cenu, promena osnovne cene automatski preračunava Room service cenu | da | convex/menuStudioK16.test.ts:137 ("a Room service item WITHOUT a manual price follows the base: no warning") |  |
| 12 | Kada artikal ima ručnu Room service cenu, ona ostaje nepromenjena; upozorenje sa starom osnovnom, novom osnovnom i Room service cenom; akcije "Zadrži ručnu cenu" i "Ponovo izračunaj prema markup-u" | da | convex/menuStudioK16.test.ts:149 ("a Room service item WITH a manual price keeps it and answers old base, new base, the manual price and the recomputed price (half-up)"); (MP K16: doslovne akcije u dijalogu, components/menu/studio/k16.test.tsx) |  |
| 13 | Room service porudžbina ide osoblju, sa automatski prepoznatom sobom kada je QR vezan za sobu | da | convex/menuGuestRequests.test.ts:1276 ("a room offers only Room service; a table never gets it..."); :1296 ("the hop of a room card without a page opens Room service") |  |
| 14 | Osnovna valuta menija je RSD i jedina je merodavna cena za obračun i zahteve | da | lib/menu/rsd.ts (fajl postoji); convex/menuCatalog.ts (setBasePrice: cene u celim dinarima; MENI-PROGRESS.md:28) |  |
| 15 | RSD cena se čuva i prikazuje u celim dinarima; procentualno izračunate RS cene zaokružuju se na najbliži dinar | da | lib/menu/room-service-pricing.test.ts:39 ("335 + 10 % = 369 (33.5 rounds half up)") |  |
| 16 | Ručno uneta Room service cena ostaje tačno kako ju je klijent uneo | da | lib/menu/room-service-pricing.test.ts:49 ("manual 599 stays exactly 599") |  |
| 17 | Klijent može opciono uključiti prekidač valute pri vrhu javnog menija; gost bira RSD ili EUR | da | components/menu/studio/izgled/za-goste.tsx:16–22 (props valuta i onValuta; komentar: EUR cene postoje samo kad lokal to uključi) | Pozicija prekidača "pri vrhu" nije proverena. |
| 18 | EUR vrednost je informativna, po važećem kursu, prikazuje se sa "~" i sa dve decimale | da | lib/menu/currency.ts:3, :10 (format "~ 1.234,50 EUR"), :86–88 ("~ 12,70 EUR"); lib/menu/currency.test.ts:116 ("rounds half up to the cent") |  |
| 19 | Sistem uvek zadržava RSD kao izvor istine; ako kurs nije dostupan ili svež, EUR prekidač se privremeno ne prikazuje | da | lib/menu/currency.test.ts:47 ("4 days old is fresh, 5 days old is not"); :82 ("no rate at all is not fresh"); (MP K14: "without a fresh rate the EUR switch is not shown", components/menu/javni/pretraga-alergeni.test.tsx, MENI-PROGRESS.md:1074) |  |
| 20 | Izvor kursa, keširanje i osvežavanje bira implementacioni tim i dokumentuje ih pre puštanja | delimično | srednji kurs NBS, cron 6 h, keš 30 zapisa, svežina 4 dana (`convex/menuFx.ts`, recept „Kurs EUR”) | izbor izvora i uslovi korišćenja čekaju vlasnika (BLOCKED K14-1); bez `MENU_FX_ENABLED` prekidač EUR se ne prikazuje |

#### §5.4 Kombo artikli (ZAKLJUČANO, linije 326–330)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Kombo je poseban artikal | da | convex/menuCombos.test.ts:207 (test "creates a combo article with a manual price, places it in the section and stores the components"); lib/menu/combo.ts (fajl postoji) |  |
| 2 | Klijent ga sastavlja izborom postojećih artikala | da | convex/menuCombos.test.ts:207, :216 (komponente u testu) |  |
| 3 | Cena komboa se određuje ručno i ne preračunava se automatski | da | convex/menuCombos.test.ts:207 (manual price); :233 (`expect(combo.priceCheck).toBeUndefined()`) |  |
| 4 | Kada se promeni cena sastavnog artikla, sistem upozorava klijenta da proveri cenu komboa | da | (MP K04: convex/menuCombos.test.ts "Burger meni 990 with Burger 650 and Pomfrit 250: the published price never changes by itself", MENI-PROGRESS.md:223); convex/lib/menuArticleHooks.ts (priceCheck u istoj transakciji, MENI-PROGRESS.md:161) |  |
| 5 | Upozorenje ne menja objavljenu cenu bez odluke klijenta | da | (MP K04: "Zadrži cenu" = resolvePriceCheck; isti test "the published price never changes by itself") |  |

#### §5.5 Obavezni i opcioni podaci artikla (ZAKLJUČANO ZA UGOSTITELJSKI V1, linije 336–356)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Za objavljivanje su obavezni: naziv | da | lib/menu/publish-validation.test.ts:73 (test "without a name") |  |
| 2 | Obavezno: sekcija | da | lib/menu/publish-validation.test.ts:98 ("without a name, a section and a price: all three, in that order") |  |
| 3 | Obavezno: osnovna cena ili najmanje jedna varijanta sa cenom | da | lib/menu/publish-validation.test.ts:98; (MP K04: price_missing, MENI-PROGRESS.md:202) |  |
| 4 | Opciono: opis | da | convex/schema.ts (menuArticles, polje description; MENI-PROGRESS.md:20) | Nije testirano posebno. |
| 5 | Opciono: količina ili jedinica | da | convex/schema.ts (quantityValue, quantityUnit; MENI-PROGRESS.md:20); lib/menu/public-view.test.ts (MP: količina) |  |
| 6 | Opciono: slika ili ikonica | da | convex/schema.ts:3484–3485 (mediaMode, imageMediaId); components/menu/studio/k15.test.tsx:317 |  |
| 7 | Opciono: oznake i prehrambene karakteristike | da | lib/menu/allergens.test.ts:91 ("normalizeTags: one unknown value rejects the whole list"); lib/menu/tags.ts (zatvoren spisak; MENI-PROGRESS.md:184) |  |
| 8 | Opciono: relevantni alergeni | da | lib/menu/allergens.test.ts:31; convex/menuArticleDetails.test.ts:411 (describe "allergens (master §7.3)") |  |
| 9 | Opciono: varijante i dodaci | da | convex/menuArticleOptions.test.ts:262 (describe "a plain article and the option switches") |  |
| 10 | Opciono: slobodna napomena | da | convex/menuArticleOptions.test.ts:262, :296 (noteEnabled); convex/menuGuestRequests.test.ts:948 ("a note needs the article's note switch") |  |
| 11 | Opciono: akcija ili popust | da | convex/menuPromos.test.ts:373; lib/menu/promo.test.ts:46 (describe "percent <-> price, whole dinars, half up") |  |
| 12 | Opciono: prevodi | da | convex/menuTranslations.test.ts:341 |  |
| 13 | Opciono: prikaz na dodatnim stranicama | da | convex/menuCatalog.test.ts:176 (describe "one article, one price, many pages") |  |
| 14 | Opciono: veza sa kombo artiklom | da | convex/menuCombos.test.ts:207 (komponente sačuvane); convex/schema.ts (menuComboComponents; MENI-PROGRESS.md:158) |  |
| 15 | Nepotpuni artikli mogu postojati u nacrtu; validaciona greška blokira njihovo objavljivanje | da | lib/menu/publish-validation.test.ts (MP K04: "the SAME article, hidden, produces no issue at all: the draft keeps it", MENI-PROGRESS.md:224); convex/menuPublishing.test.ts:175 (refusal: validation_failed) |  |

#### §5.6 Dostupnost, skrivanje, uklanjanje i brisanje (ZAKLJUČANO, linije 362–367)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | "Privremeno nedostupno" je operativno stanje; artikal ostaje vidljiv gostu sa jasnom oznakom | da | convex/menuPublicK13.test.ts (MP K13: "Privremeno nedostupno" odmah, bez objave, MENI-PROGRESS.md:907); components/menu/javni/javni.test.tsx (MP: MENI-PROGRESS.md:922) |  |
| 2 | Promena između dostupnog i privremeno nedostupnog može odmah da se odrazi na javni meni, bez objavljivanja ostalih promena | da | convex/menuAvailability.test.ts:132 ("goes live without touching the draft: the draft revision does not move") |  |
| 3 | "Sakrij" uklanja artikal iz javnog prikaza na izabranoj stranici, čuva položaj i omogućava ponovno prikazivanje; ostaje u nacrtu do objave | da | convex/menuBulk.test.ts:362–377 (setVisibility "hidden"); (MP K05: nacrt ne menja javni meni pre Objave, uključujući sakrivanje, MENI-PROGRESS.md:320) |  |
| 4 | "Ukloni sa ove stranice" uklanja samo pojavljivanje na izabranoj stranici; isti artikal ostaje na drugim stranicama | da | convex/menuBulk.test.ts:98, :363 (removeFromPage); model: menuPlacements po stranici (convex/schema.ts:3528) | Eksplicitan test "ostaje na drugoj stranici" nije nađen. Provereno kroz model prikaza. |
| 5 | "Obriši artikal" briše zajednički artikal sa svih stranica; pre potvrde sistem pokazuje stranice i kombo artikle na koje utiče | da | convex/menuArticleDetails.test.ts:400–411 (potvrdni token, dva koraka); (MP K04: "brisanje sa spiskom posledica", MENI-PROGRESS.md:202) |  |
| 6 | Skrivanje, uklanjanje sa stranice i globalno brisanje su strukturne promene i idu uživo tek nakon Objavi | da | (MP K05: convex/menuPublishing.test.ts "nacrt ne menja javni meni pre Objavi (cena, naziv, sakrivanje, uklanjanje, brisanje)", MENI-PROGRESS.md:320) | Dostupnost (red 2) je izuzetak i ide uživo. |

#### §5.7 Varijante, dodaci i slobodna napomena (ZAKLJUČANO, linije 373–386)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Varijanta je alternativna verzija artikla; gost bira jednu | da | convex/menuArticleOptions.test.ts (MP K04: varijante, MENI-PROGRESS.md:196); components/menu/javni/javni.test.tsx (MP K13: detalj i varijante, MENI-PROGRESS.md:923) |  |
| 2 | Svaka varijanta može imati sopstvenu konačnu cenu | da | (MP K04: "Varijanta ima sopstvenu cenu", MENI-PROGRESS.md:159); convex/menuRoomServiceVariants.test.ts (MP K04: ručna cena po varijanti) |  |
| 3 | Dodatak se dodaje na izabrani artikal ili varijantu; može imati pozitivnu doplatu ili biti besplatan | da | convex/menuGuestRequests.test.ts:907 ("an add-on surcharge is added to the piece and stored with its group and option") | Besplatan dodatak nije posebno testiran. |
| 4 | Grupa dodataka može dozvoliti jedan ili više izbora | da | lib/menu/addons.test.ts:22 ("single choice, optional: 0 or 1"); :34 ("several choices, optional: 0 up to all") |  |
| 5 | Klijent bira da li je grupa obavezna ili opciona | da | lib/menu/addons.test.ts:28 ("single choice, required: exactly 1"); :40 ("several choices, required: 1 up to all") |  |
| 6 | Minimalni i maksimalni broj izbora postoje kao napredna podešavanja i ne prikazuju se dok nisu potrebni | da | `lib/menu/addons.test.ts:46`; u editoru min/max su napredno podešavanje grupe (`components/menu/studio/artikal/grupa-forma.tsx`) | Pravila postoje. Skrivanje naprednih polja u UI nije potvrđeno testom. |
| 7 | Slobodna napomena je zasebna opciona mogućnost | da | convex/menuArticleOptions.test.ts:262, :296 (noteEnabled) |  |
| 8 | Varijante, dodaci i slobodna napomena podrazumevano su isključeni | da | convex/menuArticleOptions.test.ts:263 ("a plain article stays 'Naziv + Cena': all switches off, no variants, no groups") |  |
| 9 | U editoru su u sklopljenoj sekciji "Varijante i dodaci", tako da običan artikal može ostati "Naziv + Cena" | da | components/menu/studio/k15.test.tsx:358 ("Varijante i dodaci is collapsed by default: no body, no switches, summary says it is off") |  |
| 10 | "Dodaj grupu" nudi pravljenje nove grupe ili korišćenje postojeće; ne postoji zaseban klijentski tab biblioteke grupa | da | `components/menu/studio/artikal/dodaj-grupu-dijalog.tsx` (nova ili postojeća grupa u istom dijalogu); nema taba biblioteke (K34: `lib/menu/recnik.test.ts` zabranjuje reč „biblioteka” u Menu rečnicima) | Natpis "Dodaj grupu" u kodu nije proveren. |
| 11 | Jedna povezana grupa može se primeniti na više artikala | da | convex/menuArticleOptions.test.ts:1422 ("a linked group: change it for ALL linked articles") |  |
| 12 | Pre menjanja povezane grupe sistem jasno prikazuje koliko i koje artikle promena pogađa | da | components/menu/studio/k15.test.tsx:393 ("Povezana grupa · 6 artikala"); (MP K15: dijalog uticaja navodi 6 artikala, MENI-PROGRESS.md:1155) |  |
| 13 | Klijent može izmeniti zajedničku grupu na svim povezanim artiklima ili napraviti nezavisnu kopiju samo za trenutni artikal | da | convex/menuArticleOptions.test.ts:1806 ("a linked group: an independent copy for ONE article") |  |
| 14 | Iz same grupe dostupna je akcija "Primeni i na druge artikle", sa pretragom i izborom artikala | da | convex/menuArticleOptions.test.ts:2235 ("applyAddonGroupToArticles ('Primeni i na druge artikle')"); components/menu/studio/artikal/primeni-na-druge.tsx (fajl postoji) | Pretraga i izbor u UI nisu posebno proveravani. |

#### §6.1 Nacrt i live verzija (ZAKLJUČANO, linije 396–406)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Svaka izmena klijenta automatski se čuva kao nacrt | da | lib/menu/studio/autosave-queue.test.ts (fajl postoji; MP K10: red čuvanja, MENI-PROGRESS.md:740); convex/menuBulk.test.ts (MP K11: "draft only") |  |
| 2 | Javna verzija se ne menja dok klijent ne pritisne Objavi | da | convex/menuPublicK13.test.ts:410 ("menuPublic — the draft never leaks into page, live or pageMedia"); (MP K05: convex/menuPublishing.test.ts, MENI-PROGRESS.md:320) |  |
| 3 | Objavljivanje je svesna radnja sa jasnim stanjem: ima ili nema neobjavljenih izmena | da | convex/menuPublishing.test.ts:235 (query draftStatus); (MP K10: neobjavljeneIzmene "ima", MENI-PROGRESS.md:741) |  |
| 4 | Klijent mora moći da pregleda nacrt pre objavljivanja | delimično | „Pregled” je stalno dostupan i crta nacrt javnim rendererom (`components/menu/studio/pregled/pregled-nacrta.tsx`) | pregled uživo ne prikazuje slike, cene varijanti, akcije, oznake ni alergene; K34 je to napisao u napomeni pregleda, pun pregled je BLOKADA (K34 N7) |
| 5 | Greška pri objavljivanju ne sme oštetiti trenutno javnu verziju | da | convex/menuPublishing.test.ts:378 (describe "publish — atomicity") |  |
| 6 | Objavljivanje proverava da li su nastale novije izmene od poslednjeg previewa | da | convex/menuPublishing.test.ts:175 (RefusalReason "stale_draft") |  |
| 7 | Greške blokiraju objavu; upozorenja dozvoljavaju objavu tek nakon svesne potvrde | da | convex/menuPublishing.test.ts:175 (validation_failed, confirmation_required); (MP K18: upozorenje bez potvrde nikad ne objavljuje, lib/menu/studio/publish-view.test.ts, MENI-PROGRESS.md:1409) |  |
| 8 | Svako uspešno objavljivanje pravi snapshot; čuva se poslednjih 20 objavljenih verzija | da | convex/menuVersions.test.ts:574 (describe "menuVersions — retention of the newest 20 snapshots") |  |
| 9 | Vraćanje prethodne verzije pravi novi nacrt i ne menja odmah javni meni | da | convex/menuVersions.test.ts:7 (zaglavlje: restoreVersion pretvara verziju u nacrt); convex/menuPublishingK18.test.ts:10 (a restore makes a DRAFT and says so) |  |
| 10 | Više urednika može raditi istovremeno; sistem prikazuje ko trenutno uređuje isti artikal | da | convex/menuPresence.test.ts:134 (describe "menuPresence.heartbeat — writes"); :443 (describe "menuPresence.listForService"); (MP K18: prisustvo u detalju, components/menu/studio/k18.test.tsx) |  |
| 11 | Konflikt iste vrednosti ne sme neprimetno pregaziti noviju izmenu | da | convex/menuConflicts.test.ts:119 (describe "conflicts — the same price from the same starting point") |  |

#### §6.2 Interna migracija (ZAKLJUČANO, linije 412–421)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Klijent dostavi postojeći URL, PDF, fotografije ili fizički meni | n/p | proces van aplikacije | Procesni korak van aplikacije. Klijentski upload nije nađen u panelu. Admin faze (primljeno, u izradi, na potvrdi, objavljeno) pominje docs/tasks/BLOCKED.md (TASK-58). |
| 2 | Interni alat izvlači i strukturira podatke | delimično | `convex/menuAdminImportV2.test.ts:291`, `lib/menu/legacy-mapping.test.ts` | OCR/AI ekstrakcija nije u kodu (vidi §2.3) |
| 3 | ScanMe operater proverava nazive, cene, grupe, varijante i duplikate | da | izveštaj uvoza pre upisa (`dryRun`: grupe, artikli, upozorenja, duplikati): `convex/menuAdminImportV2.test.ts:434`, `components/admin/menu-admin-rezim.test.tsx` | Pregled operatera kao UI nije proveravan. |
| 4 | Rezultat se uvozi kao nacrt | da | convex/menuAdminImportV2.test.ts:5–6 (uvoz u nacrt; never publishing) |  |
| 5 | Klijent ili ScanMe proverava preview | da | convex/menuPublishing.test.ts:186 (previewOf) |  |
| 6 | Tek nakon provere sadržaj se objavljuje | da | convex/menuAdminImportV2.test.ts:6 (never publishing); (MP K06: entry = none, never_published, MENI-PROGRESS.md:469) |  |
| 7 | Klijent ne mora da razume uvoz, mapiranje kolona, OCR, AI ekstrakciju ili deduplikaciju | da | klijentski panel ima tačno osam sekcija, bez uvoza i migracije (`lib/menu/panel-nav.test.ts:48`) | Odsustvo "Migracija postojećeg menija" je potvrđeno (vidi §2.3 red 2). Nije proveren ceo klijentski panel za pojmove uvoz i OCR. |

#### §7.1 Osnovni princip (ZAKLJUČANO, linije 443–464)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Javni meni je modularan, ali kontrolisan; klijent bira podržan obrazac, ne proizvoljan page builder | da | components/menu/studio/k17.test.tsx:231 (curated palettes); (MP K13/K17: tri layouta, MENI-PROGRESS.md:1288–1292) |  |
| 2 | Kontinuirani vertikalni meni sa sekcijama | da | components/menu/javni/javni.test.tsx:315 (describe "Tok (primer kafic)") |  |
| 3 | Anchor ili sticky navigacija do sekcija | da | components/menu/javni/javni.test.tsx:339 (href="#sekcija"); (MP K13: čip u Tok postaje tekući, MENI-PROGRESS.md:946) |  |
| 4 | Filteri ili kategorije | da | lib/menu/filters.test.ts:169, :173; components/menu/javni/pretraga-alergeni.test.tsx:216 |  |
| 5 | Vizuelni početni izbor kategorija | da | components/menu/javni/kategorije.tsx:79 (kartica kategorije sa slikom); (MP K13: "Kategorije: mreža, kategorija i dva izlaza", MENI-PROGRESS.md:921) |  |
| 6 | Odvojena odredišta dostupna sa razdelnika | da | components/menu/javni/razdelnik.test.tsx:121 |  |
| 7 | Kombinacija ovih obrazaca u granicama podržanog layouta | da | `Tok`: sidra + pretraga + filteri na istoj stranici (`components/menu/javni/pretraga-alergeni.test.tsx`, `javni.test.tsx`) | Svaki obrazac je pokriven posebno. Kombinacija nije eksplicitno testirana. |
| 8 | Početni ugostiteljski V1 ima tri layouta: Tok, Kategorije, Kompaktno | da | components/menu/javni/javni.test.tsx (MP K13: "the three primers are intentionally different", MENI-PROGRESS.md:963); lib/menu/public-view.test.ts (izborMedija) |  |
| 9 | Tok i Kategorije podržavaju sliku, ikonicu ili prikaz bez medija | da | components/menu/javni/k17-varijante.test.tsx (MP K17: ograničenje medija none, icon, image, MENI-PROGRESS.md:1292); components/menu/javni/javni.test.tsx (MP K13: rezervna ikonica umesto slike) |  |
| 10 | Kompaktno je namerno tekstualan i ne podržava sliku ni ikonicu artikla | da | components/menu/javni/javni.test.tsx (MP K13: Kompaktno nema img ni svg u artiklu, MENI-PROGRESS.md:920); components/menu/javni/k17-varijante.test.tsx (MP K17: Kompaktno nikad bez medija) |  |

#### §7.2 Pretraga i filteri (ZAKLJUČANO, linije 468–474)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Klijent bira da li uopšte želi pretragu | da | components/menu/studio/izgled/za-goste.tsx:16, :24 (prop pretraga: boolean; komentar: pretraga, filteri i EUR postoje samo kad lokal to uključi) |  |
| 2 | Klijent bira da li želi filtere i koje podržane filtere prikazuje gostu | da | K34 ispravka: ispod prekidača „Filteri” lokal bira koje oznake gost može da bira (`components/menu/studio/izgled/za-goste.tsx`, `components/menu/studio/k34-izgled.test.tsx`, `lib/menu/filters.test.ts` „prebaciFilter”) | pre K34 samo „svi ili nijedan” (K34 N12) |
| 3 | Prazni ili neprimenljivi filteri se ne prikazuju | da | lib/menu/filters.test.ts:169 ("an enabled code that no article has is hidden"); :173 ("a code the article has but the venue did not enable is hidden") |  |
| 4 | Ne postoji filter za raspon cena | da | lib/menu/filters.test.ts:81 (describe "there is no price filter") |  |
| 5 | Stanje pretrage i filtera treba razumno sačuvati pri povratku sa detalja artikla | da | tmp/meni/k14-pregled/interakcije.mjs (Playwright 17/17: "pretraga ostaje posle detalja", MENI-PROGRESS.md:1058) | Samo browser skripta, nije unit test. |

#### §7.3 Alergeni (ZAKLJUČANO, linije 478–492)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Unos alergena je opcioni sistem lokala | da | convex/menuArticleDetails.test.ts:411 (describe "allergens (master §7.3)"); :422 (allergensDisabled) |  |
| 2 | Unos alergena nije obavezno polje za svaki artikal | da | lib/menu/publish-validation.test.ts:98 (obavezno su samo naziv, sekcija i cena) |  |
| 3 | Ne očekuje se da osoblje za vodu, kiselu vodu, šampanjac i slično unosi niz negativnih tvrdnji | da | lib/menu/allergens.test.ts:122 ("an article without a record is UNKNOWN, never safe"); (MP K04: prazne liste brišu zapis, MENI-PROGRESS.md:171) |  |
| 4 | Lokal unosi alergene samo na artikle za koje su relevantni | da | convex/menuArticleDetails.test.ts:411 (isto kao red 2) |  |
| 5 | Ako lokal ne želi ili ne može da održava alergene, alergeni se uopšte ne prikazuju u tom meniju | da | lib/menu/allergen-warnings.test.ts:60 ("allergens off: null, even when something is marked and the article contains it") |  |
| 6 | Alergeni nisu klasičan filter koji sakriva artikle | da | components/menu/javni/pretraga-alergeni.test.tsx:216 (describe "a marked allergen warns on the card and in the detail, and the article stays visible") |  |
| 7 | Kada gost označi relevantan alergen, problematični ili potencijalno relevantni artikli dobijaju jasno upozorenje | da | components/menu/javni/pretraga-alergeni.test.tsx:216; lib/menu/allergen-warnings.test.ts (broj upozorenja i broj artikala bez podataka) |  |
| 8 | Sistem ne obećava da je artikal bezbedan; gost se upućuje da potvrdi informacije sa osobljem | da | lib/i18n/sr/menu-domen.ts:181 (tekst: "obavezno proverite sastav sa osobljem pre poručivanja") |  |
| 9 | Sistem podržava standardnih 14 glavnih kategorija alergena i opciju "Drugo" | da | lib/menu/allergens.test.ts:31 ("the 14 standard categories plus 'other' (Drugo), each once") |  |
| 10 | "Sadrži" i "Može sadržati tragove" vode se odvojeno | da | lib/menu/allergens.test.ts:58 ("'Sadrži' and 'Može sadržati tragove' are two separate labels") |  |
| 11 | Upozorenje se prikazuje i na kartici artikla i u detalju | da | components/menu/javni/pretraga-alergeni.test.tsx:216 (kartica i detalj); :266 ("Tok: the detail of a milk article shows the warning and the structured allergens") |  |
| 12 | Nepopunjen podatak nikada ne znači da je artikal bezbedan | da | lib/menu/allergens.test.ts:122–124 ("an article without a record is UNKNOWN, never safe"); (MP K14: allergen-warnings, "nepoznato nikad nije bezbedno") |  |
| 13 | Radni tekst upozorenja | da | lib/i18n/sr/menu-domen.ts:181 (tekst se poklapa sa master §7.3 doslovno) |  |
| 14 | Tekst treba pravno proveriti pre javnog lansiranja, ali ta provera ne blokira implementaciju strukture | n/p | pravna provera teksta pre lansiranja (BLOCKED K04, K14); ne blokira strukturu | Procesni uslov. Pravna provera je otvorena (docs/tasks/BLOCKED.md, K04 i K14). |

#### §7.4 Slika, ikonica ili ništa (ZAKLJUČANO, linije 498–504)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Klijent može birati sliku, ikonicu iz podržanog seta ili prikaz bez slike i ikonice | da | convex/schema.ts:3484 (mediaMode: menuMediaModeValidator); components/menu/studio/k15.test.tsx:317 (slika); components/menu/domestic-icons.tsx (set ikonica, fajl postoji) |  |
| 2 | Pravilo mora postojati u funkcionalnosti editora; ne sme biti svedeno na "slika ili ništa" | da | convex/schema.ts:3484 (tri vrednosti za mediaMode); components/menu/studio/k17.test.tsx (MP K17: Kompaktno isključuje izbor medija uz objašnjenje, MENI-PROGRESS.md:1291) |  |

#### §7.5 Varijante, dodaci i napomena (ZAKLJUČANO, linije 510–512)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Strukturirane varijante i dodaci nisu obavezni za svaki lokal niti svaki artikal | da | convex/menuArticleOptions.test.ts:263 ("a plain article stays 'Naziv + Cena'") |  |
| 2 | Klijent bira da li koristi strukturirane opcije, samo slobodnu napomenu, oba ili nijedno | da | convex/menuArticleOptions.test.ts:262 (describe "a plain article and the option switches"); :296 (noteEnabled); prekidači variantsEnabled, addonsEnabled, noteEnabled su nezavisni |  |
| 3 | Sistem mora da podrži jednostavne lokale bez dodatne konfiguracije i složenije ponude sa varijantama | da | convex/menuArticleOptions.test.ts:263 (običan artikal); :284 (varijante i napomena) |  |

#### §7.6 Akcije i popusti (ZAKLJUČANO, linije 516–522)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Artikal ima regularnu cenu i opcionu akcijsku cenu ili procenat popusta | da | lib/menu/promo.test.ts:46 (describe "percent <-> price, whole dinars, half up"); convex/menuPromos.test.ts (ručna akcija) |  |
| 2 | Može imati oznaku poput "Akcija" ili "Preporuka" | da | (MP K14: lib/menu/filters.test.ts, "Preporuka" iz akcije, MENI-PROGRESS.md:1048); lib/menu/promo.ts (MP K04: oznaka Akcija ili Preporuka, MENI-PROGRESS.md:162) | Naziv testa nije grep-ovan. |
| 3 | Početak i kraj akcije su opcioni; po isteku se automatski vraća regularna cena | da | lib/menu/promo-active.test.ts:63 ("one minute before the start: not active, the regular price shows") |  |
| 4 | Klijent može uneti akcijsku cenu ili procenat, a sistem izračunava drugu vrednost | da | lib/menu/promo.test.ts:47 (procenat -> cena), :56 ("a promo price becomes the nearest whole percent, never 0 for a real discount") |  |
| 5 | Ručno aktiviranje akcije je Standard funkcija; zakazivanje akcije je Premium | da | convex/menuPromos.test.ts:373 ("scheduled promotions need Premium"); components/menu/studio/k15.test.tsx:467 ("a promotion on Standard: the schedule is locked with the Premium mark and the reason") |  |

#### §7.7 Više jezika (ZAKLJUČANO, linije 528–536)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Meni može biti višejezičan | da | convex/menuTranslations.test.ts:341; convex/menuSettings.test.ts:86 (describe "menuSettings.languages (read)") |  |
| 2 | Upravljanje jezicima nalazi se u Podešavanjima, a ne kao duplirana glavna sekcija editora | da | app/[slug]/client-panel/meni/podesavanja/page.tsx:8 (komentar: jezici su u Podešavanjima); convex/menuSettings.test.ts:85 | Ponašanje u browseru nije proveravano. Editor nije proveravan na dupliranu sekciju. |
| 3 | Jezička verzija treba da prati strukturu istog menija | da | components/menu/javni/pretraga-alergeni.test.tsx:540 (describe "a missing translation shows the source text"; ista struktura, MP K14) |  |
| 4 | Standard podržava najviše dva jezika po Menu usluzi i ručno prevođenje | da | convex/menuSettings.test.ts:129; convex/menuTranslations.test.ts:341 |  |
| 5 | Premium nema komercijalni limit broja jezika i uključuje AI predlog prevoda | da | convex/menuSettings.test.ts:159 (describe "Premium: no commercial limit, technical maximum ten"); convex/menuTranslations.test.ts:6 (AI predlog) | Tehnička granica 10 jezika. |
| 6 | AI predlog se nikada ne objavljuje automatski | da | convex/menuTranslations.test.ts:361 (confirmSuggestion); (MP K16: posle objave EN i dalje srpski dok se predlog ne potvrdi, MENI-PROGRESS.md:1233) |  |
| 7 | Ako prevod nedostaje, gost vidi izvorni tekst umesto praznog sadržaja | da | components/menu/javni/pretraga-alergeni.test.tsx:540 ("a missing translation shows the source text"); lib/menu/i18n-fallback.test.ts (MP K14) |  |
| 8 | Editor jasno označava nedostajući prevod | da | `components/menu/studio/k16.test.tsx:781` (nedostaje, zastareo, predlog rečima) | Oznaka u samom editoru nije potvrđena testom. |
| 9 | Promena izvornog teksta označava postojeći prevod kao zastareo | da | convex/menuTranslations.test.ts:491 ("a changed source makes the translation stale (hash); markReviewed makes it done again") |  |

#### §7.8 Direktan link (ZAKLJUČANO, linije 542–545)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Svaki meni dobija stabilan javni link | da | app/[slug]/meni/page.tsx:1 (komentar: stabilan javni link menija); (MP K13: ruta /[slug]/meni) |  |
| 2 | Pojedinačna stranica menija može dobiti direktan podlink | da | app/[slug]/meni/[stranica]/page.tsx (fajl postoji); (MP K13: ruta /[slug]/meni/[stranica], MENI-PROGRESS.md:956) |  |
| 3 | Link bez identifikatora stola ili sobe ne glumi da zna poziciju gosta | da | app/[slug]/meni/page.tsx:5–6 (komentar: plain link carries no table or room; nothing reads or invents a position); :17 (čita samo parametar jezik) |  |
| 4 | Direktan link je deo Standarda | da | app/[slug]/meni/page.tsx (javni link nije vezan za plan u ruti) | Nije temeljno proveravano da li postoji plan-gating u ruti. |

#### §7.9 Slike (ZAKLJUČANO ZA V1, linije 551–556)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 1 | Jedna glavna slika po artiklu deo je Standarda | da | convex/schema.ts:3485 (imageMediaId: jedan slot po artiklu); components/menu/studio/k15.test.tsx:317 |  |
| 2 | Maksimalni originalni upload je 10 MB | da | convex/menuMedia.test.ts:279 ("Exactly 10 MB is still accepted"); :420 ("a stored blob over 10 MB is refused, the upload fails and the blob is deleted") |  |
| 3 | Sistem pravi web-optimizovan format i potrebne responsive dimenzije, uz približno 2.400 px za maksimalnu dugu stranicu | da | lib/menu/http/image-transform.test.ts:88 (thumbnail, najduža strana 512); :169 (AVIF i WebP); convex/menuMedia.test.ts:355–364 (maxDimension 2400); :623 (dimenzije preko 2400 odbijene) |  |
| 4 | Uklanjaju se nepotrebni metapodaci | da | lib/menu/http/image-transform.test.ts:136 ("EXIF, XMP and ICC of the input never reach any output"); :158 ("a GPS-tagged JPEG produces outputs without EXIF") |  |
| 5 | Javni meni koristi lazy loading i ikonicu kao fallback | da | `loading="lazy"` (`components/menu/javni/artikal.tsx`, `kategorije.tsx`); K34 ispravka: ikonica leži ispod slike u redu, kartici, pločici kategorije, naslovnoj razdelnika i detalju, pa se vidi kad slika ne može da se učita (`components/menu/javni/k34-javni.test.tsx`) | pre K34 se ikonica birala samo kad slike nema u snimku; slika koja ne može da se učita ostavljala je prazno polje (K34 N16) |
| 6 | Galerije i video ostaju za kasniju Premium fazu | van obima V1 | V1 javni meni (`components/menu/javni/**`) nema galeriju ni video | blok galerije (`components/menu/blocks/galerija-group.tsx`) pripada zatečenom rendereru, ne V1 meniju |
| 7 | Jovan prvo proverava i po mogućnosti ponovo koristi postojeći storage ili upload tok; konkretan provider, format i pragovi su tehnička odluka zasnovana na merenju | da | postojeći Convex storage i tabela `mediaAssets` (K15 ODLUKE); K34: prijava bloba vezana za rezervaciju (`convex/menuMedia.ts` `blobOfUpload`) | Tehnička odluka. Upload pipeline postoji (convex/menuMedia.ts; BLOCKED K15: SCANME_PIPELINE_SECRET). Nije potvrđeno da je to ponovo korišćen postojeći tok. |

#### §8 Zahtevi gosta i poručivanje

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 8.1.1 | Gost može pozvati konobara | da | convex/menuGuest.ts:478 (callWaiter); convex/menuGuestRequests.test.ts „a call writes one new request with the snapshots and no personal data” |  |
| 8.1.2 | Gost može zatražiti račun | da | convex/menuGuest.ts:484 (requestBill); convex/menuGuestRequests.test.ts „a bill stores the payment preference; another one updates it while the bill is new” |  |
| 8.1.3 | Gost navodi plaćanje gotovinom ili karticom | da | lib/menu/request-status.ts:27 (MenuPaymentPreference: cash, card); convex/menuGuest.ts:485 (argument payment); convex/menuGuestRequests.test.ts „an invalid payment literal fails argument validation and writes nothing” |  |
| 8.1.4 | Gost sastavlja porudžbinu i šalje je konobaru kao zahtev | da | convex/menuGuest.ts:541 (submitOrder); convex/menuGuestRequests.test.ts „lines are re-priced from the live version…” |  |
| 8.1.5 | Gost šalje zahtev za rezervaciju | da | `convex/menuReservations.test.ts:312` „happy path: ok + id, a NEW row without a table” |  |
| 8.1.6 | Gost otvara eksterni sistem rezervacija (ako lokal koristi) | da | `convex/menuReservations.test.ts:224` „external returns the link and nothing else” |  |
| 8.1.7 | Radnje su opcione po podešavanju lokala | da | convex/menuGuestRequests.test.ts „sessionView offers a table the actions the venue switched on…”; convex/menuCapabilities.test.ts:276 „owner and manager switch callWaiter on and off at Standard…” |  |
| 8.2.1 | Gostova porudžbina je zahtev konobaru | da | lib/menu/request-status.ts:23 (MENU_REQUEST_KINDS: call, bill, order); convex/menuGuest.ts:541 (submitOrder) |  |
| 8.2.2 | Zahtev ne ide direktno kuhinji | da | convex/menuGuest.ts:81 (komentar: „Nothing here sends anything to a kitchen or takes a payment”); convex/menuGuestRequests.test.ts:1825 „menuRequests has no paid/payment/kitchen field except paymentPreference” |  |
| 8.2.3 | ScanMe ne garantuje automatsko prihvatanje ni pripremu | da | lib/menu/request-status.ts:68-69 (prihvatanje i završetak samo za osoblje); convex/menuGuestRequests.test.ts:1505 „a guest cannot accept or finish…” | Odsustvo automatskog prihvatanja: nextStatus menja stanje samo na radnju osoblja |
| 8.2.4 | Konobar pregleda, potvrđuje zahtev i nastavlja proces lokala | da | convex/menuWaiter.ts:734 (accept), :740 (complete); convex/menuGuestRequests.test.ts:1451 „new -> accepted -> done writes who and when…” |  |
| 8.2.5 | U početnom obimu nema plaćanja kroz ScanMe Menu | da | convex/menuGuest.ts:81; convex/menuGuestRequests.test.ts:1825 |  |
| 8.3.1 | Svaka dodatna sposobnost je opciona | da | convex/menuCapabilities.test.ts:276; convex/menuGuestRequests.test.ts „sessionView offers a table the actions the venue switched on…” |  |
| 8.3.2 | Lokal sa samo digitalnim prikazom ne mora da koristi poziv, porudžbine, račun, rezervacije, stolove, zone ili zauzetost | da | convex/menuCapabilities.test.ts:276 (prekidači poziva konobara); convex/menuWaiterFloor.test.ts:633 „{ off: true } while the module is off” | Nema testa koji eksplicitno opisuje lokal samo sa prikazom; pokriveno prekidačima modula |
| 8.4.1 | Glavni tok statusa: Novi → Prihvaćen → Završen | da | lib/menu/request-status.ts:20 (new, accepted, done, cancelled) i dijagram u :4-7; convex/menuGuestRequests.test.ts:1835 „the stored status is one of new, accepted, done, cancelled” |  |
| 8.4.2 | Otkazan je završni ishod kada gost ili osoblje otkaže | da | lib/menu/request-status.ts:62-66; convex/menuGuestRequests.test.ts:1536 „an own new request is cancelled by the guest and audited” |  |
| 8.4.3 | Status „Konobar je krenuo” je izbačen iz novog toka | da | Grep „krenuo” u convex/, lib/, components/ i app/: samo komentari i zabrane (convex/lib/menuDomainValidators.ts:413; lib/menu/request-status.ts:9; components/menu/konobar/konobar.test.tsx:644 ZABRANJENO) |  |
| 8.5.1 | Novi zahtev može proizvesti kratak zvuk | da | `components/menu/konobar/zvuk.ts:17` (kratak Web Audio ping iz `lib/ordering-panel-alert.ts`), `lib/menu/reminder.test.ts:81`; K23 Playwright sa lažnim AudioContext-om | radnik je pogrešno zaključio da zvuka nema (tražio je samo u `components/` i `app/`) |
| 8.5.2 | Zvuk je opcion i može se potpuno isključiti u konobarskom panelu | da | components/menu/konobar/sala.test.tsx:786 „zvuk=iskljucen starts with the sound off…”; components/menu/konobar/zaglavlje.tsx:118-122 (aria-pressed, data-zvuk) | Prekidač postoji, ali bez efekta dok zvuk nije implementiran (vidi 8.5.1) |
| 8.5.3 | Zvuk se ne reprodukuje neprekidno do preuzimanja zahteva | da | `lib/menu/reminder.test.ts:63` (prvo viđenje ne zvoni), `:81` (tačno jednom po intervalu); `zvuk.ts` „Never repeats by itself” | Nema reprodukcije zvuka u kodu, pa pravilo ne može da se proveri |
| 8.5.4 | Lokal može podesiti vreme podsetnika | da | convex/menuSettings.ts:94-122 (reminderMin: 0 = isključeno, 1–60 min); convex/menuSettings.test.ts:566 „the reminder: 0 (off) and 60 are fine…”; components/menu/panel/podesavanja/podesavanja.test.tsx:201 |  |
| 8.5.5 | Podsetnik može ponoviti kratak zvuk i animaciju relevantnog stola/reda | da | zvuk podsetnika (`lib/menu/reminder.ts`) i animacija reda i stola (`components/menu/konobar/radni-red/kartica-zahteva.tsx:82-87`) | Animacija reda postoji, zvuk ne. Traka podsetnika je namerno tiha: components/menu/konobar/podsetnik.test.tsx:161 „calm: INFO tone, no sound element, no pulse or blink” |
| 8.5.6 | Sistem ne prosleđuje automatski nerešen zahtev drugim konobarima ili menadžeru | da | convex/menuPanel.ts:99 (komentar: jedini upis je podsetnik; nema prosleđivanja ni preraspodele); convex/menuPanelOperations.test.ts:418 „Nothing is reassigned and no status changes”; convex/menuPanelOperations.test.ts:625 „nobody else closes it: another waiter, an account, another venue…” | Dokaz je odsustvo logike prosleđivanja; ručni podsetnik menadžera je jedina intervencija |
| 8.5.7 | Podešavanje zvuka pripada konobarskom panelu, ne sekciji Funkcionalnosti | da | components/menu/panel/funkcionalnosti/funkcionalnosti.test.tsx:185 „the section has no sound setting and never says the word”; components/menu/panel/tim/tim.test.tsx:152 |  |

#### §9 QR kodovi, stolovi, sobe i pozicije

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 9.1.1 | QR može voditi na isti meni, a sadržati jedinstveni identifikator kartice/stola/sobe | da | convex/menuGuest.ts:64-73 (kartica na poziciji otvara meni sa pozicijom); convex/menuQr.test.ts:511 „one Menu card per position: label, target, link, unique 8-character codes, audit” |  |
| 9.1.2 | Gost ne bira ručno sto ili sobu | da | convex/menuGuest.test.ts:225 „a position card opens a session; the view knows the table, the URL does not” | app/r/[cardCode]/izbor/page.tsx je razdelnik usluga (TASK-37), a ne izbor stola |
| 9.1.3 | Sistem automatski prepoznaje poziciju iz QR veze | da | convex/menuGuest.ts:142-157 (kartica se razrešava u poziciju); convex/menuGuest.test.ts:155 „a card on an active position goes through the hop…” |  |
| 9.1.4 | Direktan link bez pozicije: sistem ne izmišlja poziciju | da | convex/menuGuest.test.ts:261 „a card without a position opens its page with no session (nothing invented)”; convex/menuGuest.test.ts:334 „…the menu still opens, without a position” |  |
| 9.2.1 | Klijent vidi koja kartica je povezana sa kojom pozicijom | da | convex/menuQr.test.ts:364 „link: position and an inactive row are reported…”; convex/menuWaiterFloor.test.ts:1312 „the labels of the ACTIVE cards linked to the position…” |  |
| 9.2.2 | Klijent menja naziv/broj pozicije | da | convex/menuFloor.test.ts:820 „changes label, kind and seats; null seats removes the field…” |  |
| 9.2.3 | Klijent raspoređuje stolove na način koji odgovara lokalu | da | convex/menuFloor.test.ts:961 „stores a valid layout…”; convex/menuFloor.test.ts:1045 „swaps two tables in one call…”; convex/menuFloor.ts:552 (automatsko raspoređivanje na zahtev) |  |
| 9.2.4 | Klijent opciono upisuje broj mesta za sedenje | da | convex/menuFloor.test.ts:820 „null seats removes the field”; convex/menuFloor.test.ts:609 „refuses bad labels, seats and zones, and writes nothing” |  |
| 9.2.5 | Klijent vidi status kartice/veze | da | convex/menuWaiterFloor.test.ts:1345 „a card follows its link: archiving the link or disabling the card removes it”; convex/menuQr.test.ts:1011 „disables and re-enables a card, audited…” |  |
| 9.2.6 | Više QR kartica za različita odredišta bez naknade za samo generisanje | da | više kartica za stranice i mesta (`convex/menuQr.test.ts:644`), kovanje bez naplate | Višestruke kartice su potvrđene. „Bez naknade” nije potvrđeno: nema testa ni koda za naplatu generisanja (Grep naknad/fee/billing/price u menuQr.test.ts bez pogodaka) |
| 9.3.1 | Zone su opcione | da | convex/menuWaiterFloor.test.ts:511 „a venue without zones or positions has an empty floor”; components/menu/panel/tim/tim.test.tsx:340 „zone controls exist only when the venue has zones” |  |
| 9.3.2 | Opcija dodele zone prikazuje se samo kada je lokal podeljen na zone | da | components/menu/panel/tim/tim.test.tsx:340 „zone controls exist only when the venue has zones” |  |
| 9.3.3 | Vlasnik ne mora trajno da veže konobara za zonu | da | convex/menuWaiterFloor.test.ts:1074 „a staff member sets their own zone and clears it again; only their own row changes” |  |
| 9.3.4 | Konobari mogu menjati raspodelu tokom smene | da | convex/menuWaiterFloor.test.ts:1074 |  |
| 9.3.5 | Konobar menja sopstvenu zonu, menadžer raspodelu svih konobara | da | convex/menuWaiterFloor.test.ts:1074 (sopstvena zona); convex/menuWaiterFloor.test.ts:1176 „a staff member with panelRole manager assigns a zone…”; convex/menuWaiterFloor.test.ts:1212 „the Owner, a Manager and a ScanMe admin assign zones with their account” |  |
| 9.3.6 | Nema automatskog predloga raspodele | da | Odsustvo: Grep suggest/predlog/auto u convex/menu*.ts ne nalazi predlog raspodele konobara | „Rasporedi automatski” (convex/menuFloor.ts:552) je raspored stolova, a ne raspodela konobara |
| 9.3.7 | Pozicije bez zone prikazuju se pod „Bez zone” i dostupne su celom osoblju | da | lib/i18n/sr/menu-konobar.ts:203 (bezZone: „Bez zone”); convex/menuFloor.test.ts:496 „moves the zone's positions to Bez zone on free spots…”; convex/menuWaiterFloor.test.ts:447 „zones, positions and staff of the venue: active only, in order…” |  |
| 9.4.1 | Praćenje zauzet/slobodan je opcioni modul | da | convex/menuWaiterFloor.test.ts:570 „occupancyEnabled mirrors features.occupancy”; convex/menuWaiterFloor.test.ts:633 „{ off: true } while the module is off, even if rows exist” |  |
| 9.4.2 | Bez modula neutralan sto nema pretpostavljeni status „slobodan” | da | convex/menuWaiterFloor.test.ts:633; components/menu/konobar/sala.test.tsx:945 „opisMestaSale of a neutral table says there is nothing active, never 'free'” |  |
| 9.4.3 | Sistem ne zaključuje da je sto slobodan samo zato što gost nije poslao zahtev | da | convex/menuWaiterFloor.test.ts:1037 „the scheduled expiry and the sweeps leave occupancy exactly as it was”; convex/menuWaiterFloor.test.ts:996 „no cron and no other module reaches the setOccupancy mutation” |  |
| 9.4.4 | Kada je modul uključen, osoblje ručno menja stanje stola | da | convex/menuWaiterFloor.test.ts:737 „records who and when…”; convex/menuWaiter.ts:992 (setOccupancy) |  |
| 9.4.5 | Podržana stanja: slobodan, zauzet, rezervisan, van upotrebe | da | convex/lib/menuDomainValidators.ts:477-480 (free, occupied, reserved, out_of_service); convex/menuWaiterFloor.test.ts:777 „every one of the four states can be set…” |  |
| 9.4.6 | Kontrola je lako dostupna u kontekstu izabranog stola | da | components/menu/konobar/sala.test.tsx:395 „the table detail has no 'Status stola' heading without the module” (sa modulom kontrola je u detalju stola); components/menu/konobar/sto/zauzetost.tsx:14 |  |
| 9.4.7 | Rezervacija označena kao realizovana čini sto zauzetim samo ako je praćenje uključeno | da | components/menu/konobar/rezervacije.test.tsx:1286 „arrive with the module and a table: that table becomes Zauzet, and only that one”; components/menu/konobar/rezervacije.test.tsx:655 „the arrival hint about occupancy appears only with the module and a table” |  |
| 9.4.I1 | IZBAČENO: automatsko zaključivanje da su gosti otišli | da | Odsutno: convex/menuWaiterFloor.test.ts:1037; components/menu/konobar/sto/zauzetost.tsx:14 („no table history”, sistem ne menja stanje sam) |  |
| 9.4.I2 | IZBAČENO: automatsko oslobađanje stola bez radnje osoblja | da | convex/menuWaiterFloor.test.ts:1037; convex/menuWaiterFloor.test.ts:996 |  |
| 9.4.I3 | IZBAČENO: obavezan status zauzetosti za svaki lokal | da | convex/menuWaiterFloor.test.ts:633 (modul isključen, bez obaveze); convex/menuWaiterFloor.test.ts:570 |  |

#### §10 Konobarski / operativni panel

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 10.1.1 | Konobarski panel je poseban radni prostor od vlasničkog/klijentskog panela | da | Zasebne rute: app/[slug]/konobar/page.tsx i app/[slug]/client-panel/meni/operativa/page.tsx | Odvojenost potvrđena strukturom ruta; nije nađen test koji to eksplicitno proverava |
| 10.1.2 | Konobar obrađuje zahteve i statuse | da | convex/menuWaiter.ts:734 (accept), :740 (complete), :750 (cancel); convex/menuGuestRequests.test.ts:1451 |  |
| 10.1.3 | Vlasnik/menadžer uređuje ponudu i konfiguraciju i dobija pregled situacije | da | components/menu/panel/operativa/operativa.test.tsx:167 „the only buttons are the filters, Detalj and the reminder”; convex/menuPanelOperations.test.ts:560 „the Owner, a Manager and a ScanMe admin may remind…” |  |
| 10.1.4 | Vlasnički dashboard ne pretvara se u drugi konobarski panel | da | components/menu/panel/operativa/operativa.test.tsx:167 (vlasnički prikaz nema operativne radnje osim filtera, Detalja i podsetnika) |  |
| 10.2.1 | Mobilni telefon i tablet su primarni uređaji, desktop podržan | da | components/menu/konobar/k33.test.tsx:106 „the panel gives the floor the h1 only when the side pane is hidden on a phone”; components/menu/konobar/sala.test.tsx:650 „the back button is named for the floor on a phone” | Primarnost nije merena; proveren je prikaz za telefon |
| 10.2.2 | Jedan glavni ekran sa minimalnim brojem klikova | da | jedan glavni ekran, jedna glavna radnja od 48 px po zahtevu (`components/menu/konobar/sala.test.tsx:635`); K22 Playwright: Preuzmi pa Završi iz reda | Broj klikova nije meren; proverena je jedna glavna radnja po zahtevu |
| 10.2.3 | Postoje vizuelni prikaz prostora i tabelarni/list prikaz | da | components/menu/konobar/sala.test.tsx:417 (plan: Sto 1 označen na pločici); components/menu/konobar/sala.test.tsx:436 „the table view gets the status column…” |  |
| 10.2.4 | Jedan prošireni kontekstualni sidebar/drawer menja sadržaj prema izabranom stolu ili događaju | da | components/menu/konobar/sala.test.tsx:615 „it fills the one contextual pane, with exactly one h1: the table” |  |
| 10.2.5 | Ne dele se informacije na dva nepotrebna bočna panela | da | components/menu/konobar/sala.test.tsx:615 (jedan kontekstualni panel) |  |
| 10.2.6 | Kada sto nije izabran, panel prikazuje pregled aktivnih događaja i rezervacija | da | components/menu/konobar/konobar.test.tsx:278 „the summary under the h1: how many are open and since when the oldest new one waits”; components/menu/konobar/rezervacije.test.tsx:338 „Sve: the Uskoro section under the queue…” |  |
| 10.2.7 | Klik na sto prikazuje relevantne informacije i radnje u istom panelu | da | components/menu/konobar/sala.test.tsx:800 „the table detail: every main action waits, the reason is shown once, the titles still open” |  |
| 10.3.1 | Oba prikaza pokazuju sva paralelna aktivna stanja | da | components/menu/konobar/sala.test.tsx:918 „every active request is counted under its kind: the kinds of a table are parallel, not one 'main' state” |  |
| 10.3.2 | Oznake: zvonce (poziv), račun, porudžbina, rezervacija | da | components/menu/konobar/konobar.test.tsx:297 „the words come from the dictionaries: payment wish of a bill, line count of an order…”; components/menu/konobar/sala.test.tsx:384 „the legend names the kinds…” | Konkretna imena ikonica nisu proveravana u kodu (u dokumentaciji: docs/menu/MENU-UX.md:271) |
| 10.3.3 | U tabeli su ikonice u koloni zahteva, sa legendom | da | components/menu/konobar/sala.test.tsx:384 (legenda); components/menu/konobar/sala.test.tsx:436 (kolona statusa); components/menu/konobar/konobar.test.tsx:306 „every status is an icon AND a word” |  |
| 10.3.4 | U vizuelnom prikazu oznake su oko ili uz reprezentaciju stola | da | components/menu/konobar/sala.test.tsx:417 „Sto 1 (occupied in the fixture) is marked on the tile”; components/menu/konobar/sala.test.tsx:222 (ime pločice nosi stanja) |  |
| 10.3.5 | Boja i nenapadna animacija skreću pažnju bez preopterećenja | da | components/menu/konobar/sala.test.tsx:598 „outside reduced motion the ring pulses once every 10 seconds”; components/menu/konobar/sala.test.tsx:602 „with reduced motion the ring stands still…”; components/menu/konobar/konobar.module.css:1-16 |  |
| 10.4.1 | Svaki događaj prikazuje tačno vreme nastanka/termina | da | components/menu/konobar/konobar.test.tsx:486 „…the status, the two time cells and the source card”; components/menu/konobar/podsetnik.test.tsx:109 „the time is the request's own, in Belgrade” |  |
| 10.4.2 | Za aktivan zahtev prikazuje se live proteklo vreme | da | components/menu/konobar/k33-perf.test.tsx:236 „an active table is redrawn each second in its first minute…, then once a minute”; components/menu/konobar/sala.test.tsx:222 („…with its time and wait”) |  |
| 10.4.3 | Za rezervaciju: planirano vreme i live kašnjenje posle početka termina | da | components/menu/konobar/rezervacije.test.tsx:439 „rv_07 (25 minutes past the term, hold 15): red, 'kasni 25:00'…”; components/menu/konobar/rezervacije.test.tsx:459 „within the hold the lateness is calm” |  |
| 10.4.4 | Tek nakon podešenog praga (npr. 15 min) stanje postaje crveno i pulsira | da | components/menu/konobar/konobar.test.tsx:326 „only the request past 15 minutes is late…”; components/menu/konobar/sala.test.tsx:563 „…the legend names 5 minutes” (podešen prag); components/menu/konobar/konobar.module.css:5-8 |  |
| 10.4.5 | Format vremena je uniforman u vizuelnom i tabelarnom prikazu | da | isti `formatElapsed` u rasporedu i tabeli (`components/menu/konobar/sala/znacka-stanja.tsx:79`, `sala/tabela.tsx:151`; `lib/menu/elapsed-time.test.ts`) | K34: sat panela ispravljen prema satu servera (K34 N6) |
| 10.5.1 | Klik na sto otvara kontekst sa relevantnim trenutnim informacijama i radnjama | da | components/menu/konobar/sala.test.tsx:615; components/menu/konobar/sala.test.tsx:800 |  |
| 10.5.2 | Konobar bira da li želi detalje; korisni podaci se ne uskraćuju | da | detalj stola tek na klik (`components/menu/konobar/sala.test.tsx:615`) | Kvalitativno pravilo; nema testa koji ga direktno proverava |
| 10.5.I1 | IZBAČENO: istorija stola kao stalna funkcija operativnog interfejsa | da | components/menu/konobar/detalj-zahteva/detalj-zahteva.tsx:9 („No table history (master §10.5)”); components/menu/konobar/sto/detalj-stola.tsx:12; components/menu/konobar/sto/zauzetost.tsx:14 |  |
| 10.5.I2 | IZBAČENO: prosečno vreme preuzimanja zahteva kao obavezna metrika | da | docs/menu/ANALITIKA-DEFINICIJE.md:18 (nema prosečnog vremena preuzimanja zahteva ni u jednom planu); docs/menu/ANALITIKA-DEFINICIJE.md:92 (prosečno vreme preuzimanja zabranjeno, §14.3) | U kodu nije nađena takva metrika |
| 10.5.I3 | IZBAČENO: automatska preraspodela zahteva drugim konobarima ili menadžeru | da | Ista evidencija kao 8.5.6 (convex/menuPanelOperations.test.ts:625) |  |
| 10.6.1 | Klijent kreira članove osoblja | da | convex/menuStaff.test.ts:541 „create trims the name, defaults the panel role to staff and writes staff.created” |  |
| 10.6.2 | Svaki radnik dobija trocifreni numerički PIN | da | convex/menuStaff.test.ts:315 „without a pin the system picks a three-digit PIN, shown once and never listed”; convex/menuStaff.test.ts:348 „a PIN that is not exactly three digits is staff/pin_format” |  |
| 10.6.3 | Prijava PIN-om identifikuje ko je preuzeo i završio zahtev | da | convex/menuGuestRequests.test.ts:1451 „new -> accepted -> done writes who and when…”; convex/menuWaiter.test.ts:352 „a correct PIN opens a 12 hour session; only a hash of its token is stored” |  |
| 10.6.4 | Prava pristupa dovoljno jednostavna za svakodnevni rad | da | četiri uloge iz jedne matrice (`lib/menu/permissions.ts`), Tim prikazuje „Može / Ne može” (`components/menu/panel/tim/tim.test.tsx`) | kvalitativno |
| 10.6.5 | PIN je jedinstven među aktivnim članovima istog lokala; čuva se samo u hash obliku | da | convex/menuStaff.test.ts:358 „a PIN held by another active member is staff/pin_taken…”; convex/menuStaff.test.ts:369 „a deactivated holder frees the PIN…”; convex/menuStaff.test.ts:400 „only a lookup HMAC and a salted PBKDF2 hash are stored…” |  |
| 10.6.6 | Strogo ograničavanje pokušaja i privremena blokada posle pet pogrešnih | da | convex/menuWaiter.test.ts:460 „five wrong PINs lock the device; the sixth try fails even with the right PIN”; convex/menuWaiter.test.ts:504 „the lock ends after exactly 15 minutes…” |  |
| 10.6.7 | Vlasnik ili menadžer može resetovati PIN | da | convex/menuStaff.test.ts:437 „resetPin clears the PIN and signs out every device of that member only”; lib/menu/permissions.ts:62 (staff.pin: vlasnik i menadžer) | Urednik i osoblje nemaju staff.pin (lib/menu/permissions.ts:77, :81) |
| 10.6.8 | Uređaj pamti prijavu do 12 sati ili do ručne odjave | da | convex/menuWaiter.test.ts:352 („12 hour session”); convex/menuWaiter.test.ts:847 „after 12 hours the scheduled expiry ends the session”; convex/menuWaiter.test.ts:861 „logout ends the session, is audited once and is idempotent” |  |
| 10.6.9 | Osetljive radnje ulaze u audit evidenciju u pozadini | da | convex/menuStaff.test.ts:246 „the audit trail names the actor: a user, or the ScanMe admin”; convex/menuTeam.test.ts:710 „audit: team.removed carries the role only” | „bez gužve u konobarskom ekranu” nije posebno proveren |
| 10.6.10 | Uloga Vlasnik: puna prava, uključujući naplatu, tim i vlasništvo | da | Vlasnik ima sve dozvole Menu matrice (`lib/menu/permissions.ts`); naplata i vlasništvo naloga su van Menu UI-ja (recept §4.1) | Naplata je van Menu UI-ja (lib/menu/permissions.ts:71-73), pa nije proverena ovde |
| 10.6.11 | Uloga Menadžer: lokal, ponuda, tim, operativa i analitika, bez vlasništva i naplate naloga | da | convex/menuTeam.test.ts:184 „a Manager cannot invite an Owner (team/role_forbidden); an Owner can…” | „bez naplate naloga” nije posebno proveren |
| 10.6.12 | Uloga Urednik: ponuda, dizajn, preview i objavljivanje | da | `lib/menu/permissions.ts:77` (Urednik: menu.publish), `convex/menuPublishing.test.ts` (Urednik objavljuje) | Urednik nema operativu ni tim; convex/menuPanelHome.test.ts:403 „an Urednik gets the menu block and the Room service warnings, but operations and mail are null” |
| 10.6.13 | Uloga Osoblje: konobarski panel i dozvoljene operativne radnje | da | convex/menuWaiterFloor.test.ts:1163 „a plain staff member is menu/forbidden, whoever the target is”; convex/menuWaiter.test.ts:1361 „staff may cancel a new or an accepted request; it is written and audited” |  |
| 10.6.14 | Konobar menja sopstvenu zonu, menadžer raspodelu, bez automatskog predloga, „Bez zone” dostupno celom osoblju | da | Ista evidencija kao 9.3.3 do 9.3.7 |  |

#### §11 Rezervacije

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 11.1.1 | Ne postoji zasebna usluga „ScanMe Reservations”; rezervacije su funkcionalnost Menu usluge | da | convex/menuReservationSettings.test.ts:597 „the defaults: off, both, no link, 15 minutes, no hours”; components/menu/panel/rezervacije-podesavanja.test.tsx:310 | Struktura: sve funkcije rezervacija su u convex/menuReservations*.ts |
| 11.1.2 | Funkcionalnost može biti potpuno isključena | da | convex/menuReservations.test.ts:490 „switch off → reservation/off, and the venue's own system (external) stores NOTHING”; convex/menuReservationSettings.test.ts:471 „switching to off keeps the contact and the link…” |  |
| 11.1.3 | Ako lokal već koristi svoj sistem, linkovanje ima prednost nad promenom procesa | da | convex/menuReservationSettings.test.ts:452 „an https link is accepted and stored normalized; the public entry offers it”; convex/menuReservations.test.ts:224 „external returns the link and nothing else” | Prednost je u dizajnu: V1 nudi samo link (vidi 11.6.4) |
| 11.2.1 | Gost ne bira sto | da | convex/menuReservations.test.ts:398 „submit with an extra positionId is rejected by the validator and writes nothing”; convex/menuReservations.test.ts:426 „no other guest function takes a position either” |  |
| 11.2.2 | Forma sadrži ime, vreme/termin, broj gostiju, kontakt prema konfiguraciji i opcionu napomenu | da | convex/menuReservations.test.ts:312 „happy path: ok + id, a NEW row without a table…”; convex/menuReservations.test.ts:612 „party size 0 or 51 → partySize range; 1 and 50 are fine…”; convex/menuReservations.test.ts:355 „the contact is stored as the venue asks…” |  |
| 11.2.3 | Sva prikazana polja su obavezna osim napomene | da | convex/menuReservations.test.ts:568 „a missing or wrong contact → invalid_input with fieldErrors”; convex/menuReservations.test.ts:377 „…a note is optional…” |  |
| 11.2.4 | Lokal bira jednu konfiguraciju kontakta: obavezan email, obavezan telefon ili oba | da | convex/menuReservationSettings.test.ts:503 „the contact defaults to both; changing only the contact is a change”; convex/menuReservations.test.ts:355 |  |
| 11.2.5 | Pravila kontakta se konfigurišu samo za ScanMe formu, ne za eksterni sistem | da | components/menu/panel/rezervacije-podesavanja.test.tsx:310 „…only radios and the link”; convex/menuReservationSettings.test.ts:471 |  |
| 11.3.1 | Zahtev stiže osoblju | da | convex/menuReservationsPanel.test.ts:451 „the window: new and proposed of ANY date…”; convex/menuReservationsPanel.test.ts:1409 „staff of venue b cannot act on, bind to, receive or read venue a's reservation” |  |
| 11.3.2 | Konobar ili ovlašćena osoba ručno procenjuje dostupnost | da | convex/menuReservationsPanel.test.ts:1009 „accept: new → accepted (stamped), again → ok and unchanged”; convex/menuReservationsPanel.test.ts:1385 „an unanswered request and an unbound accepted one also stay as they are for days” |  |
| 11.3.3 | Zahtev se prihvata, odbija ili se gostu predlaže izmena | da | convex/menuReservationsPanel.test.ts:1009; convex/menuReservationsPanel.test.ts:1025 „decline: new → declined, audited…”; convex/menuReservationsPanel.test.ts:1070 „proposeChange: sets proposedAt and a cleaned proposalNote…” |  |
| 11.3.4 | Osoblje ručno povezuje prihvaćenu rezervaciju sa stolom | da | convex/menuReservationsPanel.test.ts:933 „bind, bind the same again, change, and unbind with null”; convex/menuReservationsPanel.test.ts:876 „refused unless the reservation is ACCEPTED…” |  |
| 11.3.5 | Sto dobija podatke iz zahteva | da | components/menu/konobar/rezervacije.test.tsx:891 „the tile's name says the reservation with the guest, the guests, the term and the lateness”; convex/menuReservationsPanel.test.ts:547 „returns the contact and the note, and who decided, bound and received the guests” |  |
| 11.3.6 | Kada gosti stignu, osoblje klikne sto i označi rezervaciju kao realizovanu | da | convex/menuReservations.ts:703 (markArrived); convex/menuReservationsPanel.test.ts:652 „occupancy module OFF: the reservation is realized and the table is NOT marked” |  |
| 11.3.7 | Ako lokal koristi statuse zauzetosti, sto tada automatski postaje zauzet | da | convex/menuReservationsPanel.test.ts:681 „occupancy module ON: only the arrival marks the bound table occupied…”; components/menu/konobar/rezervacije.test.tsx:1286 „arrive with the module and a table: that table becomes Zauzet, and only that one” |  |
| 11.3.8 | Sistem ne obećava automatsku dostupnost stola i ne dodeljuje sto gostu bez odluke osoblja | da | convex/menuReservationsPanel.test.ts:991 „the guest has no way to bind…”; convex/menuReservationsPanel.test.ts:1339 „…no status ever changes by itself” |  |
| 11.4.1 | Ako je poslovni email povezan sa klijentskim panelom, osoblje može odgovoriti direktno iz panela | da | convex/menuMailActions.test.ts:790 „Gmail: only to the reservation's own contactEmail, from the connected address, with the exact text…”; convex/menuMailActions.test.ts:806 „Microsoft: only to the contactEmail through Graph…”; convex/menuMailActions.test.ts:898 „a PIN waiter sends; the reply is recorded under the waiter…” |  |
| 11.4.2 | Ako koristi telefon, osoblje poziva gosta sa zajedničkog telefona ili ručno bira broj | da | convex/menuMail.test.ts:718 „a phone call with the outcome 'no_answer' is a logged row of the waiter”; convex/menuMail.test.ts:745 „a call without an outcome, and an opened mailto: with its kind, are logged too” | Poziv je ručan; sistem ne zove |
| 11.4.3 | Odgovor može biti prihvatanje, odbijanje ili druga poruka lokala | da | convex/menuMail.test.ts:551 „a saved template has its subject on one line and its body with LF breaks; the other kinds stay default”; convex/menuMail.test.ts:580 „the kind 'other' has no template: the validator rejects it” |  |
| 11.4.4 | Gmail i Microsoft mailbox povezuju se preko OAuth-a; lozinka mailboxa se ne čuva | da | convex/menuMail.test.ts:357 „Gmail: Google's host, the send-only scopes, offline access, consent, S256 and a state”; convex/menuMail.test.ts:375 „Microsoft: the common tenant, offline_access and Mail.Send…”; convex/menuMailActions.test.ts:712 „no token and no verifier is in any connection or state row; only the state's hash is” |  |
| 11.4.5 | Poruka se šalje iz povezanog mailboxa lokala | da | convex/menuMailActions.test.ts:790; convex/menuMailActions.test.ts:840 „without a connected mailbox (never connected, or disconnected) it is mail/not_connected” |  |
| 11.4.6 | Za nepodržani mailbox V1 može otvoriti mailto: tok | da | components/menu/odgovor/odgovor.test.tsx:199 „the mailto link carries the guest's address and percent-encoded Serbian letters and CRLF”; convex/menuMail.test.ts:759 „mailto: without the guest's e-mail address is mail/no_recipient…” |  |
| 11.4.7 | Početni šabloni za prihvatanje, odbijanje i predlog izmene; klijent menja tekst i potpis | da | convex/menuMail.test.ts:546 „by default: no templates and no signature (the dictionary defaults apply on the device)”; convex/menuMail.test.ts:609 „the signature: set (LF breaks), read back, cleared by an empty or blank text”; lib/i18n/sr/menu-odgovor.ts (početni tekstovi) |  |
| 11.4.8 | Telefonski ishod može opciono da se evidentira, bez obavezne administracije | da | convex/menuMail.test.ts:718; convex/menuMail.test.ts:745 („a call without an outcome… are logged too”) | Ishod nije obavezan |
| 11.5.1 | Ne postoji podrazumevano trajanje rezervacije | da | components/menu/panel/rezervacije-podesavanja.test.tsx:310 „RezervacijeIzbor has no duration, deadline, table or sound field…”; convex/menuReservationSettings.test.ts:597 |  |
| 11.5.2 | Ne postoji sistemski rok kada gosti moraju da napuste sto | da | components/menu/panel/rezervacije-podesavanja.test.tsx:310 (nema polja za rok) |  |
| 11.5.3 | Osoblje ručno procenjuje da li je u željeno vreme dostupan pogodan sto | da | convex/menuReservationsPanel.test.ts:1009 („accept”); convex/menuReservationsPanel.test.ts:1385 |  |
| 11.5.4 | Menadžer može podesiti koliko dugo lokal drži rezervaciju nakon termina | da | convex/menuReservationSettings.test.ts:304 „5 to 180 minutes are accepted and read back everywhere; the default is 15”; convex/menuReservationSettings.test.ts:332 „an Urednik, finance, view-only… are refused” | Dozvola: settings.edit (lib/menu/permissions.ts:63) |
| 11.5.5 | Kada se prag prekorači, sto dobija vizuelno upozorenje | da | components/menu/konobar/rezervacije.test.tsx:439 „rv_07 (25 minutes past the term, hold 15): red, 'kasni 25:00'…”; components/menu/konobar/rezervacije.test.tsx:825 „the lateness of an accepted reservation in the detail: red 'kasni 25:00' after the hold” |  |
| 11.5.6 | Posle upozorenja osoblje primenjuje politiku lokala (poziv, čekanje, otkazivanje, drugi gost) | da | convex/menuReservationsPanel.test.ts:1339 „holdMinutes from forPanel drives reservationTiming… no status ever changes by itself”; convex/menuReservationsPanel.test.ts:1201 „cancelByStaff: accepted or proposed → cancelled by staff and audited…” | Odluke su ručne |
| 11.5.7 | Sistem ne pokušava da utvrdi da li su gosti otišli | da | convex/menuReservationsPanel.test.ts:1339; components/menu/konobar/sto/zauzetost.tsx:14 („the system never changes this state by itself”) |  |
| 11.6.1 | U Funkcionalnosti > Rezervacije klijent bira ScanMe formu ili eksterni sistem | da | components/menu/panel/rezervacije-podesavanja.test.tsx:310 „…only radios and the link”; convex/menuReservationSettings.test.ts:608 „it follows the settings: mode, contact, link, hold and hours” |  |
| 11.6.2 | Ako izabere eksterni sistem, unosi se link ili integracija | da | convex/menuReservationSettings.test.ts:403 „external needs a link: none, blank → reservation/url_invalid”; convex/menuReservationSettings.test.ts:452 |  |
| 11.6.3 | Radno vreme lokala uvek je u Podešavanjima, ne u konfiguraciji eksternog sistema | da | convex/menuReservationSettings.test.ts:157 „the Owner, a Manager and a ScanMe admin save the week; it reads back…”; components/menu/panel/rezervacije-podesavanja.test.tsx:310 |  |
| 11.6.4 | V1 podržava link/redirect; dublje API integracije su pojedinačne ili Enterprise | da | convex/menuReservationSettings.test.ts:452 „an https link is accepted and stored normalized; the public entry offers it” (u V1 je eksterni sistem samo link) | Odsustvo API integracije nije posebno pretraženo |
| 11.6.5 | Kada se koristi eksterni sistem, ScanMe ne duplira njegove rezervacije | da | convex/menuReservations.test.ts:514 „external mode from the start: zero rows in menuReservations”; convex/menuReservations.test.ts:490 („stores NOTHING”) |  |
| 11.7.1 | Gost može otkazati rezervaciju dok nije označena kao realizovana | da | convex/menuReservations.test.ts:980 „a guest cancels an ACCEPTED reservation too (until it is realized)”; convex/menuReservations.test.ts:995 „after the guests arrived (staff markArrived) the reservation can no longer be cancelled”; convex/menuReservations.test.ts:1013 „a declined reservation can no longer be cancelled” |  |
| 11.7.2 | Otkazivanje je dostupno preko sigurnog direktnog linka i sekcije „Moji zahtevi” | da | convex/menuReservations.test.ts:934 „valid → cancelled by the guest, audited; again → ok and idempotent” (link, cancelByToken, convex/menuReservations.ts:301); convex/menuReservations.test.ts:1142 „cancelByDevice: own reservation → cancelled and audited; again → ok” (Moji zahtevi); app/[slug]/meni/zahtevi/page.tsx |  |
| 11.7.3 | Konobarski panel odmah i jasno obaveštava osoblje; sto, rezervacija i prikazi se ažuriraju u realnom vremenu | da | components/menu/konobar/rezervacije.test.tsx:1009 „a cancelled reservation of the table: 'Rezervacija otkazana · gost · 18:08' for two hours, only Otvori”; convex/menuReservationsPanel.test.ts:451 („cancelled since fromMs”) | „U realnom vremenu” je reaktivni upit; nije testirano vremenski |
| 11.7.4 | Bez online plaćanja nema kazne, avansa, refundacije niti roka za otkazivanje | da | Odsustvo: Grep (avans, refund, kazn, payment, plaćanj, naplat, deposit) u convex/menuReservations.ts nema pogodaka | Dokaz je odsustvo polja i koda za plaćanje |

#### §12 Usluge, proizvodi i lično preuzimanje (provera izloženosti u V1)

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 12.A | §12 (uslužni režim, proizvodi, lično preuzimanje, izmena i otkazivanje proizvoda, online plaćanje) nije izložen u V1 | da | Grep (uslug, pickup, preuzimanj, lično, retail, proizvod, uslužn) u app/[slug]/client-panel/meni: nema pogodaka; lib/menu/permissions.ts:43-44 (admin.mode: promena režima usluge samo ScanMe admin) | Provera je ograničena na klijentski panel |

#### §13 Klijentski panel

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 13.1.1 | Navigacija ima osam stavki u zaključanom redosledu: Početna, Editor, Operativa, Lokal i QR, Funkcionalnosti, Tim i pristupi, Analitika, Podešavanja | da | lib/menu/panel-nav.test.ts:48 „there are exactly eight sections, in the locked order”; lib/menu/panel-nav.test.ts:58 „the Serbian labels, mapped over the list, read in the locked order”; components/menu/panel/shell.test.tsx:225 „Analitika is second to last, right above Podešavanja” |  |
| 13.1.2 | Analitika je pretposlednja, neposredno iznad Podešavanja | da | lib/menu/panel-nav.test.ts:53 „Analitika is second to last and Podesavanja is last” |  |
| 13.1.3 | Režim usluge se prikazuje nenametljivo u proizvodu, ali nije stavka za promenu | da | lib/menu/panel-nav.test.ts:48 (tačno osam stavki, nijedna nije režim); lib/menu/permissions.ts:43-44 (admin.mode) |  |
| 13.2.1 | Početna daje brz odgovor da li nešto traži pažnju | da | components/menu/panel/pocetna/pocetna.test.tsx:155 „the blocks come in order: Pažnja, Meni, Sada u lokalu, Analitika, Brzi ulazi”; convex/menuPanelHome.test.ts:510 „requests: only Novi and Prihvaćen…” |  |
| 13.2.2 | Sažetak važnih tekućih događaja bez operativnog upravljanja | da | convex/menuPanelHome.test.ts:608 „reservations: the waiting ones whatever the date, accepted and arrived ones in the window; only the five safe fields”; convex/menuPanelHome.test.ts:680 „no guest contact, note, device pseudonym, hash, token or e-mail address is in the answer” |  |
| 13.2.3 | Pregled rezultata i analitike | da | components/menu/panel/pocetna/analitika-kartica.test.tsx:153 „the numbers are the report's: opens, article opens, scans and the most opened article”; components/menu/panel/pocetna/analitika-kartica.test.tsx:206 „one labelled image with the seven days and their opens, and seven columns” |  |
| 13.2.4 | Brz ulaz u Editor, Operativu, QR/lokal i druga važna mesta | da | components/menu/panel/pocetna/pocetna.test.tsx:356 „one button to Operativa directly under the floor lines…”; components/menu/panel/pocetna/pocetna.test.tsx:593 „every role with the panel sees it and can open the Editor”; components/menu/panel/sekcija-stanja.test.tsx:535 „with editorHref: the sentence and one link to the Editor” |  |
| 13.2.5 | Jasan status objavljene i radne verzije menija | da | convex/menuPanelHome.test.ts:461 „never published, then clean after Objavi, then dirty after the next edit”; components/menu/panel/pocetna/pocetna.test.tsx:659 „'paznja': the live version is older than the unpublished edit…” |  |
| 13.2.6 | Ne duplirati iste brojke u dva bloka na Početnoj | da | `lib/menu/home-summary.test.ts:670` „Početna ne ponavlja istu brojku u dva bloka” (test svojstva, 600 stanja) | Nema testa za duplikate između blokova; components/menu/panel/sekcija-stanja.test.tsx:333 („only the day ranges of Početna and Analitika carry numbers”) ne pokriva duplikate |
| 13.4.G1 | Editor: unos i uređivanje ponude | da | components/menu/studio/k11.test.tsx:836 „an article: title, description, and two labelled selects (Sekcija, Mesto)…”; lib/menu/studio/article-form.test.ts:214 „a variant without a price falls back to the base price” |  |
| 13.4.G2 | Editor: organizacija standardnih stranica, sekcija i artikala | da | convex/menuPages.test.ts:239 „returns the pages by order with the archived flag…”; components/menu/studio/k11.test.tsx:879 „a section: its own title and description, one labelled select (Mesto)…” |  |
| 13.4.G3 | Editor: direktna izmena najčešćih podataka iz pregleda, najmanje zajedničke cene artikla | da | components/menu/studio/k16.test.tsx:392 „each row shows the base price and an input named after the article…”; lib/menu/studio/price-input.test.ts:34 „an empty field means no price yet” |  |
| 13.4.G4 | Editor: cene, varijante, dodaci, kombo artikli i dostupnost | da | lib/menu/studio/article-form.test.ts:214; lib/menu/studio/combo-form.test.ts:20 „sums the regular prices times the quantities”; components/menu/studio/k11.test.tsx:1407 „availability right only, nothing selected: the availability control is disabled” |  |
| 13.4.G5 | Editor: prikaz slike, ikonice ili bez medija | da | Izgled: prikaz medija celog menija (`components/menu/studio/k17.test.tsx:552`); detalj artikla: slika / ikonica / bez (`components/menu/studio/k15.test.tsx`) | Potvrđeno na javnom prikazu; kontrola u Editoru nije proverena testom |
| 13.4.G6 | Editor: izbor podržanog layouta | da | components/menu/studio/k17.test.tsx:490 „the same on Premium: three miniatures, Tok chosen” |  |
| 13.4.G7 | Editor: boje, fontovi i ograničene dizajnerske kontrole | da | components/menu/studio/k17.test.tsx:295 „the Premium sets are the ones the catalogs mark…”; components/menu/studio/k17.test.tsx:302 „Standard: Premium palettes and pairs are locked…”; lib/menu/identity/identity.test.ts:97 „jePoznataPaleta knows the curated ids only” |  |
| 13.4.G8 | Editor: preview nacrta | da | components/menu/studio/studio.test.tsx:719 „the live preview is inert and hidden from assistive technology”; lib/menu/studio/javni-pregled.test.ts:117 „a hidden row is left out of the preview and the published page alike” |  |
| 13.4.G9 | Editor: objavljivanje | da | components/menu/studio/k18.test.tsx:391 „one dialog, titled Objavi izmene with its description…”; convex/menuPublishing.test.ts:612 „an unplaced article warns; publishing needs exactly the previewed fingerprint” |  |
| 13.4.P1 | Klik na Editor odmah otvara stvarni meni; nema čarobnjaka, početnog ekrana ni kartice koja samo vodi u editor | da | Grep za čarobnjak, wizard, welcome i onboarding u components/menu/studio: nema pogodaka; components/menu/studio/studio.test.tsx:295 „the page column lists Kompletan meni first, then the wine list” | Dokaz je odsustvo čarobnjaka |
| 13.4.P2 | Editor ima dva glavna režima: Ponuda i Izgled | da | lib/i18n/sr/menu-studio.ts:23-24 (ponuda, izgled); components/menu/studio/k17.test.tsx:295 |  |
| 13.4.P3 | Pregled, status nacrta i Objavi su stalno dostupni | da | components/menu/studio/studio.test.tsx:332 „the header has Pregled and Objavi, both usable for an owner”; components/menu/studio/studio.test.tsx:684 „Objavi is disabled and says who can publish; Pregled stays available”; components/menu/studio/k18.test.tsx:1559 „header: the Verzije button, the restored-draft mark and the presence group” |  |
| 13.4.P4 | Na desktopu se istovremeno vide struktura stranica, aktivni radni sadržaj i pregled uživo | da | components/menu/studio/studio.test.tsx:284 „is the desktop three-column layout” |  |
| 13.4.P5 | Kompletan meni se automatski pravi kao podrazumevana stranica; naziv se ne prikazuje gostu | da | convex/menuPages.test.ts:256 (naziv „Kompletan meni”); lib/menu/studio/javni-pregled.test.ts:245 „the default page has title null, never the internal Kompletan meni” |  |
| 13.4.P6 | Standardne stranice dele cenu artikla; promena iz bilo kog pregleda menja istu cenu | da | lib/menu/studio/overlay.test.ts:113 „a shared article changes on every page place at once” |  |
| 13.4.P7 | Room service nije stranica; zaseban ulaz u grupi Posebne usluge; kad je isključen, grupa i kontrole se ne prikazuju | da | components/menu/studio/k16.test.tsx:268 „the default izlog (Standard) has no Posebne usluge and no Room service entry”; components/menu/studio/k16.test.tsx:277 „plan=premium: one Room service entry in the group Posebne usluge, not among the pages” |  |
| 13.4.P8 | Room service kontekst nudi „Preuzmi ceo meni” i „Dodaj iz postojeće ponude” bez izlaganja tehničke biblioteke artikala | da | components/menu/studio/room-service/rs-kontekst.tsx:40 (akcija rsPreuzmiCeoMeni); components/menu/studio/room-service/dodaj-iz-ponude.tsx:3 | Nije proveren naslov testa za izostanak biblioteke |
| 13.4.P9 | Room service: klijent zasebno organizuje izbor, kategorije i redosled; menja zajedničke podatke; koristi nasleđeni dizajn i layout | da | components/menu/studio/room-service/rs-kontekst.tsx:7-10 (dizajn i layout nasleđeni iz menija); components/menu/studio/k16.test.tsx:306 „fokus=room-service&plan=standard: no Room service context, no group, the normal Ponuda list” | Zaseban redosled kategorija nije u naslovu testa |
| 13.4.P10 | Klik na artikal fokusira isti workspace; ne otvara novi glavni tab ili sekciju | da | `components/menu/studio/k15.test.tsx` (detalj u istom tabpanelu sa skrivenom listom); K15 Playwright „povratak čuva skrol” | Nema testa sa ovim ponašanjem u naslovima |
| 13.4.P11 | Osnovni podaci artikla prikazuju se prvi; napredne grupe se otvaraju po potrebi | da | `components/menu/studio/k15.test.tsx` (redosled Osnovno, Prikaz, grupe; „Varijante i dodaci” sklopljeno) | Nema testa sa ovim ponašanjem u naslovima |
| 13.4.P12 | Glavno dugme „+ Dodaj” nudi samo artikal, sekciju i kombo; dodavanje stranice je odvojeno | da | `components/menu/studio/ponuda/radni-prostor.tsx:489-493` (+ Dodaj: artikal, sekcija, kombo); stranica se dodaje u koloni stranica (`studio.test.tsx:352`) | Ključevi postoje; test za ceo meni „+ Dodaj” nije nađen |
| 13.4.P13 | Komanda „Dodaj stavku u ovu kategoriju” odmah dodaje prazan red sa poljima Naziv i Cena | da | components/menu/studio/studio.test.tsx:473 „each section offers Dodaj stavku u ovu kategoriju, inside its own body”; lib/menu/studio/quick-add.test.ts:27 „an empty price is allowed in the draft” |  |
| 13.4.P14 | Posle unosa jednog artikla dostupna je komanda „Dodaj još jedan” | da | `components/menu/studio/brzi-unos/brzi-unos-red.tsx:162` „Dodaj još jedan”; K10 Playwright | Ključ postoji; ponašanje nije nađeno u testu |
| 13.4.P15 | Brzo dodavanje više artikala: tabelarni unos sa kolonama Naziv, Cena i Sekcija | da | lib/menu/studio/quick-add.test.ts:63 „name and price errors are reported together, per field”; components/menu/studio/k33.test.tsx:412 „quick entry: a short label above each field up to sm…” |  |
| 13.4.P16 | Kombo koristi fokusirani prikaz (izbor postojećih artikala, ručna cena) | da | components/menu/studio/k16.test.tsx:684 „the detail of the combo: h1 is its name, the section is titled Sastav komboa”; lib/menu/studio/combo-form.test.ts:20 |  |
| 13.4.P17 | Redosled se menja prevlačenjem cele slobodne površine kartice; mala ručica nije jedino mesto | da | components/menu/studio/k11.test.tsx:331 „the whole row card is the drag area: its li has the grab cursor, but no tab stop of its own”; components/menu/studio/k11.test.tsx:316 „the drag handles are aria-hidden spans…” |  |
| 13.4.P18 | Na telefonu i tabletu prevlačenje se pokreće zadržavanjem prsta; kartica je jasno podignuta i pokazuje mesto spuštanja | da | `components/menu/studio/dnd/senzori.ts` (dugi pritisak 350 ms), `lib/menu/studio/drag-guard.test.ts`; K11 Playwright „dugi pritisak pa pomeranje premešta” | Zadržavanje je u kodu bez testa; vizuelno podizanje (drag-overlay-kartica.tsx) nije testirano |
| 13.4.P19 | Kontrole unutar kartice (cena, dugmad, meniji) ne pokreću prevlačenje | da | lib/menu/studio/drag-guard.test.ts:59 „lists every control that must not start a drag” |  |
| 13.4.P20 | Akcija „Premesti” ostaje dostupna kao pristupačna alternativa za tastaturu i čitače | da | components/menu/studio/k11.test.tsx:934 „Premesti u sekciju: the count, a labelled section select of this page, and an enabled confirm”; components/menu/studio/k33.test.tsx:591 „the keyboard way named is the row menu and its item Premesti, and both exist” |  |
| 13.4.P21 | Režim „Izaberi više” omogućava grupne radnje bez opterećivanja podrazumevanog prikaza | da | components/menu/studio/k11.test.tsx:280 „Izaberi više is off: no checkbox, no selection bar, no mode marker” |  |
| 13.4.P22 | Grupna promena cena: procenat, dodavanje ili oduzimanje fiksnog iznosa, postavljanje iste cene | da | `lib/menu/bulk-price.test.ts` (procenat, iznos, ista cena; pregled stara → nova) | Procenat i ista cena su potvrđeni; fiksni iznos nije nađen u naslovima |
| 13.4.P23 | Pre potvrde se prikazuje pregled stare i nove cene; nijedna grupna promena se ne objavljuje automatski | da | components/menu/studio/k11.test.tsx:512 „the table has one row per changed article: old price, new price (+10 %, half up)…”; components/menu/studio/k11.test.tsx:458 „the bar shows how many are selected… and the note about drafts” |  |
| 13.4.P24 | Klijent može dodati, preimenovati, duplirati, premestiti, arhivirati i obrisati standardnu stranicu; grupno dodati/ukloniti artikle; napraviti novi artikal u stranici | da | convex/menuPages.test.ts:495 „the default page can be renamed; an invalid name or an archived page is refused”; convex/menuPages.test.ts:768 „archive hides the page, keeps its content, writes the audit and bumps the revision once…”; convex/menuPages.test.ts:1144 „delete removes the page's sections and placements…”; convex/menuPages.test.ts:1423 „duplicating a page never copies content of another service”; components/menu/studio/k11.test.tsx:951 „Dodaj na drugu stranicu without another page says so…” | Premeštanje stranice nije posebno testirano |
| 13.4.P25 | Brisanje stranice povezane sa QR karticom blokirano je dok se QR ne preusmeri ili isključi | da | convex/menuPages.test.ts:894 „a page linked to an ACTIVE QR card is refused with page_has_qr and NOTHING is deleted” |  |
| 13.4.P26 | Izaberi više podržava promenu cena, dostupnost, premeštanje u sekciju, dodavanje/uklanjanje sa stranica, skrivanje i brisanje uz upozorenje | da | components/menu/studio/k11.test.tsx:1534 „Izaberi više with the availability right only: the bar has the availability control and Završi”; components/menu/studio/k11.test.tsx:1547 „Izaberi više with both rights: the bar has every group”; components/menu/studio/k11.test.tsx:974 „Ukloni sa ove stranice: the count and a danger confirm, no select” | Skrivanje nije u naslovu testa |
| 13.4.P27 | Desktop: levo struktura, u sredini radni sadržaj, desno pregled uživo | da | components/menu/studio/studio.test.tsx:284 „is the desktop three-column layout” |  |
| 13.4.P28 | Tablet: struktura u draweru, centralni radni prostor, pregled kao preklop | da | K34 ispravka: na 768–1279 px struktura je u fioci (`components/menu/studio/studio-editor.tsx`, `components/menu/studio/k34-tablet.test.tsx`) | pre K34 je na 1024–1279 px struktura bila stalna kolona (K34 N9) |
| 13.4.P29 | Telefon: jedan glavni sadržaj i brzo prebacivanje Struktura / Uredi / Pregled | da | `components/menu/studio/studio.test.tsx:726`, `components/menu/studio/shell/segmenti.tsx` (Struktura / Uredi / Pregled); K10 snimci 390 | Oznaka „Uredi” i tri taba nisu potvrđeni u testu |
| 13.4.P30 | Dizajn kartice uvek prati pravila prevlačenja i pristupačnu akciju Premesti | da | components/menu/studio/k11.test.tsx:1145 „with prevlacenje: the li has the drag cursor and there is an aria-hidden handle span, plus the row menu”; components/menu/studio/k11.test.tsx:1163 „without prevlacenje (searching, read-only): no handle and no grab cursor” |  |
| 13.4.P31 | Objavljivanje koristi validaciju, upozorenja, snapshot i pravila konflikta | da | convex/menuPublishing.test.ts:478 „a shown article without a price blocks publishing and changes nothing”; convex/menuPublishing.test.ts:612 „an unplaced article warns; publishing needs exactly the previewed fingerprint”; lib/menu/studio/memorija-verzije.test.ts:153 „the first publish of a never published draft is version 1…”; components/menu/studio/k18.test.tsx:1181 „edits that failed to save are named and will not be published; a retry is offered unless they are conflicts” |  |
| 13.5.1 | Operativa prikazuje trenutno stanje lokala i rad osoblja | da | components/menu/panel/operativa/operativa.test.tsx:222 „a card names the kind, the place with the zone, the status, who took it and the time”; convex/menuPanelOperations.test.ts:764 „rows say who took the request and what became of the last reminder” |  |
| 13.5.2 | Može pokazati ko je preuzeo koji zahtev, aktivne rezervacije i neuobičajeno dugo čekanje | da | components/menu/panel/operativa/operativa.test.tsx:222; convex/menuPanelHome.test.ts:608 („reservations: the waiting ones…”) |  |
| 13.5.3 | Ne služi za svakodnevno preuzimanje i završavanje konobarskih zahteva | da | components/menu/panel/operativa/operativa.test.tsx:141 „none of the waiter's actions is on the screen”; components/menu/panel/operativa/operativa.test.tsx:167 „the only buttons are the filters, Detalj and the reminder” |  |
| 13.5.4 | Menadžer ne preraspodeljuje konobare iz ovog pregleda | da | components/menu/panel/operativa/operativa.test.tsx:167 (nema dugmeta za preraspodelu); convex/menuPanel.ts:99 (komentar: nijedna radnja nije preraspodela, jedini upis je podsetnik) |  |
| 13.5.5 | Filteri po vrsti zahteva, konobaru i zoni; može se otvoriti detalj | da | components/menu/panel/operativa/operativa.test.tsx:403 „the kind, the waiter and the zone, each with a visible label”; components/menu/panel/operativa/operativa.test.tsx:444 „a waiter filter shows only the requests of that waiter”; components/menu/panel/operativa/operativa.test.tsx:309 „Detalj is on every card…” | Filter zone se ne prikazuje bez zona (operativa.test.tsx:428) |
| 13.5.6 | Menadžer može poslati jedan nenametljiv ping odgovornom konobaru | da | convex/menuPanelOperations.test.ts:513 „one reminder per request per 5 minutes…”; convex/menuPanelOperations.test.ts:560 „the Owner, a Manager and a ScanMe admin may remind; every other caller is refused”; components/menu/panel/operativa/operativa.test.tsx:372 „a reminder sent two minutes ago: the time, the reason and a button that waits” |  |
| 13.5.7 | Za preuzimanje, završavanje ili drugu operativnu intervenciju menadžer ulazi u konobarski panel svojim pristupom | da | convex/menuWaiter.test.ts:918 „the Owner and Managers work with their account, no PIN and no session row”; lib/menu/permissions.ts:66 (waiter.work u MANAGEMENT) |  |
| 13.6.a | Podaci o lokalu relevantni za Menu | da | `components/menu/panel/lokal/podaci-lokala.tsx` (naziv, javni link, „Kopiraj link”); `components/menu/panel/funkcionalnosti/funkcionalnosti.test.tsx` (kartica Lokala) | Nije nađen test koji proverava polja lokala |
| 13.6.b | Pozicije, stolovi i sobe | da | convex/menuFloor.test.ts:577 „stores a cleaned, keyed, ordered position on a concrete free spot of its own surface”; convex/menuFloor.test.ts:667 „creates Sto 1..5 in one call, in order, each on its own free spot” |  |
| 13.6.c | Vizuelni ili tabelarni raspored | da | convex/menuFloor.test.ts:961 „stores a valid layout, allows touching neighbours…”; components/menu/konobar/sala.test.tsx:436 „the table view gets the status column…” | Raspored plana je u Lokal i QR; sala.test.tsx je prikaz konobarskog panela |
| 13.6.d | QR kartice i njihove veze | da | convex/menuQr.test.ts:511 „one Menu card per position: label, target, link, unique 8-character codes, audit”; convex/menuQr.test.ts:1047 „an adopted card is read-only; other tenants and unauthorised callers are refused” |  |
| 13.6.e | Opcioni broj sedišta | da | convex/menuFloor.test.ts:820 „changes label, kind and seats; null seats removes the field; an unchanged call writes nothing” |  |
| 13.6.f | Zone, ako su uključene | da | convex/menuFloor.test.ts:323 „cleans the name, issues a zn_ key and appends after the last active zone”; components/menu/panel/tim/tim.test.tsx:340 „zone controls exist only when the venue has zones” |  |
| 13.6.g | Status i dijagnostika kartice ili QR veze | da | convex/menuQr.test.ts:364 „link: position and an inactive row are reported; a link row of another service is ignored”; convex/menuQr.test.ts:403 „lastScanAt is the newest scan event; totalScans comes from the card” | Dijagnostika je status veze i poslednji sken |
| 13.7.a | Funkcionalnosti: poziv konobara | da | convex/menuCapabilities.test.ts:276 „owner and manager switch callWaiter on and off at Standard, every real change audited” |  |
| 13.7.b | Funkcionalnosti: zahtev za račun | da | `convex/menuPanelFeatures.test.ts` (svi prekidači kroz `setFeature`, sa auditom) | Prekidač za račun nije posebno proveren |
| 13.7.c | Funkcionalnosti: zahtev za porudžbinu | da | `convex/menuPanelFeatures.test.ts` | Prekidač za porudžbinu nije posebno proveren |
| 13.7.d | Funkcionalnosti: rezervacije kao ScanMe forma ili eksterni sistem | da | components/menu/panel/rezervacije-podesavanja.test.tsx:310 „RezervacijeIzbor has no duration, deadline, table or sound field: only radios and the link” |  |
| 13.7.e | Room service kao Premium funkcija | da | components/menu/studio/studio.test.tsx:373 „on Standard there is no Posebne usluge and no Room service”; components/menu/studio/studio.test.tsx:378 „on Premium the Posebne usluge heading and the Room service button appear”; convex/menuPanelHome.test.ts:771 „null while Room service is off, even on Premium and even with warnings stored” |  |
| 13.7.f | Druge funkcije dozvoljene izabranim režimom | n/p | V1 ima samo režim Ugostiteljstvo; funkcije po režimu su u `lib/menu/modes.ts` | Opšta stavka; nema konkretne liste drugih funkcija u testovima |
| 13.7.g | Room service se uključuje u Funkcionalnostima; u Editoru se pojavljuje u grupi Posebne usluge; kad je isključen, kontrole i podaci nisu vidljivi | da | components/menu/studio/k16.test.tsx:268 „the default izlog (Standard) has no Posebne usluge and no Room service entry”; components/menu/studio/k16.test.tsx:277 „plan=premium: one Room service entry in the group Posebne usluge, not among the pages”; convex/menuPanelHome.test.ts:771 |  |
| 13.7.h | Sekcija ne sadrži podešavanje zvuka konobarskog uređaja | da | components/menu/panel/funkcionalnosti/funkcionalnosti.test.tsx:185 „the section has no sound setting and never says the word” |  |
| 13.7.i | Ne prikazuje rezervaciona polja kada je izabran eksterni alat | da | components/menu/panel/rezervacije-podesavanja.test.tsx:310 |  |
| 13.8.a | Tim i pristupi: članovi tima | delimično | components/menu/panel/tim/tim.test.tsx:144 „the cards stand in order: members, staff, link, roles, activity”; convex/menuTeam.test.ts:184 „a Manager cannot invite an Owner…” | Tim prikazuje članove i pravi pozivnice, ali osoba bez postojećeg ScanMe članstva ne može da prihvati pozivnicu: `convex/auth.ts` je ne pušta (K34 N10, BLOKADA: auth tok je van obima) |
| 13.8.b | Tim i pristupi: uloge i dozvole | da | lib/menu/permissions.ts:50-83 (matrica uloga i dozvola); convex/menuTeam.test.ts:159 „an Urednik, other account roles, a stranger and another venue's owner are all menu/forbidden” |  |
| 13.8.c | Tim i pristupi: PIN pristup osoblja | da | convex/menuStaff.test.ts:315 „without a pin the system picks a three-digit PIN, shown once and never listed”; components/menu/panel/tim/tim.test.tsx:360 „the PIN dialog opens for the first active person with the choice, and shows no PIN yet” |  |
| 13.8.d | Tim i pristupi: aktivnost ili pristup po potrebi | da | components/menu/panel/tim/tim.test.tsx:144 (kartica aktivnosti); components/menu/panel/tim/tim.test.tsx:159 „the activity block is closed by default and offers to open” |  |
| 13.8.e | Tim i pristupi: zone samo kada lokal koristi zone | da | components/menu/panel/tim/tim.test.tsx:340 „zone controls exist only when the venue has zones” |  |
| 13.9.a | Podešavanja: radno vreme lokala | da | convex/menuReservationSettings.test.ts:157 „the Owner, a Manager and a ScanMe admin save the week; it reads back…”; convex/menuReservationSettings.test.ts:283 „the workingHours query…” |  |
| 13.9.b | Podešavanja: jezici | da | components/menu/panel/podesavanja/podesavanja.test.tsx:89 „Standard shows the source language first, the translation with its remove button…” |  |
| 13.9.c | Podešavanja: poslovni email ili integracija | da | components/menu/panel/podesavanja/podesavanja.test.tsx:243 „shows the name, the mode line and a mailto link to ScanMe, and nothing that changes the mode”; convex/menuMail.test.ts:357 (Gmail OAuth) |  |
| 13.9.d | Podešavanja: opšta pravila brenda i naloga koja ne pripadaju editoru | da | `components/menu/panel/podesavanja/podesavanja.test.tsx:243` (Brend i nalog: naziv, paket, režim samo kao tekst), `:286` (izgled vodi u Editor) | Nije nađen test za sekciju „opšta pravila brenda i naloga” kao celinu |
| 13.9.e | Podešavanja: eventualna sistemska podešavanja po režimu | da | components/menu/panel/podesavanja/podesavanja.test.tsx:263 „the mode line follows the mode” |  |
| 13.9.f | Radno vreme je u Podešavanjima bez obzira na izabrani rezervacioni sistem | da | convex/menuReservationSettings.test.ts:157; components/menu/panel/rezervacije-podesavanja.test.tsx:310 (izbor rezervacija nema polje za radno vreme) |  |

#### §14 Analitika

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 14.1.a | Analitika je zasebna sekcija klijentskog panela | da | lib/menu/panel-nav.test.ts:48 (osam sekcija); app/[slug]/client-panel/meni/analitika/page.tsx |  |
| 14.1.b | Nalazi se neposredno iznad Podešavanja | da | lib/menu/panel-nav.test.ts:53 „Analitika is second to last and Podesavanja is last” |  |
| 14.1.c | Početna prikazuje sažeti analitički preview, a ne duplikat operativnih statusa | da | components/menu/panel/pocetna/analitika-kartica.test.tsx:166 „it shows only opens, details, scans and the most opened article, never requests or reservations” |  |
| 14.1.d | Analitika mora pomoći klijentu da donese odluku, ne samo da prikaže grafikone | da | „Kako brojimo”, poređenje sa prethodnim periodom i pravilo 20 (`components/menu/panel/analitika/analitika.test.tsx`) | kvalitativno |
| 14.2.a | Standard: poslati zahtevi po vrsti | da | `convex/menuAnalytics.test.ts:562` (zahtevi po vrsti kroz prave pisce); tabela vrsta × ishod u sekciji (`analitika.test.tsx`) | Podela po vrsti nije u naslovu testa |
| 14.2.b | Standard: rezervacioni zahtevi i ishodi | da | convex/menuAnalytics.test.ts:781 „[rezervacije] sent and outcomes through the real writer: accept, decline, propose, acceptProposal, arrive, cancel by guest and by staff” |  |
| 14.2.c | Standard: porudžbine kao zahtevi i ishodi | da | `convex/menuAnalytics.test.ts:562` (porudžbine po kanalu i ishodu) | Porudžbine nisu posebno u naslovu testa |
| 14.2.d | Standard: otvaranja menija | da | convex/menuAnalytics.test.ts:405 „[otvaranja] [trend] pregled 7 days: total and one entry per day, oldest first…” |  |
| 14.2.e | Standard: broj sesija kada se može pouzdano meriti | da | convex/menuAnalytics.test.ts:926 „[sesije-pouzdane] sessions are a number only when at least 95% of the opens carried a session id” |  |
| 14.2.f | Standard: najotvaraniji detalji artikala | da | convex/menuAnalytics.test.ts:503 „[detalji] [najotvaraniji] top articles sorted by count with names from menuArticles…” |  |
| 14.2.g | Standard: skeniranja po QR kartici | da | convex/menuAnalytics.test.ts:843 „[skenovi] scans per card: finished days from the aggregates, today live…” |  |
| 14.2.h | Standard: trend za 7 i 30 dana | da | convex/menuAnalytics.test.ts:405 („pregled 7 days”); convex/menuAnalytics.test.ts:425 „[otvaranja] [trend] pregled 30 days: 30 entries…” |  |
| 14.2.P1 | Premium: 90 dana i proizvoljan period | da | convex/menuAnalytics.test.ts:1047 „[period] a 90-day period works, so do 366 days and the oldest day kept…” |  |
| 14.2.P2 | Premium: poređenje sa prethodnim periodom | da | convex/menuAnalytics.test.ts:1094 „[poredjenje] the previous period of the same length, the difference always…”; convex/menuAnalytics.test.ts:1138 „[poredjenje] a custom period of 3 days compares with the 3 days right before it” |  |
| 14.2.P3 | Premium: filteri po stranici, QR kodu, jeziku, uređaju i vremenu | da | raspodela po stranici, kartici, jeziku, uređaju i satu (`lib/menu/analitika/definicije.ts`, `convex/menuAnalytics.test.ts:1207`); izlog Premium otvara raspodelu po jeziku | Filter po jeziku nije nađen u testovima |
| 14.2.P4 | Premium: detaljniji konverzioni tokovi | da | convex/menuAnalytics.test.ts:1155 „[konverzije] [pravilo-20] the funnel is null while sessions are unreliable…” |  |
| 14.2.P5 | Premium: CSV export | da | components/menu/panel/analitika/csv-dugme.tsx:3 („Preuzmi CSV” kao Premium funkcija); components/menu/panel/analitika/csv-dugme.tsx:64 (data-csv zakljucano za Standard) |  |
| 14.2.P6 | Vidljivost artikla tokom skrolovanja ne računa se automatski kao pregled artikla | da | lib/menu/analitika/track.ts:7-8 („Seeing an article while scrolling is NOT an event: only opening its detail is.”); convex/menuAnalytics.test.ts:447 „…a detail click is not an opening” |  |
| 14.3.1 | Prosečno vreme preuzimanja zahteva se ne uvodi samo zato što se lako računa | da | docs/menu/ANALITIKA-DEFINICIJE.md:18 i :92 (zabranjeno, §14.3) | Odsutno u kodu |
| 14.3.2 | Mockup brojke nisu stvarni KPI-jevi niti definicija metrike | da | Početna i Analitika bez izmišljenih brojki (`components/menu/panel/pocetna/pocetna.test.tsx`); fixture brojke samo u izlogu | Opisno pravilo; nije proverljivo kodom |
| 14.3.3 | Ne prikazujemo podatke koje ne možemo pouzdano objasniti | da | convex/menuAnalytics.test.ts:926 („sessions are a number only when at least 95% of the opens carried a session id”); convex/menuAnalytics.test.ts:1155 („the funnel is null while sessions are unreliable”) |  |
| 14.3.4 | Operativni live status nije isto što i istorijska analitika | da | lib/menu/panel-nav.test.ts:48 (Operativa i Analitika su odvojene sekcije); convex/menuAnalyticsRollup.test.ts:426 „[zbir] [dan-beograd] events are summed into the Belgrade day of their arrival” (istorijski agregati) | Razdvajanje je strukturno; nema eksplicitnog testa |
| 14.4.1 | Sesija se završava posle 30 minuta neaktivnosti | da | convex/menuAnalyticsRollup.test.ts:593 „[sesija-30] a pause of exactly 30 minutes starts a new session, 29:59 does not” |  |
| 14.4.2 | Anonimni identifikator vezan za browser/session storage, bez fingerprintinga i bez povezivanja uređaja | da | lib/menu/analitika/sesija.ts:4-5 (komentar: nema trajnog posetioca, nema veze između lokala i fingerprinta); lib/menu/analitika/definicije.ts:60 (klasa uređaja iz User-Agenta, bez fingerprinta); lib/menu/analitika/track.ts:42-45 (identifikator sesije u localStorage) |  |
| 14.4.3 | Brisanje browser podataka ili incognito prozor stvara novog anonimnog posetioca | da | lib/menu/analitika/sesija.ts:4-5 (komentar opisuje ovo ponašanje) | Posledica dizajna; nije testirano |
| 14.4.4 | Pravna provera i opis u politici privatnosti pre produkcije | delimično | identifikator sesije je podrazumevano isključen (`lib/menu/analitika/saglasnost.ts`) | pravna provera i politika privatnosti pre produkcije: BLOCKED K29/1 |
| 14.4.5 | Procenti i konverzije prikazuju se od najmanje 20 relevantnih sesija | da | convex/menuAnalytics.test.ts:1155 „shares are null under 20 sessions and a number from 20”; convex/menuAnalytics.test.ts:1094 („the percentage only from 20 in the previous period”) |  |
| 14.4.6 | Sirovi događaji čuvaju se 90 dana | da | convex/menuAnalyticsRollup.test.ts:923 „a raw event is deleted 90 days and 1 ms after it arrived, one of 89 days stays” |  |
| 14.4.7 | Dnevni agregati čuvaju se 24 meseca | da | convex/menuAnalyticsRollup.test.ts:988 „[retencija-24m] daily and breakdown rows before the same date 24 months back are deleted…” |  |
| 14.4.8 | Svaka analitička brojka ima pisanu definiciju događaja i proverljiv izvor | da | docs/menu/ANALITIKA-DEFINICIJE.md (definicije događaja i izvora) | Nije proverena svaka brojka pojedinačno |

#### §15 UI/UX principi

| # | Stavka | Ispunjeno | Dokaz | Napomena |
|---|---|---|---|---|
| 15.1.a | Proizvod je lak za korišćenje i prijatan, ne deluje kao težak poslovni alat | da | UX pregledi snimaka po koraku (`docs/MENI-PROGRESS.md`), `docs/menu/MENU-UX.md` | kvalitativno |
| 15.1.b | Konobar obavi najčešću radnju sa minimumom koraka | da | jedna glavna radnja po zahtevu (`components/menu/konobar/sala.test.tsx:635`) | Broj koraka nije meren |
| 15.1.c | Klijent dobija kontekstualne, a ne tehničke kontrole | da | kontekstualne kontrole: detalj artikla u istom radnom prostoru, napredno sklopljeno (`components/menu/studio/k15.test.tsx`) | kvalitativno |
| 15.1.d | Napredne opcije se prikazuju samo kada su relevantne | da | components/menu/panel/tim/tim.test.tsx:340 „zone controls exist only when the venue has zones”; components/menu/panel/operativa/operativa.test.tsx:428 „no zone filter when the venue has no zones” |  |
| 15.1.e | Modularnost javnog menija ne znači beskonačnu modularnost klijentskog panela | da | lib/menu/identity/identity.test.ts:97 „jePoznataPaleta knows the curated ids only”; lib/menu/identity/identity.test.ts:179 „jePoznatPar knows the curated ids only” |  |
| 15.1.f | Dizajn gostujućeg menija može imati više oblika; panel za upravljanje ima jedan način rada | da | components/menu/javni/javni.test.tsx:907 (petlja po layoutima: Tok, Kategorije, Kompaktno); components/menu/studio/studio.test.tsx:332 |  |
| 15.1.g | Mobilni, tablet i desktop se projektuju namerno | da | components/menu/studio/studio.test.tsx:284 „is the desktop three-column layout”; components/menu/konobar/k33.test.tsx:106 „the panel gives the floor the h1 only when the side pane is hidden on a phone” |  |
| 15.1.h | Animacije objašnjavaju promenu stanja; ne ometaju rad | da | puls samo za kašnjenje, `prefers-reduced-motion` (`components/menu/konobar/sala.test.tsx:598`, `:602`; MENU-UX §7) | Ponašanje je pokriveno; svrha animacije nije proverena testom |
| 15.2.a | Palete i uloge boja namenjene brendu lokala, hrani, piću i ugostiteljskom iskustvu | da | lib/menu/identity/identity.test.ts:41 „palette ids are unique”; lib/menu/identity/identity.test.ts:55 „the declared tone matches the page colour”; convex/menuPresentation.test.ts:834 „a brand palette with only the main colour is readable on Standard (colours derived)…” |  |
| 15.2.b | Podržane kombinacije fontova ili ograničen izbor | da | lib/menu/identity/identity.test.ts:146 „pair ids are unique”; lib/menu/identity/identity.test.ts:151 „every heading and text face is a known font key” |  |
| 15.2.c | Tri kvalitetna početna layouta, uz dodatne Premium varijante | da | components/menu/javni/javni.test.tsx:907 (Tok, Kategorije, Kompaktno); components/menu/javni/k17-varijante.test.tsx:154 „each layout has its own variant; an unknown one and another layout's are ignored”; convex/menuPresentation.test.ts:689 „Standard account: … every layout without a variant and all other fields are open” |  |
| 15.2.d | Kontrole slike, ikonice ili bez medija | da | components/menu/javni/javni.test.tsx:602 „mediji=ikonica shows icons only (an article without an icon of the set shows no tile); mediji=bez shows no media” |  |
| 15.2.e | Razumno podešavanje gustine i naglašavanja | da | lib/menu/identity/identity.test.ts:286 „passes the layout, density, emphasis and branding through”; lib/menu/identity/identity.test.ts:321 „the airy density has the roomiest rows” |  |
| 15.2.f | Preview na telefonu i desktopu | da | components/menu/editor/menu-editor-preview.tsx:69 („One shared model for both shells (desktop preview and mobile canvas)”); components/menu/editor/menu-editor-mobile.tsx:5-6 („On a phone the canvas IS the phone”) |  |
| 15.2.g | Klijent ne dobija slobodan dizajnerski alat (razmak, veličina, pozicija) | da | lib/menu/identity/identity.test.ts:97 „jePoznataPaleta knows the curated ids only”; convex/menuPresentation.test.ts:890 „the ScanMe panel palette and any unknown palette are presentation/unknown_palette…”; convex/menuPresentation.test.ts:902 „an unknown font pair is presentation/unknown_font_pair…” |  |
| 15.2.h | ScanMe crno-zelena paleta ne pripada javnom meniju; javni meni koristi identitet lokala | da | lib/menu/identity/identity.test.ts:51 „no palette is named after ScanMe”; lib/menu/identity/identity.test.ts:80 „the default id, an unknown id and null all give the topla palette” |  |
| 15.2.i | Kompaktno je tekstualni layout i ne nudi slike ni ikonice artikala | da | components/menu/javni/k17-varijante.test.tsx:264 „Kompaktno never has media, whatever the menu-wide display is (and with its variant)”; components/menu/javni/javni.test.tsx:1429 „the large image shows for Tok and Kategorije when it is resolved, never for Kompaktno”; components/menu/javni/pretraga-alergeni.test.tsx:330 „Kompaktno: the warning is text only (no svg in any row) and nothing is hidden” |  |
| 15.2.j | Potpuno prilagođen dizajn procenjuje se i naplaćuje posebno | da | „Potpuno prilagođen dizajn” je upit e-poštom bez cene (`components/menu/studio/izgled/prilagodjen-dizajn.tsx`; `components/menu/studio/k17.test.tsx`) | Poslovno pravilo; nema koda ni testa |
| 15.3.a | Raniji mockupovi služili su prvenstveno za proveru funkcionalnosti i organizacije | n/p | opisna stavka | Opisna stavka; nije proverljiva kodom |
| 15.3.b | Funkcionalne odluke iz razgovora ostaju važeće čak i kada se vizuelni raspored promeni | n/p | opisna stavka; korekcije mockupova poštovane (vidi „Korekcije mockupova”) | Opisna stavka |
| 15.3.c | Nijedna slika nije finalni UI ni izvor istine za boje, tipografiju, dimenzije ili komponente | n/p | opisna stavka | Opisna stavka; reference su u ScanMe-Menu-Jovan-Claude-Handoff/docs/scanme-menu-handoff/mockups/ |
| 15.3.d | Paket prihvaćenih referenci nalazi se uz implementacioni handoff | da | ScanMe-Menu-Jovan-Claude-Handoff/docs/scanme-menu-handoff/mockups/ (13 PNG i README.md, potvrđeno Glob-om) |  |
| 15.3.e | Pisana pravila u specifikaciji imaju prednost nad svakom slikom | n/p | opisna stavka | Opisna stavka |

## 9. Acceptance scenariji §21.1–§21.5

Svaki korak scenarija je proveren u kodu ili testu (fajl i red; „P:" = Playwright izlaz statičkog pregleda koraka, lokalno u `tmp/meni/<korak>-pregled/`, nije u gitu).

### §21.1 Jednostavan kafić — ispunjeno uz napomenu

| Korak | Dokaz | Stanje |
|---|---|---|
| ScanMe postavlja ponudu iz PDF-a za ~1 h ljudskog rada | interni „Uvoz u nacrt" (`convex/menuAdmin.ts` `importDraftV2`, `components/admin/menu-admin-rezim.tsx`; `convex/menuAdminImportV2.test.ts:291`, `:406` nikad ne objavljuje, `:434` provera pre upisa) | delimično: uvoz teksta/JSON-a postoji; izvlačenje iz PDF-a radi operater spoljnim alatom; vreme se meri na prvih 10 migracija (master §2.3) |
| Jedan meni sa sekcijama, bez odvojenih odredišta | „Kompletan meni" se pravi sam (`convex/menuServices.test.ts:93`); jedna vidljiva stranica se otvara odmah, bez razdelnika (`convex/menuPublic.test.ts:291`) | da |
| Klijent bira ikonice umesto slika | Izgled › Prikaz artikala (`components/menu/javni/k17-varijante.test.tsx:205`: „icon" = nijedna fotografija, sve ikonice seta); po artiklu u detalju (`components/menu/studio/k15.test.tsx`) | da |
| Nema alergena, rezervacija, poručivanja ni zauzetosti | sve funkcije su podrazumevano isključene (`convex/menuServices.ts:49`; `convex/menuServices.test.ts:93`); alergeni isključeni (`convex/menuArticleDetails.test.ts:412`); bez pozicije nema trake gosta (`components/menu/gost/gost.test.tsx:344`) | da |
| Gost skenira QR i odmah vidi brz, čitljiv meni | kartica bez veze → `/{slug}/meni` (`convex/menuGuest.test.ts:134`, `lib/menu/http/card-redirect.ts:15`); SSR, javni put ≤ 6 dokumenata (`convex/menuPublic.test.ts` budžet), mali meni u budžetu HTML-a i DOM-a (`components/menu/javni/budzet.test.tsx:89`); K34: ikonica se vidi i kad se slika ne učita (N16) | da (napomena: JS rute `/[slug]/meni` 70,4 KB > 60 KB zbog starog renderera u istom segmentu — BLOKADA K14 / HARDENING D1) |

### §21.2 Restoran sa operativom — ispunjeno

| Korak | Dokaz | Stanje |
|---|---|---|
| Hrana, piće i vino u istom ili odvojenim odredištima | stranice i sekcije (`convex/menuPages.test.ts`, `convex/menuCatalog.test.ts:176` — jedna cena na više stranica); razdelnik sa obe stranice (`convex/menuPublic.test.ts:325`); K34: svaka stranica nosi svoje ime za goste (`convex/menuPublic.test.ts` „K34: the public title of a standard page") | da (K34 ispravka N2) |
| Stolovi su vezani za QR kartice | `convex/menuQr.test.ts:511` (jedna Menu kartica po mestu), `convex/menuGuest.test.ts:155` (kartica na mestu ide kroz hop) | da |
| Gost zove konobara, traži račun, šalje porudžbinu | `convex/menuGuestRequests.test.ts:585` (poziv i račun), `:723` (porudžbina kao snimak objavljene verzije), `:1041` (nedostupan artikal odbija celu porudžbinu) | da |
| Konobar na telefonu vidi sve aktivne ikonice, tačno vreme i živo čekanje | `components/menu/konobar/sala.test.tsx:198` (sva paralelna stanja stola), `components/menu/konobar/konobar.test.tsx:266` (radni red, vreme i „kasni"), `lib/menu/elapsed-time.test.ts`; K34: sat panela ispravljen prema serveru (N6) | da |
| Kratak zvuk se ponavlja samo po podešenom podsetniku | `components/menu/konobar/zvuk.ts:17`, `lib/menu/reminder.test.ts:63` (prvo viđenje ne zvoni), `:81` (tačno jednom po intervalu); P: K23 (lažni AudioContext: dva podsetnika = dva zvuka, nikad neprekidno) | da |
| Menadžer vidi stanje, ali ne radi posao konobara | `components/menu/panel/operativa/operativa.test.tsx:167` (jedina dugmad su filteri, Detalj i podsetnik), `convex/menuPanelOperations.test.ts:378` (podsetnik stiže samo odgovornom konobaru) | da |

### §21.3 Prestižni restoran — delimično

| Korak | Dokaz | Stanje |
|---|---|---|
| Javni prikaz ne izgleda kao generički template | tri namerno različita primera (`components/menu/javni/javni.test.tsx:785`); K13 snimci | da |
| Mirniji layout, tipografija, bez napadnih kartica | `Kompaktno` (`components/menu/javni/javni.test.tsx:628`), kurirani parovi pisma (`lib/menu/identity/font-pairs.ts`), gustina i naglašavanje (Izgled, `components/menu/studio/k17.test.tsx`) | da |
| Vinska karta sa sopstvenim QR-om, deli artikle i osnovni dizajn | kartica sa stranicom otvara tu stranicu (`convex/menuQr.test.ts:558`, `convex/menuGuest.test.ts:141`); artikli i cena su zajednički (`convex/menuCatalog.test.ts:176`); izgled je jedan za sve stranice (`menuPresentation` po usluzi); K34: stranica nosi naslov „Vinska karta" (N2) | da; povratak sa vinske karte na hranu („povratak ili zajednička navigacija", master §3.3) klijent ne može da uključi — BLOKADA N3 |
| Strukturirani dodaci isključeni, napomena opciono uključena | prekidači su nezavisni (`convex/menuArticleOptions.test.ts:262`), napomena samo uz `noteEnabled` (`convex/menuGuestRequests.test.ts:847`) | da |

### §21.4 Hotel i room service — ispunjeno

| Korak | Dokaz | Stanje |
|---|---|---|
| Room service je poseban opcioni modul, ne stranica | `components/menu/studio/k16.test.tsx:268`, `:277` (samo u `Posebne usluge`, samo kad je uključen); Premium kapija (`convex/menuRoomService.test.ts:394`) | da |
| Isti artikli, ali sopstveni izbor, kategorije, redosled i cene | `convex/menuRoomService.test.ts:1375` (izbor), `:824` (model cena), `lib/menu/room-service-view.test.ts:147` (zajednički podaci artikla ostaju) | da |
| Nasleđuje dizajn i osnovni layout | `app/[slug]/meni/room-service/page.tsx:52` (`javniIzgled(rs.presentation)` — isti izgled kao meni) | da |
| Procentualni markup, ručna cena i naknada jednom po porudžbini | `lib/menu/room-service-pricing.test.ts:58` (osnovna → markup → ručna), `convex/menuGuestRequests.test.ts:1228` (2 × 518 + 3 × 368 + 300 = 2.440, naknada tačno jednom) | da |
| QR iz sobe automatski identifikuje sobu | `convex/menuGuestRequests.test.ts:1296` (hop kartice sobe otvara Room service sa sobom) | da |
| Zahtev ide osoblju, ne kuhinji | `convex/menuGuestRequests.test.ts:1824` | da |

### §21.5 Rezervacija — ispunjeno

| Korak | Dokaz | Stanje |
|---|---|---|
| Gost unosi obavezne podatke i opcionu napomenu, bez izbora stola | `convex/menuReservations.test.ts:397` (dodatni `positionId` odbija validator), `components/menu/gost/rezervacija.test.tsx:185` (nijedno polje za sto), `lib/menu/reservation-form.test.ts` | da |
| Osoblje ručno prihvata ili odbija i povezuje rezervaciju sa stolom | `convex/menuReservationsPanel.test.ts:651` (tok zahtev → prihvati → poveži sto → dolazak), `:876` (vezuje se samo prihvaćena) | da |
| U terminu osoblje označava dolazak; sto zauzet samo uz modul | `convex/menuReservationsPanel.test.ts:652` (bez modula sto nije označen), `:681` (sa modulom „Zauzet") | da |
| Posle grace perioda vizuelno upozorenje, bez automatskog otkazivanja | `convex/menuReservationsPanel.test.ts:1339` („no status ever changes by itself"), `lib/menu/reservation-late.test.ts`, `components/menu/konobar/rezervacije.test.tsx:439` (crveno „kasni 25:00" posle zadržavanja) | da |

## 10. Nalazi i ishodi

Svaki nalaz je glavni recenzent proverio u kodu pre upisa ili popravke. Oznaka u zagradi je oznaka iz izveštaja oblasti (A = domen i backend, B = editor i javni meni, C = QR, gost i konobar, D = rezervacije, panel i analitika); pod tom oznakom su i K34 testovi (npr. `describe("B4: …")`, `test("[A5] …")`). Nalazi bez oznake su nalazi glavnog recenzenta. Ishod „ispravljeno” uvek ima test; „BLOKADA” ima stavku u `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K34`.

### 10.1 Kritično

| # | Nalaz | Fajl | Ishod i dokaz |
|---|---|---|---|
| N1 | (A1, ranije HARDENING B7 „nizak”) `storageId` iz tela zahteva `/api/meni/slike` nije bio vezan za rezervaciju pozivaoca. Urednik bilo kog lokala mogao je, sa ID-jem iz javnog upita (`menu:publicMenuBySlug`, Venue blokovi), da obriše tuđ fajl (pogrešan tip → grana koja briše blob) ili da kopira tuđu sliku u svoj lokal i obriše original. | `convex/menuMedia.ts` (`uploadContext`, `reserveUpload`), `convex/schema.ts` (`menuMediaUploads.declaredSize`, opciono) | **Ispravljeno.** Rezervacija pamti najavljenu veličinu; `blobOfUpload` pušta samo blob sačuvan posle rezervacije, u roku od sat vremena (rok upload URL-a), sa najavljenom veličinom, pre bilo kakvog čitanja ili brisanja; inače `wrong_state` i blob ostaje. Testovi u `convex/menuMedia.test.ts`: „K34: another venue's existing image is never read…”, „K34: a wrong-type file of someone else is not deleted…”, „K34: a concurrent upload of another size, or … expired …”, „K34: blobOfUpload binds by time window and declared size”; četiri postojeća testa namerno izmenjena (vidi `docs/MENI-PROGRESS.md` K34). HARDENING B7 i MENU-ARHITEKTURA §15 ispravljeni. Isti obrazac u Memories (`convex/memoriesPipeline.ts`, van obima): BLOCKED K34/6. |
| N2 | (A2, prvi deo) Svaka stranica osim „Kompletnog menija” objavljivala se bez javnog naslova: `add` i `rename` menjaju samo interni `name`, a `publicTitle` nije imao pisca. Gost je na svakoj kartici razdelnika i u traci stranica video „Meni” (i „Vinska karta” iz §21.3 je bila „Meni”), a prevod naslova nije bio moguć. | `convex/menuPages.ts`, `lib/menu/snapshot.ts` (`pageMeta`) | **Ispravljeno.** `add` upisuje `publicTitle = name`, `rename` ga vodi dok prati naziv, `duplicate` ga nosi; `pageMeta` za postojeće redove bez naslova uzima naziv stranice (nikad za „Kompletan meni”). Testovi: `convex/menuPublic.test.ts` „K34: the public title of a standard page” (3), `convex/menuPages.test.ts` (dve namerne izmene). |

### 10.2 Srednje

| # | Nalaz | Fajl | Ishod i dokaz |
|---|---|---|---|
| N3 | (A2, drugi deo) Navigacija, vidljivost i ikonica stranice i opis, ikonica i vidljivost sekcije postoje u šemi i rendereru, ali nemaju pisca: klijent ne može da uključi povratak ili zajedničku navigaciju (§3.3) ni ikonicu kartice stranice (§3.4). | `convex/menuPages.ts`, `convex/menuCatalog.ts` | **BLOKADA** (BLOCKED K34/2): nova funkcija editora sa CAS-om i izlogom, ne revizijska ispravka. |
| N4 | (D-N1) Standard `menuAnalytics.pregled` je u `metrike` nosio dnevne brojeve četiri Premium koraka toka; kapija je bila samo vizuelna (curenje počinje čim se uključi identifikator sesije). | `convex/menuAnalytics.ts` | **Ispravljeno.** Bez Premium opcije (samo `period` je postavlja posle provere) Premium metrike su nulti niz; ključevi i tip ostaju. Testovi: `convex/menuAnalyticsK34.test.ts` („N4: pregled does not carry the Premium funnel”). Panel i CSV za Premium ionako čitaju `period`. |
| N5 | (D-N2) Javni upis analitike imao je samo kofu po IP-u: nekoliko adresa moglo je da zatrpa zajednički zbir (oko 42.000 događaja na sat za sve lokale) i dnevne granice dimenzija jednog lokala. | `convex/menuAnalytics.ts`, `convex/lib/rateLimits.ts`, `app/api/meni/analitika/route.ts`, `lib/menu/analitika/ulaz.ts` | **Ispravljeno.** Kofa `menuAnalyticsService` (600 u minuti, četiri dela) posle kofe IP-a; ruta odbacuje telo koje najavi `Content-Length` preko granice, bez čitanja. Testovi: `convex/menuAnalyticsK34.test.ts` („N5: …”), `lib/menu/analitika/k34-ulaz.test.ts`. Ostatak: više zatrpanih lokala zajedno i dalje može da uspori zbir; globalna granica je BLOCKED K34/10. |
| N6 | (C1) Konobarski panel je merio čekanje satom uređaja, a vreme zahteva je serversko: tablet koji žuri 20 min pokazuje svaki nov zahtev kao „kasni”, a onaj koji kasni ne pocrveni. | `components/menu/konobar/use-sat.ts`, `components/menu/konobar/ruta.tsx`, `lib/menu/elapsed-time.ts` | **Ispravljeno.** `clockOffset` (razlika od 1 min do 12 h, zaokružena na sekunde) meri se jednom pri učitavanju stranice i ide kroz `PomakSataKontekst` do PIN ekrana, panela i prozora rezervacija. Testovi: `lib/menu/k34-konobar.test.ts`, `components/menu/konobar/k34-konobar.test.tsx`. Granica: sat uređaja promenjen posle učitavanja se ne meri ponovo. |
| N7 | (B2) „Pregled” u editoru ne prikazuje slike, cene varijanti, akcije, oznake ni alergene, a napomena je to prećutkivala. | `lib/menu/studio/javni-pregled.ts`, `lib/i18n/sr/menu-studio.ts` | **Delimično + BLOKADA.** Napomena pregleda sada kaže šta se ne vidi (`components/menu/studio/k34-izgled.test.tsx`); pun pregled traži nov izvor podataka: BLOCKED K34/3. |
| N8 | (B1) „Brzo dodaj više artikala”, „Novi kombo” i Room service „Dodaj iz postojeće ponude” pamtili su početnu sekciju ili kategoriju iz trenutka montiranja, pre dolaska podataka: prazna vrednost, „Izaberite sekciju.” uz vidljivo izabranu sekciju, kombo nije mogao da se napravi. | `components/menu/studio/tabelarni-unos/tabelarni-unos.tsx`, `kombo/novi-kombo.tsx`, `room-service/dodaj-iz-ponude.tsx`, `lib/menu/studio/quick-add.ts` | **Ispravljeno.** Stanje čuva samo izbor vlasnika; prikazana i poslata vrednost se računa pri svakom renderu (`izabranaVrednost`, `redoviSaSekcijom`). Testovi: `lib/menu/studio/k34-editor.test.ts`, `components/menu/studio/k34-editor.test.tsx`. |
| N9 | Na 1024–1279 px (tablet položeno) editor je strukturu držao kao stalnu kolonu, a master §13.4 (ZAKLJUČANO) kaže: „Tablet koristi strukturu u draweru, centralni radni prostor i preview kao preklop.” | `components/menu/studio/studio-editor.tsx`, `docs/menu/MENU-UX.md` §8 | **Ispravljeno.** Kolona strukture samo od 1280 px; ispod je fioka. Test: `components/menu/studio/k34-tablet.test.tsx`; snimak `editor-uredi-1100-ekran.png` (dugme „Stranica: Kompletan meni” otvara fioku, radni prostor je cele širine). |
| N10 | (D-N3) Pozivnicu u tim ne može da prihvati osoba bez postojećeg ScanMe članstva: `convex/auth.ts` je ne pušta ni na registraciju ni na prijavu („spoljni Urednik”, K02/3). | `convex/auth.ts`, `convex/menuTeam.ts` | **BLOKADA** (BLOCKED K34/1): auth tok je van obima runa. |
| N11 | (A3) `pageHasActiveQr` nije poznavao usvojene (ADMIN-12) kartice: brisanje stranice je moglo zauvek da bude blokirano karticom koja više ne vodi u Menu, ili dozvoljeno uprkos aktivnoj usvojenoj kartici. | `convex/menuPages.ts`, `convex/lib/menuQrResolve.ts` | **Ispravljeno.** Jedno pravilo `cardOpensMenu` (kanal i odredište na predmetu pristupa za usvojene, status za stare) za stranice i pozicije. Testovi: `convex/menuPages.test.ts` „K34: pageHasActiveQr judges an adopted card…”, `convex/menuQrK34.test.ts` „K34: positionHasActiveQr judges an adopted card by its channel”. |

### 10.3 Nisko

| # | Nalaz | Fajl | Ishod i dokaz |
|---|---|---|---|
| N12 | (B14) Filteri su bili jedan prekidač „svi ili nijedan”; master §7.2 traži izbor koje filtere lokal nudi. | `components/menu/studio/izgled/za-goste.tsx`, `lib/menu/filters.ts` | **Ispravljeno** (izbor oznaka ispod prekidača). Testovi: `components/menu/studio/k34-izgled.test.tsx`, `lib/menu/filters.test.ts` „prebaciFilter”; snimak `editor-za-goste-filteri-390.png` (osam oznaka; isključena jedna, ostalih sedam ostaje). |
| N13 | (B3) Polja editora su 15 px, pa iOS Safari uvećava stranicu pri fokusu (MENU-UX traži ≥ 16 px na telefonu). | `components/menu/zajednicko/tokeni.module.css` | **Ispravljeno** (pravilo za grub pokazivač). Test: `components/menu/zajednicko/tokeni.test.tsx` „K34: fields on a touch screen are at least 16 px”. |
| N14 | (D-N4) Forma rezervacije je na svaki taster računala celu mrežu termina za 61 dan. | `components/menu/gost/rezervacija/forma.tsx`, `lib/menu/working-hours.ts` | **Ispravljeno** (`useMemo`, `openDates` staje na prvom terminu dana). Test: `lib/menu/working-hours.test.ts` „K34: openDates equals the days with a slot”. Vreme nije mereno. |
| N15 | (B6) Neuspelo brisanje sekcije se nije videlo nigde: dijalog se zatvarao, zaglavlje je pisalo „Sačuvano”. | `components/menu/studio/ponuda/radni-prostor.tsx` | **Ispravljeno** (poruka u dijalogu, zatvaranje samo na uspeh). Test: `components/menu/studio/k34-editor.test.tsx`. |
| N16 | (B4) Slika koja se ne učita ostavljala je prazan okvir; master §7.9 i MENU-UX §1.2 traže ikonicu. | `components/menu/javni/artikal.tsx`, `kategorije.tsx`, `detalj.tsx`, `razdelnik.tsx`, `javni.module.css` | **Ispravljeno** bez klijentskog koda: ikonica leži ispod slike u istoj ćeliji. Testovi: `components/menu/javni/k34-javni.test.tsx` „B4: …”. Snimak: `javni-tok-slike-pucaju-390-ekran.png` (sve slike 404, ikonice vidljive). Granice: Chromium u uglu neučitane slike crta i svoj mali znak; providan PNG pokazuje ikonicu kroz sebe; logo lokala nije obuhvaćen. |
| N17 | (B7) Upisi koje detalj artikla zove direktno (ukloni ili dodaj na stranicu, sekcija artikla, primeni grupu, zadrži cenu, sastav) nisu prolazili kroz red čuvanja: bez „Čuva se…” i bez upozorenja pri zatvaranju taba. | `components/menu/studio/studio-editor.tsx` | **Ispravljeno** (`radnjeDetaljaUPracenju`). Test: `components/menu/studio/k34-detalj.test.tsx`. |
| N18 | (B8) Pločice prikaza `Kategorije` nisu poštovale „Bez” (samo tekst). | `components/menu/javni/javni.module.css` | **Ispravljeno** u CSS-u (`data-mediji="none"` sakriva polje medija pločice). Test: `k34-javni.test.tsx` „B8: …”; snimak `javni-kategorije-bez-koren-390-ekran.png` (pločice samo sa nazivom i brojem; izlog parametar `mediji=bez` menja samo artikle, pa je atribut korena postavljen u pregledaču). |
| N19 | (B5) Znak „~” ispred EUR iznosa postojao je samo u sintaksi sa alternativnim tekstom, koju Safari < 17.4 i Firefox < 128 odbacuju. | `components/menu/javni/javni.module.css` | **Ispravljeno** (obična deklaracija pre one sa alternativnim tekstom). Test: `k34-javni.test.tsx` „B5: …”; obe deklaracije provereno postoje i u CSS-u produkcionog builda. |
| N20 | (B10) Produkcioni editor je uvozio modul memorijskog izloga zbog jedne funkcije (`kanonskiAlergeni`). | `lib/menu/allergens.ts`, `components/menu/studio/artikal/alergeni-i-oznake.tsx` | **Ispravljeno** (funkcija u `lib/menu/allergens.ts`, izlog je samo ponovo izvozi). Testovi: `lib/menu/studio/k34-editor.test.ts`. |
| N21 | (B9) Sirove boje u TSX-u: `#8a918b` u `kartica.tsx` je ručno prepisana vrednost tokena. | `components/menu/zajednicko/kartica.tsx`, `tokeni.module.css` | **Ispravljeno** za `#8a918b` (token `--mp-ivica-kontrole-na-istaknutom`, test kontrasta u `tokeni.test.tsx`). Providni `rgb(...)` slojevi i senke ostaju (preklopi, ne boje palete); `#777777` je vrednost za `<input type="color">`. |
| N22 | (B12) Polja varijanti i dodataka postajala su `disabled` tokom čuvanja, pa je fokus padao na `<body>` posle Tab-a. | `components/menu/studio/artikal/varijante-i-dodaci.tsx`, `grupa-dodataka.tsx` | **Ispravljeno** (polja ostaju aktivna; „Ukloni” je `aria-disabled` dok traje čuvanje). Test: `components/menu/studio/k34-editor.test.tsx`. |
| N23 | (B11) Pod React Strict Mode-om (`npm run dev`) detalj artikla, fioka alergena i liste gosta zatvarale su se odmah posle otvaranja. Produkcija nije pogođena. | `components/menu/javni/dijalog-zatvaranje.ts`, `detalj.tsx`, `alergeni.tsx`, `components/menu/gost/list.tsx` | **Ispravljeno** (`naZatvaranje` javlja zatvaranje samo kad je dijalog stvarno zatvoren). Test: `k34-javni.test.tsx` „B11: …”. |
| N24 | (B13) Arapski i hebrejski (dozvoljeni jezici prevoda) nisu imali `dir="rtl"`. | `lib/menu/languages.ts`, `components/menu/javni/okvir.tsx` | **Ispravljeno** (`smerPisma`). Testovi: `k34-javni.test.tsx` „B13: …”, `lib/menu/k34-javni.test.ts`. Ostatak: CSS koristi fizička svojstva, pa RTL raspored nije proveren; pitanje u BLOCKED K34/11. |
| N25 | (C2) „Lokal i QR” je stanje usvojene kartice čitao iz `cards.status`, a resolver gleda kanal: isključen kanal je pisao „Aktivna”. | `convex/menuQr.ts`, `lib/menu/qr-diagnostics.ts` | **Ispravljeno** (stanje po kanalu, isto pravilo kao resolver). Test: `convex/menuQrK34.test.ts` „K34 C2: …”. |
| N26 | (C3) `menuQr.setCardActive` je menjao status bilo koje kartice lokala (i Memories, Links) i mogao da vrati karticu koju je isključio ScanMe admin. | `convex/menuQr.ts`, `components/menu/lokal/kartice/red-kartice.tsx`, `lib/menu/lokal/memorija.ts` | **Delimično + BLOKADA.** Samo Menu kartice (`FLOOR_ERROR.cardNotMenu`), prekidač se ne nudi za druge (testovi: `convex/menuQrK34.test.ts` „K34 C3: …”, `lib/menu/lokal/memorija.test.ts`, `components/menu/lokal/lokal.test.tsx`). Zaključavanje kartice koju je isključio admin: BLOCKED K34/5. |
| N27 | (C4) Hop čija je kofa kartice prazna ostavljao je važeću sesiju PRETHODNOG stola: poziv i porudžbina išli su na stari sto. | `convex/menuGuest.ts`, `lib/menu/http/guest-hop.ts` | **Ispravljeno** (ishod `throttled`, hop briše `smm_g` tog lokala; kartica bez mesta ne dira kolačić). Testovi: `convex/menuGuestK34.test.ts` „C4: …”, `lib/menu/http/k34-hop.test.ts`; namerna izmena u `convex/menuGuest.test.ts`. |
| N28 | (C5) Oznaka zauzetosti stola pokazivala je samo sat, pa se oznaka od juče čitala kao današnja. | `components/menu/konobar/sto/zauzetost.tsx`, `detalj-stola.tsx`, `lib/menu/elapsed-time.ts` | **Ispravljeno** („od 20. 10. 21:03” za raniji dan, bez ikakve automatske promene stanja). Testovi: `lib/menu/k34-konobar.test.ts`, `components/menu/konobar/k34-konobar.test.tsx`; snimak `konobar-sto-zauzetost-390-ekran.png` (današnja oznaka ostaje „od 17:53”). |
| N29 | (C6) Neusklađena `MENU_GATEWAY_SECRET` između Next-a i Convex-a tiho pretvara sve kofe po IP-u u jednu zajedničku kofu svih lokala. | `convex/lib/menuGateway.ts` | **Ispravljeno** (jedno upozorenje `MENU_GATEWAY_MISMATCH` po instanci, bez tajne i heša). Test: `convex/menuGuestK34.test.ts` „C6: …”. Redosled postavljanja: BLOCKED K34/8. |
| N30 | (D-N5) Pozivnica važi i kad pozivalac u međuvremenu izgubi pravo da dodeli tu ulogu. | `convex/menuTeam.ts` | **BLOKADA** (BLOCKED K34/4): provera traži razrešenje uloge po korisniku u `convex/lib/access.ts`. |
| N31 | (A4) Dupliranje stranice i „Preuzmi ceo meni” u Room service nisu prenosili prevode. | `convex/menuPages.ts`, `convex/menuRoomService.ts` | **Ispravljeno** (kopija nosi prevode stranice i sekcija; nova RS kategorija nosi potvrđene prevode naziva sekcije sa hešom izvora). Testovi: `convex/menuPages.test.ts` „K34: the copy keeps the translations…”, `convex/menuK34Backend.test.ts` „[A4] …”. |
| N32 | (A5) Granica od 200 kombo-a po sastojku nije bila nametnuta: 201. kombo ne bi dobio oznaku „proveri cenu”, a brisanje artikla ostavljalo bi viseći red. | `convex/menuCombos.ts` | **Ispravljeno** (`createCombo` i `setComboComponents` odbijaju 201.). Testovi: `convex/menuK34Backend.test.ts` „[A5] …”. Vraćanje verzije (`convex/lib/menuRestore.ts`) vraća sastav kakav je bio i ne proverava granicu (info). |
| N33 | (A6, procena) Grupno brisanje 200 „teških” artikala može da pređe 4.096 čitanja u jednoj transakciji (poništi se celo, sa opštom greškom). | `convex/menuBulk.ts` | **BLOKADA** (BLOCKED K34/9): merenje na deploymentu. |
| N34 | (A7, procena) Objava i pregled objave menija od 2.000 artikala × 10 jezika nemaju zaštitu od vremena izvršavanja. | `convex/menuPublishing.ts`, `lib/menu/snapshot.ts` | **BLOKADA** (BLOCKED K34/9): merenje na deploymentu. |
| N35 | (A8) `AbortSignal.timeout` u `menuFx.refreshRate` možda ne postoji u Convex runtime-u; tada se kurs nikad ne bi osvežio, a testovi bi prolazili. | `convex/menuFx.ts` | **Ispravljeno** (`AbortController` + `setTimeout`, kao svi ostali pozivi u `convex/`). Testovi: `convex/menuK34Backend.test.ts` „[A8] …”. |
| N36 | Opis dijaloga Room service govorio je „Biblioteka artikala se ne prikazuje cela.”; master §20 zabranjuje vidljivu biblioteku. | `lib/i18n/sr/menu-studio-posebno.ts` | **Ispravljeno**; `lib/menu/recnik.test.ts` sada zabranjuje reč „biblioteka” u Menu rečnicima, `docs/menu/RECNIK.md` dopunjen. |

### 10.4 Info

| # | Nalaz | Ishod |
|---|---|---|
| I1 | (A9) `menuPages.add` sa tuđim `menuServiceId` vraća `forbidden`, a sa nepostojećim `not_found`. | Prihvaćeno: adresiranje uslugom je namerno i zaključano testom (`convex/menuPages.test.ts:1252`); ID-jevi se ne mogu pogoditi. |
| I2 | (A10) „Preuzmi ceo meni” je od dve sekcije istog imena pravio dve RS kategorije. | Ispravljeno uz N31 (`convex/menuK34Backend.test.ts` „[A4] two sections with the same name become ONE category…”). |
| I3 | (B15) Tri skoro iste implementacije pretrage artikala u editoru. | Prihvaćeno: ponašanje je ispravno, objedinjavanje je refaktor van revizije. |
| I4 | (B16) `Dugme asChild` je tiho odbacivao `onClick`. | Ispravljeno (`components/menu/zajednicko/dugme.tsx`; `components/menu/studio/k34-editor.test.tsx`). |
| I5 | (B17) Dugme „Alergeni” je imalo `aria-pressed`, a otvara dijalog. | Ispravljeno (`k34-javni.test.tsx` „B17: …”). |
| I6 | (B18) Pad upita kursa ili sesije gosta obarao je ceo javni meni. | Ispravljeno: oba čitanja su opciona, stranica i dalje pada glasno (`app/[slug]/meni/_lib/ucitaj.ts`; `lib/menu/k34-javni.test.ts`). |
| I7 | (B19) Dupli `id` napomene pregleda kad su otvorena dva pregleda. | Ispravljeno (`data-pregled-napomena`; `components/menu/studio/k34-izgled.test.tsx`). |
| I8 | (B20) Izmene runa u starom editoru. | Provereno: dva reda (natpis fonta iz rečnika, bez sirove poruke greške); u redu. |
| I9 | (C9) Hop bez `SCANME_GUEST_SECRET` pravio je sesije koje niko ne može da koristi. | Ispravljeno: hop tada traži samo odredište (`withoutSession`), bez reda sesije, zakazivanja i trošenja kofe kartice (`convex/menuGuestK34.test.ts` „C9: …”, `lib/menu/http/k34-hop.test.ts`). |
| I10 | (C11) Pravilo iz AGENTS.md traži `FRONTEND-DELTA` zapis kad se menja ono na šta se oslanja integracija. | Prihvaćeno: `docs/events/**` je zabranjen pravilima runa (kao u svakom koraku); resolver dobija samo opciona polja u ishodu `menu`, `fair_model` i ostale grane su netaknute. |
| I11 | (C7) Fiksni prozor PIN brojača dozvoljava do 9 pokušaja u rafalu na granici prozora. | Prihvaćeno: kod panela (~50 bita) je prvi štit, brojači lokala ograničavaju ukupno. |
| I12 | (C8) PIN se odmah vraća u slobodne posle deaktivacije, a link panela ostaje isti. | Prihvaćeno uz predlog: posle odlaska člana rotirati link panela (Tim). |
| I13 | (D-I1) Početna je pisala „niko od osoblja nije prijavljen” i kad Vlasnik ili Menadžer radi nalogom. | Ispravljeno: tekst kaže „nijedan konobar nije prijavljen PIN-om” (`lib/i18n/sr/menu-panel.ts`). |
| I14 | (C10) Štampa QR kartica koristi `window.location.origin`. | BLOCKED K34/7 (kanonski domen); do tada štampati samo sa produkcione adrese. |
| I15 | (D-I2) `/bot/` bez granica reči odbacuje i UA sa „bot” u nazivu uređaja. | Prihvaćeno: retko, samo manje brojanje. |
| I16 | (D-I3) Ključ IP kofe je prvi unos `x-forwarded-for`. | Prihvaćeno: deljena funkcija resolvera kartica (van obima); Vercel prepisuje zaglavlje. |
| I17 | (D-I4) Microsoft `email` claim nije potvrđena adresa, a komentar je tvrdio suprotno. | Ispravljen komentar (`convex/lib/menuMailProviders.ts`); poruka se uvek šalje iz naloga koji je dao saglasnost. |
| I18 | Komponenta `SekcijaUPripremi` je ostala neiskorišćena posle K30. | Prihvaćeno: uklanjanje briše ~400 redova testova koji je koriste; zapisano kao mrtav kod. |
| I19 | (D-I5) Dve implementacije `tel:` linka. | Ispravljeno (`detalj-rezervacije.tsx` koristi `telHref`; `components/menu/konobar/k34-telefon.test.tsx`). |
| I20 | (D-I5) `menuMailOAuthStates` nema čistač. | Prihvaćeno: rast ograničen kofom 10/h i brisanjem starih redova istog korisnika. |
| I21 | Telefoni u testovima formata (`+381 64 123 4567`). | Prihvaćeno: primeri formata, ne kontakti u fixture-ima. |
| I22 | `app/dev/menu-admin-preview` nema `noindex`. | Prihvaćeno: zatečeno od ranije, ruta vraća 404 u produkciji. |
| I23 | `nazivJezika("constructor")` je čitao `Object.prototype`. | Ispravljeno (`lib/menu/studio/prevodi-pogled.ts`; `lib/menu/studio/prevodi-pogled.test.ts`). |
| I24 | „Zatraži promenu režima” je imao sopstvenu konstantu adrese i ručno kodiranje, pored `lib/menu/kontakt.ts`. | Ispravljeno: ista adresa kroz `mailtoLink` (`lib/menu/kontakt.test.ts`, `podesavanja.test.tsx:243`). |
| I25 | Fajlovi `.nocni-run/meni/**` u diff-u runa. | Prihvaćeno: menja ih runner, ne koraci. |
| I26 | K32 nema sopstvenu sekciju u `docs/MENI-PROGRESS.md` (runner: „agent nije dopisao sekciju”). | Info: K32 commit je pregledan kao deo celog diff-a ove revizije. |

## 11. Šta valja

1. **Jedan pristupni sloj i izolacija zakupaca.** `convex/lib/menuAccess.ts` ima jedan redosled provera (prijava → usluga → admin → stanje → uloga → dozvola), strani ID-jevi daju isti `not_found` kao nepostojeći, a nijedna funkcija ne uzima identitet iz argumenta. Jedini izuzetak koji je revizija našla (`storageId`, N1) je zatvoren; presečni test `convex/menuTenantIsolationK33.test.ts` prolazi.
2. **Objava je atomična i otporna.** `convex/menuPublishing.ts`: zastareo pregled se odbija (`expectedRevision`), budžeti i prostor za upis se proveravaju pre prvog upisa, delovi pa tek onda pokazivač, tačno 20 verzija, a vraćanje verzije piše samo razliku i čuva stranice sa QR karticama. Javni put čita samo kompajlirane javne delove i samo potvrđene prevode.
3. **Izmena resolvera kartica je hirurška i dokazana.** U `convex/cards.ts` jedna grana (`menu`) i proširen tip ishoda; bez aktivne Menu veze ishod je bajt-isti kao pre runa (`convex/menuGuest.test.ts:134`, četiri faze u `convex/menuLegacyCompat.test.ts`). Sajamske i sve ostale grane su netaknute.
4. **Pozicija gosta i PIN osoblja su pažljivo građeni.** Pozicija postoji samo u sesiji koju je otvorio hop, nikad u adresi ili argumentu; kolačići su `HttpOnly`, potpisani i vezani za lokal. PIN je HMAC sa pepper-om pa PBKDF2, promašaj se vraća kao vrednost (brojači se ne poništavaju), a opoziv sesije ne zavisi od serije.
5. **Pravila iz mastera su modelovana do slova.** Cene su celobrojna matematika sa jednim pravilom zaokruživanja (osnovna → markup → ručna, naknada jednom po porudžbini); alergeni nikad ne znače „bezbedno” i samo naglašavaju; rezervacije, statusi zahteva i zauzetost su mašine stanja sa jednim piscem i bez ijedne automatske promene.

## 12. Provere (K34, posle svih popravki)

| Provera | Rezultat |
|---|---|
| `node .nocni-run/meni/alati/typecheck.mjs` | bez grešaka |
| `npx tsc --noEmit -p convex/tsconfig.json` | bez grešaka |
| `npx eslint --ignore-pattern ".nocni-run/**"` | 0 grešaka; 2 stara upozorenja van runa (`components/admin/venue-admin.tsx`, `convex/purchaseLifecycle.test.ts`), isto kao na početku K34 |
| `npx vitest run --testTimeout=30000 --hookTimeout=60000` | 631 fajl prolazi, 2 preskočena; 14.202 testa prolaze, 2 preskočena (na početku K34: 613 fajlova, 13.973 testa, ista 2 preskočena) |
| `npm run harness:namespace` | prolazi (nema tokena tuđeg prostora imena) |
| `npm run build` | prolazi; u CSS-u produkcionog builda postoje obe deklaracije znaka „~” (N19) i pravilo polja od 16 px za grub pokazivač (N13) |
| Snimci (statički pregled bez servera, Playwright) | 28 PNG + `metrike.json` u `output/playwright/meni/K34/` (van gita): javni meni sa slikama koje padaju (red, detalj, pločice), „Bez” na pločicama, editor na 1100 i 1440 px, Izgled › Za goste sa izborom filtera (klik: isključena oznaka, ostale ostaju), detalj stola sa zauzetošću. Bez vodoravnog skrola na svim širinama; u konzoli samo namerni 404 za slike. Dev server nije pokretan (auto-mode ga je u ovom runu odbio u K06, K07, K31 i K33, pa ga K34 nije pokušavao), pa pregled ide kroz statički paket stvarnih komponenti izloga (`tmp/meni/k34-pregled/`). |
