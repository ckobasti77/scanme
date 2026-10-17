# MENI — napredak

Noćni run MENI. Plan: `docs/MENI-PLAN.md`. Pravila: `.nocni-run/meni/rules.md`. Svaki korak dopisuje svoju sekciju na kraj (sa svojim ODLUKAMA i BLOKADAMA).

## K01 - Arhitektura i code-gap audit (plan)   (2026-10-17 18:51)
**Plan korak.** Plan je upisan u `docs/meni/planovi/K01.md`. Kod nije menjan.

## K02 — Temelj domena: recept, šema, uloge, režim, stranice, zajednički artikal   (2026-10-17 19:28)
**Fajlovi:**
- novi: `docs/menu/MENU-ARHITEKTURA.md`; `convex/lib/menuDomainValidators.ts`, `convex/lib/menuAccess.ts`, `convex/lib/menuDraft.ts`; `convex/menuServices.ts`, `convex/menuPages.ts`, `convex/menuCatalog.ts`; `lib/menu/{errors/core,permissions,roles,modes,keys,slugs,text,rsd,limits,cas,order,audit}.ts`, `lib/menu/testkit/seed.ts`; `lib/i18n/sr/menu-domen.ts`; testovi `convex/menuServices.test.ts`, `convex/menuAccess.test.ts`, `convex/menuPages.test.ts`, `convex/menuCatalog.test.ts`, `lib/menu/domain.test.ts`, `lib/menu/purity.test.ts`
- izmenjeni: `convex/schema.ts` (samo dodato), `lib/i18n/types.ts` i `lib/i18n/index.ts` (nova površina `menu-domen`), `convex/_generated/api.d.ts` (`npx convex codegen`), `docs/tasks/BLOCKED.md` (sekcija `SCANME MENU V1 — K02`)

**Šta je urađeno:**
- Recept `docs/menu/MENU-ARHITEKTURA.md` je ugovor za dalje korake. Ima sve delove iz zadatka: domen, tabele, funkcije po modulu, matricu uloga, cene i obračun, nacrt i objavu, real-time granice, rute, izlog, strukturu koda, i18n, migraciju i imena. Za svaki deo piše koji korak ga uvodi.
- Šema je samo proširena (+188 redova, −0; nijedna postojeća tabela ni polje nisu menjani). Nove tabele, polja i indeksi (`?` = `v.optional`):
  - `menuServices`: `businessId`, `serviceProfileId?`, `legacyMenuId?`, `mode` (`hospitality`|`services`|`retail`), `modeSetAt`, `modeSetByUserId?`, `status` (`active`|`archived`), `features` {`callWaiter`, `billRequest`, `ordering`, `roomService`, `occupancy`, `reservations` (`off`|`form`|`external`)}, `createdAt`, `updatedAt`. Indeksi: `by_businessId`, `by_serviceProfileId`.
  - `menuDraftState`: `menuServiceId`, `revision`, `articleCount`, `lastEditAt`, `lastEditByUserId?`. Indeks: `by_menuServiceId`.
  - `menuPages`: `menuServiceId`, `key`, `slug`, `name`, `publicTitle?`, `isDefault`, `order`, `visibility` (`visible`|`hidden`), `archivedAt?`, `iconKey?`, `navigation` (`standalone`|`back`|`shared`), `placementCount`, `createdAt`, `updatedAt`, `updatedByUserId?`. Indeksi: `by_menuServiceId_and_order`, `by_menuServiceId_and_slug`, `by_menuServiceId_and_key`.
  - `menuSections`: `menuServiceId`, `pageId`, `key`, `name`, `description?`, `iconKey?`, `order`, `visibility`, `createdAt`, `updatedAt`. Indeksi: `by_pageId_and_order`, `by_menuServiceId`, `by_menuServiceId_and_key`.
  - `menuArticles`: `menuServiceId`, `key`, `kind` (`item`|`combo`), `name`, `nameNormalized`, `description?`, `quantityValue?`, `quantityUnit?`, `basePriceRsd?`, `mediaMode` (`image`|`icon`|`none`), `imageMediaId?`, `iconKey?`, `createdAt`, `updatedAt`, `updatedByUserId?`. Indeksi: `by_menuServiceId_and_key`, `by_menuServiceId_and_nameNormalized`, `by_menuServiceId_and_kind`.
  - `menuPlacements` (bez cene): `menuServiceId`, `pageId`, `sectionId`, `articleId`, `order`, `visibility`, `createdAt`, `updatedAt`. Indeksi: `by_sectionId_and_order`, `by_sectionId_and_articleId`, `by_articleId`, `by_pageId`, `by_menuServiceId`.
  - `menuQrLinks`: `menuServiceId`, `cardId`, `pageKey?`, `active`, `createdAt`, `updatedAt`. Indeksi: `by_cardId`, `by_menuServiceId_and_pageKey`, `by_menuServiceId`.
  - `menuMembers`: `menuServiceId`, `businessId`, `email`, `userId?`, `role` (`owner`|`manager`|`editor`), `status` (`invited`|`active`|`removed`), `inviteTokenHash?`, `inviteExpiresAt?`, `invitedByUserId`, `acceptedAt?`, `createdAt`, `updatedAt`. Indeksi: `by_menuServiceId_and_userId`, `by_menuServiceId_and_email`, `by_inviteTokenHash`, `by_userId`.
  - `menuAuditLog`: `menuServiceId`, `actorKind` (`user`|`staff`|`admin`|`guest`|`system`), `actorUserId?`, `actorRef?`, `action`, `entityType?`, `entityKey?`, `details?`, `createdAt`. Indeks: `by_menuServiceId_and_createdAt`.
- Svaka nova Menu usluga automatski dobija stranicu „Kompletan meni": `isDefault`, slug `glavni`, bez javnog naslova. Pravi je jedan helper, `provisionMenuService`.
- Režim se bira pri kreiranju i klijent ga samo vidi (`menuServices.context`). Menja ga samo `adminSetMode` (`requireAdmin`); u V1 je dozvoljeno samo Ugostiteljstvo. Funkcije koje novi režim ne podržava se isključuju i beleže u oba audita.
- Stranice podržavaju dodavanje, preimenovanje (CAS, slug se ne menja), dupliranje (artikli se dele), premeštanje, arhiviranje i vraćanje, i brisanje. Brisanje i arhiviranje stranice sa aktivnom QR vezom su odbijeni (`menu/page_has_qr`).
- Zajednički artikal ima jednu osnovnu cenu u celim dinarima (`setBasePrice`, CAS). Prikaz nosi samo redosled i vidljivost. Brzi unos predlaže postojeći artikal istog normalizovanog naziva umesto duplikata.
- Uloge Vlasnik, Menadžer i Urednik izvode se iz postojećih članstava ili iz eksplicitnog `menuMembers` reda; važi jača uloga.
- Jedan helper (`requireMenuAccess`, `requireMenuAccessToRow`, `getMenuAccess`, `loadOwned`) proverava ulogu, opseg lokala, aktivan profil, `clientEditingEnabled` i tenant. Identitet se uvek uzima iz `ctx.auth`.

