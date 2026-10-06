import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { AdminEventsPassports, AdminEventsQuestions, AdminEventsSurveys, type InteractionsActions, type InteractionsView } from "./admin-events-interactions";

// Sajam 2026 B3 — the `Interakcije` sections of the admin `Događaji` area
// (A2: Glas publike, Ankete and Pasoš are separate routes).

const PARTS = [AdminEventsQuestions, AdminEventsSurveys, AdminEventsPassports];

const ok = async () => ({ ok: true as const });
const actions: InteractionsActions = {
  saveQuestion: ok, publishQuestion: ok, closeQuestion: ok, setSponsoredResult: ok, saveSurveyDraft: ok, publishSurvey: ok,
  retireSurvey: ok, openPassport: ok, publishPassport: ok, withdrawPassport: ok, removePassportModel: ok,
};

const view: InteractionsView = {
  models: [
    { id: "m1", name: "TEST Volta X1", brandName: "TEST Volta", tier: "advanced" },
    { id: "m2", name: "TEST Volta X2", brandName: "TEST Volta", tier: "starter" },
    { id: "m3", name: "TEST Om Z1", brandName: "TEST Om", tier: "included" },
  ],
  days: [{ id: "d1", label: "TEST dan 1" }],
  questions: [
    { id: "q1", modelId: "m1", dayLabel: "TEST dan 1", prompt: "TEST pitanje A", options: [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }], status: "published", sortOrder: 1, showOnSponsoredRotation: true },
    { id: "q2", modelId: "m2", dayLabel: "TEST dan 1", prompt: "TEST pitanje B", options: [{ id: "o1", label: "TEST 1", order: 1 }, { id: "o2", label: "TEST 2", order: 2 }], status: "draft", sortOrder: 1, showOnSponsoredRotation: false },
  ],
  surveys: [{ id: "s1", modelId: "m1", version: 2, status: "published", questionCount: 3 }],
  passports: [
    { id: "p1", brandId: "b1", brandName: "TEST Volta", status: "published", frozenAt: Date.parse("2026-10-08T12:00:00+02:00"), members: [{ modelId: "m1", modelName: "TEST Volta X1", status: "required" }, { modelId: "m2", modelName: "TEST Volta X2", status: "removed" }] },
    { id: null, brandId: "b2", brandName: "TEST Om", status: null, members: [] },
  ],
};

describe("B3 admin Interakcije", () => {
  test("questions, survey versions and passports render with Serbian statuses and no raw codes", () => {
    const html = PARTS.map((Part) => renderToStaticMarkup(<Part view={view} actions={actions} />)).join("");
    for (const text of [
      adminEventsSr.questionsTitle, adminEventsSr.surveysTitle, adminEventsSr.passportsTitle, "TEST pitanje A", "TEST pitanje B",
      adminEventsSr.questionStatus.published, adminEventsSr.questionStatus.draft, adminEventsSr.questionRotationOn, adminEventsSr.questionRotationClear,
      adminEventsSr.surveyStatus.published, adminEventsSr.passportStatus.published, adminEventsSr.passportMemberStatus.removed,
      adminEventsSr.passportRemoveModel, adminEventsSr.passportWithdraw, adminEventsSr.passportOpen, adminEventsSr.passportNone,
    ]) expect(html).toContain(text);
    // Glas publike form offers only models with a package that has questions.
    expect(html).not.toContain("TEST Om Z1 · TEST Om");
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
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
