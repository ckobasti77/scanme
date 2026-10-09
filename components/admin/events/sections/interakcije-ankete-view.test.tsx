import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { InteractionsActions, InteractionsView } from "@/components/admin/admin-events-interactions";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { EventSurveysView } from "./interakcije-ankete-view";

// Admin UX A6 — Ankete (SSR): only Napredni models (the rest disabled with
// the reason), up to 5 questions, Da/Ne or "Izbor jednog odgovora" with
// option rows, draft → publish → retire and the version list.

const f = adminEventsSr.surveyForm;
const H = 3_600_000;
const NOW = Date.parse("2026-10-09T12:00:00+02:00");
const base = { exhibitorId: "p1", exhibitorName: "TEST Izlagač A", packageActivatedAt: NOW - H, status: "published" as const };
const yesNo = (id: string, prompt: string, order: number) => ({ id, prompt, kind: "yes_no" as const, options: [], order });
const view: InteractionsView = {
  models: [
    { ...base, id: "m1", name: "TEST Volta X1", brandId: "b1", brandName: "TEST Volta", externalKey: "test-m1", tier: "advanced" },
    { ...base, id: "m2", name: "TEST Volta X2", brandId: "b1", brandName: "TEST Volta", externalKey: "test-m2", tier: "starter" },
    { ...base, id: "m3", name: "TEST Om Z1", brandId: "b2", brandName: "TEST Om", externalKey: "test-m3", tier: "advanced" },
  ],
  days: [],
  questions: [],
  surveys: [
    { id: "s2", modelId: "m1", version: 2, status: "draft", questions: [
      yesNo("q1", "TEST kupujete li uskoro?", 1),
      { id: "q2", prompt: "TEST način plaćanja?", kind: "single_choice", options: [{ id: "o1", label: "TEST gotovina", order: 1 }, { id: "o2", label: "TEST kredit", order: 2 }], order: 2 },
    ] },
    { id: "s1", modelId: "m1", version: 1, status: "published", questions: [yesNo("q1", "TEST prva verzija", 1)] },
    { id: "s0", modelId: "m3", version: 1, status: "retired", questions: [yesNo("q1", "TEST povučena", 1)] },
  ],
};
const ok = async () => ({ ok: true as const });
const actions: InteractionsActions = {
  saveQuestion: ok, publishQuestion: ok, closeQuestion: ok, setSponsoredResult: ok, saveSurveyDraft: ok, publishSurvey: ok,
  retireSurvey: ok,
};
const render = (query: AdminQueryState = {}, data: InteractionsView = view) => renderToStaticMarkup(<EventSurveysView view={data} actions={actions} now={NOW} query={query} onQueryChange={() => undefined} />);

describe("A6 Ankete", () => {
  test("only Napredni models can be chosen; the others are in the picker, disabled, with the reason", () => {
    const html = render();
    expect(html).toContain('data-admin-primitive="hierarchy-picker"');
    const m2 = html.match(/<li[^>]*-option-m2"[^>]*>.*?<\/li>/)?.[0] ?? "";
    expect(m2).toContain('aria-disabled="true"');
    expect(m2).toContain(f.pickNotAdvanced);
    expect(html.match(/<li[^>]*-option-m1"[^>]*>/)?.[0]).not.toContain("aria-disabled");
    expect(html).toContain(f.pickPrompt);
    // a Starter model in the URL does not open the form
    expect(render({ model: "m2" })).toContain(f.pickPrompt);
  });

  test("the model's draft opens for editing with both question types and option rows", () => {
    const html = render({ model: "m1" });
    expect(html).toContain(f.editingDraft.replace("{version}", "2"));
    expect(html).toContain('value="TEST kupujete li uskoro?"');
    expect(html).toContain(adminEventsSr.surveyKinds.yes_no);
    expect(html).toContain(adminEventsSr.surveyKinds.single_choice);
    const radios = html.match(/<input[^>]*type="radio"[^>]*>/g) ?? [];
    expect(radios.filter((radio) => radio.includes('value="single_choice"') && radio.includes('checked=""'))).toHaveLength(1);
    expect(radios.filter((radio) => radio.includes('value="yes_no"') && radio.includes('checked=""'))).toHaveLength(1);
    expect(html).toContain('value="TEST gotovina"');
    expect(html).toContain('data-admin-primitive="option-rows"');
    expect(html).not.toContain("<textarea");
    expect(html).toContain(f.count.replace("{count}", "2").replace("{max}", "10"));
  });

  test("without a draft the next version starts from the latest one; ten questions disable Dodaj pitanje", () => {
    const ten = Array.from({ length: 10 }, (_, index) => yesNo(`q${index + 1}`, `TEST ${index + 1}`, index + 1));
    const html = render({ model: "m3" }, { ...view, surveys: [{ id: "s9", modelId: "m3", version: 4, status: "published", questions: ten }] });
    expect(html).toContain(f.newFromPublished.replace("{version}", "5").replace("{from}", "4"));
    expect(html).toContain(f.maxReached.replace("{max}", "10"));
    expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>).)*${f.add}`));
    expect(render({ model: "m3" }, { ...view, surveys: [] })).toContain(f.newFirst);
  });

  test("versions: grouped by model, statuses, publish a draft, retire a published one", () => {
    const html = render();
    expect(html).toContain(f.versionsTitle);
    expect(html).toContain(f.versionLabel.replace("{version}", "2"));
    for (const status of ["draft", "published", "retired"] as const) expect(html).toContain(adminEventsSr.surveyStatus[status]);
    expect(html).toContain(adminEventsSr.surveyPublish);
    expect(html).toContain(adminEventsSr.surveyRetire);
    expect(html).toContain("TEST kupujete li uskoro? · TEST način plaćanja?");
  });

  test("no Napredni model: an empty state", () => {
    const html = render({}, { ...view, models: [view.models[1]], surveys: [] });
    expect(html).toContain(f.noAdvancedTitle);
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
  });
});
