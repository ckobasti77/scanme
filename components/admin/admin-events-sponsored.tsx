"use client";

import { CarFront } from "lucide-react";
import { useEffect, useState } from "react";
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
import { FAIR_GARAGE_ROTATION_INTERVAL_MS, FAIR_MAP_ROTATION_INTERVAL_MS, getFairRotationSlot } from "@/lib/fair-client/rotation-slot";
import type { FairAudienceQuestionStatus, FairSponsoredSnapshotStatus, FairSponsoredSnapshotTrigger } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Sajam 2026 B5 / Admin UX A9 — the `Sponzorisano` section of the admin
// `Događaji` tab: whether the Advanced list updates by itself (A9, ADMIN-UX
// §8) and when it last did, today's rotation order for the map/displays
// (12 s) and the garage (8 s) with each card's picture or fallback — the
// active slot comes from lib/fair-client/rotation-slot.ts, as on the map —
// the map question per Advanced model, warnings, the manual "Osveži" and the
// version history in folded technical details. Presentational only; data and
// actions come from sponzorisano-section.tsx (convex/fairSponsoredAdmin.ts,
// fairInteractionsAdmin.setSponsoredResultQuestion). There is no impression
// or view metric anywhere (MASTER §10).

type Visual = "photo" | "brand_logo" | "event_placeholder";

export type SponsoredView = {
  /** Names of the event's models (id → name, brand) and whether the model has its own photo. */
  models: { id: string; name: string; brandName: string; hasPhoto: boolean }[];
  /** A9: the list follows the published Advanced models by itself. */
  autoPublish: boolean;
  active: {
    version: number;
    publishedAt?: number;
    trigger: FairSponsoredSnapshotTrigger;
    dayKey: string;
    items: { modelId: string; order: number; questionId?: string; visual: Visual; photoUrl?: string; brandLogoUrl?: string }[];
  } | null;
  history: { id: string; version: number; status: FairSponsoredSnapshotStatus; publishedAt?: number; trigger: FairSponsoredSnapshotTrigger }[];
  /** Published models whose stored package is Advanced (activation moment included). */
  candidates: { modelId: string; activatedAt: number; questionId?: string }[];
  /** Non-draft Glas publike questions of the candidates. */
  questions: { id: string; modelId: string; prompt: string; status: FairAudienceQuestionStatus }[];
  /** Vote totals of the chosen map questions (polled; undefined = loading). */
  votes: { threshold: number; byQuestion: Record<string, number> } | undefined;
  /** Browser time used to tell a future package activation apart and to place "now" in the rotation. */
  now: number;
};

export type SponsoredActions = {
  publish: () => Promise<InteractionOutcome>;
  setResult: (modelId: string, questionId: string | null) => Promise<InteractionOutcome>;
  setAutoPublish: (enabled: boolean) => Promise<InteractionOutcome>;
};

