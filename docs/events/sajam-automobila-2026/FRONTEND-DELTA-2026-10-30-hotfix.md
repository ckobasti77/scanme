# AMF live hotfix — 30. oktobar 2026.

- `fairHeat.getMapHeat`: `today` i `hour` aditivno vraćaju `brandLevels: { brandId, level }[]` (ista skala kao `levels`, samo objavljeni modeli, prazno kad je `enough: false`). `levels` po lokaciji je nepromenjen; Elektromobilnost mapa ga i dalje koristi.
- `lib/fair-map/topography.ts`: `fairMapTopographicLevel` prima opcioni peti argument `brands`; kad izložak ima `brandId`, nivo brenda ima prednost. `buildAmfTopographicExhibits` označava kao `paid` svakog izlagača sa objavljenim modelom (bilo koji paket), osim kad loader eksplicitno pošalje `heatEligible`.
- `convex/lib/fairScans.ts`: `FAIR_ADMIN_SCANS_COUNTED_EVENT_CODES` (samo `auto-moto-fest-2026`) — admin sken tamo vraća `recorded`, ne `admin_excluded`; novi helper `countFairScan`.
- `fairAmfReview.backfillAmfScans` (internal): jednokratna, idempotentna nadoknada AMF admin skenova.
