# ScanMe Menu V1 — predlog izmena master specifikacije (K35)

**Datum:** 21. 10. 2026. **Grana:** `codex/jovan-meni-v1-2026-10-16`.

Ovo je predlog, ne izmena. Master (`ScanMe-Menu-Jovan-Claude-Handoff/docs/SCANME-MENU-MASTER-SPEC.md`) run nije menjao. Svaka stavka kaže šta bi se u masteru promenilo, zašto i gde je dokaz. Ništa ovde nije potvrdio vlasnik; izbore koji su poslovna odluka run je zapisao i u `docs/tasks/BLOCKED.md` (odeljci `SCANME MENU V1 — Kxx`).

Oznake: **§** = poglavlje mastera; **Kxx/n** = stavka u `docs/tasks/BLOCKED.md`; **N/I** = nalaz u `docs/menu/REVIZIJA.md` §10.

## 1. §16 Zatečeno stanje repozitorijuma

§16 opisuje repo pre runa. Posle spajanja grane tabele više nisu tačne.

| # | Predlog | Razlog | Dokaz |
|---|---|---|---|
| 1.1 | §16.1 dopuniti novim površinama, a stare označiti kao „stari model, radi do prelaska lokala": javni meni `app/[slug]/meni/page.tsx` + `[stranica]`, `room-service`, `zahtevi`, `rezervacija/**`; editor `/[slug]/client-panel/meni/editor`; klijentski panel `/[slug]/client-panel/meni/**` (osam sekcija); konobarski panel `/[slug]/konobar/[kod]`; QR hop `/r/[cardCode]/meni`; API `/api/meni/{slike,rezervacija,analitika,mail/callback}`; admin podstranica dobija kartice Režim i Uvoz. Backend: 32 nova modula `convex/menu*.ts`, stari `convex/menu.ts`, `ordering*.ts` i `/panel/[venueCode]` rade kao pre. | Tabela inače vodi na stare putanje. | `docs/menu/MENU-ARHITEKTURA.md` §3, §8 |
| 1.2 | §16.3 svaki red dobija kolonu „Stanje posle runa": režim → `menuServices.mode` (menja samo admin); struktura → stranice, sekcije, artikal i prikaz; cene → jedna osnovna cena + Room service obračun; ordering → zahtev referencira artikal objavljene verzije; editor → novi editor u panelu; konobarski panel → jedan radni ekran, sala, tabela, fioka; statusi → `Novi / Prihvaćen / Završen` + `Otkazan`, podsetnik podesiv; rezervacije → nov model bez izbora stola; status stola → opcioni ručni modul; klijentski panel → Menu IA §13; analitika → definicije u `docs/menu/ANALITIKA-DEFINICIJE.md`. **Paketi ostaju otvoreni** (vidi 4.1). | Pokazuje šta je zatvoreno, a šta ne. | `docs/menu/REVIZIJA.md` §8 (506 stavki: 467 da, 10 delimično, 7 ne) |
| 1.3 | §16.4 rizike zameniti merenjima i preostalim proverama: per-item fanout nema (javni put ≤ 15 dokumenata i za 400 artikala); konobarski panel ima pretplate po lokalu, 300 stolova = 633 dokumenta / 17 upita; slike imaju skladište, obradu, limit i rezervnu ikonicu; offline panel je jasno označen; PIN je HMAC + PBKDF2, vezan za lokal; mailbox je OAuth sa šifrovanim tokenima; analitika ima retenciju 90 dana / 24 meseca. Ostaju: JS rute `/[slug]/meni` 70,4 KB prema budžetu 60 KB (stari renderer u istom segmentu), merenja na deploymentu (grupno brisanje 200 artikala, objava 2.000 artikala × 10 jezika). | Rizici iz §16.4 su sada izmereni ili imaju ime i vlasnika. | `docs/menu/MENU-ARHITEKTURA.md` §14, `docs/menu/HARDENING.md` §5, REVIZIJA N33, N34; K34/9 |

## 2. §18 Trenutna procena napretka

