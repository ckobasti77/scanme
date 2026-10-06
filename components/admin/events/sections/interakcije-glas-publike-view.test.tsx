import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { InteractionsActions, InteractionsView } from "@/components/admin/admin-events-interactions";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { EventAudienceView } from "./interakcije-glas-publike-view";

// Admin UX A6 — Glas publike (SSR): picker with package and the day's quota,
// option rows instead of a textarea, quota visible and enforced before
// saving, the four statuses (Sponzorisano in its own tone) and the model ×
// day matrix.

const a = adminEventsSr.audience;
const H = 3_600_000;
const D1 = Date.parse("2026-10-09T09:00:00+02:00");
const NOW = D1 + 3 * H;
const base = { exhibitorId: "p1", exhibitorName: "TEST Izlagač A", packageActivatedAt: D1 - H, status: "published" as const };
const options = [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }];
const question = (id: string, modelId: string, dayId: string, status: "draft" | "published" | "closed", sortOrder: number, showOnSponsoredRotation = false) => ({
  id, modelId, dayId, prompt: `TEST pitanje ${id}`, options, status, sortOrder, showOnSponsoredRotation,
});

const view: InteractionsView = {
  models: [
    { ...base, id: "m1", name: "TEST Volta X1", brandId: "b1", brandName: "TEST Volta", externalKey: "test-m1", tier: "advanced" },
    { ...base, id: "m2", name: "TEST Volta X2", brandId: "b1", brandName: "TEST Volta", externalKey: "test-m2", tier: "starter" },
    { ...base, id: "m3", name: "TEST Om Z1", brandId: "b2", brandName: "TEST Om", externalKey: "test-m3", tier: "included" },
    { ...base, id: "m4", name: "TEST Om Z2", brandId: "b2", brandName: "TEST Om", externalKey: "test-m4", tier: "starter", packageActivatedAt: D1 + 24 * H },
  ],
  days: [
    { id: "d1", dateKey: "2026-10-09", label: "TEST dan 1", startsAt: D1, endsAt: D1 + 10 * H },
    { id: "d2", dateKey: "2026-10-10", label: "TEST dan 2", startsAt: D1 + 24 * H, endsAt: D1 + 34 * H },
  ],
  questions: [
    question("qa", "m1", "d1", "published", 1, true),
    question("qb", "m1", "d1", "published", 2),
    question("qc", "m1", "d1", "closed", 3),
    question("qd", "m2", "d1", "published", 1),
    question("qe", "m2", "d1", "draft", 2),
  ],
  surveys: [],
  passports: [],
};
const ok = async () => ({ ok: true as const });
const actions: InteractionsActions = {
  saveQuestion: ok, publishQuestion: ok, closeQuestion: ok, setSponsoredResult: ok, saveSurveyDraft: ok, publishSurvey: ok,
  retireSurvey: ok, openPassport: ok, publishPassport: ok, withdrawPassport: ok, removePassportModel: ok,
};
const render = (query: AdminQueryState = {}) => renderToStaticMarkup(<EventAudienceView view={view} actions={actions} now={NOW} query={query} onQueryChange={() => undefined} />);
const buttonWith = (html: string, text: string) => html.match(new RegExp(`<button[^>]*>(?:(?!</button>).)*${text}(?:(?!</button>).)*</button>`))?.[0] ?? "";

