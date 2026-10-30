# FRONTEND-DELTA 2026-10-30 — AMF go-live

Branch `amf-2026-golive` (from `aleksa/main` ad98bdd), released to `aleksa/main` and merged into `origin/main`. Convex DEV `perfect-ant-98` first, then PROD `adamant-warbler-746`. Owner decisions: MASTER-KONTEKST §20 (30. oktobar 2026).

## Schema and contract (all additive, optional)

- `fairEventModels.priceSecondaryText`, `fairEventModels.externalUrl` (B1 import fields `priceSecondaryText`, `externalUrl`; kept when the admin model form omits them). Public model view and `FairPublicModel` carry both.
- `fairParticipations.surveyAllTiers` — survey also on Starter models (`fairSurveyAllowed` in `convex/lib/fairInteractions.ts` gates every survey path; `deriveFairCapabilities` takes `surveyAllTiers`).
- `fairParticipations.leadInterestExtraFields` — model selector + purchase timing/financing in "Zainteresovan sam".
- Survey question kind `free_text`; `single_choice` may have `writeInLabel`. Answer `{ questionId, value, text? }`: `value` is `free_text` / `write_in` (`FAIR_SURVEY_FREE_TEXT_VALUE`, `FAIR_SURVEY_WRITE_IN_VALUE`) with `text` (1–200, trimmed, no control characters). `/api/fair/survey` accepts `text`.
- `FAIR_AUDIENCE_OPTIONS_MAX` and `FAIR_SURVEY_OPTIONS_MAX` = 12.
- `getLeadForm` (open state): `modelChoices?: { id, brandName, displayName }[]` (scanned first; test drive always, interest with extra fields), `extraFields?: boolean`.
- `submitLead` / `POST /api/fair/lead`: optional `selectedModelId` (published model of the same participation; the lead is stored on it, `fairLeads.scannedModelId` keeps the opened model), `purchaseTiming` (`now | within_3_months | in_3_6_months | just_researching`), `financing` (`cash | loan | leasing | undecided`). The result's `eventModelId` stays the opened model.
- Lead export (`exportLeads`, lead files): `scannedModelId`, `purchaseTiming`, `financing`; file column "Detalji".
- `AMF_PUBLIC_GATE_OPENS_AT` (lib/fair-contract.ts) gates `/sajam`, `/sajam/auto-moto-fest-2026`, its garage route and the client garage lock; set to 30. 10. 00:00 (open). `FAIR_PUBLIC_MAP_ENABLED = true`.
- Analytics cutoff `auto-moto-fest-2026` = 30. 10. 08:00.

## Map (mapLocationIds)

- New location `ispred-s6` (SWM, ID only, owner OK). Anchors added: `jetour` (hala-6-7), `moto-revolution` (entrance, no stand), `asteriks` (ispred-16, shares the booth with Kostić). Honda motorcycles moved to the bottom row of 6‑7. No other location changed.

## Internal setup (convex/fairSetup.ts)

`bootstrapEvent` (AMF exhibitors), `setupAudienceQuestions`, `setupSurveys`, `setupLeads`, `amfQrHousekeeping`. Payload/argument builders: `scripts/fair/amf-payload.mjs`, `scripts/fair/amf-interactions.mjs`, photos `scripts/fair/amf-photos.mjs`. Intake: `docs/events/auto-moto-fest-2026/intake/prod-2026-10-30/`.

## UI

- `components/fair/fair-select.tsx` (lead model selector, Nikom questions), `components/fair/scroll-hint.tsx` (all FairSheets, Glas publike), survey free text and write-in morph in `survey-sheet.tsx`, garage photo tap opens the model, model page secondary price and "Više o modelu na sajtu izlagača".
- Sponsored strip / its animation: unchanged.
