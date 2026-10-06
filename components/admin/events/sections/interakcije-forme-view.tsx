"use client";

import { CircleCheck, CircleSlash, PencilLine, X } from "lucide-react";
import Link from "next/link";
import { useId, useState, type ComponentProps, type FormEvent } from "react";
import { interactionCodeText } from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  type AdminColumn,
} from "@/components/admin/admin-ui";
import { Feedback, Meta, Section, type EventMessage } from "@/components/admin/events/event-ui";
import {
  buildLeadFormRows,
  LEAD_FORM_KINDS,
  leadFormDefaults,
  leadFormModelCounts,
  pendingLeadFormModels,
  sameLeadForm,
  selectedLeadFormExhibitor,
  type LeadFormCell,
  type LeadFormCellState,
  type LeadFormNames,
  type LeadFormRow,
  type LeadFormsSource,
  type LeadFormValues,
} from "@/lib/admin-v1/lead-forms";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import type { FairContactRequirement, FairLeadKind, FairPreferredContact } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Admin UX A7 — `interakcije/forme` (ADMIN-UX §6 Forme; MASTER §8): the
// forms `Zainteresovan sam` and `Probna vožnja` are set once per exhibitor and
// applied to all its models in one move; a model may keep an exception. The
// list shows the real stored state of every model (on/off, contact,
// preference, source) and why a package lacks a form. The K3 switch and the
// consent are shown read-only (booleans and versions, never env values).
// Presentational; data and actions come from interakcije-forme-section.tsx
// (convex/fairLeadsAdmin.ts).

const f = dict.leadForms;
const REQUIREMENTS: FairContactRequirement[] = ["one_of", "email", "phone", "both"];
const PREFERRED: FairPreferredContact[] = ["email", "phone"];
/** What a new exhibitor default suggests before it is saved. */
const SUGGESTED: LeadFormValues = { enabled: true, contactRequirement: "one_of" };

export type LeadFormsApplyResult = {
  created: number;
  updated: number;
  unchanged: number;
  skippedOverride: number;
  notEntitled: { modelId: string; kind: FairLeadKind }[];
  missingDefault: FairLeadKind[];
};
export type LeadFormsOutcome = { ok: true; applied?: LeadFormsApplyResult } | { ok: false; code: string };
export type LeadFormsActions = {
  saveDefault: (participationId: string, kind: FairLeadKind, values: LeadFormValues) => Promise<LeadFormsOutcome>;
  apply: (participationId: string) => Promise<LeadFormsOutcome>;
  saveOverride: (modelId: string, kind: FairLeadKind, values: LeadFormValues) => Promise<LeadFormsOutcome>;
  clearOverride: (modelId: string, kind: FairLeadKind) => Promise<LeadFormsOutcome>;
};

export type EventLeadFormsViewProps = {
  /** fairLeadsAdmin.getEventLeadForms; undefined = loading. */
  source: LeadFormsSource | undefined;
  names: LeadFormNames;
  exhibitors: { id: string; name: string }[];
  /** fairLeadsAdmin.getLeadSwitches (booleans only). */
  switches: { leadsEnabled: boolean; followUpEnabled: boolean } | undefined;
  /** Active consent version per kind (null = none active). */
  consents: Record<FairLeadKind, number | null> | undefined;
  consentHref: string;
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  actions: LeadFormsActions;
  /** Izlagači 2026: on one exhibitor's page (`exhibitors` = that one) — no exhibitor select. */
  scoped?: boolean;
};

type Tone = ComponentProps<typeof AdminStatus>["tone"];
const CELL_TONE: Record<LeadFormCellState, Tone> = { on: "active", off: "neutral", not_entitled: "muted", not_set: "waiting" };

function useFormsRunner() {
  const [message, setMessage] = useState<EventMessage>(null);
  const [pending, setPending] = useState(false);
  async function run(action: () => Promise<LeadFormsOutcome | string>) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      if (typeof outcome === "string") setMessage({ tone: "ok", text: outcome });
      else if (!outcome.ok) setMessage({ tone: "error", text: interactionCodeText(outcome.code) });
    } finally {
      setPending(false);
    }
  }
  return { message, setMessage, pending, run };
}

