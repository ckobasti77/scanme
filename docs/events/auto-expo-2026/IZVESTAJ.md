# Auto Expo 2026: izveštaj (26. 11. 2026.)

Grana `auto-expo-2026`, napravljena iz `stranica-brenda`, pa stranica brenda i QR poster idu u isti deploy. Ništa nije pushovano niti deploy-ovano na produkciju.

## Odluke vlasnika (26. 11.)

- Radno vreme: petak i subota 10:00–20:00, nedelja 10:00–18:00. Događaj traje od 27. 11. u 10:00 do 29. 11. u 18:00 (Europe/Belgrade).
- `legalApprovedBy` je isti kao na AMF-u: **Aleksa Đorđević**. Tekst saglasnosti je isti kao na AMF-u, sa `{izlagac}`. Oba podatka sam pročitao (samo čitanje) iz PROD tabele `fairConsentConfigs` za AMF.
- Probna vožnja je dostupna i na Starter paketu, kao na AMF-u.
- Automatsko slanje lida izlagaču zamenjuje „ručno odobravanje“ iz MASTER §20 (25. 11.). Zapisano je u MASTER §20 (26. 11.).
- Mapa ima jedan štand bez broja, jer nemamo plan hale.

## Šta je urađeno

### 1. Rok brisanja i zaštita AMF-a

- `FAIR_PII_PURGE_AT_MS` = **16. 12. 2026. 00:00 Beograd** (`Date.UTC(2026, 11, 15, 23)`). `FAIR_LEAD_DELIVERY_DEADLINE_MS` se izvodi iz njega i sada je 15. 12. 23:59:59.
- Usklađeni su:
  - admin tekstovi (`lib/i18n/sr/admin-events.ts`: 15./16. decembar, „Važi za sve sajmove“);
  - filter datuma u inbox-u (`max="2026-12-15"`);
  - DEV forma;
  - komentari i testovi.
- `/sajam/privatnost` lokalno prikazuje „najkasnije **16. decembra 2026.**“.
- **Zaštita po događaju.** Nova funkcija `fairEventPiiOpen(event, now)` vraća `now < min(globalni rok, fairEvents.piiPurgeAt)`. Koriste je lidovi i ostale interakcije, sken sa posetiocem, deljenje i garaža na email.
  - Na PROD-u su i AMF i Elektro i dalje u statusu `published`, sa `piiPurgeAt = 16. 11.` (provereno 26. 11., samo čitanje).
  - Taj datum se ne menja ni na jednom putu (`upsertFairEvent` ga upisuje samo pri kreiranju).
  - Zato AMF i Elektro **ostaju zatvoreni od prvog trenutka posle deploya**, bez obzira na redosled komandi.
  - `auto-expo-2026` dobija `piiPurgeAt = 16. 12.`
- **Druga brava:** internal `fairSetup:setEventStatus` prebacuje događaj u `ended` kroz isti put kao admin (`upsertFairEvent`) i ostavlja audit. Komande su u redosledu ispod.
- **Stanje AMF-a posle deploya:**
  - `piiPurgeAt` ostaje 16. 11.;
  - admin Pregled AMF-a ostaje u fazi „obrisano“;
  - globalni rok za predaju lidova (prikaz u inbox-u) postaje 15. 12.;
  - globalni cron za brisanje ne briše ništa do 16. 12. Lični podaci AMF-a i Elektro-a su već obrisani posle 16. 11.

### 2. Lid ide izlagaču mejlom (`exhibitor_delivery`)

- **Uključivanje po izlagaču:** `fairParticipations.leadNotifyEmails`, najviše 3 adrese. Adrese se normalizuju strožim pravilom za email posetioca, pa zarez ne prolazi.
  - Admin mutacija: `fairLeadsAdmin.setLeadNotifyEmails` (`requireAdmin` i audit `fair_lead_notify_emails_set`).
  - Internal za CLI: `fairSetup:setLeadNotifyEmails`.
  - Kontrolu u admin sekciji `izlagaci` **nisam** pravio, jer je CLI dovoljan za sutra.
