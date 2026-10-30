"use client";

import { useState } from "react";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { AdminDataCard, AdminDataView, AdminFilterBar, type AdminFilterChip } from "@/components/admin/admin-ui";
import {
  ConfirmAction,
  Feedback,
  Meta,
  Section,
  dateTime,
  field,
  secondaryButton,
  useRunner,
  type InteractionOutcome,
} from "@/components/admin/admin-events-interactions";
import {
  REPORT_QUEUE_STATUSES,
  buildReportQueue,
  filterReportQueue,
  type ReportQueueRow,
  type ReportQueueStatus,
} from "@/components/admin/events/report-queue";
import { fairDailyReportDocument, fairReportNumberText, type FairReportCell } from "@/convex/lib/fairReportFiles";
import type { FairDailyDataset } from "@/convex/lib/fairReportDataset";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import type { FairReportFormat, FairReportStatus } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Sajam 2026 B6 — the `Izveštaji` section of the admin `Događaji` tab.
// Admin UX A9 (ADMIN-UX §9): an approval queue — one row per fair day ×
// exhibitor with the state of its newest run (čeka podatke / u izradi /
// čeka odobrenje / odobreno / poslato / greška), filters by day, exhibitor
// and state in the URL, and the existing actions on that run: review,
// approve, send, resend, retry and correction; earlier versions stay folded
// under the row. Only daily aggregates, no PII (A8 moved the lead file to
// `leadovi`). Presentational only; data and actions come from
// izvestaji-section.tsx (convex/fairReports.ts, all requireAdmin).
// Nothing is ever sent without the explicit `Odobri` step (MASTER §12), and a
// build is offered only after the day closed (K4, FAIR_DAY_NOT_CLOSED).

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
  /** `endsAt` = close of the fair day (K4: a report exists only after it). */
  days: { id: string; label: string; dateKey: string; endsAt: number }[];
  /** `expectsDaily` = the exhibitor has a model whose package includes the daily report. */
  participations: { id: string; name: string; expectsDaily: boolean }[];
  runs: ReportRunView[];
  /** The run under review and its frozen dataset (undefined while loading). */
  review: { runId: string; dataset: FairDailyDataset | null | undefined } | null;
  /** Browser time: whether a day has closed. */
  now: number;
};

export type ReportsActions = {
  build: (dayId: string, participationId: string, format: FairReportFormat) => Promise<InteractionOutcome>;
  approve: (runId: string) => Promise<InteractionOutcome>;
  send: (runId: string, recipient: string | undefined) => Promise<InteractionOutcome>;
  resend: (runId: string, recipient: string | undefined) => Promise<InteractionOutcome>;
  retry: (runId: string) => Promise<InteractionOutcome>;
  correct: (runId: string) => Promise<InteractionOutcome>;
  download: (runId: string, format: FairReportFormat) => Promise<InteractionOutcome>;
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

function RunBadges({ run }: { run: ReportRunView }) {
  return (
    <>
      <AdminStatus label={dict.reportStatus[run.status]} tone={statusTone(run.status)} />
      {run.correctionOf ? <AdminStatus label={dict.reportsCorrectionBadge} tone="neutral" /> : null}
    </>
  );
}

function RunMeta({ run }: { run: ReportRunView }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      {run.approvedAt !== undefined ? <Meta>{fmt(dict.reportsApprovedAt, { date: dateTime.format(run.approvedAt) })}</Meta> : null}
      <Meta>{run.recipient ? fmt(dict.reportsRecipient, { email: run.recipient }) : dict.reportsNoRecipient}</Meta>
      {run.lastDelivery ? <Meta>{fmt(dict.reportsDelivery, { status: dict.deliveryStatus[run.lastDelivery.status as keyof typeof dict.deliveryStatus] ?? run.lastDelivery.status })}</Meta> : null}
      {run.error ? <Meta>{fmt(dict.reportsError, { error: reportErrorText(run.error) })}</Meta> : null}
    </span>
  );
}

