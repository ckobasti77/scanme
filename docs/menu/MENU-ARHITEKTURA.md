# ScanMe Menu V1 — recept arhitekture

> Ugovor za sve korake noćnog runa MENI (K02–K35). Izvor: `docs/meni/planovi/K01.md` (arhitektura i code-gap audit), master `ScanMe-Menu-Jovan-Claude-Handoff/docs/SCANME-MENU-MASTER-SPEC.md`, `docs/MENI-PLAN.md`.
> Kad korak promeni ponašanje koje ovaj dokument opisuje, ažurira ga u istom koraku. Oznaka **[Kxx]** kaže koji korak uvodi deo; **[K02 ✓]** znači da postoji u kodu.

## 1. Domen

| Pojam (master §3.1) | U kodu | Napomena |
|---|---|---|
| Nalog | `accounts` (postojeće) | Premium se vodi na nalogu: `getMenuCapabilities` → `getEntitlement(…, "scanme_menu")` [K03 ✓]. |
| Lokal | `businesses` (postojeće) | Tenant. |
| Menu usluga | `menuServices` | Jedna pretplata jednog lokala u jednom zaključanom režimu. V1: najviše jedna aktivna usluga po lokalu. |
| Režim rada | `menuServices.mode` | `hospitality` (V1), `services` (V1.1), `retail` (kasnije). Bira se pri kreiranju, klijent ga samo vidi. |
| Stranica menija | `menuPages` | Standardne stranice; svaka usluga automatski dobija `Kompletan meni` (`isDefault`). |
| Sekcija | `menuSections` | Grupa na jednoj stranici (master §3.3: nije poseban meni). |
| Artikal | `menuArticles` | Zajednički identitet i **jedna osnovna cena** u celim dinarima. |
| Prikaz artikla | `menuPlacements` | Artikal u sekciji stranice: redosled i vidljivost, **nikad cena**. |
| Kombo | `menuArticles.kind = "combo"` + `menuComboComponents` [K04 ✓] | Ručna cena; promena cene sastavnog artikla daje `priceCheck`, objavljena cena se ne menja. |
| Room service | `menuRoomService` + `menuRoomServiceCategories` + `menuRoomServiceItems` [K03 ✓] | Poseban Premium kanal, nije stranica; deli artikle, ima svoj izbor, kategorije, redosled i cenovna pravila. |
| Pozicija | `menuPositions` [K20] | Sto, soba ili druga tačka. |
| QR veza | `menuQrLinks` | Kartica → stranica (i pozicija od K20). `cardTargets` se ne proširuje. |

Osnovne odluke (K01 §0):

- **A1** — novi domen živi u novim tabelama `menu*`. Stari model (`menus`, `menuGroups`, `menuItems`, `itemVariants`, `itemPairings`, `menuDayparts`) i RFC-004 poručivanje (`orderingConfig`, `serviceRequests`, `staffPins`, …) ostaju netaknuti i rade kao pre (kompatibilnost).
- **A2** — nacrt su normalizovani redovi (svaka izmena odmah u bazi). Objava je nepromenljiva verzija (`menuVersions` + `menuVersionParts`) [K05 ✓]; čuva se 20 verzija; dostupnost je živi sloj (`menuAvailability`) [K04 ✓] i nije deo verzije.
- **A3** — svaki entitet nacrta ima stabilan `key` (`lib/menu/keys.ts`); svaka podtabela nosi `menuServiceId` i indeks koji počinje njime.
- **A4** — jedan helper pristupa `convex/lib/menuAccess.ts` i jedna matrica `lib/menu/permissions.ts`; identitet nikad iz argumenta.
- **A10** — prekidači Funkcionalnosti (`menuServices.features`) važe odmah; sadržaj, izgled i jezici idu kroz `Objavi`.

## 2. Tabele, polja i indeksi

