import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { Id, TableNames } from "@/convex/_generated/dataModel";
import type { FairDailyDataset } from "@/convex/lib/fairReportDataset";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { eventReportSr } from "@/lib/i18n/sr/event-report";
import { fmt } from "@/lib/i18n/format";
import { issueText } from "./admin-events";
import { AdminEventsReports, reportErrorText, type ReportsActions, type ReportsView } from "./admin-events-reports";
import { buildReportQueue, filterReportQueue, reportQueueStatus } from "./events/report-queue";

// Sajam 2026 B6 — the `Izveštaji` section of the admin `Događaji` tab.

const ok = async () => ({ ok: true as const });
const actions: ReportsActions = {
  build: ok, approve: ok, send: ok, resend: ok, retry: ok, correct: ok, download: ok, exportOrganizer: ok, review: () => {},
};
const NOW = Date.parse("2026-10-10T00:10:00+02:00");
const id = <T extends TableNames>(value: string) => value as Id<T>;

const run = (overrides: Partial<ReportsView["runs"][number]>): ReportsView["runs"][number] => ({
  id: "r1", dayLabel: "TEST dan 1", dateKey: "2026-10-09", participationId: "p1", exhibitorName: "TEST izlagač A",
  status: "pending_review", format: "pdf", createdAt: NOW, hasFile: true, sendCount: 0, lastDelivery: null, ...overrides,
});

const dataset: FairDailyDataset = {
  version: 1, eventId: id("e1"), eventTitle: "TEST sajam", eventSlug: "test-sajam", eventDayId: id("d1"), dateKey: "2026-10-09", dayLabel: "TEST dan 1",
  participationId: id("p1"), exhibitorName: "TEST izlagač A", windowStart: NOW - 600_000 - 86_400_000, windowEnd: NOW - 600_000, builtAt: NOW,
  stands: [{ standId: id("s1"), code: "TEST-A", displayName: "TEST štand A", total: 12, unique: 5 }],
  models: [{ eventModelId: id("m1"), displayName: "TEST Volta X1", standId: id("s1"), tier: "starter", metrics: ["stand_scans", "model_scans"], scans: { total: 12, unique: 5 } }],
  modelsTruncated: false,
};

const DAY1_ENDS = Date.parse("2026-10-10T00:00:00+02:00");
const view: ReportsView = {
  days: [{ id: "d1", label: "TEST dan 1", dateKey: "2026-10-09", endsAt: DAY1_ENDS }],
  participations: [{ id: "p1", name: "TEST izlagač A", expectsDaily: true }],
  runs: [
    run({ id: "r1", status: "pending_review" }),
    run({ id: "r2", status: "approved", approvedAt: NOW, recipient: "a@example.invalid" }),
    run({ id: "r3", status: "failed", error: "PROVIDER_REJECTED:422", correctionOf: "r0" }),
  ],
  review: { runId: "r1", dataset },
  now: NOW,
};

