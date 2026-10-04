# Sajam automobila 2026 — završni izveštaj lanca SAJAM v2 (backend + mapa)

> Za Aleksu i Jovana, 4. oktobar 2026.
>
> | Stavka | Vrednost |
> |---|---|
> | Grana | `codex/sajam-backend-2026` |
> | Osnova | `548d748` |
> | HEAD | `65415bc` |
> | DEV | `dev:expert-pelican-136` (`scripts/tasks/logs/sajam-v2/IZ-snapshot.txt`) |
>
> Ništa nije deployovano ni pushovano. Nijedan stvarni QR nije napravljen, nijedan email nije poslat. Go/no-go je Aleksin.

## 0. Korekcije K1–K4 (4. 10.)

Posle RF pregleda korektivni lanac je rešio RF nalaze 1–4. HEAD je sada `b0c83f2` (`scripts/tasks/logs/sajam-v2/IZK-snapshot.txt`). Izvori:
- SHA: `scripts/tasks/logs/sajam-v2/SAJAM-IZVESTAJ.md` i `git log`;
- ishodi i testovi: `jovan-status/K1.md`–`K4.md` i runnerovi gejt logovi `K*-gate-fairtest.log`;
- presuda: `scripts/tasks/logs/sajam-v2/RK-IZVESTAJ.md`.

| Korak | Ishod | Commit | RF nalaz | Testovi |
|---|---|---|---|---|
| K1 | urađen | `422224c` | 1: tajna gateway Next → Convex (`FAIR_GATEWAY_SECRET`, fail closed, timing-safe) i limit novih identiteta po IP HMAC-u (300 odjednom, 120/min) | `convex/fairGateway.test.ts`: 8 funkcija × 7 scenarija, `/r` bez tajne, IP limit. `lib/fair-server/*.test.ts`. `vitest run fair`: 30 fajlova, 290/290 |
| K2 | urađen u 3. pokušaju (prva dva je prekinula mreža, K2 §1) | `3f549bf` | 2: mapa i displej čitaju rotaciju i rezultat glasanja reaktivno (`useQuery`), bez upisa; slot iz `rotation-slot.ts` | `lib/fair-map/live-rotation.test.ts` (5), novi guard u `map-guards.test.ts`. 31 fajl, 296/296 |
| K3 | urađen | `638fd67` | 3: tvrdi prekidači `FAIR_LEADS_ENABLED` i `FAIR_FOLLOWUP_ENABLED` (podrazumevano isključeni, ponovna provera pre slanja) i zapis pravnog odobrenja pri aktivaciji saglasnosti | `convex/fairLeads.test.ts`, blok K3 (+8). `admin-events-leads.test.tsx`, `lib/fair-server/leads.test.ts`. 31 fajl, 304/304 |
| K4 | urađen | `b0c83f2` | 4: ručna izrada i ispravka izveštaja pre zatvaranja dana se odbijaju (`FAIR_DAY_NOT_CLOSED`); sweep ne preskače dan zbog ranijeg run-a | `convex/fairReports.test.ts`, blok K4 (2), `admin-events-reports.test.tsx`. 31 fajl, 306/306 |

**Presuda RK: SPREMNO ZA INTEGRACIONI TEST** (`RK-IZVESTAJ.md`). Važi samo za lanac.
- **Runner posle K4:** build, lint (0 grešaka), harness i `convex dev --once` su zeleni. `tsc` ima istih 35 postojećih grešaka u test fajlovima van fair opsega.
- **`npm test` (runner, K4):** 2 pada, nijedan od korekcija:
  - postojeći `memoriesHost`;
  - `adminProducts` „500 venues…“ je istekao na svom limitu od 60 s. Isti test je pao i u baseline-u lanca.
- **Zabranjene putanje:** 0 izmena.

Test 8. 10. i dalje blokiraju dve stvari van lanca:
- Kodeks F3: stranica modela još čita fixture;
- HTTPS host vezan za DEV.

