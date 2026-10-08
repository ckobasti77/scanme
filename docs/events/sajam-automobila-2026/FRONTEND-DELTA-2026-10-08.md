# Frontend delta — 8. oktobar 2026.

Detalji i razlozi su u [`JOVAN-DELTA-2026-10-08b.md`](./JOVAN-DELTA-2026-10-08b.md) (pre-event pristup).

- `fairPublic.listAudienceQuestionsForModel` ima nov opcioni argument `openAt` (sat pozivaoca). Vraća pitanja današnjeg `dateKey` **i** pitanja otvorena u `openAt`. `loadFairAudienceQuestions` (`lib/fair-server/model-page.ts`) ga šalje sam (`Date.now()`).
- Nova admin mutacija `fairInteractionsAdmin.openAudienceQuestionNow({ questionId })` je povezana kao `InteractionsActions.openQuestionNow` (opciono). `InteractionQuestion` ima opciono `startsAt`.
- Novi admin upit i mutacija `fairPreEvent.previewPreEventReset` / `resetPreEventData` (kartica „Pre-event podaci“ u Pregledu, `components/admin/events/sections/pre-event-reset.tsx`).
- `fairLeadsInbox.listEventLeads` ima nov opcioni argument `includePreEvent`. Bez njega lista počinje od otvaranja sajma.
- Novi kodovi grešaka: `FAIR_PRE_EVENT_RESET_CONFIRM` i `FAIR_PRE_EVENT_RESET_STALE` (`lib/fair-contract.ts` i i18n).
- `FAIR_PASSPORT_EVENT_STARTED` se više ne baca. Kod i tekst su ostali u ugovoru.
- Šema i `mapLocationId` se ne menjaju.
