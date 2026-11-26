# Zadatak: Auto Expo 2026 (Kragujevac) — otvoriti sajamski tok + lidovi izlagaču automatski mejlom

Radiš u repou ScanMe (Next 16 + Convex). Pre bilo kakvog koda pročitaj `AGENTS.md`, `CLAUDE.md` i `convex/_generated/ai/guidelines.md`. Ne pushuj i ne deployuj na produkciju — na kraju mi daj tačan spisak komandi. Rok: sajam počinje **27.11.2026 ujutru**, radi brzo ali bez prečica u testovima.

## Kontekst

- **Auto Expo 2026**, Šumadija sajam, Kragujevac, **27–29.11.2026**. ScanMe NIJE partner sajma, samo jednog izlagača.
- Izlagač: **Grand Motors** (postojeći klijent: `SMK-SAJAM-26-GRAND-MOTORS` / `SML-SAJAM-26-GRAND-MOTORS`, već bio na `elektromobilnost-2026` i `auto-moto-fest-2026`). Na sajmu ih predstavlja diler **VIVA COMPANY D.O.O.** iz Kragujevca — kontakt Jelena Milić (direktor), `jelena.milic@vivacompany.rs`, +381 63 658 296.
- **5 vozila, paket Starter**, 2 brenda (iz Jeleninog mejla od 25.11.):
  | Vozilo | Zvanična stranica | Postojeći podaci u repou |
  |---|---|---|
  | Ford Puma | https://ford.rs/puma | AMF `ford-puma-mhev` (ST-Line, „od 21.740 €“, 9 spec, slika postoji) |
  | Ford Kuga | https://ford.rs/nova-kuga | AMF `ford-kuga` (ST-Line, „od 27.490 €“, 10 spec, slika postoji) |
  | MG ZS Hybrid+ | https://www.mgmotor.rs/model/zs-hybrid | AMF `mg-zs-hybrid` (Luxury, 23.990 €, 7 spec, slika postoji) |
  | MG HS Hybrid+ | https://www.mgmotor.rs/model/hs-hybrid | AMF `mg-hs-hybrid` (Luxury, 32.990 €, 6 spec, slika postoji) |
  | MG3 | https://www.mgmotor.rs/model/mg3 | **NOVO** — nema podataka ni slike |
  AMF izvor: `docs/events/auto-moto-fest-2026/intake/prod-2026-10-30/b1-payload.json`, slike `public/fair/auto-moto-fest-2026/*.webp`.
- Na štandu stoji štampani QR (A4 poster brenda iz grane `stranica-brenda`, sekcija admina `brendovi-qr`, URL `/sajam/<event>/brend/<brand>`). Zato **novu granu `auto-expo-2026` napravi iz `stranica-brenda`** (ne iz `main`), da stranica brenda ide u isti deploy.

## BLOKER koji je već potvrđen (popravi prvo)

`lib/fair-contract.ts` → `FAIR_PII_PURGE_AT_MS = Date.UTC(2026, 10, 15, 23, 0, 0)` (16.11.2026). Posle tog trenutka posetilac ne dobija identitet (`lib/fair-server/visitor.ts:156` → `FAIR_VISITOR_EXPIRED`), `fairEventAcceptsInteractions` vraća false, skenovi su `no_visitor`, a cron `fair pii purge` (svakih 15 min) briše svaki novi lid/posetioca. Provereno 26.11. na produkciji: `POST https://www.scanme.rs/api/fair/lead` → **503 VISITOR_UNAVAILABLE**.

1. Pomeri rok na **16.12.2026 00:00 Europe/Belgrade** = `Date.UTC(2026, 11, 15, 23, 0, 0)` (odluka vlasnika: podaci se čuvaju do 15.12.).
2. Uskladi sve što ga koristi ili hardkoduje stari datum: `FAIR_LEAD_DELIVERY_DEADLINE_MS`, komentare, `lib/i18n/sr/admin-events.ts` (tekst „16. novembra“ / „15. novembra“), testove koji fiksiraju stari datum (`convex/fairSchema.test.ts:856`, `lib/fair-server/visitor.test.ts:73`, `convex/*test.ts` sa `2026-11-16`). Stranica `/sajam/privatnost` čita konstantu — proveri da prikazuje 16. decembar.
3. `fairEvents.piiPurgeAt` je upisan po događaju — novi događaj dobija novu vrednost; za AMF red ne menjaj ništa u kodu, ali u izveštaju navedi stanje.
4. **AMF ne sme ponovo da se otvori.** Sa novim rokom AMF događaj (ako mu je status `published`/`live`) bi opet primao lidove za izlagače koji nisu partneri. Nađi kako se događaj zatvara (`status: "ended"` preko postojećeg admin/upsert puta) i dodaj to u spisak komandi za produkciju, pre deploya ili odmah posle.

