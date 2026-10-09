"use client";

import { Pencil, Send, Sparkles } from "lucide-react";
import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ConfirmAction,
  interactionCodeText,
  InteractionsUnavailable,
  type InteractionDay,
  type InteractionModel,
  type InteractionQuestion,
  type InteractionsActions,
  type InteractionsView,
} from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  AdminFilterBar,
  AdminHierarchyPicker,
  AdminOptionRows,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  type AdminColumn,
  type AdminFilterChip,
  type AdminFilterFacet,
} from "@/components/admin/admin-ui";
import { eventDateTime, Feedback, Meta, Section, type EventMessage } from "@/components/admin/events/event-ui";
import {
  AUDIENCE_STATUS_PARAMS,
  AUDIENCE_STATUSES,
  audienceDayTiming,
  audienceDisplayStatus,
  audienceDraftBlock,
  audienceListRows,
  audienceMatrix,
  audienceMatrixGaps,
  audiencePublishBlock,
  audienceQuota,
  audienceStatusCounts,
  audienceStatusFromParam,
  canSetSponsored,
  defaultAudienceDayId,
  nextAudienceSortOrder,
  type AudienceBlock,
  type AudienceDisplayStatus,
  type AudienceMatrixCell,
  type AudienceMatrixRow,
  type AudienceQuota,
} from "@/lib/admin-v1/audience-quota";
import { buildHierarchy } from "@/lib/admin-v1/hierarchy";
import { emptyOptionRows, optionRowsFrom, toChoiceOptions, validateOptionRows, type OptionRow } from "@/lib/admin-v1/option-rows";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A6 — `interakcije/glas-publike`: fast entry of Glas publike
// questions for dozens of models. The model comes from the hierarchy picker
// (package and the day's quota next to each model), the day is a select and
// the options are dynamic rows. The quota is checked before saving with the
// lib/fair-entitlements rule (lib/admin-v1/audience-quota); the backend stays
// the source of truth. Below: the model × day coverage matrix (a click opens
// the form on that model and day: `?model=&dan=`) and the questions grouped
// by day and model with Nacrt / Objavljeno / Sponzorisano / Zatvoreno.

const a = dict.audience;

export const AUDIENCE_STATUS_TONE: Record<AudienceDisplayStatus, "neutral" | "active" | "sponsored" | "muted"> = {
  draft: "neutral",
  published: "active",
  sponsored: "sponsored",
  closed: "muted",
};

/** The status badge; a closed question that is still the map's choice also shows Sponzorisano. */
export function AudienceStatusBadges({ question }: { question: Pick<InteractionQuestion, "status" | "showOnSponsoredRotation"> }) {
  const status = audienceDisplayStatus(question);
  return (
    <>
      <AdminStatus label={a.statuses[status]} tone={AUDIENCE_STATUS_TONE[status]} />
      {status === "closed" && question.showOnSponsoredRotation ? <AdminStatus label={a.statuses.sponsored} tone="sponsored" /> : null}
    </>
  );
}

function blockText(block: AudienceBlock, quota: AudienceQuota, dayLabel: string) {
  if (block === "pending_package" && quota.pending) return fmt(a.blocks.pending_package, { tier: dict.tiers[quota.pending.tier], date: eventDateTime.format(quota.pending.from) });
  return fmt(a.blocks[block], { day: dayLabel, used: quota.used, limit: quota.limit });
}

export type AudienceEditing = { questionId: string; modelId: string; dayId: string; prompt: string; options: OptionRow[]; sortOrder: number };

// -----------------------------------------------------------------------------
// Form: picker + day + question + options, quota visible before saving
// -----------------------------------------------------------------------------

