"use client";

import { useState, type FormEvent } from "react";
import type { Paged } from "@/components/admin/admin-events";
import {
  ConfirmAction,
  Feedback,
  Meta,
  Row,
  RowList,
  Section,
  dateTime,
  field,
  primaryButton,
  secondaryButton,
  useRunner,
} from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminLoadingState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { belgradeLocalToEpoch, epochToBelgradeLocal, formatBelgradeDate } from "@/lib/belgrade-time";
import {
  FAIR_CONSENT_LEGAL_APPROVER_MAX,
  type FairConsentStatus,
  type FairContactRequirement,
  type FairEmailDeliveryStatus,
  type FairLeadKind,
  type FairPackageTier,
  type FairPreferredContact,
} from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Sajam 2026 B4 — the `Leadovi` section of the admin `Događaji` tab: consent
// versions (the production switch of the lead flow), per-model lead settings
// and the exhibitor's follow-up text, and the received leads of one exhibitor
// with follow-up suppression and email retry. Presentational only; data and
// actions come from AdminEventsLeadsWorkspace (requireAdmin functions in
// convex/fairLeadsAdmin.ts). Contacts are shown only here, to ScanMe admins.

export type LeadsOutcome = { ok: true } | { ok: false; code: string };
export type LeadsModel = { id: string; name: string; exhibitorName: string; tier: FairPackageTier };
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
export type LeadsConfig = { contactRequirement: FairContactRequirement; preferredContact?: FairPreferredContact; enabled: boolean } | null;
export type LeadsModelSettings = {
  tier: FairPackageTier;
  interest: LeadsConfig;
  testDrive: LeadsConfig;
  followUpTemplate: { subject: string; plainText: string; version: number } | null;
};
export type LeadsDelivery = { id: string; status: FairEmailDeliveryStatus; scheduledFor: number; lastError?: string } | null;
export type LeadsRow = {
  id: string;
  createdAt: number;
  kind: FairLeadKind;
  modelName: string;
  contactName: string;
  email?: string;
  phone?: string;
  consentVersion: number;
  followUpSuppressed: boolean;
  confirmation: LeadsDelivery;
  followUp: LeadsDelivery;
};

export type LeadsView = {
  /** Models whose package has at least `Zainteresovan sam` (Starter+). */
  models: LeadsModel[];
  participations: { id: string; exhibitorName: string }[];
  consents: LeadsConsent[] | undefined;
  modelId: string | null;
  onSelectModel: (modelId: string) => void;
  modelSettings: LeadsModelSettings | undefined;
  participationId: string | null;
  onSelectParticipation: (participationId: string) => void;
  leads: Paged<LeadsRow>;
};

export type LeadsActions = {
  saveConsentDraft: (kind: FairLeadKind, text: string, consentId: string | null) => Promise<LeadsOutcome>;
  activateConsent: (consentId: string, approval: LeadsLegalApproval) => Promise<LeadsOutcome>;
  retireConsent: (consentId: string) => Promise<LeadsOutcome>;
  saveLeadConfig: (input: { modelId: string; kind: FairLeadKind; contactRequirement: FairContactRequirement; preferredContact?: FairPreferredContact; enabled: boolean }) => Promise<LeadsOutcome>;
  saveFollowUpTemplate: (modelId: string, subject: string, plainText: string) => Promise<LeadsOutcome>;
  setSuppressed: (leadId: string, suppressed: boolean) => Promise<LeadsOutcome>;
  retryDelivery: (deliveryId: string) => Promise<LeadsOutcome>;
};

const LEAD_KINDS: FairLeadKind[] = ["interest", "test_drive"];
const REQUIREMENTS: FairContactRequirement[] = ["one_of", "email", "phone", "both"];
const PREFERRED: FairPreferredContact[] = ["email", "phone"];

// -----------------------------------------------------------------------------
// Consent
// -----------------------------------------------------------------------------

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

  function save(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    void run(() => actions.saveConsentDraft(kind, text, draft?.id ?? null), dict.consentSaved);
  }

  return (
    <div className="grid min-w-0 content-start gap-3 rounded-xl border border-[var(--admin-border)] p-4">
      <h3 className="font-semibold">{dict.leadKinds[kind]}</h3>
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
  );
}

