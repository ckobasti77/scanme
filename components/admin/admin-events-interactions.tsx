"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import {
  FAIR_SURVEY_MAX_QUESTIONS,
  type FairAudienceQuestionStatus,
  type FairPackageTier,
  type FairPassportConfigStatus,
  type FairPassportEligibleStatus,
  type FairSurveyQuestionKind,
  type FairSurveyStatus,
} from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import type { AdminEventsPassportProblem } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

// Sajam 2026 B3 — the `Interakcije` section of the admin `Događaji` tab:
// Glas publike questions (draft → publish → close, the one sponsored result),
// Advanced survey versions and brand passports (prepare → freeze/publish,
// emergency removal, withdraw). Presentational only; data and actions come
// from AdminEventsWorkspace (requireAdmin functions in
// convex/fairInteractionsAdmin.ts). No visitor data and no rating aggregate.

export type InteractionOutcome = { ok: true; problem?: string | null } | { ok: false; code: string };

export type InteractionModel = { id: string; name: string; brandName: string; tier: FairPackageTier };
export type InteractionQuestion = {
  id: string;
  modelId: string;
  dayLabel: string;
  prompt: string;
  options: { id: string; label: string; order: number }[];
  status: FairAudienceQuestionStatus;
  sortOrder: number;
  showOnSponsoredRotation: boolean;
};
export type InteractionSurvey = { id: string; modelId: string; version: number; status: FairSurveyStatus; questionCount: number };
export type InteractionPassport = {
  id: string | null;
  brandId: string;
  brandName: string;
  status: FairPassportConfigStatus | null;
  frozenAt?: number;
  members: { modelId: string; modelName: string; status: FairPassportEligibleStatus }[];
};

export type InteractionsView = {
  models: InteractionModel[];
  days: { id: string; label: string }[];
  questions: InteractionQuestion[];
  surveys: InteractionSurvey[];
  passports: InteractionPassport[];
};

export type SurveyQuestionInput = { id: string; prompt: string; kind: FairSurveyQuestionKind; options: { id: string; label: string; order: number }[]; required: boolean; order: number };

export type InteractionsActions = {
  saveQuestion: (input: { modelId: string; dayId: string; prompt: string; options: { id: string; label: string; order: number }[]; sortOrder: number }) => Promise<InteractionOutcome>;
  publishQuestion: (questionId: string) => Promise<InteractionOutcome>;
  closeQuestion: (questionId: string) => Promise<InteractionOutcome>;
  setSponsoredResult: (modelId: string, questionId: string | null) => Promise<InteractionOutcome>;
  saveSurveyDraft: (modelId: string, questions: SurveyQuestionInput[]) => Promise<InteractionOutcome>;
  publishSurvey: (surveyId: string) => Promise<InteractionOutcome>;
  retireSurvey: (surveyId: string) => Promise<InteractionOutcome>;
  openPassport: (brandId: string) => Promise<InteractionOutcome>;
  publishPassport: (passportId: string) => Promise<InteractionOutcome>;
  withdrawPassport: (passportId: string) => Promise<InteractionOutcome>;
  removePassportModel: (passportId: string, modelId: string) => Promise<InteractionOutcome>;
};

export const field = "min-h-11 w-full min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";
export const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 text-sm font-semibold text-[var(--admin-on-ink)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";
export const secondaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";

export const dateTime = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Belgrade" });

type Message = { tone: "ok" | "error"; text: string } | null;

function codeText(code: string) {
  if (code === "ACTION_FAILED") return dict.actionFailed;
  return code in dict.issues ? dict.issues[code as keyof typeof dict.issues] : fmt(dict.unknownIssue, { code });
}

/** Lines → options with stable ids o1…o5 (ids are what votes store). */
function linesToOptions(text: string) {
  return text.split("\n").map((line) => line.trim()).filter(Boolean).map((label, index) => ({ id: `o${index + 1}`, label, order: index + 1 }));
}

export function useRunner() {
  const [message, setMessage] = useState<Message>(null);
  const [pending, setPending] = useState(false);
  async function run(action: () => Promise<InteractionOutcome>, success: string, after?: () => void) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      if (outcome.ok) {
        const problem = outcome.problem && outcome.problem in dict.passportProblems ? dict.passportProblems[outcome.problem as AdminEventsPassportProblem] : null;
        setMessage({ tone: "ok", text: problem ? `${success} ${problem}` : success });
        after?.();
      } else {
        setMessage({ tone: "error", text: codeText(outcome.code) });
      }
    } finally {
      setPending(false);
    }
  }
  return { message, pending, run };
}