function QuotaPanel({ quota, dayLabel }: { quota: AudienceQuota; dayLabel: string }) {
  const block = audienceDraftBlock(quota) ?? audiencePublishBlock(quota);
  return (
    <div
      data-quota-state={block ?? "ok"}
      className={cn(
        "grid gap-1.5 rounded-[var(--admin-radius-control)] border p-3 text-sm",
        block === "day_limit" ? "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)]"
          : block ? "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)]"
            : "border-[var(--admin-border)] bg-[var(--admin-surface-muted)]",
      )}
    >
      <p className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-[var(--admin-text-muted)]">{a.quotaTitle}</span>
        <AdminStatus label={dict.tiers[quota.tier]} tone={quota.tier === "advanced" ? "sponsored" : quota.tier === "starter" ? "active" : "neutral"} />
        {quota.limit > 0 ? (
          <span className="font-semibold tabular-nums">
            {fmt(a.quotaLine, { day: dayLabel, used: quota.used, limit: quota.limit })}
            {" · "}{fmt(a.quotaRemaining, { count: quota.remaining })}
            {quota.drafts ? <>{" · "}{fmt(a.quotaDrafts, { count: quota.drafts })}</> : null}
          </span>
        ) : null}
      </p>
      {block ? <p className="font-semibold">{blockText(block, quota, dayLabel)}</p> : null}
      {quota.tier === "starter" ? <p className="text-xs text-[var(--admin-text-muted)]">{a.quotaStarterHint}</p> : null}
      {quota.tier === "advanced" ? <p className="text-xs text-[var(--admin-text-muted)]">{a.quotaAdvancedHint}</p> : null}
    </div>
  );
}

type FormProps = {
  models: readonly InteractionModel[];
  days: readonly InteractionDay[];
  questions: readonly InteractionQuestion[];
  now: number;
  modelId: string | undefined;
  dayId: string | undefined;
  onPick: (patch: { modelId?: string | null; dayId?: string | null }) => void;
  actions: InteractionsActions;
  editing: AudienceEditing | null;
  onEditDone: () => void;
  formId: string;
  promptRef: RefObject<HTMLInputElement | null>;
  /** Kept by the parent: the form remounts after a draft edit and the message must stay. */
  message: EventMessage;
  setMessage: (message: EventMessage) => void;
};

