# Izveštaj za Aleksu — sync, pre-event, mapa i dorada (8. 10. 2026.)

> Grana `codex/jovan-sajam-noc-2026-10-08`, HEAD `ef661e5`, DEV `dev:expert-pelican-136` (`scripts/tasks/logs/sajam-v2/IZD-snapshot.txt`).
>
> Izvori: `SYNC-1008.md`, `P1.md`, `P2.md`, `D1.md`, `JOVAN-DELTA-2026-10-08.md`, `scripts/tasks/logs/sajam-v2/SAJAM-IZVESTAJ.md`, gate logovi `P1-*`, `P2-*`, `D1-*` i pregled RD (poslednja poruka sesije RD).

## 1. Presuda RD

**SPREMNO ZA DEPLOY.** Nijedan nalaz ne kvari sajam ni podatke, pod dva uslova: Convex se pušta pre Vercel-a, a reset pre-event podataka radi se pre ponoći.

D2 nije radio. `SAJAM-IZVESTAJ.md` beleži: „D2 preskočen: RD nije tražio doradu“. Zato tri srednja nalaza RD ostaju otvorena (§7).

## 2. Koraci

| Korak | Šta je urađeno | Commit | Testovi |
|---|---|---|---|
| Spajanje | <ul><li>Aleksina grana `7bb7531` + noćni lanac `c6bfd6e`.</li><li>Odluka za svaki fajl je u `SYNC-1008.md` §2.</li><li>Aleksin `fairSetup.ts`, RUNBOOK, intake i pasoš su bajt-za-bajt isti kao na `7bb7531` (`git diff 7bb7531 HEAD` je prazan; RD).</li></ul> | `60b5fd9` | `SYNC-1008.md` §6: build, tsc 35 (= osnova), fair testovi, harness 177×2 |
| P1 — pre-event | <ul><li>Paket važi od dodele.</li><li>Glas publike: „Otvori sada“.</li><li>Oznaka `preEvent`; granica je `startsAt` događaja.</li><li>„Resetuj pre-event podatke“: dry-run + slug.</li><li>Pre-event lead nema follow-up.</li></ul> | `db7e5cf` | fairtest 65 fajlova / 614 testova; `npm test` 2 stara pada (= osnova); `P1-P1-a3-gate-*.log` |
| P2 — mapa i nalepnice | <ul><li>Mapa po intake-u (9, 6 ×2, 1A, 1B), bez duplikata.</li><li>Nove internal funkcije `reconcileSiteExhibitorsWithIntake` i `listStandsOffMap`.</li><li>Normalizator prima ćirilicu, `#7`, `SA26/7` i slično.</li><li>Zamena nalepnice na zastarelim podacima se odbija.</li><li>Javna mapa i stranica modela prikazuju samo aktivno i objavljeno.</li></ul> | `c8c392f` | fairtest 67 / 632; `P2-P2-a1-gate-*.log` |
| D1 — dorada | <ul><li>Spoljna fotografija ne ide kroz `/_next/image`.</li><li>Duplikat forme ne obećava mejl.</li><li>ScanMe je uvek zelen.</li><li>Zona dodira ≥ 44 px.</li><li>Tačka montaže `new-stamp-card` je upisana u JOVAN-DELTA.</li></ul> | `ef661e5` | fairtest 74 / 665; `npm test` 2 stara pada (= osnova); `D1-D1-a1-gate-*.log` |
| D2 | Nije pokretan (RD nije tražio doradu). | — | — |

## 3. Promene API ugovora (Aleksina stavka 6)

**Oblik zahteva i odgovora koji koristi Aleksin frontend nije promenjen.** Dokaz:
- `app/api/fair/**` i `lib/fair-server/leads.ts` nisu menjani posle spajanja (`scripts/tasks/logs/sajam-v2/DORADA-stat.txt`);
- postojeći `lib/fair-server/*.test.ts` prolaze bez izmena (`P1.md` §2.1, stavka 6).

Promenjene su samo vrednosti, uz nekoliko aditivnih argumenata:

| Šta | Diff | Izvor |
|---|---|---|
| `fairPublic.listAudienceQuestionsForModel` | `args: { eventModelId, dateKey?, at? }`: novo opciono `at`. Bez `at` odgovor je isti kao pre. | `convex/fairPublic.ts:380`; JOVAN-DELTA P1 §2 |
| `lib/fair-server/model-page.ts` | `loadFairAudienceQuestions(eventModelId, dateKey, at = Date.now())` | `model-page.ts:69-72` |
| `POST /api/fair/lead` | Za `duplicate: true` je `confirmationEmail` uvek `false` (`convex/fairLeads.ts:77`). Ključevi su isti. | JOVAN-DELTA D1 §2 |
| pre-event lead | `followUpScheduled: false` (polje je postojalo i ranije) | JOVAN-DELTA P1 §2 |
| `fairPublic.getEventMap` | samo `active` učešća i štandovi; oblik isti | `convex/fairPublic.ts:307,325` |
| `fairPublic.getModelBySlug` | događaj u nacrtu → `null` | `convex/fairPublic.ts:240` |
| `fairAdminQr.linkSticker` (admin) | novi opcioni argument `expectedModelStickerCode` | `convex/fairAdminQr.ts:325` |
| `fairLeadNameRisk` | `J.Petrovic` više nije „link“ | JOVAN-DELTA D1 §2 |
| šema | aditivno: polje `preEvent?` na 6 tabela i 6 novih indeksa | `P1.md` §2.3 |

