"use client";

import { ChevronDown } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  ConfirmAction,
  Feedback,
  Meta,
  Section,
  dateTime,
  field,
  secondaryButton,
  useRunner,
} from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminLoadingState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { belgradeLocalToEpoch, epochToBelgradeLocal, formatBelgradeDate } from "@/lib/belgrade-time";
import {
  FAIR_CONSENT_LEGAL_APPROVER_MAX,
  type FairConsentStatus,
  type FairLeadKind,
} from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Sajam 2026 B4 — consent versions of the lead flow (the production switch
// of `Zainteresovan sam` / `Probna vožnja`), `leadovi/podesavanja` since A2.
// A7: the forms moved to `interakcije/forme`. A8 (ADMIN-UX §7): consent is
// written once and lives in settings, folded per lead kind with its version
// state in the summary; the inbox (`leadovi`) and the follow-up per exhibitor
// (`leadovi/follow-up`) have their own views in
// components/admin/events/sections/leadovi-*.tsx.
// Presentational only; data and actions come from the container in
// components/admin/events/sections/leadovi-section.tsx (requireAdmin
// functions in convex/fairLeadsAdmin.ts).

export type LeadsOutcome = { ok: true } | { ok: false; code: string };
export type LeadsConsent = {
  id: string;
  kind: FairLeadKind;
  version: number;
  status: FairConsentStatus;
  text: string;
  activatedAt?: number;
  /** K3: the legal approval record entered at activation (absent on versions activated before K3). */
  legalApprovedBy?: string;
  legalApprovedAt?: number;
};
/** K3: who did the expert legal review of the text and when (epoch ms, not in the future). */
export type LeadsLegalApproval = { legalApprovedBy: string; legalApprovedAt: number };

export type LeadsView = {
  consents: LeadsConsent[] | undefined;
};

export type LeadsActions = {
  saveConsentDraft: (kind: FairLeadKind, text: string, consentId: string | null) => Promise<LeadsOutcome>;
  activateConsent: (consentId: string, approval: LeadsLegalApproval) => Promise<LeadsOutcome>;
  retireConsent: (consentId: string) => Promise<LeadsOutcome>;
};

const LEAD_KINDS: FairLeadKind[] = ["interest", "test_drive"];

/** K3: the admin enters the legal review date as a Belgrade calendar day (its 00:00). */
function legalApprovalAt(day: string): number | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? belgradeLocalToEpoch(`${day}T00:00`) : null;
}