function Consent({ view, actions }: { view: LeadsView; actions: LeadsActions }) {
  const consents = view.consents;
  return (
    <Section title={dict.consentTitle} help={dict.consentHelp}>
      {consents === undefined ? <AdminLoadingState label={dict.loading} /> : (
        <div className="grid gap-4 lg:grid-cols-2">
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

// -----------------------------------------------------------------------------
// Per-model settings and the follow-up text
// -----------------------------------------------------------------------------

function ConfigForm({ modelId, kind, config, actions }: { modelId: string; kind: FairLeadKind; config: LeadsConfig; actions: LeadsActions }) {
  const { message, pending, run } = useRunner();
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [requirement, setRequirement] = useState<FairContactRequirement>(config?.contactRequirement ?? "one_of");
  const [preferred, setPreferred] = useState<FairPreferredContact | "">(config?.preferredContact ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(() => actions.saveLeadConfig({ modelId, kind, contactRequirement: requirement, ...(preferred ? { preferredContact: preferred } : {}), enabled }), dict.configSaved);
  }

  return (
    <form className="grid min-w-0 content-start gap-3 rounded-xl border border-[var(--admin-border)] p-4" onSubmit={submit}>
      <h3 className="font-semibold">{dict.leadKinds[kind]}</h3>
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-5" />
        {dict.configEnabled}
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">{dict.configRequirement}
        <select value={requirement} onChange={(event) => setRequirement(event.target.value as FairContactRequirement)} className={field}>
          {REQUIREMENTS.map((value) => <option key={value} value={value}>{dict.contactRequirements[value]}</option>)}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">{dict.configPreferred}
        <select value={preferred} onChange={(event) => setPreferred(event.target.value as FairPreferredContact | "")} className={field}>
          <option value="">{dict.configPreferredNone}</option>
          {PREFERRED.map((value) => <option key={value} value={value}>{dict.preferredContacts[value]}</option>)}
        </select>
      </label>
      <button type="submit" className={cn(primaryButton, "w-fit")} disabled={pending}>{dict.configSave}</button>
      <Feedback message={message} />
    </form>
  );
}

function FollowUpForm({ modelId, template, actions }: { modelId: string; template: LeadsModelSettings["followUpTemplate"]; actions: LeadsActions }) {
  const { message, pending, run } = useRunner();
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [text, setText] = useState(template?.plainText ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!subject.trim() || !text.trim()) return;
    void run(() => actions.saveFollowUpTemplate(modelId, subject.trim(), text), dict.followUpSaved);
  }

  return (
    <form className="grid min-w-0 content-start gap-3 rounded-xl border border-[var(--admin-border)] p-4 lg:col-span-2" onSubmit={submit}>
      <h3 className="font-semibold">{dict.followUpTitle}</h3>
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.followUpHelp}</p>
      <Meta>{template ? fmt(dict.followUpActiveVersion, { version: template.version }) : dict.followUpNone}</Meta>
      <label className="grid gap-1.5 text-sm font-semibold">{dict.followUpSubject}
        <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={150} className={field} />
      </label>
      <label className="grid gap-1.5 text-sm font-semibold">{dict.followUpText}
        <textarea value={text} onChange={(event) => setText(event.target.value)} rows={6} maxLength={5000} className={cn(field, "py-2")} />
      </label>
      <button type="submit" className={cn(primaryButton, "w-fit")} disabled={pending || !subject.trim() || !text.trim()}>{dict.followUpSave}</button>
      <Feedback message={message} />
    </form>
  );
}

function ModelSettings({ view, actions }: { view: LeadsView; actions: LeadsActions }) {
  const settings = view.modelSettings;
  const modelId = view.modelId;
  return (
    <Section title={dict.settingsTitle} help={dict.settingsHelp}>
      {!view.models.length || !modelId ? <p className="text-sm text-[var(--admin-text-muted)]">{dict.settingsNoModels}</p> : (
        <div className="grid gap-4">
          <label className="grid max-w-xl gap-1.5 text-sm font-semibold">{dict.fieldModel}
            <select value={modelId} onChange={(event) => view.onSelectModel(event.target.value)} className={field}>
              {view.models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.exhibitorName} · {dict.tiers[model.tier]}</option>)}
            </select>
          </label>
          {settings === undefined ? <AdminLoadingState label={dict.settingsLoading} /> : (
            <div className="grid gap-4 lg:grid-cols-2">
              <ConfigForm key={`${modelId}-interest`} modelId={modelId} kind="interest" config={settings.interest} actions={actions} />
              {settings.tier === "advanced" ? (
                <>
                  <ConfigForm key={`${modelId}-test_drive`} modelId={modelId} kind="test_drive" config={settings.testDrive} actions={actions} />
                  <FollowUpForm key={`${modelId}-follow-up-${settings.followUpTemplate?.version ?? 0}`} modelId={modelId} template={settings.followUpTemplate} actions={actions} />
                </>
              ) : <p className="self-start rounded-xl border border-[var(--admin-border)] p-4 text-sm text-[var(--admin-text-muted)]">{dict.testDriveAdvancedOnly}</p>}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// -----------------------------------------------------------------------------
// Received leads (PII)
// -----------------------------------------------------------------------------

function deliveryErrorText(lastError: string | undefined) {
  const code = (lastError ?? "").split(":")[0];
  return code in dict.deliveryErrors ? dict.deliveryErrors[code as keyof typeof dict.deliveryErrors] : null;
}

function deliveryText(delivery: LeadsDelivery, label: string, followUp: boolean) {
  if (!delivery) return fmt(label, { status: dict.deliveryNone });
  if (followUp && delivery.status === "queued") return fmt(dict.followUpPlanned, { date: dateTime.format(delivery.scheduledFor) });
  const error = delivery.status === "failed" || delivery.status === "skipped" ? deliveryErrorText(delivery.lastError) : null;
  const status = dict.deliveryStatus[delivery.status];
  return fmt(label, { status: error ? `${status} (${error})` : status });
}

function LeadList({ view, actions }: { view: LeadsView; actions: LeadsActions }) {
  const { message, pending, run } = useRunner();
  const leads = view.leads;
  return (
    <Section title={dict.listTitle} help={dict.listHelp}>
      {!view.participations.length || !view.participationId ? <p className="text-sm text-[var(--admin-text-muted)]">{dict.listNoParticipations}</p> : (
        <>
          <label className="grid max-w-xl gap-1.5 text-sm font-semibold">{dict.fieldExhibitor}
            <select value={view.participationId} onChange={(event) => view.onSelectParticipation(event.target.value)} className={field}>
              {view.participations.map((row) => <option key={row.id} value={row.id}>{row.exhibitorName}</option>)}
            </select>
          </label>
          {leads.status === "loading" ? <AdminLoadingState label={dict.loading} /> : !leads.rows.length ? (
            <p className="mt-4 text-sm text-[var(--admin-text-muted)]">{dict.listEmpty}</p>
          ) : (
            <RowList>
              {leads.rows.map((row) => (
                <Row key={row.id}>
                  <span className="grid min-w-0 gap-1">
                    <span className="font-semibold [overflow-wrap:anywhere]">{row.contactName}</span>
                    <Meta>{fmt(dict.leadMeta, { date: dateTime.format(row.createdAt), kind: dict.leadKinds[row.kind], model: row.modelName })}</Meta>
                    <span className="text-sm [overflow-wrap:anywhere]">{row.email ?? dict.leadNoEmail} · {row.phone ?? dict.leadNoPhone}</span>
                    <Meta>
                      {fmt(dict.leadConsent, { version: row.consentVersion })} · {deliveryText(row.confirmation, dict.confirmationLabel, false)}
                      {row.followUp ? ` · ${deliveryText(row.followUp, dict.followUpLabel, true)}` : ""}
                    </Meta>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {row.followUpSuppressed ? <AdminStatus label={dict.followUpSuppressedBadge} tone="neutral" /> : null}
                    {row.followUp?.status === "queued" && !row.followUpSuppressed ? (
                      <ConfirmAction label={dict.suppress} body={dict.suppressConfirm} disabled={pending} onConfirm={() => void run(() => actions.setSuppressed(row.id, true), dict.suppressDone)} />
                    ) : null}
                    {row.followUp?.status === "queued" && row.followUpSuppressed ? (
                      <button type="button" className={secondaryButton} disabled={pending} onClick={() => void run(() => actions.setSuppressed(row.id, false), dict.unsuppressDone)}>{dict.unsuppress}</button>
                    ) : null}
                    {row.confirmation?.status === "failed" ? (
                      <button type="button" className={secondaryButton} disabled={pending} onClick={() => void run(() => actions.retryDelivery(row.confirmation!.id), dict.retryDone)}>{dict.retryConfirmation}</button>
                    ) : null}
                    {row.followUp?.status === "failed" ? (
                      <button type="button" className={secondaryButton} disabled={pending} onClick={() => void run(() => actions.retryDelivery(row.followUp!.id), dict.retryDone)}>{dict.retryFollowUp}</button>
                    ) : null}
                  </span>
                </Row>
              ))}
            </RowList>
          )}
          {leads.canLoadMore ? (
            <button type="button" className={cn(secondaryButton, "mt-4")} disabled={leads.loadingMore} onClick={leads.onLoadMore}>{leads.loadingMore ? dict.loadingMore : dict.loadMore}</button>
          ) : null}
          <Feedback message={message} />
        </>
      )}
    </Section>
  );
}

export function AdminEventsLeads({ view, actions }: { view: LeadsView | undefined; actions: LeadsActions | undefined }) {
  if (!view || !actions) return <AdminPanel><AdminEmptyState title={dict.tabLeads} body={dict.leadsUnavailable} /></AdminPanel>;
  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.leadsSubtitle}</p>
      <Consent view={view} actions={actions} />
      <ModelSettings view={view} actions={actions} />
      <LeadList view={view} actions={actions} />
    </div>
  );
}