function RunActions({ run, actions, reviewing, idSuffix }: { run: ReportRunView; actions: ReportsActions; reviewing: boolean; idSuffix: string }) {
  const runner = useRunner();
  const [recipient, setRecipient] = useState("");
  const recipientArg = recipient.trim() || undefined;
  const recipientId = `report-recipient-${run.id}-${idSuffix}`;
  const canDownload = run.status === "pending_review" || run.status === "approved" || run.status === "sent" || (run.status === "failed" && run.hasFile);
  return (
    <div className="grid gap-2 text-left">
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

type QueueRow = ReportQueueRow<ReportRunView>;
// No "info" tone exists in AdminStatus (the token would live in app/globals.css): neutral/muted instead.
const queueTone: Record<ReportQueueStatus, "active" | "waiting" | "problem" | "neutral" | "muted"> = {
  "ceka-podatke": "muted",
  "u-izradi": "neutral",
  "ceka-odobrenje": "waiting",
  odobreno: "neutral",
  poslato: "active",
  greska: "problem",
};

function QueueState({ row }: { row: QueueRow }) {
  const latest = row.runs[0];
  return (
    <span className="grid min-w-0 gap-1">
      <span className="flex flex-wrap gap-1.5">
        <AdminStatus label={dict.reportQueue.statuses[row.status]} tone={queueTone[row.status]} />
        {latest?.correctionOf ? <AdminStatus label={dict.reportsCorrectionBadge} tone="neutral" /> : null}
      </span>
      {latest ? (
        <>
          <Meta>{`${fmt(dict.reportQueue.version, { n: row.runs.length, total: row.runs.length })} · ${dict.reportsFormats[latest.format]} · ${fmt(dict.reportsRunMeta, { date: dateTime.format(latest.createdAt) })}`}</Meta>
          <RunMeta run={latest} />
        </>
      ) : <Meta>{row.dayClosed ? dict.reportQueue.waitingClosed : fmt(dict.reportQueue.waitingOpen, { date: dateTime.format(row.day.endsAt) })}</Meta>}
    </span>
  );
}

function QueueActions({ row, actions, review, idSuffix }: { row: QueueRow; actions: ReportsActions; review: ReportsView["review"]; idSuffix: string }) {
  const runner = useRunner();
  const latest = row.runs[0];
  if (latest) return <RunActions run={latest} actions={actions} reviewing={review?.runId === latest.id} idSuffix={idSuffix} />;
  if (!row.dayClosed) return null;
  return (
    <div className="grid gap-2 text-left">
      <button
        type="button"
        className={secondaryButton}
        disabled={runner.pending}
        aria-label={`${dict.reportQueue.build}: ${row.participation.name}, ${row.day.label}`}
        onClick={() => void runner.run(() => actions.build(row.day.id, row.participation.id, "pdf"), dict.reportsBuildQueued)}
      >
        {dict.reportQueue.build}
      </button>
      <Feedback message={runner.message} />
    </div>
  );
}

function QueueDetail({ row, actions, review, idSuffix }: { row: QueueRow; actions: ReportsActions; review: ReportsView["review"]; idSuffix: string }) {
  const reviewing = review && row.runs.some((run) => run.id === review.runId) ? review : null;
  const older = row.runs.slice(1);
  if (!reviewing && !older.length) return null;
  return (
    <div className="grid min-w-0 gap-3">
      {reviewing ? (
        <div className="min-w-0">
          {reviewing.dataset === undefined ? <Meta>{dict.reportsReviewLoading}</Meta> : reviewing.dataset === null ? <Meta>{dict.reportsReviewEmpty}</Meta> : <ReviewPanel dataset={reviewing.dataset} />}
        </div>
      ) : null}
      {older.length ? (
        <details className="min-w-0">
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]">{fmt(dict.reportQueue.older, { count: older.length })}</summary>
          <ul className="mt-2 grid gap-3">
            {older.map((run, index) => (
              <li key={run.id} className="grid min-w-0 gap-2 rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] p-3">
                <span className="flex flex-wrap items-center gap-1.5">
                  <strong className="text-sm">{fmt(dict.reportQueue.version, { n: row.runs.length - 1 - index, total: row.runs.length })}</strong>
                  <RunBadges run={run} />
                </span>
                <Meta>{fmt(dict.reportsRunMeta, { date: dateTime.format(run.createdAt) })}</Meta>
                <RunMeta run={run} />
                <RunActions run={run} actions={actions} reviewing={review?.runId === run.id} idSuffix={`${idSuffix}-old`} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function AdminEventsReports({
  view,
  actions,
  query = {},
  onQueryChange = () => undefined,
}: {
  view: ReportsView | undefined;
  actions: ReportsActions | undefined;
  query?: AdminQueryState;
  onQueryChange?: (patch: AdminQueryPatch) => void;
}) {
  const exportRun = useRunner();
  if (!view || !actions) return <AdminPanel><AdminEmptyState title={dict.tabReports} body={dict.reportsUnavailable} /></AdminPanel>;

  const q = dict.reportQueue;
  const rows = buildReportQueue(view);
  const shown = filterReportQueue(rows, query);
  const countOf = (status: ReportQueueStatus) => rows.filter((row) => row.status === status).length;
  const dayLabel = (dateKey: string) => view.days.find((day) => day.dateKey === dateKey)?.label ?? dateKey;
  const exhibitorName = (id: string) => view.participations.find((row) => row.id === id)?.name ?? id;
  const chips: AdminFilterChip[] = [];
  if (query.dan) chips.push({ id: "dan", label: `${q.facetDay}: ${dayLabel(query.dan)}`, onRemove: () => onQueryChange({ dan: null }) });
  if (query.izlagac) chips.push({ id: "izlagac", label: `${q.facetExhibitor}: ${exhibitorName(query.izlagac)}`, onRemove: () => onQueryChange({ izlagac: null }) });
  if (query.status && query.status in q.statuses) chips.push({ id: "status", label: `${q.facetStatus}: ${q.statuses[query.status as ReportQueueStatus]}`, onRemove: () => onQueryChange({ status: null }) });

  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.reportsSubtitle}</p>

      <Section title={q.title} help={q.help}>
        <div className="mb-3 grid gap-1">
          <p className="text-sm font-semibold">{fmt(q.summary, { review: countOf("ceka-odobrenje"), approved: countOf("odobreno"), failed: countOf("greska") })}</p>
          <Meta>{dict.reportsBuildHelp}</Meta>
          <Meta>{dict.reportsListHelp}</Meta>
          {!view.runs.length ? <Meta>{dict.reportsEmpty}</Meta> : null}
        </div>
        <AdminFilterBar
          label={q.filterLabel}
          facets={[
            { id: "dan", label: q.facetDay, options: [...view.days].sort((a, b) => a.endsAt - b.endsAt).map((day) => ({ value: day.dateKey, label: day.label, count: rows.filter((row) => row.day.dateKey === day.dateKey).length })) },
            { id: "izlagac", label: q.facetExhibitor, options: view.participations.map((row) => ({ value: row.id, label: row.name, count: rows.filter((entry) => entry.participation.id === row.id).length })) },
            { id: "status", label: q.facetStatus, options: REPORT_QUEUE_STATUSES.map((status) => ({ value: status, label: q.statuses[status], count: countOf(status) })) },
          ]}
          values={{ dan: query.dan, izlagac: query.izlagac, status: query.status }}
          onFacetChange={(id, value) => onQueryChange({ [id]: value ?? null })}
          chips={chips}
          onClear={chips.length ? () => onQueryChange({ dan: null, izlagac: null, status: null }) : undefined}
          className="mb-3"
        />
        <AdminDataView
          listKey="dogadjaji.izvestaji.red"
          caption={q.title}
          rows={shown}
          empty={rows.length ? { title: q.noMatchTitle, body: q.noMatchBody } : { title: q.title, body: dict.reportsBuildEmpty }}
          getRowId={(row) => row.id}
          toolbar={<Meta>{fmt(q.count, { shown: shown.length, total: rows.length })}</Meta>}
          groupBy={{ key: (row) => row.day.id, label: (_key, group) => group[0]?.day.label ?? "" }}
          columns={[
            { id: "exhibitor", header: q.colExhibitor, rowHeader: true, sortValue: (row) => row.participation.name, cell: (row) => <strong className="font-semibold">{row.participation.name}</strong> },
            { id: "state", header: q.colState, sortValue: (row) => REPORT_QUEUE_STATUSES.indexOf(row.status), cell: (row) => <QueueState row={row} /> },
          ]}
          tableClassName="min-w-[48rem]"
          renderCard={(row) => (
            <AdminDataCard title={row.participation.name} subtitle={row.day.label}>
              <QueueState row={row} />
            </AdminDataCard>
          )}
          rowActions={(row, context) => <QueueActions row={row} actions={actions} review={view.review} idSuffix={context.view} />}
          rowDetail={(row, context) => <QueueDetail row={row} actions={actions} review={view.review} idSuffix={context.view} />}
        />
      </Section>

      <Section title={dict.reportsExportsTitle} help={dict.reportsExportsHelp}>
        <div className="grid gap-4">
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
