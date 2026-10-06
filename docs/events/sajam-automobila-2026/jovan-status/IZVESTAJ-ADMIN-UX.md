# Admin UX lanac — završni izveštaj (A1–A10, Z1, Z2, RA)

Grana `codex/jovan-admin-ux-2026-10-06`, osnova `d2d768c`, HEAD `3aaf49f`, DEV `dev:expert-pelican-136`. Ništa nije gurnuto ni deploy-ovano.

## 1. Presuda RA

**PRESUDA: TREBA DORADA** (`scripts/tasks/logs/sajam-v2/RA-IZVESTAJ.md`).

Zahtevi `ADMIN-UX-ZAHTEVI.md` §1–§11 su ispunjeni, a provere runnera su zelene u svih 12 koraka. Nema kritičnih ni visokih nalaza. Pre uključivanja Pošte treba ispraviti jedan srednji bezbednosni nalaz (upload priloga); još dva srednja se ne vide pri očekivanom obimu (vidi §6).

## 2. Koraci

Commitovi su iz `scripts/tasks/logs/sajam-v2/SAJAM-IZVESTAJ.md`, a testovi iz statusa koraka (`jovan-status/<KORAK>.md` §3–§4).

| Korak | Šta je urađeno | Commit | Testovi |
|---|---|---|---|
| A1 | Zajednički prekidač Tabela/Kartice (`components/admin/admin-ui/`) na svim listama admina, sortiranje, lepljivo zaglavlje | `7482ed6` | `view-mode`, `table-sort`, `admin-data-view` (SSR) |
| A2 | Događaji: ruta `/admin/dogadjaji/[eventSlug]/[[...section]]`, 15 slugova, filteri i prikaz u URL-u, preview na istim putanjama | `1dc2735` | `event-sections`, `query-state`, prilagođeni `admin-events*` |
| A3 | Modeli: hijerarhijski filter Izlagač → Brend → Model, faseti, detalj na sopstvenom URL-u; `fairAdminStats.getLeadCounts` | `ab5736b` | `hierarchy`, `model-filters`, `fairAdminStats.test.ts`, authz |
| A4 | QR: filteri, „Upravljaj“ → QR detalj, promena odredišta (`reassignQr`), uklanjanje veze, masovna dodela; bez „Oslobodi“ | `f1c6e78` | `fairAdminQr.test.ts`, `qr-filters`, `qr-flow`, `qr-bulk`, `qr-view` |
| A5 | Izlagači (svi segmenti, paketi, QR, leadovi) i import iz Excel/CSV sa mapiranjem kolona i šablonom | `c81e6fc` | `lib/fair-import/*`, `exhibitors`, `izlagaci-view`, `import-view` |
| A6 | Glas publike (picker, dinamičke opcije, kvota, matrica, bedž Sponzorisano) i ankete | `dd90a99` | `option-rows`, `audience-quota`, view testovi |
| A7 | Automatski pasoš sa sakrivanjem; forme po izlagaču + „Primeni na sve“ | `f1e7413` | `fairPassports.test.ts`, `fairLeads.test.ts`, `passport-overview`, `lead-forms` |
| A8 | Inbox leadova, detalj sa aktivnošću, isporuka i rok 15. 11., PII izvoz, follow-up po izlagaču (jedan email po paru) | `a5fb1ae` | `fairLeadsInbox.test.ts`, `fairFollowUps.test.ts`, authz |
| A9 | Sponzorisano se ažurira samo (prekidač po događaju), mreža izveštaja dan × izlagač, brisanje sa odbrojavanjem | `fb0c64f` | `fairSponsored.test.ts`, authz, view testovi |
| A10 | Pregled: „Šta treba da uradim“ po hitnosti, KPI, kartice sekcija; `fairDashboard.getEventDashboard` | `b9c5fe3` | `fairDashboard.test.ts` (pravila, faze), `pregled-view` |
| Z1 | Pošta: povezivanje ličnog Zoho EU sanduka (OAuth, šifrovani tokeni), folderi, lista, čitanje u sandbox iframe-u, prilozi | `5f1d412` | `adminMail.test.ts` (38), `mail-view.test.tsx`, `navigation` |
| Z2 | Pošta: novo pismo, odgovor, odgovor svima, prosledi, prilozi, potpis, ScanMe template, idempotentno slanje | `3aaf49f` | `adminMail.test.ts` (+14), `adminMailCompose`, `scanme-email`, `mail-compose` |
| RA | Nezavisni pregled (plan mode, bez izmena) | — | — |