**ODLUKE:**
- U šemu idu samo tabele koje K02 koristi. Ostale tabele iz K01 §3.2 su u receptu §2.2 sa oznakom koraka; uvodi ih korak koji ih koristi, jer bi rano dodata polja kasnije mogla samo da rastu.
- `menuServices` nema `accountId`; nalog se uvek čita sa `businesses.accountId` da ne zastari. `settings` dodaju koraci koji ga koriste.
- `grantMenu` (stari tok) nije menjan, da stari editor i testovi ostanu netaknuti. Uslugu novog modela pravi nova admin mutacija `menuServices.adminProvision`, koja koristi isti `ensureMenuProfile`, ili `menuServices.ensureForBusiness` (vlasnik ili menadžer lokala, uz aktivan profil koji je dao ScanMe).
- Brojači `menuDraftState.articleCount` i `menuPages.placementCount` se održavaju u istoj transakciji. Tako granice (2.000 artikala, 4.000 prikaza po stranici) ne traže čitanje celih lista.
- `clientEditingEnabled` mora biti `true` za `menu.edit` i `menu.publish`; odsutno polje znači isključeno, kao u postojećem `requireServiceEditorAccess`.
- Mutacija adresirana ID-jem reda vraća `menu/not_found` korisniku bez uloge u toj usluzi, da se ne otkriva postojanje tuđih redova. Član bez dozvole dobija `menu/forbidden`.
- Greške su mašinski kodovi (`menu/...`, obrazac `orderingErrors.ts`). Tekst za svaki kod je u površini `menu-domen`, koja sadrži i naziv „Kompletan meni", režime i uloge.
- CAS po vrednosti polja vraća `{ ok: false, conflicts, current }` umesto greške, da UI može da prikaže konflikt.
- Novi artikal ima `mediaMode: "none"`; sliku ili ikonicu bira K15.
- Isti artikal sme u više sekcija iste stranice, najviše jednom po sekciji (master §5.1).
- Testovi pozivaju `convexTest` preko `newTest()`, jer `ReturnType<typeof convexTest>` gubi tipove indeksa u pomoćnim funkcijama.
- `docs/events/**` je van obima runa, pa FRONTEND-DELTA nije pisan. Sajam ne koristi nove tabele, a postojeće tabele i izvozi nisu menjani.
- Pitanja koja pripadaju vlasniku (preslikavanje legacy, finance i view_only uloga, spoljni Urednik, jedna usluga po lokalu, arhiviranje stranice sa QR vezom, stabilan slug, režim pri prvom otvaranju) su u `docs/tasks/BLOCKED.md` pod `SCANME MENU V1 — K02`.
- Fajlove `.nocni-run/meni/prompts/K09`, `K12`, `K19` i `K24` je tokom koraka izmenio nadzor (napomena od 19:25), ne ovaj korak.

**Novi paketi:** nema (run ne uvodi pakete)

**Testovi:**
- `convex/menuServices.test.ts` (11): automatski „Kompletan meni", idempotentnost, admin kreiranje sa auditom, veza ka starom meniju bez izmene, ko sme da otvori uslugu, nijedna klijentska uloga ne menja režim, nedostupni režimi.
- `convex/menuAccess.test.ts` (14): cela matrica uloga × dozvola kroz Convex, mapiranje članstava (legacy, eksplicitna jača uloga, uklonjen red, opseg lokala), stanja usluge, tenant granica, `requireMenuAccessToRow`.
- `convex/menuPages.test.ts` (37): ceo životni ciklus stranica; odbijeno brisanje i arhiviranje sa aktivnom QR vezom, a dozvoljeno kad je veza neaktivna, kartica isključena ili preusmerena; uloge; drugi nalog i lokal.
- `convex/menuCatalog.test.ts` (39): ista cena preko dve stranice i prikaz bez cene; brzi unos i duplikati; granice; CAS; sekcije i prikazi; uloge; tenant izolacija.
- `lib/menu/domain.test.ts` i `lib/menu/purity.test.ts`: čista logika i zabrana `next`, `react`, `@/` i `node:` uvoza u `lib/menu`.

**Snimci:** nema UI izmena.

**Rezultat provere:**
- `node .nocni-run/meni/alati/typecheck.mjs`: bez grešaka.
- `npx tsc --noEmit -p convex/tsconfig.json`: bez grešaka.
- `npx eslint --ignore-pattern ".nocni-run/**"`: 0 grešaka. Ostaju dva stara upozorenja (`components/admin/venue-admin.tsx`, `convex/purchaseLifecycle.test.ts`) u fajlovima koje korak ne dira; novi fajlovi su bez upozorenja.
- Menu testovi ovog koraka (6 fajlova): 125 testova prolazi.
- `npx vitest run --testTimeout=30000 --hookTimeout=60000`: 397 fajlova i 4.747 testova prolazi, 2 preskočena.
- `npm run harness:namespace`: prošlo.
- `npm run build`: prošlo; `next-env.d.ts`, koji build prepiše, vraćen je na sadržaj iz HEAD-a.

**Provera prihvatanja (stavka po stavka, 19:34–19:40):**

| Stavka iz prompta K02 | Dokaz | Stanje |
|---|---|---|
| Recept postoji i ima sve delove iz tačke 1 | `docs/menu/MENU-ARHITEKTURA.md` §1–§13: domen; tabele, polja i indeksi; funkcije po modulu; uloge; cene i obračun; nacrt i objava; real-time; rute; izlog; struktura koda i komponenti; i18n; migracija i rollback; imena | ispunjeno |
| Šema samo proširena; spisak u sekciji K02 | `git diff --numstat convex/schema.ts` daje `188 0`; svih 9 tabela sa poljima i indeksima je navedeno gore | ispunjeno |
| Testovi iz tačke 7 postoje i prolaze | „Kompletan meni" (`menuServices.test.ts`); zajednička cena preko stranica (`menuCatalog.test.ts` › one article, one price, many pages); brisanje stranice sa QR odbijeno (`menuPages.test.ts` › remove › page_has_qr); nijedna klijentska uloga ne menja režim (`menuServices.test.ts`); matrica uloga (`menuAccess.test.ts`, `lib/menu/domain.test.ts`); drugi nalog i lokal (tenant testovi u sva tri modula). 101 + 24 testa prolaze. | ispunjeno |
| Tačka 6: jedan helper, identitet nikad iz argumenta | `tmp/meni/k02-access-audit.mjs`: svih 25 izvezenih funkcija ide kroz `requireMenuAccess`, `requireMenuAccessToRow` ili `getMenuAccess`, ili kroz `requireAdmin` za admin radnje; `ensureForBusiness` kroz istu izvedenu ulogu (`derivedMembership`). Nijedna funkcija ne prima `userId`, `role` ni `email`. Rezultat: AUDIT PASSED. Postojeći `convex/lib/access.ts`, `entitlements.ts`, `invitations.ts`, `menu.ts`, `menuAdmin.ts`, `clientPanel.ts` i `cards.ts` su bez izmena (prošireno, ne zamenjeno). Osoblje je u matrici kao `staff` (samo `waiter.work`); identitet osoblja (PIN) gradi K22. | ispunjeno |
| Provere prolaze; sekcija K02 u progress-u | typecheck, eslint, vitest i namespace imaju izlazni kod 0 u jednom puštanju 19:34–19:36; ova sekcija | ispunjeno |

**Za Jovana ujutru:**
- Pregledaj pitanja u `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K02`, posebno legacy članstvo kao Menadžer i to da `finance` i `view_only` nemaju pristup.
- Pročitaj `docs/menu/MENU-ARHITEKTURA.md` §2–§4; to je ugovor za sve sledeće korake.

## K03 — Cene, entitlementi i Room service model   (2026-10-17 20:14)
**Fajlovi:**
- novi: `lib/menu/capabilities.ts`, `lib/menu/languages.ts`, `lib/menu/room-service-pricing.ts`, `lib/menu/errors/plan.ts`, `lib/menu/errors/room-service.ts`; `convex/lib/menuCapabilities.ts`, `convex/menuRoomService.ts`, `convex/menuSettings.ts`; testovi `lib/menu/capabilities.test.ts`, `lib/menu/room-service-pricing.test.ts`, `lib/pricing/menu-launch-proposal.test.ts`, `convex/menuCapabilities.test.ts`, `convex/menuSettings.test.ts`, `convex/menuRoomService.test.ts`
- izmenjeni: `convex/schema.ts` (samo dodato: +49 / −0), `convex/lib/menuDomainValidators.ts`, `convex/lib/menuAccess.ts` (`MenuOwnedTable` + 3 tabele), `convex/menuServices.ts` (`context.capabilities`, `setFeature`), `convex/menuCatalog.ts` (`setBasePrice` → RS upozorenje), `lib/menu/{keys,limits,modes,audit}.ts`, `lib/menu/testkit/seed.ts` (`addVenueToAccount`, `grantAccountPremium`), `lib/i18n/types.ts` i `lib/i18n/sr/menu-domen.ts` (novi kodovi grešaka), `convex/_generated/api.d.ts` (`npx convex codegen`), `docs/menu/MENU-ARHITEKTURA.md`, `docs/tasks/BLOCKED.md` (sekcija `SCANME MENU V1 — K03`)