// -----------------------------------------------------------------------------
// Read-only state of the lead flow (K3 switch, consent)
// -----------------------------------------------------------------------------

function StatusItem({ on, text }: { on: boolean; text: string }) {
  const Icon = on ? CircleCheck : CircleSlash;
  return (
    <li className="flex min-w-0 items-start gap-2 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-[var(--admin-success)]" : "text-[var(--admin-warning)]")} aria-hidden="true" />
      <span className="min-w-0">{text}</span>
    </li>
  );
}

function FlowStatus({ switches, consents, consentHref }: Pick<EventLeadFormsViewProps, "switches" | "consents" | "consentHref">) {
  if (!switches || !consents) return null;
  return (
    <section aria-label={f.statusLabel} className="grid gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3 sm:p-4">
      <h3 className="text-sm font-semibold">{f.statusLabel}</h3>
      <ul className="grid gap-1.5 md:grid-cols-2">
        <StatusItem on={switches.leadsEnabled} text={switches.leadsEnabled ? f.leadsOn : f.leadsOff} />
        <StatusItem on={switches.followUpEnabled} text={switches.followUpEnabled ? f.followUpOn : f.followUpOff} />
        {LEAD_FORM_KINDS.map((kind) => {
          const version = consents[kind];
          return <StatusItem key={kind} on={version !== null} text={version !== null ? fmt(f.consentOn, { kind: dict.leadKinds[kind], version }) : fmt(f.consentOff, { kind: dict.leadKinds[kind] })} />;
        })}
      </ul>
      <Link href={consentHref} className="w-fit text-sm font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{f.consentLink}</Link>
    </section>
  );
}

// -----------------------------------------------------------------------------
// One form's fields (default and exception share them)
// -----------------------------------------------------------------------------

