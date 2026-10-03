# ADMIN-00 — baseline početnog stanja

Datum preseka: 2026-09-10 (Europe/Belgrade)

## Git i tačka povratka

- Početna grana: `main`, upstream `origin/main`, bez odstupanja od upstream-a (`+0/-0`).
- Početni commit: `d865ca240eb777a073d0fe7768ac57e129f8c5ef` (`Sync current ScanMe project state`).
- Početni worktree je bio dirty: 91 izmenjen praćeni fajl, 256 novih nepraćenih fajlova, 0 staged fajlova i 0 obrisanih fajlova.
- Bezbednosna provera kandidata nije pronašla env/credential putanje niti visoko pouzdane obrasce za privatne ključeve, GitHub/OpenAI/Stripe/AWS tokene, JWT ili credential URL-ove.
- Lokalni checkpoint commit: `dafdf56a473dc65a055de03fd79ef81e2e4533ca` (`chore: checkpoint pre-admin-v1 worktree`).
- Checkpoint je dodatno sačuvan granom `codex/checkpoint-admin-v1-2026-09-10`.
- Glavna implementaciona grana: `codex/admin-v1`, napravljena direktno iz checkpoint commita.

Tačan manifest checkpointa može se ponoviti komandom:

```powershell
git diff-tree --no-commit-id --name-status -r dafdf56a473dc65a055de03fd79ef81e2e4533ca
```

Checkpoint sadrži svih 91 zatečenih izmena praćenih fajlova i 255 od 256 zatečenih nepraćenih fajlova: ukupno 346 fajlova, 63.203 dodatih i 1.365 obrisanih linija. To uključuje zatečeni izvorni kod, testove, dokumentaciju, mockup PNG fajlove, konfiguraciju i lock fajlove. ADMIN-00 nije menjao njihov sadržaj.

Namerno su isključeni i nisu obrisani:

- `.env.local` — ignorisan lokalni konfiguracioni fajl;
- `node_modules/` i `.next/` — ignorisane dependency/build putanje;
- `output/pdf/scanme-menu-cenovnik-i-projekcija.pdf` — jedini nepraćeni fajl pod očiglednom generisanom `output/` putanjom;
- svi ostali Git-ignorisan sadržaj i lokalni build outputi.

Neposredno pre checkpoint commita `git diff --check` je prijavio zatečenu dodatnu praznu liniju na kraju `convex/lib/plans.ts:245`. Nije popravljana jer je van opsega ADMIN-00.

## Aktivne admin rute

Početni produkcioni build je prijavio sledeće App Router admin rute:

- `/admin` → redirect na `/admin/scanme-links`;
- `/admin/login`;
- `/admin/scanme-links`;
- `/admin/scanme-links/[businessId]/editor`;
- `/admin/google-reviews`;
- `/admin/memories`;
- `/admin/venue`;
- `/admin/page`;
- `/admin/cards`;
- `/admin/customers`;
- `/admin/customers/[businessId]`;
- `/admin/customers/[businessId]/[service]`.

## Relevantni zatečeni testovi

Admin i neposredno povezane domenske testove čine:

- `convex/admin.test.ts`, `convex/cardsAdmin.test.ts`, `convex/memoriesAdmin.test.ts`, `convex/menuAdmin.test.ts`, `convex/venueAdmin.test.ts`;
- `convex/cards.test.ts`, `convex/billing.test.ts`, `convex/purchaseLifecycle.test.ts`, `convex/venue.test.ts`, `convex/venueAnalytics.test.ts`, `convex/venueReservations.test.ts`, `convex/venueValidators.test.ts`;
- ordering testovi: `convex/ordering*.test.ts` i `lib/ordering-panel-queue.test.ts`;
- purchase/pricing testovi pod `components/purchase/*.test.ts` i `lib/pricing/*.test.ts`, plus `lib/scanme-pricing.test.ts`;
- venue render/block/calendar testovi pod `components/venue/` i `lib/venue-*.test.ts`.

`npm run check` ne poziva kompletan Vitest skup; njegov ugovor iz `package.json` je lint → Next build → namespace gate → golden harness.

## Lokalni i Convex kontekst

- `.env.local` bira Convex dev deployment `dev:perfect-ant-98` (team `aleksadjor3`, project `scanme`).
- Javni Convex endpointi su `https://perfect-ant-98.eu-west-1.convex.cloud` i `https://perfect-ant-98.eu-west-1.convex.site`.
- Vrednosti `SCANME_DEMO_SETUP_KEY` i `SCANME_PREVIEW_PASSKEY` postoje lokalno, ali su namerno redigovane i nisu commitovane.
- `package.json` definiše `npm run dev` kao `next dev`, što podrazumevano koristi localhost port 3000.
- `.claude/launch.json` za `scanme-dev` traži port 3000 sa automatskim izborom slobodnog porta. Postoje i zatečeni `dev:web` launch unosi za 3000/3002/3003, ali `package.json` trenutno nema `dev:web` skriptu.
- U trenutku preseka ništa nije slušalo na portovima 3000, 3001, 3002, 3003 ili 3010.
- Deployment je samo identifikovan iz lokalne konfiguracije; nisu pokretane Convex mutacije, seed, migracija, deploy niti bilo kakva promena podataka.

## Početni `npm run check`

Rezultat: **PASS**, exit code 0.

- ESLint: 0 grešaka, 2 upozorenja:
  - `components/admin/venue-admin.tsx:24:10` — nekorišćen `useMemo`;
  - `convex/purchaseLifecycle.test.ts:26:10` — nekorišćen `price`.
- Next.js 16.2.12 production build: uspešan, uključujući TypeScript i generisanje 22 statičke stranice.
- `harness:namespace`: prošao, bez cross-namespace tokena.
- `harness:check`: prošao; 177 slučajeva × 2 viewporta odgovara goldenima byte-for-byte.

Upozorenja i `git diff --check` nalaz nisu popravljani jer ADMIN-00 zahteva evidenciju postojećeg stanja, ne funkcionalne ili nepovezane popravke.

## Granice izvršenja

- Nije bilo pushovanja na remote.
- Nije bilo resetovanja, stashovanja, odbacivanja, prepisivanja ili brisanja postojećih fajlova/podataka.
- ADMIN-00 nije uneo funkcionalne, UI ili schema izmene; dodat je samo ovaj baseline izveštaj nakon checkpointa.
- ADMIN-01 nije započet.