**Šta je urađeno:**
- **Capability helper na jednom mestu.** `lib/menu/capabilities.ts` je jedina tabela onoga što Premium otključava: Room service, AI predlog prevoda, zakazane akcije, dodatne layout i dizajn varijante, naprednu analitiku, CSV i smanjen brending. Standard ima najviše 2 jezika po Menu usluzi, izvorni uključen. `convex/lib/menuCapabilities.ts` (`getMenuCapabilities`, `requireMenuCapability`) samo proširuje postojeći lanac `getEntitlement(…, "scanme_menu")`: subscriptions_v1 Premium naloga, pa aktivan red lokala, pa plan naloga (enterprise = premium). Premium tako važi za sve lokale naloga. `menuServices.context` sada vraća i `capabilities`.
- **Jezici.** `convex/menuSettings.ts` ima `languages` i `setLanguages` (Podešavanja, `settings.edit`, ide kroz nacrt). Standard dozvoljava srpski i jedan prevod, Premium do 10 (tehnička granica). Nalog iznad limita (izgubljen Premium) sme samo da ukloni ili preuredi jezike. Čuva se u `menuServices.settings.languages`.
- **Room service model** (šema: `menuRoomService`, `menuRoomServiceCategories`, `menuRoomServiceItems`):
  - uključen ili isključen kroz `menuServices.setFeature`, gde uključivanje traži Premium, a isključivanje nikad;
  - izbor: izabrani artikli (`addItems`) ili ceo „Kompletan meni” kao jednokratna kopija (`importWholeMenu`);
  - sopstvene kategorije i redosled;
  - markup u procentima za sve ili izabrane artikle, ručna RS cena po artiklu, jednokratna naknada po porudžbini;
  - artikal zadržava zajednički naziv, opis, sliku i alergene; RS čuva samo ručnu cenu.
- **Obračun kao čiste funkcije** (`lib/menu/room-service-pricing.ts`): osnovna → markup → ručna → naknada jednom po porudžbini. Markup je celobrojan (bazni poeni) i zaokružuje se na najbliži dinar, pola naviše (450 + 15 % = 518). Ručna cena ostaje tačno uneta. Poreklo cene je `inherited`, `computed` ili `manual`. Upozorenje posle promene osnovne cene nosi staru osnovnu, novu osnovnu i RS cenu, uz akcije `keepManual` i `recomputeFromMarkup`.
- `menuCatalog.setBasePrice` u istoj transakciji postavlja, ažurira ili briše upozorenje na RS stavci sa ručnom cenom.
- Sve RS izmene proveravaju ulogu (`menu.edit`), tenant (`requireMenuAccessToRow`, `loadOwned`) i Premium. `get` radi i na Standardu (`available: false`), da panel može da prikaže zaključavanje.
- **Cenovnik: BLOKADA.** Detalji su u redu BLOKADA ispod; `DEFAULT_PRICING_CONSTANTS` i `golden.json` nisu menjani.

**Razlike u goldenu:** nema ih. Golden nije regenerisan, jer je `DEFAULT_PRICING_CONSTANTS` nepromenjen (BLOKADA). Kad vlasnik izabere cenu paketa „Kompletan”, promeniće se tačno 486 od 726 slučajeva, sve korpe koje sadrže Menu. Razlog je viša lista cena Menu-a (890 → 1.490 mesečno, 8.990 → 14.900 godišnje), cena paketa „lokal” (1.590 → 1.990, 15.990 → 19.900) i nova cena paketa „Kompletan”. Ostalih 240 slučajeva ostaje bajt-identično, što dokazuje test „domet promene”.

**ODLUKE:**
- Cenovnik nije aktiviran. Zaključane cene sa nepromenjenim paketom „Kompletan” obaraju invarijantu 4 (6 od 726 korpi), pa ni `npm run pricing:golden` ne bi prošao. Prompt zabranjuje promenu drugih cena, a K01 A9 je ovo predvideo. Izabrana je konzervativnija opcija: BLOKADA sa dokazom i proverenim kandidatom, bez izmišljanja cene paketa.
- Primena kandidata (4.290 / 42.900) je probana na kopiji konstanti, a fajl je posle vraćen (`git diff` prazan). Pada samo 5 testova u 3 fajla (`engine.test.ts` 2, `golden.test.ts` 2, test „domet promene”). Tačan spisak je u BLOCKED; `priceParity` i `step-plan-model` u toj probi prolaze, suprotno pretpostavci iz K01 §5.
- Markup se čuva kao `markupBps` (ceo broj), ne kao `markupPercent` iz plana, da nema float greške. API prima procenat sa najviše dve decimale, 0–300 %.
- Ručna RS cena po varijanti prelazi u K04, jer varijante još ne postoje; obračun po ceni je isti.
- Artikal je u Room service-u najviše jednom. Novi RS artikal nije izabran za markup. Naknada 0 znači „bez naknade”. Prazna RS kategorija može da se obriše, a neprazna ne može (`room_service/category_not_empty`).
- „Ceo meni” je jednokratna kopija vidljivih sekcija i artikala „Kompletnog menija” (K01 OTV 6). Postojeća RS kategorija istog imena se ponovo koristi.
- Pravo na izmenu: RS sadržaj i cene su `menu.edit` (i Urednik), uključivanje RS-a je `features.edit`, jezici su `settings.edit`.
- Premium gate važi i za ScanMe admina. Premium se daje kroz entitlement, ne zaobilazi se.
- Postojeći aktivan `scanme_menu` red na nivou lokala i dalje daje Premium tom lokalu: lanac je proširen, ne zamenjen.
- `setFeature` pokriva prekidače koji su `boolean`; trostepeni prekidač rezervacija dobija svoj pisac u K25. Promena prekidača se upisuje u audit kao `feature.changed`.
- Spisak jezika za prevod (27 ISO kodova) je radni.
- Pitanja za vlasnika su u `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K03`.
- `docs/events/**` je van obima runa; Sajam ne koristi nove tabele ni izvoze.

**Novi paketi:** nema (run ne uvodi pakete)

**Testovi** (229 novih testova u 6 novih fajlova; ukupno 403 fajla, 4.976 testova):
- `lib/menu/room-service-pricing.test.ts` (101): tabela obračuna sa zaokruživanjem (450 + 15 % = 518, 335 + 10 % = 369, granice pola), ručna cena, procenti i bazni poeni, naknada jednom po porudžbini, upozorenje (prva i druga promena, povratak na staru osnovnu, brisanje cene), akcije, poređenje sa BigInt referencom.
- `lib/menu/capabilities.test.ts` (21): Premium lista, 2 jezika u Standardu, mapiranje plana, provera jezika.
- `lib/pricing/menu-launch-proposal.test.ts` (6): pad 6 korpi, granice 4.179 i 41.997, gornja granica 4.424 i 44.492, kandidat prolazi svih 726 korpi, domet promene.
- `convex/menuCapabilities.test.ts` (21): Premium na nalogu (dva lokala istog naloga, preko plana i preko pretplate, `grace`, `suspended`, enterprise), postojeći red lokala, `context`, `setFeature` po ulogama, Premium za RS i audit.
- `convex/menuSettings.test.ts` (22): limit od 2 jezika, Premium do 10, izgubljen Premium, validacija, uloge, nacrt, tenant.
- `convex/menuRoomService.test.ts` (58): Premium gate za svih 12 izmena, uloge, `editing_disabled`, tenant izolacija u oba smera, obračun i poreklo, CAS, promena osnovne cene i obe akcije, uvoz celog menija, redosled, revizija nacrta.

