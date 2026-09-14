# ADMIN-12 — lokalna verifikacija

Datum: 2026-09-14. Scope: backend/domain ADMIN-12 i neophodne veze sa ADMIN-11 i postojećim resolverom.

## Preflight i zaštita opsega

- Grana: `codex/admin-v1`.
- Početni HEAD: `a482e4b31aca6588b9692b11068be8a3ea6f6601`.
- Početni jedini untracked fajl: `output/pdf/scanme-menu-cenovnik-i-projekcija.pdf`.
- PDF nije čitan, menjan ili stage-ovan. Nije korišćen reset, stash ili odbacivanje postojećih izmena.
- Jedan završni lokalni commit: `feat(admin): implement ADMIN-12 product and access channels`. Konačan hash je u završnom izveštaju i Git istoriji.

## Promenjeni fajlovi

1. `convex/schema.ts` — aditivni modeli, atribucija, indeksi i ADMIN-11 veze.
2. `convex/adminProducts.ts` — provisioning, SMQ, kanali, refresh izvora, retarget, link i pozicije.
3. `convex/adminProductReads.ts` — scoped/global liste, detalji, istorije i placement metrike.
4. `convex/adminAccessMigrations.ts` — bounded dry-run/write adapter.
5. `convex/lib/accessValidators.ts` — typed ugovori i ograničenja.
6. `convex/lib/accessOperations.ts` — jedinstveni identiteti, idempotency, destinacije, projekcije i action items.
7. `convex/lib/accessResolution.ts` — zajednička live validacija resolvera, health-a i ciljeva.
8. `convex/lib/accessOrderBridge.ts` — stvarne QC jedinice, aktivacija i dispatch readiness.
9. `convex/adminOrders.ts` — stvarni SMF, immutable print snapshot, parcijalni QC/remake i rezervacije isporuke.
10. `convex/cards.ts` — compatibility adapter, atribucija, Menu splitter i zaštita starog writer-a.
11. `convex/cardsAdmin.ts` — zaštita starog writer-a posle mapiranja.
12. `convex/adminProducts.test.ts` — ADMIN-12 domenski, bezbednosni, migracioni i scale testovi.
13. `convex/adminOrders.test.ts` — regresije sada koriste stvarne fizičke jedinice i eksplicitni QC kanala.
14. `convex/cards.test.ts` — dozvoljen Menu splitter prema novom zaključanom ugovoru.
15. `convex/_generated/api.d.ts` — importi i API mapiranje samo sedam novih ADMIN-12 modula.
16. `docs/tasks/ADMIN-12-MIGRACIJA.md` — runbook i compatibility/operativne granice.
17. `docs/tasks/ADMIN-12-VERIFIKACIJA.md` — ovaj izveštaj.

## Obavezna matrica dokaza

Brojevi odgovaraju 25 scenarija iz zadatka. Testovi su u `convex/adminProducts.test.ts`; jedan test može dokazivati više povezanih invarijanti.

| # | Dokaz |
| --- | --- |
| 1–2 | `50 units are unique, retry safe, immutable and distinct across order lines`: tačno 50 i tri ponovljena poziva bez novih jedinica. |
| 3 | Isti test pravi drugu order line; `code generation rejects persistent SMF, SMQ and public token collisions` forsira kolizije. |
| 4–5 | Provisioning odbija prazan skup kanala; NFC-only ima QR gray. Chunk test koristi NFC-only 51 jedinicu. |
| 6–7 | `QR/NFC share destination but state and scan counts remain independent`: zajednički target, zasebna aktivnost i metrički događaji/brojači. |
| 8–9 | Active/inactive/problem tranzicije, prethodno validno stanje, razlog/resolution note; nedostajući target ne može postati active. |
| 10–11 | QC aktivira validne eksplicitno proverene kanale; parcijalni QC zahteva stvarne jedinice, failed/unverified/missing-target ostaju problem uz canonical action. |
| 12–13 | `Links wins multi-service; Review + Menu uses existing splitter; retarget and bulk are atomic/retry safe`. |
| 14–15 | Isti test i `bulk validation checks every selected subject before writes and preserves printed design snapshots`: stari target ostaje, replay ne duplira, foreign/invalid stavka blokira celu transakciju. |
| 16–17 | `placement defaults exclude historical scans and preserve destination attribution`: stari interval i događaji ne prelaze u novi current interval. |
| 18–19 | `digital SMQ works alone then links without changing token, events or previous history`. |
| 20–23 | `dry-run is read-only; migration preserves legacy codes, targets, events and daily metrics`: originalni podaci, nema kopiranja, nema fizičkih jedinica iz nejasnog card-a. Dodatni test reaktivira prethodno disabled legacy kod. |
| 24 | `500 venues and 10,000 physical products paginate under 4 queries/250 documents without N+1`: svih 500 lokala i 10.000 proizvoda kroz više stranica, bez ponovljenih ID-jeva, uz stvarne fixture subject/card/target/channel/inventory redove. |
| 25 | Unauthenticated/non-admin, cross-account/lokal, foreign target/product/link, unsafe URL, nevalidna tranzicija, preveliki batch i drugačiji payload istog ključa. |

