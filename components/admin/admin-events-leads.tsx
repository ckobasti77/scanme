"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { Paged } from "@/components/admin/admin-events";
import {
  ConfirmAction,
  Feedback,
  Meta,
  Section,
  dateTime,
  field,
  primaryButton,
  secondaryButton,
  useRunner,
} from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminLoadingState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import { AdminDataCard, AdminDataView, type AdminColumn } from "@/components/admin/admin-ui";
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

// Sajam 2026 B4 — the lead sections of the admin `Događaji` area, each its
// own route since A2: consent versions (`leadovi/podesavanja`, the production
// switch of the lead flow), the exhibitor's follow-up text
// (`leadovi/follow-up`) and the received leads of one exhibitor with
// follow-up suppression and email retry (`leadovi`). A7: the form settings
// left Leadovi for `interakcije/forme` (per exhibitor,
// components/admin/events/sections/interakcije-forme-view.tsx); the lead list
// links there.
// Presentational only; data and actions come from the containers in
// components/admin/events/sections/ (requireAdmin functions in
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
  /** A7 — `interakcije/forme`, where the forms are set (linked from the lead list). */
  formsHref?: string;
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
  saveFollowUpTemplate: (modelId: string, subject: string, plainText: string) => Promise<LeadsOutcome>;
  setSuppressed: (leadId: string, suppressed: boolean) => Promise<LeadsOutcome>;
  retryDelivery: (deliveryId: string) => Promise<LeadsOutcome>;
};

const LEAD_KINDS: FairLeadKind[] = ["interest", "test_drive"];

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

