# AMF live hotfix — 30. oktobar 2026.

- `fairHeat.getMapHeat`: `today` i `hour` aditivno vraćaju `brandLevels: { brandId, level }[]` (ista skala kao `levels`, samo objavljeni modeli, prazno kad je `enough: false`). `levels` po lokaciji je nepromenjen; Elektromobilnost mapa ga i dalje koristi.
- `lib/fair-map/topography.ts`: `fairMapTopographicLevel` prima opcioni peti argument `brands`; kad izložak ima `brandId`, nivo brenda ima prednost. `buildAmfTopographicExhibits` označava kao `paid` svakog izlagača sa objavljenim modelom (bilo koji paket), osim kad loader eksplicitno pošalje `heatEligible`.
- `convex/lib/fairScans.ts`: `FAIR_ADMIN_SCANS_COUNTED_EVENT_CODES` (samo `auto-moto-fest-2026`) — admin sken tamo vraća `recorded`, ne `admin_excluded`; novi helper `countFairScan`.
- `fairAmfReview.backfillAmfScans` (internal): jednokratna, idempotentna nadoknada AMF admin skenova.
- AMF ključne pločice: svaki AMF model nosi tačno četiri `isHighlight` specifikacije (osim MG S5 EV, koji ostaje na prioritetu). `fairModelKeySpecs(…, true)` ih ređa: domet, baterija, snaga, punjenje, motor, menjač, potrošnja, CO₂, moment, gorivo, pogon. Nove kompaktne vrste `engine` („1,5 l · EcoBoost”), `fuel`, `drive`; menjač je „8 brzina · automatski” ili „DSG/CVT/E-CVT · automatski”. `ModelSpecsCard` u AMF prikazu prebacuje sve jedinice u drugi red čim jedna ne staje, da brojevi, jedinice i nazivi budu poravnati.
- Kurirani skupovi i cene su u `scripts/fair/amf-curated-specs.mjs`; `normalizeAmfModel` ih primenjuje, pa ih ponovni uvoz zadržava. `fairAmfReview.applySpecs` prima i `expectedPriceText`/`priceText` i 1–18 modela po pozivu.
- Mapa, spisak: oznaka „Hala/Ulaz” je kolona fiksne širine odmah ispred ikonice (ista pozicija u svakom redu).
