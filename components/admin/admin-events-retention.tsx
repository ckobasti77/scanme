"use client";

import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { AdminDataCard, AdminDataView } from "@/components/admin/admin-ui";
import {
  Feedback,
  Meta,
  Row,
  RowList,
  Section,
  dateTime,
  secondaryButton,
  useRunner,
  type InteractionOutcome,
} from "@/components/admin/admin-events-interactions";
import type { FairPurgeCategory, FairPurgeCategoryStatus, FairPurgeMode, FairPurgeRunStatus, FairPurgeTrigger } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Sajam 2026 B7 — the `Brisanje podataka` section of the admin `Događaji` tab
// (V2 §11 "retention preview i audit bez PII u logu"). Presentational only;
// data and the dry-run action come from AdminEventsWorkspace
// (convex/fairRetention.ts). There is deliberately no delete button: the
// purge starts by itself on 16 Nov 2026 (MASTER §13).

export type RetentionView = {
  purgeAt: number;
  capPerCategory: number;
  preview: { category: FairPurgeCategory; count: number; capped: boolean }[];
  runs: {
    id: string;
    mode: FairPurgeMode;
    trigger: FairPurgeTrigger;
    status: FairPurgeRunStatus;
    startedAt: number;
    finishedAt?: number;
    batches: number;
    totalRows: number;
    categories: { category: FairPurgeCategory; rows: number; status: FairPurgeCategoryStatus }[];
  }[];
};

export type RetentionActions = {
  /** Starts a dry run, or keeps the one already in progress. */
  startDryRun: () => Promise<InteractionOutcome>;
};

type RetentionRun = RetentionView["runs"][number];

function runLine(run: RetentionRun) {
  return fmt(dict.retentionRunLine, { mode: dict.retentionModes[run.mode], trigger: dict.retentionTriggers[run.trigger], date: dateTime.format(run.startedAt) });
}

function RunStatus({ run }: { run: RetentionRun }) {
  return <AdminStatus label={dict.retentionRunStatus[run.status]} tone={run.status === "completed" ? "active" : "waiting"} />;
}

function RunProgress({ run }: { run: RetentionRun }) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <Meta>
        {run.finishedAt !== undefined
          ? fmt(dict.retentionRunFinished, { date: dateTime.format(run.finishedAt), rows: run.totalRows, batches: run.batches })
          : fmt(dict.retentionRunProgress, { rows: run.totalRows, batches: run.batches })}
      </Meta>
      {run.categories.map((entry) => (
        <Meta key={entry.category}>{fmt(dict.retentionCategoryLine, { category: dict.retentionCategories[entry.category], rows: entry.rows, status: dict.retentionCategoryStatus[entry.status] })}</Meta>
      ))}
    </span>
  );
}

export function AdminEventsRetention({ view, actions }: { view: RetentionView | undefined; actions: RetentionActions | undefined }) {
  const dryRun = useRunner();
  if (!view || !actions) return <AdminPanel><AdminEmptyState title={dict.tabRetention} body={dict.retentionUnavailable} /></AdminPanel>;

  const count = (row: RetentionView["preview"][number]) => (row.capped ? fmt(dict.retentionCountCapped, { count: row.count }) : String(row.count));

  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.retentionSubtitle}</p>

      <Section title={dict.retentionScheduleTitle} help={dict.retentionScheduleHelp}>
        <p className="break-words text-sm font-semibold">{fmt(dict.retentionScheduleLine, { date: dateTime.format(view.purgeAt) })}</p>
        <Meta>{dict.retentionKeptNote}</Meta>
      </Section>

      <Section title={dict.retentionPreviewTitle} help={fmt(dict.retentionPreviewHelp, { cap: view.capPerCategory })}>
        <RowList>
          {view.preview.map((row) => (
            <Row key={row.category}>
              <span className="min-w-0 break-words text-sm">{dict.retentionCategories[row.category]}</span>
              <strong className="text-sm tabular-nums">{count(row)}</strong>
            </Row>
          ))}
        </RowList>
        <div className="mt-4">
          <button
            type="button"
            className={secondaryButton}
            disabled={dryRun.pending}
            onClick={() => void dryRun.run(actions.startDryRun, dict.retentionDryRunStarted)}
          >
            {dict.retentionDryRun}
          </button>
        </div>
        <Feedback message={dryRun.message} />
      </Section>

      <Section title={dict.retentionRunsTitle} help={dict.retentionRunsHelp}>
        <AdminDataView
          listKey="dogadjaji.brisanje.runovi"
          caption={dict.retentionRunsTitle}
          rows={view.runs}
          empty={{ title: dict.retentionRunsTitle, body: dict.retentionRunsEmpty }}
          getRowId={(run) => run.id}
          columns={[
            { id: "run", header: dict.colRun, rowHeader: true, sortValue: (run) => run.startedAt, cell: (run) => <strong className="font-semibold">{runLine(run)}</strong> },
            { id: "progress", header: dict.colProgress, cell: (run) => <RunProgress run={run} /> },
            { id: "status", header: dict.colStatus, sortValue: (run) => dict.retentionRunStatus[run.status], cell: (run) => <RunStatus run={run} /> },
          ]}
          renderCard={(run) => (
            <AdminDataCard title={runLine(run)} badges={<RunStatus run={run} />}>
              <RunProgress run={run} />
            </AdminDataCard>
          )}
        />
      </Section>
    </div>
  );
}