## Novo: lid odmah ide izlagaču mejlom

`fairLeads.submitLead` danas samo upisuje lid; izlagač ga dobija ručno/dnevnim izveštajem. Napravi automatsku isporuku, uključenu **po izlagaču**:

- Šema `fairParticipations`: novo opciono polje, npr. `leadNotifyEmails: v.optional(v.array(v.string()))` (prazno/odsutno = isključeno, najviše 3 adrese, normalizovane i validirane kao `reportRecipientEmail` u `convex/lib/fairCatalog.ts`). Admin mutacija za postavljanje (sa `requireAdmin` + admin audit kao kod ostalih fair admin mutacija) i internal varijanta za `npx convex run`. Ako stigneš: mala kontrola u admin sekciji `izlagaci` (adrese + uključeno); ako ne, CLI je dovoljan za sutra.
- Outbox: koristi postojeći kind **`exhibitor_delivery`** (već je u `fairEmailDeliveryKind`, nigde se ne koristi). `submitLead` posle upisa novog lida (ne duplikata, ne `isAdminExcluded`) ubacuje red sa dedupeKey `fair-lead/<leadId>/exhibitor_delivery`, `scheduledFor = now + ~90 s`.
- **Spajanje**: stranica brenda šalje N leadova (po jedan po modelu) za istog posetioca. Kad se red preuzme (`claimDelivery`), pokupi sve lidove istog `visitorId` + `participationId` čiji su `exhibitor_delivery` redovi još `queued` i nepreuzeti (ograničeno čitanje, indeks `by_visitorId_and_eventModelId_and_kind` po prefiksu `visitorId` je dovoljan), pošalji **jedan** mejl sa svim modelima i ostale zatvori kao `skipped` sa novim kodom `EXHIBITOR_DELIVERY_MERGED` (dodaj u `FAIR_EMAIL_DELIVERY_ERRORS`). Isti obrazac kao A8 follow-up spajanje u `convex/fairEmails.ts`.
- U trenutku slanja ponovo proveri: `FAIR_LEADS_ENABLED`, da izlagač i dalje ima adrese (inače `skipped`, kod npr. `EXHIBITOR_NOTIFY_OFF`), da lid postoji. Primaoci = trenutna lista sa učešća.
- Sadržaj mejla (srpski, isti HTML stil kao `convex/lib/fairEmails.ts`, tekstovi u `lib/i18n/sr/...` kao ostali): naslov tipa „Novi lid · Auto Expo 2026 · Probna vožnja · Ford Kuga — Ime Prezime“; telo: događaj, vrsta (Zainteresovan sam / Probna vožnja / iz ankete), model(i) sa varijantom, ime, email, telefon, `purchaseTiming`/`financing` ako postoje, vreme (Europe/Belgrade), kratka napomena da je posetilac dao saglasnost za kontakt od strane izlagača. **`reply_to` = email posetioca** (ako postoji), da izlagač odgovori direktno. Proširi `sendFairResendEmail` da prima više `to` adresa i opcioni reply-to po poruci, bez promene ponašanja postojećih mejlova.
- Posle uspešnog slanja označi lid(ove) `status: "delivered"`, `deliveredAt` (proveri šta inbox/admin već radi sa tim poljem i da se ne kosi).
- Proveri sve `switch`/mape po `kind` u adminu i inboxu (`fairLeadsAdmin.ts`, `fairLeadsInbox.ts`, `components/admin/events/**`, retention) da novi kind ne puca i da je čitljivo prikazan (npr. „Poslato izlagaču“).
- Internal akcija za proveru: `sendExhibitorLeadTestEmail({ participationId, to? })` — renderuje mejl sa TEST podacima i šalje na zadatu adresu (ili na konfigurisane), bez upisa lida. Po uzoru na `fairEmailSender.sendDevTestEmail`.
- Testovi (convex-test, kolocirani kao postojeći `convex/fairLeads.test.ts`): uključeno/isključeno, admin lid se ne šalje, duplikat ne dodaje red, spajanje 3 modela istog posetioca u jedan mejl, isključen prekidač → skipped, reply-to, retry ne šalje dvaput (isti Idempotency-Key).

