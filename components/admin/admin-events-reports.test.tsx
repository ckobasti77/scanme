import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { Id, TableNames } from "@/convex/_generated/dataModel";
import type { FairDailyDataset } from "@/convex/lib/fairReportDataset";
import { adminEventsSr } from "@/lib/i18n/sr/admin-events";
import { eventReportSr } from "@/lib/i18n/sr/event-report";
import { fmt } from "@/lib/i18n/format";
import { issueText } from "./admin-events";
import { AdminEventsReports, reportErrorText, type ReportsActions, type ReportsView } from "./admin-events-reports";

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

const view: ReportsView = {
  days: [{ id: "d1", label: "TEST dan 1", dateKey: "2026-10-09" }],
  participations: [{ id: "p1", name: "TEST izlagač A" }],
  runs: [
    run({ id: "r1", status: "pending_review" }),
    run({ id: "r2", status: "approved", approvedAt: NOW, recipient: "a@example.invalid" }),
    run({ id: "r3", status: "failed", error: "PROVIDER_REJECTED:422", correctionOf: "r0" }),
  ],
  review: { runId: "r1", dataset },
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
