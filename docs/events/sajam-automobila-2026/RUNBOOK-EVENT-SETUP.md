# Runbook — postavka pravog događaja `elektromobilnost-2026`

> Poslednje ažuriranje: **8. oktobar 2026.**
>
> Kod: [`convex/fairSetup.ts`](../../../convex/fairSetup.ts) · Wrapper: [`scripts/events/fair-setup-run.mjs`](../../../scripts/events/fair-setup-run.mjs)
>
> Podaci: [`intake/elektromobilnost-2026-2026-10-07/b1-payload.json`](./intake/elektromobilnost-2026-2026-10-07/b1-payload.json) (iz ispravljenih CSV-ova istog foldera)

Postupak je proveren na DEV-u (`dev:perfect-ant-98`) 8. 10. 2026. Svaki korak je idempotentan: ponovno pokretanje ne pravi duplikate, već vraća `unchanged`.

## 0. Preduslovi

1. Kod sa ove grane (sa `convex/fairSetup.ts` i O4 izmenom u `validateMapLocationIds`) je deploy-ovan na PROD Convex (`npx convex deploy`, standardni produkcioni tok, ne iz ovog runbook-a).
2. Frontend sa fotografijama `public/fair/elektromobilnost-2026/*` je deploy-ovan na `https://scanme.rs`. Payload koristi `https://scanme.rs/fair/elektromobilnost-2026/...`.
3. `next.config.ts` mora da dozvoli `scanme.rs` za `next/image` (vidi „Poznati problemi“), inače model stranica sa fotografijom puca.
4. Actor email je admin iz `SCANME_ADMIN_EMAILS` na PROD-u i postoji kao prijavljen korisnik (`users`). Provera:
   `npx convex env get SCANME_ADMIN_EMAILS --prod`
5. Komande se pokreću iz korena repozitorijuma. Wrapper poziva Convex CLI direktno, bez shell-a, jer payload (~14 KB) ne staje u cmd.exe i PowerShell kvari navodnike.
6. **Rok:** JMEV pasoš mora biti objavljen pre početka događaja (9. 10. 2026. 00:00, Europe/Belgrade). Posle toga backend vraća `FAIR_PASSPORT_EVENT_STARTED`.

## 1. Komande za PROD (redom)

Ispod je `ADMIN=<admin email>`, a `P=docs/events/sajam-automobila-2026/intake/elektromobilnost-2026-2026-10-07/b1-payload.json`.

```bash
# 1. Događaj, 3 dana, 5 event_only klijenata (placeholder kontakti) i 6 brendova
node scripts/events/fair-setup-run.mjs bootstrapEvent --actor "$ADMIN" --prod

# 2. Dry run: ne piše ništa. Očekivano: ok=true, 0 grešaka,
#    upozorenja FAIR_QR_MISSING x15 i FAIR_MAP_LOCATION_TAKEN x1 (hala-6, O4)
node scripts/events/fair-setup-run.mjs importDryRun --payload "$P" --prod

# 3. Commit: samo ako je dry run ok. Očekivano: 5 učešća, 5 štandova, 15 modela "created"
node scripts/events/fair-setup-run.mjs importCommit --payload "$P" --actor "$ADMIN" --prod

# 4. Objava svih draft modela događaja (publish validacija + audit, atomski)
node scripts/events/fair-setup-run.mjs publishEventModels --event elektromobilnost-2026 --actor "$ADMIN" --prod
```

Ako dry run vrati bilo koju grešku, STOP: ne radi commit. Prijavi `issues`.

## 2. Ručni koraci u adminu (`Događaji`)

**JMEV pasoš** (pre 9. 10. 00:00): Admin → `Događaji` → „Sajam elektromobilnosti 2026“ → tab `Interakcije` → `Pasoši brendova` → JMEV → `Pripremi pasoš` → `Zamrzni i objavi`.
Očekivano: 3 obavezna modela (EV3, YI, EWIND). Ostali brendovi ne ispunjavaju uslov (manje od dva modela ili paket ispod Starter).

**Kontakti**: zameniti placeholder kontakte („Kontakt <izlagač>“, „Sajamski kontakt“, bez email/telefona) pravim podacima kada stignu.

**Van ovog runbook-a**: QR dodela (`08-qr-assignments.csv` je prazan), Glas publike i ankete (ostaju draft), lead forme.

## 3. Provera

- `https://scanme.rs/sajam/elektromobilnost-2026` vraća 200 i mapu sa štandovima 9, 6, 1A i 1B.
- `https://scanme.rs/sajam/elektromobilnost-2026/model/jmev-ev3` vraća 200 i prikazuje „EV3“ i „Cena na upit“.
- `https://scanme.rs/sajam/elektromobilnost-2026/model/mazda-cx-5` vraća 200 i prikazuje „Mazda CX-5“, „Homura“ i „44.240 EUR“.
- Podaci bez frontenda:
  `npx convex run fairPublic:getModelBySlug '{"eventSlug":"elektromobilnost-2026","modelSlug":"mazda-cx-5"}' --prod`
- Ponovljeni `importCommit` vraća sve `unchanged`. Ponovljeni `publishEventModels` vraća `alreadyPublished: 15`.

## 4. Zapisi koje postupak pravi

| Izlagač | SMK / SML | Brend(ovi) | Štand | mapLocationId |
|---|---|---|---|---|
| CUBI d.o.o. | `SMK-SAJAM-26-CUBI` / `SML-SAJAM-26-CUBI` | JMEV | 9 | `hala-9` |
| Grand Motors d.o.o. | `SMK-SAJAM-26-GRAND-MOTORS` / `SML-SAJAM-26-GRAND-MOTORS` | Mazda, Chery (jedan štand „Mazda i Chery“) | 6 | `hala-6` |
| AUTO MIG d.o.o. Niš | `SMK-SAJAM-26-AUTO-MIG` / `SML-SAJAM-26-AUTO-MIG` | Foton | 6 | `hala-6` (deljeno, O4) |
| Ferum d.o.o. | `SMK-SAJAM-26-FERUM` / `SML-SAJAM-26-FERUM` | Yudo | 1A | `hala-1a` |
| BENTU MOTORS D.O.O | `SMK-SAJAM-26-BENTU` / `SML-SAJAM-26-BENTU` | BENTU | 1B | `hala-1b` |

Ako je neki SMK/SML ili venue slug (`sajam-26-<kod>`) na PROD-u već zauzet drugim klijentom, `bootstrapEvent` pada sa `FAIR_CLIENT_CODE_TAKEN` / `FAIR_SLUG_TAKEN` i ništa ne upisuje. Tada se ne nastavlja.

## 5. Poznati problemi (8. 10. 2026)

- `next/image` odbija `https://scanme.rs/...`: `next.config.ts` dozvoljava samo `**.convex.cloud`. Model stranica i garaža prikazuju fotografiju kroz `next/image`, pa im treba `remotePatterns` za `https://scanme.rs/fair/**`. Ovo rešava frontend, pre PROD-a.
- Javna mapa crta oba izlagača sa štanda 6 (AUTO MIG i Grand Motors) na istom poligonu `hala-6`, kao dva preklopljena štanda. Prikaz to nije proveren vizuelno (lokalni dev server je pao), pa ga treba proveriti pre sajma.
