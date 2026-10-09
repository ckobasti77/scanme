# PROD GO checklist — Sajam elektromobilnosti 2026 (`elektromobilnost-2026`)

> Ažurirano **9. 10. 2026. ~00:20** (posle otvaranja). Grana za deploy: `release/sajam-2026-10-08` (fair grana + `origin/main`).
>
> Ovaj dokument ne pokreće ništa. Svaku komandu za produkciju pokreće Aleksa, ili agent posle izričitog „OK“ za **tu** komandu.

## 0. Utvrđeno stanje

| Stavka | Stanje |
|---|---|
| Frontend | Vercel, `https://www.scanme.rs`. Production Branch je `main`, Build Command je podrazumevani. `package.json` `build` je samo `next build`, pa **push na `main` ne deploy-uje Convex**. |
| Prod Convex | `adamant-warbler-746`: `main` + `fairPrintInventory`. Nijedan drugi `fair*` modul, nema događaja. |
| Backup | `C:\Users\user\Desktop\ScanMe\scanme-prod-backup-2026-10-08.zip` (8. 10. 23:44, bez file storage-a) |
| QR inventar na prod-u | Postoji: `SML-SAJAM-26-QR` sa SA26-001…100 (+4 panela). SA26-001…015 su `active`, bez veze, 0 skenova. **Ne pravi se ponovo:** odštampani kodovi moraju ostati isti. „Nije podešen“ u adminu znači samo da događaj nije povezan sa inventarom (korak 6). |
| Paketi (payload) | JMEV (CUBI) EV3/YI/EWIND = **Napredni**. Yudo Air Ultra (Ferum) = **Starter**. Ostalih 11 = **Besplatni** (`included`). Import paket odseca na trenutak importa, pa važi odmah. |
| JMEV pasoš | Jedini brend koji ispunjava uslov (3 modela Napredni, `passportEligible`). `publishEventModels` ga pravi objavljenog sa EV3, YI i EWIND. |
| TEST događaji | **Nikad na produkciji** (`fairDevFixtures:*` se ne pokreće sa `--prod`). Na DEV-u su `test-elektromobilnost-2026` i `test-auto-moto-fest-2026` arhivirani (9. 10.), pa admin otvara pravi događaj. |

### Ponašanje koda kad se događaj pravi posle 9. 10. 00:00

- **Faza:** odmah „Sajamski dan 1 od 3“; odbrojavanje ide do kraja dana.
- **Paketi:** važe od importa. U pravima ništa ne čeka ponoć.
- **Pasoš:**
  - kad pasoš ne postoji, sync ga pravi i posle otvaranja, sa svim modelima u trenutku pravljenja (EV3, YI, EWIND), pa nikad nije zamrznut prazan;
  - posle toga je skup zaključan (fer pravilo);
  - `publishPassport` nema rok.
- **Dani:** dnevni izveštaj za 9. 10. pravi se tek posle 10. 10. 00:00, u statusu „čeka odobrenje“. Ništa se ne zatvara ni ne blokira ranije.
- **Granica analitike je otvaranje hale, 9. 10. 08:00** (`FAIR_ANALYTICS_CUTOFF_BY_EVENT_CODE`).
  - Sve urađeno na prod-u pre 08:00 je pre-event: noćne probe, povezivanje i test skenovi.
  - Leadovi, izvoz, izveštaj i ukupni skenovi to automatski ne broje.
  - Ocene, glasove i omiljene čisti reset (korak 10).
  - Admin skenovi se ne broje nikad.

### Šta deploy menja na prod-u

- **Šema je aditivna** (34 fair tabele, novi indeksi). Ništa se ne briše.
- **Novih 6 cron-ova.** `fair pii purge` sam briše PII od 16. 11. To je odluka posle sajma.
- **`/r/[cardCode]`:** dodate su grane `fair_model` i `fair_admin_link`, postojeće grane su iste.
- **Meni i poručivanje ostaju isključeni kao na `main`-u.**
- **Pravilo:** posle fair podataka stari `main` se više ne deploy-uje na Convex.

## 1. Mapiranje nalepnica (jedini izvor: tabela iz hale, 9. 10.)

