# AMF 2026 — DEV test intake (16. 10. 2026)

Samo za DEV (perfect-ant-98). Sufiks `_T` = test podatak; zameniti pravim
intake-om pre PROD-a. Jedan izlagač/brend `AUDI_T`, štand `hala-1`, tri
Advanced modela u pasošu: `RS3_T` (prava fotografija Audi RS 3), `A3_T` i
`Q4_T` (bez fotografije dok se ne postave u adminu).

Pokretanje (DEV, posle `npx.cmd convex dev --once`):

    node scripts/events/fair-setup-run.mjs bootstrapEvent --event auto-moto-fest-2026 --actor <admin email>
    node scripts/events/fair-setup-run.mjs importDryRun --payload docs/events/auto-moto-fest-2026/intake/dev-2026-10-16/b1-payload.json
    node scripts/events/fair-setup-run.mjs importCommit --payload docs/events/auto-moto-fest-2026/intake/dev-2026-10-16/b1-payload.json --actor <admin email>
    node scripts/events/fair-setup-run.mjs publishEventModels --event auto-moto-fest-2026 --actor <admin email>