**Posledica za deploy:** novi frontend šalje `at` i `expectedModelStickerCode`, a stari Convex odbija nepoznat argument. **Convex mora pre Vercel-a** (RD nalaz 3).

## 4. Pre-event (stavka 2.1) na DEV-u

**Da.** Pušteno je commitom `db7e5cf` na `dev:expert-pelican-136`.

- **Push:** `scripts/tasks/logs/sajam-v2/P1-P1-a3-convex-push.log` → „Convex functions ready!“ u 14:09. Posle toga su pušteni i P2 (`P2-P2-a1-convex-push.log`, 14:49) i D1 (`D1-D1-a1-convex-push.log`, 15:27).
- **Migracija paketa:** dry-run (3 TEST modela) → stvarno (3) → ponovni dry-run (0) (`P1.md` §3).
- **Reset: samo dry-run.** `previewPreEventReset` daje 32 reda za `test-elektromobilnost-2026` i 8 za `test-auto-moto-fest-2026`. Stvarni reset nije pokretan (`P1.md` §3; RD: u transkriptima nema poziva `resetPreEventData`).
- **Intake** (`P2.md` §3.2):
  - RUNBOOK §1 bez `--prod`: bootstrap, import i objava 15 modela;
  - izlagači sa sajta;
  - usklađivanje: dry-run → stvarno → ponovni dry-run sa nulama;
  - `linkEventQrInventory`.
- **Mejl:** nijedan nije poslat (`P1.md` §3, `D1.md` §3.2).

## 5. Koraci u adminu (telefon)

Svaki tok kreće od: Admin → **Događaji** → „Sajam elektromobilnosti 2026“ (`elektromobilnost-2026`).

### JMEV anketa (samo model sa paketom Napredni)

1. **Interakcije → Ankete** → izaberi JMEV model sa paketom Napredni.
2. Unesi 1–5 pitanja → „Sačuvaj“ → **„Objavi verziju“**.
3. Proveri na stranici modela: chat-head ankete je gore desno u hero-u.
4. Ako model nije Napredni, ekran piše „Anketa je samo za paket Napredni“.

### Glas publike

1. **Interakcije → Glas publike** → model → dan → pitanje i 2–5 odgovora → „Sačuvaj“ → **„Objavi“**.
2. Ako pitanje treba pre njegovog dana: **„Otvori sada“**. Dnevna kvota ostaje: Starter 1, Napredni 5.
3. Ako posle „Otvori sada“ izmeniš pitanje, ponovo klikni „Otvori sada“. Izmena vraća početak pitanja na početak njegovog dana (RD nalaz 2).
4. Glasovi pre 9. 10. u 00:00 se ne broje. Posetilac vidi svoj izbor, a procenti se prikazuju od 5 glasova tokom sajma.

### Saglasnost (`N5.md` §8; `docs/tasks/BLOCKED.md` P3 §1)

1. **Leadovi → Saglasnost** → vrsta („Zainteresovan sam“ ili „Probna vožnja“) → tekst sa oznakom `{izlagac}` → „Sačuvaj nacrt“.
2. Upiši „Tekst je stručno proverio“ i „Datum stručne provere“ → **„Aktiviraj verziju N“**.
3. **Interakcije → Forme:** po izlagaču uključi formu, izaberi pravilo kontakta, pa „Primeni na sve modele“. Probna vožnja je samo za Napredne modele.
4. Forma se otvara tek kad je u Convex okruženju `FAIR_LEADS_ENABLED` tačno `true`.
5. **TEST saglasnost** (samo `test-elektromobilnost-2026` na DEV-u): tekst počinje sa „TEST – nije pravni tekst“. Posle probe: „Povuci aktivnu verziju“. Nikad na produkciji.
6. **Prava saglasnost** (`elektromobilnost-2026`): aktivira se samo pravno proveren tekst. Bez njega forma piše „Trenutno nedostupno“.
7. Posetilac u formi vidi:
   - ime, pa email i/ili telefon, prema pravilu izlagača;
   - tekst saglasnosti sa servera;
   - „Prihvatam“ / „Odbijam“;
   - nema polja za datum.

### „Poveži nalepnicu“ (pravih 15 modela)

1. Kao prijavljen admin skeniraj slobodnu SA26 nalepnicu. Može i ovako: Događaji → „Poveži nalepnicu“, pa ukucaj broj (`7`, `SA26-7`, `#7`, `СА26-7`).
2. Izaberi izlagača po štandu (1A Ferum, 1B BENTU, 6 AUTO MIG, 6 Grand Motors, 9 CUBI) → automobil → „Poveži“.
3. Zamena nalepnice koju automobil već ima traži potvrdu. Ako se nalepnica u međuvremenu promenila, ekran to javi i osveži se.
4. Ako je povezivanje pogrešno, odmah „Poništi“.
5. Skeniraj nalepnicu u privatnom prozoru: otvara se stranica automobila.