**Snimci:** nema UI izmena (UI Room service-a je K16, Premium zaključavanja dolaze sa površinama).

**Rezultat provere:**
- `node .nocni-run/meni/alati/typecheck.mjs`: bez grešaka; `npx tsc --noEmit -p convex/tsconfig.json`: bez grešaka.
- `npx eslint --ignore-pattern ".nocni-run/**"`: 0 grešaka; ostaju dva stara upozorenja (`components/admin/venue-admin.tsx`, `convex/purchaseLifecycle.test.ts`).
- `npx vitest run --testTimeout=30000 --hookTimeout=60000`: 403 fajla, 4.976 testova prolazi, 2 preskočena.
- `npm run harness:namespace`: prošlo.
- `npm run build`: prošlo; `next-env.d.ts` vraćen na sadržaj iz HEAD-a.

**Provera prihvatanja:**

| Stavka | Dokaz | Stanje |
|---|---|---|
| Capability helper postoji; testovi dokazuju Premium na nalogu i limit od 2 jezika | `lib/menu/capabilities.ts` + `convex/lib/menuCapabilities.ts`; `menuCapabilities.test.ts` (dva lokala istog naloga), `menuSettings.test.ts` i `capabilities.test.ts` (limit) | ispunjeno |
| Nove cene paketa u `lib/pricing`, svaka razlika u goldenu objašnjena | cene su u `menu-launch-proposal.test.ts` kao proveren kandidat, a ne u `DEFAULT_PRICING_CONSTANTS`; golden bez razlike (objašnjeno gore) | **BLOKADA** |
| Testovi obračuna: markup, zaokruživanje, ručna cena, naknada, upozorenje | `room-service-pricing.test.ts`, odeljci D i E u `menuRoomService.test.ts` | ispunjeno |
| Provere prolaze; sekcija K03 u progress-u | gore | ispunjeno |

**BLOKADA:** cene ScanMe Menu 1.490 / 14.900 i Menu + ScanMe Links 1.990 / 19.900 nisu upisane u `DEFAULT_PRICING_CONSTANTS`. Sa njima i nepromenjenim paketom „Kompletan” (3.790 / 37.990) motor baca invarijantu 4 za obe uniformne korpe sa pet usluga. Prompt zabranjuje promenu drugih cena, a cena paketa „Kompletan” je odluka vlasnika (dozvoljen opseg je [4.179, 4.424] mesečno i [41.997, 44.492] godišnje). Deferred, awaiting owner decision; recept za primenu je u `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K03`.

**Za Jovana ujutru:**
- Izaberi cenu paketa „Kompletan” (predlog 4.290 / 42.900 je proveren). Primena je jedan commit: tri vrednosti u `lib/pricing/constants.ts`, `npm run pricing:golden` i 5 namernih izmena testova po BLOCKED.
- Pregledaj konzervativne izbore za Room service i jezike u BLOCKED, posebno to da novi RS artikal nije izabran za markup i da Urednik menja RS cene.

## K04 — Model artikla: varijante, dodaci, kombo, akcije, alergeni   (2026-10-17 21:12)
**Fajlovi:**
- novi: `convex/menuArticleOptions.ts`, `convex/menuCombos.ts`, `convex/menuPromos.ts`, `convex/menuArticleDetails.ts`, `convex/menuAvailability.ts`, `convex/lib/menuArticleHooks.ts`; `lib/menu/{addons,allergens,tags,promo,combo,publish-validation,deletion}.ts`, `lib/menu/errors/{article,publish}.ts`; testovi `convex/menuArticleOptions.test.ts`, `convex/menuCombos.test.ts`, `convex/menuPromos.test.ts`, `convex/menuArticleDetails.test.ts`, `convex/menuAvailability.test.ts`, `convex/menuRoomServiceVariants.test.ts`, `lib/menu/{addons,allergens,promo,combo,publish-validation}.test.ts`
- izmenjeni: `convex/schema.ts` (samo dodato: +131 / −0), `convex/lib/menuDomainValidators.ts` (+104 / −0), `convex/lib/menuAccess.ts` (`MenuOwnedTable` + 6 tabela), `convex/menuCatalog.ts` (`setBasePrice` → kombo oznaka; `appendPlacement` i `assertPageActive` izvezeni), `convex/menuRoomService.ts` (ručna RS cena po varijanti), `lib/menu/{keys,limits,audit}.ts`, `lib/i18n/types.ts` i `lib/i18n/sr/menu-domen.ts`, `convex/_generated/api.d.ts` (`npx convex codegen`), `docs/menu/MENU-ARHITEKTURA.md`, `docs/tasks/BLOCKED.md` (sekcija `SCANME MENU V1 — K04`)

**Šta je urađeno:**
- **Šema (samo proširenje).** `menuArticles` je dobio opciona polja `variantsEnabled`, `addonsEnabled`, `noteEnabled`, `allergens`, `tags`, `promo`, `priceCheck` i `translations`. `translations?` je dodat i na stranice, sekcije i RS kategorije, a `manualVariantPrices?` na RS stavke. `menuServices.settings` ima `allergensEnabled?`. Nove tabele: `menuVariants`, `menuAddonGroups` (sa tačnim `linkCount`), `menuAddonOptions`, `menuArticleAddonGroups`, `menuComboComponents` i `menuAvailability`. Spisak polja i indeksa je u receptu §2.1c.
- **Varijante, dodaci i napomena** (`menuArticleOptions`). Sve je podrazumevano isključeno, pa običan artikal ostaje `Naziv + Cena`. Varijanta ima sopstvenu cenu. Grupa dodataka dozvoljava jedan ili više izbora, obavezna je ili opciona, a min i max su napredno podešavanje (`lib/menu/addons.ts`). Dodatak ima doplatu ili je besplatan.
- **Povezana grupa.** Jedna grupa važi na više artikala. Upit `addonGroupUsage` kaže koje artikle pogađa. Svaka izmena grupe ili dodatka bez `onlyForArticleId` važi za sve artikle; sa njim se u istoj transakciji pravi nezavisna kopija za taj artikal i menja se kopija. „Primeni i na druge artikle” je `applyAddonGroupToArticles`.
- **Kombo** (`menuCombos`). Kombo je poseban artikal od postojećih običnih artikala, sa ručnom cenom. Promena cene sastavnog artikla (osnovne ili varijante) ili njegovo brisanje postavlja `priceCheck` u istoj transakciji (`convex/lib/menuArticleHooks.ts`), a cena komboa ostaje ista. Klijent odlučuje: „Zadrži cenu” (`resolvePriceCheck`) ili nova cena kroz `setBasePrice`, koja briše oznaku.
- **Akcija** (`menuPromos`, `lib/menu/promo.ts`). Klijent unosi akcijsku cenu ili procenat, a druga vrednost se izvodi (zaokruživanje na dinar, pola naviše). Oznaka je `Akcija` ili `Preporuka`. Ručna akcija je Standard. Zakazana uključena akcija traži Premium kroz capability helper iz K03 (`requireMenuCapability(…, "scheduledPromos")`). Aktivnost i povratak regularne cene računa `promoStateAt(promo, now)` iz vremena; unos ide u beogradskom vremenu (`promoWindowFromBelgradeLocal`).
- **Alergeni i oznake** (`menuArticleDetails`, `lib/menu/allergens.ts`, `lib/menu/tags.ts`). Ima 14 kategorija sa srpskim nazivima i `Drugo`; `Sadrži` i `Može sadržati tragove` vode se odvojeno. Unose se samo kad lokal uključi alergene, a isključivanje ništa ne briše. Nepopunjen podatak je „nepoznato”, nikad „bezbedno” (`allergenMatch`). Oznake su zatvoren spisak.
- **Dostupnost i struktura.** `menuAvailability.setAvailability` važi odmah: bez nacrta i van verzije, i radi i kad je uređivanje isključeno. Semantika `Sakrij`, `Ukloni sa ove stranice` i `Obriši artikal` je zapisana u receptu §6. `deleteArticle` radi u dva koraka: prvi poziv vraća pogođene stranice i kombo artikle sa tokenom i ništa ne briše; drugi sa tim tokenom briše artikal i sve njegove redove.
- **Validacija za objavu** (`lib/menu/publish-validation.ts`). Greške su naziv, sekcija i cena ili varijanta sa cenom; ostalo su upozorenja. Proveravaju se samo artikli koje gost vidi, pa skriven nepotpun artikal ostaje u nacrtu i ne blokira ostatak menija. `articleIssues` daje rezultat za jedan artikal iz nacrta.
- **Ručna RS cena po varijanti** (K03 ju je odložio u K04). Dodati su `setManualVariantPrice` i `resolveVariantPriceWarning`; `get` vraća i varijante sa cenom, poreklom i upozorenjem.

