# Frontend delta — 9. oktobar 2026.

> Pravilo „Cross-team sync rule“ (`AGENTS.md`). Ova izmena ne dira sajamski backend (`convex/fair*`, `lib/fair-*`, mapa); tiče se javnog ScanMe landinga i opšte tabele `leads`. Detalji: [`jovan-status/LANDING-2026-10-09.md`](./jovan-status/LANDING-2026-10-09.md).

## Jovan — landing, kontakt forma i mejl timu (9. 10.)

- **`leads.create`:** argumenti i odgovor su isti (`{ status: "accepted" | "duplicate" }`). Forma radi i pre i posle Convex deploy-a.
  - Novo ponašanje: za `accepted` mutacija zakazuje `internal.leadEmails.sendLeadNotification` i upisuje `emailStatus: "queued"`. Za duplikat, honeypot i isteklu formu nema mejla.
- **Šema (aditivno):** opciona polja na `leads` — `emailStatus` (`queued | sent | failed`), `emailMessageId`, `emailFailureReason`, `emailUpdatedAt`. Postojeći redovi ostaju validni; nema novih indeksa.
- **Novi modul:** `convex/leadEmails.ts` (samo internal funkcije: `sendLeadNotification`, `getQueuedLead`, `markLeadEmailSent`, `markLeadEmailFailed`). Env: postojeće `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SCANME_ACTIVATION_REQUEST_EMAIL` (rezerva `office@scanme.rs`); nijedna nova.
- **`components/lead-form.tsx`:** novi opcioni prop `generalCopy`. Bez njega forma je ista kao u klasičnom `#ponuda` toku.

## Jovan — ScanMe zelena iz loga (9. 10.)

- **Mapa sajma:** ScanMe štand (`--fair-map-scanme` u `components/fair/map/fair-map-canvas.tsx`) je sada `#6FC05D` umesto `#C6FF4A`. Pravilo je isto: boja se postavlja jednom, samo na lokaciju vrste `scanme`. Testovi `lib/fair-map/map-guards.test.ts` i `scanme-green.test.ts` prate novi hex.
- **Globalni ScanMe tokeni** (`app/globals.css`): `--primary`/`--accent`/fokus/scrollbar prelaze na `#6FC05D`. Sajam i dalje koristi svoje `--fair-*` tokene; na sajamskim stranama se menja samo ta ScanMe boja.
- **Uglovi dugmadi:** globalno pravilo `border-radius: var(--button-radius)` više ne važi unutar `.fair-event` i `.ot_frame` (ScanMe Links). Sajam i stranice klijenata zadržavaju svoje uglove.

## Jovan — sajam dizajn: tokeni, mapa, sheet (9. 10.)

Detalji: [`jovan-status/SAJAM-DIZAJN-2026-10-09.md`](./jovan-status/SAJAM-DIZAJN-2026-10-09.md) i [`FAIR-DESIGN-DNA.md`](./FAIR-DESIGN-DNA.md). Backend, validatori, šema, API rute i `mapLocationId` se ne menjaju.

- **`d154d2e` je poništen** (`git revert`, `a31c912`): mapa i desni panel su opet fiksni; panel bez izbora ima uputstvo i ScanMe karticu.
- **Tokeni** pod `.fair-event` (`app/sajam/fair-event.css`): `--fair-space-*`, `--fair-radius-*`, `--fair-border*`, `--fair-shadow-*`, `--fair-dur-*`, `--fair-ease-*`. Sajamski CSS više nema tvrdih uglova, trajanja ni krivih. JS ogledalo: `components/fair/fair-motion.ts` (`FAIR_DURATION`, `FAIR_EASE`).
- **`FairMapDict` (`lib/i18n/types.ts`, `sr/fair-map.ts`):** novi ključevi `searchEmptyHint`, `searchResultsOne/Few/Many`, `panelEmptyTitle`, `panelEmptyStepMap/Search/List`, `panelEmptyResult`, `scanmeQuickTitle`, `modelRowHint`, `sheetExpand`, `sheetCollapse`; `sheetHandle` dopunjen („nagore za ceo prikaz“); `selectHint` (vraćen revertom) je zamenjen novim ključevima i uklonjen.
- **Reduced motion** na svim sajamskim stranicama: bez pomeranja, ali prelazi boje i providnosti ostaju (ranije ugašeni svi prelazi).
- `?prikaz=ekran` i `/r/**` nisu menjani.

