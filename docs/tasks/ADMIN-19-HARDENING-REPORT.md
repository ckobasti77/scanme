# ADMIN-19 — hardening izveštaj

Status: implementirano i provereno pre lokalnog scope-only commita. ADMIN-20,
Zoho/ADMIN-09C, mailbox, deploy, live migracija/backfill, seed/reset, produkcioni
podaci i environment vrednosti nisu bili deo rada.

Početno stanje: grana `codex/admin-v1`, HEAD
`5b448e66776c02b0fb7e82409cc66eafb4641d88`. Jedini početni untracked fajl je
`output/pdf/scanme-menu-cenovnik-i-projekcija.pdf`; ostao je van ADMIN-19
staginga i commita.

## Hardening matrica

| Površina / tok | Očekivano ponašanje | Nalaz | Dokaz | Minimalna popravka | Test / verifikacija | Preostali rizik / eksplicitno odlaganje |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard — `Za reakciju`, Sve/Moje i KPI rollup | Bez join-a po redu; mali broj bounded server read-ova | Jedan `adminClientReadModels` query po reakciji i zaseban query po metric redu | Početni `Promise.all(selected.map(...))`; strict test sa 12 reakcija | Uklonjen per-row hydration; postojeći opis/SMF referenca ostaju pošten kontekst. Svi metric redovi scope-a čitaju se jednim bounded prefix query-jem, najviše 32 reda. | `convex/adminDashboard.test.ts` prolazi sa limitom 4 DB query-ja / 250 dokumenata. | Istorijska reakcija bez opisa/koda nema izmišljeno ime klijenta. Live backfill nije rađen. |
| Tim — operativno opterećenje | Nema task/conversation query-ja za svakog člana tima | Tri domain query-ja po članu (`open`, `overdue`, `conversations`) | Audit `teamOverview` putanje | Dva globalna indeksirana izvora čitaju po najviše 121 red, server ih grupiše po članu i prikazuje postojeći `countsCapped` ako izvor pređe 120. Trenutni admin se ponovo koristi bez dodatnog lookup-a. | `convex/adminTasks.test.ts`: tri admina, 121 zadatak + 121 razgovor, 250-document limit; 120/120 vidljivih i `countsCapped: true`. | Konfigurisani admin-directory lookup ostaje ograničen na najviše 20 emailova; to nije per-row poslovni join. |
| Inbox — istorija razgovora | Najnovija stranica odmah; starije poruke pravim cursorom | `getConversation` je trajno sekao istoriju na 100 redova | Početni `take(101)` i samo `messagesCapped` upozorenje | Detail sada čita samo metapodatke; novi admin-only `listMessages` koristi indeks, cursor i limit 50. UI učitava stranice i prikazuje ih hronološki. | Fixture 137 poruka: 37 po stranici, ponovljen cursor je stabilan, bez skip/overlap; unauthenticated/non-admin odbijeni; invalid cursor odbijen, retry prve stranice stabilan; obrisan razgovor daje not-found. | Provider/raw email istorija nije predmet ADMIN-19; ADMIN-09C nije aktiviran. |
| Podešavanja — cena, ugovor, waiver, referral | Jedan submit po nameri; svaki draft zaštićen pri promeni taba/navigaciji | Pod-forme nisu imale sinhroni pending lock; nested draft i promenjeni select mogli su nestati bez upozorenja | Pregled četiri writer forme i ručni dev-preview tok | Zajednički synchronous ref lock, disabled stanje, objedinjeni dirty signal, tab/same-origin/beforeunload guard i čišćenje samo posle uspeha. | UI contract test; browser: promena `Vrsta nagrade` prikazuje `Nesačuvane izmene`, Escape zatvara modal i vraća fokus na `Opšte`. | Tekst browser `beforeunload` dijaloga kontroliše browser. |
| Proizvodi — multi-select i bulk | Eksplicitni ID-jevi, izbor opstaje kroz append stranice, nema skrivenog scope-a ili double-submit-a | Prvi checkbox je odmah otvarao Sheet, pa pravi multi-select nije bio moguć; filter je mogao ostaviti skrivene ID-jeve; submit nije imao synchronous lock | Browser reprodukcija u production komponenti sa dev fixture-om | Eksplicitna selection traka sa typed i18n copy-jem; Sheet se otvara tek akcijom; filter briše izbor; synchronous submit lock; Escape/focus return za nested Dialog i Sheet. | Pure UI selection test kroz appended stranicu, source contract za lock/filter reset i browser: dva proizvoda, bulk Sheet, nested confirm, Escape/focus return, filter reset. Backend bulk auth/scope/idempotency regresije prolaze. | Nema `select all database`; maksimum ostaje 50 eksplicitnih ID-jeva. |
| 50 klijenata / 500 lokala / 10.000 proizvoda | Server filter/sort/cursor; stabilne stranice; bez N+1 | Postojao je 500/10.000 fixture sa jednim nalogom i bez eksplicitnog selection testa | `adminOperational` i `adminProducts` scale testovi | Fixture proširen na 50 naloga; 500 lokala raspoređeno po nalozima; 10.000 read-model redova; zaseban kanonski product fixture ima 10.000 fizičkih proizvoda, 5.000 QR i 5.000 NFC kanala. | Exact count 50/500/10.000; ponovljena prva stranica; cursor bez duplikata; problem filter; tail SMQ search; 5.000/5.000 channel cursor count; strict 4 query/250 document limiti na glavnim paginiranim čitanjima. | Ovo nije produkciono merenje latencije ili cene. |
| Finansije | Velika istorija ostaje cursor-paginirana | Bez funkcionalnog nalaza | Postojeći 75-payment fixture i `listPayments` | Bez produkcione promene | ADMIN-14 regresije: bounded backfill fixture i 17-redne stranice daju tačno 75 jedinstvenih uplata. | Live data i provider nisu dirani. |
| Unified activity/audit | Stabilan cursor, server filteri, bez privatnog payload-a | Postojeći test je imao mali skup | `adminActivity.list` i ADMIN-18 projekcija | Samo test proširen na 275 redova | Ponovljena prva stranica, sve cursor stranice bez duplikata, unauthenticated/non-admin odbijeni; postojeći PII assertion ostaje zelen. | Live backfill nije pokrenut. |
| Klijenti presentation test | Pun Vitest mora biti zelen | Dva početna pada zbog `useRouter` bez App Router konteksta | Početni `npm.cmd test` | Minimalni Next router i Convex hook mock samo u testu | Ciljani test i pun paket prolaze. | Nema produkcione promene ponašanja. |
| Authorization i scope | ADMIN writer/read server-side štiti `requireAdmin`; client putanja server-derived identity/scope | Nije pronađena nova authz rupa | TypeScript AST audit javnih `convex/admin*.ts` exporta: 135 admin-guarded, 2 client-scope, 1 auth-discovery (`admin.me`), 0 neklasifikovanih | Bez preventivnog auth refaktora | Puni i ciljani testovi pokrivaju unauthenticated, non-admin, cross-account, cross-venue, capability, foreign valid ID, forged browser identity i debug context ownership. | Audit je statički + testni, nije eksterni penetration test. |
| Loading / empty / error / retry / denied / not-found | Iskrena stanja, retry bez duple mutacije, draft ostaje kada writer padne | Više error boundary-ja nije nudilo retry | Source pregled i dev failure preview-i | `AdminErrorState` dobio typed retry; dodat u profile, Inbox, Tasks, Orders, Products, QR, Finance, Services, Team i Settings. Writer greške ostavljaju modal/draft otvoren. | Browser loading/empty/error/retry za Klijente i ADMIN-18; Inbox invalid cursor/not-found test; permission testovi; console čist. | Boundary retry radi reload tek posle render greške; ne glumi nastavak neuspele mutacije. |
| Link / Back / refresh | URL čuva kanonski section/venue/product kontekst | Dev profile fixture je menjao URL na drugi lokal, ali je prikazivao prvi | Browser deep-link/refresh reprodukcija | Dev-only fixture sada bira odgovarajući canonical detail; production ugovor nije promenjen | `?section=venues&venue=fixture-venue-2` ostaje posle refresh-a; `Proizvodi` dodaje section; stvarni browser Back vraća isti venue detail. | Fixture je jasno neprodukcijski i production build ga ne koristi kao fallback. |
| Mobile controls, kontrast i overflow | Primarne kontrole ≥44 px gde je primenljivo; čitljiv muted tekst; nema horizontalnog page overflow-a | Inbox kontrole i product view toggle bili su 32–36 px; light muted tekst je imao 4,37:1 | Browser measurement na dev preview-ima | Kritične kontrole podignute na 44 px; light `--admin-text-muted` promenjen `#656a68` → `#5f6462` | Posle popravke: light muted 4,79:1, dark muted 7,81:1; mobile `scrollWidth === clientWidth`; statusi imaju tekst. | Nema tvrdnje o formalnom WCAG sertifikatu ili owner sign-off-u. |
| Keyboard, Dialog/Sheet, reduced motion | Logičan focus, Escape i focus return; bez hover-only značenja | Focus return je bio nestabilan kroz nested product confirm i Settings leave dijalog | Browser tastatura + AX tree | Focus se vraća tek kada modal izađe iz DOM-a; Radix focus trap ostaje samo u otvorenom modalu; postojeće `motion-reduce` i globalni reduced-motion CSS ostaju aktivni. | Browser potvrđen Escape/focus return za Inbox manual dialog, Settings Stay/Escape, product confirm/Sheet; accessible names/states vidljivi u AX stablu. | Reduced-motion je source/browser capability provera, ne zaseban screen-reader ili OS assistive-tech sertifikat. |

