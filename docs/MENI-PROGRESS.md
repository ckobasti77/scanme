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