function AudienceForm({ models, days, questions, now, modelId, dayId, onPick, actions, editing, onEditDone, formId, promptRef, message, setMessage }: FormProps) {
  const [prompt, setPrompt] = useState(editing?.prompt ?? "");
  const [rows, setRows] = useState<OptionRow[]>(editing?.options ?? emptyOptionRows());
  const [showProblems, setShowProblems] = useState(false);
  const [pending, setPending] = useState(false);

  const day = days.find((row) => row.id === dayId);
  const dayLabel = day?.label ?? "—";
  const model = models.find((row) => row.id === modelId);
  const quota = model && day ? audienceQuota(model, day.id, questions, now) : null;
  const draftBlock = quota ? audienceDraftBlock(quota) : null;
  // Editing a draft does not use a place; publishing it does.
  const publishBlock = quota ? audiencePublishBlock(quota) : null;
  const optionProblems = validateOptionRows(rows);
  const promptMissing = !prompt.trim();

  const pickData = useMemo(() => buildHierarchy(models.map((row) => {
    const rowQuota = day ? audienceQuota(row, day.id, questions, now) : null;
    const block = rowQuota ? audienceDraftBlock(rowQuota) : null;
    return {
      id: row.id,
      label: row.name,
      sublabel: rowQuota && !block
        ? fmt(a.pickSublabel, { brand: row.brandName, exhibitor: row.exhibitorName, tier: dict.tiers[rowQuota.tier], day: dayLabel, used: rowQuota.used, limit: rowQuota.limit })
        : `${row.brandName} · ${row.exhibitorName}`,
      exhibitorId: row.exhibitorId,
      exhibitorLabel: row.exhibitorName,
      brandId: row.brandId,
      brandLabel: row.brandName,
      searchTerms: [row.externalKey],
      ...(block === "not_entitled" ? { disabledReason: a.pickNotEntitled } : {}),
      ...(block === "pending_package" && rowQuota?.pending ? { disabledReason: fmt(a.pickPending, { tier: dict.tiers[rowQuota.pending.tier], date: eventDateTime.format(rowQuota.pending.from) }) } : {}),
    };
  })), [models, day, dayLabel, questions, now]);

  async function save(publish: boolean) {
    setShowProblems(true);
    setMessage(null);
    if (!model || !day || !quota) return setMessage({ tone: "error", text: a.pickModelFirst });
    if (promptMissing || optionProblems.length || draftBlock) return;
    if (publish && publishBlock) return;
    // A draft moved to another model is a new question there (the server keeps a question on its model).
    const edited = editing && editing.modelId === model.id ? editing : null;
    setPending(true);
    try {
      const saved = await actions.saveQuestion({
        ...(edited ? { questionId: edited.questionId } : {}),
        modelId: model.id,
        dayId: day.id,
        prompt: prompt.trim(),
        options: toChoiceOptions(rows),
        sortOrder: edited ? edited.sortOrder : nextAudienceSortOrder(questions, model.id),
      });
      if (!saved.ok) return setMessage({ tone: "error", text: interactionCodeText(saved.code) });
      const savedId = saved.id ?? edited?.questionId;
      if (publish && savedId) {
        const published = await actions.publishQuestion(savedId);
        setMessage(published.ok
          ? { tone: "ok", text: a.savedAndPublished }
          : { tone: "error", text: fmt(a.savedPublishFailed, { reason: interactionCodeText(published.code) }) });
      } else {
        setMessage({ tone: "ok", text: edited ? a.updated : dict.questionSaved });
      }
      setPrompt("");
      setRows(emptyOptionRows());
      setShowProblems(false);
      onEditDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <form id={formId} className="grid gap-4" onSubmit={(event) => { event.preventDefault(); void save(false); }} aria-label={editing ? a.formEditTitle : a.formTitle}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{editing ? a.formEditTitle : a.formTitle}</h3>
        {editing ? <button type="button" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")} onClick={onEditDone}>{a.cancelEdit}</button> : null}
      </div>
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <AdminHierarchyPicker
          mode="select"
          data={pickData}
          value={{ modelId: model?.id }}
          onChange={(next) => onPick({ modelId: next.modelId ?? null })}
          label={dict.fieldModel}
          required
        />
        <label className="grid min-w-0 content-start gap-1.5 text-xs font-semibold">{dict.fieldDay}
          <select value={day?.id ?? ""} onChange={(event) => onPick({ dayId: event.target.value || null })} className={adminFieldClass}>
            {days.map((row) => <option key={row.id} value={row.id}>{audienceDayTiming(row, now).today ? `${row.label} (${a.matrixToday})` : row.label}</option>)}
          </select>
        </label>
      </div>
      <div role="status" aria-live="polite">{quota ? <QuotaPanel quota={quota} dayLabel={dayLabel} /> : null}</div>
      <label className="grid gap-1.5 text-sm font-semibold">{dict.questionPrompt}
        <input
          ref={promptRef}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={300}
          autoComplete="off"
          aria-invalid={showProblems && promptMissing ? true : undefined}
          className={cn(adminFieldClass, showProblems && promptMissing && "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)]")}
        />
        {showProblems && promptMissing ? <span className="text-xs font-semibold text-[var(--admin-danger)]">{a.promptEmpty}</span> : null}
      </label>
      <AdminOptionRows label={a.optionsLabel} value={rows} onChange={setRows} showProblems={showProblems} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={adminSecondaryButtonClass} disabled={pending || Boolean(draftBlock)}>{dict.questionSave}</button>
        <button type="button" className={adminPrimaryButtonClass} disabled={pending || Boolean(publishBlock)} onClick={() => void save(true)}>
          <Send className="size-4" aria-hidden="true" />{a.saveAndPublish}
        </button>
      </div>
      <Feedback message={message} />
    </form>
  );
}

// -----------------------------------------------------------------------------
// Coverage matrix: model × day (published / quota)
// -----------------------------------------------------------------------------

function cellClass(cell: AudienceMatrixCell, selected: boolean) {
  return cn(
    "inline-flex min-h-10 w-full min-w-16 flex-col items-center justify-center rounded-lg border px-2 py-1 text-sm font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]",
    cell.highlight ? "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]"
      : cell.state === "full" ? "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]"
        : cell.state === "empty" ? "border-dashed border-[var(--admin-border)] text-[var(--admin-text-muted)]"
          : "border-[var(--admin-border)] bg-[var(--admin-surface)]",
    selected && "ring-2 ring-[var(--admin-ink)] ring-offset-1",
  );
}

function Legend() {
  const swatch = (className: string, label: string) => (
    <span className="inline-flex items-center gap-1.5"><span className={cn("size-3 rounded-sm border", className)} aria-hidden="true" />{label}</span>
  );
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--admin-text-muted)]">
      {swatch("border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)]", a.legendEmpty)}
      {swatch("border-[var(--admin-border)] bg-[var(--admin-surface)]", a.legendPartial)}
      {swatch("border-[var(--admin-success-border)] bg-[var(--admin-success-soft)]", a.legendFull)}
    </p>
  );
}

