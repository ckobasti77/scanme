# PROD GO checklist — Sajam elektromobilnosti 2026 (`elektromobilnost-2026`)

> Napisano **8. 10. 2026.** za produkciju `scanme.rs`.
>
> Ovaj dokument ne pokreće ništa. Svaku komandu za produkciju pokreće Aleksa, ili agent posle izričitog „OK“ za **tu** komandu.

## 0. Utvrđeno stanje (8. 10. 2026, samo čitanje)

| Stavka | Stanje |
|---|---|
| Frontend `scanme.rs` | Vercel (`Server: Vercel`), redirect na `https://www.scanme.rs`. Naslov stranice je „Digitalni partner Sajma automobila“, a to je `main` commit `eccfc3b`. `/sajam/elektromobilnost-2026` vraća **404**. |
| Convex u prod bundle-u | `https://adamant-warbler-746.eu-west-1.convex.cloud` |
| Prod Convex deployment | **`adamant-warbler-746`** (`npx convex dashboard --prod`). DEV je `perfect-ant-98`. |
| Funkcije na prod Convex-u | 397 funkcija u 63 modula. To je `main` plus `fairPrintInventory` (grana `codex/fair-panel-qr-prod-2026`). **Nema nijednog drugog `fair*` modula.** Svi prod moduli postoje i na ovoj grani, pa deploy **ništa ne briše**. |
| Grana koja se builduje | Po `scripts/tasks/Deploy.ps1` (`$ProdBranch = "main"`) to je **`main`**. **Proveriti u Vercel → Settings → Git** (CLI `vercel` nije instaliran na ovom računaru). |
| Build Command na Vercelu | **Nepoznato.** `docs/deploy/README.md` kaže `npx convex deploy --cmd "npm run build"` sa `CONVEX_DEPLOY_KEY`. **Proveriti u Vercel → Settings → Build & Development.** |
| `main` u odnosu na ovu granu | Na `main`-u je 27 commitova (ADMIN-V1) koji na grani postoje kao prepravljene kopije i dalje razvijene. Probni `git merge` daje **56 konfliktnih fajlova**, a uključuje `convex/schema.ts`. Auto-merge pravi duplikate (npr. `scanme_menu` dvaput u `serviceTypeValidator`). `app/admin` i `/r` su na grani nadskup `main`-a. |

### Šta `npx convex deploy` sa ove grane menja na prod-u

- **Šema je aditivna.** Ništa se ne briše; postojeća polja i indeksi ostaju.
  - Novo: 34 `fair*` tabele sa 82 indeksa, plus prazne tabele za meni, ordering i `adminMail*`.
  - Na postojećim tabelama samo opciona polja i indeksi:
    - `accounts.clientSegment` i `websiteUrl`, `.index("by_clientSegment")`;
    - `cards.by_businessId_and_label` (gradi se nad postojećim karticama);
    - `cardTargets.fairEventModelId`.
  - Unije su proširene (`cardTargetKind` + `menu`, `table_ordering`, `fair_model`). Postojeći podaci prolaze validaciju.
- **Novih 6 cron-ova:**
  - `sweep stale ordering shifts` (1 min), `sweep overdue ordering requests` (1 min), `sweep stuck menu cleanups` (2 min);
  - `fair daily report sweep` (15 min): pravi izveštaje u `pending_review` i nikad ih ne šalje sam;
  - `fair email outbox sweep` (5 min);
  - `fair pii purge` (15 min): **sam briše PII od 16. 11. 2026. 00:00**, bez ručnog odobrenja. To nije problem za sajam, ali je odluka posle sajma.
- **`/r/[cardCode]`:**
  - Dodate su grane `fair_model` (nalepnica, zatim stranica modela) i `fair_admin_link` (nepovezana nalepnica + prijavljen admin, zatim „Poveži nalepnicu“).
  - Sve postojeće grane (venue, memories, links, splitter) su iste. `fairAdminLinkShortcut` se vraća odmah za sve što nije sajamska nalepnica.
  - Testovi `convex/fairQrSticker.test.ts` i rezolver testovi prolaze.
