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