| Nalepnica | Model (slug) | Naziv | Izlagač | Štand |
|---|---|---|---|---|
| SA26-001 | `yudo-air` | Yudo Air Ultra | Ferum d.o.o. | 1A |
| SA26-002 | `bentu-mango` | BENTU Mango L7e-CU | BENTU MOTORS D.O.O | 1B |
| SA26-003 | `foton-cavan-c1-plus` | Foton Cavan C1 Plus | AUTO MIG d.o.o. Niš | 6 |
| SA26-004 | `foton-etunland` | Foton eTunland | AUTO MIG d.o.o. Niš | 6 |
| SA26-005 | `foton-eview` | Foton eView | AUTO MIG d.o.o. Niš | 6 |
| SA26-006 | `foton-eview-grand` | Foton eView Grand | AUTO MIG d.o.o. Niš | 6 |
| SA26-007 | `chery-arrizo-8-phev` | Chery Arrizo 8 PHEV 1.5T 2WD Noble | Grand Motors d.o.o. | 6 |
| SA26-008 | `chery-tiggo-4-pro-hev` | Chery Tiggo 4 Pro HEV 1.5L DHT 2WD Luxury | Grand Motors d.o.o. | 6 |
| SA26-009 | `chery-tiggo-9-phev` | Chery Tiggo 9 PHEV 1.5T AWD Noble 315 | Grand Motors d.o.o. | 6 |
| SA26-010 | `mazda-cx-5` | Mazda CX-5 Homura | Grand Motors d.o.o. | 6 |
| SA26-011 | `mazda-cx-6e` | Mazda CX-6e Takumi Plus | Grand Motors d.o.o. | 6 |
| SA26-012 | `mazda-cx-60` | Mazda CX-60 Homura Plus | Grand Motors d.o.o. | 6 |
| SA26-013 | `jmev-ev3` | JMEV EV3 | CUBI d.o.o. | 9 |
| SA26-014 | `jmev-ewind` | JMEV EWIND | CUBI d.o.o. | 9 |
| SA26-015 | `jmev-yi` | JMEV YI | CUBI d.o.o. | 9 |

Posle povezivanja svaka nalepnica vodi na `https://www.scanme.rs/sajam/elektromobilnost-2026/model/<slug>`.

## 2. Env (samo imena; vrednosti su u `C:\Users\user\Desktop\ScanMe\SAJAM-PROD-TAJNE-2026-10-09.txt`, van repoa; obrisati posle lepljenja)

| Gde | Promenljiva | Napomena |
|---|---|---|
| Convex prod | `FAIR_GATEWAY_SECRET` | Nova vrednost, **ista kao Vercel** |
| Convex prod | `FAIR_PUBLIC_BASE_URL` | `https://www.scanme.rs` |
| Convex prod | `FAIR_EMAIL_REPLY_TO` | `aleksa.djordjevic@scanme.rs` |
| Convex prod | `FAIR_LEADS_ENABLED`, `FAIR_FOLLOWUP_ENABLED` | **Ne postavljati danas** (leadovi isključeni) |
| Vercel Production | `FAIR_GATEWAY_SECRET` | Iz fajla; Production, „Sensitive“ |
| Vercel Production | `FAIR_VISITOR_HASH_SECRET` | Iz fajla; bez nje nema posetilačkog cookie-ja ni skenova |
| Vercel Production | `NEXT_PUBLIC_CONVEX_URL` | Već je `https://adamant-warbler-746.eu-west-1.convex.cloud` |

## 3. Redosled deploy-a (svaki korak posle zasebnog „OK“)

Convex ide **pre** frontenda: novi frontend zove nove funkcije, a stari frontend radi sa novim backend-om.

`ADMIN=<admin email iz SCANME_ADMIN_EMAILS>`, `P=docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07/b1-payload.json`, `T=../SAJAM-PROD-TAJNE-2026-10-09.txt`.

### Korak 0: provere na `release/sajam-2026-10-08`

Moraju proći:

- fair testovi i testovi rezolvera `/r`;
- `npx tsc --noEmit`;
- `npm run lint` i `npm run build`;
- `npm run harness:check` (pre toga ugasiti dev server na :3000).

### Korak 1: Convex env

```bash
npx convex env set FAIR_GATEWAY_SECRET "$(sed -n 's/^FAIR_GATEWAY_SECRET=//p' $T)" --prod
npx convex env set FAIR_PUBLIC_BASE_URL "https://www.scanme.rs" --prod
npx convex env set FAIR_EMAIL_REPLY_TO "aleksa.djordjevic@scanme.rs" --prod
npx convex env list --prod | sed 's/=.*//'
```

