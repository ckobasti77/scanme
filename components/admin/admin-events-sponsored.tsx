"use client";

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
  const names = (ids: string[]) => ids.map(name).join(", ");
  const prompts = new Map(view.questions.map((question) => [question.id, question.prompt]));
  const drift = sponsoredDrift(view);
  const items = [...(view.active?.items ?? [])].sort((a, b) => a.order - b.order);

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
          {items.length ? (
            <RowList>
              {items.map((item) => (
                <Row key={item.modelId}>
                  <span className="min-w-0">
                    <strong className="block break-words text-sm">{fmt(dict.sponsoredItemLine, { order: item.order + 1, model: name(item.modelId), brand: models.get(item.modelId)?.brandName ?? "—" })}</strong>
                    <Meta>{item.questionId ? fmt(dict.sponsoredItemResult, { prompt: prompts.get(item.questionId) ?? "—" }) : dict.sponsoredItemNoResult}</Meta>
                  </span>
                </Row>
              ))}
            </RowList>
          ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.sponsoredItemsEmpty}</p>}
        </Section>
      ) : null}

      <Section title={dict.sponsoredResultTitle} help={dict.sponsoredResultHelp}>
        <Feedback message={resultRun.message} />
        {view.candidates.length ? (
          <RowList>
            {view.candidates.map((candidate) => {
              const options = view.questions.filter((question) => question.modelId === candidate.modelId);
              const selectId = `sponsored-result-${candidate.modelId}`;
              return (
                <Row key={candidate.modelId}>
                  <label htmlFor={selectId} className="min-w-0">
                    <strong className="block break-words text-sm">{name(candidate.modelId)}</strong>
                    <Meta>{models.get(candidate.modelId)?.brandName ?? "—"}</Meta>
                  </label>
                  {options.length ? (
                    <select
                      id={selectId}
                      value={candidate.questionId ?? ""}
                      disabled={resultRun.pending}
                      onChange={(event) => void resultRun.run(() => actions.setResult(candidate.modelId, event.target.value || null), dict.sponsoredResultSaved)}
                      className={`${field} sm:w-72`}
                    >
                      <option value="">{dict.sponsoredResultNone}</option>
                      {options.map((question) => <option key={question.id} value={question.id}>{question.prompt}</option>)}
                    </select>
                  ) : <Meta>{dict.sponsoredResultNoQuestions}</Meta>}
                </Row>
              );
            })}
          </RowList>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.sponsoredResultNoModels}</p>}
      </Section>

      {view.history.length ? (
        <Section title={dict.sponsoredHistoryTitle} help={dict.sponsoredHistoryHelp}>
          <RowList>
            {view.history.map((row) => (
              <Row key={row.id}>
                <span className="min-w-0 break-words text-sm">{fmt(dict.sponsoredHistoryLine, { version: row.version, date: row.publishedAt !== undefined ? dateTime.format(row.publishedAt) : "—" })}</span>
                <span className="flex flex-wrap items-center gap-2">
                  <AdminStatus label={dict.sponsoredStatus[row.status]} tone={row.status === "published" ? "active" : "neutral"} />
                </span>
              </Row>
            ))}
          </RowList>
        </Section>
      ) : null}
    </div>
  );
}