Provere posle Z2 (`Z2.md` §3): `tsc` 35 starih grešaka (isto kao osnova), `vitest fair` 44 fajla / 411 testova zeleno, `npm test` 1961 prolazi uz ista 2 stara pada, `lint` 0 grešaka, build i harness zeleni. Svih 81 snimaka lanca: HTTP 200, bez horizontalnog skrola, 0 grešaka u konzoli (RA).

## 3. Kako da isprobaš

**A. Bez prijave i bez podataka (dev preview, TEST fixture-i).** Pokreni `npm run dev -- -p 3150` i otvori `http://localhost:3150` + putanja:

1. `/dev/admin-events-preview/pregled?faza=sajam`: na vrhu je „Šta treba da uradim“ (crveno Hitno, pa Uskoro, pa Info), svaka stavka ima broj i dugme. Promeni `?faza=pre` i `?faza=posle`: lista se menja po fazi.
2. `/dev/admin-events-preview/modeli`: izaberi izlagača, pa brend; model polje je pretraga. Prekidač Tabela/Kartice je desno iznad liste. Klik na model otvara `modeli/<id>` sa vezama na QR, pitanja, pasoš, forme.
3. `/dev/admin-events-preview/qr`: filter „Stanje“, „Upravljaj“ otvara `qr/<kod>` sa „Promeni odredište“ (traži razlog) i „Ukloni vezu“. Dugmeta „Oslobodi“ nema. „Dodela u većem broju“: nalepi dve kolone i vidi pregled grešaka pre potvrde.
4. `/dev/admin-events-preview/interakcije/glas-publike`: dodaj, pomeri i ukloni opcije (najmanje 2), vidi kvotu pre snimanja i matricu model × dan. Sponzorisano je ljubičasto, Objavljeno zeleno.
5. `/dev/admin-events-preview/interakcije/pasos` i `/interakcije/forme`: razlog zašto brend nema pasoš, „Sakrij“, „Primeni na sve modele izlagača“.
6. `/dev/admin-events-preview/leadovi`, `/leadovi/follow-up`, `/leadovi/podesavanja`: filteri, rok 15. 11., otvaranje leada (drawer `?lead=`), merge polja `{ime}`, `{modeli}` sa pregledom; saglasnost je samo u Podešavanjima.
7. `/dev/admin-events-preview/sponzorisano`, `/izvestaji`, `/brisanje`, `/import`, `/izlagaci`: auto status liste, mreža dan × izlagač, odbrojavanje do 16. 11., lepljenje tabele u import.
8. Ostali admin ekrani sa prekidačem: `/dev/admin-clients-preview`, `/dev/admin-orders-preview`, `/dev/admin-products-preview`, `/dev/admin-qr-preview`, `/dev/admin-tasks-preview`, `/dev/admin-finance-preview`, `/dev/admin-team-preview`, `/dev/admin-settings-preview`, `/dev/admin-services-preview?service=links`. Izaberi Kartice, osveži stranicu: izbor ostaje.
9. Pošta: `/dev/admin-mail-preview` (poruka sa skriptom i slikom: slike blokirane dok ne klikneš „Prikaži slike“), `?stanje=pisanje`, `?stanje=pregled-pisma`, `?stanje=potpis`. Preview nikad ne šalje.
10. Za svaki ekran suzi prozor na ~390 px: stranica ne skroluje vodoravno, široke tabele skroluju u svom okviru.

**B. Pravi admin na DEV-u (`dev:expert-pelican-136`, TEST podaci).** Prijavi se kao admin i otvori `/admin/dogadjaji`: vodi na Pregled aktuelnog TEST događaja. Promeni događaj u padajućoj listi: sekcija ostaje. Back/Forward rade između sekcija. Na Pasošu jednom klikni „Osveži pasoše“ (`A7.md` §7.4).

