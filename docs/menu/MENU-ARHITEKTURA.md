# ScanMe Menu V1 — recept arhitekture

> Ugovor za sve korake noćnog runa MENI (K02–K35). Izvor: `docs/meni/planovi/K01.md` (arhitektura i code-gap audit), master `ScanMe-Menu-Jovan-Claude-Handoff/docs/SCANME-MENU-MASTER-SPEC.md`, `docs/MENI-PLAN.md`.
> Kad korak promeni ponašanje koje ovaj dokument opisuje, ažurira ga u istom koraku. Oznaka **[Kxx]** kaže koji korak uvodi deo; **[K02 ✓]** znači da postoji u kodu.

## 1. Domen

| Pojam (master §3.1) | U kodu | Napomena |
|---|---|---|
| Nalog | `accounts` (postojeće) | Premium se vodi na nalogu (`getEntitlement`). |
| Lokal | `businesses` (postojeće) | Tenant. |
| Menu usluga | `menuServices` | Jedna pretplata jednog lokala u jednom zaključanom režimu. V1: najviše jedna aktivna usluga po lokalu. |
| Režim rada | `menuServices.mode` | `hospitality` (V1), `services` (V1.1), `retail` (kasnije). Bira se pri kreiranju, klijent ga samo vidi. |
| Stranica menija | `menuPages` | Standardne stranice; svaka usluga automatski dobija `Kompletan meni` (`isDefault`). |
| Sekcija | `menuSections` | Grupa na jednoj stranici (master §3.3: nije poseban meni). |
| Artikal | `menuArticles` | Zajednički identitet i **jedna osnovna cena** u celim dinarima. |
| Prikaz artikla | `menuPlacements` | Artikal u sekciji stranice: redosled i vidljivost, **nikad cena**. |
| Kombo | `menuArticles.kind = "combo"` + `menuComboComponents` [K04] | Ručna cena. |
| Pozicija | `menuPositions` [K20] | Sto, soba ili druga tačka. |
| QR veza | `menuQrLinks` | Kartica → stranica (i pozicija od K20). `cardTargets` se ne proširuje. |

Osnovne odluke (K01 §0):

- **A1** — novi domen živi u novim tabelama `menu*`. Stari model (`menus`, `menuGroups`, `menuItems`, `itemVariants`, `itemPairings`, `menuDayparts`) i RFC-004 poručivanje (`orderingConfig`, `serviceRequests`, `staffPins`, …) ostaju netaknuti i rade kao pre (kompatibilnost).
- **A2** — nacrt su normalizovani redovi (svaka izmena odmah u bazi). Objava je nepromenljiva verzija (`menuVersions` + `menuVersionParts`) [K05]; čuva se 20 verzija; dostupnost je živi sloj (`menuAvailability`) [K04] i nije deo verzije.
- **A3** — svaki entitet nacrta ima stabilan `key` (`lib/menu/keys.ts`); svaka podtabela nosi `menuServiceId` i indeks koji počinje njime.
- **A4** — jedan helper pristupa `convex/lib/menuAccess.ts` i jedna matrica `lib/menu/permissions.ts`; identitet nikad iz argumenta.
- **A10** — prekidači Funkcionalnosti (`menuServices.features`) važe odmah; sadržaj, izgled i jezici idu kroz `Objavi`.

## 2. Tabele, polja i indeksi

