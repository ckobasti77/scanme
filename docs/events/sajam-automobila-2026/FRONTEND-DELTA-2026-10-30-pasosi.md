# AMF pasoši sa jednim modelom — 30. oktobar 2026.

- Uslov pasoša (`fairBrandPassportProblems` / `fairBrandPassportEligible`, `lib/fair-entitlements.ts`): dovoljan je **jedan** izložen model; svi izloženi modeli brenda moraju biti objavljeni, `passportEligible` i Starter+, kod jednog izlagača.
- Razlog `fewer_than_two_models` je preimenovan u `no_exhibited_models` (`lib/fair-contract.ts` `FairBrandPassportProblem`, `convex/lib/fairValidators.ts` `fairBrandPassportProblem`, `AdminEventsPassportProblem`); javlja se samo kad brend nema nijedan izložen model (`count: 0`). `upsertPassport` šalje isti razlog uz `FAIR_PASSPORT_NOT_ELIGIBLE`.
- `fairAmfReview.setupSingleModelPassports` (internal, samo `ineos-grenadier` i `fiat-grande-panda`): model postaje kandidat, automatska sinhronizacija pravi objavljen (zamrznut) pasoš, pečati se dopunjuju iz `fairUniqueScans`. Idempotentno.
- AMF uvoz (`scripts/fair/amf-payload.mjs`, `intake/prod-2026-10-30/b1-payload*.json`): Fiat i Ineos su kandidati za pasoš; SWM namerno nije (izlaže više vozila nego što je zakupio).
- `lib/fair-brand-logo.ts`: `ineos` → `public/fair/brands/ineos.svg` (INEOS wordmark, 95 × 42).
- `SponsoredStrip` (mapa i garaža): fotografija je link na stranicu modela kao „Pogledaj” (`open_model`, isti href), `tabIndex={-1}` + `aria-hidden`, `data-sponsored-open`. Pointer capture se uzima tek posle praga prevlačenja (4 px), a prevlačenje poništava klik na fotografiju.
