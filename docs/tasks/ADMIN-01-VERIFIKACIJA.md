# ADMIN-01 — verifikacioni izveštaj

Datum: 2026-09-10. Grana: `codex/admin-v1`. Početni HEAD: `68b9bf5f9108a6d385903a4fd9b5281ec65da97e`. Bezbedni checkpoint: `dafdf56a473dc65a055de03fd79ef81e2e4533ca`.

Autoritativni dokument je pročitan: §0, domenski §6–12, §15–17, ceo ADMIN-01 i relevantni §19–20. Pročitani su `AGENTS.md`, Convex smernice i lokalna Next.js TypeScript build dokumentacija. Starije beleške nisu nadjačale trenutni dokument. ADMIN-00 potvrđuje početni zeleni check.

## Rezultat i granice

Uvedeni su izvršni TypeScript ugovori, centralni katalozi, čiste domenske provere, sintetički fixture-i, migracioni plan i test matrica. Ugovori su u `lib/admin-v1/`; nijedan nije povezan sa živim Convex upisima ili novim admin ekranom.

Jedina promena postojeće vidljive površine je preuzimanje pet kanonskih naziva proizvoda iz centralnog i18n kataloga u konfigurator/ponudu. ID-jevi, cene, konfiguracije, obračun i layout ostaju isti. To ispunjava zahtev jednog naziva po proizvodu kroz budući admin, porudžbine i postojeći konfigurator. Iste nazive proverava i test poruke ponude.

Nema nove biblioteke, produkcione ili dev schema migracije, deploy-a, seed-a, provider integracije, konačnog admin UI-ja ili novog cenovnika. Nisu određeni referral procenat/trajanje, founders trajanje ni enterprise cena. Fixture iznosi su isključivo test aritmetika.

## Fajlovi u ADMIN-01 commitu

Novi:

- `lib/admin-v1/catalog.ts` — kanonski SKU/service ID-jevi, alias-i, statusi, uloge, periodi, kodovi i 7/15 pravila;
- `lib/admin-v1/contracts.ts` — svi domenski tipovi, odnosi i strukturisani audit payload-i;
- `lib/admin-v1/rules.ts` — čiste provere/projekcije ugovora i runtime audit katalog;
- `lib/admin-v1/fixtures.ts` — deterministički domen i varijante;
- `lib/admin-v1/contracts.test.ts` — C01–C06 runtime i negativne TypeScript provere;
- `lib/admin-v1/tsconfig.json` — ponovljiv, ciljani typecheck ugovora/testova;
- `lib/i18n/sr/admin-domain.ts` — jedan izvor kanonskih naziva;
- `docs/tasks/ADMIN-01-MIGRACIJA.md` — widen-migrate-narrow, konkretno legacy mapiranje i rollback;
- `docs/tasks/ADMIN-01-TEST-MATRICA.md` — sledljivost, fixture scenariji, budući integracioni/migracioni testovi;
- `docs/tasks/ADMIN-01-VERIFIKACIJA.md` — ovaj izveštaj.

Izmenjeni:

- `lib/i18n/types.ts` — typed `AdminDomainDict` i nova površina;
- `lib/i18n/index.ts` — registracija `getDict("admin-domain")`;
- `lib/i18n/sr/offer.ts` — preuzimanje zajedničkih naziva;
- `lib/scanme-pricing.ts` — postojeći `ProductId` koristi kanonski `ProductType`;
- `lib/offer-contact.test.ts` — očekuje kanonske nazive u generisanoj poruci.

## Izvršene provere

| Provera | Rezultat |
|---|---|
| `npm.cmd test -- lib/admin-v1/contracts.test.ts lib/offer-contact.test.ts lib/i18n/i18n.test.ts` | PASS — 50 testova, 3 fajla |
| `npx.cmd tsc --noEmit -p lib/admin-v1/tsconfig.json` | PASS — uključuje negativne type primere |
| `npm.cmd test -- lib/admin-v1/contracts.test.ts lib/offer-contact.test.ts lib/i18n/i18n.test.ts lib/scanme-pricing.test.ts lib/pricing/ components/purchase/` | PASS — 161 test, 11 fajlova |
| `npm.cmd run check` | PASS — lint, production build/TypeScript, namespace i golden harness |
| Golden harness | 177 slučajeva × 2 viewporta identični goldenima byte-for-byte |
| Browser | PASS — postojeća `/ponuda` i `/ponuda/pregled`, Edge/Playwright, 1440×1000 i 390×844 |
| `git diff --check` | PASS za ADMIN-01 diff |

