# ADMIN-14 — finansijska projekcija i rollout

Status: implementacija i lokalna `convex-test` provera. Ovaj runbook nije izvršen nad deployment podacima. ADMIN-15 nije započet.

## Izvori i granica

- Stvarno Naplaćeno potiče samo iz postojećih `payments`, `paymentAllocations`, `orderPaymentAllocations` i append-only `paymentAdjustments` činjenica.
- Očekivano potiče samo iz postojećih subscription lifecycle/price/waiver ugovora i preostalog iznosa potvrđenih `orderOperations` redova.
- Profit koristi naplaćeno posle storniranja, refund po datumu povraćaja i stvarne direktne troškove po datumu troška. Nepostojeći trošak nije nula.
- Ovaj task ne menja komercijalne cene, referral pravila, poreze, račune, provider integracije ili source payment istoriju.

## Aditivni modeli

| Model | Uloga |
| --- | --- |
| `financeLedgerEntries` | Immutable allocation-level receipt/refund/reversal činjenice, globalno i po account-u. |
| `financeMonthlyRollups` / `financeDailyRollups` | Server serije i zbirni periodi bez skeniranja uplata. |
| `financePaymentDigests` | Jedan kanonski red po uplati i scope-u. |
| `financePaymentListRows` | Indeksirani filteri za listu; jedan red po uplati unutar izabranog filtera. |
| `financeExpectedObligations` / `financeExpectedRollups` | Idempotentne buduće obaveze i bounded zbirni read put. |
| `financeDirectCosts` / `financeMonthlyCostRollups` | Append-only stvarni troškovi i correction/reversal zbir. |
| `financeCostRequirements` | Razlika između `known`, eksplicitne nule i `missing` troška/klasifikacije. |

Novi payment i order writer-i osvežavaju projekcije u istoj Convex transakciji. Subscription lifecycle, pricing i eksplicitni waiver writer-i osvežavaju samo odgovarajući subscription izvor. Nema background crona.

## Bezbedan istorijski rollout — plan, nije izvršen

1. Zasebno odobriti deployment i stvarnu data migraciju. Pre toga napraviti backup i rehearsal na izdvojenom preview deploymentu.
2. Prvo postaviti aditivnu šemu i writer-e. Ne uklanjati ili prepisivati postojeće payment, allocation, subscription, price, discount, order ili audit redove.
3. Kroz autentifikovani admin execution context pozivati internal `adminFinance.backfillPaymentProjection` sa `dryRun: true`, `limit` između 1 i 25 i neprozirnim cursorom od `null` do `isDone`.
4. Sačuvati `scanned`, `projected` i `unresolvedLegacy`. Legacy uplata bez pouzdanog ledger/allocation ugovora ostaje nerazrešena; ne izmišljati način, kategoriju, cenu ili valutu.
5. Odvojeno proći internal `adminFinance.backfillExpectedProjection` sa `source: "subscriptions"`, zatim `source: "orders"`, istim bounded cursor pravilom, fiksiranim `now` i `dryRun: true`.
6. Proveriti na reprezentativnom uzorku: jedan digest po payment/scope-u, zbir receipt alokacija plus neraspoređeno jednak originalnoj uplati, chart zbir jednak totalu, cancelled/inactive nema buduće redove, a potvrđeni order ostatak je `~undated`.
7. Tek uz novo eksplicitno odobrenje ponoviti iste stranice sa `dryRun: false`. Funkcije ne zakazuju sledeću stranicu; operator nastavlja isključivo vraćenim cursorom.
8. Retry iste stranice i ponovni prolaz od `cursor: null` ne smeju duplirati ledger, rollup, digest, list ili expected redove. Drugačiji payload istog finansijskog ključa ostaje konflikt.
9. Posle write prolaza uporediti account-filter rezultat sa profilom istog klijenta i proveriti incomplete profit pre unošenja stvarnih troškova. Ne unositi nulu osim kada je ona stvarno potvrđen trošak.

## Zaustavljanje i povratak

Ako dry-run pokaže nepoznate legacy činjenice ili zbirnu razliku, zaustaviti naredne stranice i ispraviti izvorne ugovore zasebnim odobrenim postupkom. Ne brisati projekcione ili source redove i ne resetovati deployment. Pošto su novi modeli aditivni, stari payment/subscription/order podaci ostaju autoritativni; UI se može zadržati van upotrebe dok se projekcija ne dokaže, bez destruktivnog rollback-a.

Nisu izvršeni `convex deploy`, `convex dev`, seed, reset, live mutation, migracija ili backfill.