## Scale i bounded-read dokaz

- `adminOperational`: 50 naloga, 500 lokala i 10.000 product read-model redova;
  serverski name/status filter, stable cursor i exact tail SMQ search.
- `adminProducts`: 500 lokala, 10.000 kanonskih fizičkih proizvoda i 10.000
  fizičkih kanala (5.000 QR + 5.000 NFC); inventory i channel list su indexed i
  cursor-paginirani.
- Dashboard reaction stranica prolazi sa 12 reakcija pod limitom 4 DB query-ja
  i 250 pročitanih dokumenata.
- Inbox prolazi sa 137 poruka pod istim 4/250 transaction limitom.
- Tim više nema query petlju po članu: dva domain izvora čitaju ukupno najviše
  242 reda, a test sa auth/directory lookup-om ostaje ispod 250 dokumenata.
- Finansije imaju 75 uplata kroz stranice od 17; activity ima 275 događaja kroz
  stranice od 41. Nema duplikata ili preskočenih redova.

Audit glavnih ADMIN list putanja nije našao neograničen `.collect()`,
`.collect().length`, `take(200)` kao zamenu za paginaciju niti preostali
per-row business join. Preostali `Promise.all` pozivi u detail/writer putanjama
rade nad eksplicitno ograničenim skupovima i nisu list-row fan-out.

