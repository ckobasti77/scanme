"use client";

import { useState, type ReactNode } from "react";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { AdminDataCard, AdminDataView, type AdminColumn } from "@/components/admin/admin-ui";
import type { StoredSurveyQuestion } from "@/lib/admin-v1/survey-form";
import type {
  FairAudienceQuestionStatus,
  FairModelStatus,
  FairPackageTier,
  FairPassportConfigStatus,
  FairPassportEligibleStatus,
  FairSurveyQuestionKind,
  FairSurveyStatus,
} from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import type { AdminEventsPassportProblem } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

// Sajam 2026 B3 — the `Interakcije` sections of the admin `Događaji` area:
// shared types and pieces, and brand passports (prepare → freeze/publish,
// emergency removal, withdraw). Admin UX A6: Glas publike and Ankete are in
// components/admin/events/sections/interakcije-{glas-publike,ankete}-view.tsx.
// Presentational only; data and actions come from
// components/admin/events/sections/interakcije-section.tsx (requireAdmin
// functions in convex/fairInteractionsAdmin.ts). No visitor data and no
// rating aggregate.

/** `id` = the saved document (upsertAudienceQuestion questionId / upsertSurveyDraft surveyId). */
export type InteractionOutcome = { ok: true; problem?: string | null; id?: string; version?: number } | { ok: false; code: string };

/** A6 — exhibitor and brand ids feed the hierarchy picker; tier + activation feed the quota. */
export type InteractionModel = {
  id: string;
  name: string;
  brandId: string;
  brandName: string;
  exhibitorId: string;
  exhibitorName: string;
  externalKey: string;
  tier: FairPackageTier;
  packageActivatedAt: number;
  status: FairModelStatus;
};
export type InteractionDay = { id: string; dateKey: string; label: string; startsAt: number; endsAt: number };
export type InteractionQuestion = {
  id: string;
  modelId: string;
  dayId: string;
  prompt: string;
  options: { id: string; label: string; order: number }[];
  status: FairAudienceQuestionStatus;
  sortOrder: number;
  showOnSponsoredRotation: boolean;
};
export type InteractionSurvey = { id: string; modelId: string; version: number; status: FairSurveyStatus; title?: string; questions: StoredSurveyQuestion[] };
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
  days: InteractionDay[];
  questions: InteractionQuestion[];
  surveys: InteractionSurvey[];
  passports: InteractionPassport[];
};

export type SurveyQuestionInput = { id: string; prompt: string; kind: FairSurveyQuestionKind; options: { id: string; label: string; order: number }[]; required: boolean; order: number };

export type InteractionsActions = {
  /** `questionId` edits that draft; without it a new draft is created. */
  saveQuestion: (input: { questionId?: string; modelId: string; dayId: string; prompt: string; options: { id: string; label: string; order: number }[]; sortOrder: number }) => Promise<InteractionOutcome>;
  publishQuestion: (questionId: string) => Promise<InteractionOutcome>;
  closeQuestion: (questionId: string) => Promise<InteractionOutcome>;
  setSponsoredResult: (modelId: string, questionId: string | null) => Promise<InteractionOutcome>;
  /** Edits the model's one draft version or opens the next version (upsertSurveyDraft). */
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

/** A backend error code as Serbian text (never the raw code). */
export function interactionCodeText(code: string) {
  if (code === "ACTION_FAILED") return dict.actionFailed;
  return code in dict.issues ? dict.issues[code as keyof typeof dict.issues] : fmt(dict.unknownIssue, { code });
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
        setMessage({ tone: "error", text: interactionCodeText(outcome.code) });
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

type Runner = ReturnType<typeof useRunner>["run"];

function PassportStatus({ passport }: { passport: InteractionPassport }) {
  return <AdminStatus label={passport.status ? dict.passportStatus[passport.status] : dict.passportNone} tone={passport.status === "published" ? "active" : passport.status === "draft" ? "waiting" : "neutral"} />;
}

function PassportMembers({ passport, pending, run, actions }: { passport: InteractionPassport; pending: boolean; run: Runner; actions: InteractionsActions }) {
  if (!passport.members.length) return null;
  return (
    <ul className="grid gap-2">
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
  );
}

function passportColumns(pending: boolean, run: Runner, actions: InteractionsActions): AdminColumn<InteractionPassport>[] {
  return [
    { id: "brand", header: dict.colBrand, rowHeader: true, sortValue: (passport) => passport.brandName, cell: (passport) => <><strong className="block font-semibold">{passport.brandName}</strong>{passport.frozenAt !== undefined ? <Meta>{fmt(dict.passportFrozenAt, { date: dateTime.format(passport.frozenAt) })}</Meta> : null}</> },
    { id: "members", header: dict.colMembers, cell: (passport) => (passport.members.length ? <PassportMembers passport={passport} pending={pending} run={run} actions={actions} /> : "—") },
    { id: "status", header: dict.colStatus, sortValue: (passport) => (passport.status ? dict.passportStatus[passport.status] : dict.passportNone), cell: (passport) => <PassportStatus passport={passport} /> },
  ];
}

// -----------------------------------------------------------------------------
// Brand passports
// -----------------------------------------------------------------------------

function Passports({ view, actions }: { view: InteractionsView; actions: InteractionsActions }) {
  const { message, pending, run } = useRunner();
  return (
    <Section title={dict.passportsTitle} help={dict.passportsHelp}>
      <Feedback message={message} />
      <AdminDataView
        listKey="dogadjaji.pasos"
        caption={dict.passportsTitle}
        rows={view.passports}
        empty={{ title: dict.passportsTitle, body: dict.passportsEmpty }}
        getRowId={(passport) => passport.brandId}
        columns={passportColumns(pending, run, actions)}
        tableClassName="min-w-[44rem]"
        renderCard={(passport) => (
          <AdminDataCard
            title={passport.brandName}
            subtitle={passport.frozenAt !== undefined ? fmt(dict.passportFrozenAt, { date: dateTime.format(passport.frozenAt) }) : undefined}
            badges={<PassportStatus passport={passport} />}
          >
            <PassportMembers passport={passport} pending={pending} run={run} actions={actions} />
          </AdminDataCard>
        )}
        rowActions={(passport) => (
          <>
            {!passport.id ? <button type="button" className={secondaryButton} disabled={pending} onClick={() => void run(() => actions.openPassport(passport.brandId), dict.passportOpened)}>{dict.passportOpen}</button> : null}
            {passport.id && passport.status === "draft" ? <button type="button" className={primaryButton} disabled={pending} onClick={() => void run(() => actions.publishPassport(passport.id!), dict.passportPublishedDone)}>{dict.passportPublish}</button> : null}
            {passport.id && passport.status === "published" ? (
              <ConfirmAction label={dict.passportWithdraw} body={dict.passportWithdrawConfirm} disabled={pending} onConfirm={() => void run(() => actions.withdrawPassport(passport.id!), dict.passportWithdrawn)} />
            ) : null}
          </>
        )}
      />
    </Section>
  );
}

// Admin UX A2 — every part is its own route (`interakcije/glas-publike`,
// `interakcije/ankete`, `interakcije/pasos`).
type PartProps = { view: InteractionsView | undefined; actions: InteractionsActions | undefined };

export function InteractionsUnavailable() {
  return <AdminPanel><AdminEmptyState title={dict.tabInteractions} body={dict.interactionsUnavailable} /></AdminPanel>;
}

export function AdminEventsPassports({ view, actions }: PartProps) {
  return view && actions ? <Passports view={view} actions={actions} /> : <InteractionsUnavailable />;
}