**ODLUKE:**
- **Alergeni.** Prekidač je `menuServices.settings.allergensEnabled`, a ne `menuPresentation.allergensEnabled` iz plana, jer `menuPresentation` nastaje tek u K05. K05 zato ne dodaje to polje (recept §2.2). Prekidač ide kroz nacrt i menja ga `menu.edit`, uključujući Urednika, jer je deo ponude.
- **Validacija i artikal bez sekcije.** Master §5.5 važi za artikle koji se objavljuju. Stroga provera (`validateArticleForPublish`) zato odbija artikal bez naziva, sekcije ili cene. Provera nacrta (`validateDraftForPublish`) je primenjuje samo na artikle koje gost vidi. Skriven artikal ne daje ništa, artikal samo u kombou ne daje ništa, a artikal bez prikaza daje samo upozorenje `article_unplaced` (K01). Room service kategorija važi kao sekcija. Varijanta bez cene, prazna ili nezadovoljiva grupa, neprimenljiva akcija i kombo za proveru su upozorenja.
- **Bez zapisa = nepoznato.** Prazne liste alergena brišu zapis, pa sistem nikad ne čuva tvrdnju „ne sadrži ništa”. `Drugo` traži opis. Kod u obe liste ostaje samo u „Sadrži”.
- **Akcija.**
  - Čuva se samo uneta vrednost, da akcija u procentima prati kasniju promenu cene.
  - Procenat je ceo broj od 1 do 99; akcijska cena je najmanje 1 i niža od regularne.
  - Akcija sa cenom nije dozvoljena uz varijante; procenat važi i na cene varijanti.
  - Premium se traži samo za uključenu zakazanu akciju; isključivanje ga nikad ne traži.
  - Admin ne zaobilazi Premium (kao u K03).
- **Kombo.**
  - Sastavni artikal je samo običan artikal, svaki jednom, količina 1–20.
  - Oznaka nastaje i pri promeni cene varijante sastavnog artikla i pri brisanju sastavnog artikla; obrisano ime se čuva u oznaci.
  - Nova cena komboa kroz `setBasePrice` briše oznaku; nema drugog pisca cene.
  - Varijante na kombou nisu dozvoljene, a dodaci jesu.
- **Povezane grupe.** Grupa bez ijedne veze ostaje i nudi se kao „postojeća grupa”; briše se samo izričito (`deleteAddonGroup`, audit). Dodavanje varijante ili grupe samo uključuje odgovarajući prekidač. Kopija grupe se broji u granicu od 500 grupa.
- **Oznake.** Zatvoren spisak bez „Bez glutena” i „Bez laktoze”, jer bi to bila tvrdnja o bezbednosti. „Preporuka” postoji i kao oznaka i kao natpis akcije; renderer prikazuje jedan natpis (K13/K14).
- **Dostupnost.** Važi samo za artikle, ne za varijante. Osoblje je ne menja u V1 (K01 OTV 4). Ne upisuje se u audit, jer nije osetljiva radnja.
- **Varijanta bez sopstvene cene** koristi osnovnu cenu. Zato njena ručna RS cena dobija upozorenje i kad se promeni osnovna cena.
- **Proširenje plana.** `priceCheck` nosi `changedComponentKeys` i `removedComponentNames` umesto `reason`, a `menuAddonGroups.linkCount` je dodat da broj pogođenih artikala ne traži čitanje svih veza.
- **Prevodi.** Polja `translations?` postoje u šemi, a pisce dodaje K16.
- **Pitanja za vlasnika** su u `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K04`: oznake, nazivi alergena, pravila akcije, „Preporuka”, grupe i kombo.
- **Sajam.** `docs/events/**` je van obima runa. Sajam ne koristi nove tabele ni izmenjene izvoze.
- **Radnici.** Tri Sonnet radnika su radila na disjunktnim fajlovima: (a) varijante i grupe, (b) kombo i akcije, (c) alergeni, validacija i brisanje. Deljene fajlove i čista pravila (`addons`, `promo`, `combo`, `allergens`, `tags`, hooks) sam pisao pre njih. Dva radnika su uz `npx vitest run` koristila `cd` i `| tail` u istoj komandi. Ništa nije odbijeno i nema drugih komandi.

**Novi paketi:** nema (run ne uvodi pakete)

**Testovi** (278 novih testova u 11 novih fajlova; ukupno 414 fajlova i 5.254 testa, plus 2 stara bench fajla koja se preskaču):
- `convex/menuArticleOptions.test.ts` (62): običan artikal; varijante (CAS, granica, kombo odbijen); **povezana grupa — izmena za sve** (`addonGroupUsage` vidi sva tri artikla, izmena grupe i dodataka stiže do svih); **povezana grupa — nezavisna kopija** (Kafa dobija svoju grupu sa novim ključevima, Kapućino i Late ostaju isti, tačni `linkCount`; konflikt ili no-op ne pravi kopiju); „Primeni i na druge”; brisanje grupe; `touchDraft` tačno jednom; promena cene varijante → kombo oznaka i RS upozorenje; uloge; tenant.
- `lib/menu/addons.test.ts` (25): podrazumevane granice, napredni min/max, kontradikcije.
- `convex/menuCombos.test.ts` (22): **Burger meni 990 → promena cene Burgera i Pomfrita daje `priceCheck`, cena ostaje 990**; „Zadrži cenu”; nova cena briše oznaku; validacija sastava; uloge; tenant.
- `convex/menuPromos.test.ts` (25): ručna akcija na Standardu; **zakazana akcija samo uz Premium** (plan i pretplata, istekli Premium); neispravne akcije; CAS; uloge; tenant.
- `lib/menu/promo.test.ts` (24): procenat ↔ cena sa zaokruživanjem; **aktivna akcija po beogradskom vremenu** (leto UTC+2, zima UTC+1, prelaz 25. 10. 2026.).
- `lib/menu/combo.test.ts` (16): oznaka, provera sastava, zbir.
- `convex/menuArticleDetails.test.ts` (35): alergeni (isključeni, normalizacija, `Drugo`, prazno = brisanje, CAS); oznake; **brisanje sa spiskom posledica** (prvi poziv bez tokena ništa ne briše i vraća obe stranice i kombo, zastareo token traži novu potvrdu, pravi token briše sve redove i daje kombo oznaku i audit); `articleIssues` (**artikal bez cene ostaje u nacrtu sa greškom `price_missing`**, a sakriven je bez greške); uloge; tenant.
- `lib/menu/publish-validation.test.ts` (32): **odbijanje bez naziva, sekcije ili cene**; sva upozorenja; nacrt čuva skriven nepotpun artikal.
- `lib/menu/allergens.test.ts` (18): 14 + `Drugo`; jednakost sa validatorima šeme; srpski tekst za svaki kod; „nepoznato” nikad nije „bezbedno”.
- `convex/menuAvailability.test.ts` (10): uživo bez promene revizije nacrta; radi uz isključeno uređivanje; uloge; tenant.
- `convex/menuRoomServiceVariants.test.ts` (9): obračun varijanti, ručna cena (CAS), upozorenje i njegovo rešavanje, Premium, uloge, tenant.
- Revizija pristupa `tmp/meni/k04-access-audit.mjs`: svih 52 funkcija u K04 modulima i u `menuRoomService` ide kroz `requireMenuAccessToRow` ili `getMenuAccess`, direktno ili kroz lokalni helper koji ih zove. Nijedna ne prima identitet kao argument. Rezultat: AUDIT PASSED.