describe("A6 Glas publike", () => {
  test("the form uses the hierarchy picker and option rows, not a model <select> or a textarea", () => {
    const html = render();
    expect(html).toContain('data-admin-primitive="hierarchy-picker"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('data-admin-primitive="option-rows"');
    expect(html).not.toContain("<textarea");
    expect(html).not.toMatch(/jedna po redu/);
    // two empty option rows to start, "Dodaj opciju"
    expect(html).toContain(adminUiSr.optionRows.option.replace("{n}", "2"));
    expect(html).toContain(adminUiSr.optionRows.add);
  });

  test("next to each model in the picker: package and the day's quota; included and not-yet-active packages are disabled with the reason", () => {
    const html = render();
    expect(html).toContain("TEST Volta · TEST Izlagač A · Napredni · TEST dan 1: 3/5");
    expect(html).toContain("TEST Volta · TEST Izlagač A · Starter · TEST dan 1: 1/1");
    const m3 = html.match(/<li[^>]*-option-m3"[^>]*>.*?<\/li>/)?.[0] ?? "";
    expect(m3).toContain('aria-disabled="true"');
    expect(m3).toContain(a.pickNotEntitled);
    const m4 = html.match(/<li[^>]*-option-m4"[^>]*>.*?<\/li>/)?.[0] ?? "";
    expect(m4).toContain('aria-disabled="true"');
    expect(m4).toContain(a.pickPending.split(" {date}")[0].replace("{tier}", "Starter"));
  });

  test("the quota is visible before saving and publishing over the quota is blocked", () => {
    const full = render({ model: "m2", dan: "2026-10-09" });
    expect(full).toContain('data-quota-state="day_limit"');
    expect(full).toContain("TEST dan 1: objavljeno 1 od 1");
    expect(full).toContain(a.quotaStarterHint);
    expect(buttonWith(full, a.saveAndPublish)).toContain('disabled=""');
    expect(buttonWith(full, adminEventsSr.questionSave)).not.toContain('disabled=""');
    // the Starter draft in the list cannot be published either
    expect(full).toContain(a.publishBlockedShort);

    const free = render({ model: "m1", dan: "2026-10-09" });
    expect(free).toContain('data-quota-state="ok"');
    expect(free).toContain("TEST dan 1: objavljeno 3 od 5");
    expect(free).toContain("slobodno još 2");
    expect(buttonWith(free, a.saveAndPublish)).not.toContain('disabled=""');

    const otherDay = render({ model: "m2", dan: "2026-10-10" });
    expect(otherDay).toContain("TEST dan 2: objavljeno 0 od 1");
  });

  test("statuses: Nacrt neutral, Objavljeno success, Sponzorisano its own tone, Zatvoreno muted", () => {
    const html = render();
    const badge = (label: string) => html.match(new RegExp(`<span[^>]*data-tone="([a-z]+)"[^>]*><span[^>]*></span>${label}</span>`))?.[1];
    expect(badge(a.statuses.draft)).toBe("neutral");
    expect(badge(a.statuses.published)).toBe("active");
    expect(badge(a.statuses.sponsored)).toBe("sponsored");
    expect(badge(a.statuses.closed)).toBe("muted");
    expect(badge(a.statuses.sponsored)).not.toBe(badge(a.statuses.published));
    expect(html).not.toMatch(/u rotaciji/i);
  });

  test("actions: Postavi kao sponzorisano only on a published Napredni question; Ukloni sponzorisano on the chosen one", () => {
    const html = render();
    // m1 has one published, not chosen question (qb) → one button; the Starter model gets none.
    // Without a saved view choice the list renders both Tabela and Kartice (CSS shows one): each action twice.
    expect(html.split(a.setSponsored).length - 1).toBe(2);
    expect(html.split(a.clearSponsored).length - 1).toBe(2);
    expect(html).toContain(a.edit);
  });

  test("the list is grouped by day and model with the group's quota", () => {
    const html = render();
    expect(html).toContain("TEST dan 1 · TEST Volta X1");
    expect(html).toContain("TEST dan 1 · TEST Volta X2");
    expect(html).toContain(a.groupQuota.replace("{used}", "1").replace("{limit}", "1"));
    expect(html.indexOf("TEST dan 1 · TEST Volta X1")).toBeLessThan(html.indexOf("TEST dan 1 · TEST Volta X2"));
    const filtered = render({ status: "sponzorisano" });
    expect(filtered).toContain("TEST pitanje qa");
    expect(filtered).not.toContain("TEST pitanje qb</strong>");
  });

  test("matrix model × day: published / quota, empty cells today and later are highlighted, the selected cell is pressed", () => {
    const html = render({ model: "m2", dan: "2026-10-10" });
    expect(html).toContain('data-admin-matrix="audience"');
    expect(html).toContain(a.matrixTitle);
    const cell = (model: string, day: string) => html.match(new RegExp(`<button[^>]*aria-label="${model}, ${day}:[^"]*"[^>]*>`))?.[0] ?? "";
    expect(cell("TEST Volta X2", "TEST dan 1")).toContain('data-cell-state="full"');
    expect(cell("TEST Volta X2", "TEST dan 2")).toContain('data-cell-state="highlight"');
    expect(cell("TEST Volta X2", "TEST dan 2")).toContain('aria-pressed="true"');
    expect(cell("TEST Volta X1", "TEST dan 1")).toContain('data-cell-state="partial"');
    expect(cell("TEST Volta X1", "TEST dan 1")).toContain('aria-pressed="false"');
    // an included model is not a row; a package not in force yet has no quota ("—")
    expect(cell("TEST Om Z1", "TEST dan 1")).toBe("");
    expect(html).toContain(a.matrixNone);
    expect(html).toContain(a.matrixGaps.replace("{count}", "2"));
    expect(html).toContain(">1/1<");
    expect(html).toContain(">3/5<");
    expect(html).toContain(a.matrixDrafts.replace("{count}", "1"));
  });

  test("without a Starter/Napredni model the form explains why", () => {
    const html = renderToStaticMarkup(<EventAudienceView view={{ ...view, models: [view.models[2]], questions: [] }} actions={actions} now={NOW} query={{}} onQueryChange={() => undefined} />);
    expect(html).toContain(a.noModels);
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
  });
});
