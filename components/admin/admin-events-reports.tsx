"use client";

import { useState } from "react";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import {
  ConfirmAction,
  Feedback,
  Meta,
  Row,
  RowList,
  Section,
  dateTime,
  field,
  primaryButton,
  secondaryButton,
  useRunner,
  type InteractionOutcome,
} from "@/components/admin/admin-events-interactions";
import { fairDailyReportDocument, fairReportNumberText, type FairReportCell } from "@/convex/lib/fairReportFiles";
import type { FairDailyDataset } from "@/convex/lib/fairReportDataset";
import type { FairReportFormat, FairReportStatus } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Sajam 2026 B6 — the `Izveštaji` section of the admin `Događaji` tab:
// build, review, manual approval, send/resend, retry and correction of the
// exhibitor daily reports, plus the two separate exports (the PII lead file
// and the organizer aggregate). Presentational only; data and actions come
// from AdminEventsWorkspace (convex/fairReports.ts, all requireAdmin).
// Nothing is ever sent without the explicit `Odobri` step (MASTER §12).

export type ReportRunView = {
  id: string;
  dayLabel: string;
  dateKey: string;
  participationId: string;
  exhibitorName: string;
  status: FairReportStatus;
  format: FairReportFormat;
  createdAt: number;
  hasFile: boolean;
  recipient?: string;
  error?: string;
  approvedAt?: number;
  correctionOf?: string;
  sendCount: number;
  lastDelivery: { status: string; lastError?: string } | null;
};

export type ReportsView = {
  days: { id: string; label: string; dateKey: string }[];
  participations: { id: string; name: string }[];
  runs: ReportRunView[];
  /** The run under review and its frozen dataset (undefined while loading). */
  review: { runId: string; dataset: FairDailyDataset | null | undefined } | null;
};

export type ReportsActions = {
  build: (dayId: string, participationId: string, format: FairReportFormat) => Promise<InteractionOutcome>;
  approve: (runId: string) => Promise<InteractionOutcome>;
  send: (runId: string, recipient: string | undefined) => Promise<InteractionOutcome>;
  resend: (runId: string, recipient: string | undefined) => Promise<InteractionOutcome>;
  retry: (runId: string) => Promise<InteractionOutcome>;
  correct: (runId: string) => Promise<InteractionOutcome>;
  download: (runId: string, format: FairReportFormat) => Promise<InteractionOutcome>;
  exportLeads: (participationId: string, format: "csv" | "xlsx") => Promise<InteractionOutcome>;
  exportOrganizer: (format: FairReportFormat) => Promise<InteractionOutcome>;
  review: (runId: string | null) => void;
};

const FORMATS: FairReportFormat[] = ["pdf", "xlsx", "csv"];

function statusTone(status: FairReportStatus) {
  if (status === "sent") return "active" as const;
  if (status === "failed") return "problem" as const;
  if (status === "pending_review" || status === "approved") return "waiting" as const;
  return "neutral" as const;
}

/** A stored error/delivery code → Serbian text (codes may carry `:<http status>`). */
export function reportErrorText(code: string): string {
  const base = code.split(":")[0];
  if (base in dict.deliveryErrors) return dict.deliveryErrors[base as keyof typeof dict.deliveryErrors];
  if (base in dict.reportBuildErrors) return dict.reportBuildErrors[base as keyof typeof dict.reportBuildErrors];
  return fmt(dict.unknownIssue, { code });
}

function cellText(cell: FairReportCell) {
  if (cell === null) return "";
  return typeof cell === "number" ? fairReportNumberText(cell) : cell;
}