/** What a new publish would change (pure; the tab and its test share it). */
export function sponsoredDrift(view: { active: { items: { modelId: string; questionId?: string }[] } | null; candidates: SponsoredView["candidates"]; now: number }) {
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

/** A9 warnings over the Advanced models in force (pure; shared with the test). */
export function sponsoredWarnings(view: Pick<SponsoredView, "models" | "candidates" | "votes" | "now">) {
  const due = view.candidates.filter((row) => row.activatedAt <= view.now);
  const hasPhoto = new Map(view.models.map((model) => [model.id, model.hasPhoto]));
  const noPhoto = due.filter((row) => !hasPhoto.get(row.modelId)).map((row) => row.modelId);
  const noQuestion = due.filter((row) => !row.questionId).map((row) => row.modelId);
  const fewVotes = view.votes
    ? due.filter((row) => row.questionId && (view.votes!.byQuestion[row.questionId] ?? 0) < view.votes!.threshold).map((row) => row.modelId)
    : [];
  return { noPhoto, noQuestion, fewVotes };
}

/** "Now" for the rotation preview: the view's time, then the browser clock every second. */
function useRotationNow(initial: number) {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function Picture({ item, name }: { item: NonNullable<SponsoredView["active"]>["items"][number]; name: string }) {
  const src = item.visual === "photo" ? item.photoUrl : item.visual === "brand_logo" ? item.brandLogoUrl : undefined;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {src ? (
        <span className="size-12 shrink-0 overflow-hidden rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface-muted)]">
          {/* Convex storage / external photo URLs of any host; next/image would need next.config (outside the admin). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" className={item.visual === "photo" ? "size-full object-cover" : "size-full object-contain p-1"} />
        </span>
      ) : (
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--admin-radius-control)] border border-dashed border-[var(--admin-border)] bg-[var(--admin-surface-muted)] text-[var(--admin-text-muted)]">
          <CarFront className="size-5" aria-hidden="true" />
        </span>
      )}
      <Meta>{dict.sponsoredAuto.visual[item.visual]}</Meta>
    </span>
  );
}

export function AdminEventsSponsored({ view, actions }: { view: SponsoredView | undefined; actions: SponsoredActions | undefined }) {
  const publishRun = useRunner();
  const autoRun = useRunner();
  const resultRun = useRunner();
  const now = useRotationNow(view?.now ?? 0);
  if (!view || !actions) return <AdminPanel><AdminEmptyState title={dict.tabSponsored} body={dict.sponsoredUnavailable} /></AdminPanel>;

  const a = dict.sponsoredAuto;
  const models = new Map(view.models.map((model) => [model.id, model]));
  const name = (id: string) => models.get(id)?.name ?? "—";
  const brand = (id: string) => models.get(id)?.brandName ?? "—";
  const names = (ids: string[]) => ids.map(name).join(", ");
  const prompts = new Map(view.questions.map((question) => [question.id, question.prompt]));
  const drift = sponsoredDrift(view);
  const warnings = sponsoredWarnings(view);
  const items = [...(view.active?.items ?? [])].sort((x, y) => x.order - y.order);
  const resultText = (questionId: string | undefined) => (questionId ? fmt(dict.sponsoredItemResult, { prompt: prompts.get(questionId) ?? "—" }) : dict.sponsoredItemNoResult);
  const epochMs = view.active?.publishedAt;
  const slot = (intervalMs: number) => (epochMs === undefined ? null : getFairRotationSlot({ epochMs, nowMs: now, intervalMs, itemCount: items.length }));
  const mapNow = slot(FAIR_MAP_ROTATION_INTERVAL_MS)?.index;
  const garageNow = slot(FAIR_GARAGE_ROTATION_INTERVAL_MS)?.index;
  const nowBadges = (index: number) => (
    <>
      {index === mapNow ? <AdminStatus label={a.nowMap} tone="sponsored" /> : null}
      {index === garageNow ? <AdminStatus label={a.nowGarage} tone="neutral" /> : null}
    </>
  );
  const votesText = (questionId: string) => {
    if (!view.votes) return a.votesLoading;
    const votes = view.votes.byQuestion[questionId] ?? 0;
    return votes < view.votes.threshold ? fmt(a.votesBelow, { votes, threshold: view.votes.threshold }) : fmt(a.votesLine, { votes });
  };

  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.sponsoredSubtitle}</p>

      <Section title={dict.sponsoredTitle} help={dict.sponsoredHelp}>
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatus label={view.autoPublish ? a.autoOn : a.autoOff} tone={view.autoPublish ? "active" : "neutral"} />
          {!view.autoPublish ? <AdminStatus label={drift.upToDate ? dict.sponsoredUpToDate : dict.sponsoredStale} tone={drift.upToDate ? "active" : "waiting"} /> : null}
          <span className="min-w-0 break-words text-sm">
            {view.active
              ? fmt(a.lastUpdate, { date: view.active.publishedAt !== undefined ? dateTime.format(view.active.publishedAt) : "—", source: a.sources[view.active.trigger] })
              : dict.sponsoredNone}
          </span>
        </div>
        {view.active ? <Meta>{fmt(a.modelsInRotation, { count: items.length })}</Meta> : null}
        <p className="mt-2 max-w-3xl text-sm text-[var(--admin-text-muted)]">{view.autoPublish ? a.autoOnHelp : a.autoOffHelp}</p>
        <div className="mt-2 grid gap-1">
          {!view.autoPublish && drift.missing.length ? <Meta>{fmt(dict.sponsoredMissing, { models: names(drift.missing) })}</Meta> : null}
          {!view.autoPublish && drift.extra.length ? <Meta>{fmt(dict.sponsoredExtra, { models: names(drift.extra) })}</Meta> : null}
          {!view.autoPublish && drift.questionChanged.length ? <Meta>{fmt(dict.sponsoredQuestionChanged, { models: names(drift.questionChanged) })}</Meta> : null}
          {drift.pending.length ? <Meta>{fmt(view.autoPublish ? a.pendingAuto : dict.sponsoredPending, { models: names(drift.pending) })}</Meta> : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ConfirmAction label={dict.sponsoredPublish} body={dict.sponsoredPublishConfirm} disabled={publishRun.pending} onConfirm={() => void publishRun.run(actions.publish, dict.sponsoredPublished)} />
          <ConfirmAction
            label={view.autoPublish ? a.turnOff : a.turnOn}
            body={view.autoPublish ? a.turnOffConfirm : a.turnOnConfirm}
            disabled={autoRun.pending}
            onConfirm={() => void autoRun.run(() => actions.setAutoPublish(!view.autoPublish), view.autoPublish ? a.turnedOff : a.turnedOn)}
          />
        </div>
        <Feedback message={publishRun.message ?? autoRun.message} />
      </Section>

      <Section title={a.warningsTitle} help={a.warningsHelp}>
        {warnings.noPhoto.length || warnings.noQuestion.length || warnings.fewVotes.length ? (
          <ul className="grid gap-2">
            {warnings.noPhoto.length ? (
              <li className="flex min-w-0 flex-wrap items-start gap-2">
                <AdminStatus label={a.warnTag} tone="waiting" />
                <span className="min-w-0 flex-1 break-words text-sm">{fmt(a.warnNoPhoto, { count: warnings.noPhoto.length, models: names(warnings.noPhoto) })}</span>
              </li>
            ) : null}
            {warnings.noQuestion.length ? (
              <li className="flex min-w-0 flex-wrap items-start gap-2">
                <AdminStatus label={a.warnTag} tone="waiting" />
                <span className="min-w-0 flex-1 break-words text-sm">{fmt(a.warnNoQuestion, { count: warnings.noQuestion.length, models: names(warnings.noQuestion) })}</span>
              </li>
            ) : null}
            {warnings.fewVotes.length && view.votes ? (
              <li className="flex min-w-0 flex-wrap items-start gap-2">
                <AdminStatus label={a.infoTag} tone="neutral" />
                <span className="min-w-0 flex-1 break-words text-sm">{fmt(a.warnFewVotes, { threshold: view.votes.threshold, count: warnings.fewVotes.length, models: names(warnings.fewVotes) })}</span>
              </li>
            ) : null}
          </ul>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{a.warningsNone}</p>}
      </Section>

      {view.active ? (
        <Section title={a.orderTitle} help={a.orderHelp}>
          <Meta>{fmt(a.orderCycle, { map: (items.length * FAIR_MAP_ROTATION_INTERVAL_MS) / 1000, garage: (items.length * FAIR_GARAGE_ROTATION_INTERVAL_MS) / 1000 })}</Meta>
          <div className="mt-3">
            <AdminDataView
              listKey="dogadjaji.sponzorisano.redosled"
              caption={a.orderTitle}
              rows={items}
              empty={{ title: a.orderTitle, body: dict.sponsoredItemsEmpty }}
              getRowId={(item) => item.modelId}
              columns={[
                { id: "order", header: dict.colOrder, align: "end", sortValue: (item) => item.order, cell: (item) => <span className="tabular-nums">{item.order + 1}</span> },
                {
                  id: "model", header: dict.colModel, rowHeader: true, sortValue: (item) => name(item.modelId),
                  cell: (item) => (
                    <span className="grid min-w-0 gap-1">
                      <strong className="font-semibold">{name(item.modelId)}</strong>
                      <Meta>{brand(item.modelId)}</Meta>
                      <span className="flex flex-wrap gap-1.5">{nowBadges(item.order)}</span>
                    </span>
                  ),
                },
                { id: "picture", header: a.colPicture, cell: (item) => <Picture item={item} name={name(item.modelId)} /> },
                { id: "result", header: a.colMapShows, cell: (item) => (item.questionId ? resultText(item.questionId) : a.mapShowsNone) },
              ]}
              renderCard={(item) => (
                <AdminDataCard
                  title={fmt(dict.sponsoredItemLine, { order: item.order + 1, model: name(item.modelId), brand: brand(item.modelId) })}
                  subtitle={item.questionId ? resultText(item.questionId) : dict.sponsoredItemNoResult}
                  badges={nowBadges(item.order)}
                >
                  <Picture item={item} name={name(item.modelId)} />
                </AdminDataCard>
              )}
            />
          </div>
        </Section>
      ) : null}

      <Section title={dict.sponsoredResultTitle} help={a.questionHelp}>
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
            {
              id: "state", header: a.colMapShows,
              cell: (candidate) => (candidate.questionId ? (
                <span className="grid min-w-0 gap-1">
                  <span><AdminStatus label={dict.audience.statuses.sponsored} tone="sponsored" /></span>
                  <Meta>{votesText(candidate.questionId)}</Meta>
                </span>
              ) : <Meta>{a.questionNoneNote}</Meta>),
            },
          ]}
          renderCard={(candidate) => (
            <AdminDataCard
              title={name(candidate.modelId)}
              subtitle={brand(candidate.modelId)}
              badges={candidate.questionId ? <AdminStatus label={dict.audience.statuses.sponsored} tone="sponsored" /> : null}
            >
              <Meta>{candidate.questionId ? votesText(candidate.questionId) : a.questionNoneNote}</Meta>
            </AdminDataCard>
          )}
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
                onChange={(event) => void resultRun.run(() => actions.setResult(candidate.modelId, event.target.value || null), view.autoPublish ? a.savedAuto : dict.sponsoredResultSaved)}
                className={`${field} sm:w-72`}
              >
                <option value="">{dict.sponsoredResultNone}</option>
                {options.map((question) => <option key={question.id} value={question.id}>{question.prompt}</option>)}
              </select>
            );
          }}
        />
      </Section>

      <details className="min-w-0 rounded-[var(--admin-radius-panel)] border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-[var(--admin-shadow-sm)] sm:p-5">
        <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]">{a.technicalTitle}</summary>
        <div className="mt-3 grid min-w-0 gap-3">
          {view.active ? <Meta>{fmt(a.technicalVersion, { version: view.active.version, dayKey: view.active.dayKey })}</Meta> : null}
          <p className="text-sm text-[var(--admin-text-muted)]">{dict.sponsoredHistoryHelp}</p>
          <h3 className="text-sm font-semibold">{dict.sponsoredHistoryTitle}</h3>
          {view.history.length ? (
            <AdminDataView
              listKey="dogadjaji.sponzorisano.verzije"
              caption={dict.sponsoredHistoryTitle}
              rows={view.history}
              getRowId={(row) => row.id}
              columns={[
                { id: "version", header: dict.colVersion, rowHeader: true, sortValue: (row) => row.version, cell: (row) => <strong className="font-semibold tabular-nums">{row.version}</strong> },
                { id: "published", header: dict.colPublishedAt, sortValue: (row) => row.publishedAt, cell: (row) => (row.publishedAt !== undefined ? dateTime.format(row.publishedAt) : "—") },
                { id: "source", header: a.colSource, sortValue: (row) => a.sources[row.trigger], cell: (row) => a.sources[row.trigger] },
                { id: "status", header: dict.colStatus, sortValue: (row) => dict.sponsoredStatus[row.status], cell: (row) => <AdminStatus label={dict.sponsoredStatus[row.status]} tone={row.status === "published" ? "active" : "muted"} /> },
              ]}
              renderCard={(row) => (
                <AdminDataCard
                  title={fmt(dict.sponsoredHistoryLine, { version: row.version, date: row.publishedAt !== undefined ? dateTime.format(row.publishedAt) : "—" })}
                  subtitle={a.sources[row.trigger]}
                  badges={<AdminStatus label={dict.sponsoredStatus[row.status]} tone={row.status === "published" ? "active" : "muted"} />}
                />
              )}
            />
          ) : <Meta>{dict.sponsoredNone}</Meta>}
        </div>
      </details>
    </div>
  );
}
