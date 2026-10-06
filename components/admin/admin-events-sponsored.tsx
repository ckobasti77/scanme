"use client";

import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { AdminDataCard, AdminDataView } from "@/components/admin/admin-ui";
import {
  ConfirmAction,
  Feedback,
  Meta,
  Section,
  dateTime,
  field,
  useRunner,
  type InteractionOutcome,
} from "@/components/admin/admin-events-interactions";
import type { FairAudienceQuestionStatus, FairSponsoredSnapshotStatus } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Sajam 2026 B5 — the `Sponzorisano` section of the admin `Događaji` tab:
// the published (immutable) Advanced snapshot in rotation order, whether it
// is still up to date, the manual publish of a new version, and the choice of
// the one question result shown with each model on the map/displays.
// Presentational only; data and actions come from AdminEventsWorkspace
// (convex/fairSponsoredAdmin.ts, fairInteractionsAdmin.setSponsoredResultQuestion).
// There is no impression or view metric anywhere (MASTER §10).

export type SponsoredView = {
  /** Names of the event's models (id → name, brand). */
  models: { id: string; name: string; brandName: string }[];
  active: { version: number; publishedAt?: number; items: { modelId: string; order: number; questionId?: string }[] } | null;
  history: { id: string; version: number; status: FairSponsoredSnapshotStatus; publishedAt?: number }[];
  /** Published models whose stored package is Advanced (activation moment included). */
  candidates: { modelId: string; activatedAt: number; questionId?: string }[];
  /** Non-draft Glas publike questions of the candidates. */
  questions: { id: string; modelId: string; prompt: string; status: FairAudienceQuestionStatus }[];
  /** Browser time used to tell a future package activation apart. */
  now: number;
};

export type SponsoredActions = {
  publish: () => Promise<InteractionOutcome>;
  setResult: (modelId: string, questionId: string | null) => Promise<InteractionOutcome>;
};

/** What a new publish would change (pure; the tab and its test share it). */
export function sponsoredDrift(view: Pick<SponsoredView, "active" | "candidates" | "now">) {
  const due = view.candidates.filter((row) => row.activatedAt <= view.now);
  const pending = view.candidates.filter((row) => row.activatedAt > view.now).map((row) => row.modelId);
  const listed = new Map((view.active?.items ?? []).map((item) => [item.modelId, item]));
  const dueIds = new Set(due.map((row) => row.modelId));
  const missing = due.filter((row) => !listed.has(row.modelId)).map((row) => row.modelId);
  const extra = [...listed.keys()].filter((id) => !dueIds.has(id));
  const questionChanged = due.filter((row) => listed.has(row.modelId) && listed.get(row.modelId)?.questionId !== row.questionId).map((row) => row.modelId);
  const upToDate = view.active !== null && !missing.length && !extra.length && !questionChanged.length;
  return { missing, extra, questionChanged, pending, upToDate };
}