- **Meni i poručivanje:**
  - `main` ih je isključio (`b2fa64b`, `MENU_EXISTS = false`).
  - Na grani su uključeni (`lib/flags.ts`: `MENU_EXISTS = true`, `ORDERING_EXISTS = true`). Sa ovim deploy-om admin oznaka „ScanMe Page“ postaje „Meni“ i pojavljuje se Meni podstranica. **Odluka vlasnika (blokada B4).**
- **Pravilo posle deploy-a:** kad fair podaci uđu u prod, **stari `main` se više ne sme deploy-ovati na Convex**. Šema iz `main`-a ne poznaje `fair_model` i druga nova polja, pa bi deploy pao ili bi uklonio fair indekse.

---

## 1. Blokade (rešiti pre koraka 3)

| # | Blokada | Ko | Kako |
|---|---|---|---|
| B1 | Prod se builduje iz `main`, a ova grana nije u `main`-u | Aleksa (OK) | Predlog spajanja ispod (§2) |
| B2 | Nepoznati Vercel Build Command i production branch | Aleksa | Vercel dashboard. Ako Build Command radi `convex deploy`, push na `main` istovremeno deploy-uje Convex. |
| B3 | Na Convex prod-u **nema nijednog `FAIR_*`**; na Vercelu nije provereno | Aleksa | §3 |
| B4 | Meni i poručivanje se uključuju sa ovim deploy-om (vraćen `b2fa64b`) | Aleksa (odluka) | Ostaviti, ili pre spajanja vratiti `MENU_EXISTS = false` (jedan red) |
| B5 | Saglasnost za leadove čeka pravni tekst (MASTER §19 P0) | Aleksa | Do tada `FAIR_LEADS_ENABLED` ostaje isključen. Leadovi se ne primaju, a ostalo radi. |

## 2. Predlog: kako grana stiže u `main` (B1)

**Preporuka:** spajanje „naša grana pobeđuje“, pa fast-forward `main`-a. Ovako se proizvodi tačno ono stablo koje je testirano na DEV-u, bez mešanog stanja iz auto-merge-a, i bez force-push-a na `main`.

```bash
git fetch origin
git switch -c release/sajam-prod-2026-10-08 origin/codex/sajam-integracija-2026-10-04
git merge -s ours origin/main -m "Merge main into Sajam 2026 release (branch tree wins; main ADMIN-V1 is already contained)"
npm run check
npx vitest run convex/fair lib/fair lib/admin-v1 components/admin convex/cards
git push origin release/sajam-prod-2026-10-08
# posle pregleda (OK):
git push origin release/sajam-prod-2026-10-08:main
```

- `-s ours` zadržava stablo grane i beleži `main` kao spojen. Zato je posle toga `main` običan fast-forward.
- Šta se gubi iz `main`-a:
  - samo legacy fajlovi koje je cutover `4f8034d` obrisao, a grana ih još ima (`components/admin/customers-admin.tsx`, `app/dev/customers-preview/*`, `lib/i18n/sr/admin-customers.ts`; nisu u ruti `/admin`);
  - izolacija menija i poručivanja iz `b2fa64b` (B4).
- `app/admin/**` i `app/r/**` na grani su `main` plus nove rute (`dogadjaji`, `posta`, `/r/[cardCode]/o`).
- **Rollback:** `git push --force-with-lease origin <stari-main-sha>:main` (zapiši `git rev-parse origin/main` pre koraka 4) plus Vercel „Promote“ prethodnog deploymenta. Ne vraćaj Convex na stari `main` ako su fair podaci već upisani (vidi pravilo iznad).

---

## 3. Env (B3). Samo imena; vrednosti se nikad ne štampaju

Stanje Convex prod-a je očitano iz `npx convex env list --prod`, samo imena.

### Convex prod (`adamant-warbler-746`)