- **`submitLead`** ubacuje red `fair-lead/<leadId>/exhibitor_delivery` sa `scheduledFor = sada + 90 s`, ali samo za nov lid. Red se ne ubacuje za:
  - duplikat;
  - lid iz admin sesije;
  - lid pre otvaranja sajma (`fairIsPreEvent`, isto pravilo kao za follow-up), da probni lidovi pre 27. 11. u 10:00 ne odu izlagaču;
  - izlagača bez adresa.
- **`claimDelivery`** pri prvom preuzimanju:
  - ponovo proverava `FAIR_LEADS_ENABLED` (`skipped/LEADS_DISABLED`), adrese izlagača (`skipped/EXHIBITOR_NOTIFY_OFF`) i da lid postoji (`failed/LEAD_MISSING`);
  - pokuplja ostale lidove istog posetioca i izlagača čiji redovi još čekaju i nisu preuzeti (`take(50)` preko indeksa `visitorId`). Ti redovi postaju `skipped/EXHIBITOR_DELIVERY_MERGED`;
  - zamrzava primaoce i spisak lidova u `exhibitorBatch`. Zato retry šalje isto telo istim primaocima sa istim `Idempotency-Key`;
  - red koji je već preuzet nikad ne prima nove lidove. Kasniji lid zato dobija svoj mejl.
- **Mejl:** srpski, u istom HTML stilu, tekstovi u `lib/i18n/sr/event-lead-email.ts` (`exhibitor`).
  - Naslov: „Novi lid · Auto Expo 2026 · Probna vožnja · Ford Kuga ST-Line — Ime Prezime“. Za više modela: dva modela i „+N“; za različite forme: „Više upita“.
  - Telo: događaj; modeli sa varijantom, vrstom i vremenom po Beogradu; ime, email i telefon; kupovina i finansiranje ako postoje; napomena o saglasnosti.
  - `reply_to` je email posetioca. `sendFairResendEmail` sada prima i listu adresa; postojeći mejlovi su nepromenjeni.
- **Posle uspešnog slanja** svi lidovi iz mejla dobijaju `status: "delivered"` i `deliveredAt`, isti patch kao ručno „Označi isporučeno“.
- **Admin inbox:** red „Poslato izlagaču: …“ u listi i u detalju, i dugme „Ponovo pošalji izlagaču“ kad je slanje `failed`.
- **Test mejl:** internal `fairEmailSender:sendExhibitorLeadTestEmail({ participationId, to? })` šalje TEST podatke i ništa ne upisuje.
- **Ispravka uz put:** potvrda posetiocu („Zainteresovan sam“) i potpis imali su fiksno „Sajam elektromobilnosti“, pa bi posetioci Auto Expo-a dobili pogrešan naziv. Sada je to `{event}`, naslov događaja.

### 3. Događaj `auto-expo-2026`

- `EVENTS` u `convex/fairSetup.ts`:
  - venue „Šumadija sajam, Kragujevac“, dani „Petak, 27. novembar“ … „Nedelja, 29. novembar“;
  - izlagač `GRAND-MOTORS` sa brendovima Ford i MG. Isti klijent (`SMK/SML-SAJAM-26-GRAND-MOTORS`); na DEV-u je vraćen kao `unchanged`.
- **Mapa** `lib/fair-map/auto-expo-2026.ts` je **šematska** (`schematic: true`): jedna zona „Hala“ i jedna oblast `hala` bez broja štanda.
  - Slika je neutralna pozadina `public/sajam/mape/auto-expo-hala.jpg`. Javna mapa crta samo poligone.
  - Ništa nije precrtano i nijedan raspored nije izmišljen.
  - Geometry testovi traže da šematska mapa ostane samo sa otvorenim oblastima.
- **Garaža:** `auto-expo-2026` je dodat u `EVENT_DEFINITIONS`, inače `/garaza`, `/deli` i `/poredjenje` vraćaju 404.
- **Probna vožnja:** `testDriveEvents` sadrži `auto-expo-2026`.
- **Forma:** `collectOptionalEmail` važi i za Auto Expo kad je telefon obavezan (Grand Motors), pa izlagač dobija adresu za odgovor.
- **Payload** `intake/b1-payload.json` ima 5 modela (Starter, `passportEligible`) i jedan zajednički štand „Ford i MG“ (`mapLocationId: "hala"`).
  - QR kodovi AMF modela (`assignedResolverCode`) su izbačeni, jer su vezani za AMF. Ostaje upozorenje `FAIR_QR_MISSING`; ulaz ide preko QR postera brenda.
  - Fotografije su postojeći AMF fajlovi (`scanme.rs/fair/auto-moto-fest-2026/*.webp`).