## Jovan — mapa sajma: novi raspored glavne kolone (9. 10.)

Grana `codex/jovan-sajam-mapa-raspored-2026-10-09`. Backend, validatori, šema, API rute i `mapLocationId` se ne menjaju; `?prikaz=ekran`, donji sheet i desni panel su isti.

- **Redosled (telefon i računar):** pretraga + „Pronađi ScanMe“ u jednom redu → zone → mapa sa kontrolama (+, −, ceo deo) ispod, u istom okviru → kategorije → rotacija/spisak kao ranije. Gornji baner „Mapa sajma“ postoji još samo na `?prikaz=ekran`.
- **Uklonjeno:** dugme i podloga „Originalna mapa organizatora“ (`ZoneCanvas` više nema `showOriginal`/`onToggleOriginal`; `zone.image.src` se više ne crta, podaci su isti).
- **`FairMapDict`:** uklonjeni `introHint` i `originalMap`; novih ključeva nema.
- **Prvi red:** „Pronađi ScanMe“ je šire od pretrage i uvek ima ceo natpis. Dok je pretraga otvorena (fokus ili upisan tekst), ona se animirano širi, a dugme se skuplja u kvadrat od 48 px samo sa ikonicom (`aria-label` ostaje „Pronađi ScanMe“). Kad se pretraga zatvori, sve se vraća. Sa smanjenim pokretom nema klizanja, samo promena.
- **„Pronađi ScanMe“ je u ScanMe zelenoj** (`var(--primary)`, uglovi `var(--button-radius)`), kako je traženo u zadatku. To je izuzetak od EDS §3 („ScanMe zelena se ne koristi za CTA“); `--fair-map-scanme` i dalje postoji samo na ScanMe štandu. Ako izuzetak ne treba da važi, vraća se jednim pravilom u `fair-event-map.module.css` (`.findButton`).

## Jovan — mapa: providni logoi, bez zone „Zadnji deo“, filteri iznad mape (9. 10.)

Grana `codex/jovan-spoj-aleksa-2026-10-09`. `FAIR_PUBLIC_MAP_ENABLED` ostaje `false`; mapa se vraća kad Jovan i Aleksa prebace vrednost na `true`.

- **Bez zone „Zadnji deo“** (odluka vlasnika u četu 9. 10.: postoje samo Hala i Ispred hale):
  - `ELEKTROMOBILNOST_2026_MAP` ima dve zone; lokacija `zadnji-deo` ne postoji, pa `isFairMapStandLocation` / `validateMapLocationIds` odbijaju nov štand na njoj;
  - `FairMapZoneId` (lib/fair-map) je `hala | ispred`; `FairMapDict.zones` nema `zadnji-deo`;
  - `FAIR_MAP_ZONE_IDS` i Convex `fairMapZoneId` su **nepromenjeni** (vrednost je sačuvana u podacima); sačuvan `zadnji-deo` na učešću bez štanda mapa čita kao Hala;
  - lista organizatora (`lib/fair-import/izlagaci-2026.ts`): AUTO1 je u Hali, bez lokacije (`noLocationReason`), kao Markus Pro; `placeSiteExhibitors` ga preskače sa `no_map_location`;
  - postojeći štand AUTO1 na `zadnji-deo` (DEV) ostaje u podacima; na mapi ga nema, a u spisku piše „Tačno mesto još nije na mapi organizatora“;
  - provera na PROD-u (samo čitanje): `npx convex run fairPublic:getEventMap '{"eventSlug":"elektromobilnost-2026"}' --prod` i štand sa `mapLocationId: "zadnji-deo"`, ili `npx convex run fairExhibitorImport:listStandsOffMap '{"eventCode":"elektromobilnost-2026"}' --prod`;
  - otvoreno pitanje za AUTO1: `docs/tasks/BLOCKED.md`.
