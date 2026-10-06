"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminEventsReports, type ReportsActions, type ReportsView } from "@/components/admin/admin-events-reports";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { downloadAdminFile } from "@/components/admin/events/download-file";
import { interactionOutcome } from "@/components/admin/events/event-outcome";
import { getFairEntitlements } from "@/lib/fair-entitlements";

// B6 — container of `izvestaji` (convex/fairReports.ts). Files are rendered
// by admin-only actions and downloaded in the browser (nothing is parked
// anywhere). A8: the PII lead file moved to `leadovi` (ADMIN-UX §7, §12.6).
// A9: the approval queue (day × exhibitor) is computed on the client from the
// catalog and the runs; its filters live in the URL (`dan`, `izlagac`, `status`).

export function IzvestajiSection() {
  const { eventId, catalog, directory } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const runs = useQuery(api.fairReports.listReportRuns, { eventId });
  const [reviewId, setReviewId] = useState<Id<"fairReportRuns"> | null>(null);
  const reviewed = useQuery(api.fairReports.getReportRun, reviewId ? { reportRunId: reviewId } : "skip");
  const build = useMutation(api.fairReports.requestReportBuild);
  const approve = useMutation(api.fairReports.approveReportRun);
  const send = useMutation(api.fairReports.sendReportRun);
  const resend = useMutation(api.fairReports.resendReportRun);
  const retry = useMutation(api.fairReports.retryReportRun);
  const correct = useMutation(api.fairReports.createReportCorrection);
  const download = useAction(api.fairReports.downloadReportRun);
  const exportOrganizer = useAction(api.fairReports.exportOrganizerAggregate);
  // Browser time, read once per mount: which fair days have closed (K4).
  const [now] = useState(() => Date.now());

  const view: ReportsView | undefined = useMemo(() => {
    if (!runs) return undefined;
    const businessNames = new Map(directory.businesses.map((row) => [row.businessId as string, row.name]));
    // As the daily sweep decides: a non-draft model whose stored package has the daily report.
    const expectsDaily = new Set<string>(
      catalog.models.filter((model) => model.status !== "draft" && getFairEntitlements(model.packageTier).dailyReport).map((model) => model.participationId),
    );
    return {
      days: [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder).map((day) => ({ id: day._id, label: day.label, dateKey: day.dateKey, endsAt: day.endsAt })),
      // A withdrawn exhibitor gets no new daily report but keeps its earlier runs in the queue.
      participations: catalog.participations.map((row) => ({
        id: row._id,
        name: businessNames.get(row.businessId) ?? row.externalKey,
        expectsDaily: row.status === "active" && expectsDaily.has(row._id),
      })),
      runs: runs.map((row) => ({
        id: row.reportRunId,
        dayLabel: row.dayLabel,
        dateKey: row.dateKey,
        participationId: row.participationId,
        exhibitorName: row.exhibitorName,
        status: row.status,
        format: row.format,
        createdAt: row.createdAt,
        hasFile: row.hasFile,
        ...(row.recipient !== undefined ? { recipient: row.recipient } : {}),
        ...(row.error !== undefined ? { error: row.error } : {}),
        ...(row.approvedAt !== undefined ? { approvedAt: row.approvedAt } : {}),
        ...(row.correctionOfReportRunId !== undefined ? { correctionOf: row.correctionOfReportRunId } : {}),
        sendCount: row.sendCount,
        lastDelivery: row.lastDelivery,
      })),
      review: reviewId ? { runId: reviewId, dataset: reviewed === undefined ? undefined : reviewed?.dataset ?? null } : null,
      now,
    };
  }, [runs, reviewed, reviewId, catalog, directory, now]);

  const runId = (id: string) => id as Id<"fairReportRuns">;
  const actions: ReportsActions = {
    build: (dayId, participationId, format) => interactionOutcome(() => build({ eventDayId: dayId as Id<"fairEventDays">, participationId: participationId as Id<"fairParticipations">, format })),
    approve: (id) => interactionOutcome(() => approve({ reportRunId: runId(id) })),
    send: (id, recipient) => interactionOutcome(() => send({ reportRunId: runId(id), ...(recipient ? { recipient } : {}) })),
    resend: (id, recipient) => interactionOutcome(() => resend({ reportRunId: runId(id), ...(recipient ? { recipient } : {}) })),
    retry: (id) => interactionOutcome(() => retry({ reportRunId: runId(id) })),
    correct: (id) => interactionOutcome(() => correct({ reportRunId: runId(id) })),
    download: (id, format) => interactionOutcome(async () => downloadAdminFile(await download({ reportRunId: runId(id), format }))),
    exportOrganizer: (format) => interactionOutcome(async () => downloadAdminFile(await exportOrganizer({ eventId, format }))),
    review: (id) => setReviewId(id ? runId(id) : null),
  };

  return <AdminEventsReports view={view} actions={actions} query={query} onQueryChange={setQuery} />;
}