- **Lead forme:** `intake/setup-leads.json` ima AMF tekst, `legalApprovedBy` i za Grand Motors „interest“ i „test_drive“ sa obaveznim telefonom (kao na AMF-u).
- **Stranica brenda i QR poster:** Ford (2 modela) i MG (3 modela) ispunjavaju uslov — svi modeli su objavljeni, Starter i `passportEligible`, od jednog izlagača. Na DEV-u se pasoš oba brenda napravio automatski, a `/brend/ford` i `/brend/mg` rade.

### Provera cena i specifikacija (zvanične stranice, 26. 11.)

| Model | Izvor | Rezultat |
|---|---|---|
| Ford Puma ST-Line | ford.rs/puma + cenovnik Puma MY2027 (važi od septembra 2026.) | Bez promene. ST-Line 1,0 EcoBoost mHEV 125 KS, automatik 7: akcijska cena 21.740 €. Motori, prtljažnik 456/1.126 l, felne 17" 215/55 R17, ekrani 12" i 12,8" se poklapaju. |
| Ford Kuga ST-Line | ford.rs/nova-kuga + cenovnik Nova Kuga | Bez promene. ST-Line 1,5 EcoBoost 186 KS, automatik 8: akcijska cena 27.490 €; ekran 13,2"; prtljažnik do 536 l. |
| MG ZS Hybrid+ | mgmotor.rs/model/zs-hybrid | **Promenjeno.** Sajt prikazuje samo „Od 19.990 €“ (početni paket), bez cene Luxury i bez akcije. AMF je imao „23.990 €, akcijska, Luxury“. Sada je cena „od 19.990 €“, bez varijante, uz napomenu „Početna cena modela (mgmotor.rs)“. URL je `zs-hybrid` (bio `zs-hev`). Snaga 145 kW i potrošnja se poklapaju. |
| MG HS Hybrid+ | mgmotor.rs/model/hs-hybrid | **Promenjeno.** Cena je „od 29.990 €“ (bila 32.990 € Luxury), bez varijante. Snaga je 165 kW / **224 KS** (bilo 225). URL je `hs-hybrid`. |
| MG3 (novo) | mgmotor.rs/model/mg3 | Od 14.990 €; 1,5 l benzinski motor, 85 kW / 115 KS, manuelni menjač, 6,1 l/100 km (WLTP), prtljažnik 293/983 l, ekran 10,25", tabla 7", 0–100 km/h za 10,8 s. **Bez slike:** sajt ne daje dozvolu za korišćenje fotografija. Felne nisu upisane, jer tekst na sajtu pominje „MG3 Hybrid+“ (deluje kao greška na sajtu). |

## Šta je provereno

- `npx tsc --noEmit`: čisto.
- `npm run lint`: 0 grešaka. Četiri ranija upozorenja su u fajlovima koje nisam dirao.
- `npx vitest run convex lib components app`: 14.616 testova prošlo.
  - **Pada** `lib/admin-v1/event-sections.test.ts` (2 testa). To je postojeće stanje grane `stranica-brenda`: sekcija `brendovi-qr` je dodata bez izmene testa. Nije deo ovog zadatka i nisam ga menjao.
  - `convex/fairLeads.test.ts` je jednom pao u punom paralelnom pokretanju (2 testa, pod opterećenjem). Posle toga je 3 puta prošao sam (64/64), a ceo `convex` je prošao.
