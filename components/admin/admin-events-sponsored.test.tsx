import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { fmt } from "@/lib/i18n/format";
import { AdminEventsSponsored, sponsoredDrift, sponsoredWarnings, type SponsoredActions, type SponsoredView } from "./admin-events-sponsored";

// Sajam 2026 B5 / Admin UX A9 — the `Sponzorisano` section of the admin `Događaji` tab.

const ok = async () => ({ ok: true as const });
const actions: SponsoredActions = { publish: ok, setResult: ok, setAutoPublish: ok };
const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const html = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// The B5 fixture with the A9 switch off: the manual list and its drift.
const view: SponsoredView = {
  models: [
    { id: "m1", name: "TEST Volta X1", brandName: "TEST Volta", hasPhoto: true },
    { id: "m2", name: "TEST Volta X2", brandName: "TEST Volta", hasPhoto: false },
    { id: "m3", name: "TEST Om Z1", brandName: "TEST Om", hasPhoto: false },
    { id: "m4", name: "TEST Om Z2", brandName: "TEST Om", hasPhoto: false },
  ],
  autoPublish: false,
  active: {
    version: 3, publishedAt: NOW - 60_000, trigger: "admin", dayKey: "2026-10-09",
    items: [{ modelId: "m1", order: 1, questionId: "q1", visual: "photo", photoUrl: "https://example.com/test-volta-x1.jpg" }, { modelId: "m3", order: 0, visual: "event_placeholder" }],
  },
  history: [
    { id: "s3", version: 3, status: "published", publishedAt: NOW - 60_000, trigger: "admin" },
    { id: "s2", version: 2, status: "retired", publishedAt: NOW - 3_600_000, trigger: "auto" },
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
  votes: { threshold: 5, byQuestion: { q1: 7, q2: 2 } },
  now: NOW,
};
const auto: SponsoredView = { ...view, autoPublish: true, active: { ...view.active!, trigger: "auto" } };

describe("B5 admin Sponzorisano", () => {
  test("the published list renders in rotation order with Serbian statuses, drift and no raw codes", () => {
    const markup = renderToStaticMarkup(<AdminEventsSponsored view={view} actions={actions} />);
    for (const text of [
      adminEventsSr.sponsoredTitle, adminEventsSr.sponsoredStale, adminEventsSr.sponsoredPublish, adminEventsSr.sponsoredAuto.orderTitle,
      adminEventsSr.sponsoredResultTitle, adminEventsSr.sponsoredHistoryTitle, adminEventsSr.sponsoredStatus.published, adminEventsSr.sponsoredStatus.retired,
      fmt(adminEventsSr.sponsoredMissing, { models: "TEST Volta X2" }),
      fmt(adminEventsSr.sponsoredExtra, { models: "TEST Om Z1" }),
      fmt(adminEventsSr.sponsoredPending, { models: "TEST Om Z2" }),
      fmt(adminEventsSr.sponsoredItemResult, { prompt: "TEST pitanje A" }), adminEventsSr.sponsoredItemNoResult, "TEST pitanje B",
    ]) expect(markup).toContain(html(text));
    const first = markup.indexOf(fmt(adminEventsSr.sponsoredItemLine, { order: 1, model: "TEST Om Z1", brand: "TEST Om" }));
    const second = markup.indexOf(fmt(adminEventsSr.sponsoredItemLine, { order: 2, model: "TEST Volta X1", brand: "TEST Volta" }));
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(markup).not.toMatch(/FAIR_[A-Z_]+/);
    expect(markup).not.toMatch(/impresij|impression/i);
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
    const markup = renderToStaticMarkup(<AdminEventsSponsored view={{ ...view, active: null, history: [], candidates: [] }} actions={actions} />);
    expect(markup).toContain(adminEventsSr.sponsoredNone);
    expect(markup).toContain(adminEventsSr.sponsoredResultNoModels);
    expect(renderToStaticMarkup(<AdminEventsSponsored view={undefined} actions={undefined} />)).toContain(adminEventsSr.sponsoredUnavailable);
  });
});

describe("A9 admin Sponzorisano (automatic list)", () => {
  const a = adminEventsSr.sponsoredAuto;

  test("automatic: last update and its source, no stale badge, the switch and Osveži; the version is folded in technical details", () => {
    const markup = renderToStaticMarkup(<AdminEventsSponsored view={auto} actions={actions} />);
    expect(markup).toContain(a.autoOn);
    expect(markup).toContain(html(a.autoOnHelp));
    expect(markup).toContain(fmt(a.lastUpdate, { date: "", source: a.sources.auto }).split(" · ")[1]);
    expect(markup).not.toContain(adminEventsSr.sponsoredStale);
    expect(markup).not.toContain(fmt(adminEventsSr.sponsoredMissing, { models: "TEST Volta X2" }));
    expect(markup).toContain(fmt(a.pendingAuto, { models: "TEST Om Z2" }));
    expect(markup).toContain(a.turnOff);
    expect(markup).toContain(adminEventsSr.sponsoredPublish);
    // "Verzija liste" lives only inside the folded <details>.
    const details = markup.slice(markup.indexOf("<details"));
    expect(details).toContain(fmt(a.technicalVersion, { version: 3, dayKey: "2026-10-09" }));
    expect(markup.slice(0, markup.indexOf("<details"))).not.toContain(fmt(a.technicalVersion, { version: 3, dayKey: "2026-10-09" }));
    expect(details).toContain(a.sources.admin);
    // Manual mode says so and offers to switch back on.
    const manual = renderToStaticMarkup(<AdminEventsSponsored view={view} actions={actions} />);
    expect(manual).toContain(a.autoOff);
    expect(manual).toContain(a.turnOn);
    expect(manual).toContain(fmt(a.lastUpdate, { date: "", source: a.sources.admin }).split(" · ")[1]);
  });

  test("today's order: map 12 s and garage 8 s from rotation-slot.ts, picture or fallback, map question or what the map shows without one", () => {
    const markup = renderToStaticMarkup(<AdminEventsSponsored view={auto} actions={actions} />);
    expect(markup).toContain(html(a.orderHelp));
    expect(markup).toContain(fmt(a.orderCycle, { map: 24, garage: 16 }));
    // 60 s after the publish: map slot 5 → index 1, garage slot 7 → index 1 (both on the second model).
    expect(markup).toContain(a.nowMap);
    expect(markup).toContain(a.nowGarage);
    expect(markup).toContain('src="https://example.com/test-volta-x1.jpg"');
    expect(markup).toContain(a.visual.photo);
    expect(markup).toContain(html(a.visual.event_placeholder));
    expect(markup).toContain(a.mapShowsNone);
  });

  test("map question per model: Sponzorisano badge, vote count, the neutral note without a choice and a labelled select", () => {
    const markup = renderToStaticMarkup(<AdminEventsSponsored view={auto} actions={actions} />);
    expect(markup).toContain(adminEventsSr.audience.statuses.sponsored);
    expect(markup).toContain('data-tone="sponsored"');
    expect(markup).toContain(fmt(a.votesLine, { votes: 7 }));
    expect(markup).toContain(html(fmt(a.votesBelow, { votes: 2, threshold: 5 })));
    expect(markup).toContain(a.questionNoneNote);
    expect(markup).toContain(`aria-label="${adminEventsSr.colResult}: TEST Volta X1"`);
    expect(renderToStaticMarkup(<AdminEventsSponsored view={{ ...auto, votes: undefined }} actions={actions} />)).toContain(a.votesLoading);
  });

  test("warnings: no photo, no map question, fewer than 5 votes (info); none when everything is in place", () => {
    expect(sponsoredWarnings(auto)).toEqual({ noPhoto: ["m2"], noQuestion: [], fewVotes: ["m2"] });
    const markup = renderToStaticMarkup(<AdminEventsSponsored view={auto} actions={actions} />);
    expect(markup).toContain(html(fmt(a.warnNoPhoto, { count: 1, models: "TEST Volta X2" })));
    expect(markup).toContain(html(fmt(a.warnFewVotes, { threshold: 5, count: 1, models: "TEST Volta X2" })));
    const noQuestion = { ...auto, candidates: [{ modelId: "m1", activatedAt: NOW - 1 }] };
    expect(sponsoredWarnings(noQuestion)).toEqual({ noPhoto: [], noQuestion: ["m1"], fewVotes: [] });
    expect(renderToStaticMarkup(<AdminEventsSponsored view={noQuestion} actions={actions} />)).toContain(html(fmt(a.warnNoQuestion, { count: 1, models: "TEST Volta X1" })));
    const clean = { ...auto, candidates: [{ modelId: "m1", activatedAt: NOW - 1, questionId: "q1" }] };
    expect(renderToStaticMarkup(<AdminEventsSponsored view={clean} actions={actions} />)).toContain(a.warningsNone);
  });
});