Dodatni dokazi:

- Failed provisioning posle delimičnog kreiranja: podtransakcija ne ostavlja ni proizvod ni card; jedan stabilan failure/action ostaje, isti payload može da se oporavi i napravi tačan broj jedinica.
- Source refresh bez skena: deaktiviran service source postaje red, nepromenjen ponovni refresh ne duplira događaje; tek popravljena činjenica vraća validno stanje.
- Migration ownership/code/mapping/SMQ allocation konflikti ostavljaju stabilne razloge, audit i action. Isti konflikt kroz različita vremena ne pravi duplu istoriju.
- Delivery rezerviše konkretan SMF jednom; inactive kanal sprečava kreiranje, naknadna deaktivacija izvora sprečava polazak i čuva draft. Uspešan polazak zahteva ispravljen izvor.
- Print snapshot se ne može tiho promeniti posle proizvodnje; remake koristi baš neuspešne QC jedinice.

Scale fixture je sintetički lokalni dataset namenjen query/pagination budžetu. Order lifecycle je zasebno izvršen kroz stvarne mutation testove. Ovo nije merenje produkcione latencije, cene, OCC-a ili raspodele stvarnih klijenata.

## Komande i ishodi

Komande lokalne provere:

```text
npx.cmd vitest run convex/adminProducts.test.ts convex/adminOrders.test.ts convex/cards.test.ts convex/cardsAdmin.test.ts convex/adminV1.test.ts convex/subscriptions.test.ts convex/adminOperational.test.ts convex/adminTasks.test.ts lib/admin-v1/contracts.test.ts lib/admin-v1/task-time.test.ts
npx.cmd tsc -p convex/tsconfig.json --noEmit
npm.cmd run check
git diff --check
git diff --cached --check
```

Regresioni paket pokriva ADMIN-01/03/04/10/11, cards i cardsAdmin. `npm.cmd run check` uključuje ESLint, produkcioni Next build, namespace gate i golden harness; ne predstavlja ceo Vitest suite.

| Provera | Rezultat |
| --- | --- |
| ADMIN-12 i relevantne regresije | **170/170 testova, 10/10 fajlova**; poslednji paket 30,27 s. ADMIN-12 fajl sadrži 22 testa, uključujući sve gore navedene scenarije. |
| Strogi Convex TypeScript | **PASS**, `npx.cmd tsc -p convex/tsconfig.json --noEmit`. |
| ESLint | **PASS**, nula grešaka; dva postojeća upozorenja van opsega: neiskorišćen `useMemo` u `components/admin/venue-admin.tsx:24` i `price` u `convex/purchaseLifecycle.test.ts:26`. |
| Next produkcioni build | **PASS**, TypeScript i generisanje svih 40 statičkih stranica. |
| Namespace gate | **PASS**, nema ukrštanja Links/Venue/Menu tokena. |
| Golden harness | **PASS**, 177 slučajeva × 2 viewporta byte-for-byte; postojeći Edge, bez instalacije. |
| `git diff --check` | **PASS**, bez whitespace grešaka. |
| Staged pregled | **PASS**, eksplicitnih 17 ADMIN-12 fajlova. Završni `git diff --cached --check` bez grešaka nakon uklanjanja jednog viška praznog reda na kraju novog validators fajla. |