**C. Pošta uživo** tek posle podešavanja iz §4 i ispravke nalaza 1 iz §6: `/admin/posta` → „Poveži Zoho nalog“, pa probni email tačno po `Z2.md` §8 (samo na sopstvenu drugu adresu, naslov počinje sa „TEST“).

## 4. Podešavanja (bez vrednosti)

Runner ne podešava tajne. Postavlja ih Jovan (ili Aleksa za prod), posebno za DEV i prod.

| Okruženje | Ime | Ko | Šta ako fali |
|---|---|---|---|
| Convex | `ZOHO_MAIL_CLIENT_ID`, `ZOHO_MAIL_CLIENT_SECRET` | Jovan | Pošta je inertna (`ZOHO_NOT_CONFIGURED`), bez mrežnih poziva |
| Convex | `ZOHO_MAIL_REDIRECT_URI` (isti kao u Zoho konzoli, https ili localhost) | Jovan | isto |
| Convex | `ZOHO_TOKEN_ENCRYPTION_KEY` (32 B base64, različit po deployment-u) | Jovan | isto; promena ključa traži ponovno povezivanje svih admina (`Z1.md` §7.6) |
| Convex | `ZOHO_MAIL_CLIENT_ENABLED` (tačno `true`, poslednje; **tek posle ispravke RA nalaza 1**) | Jovan | sve ostaje ugašeno |
| Convex | `FAIR_LEADS_ENABLED` (tačno `true`) | Aleksa/Jovan | forme ne primaju leadove; Pregled upozorava pre sajma |
| Convex | `FAIR_FOLLOWUP_ENABLED` (tačno `true`, **pre otvaranja sajma**: red za follow-up nastaje samo ako je uključen u trenutku prijave, `convex/fairLeads.ts:165`, i proverava se ponovo pri slanju) | Aleksa/Jovan | nema follow-up emailova |
| Convex | `FAIR_EMAIL_REPLY_TO` (pre follow-up prekidača), `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `FAIR_PUBLIC_BASE_URL`, `SCANME_ADMIN_EMAILS` | Jovan | emailovi se ne šalju / admin pristup ne radi |
| Convex + Next | `FAIR_GATEWAY_SECRET` (postojeće; na DEV-u postavljeno) | Aleksa/Jovan za prod | fair skenovi i interakcije ugašeni (fail closed) |
| Next | `FAIR_VISITOR_HASH_SECRET`, `FAIR_COOKIE_DOMAIN` (opciono) — postojeće | Aleksa/Jovan | Pošta ne traži nove Next promenljive |

Pošta ne čita `ZOHO_ACCOUNTS_BASE_URL` ni `ZOHO_MAIL_API_BASE_URL` (EU je fiksno), niti ingest imena ADMIN-09B (`ZOHO_MAIL_SYNC_ENABLED`, `ZOHO_MAIL_OUTBOUND_ENABLED`, `ZOHO_MAIL_REFRESH_TOKEN`…).

**Zoho API Console (EU, `api-console.zoho.eu`)** (`Z1.md` §8):
- klijent „Server-based Applications“ u EU centru (drugi centar → `ZOHO_REGION_UNSUPPORTED`);
- Authorized Redirect URI tačno `<sajt>/api/admin/posta/callback`, bez `/` na kraju: DEV `http://localhost:3150/api/admin/posta/callback`, prod `https://…` (host potvrditi);
- scope-ovi: `ZohoMail.accounts.READ`, `ZohoMail.folders.READ`, `ZohoMail.messages.READ`, `ZohoMail.messages.UPDATE`, `ZohoMail.messages.CREATE` (offline, consent);
- ako Zoho organizacija ograničava aplikacije trećih strana, dozvoliti je u Zoho Admin konzoli;
- prvo povezivanje proverava da li Mail Free plan dozvoljava REST API.

**Prekidači u adminu (baza, ne env):**
- „Automatsko ažuriranje“ sponzorisane liste po događaju (`fairEvents.sponsoredAutoPublish`, uključeno kad nije postavljeno; `A9.md` §6). Isključuje se jednim klikom ako Aleksa ne prihvati odluku §5.1.
- Aktivacija saglasnosti u `leadovi/podesavanja` — tek posle pravne provere (P0, `A8.md` §7.1).
- Forme po izlagaču + „Primeni na sve modele“ (`A7.md` §7.3); follow-up tekst po izlagaču za Napredne izlagače (`A8.md`).