function ReviewPanel({ dataset }: { dataset: FairDailyDataset }) {
  const doc = fairDailyReportDocument(dataset);
  return (
    <div className="grid min-w-0 gap-4">
      <div>
        <strong className="block break-words text-base">{doc.title}</strong>
        <Meta>{doc.subtitle}</Meta>
        {doc.meta.map((line) => <Meta key={line}>{line}</Meta>)}
      </div>
      {doc.sections.map((section) => (
        <div key={section.heading} className="min-w-0">
          <h3 className="text-sm font-semibold">{section.heading}</h3>
          {section.note ? <Meta>{section.note}</Meta> : null}
          <div className="mt-2 overflow-x-auto rounded-[var(--admin-radius-control)] border border-[var(--admin-border)]">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="bg-[var(--admin-surface-strong)]">
                <tr>{section.columns.map((column) => <th key={column} scope="col" className="px-3 py-2 font-semibold">{column}</th>)}</tr>
              </thead>
              <tbody>
                {section.rows.map((row, index) => (
                  <tr key={index} className="border-t border-[var(--admin-border)]">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className={typeof cell === "number" ? "px-3 py-2 text-right tabular-nums" : "px-3 py-2 break-words"}>{cellText(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

function RunActions({ run, actions, reviewing }: { run: ReportRunView; actions: ReportsActions; reviewing: boolean }) {
  const runner = useRunner();
  const [recipient, setRecipient] = useState("");
  const recipientArg = recipient.trim() || undefined;
  const recipientId = `report-recipient-${run.id}`;
  const canDownload = run.status === "pending_review" || run.status === "approved" || run.status === "sent" || (run.status === "failed" && run.hasFile);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {canDownload ? (
          <button type="button" className={secondaryButton} onClick={() => actions.review(reviewing ? null : run.id)} aria-expanded={reviewing}>
            {reviewing ? dict.reportsCloseReview : dict.reportsReview}
          </button>
        ) : null}
        {run.status === "pending_review" ? (
          <ConfirmAction label={dict.reportsApprove} body={dict.reportsApproveConfirm} disabled={runner.pending} onConfirm={() => void runner.run(() => actions.approve(run.id), dict.reportsApproved)} />
        ) : null}
        {run.status === "approved" ? (
          <ConfirmAction label={dict.reportsSend} body={dict.reportsSendConfirm} disabled={runner.pending} onConfirm={() => void runner.run(() => actions.send(run.id, recipientArg), dict.reportsSent)} />
        ) : null}
        {run.status === "sent" ? (
          <ConfirmAction label={dict.reportsResend} body={dict.reportsResendConfirm} disabled={runner.pending} onConfirm={() => void runner.run(() => actions.resend(run.id, recipientArg), dict.reportsSent)} />
        ) : null}
        {run.status === "failed" ? (
          <button type="button" className={secondaryButton} disabled={runner.pending} onClick={() => void runner.run(() => actions.retry(run.id), dict.reportsRetried)}>{dict.reportsRetry}</button>
        ) : null}
        {run.status !== "queued" && run.status !== "building" ? (
          <ConfirmAction label={dict.reportsCorrect} body={dict.reportsCorrectConfirm} disabled={runner.pending} onConfirm={() => void runner.run(() => actions.correct(run.id), dict.reportsCorrected)} />
        ) : null}
      </div>
      {run.status === "approved" || run.status === "sent" ? (
        <label htmlFor={recipientId} className="grid gap-1 text-xs text-[var(--admin-text-muted)] sm:max-w-sm">
          {dict.reportsRecipientLabel}
          <input id={recipientId} type="email" inputMode="email" autoComplete="off" value={recipient} placeholder={run.recipient ?? ""} onChange={(event) => setRecipient(event.target.value)} className={field} />
        </label>
      ) : null}
      {canDownload ? (
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((format) => (
            <button key={format} type="button" className={secondaryButton} disabled={runner.pending} onClick={() => void runner.run(() => actions.download(run.id, format), dict.reportsDownloaded)}>
              {fmt(dict.reportsDownload, { format: dict.reportsFormats[format] })}
            </button>
          ))}
        </div>
      ) : null}
      <Feedback message={runner.message} />
    </div>
  );
}

export function AdminEventsReports({ view, actions }: { view: ReportsView | undefined; actions: ReportsActions | undefined }) {
  const buildRun = useRunner();
  const exportRun = useRunner();
  const [dayId, setDayId] = useState("");
  const [participationId, setParticipationId] = useState("");
  const [format, setFormat] = useState<FairReportFormat>("pdf");
  const [leadsParticipationId, setLeadsParticipationId] = useState("");
  if (!view || !actions) return <AdminPanel><AdminEmptyState title={dict.tabReports} body={dict.reportsUnavailable} /></AdminPanel>;

  const chosenDay = dayId || view.days[0]?.id || "";
  const chosenParticipation = participationId || view.participations[0]?.id || "";
  const chosenLeads = leadsParticipationId || view.participations[0]?.id || "";

  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.reportsSubtitle}</p>

      <Section title={dict.reportsBuildTitle} help={dict.reportsBuildHelp}>
        {view.days.length && view.participations.length ? (
          <div className="grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end">
            <label className="grid gap-1 text-sm" htmlFor="report-build-day">
              {dict.reportsDay}
              <select id="report-build-day" className={field} value={chosenDay} onChange={(event) => setDayId(event.target.value)}>
                {view.days.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm" htmlFor="report-build-exhibitor">
              {dict.reportsExhibitor}
              <select id="report-build-exhibitor" className={field} value={chosenParticipation} onChange={(event) => setParticipationId(event.target.value)}>
                {view.participations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm" htmlFor="report-build-format">
              {dict.reportsFormat}
              <select id="report-build-format" className={field} value={format} onChange={(event) => setFormat(event.target.value as FairReportFormat)}>
                {FORMATS.map((value) => <option key={value} value={value}>{dict.reportsFormats[value]}</option>)}
              </select>
            </label>
            <button type="button" className={primaryButton} disabled={buildRun.pending || !chosenDay || !chosenParticipation} onClick={() => void buildRun.run(() => actions.build(chosenDay, chosenParticipation, format), dict.reportsBuildQueued)}>
              {dict.reportsBuild}
            </button>
          </div>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.reportsBuildEmpty}</p>}
        <Feedback message={buildRun.message} />
      </Section>

      <Section title={dict.reportsListTitle} help={dict.reportsListHelp}>
        {view.runs.length ? (
          <RowList>
            {view.runs.map((run) => {
              const reviewing = view.review?.runId === run.id;
              return (
                <Row key={run.id}>
                  <span className="grid min-w-0 gap-1">
                    <strong className="block break-words text-sm">{fmt(dict.reportsRunLine, { exhibitor: run.exhibitorName, day: run.dayLabel, format: dict.reportsFormats[run.format] })}</strong>
                    <span className="flex flex-wrap items-center gap-2">
                      <AdminStatus label={dict.reportStatus[run.status]} tone={statusTone(run.status)} />
                      {run.correctionOf ? <AdminStatus label={dict.reportsCorrectionBadge} tone="neutral" /> : null}
                    </span>
                    <Meta>{fmt(dict.reportsRunMeta, { date: dateTime.format(run.createdAt) })}</Meta>
                    {run.approvedAt !== undefined ? <Meta>{fmt(dict.reportsApprovedAt, { date: dateTime.format(run.approvedAt) })}</Meta> : null}
                    <Meta>{run.recipient ? fmt(dict.reportsRecipient, { email: run.recipient }) : dict.reportsNoRecipient}</Meta>
                    {run.lastDelivery ? <Meta>{fmt(dict.reportsDelivery, { status: dict.deliveryStatus[run.lastDelivery.status as keyof typeof dict.deliveryStatus] ?? run.lastDelivery.status })}</Meta> : null}
                    {run.error ? <Meta>{fmt(dict.reportsError, { error: reportErrorText(run.error) })}</Meta> : null}
                    {reviewing ? (
                      <div className="mt-3 min-w-0">
                        {view.review?.dataset === undefined ? <Meta>{dict.reportsReviewLoading}</Meta> : view.review.dataset === null ? <Meta>{dict.reportsReviewEmpty}</Meta> : <ReviewPanel dataset={view.review.dataset} />}
                      </div>
                    ) : null}
                  </span>
                  <RunActions run={run} actions={actions} reviewing={reviewing} />
                </Row>
              );
            })}
          </RowList>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.reportsEmpty}</p>}
      </Section>

      <Section title={dict.reportsExportsTitle} help={dict.reportsExportsHelp}>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label className="grid gap-1 text-sm sm:max-w-sm" htmlFor="report-leads-exhibitor">
              {dict.reportsLeadsLabel}
              <select id="report-leads-exhibitor" className={field} value={chosenLeads} onChange={(event) => setLeadsParticipationId(event.target.value)}>
                {view.participations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            <Meta>{dict.reportsLeadsWarning}</Meta>
            <div className="flex flex-wrap gap-2">
              {(["csv", "xlsx"] as const).map((value) => (
                <button key={value} type="button" className={secondaryButton} disabled={exportRun.pending || !chosenLeads} onClick={() => void exportRun.run(() => actions.exportLeads(chosenLeads, value), dict.reportsDownloaded)}>
                  {fmt(dict.reportsLeadsDownload, { format: dict.reportsFormats[value] })}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2">
            <span className="text-sm">{dict.reportsOrganizerLabel}</span>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((value) => (
                <button key={value} type="button" className={secondaryButton} disabled={exportRun.pending} onClick={() => void exportRun.run(() => actions.exportOrganizer(value), dict.reportsDownloaded)}>
                  {fmt(dict.reportsOrganizerDownload, { format: dict.reportsFormats[value] })}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Feedback message={exportRun.message} />
      </Section>
    </div>
  );
}