Sve tabele su nove (`convex/schema.ts`, blok „ScanMe Menu V1 — the new Menu domain"); validatori su u `convex/lib/menuDomainValidators.ts` (ne uvozi `../schema`). `?` = `v.optional`. Polja i vrednosti unija su na engleskom; tekst za korisnika ide kroz i18n.

### 2.1 Jezgro [K02 ✓]

| Tabela | Polja | Indeksi |
|---|---|---|
| `menuServices` | `businessId`; `serviceProfileId?`; `legacyMenuId?` (stari `menus` red istog lokala, samo informativno); `mode` `"hospitality"\|"services"\|"retail"`; `modeSetAt`; `modeSetByUserId?`; `status` `"active"\|"archived"`; `features` {`callWaiter`, `billRequest`, `ordering`, `roomService`, `occupancy`: boolean; `reservations` `"off"\|"form"\|"external"`}; `createdAt`; `updatedAt` | `by_businessId`, `by_serviceProfileId` |
| `menuDraftState` | `menuServiceId`; `revision`; `articleCount` (tačan broj artikala, granica `MENU_MAX_ARTICLES`); `lastEditAt`; `lastEditByUserId?` | `by_menuServiceId` |
| `menuPages` | `menuServiceId`; `key`; `slug` (stabilan); `name` (interni); `publicTitle?`; `isDefault`; `order`; `visibility` `"visible"\|"hidden"`; `archivedAt?`; `iconKey?`; `navigation` `"standalone"\|"back"\|"shared"`; `placementCount` (tačan broj prikaza na stranici); `createdAt`; `updatedAt`; `updatedByUserId?` | `by_menuServiceId_and_order`, `by_menuServiceId_and_slug`, `by_menuServiceId_and_key` |
| `menuSections` | `menuServiceId`; `pageId`; `key`; `name`; `description?`; `iconKey?`; `order`; `visibility`; `createdAt`; `updatedAt` | `by_pageId_and_order`, `by_menuServiceId`, `by_menuServiceId_and_key` |
| `menuArticles` | `menuServiceId`; `key`; `kind` `"item"\|"combo"`; `name`; `nameNormalized`; `description?`; `quantityValue?`; `quantityUnit?`; `basePriceRsd?`; `mediaMode` `"image"\|"icon"\|"none"` (novi artikal: `"none"`); `imageMediaId?` (`mediaAssets`); `iconKey?`; `createdAt`; `updatedAt`; `updatedByUserId?` | `by_menuServiceId_and_key`, `by_menuServiceId_and_nameNormalized`, `by_menuServiceId_and_kind` |
| `menuPlacements` | `menuServiceId`; `pageId`; `sectionId`; `articleId`; `order`; `visibility`; `createdAt`; `updatedAt` — **bez cene** | `by_sectionId_and_order`, `by_sectionId_and_articleId`, `by_articleId`, `by_pageId`, `by_menuServiceId` |
| `menuQrLinks` | `menuServiceId`; `cardId`; `pageKey?`; `active`; `createdAt`; `updatedAt` (`positionId?` [K20]) | `by_cardId`, `by_menuServiceId_and_pageKey`, `by_menuServiceId` |
| `menuMembers` | `menuServiceId`; `businessId`; `email`; `userId?`; `role` `"owner"\|"manager"\|"editor"`; `status` `"invited"\|"active"\|"removed"`; `inviteTokenHash?`; `inviteExpiresAt?`; `invitedByUserId`; `acceptedAt?`; `createdAt`; `updatedAt` | `by_menuServiceId_and_userId`, `by_menuServiceId_and_email`, `by_inviteTokenHash`, `by_userId` |
| `menuAuditLog` | `menuServiceId`; `actorKind` `"user"\|"staff"\|"admin"\|"guest"\|"system"`; `actorUserId?`; `actorRef?`; `action` (`lib/menu/audit.ts`); `entityType?`; `entityKey?`; `details?` (ravan zapis ≤ 20 ključeva); `createdAt` | `by_menuServiceId_and_createdAt` |

Ne postoji polje `accountId` na `menuServices`: nalog se uvek čita sa `businesses.accountId`, da ne zastari kad lokal pređe na drugi nalog. `settings` se dodaje u koracima koji ih koriste (jezici [K03], radno vreme i rezervacije [K25], pragovi panela [K23]/[K28]) kao opciona polja.

### 2.2 Tabele kasnijih koraka (plan iz K01 §3.2; korak ih uvodi i dopunjuje ovaj odeljak)

| Korak | Tabele i polja |
|---|---|
| K03 | `menuRoomService` (markupPercent?, markupScope, deliveryFeeRsd?), `menuRoomServiceCategories`, `menuRoomServiceItems` (manualPriceRsd?, manualVariantPrices?, priceWarning?); `menuServices.settings?.languages` |
| K04 | `menuArticles` + `allergens?`, `tags?`, `variantsEnabled?`, `addonsEnabled?`, `noteEnabled?`, `promo?`, `priceCheck?`, `translations?`; `translations?` na stranicama, sekcijama i RS kategorijama; `menuVariants`, `menuAddonGroups`, `menuAddonOptions`, `menuArticleAddonGroups`, `menuComboComponents`, `menuAvailability` |
| K05 | `menuVersions`, `menuVersionParts` (javni delovi po jezik × stranica, interni deo `_all`), `menuPresentation`, `menuEditorPresence`; `menuServices.liveVersionId?`, `liveVersionNumber?`; `menuDraftState.publishedRevision?`, `lock?` |
| K06 | `menuArticles.legacyPhotoStorageId?`; `menuServices.migration?`; indeks `by_legacyMenuId` |
| K14 | `menuExchangeRates` |
| K15 | `menuMediaUploads` |
| K20 | `menuZones`, `menuPositions`, `menuGuestSessions`; `menuQrLinks.positionId?` + `by_positionId` |
| K21 | `menuRequests`, `menuRequestItems` |
| K22 | `menuStaff`, `menuStaffSessions`, `menuPinAttempts`, `menuSecrets` |
| K23 | `menuPositionOccupancy` |
| K25 | `menuReservations` |
| K26 | `menuReservationReplies`, `menuMailConnections`, `menuMailOAuthStates`, `menuMessageTemplates` |
| K27 | `menuStaffNotices` |
| K29 | `menuAnalyticsEvents`, `menuAnalyticsCounters`, `menuAnalyticsDaily`, `menuAnalyticsSessionDays` |

Pravila šeme: samo proširenje (nova tabela, novo `v.optional` polje, novi indeks); nikad uklanjanje, preimenovanje ni sužavanje.

## 3. Površina funkcija po modulu

Greške su mašinski kodovi (`throw new ConvexError(MENU_ERROR.x)`, `lib/menu/errors/core.ts`; kasniji domeni dodaju `lib/menu/errors/<domen>.ts`). UI ih prevodi preko `menu-domen` rečnika (`errors[code]`). Upiti ne bacaju greške zbog pristupa: vraćaju `null`.

### 3.1 Helperi [K02 ✓]

| Fajl | Izvozi | Šta radi |
|---|---|---|
| `convex/lib/menuAccess.ts` | `requireMenuAccess(ctx, target, permission)`, `requireMenuAccessToRow(ctx, menuServiceId, permission)`, `getMenuAccess(...)`, `loadOwned(ctx, id, menuServiceId)`, `loadManyOwned`, `activeMenuServiceForBusiness`, `derivedMembership` | Jedina provera uloge i tenanta za korisnike sa nalogom. `target` je `{ menuServiceId }` ili `{ businessSlug }`. Redosled: prijava → usluga → admin prolazi → arhivirana usluga ili neaktivan lokal (`not_found`) → uloga (`forbidden`) → aktivan `scanme_menu` profil (`service_inactive`) → `clientEditingEnabled === true` za `menu.edit` i `menu.publish` (`editing_disabled`) → `roleCan` (`forbidden`). Mutacija adresirana ID-jem reda (usluga se čita iz reda) koristi `requireMenuAccessToRow`: korisnik bez uloge u toj usluzi dobija `not_found`, isto kao za nepostojeći ID (nema otkrivanja tuđih redova); član čija uloga nema dozvolu dobija `forbidden`. Tuđi ID iz argumenta (`loadOwned`) je uvek `not_found`. |
| `convex/lib/menuDraft.ts` | `loadDraftState`, `touchDraft(ctx, menuServiceId, userId, { articleDelta })`, `writeMenuAudit`, `auditActorKind` | `touchDraft` se zove **tačno jednom** po uspešnoj mutaciji nacrta (revizija + 1, ko je poslednji menjao, broj artikala); nikad na odbijen poziv, CAS konflikt ili no-op. |
| `convex/lib/menuDomainValidators.ts` | validatori | Deli ih šema i moduli. |
| `convex/lib/menuStaffAccess.ts` [K22] | `requireMenuStaff` | Sesija osoblja (heš tokena) ili korisnik V/M. |
| `convex/lib/menuGuestAccess.ts` [K20] | `requireMenuGuest` | Tenant i pozicija iz sesije gosta. |

### 3.2 Moduli

| Modul | Funkcije (vrsta · dozvola) | Korak |
|---|---|---|
| `convex/menuServices.ts` | `context` (q · `menu.read`; režim, uloga, dozvole, prekidači; `null` pri odbijanju); `ensureForBusiness` (m · vlasnik ili menadžer lokala ili admin; traži aktivan `scanme_menu` profil; režim je V1 podrazumevani; idempotentno); `adminProvision` (m · `requireAdmin`; bira režim, V1 samo `hospitality`; obezbeđuje profil kao `grantMenu`; audit u `menuAuditLog` i `adminAuditLog`); `adminSetMode` (m · `requireAdmin`; jedini pisac režima; isključuje prekidače koje novi režim ne podržava; dupli audit); helper `provisionMenuService` | K02 ✓ |
| `convex/menuPages.ts` | `list` (q · `menu.read`); `add`, `rename` (CAS), `duplicate`, `move`, `archive`, `restore`, `remove` (m · `menu.edit`); helper `pageHasActiveQr` | K02 ✓ |
| `convex/menuCatalog.ts` | sekcije: `addSection`, `renameSection` (CAS), `moveSection`, `removeSection`; artikli: `quickAddArticle` (naziv + cena; vraća `similar` kad postoji isti normalizovan naziv), `updateArticleFields` (CAS), `setBasePrice` (CAS; jedina cena za sve stranice); prikazi: `addPlacement`, `removePlacement` („Ukloni sa ove stranice"), `setPlacementVisibility` („Sakrij"), `movePlacement`; upiti `findSimilarArticles`, `pageContent` (`menu.read`) | K02 ✓ |
| `convex/menuRoomService.ts`, `convex/menuSettings.ts` | RS konfiguracija i obračun; jezici | K03 |
| `convex/menuArticleOptions.ts`, `menuCombos.ts`, `menuArticleDetails.ts`, `menuAvailability.ts` | varijante, dodaci, kombo, alergeni, oznake, akcije, brisanje artikla, živa dostupnost | K04 |
| `convex/menuPublishing.ts`, `menuPresence.ts`, `menuPublic.ts` | objava, verzije, vraćanje, prisustvo, javno čitanje | K05 |
| `convex/menuMigration.ts` (+ `menuAdmin.importDraftV2`) | interna migracija (internal), zaštita od dvostrukog upisa | K06 |
| `convex/menuPanel.ts` | shell i Početna, Operativa, ping | K08, K27 |
| `convex/menuBulk.ts` | Izaberi više | K11 |
| `convex/menuFx.ts` | kurs EUR (iza `MENU_FX_ENABLED`) | K14 |
| `convex/menuMedia.ts` | slike | K15 |
| `convex/menuTranslations.ts` | prevodi | K16 |
| `convex/menuPresentation.ts` | izgled | K17 |
| `convex/menuFloor.ts`, `menuQr.ts`, `menuGuest.ts` | lokal, QR, gost | K20, K21 |
| `convex/menuStaff.ts`, `menuWaiter.ts` | osoblje, PIN, konobarski panel | K22, K23 |
| `convex/menuReservations.ts`, `menuMail.ts`, `menuMailActions.ts` | rezervacije i odgovor gostu | K25, K26 |
| `convex/menuTeam.ts` | tim i pozivnice | K28 |
| `convex/menuAnalytics.ts`, `menuAnalyticsRollup.ts` | analitika | K29 |

### 3.3 Pravila za svaku novu funkciju

1. Argumenti imaju validatore; ID iz argumenta se proverava kroz `loadOwned`/`loadManyOwned`; spojni red proverava oba kraja.
2. Prvo `requireMenuAccess` (mutacija adresirana uslugom ili slugom), `requireMenuAccessToRow` (mutacija adresirana ID-jem reda) ili `getMenuAccess` (upiti); u upitu nema `Date.now()`.
3. Čitanja su ograničena (`.take(n)`, granice u `lib/menu/limits.ts`): stranica ≤ 50 po usluzi, sekcija ≤ 100 po stranici, prikaza ≤ 4.000 po stranici, artikala ≤ 2.000 po usluzi, QR veza ≤ 500 po stranici.
4. Tekst se čisti (`lib/menu/text.ts`) i odbija ako je predug; nikad se tiho ne seče.
5. Izmena polja koje može da menja više ljudi istovremeno ide kroz **CAS po vrednosti** (`lib/menu/cas.ts`): klijent šalje vrednost koju je video; pri razlici server ne piše i vraća `{ ok: false, conflicts, current }`.
6. Svaka nova funkcija ima test dozvoljenih i zabranjenih radnji po ulogama i test tenant izolacije.

## 4. Uloge

### 4.1 Matrica (`lib/menu/permissions.ts`)

V = Vlasnik (`owner`), M = Menadžer (`manager`), U = Urednik (`editor`), O = Osoblje (`staff`, PIN), A = ScanMe admin.

| Dozvola | V | M | U | O | A |
|---|---|---|---|---|---|
| `menu.read`, `menu.edit`, `menu.publish`, `menu.availability` | ✓ | ✓ | ✓ | – | ✓ |
| `features.edit`, `venue.edit`, `team.manage`*, `staff.pin`, `settings.edit`, `operations.read`, `analytics.read` | ✓ | ✓ | – | – | ✓ |
| `waiter.work` | ✓ | ✓ | – | ✓ | ✓ |
| `waiter.assignZones` | ✓ | ✓ | – | samo osoblje sa `panelRole: "manager"` [K22] | ✓ |
| `admin.mode`, `admin.import` | – | – | – | – | ✓ |

\* `canAssignRole`: Menadžer ne dodeljuje ulogu Vlasnik. Naplata i vlasništvo naloga su van Menu UI-ja. Osoblje ne menja dostupnost u V1 (K01 OTV 4). Gost nije uloga u matrici: njegove radnje proverava `requireMenuGuest` [K20].

### 4.2 Iz postojećih članstava (`lib/menu/roles.ts`)

| Izvor | Menu uloga |
|---|---|
| admin (`SCANME_ADMIN_EMAILS`) | `admin` |
| `accountMemberships.role = full_access` (uz opseg lokala) | `owner` |
| `accountMemberships.role = venue_management` (uz opseg lokala) | `manager` |
| `finance`, `view_only` | bez pristupa |
| aktivno legacy `businessMemberships` (nemigriran nalog) | `manager` |
| aktivan `menuMembers` red | eksplicitna uloga |

Efektivna uloga je **jača** od izvedene i eksplicitne. Postojeća članstva se ne menjaju; Urednik postoji samo kroz `menuMembers`. Menu pozivnice [K28] imaju sopstveni tok i nikad ne prave `businessMemberships` (postojeći `acceptInvitationForUser` bi dao pun legacy pristup).

## 5. Cene i redosled obračuna

- RSD u celim dinarima je jedini izvor istine (`lib/menu/rsd.ts`: ceo broj 0–1.000.000). Prikaz `1.490 RSD`; EUR je informativan, `~ 12,70 EUR` [K14].
- Artikal ima **jednu osnovnu cenu** (`menuArticles.basePriceRsd`); sve standardne stranice je koriste. Prikaz (`menuPlacements`) nema polje cene; stranica nema override. Promena cene ide kroz `menuCatalog.setBasePrice` (CAS) i ostaje u nacrtu do objave.
- Varijante imaju sopstvene cene [K04]. Kombo ima ručnu cenu; promena cene sastavnog artikla postavlja `priceCheck` na kombou i ne menja objavljenu cenu [K04].
- Room service [K03]: osnovna cena → procentualni markup (zaokruženje na najbliži dinar, npr. 450 + 15 % = 518) → ručna RS cena (tačno uneta) → jednokratna naknada na celu porudžbinu. Poreklo cene: `inherited` | `computed` | `manual`. Dodaci nemaju markup (K01 OTV 20).
- Komercijalne cene usluge (`lib/pricing/**`) menja samo K03; promena Menu cene ruši invarijantu paketa „kompletan" (K01 A9) i ide kao BLOKADA uz test predloga.
- Capability: Standard/Premium iz `getEntitlement(ctx, businessId, "scanme_menu")` + `lib/menu/capabilities.ts` [K03]; `MenuLimits` starog modela se ne menja.

## 6. Nacrt, objava i snapshotovi

- **Nacrt** [K02 ✓]: redovi tabela iz 2.1; svaka mutacija odmah piše i podiže `menuDraftState.revision` (`touchDraft`). Autosave u editoru [K10] šalje pojedinačne mutacije; konflikt po polju rešava CAS.
- **Objava** [K05]: `menuPublishing.publish({ expectedRevision, acknowledgedWarnings })` u jednoj transakciji sa budžetom (`lib/menu/budget.ts`, `ctx.meta.getTransactionMetrics()`): validacija (greške blokiraju, upozorenja traže potvrdu), `compileSnapshot` (`lib/menu/snapshot.ts`), upis verzije i delova, pa atomična promena `menuServices.liveVersionId`.
- **Verzija**: `menuVersions` + `menuVersionParts` (javni delovi po jezik × stranica, `_splitter`, `_rs`, ≤ 512 KiB UTF-8 po delu, deljeno po celim stavkama; interni deo `_all` za vraćanje). Javni deo nikad ne nosi skrivene i arhivirane elemente, interne nazive, nepotvrđene AI prevode ni ključeve van stranice.
- **Čuvanje**: tačno 20 verzija (`pruneVersions` u serijama, cron rezerva).
- **Vraćanje**: verzija → nacrt; javni meni se ne menja dok se ne objavi. Stranica sa QR vezom se nikad ne briše vraćanjem.
- **Dostupnost** (`menuAvailability`) i **prekidači** (`menuServices.features`) važe odmah, van verzije.
- **Prisustvo** [K05/K18]: `menuEditorPresence`, jedna pretplata po usluzi, `nowBucket` argument.

## 7. Granice real-time pretplata

| Površina | Pretplate | Granica |
|---|---|---|
| Editor | `pageContent` (jedna stranica), `menuServices.context`, prisustvo, status nacrta | upit stranice čita ≤ 4 indeksna upita; artikli jednim upitom kad ih je mnogo |
| Javni meni | jedan javni deo verzije + mala pretplata na dostupnost i broj verzije | ne zavisi ni od jednog polja koje se menja pri uređivanju |
| Konobarski panel | 3–4 po uređaju: statična sala, aktivni zahtevi (`take(300)` + `truncated`), rezervacije u prozoru ≤ 48 h, zauzetost | tajmeri se računaju na klijentu |
| Klijentski panel | po sekciji jedna agregatna pretplata | analitika iz dnevnih agregata |

Visoko promenljivi podaci su u zasebnim tabelama (`menuDraftState`, `menuAvailability`, `menuPositionOccupancy`, `menuEditorPresence`, `menuStaffSessions`).

## 8. Mapa ruta

| Ruta | Korak |
|---|---|
| `/[slug]/meni` (razdelnik ili podrazumevana stranica; inače stari put) | K13 |
| `/[slug]/meni/[stranica]` | K13 |
| `/[slug]/meni/room-service`, `/[slug]/meni/zahtevi` | K21 |
| `/[slug]/meni/rezervacija`, `/[slug]/meni/rezervacija/[token]` (GET prikazuje potvrdu, POST otkazuje) | K25 |
| `/[slug]/meni/editor` (stari editor za stare menije; nova usluga preusmerava) | K10 |
| `/r/[cardCode]` (samo grana `menu`), `/r/[cardCode]/meni` (hop) | K20 |
| `/[slug]/client-panel/meni` + `/editor`, `/operativa`, `/lokal`, `/funkcionalnosti`, `/tim`, `/analitika`, `/podesavanja` | K08 (shell), K10–K30 |
| `/[slug]/client-panel/meni/poziv/[token]` | K28 |
| `/[slug]/konobar/[kod]`, `/[slug]/konobar/[kod]/sesija` | K22 |
| `/api/meni/slike`, `/api/meni/rezervacija`, `/api/meni/mail/callback`, `/api/meni/analitika` | K15, K25, K26, K29 |
| `/admin/usluge/meni` i admin podstranica | K28 |

Slug stranice se izvodi jednom iz naziva i nikad se ne menja (`lib/menu/slugs.ts`); podrazumevana stranica ima slug `glavni`. Rezervisani slugovi stranica: `glavni`, `editor`, `room-service`, `zahtevi`, `rezervacija`, `api`, `konobar`, `pregled`, `_next`. Stari `/o/[code]` i `/panel/[venueCode]` ostaju netaknuti. Postojeće kartice `menu` bez `menuQrLinks` reda vode na `/{slug}/meni` kao danas.

## 9. Izlog (dev rute)

`/dev/menu-editor-preview`, `/dev/menu-public-preview`, `/dev/menu-lokal-preview`, `/dev/menu-konobar-preview`, `/dev/menu-panel-preview` [K07]. Svaka: `notFound()` u produkciji, `metadata.robots = { index: false, follow: false }`, prave prezentacione komponente sa tipiziranim fixtures (`components/menu/fixtures/**`), bez Convex poziva, `?tema=svetla|tamna`, nepoznat parametar daje podrazumevano stanje (`lib/menu/izlog-params.ts`). Parametri: `docs/MENI-PLAN.md` §7; postojeći `state=empty|long` i `design=dark` i dalje rade.

## 10. Struktura koda i komponenti

| Gde | Šta |
|---|---|
| `lib/menu/**` | čista logika, bez `next`, `react`, `@/` i `node:` uvoza (proverava `lib/menu/purity.test.ts`); izuzeci `lib/menu/http/**` (logika route handlera kao `(Request, deps) => Response`) i `lib/menu/testkit/**` (seed za testove) |
| `lib/menu/errors/*.ts` | mašinski kodovi grešaka po domenu, bez zavisnosti |
| `lib/menu/testkit/seed.ts` | `seedMenuWorld`, `seedQrLink`, `addAccountMember`, `addMenuMember` |
| `convex/menu*.ts` | Convex moduli (tačka 3.2); testovi pored modula |
| `components/menu/zajednicko/**` | primitivi i tokeni panela [K07] |
| `components/menu/fixtures/**` | tipizirani izmišljeni podaci za izlog [K07] |
| `components/menu/panel/**`, `studio/**`, `javni/**`, `gost/**`, `konobar/**`, `lokal/**`, `analitika/**` | UI po oblastima |
| `app/[slug]/client-panel/meni/**`, `app/[slug]/meni/**`, `app/[slug]/konobar/**`, `app/r/[cardCode]/meni/**`, `app/api/meni/**` | rute (stranice samo povezuju upite) |

Komponentni testovi idu u `components/menu/**/*.test.tsx`; testovi u `app/**`, `components/ordering/**` i `components/client-panel/**` se ne pokreću.

## 11. i18n površine

| Površina | Sadržaj | Korak |
|---|---|---|
| `menu-domen` | naziv podrazumevane stranice, „(kopija)", režimi, uloge, napomena o promeni režima, tekst svakog koda greške | K02 ✓ |
| `menu-zajednicko` | primitivi, stanja (prazno, greška, učitavanje) | K07 |
| `menu-panel` | shell i sekcije klijentskog panela | K08 |
| `menu-studio` | editor | K10 |
| `menu-javni` | javni meni | K13 |
| `menu-gost` | radnje gosta, korpa, rezervacija | K21, K25 |
| `menu-konobar` | konobarski panel | K22 |
| `menu-lokal` | Lokal i QR | K20 |
| `menu-analitika` | analitika | K30 |
| `menu-admin` (postojeća, proširuje se) | interni admin | K28 |

Dodavanje: interfejs u `lib/i18n/types.ts` (sme da uvozi tipove samo iz fajlova bez uvoza, npr. `lib/menu/errors/core.ts`) + red u `DictBySurface`, `lib/i18n/sr/<površina>.ts` sa `as const satisfies`, registracija u `lib/i18n/index.ts`. Convex uvozi `../lib/i18n/sr/<površina>` direktno; klijentske komponente uvoze `sr` modul direktno i `fmt` iz `@/lib/i18n/format`.

## 12. Migracija i rollback

- **Widen (run):** samo nove tabele i opciona polja (tačka 2).
- **Migrate [K06, ne pušta se]:** `convex/menuMigration.ts` — `planLegacyMigration` (dry-run izveštaj), `migrateLegacyMenuBatch` (≤ 100 stavki po seriji, nastavak kroz scheduler, idempotentno), `purgeMigratedService` (rollback). Izvor: `menus.draftModel` ili živa generacija. Mapiranje u `lib/menu/legacy-mapping.ts` (grupa → sekcija na „Kompletan meni", stavka → artikal sa `key = "lgc" + id`, varijante, slika kao `legacyPhotoStorageId`, nedostupno → `menuAvailability`; video, „Ide uz", dayparts i oblici grupa → izveštaj „nemapirano").
- **Kompatibilnost:** stari javni meni i editor rade dok usluga nema objavljenu novu verziju (`menuPublic.entry`: `new` | `legacy` | `none`); posle prelaska stari pisci vraćaju `menu/legacy_migrated`.
- **Narrow (posle runa, samo uz odobrenje vlasnika):** gašenje starog puta, brisanje starih tabela tek posle bekapa.
- **Rollback po fazi:** šema (novi kod se ne koristi) → migracija (`purgeMigratedService`) → objava (`restoreVersion` ili povratak na stari meni) → radnje gosta (prekidači) → QR (`menuQrLinks.active = false` vraća karticu na `/{slug}/meni`).
- **Za produkciju (K35):** deploy šeme → `menuAdmin:backfillMenuProfiles` → dry-run po lokalu → migracija → pregled → objava → praćenje → narrow uz odobrenje; env `MENU_PIN_PEPPER`, OAuth i ključ za šifrovanje, opciono `MENU_FX_ENABLED`.

## 13. Konvencije imena

- Convex moduli: `menu<Oblast>.ts` (camelCase), validatori u `convex/lib/menu*Validators.ts`, helperi u `convex/lib/menu*.ts`.
- Tabele: `menu<Množina>`; indeksi `by_<polje>_and_<polje>` po redu polja.
- Ključevi: `pg_…` (stranica), `sc_…` (sekcija), `ar_…` (artikal), 12 znakova Crockford base32; novi tipovi dodaju prefiks u `lib/menu/keys.ts`.
- Kodovi grešaka: `menu/<snake_case>` (jezgro); drugi domeni `<domen>/<snake_case>` u sopstvenom fajlu.
- Audit akcije: `<entitet>.<glagol>` u `lib/menu/audit.ts`; u `adminAuditLog` admin radnje dobijaju `menu_<glagol>`.
- Vrednosti unija na engleskom; sav tekst za korisnika na srpskom (latinica) kroz i18n.
- Fixtures i testovi: samo izmišljeni podaci („Kafana kod Mike", „Demo restoran", „Hotel Primer", `gost@example.com`, `+381 60 000 0000`).