| # | Predlog | Razlog | Dokaz |
|---|---|---|---|
| 2.1 | Tabelu zameniti stanjem posle runa: „Tehnički temelj" → ugostiteljski V1 postoji na lokalnoj grani (35 commitova, testovi zeleni), nije puštan ni na DEV; „Implementaciona spremnost" → spremno za DEV probu (šema, migracija na kopiji, env), ne za produkciju. | Stara procena („spremno za code-gap audit") je zastarela. | `docs/MENI-REPORT.md` §0, §8 |
| 2.2 | Listu „najveći preostali blokovi" zameniti stvarnim ostatkom: cene paketa (BLOKADA K03); pisci podešavanja stranice i sekcije, pa povratak i zajednička navigacija (§3.3, §3.4; N3); pun pregled nacrta (§6.1; N7); pozivnica osobi bez ScanMe naloga (§13; N10); provera uloge u `convex/cards.ts` (K33/1); merenja na deploymentu (K34/9); pravna provera alergena, kolačića i analitike; env i OAuth registracija. | Šest blokova iz §18 je urađeno; ostatak je uži i drugačiji. | `docs/tasks/BLOCKED.md` K03, K33, K34 |
| 2.3 | Dodati red „Provereno u stvarnom browseru sa pravom prijavom: ne". | Run je ekrane iza prijave video samo kroz izlog sa izmišljenim podacima. | `docs/MENI-REPORT.md` §7 |

## 3. §19 Tehničke odluke koje je run doneo

§19 kaže da ove detalje „Jovan/Claude moraju rešiti i dokumentovati". Predlog: u §19 upisati izbor i uputiti na recept. Poslovno ponašanje se ne menja.

| # | Tema iz §19 | Izbor runa | Razlog | Gde je |
|---|---|---|---|---|
| 3.1 | Migracija i rollback | Widen–migrate–narrow: samo nove tabele `menu*` i opciona polja; interne funkcije `planLegacyMigration` (bez upisa), `migrateLegacyMenuBatch` (serije po 100, idempotentno, staje na promenu izvora), `purgeMigratedService`, `cutoverLegacyMenu` / `revertLegacyCutover`; stare tabele se nikad ne pišu; javni put služi novi model tek posle prelaska. Ništa nije pušteno. | §17.4, P3. | `MENU-ARHITEKTURA.md` §12 |
| 3.2 | Indeksi, paginacija, agregacije, real-time granice | Svaka podtabela nosi `menuServiceId` i indeks koji počinje njime; nema `.collect()` u novim modulima; liste su `.take(n)` sa granicama iz `lib/menu/limits.ts` (npr. 300 `Novi` + 300 `Prihvaćen` zahteva u panelu, 200 neodgovorenih rezervacija, 500 kartica po lokalu, 200 artikala po grupnoj radnji, 2.000 artikala po usluzi); pretplate panela po lokalu, ne po stolu; analitika u dnevnim agregatima. | §4 plana, §16.4. | `MENU-ARHITEKTURA.md` §2, §7, §14 |
| 3.3 | Provajder kursa RSD/EUR | Srednji kurs NBS kao JSON sa `MENU_FX_URL`, cron na 6 h, samo kad je `MENU_FX_ENABLED=true`; kurs svež 4 beogradska dana; bez svežeg kursa EUR prekidač se ne prikazuje. **Izvor (NBS servis uz registraciju ili posrednik) i uslovi korišćenja nisu izabrani.** | Master §5.3 ostavlja izbor timu. | `convex/menuFx.ts`, `lib/menu/currency.ts`; K14/1, K14/5 |
| 3.4 | Skladište i obrada slika | Convex storage; obrada kroz Next rutu `/api/meni/slike` sa `sharp` (web format, do ~2.400 px, bez metapodataka), JPG/PNG/WebP do 10 MB, HEIC odbijen sa porukom, 60 otpremanja na sat po meniju, ista tajna kao Memories (`SCANME_PIPELINE_SECRET`); stare slike se ne brišu dok ih verzija prikazuje; blob se prihvata samo ako pripada rezervaciji (K34 N1). | §7.9; bez novog paketa i nove tajne. | `convex/menuMedia.ts`; K15/1–4 |
| 3.5 | OAuth / mailbox | Gmail (`gmail.send`) i Microsoft (`Mail.Send` + `offline_access`), PKCE S256, jednokratan `state`, tokeni AES-GCM (`MENU_MAIL_TOKEN_KEY`), primalac uvek adresa gosta iz rezervacije; bez ključeva funkcija je isključena i nudi se `mailto:`. Aplikacije nisu registrovane. | §11, P7. | `convex/menuMail*.ts`, `.env.example` `MENU_MAIL_*`; K24/7, K26/1 |
| 3.6 | Merenje, pravna provera i retencija analitike | Događaji bez IP-a i UA-a; dan po Beogradu; sirovi 90 dana, dnevni agregati 24 meseca; identifikator sesije postoji u kodu, ali je podrazumevano isključen (`MENU_ANALYTICS_IDENTIFIERS=off`), pa sesije i tokovi pišu „nije dostupno"; procenti tek od 20. **Pravni osnov za identifikator i tekst politike privatnosti nisu rešeni.** | §14.4, P8. | `docs/menu/ANALITIKA-DEFINICIJE.md`; K29/1, K29/3 |
| 3.7 | Responsive i pristupačnost u stvarnom browseru | Projektovano za 1440, 1024, 768 i 390; WCAG 2.1 AA; mete 44 px (konobar 48 px). Provera je rađena statičkim paketom stvarnih komponenti u Playwright-u (dev server je auto-mode odbio u K06, K07, K31, K33), uključujući rad samo tastaturom. **Nije provereno na pravom telefonu, sa pravom prijavom i pravim podacima.** | §15, §19. | `docs/menu/HARDENING.md` §1; `docs/MENI-REPORT.md` §7 |

## 4. Pravila koja je implementacija pokazala kao nedorečena

Svaka stavka je izbor runa koji radi u kodu. Predlog je da master ili potvrdi izbor ili napiše drugačije pravilo.

| # | § | Šta je nejasno ili u sukobu | Izbor runa | Predlog za master | Izvor |
|---|---|---|---|---|---|
| 4.1 | §2.2.1 | Nove cene (Menu 1.490 / 14.900, Menu + Links 1.990 / 19.900) sa nepromenjenim paketom „Kompletan" (3.790 / 37.990) ruše pravilo da dodavanje usluge ne poskupljuje korpu. | Cene nisu upisane (BLOKADA). | Dodati cenu paketa „Kompletan" u matricu: dozvoljeno [4.179, 4.424] mesečno i [41.997, 44.492] godišnje (kandidat 4.290 / 42.900 prolazi sve korpe). | K03 |
| 4.2 | §3.2 | Master blokira samo brisanje stranice sa QR vezom. | Blokirano je i arhiviranje (QR bi vodio na stranicu koju gost ne vidi). | Zapisati „brisanje i arhiviranje". | K02/5 |
| 4.3 | §3.3, §3.4 | Navigacija stranica (povratak, zajednička), ikonica i vidljivost kartice stranice postoje u modelu, ali ne kaže se da li su obavezni za lansiranje. | Nisu u editoru (BLOKADA). | Reći da li V1 lansiranje to traži. | N3; K34/2 |
| 4.4 | §5.5, §7.6 | „Preporuka" je i oznaka i natpis akcije. | Prikazuje se jedan natpis. | Jedan pojam ili pravilo prikaza. | K04/5 |
| 4.5 | §7.3 | Oznake „Bez glutena" / „Bez laktoze" bile bi tvrdnja o bezbednosti mimo alergena. | Nema ih u zatvorenom spisku oznaka. | Zapisati zabranu. | K04/1 |
| 4.6 | §2.2, §5.3, §7.7 | Šta se dešava kad nalog izgubi Premium. | Room service ostaje uključen, sadržaj se ne briše, izmene traže Premium; Premium izgled se pri sledećoj objavi spušta na osnovnu varijantu istog tona; jezici iznad 2 se ne objavljuju, prevodi ostaju; zakazana akcija se ne objavljuje. | Jedno pravilo „gubitak Premium-a" u §2.2. | K03/1, K05/2, K16/3, K17/2 |
| 4.7 | §2.2 | „Uklanjanje ili smanjenje brendinga". | Samo smanjenje (mala oznaka „ScanMe"). | Izabrati jedno. | K17/4 |
| 4.8 | §6.1 | Ponovna objava bez izmena; vraćanje nacrta na živu verziju. | Odbija se (`no_changes`), osim kad bi gost dobio drugačiji meni; „Odbaci izmene nacrta" postoji. | Potvrditi oba. | K05/3, K18/3 |
| 4.9 | §6.1 | „Pregled pre objave" ne kaže koliko pun mora da bude. | Pregled uživo bez slika, cena varijanti, akcija, oznaka i alergena; napomena to kaže. | Definisati obim pregleda nacrta. | N7; K34/3 |
| 4.10 | §7.7 | Prevod sadržaja menija naspram teksta interfejsa. | Sadržaj na izabranom jeziku; dugmad i radni tekst o alergenima na srpskom. | Zapisati, uz pravnu proveru teksta alergena na drugom jeziku. | K14/3 |
| 4.11 | §7.9 | Formati slike. | JPG, PNG, WebP; HEIC odbijen. | Zapisati formate. | K15/1 |
| 4.12 | §8 | Room service i akcija; napomena cele porudžbine; dva telefona za istim stolom; delimično nedostupna porudžbina. | Akcija ne važi u Room service-u; napomena samo po liniji; jedan otvoren poziv i račun po mestu; cela porudžbina se odbija. | Potvrditi svako pravilo. | K21/1–4 |
| 4.13 | §8, §9 | Trajanje sesije gosta posle skena. | 3 h od skeniranja, radnje je ne produžavaju. | Zapisati trajanje i šta gost vidi posle isteka. | K21/11 |
| 4.14 | §9 | ADMIN-12 fizičke kartice nemaju Menu odredište. | U „Lokal i QR" samo za čitanje. | Reći da li klijent sme da ih veže za sto. | K19/K20/6 |
| 4.15 | §10.4 | „npr. 15 min" za prag; vreme podsetnika nije dato. | Prag 15 min, podsetnik 5 min, oba podesiva. | Zapisati podrazumevane vrednosti. | K07/4, K23/1 |
| 4.16 | §10.6 | Blokada posle 5 pogrešnih pokušaja bez trajanja. | Uređaj 5 promašaja / 15 min → 15 min; lokal (svi uređaji) 60 / 15 min sa eskalacijom 15 min → 1 h → 4 h → 12 h; skida Vlasnik ili Menadžer. | Zapisati brojeve ili prepustiti receptu. | K22/2; HARDENING B1, B2 |
| 4.17 | §10.6, §13 | ScanMe admin i PIN radnje. | Admin ima sve dozvole (beleži se u auditu). | Reći da li podrška sme da resetuje PIN i ulazi u panel. | K22/4 |
| 4.18 | §11 | Brojevi forme rezervacije. | Do 60 dana unapred, termini na 15 min unutar radnog vremena, do 50 gostiju, zadržavanje 5–180 min (podrazumevano 15). | Zapisati ili potvrditi. | K24/3 |
| 4.19 | §11 | Potvrda prijema i odgovor gosta na predlog izmene. | ScanMe ne šalje automatsku potvrdu; gost ne prihvata predlog u aplikaciji, osoblje beleži odgovor. | Potvrditi. | K24/1, K24/2 |
| 4.20 | §13 | „Spoljni Urednik" bez ScanMe naloga. | Pozivnica radi samo za osobu sa ScanMe članstvom (auth tok van obima). | Reći da li pozvana osoba mora imati nalog. | N10; K34/1 |
| 4.21 | §13.4 | Granica tablet–desktop za editor. | Struktura kao kolona tek od 1.280 px; ispod je fioka. | Zapisati širinu. | N9 |
| 4.22 | §13 | Šta Urednik vidi u panelu. | Samo Početnu i Editor. | Potvrditi ili dodati Analitiku. | K08/1 |
| 4.23 | §14.4 | „Procenti tek od 20 relevantnih sesija" dok se sesije ne mere. | Osnovica su otvaranja menija; ispod 20 nijedan procenat. | Definisati osnovicu. | K30/1 |
| 4.24 | §14 | Jedinstveni posetioci i interni saobraćaj. | Ne mere se; prijavljeni ScanMe korisnici se ne broje. | Potvrditi. | K29/2, K29/4 |
| 4.25 | §15 | Tekst „Poručivanje" naspram „Porudžbine". | „Poručivanje" samo kao radnja gosta. | Izabrati ime funkcije. | K31/1 |