export function AdminEventsSponsored({ view, actions }: { view: SponsoredView | undefined; actions: SponsoredActions | undefined }) {
  const publishRun = useRunner();
  const resultRun = useRunner();
  if (!view || !actions) return <AdminPanel><AdminEmptyState title={dict.tabSponsored} body={dict.sponsoredUnavailable} /></AdminPanel>;

  const models = new Map(view.models.map((model) => [model.id, model]));
  const name = (id: string) => models.get(id)?.name ?? "—";
  const brand = (id: string) => models.get(id)?.brandName ?? "—";
  const names = (ids: string[]) => ids.map(name).join(", ");
  const prompts = new Map(view.questions.map((question) => [question.id, question.prompt]));
  const drift = sponsoredDrift(view);
  const items = [...(view.active?.items ?? [])].sort((a, b) => a.order - b.order);
  const resultText = (questionId: string | undefined) => (questionId ? fmt(dict.sponsoredItemResult, { prompt: prompts.get(questionId) ?? "—" }) : dict.sponsoredItemNoResult);

  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.sponsoredSubtitle}</p>

      <Section title={dict.sponsoredTitle} help={dict.sponsoredHelp}>
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatus label={drift.upToDate ? dict.sponsoredUpToDate : dict.sponsoredStale} tone={drift.upToDate ? "active" : "waiting"} />
          <span className="min-w-0 break-words text-sm">
            {view.active
              ? fmt(dict.sponsoredActiveLine, { version: view.active.version, date: view.active.publishedAt !== undefined ? dateTime.format(view.active.publishedAt) : "—", count: items.length })
              : dict.sponsoredNone}
          </span>
        </div>
        <div className="mt-2 grid gap-1">
          {drift.missing.length ? <Meta>{fmt(dict.sponsoredMissing, { models: names(drift.missing) })}</Meta> : null}
          {drift.extra.length ? <Meta>{fmt(dict.sponsoredExtra, { models: names(drift.extra) })}</Meta> : null}
          {drift.questionChanged.length ? <Meta>{fmt(dict.sponsoredQuestionChanged, { models: names(drift.questionChanged) })}</Meta> : null}
          {drift.pending.length ? <Meta>{fmt(dict.sponsoredPending, { models: names(drift.pending) })}</Meta> : null}
        </div>
        <div className="mt-4">
          <ConfirmAction label={dict.sponsoredPublish} body={dict.sponsoredPublishConfirm} disabled={publishRun.pending} onConfirm={() => void publishRun.run(actions.publish, dict.sponsoredPublished)} />
        </div>
        <Feedback message={publishRun.message} />
      </Section>

      {view.active ? (
        <Section title={dict.sponsoredItemsTitle} help={dict.sponsoredItemsHelp}>
          <AdminDataView
            listKey="dogadjaji.sponzorisano.redosled"
            caption={dict.sponsoredItemsTitle}
            rows={items}
            empty={{ title: dict.sponsoredItemsTitle, body: dict.sponsoredItemsEmpty }}
            getRowId={(item) => item.modelId}
            columns={[
              { id: "order", header: dict.colOrder, align: "end", sortValue: (item) => item.order, cell: (item) => <span className="tabular-nums">{item.order + 1}</span> },
              { id: "model", header: dict.colModel, rowHeader: true, sortValue: (item) => name(item.modelId), cell: (item) => <strong className="font-semibold">{name(item.modelId)}</strong> },
              { id: "brand", header: dict.colBrand, sortValue: (item) => brand(item.modelId), cell: (item) => brand(item.modelId) },
              { id: "result", header: dict.colResult, cell: (item) => resultText(item.questionId) },
            ]}
            renderCard={(item) => <AdminDataCard title={fmt(dict.sponsoredItemLine, { order: item.order + 1, model: name(item.modelId), brand: brand(item.modelId) })} subtitle={resultText(item.questionId)} />}
          />
        </Section>
      ) : null}

      <Section title={dict.sponsoredResultTitle} help={dict.sponsoredResultHelp}>
        <Feedback message={resultRun.message} />
        <AdminDataView
          listKey="dogadjaji.sponzorisano.kandidati"
          caption={dict.sponsoredResultTitle}
          rows={view.candidates}
          empty={{ title: dict.sponsoredResultTitle, body: dict.sponsoredResultNoModels }}
          getRowId={(candidate) => candidate.modelId}
          columns={[
            { id: "model", header: dict.colModel, rowHeader: true, sortValue: (candidate) => name(candidate.modelId), cell: (candidate) => <strong className="font-semibold">{name(candidate.modelId)}</strong> },
            { id: "brand", header: dict.colBrand, sortValue: (candidate) => brand(candidate.modelId), cell: (candidate) => brand(candidate.modelId) },
          ]}
          renderCard={(candidate) => <AdminDataCard title={name(candidate.modelId)} subtitle={brand(candidate.modelId)} />}
          actionsHeader={dict.colResult}
          rowActions={(candidate, context) => {
            const options = view.questions.filter((question) => question.modelId === candidate.modelId);
            if (!options.length) return <Meta>{dict.sponsoredResultNoQuestions}</Meta>;
            return (
              <select
                aria-label={`${dict.colResult}: ${name(candidate.modelId)}`}
                data-view={context.view}
                value={candidate.questionId ?? ""}
                disabled={resultRun.pending}
                onChange={(event) => void resultRun.run(() => actions.setResult(candidate.modelId, event.target.value || null), dict.sponsoredResultSaved)}
                className={`${field} sm:w-72`}
              >
                <option value="">{dict.sponsoredResultNone}</option>
                {options.map((question) => <option key={question.id} value={question.id}>{question.prompt}</option>)}
              </select>
            );
          }}
        />
      </Section>

      {view.history.length ? (
        <Section title={dict.sponsoredHistoryTitle} help={dict.sponsoredHistoryHelp}>
          <AdminDataView
            listKey="dogadjaji.sponzorisano.verzije"
            caption={dict.sponsoredHistoryTitle}
            rows={view.history}
            getRowId={(row) => row.id}
            columns={[
              { id: "version", header: dict.colVersion, rowHeader: true, sortValue: (row) => row.version, cell: (row) => <strong className="font-semibold tabular-nums">{row.version}</strong> },
              { id: "published", header: dict.colPublishedAt, sortValue: (row) => row.publishedAt, cell: (row) => (row.publishedAt !== undefined ? dateTime.format(row.publishedAt) : "—") },
              { id: "status", header: dict.colStatus, sortValue: (row) => dict.sponsoredStatus[row.status], cell: (row) => <AdminStatus label={dict.sponsoredStatus[row.status]} tone={row.status === "published" ? "active" : "neutral"} /> },
            ]}
            renderCard={(row) => <AdminDataCard title={fmt(dict.sponsoredHistoryLine, { version: row.version, date: row.publishedAt !== undefined ? dateTime.format(row.publishedAt) : "—" })} badges={<AdminStatus label={dict.sponsoredStatus[row.status]} tone={row.status === "published" ? "active" : "neutral"} />} />}
          />
        </Section>
      ) : null}
    </div>
  );
}
