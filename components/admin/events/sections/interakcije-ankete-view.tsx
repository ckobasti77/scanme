"use client";

import { ArrowDown, ArrowUp, Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ConfirmAction,
  interactionCodeText,
  InteractionsUnavailable,
  type InteractionModel,
  type InteractionsActions,
  type InteractionSurvey,
  type InteractionsView,
} from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  AdminHierarchyPicker,
  AdminOptionRows,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  optionRowsProblemText,
  type AdminColumn,
} from "@/components/admin/admin-ui";
import { eventDateTime, Feedback, Meta, Section, type EventMessage } from "@/components/admin/events/event-ui";
import { audienceTierNow } from "@/lib/admin-v1/audience-quota";
import { buildHierarchy } from "@/lib/admin-v1/hierarchy";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import {
  addSurveyQuestion,
  moveSurveyQuestion,
  removeSurveyQuestion,
  surveyFormFrom,
  toSurveyQuestionInputs,
  updateSurveyQuestion,
  validateSurveyForm,
  type SurveyFormProblem,
  type SurveyFormQuestion,
} from "@/lib/admin-v1/survey-form";
import { FAIR_SURVEY_MAX_QUESTIONS, type FairSurveyQuestionKind, type FairSurveyStatus } from "@/lib/fair-contract";
import { getFairEntitlements } from "@/lib/fair-entitlements";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Admin UX A6 — `interakcije/ankete` (MASTER §9.2): only Advanced models
// (the others are in the picker but disabled, with the reason), up to five
// questions, each Da/Ne or "Izbor jednog odgovora" with options as dynamic
// rows; draft → publish (a version) → retire, and the list of versions. A
// published or retired version never changes: the form edits the model's
// draft, or starts the next version from the latest one.

const f = dict.surveyForm;
const KINDS: readonly FairSurveyQuestionKind[] = ["yes_no", "single_choice"];
const iconButton = "inline-flex size-10 shrink-0 items-center justify-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]";

export function SurveyStatusBadge({ status }: { status: FairSurveyStatus }) {
  return <AdminStatus label={dict.surveyStatus[status]} tone={status === "published" ? "active" : status === "draft" ? "neutral" : "muted"} />;
}

/** Survey rights of the tier in force now (lib/fair-entitlements: only Napredni). */
function surveyEntitled(model: InteractionModel, now: number) {
  return getFairEntitlements(audienceTierNow(model, now)).survey;
}

function problemText(problem: SurveyFormProblem, questions: readonly SurveyFormQuestion[]) {
  const n = (id: string) => questions.findIndex((question) => question.id === id) + 1;
  switch (problem.kind) {
    case "too_many": return fmt(f.maxReached, { max: problem.max });
    case "prompt_empty": return fmt(f.promptEmpty, { n: n(problem.questionId) });
    case "options": return fmt(f.optionsProblem, { n: n(problem.questionId), problem: problem.problems.map(optionRowsProblemText).join(" ") });
  }
}

/** Versions of one model, newest first. */
function modelVersions(surveys: readonly InteractionSurvey[], modelId: string) {
  return surveys.filter((survey) => survey.modelId === modelId).sort((a, b) => b.version - a.version);
}

// -----------------------------------------------------------------------------
// Editor of one model's draft / next version
// -----------------------------------------------------------------------------

