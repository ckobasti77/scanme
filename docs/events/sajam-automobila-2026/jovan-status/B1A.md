# B1A — Admin tab „Događaji“ (status)

> Korak **B1A**, 3. oktobar 2026. Lanac SAJAM v2, Claude (Opus 5.5), nastavak sesije B1.
> Izvori: MASTER §15 („Admin sekcija Događaji“), V2 §11, `jovan-status/B1.md`, `FAIR-BACKEND-CONTRACT.md` §11–§12, postojeći admin (`app/admin/**`, `components/admin/**`, `lib/admin-v1/navigation.ts`, `lib/i18n`).

## 1. Stanje pre rada

| Stavka | Vrednost |
|---|---|
| Grana | `codex/sajam-backend-2026` |
| HEAD | `388abbc` (`sajam-v2(B1): Katalog, import, paketi i QR dodela`) |
| Ciljni Convex DEV | `dev:expert-pelican-136` (snapshot `B1A-snapshot.txt`; `npx convex dev --once` je potvrdio isti deployment) |
| Prljavi fajlovi pre rada | 0 van runnerovih putanja |
| Netaknute korisničke izmene | Netraženi `docs/sajam/**`, `scripts/sajam/**` i `output/**` nisu menjani. |
| Polazne provere (B1 gate logovi) | `tsc`: 35 postojećih grešaka u test fajlovima. `npm test`: 2 postojeća pada (`memoriesHost`, `adminProducts` perf timeout). `lint`: 0 grešaka, 3 upozorenja. |

## 2. Implementirano

**Tab.** `Događaji` je deveti **glavni** tab u `ADMIN_NAV_ITEMS` (`id: "events"`, `/admin/dogadjaji`, i18n `navEvents`). Stoji posle „Usluge“ i nije pod Usluge/Operativa (MASTER §15). Ikonica u `admin-shell.tsx` je `CalendarDays`. Stranica je `AdminGuard` + `AdminShell` kao ostali tabovi: neprijavljen korisnik ide na postojeći `/admin/login`, a ne-admin dobija postojeći „pristup odbijen“ ekran.

**Delovi taba** (postojeći admin stil i primitivi — `AdminPanel`, `AdminStatus`, `AdminEmptyState`, `AdminLoadingState`, `AdminErrorState`; bez novog vizuelnog jezika):

| Deo | Šta radi | B1 funkcije |
|---|---|---|
| Izbor događaja | lista događaja po datumu početka | `listEvents` |
| **Pregled** | dani; učešća sa oznakom segmenta (`Standardni` / `Event-only`) i statusom; štandovi sa lokacijom na mapi; brendovi i modeli sa paketom, statusom, QR kodom i sažetkom provere | `getEventCatalog`, `getEventDirectory` (nova, §2.1), `listValidationIssues` |
| **Model** | detalj modela; poruke validacije (greške/upozorenja preko kodova); Objavi/Povuci; nadogradnja paketa samo naviše, sa potvrdom **u samoj stranici** (bez `confirm()`) | `publishModel`, `withdrawModel`, `upgradePackage` |
| **QR inventar** | lista kodova inventara (paginirano), dodela kodu modelu, oslobađanje sa obaveznim razlogom (inline potvrda), resolve test sa napomenom da javna `/r` ruta otvara model tek posle B2 | `listQrInventory`, `assignQr`, `releaseQr`, `resolveTest` |
| **Import** | nalepi ili učitaj JSON fajl → `dryRun` (rezime + lista grešaka i upozorenja) → `commit` je omogućen **samo** posle uspešnog `dryRun`-a istog sadržaja; svaka izmena teksta ponovo zaključava upis | `fairImport.dryRun`, `fairImport.commit` |
| **Event-only klijenti** | lista `event_only` klijenata i „Prebaci u redovne klijente“ sa inline potvrdom | `listEventClients`, `convertEventClientToStandard` |

Greške backenda (`ConvexError({ code, issues? })`) se mapiraju na srpski tekst preko `adminEventsSr.issues`. Za svaki kod iz `FAIR_ADMIN_ISSUE_CODES` postoji tekst (test). Nepoznat kod se prikazuje kao „Nepoznat kod greške: …“, a ne nestaje. Odgovor neispravnog oblika iz importa ima posebnu poruku.

**Pristupačnost.** Delovi su ARIA `tablist`/`tab`/`tabpanel` sa strelicama levo/desno. Poruke idu u `role="status"`, a inline potvrde pomeraju fokus na polje razloga ili dugme za potvrdu. Kontrole su najmanje 44 px visoke, sa vidljivim fokusom.

**PII.** UI prikazuje samo nazive klijenata/lokala/brendova, SMK/SML kodove, segment i katalog. Kontakti, emailovi primalaca izveštaja i visitor podaci se ne prikazuju; `getEventDirectory` ih ni ne vraća (test).