function Consent({ view, actions }: { view: Pick<LeadsView, "consents">; actions: LeadsActions }) {
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
// The follow-up text (per model until A8)
// -----------------------------------------------------------------------------

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

type ModelPart = Pick<LeadsView, "models" | "modelId" | "onSelectModel" | "modelSettings">;

/** The follow-up text of one model (Napredni only). */
function FollowUpSettings({ view, actions }: { view: ModelPart; actions: LeadsActions }) {
  const settings = view.modelSettings;
  const modelId = view.modelId;
  return (
    <Section title={dict.followUpSectionTitle} help={dict.followUpSectionHelp}>
      {!view.models.length || !modelId ? <p className="text-sm text-[var(--admin-text-muted)]">{dict.settingsNoModels}</p> : (
        <div className="grid gap-4">
          <label className="grid max-w-xl gap-1.5 text-sm font-semibold">{dict.fieldModel}
            <select value={modelId} onChange={(event) => view.onSelectModel(event.target.value)} className={field}>
              {view.models.map((model) => <option key={model.id} value={model.id}>{model.name} · {model.exhibitorName} · {dict.tiers[model.tier]}</option>)}
            </select>
          </label>
          {settings === undefined ? <AdminLoadingState label={dict.settingsLoading} /> : settings.tier === "advanced" ? (
            <FollowUpForm key={`${modelId}-follow-up-${settings.followUpTemplate?.version ?? 0}`} modelId={modelId} template={settings.followUpTemplate} actions={actions} />
          ) : <p className="rounded-xl border border-[var(--admin-border)] p-4 text-sm text-[var(--admin-text-muted)]">{dict.followUpAdvancedOnly}</p>}
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

function contactText(row: LeadsRow) {
  return `${row.email ?? dict.leadNoEmail} · ${row.phone ?? dict.leadNoPhone}`;
}

function deliverySummary(row: LeadsRow) {
  return `${fmt(dict.leadConsent, { version: row.consentVersion })} · ${deliveryText(row.confirmation, dict.confirmationLabel, false)}${row.followUp ? ` · ${deliveryText(row.followUp, dict.followUpLabel, true)}` : ""}`;
}

const leadColumns: AdminColumn<LeadsRow>[] = [
  { id: "name", header: dict.colName, rowHeader: true, sortValue: (row) => row.contactName, cell: (row) => <strong className="font-semibold">{row.contactName}</strong> },
  { id: "date", header: dict.colDate, sortValue: (row) => row.createdAt, cell: (row) => <span className="whitespace-nowrap">{dateTime.format(row.createdAt)}</span> },
  { id: "kind", header: dict.colKind, sortValue: (row) => dict.leadKinds[row.kind], cell: (row) => <><span className="block">{dict.leadKinds[row.kind]}</span><Meta>{row.modelName}</Meta></> },
  { id: "contact", header: dict.colContact, cell: contactText },
  { id: "delivery", header: dict.colDelivery, cell: (row) => <span className="flex flex-wrap items-center gap-1.5"><Meta>{deliverySummary(row)}</Meta>{row.followUpSuppressed ? <AdminStatus label={dict.followUpSuppressedBadge} tone="neutral" /> : null}</span> },
];

type LeadListView = Pick<LeadsView, "participations" | "participationId" | "onSelectParticipation" | "leads" | "formsHref">;

function LeadList({ view, actions }: { view: LeadListView; actions: LeadsActions }) {
  const { message, pending, run } = useRunner();
  const leads = view.leads;
  return (
    <Section title={dict.listTitle} help={dict.listHelp}>
      {view.formsHref ? (
        <p className="mb-4 text-sm">
          {dict.leadForms.movedNote}{" "}
          <Link href={view.formsHref} className="font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{dict.leadForms.movedLink}</Link>
        </p>
      ) : null}
      {!view.participations.length || !view.participationId ? <p className="text-sm text-[var(--admin-text-muted)]">{dict.listNoParticipations}</p> : (
        <>
          <label className="grid max-w-xl gap-1.5 text-sm font-semibold">{dict.fieldExhibitor}
            <select value={view.participationId} onChange={(event) => view.onSelectParticipation(event.target.value)} className={field}>
              {view.participations.map((row) => <option key={row.id} value={row.id}>{row.exhibitorName}</option>)}
            </select>
          </label>
          <AdminDataView
            className="mt-4"
            listKey="dogadjaji.leadovi"
            caption={dict.listTitle}
            rows={leads.status === "loading" ? undefined : leads.rows}
            loadingLabel={dict.loading}
            empty={{ title: dict.listTitle, body: dict.listEmpty }}
            getRowId={(row) => row.id}
            columns={leadColumns}
            tableClassName="min-w-[60rem]"
            renderCard={(row) => (
              <AdminDataCard
                title={row.contactName}
                subtitle={fmt(dict.leadMeta, { date: dateTime.format(row.createdAt), kind: dict.leadKinds[row.kind], model: row.modelName })}
                badges={row.followUpSuppressed ? <AdminStatus label={dict.followUpSuppressedBadge} tone="neutral" /> : undefined}
                fields={[
                  { label: dict.colContact, value: contactText(row) },
                  { label: dict.colDelivery, value: deliverySummary(row) },
                ]}
              />
            )}
            rowActions={(row) => (
              <>
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
              </>
            )}
            footer={leads.canLoadMore ? (
              <button type="button" className={cn(secondaryButton, "w-fit")} disabled={leads.loadingMore} onClick={leads.onLoadMore}>{leads.loadingMore ? dict.loadingMore : dict.loadMore}</button>
            ) : null}
          />
          <Feedback message={message} />
        </>
      )}
    </Section>
  );
}

function Unavailable() {
  return <AdminPanel><AdminEmptyState title={dict.tabLeads} body={dict.leadsUnavailable} /></AdminPanel>;
}

export function AdminEventsLeadList({ view, actions }: { view: LeadListView | undefined; actions: LeadsActions | undefined }) {
  return view && actions ? <LeadList view={view} actions={actions} /> : <Unavailable />;
}

export function AdminEventsFollowUp({ view, actions }: { view: ModelPart | undefined; actions: LeadsActions | undefined }) {
  return view && actions ? <FollowUpSettings view={view} actions={actions} /> : <Unavailable />;
}

export function AdminEventsConsent({ view, actions }: { view: Pick<LeadsView, "consents"> | undefined; actions: LeadsActions | undefined }) {
  return view && actions ? <Consent view={view} actions={actions} /> : <Unavailable />;
}