Lint ima ista dva baseline upozorenja: `components/admin/venue-admin.tsx:24` (`useMemo`) i `convex/purchaseLifecycle.test.ts:26` (`price`). Vitest ispisuje postojeću Vite napomenu o budućem `configLoader: native`; testovi prolaze.

Browser proverava kanonske nazive, izbor Jednodelnog stalka, promenu tiraža 0→1 i odlazak na pregled ponude sa istim nazivom/konfiguracijom. Nema console grešaka/upozorenja (0/0), nema horizontalnog page overflow-a (`scrollWidth` 1430 pri 1440, odnosno 380 pri 390) i promenjeni tekst nije ostao nevidljiv. Screenshot-i su pregledani lokalno:

- `output/playwright/admin01-desktop.png`;
- `output/playwright/admin01-mobile.png`.

Screenshot-i i Playwright logovi su ignorisani QA artefakti, nisu deo commita. Nije poslat kontakt upit niti druga poruka. ADMIN-01 nema novi admin UI, pa ovo nije vlasnikovo vizuelno odobrenje budućeg admina.

## Dodatna dijagnostika: puni samostalni TypeScript

`npx.cmd tsc --noEmit --incremental false` prijavljuje **10 postojećih dijagnostika u 4 nepovezana test fajla**. Iste dijagnostike reprodukovane su na `git archive` kopiji tačnog početnog HEAD-a u ignorisanom `tmp/admin01/baseline`, uz `next typegen` za route tipove i iste instalirane dependencies. Nisu izmenjene niti prikazane kao ADMIN-01 greške:

- `convex/checkout.test.ts:74–75` — tri greške indeksa/IndexRange;
- `convex/enterpriseProvisioning.test.ts:74,86–87` — pet grešaka indeksa/IndexRange;
- `lib/memories-client/detect.test.ts:94` — `Uint8Array<ArrayBufferLike>` / `BlobPart`;
- `lib/memories-export/bench.test.ts:72` — Sharp create noise oblik zahteva `background`.

Postojeći `npm run check` prolazi; dodatni ciljani typecheck eksplicitno proverava ADMIN-01 testove koje Vitest sam ne typecheck-uje. Puni samostalni `tsc` baseline nije popravljan u ovom tasku.

## Zaključani use case-ovi i preostale obaveze

Izvršni C01–C06 testovi pokrivaju SMK/SML vlasništvo i kodove; firme/brendove/grupe/kontakte; default/override kontakt; role i pravo otkaza; sedam nezavisnih ciklusa; 7/15 warning/grace; Premium badge; selektivno neplaćanje, parcijalnu/objedinjenu alokaciju i ostatak; price snapshot, Prijatelj i referral; 52 pojedinačna SMF-a; avans/odobrenje/QC/isporuku; QR/NFC stanja i razdelnike; SMQ povezivanje; istoriju destinacije/pozicije i odvojenu analitiku; klijentske zadatke, chat receipt i strukturisan audit sa razlogom.

Nema otvorenog pitanja koje blokira ADMIN-01. Postojeće privremene odluke iz §20 ostaju otvorene za odgovarajuće taskove. Matrica izričito označava I01–I12 i M01–M09 kao buduće integracione/migracione provere, ne kao sada izvršene testove živog sistema.

`output/pdf/scanme-menu-cenovnik-i-projekcija.pdf` ostaje netaknut i izvan commita. Nije izvršen push. **ADMIN-02 nije započet.**

Hash lokalnog ADMIN-01 commita može se dobiti pomoću `git log -1 --format=%H -- docs/tasks/ADMIN-01-VERIFIKACIJA.md`.