export function AudienceMatrix({ rows, models, days, now, selected, onOpen }: {
  rows: readonly AudienceMatrixRow[];
  models: ReadonlyMap<string, InteractionModel>;
  days: readonly InteractionDay[];
  now: number;
  selected: { modelId?: string; dayId?: string };
  onOpen: (modelId: string, dayId: string) => void;
}) {
  const gaps = audienceMatrixGaps(rows);
  return (
    <div className="grid min-w-0 gap-3" data-admin-matrix="audience">
      <p className="text-sm text-[var(--admin-text-muted)]">{a.matrixHelp}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold" role="status">{gaps ? fmt(a.matrixGaps, { count: gaps }) : a.matrixNoGaps}</p>
        <Legend />
      </div>
      <div className="min-w-0 overflow-x-auto rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] md:max-h-[70vh] md:overflow-y-auto">
        <table className="w-full min-w-[30rem] border-collapse text-left text-sm">
          <caption className="sr-only">{a.matrixTitle}</caption>
          <thead className="sticky top-0 z-10 bg-[var(--admin-surface-strong)]">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-[var(--admin-surface-strong)] px-3 py-2 text-xs font-semibold">{a.matrixModel}</th>
              {days.map((day) => {
                const { today } = audienceDayTiming(day, now);
                return (
                  <th key={day.id} scope="col" className={cn("px-2 py-2 text-center text-xs font-semibold whitespace-nowrap", today && "bg-[var(--admin-surface-muted)]")}>
                    {day.label}
                    {today ? <span className="ml-1.5 rounded-full border border-[var(--admin-border)] px-1.5 py-0.5 text-[0.65rem] uppercase">{a.matrixToday}</span> : null}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const model = models.get(row.modelId);
              if (!model) return null;
              return (
                <tr key={row.modelId} className="border-t border-[var(--admin-border)]">
                  <th scope="row" className="sticky left-0 z-[1] max-w-56 bg-[var(--admin-surface-strong)] px-3 py-2 font-normal">
                    <span className="block font-semibold break-words">{model.name}</span>
                    <Meta>{`${model.brandName} · ${dict.tiers[row.quotaTier]}`}</Meta>
                  </th>
                  {row.cells.map((cell, index) => {
                    const day = days[index];
                    if (cell.state === "none") {
                      return (
                        <td key={cell.dayId} className="px-2 py-1.5 text-center text-xs text-[var(--admin-text-muted)]">
                          <span aria-hidden="true">—</span><span className="sr-only">{a.matrixNone}</span>
                        </td>
                      );
                    }
                    const isSelected = selected.modelId === row.modelId && selected.dayId === cell.dayId;
                    return (
                      <td key={cell.dayId} className={cn("px-2 py-1.5", cell.today && "bg-[var(--admin-surface-muted)]")}>
                        <button
                          type="button"
                          data-cell-state={cell.highlight ? "highlight" : cell.state}
                          aria-pressed={isSelected}
                          aria-label={fmt(a.matrixCellAria, { model: model.name, day: day.label, used: cell.used, limit: cell.limit })}
                          className={cellClass(cell, isSelected)}
                          onClick={() => onOpen(row.modelId, cell.dayId)}
                        >
                          <span>{cell.used}/{cell.limit}</span>
                          {cell.drafts ? <span className="text-[0.65rem] font-normal">{fmt(a.matrixDrafts, { count: cell.drafts })}</span> : null}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// The view
// -----------------------------------------------------------------------------

export type EventAudienceViewProps = {
  view: InteractionsView | undefined;
  actions: InteractionsActions | undefined;
  now: number;
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  /** Izlagači 2026: on one exhibitor's page (`view` holds only its cars) — no exhibitor filter. */
  scoped?: boolean;
};

export function EventAudienceView({ view, actions, ...rest }: EventAudienceViewProps) {
  if (!view || !actions) return <InteractionsUnavailable />;
  return <Audience view={view} actions={actions} {...rest} />;
}

function Audience({ view, actions, now, query, onQueryChange, scoped = false }: { view: InteractionsView; actions: InteractionsActions; now: number; query: AdminQueryState; onQueryChange: (patch: AdminQueryPatch) => void; scoped?: boolean }) {
  const [editing, setEditing] = useState<AudienceEditing | null>(null);
  const [formMessage, setFormMessage] = useState<EventMessage>(null);
  const [message, setMessage] = useState<EventMessage>(null);
  const [pending, setPending] = useState(false);
  const promptRef = useRef<HTMLInputElement>(null);
  const formId = "glas-publike-forma";

  const models = useMemo(() => new Map(view.models.map((model) => [model.id, model])), [view.models]);
  const dayByKey = new Map(view.days.map((day) => [day.dateKey, day]));
  const dayId = defaultAudienceDayId(view.days, now, query.dan ? dayByKey.get(query.dan)?.id : undefined);
  const day = view.days.find((row) => row.id === dayId);
  const modelId = query.model && models.has(query.model) ? query.model : undefined;
  const matrix = useMemo(() => audienceMatrix(view.models, view.days, view.questions, now), [view, now]);
  const exhibitorOf = (id: string) => models.get(id)?.exhibitorId;

  const pick = (patch: { modelId?: string | null; dayId?: string | null }) => {
    const next: AdminQueryPatch = {};
    if (patch.modelId !== undefined) next.model = patch.modelId;
    if (patch.dayId !== undefined) next.dan = view.days.find((row) => row.id === patch.dayId)?.dateKey ?? null;
    onQueryChange(next);
  };
  const focusForm = () => {
    document.getElementById(formId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    promptRef.current?.focus({ preventScroll: true });
  };
  const openCell = (cellModelId: string, cellDayId: string) => {
    setEditing(null);
    pick({ modelId: cellModelId, dayId: cellDayId });
    focusForm();
  };
  const edit = (question: InteractionQuestion) => {
    setEditing({ questionId: question.id, modelId: question.modelId, dayId: question.dayId, prompt: question.prompt, options: optionRowsFrom(question.options), sortOrder: question.sortOrder });
    pick({ modelId: question.modelId, dayId: question.dayId });
    focusForm();
  };

  async function run(action: () => Promise<{ ok: true } | { ok: false; code: string }>, success: string) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.ok ? { tone: "ok", text: success } : { tone: "error", text: interactionCodeText(outcome.code) });
    } finally {
      setPending(false);
    }
  }

  // ---- list
  const rows = audienceListRows(view.questions, query, view.days.map((row) => row.id), view.models.map((row) => row.id), exhibitorOf);
  const counts = audienceStatusCounts(view.questions, query.izlagac, exhibitorOf);
  const exhibitors = [...new Map(view.models.map((model) => [model.exhibitorId, model.exhibitorName])).entries()].sort((x, y) => x[1].localeCompare(y[1], "sr-Latn-RS"));
  const facets: AdminFilterFacet[] = [
    { id: "status", label: a.facetStatus, options: AUDIENCE_STATUSES.map((status) => ({ value: AUDIENCE_STATUS_PARAMS[status], label: a.statuses[status], count: counts[status] })) },
    ...(scoped ? [] : [{ id: "izlagac", label: a.facetExhibitor, options: exhibitors.map(([id, name]) => ({ value: id, label: name })) }]),
  ];
  const chips: AdminFilterChip[] = [];
  const statusFilter = audienceStatusFromParam(query.status);
  if (statusFilter) chips.push({ id: "status", label: `${a.facetStatus}: ${a.statuses[statusFilter]}`, onRemove: () => onQueryChange({ status: null }) });
  const exhibitorName = scoped ? undefined : exhibitors.find(([id]) => id === query.izlagac)?.[1];
  if (exhibitorName) chips.push({ id: "izlagac", label: `${a.facetExhibitor}: ${exhibitorName}`, onRemove: () => onQueryChange({ izlagac: null }) });
  const clear = () => onQueryChange(scoped ? { status: null } : { status: null, izlagac: null });
  const dayLabel = (id: string) => view.days.find((row) => row.id === id)?.label ?? "—";

  const columns: AdminColumn<InteractionQuestion>[] = [
    {
      id: "prompt", header: dict.colQuestion, rowHeader: true,
      cell: (question) => <><strong className="block font-semibold break-words">{question.prompt}</strong><Meta>{[...question.options].sort((x, y) => x.order - y.order).map((option) => option.label).join(" · ")}</Meta></>,
    },
    { id: "status", header: dict.colStatus, width: "13rem", cell: (question) => <span className="flex flex-wrap gap-1.5"><AudienceStatusBadges question={question} /></span> },
  ];

  const rowActions = (question: InteractionQuestion): ReactNode => {
    const model = models.get(question.modelId);
    if (!model) return null;
    const quota = audienceQuota(model, question.dayId, view.questions, now);
    const publishBlock = audiencePublishBlock(quota);
    const status = audienceDisplayStatus(question);
    return (
      <span className="flex flex-wrap items-center justify-end gap-2">
        {question.status === "draft" ? (
          <>
            <button type="button" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")} disabled={pending} aria-label={fmt(a.editAria, { prompt: question.prompt })} onClick={() => edit(question)}>
              <Pencil className="size-4" aria-hidden="true" />{a.edit}
            </button>
            <button
              type="button"
              className={cn(adminPrimaryButtonClass, "min-h-9 px-3")}
              disabled={pending || Boolean(publishBlock)}
              title={publishBlock ? blockText(publishBlock, quota, dayLabel(question.dayId)) : undefined}
              onClick={() => void run(() => actions.publishQuestion(question.id), dict.questionPublished)}
            >
              {dict.questionPublish}
            </button>
            {publishBlock ? <span className="w-full text-right text-xs font-semibold text-[var(--admin-warning)]">{publishBlock === "day_limit" ? a.publishBlockedShort : blockText(publishBlock, quota, dayLabel(question.dayId))}</span> : null}
          </>
        ) : null}
        {/* JOVAN-DELTA 2026-10-08b: open before its fair day (setup day, exhibitor demo). */}
        {actions.openQuestionNow && (question.status === "draft" ? !publishBlock : question.status === "published" && (question.startsAt ?? 0) > now) ? (
          <button type="button" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")} disabled={pending} onClick={() => void run(() => actions.openQuestionNow!(question.id), dict.questionOpenedNow)}>
            {dict.questionOpenNow}
          </button>
        ) : null}
        {canSetSponsored(question, model, now) ? (
          <button type="button" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")} disabled={pending} onClick={() => void run(() => actions.setSponsoredResult(question.modelId, question.id), a.sponsoredSet)}>
            <Sparkles className="size-4" aria-hidden="true" />{a.setSponsored}
          </button>
        ) : null}
        {question.showOnSponsoredRotation ? (
          <button type="button" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")} disabled={pending} onClick={() => void run(() => actions.setSponsoredResult(question.modelId, null), a.sponsoredCleared)}>
            {a.clearSponsored}
          </button>
        ) : null}
        {status === "published" || status === "sponsored" ? (
          <ConfirmAction label={dict.questionClose} body={a.closeConfirm} disabled={pending} onConfirm={() => void run(() => actions.closeQuestion(question.id), dict.questionClosed)} />
        ) : null}
      </span>
    );
  };

  const groupLabel = (key: string, groupRows: readonly InteractionQuestion[]) => {
    const first = groupRows[0];
    const model = models.get(first.modelId);
    const quota = model ? audienceQuota(model, first.dayId, view.questions, now) : null;
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span>{fmt(a.groupLabel, { day: dayLabel(first.dayId), model: model?.name ?? "—" })}</span>
        {model ? <span className="text-xs font-normal text-[var(--admin-text-muted)]">{`${model.brandName} · ${model.exhibitorName}`}</span> : null}
        {quota && quota.limit > 0 ? <AdminStatus label={fmt(a.groupQuota, { used: quota.used, limit: quota.limit })} tone={quota.remaining === 0 ? "active" : "neutral"} className="tabular-nums" /> : null}
      </span>
    );
  };

  const eligible = view.models.some((model) => model.tier !== "included");

  return (
    <div className="grid min-w-0 gap-4">
      <Section title={dict.questionsTitle}>
        <p className="-mt-2 mb-4 max-w-3xl text-sm text-[var(--admin-text-muted)]">{dict.questionsHelp}</p>
        {!view.days.length ? <p className="text-sm text-[var(--admin-text-muted)]">{a.noDays}</p>
          : !eligible ? <AdminEmptyState title={dict.questionsTitle} body={a.noModels} className="min-h-40" />
            : (
              <AudienceForm
                key={editing?.questionId ?? "new"}
                models={view.models}
                days={view.days}
                questions={view.questions}
                now={now}
                modelId={modelId}
                dayId={day?.id}
                onPick={pick}
                actions={actions}
                editing={editing}
                onEditDone={() => setEditing(null)}
                formId={formId}
                promptRef={promptRef}
                message={formMessage}
                setMessage={setFormMessage}
              />
            )}
      </Section>

      {view.days.length && matrix.length ? (
        <Section title={a.matrixTitle}>
          <AudienceMatrix rows={matrix} models={models} days={view.days} now={now} selected={{ modelId, dayId: day?.id }} onOpen={openCell} />
        </Section>
      ) : null}

      <Section title={a.listTitle}>
        <p className="-mt-2 mb-4 max-w-3xl text-sm text-[var(--admin-text-muted)]">{a.sponsoredHelp}</p>
        <div className="grid min-w-0 gap-3">
          {view.questions.length ? (
            <AdminFilterBar label={a.filterLabel} facets={facets} values={query} onFacetChange={(id, next) => onQueryChange({ [id]: next ?? null })} chips={chips} onClear={clear} />
          ) : null}
          <Feedback message={message} />
          <AdminDataView
            listKey="dogadjaji.glas-publike"
            caption={a.listTitle}
            rows={rows}
            getRowId={(question) => question.id}
            columns={columns}
            tableClassName="min-w-[44rem]"
            groupBy={{ key: (question) => `${question.dayId}:${question.modelId}`, label: groupLabel }}
            toolbar={view.questions.length ? <p className="text-sm font-semibold" role="status" aria-live="polite">{fmt(a.listCount, { shown: rows.length, total: view.questions.length })}</p> : undefined}
            empty={view.questions.length ? (
              <div className="grid justify-items-center gap-2 pb-4">
                <AdminEmptyState title={a.noMatchTitle} body={a.noMatchBody} className="min-h-40" />
                <button type="button" onClick={clear} className={adminSecondaryButtonClass}>{adminUiSr.filters.clear}</button>
              </div>
            ) : { title: dict.questionsTitle, body: dict.questionsEmpty }}
            renderCard={(question) => (
              <AdminDataCard
                title={question.prompt}
                subtitle={`${models.get(question.modelId)?.name ?? "—"} · ${dayLabel(question.dayId)}`}
                badges={<AudienceStatusBadges question={question} />}
                fields={[{ label: dict.colOptions, value: [...question.options].sort((x, y) => x.order - y.order).map((option) => option.label).join(" · ") }]}
              />
            )}
            rowActions={rowActions}
          />
        </div>
      </Section>
    </div>
  );
}