- `npm run check`: `lint`, `build` (Next build uspeo) i `harness:namespace` su prošli. `harness:check` **nije pokrenut do kraja**, jer na ovoj mašini nije instaliran Playwright Chromium (`npx playwright install` nije pokretan, to je preuzimanje). Treba ga pokrenuti tamo gde je browser instaliran.
- Novi testovi za `exhibitor_delivery` (convex-test):
  - isključeno po difoltu;
  - normalizacija adresa i limit od 3;
  - admin mutacija (samo admin, audit);
  - jedan mejl posle 90 s na sve adrese sa `reply_to` i lidom `delivered`;
  - 3 modela istog posetioca u jednom mejlu, dva reda `MERGED`, a drugi izlagač se ne spaja;
  - retry posle 503 šalje isti ključ, isto telo i iste primaoce, a lid ostavljen u međuvremenu dobija svoj mejl;
  - admin lid, pre-event lid i duplikat ne prave red;
  - `EXHIBITOR_NOTIFY_OFF` i `LEADS_DISABLED`, bez vrtenja kroz sweep;
  - događaj sa ranijim `piiPurgeAt` odbija lid;
  - test mejl;
  - Resend sa listom adresa i `reply_to`.
- **DEV (`expert-pelican-136`):**
  - `npx convex dev --once`, pa ceo runbook: `bootstrapEvent`, `importDryRun` (samo upozorenja QR i MG3 bez fotografije), `importCommit`, `publishEventModels`, `setupLeads` (bez `skippedNotEntitled`) i `setLeadNotifyEmails` sa **jovanm028@gmail.com**.
  - Da bi DEV primao lidove, `FAIR_LEADS_ENABLED=true` je postavljen **na DEV-u**.
  - Test mejl izlagača je otišao na jovanm028@gmail.com (Resend id `01a2183d…`).
  - Pravi lid preko lokalnog Next-a i `/brend/ford` (probna vožnja, Puma i Kuga):
    - jedan red `exhibitor_delivery` je `sent` sa 2 lida;
    - drugi red je `skipped/EXHIBITOR_DELIVERY_MERGED`;
    - oba lida su `delivered`.
  - DEV događaj je za ovu probu privremeno pomeren na početak 26. 11. (admin `fairAdmin:upsertEvent`), pa vraćen na 27. 11. u 10:00 (`bootstrapEvent`).
- **Browser (lokalno):** `/sajam/auto-expo-2026` (šematska mapa „Hala“ sa Grand Motorsom, desktop i mobilni, bez horizontalnog skrola i bez grešaka u konzoli), `/brend/ford`, `/brend/mg`, `/model/mg3` (oznaka „Hala“, bez broja štanda) i `/sajam/privatnost` (16. decembra).
- **Nije provereno u browseru:** admin inbox red „Poslato izlagaču“ (lokalno nisam bio prijavljen kao admin). Pokriveno je tipovima i testovima.

## Otvorena pitanja

1. **MG3 fotografija:** zatražiti od VIVA COMPANY (Jelena Milić) sliku sa pravom korišćenja, pa je dodati kao `public/fair/auto-expo-2026/mg3.webp` i ponovo uvesti.
2. **MG cene i verzije:** koju verziju i cenu Grand Motors stvarno izlaže (Luxury? akcija?). Sada stoji „od“ cena sa sajta.
3. **`/sajam` preusmerenje:** sa Auto Expo-om u `EVENT_DEFINITIONS`, `/sajam` vodi na Auto Expo dok traje ili predstoji. Ako to ne želiš, javi.
4. **Broj štanda i kategorija:** mapa je šematska. Kad stigne broj štanda ili plan, mapa se menja na pravu. Izlagač na mapi stoji pod „Bez kategorije“, jer import ne nosi kategoriju; to može da se postavi u adminu.
5. **Testovi grane `stranica-brenda`:** `lib/admin-v1/event-sections.test.ts` treba dopuniti sa `brendovi-qr` (nije deo ovog zadatka).

## Redosled komandi za produkciju

Komande su za Git Bash, iz korena repoa. `ADMIN` mora biti u `SCANME_ADMIN_EMAILS` i postojati u `users` na PROD-u. **Sve mora da se završi pre 27. 11. u 10:00**, jer se tada zamrzava skup pasoša.