function ConsentKind({ kind, versions, actions }: { kind: FairLeadKind; versions: LeadsConsent[]; actions: LeadsActions }) {
  const { message, pending, run } = useRunner();
  const active = versions.find((row) => row.status === "active");
  const draft = versions.find((row) => row.status === "draft");
  const [text, setText] = useState(draft?.text ?? "");
  const [approvedBy, setApprovedBy] = useState("");
  const [approvedDay, setApprovedDay] = useState("");
  const approvedAt = legalApprovalAt(approvedDay);
  const canActivate = Boolean(approvedBy.trim()) && approvedAt !== null;
  const [today] = useState(() => epochToBelgradeLocal(Date.now()).slice(0, 10));
  const summary = [
    ...(active ? [fmt(dict.leadSettings.summaryActive, { version: active.version })] : []),
    ...(draft ? [fmt(dict.leadSettings.summaryDraft, { version: draft.version })] : []),
  ].join(" · ");

  function save(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    void run(() => actions.saveConsentDraft(kind, text, draft?.id ?? null), dict.consentSaved);
  }

  return (
    <details className="group min-w-0 rounded-xl border border-[var(--admin-border)] [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">
        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        <span className="font-semibold">{dict.leadKinds[kind]}</span>
        <AdminStatus label={active ? dict.consentStatus.active : dict.leadSettings.summaryNone} tone={active ? "active" : "waiting"} />
        {summary ? <span className="text-sm text-[var(--admin-text-muted)]">{summary}</span> : null}
      </summary>
      <div className="grid min-w-0 content-start gap-3 border-t border-[var(--admin-border)] p-4">
        {active ? (
          <>
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <AdminStatus label={dict.consentStatus.active} tone="active" />
              {fmt(dict.consentActive, { version: active.version, date: active.activatedAt ? dateTime.format(active.activatedAt) : "—" })}
            </p>
            <Meta>
              {active.legalApprovedBy && active.legalApprovedAt !== undefined
                ? fmt(dict.consentLegalLine, { by: active.legalApprovedBy, date: formatBelgradeDate(active.legalApprovedAt) })
                : dict.consentLegalNone}
            </Meta>
            <p className="rounded-lg bg-[var(--admin-surface-muted)] p-3 text-sm break-words whitespace-pre-wrap">{active.text}</p>
            <ConfirmAction label={dict.consentRetire} body={dict.consentRetireConfirm} disabled={pending} onConfirm={() => void run(() => actions.retireConsent(active.id), dict.consentRetired)} />
          </>
        ) : (
          <p className="rounded-lg border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3 text-sm font-semibold">{dict.consentInactive}</p>
        )}
        <form className="grid gap-2" onSubmit={save}>
          <label className="grid gap-1.5 text-sm font-semibold">{draft ? fmt(dict.consentDraftLabel, { version: draft.version }) : dict.consentNewLabel}
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} maxLength={5000} className={cn(field, "py-2")} />
          </label>
          <span className="flex flex-wrap gap-2">
            <button type="submit" className={secondaryButton} disabled={pending || !text.trim()}>{dict.consentSaveDraft}</button>
          </span>
        </form>
        {draft ? (
          <fieldset className="grid min-w-0 gap-2 rounded-lg border border-[var(--admin-border)] p-3">
            <legend className="px-1 text-sm font-semibold">{dict.consentLegalTitle}</legend>
            <p className="text-sm text-[var(--admin-text-muted)]">{dict.consentLegalHelp}</p>
            <label className="grid gap-1.5 text-sm font-semibold">{dict.consentLegalApprovedBy}
              <input type="text" value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} maxLength={FAIR_CONSENT_LEGAL_APPROVER_MAX} autoComplete="off" className={field} />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">{dict.consentLegalApprovedAt}
              <input type="date" value={approvedDay} onChange={(event) => setApprovedDay(event.target.value)} max={today} className={field} />
            </label>
            <span className="flex flex-wrap gap-2">
              <ConfirmAction
                label={fmt(dict.consentActivate, { version: draft.version })}
                body={dict.consentActivateConfirm}
                disabled={pending || !canActivate}
                onConfirm={() => {
                  if (approvedAt === null) return;
                  void run(() => actions.activateConsent(draft.id, { legalApprovedBy: approvedBy.trim(), legalApprovedAt: approvedAt }), dict.consentActivated);
                }}
              />
            </span>
          </fieldset>
        ) : null}
        {versions.length ? (
          <ul className="grid gap-1">
            {versions.map((row) => <li key={row.id}><Meta>{fmt(dict.consentVersionLine, { version: row.version, status: dict.consentStatus[row.status] })}</Meta></li>)}
          </ul>
        ) : null}
        <Feedback message={message} />
      </div>
    </details>
  );
}

function Consent({ view, actions }: { view: LeadsView; actions: LeadsActions }) {
  const consents = view.consents;
  return (
    <Section title={dict.consentTitle} help={dict.consentHelp}>
      <p className="mb-2 max-w-3xl text-sm text-[var(--admin-text-muted)]">{dict.leadSettings.help}</p>
      <p className="mb-4 max-w-3xl rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3 text-sm">{dict.leadSettings.activitySharingNote}</p>
      {consents === undefined ? <AdminLoadingState label={dict.loading} /> : (
        <div className="grid gap-3">
          {LEAD_KINDS.map((kind) => {
            const versions = consents.filter((row) => row.kind === kind);
            const draftId = versions.find((row) => row.status === "draft")?.id ?? "new";
            return <ConsentKind key={`${kind}-${draftId}`} kind={kind} versions={versions} actions={actions} />;
          })}
        </div>
      )}
    </Section>
  );
}

function Unavailable() {
  return <AdminPanel><AdminEmptyState title={dict.tabLeads} body={dict.leadsUnavailable} /></AdminPanel>;
}

export function AdminEventsConsent({ view, actions }: { view: LeadsView | undefined; actions: LeadsActions | undefined }) {
  return view && actions ? <Consent view={view} actions={actions} /> : <Unavailable />;
}