Sve tabele su nove (`convex/schema.ts`, blok „ScanMe Menu V1 — the new Menu domain"); validatori su u `convex/lib/menuDomainValidators.ts` (ne uvozi `../schema`). `?` = `v.optional`. Polja i vrednosti unija su na engleskom; tekst za korisnika ide kroz i18n.

### 2.1 Jezgro [K02 ✓]

| Tabela | Polja | Indeksi |
|---|---|---|
| `menuServices` | `businessId`; `serviceProfileId?`; `legacyMenuId?` (stari `menus` red istog lokala, samo informativno); `mode` `"hospitality"\|"services"\|"retail"`; `modeSetAt`; `modeSetByUserId?`; `status` `"active"\|"archived"`; `features` {`callWaiter`, `billRequest`, `ordering`, `roomService`, `occupancy`: boolean; `reservations` `"off"\|"form"\|"external"`}; `settings?` {`languages?` {`source` (`"sr"`), `translations`: string[] bez izvornog}} [K03 ✓]; `createdAt`; `updatedAt` | `by_businessId`, `by_serviceProfileId` |
| `menuDraftState` | `menuServiceId`; `revision`; `articleCount` (tačan broj artikala, granica `MENU_MAX_ARTICLES`); `lastEditAt`; `lastEditByUserId?` | `by_menuServiceId` |
| `menuPages` | `menuServiceId`; `key`; `slug` (stabilan); `name` (interni); `publicTitle?`; `isDefault`; `order`; `visibility` `"visible"\|"hidden"`; `archivedAt?`; `iconKey?`; `navigation` `"standalone"\|"back"\|"shared"`; `placementCount` (tačan broj prikaza na stranici); `createdAt`; `updatedAt`; `updatedByUserId?` | `by_menuServiceId_and_order`, `by_menuServiceId_and_slug`, `by_menuServiceId_and_key` |
| `menuSections` | `menuServiceId`; `pageId`; `key`; `name`; `description?`; `iconKey?`; `order`; `visibility`; `createdAt`; `updatedAt` | `by_pageId_and_order`, `by_menuServiceId`, `by_menuServiceId_and_key` |
| `menuArticles` | `menuServiceId`; `key`; `kind` `"item"\|"combo"`; `name`; `nameNormalized`; `description?`; `quantityValue?`; `quantityUnit?`; `basePriceRsd?`; `mediaMode` `"image"\|"icon"\|"none"` (novi artikal: `"none"`); `imageMediaId?` (`mediaAssets`); `iconKey?`; `createdAt`; `updatedAt`; `updatedByUserId?` | `by_menuServiceId_and_key`, `by_menuServiceId_and_nameNormalized`, `by_menuServiceId_and_kind` |
| `menuPlacements` | `menuServiceId`; `pageId`; `sectionId`; `articleId`; `order`; `visibility`; `createdAt`; `updatedAt` — **bez cene** | `by_sectionId_and_order`, `by_sectionId_and_articleId`, `by_articleId`, `by_pageId`, `by_menuServiceId` |
| `menuQrLinks` | `menuServiceId`; `cardId`; `pageKey?`; `active`; `createdAt`; `updatedAt` (`positionId?` [K20]) | `by_cardId`, `by_menuServiceId_and_pageKey`, `by_menuServiceId` |
| `menuMembers` | `menuServiceId`; `businessId`; `email`; `userId?`; `role` `"owner"\|"manager"\|"editor"`; `status` `"invited"\|"active"\|"removed"`; `inviteTokenHash?`; `inviteExpiresAt?`; `invitedByUserId`; `acceptedAt?`; `createdAt`; `updatedAt` | `by_menuServiceId_and_userId`, `by_menuServiceId_and_email`, `by_inviteTokenHash`, `by_userId` |
| `menuAuditLog` | `menuServiceId`; `actorKind` `"user"\|"staff"\|"admin"\|"guest"\|"system"`; `actorUserId?`; `actorRef?`; `action` (`lib/menu/audit.ts`); `entityType?`; `entityKey?`; `details?` (ravan zapis ≤ 20 ključeva); `createdAt` | `by_menuServiceId_and_createdAt` |

Ne postoji polje `accountId` na `menuServices`: nalog se uvek čita sa `businesses.accountId`, da ne zastari kad lokal pređe na drugi nalog. `settings` (`menuServiceSettingsValidator`) raste za jedan opcioni ključ po koraku: jezici [K03 ✓], radno vreme i rezervacije [K25], pragovi panela [K23]/[K28].

### 2.1b Room service [K03 ✓]

| Tabela | Polja | Indeksi |
|---|---|---|
| `menuRoomService` | `menuServiceId`; `markupBps?` (bazni poeni, 1500 = 15 %, 0–30.000; odsutno = bez markup-a); `markupScope` `"all"\|"selected"`; `deliveryFeeRsd?` (jednom po porudžbini; odsutno = bez naknade); `createdAt`; `updatedAt`; `updatedByUserId?` | `by_menuServiceId` |
| `menuRoomServiceCategories` | `menuServiceId`; `key` (`rc_…`); `name`; `order`; `createdAt`; `updatedAt` | `by_menuServiceId_and_order` |
| `menuRoomServiceItems` | `menuServiceId`; `categoryId`; `articleId` (artikal je u RS-u najviše jednom); `order`; `markupApplies` (važi kad je `markupScope = "selected"`; nov red: `false`); `manualPriceRsd?`; `priceWarning?` {`oldBaseRsd`, `newBaseRsd`: number\|null; `at`}; `createdAt`; `updatedAt` | `by_categoryId_and_order`, `by_articleId`, `by_menuServiceId` |

Čuva se samo ručna RS cena; preuzeta i izračunata cena se uvek izvode iz `menuArticles.basePriceRsd` (`lib/menu/room-service-pricing.ts`). Naziv, opis, slika i alergeni ostaju na artiklu. Uključen/isključen je `menuServices.features.roomService`. Brisanje artikla [K04 ✓] briše i njegov `menuRoomServiceItems` red.

K04 dodaje `menuRoomServiceItems.manualVariantPrices?` (niz {`variantKey`, `priceRsd`, `priceWarning?`}, ≤ 20): ručna RS cena po varijanti, isti redosled obračuna (cena varijante, a bez nje osnovna cena → markup → ručna RS cena varijante) i isto upozorenje kad se promeni cena ispod ručne (sopstvena cena varijante ili osnovna cena za varijantu bez sopstvene).

### 2.1c Model artikla [K04 ✓]

Nova opciona polja na `menuArticles` (sve je podrazumevano isključeno, pa običan artikal ostaje `Naziv + Cena`):

| Polje | Značenje |
|---|---|
| `variantsEnabled?`, `addonsEnabled?`, `noteEnabled?` | prekidači varijanti, dodataka i slobodne napomene; isključen prekidač čuva redove |
| `allergens?` {`contains`: kod[], `mayContain`: kod[], `otherText?`} | 14 kategorija + `other` (`lib/menu/allergens.ts`); **odsustvo = nepoznato, nikad „bezbedno"**; prazna lista se ne čuva (zapis se briše) |
| `tags?` (kod[]) | oznake i prehrambene karakteristike (`lib/menu/tags.ts`, zatvoren spisak, bez tvrdnji „bez glutena") |
| `promo?` {`active`, `mode` `"price"\|"percent"`, `priceRsd?` \| `percent?` (ceo 1–99), `label?` `"promo"\|"recommended"`, `startsAt?`, `endsAt?`} | čuva se samo uneta vrednost; druga se izvodi (`lib/menu/promo.ts`); aktivnost se računa iz vremena gde se čita |
| `priceCheck?` {`since`, `changedComponentKeys`, `removedComponentNames`} | samo kombo: „proveri cenu komboa" (`lib/menu/combo.ts`) |
| `translations?` | prevodi po jeziku (piše K16); isto polje dobijaju `menuPages`, `menuSections`, `menuRoomServiceCategories`, `menuVariants`, `menuAddonGroups`, `menuAddonOptions` |

`menuServices.settings.allergensEnabled?` — alergeni su opcioni sistem lokala (master §7.3); odsutno ili `false` = isključeno: javni meni ne prikazuje alergene i novi zapisi se ne primaju (postojeći se ne brišu). Ide kroz nacrt. Zato `menuPresentation` [K05] **nema** polje `allergensEnabled`.

| Tabela | Polja | Indeksi |
|---|---|---|
| `menuVariants` | `menuServiceId`; `articleId`; `key` (`va_…`); `name`; `priceRsd?` (u nacrtu sme da fali); `order`; `translations?`; `createdAt`; `updatedAt` | `by_articleId_and_order`, `by_menuServiceId` |
| `menuAddonGroups` (povezana grupa) | `menuServiceId`; `key` (`ag_…`); `name`; `selection` `"single"\|"multiple"`; `required`; `minSelect?`; `maxSelect?` (napredno, `lib/menu/addons.ts`); `linkCount` (tačan broj veza); `translations?`; `createdAt`; `updatedAt`; `updatedByUserId?` | `by_menuServiceId` |
| `menuAddonOptions` | `menuServiceId`; `groupId`; `key` (`ao_…`); `name`; `priceDeltaRsd` (≥ 0, 0 = besplatno); `order`; `translations?`; `createdAt`; `updatedAt` | `by_groupId_and_order`, `by_menuServiceId` |
| `menuArticleAddonGroups` | `menuServiceId`; `articleId`; `groupId`; `order`; `createdAt` | `by_articleId_and_order`, `by_groupId`, `by_menuServiceId` |
| `menuComboComponents` | `menuServiceId`; `comboArticleId`; `componentArticleId` (samo `kind: "item"`); `quantity` (1–20); `order`; `createdAt` | `by_comboArticleId_and_order`, `by_componentArticleId`, `by_menuServiceId` |
| `menuAvailability` (živo, van nacrta i verzije) | `menuServiceId`; `articleKey`; `since`; `setByUserId?`; `setByRef?` — red postoji samo dok je artikal nedostupan | `by_menuServiceId`, `by_menuServiceId_and_articleKey` |

### 2.1d Nacrt, objava i verzije [K05 ✓]

Nova opciona polja: `menuServices.liveVersionId?` (`menuVersions`) i `liveVersionNumber?` — menja ih samo `menuPublishing.publish`; odsutno = nikad objavljeno. `menuDraftState.publishedRevision?` (revizija nacrta iz koje je nastala živa verzija; nacrt ima neobjavljene izmene dok se razlikuje od `revision`) i `restoredFromNumber?` (verzija vraćena u nacrt posle poslednje objave; sledeća verzija je beleži).

| Tabela | Polja | Indeksi |
|---|---|---|
| `menuVersions` (nepromenljiva) | `menuServiceId`; `number` (1, 2, 3… po usluzi); `publishedAt`; `publishedByUserId`; `actorKind`; `draftRevision`; `summary` {`changedPrices`, `newArticles`, `removedArticles`, `structural` {`hidden`, `removedFromPage`, `deleted`, `reordered`}}; `restoredFromNumber?`; `languages` (izvorni prvi); `pageCount`; `articleCount` (javnih); `bytes`; `partCount`; `formatVersion` (1); `contentHash`; `publicHash?` (heš svih javnih delova); `retiredAt?` (ispala iz poslednjih 20, delovi se brišu) | `by_menuServiceId_and_number`, `by_retiredAt` |
| `menuVersionParts` | `versionId`; `menuServiceId`; `scope` `"public"\|"internal"`; `lang` (`*` za interni); `pageKey` (ključ stranice, `_splitter`, `_rs`, `_all`); `part`; `data` (JSON ≤ 512 KiB UTF-8) | `by_versionId_and_scope_and_lang_and_pageKey_and_part` |
| `menuPresentation` | `menuServiceId`; `layout` `"flow"\|"categories"\|"compact"`; `paletteId`; `brandColors?`; `fontPairId`; `density` `"airy"\|"standard"\|"dense"`; `emphasis` `"calm"\|"bold"`; `defaultMediaMode`; `search`; `filters` (kodovi, nikad raspon cena); `currencyToggle`; `branding` `"standard"\|"reduced"`; `createdAt`; `updatedAt`; `updatedByUserId?` — bez reda važe `MENU_DEFAULT_PRESENTATION` (`lib/menu/presentation.ts`); piše ga K17 (K05 samo objavljuje i vraća) | `by_menuServiceId` |
| `menuEditorPresence` (visoko promenljivo) | `menuServiceId`; `userId`; `sessionId`; `entityType?` `"article"\|"section"\|"page"\|"room_service"\|"settings"\|"presentation"`; `entityKey?`; `expiresAt`; `updatedAt` | `by_menuServiceId_and_expiresAt`, `by_userId_and_sessionId`, `by_expiresAt` |

`menuDraftState.lock?` (vraćanje u serijama) nije dodat: vraćanje je jedna transakcija ispod budžeta, a serije su odložene u K18.

### 2.1e Migracija starog modela [K06 ✓]

| Tabela | Nova opciona polja i indeksi | Značenje |
|---|---|---|
| `menuServices` | `migration?` {`status` `"running"\|"migrated"\|"cutover"`, `legacyMenuId`, `sourceKind` `"draft"\|"live"`, `sourceRevision`, `startedAt`, `migratedAt?`, `cutoverAt?`}; indeks `by_legacyMenuId` | faza migracije starog menija (`legacyMenuId`) u ovu uslugu; piše ga samo `convex/menuMigration.ts`; `cutover` gasi stare pisce (§12.4) |
| `menuSections` | `legacyRef?` | stara grupa (`draft:<id>`, `live:<id>`) ili uvezena grupa (`import:<id>`) iz koje je sekcija nastala; odsutno = napravljena u editoru |
| `menuArticles` | `legacyRef?`; `legacyPhotoStorageId?` (`_storage`) | stara stavka ili uvezen red iz kog je artikal nastao; stara fotografija čeka obradu (K15 je pretvara u `mediaAssets` sliku), a do tada artikal prikazuje ikonicu |

### 2.2 Tabele kasnijih koraka (plan iz K01 §3.2; korak ih uvodi i dopunjuje ovaj odeljak)

| Korak | Tabele i polja |
|---|---|
| K03 ✓ | tačka 2.1b i `menuServices.settings?.languages`. `markupPercent` iz plana je postao `markupBps` (ceo broj, bez float greške); `manualVariantPrices?` (ručna RS cena po varijanti) dodaje K04 uz varijante. |
| K04 ✓ | tačka 2.1c; `priceCheck` je proširen u odnosu na plan (`changedComponentKeys`, `removedComponentNames` umesto `reason`), `menuAddonGroups.linkCount` je dodat (broj pogođenih artikala bez čitanja svih veza), `menuServices.settings.allergensEnabled` zamenjuje planirano `menuPresentation.allergensEnabled` |
| K05 ✓ | tačka 2.1d; `lock?` odložen u K18; dodati `menuDraftState.restoredFromNumber?`, `menuVersions.retiredAt?` + `by_retiredAt` (ograničeno brisanje starih verzija) i `menuVersions.contentHash` |
| K06 ✓ | tačka 2.1e; dodat je `legacyRef?` na `menuArticles` i `menuSections` (rollback briše samo redove koje je napravila migracija ili uvoz) |
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
| `convex/lib/menuAccess.ts` | `resolveMenuAccess(ctx, target)` (K08: pristup ili kod odbijanja, za upit koji mora da razlikuje odbijanja), `requireMenuAccess(ctx, target, permission)`, `requireMenuAccessToRow(ctx, menuServiceId, permission)`, `getMenuAccess(...)`, `loadOwned(ctx, id, menuServiceId)`, `loadManyOwned`, `activeMenuServiceForBusiness`, `derivedMembership` | Jedina provera uloge i tenanta za korisnike sa nalogom. `target` je `{ menuServiceId }` ili `{ businessSlug }`. Redosled: prijava → usluga → admin prolazi → arhivirana usluga ili neaktivan lokal (`not_found`) → uloga (`forbidden`) → aktivan `scanme_menu` profil (`service_inactive`) → `clientEditingEnabled === true` za `menu.edit` i `menu.publish` (`editing_disabled`) → `roleCan` (`forbidden`). Mutacija adresirana ID-jem reda (usluga se čita iz reda) koristi `requireMenuAccessToRow`: korisnik bez uloge u toj usluzi dobija `not_found`, isto kao za nepostojeći ID (nema otkrivanja tuđih redova); član čija uloga nema dozvolu dobija `forbidden`. Tuđi ID iz argumenta (`loadOwned`) je uvek `not_found`. |
| `convex/lib/menuDraft.ts` | `loadDraftState`, `touchDraft(ctx, menuServiceId, userId, { articleDelta })`, `writeMenuAudit`, `auditActorKind` | `touchDraft` se zove **tačno jednom** po uspešnoj mutaciji nacrta (revizija + 1, ko je poslednji menjao, broj artikala); nikad na odbijen poziv, CAS konflikt ili no-op. |
| `convex/lib/menuDomainValidators.ts` | validatori | Deli ih šema i moduli. |
| `convex/lib/menuCapabilities.ts` [K03 ✓] | `getMenuCapabilities(ctx, businessId)`, `requireMenuCapability(ctx, businessId, capability)` | Jedino mesto koje odlučuje Standard/Premium: proširuje lanac `getEntitlement(…, "scanme_menu")` (subscriptions_v1 Premium naloga → aktivan red lokala → plan naloga, enterprise = premium) i mapira ga kroz `lib/menu/capabilities.ts`. Premium važi za sve lokale naloga. `requireMenuCapability` baca `plan/premium_required`, i za ScanMe admina: komercijalni gate se ne zaobilazi, Premium se daje kroz entitlement. |
| `convex/lib/menuLegacyMigration.ts` [K06 ✓] | `loadActiveMenuService`, `legacyMenuForService`, `defaultPageOf`, `loadLegacySource`, `loadLegacyTarget`, `writeLegacySlice`, `legacyPlanOptions`, `LEGACY_MIGRATION_ACTOR_REF` | Čita stari izvor (nacrt ili živu generaciju) i nacrt novog modela, i upisuje deo plana (`lib/menu/legacy-mapping.ts`). Stare tabele samo čita. |
| `convex/lib/menuLegacyGuard.ts` [K06 ✓] | `assertLegacyMenuWritable(ctx, menuId)` | Posle prelaska (`migration.status === "cutover"`) stari pisci odbijaju sa tekstom `menu-editor.legacyMigrated`; pre prelaska rade kao pre. |
| `convex/lib/menuStaffAccess.ts` [K22] | `requireMenuStaff` | Sesija osoblja (heš tokena) ili korisnik V/M. |
| `convex/lib/menuGuestAccess.ts` [K20] | `requireMenuGuest` | Tenant i pozicija iz sesije gosta. |

### 3.2 Moduli

| Modul | Funkcije (vrsta · dozvola) | Korak |
|---|---|---|
| `convex/menuServices.ts` | `context` (q · `menu.read`; režim, uloga, dozvole, prekidači; `null` pri odbijanju); `ensureForBusiness` (m · vlasnik ili menadžer lokala ili admin; traži aktivan `scanme_menu` profil; režim je V1 podrazumevani; idempotentno); `adminProvision` (m · `requireAdmin`; bira režim, V1 samo `hospitality`; obezbeđuje profil kao `grantMenu`; audit u `menuAuditLog` i `adminAuditLog`); `adminSetMode` (m · `requireAdmin`; jedini pisac režima; isključuje prekidače koje novi režim ne podržava; dupli audit); helper `provisionMenuService` | K02 ✓ |
| `convex/menuPages.ts` | `list` (q · `menu.read`); `add`, `rename` (CAS), `duplicate`, `move`, `archive`, `restore`, `remove` (m · `menu.edit`); helper `pageHasActiveQr` | K02 ✓ |
| `convex/menuCatalog.ts` | sekcije: `addSection`, `renameSection` (CAS), `moveSection`, `removeSection`; artikli: `quickAddArticle` (naziv + cena; vraća `similar` kad postoji isti normalizovan naziv), `updateArticleFields` (CAS), `setBasePrice` (CAS; jedina cena za sve stranice); prikazi: `addPlacement`, `removePlacement` („Ukloni sa ove stranice"), `setPlacementVisibility` („Sakrij"), `movePlacement`; upiti `findSimilarArticles`, `pageContent` (`menu.read`) | K02 ✓ |
| `convex/menuRoomService.ts` | `get` (q · `menu.read`; radi i na Standardu: `available`, `enabled`, pravila, kategorije sa artiklima, cena i poreklo, upozorenje, `notInRoomService`); `updateSettings` (CAS: `markupPercent` 0–300 sa najviše dve decimale, `markupScope`, `deliveryFeeRsd`; 0 ili null briše); `addCategory`, `renameCategory` (CAS), `moveCategory`, `removeCategory` (samo prazna, inače `room_service/category_not_empty`); `addItems` (≤200, preskače artikle koji su već u RS-u); `importWholeMenu` (jednokratno kopiranje vidljivih sekcija i artikala „Kompletnog menija“); `moveItem`, `removeItem`; `setItemsMarkup` (≤200); `setManualPrice` (CAS; briše upozorenje); `resolvePriceWarning` (`keepManual` \| `recomputeFromMarkup`). Sve izmene: `menu.edit` + Premium (`roomService`), `touchDraft` jednom. Helper `flagRoomServicePriceWarnings` zove `menuCatalog.setBasePrice` u istoj transakciji. | K03 ✓ |
| `convex/menuSettings.ts` | `languages` (q · `menu.read`; izvorni, prevodi, `maxLanguages`, `tier`); `setLanguages` (m · `settings.edit`; Standard 2 jezika sa izvornim, Premium do 10; iznad limita samo uklanjanje i preuređivanje; `plan/language_limit`; ide kroz nacrt) | K03 ✓ |
| `convex/menuServices.ts` (dopuna) | `context` vraća i `capabilities`; `setFeature` (m · `features.edit`; prekidači `callWaiter`, `billRequest`, `ordering`, `roomService`, `occupancy` važe odmah; uključivanje RS-a traži Premium, isključivanje nikad; audit `feature.changed`; `reservations` dobija svoj pisac u K25) | K03 ✓ |
| `convex/menuArticleOptions.ts` | `setArticleOptionSwitches` (prekidači varijanti, dodataka i napomene); varijante: `addVariant` (sam uključuje varijante; ne za kombo), `updateVariant` (CAS; promena cene zove `onVariantPriceChanged`), `removeVariant`, `moveVariant`; povezane grupe: `createAddonGroup`, `attachAddonGroup` („postojeća grupa"), `detachAddonGroup` (grupa ostaje), `moveArticleAddonGroup`, `applyAddonGroupToArticles` („Primeni i na druge artikle", ≤ 200), `updateAddonGroup` (CAS), `copyAddonGroupForArticle`, `addAddonOption`, `updateAddonOption` (CAS), `removeAddonOption`, `moveAddonOption`, `deleteAddonGroup` (audit) — sve izmene grupe i dodataka primaju `onlyForArticleId?`: bez njega menja se grupa za SVE povezane artikle, sa njim se u istoj transakciji pravi nezavisna kopija za taj artikal i menja kopija; upiti `articleOptions`, `addonGroupUsage` („koje artikle pogađa"), `listAddonGroups`. Sve izmene `menu.edit`, upiti `menu.read`. | K04 ✓ |
| `convex/menuCombos.ts` | `createCombo` (kombo artikal sa ručnom cenom + prikaz u sekciji + sastavni artikli), `setComboComponents` (cela lista; cena i oznaka se ne diraju), `resolvePriceCheck` („Zadrži cenu"); upiti `comboDetail` (sastav, pojedinačne cene, zbir, oznaka sa imenima), `combosContainingArticle`. Nova cena komboa ide kroz `menuCatalog.setBasePrice`. | K04 ✓ |
| `convex/menuPromos.ts` | `setPromo` (CAS na celu akciju; `checkPromo`; zakazana uključena akcija traži Premium `scheduledPromos`), `setPromoActive` (ručni prekidač), upit `articlePromo` (regularne i akcijske cene bez sata). | K04 ✓ |
| `convex/menuArticleDetails.ts` | `setAllergensEnabled` (prekidač usluge, nacrt), `allergenSettings`; `setArticleAllergens` (CAS; samo uz uključene alergene; prazno = zapis se briše; `Drugo` traži opis), `setArticleTags` (CAS); `articleDeletionImpact` + `deleteArticle` (dva koraka sa tokenom; briše prikaze, varijante, veze grupa, sastav komboa, RS red i dostupnost; kombo artikli dobijaju oznaku; audit `article.deleted`); `articleIssues` (validacija za objavu jednog artikla iz nacrta). K11: helperi `loadDeletionPlan` i `applyArticleDeletion` su izvezeni za `menuBulk` (broj prikaza stranice se čita ponovo pri upisu, jer serija menja istu stranicu više puta). | K04 ✓, K11 |
| `convex/menuAvailability.ts` | `setAvailability` (m · `menu.availability`; živo, bez `touchDraft`, ne zavisi od `clientEditingEnabled`), `unavailableArticles` (q · `menu.read`). | K04 ✓ |
| `convex/menuRoomService.ts` (dopuna) | `setManualVariantPrice` (CAS), `resolveVariantPriceWarning`; `get` vraća i varijante sa cenom, poreklom i upozorenjem. | K04 ✓ |
| `convex/lib/menuArticleHooks.ts` | `flagCombosForPriceChange`, `detachComponentFromCombos`, `onVariantPriceChanged`, `onVariantRemoved` — posledice u istoj transakciji, bez `touchDraft` (zove ga pozivalac jednom). | K04 ✓ |
| `convex/menuPublishing.ts` | `draftStatus` (q · `menu.read`; `state` `never_published`\|`clean`\|`dirty`, revizije, ko je poslednji menjao); `publishPreview` (q · `menu.read`; `revision` pregledanog nacrta, greške, upozorenja i njihov `fingerprint`, sažetak posledica, budžet); `publish` (m · `menu.publish`; `expectedRevision`, `acknowledgedWarnings`; odbijanja se VRAĆAJU: `stale_draft`, `no_changes`, `validation_failed`, `confirmation_required`; baca pristup i `menu/publish_too_large`); `listVersions` (q · `menu.read`; najnovijih 20); `restoreVersion` (m · `menu.publish`; `expectedRevision`; verzija → nacrt, javni meni se ne menja; QR stranice se zadržavaju; `menu/restore_too_large`); `pruneVersion`, `sweepRetiredVersions` (internal; cron); helper `executePublish` (jezgro objave, ubrizgavanje greške u testu) i `versionSnapshot` | K05 ✓ |
| `convex/menuPresence.ts` | `heartbeat` (m · `menu.edit`; piše samo kad se entitet promeni ili red ističe), `leave` (m · `menu.read`), `listForService` (q · `menu.read`; `nowBucket` iz klijenta), `cleanupExpired` (internal; cron) | K05 ✓ |
| `convex/menuPublic.ts` (bez prijave) | `entry` (`new`\|`legacy`\|`none`), `page` (`slug`, `pageSlug?`, `lang?`; jedna stranica ili `splitter`), `roomService` (samo uz živ prekidač), `availability` (`menuServiceId`; živo) — čitaju samo objavljenu verziju i žive slojeve | K05 ✓ |
| `convex/lib/menuDraftLoad.ts`, `convex/lib/menuRestore.ts` | ceo nacrt jednim ograničenim upitom po tabeli → `MenuDraftSnapshot`; upis razlike pri vraćanju | K05 ✓ |
| `convex/menuMigration.ts` (samo internal) | `planLegacyMigration` (iq; izveštaj bez upisa + provera već migriranih redova); `migrateLegacyMenuBatch` (im; ≤ 100 artikala po seriji, nastavak kroz scheduler, idempotentno); `purgeMigratedService` (im; rollback u serijama); `cutoverLegacyMenu` / `revertLegacyCutover` (im; gašenje i vraćanje starih pisaca) — §12 | K06 ✓ |
| `convex/menuAdmin.ts` (dopuna) | `importDraftV2` (m · `requireAdmin`; `parseMenuImport` → nacrt nove usluge; `dryRun`; samo u nacrt bez artikala; nikad ne objavljuje; audit u oba dnevnika); zaštita `assertLegacyMenuWritable` u `importDraft` i `publishForClient` | K06 ✓ |
| `convex/menu.ts` (dopuna) | zaštita `assertLegacyMenuWritable` u `saveDraft`, `publishDraft` i `setItemAvailable` | K06 ✓ |
| `convex/menuPanel.ts` | `entry` (q · bez greške; `available` samo uz `menu.read` na aktivnoj usluzi lokala, inače `none`; ulaz u postojećem klijentskom panelu); `shellContext` (q · `resolveMenuAccess`; `unauthenticated` \| `forbidden` (bez uloge ILI bez usluge: isti odgovor, slug nije orakl) \| `inactive` (uloga postoji, profil isključen) \| `available` sa `menuServiceId`, `business { name, slug }`, `mode`, `actor`, `canEdit`, `plan`; ništa više). Šta akter VIDI računa `lib/menu/panel-nav.ts` iz iste matrice `roleCan`; svaka sekcija svojim upitom ponovo proverava dozvolu. Usluga se po slug-u traži samo među aktivnim, pa arhivirana usluga nema panel ni za admina. Kasnije: Početna, Operativa, ping | K08 ✓, K27 |
| `convex/menuStudio.ts` | `entry` (q · bez greške; `studio` kad pozivalac ima `menu.read` na aktivnoj usluzi novog modela koja nije vezana za nezavršenu migraciju starog menija, `legacy` kad usluga ima `legacyMenuId` a `migration.status` nije `cutover` (stari editor ostaje jedini pisac), inače `none`); `pages` (q · `menu.read`; stranice po redosledu sa `hasQr` iz `pageHasActiveQr`); `quickAddMany` (m · `menu.edit`; tabelarni unos ≤ 50 redova jedne stranice, sve ili ništa: red bez odluke čiji normalizovan naziv postoji vraća `similar` i ništa se ne piše, drugi poziv nosi odluku po redu `new` | `existing` | `skip`; jedan `touchDraft`). `menuCatalog.pageContent` uz artikal vraća i `variantsEnabled` i `priceCheck` (red editora bez dodatnog čitanja). | K10 ✓ |
| `convex/menuBulk.ts` | `Izaberi više`, jedna mutacija po radnji, najviše `MENU_MAX_BULK_BATCH` (200) različitih ID-jeva jedne usluge (argument `menuServiceId`; tuđ ili nepostojeći ID odbija celu seriju sa `menu/not_found`; pozivalac bez uloge dobija isto — `requireMenuAccessToRow`); sve ili ništa u jednoj transakciji; `touchDraft` tačno jednom po seriji koja je nešto promenila: `setPrices` (m · `menu.edit`; CAS na cenu koju je osoba videla za SVAKI artikal pre bilo kakvog upisa, konflikt vraća `{status:"conflict", conflicts}` i ne piše ništa; iste posledice kao `setBasePrice` — RS upozorenja i kombo „proveri cenu“; kombo artikli posle sastojaka, pa nova cena komboa u istoj seriji briše oznaku); `setAvailability` (m · `menu.availability`; UŽIVO, bez `touchDraft`, ne zavisi od `clientEditingEnabled`); `setVisibility`, `removeFromPage`, `moveToSection` (prikazi jedne stranice na kraj ciljne sekcije, redosledom sa stranice; već prisutni se preskaču), `addToPage` (isti artikal u sekciji druge stranice; duplikati se preskaču; plafon prikaza po stranici) — sve m · `menu.edit`, nacrt; upiti `pageSections` (sekcije jedne stranice za „Dodaj na drugu stranicu“), `deleteImpact` (posledice po artiklu + token cele serije, `null` za tuđ ID); `deleteArticles` (dva koraka; token je `bulkDeletionConfirmToken` iz `lib/menu/deletion.ts` nad posledicama svih artikala; kombo artikli se brišu prvi; upis preko `applyArticleDeletion`) | K11 ✓ |
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
- Varijante [K04 ✓] imaju sopstvene konačne cene; varijanta bez sopstvene cene koristi osnovnu. Dodatak je doplata ≥ 0 (0 = besplatno). Kombo ima ručnu cenu (`basePriceRsd` kombo artikla); promena cene sastavnog artikla (osnovne ili varijante) ili njegovo brisanje postavlja `priceCheck` na kombou u istoj transakciji (`convex/lib/menuArticleHooks.ts`) i ne menja cenu; odluka klijenta je `menuCombos.resolvePriceCheck` („Zadrži cenu") ili nova cena kroz `menuCatalog.setBasePrice`, koja briše oznaku.
- Akcija [K04 ✓, `lib/menu/promo.ts`]: akcijska cena (samo uz osnovnu cenu i bez varijanti, 1 ≤ cena < regularne) ili procenat (ceo 1–99, važi i za cene varijanti); druga vrednost se izvodi, cena iz procenta se zaokružuje na najbliži dinar, pola naviše (450 − 15 % = 383). Ručno uključivanje je Standard; `startsAt`/`endsAt` (unos u beogradskom vremenu, `promoWindowFromBelgradeLocal`) traže Premium (`scheduledPromos`) dok je akcija uključena. Posle `endsAt` regularna cena se vraća sama: `promoStateAt(promo, now)` računa javni meni i editor, nikad upit ni posao.
- Room service [K03 ✓, `lib/menu/room-service-pricing.ts`]: osnovna cena → procentualni markup za sve ili izabrane artikle (bazni poeni, celobrojno zaokruženje na najbliži dinar, pola naviše: 450 + 15 % = 518) → ručna RS cena (tačno uneta) → jednokratna naknada na celu porudžbinu (`roomServiceOrderTotal`). Poreklo cene: `inherited` | `computed` | `manual`. Bez ručne cene promena osnovne cene sama menja RS cenu. Sa ručnom cenom `setBasePrice` postavlja `priceWarning`: stara osnovna je cena uz koju je ručna potvrđena, a povratak na nju briše upozorenje. Akcije su `Zadrži ručnu cenu` i `Ponovo izračunaj prema markup-u`. Dodaci nemaju markup (K01 OTV 20).
- Komercijalne cene usluge (`lib/pricing/**`): **BLOKADA K03**. Menu 1.490 / 14.900 i paket „lokal“ 1.990 / 19.900 uz nepromenjen paket „kompletan“ (3.790 / 37.990) ruše invarijantu 4 za korpe sa svih pet usluga (K01 A9). Zato `DEFAULT_PRICING_CONSTANTS` i golden ostaju isti dok vlasnik ne izabere cenu paketa „kompletan“ (opseg [4.179, 4.424] mesečno, [41.997, 44.492] godišnje). Dokaz i proveren kandidat (4.290 / 42.900) su u `lib/pricing/menu-launch-proposal.test.ts`, a recept za primenu u `docs/tasks/BLOCKED.md` → `SCANME MENU V1 — K03`. Premium 990 / 9.990 je već usklađen. PDV prikaz se ne menja (P9).
- Capability [K03 ✓]: `lib/menu/capabilities.ts` (`MENU_STANDARD`, `MENU_PREMIUM`, `menuCapabilitiesFor`) je jedina tabela onoga što Premium otključava: `roomService`, `aiTranslations`, `scheduledPromos`, `extraLayouts`, `advancedAnalytics`, `csvExport`, `reducedBranding`; `maxLanguages` je 2 (Standard, sa izvornim) ili 10 (tehnička granica). Convex je čita kroz `convex/lib/menuCapabilities.ts`, a gate-ovi kasnijih koraka zovu `requireMenuCapability`. Gubitak Premium-a ništa ne briše: isključivanje je uvek dozvoljeno, jezici mogu samo da se smanje, a objava [K05] isključuje Premium sadržaj uz upozorenje. `MenuLimits` starog modela se ne menja.
- Jezici [K03 ✓, `lib/menu/languages.ts`]: izvorni `sr`, prevodi iz radnog spiska ISO kodova; `checkLanguageChange` je jedina provera.

## 6. Nacrt, objava i snapshotovi

- **Nacrt** [K02 ✓]: redovi tabela iz 2.1; svaka mutacija odmah piše i podiže `menuDraftState.revision` (`touchDraft`). Autosave u editoru [K10 ✓] šalje pojedinačne mutacije kroz red čuvanja `lib/menu/studio/autosave-queue.ts` (ključ po polju, npr. `cena:<articleId>`; svaka izmena nosi vrednost koju je osoba videla; nova vrednost dok je prethodna u letu čeka i šalje se posle nje; konflikt zaustavlja ključ i ništa ne gazi; greška ostaje na ekranu uz `Pokušaj ponovo`); konflikt po polju rešava CAS. Strukturne radnje (dodavanje, brisanje, preimenovanje) se ne odlažu, ali se prate da status kaže „Čuva se…“.
- **Status nacrta** [K05 ✓]: `menuPublishing.draftStatus` — `never_published` (nema žive verzije), `clean` (`publishedRevision === revision`) ili `dirty`; nosi i ko je poslednji menjao.
- **Pregled pre objave** [K05 ✓]: `menuPublishing.publishPreview` vraća `revision` pregledanog nacrta, greške, upozorenja sa `fingerprint`-om, sažetak posledica (`lib/menu/publish-summary.ts`: izmenjene cene, novi i uklonjeni artikli, sakriveno, uklonjeno sa stranice, obrisano, redosled) i budžet.
- **Objava** [K05 ✓]: `menuPublishing.publish({ menuServiceId, expectedRevision, acknowledgedWarnings })` je jedna transakcija, redom: (1) nacrt promenjen posle pregleda (ista ili druga osoba) → `stale_draft` sa trenutnom revizijom i poslednjim urednikom; (2) nacrt jednak živoj verziji I javni izlaz jednak živom (`menuVersions.publicHash`) → `no_changes` (nepromenjen nacrt se objavljuje kad se promeni ono što gost dobija: uključen Room service, izgubljen Premium; `publishPreview.wouldChange`); (3) greške → `validation_failed`; (4) upozorenja bez tačnog `fingerprint`-a → `confirmation_required` (novo ili promenjeno upozorenje traži novu potvrdu); (5) `compileSnapshot` + budžet (`lib/menu/budget.ts`, `ctx.meta.getTransactionMetrics()`, inače `menu/publish_too_large`); (6) upis verzije i svih delova, PA TEK ONDA `menuServices.liveVersionId` i `publishedRevision`; (7) verzija koja ispada iz poslednjih 20 dobija `retiredAt` i zakazano brisanje; (8) brišu se redovi dostupnosti artikala kojih više nema; (9) audit `version.published`. Odbijanje ne piše ništa; svaka greška posle upisa delova poništava celu transakciju, pa javni meni nikad ne vidi pola verzije.
- **Provere objave** [K05 ✓, `lib/menu/publish-checks.ts`]: K04 pravila artikla (`validateDraftForPublish`) nad snapshotom + upozorenja cele objave (`MENU_PUBLICATION_WARNINGS`): `translation_missing` (po jeziku; tekstovi koje gost vidi bez potvrđenog prevoda, AI predlog se ne računa), `room_service_premium` (Room service uključen, a nalog bez Premium-a: ne objavljuje se), `language_premium` (jezik iznad limita paketa: ne objavljuje se). Zakazana akcija bez Premium-a se ne objavljuje (gost vidi regularnu cenu).
- **Verzija** [K05 ✓, `lib/menu/snapshot.ts`]: `menuVersions` + `menuVersionParts`. Interni deo `_all` (`lang` `*`) je ceo nacrt po ključevima (`MenuDraftSnapshot`), za vraćanje i sažetak; deli se na granici znaka. Javni delovi po jeziku: `_splitter` (vidljive stranice, jezici, izgled, alergeni uključeni, Room service), jedan deo po javnoj stranici (vidljive sekcije sa bar jednim prikazanim artiklom, artikli u redosledu; duga sekcija se nastavlja u sledećem delu po celim artiklima, `continued`), `_rs` (Room service sa konačnom cenom i poreklom, samo kad je uključen i Premium). Tekst je razrešen pri objavi: potvrđen prevod, inače izvorni tekst. Javni deo nikad ne nosi skrivene i arhivirane elemente, interne nazive („Kompletan meni"), nepotvrđene AI prevode ni artikle drugih stranica. Akciju (aktivnost po vremenu) računa renderer sa `promoStateAt`.
- **Čuvanje** [K05 ✓]: tačno 20 najnovijih verzija (`listVersions`); starija dobija `retiredAt` u istoj objavi, a `pruneVersion` briše njene delove u serijama od 100 pa i nju; `sweepRetiredVersions` (cron, svakog sata) ponovo pokreće brisanje izgubljenog nastavka. Živa verzija se nikad ne briše.
- **Vraćanje** [K05 ✓]: `menuPublishing.restoreVersion({ menuServiceId, versionNumber, expectedRevision })` pravi nacrt iz internog dela verzije (`lib/menu/restore-plan.ts` + `convex/lib/menuRestore.ts`: piše samo razliku, po ključevima; brojači tačni); javni meni se ne menja dok se ne objavi. Stranica sa aktivnom QR vezom se nikad ne briše ni arhivira vraćanjem: ostaje kakva jeste (sa sekcijama, prikazima i artiklima koje prikazuje) i prijavljuje se u `keptPages`. Slika koja više ne postoji postaje ikonica ili ništa (`droppedImages`). Vraćanje žive verzije poništava izmene nacrta (`state: "clean"`). Žive slojeve (dostupnost, QR, prekidači) i objavljene verzije vraćanje ne dira.
- **Dostupnost** (`menuAvailability`, `menuAvailability.setAvailability` i grupno `menuBulk.setAvailability` [K11], dozvola `menu.availability`, ne zavisi od `clientEditingEnabled`) i **prekidači** (`menuServices.features`) važe odmah, van verzije i bez `touchDraft`.
- **Sakrij / Ukloni / Obriši** (master §5.6) [K04 ✓]: `Sakrij` = `menuCatalog.setPlacementVisibility` (prikaz na toj stranici ostaje na mestu); `Ukloni sa ove stranice` = `menuCatalog.removePlacement` (artikal ostaje na drugim stranicama i u bazi); `Obriši artikal` = `menuArticleDetails.deleteArticle` u dva koraka: prvi poziv vraća spisak pogođenih stranica i kombo artikala i token, drugi sa istim tokenom briše artikal i sve njegove redove. Sve tri idu u nacrt i uživo tek posle `Objavi`. Grupno [K11]: `menuBulk.setVisibility`, `removeFromPage` i `deleteArticles` (posledice svih artikala pre brisanja, jedan token).
- **Validacija za objavu** [K04 ✓, `lib/menu/publish-validation.ts`, kodovi `lib/menu/errors/publish.ts`]: artikal koji se objavljuje mora imati naziv, sekciju (Room service kategorija važi kao sekcija) i osnovnu cenu ili bar jednu varijantu sa cenom (kombo: ručnu cenu) — to su jedine greške; ostalo su upozorenja. Proveravaju se samo artikli koje gost vidi; skriven nepotpun artikal ostaje u nacrtu i ne blokira objavu ostatka; artikal bez ijednog prikaza daje samo upozorenje `article_unplaced`. Editor čita `menuArticleDetails.articleIssues`; K05 primenjuje `validateDraftForPublish` (`lib/menu/publish-checks.ts`).
- **Brisanje artikla i dostupnost** [K05 ✓]: `deleteArticle` više ne briše red dostupnosti — živa verzija i dalje prikazuje artikal do `Objavi`, pa bi brisanje reda gostu odmah pokazalo „dostupno"; red briše objava koja više nema taj artikal.
- **Konflikt iste vrednosti** [K05 ✓, `lib/menu/cas.ts`]: CAS odbija drugu izmenu i vraća `current` (vrednost sačuvanu u međuvremenu) i `attempted` (vrednost koju je druga osoba pokušala da upiše) za cene (`setBasePrice`, `updateVariant`, ručne RS cene), polja artikla i nazive stranica, sekcija i RS kategorija; ništa se ne piše i revizija se ne pomera.
- **Prisustvo** [K05 ✓]: `menuEditorPresence` + `convex/menuPresence.ts`: heartbeat sa entitetom koji je otvoren (TTL 45 s; isti entitet piše tek kad ostane manje od 30 s), jedna pretplata po usluzi (`listForService` sa `nowBucket`), čišćenje cron-om. Signal, ne zaključavanje; konflikt rešava CAS. UI isticanja je K18.
- **Javni read path** [K05 ✓, `convex/menuPublic.ts`]: čita samo objavljenu verziju (stranica: ≤ 15 dokumenata i ≤ 10 indeksnih upita i za meni od 400 artikala) i žive slojeve (dostupnost, prekidač Room service-a); nijedan red nacrta, pa uređivanje ne invalidira pretplate gostiju.

## 7. Granice real-time pretplata

| Površina | Pretplate | Granica |
|---|---|---|
| Editor [K10 ✓, K11 ✓] | `menuServices.context`, `menuStudio.pages`, `pageContent` (samo otvorena stranica), `menuPublishing.draftStatus`, `menuAvailability.unavailableArticles`; prisustvo od K18; jednokratni upiti (ne pretplate): `publishPreview` kad se otvori `Objavi`, `menuBulk.deleteImpact` kad se otvori brisanje, `menuBulk.pageSections` kad se bira stranica u „Dodaj na drugu stranicu“ | upit stranice čita ≤ 4 indeksna upita; artikli jednim upitom kad ih je mnogo; ništa po artiklu |
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
| `/[slug]/meni/editor` (`menuStudio.entry`: `studio` → preusmerenje na `/[slug]/client-panel/meni/editor`; `legacy` i `none` → stari editor kao pre; `components/menu/studio/ruta/stari-ili-novi.tsx`) | K10 ✓ |
| `/r/[cardCode]` (samo grana `menu`), `/r/[cardCode]/meni` (hop) | K20 |
| `/[slug]/client-panel/meni` + `/editor`, `/operativa`, `/lokal`, `/funkcionalnosti`, `/tim`, `/analitika`, `/podesavanja` (layout montira shell jednom; stranica bez ekrana pokazuje iskreno „šta će biti ovde"; `/editor` [K10 ✓] je pravi editor (`components/menu/studio/studio-ruta.tsx`, `?stranica=<key>` otvara stranicu; usluga `legacy` ide na stari editor); prijava ostaje u `/[slug]/client-panel`) | K08 ✓ (shell), K10–K30 |
| `/[slug]/konobar` (ulaz bez koda: kako osoblje otvara konobarski panel; klijentski panel tu šalje osoblje) | K08 ✓ (K22 sme da doda preusmerenje zapamćenog uređaja) |
| `/[slug]/client-panel/meni/poziv/[token]` | K28 |
| `/[slug]/konobar/[kod]`, `/[slug]/konobar/[kod]/sesija` | K22 |
| `/api/meni/slike`, `/api/meni/rezervacija`, `/api/meni/mail/callback`, `/api/meni/analitika` | K15, K25, K26, K29 |
| `/admin/usluge/meni` i admin podstranica | K28 |

Slug stranice se izvodi jednom iz naziva i nikad se ne menja (`lib/menu/slugs.ts`); podrazumevana stranica ima slug `glavni`. Rezervisani slugovi stranica: `glavni`, `editor`, `room-service`, `zahtevi`, `rezervacija`, `api`, `konobar`, `pregled`, `_next`. Stari `/o/[code]` i `/panel/[venueCode]` ostaju netaknuti. Postojeće kartice `menu` bez `menuQrLinks` reda vode na `/{slug}/meni` kao danas.

## 9. Izlog (dev rute)

`/dev/menu-editor-preview`, `/dev/menu-public-preview`, `/dev/menu-lokal-preview`, `/dev/menu-konobar-preview`, `/dev/menu-panel-preview` [K07 ✓]. Svaka: `notFound()` u produkciji, `metadata.robots = { index: false, follow: false }`, prave prezentacione komponente sa tipiziranim fixtures (`components/menu/fixtures/**`), bez Convex poziva, `?tema=svetla|tamna`, nepoznat parametar daje podrazumevano stanje (`lib/menu/izlog-params.ts`). Parametri: `docs/MENI-PLAN.md` §7; postojeći `state=empty|long` i `design=dark` i dalje rade. K07: `?tema=` postavlja `IzlogTema` (`components/menu/zajednicko/izlog-tema.tsx`); ekran koji gradi kasniji korak pokazuje iskreno stanje „Ovaj ekran gradi korak K.." (`components/menu/izlog/izlog-korak.tsx`, korak po vrednosti parametra je u `lib/menu/izlog-params.ts`); pregled primitiva je `/dev/menu-panel-preview?sekcija=primitivi` (`&fioka=otvorena`). K08: `/dev/menu-panel-preview` montira pravi shell (`components/menu/izlog/panel-izlog.tsx`) sa `sekcija`, `uloga=vlasnik|menadzer|urednik|osoblje|admin` (`PANEL_ULOGA_AKTER`), `plan=standard|premium` i `stanje=ucitava|prijava|neaktivno|bez-pristupa`; `IzlogOkvir ceoEkran` ne umotava ekran u svoj `<main>`. Novi ekran zamenjuje `IzlogKorak` svoje vrednosti parametra pravom komponentom. K10: `/dev/menu-editor-preview` montira pravi editor u pravom shell-u (`PanelIzlog` sa `editor`), meni je u memoriji pa sve radnje rade; parametri `stanje=prazno|veliki|brzi-unos` (`state=empty` = `stanje=prazno`), `design=dark` (tamni dizajn pregleda), `pogled=struktura|uredi|pregled` (otvorena fioka, preklop ili pano za snimke), `plan=standard|premium` (Premium uključuje Room service), `editor=stari` (stari editor kao u TASK-51); isti editor je i `/dev/menu-panel-preview?sekcija=editor`. K11: `stanje=izaberi-vise` (režim uključen, 5 izabranih redova u dve sekcije, među njima artikal sa varijantama, otvoren pregled cena sa +10 %); prevlačenje, `Premesti`, stanja artikla i grupne radnje rade nad memorijom (`lib/menu/studio/memorija.ts`). UX pravila: `docs/menu/MENU-UX.md`.

## 10. Struktura koda i komponenti

| Gde | Šta |
|---|---|
| `lib/menu/**` | čista logika, bez `next`, `react`, `@/` i `node:` uvoza (proverava `lib/menu/purity.test.ts`); izuzeci `lib/menu/http/**` (logika route handlera kao `(Request, deps) => Response`) i `lib/menu/testkit/**` (seed za testove) |
| `lib/menu/errors/*.ts` | mašinski kodovi grešaka po domenu, bez zavisnosti |
| `lib/menu/testkit/seed.ts` | `seedMenuWorld`, `seedQrLink`, `addAccountMember`, `addMenuMember` |
| `lib/menu/testkit/legacy.ts` [K06] | stari oblik za testove migracije: `legacyDraftModel`, `legacyBigModel`, `seedLegacyMenu` (nacrt i generacije kroz pravi `insertPublishedRows`), `legacySnapshot` |
| `convex/menu*.ts` | Convex moduli (tačka 3.2); testovi pored modula |
| `components/menu/zajednicko/**` | primitivi i tokeni panela (`--mp-*`, `tokeni.module.css`; koren `MenuPovrsina`) [K07 ✓]; pravila u `docs/menu/MENU-UX.md` |
| `components/menu/izlog/**` | okvir izloga, iskreno stanje „gradi korak K.." i pregled primitiva [K07 ✓] |
| `lib/menu/izlog-params.ts` | parsiranje parametara izloga (nepoznato → podrazumevano) i korak po ekranu [K07 ✓] |
| `components/menu/fixtures/**` | tipizirani izmišljeni podaci za izlog: `fixtureMenu(size)` za `mali`, `srednji` i `veliki` (20, 80, 402 artikla kao `MenuDraftSnapshot`), `fixtureVenue`, `fixtureRequests`, `fixtureReservations`, `fixtureTeam`, `IZLOG_SADA`; tipovi `Izlog*` za tabele K20–K25 dok ne postoje [K07 ✓] |
| `components/menu/studio/**` [K10 ✓] | editor: `studio-ruta.tsx` (Convex ulaz) → `studio-editor.tsx` (prezentacija; podaci `StudioPodaci`, radnje `StudioRadnje`), `veza/` (jedino mesto sa `convex/react`), `shell/` (zaglavlje, tabovi, širina), `stranice/`, `ponuda/`, `red-artikla/`, `brzi-unos/`, `tabelarni-unos/`, `kombo/`, `pregled/`, `objava/`, `status-cuvanja/`, `ruta/`; K11: `dnd/` (senzori sa čuvarom kontrola, `PonudaDnd` — jedan `DndContext` po stranici, podignuta kartica, najave), `premesti/`, `izaberi-vise/` (traka, polje izbora, dijalozi cena, rasporeda i brisanja); izlog `components/menu/izlog/editor-izlog.tsx` vozi ISTI editor nad memorijom |
| `lib/menu/studio/**` [K10 ✓] | čista logika editora: `model.ts` (tipovi i interfejs radnji), `autosave-queue.ts`, `overlay.ts`, `price-input.ts`, `quick-add.ts`, `iz-snapshota.ts`, `memorija.ts` (pravila mutacija nad `MenuDraftSnapshot` za izlog; objava kroz prave `checkPublication` i `summarizePublication`; K11 premeštanje, stanja i grupne radnje), `legacy-preview.ts`, `kada.ts`; K11: `selection.ts` (izbor redova, tri stanja sekcije, granica 200), `drag-guard.ts`; u `lib/menu/`: `reorder.ts` (gde premešten red pada: `{prikaz, sekcija, ispred kog}` kao `movePlacement`, isto mesto = `null`) i `bulk-price.ts` (grupna promena cene, zaokruživanje pola naviše, pregled stara → nova) |
| `components/menu/panel/**`, `javni/**`, `gost/**`, `konobar/**`, `lokal/**`, `analitika/**` | UI po oblastima |
| `lib/menu/panel-nav.ts` [K08 ✓] | 8 sekcija tačnim redom (master §13.1), dozvola po sekciji, vidljivost po akteru kroz `roleCan`, `panelPristup` (osoblje → konobarski panel), linkovi, segment → sekcija, traka ikonica dok je otvoren Editor |
| `lib/menu/client-panel-entry.ts` [K08 ✓] | gde postojeći klijentski panel prikazuje ulaz u ScanMe Menu (`iznad-tabova`, `iznad-dodatnih`, `samo-meni`, `ceka`); bez Menu usluge `null` |
| `components/menu/panel/**` [K08 ✓] | `shell.tsx` (okvir; jedino klijentsko stanje su traka i fioka), `nav.tsx` (lista sekcija), `sekcija.tsx` (iskreno stanje sekcije), `stanja-panela.tsx` (učitavanje, prijava, bez pristupa sa uputstvom za osoblje, isključeno, zabranjena sekcija), `ruta.tsx` (povezuje `shellContext` i segment; kontekst plana i uloge za stranice), `ulaz.tsx` (blok u postojećem klijentskom panelu) |
| `app/[slug]/client-panel/meni/**`, `app/[slug]/meni/**`, `app/[slug]/konobar/**`, `app/r/[cardCode]/meni/**`, `app/api/meni/**` | rute (stranice samo povezuju upite) |

Komponentni testovi idu u `components/menu/**/*.test.tsx`; testovi u `app/**`, `components/ordering/**` i `components/client-panel/**` se ne pokreću.

## 11. i18n površine

| Površina | Sadržaj | Korak |
|---|---|---|
| `menu-domen` | naziv podrazumevane stranice, „(kopija)", režimi, uloge, napomena o promeni režima, tekst svakog koda greške (`menu/…`; od K03 i `plan/…`, `room_service/…`; od K04 `article/…`); K04: nazivi alergena, „Sadrži" / „Može sadržati tragove", radni tekst upozorenja o alergenima (§7.3), oznake, oznake akcije, „Privremeno nedostupno", tekst svakog koda validacije za objavu; K05: kodovi `menu/publish_too_large` i `menu/restore_too_large`, upozorenja cele objave i `publishRefusals` (razlozi odbijanja objave i vraćanja); K06: kodovi `migration/…`, `migrationIssues` (blokade, upozorenja i razlike izveštaja migracije), `migrationManualChecks`, `migrationFallbacks` | K02 ✓, K03 ✓, K04 ✓, K05 ✓, K06 ✓ |
| `menu-editor` (postojeća, stari editor) | K06: `legacyMigrated` (stari pisac posle prelaska) | K06 ✓ |
| `menu-zajednicko` | primitivi, stanja (prazno, greška, učitavanje, bez veze), čuvanje i šav objave, izlog | K07 ✓ |
| `menu-panel` | shell, sekcije, stanja, ulaz u postojećem panelu, ulaz osoblja (`/[slug]/konobar`) | K08 ✓ |
| `menu-studio` | editor (K11 i K15–K18 dodaju svoje grupe; interfejs `MenuStudioDict`) | K10 ✓ |
| `menu-javni` | javni meni | K13 |
| `menu-gost` | radnje gosta, korpa, rezervacija | K21, K25 |
| `menu-konobar` | konobarski panel | K22 |
| `menu-lokal` | Lokal i QR | K20 |
| `menu-analitika` | analitika | K30 |
| `menu-admin` (postojeća, proširuje se) | interni admin | K28 |

Dodavanje: interfejs u `lib/i18n/types.ts` (sme da uvozi tipove samo iz fajlova bez uvoza, npr. `lib/menu/errors/core.ts`) + red u `DictBySurface`, `lib/i18n/sr/<površina>.ts` sa `as const satisfies`, registracija u `lib/i18n/index.ts`. Convex uvozi `../lib/i18n/sr/<površina>` direktno; klijentske komponente uvoze `sr` modul direktno i `fmt` iz `@/lib/i18n/format`.

## 12. Migracija i rollback [K06 ✓]

Stari model (`menus` sa inline nacrtom `draftModel` i objavljenim generacijama u `menuGroups`, `menuItems`, `itemVariants`, `itemPairings` i `menuDayparts`) i novi model žive paralelno. Migraciju radi ScanMe (master §6.2): sve migracione funkcije su `internal`, a klijentski panel nema ni migraciju ni uvoz. **U runu ništa nije pušteno ni na jednom deploymentu**; funkcije su dokazane testovima (`convex/menuMigration.test.ts`, `convex/menuLegacyCompat.test.ts`, `convex/menuAdminImportV2.test.ts`, `lib/menu/legacy-mapping.test.ts`).

### 12.1 Redosled po tabeli (widen → migrate → narrow)

| Tabela | Widen (run, K02–K06) | Migrate (K06, nepušteno) | Narrow (posle runa, samo uz Jovanovo odobrenje) |
|---|---|---|---|
| `menus` | ne menja se; samo se čita | izvor: `draftModel` kad postoji, inače samo živa generacija (`publishGeneration === publishedGeneration`; starija generacija koja čeka čišćenje se ne čita) | posle prelaska svih lokala: zamrzavanje, pa brisanje tek posle bekapa |
| `menuGroups` | — | grupa → sekcija na „Kompletan meni" (`legacyRef`) | briše se sa `menus`, posle bekapa |
| `menuItems` | — | stavka → artikal (`legacyRef`) + prikaz u sekciji; `priceRsd` → `basePriceRsd`; `iconKey` ili normalizovan `productType` → `iconKey` sa `mediaMode: "icon"`; `photoStorageId` → `legacyPhotoStorageId`; `available: false` (i „nema više" iz žive generacije) → red `menuAvailability` | isto; fotografije se ne brišu dok ih K15 ne prebaci u `mediaAssets` |
| `itemVariants` | — | → `menuVariants` + `variantsEnabled` | isto |
| `itemPairings`, `menuDayparts`, `daypartKey`, `daypartOverride`, video, oblik grupe | — | ne prenose se; izveštaj „nemapirano" (K01 OTV 11) | isto |
| `orderingItems` (RFC-004) | — | ne menja se; izveštaj poklapanja sa artiklima po normalizovanom nazivu | odluka o RFC-004 poručivanju je poseban korak |
| `menuServices` | `migration?`, indeks `by_legacyMenuId` | `migration.status`: `running` → `migrated` → `cutover` | `legacyMenuId` i `migration` ostaju kao istorija |
| `menuSections`, `menuArticles` | `legacyRef?`; `menuArticles.legacyPhotoStorageId?` | pišu ih migracija i interni uvoz | `legacyPhotoStorageId` se uklanja kad K15 obradi slike; `legacyRef` ostaje |

### 12.2 Funkcije i pravila

| Funkcija | Šta radi |
|---|---|
| `menuMigration.planLegacyMigration({ menuServiceId })` (internal query) | **Samo izveštaj, ništa ne piše.** Čita ceo izvor u jednoj transakciji (isti obrazac po stavci kao stari `publicMenuBySlug`, pa se može planirati svaki stari meni koji gosti mogu da otvore) i vraća: brojeve izvora i plana, cene, tekst, duplikate, „nemapirano", blokade, upozorenja, ručne provere, poklapanje sa `orderingItems` i — za već migrirane redove — razlike prema izvoru. |
| `menuMigration.migrateLegacyMenuBatch({ menuServiceId, cursor?, batchSize? })` (internal mutation) | Prva serija upisuje `migration` (`running`, izvor i njegova revizija). Svaka serija obezbeđuje planirane sekcije i upisuje artikle `[cursor, cursor + batchSize)` (najviše 100) čiji ključ još ne postoji, sa prikazom, varijantama i dostupnošću; `touchDraft(null)` jednom po seriji (sistemska izmena); nastavak kroz `scheduler.runAfter(0, …)`. Poslednja serija postavlja `migrated` i upisuje `legacy.migrated`. Završena migracija (`migrated`, `cutover`) se ne pokreće ponovo: drugo pokretanje ništa ne menja. Zaustavljena (`running`) se nastavlja ponovnim pozivom od bilo kog kursora. |
| `menuMigration.purgeMigratedService({ menuServiceId })` (internal mutation) | Rollback migracije u serijama od 200: briše samo artikle sa `legacyRef` koje niko nije menjao (`updatedAt === createdAt`) i koji nisu u grupi dodataka, kombou, Room service-u ni u sekciji koju migracija nije napravila — sa prikazima, varijantama i redom dostupnosti koji je postavila migracija (dok postoji objavljena verzija, red ostaje; briše ga sledeća objava, K05). Zatim brišu se prazne migrirane sekcije i `migration`, pa se meni može migrirati ponovo. Zadržane redove broji (`keptSoFar`). Odbija se posle prelaska. |
| `menuMigration.cutoverLegacyMenu` / `revertLegacyCutover` (internal mutation) | Prelazak je dozvoljen tek posle `migrated` I objavljene verzije novog modela (dok gosti ne dobiju novi meni, osoblje mora moći da označi „nema više" na starom); `revert` vraća `migrated`. Oba pišu audit. |
| `menuAdmin.importDraftV2({ menuServiceId, model, dryRun? })` (`requireAdmin`) | Interni uvoz (master §6.2): `parseMenuImport` na admin ekranu → isti model → isto mapiranje → **nacrt** podrazumevane stranice. `dryRun` vraća samo izveštaj. Samo u nacrt bez artikala (`import_target_not_empty`); prevelik uvoz (> 8.000 upisa) se odbija pre upisa; nikad ne objavljuje; audit `legacy.imported` i `menu_import_draft_v2`. |

- **Ključevi** se izvode iz starih id-jeva (`legacyKey`: oblik `<prefiks>_<12 base32>`, `isMenuKey` važi), pa isti izvor uvek daje iste ključeve; postojeći ključ se nikad ne prepisuje i ne gazi izmenu iz novog editora. Ponovljen ili prazan stari id dobija deterministički sufiks i upozorenje.
- **Otisak izvora:** `migration` pamti vrstu izvora i reviziju (`draftRevision` ili `publishedGeneration`). Ako se stari meni promeni posle početka, svaka sledeća serija i plan vraćaju `source_changed` i ne pišu ništa: prvo `purgeMigratedService`, pa nova migracija. Dva izvora se nikad ne mešaju.
- **Blokade** (ništa se ne piše): više od 100 sekcija na stranici, 2.000 artikala u usluzi ili 4.000 prikaza na stranici (`lib/menu/limits.ts`).
- **Duplikati se ne spajaju automatski**: dve stare stavke istog imena ostaju dva artikla i prijavljuju se; operater odlučuje (master §6.2, korak 3).
- **Stare tabele se nikad ne pišu ni ne brišu** u migraciji, planu, purge-u i uvozu.

### 12.3 Provere posle migracije (master §6.3)

| Provera | Automatski (`planLegacyMigration`) | Ručno |
|---|---|---|
| Broj artikala i sekcija | `report.source` (grupe, stavke) prema `report.planned`; posle migracije `target.pendingArticles = 0`, `pendingSections = 0`, `existingArticles = planned.articles`; preskočene stavke bez naziva u `planned.skippedItems` | — |
| Cene i valute | `report.prices` (najmanja, najveća, bez cene, 0 RSD, zaokružene, neispravne); valuta je uvek RSD; posle migracije razlika `price_differs` | uporediti nekoliko cena sa dostavljenim menijem |
| Varijante i količine | `planned.variants`, `variants_truncated`, razlika `variants_differ`; količina (npr. 0,33 l) ostaje u nazivu jer je stari model nema kao polje | — |
| Duplikati | `report.duplicates` (nazivi, sekcije, iste ili različite cene, artikli u nacrtu) | odlučiti da li je isti proizvod |
| Dijakritika i prelom teksta | `text_encoding_suspect` („Ä‡" umesto „ć"), `diacritics_absent`, `text_whitespace_changed` (prelom i razmaci se sažimaju po pravilu novog modela), `text_cut` | pročitati označene tekstove |
| Slike i prava korišćenja | `planned.images`, `image_pending` | prava korišćenja (`image_rights`) |
| Alergeni samo gde su dostavljeni | stari model ih nema, pa migracija ne upisuje ništa (odsustvo = nepoznato, nikad „bezbedno") | uneti samo dostavljene (`allergens_provided`) |
| Redosled i pripadnost odredištima | sve ide na „Kompletan meni", sekcije i artikli redom kao u starom; razlike `placement_missing`, `order_differs` | — |
| Ponašanje na telefonu | — | pregled nacrta na telefonu pre objave (`phone_layout`, `preview_before_publish`) |
| Nemapirano i poručivanje | `report.unmapped` (video, „Ide uz", delovi dana, oblici grupa), `orderingItems` (poklopljeno, nepoklopljeno, druga cena) | odlučiti šta od toga lokal želi u novom meniju |

### 12.4 Kompatibilnost (dok lokal nije prešao)

- `menuPublic.entry` vraća `new` tek kad usluga ima objavljenu verziju; inače `legacy` (ili `none`). Migracija u nacrt ne menja ništa što gost vidi. Do K13 ruta `app/[slug]/meni` čita samo stare upite (`menuDaypartStateBySlug`, `publicMenuBySlug`), pa javni meni izgleda isto i posle objave novog modela; K13 je prebacuje na `entry`.
- QR kartice `menu` (resolver `convex/cards.ts`, ruta `app/r/[cardCode]/route.ts`) i dalje vode na `/{slug}/meni`; migracija ne dira `cards`, `cardTargets` ni `menuQrLinks`.
- Stari editor i stari admin alat rade do prelaska. Posle prelaska `assertLegacyMenuWritable` odbija `menu.saveDraft`, `publishDraft`, `setItemAvailable`, `menuAdmin.importDraft` i `publishForClient` (tekst `menu-editor.legacyMigrated`), pa nema dvostrukog upisa; drugi lokali i lokali bez nove usluge rade kao pre.
- `/dev/menu-public-preview` ne zavisi od Convex-a i nije menjan.

### 12.5 Rollback po fazi

| Faza | Rollback | Šta ostaje |
|---|---|---|
| 1. Šema (widen) | ništa: nova polja i indeks su opcioni i prazni; kod se može vratiti jer nijedna stara tabela nije menjana | stari meni radi |
| 2. Migracija | `purgeMigratedService` (u serijama, briše samo nepromenjene redove migracije; zadržane prijavljuje) | stari meni ostaje izvor; migracija se može ponoviti |
| 3. Objava novog modela | `menuPublishing.restoreVersion` na prethodnu verziju; povratak gosta na stari meni posle K13 traži da K13 ruta poštuje `entry` i operaterski prekidač (otvoreno pitanje u BLOCKED, K06) | stari meni se ne briše do narrow faze |
| 4. Prelazak | `revertLegacyCutover`: stari pisci rade ponovo | nacrt i verzije novog modela ostaju |
| 5. Radnje gosta | prekidači u Funkcionalnostima (`menuServices.setFeature`) | — |
| 6. QR | `menuQrLinks.active = false` vraća karticu na `/{slug}/meni` | kartica i istorija `cardTargets` |

### 12.6 Za produkciju — samo uz Jovanovo odobrenje (redosled za K35)

1. Bekap produkcionog deploymenta.
2. Deploy proširene šeme i koda (widen). Sva nova polja su opciona; indeks `by_legacyMenuId` je na novoj, maloj tabeli `menuServices`, pa ne treba `staged`.
3. `npx convex run menuAdmin:backfillMenuProfiles` (TASK-61).
4. Po lokalu: `menuServices.adminProvision` ako usluga ne postoji.
5. Plan bez upisa: `npx convex run menuMigration:planLegacyMigration '{"menuServiceId":"…"}'` — nema blokada, pregled liste iz §12.3; greške u starom meniju se ispravljaju u starom editoru pre migracije.
6. Migracija: `npx convex run menuMigration:migrateLegacyMenuBatch '{"menuServiceId":"…"}'` (nastavlja se sama) dok `migration.status` ne bude `migrated`; ponovo plan: `pendingArticles: 0`, `differenceCount: 0`. Prekid se nastavlja istim pozivom.
7. Pregled nacrta (operater i lokal): slike (K15), alergeni samo dostavljeni, telefon.
8. Objava novog modela (`Objavi`); posle K13 javna ruta služi novi meni.
9. Prelazak: `npx convex run menuMigration:cutoverLegacyMenu '{"menuServiceId":"…"}'`.
10. Praćenje (javni meni, QR skenovi, greške); rollback po §12.5.
11. Narrow, poseban korak posle svih lokala i bekapa: gašenje starog editora i javnog puta, odluka o RFC-004 poručivanju, brisanje starih tabela.
12. Env ostalih koraka: `MENU_PIN_PEPPER`, OAuth i ključ za šifrovanje, opciono `MENU_FX_ENABLED`.

## 13. Konvencije imena

- Convex moduli: `menu<Oblast>.ts` (camelCase), validatori u `convex/lib/menu*Validators.ts`, helperi u `convex/lib/menu*.ts`.
- Tabele: `menu<Množina>`; indeksi `by_<polje>_and_<polje>` po redu polja.
- Ključevi: `pg_…` (stranica), `sc_…` (sekcija), `ar_…` (artikal), `rc_…` (RS kategorija, K03), `va_…` (varijanta), `ag_…` (grupa dodataka), `ao_…` (dodatak) (K04), 12 znakova Crockford base32; novi tipovi dodaju prefiks u `lib/menu/keys.ts`.
- Kodovi grešaka: `menu/<snake_case>` (jezgro); drugi domeni `<domen>/<snake_case>` u sopstvenom fajlu.
- Audit akcije: `<entitet>.<glagol>` u `lib/menu/audit.ts`; u `adminAuditLog` admin radnje dobijaju `menu_<glagol>`.
- Vrednosti unija na engleskom; sav tekst za korisnika na srpskom (latinica) kroz i18n.
- Fixtures i testovi: samo izmišljeni podaci („Kafana kod Mike", „Demo restoran", „Hotel Primer", `gost@example.com`, `+381 60 000 0000`).