| Promenljiva | Na prod-u | Za sajam |
|---|---|---|
| `FAIR_GATEWAY_SECRET` | **NE** | **Obavezno.** Nova prod vrednost (≥32 znaka), **ista kao na Vercelu**. Bez nje nema skenova, ocena, glasova ni leadova. |
| `FAIR_PUBLIC_BASE_URL` | **NE** | `https://www.scanme.rs` (linkovi u mejlovima leadova) |
| `FAIR_EMAIL_REPLY_TO` | **NE** | Adresa za odgovore na potvrdu leada (odjava follow-up-a) |
| `FAIR_LEADS_ENABLED` | **NE** | Ostaje **neistinito** dok se ne aktivira saglasnost (B5). Tada `true`. |
| `FAIR_FOLLOWUP_ENABLED` | **NE** | Kao gore, posle `FAIR_EMAIL_REPLY_TO` |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | da | Postoje. Proveriti da je pošiljalac verifikovan za `scanme.rs`. |
| `SCANME_ADMIN_EMAILS` | da | Mora da sadrži email kojim se prijavljuješ na telefonu |
| `SCANME_SITE_URL`, `SITE_URL` | da | — |
| `SCANME_PIPELINE_SECRET`, `SCANME_GUEST_SECRET` | ne | Nisu za sajam (Memories). Postojeće stanje. |
| `SCANME_DEMO_SETUP_KEY`, `SCANME_VENUE_DEMO_SETUP_KEY` | ne | **Ne postavljati** na prod |

### Vercel Production (proveriti u dashboard-u: Settings → Environment Variables)

| Promenljiva | Za sajam |
|---|---|
| `FAIR_GATEWAY_SECRET` | **Obavezno**, ista vrednost kao Convex |
| `FAIR_VISITOR_HASH_SECRET` | **Obavezno** (≥32 znaka, samo Next). Bez nje u produkciji nema posetilačkog cookie-ja ni skenova (`lib/fair-server/visitor.ts`). |
| `FAIR_COOKIE_DOMAIN` | Opciono. Prazno znači samo host (`www.scanme.rs`). |
| `NEXT_PUBLIC_CONVEX_URL` | Mora biti `https://adamant-warbler-746.eu-west-1.convex.cloud` (već jeste u bundle-u) |
| `CONVEX_DEPLOY_KEY` | Samo ako Build Command radi `convex deploy` |
| QR „entry marker“ secret | **Ne postoji u kodu.** Marker iz JOVAN-DELTA 5. 10. nije implementiran, pa nema šta da se postavi. |

Komande (Convex; vrednost generiši lokalno i ne lepi je u chat):

```bash
npx convex env set FAIR_GATEWAY_SECRET "<nova-vrednost>" --prod
npx convex env set FAIR_PUBLIC_BASE_URL "https://www.scanme.rs" --prod
npx convex env set FAIR_EMAIL_REPLY_TO "<adresa>" --prod
npx convex env list --prod | sed 's/=.*//'
```

Rollback: `npx convex env remove <IME> --prod`, na Vercelu brisanje promenljive i redeploy.

---

## 4. Redosled (tačne komande)

`ADMIN=<tvoj admin email>` i `P=docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07/b1-payload.json`.

### Korak 1: backup prod podataka (prvo, uvek)

```bash
npx convex export --prod --path ../scanme-prod-backup-2026-10-08.zip
```

- Ako prod koristi file storage (Memories fotografije), dodaj `--include-file-storage` (veći fajl).
- Rollback podataka (samo u nuždi): `npx convex import ../scanme-prod-backup-2026-10-08.zip --replace --prod`.

### Korak 2: env (§3)

Postavi Convex i Vercel promenljive pre deploy-a. Rollback je u §3.

### Korak 3: Convex deploy

Ako Vercel Build Command **ne** radi `convex deploy`:

```bash
git switch release/sajam-prod-2026-10-08
npx convex deploy
```