## Authorization i data scope

- Sve javne ADMIN funkcije u `convex/admin*.ts` su direktno ili kroz provereni
  helper iza `requireAdmin`.
- `admin.me` je namerni auth-discovery query: izvodi identitet server-side preko
  `getAuthUserId` i ne vraća ADMIN podatke.
- Dve client funkcije u ADMIN product modulu koriste
  `requireClientVenueAccess`; ne prihvataju actor/admin identitet iz browsera.
- `accountId`, `businessId`, subject/product/channel i support context se ponovo
  ukrštaju na serveru. ADMIN-18 testovi dokazuju da drugi admin ne preuzima tuđ
  opaque debug context i da debug ne menja client membership.
- Search/audit/debug testovi odbijaju privatno telo poruke, token, cookie,
  session/device/login/IP podatke iz projekcije.

## Browser i accessibility QA

Korišćen je samo Codex in-app browser sa dev-only rutama koje renderuju iste
production komponente. Nije instaliran ili preuzet browser, binary, Playwright
browser, paket, dependency ili CLI.

| Viewport | Provereno | Rezultat |
| --- | --- | --- |
| 1920×1080 | Dashboard density, reakcije, kontrole i page width | Bez horizontalnog overflow-a; nema kratkih primarnih kontrola. |
| 1440×1000 | Dashboard, Inbox list/detail/manual dialog, Products multi-select/bulk | Stabilan desktop layout; Escape i focus return; nema overflow-a. |
| 390×844 | Dashboard, Inbox send/status/assign/manual, Settings tabs/draft guard | Kartice/fokusirani detalji; kritične kontrole 44 px; bez overflow-a. |
| 375×812 | Products venue/inventory/filter/view/bulk i nested confirm | Bez overflow-a; view toggle 44 px; selekcija i focus return ispravni. |

Dodatno je provereno:

- Klijenti loading, empty i error/retry; ADMIN-18 error/retry.
- Profile deep-link, refresh i pravi browser Back sa drugim lokalom.
- Promena product filtera briše skrivenu selekciju.
- Promena Settings selecta aktivira dirty guard; Escape vraća fokus na okidač.
- Light/dark kontrast vrednosti, tekstualne statusne oznake i AX accessible names.
- Browser console posle završnih tokova: nema error/warning zapisa izazvanih
  ADMIN-19 izmenama.

Autentifikovana production ruta nije zaobilažena. Vizuelni QA koristi samo
eksplicitno označene neprodukcijske fixture-e; backend ponašanje dokazuju
convex-test/Vitest negativni i pozitivni scenariji.

## Završna verifikacija pre commita

| Komanda / dokaz | Rezultat |
| --- | --- |
| Ciljani ADMIN-19 + relevantni regresioni paket | PASS — 11 fajlova, 102 testa |
| `npm.cmd test` | PASS — 123 prošla / 2 preskočena fajla; 1.227 prošlih / 2 preskočena testa |
| `npx.cmd tsc -p convex/tsconfig.json --noEmit` | PASS |
| `npm.cmd run check` | PASS — lint 0 grešaka / 2 postojeća warning-a; Next build i TypeScript; 46/46 statičkih stranica; namespace gate; golden 177×2 byte-for-byte. |
| `git diff --check` | PASS pre završnog staginga; ponavlja se posle dokumenta |
| `git diff --cached --check` | Obavezno neposredno pre commita |

Poznata dva lint warning-a ostaju nevezana i nepromenjena:
`components/admin/venue-admin.tsx` (`useMemo`) i
`convex/purchaseLifecycle.test.ts` (`price`). Nema lint grešaka.

Convex codegen nije bio potreban niti pokrenut. Nije bilo analysis/upload
handshake-a, deploya, live migracije/backfill-a, seeda, reseta, Zoho/mail rada,
promene env-a ili push-a.

**ADMIN-20 nije započet.**
