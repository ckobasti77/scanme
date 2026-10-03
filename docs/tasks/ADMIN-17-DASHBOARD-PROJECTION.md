# ADMIN-17 Dashboard projekcija

Dashboard koristi tri inkrementalna izvora: `actionItems`, `subscriptions` i
`productInventory`. Svaki kanonski write u istoj transakciji održava mali skup
doprinosa i tačan rollup. Dok odgovarajući izvor nije potpuno projektovan,
Dashboard prikazuje stanje „nije dostupno”, nikada izmišljenu nulu.

## Operativni ugovor

- `limit` je obavezan i u opsegu 1–50.
- Jedan poziv obrađuje samo jednu stranicu jednog izvora.
- `dryRun: true` ne upisuje doprinose, rollup ni stanje projekcije.
- Ponovljen poziv za istu stranicu je idempotentan: doprinos je vezan za
  `sourceKind + sourceId + scopeKey + metric`, a rollup dobija samo deltu.
- Stanje izvora postaje `complete` tek posle poslednje stranice stvarnog
  (`dryRun: false`) prolaza.
- `cursor` iz rezultata se prosleđuje sledećem pozivu. Za prvi poziv je `null`.
- `now` mora biti isti eksplicitni timestamp tokom jednog prolaza.

## Redosled za odobreno okruženje

Ovaj ADMIN-17 rad nije pokrenuo nijedan live poziv. Kada vlasnik zasebno odobri
ciljno Convex okruženje, za svaki izvor prvo se prolazi ceo dry-run, pa zatim
stvarni prolaz:

1. `sourceKind: "action"`
2. `sourceKind: "subscription"`
3. `sourceKind: "product"`

Funkcija je `adminDashboardBackfill:runPage`. Svaki odgovor mora imati očekivani
`sourceKind`, `scanned <= 50` i isti `dryRun`. Nastaviti sa vraćenim `cursor`-om
dok `isDone` ne postane `true`. Ne mešati kursore različitih izvora.

## Provera posle prolaza

- Sva tri reda u `adminDashboardProjectionStates` moraju biti `complete`.
- Dashboard zatim mora prikazati tačne brojke umesto stanja nedostupnosti.
- `Sve` i `Moje` moraju menjati isti reakcioni rezultat (header, signal strip i
  listu), pri čemu `Moje` potiče iz server-side admin identiteta.
- Pretplate, Kartice i Finansije ostaju globalni pokazatelji.

Ako prolaz stane, nastaviti od poslednjeg potvrđenog kursora. Ne brisati rollup
i ne pokretati reset; idempotentno ponovno procesiranje iste stranice je bezbedno.