- CLI pita za potvrdu za `adamant-warbler-746`.
- Očekivano: dodaje indekse i 6 cron-ova, a ništa ne briše.
- Rollback: šema je aditivna, pa stari frontend radi sa novim backend-om. Funkcije se vraćaju deploy-om sa prethodnog commita (`fair-panel-qr-prod-2026`, `266049d`), ali **samo dok nema fair podataka**.

### Korak 4: deploy sajta

```bash
git push origin release/sajam-prod-2026-10-08:main
```

- Vercel builduje `main`. Ako Build Command uključuje `convex deploy`, ovo je ujedno i korak 3.
- Provera: `https://www.scanme.rs/` kao pre deploy-a, a `https://www.scanme.rs/r/<postojeći-kod-klijenta>` vodi tamo gde je vodio do sada.
- Rollback: Vercel → Deployments → prethodni → „Promote to Production“.

### Korak 5: runbook sa `--prod` (događaj, 3 dana, 6 brendova / 5 izlagača, 15 modela, paketi)

```bash
node scripts/events/fair-setup-run.mjs bootstrapEvent --actor "$ADMIN" --prod
node scripts/events/fair-setup-run.mjs importDryRun --payload "$P" --prod
# STOP ako ima ijedna greška. Očekivano: 0 grešaka; upozorenja FAIR_QR_MISSING x15, FAIR_MAP_LOCATION_TAKEN x1 (hala-6), FAIR_PRICE_MISSING (EV3)
node scripts/events/fair-setup-run.mjs importCommit --payload "$P" --actor "$ADMIN" --prod
node scripts/events/fair-setup-run.mjs publishEventModels --event elektromobilnost-2026 --actor "$ADMIN" --prod
npx convex run fairPreEvent:alignFuturePackageActivations '{"dryRun":true}' --prod
# očekivano: models [] (import je već odsekao 9. 10. na sada); ako nije prazno → isto sa "dryRun":false
```

- Paketi važe odmah. `publishEventModels` pravi JMEV pasoš (EV3, YI, EWIND) i sponzorisanu listu.
- Rollback: događaj se ne briše. Model se povlači u adminu (Modeli → Povuci). Ponovljen korak vraća `unchanged`.

### Korak 6: QR inventar na događaj (odštampane SA26 nalepnice već postoje na prod-u)

```bash
npx convex run fairExhibitorImport:linkEventQrInventory '{"ownerEmail":"<ADMIN>","eventCode":"elektromobilnost-2026","inventorySmlCode":"SML-SAJAM-26-QR"}' --prod
```

- Očekivano: `result: "updated"`.
- Rollback: isti poziv sa prethodnim inventarom. Postojeće veze se ne diraju.

### Korak 7: validacija u adminu

Admin → Događaji → „Sajam elektromobilnosti 2026“ → Pregled i Modeli:

- **nema crvenih grešaka**;
- dozvoljena upozorenja: QR nedostaje (dok se ne povežu nalepnice), deljena `hala-6`, cena EV3 na upit.

### Korak 8: JMEV pasoš

Interakcije → Pasoši brendova → JMEV mora biti „Objavljen“ sa 3 modela.

- Ako nije: „Osveži pasoše“, ili „Pripremi pasoš“ → „Zamrzni i objavi“. Više nema roka 9. 10.
- Provera: `https://www.scanme.rs/sajam/elektromobilnost-2026/pasosi` prikazuje JMEV.

### Korak 9: saglasnost (samo nacrt)

Leadovi → Podešavanja → tekst saglasnosti za „interest“ i „test_drive“ → **Sačuvaj nacrt**.

- **Aktivaciju radi Aleksa** posle pravne provere.
- Zatim `FAIR_LEADS_ENABLED=true`, pa `FAIR_EMAIL_REPLY_TO` i `FAIR_FOLLOWUP_ENABLED=true`.

### Korak 10: povezivanje nalepnica (§5)

### Korak 11: smoke test sa jednim pravim QR kodom

Uradi ga na **drugom telefonu ili u privatnom prozoru** (nije admin) i na mobilnim podacima. Skeniraj SA26-001:

1. Otvara se `…/sajam/elektromobilnost-2026/model/jmev-ev3`.
2. Ocena radi.
3. Pasoš dobija pečat.
4. Admin → QR detalj pokazuje 1 sken.

Uz to: jedna postojeća klijentska `/r/<kod>` nalepnica i dalje vodi kao pre.

### Korak 12: pre otvaranja (8. 10. uveče ili 9. 10. pre 9 h)

Admin → Pregled → „Pre-event podaci“ → **Resetuj pre-event podatke** → upiši `RESETUJ`.

- Briše sve probe pre 9. 10. 00:00 i ispravlja brojače. Ništa iz kataloga se ne dira.
- Granica važi i bez reseta za leadove, izvoz i skenove po danima. Reset čisti ocene, glasove i omiljene.

---

## 5. Povezivanje nalepnica u hali (Jovanov tok „Poveži nalepnicu“)

### Na telefonu (produkcija)

1. Prijava: **`https://www.scanme.rs/admin/login?returnTo=/admin/dogadjaji/elektromobilnost-2026/povezi`**. Email mora biti u `SCANME_ADMIN_EMAILS`.
2. Ekran za povezivanje: **`https://www.scanme.rs/admin/dogadjaji/elektromobilnost-2026/povezi`**. Isto otvara i dugme „Poveži nalepnicu“ na svakoj stranici događaja.
3. Dva načina:
   - **Skeniraj** nalepnicu kamerom dok si prijavljen. Nepovezana nalepnica (`https://scanme.rs/r/<kod>`) te vodi pravo na `…/povezi?kod=<kod>`, sa već izabranim kodom.
   - **Ukucaj broj**: prefiks `SA26-` je fiksan, kucaš samo `7` ili `007`.
4. Izaberi **izlagača** (dugmad po štandu), pa **auto**, pa **Potvrdi**.
5. **Poništi** radi 15 minuta posle povezivanja. Ispod je „Sledeća: SA26-00x“ i lista „Poslednje veze“.
6. Ako auto već ima nalepnicu, ekran traži zamenu. Ako je nalepnica na drugom autu, traži premeštanje uz potvrdu.

Skeniranje povezane nalepnice dok si prijavljen kao admin vodi na stranicu modela i **ne broji se** kao sken.

### Mapiranje

| Nalepnica | Model (slug) | Izlagač (dugme) | Štand |
|---|---|---|---|
| SA26-001 | `jmev-ev3` | CUBI (JMEV) | 9 |
| SA26-002 | `jmev-yi` | CUBI (JMEV) | 9 |
| SA26-003 | `jmev-ewind` | CUBI (JMEV) | 9 |
| SA26-004 | `mazda-cx-5` | Grand Motors (Mazda) | 6 |
| SA26-005 | `mazda-cx-60` | Grand Motors (Mazda) | 6 |
| SA26-006 | `mazda-cx-6e` | Grand Motors (Mazda) | 6 |
| SA26-007 | `chery-arrizo-8-phev` | Grand Motors (Chery) | 6 |
| SA26-008 | `chery-tiggo-4-pro-hev` | Grand Motors (Chery) | 6 |
| SA26-009 | `chery-tiggo-9-phev` | Grand Motors (Chery) | 6 |
| SA26-010 | `foton-etunland` | Auto Mig (Foton) | 6 |
| SA26-011 | `foton-eview` | Auto Mig (Foton) | 6 |
| SA26-012 | `foton-eview-grand` | Auto Mig (Foton) | 6 |
| SA26-013 | `foton-cavan-c1-plus` | Auto Mig (Foton) | 6 |
| SA26-014 | `yudo-air` | Ferum (Yudo) | 1A |
| SA26-015 | `bentu-mango` | BENTU | 1B |

Posle povezivanja svaka nalepnica vodi na `https://www.scanme.rs/sajam/elektromobilnost-2026/model/<slug>`.

**Rollback po nalepnici:** „Poništi“ (15 minuta), a posle toga Admin → QR → detalj → „Ukloni vezu“ ili ponovno povezivanje na pravi auto.
