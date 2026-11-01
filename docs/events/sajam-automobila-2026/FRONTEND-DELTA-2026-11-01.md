# FRONTEND-DELTA 2026-11-01 — „Sačuvaj garažu“ (garaža na email)

- **Nova ruta:** `POST /api/fair/garage-email` (`lib/fair-server/garage-email.ts`). Telo: `{ email, consent: true, eventSlug, eventModelIds, submissionId }`; isti gateway kao ostale fair rute (same-origin, kolačić posetioca, `FAIR_GATEWAY_SECRET`, IP HMAC). Odgovor `{ ok, value: { modelCount, duplicate } }`, nikad adresa. 429 = limit („Pokušajte ponovo malo kasnije.“).
- **Nova Convex funkcija:** `fairGarageEmail.requestGarageEmail` (mutation, traži gateway secret) i `fairGarageEmail.countGarageEmails` (admin query, broj po događaju; prikazan u Analitici kao „Garaže sačuvane na email“).
- **Šema:** `fairEmailDeliveries` dobija kind `garage_email`, opciona polja `garageEmail` (adresa + poruka, brišu se čim je slanje konačno), `visitorId`, `eventId`, `modelCount` i indeks `by_visitorId_and_createdAt`. Za `garage_email` je `recipient` HMAC adrese, ne adresa. Novi kod greške `GARAGE_EMAIL_MISSING`.
- **Limiti:** 3 po posetiocu na sat, 3 po adresi na dan, plus postojeći `fairLeadIp` bucket. Idempotentno po `submissionId` (`fair-garage/<submissionId>`).
- **Link iz emaila:** `/sajam/{event}/garaza?vrati={code}` — kod je share kod (`fairShareCollections`), garaža spaja modele koji fale (bez duplikata, najviše `FAIR_GARAGE_MAX_MODELS` = 50), briše `vrati` iz URL-a i pokazuje „Vaša garaža je vraćena“ samo kad je nešto dodato.
- **Brisanje:** red i heš nestaju sa outbox-om u purge-u 16. 11. 2026.
- `fairEmailSender.sendDevTestEmail` prima opcioni `garage` (gotova poruka) za ručni test.