describe("B6 admin Izveštaji", () => {
  test("Serbian labels, the approval step before send, and no raw status or error codes", () => {
    const html = renderToStaticMarkup(<AdminEventsReports view={view} actions={actions} />);
    for (const text of [
      adminEventsSr.reportsSubtitle,
      adminEventsSr.reportStatus.pending_review,
      adminEventsSr.reportStatus.approved,
      adminEventsSr.reportStatus.failed,
      adminEventsSr.reportsApprove,
      adminEventsSr.reportsSend,
      adminEventsSr.reportsRetry,
      adminEventsSr.reportsCorrectionBadge,
      adminEventsSr.deliveryErrors.PROVIDER_REJECTED,
      fmt(adminEventsSr.reportsOrganizerDownload, { format: "CSV" }),
      // The review shows the very document that is rendered into the file.
      eventReportSr.standsHeading,
      "TEST Volta X1",
    ]) expect(html).toContain(text.replace(/&/g, "&amp;").replace(/"/g, "&quot;"));
    for (const raw of ["pending_review", "PROVIDER_REJECTED:422", "FAIR_REPORT"]) expect(html).not.toContain(raw);
    // A8 (ADMIN-UX §7, §12.6): the PII lead file is no longer here; it is in Leadovi (leadovi-view.test.tsx).
    expect(html).not.toContain(fmt(adminEventsSr.leadInbox.exportDownload, { format: "CSV" }));
    expect(html).not.toContain(adminEventsSr.reportsLeadsWarning);
  });

  test("a run waiting for review offers Odobri but never Pošalji; an approved run offers Pošalji", () => {
    const pending = renderToStaticMarkup(<AdminEventsReports view={{ ...view, runs: [run({ status: "pending_review" })], review: null }} actions={actions} />);
    expect(pending).toContain(adminEventsSr.reportsApprove);
    expect(pending).not.toContain(`>${adminEventsSr.reportsSend}<`);
    const approved = renderToStaticMarkup(<AdminEventsReports view={{ ...view, runs: [run({ status: "approved", approvedAt: NOW })], review: null }} actions={actions} />);
    expect(approved).toContain(`>${adminEventsSr.reportsSend}<`);
    expect(approved).not.toContain(`>${adminEventsSr.reportsApprove}<`);
  });

  test("empty and unavailable states", () => {
    expect(renderToStaticMarkup(<AdminEventsReports view={undefined} actions={undefined} />)).toContain(adminEventsSr.reportsUnavailable);
    expect(renderToStaticMarkup(<AdminEventsReports view={{ ...view, runs: [], review: null }} actions={actions} />)).toContain(adminEventsSr.reportsEmpty);
  });

  test("stored build and delivery codes map to Serbian text", () => {
    expect(reportErrorText("BUILD_FAILED")).toBe(adminEventsSr.reportBuildErrors.BUILD_FAILED);
    expect(reportErrorText("PROVIDER_UNAVAILABLE:503")).toBe(adminEventsSr.deliveryErrors.PROVIDER_UNAVAILABLE);
    expect(reportErrorText("REPORT_NOT_SENDABLE")).toBe(adminEventsSr.deliveryErrors.REPORT_NOT_SENDABLE);
  });

  test("K4: the build form says it works only after the day closes, and the refusal has a Serbian reason", () => {
    const html = renderToStaticMarkup(<AdminEventsReports view={{ ...view, review: null }} actions={actions} />);
    expect(html).toContain(adminEventsSr.reportsBuildHelp);
    expect(adminEventsSr.reportsBuildHelp).toContain("tek kad se taj dan zatvori");
    expect(issueText("FAIR_DAY_NOT_CLOSED")).toBe(adminEventsSr.issues.FAIR_DAY_NOT_CLOSED);
    expect(issueText("FAIR_DAY_NOT_CLOSED")).toContain("još nije zatvoren");
    expect(issueText("FAIR_DAY_NOT_CLOSED")).not.toContain("FAIR_");
  });
});

describe("A9 report approval queue (day × exhibitor)", () => {
  const q = adminEventsSr.reportQueue;
  const DAY2_ENDS = DAY1_ENDS + 86_400_000;
  const queueView: ReportsView = {
    days: [
      { id: "d1", label: "TEST dan 1", dateKey: "2026-10-09", endsAt: DAY1_ENDS },
      { id: "d2", label: "TEST dan 2", dateKey: "2026-10-10", endsAt: DAY2_ENDS },
    ],
    participations: [
      { id: "p1", name: "TEST izlagač A", expectsDaily: true },
      { id: "p2", name: "TEST izlagač B", expectsDaily: true },
      { id: "p3", name: "TEST izlagač C", expectsDaily: false },
    ],
    runs: [
      run({ id: "r-old", status: "failed", error: "BUILD_FAILED", createdAt: NOW - 1_000 }),
      run({ id: "r-new", status: "pending_review", createdAt: NOW, correctionOf: "r-old" }),
      run({ id: "r-b", participationId: "p2", exhibitorName: "TEST izlagač B", status: "sent", approvedAt: NOW, recipient: "b@example.invalid", sendCount: 1, lastDelivery: { status: "sent" } }),
    ],
    review: null,
    now: NOW,
  };

  test("one row per day × exhibitor that expects a report; the newest run decides the state; closed days first", () => {
    const rows = buildReportQueue(queueView);
    expect(rows.map((row) => [row.day.id, row.participation.id, row.status, row.dayClosed])).toEqual([
      ["d1", "p1", "ceka-odobrenje", true],
      ["d1", "p2", "poslato", true],
      ["d2", "p1", "ceka-podatke", false],
      ["d2", "p2", "ceka-podatke", false],
    ]);
    expect(rows[0].runs.map((entry) => entry.id)).toEqual(["r-new", "r-old"]);
    // After dan 2 closes it moves on top (newest closed day first).
    expect(buildReportQueue({ ...queueView, now: DAY2_ENDS }).map((row) => row.day.id)).toEqual(["d2", "d2", "d1", "d1"]);
    expect(filterReportQueue(rows, { status: "ceka-odobrenje" }).map((row) => row.id)).toEqual(["d1:p1"]);
    expect(filterReportQueue(rows, { dan: "2026-10-10", izlagac: "p2" }).map((row) => row.id)).toEqual(["d2:p2"]);
    for (const [status, slug] of [["queued", "u-izradi"], ["building", "u-izradi"], ["pending_review", "ceka-odobrenje"], ["approved", "odobreno"], ["sent", "poslato"], ["failed", "greska"]] as const) {
      expect(reportQueueStatus({ status })).toBe(slug);
    }
    expect(reportQueueStatus(undefined)).toBe("ceka-podatke");
  });

  test("the queue shows states, the summary, K4 (no build before the day closes), filters and earlier versions; no PII", () => {
    const markup = renderToStaticMarkup(<AdminEventsReports view={queueView} actions={actions} />);
    for (const text of [
      q.title, q.statuses["ceka-odobrenje"], q.statuses.poslato, q.statuses["ceka-podatke"], q.filterLabel, q.facetDay, q.facetExhibitor, q.facetStatus,
      fmt(q.summary, { review: 1, approved: 0, failed: 0 }), fmt(q.older, { count: 1 }), adminEventsSr.reportBuildErrors.BUILD_FAILED,
      adminEventsSr.reportsApprove, adminEventsSr.reportsResend, adminEventsSr.reportsCorrectionBadge, fmt(q.count, { shown: 4, total: 4 }),
    ]) expect(markup).toContain(text.replace(/&/g, "&amp;").replace(/"/g, "&quot;"));
    // Dan 2 is still open: no build offered, the close time is shown instead (K4).
    expect(markup).not.toContain(`>${q.build}<`);
    expect(markup).toContain(fmt(q.waitingOpen, { date: "" }).split(" ")[0]);
    // Once the day closes a row without a run offers the build.
    const closed = renderToStaticMarkup(<AdminEventsReports view={{ ...queueView, now: DAY2_ENDS }} actions={actions} />);
    expect(closed).toContain(`>${q.build}<`);
    expect(closed).toContain(q.waitingClosed);
    // TEST izlagač C has no Starter/Napredni model and no run: no row.
    expect(markup).not.toContain("TEST izlagač C</strong>");
    for (const raw of ["pending_review", "BUILD_FAILED", "FAIR_"]) expect(markup).not.toContain(raw);
    expect(markup).not.toMatch(/visitor|telefon|phone/i);
  });

  test("URL filters narrow the rows and show removable chips", () => {
    const markup = renderToStaticMarkup(<AdminEventsReports view={queueView} actions={actions} query={{ status: "poslato" }} />);
    expect(markup).toContain(fmt(q.count, { shown: 1, total: 4 }));
    expect(markup).toContain(`${q.facetStatus}: ${q.statuses.poslato}`);
    const none = renderToStaticMarkup(<AdminEventsReports view={queueView} actions={actions} query={{ status: "greska" }} />);
    expect(none).toContain(q.noMatchTitle);
  });
});
