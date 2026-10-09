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
