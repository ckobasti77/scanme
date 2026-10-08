"use client";

import { useState, type ReactNode } from "react";
import { AdminEmptyState, AdminPanel } from "@/components/admin/admin-primitives";
import type { StoredSurveyQuestion } from "@/lib/admin-v1/survey-form";
import type {
  FairAudienceQuestionStatus,
  FairModelStatus,
  FairPackageTier,
  FairSurveyQuestionKind,
  FairSurveyStatus,
} from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import type { AdminEventsPassportProblem } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

// Sajam 2026 B3 — the `Interakcije` sections of the admin `Događaji` area:
// shared types and pieces. Admin UX A6: Glas publike and Ankete are in
// components/admin/events/sections/interakcije-{glas-publike,ankete}-view.tsx;
// A7: Pasoš (automatic) and Forme are interakcije-{pasos,forme}-view.tsx.
// Presentational only; data and actions come from the containers in
// components/admin/events/sections/ (requireAdmin functions in
// convex/fairInteractionsAdmin.ts). No visitor data and no rating aggregate.

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
  /** The voting window (P1: a published question can open before its day). */
  startsAt?: number;
  endsAt?: number;
};
export type InteractionSurvey = { id: string; modelId: string; version: number; status: FairSurveyStatus; title?: string; questions: StoredSurveyQuestion[] };
export type InteractionsView = {
  models: InteractionModel[];
  days: InteractionDay[];
  questions: InteractionQuestion[];
  surveys: InteractionSurvey[];
};

export type SurveyQuestionInput = { id: string; prompt: string; kind: FairSurveyQuestionKind; options: { id: string; label: string; order: number }[]; required: boolean; order: number };

export type InteractionsActions = {
  /** `questionId` edits that draft; without it a new draft is created. */
  saveQuestion: (input: { questionId?: string; modelId: string; dayId: string; prompt: string; options: { id: string; label: string; order: number }[]; sortOrder: number }) => Promise<InteractionOutcome>;
  publishQuestion: (questionId: string) => Promise<InteractionOutcome>;
  closeQuestion: (questionId: string) => Promise<InteractionOutcome>;
  /** P1 — „Otvori sada“: a published question opens for votes before its day. */
  openQuestionNow?: (questionId: string) => Promise<InteractionOutcome>;
  setSponsoredResult: (modelId: string, questionId: string | null) => Promise<InteractionOutcome>;
  /** Edits the model's one draft version or opens the next version (upsertSurveyDraft). */
  saveSurveyDraft: (modelId: string, questions: SurveyQuestionInput[]) => Promise<InteractionOutcome>;
  publishSurvey: (surveyId: string) => Promise<InteractionOutcome>;
  retireSurvey: (surveyId: string) => Promise<InteractionOutcome>;
};

export const field = "min-h-11 w-full min-w-0 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";
export const primaryButton = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--admin-ink)] px-4 text-sm font-semibold text-[var(--admin-on-ink)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";
export const secondaryButton = "admin-button-ghost inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-strong)] px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus)]";

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

/** A destructive button that needs a second, explicit confirmation. `ariaLabel` names the row (A7: several in one list). */
export function ConfirmAction({ label, body, disabled, onConfirm, ariaLabel }: { label: string; body: string; disabled: boolean; onConfirm: () => void; ariaLabel?: string }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={secondaryButton} disabled={disabled} aria-label={ariaLabel} onClick={() => setOpen(true)}>{label}</button>;
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

// Admin UX A2 — every part is its own route (`interakcije/glas-publike`,
// `interakcije/ankete`, `interakcije/pasos`, `interakcije/forme`).

export function InteractionsUnavailable() {
  return <AdminPanel><AdminEmptyState title={dict.tabInteractions} body={dict.interactionsUnavailable} /></AdminPanel>;
}