Novi niski nalazi RK:
- `x-forwarded-for` iza proksija koji ga ne prepisuje;
- displej bez error boundary-ja;
- placeholder tekst potvrde nije blokiran;
- stari run pre zatvaranja dana i dalje može da se odobri;
- admin ne vidi stanje prekidača.

RF nalazi 12 i 13 nisu rađeni. Zato 8. 10. displeje otvarati sa `?prikaz=ekran`, a test telefoni ne smeju biti prijavljeni kao admin.

### Čeklista env promenljivih

**DEV** (`expert-pelican-136` + HTTPS host vezan za DEV, za 8. 10.). DEV `FAIR_GATEWAY_SECRET` je **već postavio runner** na Convex DEV i u `.env.local`. Izvori: `pre-gateway-secret.log` i K1 §1; prihvat na :3100 potvrdio je da se vrednosti poklapaju (K1 §3). Stanje Convex DEV imena je provereno u RK (`env-imena.mjs`, samo imena).

| Ime | Next ili Convex | Okruženje | Ko postavlja | Podrazumevano / stanje |
|---|---|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` → `expert-pelican-136` | Next | DEV host | Jovan | DEV host još ne postoji |
| `FAIR_VISITOR_HASH_SECRET` (≥32) | Next | DEV host | Jovan | bez vrednosti nema fair identiteta u produkcijskom buildu |
| `FAIR_GATEWAY_SECRET` (≥32, ista vrednost kao Convex DEV) | Next + Convex | DEV | runner (Convex DEV, `.env.local`); Jovan (DEV host) | Convex DEV: postavljen. DEV host: ne. Bez nje su fair skenovi i interakcije ugašeni, a redirect radi |
| `SCANME_ADMIN_EMAILS` (Aleksa, Jovan, Teodora) | Convex | DEV | Jovan | postoji |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Convex | DEV | Jovan | postoje |
| `FAIR_PUBLIC_BASE_URL` (URL DEV hosta) | Convex | DEV | Jovan | ne postoji; linkovi u mejlu tada vode na podrazumevani produkcijski URL |
| `FAIR_LEADS_ENABLED=true` | Convex | DEV, samo za probu | Jovan | isključeno; posle probe ukloniti i povući TEST saglasnost (K3 §8) |
| `FAIR_FOLLOWUP_ENABLED=true` | Convex | DEV, opciono za probu | Jovan | isključeno; posle probe ukloniti |
| `FAIR_EMAIL_REPLY_TO` | Convex | DEV | Jovan | ne postoji; obavezan ako se proba follow-up |

**Produkcija** (Convex prod + Vercel prod)

| Ime | Next ili Convex | Okruženje | Ko postavlja | Podrazumevano / posledica |
|---|---|---|---|---|
| `FAIR_GATEWAY_SECRET` (nova, ≠ DEV, ista na obe strane) | Next (server, bez `NEXT_PUBLIC_`) + Convex | produkcija | Aleksa ili Jovan, **pre** deploya K1 koda (ugovor §27.6) | bez nje fail closed: fair ugašen, redirect radi |
| `FAIR_VISITOR_HASH_SECRET` (≥32) | Next | produkcija | Aleksa ili Jovan | bez nje nema fair identiteta; promena vrednosti resetuje jedinstvene posetioce |
| `SCANME_ADMIN_EMAILS` | Convex | produkcija | Aleksa | bez nje admin skenovi ulaze u statistiku i nema PII pristupa |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Convex | produkcija | Aleksa | bez njih nijedan mejl ne odlazi |
| `FAIR_PUBLIC_BASE_URL` | Convex | produkcija | Aleksa | podrazumevani produkcijski URL |
| `FAIR_EMAIL_REPLY_TO` | Convex | produkcija | Aleksa | prazno = bez Reply-To; obavezno pre follow-upa |
| `FAIR_LEADS_ENABLED` | Convex | produkcija | Aleksa, tek posle P0 i aktivacije uz zapis odobrenja (ugovor §28.4) | **isključeno** |
| `FAIR_FOLLOWUP_ENABLED` | Convex | produkcija | Aleksa, posle P1 i `FAIR_EMAIL_REPLY_TO`, pre otvaranja | **isključeno**; leadovi primljeni dok je isključen nikad ne dobijaju follow-up |
| `FAIR_COOKIE_DOMAIN` | Next | produkcija | niko | prazno: cookie samo za host (trenutna odluka) |

## 1. Checkpoint-i

Izvori:
- SHA i ishodi: `scripts/tasks/logs/sajam-v2/SAJAM-IZVESTAJ.md` i `LANAC-commits.txt`;
- testovi: rezultat `vitest run fair` posle koraka, iz status fajla tog koraka.

| Korak | Ishod | Commit | Glavne isporuke | Testovi |
|---|---|---|---|---|
| C0 | urađen (audit, plan mode) | — | compatibility audit, plan B0 (`C0.md`) | — |
| B0 | urađen | `9858c79` | `lib/fair-contract.ts`, `lib/fair-entitlements.ts`, 29 `fair*` tabela, validatori, `FAIR-BACKEND-CONTRACT.md` | 4 fajla, 55/55 |
| R0 | urađen (pregled B0) | — | 13 nalaza, nijedan visok (`R0-IZVESTAJ.md`) | — |
| B0P | preskočen | — | R0 nije tražio doradu | — |
| B1 | urađen | `388abbc` | katalog, JSON import (dry-run/commit), paketi sa auditom, atomska QR dodela | 7 fajlova, 70/70 |
| B1A | urađen | `4803fca` | admin tab `Događaji` | 71/71 (polazno stanje B2) |
| B2 | urađen u 3. pokušaju | `bfc8ff8` | visitor cookie + HMAC, `/r` fair hook, total/unique, admin isključenje, javni katalog | 12 fajlova, 113/113 |
| M0 | urađen | `6ef05be` | geometrija 4 mape organizatora, `mapLocationId` | prolaze u sklopu B3 polaza (B3 §1) |
| B3 | urađen u 2. pokušaju | `2e0183d` | ocene, Glas publike, anketa, pasoš, 6 POST ruta | 15 fajlova, 152/152 |
| M1 | urađen u 2. pokušaju | `150be2f` | javna mapa `/sajam/[eventSlug]`, pasoš `N/M`, prikaz za displej | 17 fajlova, 164/164 |
| B4 | urađen | `fe00c28` | leadovi iza `CONSENT_NOT_CONFIGURED`, outbox, Resend seam, follow-up | 19 fajlova, 196/196 |
| B5 | urađen | `d5a89ef` | ručno objavljen immutable sponzorisani snapshot, garažne akcije | 21 fajl, 219/219 |
| M2 | urađen | `8b0c873` | 12 s rotacija na mapi i displeju, bez upisa | 22 fajla, 225/225 |
| B6 | urađen | `e9a3868` | dnevni dataset, PDF/XLSX/CSV, odobrenje pre slanja, odvojen PII izvoz | 25 fajlova, 264/264 |
| B7 | urađen | `65415bc` | purge 16. 11., authz tabela, performanse, integracioni TEST seed | 29 fajlova, 280/280 |
| RF | urađen (plan mode) | — | završni nezavisni pregled (`RF-IZVESTAJ.md`, sažetak u §2) | nezavisno ponovljeno: `vitest run fair` 280/280; `npm test` 1537 prošlo, 1 pao (postojeći `memoriesHost`) |

Ponovljeni pokušaji:
- **B2:** prva dva pokušaja su pala samo na podrazumevanom timeout-u od 5 s, jer je laptop radio na bateriji (B2 §3c).
- **B3:** prvi pokušaj je odbijen zbog praznog reda na kraju test fajla (B3 §3a).
- **M1:** u prvom pokušaju runnerovi URL-ovi su vraćali 404, jer DEV ima samo `test-` događaje (M1 §3a).

## 2. Presuda RF i najvažniji nalazi

Izvor: `scripts/tasks/logs/sajam-v2/RF-IZVESTAJ.md`.

> **Dopuna 4. 10. (IZK):** RF nalazi 1–4 su rešeni u K1–K4, a presuda RK je SPREMNO ZA INTEGRACIONI TEST (§0). Tabela ispod je stanje pre korekcija; kolona „Predlog“ za redove 1–4 je istorija.

**PRESUDA: TREBA DORADA PRE INTEGRACIONOG TESTA.** Jezgro je tačno i pokriveno testovima: brojanje skenova, paketna prava, izolacija izlagača, odobrenje izveštaja i brisanje posetilačkih tabela. Pre 8. 10. treba mali korektivni korak u Jovanovom opsegu.

| # | Ozbiljnost | Nalaz | Predlog |
|---|---|---|---|
| 1 | visoka | Javne visitor mutacije i `/r` veruju svakom ispravno formiranom hash-u (`convex/fairInteractions.ts`, `convex/fairLeads.ts:61`, `convex/cards.ts:697`). Direktan poziv Convex-a može da napumpa skenove, glasove (i na displeju), ocene i pečate, i da pošalje junk leadove. Isto piše u B7 §2.4 i ugovoru §9.65. | **Rešeno u K1** (`422224c`, `fairGateway.test.ts`) |
| 2 | visoka | Displej čita rotaciju i rezultat glasanja samo pri učitavanju (`app/sajam/[eventSlug]/_mapa/map-section.tsx:26-30`). Novi rezultat i nova objava se ne vide bez ponovnog učitavanja. | **Rešeno u K2** (`3f549bf`, `live-rotation.test.ts`) |
| 3 | visoka (produkcija) | Leadovi se uključuju jednim admin klikom (`convex/fairLeadsAdmin.ts:128-149`). Placeholder tekst emaila nije blokiran, a follow-up nema poseban prekidač. | **Rešeno u K3** (`638fd67`, `fairLeads.test.ts` blok K3). Blokada placeholder teksta ostaje uz P1 (RK novi nalaz 3) |
| 4 | srednja | Ručna izrada izveštaja pre kraja dana (`convex/fairReports.ts:431-444`) blokira automatski dnevni izveštaj za taj dan (sweep, `:205-209`). | **Rešeno u K4** (`b0c83f2`, `fairReports.test.ts` blok K4). Backend sam odbija izradu pre zatvaranja dana. |
| 5 | srednja | Broj leadova i odgovori ankete računaju se iz sirovih redova (`convex/fairAnalytics.ts:144-155,361-376`), pa su posle purge-a 0. | Brojači pri upisu, ili zabrana ponovne izrade posle purge-a |
| 6 | srednja | Bez `FAIR_VISITOR_HASH_SECRET` produkcija tiho ne broji fair skenove (`lib/fair-server/visitor.ts:74-79`). | Stavka deploy čekliste i stanje vidljivo u adminu |
| 7 | srednja (odluka) | Purge kreće automatski 16. 11. u 00:00 (`convex/fairRetention.ts:228-251`), a MASTER §13 kaže „nakon odobrenog pokretanja“. | Aleksa bira |
| 8 | srednja | Adresa za odgovor (otkazivanje follow-upa odgovorom) nije obavezna. | Vidi RF |
| 9 | srednja | Admin retry follow-upa ignoriše prozor 24–48 h (`convex/fairLeadsAdmin.ts:421-433`). | Vidi RF |
| 10 | srednja | Zaglavljeni outbox redovi nemaju čistač. | Vidi RF |

Niski nalazi su u RF izveštaju:
- capabilities se računaju iz sačuvanog paketa, ne iz paketa na snazi;
- `/r` fallback pri isteklom admin tokenu broji admina;
- pasoš se učitava i na displeju;
- prozor pitanja nije ograničen na dan;
- katalog pasoša i `draft` događaj;
- kozmetika izveštaja;
- nedostaje test za fair granu `/r` rute.

## 3. Dokazano na DEV-u i šta čeka vlasnika

Izvor: `jovan-status/B7.md` §2.6 (produkcijski gate), potvrđeno u RF.

**Dokazano na DEV-u (test i/ili DEV izvršenje):**

| Stavka | Dokaz |
|---|---|
| `/r` ne duplira fair sken i QR može da se preusmeri | `fairScans.test`, B1 assign/release |
| Paketna prava na serveru | `lib/fair-entitlements.test`, `fairPublic.test` |
| 10 skenova = 10 ukupno / 1 jedinstveno; admin isključen, ostali se broje 24/7 | `fairScans.test`; DEV 10/1 i 11/2 |
| Izmena ocene ili glasa ne duplira red | `fairInteractions.test` |
| Retry emaila ne šalje duplikat | `fairLeads.test` (isti `Idempotency-Key`) |
| Dnevni dataset ne meša izlagače | `fairReports.test` |
| Sponzorisane projekcije samo sa objavljenim Advanced modelima, bez impression upisa | `fairSponsored.test`, `map-guards.test` |
| Izveštaj se ne šalje bez ručnog odobrenja | `fairReports.test` |
| Purge preview, dry run i test | `fairRetention.test`, `fairIntegration.test`; DEV dry run je obrisao 0 redova |
| Javne funkcije ne vraćaju PII | `fairAuthz.test` (integritet metrika: RF nalaz 1) |
| Seed za 8. 10.: oba sajma, 2 izlagača, 10 modela, 3 paketa, 10 TEST QR | `seedIntegrationTest`, `fairIntegration.test` |
| Mapa na 390, 1280 i 1920 px bez overflow-a i grešaka u konzoli | runner snimci M1/M2 |

**Čeka vlasnika ili je blokirano:**
- **QR → stranica modela.** Backend vraća 302 na tačnu putanju, ali stranica modela (Kodeks F3) još čita fixture, pa vraća 404.
- **Saglasnost.** Tekst nije odobren (P0), pa je lead tok zatvoren.
- **Resend.** Imena env promenljivih postoje na DEV-u. Jovanov ručni DEV test mejl (B4 §8) nije prijavljen.
- **Ručni prolaz.** Android, iPhone i displej čekaju 8. 10.
- **Garaža** (dva taba i sponzorisana traka) je Kodeksov F8.
- **Produkcijski deploy** je Aleksin.

## 4. Otvorena pitanja (MASTER §19, bez duplikata)

Brojevi `§9.x` su iz `FAIR-BACKEND-CONTRACT.md`.

**P0 — blokira produkcijsko uključivanje leadova**
1. Stručno proveren tekst saglasnosti i politike privatnosti. Mora da sadrži `{izlagac}` i ime ScanMe (§9.37).
2. Bezbedan kanal i primalac PII izvoza po izlagaču; status `delivered` (§9.13, §9.46, §9.60).
3. ~~Tvrdi produkcijski prekidač za leadove i follow-up (RF nalaz 3).~~ Rešeno u K3 (`638fd67`). Ostaje da Aleksa postavi prekidače po redosledu iz ugovora §28.4 (§0).

**P1 — pre integracionog testa, odnosno pre otvaranja**
1. ~~Korektivni korak za RF nalaze 1–4~~: urađen u K1–K4 (`422224c`, `3f549bf`, `638fd67`, `b0c83f2`; §0). Ostaju env promenljive iz čekliste u §0.
2. Emailovi:
   - tekst potvrde i follow-upa (placeholder u `lib/i18n/sr/event-lead-email.ts`);
   - `FAIR_EMAIL_REPLY_TO` (§9.38–§9.39);
   - sat follow-upa i jedan follow-up po posetiocu i modelu (§9.40–§9.42).
3. Izveštaji:
   - primalac i vreme isporuke po izlagaču;
   - zatvaranje dana: ponoć ili radno vreme hale (§9.54);
   - šablon PDF/XLSX (§9.55);
   - izveštaj za `included` i „Završni izveštaj“ iz PDF v10 (§9.9, §9.58);
   - agregat za organizatora (§9.59).
4. Stvarni podaci:
   - izlagači, modeli, specifikacije, cene, fotografije, paketi i pitanja;
   - ko pravi JSON iz CSV-a (§9.4);
   - grupe i highlight specifikacija (§9.5);
   - kolone `test_drive_*` (§9.47);
   - ključevi postojećih klijenata i brendova (§9.10, §9.18).
5. Mapa:
   - položaj ScanMe štanda (M0, M1);
   - deljene lokacije (§9.17);
   - S1/S2 i novije mape organizatora (M0 §7);
   - dozvola za javnu upotrebu slika mapa sa logotipima (RF);
   - rezolucija displeja (M1).
6. QR inventar: nalog i vrsta nalepnica (§9.14, §9.21); Wi-Fi i NAT u hali (§9.66).
7. Naknadno odobrenje B0 ugovora (HANDOFF §17), status EDS-a za mapu (§9.2) i PDF v10 naspram MASTER-a (§9.9).
8. Kodeks:
   - probna vožnja bez izbora datuma;
   - `Zainteresovan sam` sa jednim kontaktom;
   - fixture stranica ne sme biti javna (BLOCKED, B0 §4).

**P2 — posle funkcionalne osnove**
1. Purge: automatski ili uz odobrenje (RF nalaz 7), adrese izlagača (§9.61), lokalne kopije (§9.62).
2. Definicije metrika:
   - jedinstveno po štandu i po danu (§9.24, §9.28);
   - „view“ (§9.8);
   - pečat pri admin skenu (§9.25);
   - dnevni presek ocena (§9.56);
   - ocene posle nadogradnje (§9.57).
3. Paketi: direktno `included → advanced` (§9.12), početna aktivacija (§9.16, §9.20), capabilities pre početka paketa (§9.35).
4. Interakcije: prozor i limit pitanja (§9.29–§9.30), pasoš (§9.31–§9.33), anketa (§9.7, §9.36).
5. Sponzorisano: dnevna objava i epoha (§9.49–§9.52), admin u garaži (§9.53), oznaka i zona na mapi (M2 §7).
6. Admin: mesto taba i kompaktna navigacija (B1A §7); poddomen (§9.3, §9.23).

## 5. Ko šta radi pre 8. oktobra

**Aleksa**
- Odluči o korektivnom koraku (RF nalazi 1–4) i o prekidaču za leadove.
- Pokreni izradu pravnog teksta saglasnosti (P0) i dogovor o kanalu predaje PII-a. Do tada leadovi ostaju zatvoreni.
- Obezbedi Kodeksove F3 (stranica modela na `fairPublic.getModelBySlug`) i F8 (garaža). Oni su preduslov za test.
- Potvrdi položaj ScanMe štanda, mape organizatora i stvarne podatke izlagača.
- QR serije (2 × 50) samo uz izričitu produkcijsku saglasnost.
- Produkcijski deploy (oba crona: dnevni izveštaji i purge) i go/no-go.

**Jovan**
- Primeni patch (`git am`) ili pushuj granu na `aleksadjor3` iz klona koji ima taj remote (C0 §4c).
- Podesi HTTPS host vezan za DEV `expert-pelican-136` sa `FAIR_VISITOR_HASH_SECRET` (≥32 znaka). Istu promenljivu postavi i u Vercel produkciji.
- Proveri da `SCANME_ADMIN_EMAILS` na DEV-u i u produkciji sadrži Aleksu, Jovana i Teodoru.
- Pošalji ručni DEV test mejl: `npx convex run fairEmailSender:sendDevTestEmail '{"to":"…"}'` (B4 §8).
- 8. 10.:
  - ujutru `npx convex run fairDevFixtures:seedIntegrationTest`;
  - odštampaj 10 TEST QR kodova na HTTPS DEV host;
  - vodi ručni scenario iz B7 §8.1;
  - ne pravi ručno izveštaj za 8. 10. pre ponoći.
