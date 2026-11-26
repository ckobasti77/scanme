# FRONTEND-DELTA 2026-11-26 — Auto Expo 2026, novi rok brisanja, lid izlagaču mejlom

- **Rok brisanja:** `FAIR_PII_PURGE_AT_MS` je sada 16. 12. 2026. 00:00 (Beograd) = `Date.UTC(2026, 11, 15, 23)`; `FAIR_LEAD_DELIVERY_DEADLINE_MS` = 15. 12. 23:59:59.999. Kolačić posetioca, `/sajam/privatnost`, admin tekstovi i brojači dana čitaju konstantu.
- **Novo:** `fairEventPiiOpen(event, now)` u `lib/fair-contract.ts` — događaj prima lidove, skenove sa posetiocem, deljenje i garažu na email samo pre ranijeg od dva roka: globalnog i `fairEvents.piiPurgeAt`. Elektro i AMF imaju 16. 11. u bazi, pa ostaju zatvoreni i posle pomeranja konstante.
- **Šema:**
  - `fairParticipations.leadNotifyEmails?: string[]` — adrese izlagača za nove lidove (najviše 3, `normalizeFairLeadNotifyEmails`). Odsutno = isključeno.
  - `fairEmailDeliveries.exhibitorBatch?: { to: string[]; leadIds: Id<"fairLeads">[] }` — zamrznuto pri prvom preuzimanju reda `exhibitor_delivery`.
- **Kodovi grešaka outbox-a:** `EXHIBITOR_NOTIFY_OFF`, `EXHIBITOR_DELIVERY_MERGED` (labele u `adminEventsSr.leadInbox.deliveryErrors`).
- **Convex funkcije:**
  - `fairLeadsAdmin.setLeadNotifyEmails({ participationId, emails })` — admin, audit `fair_lead_notify_emails_set`.
  - `fairSetup.setLeadNotifyEmails({ eventCode, participationExternalKey, emails, actorEmail })` i `fairSetup.setEventStatus({ eventCode, status, actorEmail })` — internal (CLI).
  - `fairEmailSender.sendExhibitorLeadTestEmail({ participationId, to? })`, `fairEmails.exhibitorTestContext` — internal.
- **Inbox:** `fairLeadsInbox` red ima opciono `exhibitor` (status mejla izlagaču); admin lista i detalj prikazuju „Poslato izlagaču: …“ i dugme „Ponovo pošalji izlagaču“ kad je `failed`. Uspešno slanje postavlja lidu `status: "delivered"` i `deliveredAt`.
- **Forma lida:** `getLeadForm` vraća `collectOptionalEmail` i za `auto-expo-2026` (kad je obavezan telefon), da bi izlagač imao adresu za odgovor.
- **Mapa:** `FairMapKey` dobija `auto-expo-2026`; `FairMapGeometry.schematic?: true` = mapa bez plana organizatora (jedna zona `hala`, jedna lokacija `kind: "area"`, id `hala`, bez ScanMe lokacije). `mapLocationId` za oba brenda Grand Motorsa je `hala`.
- **Garaža:** `EVENT_DEFINITIONS` u `lib/fair-server/garage-page.ts` dobija `auto-expo-2026` (inače `/garaza`, `/deli`, `/poredjenje` vraćaju 404). Posledica: `/sajam` preusmerava na Auto Expo dok je to aktuelni događaj.
- **Paket:** `testDriveEvents` = `["auto-moto-fest-2026", "auto-expo-2026"]` (Starter ima probnu vožnju i na Auto Expo-u).
- **Potvrda posetiocu:** tekst „Zainteresovan sam“ i potpis sada nose naziv događaja (`{event}`) umesto fiksnog „Sajam elektromobilnosti“.
