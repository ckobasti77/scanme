import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { EventSurveysView } from "@/components/admin/events/sections/interakcije-ankete-view";
import { EventAudienceView } from "@/components/admin/events/sections/interakcije-glas-publike-view";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import type { InteractionsActions, InteractionsView } from "./admin-events-interactions";

// Sajam 2026 B3 — the `Interakcije` sections of the admin `Događaji` area
// (A2: Glas publike, Ankete and Pasoš are separate routes; A6: Glas publike
// and Ankete are the new views with picker, option rows and quota; A7: the
// automatic Pasoš has its own view and its checks are in
// components/admin/events/sections/interakcije-pasos-view.test.tsx).

const NOW = Date.parse("2026-10-09T12:00:00+02:00");
const query = {};
const onQueryChange = () => undefined;
const PARTS = [
  (props: { view: InteractionsView | undefined; actions: InteractionsActions | undefined }) => <EventAudienceView {...props} now={NOW} query={query} onQueryChange={onQueryChange} />,
  (props: { view: InteractionsView | undefined; actions: InteractionsActions | undefined }) => <EventSurveysView {...props} now={NOW} query={query} onQueryChange={onQueryChange} />,
];

const ok = async () => ({ ok: true as const });
const actions: InteractionsActions = {
  saveQuestion: ok, publishQuestion: ok, closeQuestion: ok, setSponsoredResult: ok, saveSurveyDraft: ok, publishSurvey: ok,
  retireSurvey: ok,
};

const activated = Date.parse("2026-10-09T09:00:00+02:00");
const base = { exhibitorId: "p1", exhibitorName: "TEST Izlagač", packageActivatedAt: activated, status: "published" as const };
const view: InteractionsView = {
  models: [
    { ...base, id: "m1", name: "TEST Volta X1", brandId: "b1", brandName: "TEST Volta", externalKey: "test-m1", tier: "advanced" },
    { ...base, id: "m2", name: "TEST Volta X2", brandId: "b1", brandName: "TEST Volta", externalKey: "test-m2", tier: "starter" },
    { ...base, id: "m3", name: "TEST Om Z1", brandId: "b2", brandName: "TEST Om", externalKey: "test-m3", tier: "included" },
  ],
  days: [{ id: "d1", dateKey: "2026-10-09", label: "TEST dan 1", startsAt: activated, endsAt: activated + 36_000_000 }],
  questions: [
    { id: "q1", modelId: "m1", dayId: "d1", prompt: "TEST pitanje A", options: [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }], status: "published", sortOrder: 1, showOnSponsoredRotation: true },
    { id: "q2", modelId: "m2", dayId: "d1", prompt: "TEST pitanje B", options: [{ id: "o1", label: "TEST 1", order: 1 }, { id: "o2", label: "TEST 2", order: 2 }], status: "draft", sortOrder: 1, showOnSponsoredRotation: false },
  ],
  surveys: [{ id: "s1", modelId: "m1", version: 2, status: "published", questions: [
    { id: "q1", prompt: "TEST anketa 1", kind: "yes_no", options: [], order: 1 },
    { id: "q2", prompt: "TEST anketa 2", kind: "yes_no", options: [], order: 2 },
    { id: "q3", prompt: "TEST anketa 3", kind: "yes_no", options: [], order: 3 },
  ] }],
};

describe("B3 admin Interakcije", () => {
  test("questions and survey versions render with Serbian statuses and no raw codes", () => {
    const html = PARTS.map((Part) => renderToStaticMarkup(<Part view={view} actions={actions} />)).join("");
    for (const text of [
      adminEventsSr.questionsTitle, adminEventsSr.surveysTitle, "TEST pitanje A", "TEST pitanje B",
      adminEventsSr.audience.statuses.sponsored, adminEventsSr.audience.statuses.draft, adminEventsSr.audience.clearSponsored,
      adminEventsSr.surveyStatus.published,
    ]) expect(html).toContain(text);
    // "u rotaciji" is gone from the UI (A6): the chosen question is Sponzorisano.
    expect(html).not.toMatch(/u rotaciji/i);
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
  });

  test("Glas publike: a model without a package that has questions is shown in the picker but cannot be chosen", () => {
    const html = renderToStaticMarkup(PARTS[0]({ view, actions }));
    const option = html.match(/<li[^>]*id="[^"]*-option-m3"[^>]*>.*?<\/li>/)?.[0] ?? "";
    expect(option).toContain('aria-disabled="true"');
    expect(option).toContain(adminEventsSr.audience.pickNotEntitled);
    expect(html.match(/<li[^>]*id="[^"]*-option-m1"[^>]*>/)?.[0]).not.toContain("aria-disabled");
  });

  test("without data the section shows a neutral state instead of failing", () => {
    for (const Part of PARTS) expect(renderToStaticMarkup(<Part view={undefined} actions={undefined} />)).toContain(adminEventsSr.interactionsUnavailable);
  });

  test("every passport problem returned by upsertPassport has text", () => {
    for (const code of ["fewer_than_two_models", "model_not_published", "model_not_candidate", "model_below_starter"] as const) {
      expect(adminEventsSr.passportProblems[code].length).toBeGreaterThan(0);
    }
  });
});
