"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminEventsReports, type ReportsActions, type ReportsView } from "@/components/admin/admin-events-reports";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { interactionOutcome } from "@/components/admin/events/event-outcome";

// B6 — container of `izvestaji` (convex/fairReports.ts). Files are rendered
// by admin-only actions and downloaded in the browser (nothing is parked
// anywhere).

type FileResult = { fileName: string; mimeType: string; chunks: ArrayBuffer[] };

function downloadFile(result: FileResult) {
  const blob = new Blob(result.chunks, { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function IzvestajiSection() {
  const { eventId, catalog, directory } = useAdminEvent();
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
  const exportLeads = useAction(api.fairReports.exportLeadsFile);
  const exportOrganizer = useAction(api.fairReports.exportOrganizerAggregate);

  const view: ReportsView | undefined = useMemo(() => {
    if (!runs) return undefined;
    const businessNames = new Map(directory.businesses.map((row) => [row.businessId as string, row.name]));
    return {
      days: [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder).map((day) => ({ id: day._id, label: day.label, dateKey: day.dateKey })),
      participations: catalog.participations.map((row) => ({ id: row._id, name: businessNames.get(row.businessId) ?? row.externalKey })),
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
    };
  }, [runs, reviewed, reviewId, catalog, directory]);

  const runId = (id: string) => id as Id<"fairReportRuns">;
  const actions: ReportsActions = {
    build: (dayId, participationId, format) => interactionOutcome(() => build({ eventDayId: dayId as Id<"fairEventDays">, participationId: participationId as Id<"fairParticipations">, format })),
    approve: (id) => interactionOutcome(() => approve({ reportRunId: runId(id) })),
    send: (id, recipient) => interactionOutcome(() => send({ reportRunId: runId(id), ...(recipient ? { recipient } : {}) })),
    resend: (id, recipient) => interactionOutcome(() => resend({ reportRunId: runId(id), ...(recipient ? { recipient } : {}) })),
    retry: (id) => interactionOutcome(() => retry({ reportRunId: runId(id) })),
    correct: (id) => interactionOutcome(() => correct({ reportRunId: runId(id) })),
    download: (id, format) => interactionOutcome(async () => downloadFile(await download({ reportRunId: runId(id), format }))),
    exportLeads: (participationId, format) => interactionOutcome(async () => downloadFile(await exportLeads({ eventId, participationId: participationId as Id<"fairParticipations">, format }))),
    exportOrganizer: (format) => interactionOutcome(async () => downloadFile(await exportOrganizer({ eventId, format }))),
    review: (id) => setReviewId(id ? runId(id) : null),
  };

  return <AdminEventsReports view={view} actions={actions} />;
}