### 2.1 Nova mala admin projekcija

`fairAdmin.getEventDirectory({ eventId })` (admin query, `requireAdmin`) vraća nazive, `smkCode`/`smlCode` i segment za naloge i lokale učešća i nazive brendova modela jednog događaja. Ovo je jedina backend izmena: bez nje bi UI mogao da prikaže samo ID-eve. Svaki različit nalog/lokal/brend čita se jednom po ID-u, a skupovi su ograničeni katalogom (`FAIR_ADMIN_LIST_LIMIT`). Funkcija je pushovana na DEV.

### 2.2 Fajlovi

| Fajl | Vrsta |
|---|---|
| `app/admin/dogadjaji/page.tsx` | nova stranica taba |
| `components/admin/admin-events.tsx` | prezentacioni deo (props), svih 5 delova |
| `components/admin/admin-events-workspace.tsx` | Convex podaci + akcije, mapiranje grešaka, error boundary |
| `components/admin/admin-events-preview.tsx` | statički TEST fixture za vizuelnu proveru (po uzoru na `AdminQrPreview`) |
| `components/admin/admin-events.test.tsx` | 3 render testa |
| `lib/i18n/sr/admin-events.ts`, `lib/i18n/types.ts` (`AdminEventsDict`, `AdminEventsResolveProblem`, `navEvents`), `lib/i18n/index.ts`, `lib/i18n/sr/admin-v1.ts` | i18n površina `admin-events` (ekavica, latinica) |
| `lib/admin-v1/navigation.ts`, `lib/admin-v1/navigation.test.ts` | novi tab; test ažuriran samo za novi tab (9 stavki, aktivna putanja `/admin/dogadjaji`) |
| `components/admin/admin-shell.tsx` | ikonica taba + kompaktnija desktop navigacija samo u opsegu 1280–1535 px (§6.1) |
| `convex/fairAdmin.ts`, `convex/fairAdmin.test.ts` | `getEventDirectory` + test (authz i bez PII) |
| `app/dev/admin-events-preview/page.tsx` | dev preview ruta (van opsega, §5) |
| `docs/tasks/BLOCKED.md` | sekcija „SAJAM v2 — B1A“ |

## 3. Komande i rezultat

| Komanda | Rezultat |
|---|---|
| `npx convex codegen` | prolazi (`api.d.ts` bez promene: nova funkcija je u postojećem modulu) |
| `npx vitest run convex/fairAdmin.test.ts lib/admin-v1/navigation.test.ts lib/i18n` | 3 fajla, 25/25 |
| `npx vitest run components/admin/admin-events.test.tsx` | 3/3 |
| `node scripts/sajam/tools/shot.mjs …/dev/admin-events-preview` 390 i 1280 (`--full`) | status 200, `horizontalOverflow: false`, `consoleErrors: []` |
| `node scripts/sajam/tools/shot.mjs …/admin/dogadjaji` 390 i 1280 | status 200, bez overflow-a i grešaka; prikazuje postojeći **admin login** (nema admin sesije, lozinke nisu unošene) |
| Playwright skripta (u sistemskom temp-u, van repoa): klik kroz svih 5 delova na 390 i 1280 (izbor modela, nadogradnja, resolve test, oslobađanje, dry run, prebacivanje) | 10 snimaka, nijedan horizontalni skrol, 0 grešaka u konzoli |
| Merenje desktop navigacije | pre izmene shell-a: 1280 → nav 728 px u ćeliji od 597 px (seče „Finansije“, „Tim“ je ispod pretrage); posle: 595 px, desna ivica 824 < početak alata 844. Na 1536+ i dalje 728 px (nepromenjeno). |
| `npm run lint` | 0 grešaka, 3 postojeća upozorenja |
| `npx tsc --noEmit` | **istih 35** grešaka kao B1 gate log (sortirane liste identične), **0 novih** |
| `npx vitest run fair` (paralelno sa `npm test`) | 70/71: jedan timeout od 5 s na prvom testu jednog fajla (hladno učitavanje modula pod opterećenjem) |
| `npx vitest run fair` (samostalno, 2×) | prvi put 4 timeouta od 5 s na prvom testu svakog convex fajla dok je dev server rekompajlirao shell; **drugi put 7 fajlova, 71/71** (4,1 s) |
| `npm test` | 1312 prošlo, 2 pala, 2 preskočena (1316). Padovi su isti kao u B1 gate logu: `memoriesHost` i `adminProducts` perf timeout. **Nema novih padova.** |
| `git diff --check` | čisto |
| `npx convex dev --once` | „Convex functions ready!“ na `expert-pelican-136` |

Snimci su u `tmp/sajam/b1a-*.png` (ignorisano, ne commituje se). Pogledani su: pregled na 390 i 1280, model, QR inventar, import i event-only klijenti na 390 i/ili 1280, i login preusmerenje na 390.