### „Resetuj pre-event podatke“

Radi se samo ako Aleksa odluči. Preporuka RD: posle poslednje probe, **pre 00:00**.

1. **Brisanje → „Pre-event podaci (probe pre sajma)“** → „Proveri šta bi bilo obrisano“ (dry-run brojke po vrsti).
2. „Resetuj pre-event podatke“ → ukucaj `elektromobilnost-2026` → „Obriši pre-event podatke“. Klikni **jednom**.
3. Ponovni dry-run mora dati 0.
4. Bez reseta skenovi upisani pre P1 deploya ostaju u brojkama. Reset je jedini put koji čisti redove upisane pre P1 (RD).

## 6. Produkcija danas, redom

Sve korake radi Aleksa. Tačne komande sa argumentima su u JOVAN-DELTA-2026-10-08, sekcije P1 §4 i P2 §4.

| # | Korak | Komanda ili mesto | Ako izostane |
|---|---|---|---|
| 1 | Kod na deljenu granu | merge `codex/jovan-sajam-noc-2026-10-08` ili `git am` patch-eva `scripts/tasks/logs/sajam-v2/patches/0047…0049` (P1, P2, D1), posle 0039–0046 | ništa od P1, P2 i D1 nije na produkciji |
| 2 | Convex deploy | `npx convex deploy` | novi frontend dobija odbijene argumente: „Poveži“ pada, Glas publike je prazan |
| 3 | Vercel deploy | standardni tok, **posle** koraka 2; zatim pun reload admina na telefonu | ostaje stari frontend; stari admin tab ne može da zameni nalepnicu |
| 4 | Provera događaja | admin: događaj je objavljen, `startsAt` je 9. 10. u 00:00 | pogrešna pre-event granica |
| 5 | Intake, ako nije urađen | RUNBOOK §1: `bootstrapEvent`, `importDryRun`, `importCommit`, `publishEventModels` (`--prod`) | nema pravih 15 modela |
| 6 | Migracija paketa | `npx convex run fairPackages:migrateFutureActivations '{"dryRun":true}' --prod`, pa isto sa `false`, pa ponovo `true` → `moved: []` | modeli uvezeni pre P1 nemaju prava do 9. 10. |
| 7 | Inventar | `fairExhibitorImport:linkEventQrInventory` (`--prod`) | „Poveži“ ne nudi SA26 nalepnice |
| 8 | Izlagači sa sajta | `importSiteExhibitors`, pa `placeSiteExhibitors` (`--prod`) | na mapi je samo 5 intake izlagača |
| 9 | Usklađivanje mape | `reconcileSiteExhibitorsWithIntake`: dry-run (pregledaj `site` i `fill`) → `dryRun:false` → ponovni dry-run sa nulama | duplikati brendova na mapi |
| 10 | Štandovi van mape | `fairExhibitorImport:listStandsOffMap '{"eventCode":"elektromobilnost-2026"}' --prod`; svaki red ručno prebaciti | štand se ne vidi, a objava modela pada |
| 11 | Mapa | `fairPublic:getEventMap` (`--prod`) ili `/sajam/elektromobilnost-2026`: 9, 6 (dva izlagača), 1A, 1B; štand 14 zelen | — |
| 12 | Jedan sken prave nalepnice | poveži SA26-00x, pa skeniraj u privatnom prozoru → stranica automobila sa fotografijom | ne znamo da li nalepnica vodi na automobil |
| 13 | Reset pre-event (po odluci) | §5, pre 00:00 | probe ostaju u brojkama |

## 7. Otvoreno

- **Nalazi RD (D2 nije radio):**
  1. zona dodira na velikim štandovima hvata prazan prostor (`lib/fair-map/touch.ts`);
  2. izmena pitanja posle „Otvori sada“ ga ponovo zatvara (`convex/fairInteractionsAdmin.ts:126`);
  3. „Poveži“ zavisi od redosleda deploya (`lib/admin-v1/qr-link.ts:172`).
- **Niski nalazi RD:** reset kad je automobil premešten na drugi štand, hover partner tačaka, `X.Com` prolazi kao ime, audit usklađivanja.
- **Pasoš i spoljni URL fotografije** (`D1.md`, otvoreno pitanje 2): unosi se samo `scanme.rs/fair/` ili Convex upload.
- **Pravni tekst saglasnosti:** `docs/tasks/BLOCKED.md` P3 §1.
- **Aleksini predlozi** (`legalName`, `brandLogoUrl`, anketa po izlagaču; JOVAN-DELTA §6): nisu rađeni.
- **P1** (`P1.md` §7): deljene kolekcije, `fairVisitors`, anketa, dopuna MASTER §5, §18 i §20.
- **P2** (`P2.md` §7): javni naziv na mapi (CUBI ili JMEV), logo Grand Motors.
- **D1** (`D1.md` §7): kartica pečata na modelu bez fotografije na 360 px.