**Snimci:** nema UI izmena.

**Rezultat provere:**
- `node .nocni-run/meni/alati/typecheck.mjs`: bez grešaka; `npx tsc --noEmit -p convex/tsconfig.json`: bez grešaka.
- `npx eslint --ignore-pattern ".nocni-run/**"`: 0 grešaka; ostaju dva stara upozorenja (`components/admin/venue-admin.tsx`, `convex/purchaseLifecycle.test.ts`).
- `npx vitest run --testTimeout=30000 --hookTimeout=60000`: 414 fajlova i 5.254 testa prolaze; preskočena su 2 stara bench fajla.
- `npm run harness:namespace`: prošlo.
- `npm run build`: prošlo. `next-env.d.ts` je vraćen na sadržaj iz HEAD-a (prepisuju ga typegen i build).

**Provera prihvatanja:**

| Stavka | Dokaz | Stanje |
|---|---|---|
| Povezana grupa se menja za sve ili kopira za jedan artikal | `menuArticleOptions.test.ts` › „a linked group: change it for ALL linked articles” i „a linked group: an independent copy for ONE article” | ispunjeno |
| Kombo upozorenje posle promene cene sastavnog artikla, objavljena cena komboa se ne menja | `menuCombos.test.ts` › „Burger meni 990 with Burger 650 and Pomfrit 250: the published price never changes by itself” | ispunjeno |
| Validacija odbija artikal bez naziva, sekcije ili cene, a nacrt ga čuva | `publish-validation.test.ts` › „without a name, a section and a price” i „the SAME article, hidden, produces no issue at all: the draft keeps it”; `menuArticleDetails.test.ts` › „a shown article without a price is kept in the draft…” | ispunjeno |
| Provere prolaze; sekcija K04 u progress-u | gore | ispunjeno |

**Za Jovana ujutru:**
- Pregledaj `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K04`, posebno spisak oznaka, nazive alergena (pravna provera zajedno sa radnim tekstom upozorenja) i pravila akcije.
- Recept §2.1c, §5 i §6 opisuje model artikla, kombo, akcije, dostupnost i validaciju; to je ugovor za K05 (objava), K13–K16 (UI) i K21 (porudžbina).

### K04 — dopuna posle provere runnera: `npm run harness:check`   (2026-10-17 21:45)
**Šta je palo:** posle koraka K04 runner je pustio `harness:check` (21:19–21:24). Dev server harness-a (port 3199) je odgovorio `GET / 200`, a odmah zatim `GET /dev/template-gallery?harness=1 404` sa `Compiling /_not-found/page`. Stranica korpusa nije ni kompajlirana, pa `waitForSelector('[data-case-id]')` čeka 240 s i pada.

**Uzrok (ispitano):**
- K04 ne dira nijednu rutu, komponentu, `next.config.ts`, `proxy.ts`, `public/**` ni `harness/**`. Izmene su samo u `convex/**`, `lib/menu/**`, `lib/i18n/**` i dokumentima.
- Ruta `app/dev/template-gallery/page.tsx` postoji i vraća `notFound()` samo kad je `NODE_ENV=production`. Log ne prikazuje upozorenje „non-standard NODE_ENV”, pa to nije uzrok.
- Build runnera je isti kao u K03 (`K03_build.txt` i `K04_build.txt` se razlikuju samo u trajanju kompajliranja).
- `next dev` gradi spisak ruta iz snimka watcher-a (`setup-dev-bundler.js`: na svaki `aggregated` događaj prazni `appFiles` i puni ga iz `wp.getTimeInfoEntries()`). Ruta koja još nije u snimku daje 404 bez kompajliranja stranice, upravo kao u logu. Runner je harness pustio odmah posle vitest-a (5.254 testa) i `next build`-a, pod najvećim opterećenjem mašine (`GET /` je trajao 15 s). Harness ne ponavlja zahtev posle 404.
- Isti tok sam ponovio bez ikakve izmene koda: `npm run harness:check` (21:25), pa `npm run build` + `npm run harness:check` istim redom kao runner (21:30–21:40). Oba puta: `harness:check passed — 177 cases × 2 viewports match the goldens byte-for-byte`.

**ODLUKE:** kod nije menjan, jer pad ne potiče iz K04 izmena i ne ponavlja se. Harness (`harness/**`) i Next konfiguracija su van obima runa, pa ni ponovni pokušaj posle 404 ni isključivanje Turbopack keša za dev nisu dodati. Golden nije regenerisan.

**Rezultat provere (ponovo, 21:30–21:45):**
- `node .nocni-run/meni/alati/typecheck.mjs`: bez grešaka.
- `npx eslint --ignore-pattern ".nocni-run/**"`: 0 grešaka (2 stara upozorenja).
- `npx vitest run --testTimeout=30000 --hookTimeout=60000`: 414 fajlova i 5.254 testa prolaze (2 stara bench fajla se preskaču).
- `npm run harness:namespace`: prošlo.
- `npm run build`: prošlo.
- `npm run harness:check`: prošlo dva puta.
- Nijedan dev server ni proces nije ostao upaljen (provereno spiskom `node` procesa). `next-env.d.ts` je vraćen na sadržaj iz HEAD-a.

**Za Jovana ujutru:** ako se 404 korpusa ponovi u nekom koraku, to je tranzijentni problem dev servera pod opterećenjem, ne regresija ScanMe Links renderera. Harness bi mogao da ponovi `page.goto` kad korpus odgovori 404, ali je `harness/**` van obima ovog runa.

## K05 — Nacrt, objava, snapshotovi i konflikti (backend)   (2026-10-17 22:34)
**Fajlovi:**
- novi: `convex/menuPublishing.ts`, `convex/menuPresence.ts`, `convex/menuPublic.ts`, `convex/lib/menuDraftLoad.ts`, `convex/lib/menuRestore.ts`; `lib/menu/{snapshot,budget,presentation,publish-checks,publish-summary,restore-plan}.ts`, `lib/menu/errors/versions.ts`; testovi `convex/menuPublishing.test.ts`, `convex/menuVersions.test.ts`, `convex/menuPublic.test.ts`, `convex/menuPresence.test.ts`, `convex/menuConflicts.test.ts`, `lib/menu/{snapshot,budget,publish-checks,publish-summary,restore-plan}.test.ts`
- izmenjeni: `convex/schema.ts` (samo dodato), `convex/lib/menuDomainValidators.ts`, `convex/lib/menuAccess.ts` (`MenuOwnedTable` + 4 tabele), `convex/crons.ts` (2 nova posla), `convex/menuArticleDetails.ts` (brisanje artikla više ne briše dostupnost; CAS `attempted`), `convex/menuCatalog.ts`, `convex/menuPages.ts`, `convex/menuArticleOptions.ts`, `convex/menuPromos.ts`, `convex/menuRoomService.ts` (CAS `attempted`), `lib/menu/{cas,audit}.ts`, `lib/menu/errors/publish.ts` (`MENU_PUBLICATION_WARNINGS`), `lib/i18n/types.ts` i `lib/i18n/sr/menu-domen.ts`, `convex/_generated/api.d.ts` (`npx convex codegen`), `docs/menu/MENU-ARHITEKTURA.md` (§2.1d, §3.2, §6), `docs/tasks/BLOCKED.md` (`SCANME MENU V1 — K05`)
- namerno izmenjene asercije (razlozi u ODLUKAMA): `convex/menuArticleDetails.test.ts`, `convex/menuArticleOptions.test.ts`, `convex/menuCatalog.test.ts`, `convex/menuPages.test.ts`, `convex/menuPromos.test.ts`, `convex/menuRoomServiceVariants.test.ts`, `lib/menu/allergens.test.ts`