## 4. Testovi

- `components/admin/admin-events.test.tsx`:
  - pregled prikazuje dane, oba segmenta, štand sa lokacijom, paket i status modela, `tablist`, i nijedan sirovi `FAIR_*` kod;
  - svaki kod iz `FAIR_ADMIN_ISSUE_CODES` ima srpski tekst; `ACTION_FAILED` i nepoznat kod su obrađeni;
  - prazno i loading stanje.
- `convex/fairAdmin.test.ts`: `getEventDirectory` je dodat u test odbijanja ne-admina i anonimnog korisnika; vraća samo nazive, kodove i segment, bez emaila.
- `lib/admin-v1/navigation.test.ts`: 9 glavnih stavki redom; `/admin/dogadjaji` → `events`. Ostale asercije (Operativa, Usluge, legacy putanje) su nepromenjene.

Nijedan test nije isključen ni oslabljen.

## 5. Fajlovi van opsega koraka

Dozvoljeno: `app/admin/**`, `components/admin/**`, `lib/admin-v1/**`, `lib/i18n/**` (bez prelaunch i `fair-*`), `convex/fair*` (mala admin projekcija), `convex/_generated/**`, `jovan-status/**`, `docs/tasks/BLOCKED.md`.

| Fajl | Razlog |
|---|---|
| `app/dev/admin-events-preview/page.tsx` | Admin zahteva prijavu, a lanac nema admin sesiju i ne sme da unosi lozinke. Da bi tab mogao da se pogleda očima (B1A tačka 5), dodata je dev preview ruta po postojećem obrascu (`app/dev/admin-qr-preview` i ostalih 13 `admin-*-preview` ruta). U produkciji vraća `notFound()`. Prikazuje statički TEST fixture i ne poziva Convex. |

Nijedan zabranjen fajl nije diran:
- `.env*`, `package.json` i lock;
- prelaunch, `lib/i18n/sr/fair-*`, `components/scanme-links/**`, `lib/scanme-links*`, goldeni, `output/**`, `.tmp/**`;
- Kodeksov frontend (`app/sajam/**`, `components/fair/**`, `lib/fair-client/**`, `scripts/fair|events/**`, `public/fair/**`);
- `convex/lib/access.ts`, `convex/leads.ts`, entitlements, `lib/flags.ts`;
- `scripts/sajam/**`, `docs/sajam/**`, `scripts/tasks/**`, kanonski dokumenti.

## 6. Konflikti i napomene

1. **Postojeći tabovi na 1280–1535 px.** Uputstvo traži da ostali tabovi rade isto, a deveti tab ne staje u desktop navigaciju na 1280. Merenje pokazuje da ni 8 tabova pre izmene nije stalo (645 px u ćeliji od 597 px; „Tim“ je bio delom ispod dugmeta pretrage). Promena je samo vizuelna i samo u tom opsegu: horizontalni padding stavki je 8 umesto 14 px, font 0,78 umesto 0,82 rem, razmak u zaglavlju 12 umesto 20 px. Od 1536 px (`2xl`) navigacija je piksel-identična. Linkovi, redosled, aktivno stanje i padajući meniji su nepromenjeni.
2. **HANDOFF §17**: B1/B1A su rađeni pre Aleksinog pregleda B0, po Jovanovoj odluci u runneru. To nije Aleksino odobrenje.
3. **Mesto taba**: MASTER §15 kaže samo „poseban glavni tab“. Postavljen je posle „Usluge“; redosled se menja jednim pomeranjem u `ADMIN_NAV_ITEMS` i testu.

## 7. Otvorena pitanja

- Redosled taba u glavnoj navigaciji (§6.3).
- Da li je kompaktna navigacija na 1280–1535 px prihvatljiva, ili treba drugačije rešenje (npr. drugi prelom za desktop navigaciju)?
- Ostala B1 pitanja (`FAIR-BACKEND-CONTRACT.md` §9.16–§9.21) i dalje važe; tab ih prikazuje kroz poruke validacije.

## 8. Za sledeći korak

- Tab sada pokriva samo B1 operacije. Pitanja Glasa publike, ankete, pasoši, sponzorisani snapshot, leadovi, izveštaji i retention preview (V2 §11) dodaju se kao novi delovi kada nastanu njihove backend funkcije (B3–B7). Obrazac je prezentacioni deo + workspace + i18n ključevi u `admin-events`.
- Na DEV-u TEST QR inventar (`SML-TEST-FAIR-QR`) još nema kodova. Za ručnu proveru dodele u tabu prvo napraviti TEST digitalni QR kroz Operativa → QR (`adminProducts.createDigital`).
- B2 mora da ukloni napomenu `resolveLiveNote` kada javna `/r` ruta počne da otvara sajamski model.
