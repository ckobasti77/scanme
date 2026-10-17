# FRONTEND-DELTA 2026-10-17 — AMF pregled pasoša kao ulaznice

Grana `feature/amf-pasos-markice`. Bez promene Convex-a, šeme, ruta i API-ja.

## Logoi brendova

- Novo: `lib/fair-brand-logo.ts` — `fairBrandKey(name)` (bez dijakritika, mala slova, skida „TEST “ i završno „_T“/„ T“)
  i `fairBrandVector(name)` → simple-icons putanja + hex, ili jednobojni SVG iz `public/fair/brands/`.
  Pokriva automobilske brendove sa sajamautomobila.com/ucesnici-2026 (SWM još nema logo).
- `FairBrandMark` (garaža, mapa, električni pasoš) koristi isti modul: „AUDI_T“ sada dobija Audi logo umesto „AU“.
  Ostalo ponašanje i fallback su isti.
- Novi fajlovi: `public/fair/brands/mercedes-benz.svg`, `dongfeng.svg` (Wikimedia Commons, public domain, jednobojno).

## Pregled pasoša (samo `passportStyle: "stamps"`)

- `/sajam/[slug]/pasosi` za AMF: `PassportTickets` → `PassportTicket` + `PassportStub` (port prototipa
  `pasosi-kartica-ulaznica.html`, varijanta „2 · Ulaznica“ + „Prigušen brend“). Električni pregled je nepromenjen.
- `FairPassportExperience` prima opciono `event.venueName` i `event.startsAt` (žig događaja: grad, godina).
- Seen-store `scanme:fair-passport-visits:v1` dobija aditivno polje `sealShown` (pečat kompletiranja na pregledu pada
  samo jednom po uređaju): `passportSealShown` / `markPassportSealShown`; `forgetPassportModelsSeen` ga briše.
- `fair-paper-texture.tsx` dodatno postavlja `--fair-leather-url` i `--fair-leather-noise-url` (samo AMF strane).

## DEV simulacija pasoša (samo `next dev`)

- Kolačić `scanme_fair_passport_sim`, sekcija „Simulacija pasoša“ i traka „DEV · SIMULACIJA“.
  Bez prijave: otvoreni DEV meni na stranama pasoša (`FairDevSimulationSheet`, i preko LAN IP-a);
  prijavljeni admin istu sekciju ima u admin DEV meniju (jedan DEV tab na strani).
  Posle promene/isključivanja na strani brenda ide se na pregled pasoša (brenda možda nema u novom skupu).
  Strane `/pasosi` i `/pasosi/[brand]` tada koriste `lib/fair-passport-simulation.ts` umesto kataloga i ne zovu Convex.
  U produkciji `lib/fair-server/passport-simulation.ts` uvek vraća `null`.
- Provera: `node scripts/events/verify-amf-passports.mjs http://localhost:3000` (headless Playwright, 360/390/430 px).
