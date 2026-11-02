# FRONTEND-DELTA 2026-11-01 — „Sačuvaj garažu“ (garaža na email)

- **Nova ruta:** `POST /api/fair/garage-email` (`lib/fair-server/garage-email.ts`). Telo: `{ email, consent: true, eventSlug, eventModelIds, submissionId }`; isti gateway kao ostale fair rute (same-origin, kolačić posetioca, `FAIR_GATEWAY_SECRET`, IP HMAC). Odgovor `{ ok, value: { modelCount, duplicate } }`, nikad adresa. 429 = limit („Pokušajte ponovo malo kasnije.“).
- **Nova Convex funkcija:** `fairGarageEmail.requestGarageEmail` (mutation, traži gateway secret) i `fairGarageEmail.countGarageEmails` (admin query, broj po događaju; prikazan u Analitici kao „Garaže sačuvane na email“).
- **Šema:** `fairEmailDeliveries` dobija kind `garage_email`, opciona polja `garageEmail` (adresa + poruka, brišu se čim je slanje konačno), `visitorId`, `eventId`, `modelCount` i indeks `by_visitorId_and_createdAt`. Za `garage_email` je `recipient` HMAC adrese, ne adresa. Novi kod greške `GARAGE_EMAIL_MISSING`.
- **Limiti:** 3 po posetiocu na sat, 3 po adresi na dan, plus postojeći `fairLeadIp` bucket. Idempotentno po `submissionId` (`fair-garage/<submissionId>`).
- **Link iz emaila:** `/sajam/{event}/garaza?vrati={code}` — kod je share kod (`fairShareCollections`), garaža spaja modele koji fale (bez duplikata, najviše `FAIR_GARAGE_MAX_MODELS` = 50), briše `vrati` iz URL-a i pokazuje „Vaša garaža je vraćena“ samo kad je nešto dodato.
- **Brisanje:** red i heš nestaju sa outbox-om u purge-u 16. 11. 2026.
- `fairEmailSender.sendDevTestEmail` prima opcioni `garage` (gotova poruka) za ručni test.

# FRONTEND-DELTA 2026-11-01 — Ineos Grenadier u sponzorisanoj rotaciji + zaključan slajder

- **Šema:** `fairEventModels.sponsoredOverride` (opciono, `true` = vlasnikov izuzetak) i indeks `by_eventId_and_sponsoredOverride`. Paket modela se ne menja.
- **Pravo:** `fairSponsoredRotationAllowed(tier, sponsoredOverride)` u `lib/fair-entitlements.ts` (Napredni ili izuzetak na plaćenom paketu); `deriveFairCapabilities` prima `sponsoredOverride`. Convex: `fairModelSponsoredAt`, `fairSponsoredCandidateRows`, `fairSponsoredLeadOrder` u `convex/lib/fairSponsored.ts`.
- **Redosled:** modeli sa izuzetkom idu prvi u snapshot (mapa, garaža i display ekrani), ostali zadržavaju dnevni stabilni redosled.
- **Uključi/isključi bez deploya:** `npx convex run fairSetup:setSponsoredOverride '{"eventCode":"auto-moto-fest-2026","modelSlug":"ineos-grenadier","enabled":false}' --prod`. Uključivanje bira Glas publike pitanje otvoreno sada kao rezultat na mapi; isključivanje ga briše.
- **Izveštaji:** Starter projekcija i dalje skriva sponzorisane metrike; brojači `sponsored_open_model` / `sponsored_garage_add` se upisuju i za Grenadier, ali ih izlagač ne vidi.
- **Slajder:** `canStartSponsoredSwipe` u `lib/fair-client/rotation-slot.ts`; `SponsoredStrip` ne prima novi swipe dok slajd (pušten swipe ili automatski) ne završi `onComplete`.

# FRONTEND-DELTA 2026-11-01 — Menu V1 + admin V2 vraćeni (revert reverta `e0aed1d`, grana `release/menu-admin-v2`)

- **Sajamski frontend se ne menja:** `components/fair/**`, `lib/fair-*`, `app/sajam/**` i `app/api/fair/**` su isti kao na main-u.
- **Convex (samo dodato):** `fairEventAnalytics.getEventEngagement`, `getModelAnalytics`, `getEventStandHours` (admin query-ji, samo čitaju; loaderi u `convex/lib/fairEventAnalytics.ts`). Sajamske tabele u šemi nepromenjene; nove su samo `menu*` tabele.
- **Admin Analitika:** admin V2 prikaz (`components/admin/events/analytics/**`); „Garaže sačuvane na email“ (`fairGarageEmail.countGarageEmails`) je sada u nizu „Ostali brojevi“ u `KpiStrip`.
- **Redosled na PROD-u:** `convex deploy` sa ove grane pre merge-a u main (stari frontend nove funkcije ne zove).