## 5. Odluke za Aleksin pregled (ADMIN-UX §12)

| # | Razlika prema MASTER-u | Gde je opisano |
|---|---|---|
| 1 | Sponzorisana lista se ažurira automatski (MASTER §10: ručno), uz prekidač po događaju | `FAIR-BACKEND-CONTRACT.md` §35.1; `A9.md` §6 |
| 2 | Pasoš je automatski za brendove koji ispunjavaju uslov, uz sakrivanje | ugovor §33.1; `A7.md` §6; `BLOCKED.md` „SAJAM v2 — A7“ (uslov §9.31) |
| 3 | Follow-up po izlagaču (jedan email po paru) umesto po leadu | ugovor §34.1; `A8.md` §6 |
| 4 | Uz lead se prikazuje aktivnost posetioca na modelima tog izlagača; pravni tekst PRIVREMEN | ugovor §34.1, §34.8; `A8.md` §7.1 |
| 5 | Zoho: lično sanduče svakog admina (ADMIN-09: jedan integracioni mailbox) | `Z1.md` §6.1 |
| 6 | PII izvoz premešten iz Izveštaja u Leadove | ugovor §34.1; `A8.md` §6 |

Ostale odluke koje čekaju Aleksu: promene prikaza V1 ekrana (Tabela od 1024 px, Proizvodi počinju u Tabeli; `A1.md` §7), nazivi u navigaciji (`A2.md` §7), pragovi hitnosti (`A10.md` §7.1), pitanja Glasa publike pre aktivacije paketa (`A6.md` §7.1, `A10.md` §7.2), dodela QR-a po nazivu (`BLOCKED.md` „SAJAM v2 — A4“).

## 6. Otvoreno i poznati problemi (nalazi RA, nerešeni)

Izvor: `scripts/tasks/logs/sajam-v2/RA-IZVESTAJ.md`. Nijedan nije ispravljen (IZA ne menja kod).

**Srednji:**
1. `convex/adminMail.ts:803-846` — `registerMailUpload` prihvata bilo koji `_storage` id koji nije već mail upload. Admin (ili ukradena admin sesija) može da obriše ili pošalje emailom tuđe fajlove (logo klijenta, pozadine, memories, arhive, foto modela). Važi tek kad je Pošta uključena. Predlog: rezervacija u `generateMailUploadUrl` (obrazac `convex/offerLogoUploads.ts`) + provera `_creationTime` + test. Tvrdnja u `Z2.md` §4 „tuđi storageId se ne može preuzeti“ važi samo za već registrovane mail fajlove.
2. `convex/lib/fairLeadActivity.ts:40-46` — par za follow-up se traži među prvih 500 leadova izlagača; opt-out na novijem leadu para tada se ne vidi. Predlog: indeks po normalizovanom emailu.
3. `components/admin/events/sections/qr-section.tsx:25-31` — QR filteri rade samo nad učitanih 100 kodova; problem tek za inventar veći od 100.

**Niski (izbor):** čišćenje posle `sent` može prepisati ishod u „nesigurno“ (`adminMail.ts:1125-1138`); opoziv Zoho grant-a nije proveren (`zohoMailClient.ts:429-440`); jednoprolazno čišćenje HTML-a (`mail-srcdoc.ts:33-46`, barijera sandbox + CSP drži); javne mail akcije proveravaju konfiguraciju pre auth-a; čuvaju se traženi umesto dodeljenih scope-ova; izmena modela ne osvežava pasoš; teški upiti leadova su reaktivni; nema `info` tona i Napredni koristi ljubičastu boju Sponzorisanog u panelu kvote; brojevi u navigaciji samo za hitnost; sortiranje nije u URL-u. Pun spisak sa fajlovima i predlozima je u RA izveštaju (25 nalaza).

**Otvorena pitanja iz statusa:** pravni tekst saglasnosti (P0), kanal predaje leadova (P0.2), `text/plain` deo i limiti Zoho Free plana (`Z2.md` §7), cron za čišćenje `adminMailSendCommands` i neregistrovanih fajlova (`Z2.md` §7.4–5).
