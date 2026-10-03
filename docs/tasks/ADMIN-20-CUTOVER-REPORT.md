# ADMIN-20 — cutover izveštaj

Status: lokalni cutover i završna verifikacija završeni; produkcioni deploy nije
rađen. Ovaj dokument je napravljen pre prvog brisanja legacy UI fajla, pa zatim
dopunjen dokazima posle implementacije.

Početna grana je `codex/admin-v1`, a last-known-good HEAD je
`7dafc69ba8f37159fec27e6ac52d2419de9bbcc8`. Jedina početna promena je
`output/pdf/scanme-menu-cenovnik-i-projekcija.pdf`; fajl nije čitan i mora ostati
nestage-ovan i van ADMIN-20 commita.

## Cutover pravila

- Canonical ADMIN-V1 putanja je jedini primarni operativni tok.
- Legacy ruta sme da bude server redirect, kompatibilni adapter ili zadržani
  domain/editor tok; ne dobija novi paralelni UI.
- Business ID se ne pretvara u account ID nagađanjem. Postojeći
  `api.admin.location`, iza `requireAdmin`, jedini je dozvoljeni mapper.
- Account-less lokal ostaje na kompatibilnom toku dok kontrolisana migracija ne
  dokaže mapiranje. Nepostojeći/arhivirani lokal i neaktivna usluga daju 404.
- Venue, Memories, editori, klijentski panel i javni renderi nisu legacy samo
  zato što nisu u V1 navbaru.
- Convex adapter ostaje ako je potreban za nemigrirane podatke, migraciju,
  rollback, resolver, editor, HTTP, cron ili javni/client tok.

## Canonical route mapa