- **Logoi bez belog kvadrata:** kopije su sada providne u `public/sajam/izlagaci/2026/providni/` (skripta `scripts/fair/map-logos-transparent.mjs`, sharp), `FAIR_MAP_LOGO_THUMB_BASE` pokazuje na njih; stare neprovidne kopije su obrisane. `.logoBox` i čip na mapi nemaju belu podlogu ni okvir; na zelenom ScanMe štandu ScanMe logo je jednobojan taman.
- **Redosled:** pretraga + „Pronađi ScanMe“ → zone → filteri → mapa sa kontrolama → ostalo.
- **Režim velikih ekrana** (`?prikaz=ekran` i ≥ 1440 px) prikazuje dve zone.

## Aleksa — admin alati, privatnost i mejlovi posetiocu (9. 10.)

Detalji i razlozi su u [`JOVAN-DELTA-2026-10-09.md`](./JOVAN-DELTA-2026-10-09.md).

### Admin alati

Komponente su u `components/fair/admin/`:

- `FairAdminTools` je serverska kapija. `FairAdminDevSheet` je panel.
- Ulaze kroz novi opcioni prop `adminTools` na `FairEventShell`, `FairModelPage` i `FairGarage`.
- Mapa, model, pasoši i garaža ih šalju. Za posetioca je vrednost `null`, pa im se klijentski kod ne šalje.

Admin se proverava na serveru preko `lib/fair-server/admin-session.ts`:

- `fairIsAdminRequest()`: Convex Auth token, pa `api.admin.me`;
- `fairAdminPreview()`: čita HttpOnly kolačić `scanme_fair_admin_preview`, samo posle provere admina;
- `fairPreviewCapabilities()`: na stranici modela menja samo prikaz.

Nova ruta: `POST /api/fair/admin-dev`. Akcije su `state`, `stamps`, `scan`, `reset`, `openQuestion` i `preview`.

### „dev“ u footeru

- Link „dev“ je uklonjen iz footera modela i garaže. U garaži nije radio ništa.
- Na stranici modela `?dev=1` radi samo u `next dev`.
- Footer modela, garaže, pasoša i Glasa publike sada ima link „Privatnost“ ka `/sajam/privatnost`.
- Footer pasoša se sada uvek prikazuje. Link „dev“ u njemu ostaje samo lokalno.

### Privatnost i saglasnost

- Nova stranica `app/sajam/privatnost/page.tsx` i konstanta `FAIR_PRIVACY_PATH` u `lib/fair-contract.ts`.
- `ContactBlock` ispod teksta saglasnosti prikazuje link „Politika privatnosti“, koji se otvara u novom tabu.
- `surveyFinalBodyContact` sada glasi „Ako ostavite kontakt, {exhibitor} može da vam pošalje ponudu. Nije obavezno.“

### i18n

- Nove površine: `fair-admin-dev` i `fair-privacy`.
- `privacyLink` je dodat u model, garažu i pasoš. `consentPrivacyLink` je dodat u model.
- `devLink` je uklonjen iz garaže.

### Dopuna (9. 10., mejlovi posetiocu i DEV panel na pasošima)

- `POST /api/fair/lead` prima opciono `origin: "survey"`. Lead ostavljen u poslednjem koraku ankete šalje ga sam (`model-interactions.tsx`), pa posetilac dobija mejl ankete umesto mejla „Zainteresovan sam“.
- `fairLeads.origin?: "survey"` je novo opciono polje u šemi.
- `fairAdminDev.devState` sada vraća i `models` (objavljeni modeli: id, slug, naziv, brend) za birače u DEV panelu.
- Poruke na ekranu (`fair-model.ts`):
  - `interestSent`: „Poslato! {brand} tim će vam se javiti.“
  - `testDriveSent`: „Zahtev je poslat. {brand} tim će vas kontaktirati za termin.“ (sada sa `{brand}`)
  - `surveySentToast`: „Hvala! Odgovori su poslati {brand} timu.“
