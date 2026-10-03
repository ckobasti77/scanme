import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { fmt } from "@/lib/i18n/format";
import { AdminEventsSponsored, sponsoredDrift, type SponsoredActions, type SponsoredView } from "./admin-events-sponsored";

// Sajam 2026 B5 — the `Sponzorisano` section of the admin `Događaji` tab.

const ok = async () => ({ ok: true as const });
const actions: SponsoredActions = { publish: ok, setResult: ok };
const NOW = Date.parse("2026-10-09T10:00:00+02:00");

const view: SponsoredView = {
  models: [
    { id: "m1", name: "TEST Volta X1", brandName: "TEST Volta" },
    { id: "m2", name: "TEST Volta X2", brandName: "TEST Volta" },
    { id: "m3", name: "TEST Om Z1", brandName: "TEST Om" },
    { id: "m4", name: "TEST Om Z2", brandName: "TEST Om" },
  ],
  active: { version: 3, publishedAt: NOW - 60_000, items: [{ modelId: "m1", order: 1, questionId: "q1" }, { modelId: "m3", order: 0 }] },
  history: [
    { id: "s3", version: 3, status: "published", publishedAt: NOW - 60_000 },
    { id: "s2", version: 2, status: "retired", publishedAt: NOW - 3_600_000 },
  ],
  candidates: [
    { modelId: "m1", activatedAt: NOW - 86_400_000, questionId: "q1" },
    { modelId: "m2", activatedAt: NOW - 1_000, questionId: "q2" },
    { modelId: "m4", activatedAt: NOW + 86_400_000 },
  ],
  questions: [
    { id: "q1", modelId: "m1", prompt: "TEST pitanje A", status: "published" },
    { id: "q2", modelId: "m2", prompt: "TEST pitanje B", status: "closed" },
  ],
  now: NOW,
};

describe("B5 admin Sponzorisano", () => {
  test("the published list renders in rotation order with Serbian statuses, drift and no raw codes", () => {
    const html = renderToStaticMarkup(<AdminEventsSponsored view={view} actions={actions} />);
    for (const text of [
      adminEventsSr.sponsoredTitle, adminEventsSr.sponsoredStale, adminEventsSr.sponsoredPublish, adminEventsSr.sponsoredItemsTitle,
      adminEventsSr.sponsoredResultTitle, adminEventsSr.sponsoredHistoryTitle, adminEventsSr.sponsoredStatus.published, adminEventsSr.sponsoredStatus.retired,
      fmt(adminEventsSr.sponsoredMissing, { models: "TEST Volta X2" }),
      fmt(adminEventsSr.sponsoredExtra, { models: "TEST Om Z1" }),
      fmt(adminEventsSr.sponsoredPending, { models: "TEST Om Z2" }),
      fmt(adminEventsSr.sponsoredItemResult, { prompt: "TEST pitanje A" }), adminEventsSr.sponsoredItemNoResult, "TEST pitanje B",
    ]) expect(html).toContain(text);
    const first = html.indexOf(fmt(adminEventsSr.sponsoredItemLine, { order: 1, model: "TEST Om Z1", brand: "TEST Om" }));
    const second = html.indexOf(fmt(adminEventsSr.sponsoredItemLine, { order: 2, model: "TEST Volta X1", brand: "TEST Volta" }));
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(html).not.toMatch(/FAIR_[A-Z_]+/);
    expect(html).not.toMatch(/impresij|impression/i);
  });

  test("drift: an up-to-date list, a changed result, a future activation and a missing model", () => {
    const upToDate = { active: { version: 1, items: [{ modelId: "m1", order: 0, questionId: "q1" }] }, candidates: [{ modelId: "m1", activatedAt: NOW - 1, questionId: "q1" }], now: NOW };
    expect(sponsoredDrift(upToDate)).toEqual({ missing: [], extra: [], questionChanged: [], pending: [], upToDate: true });
    expect(sponsoredDrift({ ...upToDate, candidates: [{ modelId: "m1", activatedAt: NOW - 1 }] }).questionChanged).toEqual(["m1"]);
    expect(sponsoredDrift({ ...upToDate, candidates: [...upToDate.candidates, { modelId: "m2", activatedAt: NOW + 1 }] })).toMatchObject({ pending: ["m2"], upToDate: true });
    expect(sponsoredDrift({ active: null, candidates: [], now: NOW }).upToDate).toBe(false);
    expect(sponsoredDrift(view)).toMatchObject({ missing: ["m2"], extra: ["m3"], questionChanged: [], pending: ["m4"], upToDate: false });
  });

  test("without a published list and without data the section shows neutral states", () => {
    const html = renderToStaticMarkup(<AdminEventsSponsored view={{ ...view, active: null, history: [], candidates: [] }} actions={actions} />);
    expect(html).toContain(adminEventsSr.sponsoredNone);
    expect(html).toContain(adminEventsSr.sponsoredResultNoModels);
    expect(renderToStaticMarkup(<AdminEventsSponsored view={undefined} actions={undefined} />)).toContain(adminEventsSr.sponsoredUnavailable);
  });
});