function FormFields({ kind, value, onChange, note }: { kind: FairLeadKind; value: LeadFormValues; onChange: (next: LeadFormValues) => void; note?: string }) {
  const id = useId();
  return (
    <fieldset className="grid min-w-0 content-start gap-3 rounded-xl border border-[var(--admin-border)] p-4">
      <legend className="px-1 font-semibold">{dict.leadKinds[kind]}</legend>
      {note ? <p className="text-xs text-[var(--admin-text-muted)]">{note}</p> : null}
      <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} className="size-5" />
        {dict.configEnabled}
      </label>
      <label htmlFor={`${id}-requirement`} className="grid gap-1.5 text-sm font-semibold">{dict.configRequirement}
        <select id={`${id}-requirement`} value={value.contactRequirement} onChange={(event) => onChange({ ...value, contactRequirement: event.target.value as FairContactRequirement })} className={adminFieldClass}>
          {REQUIREMENTS.map((requirement) => <option key={requirement} value={requirement}>{dict.contactRequirements[requirement]}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-preferred`} className="grid gap-1.5 text-sm font-semibold">{dict.configPreferred}
        <select
          id={`${id}-preferred`}
          value={value.preferredContact ?? ""}
          onChange={(event) => {
            const preferred = event.target.value as FairPreferredContact | "";
            onChange(preferred ? { ...value, preferredContact: preferred } : { enabled: value.enabled, contactRequirement: value.contactRequirement });
          }}
          className={adminFieldClass}
        >
          <option value="">{dict.configPreferredNone}</option>
          {PREFERRED.map((channel) => <option key={channel} value={channel}>{dict.preferredContacts[channel]}</option>)}
        </select>
      </label>
    </fieldset>
  );
}

// -----------------------------------------------------------------------------
// Exhibitor default + "Primeni na sve modele"
// -----------------------------------------------------------------------------

function appliedText(result: LeadFormsApplyResult) {
  return fmt(f.applied, { created: result.created, updated: result.updated, unchanged: result.unchanged, skipped: result.skippedOverride });
}

function DefaultsForm({ exhibitor, saved, rows, actions }: {
  exhibitor: { id: string; name: string };
  saved: Record<FairLeadKind, LeadFormValues | null>;
  rows: LeadFormRow[];
  actions: LeadFormsActions;
}) {
  const runner = useFormsRunner();
  const [values, setValues] = useState<Record<FairLeadKind, LeadFormValues>>({ interest: saved.interest ?? SUGGESTED, test_drive: saved.test_drive ?? SUGGESTED });
  const [applied, setApplied] = useState<LeadFormsApplyResult | null>(null);
  const pendingModels = pendingLeadFormModels(rows);
  const names = new Map(rows.map((row) => [row.modelId, row.modelName]));

  async function save(apply: boolean): Promise<LeadFormsOutcome | string> {
    setApplied(null);
    for (const kind of LEAD_FORM_KINDS) {
      const current = saved[kind];
      if (current && sameLeadForm(current, values[kind])) continue;
      const outcome = await actions.saveDefault(exhibitor.id, kind, values[kind]);
      if (!outcome.ok) return outcome;
    }
    if (!apply) return f.saved;
    return applyAll();
  }

  async function applyAll(): Promise<LeadFormsOutcome | string> {
    const outcome = await actions.apply(exhibitor.id);
    if (!outcome.ok) return outcome;
    if (outcome.applied) setApplied(outcome.applied);
    return outcome.applied ? appliedText(outcome.applied) : f.saved;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void runner.run(() => save(true));
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div>
        <h3 className="text-base font-semibold">{fmt(f.defaultsTitle, { exhibitor: exhibitor.name })}</h3>
        <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{f.defaultsHelp}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {LEAD_FORM_KINDS.map((kind) => (
          <div key={kind} className="grid content-start gap-1.5">
            <FormFields kind={kind} value={values[kind]} onChange={(next) => setValues((previous) => ({ ...previous, [kind]: next }))} note={kind === "test_drive" ? f.testDriveDefaultNote : undefined} />
            {!saved[kind] ? <Meta>{f.defaultNotSaved}</Meta> : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={adminPrimaryButtonClass} disabled={runner.pending}>{f.saveAndApply}</button>
        <button type="button" className={adminSecondaryButtonClass} disabled={runner.pending} onClick={() => void runner.run(() => save(false))}>{f.saveOnly}</button>
      </div>
      {pendingModels ? (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3 text-sm font-semibold">
          {fmt(f.pending, { count: pendingModels })}
          <button type="button" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")} disabled={runner.pending} onClick={() => void runner.run(applyAll)}>{f.apply}</button>
        </p>
      ) : null}
      <Feedback message={runner.message} />
      {applied && (applied.notEntitled.length || applied.missingDefault.length) ? (
        <div className="grid gap-1.5 rounded-xl border border-[var(--admin-border)] p-3 text-sm" role="status">
          {applied.notEntitled.length ? (
            <>
              <p className="font-semibold">{f.notEntitledTitle}</p>
              <ul className="grid gap-1">
                {applied.notEntitled.map((row) => (
                  <li key={`${row.modelId}-${row.kind}`}>{fmt(f.notEntitledLine, { model: names.get(row.modelId) ?? "—", kind: dict.leadKinds[row.kind], reason: f.notEntitledReasons[row.kind] })}</li>
                ))}
              </ul>
            </>
          ) : null}
          {applied.missingDefault.map((kind) => <p key={kind}>{fmt(f.missingDefault, { kind: dict.leadKinds[kind] })}</p>)}
        </div>
      ) : null}
    </form>
  );
}

// -----------------------------------------------------------------------------
// A model's exception
// -----------------------------------------------------------------------------

function OverrideKind({ row, cell, hasDefault, actions }: { row: LeadFormRow; cell: LeadFormCell; hasDefault: boolean; actions: LeadFormsActions }) {
  const runner = useFormsRunner();
  const [value, setValue] = useState<LeadFormValues>(cell.config ?? cell.expected ?? SUGGESTED);
  if (!cell.entitled) {
    return (
      <div className="grid content-start gap-2 rounded-xl border border-[var(--admin-border)] p-4 text-sm">
        <p className="font-semibold">{dict.leadKinds[cell.kind]}</p>
        <p className="text-[var(--admin-text-muted)]">{cell.kind === "test_drive" ? dict.testDriveAdvancedOnly : f.notEntitledReasons.interest}</p>
      </div>
    );
  }
  return (
    <form
      className="grid content-start gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void runner.run(async () => {
          const outcome = await actions.saveOverride(row.modelId, cell.kind, value);
          return outcome.ok ? f.overrideSaved : outcome;
        });
      }}
    >
      <FormFields kind={cell.kind} value={value} onChange={setValue} />
      <span className="flex flex-wrap gap-2">
        <button type="submit" className={adminPrimaryButtonClass} disabled={runner.pending}>{f.saveOverride}</button>
        {cell.config?.source === "override" && hasDefault ? (
          <button
            type="button"
            className={adminSecondaryButtonClass}
            disabled={runner.pending}
            onClick={() => void runner.run(async () => {
              const outcome = await actions.clearOverride(row.modelId, cell.kind);
              if (!outcome.ok) return outcome;
              if (cell.expected) setValue(cell.expected);
              return f.cleared;
            })}
          >
            {f.clearOverride}
          </button>
        ) : null}
      </span>
      <Feedback message={runner.message} />
    </form>
  );
}

function OverrideEditor({ row, saved, actions, onClose }: { row: LeadFormRow; saved: Record<FairLeadKind, LeadFormValues | null>; actions: LeadFormsActions; onClose: () => void }) {
  return (
    <AdminPanel className="min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold [overflow-wrap:anywhere]">{fmt(f.overrideTitle, { model: row.modelName })}</h3>
          <p className="mt-1 text-sm text-[var(--admin-text-muted)]">{f.overrideHelp}</p>
        </div>
        <button type="button" className={cn(adminSecondaryButtonClass, "min-h-9 px-3")} onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
          {f.closeOverride}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[row.interest, row.testDrive].map((cell) => (
          <OverrideKind key={`${row.modelId}-${cell.kind}`} row={row} cell={cell} hasDefault={saved[cell.kind] !== null} actions={actions} />
        ))}
      </div>
    </AdminPanel>
  );
}

// -----------------------------------------------------------------------------
// Models list
// -----------------------------------------------------------------------------

function cellLine(cell: LeadFormCell) {
  if (!cell.entitled) return f.notEntitledReasons[cell.kind];
  if (!cell.config) return null;
  const parts = [
    cell.config.source === "override" ? f.sourceOverride : f.sourceDefault,
    fmt(f.contactLine, { requirement: dict.contactRequirements[cell.config.contactRequirement] }),
    ...(cell.config.preferredContact ? [fmt(f.preferredLine, { channel: dict.preferredContacts[cell.config.preferredContact] })] : []),
  ];
  return parts.join(" · ");
}

function FormCell({ cell }: { cell: LeadFormCell }) {
  const line = cellLine(cell);
  return (
    <span className="grid justify-items-start gap-1">
      <span className="flex flex-wrap items-center gap-1.5">
        <AdminStatus label={f.states[cell.state]} tone={CELL_TONE[cell.state]} />
        {cell.pending ? <AdminStatus label={f.pendingBadge} tone="waiting" /> : null}
      </span>
      {line ? <Meta>{line}</Meta> : null}
    </span>
  );
}

const formColumns: AdminColumn<LeadFormRow>[] = [
  { id: "model", header: f.colModel, rowHeader: true, sortValue: (row) => row.modelName, cell: (row) => <><strong className="block font-semibold">{row.modelName}</strong><Meta>{row.brandName}</Meta></> },
  { id: "package", header: f.colPackage, sortValue: (row) => dict.tiers[row.tier], cell: (row) => <span className="whitespace-nowrap">{dict.tiers[row.tier]}</span> },
  { id: "interest", header: dict.leadKinds.interest, sortValue: (row) => f.states[row.interest.state], cell: (row) => <FormCell cell={row.interest} /> },
  { id: "testDrive", header: dict.leadKinds.test_drive, sortValue: (row) => f.states[row.testDrive.state], cell: (row) => <FormCell cell={row.testDrive} /> },
];

export function EventLeadFormsView({ source, names, exhibitors, switches, consents, consentHref, query, onQueryChange, actions, scoped = false }: EventLeadFormsViewProps) {
  const exhibitorId = selectedLeadFormExhibitor(exhibitors, source, query);
  const exhibitor = exhibitors.find((row) => row.id === exhibitorId) ?? null;
  const rows = source && exhibitorId ? buildLeadFormRows(source, names, exhibitorId) : undefined;
  const saved = source && exhibitorId ? leadFormDefaults(source, exhibitorId) : null;
  const counts = source ? leadFormModelCounts(source) : new Map<string, number>();
  const editing = rows && query.model ? rows.find((row) => row.modelId === query.model) ?? null : null;
  const selectId = useId();

  return (
    <div className="grid min-w-0 gap-4">
      <Section title={dict.interactionSections.forme}>
        <p className="mb-4 max-w-3xl text-sm text-[var(--admin-text-muted)]">{f.help}</p>
        <FlowStatus switches={switches} consents={consents} consentHref={consentHref} />
        {!exhibitors.length ? (
          <AdminEmptyState title={f.noExhibitorsTitle} body={f.noExhibitorsBody} className="min-h-40" />
        ) : (
          <div className="mt-4 grid gap-4">
            {scoped ? null : (
              <label htmlFor={selectId} className="grid max-w-xl gap-1.5 text-sm font-semibold">{f.exhibitorLabel}
                <select id={selectId} value={exhibitorId ?? ""} onChange={(event) => onQueryChange({ izlagac: event.target.value, model: null })} className={adminFieldClass}>
                  {exhibitors.map((row) => <option key={row.id} value={row.id}>{fmt(f.exhibitorOption, { name: row.name, count: counts.get(row.id) ?? 0 })}</option>)}
                </select>
              </label>
            )}
            {exhibitor && rows && saved ? (
              <DefaultsForm
                key={exhibitor.id}
                exhibitor={exhibitor}
                saved={saved}
                rows={rows}
                actions={actions}
              />
            ) : null}
          </div>
        )}
      </Section>
      {editing && saved ? <OverrideEditor row={editing} saved={saved} actions={actions} onClose={() => onQueryChange({ model: null })} /> : null}
      {exhibitors.length ? (
        <Section title={f.modelsTitle}>
          <AdminDataView
            listKey="dogadjaji.forme"
            caption={exhibitor ? `${f.modelsTitle}: ${exhibitor.name}` : f.modelsTitle}
            rows={rows}
            loadingLabel={dict.loading}
            getRowId={(row) => row.modelId}
            columns={formColumns}
            tableClassName="min-w-[52rem]"
            toolbar={rows ? <p className="text-sm font-semibold" role="status" aria-live="polite">{fmt(f.count, { shown: rows.length })}</p> : undefined}
            empty={{ title: f.noModelsTitle, body: f.noModelsBody }}
            rowClassName={(row) => (row.modelId === query.model ? "bg-[var(--admin-surface-muted)]" : undefined)}
            renderCard={(row) => (
              <AdminDataCard
                title={row.modelName}
                subtitle={`${row.brandName} · ${dict.tiers[row.tier]}`}
                fields={[
                  { label: dict.leadKinds.interest, value: <FormCell cell={row.interest} /> },
                  { label: dict.leadKinds.test_drive, value: <FormCell cell={row.testDrive} /> },
                ]}
              />
            )}
            rowActions={(row) => (
              <button
                type="button"
                className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}
                aria-label={fmt(f.editOverrideAria, { model: row.modelName })}
                aria-pressed={row.modelId === query.model}
                onClick={() => onQueryChange({ model: row.modelId, izlagac: row.exhibitorId })}
              >
                <PencilLine className="size-4" aria-hidden="true" />
                {f.editOverride}
              </button>
            )}
          />
        </Section>
      ) : null}
    </div>
  );
}