Rollback: `npx convex env remove <IME> --prod`.

### Korak 2: Vercel env (Aleksa)

Settings → Environment Variables: `FAIR_GATEWAY_SECRET` i `FAIR_VISITOR_HASH_SECRET` iz fajla (samo Production). Rollback: obrisati promenljive.

### Korak 3: Convex deploy

```bash
git switch release/sajam-2026-10-08
npx convex deploy
```

- Potvrda za `adamant-warbler-746`. Očekivano: novi indeksi i cron-ovi, bez brisanja.
- Rollback: deploy sa `origin/codex/fair-panel-qr-prod-2026`, samo dok nema fair podataka.

### Korak 4: frontend

```bash
git push origin release/sajam-2026-10-08:main
```

- Ovo je fast-forward `main`-a, koji je predak release grane.
- Provera: `https://www.scanme.rs/` kao pre, a postojeća klijentska `/r/<kod>` vodi kao pre.
- Rollback: Vercel → prethodni deployment → „Promote to Production“.

### Korak 5: događaj, modeli, paketi, pasoš

```bash
node scripts/events/fair-setup-run.mjs bootstrapEvent --actor "$ADMIN" --prod
node scripts/events/fair-setup-run.mjs importDryRun --payload "$P" --prod      # STOP ako ima greške
node scripts/events/fair-setup-run.mjs importCommit --payload "$P" --actor "$ADMIN" --prod
node scripts/events/fair-setup-run.mjs publishEventModels --event elektromobilnost-2026 --actor "$ADMIN" --prod
npx convex run fairPreEvent:alignFuturePackageActivations '{"dryRun":true}' --prod   # očekivano models: []
npx convex run fairPublic:getPassportCatalog '{"eventSlug":"elektromobilnost-2026"}' --prod   # JMEV: EV3, YI, EWIND
```

Rollback: model se povlači u adminu. Ponovljeni koraci vraćaju `unchanged`.

### Korak 6: QR inventar na događaj

```bash
npx convex run fairExhibitorImport:linkEventQrInventory '{"ownerEmail":"<ADMIN>","eventCode":"elektromobilnost-2026","inventorySmlCode":"SML-SAJAM-26-QR"}' --prod
```

- Posle ovoga admin „QR kodovi“ i „Poveži nalepnicu“ prikazuju SA26 kodove.
- Rollback: isti poziv sa prethodnim inventarom (bio je `null`).

### Korak 7: admin provera

Pregled i Modeli:

- nema crvenih grešaka;
- paketi: Napredni 3, Starter 1, Besplatni 11;
- JMEV pasoš objavljen sa 3 modela;
- saglasnost samo kao **nacrt**.

### Korak 8: povezivanje na telefonu (§1)

- Prijava: `https://www.scanme.rs/admin/login?returnTo=/admin/dogadjaji/elektromobilnost-2026/povezi`
- Ekran: `https://www.scanme.rs/admin/dogadjaji/elektromobilnost-2026/povezi`
- Postupak:
  1. Skeniraj nalepnicu ili ukucaj broj (prefiks `SA26-` je fiksan).
  2. Izaberi izlagača, pa automobil, pa **Potvrdi**.
  3. „Poništi“ radi 15 minuta.

### Korak 9: smoke test

1. Prijavljen kao admin skeniraj SA26-013: otvara se `…/model/jmev-ev3`, a sken se ne broji.
2. Jedan sken iz privatnog prozora (računa se): stranica modela, pečat u pasošu.
3. Jedna postojeća klijentska nalepnica vodi kao pre.

### Korak 10: reset pre-event podataka (posle poslednje probe, pre 08:00)

Admin → Pregled → „Pre-event podaci“ → proveri brojke → **Resetuj pre-event podatke** → upiši `RESETUJ`.

- Briše samo redove pre 08:00 i ispravlja brojače.
- Katalog, nalepnice i pasoš se ne diraju.
- Ponovna provera mora dati 0.

**Rollback podataka (krajnja mera):** `npx convex import ../scanme-prod-backup-2026-10-08.zip --replace --prod`.