export function Feedback({ message }: { message: Message }) {
  return (
    <div role="status" aria-live="polite">
      {message ? (
        <p className={cn("mt-3 rounded-xl border p-3 text-sm font-semibold", message.tone === "ok" ? "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)]" : "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)]")}>{message.text}</p>
      ) : null}
    </div>
  );
}

export function Section({ title, help, children }: { title: string; help: string; children: ReactNode }) {
  return (
    <AdminPanel className="min-w-0 p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-[-0.025em]">{title}</h2>
      <p className="mt-1 mb-4 max-w-3xl text-sm text-[var(--admin-text-muted)]">{help}</p>
      {children}
    </AdminPanel>
  );
}

export function RowList({ children }: { children: ReactNode }) {
  return <ul className="mt-4 grid divide-y divide-[var(--admin-border)] overflow-hidden rounded-[var(--admin-radius-control)] border border-[var(--admin-border)]">{children}</ul>;
}

export function Row({ children }: { children: ReactNode }) {
  return <li className="grid min-w-0 gap-2 bg-[var(--admin-surface)] px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">{children}</li>;
}

export function Meta({ children }: { children: ReactNode }) {
  return <span className="block break-words text-xs text-[var(--admin-text-muted)]">{children}</span>;
}

/** A destructive button that needs a second, explicit confirmation. */
export function ConfirmAction({ label, body, disabled, onConfirm }: { label: string; body: string; disabled: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={secondaryButton} disabled={disabled} onClick={() => setOpen(true)}>{label}</button>;
  return (
    <span className="grid gap-2 rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3 sm:max-w-sm">
      <span className="text-sm">{body}</span>
      <span className="flex flex-wrap gap-2">
        <button type="button" autoFocus className={primaryButton} disabled={disabled} onClick={() => { setOpen(false); onConfirm(); }}>{dict.confirm}</button>
        <button type="button" className={secondaryButton} onClick={() => setOpen(false)}>{dict.cancel}</button>
      </span>
    </span>
  );
}

// -----------------------------------------------------------------------------
// Glas publike
// -----------------------------------------------------------------------------

function Questions({ view, actions }: { view: InteractionsView; actions: InteractionsActions }) {
  const { message, pending, run } = useRunner();
  const eligible = view.models.filter((model) => model.tier !== "included");
  const [modelId, setModelId] = useState("");
  const [dayId, setDayId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [optionText, setOptionText] = useState("");
  const names = new Map(view.models.map((model) => [model.id, model]));
  const chosenModel = modelId || eligible[0]?.id || "";
  const chosenDay = dayId || view.days[0]?.id || "";
  const parsed = linesToOptions(optionText);
  const canSave = Boolean(chosenModel && chosenDay && prompt.trim() && parsed.length >= 2 && parsed.length <= 5);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    const sortOrder = view.questions.filter((row) => row.modelId === chosenModel).reduce((max, row) => Math.max(max, row.sortOrder), 0) + 1;
    void run(() => actions.saveQuestion({ modelId: chosenModel, dayId: chosenDay, prompt: prompt.trim(), options: parsed, sortOrder }), dict.questionSaved, () => { setPrompt(""); setOptionText(""); });
  }

  return (
    <Section title={dict.questionsTitle} help={dict.questionsHelp}>
      {eligible.length && view.days.length ? (
        <form className="grid gap-3 lg:grid-cols-2" onSubmit={submit}>
          <label className="grid gap-1.5 text-sm font-semibold">{dict.fieldModel}
            <select value={chosenModel} onChange={(event) => setModelId(event.target.value)} className={field}>
              {eligible.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.brandName} · {dict.tiers[model.tier]}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold">{dict.fieldDay}
            <select value={chosenDay} onChange={(event) => setDayId(event.target.value)} className={field}>
              {view.days.map((day) => <option key={day.id} value={day.id}>{day.label}</option>)}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold lg:col-span-2">{dict.questionPrompt}
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={300} className={field} />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold lg:col-span-2">{dict.questionOptions}
            <textarea value={optionText} onChange={(event) => setOptionText(event.target.value)} rows={4} className={cn(field, "py-2")} />
          </label>
          <div><button type="submit" className={primaryButton} disabled={pending || !canSave}>{dict.questionSave}</button></div>
        </form>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.questionsNoModels}</p>}
      <Feedback message={message} />
      {view.questions.length ? (
        <RowList>
          {view.questions.map((question) => {
            const model = names.get(question.modelId);
            const advanced = model?.tier === "advanced";
            return (
              <Row key={question.id}>
                <span className="min-w-0">
                  <strong className="block break-words text-sm">{question.prompt}</strong>
                  <Meta>{model ? `${model.name} · ${model.brandName}` : "—"} · {question.dayLabel}</Meta>
                  <Meta>{question.options.map((option) => option.label).join(" · ")}</Meta>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <AdminStatus label={dict.questionStatus[question.status]} tone={question.status === "published" ? "active" : question.status === "draft" ? "waiting" : "neutral"} />
                  {question.showOnSponsoredRotation ? <AdminStatus label={dict.questionRotationOn} tone="active" /> : null}
                  {question.status === "draft" ? <button type="button" className={primaryButton} disabled={pending} onClick={() => void run(() => actions.publishQuestion(question.id), dict.questionPublished)}>{dict.questionPublish}</button> : null}
                  {question.status === "published" ? <button type="button" className={secondaryButton} disabled={pending} onClick={() => void run(() => actions.closeQuestion(question.id), dict.questionClosed)}>{dict.questionClose}</button> : null}
                  {advanced && question.status !== "draft" ? (
                    <button type="button" className={secondaryButton} disabled={pending} onClick={() => void run(() => actions.setSponsoredResult(question.modelId, question.showOnSponsoredRotation ? null : question.id), dict.questionRotationSet)}>
                      {question.showOnSponsoredRotation ? dict.questionRotationClear : dict.questionRotationAdd}
                    </button>
                  ) : null}
                </span>
              </Row>
            );
          })}
        </RowList>
      ) : <p className="mt-4 text-sm text-[var(--admin-text-muted)]">{dict.questionsEmpty}</p>}
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Survey
// -----------------------------------------------------------------------------

type DraftQuestion = { prompt: string; kind: FairSurveyQuestionKind; optionText: string };
const emptyDraft = (): DraftQuestion => ({ prompt: "", kind: "yes_no", optionText: "" });

function Surveys({ view, actions }: { view: InteractionsView; actions: InteractionsActions }) {
  const { message, pending, run } = useRunner();
  const advanced = view.models.filter((model) => model.tier === "advanced");
  const [modelId, setModelId] = useState("");
  const [draft, setDraft] = useState<DraftQuestion[]>([emptyDraft()]);
  const names = new Map(view.models.map((model) => [model.id, model]));
  const chosenModel = modelId || advanced[0]?.id || "";
  const questions: SurveyQuestionInput[] = draft.map((row, index) => ({
    id: `q${index + 1}`,
    prompt: row.prompt.trim(),
    kind: row.kind,
    options: row.kind === "yes_no" ? [] : linesToOptions(row.optionText),
    required: false,
    order: index + 1,
  }));
  const canSave = Boolean(chosenModel) && questions.every((row) => row.prompt && (row.kind === "yes_no" || (row.options.length >= 2 && row.options.length <= 5)));
  const update = (index: number, patch: Partial<DraftQuestion>) => setDraft((rows) => rows.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <Section title={dict.surveysTitle} help={dict.surveysHelp}>
      {advanced.length ? (
        <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); if (canSave) void run(() => actions.saveSurveyDraft(chosenModel, questions), dict.surveySaved, () => setDraft([emptyDraft()])); }}>
          <label className="grid gap-1.5 text-sm font-semibold sm:max-w-md">{dict.fieldModel}
            <select value={chosenModel} onChange={(event) => setModelId(event.target.value)} className={field}>
              {advanced.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.brandName}</option>)}
            </select>
          </label>
          {draft.map((row, index) => (
            <fieldset key={index} className="grid gap-3 rounded-xl border border-[var(--admin-border)] p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)]">
              <legend className="px-1 text-sm font-semibold">{fmt(dict.surveyQuestionLabel, { n: index + 1 })}</legend>
              <label className="grid gap-1.5 text-sm font-semibold">{dict.questionPrompt}
                <input value={row.prompt} onChange={(event) => update(index, { prompt: event.target.value })} maxLength={300} className={field} />
              </label>
              <label className="grid gap-1.5 text-sm font-semibold">{dict.surveyKind}
                <select value={row.kind} onChange={(event) => update(index, { kind: event.target.value as FairSurveyQuestionKind })} className={field}>
                  <option value="yes_no">{dict.surveyKinds.yes_no}</option>
                  <option value="single_choice">{dict.surveyKinds.single_choice}</option>
                </select>
              </label>
              {row.kind === "single_choice" ? (
                <label className="grid gap-1.5 text-sm font-semibold lg:col-span-2">{dict.surveyOptions}
                  <textarea value={row.optionText} onChange={(event) => update(index, { optionText: event.target.value })} rows={3} className={cn(field, "py-2")} />
                </label>
              ) : null}
              {draft.length > 1 ? (
                <div><button type="button" className={secondaryButton} onClick={() => setDraft((rows) => rows.filter((_, at) => at !== index))}><Trash2 className="size-4" aria-hidden="true" />{dict.surveyRemoveQuestion}</button></div>
              ) : null}
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButton} disabled={draft.length >= FAIR_SURVEY_MAX_QUESTIONS} onClick={() => setDraft((rows) => [...rows, emptyDraft()])}><Plus className="size-4" aria-hidden="true" />{dict.surveyAddQuestion}</button>
            <button type="submit" className={primaryButton} disabled={pending || !canSave}>{dict.surveySave}</button>
          </div>
        </form>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.surveysNoModels}</p>}
      <Feedback message={message} />
      {view.surveys.length ? (
        <RowList>
          {view.surveys.map((survey) => {
            const model = names.get(survey.modelId);
            return (
              <Row key={survey.id}>
                <span className="min-w-0">
                  <strong className="block break-words text-sm">{model ? `${model.name} · ${model.brandName}` : "—"}</strong>
                  <Meta>{fmt(dict.surveyVersion, { version: survey.version, count: survey.questionCount })}</Meta>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <AdminStatus label={dict.surveyStatus[survey.status]} tone={survey.status === "published" ? "active" : survey.status === "draft" ? "waiting" : "neutral"} />
                  {survey.status === "draft" ? <button type="button" className={primaryButton} disabled={pending} onClick={() => void run(() => actions.publishSurvey(survey.id), dict.surveyPublished)}>{dict.surveyPublish}</button> : null}
                  {survey.status === "published" ? <button type="button" className={secondaryButton} disabled={pending} onClick={() => void run(() => actions.retireSurvey(survey.id), dict.surveyRetired)}>{dict.surveyRetire}</button> : null}
                </span>
              </Row>
            );
          })}
        </RowList>
      ) : <p className="mt-4 text-sm text-[var(--admin-text-muted)]">{dict.surveysEmpty}</p>}
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Brand passports
// -----------------------------------------------------------------------------

function Passports({ view, actions }: { view: InteractionsView; actions: InteractionsActions }) {
  const { message, pending, run } = useRunner();
  return (
    <Section title={dict.passportsTitle} help={dict.passportsHelp}>
      <Feedback message={message} />
      {view.passports.length ? (
        <RowList>
          {view.passports.map((passport) => (
            <Row key={passport.brandId}>
              <span className="min-w-0">
                <strong className="block break-words text-sm">{passport.brandName}</strong>
                {passport.frozenAt !== undefined ? <Meta>{fmt(dict.passportFrozenAt, { date: dateTime.format(passport.frozenAt) })}</Meta> : null}
                {passport.members.length ? (
                  <ul className="mt-2 grid gap-2">
                    {passport.members.map((member) => (
                      <li key={member.modelId} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-0 break-words">{member.modelName}</span>
                        <AdminStatus label={dict.passportMemberStatus[member.status]} tone={member.status === "required" ? "active" : "neutral"} />
                        {passport.id && passport.status === "published" && member.status === "required" ? (
                          <ConfirmAction label={dict.passportRemoveModel} body={fmt(dict.passportRemoveConfirm, { model: member.modelName })} disabled={pending} onConfirm={() => void run(() => actions.removePassportModel(passport.id!, member.modelId), dict.passportRemoved)} />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <AdminStatus label={passport.status ? dict.passportStatus[passport.status] : dict.passportNone} tone={passport.status === "published" ? "active" : passport.status === "draft" ? "waiting" : "neutral"} />
                {!passport.id ? <button type="button" className={secondaryButton} disabled={pending} onClick={() => void run(() => actions.openPassport(passport.brandId), dict.passportOpened)}>{dict.passportOpen}</button> : null}
                {passport.id && passport.status === "draft" ? <button type="button" className={primaryButton} disabled={pending} onClick={() => void run(() => actions.publishPassport(passport.id!), dict.passportPublishedDone)}>{dict.passportPublish}</button> : null}
                {passport.id && passport.status === "published" ? (
                  <ConfirmAction label={dict.passportWithdraw} body={dict.passportWithdrawConfirm} disabled={pending} onConfirm={() => void run(() => actions.withdrawPassport(passport.id!), dict.passportWithdrawn)} />
                ) : null}
              </span>
            </Row>
          ))}
        </RowList>
      ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.passportsEmpty}</p>}
    </Section>
  );
}

export function AdminEventsInteractions({ view, actions }: { view: InteractionsView | undefined; actions: InteractionsActions | undefined }) {
  if (!view || !actions) return <AdminPanel><AdminEmptyState title={dict.tabInteractions} body={dict.interactionsUnavailable} /></AdminPanel>;
  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.interactionsSubtitle}</p>
      <Questions view={view} actions={actions} />
      <Surveys view={view} actions={actions} />
      <Passports view={view} actions={actions} />
    </div>
  );
}
