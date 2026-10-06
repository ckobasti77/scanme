import type { FairReportStatus } from "@/lib/fair-contract";

// Admin UX A9 — the `izvestaji` approval queue (ADMIN-UX §9): one row per
// fair day × exhibitor with the state of its newest run (convex/fairReports.ts
// listReportRuns). Pure, so the screen, the dev preview and the test share
// it. No PII: a run row carries only names, dates, statuses and the recipient
// address of the exhibitor (the daily report itself has no visitor data).

export const REPORT_QUEUE_STATUSES = ["ceka-podatke", "u-izradi", "ceka-odobrenje", "odobreno", "poslato", "greska"] as const;
export type ReportQueueStatus = (typeof REPORT_QUEUE_STATUSES)[number];

export type ReportQueueRun = { id: string; dateKey: string; participationId: string; status: FairReportStatus; createdAt: number };

export type ReportQueueRow<Run extends ReportQueueRun> = {
  id: string;
  day: { id: string; label: string; dateKey: string; endsAt: number };
  participation: { id: string; name: string };
  /** Newest first; [0] is the run the row acts on. */
  runs: Run[];
  status: ReportQueueStatus;
  /** K4: a report is built only after the day closed (fairEventDays.endsAt). */
  dayClosed: boolean;
};

export function reportQueueStatus(run: Pick<ReportQueueRun, "status"> | undefined): ReportQueueStatus {
  switch (run?.status) {
    case undefined: return "ceka-podatke";
    case "queued":
    case "building": return "u-izradi";
    case "pending_review": return "ceka-odobrenje";
    case "approved": return "odobreno";
    case "sent": return "poslato";
    case "failed": return "greska";
  }
}

/**
 * Rows: every day × exhibitor that expects a daily report (a Starter or
 * Napredni model, as the sweep decides) or already has a run. Closed days
 * first (newest on top), then open days; within a day by exhibitor name. The
 * newest run of a pair decides its state.
 */
export function buildReportQueue<Run extends ReportQueueRun>(input: {
  days: { id: string; label: string; dateKey: string; endsAt: number }[];
  participations: { id: string; name: string; expectsDaily: boolean }[];
  runs: readonly Run[];
  now: number;
}): ReportQueueRow<Run>[] {
  const byPair = new Map<string, Run[]>();
  for (const run of input.runs) {
    const key = `${run.dateKey}|${run.participationId}`;
    byPair.set(key, [...(byPair.get(key) ?? []), run]);
  }
  const rows: ReportQueueRow<Run>[] = [];
  // Closed days first (newest on top: that is where approvals wait), then the still open days in calendar order.
  const closed = (day: { endsAt: number }) => day.endsAt <= input.now;
  const days = [...input.days].sort((a, b) =>
    closed(a) !== closed(b) ? (closed(a) ? -1 : 1) : closed(a) ? b.endsAt - a.endsAt : a.endsAt - b.endsAt);
  const participations = [...input.participations].sort((a, b) => a.name.localeCompare(b.name, "sr-Latn-RS"));
  for (const day of days) {
    for (const participation of participations) {
      const runs = [...(byPair.get(`${day.dateKey}|${participation.id}`) ?? [])].sort((a, b) => b.createdAt - a.createdAt);
      if (!runs.length && !participation.expectsDaily) continue;
      rows.push({
        id: `${day.id}:${participation.id}`,
        day,
        participation: { id: participation.id, name: participation.name },
        runs,
        status: reportQueueStatus(runs[0]),
        dayClosed: day.endsAt <= input.now,
      });
    }
  }
  return rows;
}

/** URL filters (`?dan=<dateKey>&izlagac=<participationId>&status=<slug>`) over the rows. */
export function filterReportQueue<Row extends ReportQueueRow<ReportQueueRun>>(rows: readonly Row[], query: { dan?: string; izlagac?: string; status?: string }): Row[] {
  return rows.filter((row) =>
    (!query.dan || row.day.dateKey === query.dan)
    && (!query.izlagac || row.participation.id === query.izlagac)
    && (!query.status || row.status === query.status));
}