| Ruta | Površina / caller | Serverski autoritet | Typed i18n | Odluka | Regresioni dokaz | Rollback posledica |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin` | `AdminDashboardFoundation` u `AdminGuard` + `AdminShell` | `adminDashboardProjection`, `adminActions`, `adminFinance`, `adminTasks`, `adminCommunications`; svi admin read/write ulazi proveravaju `requireAdmin` | `admin-v1` | canonical Dashboard | dashboard projection/auth/scale testovi; browser smoke | Revert vraća prethodni ADMIN-19 Dashboard, bez DB promene. |
| `/admin/klijenti` | `AdminClientsWorkspace` | `adminOperational.listClients`; server filter/sort/cursor | `admin-v1` | canonical | `adminOperational`, clients UI i auth regresije | Revert vraća isti ADMIN-V1 ekran; samo legacy list redirect se uklanja. |
| `/admin/klijenti/[accountId]` | `AdminClientProfileWorkspace` | `adminClientProfiles`; account/venue ID ukrštanje i `requireAdmin` | `admin-v1`, `admin-finance`, `communications` | canonical | profile, foreign venue/account i deep-link testovi | Revert uklanja samo legacy business→account ulaz, ne profil. |
| `/admin/inbox` | `AdminInboxWorkspace` | `adminCommunications` i cursor-paginirane poruke | `communications` | canonical | unauthenticated/non-admin, cursor i message scope testovi | Bez data rollback-a. |
| `/admin/zadaci` | `AdminTasksWorkspace` | `adminTasks` | `admin-tasks` | canonical | task ownership/status/time testovi | Bez data rollback-a. |
| `/admin/operativa/porudzbine` | `AdminOrdersWorkspace` | `adminOrders` | `admin-orders` | canonical | order lifecycle/auth/idempotency testovi | Bez data rollback-a. |
| `/admin/operativa/proizvodi` | `AdminProductsWorkspace` | `adminProducts`, `adminProductReads` | `admin-products` | canonical | 10.000 proizvoda, foreign ID, bulk i cursor testovi | Legacy cards backend ostaje dostupan posle revert-a. |
| `/admin/operativa/qr` | `AdminQrWorkspace` | `adminProducts`, `adminProductReads`, `cards` resolver compatibility | `admin-products` | canonical | channel/auth/legacy resolver testovi | Resolver i istorija nisu menjani. |
| `/admin/usluge/links` | `AdminServiceOperations` | `adminServiceOperations`; Links editor/public domen ostaje odvojen | `admin-services` | canonical operativni wrapper | service operations + Links editor/public golden regresije | Editor/public kod nije predmet revert-a. |
| `/admin/usluge/review` | `AdminServiceOperations` | `adminServiceOperations`; Review destinacija i client tok ostaju domen | `admin-services` | canonical operativni wrapper | service operations i Review regresije | Domen ostaje. |
| `/admin/usluge/meni` | `AdminServiceOperations` | `adminServiceOperations`; Meni editor/public/import domen ostaje odvojen | `admin-services` | canonical operativni wrapper | service operations + Menu admin/editor/public regresije | Domen ostaje. |
| `/admin/finansije` | `FinanceSurface` | `adminFinance` | `admin-finance` | canonical | cash-basis, incomplete trošak, cursor i auth testovi | Projekcije/source redovi nisu menjani. |
| `/admin/tim` | `AdminTeamWorkspace` | `adminTasks.teamOverview` i komunikacioni read model | `admin-team` | canonical | bounded 3-admin/121+121 test i link regresije | Bez data rollback-a. |
| `/admin/podesavanja` | `AdminSettingsWorkspace` | `adminSettings` | `admin-settings` | canonical | writer/auth/idempotency i dirty-guard testovi | Bez data rollback-a. |
| `/admin/pretraga` | `AdminSearchWorkspace` | `adminGlobalSearch`, `adminActivity` | `admin-search` | canonical | exact code/scope/cursor/PII testovi | Backfill runbook ostaje netaknut. |
| `/admin/debug/[contextId]` | `AdminDebugSupport` | `adminDebug` opaque kontekst, admin ownership | `admin-search` | canonical support putanja | drugi admin/istekao/forged context testovi | Bez data rollback-a. |

`/admin/login` je auth ulaz, ne paralelni admin ekran. Proxy štiti `/admin` i
sve pod-rute pre rendera; svaki Convex ADMIN read/write ponovo proverava
`requireAdmin`. `AdminGuard` daje loading, neprijavljen i permission-denied state.

## Legacy rute i redirect odluke

| Legacy ruta | Trenutni caller / stanje pre ADMIN-20 | Cilj | Odluka | Dokaz | Regresioni test | Rollback posledica |
| --- | --- | --- | --- | --- | --- | --- |
| `/admin/customers` | Direktno renderuje `CustomersAdmin` listu | `/admin/klijenti` | redirect; query se čuva | Nova clients lista je canonical, paginirana i auth-gated. | cutover helper + build + browser redirect | Revert vraća legacy listu. |
| `/admin/customers/[businessId]` | `LocationAdmin` po legacy business ID-ju | `/admin/klijenti/[accountId]?section=venues&venue=...` | server-side mapiran redirect za lokal sa account-om; account-less ostaje retained compatibility path; missing/archived je 404 | `api.admin.location` vraća stvarni `account.id` iza `requireAdmin`; nema parsiranja ili izmišljanja ID-ja. | `convex/admin.test.ts`, cutover helper, browser mapped/404/back | Revert vraća stari location UI za sve lokale. |
| `/admin/customers/[businessId]/links` | Legacy per-location hub | `/admin/usluge/links?profile=...` | server-side redirect samo za aktivan, mapiran profil; account-less compatibility ostaje | `api.admin.location.services` daje profil i aktivnost. | helper + service auth + browser deep link | Revert vraća hub. |
| `/admin/customers/[businessId]/review` | Legacy per-location hub | `/admin/usluge/review?profile=...` | isto kao Links | Server-authoritative profil; neaktivno je 404. | helper + service auth + browser | Revert vraća hub. |
| `/admin/customers/[businessId]/venue` | Stvarni Venue domain hub | nema V1 Venue modula | retained domain path | Venue je POSLE V1 i postoje realni public/editor/provisioning tokovi. | Venue admin/editor/public regresije | Nema promene. |
| `/admin/customers/[businessId]/menu` | Stvarni Meni concierge/import/publish tok | `/admin/usluge/meni` je operativni pregled, ali nije zamena za concierge/editor | retained domain path | `MenuAdminSubpage` i dev preview imaju stvarne callere; domen nije potpuno zamenjen. | Menu admin/editor/public regresije | Nema promene. |
| `/admin/cards` | `CardsAdmin` globalni legacy UI | `/admin/operativa/qr` | redirect; backend compatibility ostaje | §3 spaja stari modul u Proizvodi/QR; canonical QR tok postoji. | cutover helper, cards/resolver i browser redirect | Revert vraća legacy UI; DB nije menjana. |
| `/admin/scanme-links` | Već redirectuje, ali gubi query | `/admin/usluge/links` | redirect uz očuvanje svih query vrednosti | Activation email i stari bookmark caller postoje. | repeated-query helper + browser redirect | Revert vraća redirect bez query konteksta. |
| `/admin/google-reviews` | Već redirectuje | `/admin/usluge/review` | redirect uz query preservation | Canonical Review operativa postoji. | helper + browser | Bez DB posledice. |
| `/admin/page` | Već redirectuje | `/admin/usluge/meni` | redirect uz query preservation | Canonical Meni operativa postoji. | helper + browser | Bez DB posledice. |
| `/admin/scanme-links/[businessId]/editor` | `ScanMeLinksEditorScreen` | isti editor | retained domain/editor path | Isti editor koriste javni slug editor i admin deep link; autosave/publish/public preview nisu zamenjeni. | Links editor + golden harness | Ne dirati. |
| `/admin/venue` | `ScanMeVenueAdmin` | isti Venue domen | retained domain path, van V1 navigacije | Stvarni provisioning caller i POSLE V1 domen. | Venue testovi + browser smoke | Ne dirati. |
| `/admin/memories` | `ScanMeMemoriesAdmin` | isti Memories domen | retained domain path, van V1 navigacije | Stvarni celebration/partnership/space caller i POSLE V1 domen. | Memories testovi + browser smoke | Ne dirati. |

## Legacy UI i adapter inventar pre brisanja

| Stavka | Statički / route / preview caller | Deljeni tok | Odluka pre uklanjanja | Dokaz i rollback |
| --- | --- | --- | --- | --- |
| `components/admin/customers-admin.tsx` + CSS | `/admin/customers`; `app/dev/customers-preview` | Nema editor/public/domain caller | removable UI posle redirecta; ukloniti i isključivo legacy preview | Canonical Klijenti/Profil/Finansije/Usluge pokrivaju aktivni operativni tok; revert vraća fajlove. |
| `components/admin/cards-admin.tsx` + `cards/card-qr.tsx` | samo `/admin/cards` | Nema javni resolver caller; koristi backend koji resolver deli | removable UI posle redirecta; backend ostaje | Canonical Products/QR postoji; `cardsAdmin` ostaje zbog nemigriranih kartica i rollback-a. |
| `components/admin/scanme-links-admin.tsx` | nema route, preview, test ni dynamic import caller | Links editor/public koristi druge fajlove | removable UI | `/admin/scanme-links` već koristi canonical wrapper; editor/public su odvojeni i netaknuti. |
| `components/admin/google-reviews-admin.tsx` | nema route, preview, test ni dynamic import caller | Review domen koristi Convex i client-panel, ne ovaj fajl | removable UI | Canonical Review wrapper postoji; domen ostaje. |
| `components/admin/poc-access-panel.tsx` | samo dva prethodna legacy UI-ja | nema drugog callera | removable adapter/UI primitive | Caller audit je zatvoren; revert vraća. |
| `components/admin/create-business-popover.tsx` | samo dva prethodna legacy UI-ja i `poc-access-panel` | nema canonical/editor/public caller | removable route-only primitive; kreiranje naloga/lokala ostaje eksplicitno deferred, ne fabrikovano | Uklanjanje ne gasi aktivnu rutu jer caller već ne postoji; backend `admin.createBusiness` ostaje za compatibility/test/rollback. |
| `components/admin/location-admin.tsx` | legacy business/detail rute | Venue i Meni domain tokovi | retained compatibility/domain path | Account-less, Venue i Meni nisu potpuno zamenjeni. |
| `components/admin/menu-admin-subpage.tsx` | `LocationAdmin` + dev preview | Meni import/publish/export | retained domain path | Stvarni caller i funkcionalni domen. |
| `components/admin/scanme-links-editor*` | admin i slug editor, dev preview, analytics panel | javni Links renderer | retained domain/editor path | Byte-frozen/golden granica. |
| `components/admin/venue-admin.tsx` | `/admin/venue` | Venue domain | retained domain path | POSLE V1, stvarni provisioning. |
| `components/admin/memories-admin.tsx` | `/admin/memories` | Memories domain | retained domain path | POSLE V1, stvarni provisioning. |
| `admin-customers` typed namespace | legacy Customers UI + preview | nema backend caller | removable kada oba UI callera nestanu | Type registry/import audit i TypeScript. |
| `cards-admin` typed namespace | legacy UI **i** `convex/cardsAdmin.ts` preko `getDict` | backend compatibility poruke | retained | I18n namespace i dalje ima stvarni server caller. |

Nema pronađenog dinamičkog importa za uklonjive UI fajlove. Uklonjivi fajlovi
nisu caller nijednog testa osim dev preview fixture-a; odgovarajući novi
canonical tokovi imaju sopstvene ADMIN testove.

Planirane odluke iz tabele su izvršene. Uklonjeni su legacy Customers, Cards,
ScanMe Links i Google Reviews admin renderi, dva pomoćna POC/create UI-ja,
`CardQr`, legacy Customers CSS, njegov dev preview i `admin-customers` typed
namespace. Zadržani su `LocationAdmin`, Venue, Memories, Meni, Links editor,
`cardsAdmin` backend i `cards-admin` rečnik, tačno prema caller/rollback mapi.

## Convex javne/interne funkcije i compatibility odluke

| Funkcije / adapter | Caller / podaci | Odluka | Razlog |
| --- | --- | --- | --- |
| `admin.me` | `AdminGuard`, `AdminShell`, auth discovery | canonical | Server-derived identitet; ne vraća ADMIN podatke bez auth-a. |
| `admin.customers`, legacy billing read/write i `admin.setServiceProfileActive` | legacy/rollback testovi i nemigrirani account model | deferred/retained compatibility | Live dokaz da su svi nalozi migrirani nije dozvoljen u ADMIN-20. |
| `admin.location` | server cutover mapper + account-less/Venue/Meni compatibility | retained compatibility adapter | Jedino pouzdano business→account/service mapiranje iza `requireAdmin`. |
| `admin.createBusiness` i stari business/contact writer-i | istorijski setup/test/rollback; novi create flow nije kompletan | explicit deferred | Ne uklanjati backend niti izmišljati novu V1 funkciju u cutover fazi. |
| `cardsAdmin.*` | unmapped card writers/readers i compatibility testovi | retained compatibility adapter | ADMIN-12 runbook zahteva stari resolver/writer granicu dok deployment migracija nije dokazana. |
| `cards.resolveAndRecord` i `/r/[cardCode]` | javni route handler i distribuirani kodovi | retained domain/public | Kritični javni resolver; canonical i legacy mapping dele isti URL. |
| `scanMeLinks.*` | editor, public resolver, click HTTP route, client editing | retained domain/public | Admin wrapper nije zamena za editor/public API. |
| `adminServiceOperations.*` | tri canonical uslužne rute | canonical | Bounded, admin-only V1 read/write površina. |
| `venueAdmin.*`, `venue.*` | `/admin/venue`, editor/public, client panel i cron | retained domain | POSLE V1 domen sa realnim callerima. |
| `memoriesAdmin.*`, `memories.*` | `/admin/memories`, guest/client/public i više cronova | retained domain | POSLE V1 domen sa realnim callerima. |
| `menuAdmin.*`, `menu.*`, `menuExport.*` | Meni concierge/editor/public/export i cron | retained domain | Canonical wrapper nije zamena za uređivanje/publish/export. |
| `subscriptionMigrations.*`, `adminAccessMigrations.*`, `adminFinance.backfill*`, `adminGlobalSearch.backfill*`, `adminActivity.backfill` | kontrolisani dry-run/cursor runbook i rollback | retained migration | Live migration/backfill je izričito van opsega; uklanjanje bi ukinulo kasniji kontrolisani rollout. |
| `billing.sweepBillingCycles` | cron nad legacy nalozima | retained compatibility | Migrirani nalozi su isključeni, legacy nalozi i dalje zahtevaju sweep. |

`convex/http.ts` registruje samo auth HTTP rute. Nije pronađen legacy admin
webhook caller. Cronovi ostaju netaknuti: subscription, entitlement,
Venue/Memories, ordering, legacy billing i Meni cleanup imaju stvarne domain ili
compatibility razloge.

## Sačuvani javni/client tokovi

| Tok | Deljeni kod / backend | Odluka | Regresija |
| --- | --- | --- | --- |
| ScanMe Links operativa | `adminServiceOperations` | canonical | service tests/browser |
| ScanMe Links editor | `scanme-links-editor*`, `scanMeLinks.*` | retained | editor test/smoke |
| ScanMe Links public | `components/scanme-links/**`, resolver/click route | retained, byte-frozen | golden 177 × 2 |
| Google Review operativa | `adminServiceOperations` | canonical | service tests/browser |
| Review public/client | `dynamicLinks`, client panel | retained | redirect/client regression |
| Meni operativa | `adminServiceOperations` | canonical | service tests/browser |
| Meni concierge/editor/public | `menu-admin-subpage`, `components/menu/**`, `menu*` | retained domain | menu tests/golden/browser |
| Klijentski panel i panel-chat | `components/client-panel/**`, `adminCommunications` client scope | retained | client panel/chat auth tests |
| `/r/[cardCode]` | `cards.resolveAndRecord`, canonical adapter | retained | cards/cardsAdmin/adminProducts tests |
| Venue | admin/editor/public/client/cron | retained | Venue suite/browser |
| Memories | admin/guest/client/wall/export/cron | retained | Memories suite/browser |

## §3 closure tabela

| §3 stavka | Status za ADMIN-20 | Putanja / dokaz |
| --- | --- | --- |
| Admin autentikacija i serverski `requireAdmin` | zadržano | `proxy.ts`, `AdminGuard`, `convex/lib/access.ts`, auth negativni testovi |
| Login/logout/browser/session praćenje | ostvareno kao odbačeno | Nema ADMIN-V1 employee/session modula; activity projekcija odbija te podatke. |
| `/admin` preusmerava na Links | ostvareno kao uklonjeno | `/admin` je Dashboard. |
| Stari horizontalni navbar | ostvareno kao uklonjeno | `AdminShell` koristi canonical `ADMIN_NAV_ITEMS`. |
| `account -> businesses` | zadržano i UI preimenovano | Klijenti → lokali, SMK/SML read modeli. |
| Legacy business bez `accountId` | eksplicitno odloženo | Zadržani compatibility detail; live migracija nije dozvoljena. |
| Kreiranje lokala iz Review modula | spojeno u klasifikaciji, izvršenje novog create toka odloženo | Legacy route nema primarni caller; backend ostaje; nema izmišljenog V1 create UI-ja. |
| CRUD kontakata i pozivnice | redizajnirano | Profil klijenta account kontakti; legacy business writer-i ostaju rollback compatibility. |
| `viewer` članstvo po lokalu | redizajnirano | `accountMemberships` role/capability + negativni testovi; legacy membership ostaje compatibility. |
| Tabela Korisnici | redizajnirano | `/admin/klijenti` + profil. |
| Direktno „Otvori lokal“ | spojeno | Canonical row/profile navigation; legacy list se uklanja. |
| Service activation boolean | redizajnirano | `adminServiceOperations` + subscription lifecycle. |
| Service activation requests | spojeno | Dashboard/action items/Inbox; stari email query se čuva kroz redirect. |
| Links editor/objava/public/analitika | zadržano | Editor i javni render nisu menjani. |
| Review destinacija/slug/skenovi/aktivacija | zadržano | Canonical wrapper + domain/client/backend compatibility. |
| Meni admin/uvoz/objava/izvoz | zadržano | Canonical wrapper + retained concierge/editor/public. |
| Venue i Memories admin | zadržano kao POSLE V1 domain path | Van navbar-a, kod i rute ostaju. |
| Cards kod/resolver/skenovi/target history | zadržano | `/r`, cards adapteri i istorija ostaju. |
| Stari globalni Kartice modul | bezbedno redirectovano / UI uklonjeno | `/admin/cards` → `/admin/operativa/qr`; backend compatibility ostaje. |
| `cards.status` | redizajnirano | `accessChannels` state/health/reason/history. |
| Order snapshot cene | zadržano | ADMIN-11/14 testovi. |
| Više `orderItems` | zadržano | ADMIN-11 operativni model/testovi. |
| Legacy order statusi | redizajnirano | payment/design/fulfillment ose. |
| Jedan account billing ciklus | odbačeno kao cilj, compatibility zadržan | `subscriptions`/allocations; legacy sweep samo za nemigrirane naloge. |
| Istorija uplata bez brisanja | zadržano/prošireno | Finansije, adjustments i audit. |
| `setNextBillingAt` na nalogu | redizajnirano, legacy writer deferred | pojedinačne pretplate; live narrow nije odobren. |
| Audit ko/šta/kada | zadržano/prošireno | unified activity i typed domain audit. |
| Theme toggle | zadržano | `AdminShell`. |
| Stari lokalni sidebar | redizajnirano; compatibility verzija retained samo gde nema bezbednog cutover-a | Profil klijenta venues sekcija; account-less/Venue/Meni compatibility. |

## Auth, dead-link, i18n i bundle plan

- Legacy dynamic mapper prvo proverava session token i `admin.me`, zatim zove
  `admin.location`; URL parametar sam ne daje account/venue pristup.
- Login dobija samo validan same-origin `/admin...` povratak; spoljašnji URL,
  protocol-relative URL i `/admin/login` petlja padaju na `/admin`.
- Redirect query se gradi kroz `URLSearchParams`, uključujući ponovljene vrednosti.
- Navbar, Dashboard, Tim, klijent, Inbox, task, order, product, QR/NFC,
  finance i service linkovi provereni su source auditom, testovima i browserom.
  Preostali legacy URL caller-i su namerni redirect/editor/compatibility ulazi,
  ne dead linkovi.
- `admin-customers` namespace je uklonjen tek sa poslednjim callerom;
  `cards-admin` ostaje zbog `convex/cardsAdmin.ts` caller-a.
- Produkcioni build i pretraga izvršnih `.next` JS chunkova potvrđuju da
  uklonjivi legacy UI nije u admin bundle-u. Source map pogodak `CardsAdmin`
  pripada zadržanom `CardsAdminDict`, ne obrisanom UI-ju. Nije dodat dependency.

## Rollback runbook

ADMIN-20 će biti jedan lokalni commit. Povratak se radi standardno, bez
resetovanja istorije:

```powershell
git revert <ADMIN-20-commit>
```

Pre revert-a proveriti da je worktree čist osim zaštićenog PDF-a. Posle revert-a
proveriti `/admin`, `/admin/customers`, `/admin/cards`, `/admin/scanme-links`,
`/admin/google-reviews`, `/admin/page`, jedan Links editor, `/r/<test-code>`,
`/admin/venue` i `/admin/memories`, pa pokrenuti ciljane testove i
`npm.cmd run check`.

Rollback ne zahteva DB rollback: ADMIN-20 ne menja schemu, deployment podatke,
environment, seed, migraciju ili backfill. Revert vraća samo rute, UI source,
typed i18n registraciju, testove i ovaj izveštaj.

## Završna verifikacija

### Auth i Convex pregled

- Auth osnova postoji: Convex Auth provider i postojeći users/auth model; nije
  dodat paralelni identity helper.
- TypeScript AST audit javnih `convex/admin*.ts` exporta: 135 admin-guarded,
  2 `requireClientVenueAccess` client-scope query-ja, 1 ograničeni
  auth-discovery (`admin.me`) i 0 neklasifikovanih.
- Četiri deterministička authz oblika pregledana su na svim non-test Convex
  fajlovima. ADMIN kandidati su zaštićeni kroz `requireAdmin`, provereni scope
  helper ili owned debug context; `accountId`/`businessId` nisu actor identitet.
- Reviewer scan nije našao novu ADMIN-20 auth, validator, unbounded `collect`,
  scheduler-to-public ili bundle regresiju. Postojeći bounded projection
  `.filter` i legacy query-clock obrasci predate ovaj cutover i nisu proširivani
  u removal fazi.
- Convex source nije menjan, pa codegen nije bio potreban i nijedna deployment
  komanda nije pokrenuta.

### Komande i rezultati

| Komanda / dokaz | Rezultat |
| --- | --- |
| Ciljani cutover/navigation/location/service/cards/products testovi | 49/49 prolazi; završni čisti cutover/navigation/subpage izbor prolazi 10/10. |
| `npm.cmd test` | 125 fajlova prolazi, 2 preskočena; 1.232 testa prolaze, 2 preskočena. Početni rezultat je posebno reprodukovan sa isključenim ADMIN-20 testovima: 1.227 prolazi, 2 preskočena. ADMIN-20 dodaje tačno 5 sakupljenih testova: 3 u `lib/admin-v1/cutover.test.ts` i 2 u `components/admin/subpage-keys.test.tsx`; nijedan prethodni test nije uklonjen. |
| `npx.cmd tsc -p convex/tsconfig.json --noEmit` | Prolazi. |
| `npm.cmd run check` | Prolazi: lint bez grešaka, Next 16.2.12 production build + TypeScript, namespace gate i 177 golden slučajeva × 2 viewporta. Ostaju 2 ranija lint upozorenja (`venue-admin.tsx`, `purchaseLifecycle.test.ts`). |
| `npx.cmd tsc --noEmit` dijagnostika | Nije repo gejt; prijavljuje postojeće test-only tipove u adminFinance/adminOperational/adminProducts/adminV1/checkout/email/subscription/Memories testovima. Production Next i Convex typecheck su zeleni. |
| `git diff --check` | Prolazi. |
| Bundle/caller audit | Nema obrisanog UI simbola u izvršnim `.next` JS chunkovima i nema preostalog source importa obrisanih fajlova. |

### Browser i responsive smoke

Korišćeni su postojeći Opera i Codex in-app browser kroz Computer Use; nije
instaliran browser, Playwright binary, dependency ili CLI. Dev fixture-i
renderuju iste produkcione ADMIN komponente, jasno su označeni kao
neprodukcijski i u production serveru vraćaju 404.

| Viewport | Provereno | Rezultat |
| --- | --- | --- |
| 1920×1080 | Dashboard hijerarhija, action queue, metric instrumenti i kontrole | Bez horizontalnog overflow-a; vidljive kontrole nisu ispod 40 px. |
| 1440×1000 | Svih 15 ADMIN-V1 preview površina, uključujući Links/Review/Meni | Svaka ruta ima očekivani H1 i nema page overflow-a; service detail linkovi vode na canonical Products/QR putanje. |
| 390×844 | Svih 15 površina, mobile liste, filteri i service bottom Sheet | Nema page overflow-a. Service tab/filter touch mete su 44 px; Escape zatvara Sheet i vraća fokus na izabrani lokal. |
| 375×812 | Dashboard i kompletna mobile navigacija | Meni sadrži samo canonical Dashboard/Klijenti/Inbox/Zadaci/Operativa/Usluge/Finansije/Tim plus Pretragu/Podešavanja; nema legacy Cards/Customers stavki ni overflow-a. |

Dodatno:

- Neprijavljeni ulazi iz svake relevantne grupe (`customers`, `cards`, Links,
  Review, Meni, dinamički customer, Venue, Memories i Links editor) vode na
  login i čuvaju tačan path i query u `returnTo`; ponovljeni query parametri,
  open-redirect i login-loop vrednosti dodatno su pokriveni unit testom.
- Retained tokovi `/dev/mobile-editor`, `/dev/client-chat-preview`, Meni
  admin/editor/public, Venue, Memories upload i Wall renderovani su bez
  horizontalnog overflow-a. Back, forward i refresh između Dashboard-a i
  service preview-a čuvaju očekivanu rutu, query i H1.
- `/dev/admin-services-preview` i uklonjeni `/dev/customers-preview` daju 404 na
  lokalnom production serveru.
- Browser console nema warning/error zapise posle dev i production smoke-a.
- Runtime CSS audit nalazi 8 `prefers-reduced-motion` media pravila, uključujući
  `reduce` i `no-preference`; source audit potvrđuje globalna i ADMIN
  `motion-reduce` pravila. Postojeća focus/keyboard infrastruktura ostala je
  netaknuta; novi kontrolisani Sheet dobio je eksplicitan focus return.

### Granice izvršenja

Nije rađen deploy, push, seed, reset, live migration/backfill, env promena,
provider/Zoho/mail integracija ili instalacija. Zaštićeni
`output/pdf/scanme-menu-cenovnik-i-projekcija.pdf` nije čitan, menjan ili stage-ovan.