function SurveyEditor({ model, versions, actions, setMessage }: {
  model: InteractionModel;
  versions: readonly InteractionSurvey[];
  actions: InteractionsActions;
  setMessage: (message: EventMessage) => void;
}) {
  const draft = versions.find((survey) => survey.status === "draft");
  const base = draft ?? versions[0];
  const nextVersion = (versions[0]?.version ?? 0) + 1;
  const [questions, setQuestions] = useState<SurveyFormQuestion[]>(() => surveyFormFrom(base?.questions ?? []));
  const [showProblems, setShowProblems] = useState(false);
  const [pending, setPending] = useState(false);
  const problems = validateSurveyForm(questions);
  const intro = draft ? fmt(f.editingDraft, { version: draft.version }) : base ? fmt(f.newFromPublished, { version: nextVersion, from: base.version }) : f.newFirst;

  async function save(publish: boolean) {
    setShowProblems(true);
    setMessage(null);
    if (problems.length) return;
    setPending(true);
    try {
      const saved = await actions.saveSurveyDraft(model.id, toSurveyQuestionInputs(questions));
      if (!saved.ok) return setMessage({ tone: "error", text: interactionCodeText(saved.code) });
      const surveyId = saved.id ?? draft?.id;
      if (publish && surveyId) {
        const published = await actions.publishSurvey(surveyId);
        setMessage(published.ok ? { tone: "ok", text: dict.surveyPublished } : { tone: "error", text: fmt(f.savedPublishFailed, { reason: interactionCodeText(published.code) }) });
      } else {
        setMessage({ tone: "ok", text: dict.surveySaved });
      }
      setShowProblems(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-4" aria-label={f.versionsTitle} onSubmit={(event) => { event.preventDefault(); void save(false); }}>
      <p className="rounded-[var(--admin-radius-control)] border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3 text-sm font-semibold" role="status">{intro}</p>
      <ol className="grid gap-3">
        {questions.map((question, index) => {
          const n = index + 1;
          const promptMissing = showProblems && !question.prompt.trim();
          return (
            <li key={question.id}>
              <fieldset className="grid min-w-0 gap-3 rounded-xl border border-[var(--admin-border)] p-3 sm:p-4">
                <legend className="px-1 text-sm font-semibold">{fmt(f.questionLabel, { n })}</legend>
                <div className="flex min-w-0 flex-wrap items-end gap-2 sm:flex-nowrap">
                  <label className="grid w-full min-w-0 gap-1.5 text-xs font-semibold sm:w-auto sm:flex-1">{f.promptLabel}
                    <input
                      value={question.prompt}
                      onChange={(event) => setQuestions((rows) => updateSurveyQuestion(rows, question.id, { prompt: event.target.value }))}
                      maxLength={300}
                      autoComplete="off"
                      aria-invalid={promptMissing || undefined}
                      className={cn(adminFieldClass, promptMissing && "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)]")}
                    />
                  </label>
                  <button type="button" className={iconButton} disabled={index === 0} aria-label={fmt(f.moveUp, { n })} onClick={() => setQuestions((rows) => moveSurveyQuestion(rows, question.id, -1))}><ArrowUp className="size-4" aria-hidden="true" /></button>
                  <button type="button" className={iconButton} disabled={index === questions.length - 1} aria-label={fmt(f.moveDown, { n })} onClick={() => setQuestions((rows) => moveSurveyQuestion(rows, question.id, 1))}><ArrowDown className="size-4" aria-hidden="true" /></button>
                  <button type="button" className={iconButton} disabled={questions.length <= 1} aria-label={fmt(f.remove, { n })} onClick={() => setQuestions((rows) => removeSurveyQuestion(rows, question.id))}><Trash2 className="size-4" aria-hidden="true" /></button>
                </div>
                <fieldset className="grid gap-1.5">
                  <legend className="mb-1.5 text-xs font-semibold">{f.kindLabel}</legend>
                  <div className="flex flex-wrap gap-2">
                    {KINDS.map((kind) => (
                      <label key={kind} className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--admin-focus,var(--admin-ink))]", question.kind === kind ? "border-[var(--admin-ink)] bg-[var(--admin-surface-strong)]" : "border-[var(--admin-border)]")}>
                        <input type="radio" name={`${question.id}-kind`} value={kind} checked={question.kind === kind} onChange={() => setQuestions((rows) => updateSurveyQuestion(rows, question.id, { kind }))} className="size-4 accent-[var(--admin-ink)]" />
                        {dict.surveyKinds[kind]}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {question.kind === "single_choice" ? (
                  <AdminOptionRows label={f.optionsLabel} value={question.options} onChange={(options) => setQuestions((rows) => updateSurveyQuestion(rows, question.id, { options }))} showProblems={showProblems} />
                ) : null}
              </fieldset>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={adminSecondaryButtonClass} disabled={questions.length >= FAIR_SURVEY_MAX_QUESTIONS} onClick={() => setQuestions((rows) => addSurveyQuestion(rows))}>
          <Plus className="size-4" aria-hidden="true" />{f.add}
        </button>
        <span className="text-xs font-semibold text-[var(--admin-text-muted)]" aria-live="polite">
          {questions.length >= FAIR_SURVEY_MAX_QUESTIONS ? fmt(f.maxReached, { max: FAIR_SURVEY_MAX_QUESTIONS }) : fmt(f.count, { count: questions.length, max: FAIR_SURVEY_MAX_QUESTIONS })}
        </span>
      </div>
      {showProblems && problems.length ? (
        <ul role="status" className="grid gap-1 rounded-[var(--admin-radius-control)] border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 text-sm font-semibold">
          {problems.map((problem, index) => <li key={index}>{problemText(problem, questions)}</li>)}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={adminSecondaryButtonClass} disabled={pending}>{dict.surveySave}</button>
        <button type="button" className={adminPrimaryButtonClass} disabled={pending} onClick={() => void save(true)}>
          <Send className="size-4" aria-hidden="true" />{f.saveAndPublish}
        </button>
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// The view
// -----------------------------------------------------------------------------

export type EventSurveysViewProps = {
  view: InteractionsView | undefined;
  actions: InteractionsActions | undefined;
  now: number;
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
};

export function EventSurveysView({ view, actions, ...rest }: EventSurveysViewProps) {
  if (!view || !actions) return <InteractionsUnavailable />;
  return <Surveys view={view} actions={actions} {...rest} />;
}

function Surveys({ view, actions, now, query, onQueryChange }: { view: InteractionsView; actions: InteractionsActions; now: number; query: AdminQueryState; onQueryChange: (patch: AdminQueryPatch) => void }) {
  const [formMessage, setFormMessage] = useState<EventMessage>(null);
  const [message, setMessage] = useState<EventMessage>(null);
  const [pending, setPending] = useState(false);
  const models = useMemo(() => new Map(view.models.map((model) => [model.id, model])), [view.models]);
  const picked = query.model ? models.get(query.model) : undefined;
  const model = picked && surveyEntitled(picked, now) ? picked : undefined;
  const anyAdvanced = view.models.some((row) => surveyEntitled(row, now));

  const pickData = useMemo(() => buildHierarchy(view.models.map((row) => ({
    id: row.id,
    label: row.name,
    sublabel: `${row.brandName} · ${row.exhibitorName} · ${dict.tiers[row.tier]}`,
    exhibitorId: row.exhibitorId,
    exhibitorLabel: row.exhibitorName,
    brandId: row.brandId,
    brandLabel: row.brandName,
    searchTerms: [row.externalKey],
    ...(surveyEntitled(row, now) ? {}
      : row.tier === "advanced" && row.packageActivatedAt > now ? { disabledReason: fmt(f.pickPending, { date: eventDateTime.format(row.packageActivatedAt) }) }
        : { disabledReason: f.pickNotAdvanced }),
  }))), [view.models, now]);

  const versions = model ? modelVersions(view.surveys, model.id) : [];
  const editorKey = model ? `${model.id}:${versions.find((survey) => survey.status === "draft")?.id ?? `v${versions[0]?.version ?? 0}`}` : "none";

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

  const modelOrder = new Map(view.models.map((row, index) => [row.id, index]));
  const rows = [...view.surveys].sort((a, b) => (modelOrder.get(a.modelId) ?? 0) - (modelOrder.get(b.modelId) ?? 0) || b.version - a.version);
  const modelName = (id: string) => models.get(id)?.name ?? "—";
  const prompts = (survey: InteractionSurvey) => [...survey.questions].sort((a, b) => a.order - b.order).map((question) => question.prompt).join(" · ");
  const columns: AdminColumn<InteractionSurvey>[] = [
    { id: "version", header: dict.colVersion, rowHeader: true, width: "8rem", cell: (survey) => <strong className="font-semibold tabular-nums">{fmt(f.versionLabel, { version: survey.version })}</strong> },
    { id: "questions", header: dict.colQuestions, cell: (survey) => <><span className="font-semibold tabular-nums">{fmt(f.count, { count: survey.questions.length, max: FAIR_SURVEY_MAX_QUESTIONS })}</span><Meta>{prompts(survey)}</Meta></> },
    { id: "status", header: dict.colStatus, width: "9rem", cell: (survey) => <SurveyStatusBadge status={survey.status} /> },
  ];

  return (
    <div className="grid min-w-0 gap-4">
      <Section title={dict.surveysTitle}>
        <p className="-mt-2 mb-4 max-w-3xl text-sm text-[var(--admin-text-muted)]">{dict.surveysHelp}</p>
        {anyAdvanced ? (
          <div className="grid min-w-0 gap-4">
            <div className="max-w-2xl">
              <AdminHierarchyPicker mode="select" data={pickData} value={{ modelId: model?.id }} onChange={(next) => onQueryChange({ model: next.modelId ?? null })} label={f.modelLabel} required />
            </div>
            {model ? (
              <SurveyEditor key={editorKey} model={model} versions={versions} actions={actions} setMessage={setFormMessage} />
            ) : <p className="text-sm text-[var(--admin-text-muted)]">{f.pickPrompt}</p>}
            <Feedback message={formMessage} />
          </div>
        ) : <AdminEmptyState title={f.noAdvancedTitle} body={f.noAdvancedBody} className="min-h-40" />}
      </Section>
      <Section title={f.versionsTitle}>
        <div className="grid min-w-0 gap-3">
          <Feedback message={message} />
          <AdminDataView
            listKey="dogadjaji.ankete"
            caption={f.versionsTitle}
            rows={rows}
            getRowId={(survey) => survey.id}
            columns={columns}
            tableClassName="min-w-[40rem]"
            groupBy={{
              key: (survey) => survey.modelId,
              label: (modelId, group) => (
                <span className="flex flex-wrap items-center gap-2">
                  <span>{modelName(modelId)}</span>
                  <span className="text-xs font-normal text-[var(--admin-text-muted)]">{`${models.get(modelId)?.brandName ?? "—"} · ${fmt(f.versionsCount, { count: group.length })}`}</span>
                </span>
              ),
            }}
            empty={{ title: dict.surveysTitle, body: dict.surveysEmpty }}
            renderCard={(survey) => (
              <AdminDataCard
                title={fmt(f.versionLabel, { version: survey.version })}
                subtitle={modelName(survey.modelId)}
                badges={<SurveyStatusBadge status={survey.status} />}
                fields={[{ label: dict.colQuestions, value: prompts(survey) || "—" }]}
              />
            )}
            rowActions={(survey) => (
              <span className="flex flex-wrap items-center justify-end gap-2">
                {survey.modelId !== model?.id && models.get(survey.modelId) && surveyEntitled(models.get(survey.modelId)!, now) ? (
                  <button type="button" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")} aria-label={fmt(f.openAria, { model: modelName(survey.modelId) })} onClick={() => onQueryChange({ model: survey.modelId })}>{f.open}</button>
                ) : null}
                {survey.status === "draft" ? (
                  <button type="button" className={cn(adminPrimaryButtonClass, "min-h-9 px-3")} disabled={pending} onClick={() => void run(() => actions.publishSurvey(survey.id), dict.surveyPublished)}>{dict.surveyPublish}</button>
                ) : null}
                {survey.status === "published" ? (
                  <ConfirmAction label={dict.surveyRetire} body={f.retireConfirm} disabled={pending} onConfirm={() => void run(() => actions.retireSurvey(survey.id), dict.surveyRetired)} />
                ) : null}
              </span>
            )}
          />
        </div>
      </Section>
    </div>
  );
}