```bash
ADMIN=jovanm028@gmail.com
P=docs/events/auto-expo-2026/intake/b1-payload.json

# 0) Grana i provera
git push aleksa auto-expo-2026

# 1) Convex PROD (prvo backend: šema je aditivna; AMF/Elektro ostaju zatvoreni zbog piiPurgeAt = 16. 11.)
npx convex deploy

# 2) Vercel (produkcija se gradi iz main; main je predak ove grane, pa ide fast-forward)
git checkout main && git merge --ff-only auto-expo-2026 && git push aleksa main
# sačekati da se Vercel produkcioni build završi

# 3) Zatvoriti AMF i Elektro (druga brava; oba su sada "published")
npx convex run --prod fairSetup:setEventStatus "{\"eventCode\":\"auto-moto-fest-2026\",\"status\":\"ended\",\"actorEmail\":\"$ADMIN\"}"
npx convex run --prod fairSetup:setEventStatus "{\"eventCode\":\"elektromobilnost-2026\",\"status\":\"ended\",\"actorEmail\":\"$ADMIN\"}"
# UPOZORENJE: bootstrapEvent bez --event ponovo objavljuje Elektro; uvek navesti --event.

# 4) Događaj Auto Expo 2026
node scripts/events/fair-setup-run.mjs bootstrapEvent --actor "$ADMIN" --event auto-expo-2026 --prod
node scripts/events/fair-setup-run.mjs importDryRun --payload "$P" --prod          # STOP ako ima "error"; očekivano: samo FAIR_QR_MISSING i FAIR_PHOTO_MISSING (mg3)
node scripts/events/fair-setup-run.mjs importCommit --payload "$P" --actor "$ADMIN" --prod
node scripts/events/fair-setup-run.mjs publishEventModels --event auto-expo-2026 --actor "$ADMIN" --prod

# 5) Lead forme i saglasnost (AMF tekst, legalApprovedBy = Aleksa Đorđević)
npx convex run --prod fairSetup:setupLeads "$(sed "s/<ADMIN_EMAIL>/$ADMIN/" docs/events/auto-expo-2026/intake/setup-leads.json | tr -d '\n')"
# očekivano: consents 2, defaults 2, modelConfigs 10, skippedNotEntitled 0

# 6) Test mejl izlagača na moju adresu, pa uključivanje Jeleninih adresa
#    (prazna lista ništa ne uključuje, samo vraća participationId)
npx convex run --prod fairSetup:setLeadNotifyEmails "{\"eventCode\":\"auto-expo-2026\",\"participationExternalKey\":\"auto-expo-2026-grand-motors\",\"emails\":[],\"actorEmail\":\"$ADMIN\"}"
npx convex run --prod fairEmailSender:sendExhibitorLeadTestEmail '{"participationId":"<ID IZ PRETHODNE KOMANDE>","to":"jovanm028@gmail.com"}'
# proveriti mejl u inboxu, pa:
npx convex run --prod fairSetup:setLeadNotifyEmails "{\"eventCode\":\"auto-expo-2026\",\"participationExternalKey\":\"auto-expo-2026-grand-motors\",\"emails\":[\"jelena.milic@vivacompany.rs\"],\"actorEmail\":\"$ADMIN\"}"

# 7) Provere
curl -s -i -X POST https://www.scanme.rs/api/fair/visitor -H "Origin: https://www.scanme.rs" -H "Content-Type: application/json" -d '{}' | head -1
#   očekivano: HTTP 200 sa Set-Cookie (bilo je 503 VISITOR_UNAVAILABLE)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://www.scanme.rs/api/fair/lead -H "Origin: https://www.scanme.rs" -H "Content-Type: application/json" -d '{}'
#   očekivano: 4xx za prazno telo, nikako 503
for u in /sajam/auto-expo-2026 /sajam/auto-expo-2026/brend/ford /sajam/auto-expo-2026/brend/mg /sajam/auto-expo-2026/model/ford-kuga /sajam/privatnost; do
  curl -s -o /dev/null -w "$u %{http_code}\n" "https://www.scanme.rs$u"; done
#   očekivano: 200 svuda; /sajam/privatnost prikazuje "16. decembra 2026."
```

Posle 10:00 27. 11.: jedan probni lid sa telefona preko štampanog QR-a (stranica brenda). Za 90 s u adminu treba da piše „Poslato izlagaču: poslata“, a lid treba da bude „Isporučeno“. Probni lid pre 10:00 izlagaču namerno ne ide (pravilo „pre otvaranja“).