**Šta je urađeno:**
- **Šema (samo proširenje).** Nove tabele `menuVersions`, `menuVersionParts`, `menuPresentation` i `menuEditorPresence`. Nova opciona polja `menuServices.liveVersionId?` i `liveVersionNumber?` te `menuDraftState.publishedRevision?` i `restoredFromNumber?`. Spisak polja i indeksa je u receptu §2.1d.
- **Nacrt i status.** Svaka izmena i dalje podiže `menuDraftState.revision` (ko i kada, K02). `menuPublishing.draftStatus` daje stanje `never_published`, `clean` ili `dirty`, uz poslednjeg urednika, za editor i Početnu.
- **Snapshot (`lib/menu/snapshot.ts`, čisto).** Ceo nacrt se jednim ograničenim upitom po tabeli pretvara u `MenuDraftSnapshot` po stabilnim ključevima (`convex/lib/menuDraftLoad.ts`). Od njega nastaje nepromenljiva verzija:
  - interni deo `_all`, za vraćanje i sažetak;
  - javni delovi po jeziku: `_splitter`, po jedan deo za svaku javnu stranicu (deli se po celim artiklima, ≤ 512 KiB) i `_rs`.
  Javni deo nikad ne nosi skriveno, arhivirano, interne nazive („Kompletan meni") ni nepotvrđene AI prevode. Tekst je razrešen pri objavi (potvrđen prevod, inače izvorni). Budžet je u `lib/menu/budget.ts`, uz `ctx.meta.getTransactionMetrics()`.
- **Objava (`menuPublishing.publish`).** Jedna transakcija, redom:
  1. revizija pregledanog nacrta je zastarela (ista ili druga osoba) → `stale_draft`;
  2. nema promene ni u nacrtu ni u onome što gost dobija → `no_changes`;
  3. greške → `validation_failed`;
  4. upozorenja bez tačnog `fingerprint`-a iz pregleda → `confirmation_required`;
  5. upis verzije i svih delova, pa tek onda pokazivač `liveVersionId`.
  Odbijanje ne piše ništa. Greška posle upisa delova poništava sve (dokazano ubrizganom greškom). `publishPreview` vraća reviziju, greške, upozorenja, otisak, sažetak posledica, budžet i `wouldChange`.
- **Provere objave (`lib/menu/publish-checks.ts`).** K04 pravila se primenjuju na artikle koje gost vidi. Dodata su upozorenja cele objave:
  - `translation_missing`, po jeziku;
  - `room_service_premium` i `language_premium`, kad je Premium izgubljen.
  Zakazana akcija bez Premium-a se ne objavljuje.
- **Sažetak posledica (`lib/menu/publish-summary.ts`, Sonnet radnik).** Broji izmenjene cene, nove i uklonjene artikle i strukturne izmene: sakriveno, uklonjeno sa stranice, obrisano i redosled. Upisuje se u verziju i audit.
- **Čuvanje.** Ostaje tačno 20 verzija. Verzija koja ispadne dobija `retiredAt` u istoj objavi, a `pruneVersion` briše njene delove u serijama od 100. `sweepRetiredVersions` (cron, svakog sata) pokreće brisanje kad se nastavak izgubi.
- **Vraćanje (`restoreVersion`).** Pravi nacrt iz internog dela verzije i piše samo razliku, po ključevima, sa tačnim brojačima. Traži `expectedRevision`. Javni meni se ne menja do objave. Stranica sa aktivnom QR vezom se zadržava i prijavljuje. Vraćanje žive verzije poništava izmene nacrta (`clean`).
- **Dostupnost uživo.** `Privremeno nedostupno` (K04) ide odmah, bez objave. Javni `menuPublic.availability` je poseban mali upit.
- **Prisustvo (`menuPresence`).** Heartbeat sa entitetom (TTL 45 s); upis ide samo kad se entitet promeni ili red ističe. Postoji jedna pretplata po usluzi (`listForService` sa `nowBucket`), a stari redovi se brišu cron-om.
- **Konflikt iste vrednosti.** CAS (K02) sada vraća i `attempted`, pa druga osoba dobija obe vrednosti: sačuvanu (`current`) i svoju. To važi za sve CAS pisce: cene, polja artikla, varijante, dodatke, akcije, alergene, oznake, RS i nazive.
- **Javni read path (`menuPublic`: `entry`, `page`, `roomService`, `availability`).** Čita samo objavljenu verziju i žive slojeve. Stranica menija od 400 artikala čita 6 dokumenata i 6 upita (granica 15 / 10).

**ODLUKE:**
- **Odbijanje objave se vraća, ne baca.** Rezultat je `{ ok: false, reason }`, da UI prikaže razlog. Bacaju se samo greške pristupa i `menu/publish_too_large` (prevelik meni). Upozorenja se potvrđuju otiskom (`fingerprint`) tačno onih upozorenja koja je osoba videla. Novo ili izmenjeno upozorenje traži novu potvrdu.
- **`no_changes`.** Ponovna objava bez izmena se odbija, da ne troši jedno od 20 mesta u istoriji. Objava ipak prolazi kad je nacrt isti, a gost bi dobio drugačiji meni (uključen Room service, izgubljen Premium). To se proverava preko `menuVersions.publicHash`. Pravilo je dodato posle nalaza Sonnet radnika.
- **Room service u verziji.** Objavljuje se samo kad je prekidač uključen pri objavi i nalog ima Premium, jer se tada i proverava. Isključivanje važi odmah, a uključivanje posle sledeće objave.
- **Gubitak Premium-a.** Objavljeno ostaje (K01 OTV 5). Sledeća objava izostavlja Room service i jezike iznad limita, uz upozorenje. Zakazana akcija bez Premium-a se ne objavljuje, pa gost vidi regularnu cenu.
- **Brisanje artikla i dostupnost (izmena K04 ponašanja).** `deleteArticle` više ne briše red dostupnosti, jer bi gost do objave video obrisan (još objavljen) artikal kao dostupan. Red briše objava kad artikla više nema. Asercija u `menuArticleDetails.test.ts` je namerno promenjena.
- **CAS `attempted` (izmena K02–K04 ugovora, aditivna).** Konflikt sada nosi i `attempted`. Asercije `toEqual` u 6 starih test fajlova su namerno dopunjene tim poljem.
- **Kodovi upozorenja.** Upozorenja cele objave su u zasebnoj listi `MENU_PUBLICATION_WARNINGS`, da K04 test kataloga upozorenja artikla ostane važeći. Test pokrivenosti tekstova (`lib/menu/allergens.test.ts`) je namerno proširen tom listom.
- **Vraćanje i QR stranice.** QR stranica ostaje kakva jeste, sa sekcijama, prikazima i artiklima koje prikazuje i koje verzija nema. Ako njen slug pripada stranici iz verzije, dobija nov slug. Podrazumevana stranica iz verzije ima prednost.
- **Vraćanje bez izmena.** Ako nema razlike, ne piše se ništa (ni audit). Izuzetak je vraćanje žive verzije u nacrt koji se razlikuje samo po reviziji: on se označava kao čist.
- **Bez `lock` i serija u vraćanju.** Vraćanje je jedna transakcija ispod budžeta (≤ 8.000 upisa), inače `menu/restore_too_large`. Serije su odložene u K18, kako plan dozvoljava. Ograničenja čitanja nacrta za objavu su `MENU_DRAFT_LOAD_LIMITS`; `publishPreview` za prevelik nacrt vraća `tooLarge`, ne baca.
- **`menuPresentation`.** Tabela postoji, a bez reda važe podrazumevane vrednosti (`lib/menu/presentation.ts`): paleta i fontovi „default", nikad ScanMe paleta. `provisionMenuService` ne pravi red, a pisca dodaje K17. Premium pravila izgleda su K17.
- **Slike.** Verzija nosi `imageMediaId` (ref na `mediaAssets`), ne URL. URL razrešava renderer (K13 i K15). Vraćanje slike koja više ne postoji pretvara u ikonicu ili ništa. Trajnost URL-ova nije proveravana u dokumentaciji, jer verzija ne čuva URL.
- **Sekcija bez prikazanog artikla se ne prikazuje gostu.**
- **Prisustvo.** Napravljena je sopstvena tabela umesto `@convex-dev/presence`, jer run ne uvodi pakete (P5). Heartbeat traži `menu.edit`, a lista `menu.read`.
- **`menuPublic.availability` prima `menuServiceId`** (plan K01) i važi samo za javno objavljenu uslugu.
- **Sajam.** `docs/events/**` je van obima runa, pa FRONTEND-DELTA nije pisan. Sajam ne koristi nove tabele ni izmenjene izvoze, a novijeg JOVAN-DELTA fajla od 2026-10-09 nema.
- **Pitanja za vlasnika** su u `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K05`.
- **Radnici.** Pet Sonnet radnika je radilo na disjunktnim fajlovima: sažetak posledica, testovi objave, testovi verzija i vraćanja, testovi javnog čitanja, prisustva i konflikata, i čisti testovi. Svaki rezultat sam pregledao i pustio. Nalazi radnika su prihvaćeni i ispravljeni u kodu:
  - `no_changes` za Room service i Premium;
  - doslednost `attempted`;
  - varijanta bez cene se ne broji u prevode;
  - vraćanje bez izmena ne piše audit.
  Prekršaji brifa: jedan radnik je koristio `cat >>` za privremeni test (uklonjen), jedan `node -e` za brojanje redova, jedan `cd` uz vitest. Ništa nije odbijeno i nema drugih komandi.

**Novi paketi:** nema (run ne uvodi pakete)

**Testovi** (537 novih testova u 10 novih fajlova; ukupno 424 fajla, 5.791 test, plus 2 stara bench fajla koja se preskaču):
- `convex/menuPublishing.test.ts` (67):
  - **atomičnost:** ubrizgana greška posle upisa delova ne menja živu verziju, delove, nacrt ni gosta;
  - greške blokiraju, a skriven nepotpun artikal ne blokira;
  - upozorenja traže tačan otisak;
  - **novije izmene iste ili druge osobe → `stale_draft`**;
  - `no_changes`;
  - **nacrt ne menja javni meni pre `Objavi`** (cena, naziv, sakrivanje, uklanjanje, brisanje);
  - dostupnost uživo;
  - uloge: Vlasnik, Menadžer, Urednik i admin objavljuju, a finansije, pregled, autsajder i uklonjen Urednik ne; **Osoblje ne objavljuje** (matrica i nema puta bez naloga); isključeno uređivanje;
  - **drugi lokal ne vidi tuđi nacrt** i ne objavljuje ga;
  - red verzije i audit.
- `convex/menuVersions.test.ts` (38):
  - **tačno 20 snapshotova posle 23 objave** (4–23, delovi 1–3 obrisani);
  - ograničeno brisanje u serijama i cron rezerva;
  - **vraćanje pravi nacrt, a javni meni ostaje v2 do objave**, pa v3 nosi `restoredFromNumber`;
  - vraćanje žive verzije;
  - zastarelo i nepostojeće vraćanje;
  - QR stranica se zadržava;
  - nestala slika;
  - uloge, tenant i audit.
- `convex/menuPublic.test.ts` (44): `entry` new/legacy/none; stranica i razdelnik; ništa skriveno ni interno; nacrt ne curi; tenant; gating; jezici; Room service sa živim prekidačem i gubitkom Premium-a (i objava bez izmene nacrta); dostupnost; **budžet za 400 i 2.000 artikala sa pravim Convex granicama**.
- `convex/menuPresence.test.ts` (33): upis, preskakanje upisa, lista, `nowBucket`, `leave`, čišćenje u serijama, uloge, tenant, isključeno uređivanje.
- `convex/menuConflicts.test.ts` (38): **konflikt iste vrednosti** (dve osobe, ista osoba u dva taba, `Promise.all` trka) za šest pisaca; druga izmena dobija `current` i `attempted`, ništa se ne upisuje i revizija stoji.
- Čiste funkcije:
  - `lib/menu/snapshot.test.ts` (126);
  - `lib/menu/publish-checks.test.ts` (63);
  - `lib/menu/restore-plan.test.ts` (49);
  - `lib/menu/budget.test.ts` (33);
  - `lib/menu/publish-summary.test.ts` (46).
- Stari testovi objave generacija (`convex/menuPublishGeneration.test.ts`, `convex/menuAvailabilityConflict.test.ts`) nisu menjani i prolaze; `convex/menu.ts` nije diran.

**Snimci:** nema UI izmena.

**Rezultat provere:**
- `node .nocni-run/meni/alati/typecheck.mjs`: bez grešaka; `npx tsc --noEmit -p convex/tsconfig.json`: bez grešaka.
- `npx eslint --ignore-pattern ".nocni-run/**"`: 0 grešaka; ostaju dva stara upozorenja (`components/admin/venue-admin.tsx`, `convex/purchaseLifecycle.test.ts`).
- `npx vitest run --testTimeout=30000 --hookTimeout=60000`: 424 fajla i 5.791 test prolaze; preskočena su 2 stara bench fajla.
- `npm run harness:namespace`: prošlo.
- `npm run build`: prošlo. `next-env.d.ts` je vraćen na sadržaj iz HEAD-a.
- Nijedan dev server ni proces nije ostao upaljen.

**Provera prihvatanja:**

| Stavka | Dokaz | Stanje |
|---|---|---|
| Greška pri objavi ne menja javnu verziju; čuva se tačno poslednjih 20 | `menuPublishing.test.ts` › atomičnost (ubrizgana greška usred objave); `menuVersions.test.ts` › „23 publications leave exactly the newest 20" | ispunjeno |
| Vraćanje pravi nacrt, javni meni isti do objave | `menuVersions.test.ts` › „restores a version into the draft… menuPublic.page still shows version 2" | ispunjeno |
| Konflikt iste vrednosti i novije izmene ne prolaze tiho | `menuConflicts.test.ts` (obe vrednosti, ništa upisano); `menuPublishing.test.ts` › `stale_draft` (ista i druga osoba) | ispunjeno |
| Provere prolaze; sekcija K05 u progress-u | gore | ispunjeno |

**Za Jovana ujutru:**
- Pregledaj `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K05`, posebno kada Room service ulazi u javni meni, zakazanu akciju bez Premium-a i QR stranice pri vraćanju verzije.
- Recept §6 opisuje ceo tok objave i vraćanja. To je ugovor za K13 (javni meni čita `menuPublic`), K17 (izgled) i K18 (UI objave, verzija, prisustva i konflikta).