## Postavka događaja `auto-expo-2026`

Događaj se pravi kroz kod i runbook, ne kroz admin (vidi `docs/events/sajam-automobila-2026/RUNBOOK-EVENT-SETUP.md`, `convex/fairSetup.ts`, `scripts/events/fair-setup-run.mjs`).

1. `EVENTS` u `convex/fairSetup.ts`: `auto-expo-2026`, naslov „Auto Expo 2026“, venue „Šumadija sajam, Kragujevac“, dani 27/28/29.11. (labela kao kod AMF), `startsAt`/`endsAt` u Europe/Belgrade (pitaj me za tačno radno vreme ako ga nema; podrazumevano 27.11. 10:00 → 30.11. 00:00), izlagač **GRAND-MOTORS** sa brendovima Ford i MG (isti kodovi klijenta kao ranije — ne pravi novog klijenta).
2. Mapa: događaj traži mapu (`lib/fair-map/index.ts`, `FairMapKey`, `validateMapLocationIds`). Napravi najjednostavniju ispravnu mapu sa jednim štandom (ili dva — Ford/MG — ako je jednostavnije za postojeći model) i proveri da javna stranica događaja i stranica brenda rade. Ne crtaj izmišljen raspored hale.
3. Payload `docs/events/auto-expo-2026/intake/b1-payload.json`: 4 modela preuzmi iz AMF payload-a (novi `externalKey`/slug u okviru novog događaja), paket `starter`. **Proveri specifikacije i cene na zvaničnim stranicama iz tabele** (ford.rs, mgmotor.rs) i ispravi gde se razlikuju; u izveštaju navedi šta si menjao i izvor. **MG3**: napravi model iz zvanične stranice (verzija, cena, spec. kao kod ostalih); slika — ako ne možeš legalno da preuzmeš zvaničnu sliku, ostavi model bez slike i navedi to.
4. Probna vožnja na Starteru: `lib/fair-entitlements.ts` → `testDriveEvents` sadrži samo `auto-moto-fest-2026`. **Pitaj me** pre dodavanja `auto-expo-2026` (verovatno da, kao na AMF-u).
5. Lead forme i saglasnost: `fairSetup.setupLeads` traži aktivnu saglasnost sa pravnim odobrenjem (`legalApprovedBy`). Iskoristi isti tekst saglasnosti kao AMF (sa `{izlagac}`), a **pitaj me ko se upisuje kao `legalApprovedBy`**.
6. Pasoš brenda i stranica brenda: proveri da li Ford (2 modela) i MG (3 modela) ispunjavaju uslov stranice brenda i QR postera (`lib/fair-brand-page.ts`) i navedi rezultat.
7. Uključi isporuku lidova: Grand Motors na `auto-expo-2026` → `leadNotifyEmails = ["jelena.milic@vivacompany.rs"]` (komanda za produkciju, posle test mejla na moju adresu).

## Provera

- `npx tsc --noEmit`, `npx vitest run` za sve izmenjene oblasti (fair, admin events, i18n), `npm run lint`. Ako je moguće, ceo `npm run check`.
- Na DEV Convex deploymentu (`npx convex dev --once`): ceo runbook za `auto-expo-2026`, jedan pravi lid preko lokalnog Next-a i stranice brenda sa 2 modela → u outbox-u jedan `exhibitor_delivery` poslat, drugi `skipped/EXHIBITOR_DELIVERY_MERGED`. Test mejl pošalji na **jovanm028@gmail.com**, nikako izlagaču sa DEV-a.
- Pregledaj lokalno `/sajam/auto-expo-2026`, stranicu brenda Ford i MG, model stranice i `/sajam/privatnost`.

## Kraj

Commit na granu `auto-expo-2026` (poruke na srpskom kao u istoriji). Napiši `docs/events/auto-expo-2026/IZVESTAJ.md`: šta je urađeno, šta je provereno, otvorena pitanja, i **tačan redosled komandi za produkciju** (deploy Convex + Vercel, zatvaranje AMF-a, bootstrap/import/publish/setupLeads, test mejl, uključivanje Jeleninih adresa, provera `POST /api/fair/lead` da više ne vraća 503). Zaustavi se i pitaj samo za: radno vreme sajma, `legalApprovedBy`, probnu vožnju na Starteru — sve ostalo odluči sam i zapiši u izveštaj.