Tokom proširenja scale fixture-a na stvarne card/channel redove prvi setup batch je prekoračio namerno strogi test limit od 250 pročitanih dokumenata zbog dodatnih patch operacija. Setup batch je smanjen sa 200 na 100 jedinica; limit nije povećan. Završni test prolazi sa istim read budžetom i svih 10.000 proizvoda.

Golden harness koristi već instalirani `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, kroz privremeni `NODE_OPTIONS --require` hook van repozitorijuma koji samo prosleđuje `executablePath` postojećem Playwright launch-u. Nije menjan harness, browser podešavanje ili dependency. Node options se vraćaju na prethodnu vrednost po završetku procesa. Prvi pokušaj hook-a nije prošao zbog Windows backslash escaping-a; putanja je ispravljena na forward slash pre izvršenja provera.

## Convex codegen — tačno izvedene operacije

Cilj identifikovan iz lokalne konfiguracije: **dev:perfect-ant-98**. Nije korišćen prod deployment niti deploy key.

1. `npx.cmd convex codegen --component-dir convex --typecheck disable` — neuspešno lokalno bundlovanje zbog rezolucije `convex.config.js`; nije došlo do handshake-a u tom pokušaju.
2. `npx.cmd convex codegen --typecheck disable` — uspešno. CLI je našao komponente, generisao server kod, bundlovao definicije/šeme/funkcije, preuzeo stanje dev deploymenta, **poslao function bundle za analysis handshake** (`Uploading functions to Convex`), pa generisao lokalne TypeScript bindings.

Pregledan je instalirani Convex CLI 1.44 kod: ovaj `codegen` put koristi `startComponentsPushAndCodegen`, ne poziva `finishPush` koji primenjuje deployment. Ovo nije bilo potpuno offline izvršavanje. Nije izvršen `convex deploy`, `convex dev`, seed, migracija, user-data mutation ili reset.

Generator je usput dodao ranije nedostajuće tipove nevezanih modula i Zoho env deklaracije. Uklonjen je isključivo taj novonastali, vanopsežni generated diff; `server.d.ts` je ostao jednak početnom HEAD-u. Commit sadrži samo sedam ADMIN-12 module import/API parova u `api.d.ts`. Izvozi funkcija unutar tih modula zaključuju se iz tipova modula; strogi TypeScript i build proveravaju kasnije lokalne dopune. Nije ponavljan mrežni handshake bez potrebe.

## Operativne granice i neizvršene provere

- Nije izvršena ADMIN-11 ili ADMIN-12 migracija nad stvarnim deploymentom. Sve data mutation provere koriste izolovani `convex-test`.
- Postojeći `/r/[cardCode]` URL/kodovi ostaju kompatibilni preko istog resolvera i adaptera; provereno lokalnim testovima. Produkcioni deployment i stvarni distribuirani kodovi nisu menjani niti testirani skeniranjem uživo.
- Nema novog UI-ja. Golden regresija štiti postojeći renderer; nema tvrdnje o gotovom ADMIN-13 UX-u.
- Nema browser/browser dependency instalacije ili preuzimanja.
- Nema Zoho/ADMIN-09C konfiguracije, stvarnih email čitanja/slanja ili provider integracije.
- PDF nije diran. Nema deploya, seeda, live migracije, reseta, stasha ili push-a.
- Legacy print/QC/delivery podaci bez stvarnog unit mapiranja ne pretvaraju se u izmišljene SMF jedinice. Neophodna je zasebno odobrena provera/mapiranje pre njihovih novih operativnih write radnji.
- Materijalizovane liste osvežavaju ADMIN-12 writer-i i bounded `refreshChannels`; nema background cron-a koji automatski propagira sve izmene drugih domena. Resolver i dispatch uvek rade live validaciju.
- Nisu potvrđeni NFC hardware rad, produkciona latencija, trošak ili live migration rehearsal. Neutralni health/QC seam ne predstavlja hardverski protokol.

**ADMIN-13 nije započet.**
