"use client";

import { CircleCheck, CircleSlash, PencilLine, TriangleAlert } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { ConfirmAction, Feedback, Meta, interactionCodeText } from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminLoadingState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  type AdminColumn,
} from "@/components/admin/admin-ui";
import { Section, eventDateTime } from "@/components/admin/events/event-ui";
import { followUpPreview, followUpTextState, insertAtCursor, pickFollowUpExhibitor, type FollowUpTextState } from "@/components/admin/events/leads-logic";
import type { FairFollowUpValues } from "@/convex/lib/fairFollowUp";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import { FAIR_FOLLOW_UP_FIELDS, FAIR_FOLLOW_UP_SUBJECT_MAX, FAIR_FOLLOW_UP_TEXT_MAX, type FairFollowUpTemplateStatus, type FairLeadKind } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Admin UX A8 — `leadovi/follow-up` (ADMIN-UX §7, §12.3; MASTER §8): the one
// post-fair email per (visitor, exhibitor). Per exhibitor: the state of its
// text (active / draft / none), how many Advanced models it has, how many
// emails would go, and the editor (subject, plain text, merge fields inserted
// at the caret) with a live preview on a real lead or a marked example. The
// K3 switch is shown read-only. Presentational; data and actions come from
// leadovi-section.tsx (convex/fairFollowUps.ts).

const f = dict.followUps;

export type FollowUpTemplateView = { templateId: string; subject: string; plainText: string; status: FairFollowUpTemplateStatus; version: number; updatedAt: number };
export type ExhibitorFollowUp = { participationId: string; active: FollowUpTemplateView | null; draft: FollowUpTemplateView | null; advancedModels: number; modelTexts: number };
export type FollowUpEstimate = { byParticipation: { participationId: string; pairs: number; sent: number; suppressed: number }[]; capped: boolean };
export type FollowUpPreviewSource = {
  source: "lead" | "sample";
  values: FairFollowUpValues;
  leads: { leadId: string; contactName: string; kind: FairLeadKind; createdAt: number }[];
};
export type FollowUpOutcome = { ok: true } | { ok: false; code: string };
export type FollowUpActions = {
  saveDraft: (participationId: string, subject: string, plainText: string) => Promise<FollowUpOutcome>;
  activate: (templateId: string) => Promise<FollowUpOutcome>;
  retire: (templateId: string) => Promise<FollowUpOutcome>;
};

export type EventFollowUpViewProps = {
  exhibitors: { id: string; name: string }[];
  eventTitle: string;
  /** fairFollowUps.getExhibitorFollowUps; undefined = loading. */
  rows: ExhibitorFollowUp[] | undefined;
  /** fairFollowUps.estimateFollowUps; undefined = loading. */
  estimate: FollowUpEstimate | undefined;
  /** fairLeadsAdmin.getLeadSwitches (booleans only). */
  switches: { leadsEnabled: boolean; followUpEnabled: boolean } | undefined;
  /** fairFollowUps.previewExhibitorFollowUp for the chosen exhibitor and `?lead=`. */
  preview: FollowUpPreviewSource | undefined;
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  actions: FollowUpActions;
};

type Row = ExhibitorFollowUp & { name: string; state: FollowUpTextState; estimate: FollowUpEstimate["byParticipation"][number] | null };

const STATE_TONE: Record<FollowUpTextState, "active" | "waiting" | "neutral"> = { active: "active", draft: "waiting", none: "neutral" };

function TextState({ row }: { row: Row }) {
  return (
    <span className="grid justify-items-start gap-1">
      <AdminStatus label={f.states[row.state]} tone={row.advancedModels === 0 && row.state === "none" ? "neutral" : STATE_TONE[row.state]} />
      {row.active ? <Meta>{fmt(f.versionActive, { version: row.active.version })}</Meta> : null}
      {row.draft ? <Meta>{row.active ? f.draftPending : fmt(f.versionDraft, { version: row.draft.version })}</Meta> : null}
    </span>
  );
}

function EstimateCell({ row }: { row: Row }) {
  if (row.advancedModels === 0) return <Meta>{f.noAdvanced}</Meta>;
  const pairs = row.estimate?.pairs ?? 0;
  return (
    <span className="grid justify-items-start gap-0.5">
      <strong className="font-semibold">{fmt(f.estimate, { count: pairs })}</strong>
      {row.estimate && (row.estimate.sent || row.estimate.suppressed) ? <Meta>{fmt(f.estimateDetail, { sent: row.estimate.sent, suppressed: row.estimate.suppressed })}</Meta> : null}
      {!row.active && row.modelTexts === 0 && pairs > 0 ? <span className="text-xs font-semibold text-[var(--admin-warning)]">{f.estimateNoText}</span> : null}
    </span>
  );
}

const columns: AdminColumn<Row>[] = [
  { id: "exhibitor", header: f.colExhibitor, rowHeader: true, sortValue: (row) => row.name, cell: (row) => <strong className="font-semibold [overflow-wrap:anywhere]">{row.name}</strong> },
  { id: "text", header: f.colText, sortValue: (row) => f.states[row.state], cell: (row) => <TextState row={row} /> },
  { id: "advanced", header: f.colAdvanced, align: "end", sortValue: (row) => row.advancedModels, cell: (row) => fmt(f.advancedCount, { count: row.advancedModels }) },
  { id: "estimate", header: f.colEstimate, sortValue: (row) => row.estimate?.pairs ?? 0, cell: (row) => <EstimateCell row={row} /> },
];

function SwitchItem({ on, text }: { on: boolean; text: string }) {
  const Icon = on ? CircleCheck : CircleSlash;
  return (
    <li className="flex min-w-0 items-start gap-2 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", on ? "text-[var(--admin-success)]" : "text-[var(--admin-warning)]")} aria-hidden="true" />
      <span className="min-w-0">{text}</span>
    </li>
  );
}

// -----------------------------------------------------------------------------
// Editor + preview of one exhibitor's text
// -----------------------------------------------------------------------------

type Field = "subject" | "text";

function Editor({ row, eventTitle, preview, query, onQueryChange, actions }: {
  row: Row;
  eventTitle: string;
  preview: FollowUpPreviewSource | undefined;
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  actions: FollowUpActions;
}) {
  const id = useId();
  const base = row.draft ?? row.active;
  const [subject, setSubject] = useState(base?.subject ?? "");
  const [text, setText] = useState(base?.plainText ?? "");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<Field>("text");

  const shown = followUpPreview({ subject, plainText: text }, preview?.values ?? {}, { exhibitor: preview?.values.izlagac ?? row.name, event: preview?.values.dogadjaj ?? eventTitle });
  const problem = shown && "problem" in shown ? shown.problem : null;
  const dirty = subject !== (row.draft?.subject ?? row.active?.subject ?? "") || text !== (row.draft?.plainText ?? row.active?.plainText ?? "");
  const savedDraft = row.draft && !dirty ? row.draft : null;

  async function run(action: () => Promise<FollowUpOutcome>, success: string) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.ok ? { tone: "ok", text: success } : { tone: "error", text: interactionCodeText(outcome.code) });
    } finally {
      setPending(false);
    }
  }

  function insert(field: (typeof FAIR_FOLLOW_UP_FIELDS)[number]) {
    const token = `{${field}}`;
    const target = lastField.current === "subject" ? subjectRef.current : textRef.current;
    const value = lastField.current === "subject" ? subject : text;
    const next = insertAtCursor(value, target?.selectionStart ?? value.length, target?.selectionEnd ?? value.length, token);
    if (lastField.current === "subject") setSubject(next.text.replace(/[\r\n]+/g, " "));
    else setText(next.text);
    requestAnimationFrame(() => {
      target?.focus();
      target?.setSelectionRange(next.caret, next.caret);
    });
  }

  function save(event: FormEvent) {
    event.preventDefault();
    if (!subject.trim() || !text.trim() || problem !== null) return;
    void run(() => actions.saveDraft(row.participationId, subject.trim(), text), f.saved);
  }

  return (
    <AdminPanel className="min-w-0 p-4 sm:p-5">
      <h2 className="text-lg font-semibold tracking-[-0.025em] [overflow-wrap:anywhere]">{fmt(f.editorTitle, { exhibitor: row.name })}</h2>
      <p className="mt-1 max-w-3xl text-sm text-[var(--admin-text-muted)]">{f.editorHelp}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <TextState row={row} />
      </div>
      {row.advancedModels === 0 ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3 text-sm font-semibold">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{f.noAdvanced}
        </p>
      ) : null}
      {row.modelTexts > 0 && !row.active ? <p className="mt-2 text-sm text-[var(--admin-text-muted)]">{fmt(f.modelTexts, { count: row.modelTexts })}</p> : null}
      <div className="mt-4 grid min-w-0 gap-5 xl:grid-cols-2">
        <form className="grid min-w-0 content-start gap-3" onSubmit={save}>
          <label htmlFor={`${id}-subject`} className="grid gap-1.5 text-sm font-semibold">{f.subject}
            <input
              id={`${id}-subject`}
              ref={subjectRef}
              value={subject}
              maxLength={FAIR_FOLLOW_UP_SUBJECT_MAX}
              onFocus={() => { lastField.current = "subject"; }}
              onChange={(event) => setSubject(event.target.value.replace(/[\r\n]+/g, " "))}
              className={adminFieldClass}
            />
          </label>
          <fieldset className="grid min-w-0 gap-2 rounded-lg border border-[var(--admin-border)] p-3">
            <legend className="px-1 text-sm font-semibold">{f.fieldsTitle}</legend>
            <p className="text-xs text-[var(--admin-text-muted)]">{f.fieldsHelp}</p>
            <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-1">
              {FAIR_FOLLOW_UP_FIELDS.map((field) => (
                <li key={field} className="flex min-w-0 items-start gap-2">
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => insert(field)}
                    aria-label={fmt(f.insertAria, { field: `{${field}}` })}
                    className="min-h-8 shrink-0 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 font-mono text-xs font-semibold hover:border-[var(--admin-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]"
                  >
                    {`{${field}}`}
                  </button>
                  <span className="min-w-0 pt-1 text-xs text-[var(--admin-text-muted)]">{f.fields[field]}</span>
                </li>
              ))}
            </ul>
          </fieldset>
          <label htmlFor={`${id}-text`} className="grid gap-1.5 text-sm font-semibold">{f.text}
            <textarea
              id={`${id}-text`}
              ref={textRef}
              value={text}
              rows={9}
              maxLength={FAIR_FOLLOW_UP_TEXT_MAX}
              onFocus={() => { lastField.current = "text"; }}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={problem !== null}
              aria-describedby={problem !== null ? `${id}-problem` : undefined}
              className={cn(adminFieldClass, "py-2 font-normal")}
            />
          </label>
          {problem !== null ? <p id={`${id}-problem`} role="alert" className="rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 text-sm font-semibold">{fmt(f.unknownField, { field: problem })}</p> : null}
          {dirty ? <Meta>{f.unsaved}</Meta> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={adminPrimaryButtonClass} disabled={pending || !dirty || !subject.trim() || !text.trim() || problem !== null}>{f.saveDraft}</button>
            {savedDraft ? (
              <ConfirmAction label={f.activate} body={f.activateConfirm} disabled={pending} onConfirm={() => void run(() => actions.activate(savedDraft.templateId), f.activated)} />
            ) : null}
            {row.active ? (
              <ConfirmAction label={f.retire} body={f.retireConfirm} disabled={pending} onConfirm={() => void run(() => actions.retire(row.active!.templateId), f.retired)} />
            ) : null}
          </div>
          <Feedback message={message} />
        </form>
        <section aria-label={f.previewTitle} className="grid min-w-0 content-start gap-3">
          <h3 className="text-base font-semibold">{f.previewTitle}</h3>
          {preview === undefined ? <AdminLoadingState label={f.previewLoading} /> : (
            <>
              <label htmlFor={`${id}-lead`} className="grid gap-1.5 text-sm font-semibold">{f.previewSource}
                <select id={`${id}-lead`} value={query.lead ?? ""} onChange={(event) => onQueryChange({ lead: event.target.value || null })} className={adminFieldClass}>
                  <option value="">{f.previewSample}</option>
                  {preview.leads.map((lead) => (
                    <option key={lead.leadId} value={lead.leadId}>{fmt(f.previewLeadOption, { name: lead.contactName, kind: dict.leadKinds[lead.kind], date: eventDateTime.format(lead.createdAt) })}</option>
                  ))}
                </select>
              </label>
              {preview.source === "sample" ? <Meta>{f.previewSampleNote}</Meta> : null}
              <article className="grid min-w-0 gap-3 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 text-sm leading-6">
                {shown && !("problem" in shown) ? (
                  <>
                    <p className="border-b border-[var(--admin-border)] pb-2 [overflow-wrap:anywhere]"><span className="text-[var(--admin-text-muted)]">{f.previewSubject}</span> <strong className="font-semibold">{shown.subject}</strong></p>
                    {shown.paragraphs.map((paragraph, index) => (
                      <p key={index} className={cn("whitespace-pre-wrap [overflow-wrap:anywhere]", index >= shown.paragraphs.length - 2 ? "text-xs text-[var(--admin-text-muted)]" : "")}>{paragraph}</p>
                    ))}
                  </>
                ) : <p className="text-[var(--admin-text-muted)]">{problem !== null ? fmt(f.unknownField, { field: problem }) : f.previewEmpty}</p>}
              </article>
            </>
          )}
        </section>
      </div>
    </AdminPanel>
  );
}

export function EventFollowUpView({ exhibitors, eventTitle, rows: source, estimate, switches, preview, query, onQueryChange, actions }: EventFollowUpViewProps) {
  const names = new Map(exhibitors.map((row) => [row.id, row.name]));
  const estimates = new Map((estimate?.byParticipation ?? []).map((row) => [row.participationId, row]));
  const rows: Row[] | undefined = source?.map((row) => ({ ...row, name: names.get(row.participationId) ?? row.participationId, state: followUpTextState(row), estimate: estimates.get(row.participationId) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "sr-Latn-RS"));
  const selected = pickFollowUpExhibitor(rows, query.izlagac);

  return (
    <div className="grid min-w-0 gap-4">
      <Section title={dict.sectionLabels["leadovi/follow-up"]}>
        <p className="mb-3 max-w-3xl text-sm text-[var(--admin-text-muted)]">{f.help}</p>
        {switches ? (
          <section aria-label={f.statusLabel} className="grid gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3">
            <h3 className="text-sm font-semibold">{f.statusLabel}</h3>
            <ul className="grid gap-1.5 md:grid-cols-2">
              <SwitchItem on={switches.followUpEnabled} text={switches.followUpEnabled ? f.switchOn : f.switchOff} />
              {!switches.leadsEnabled ? <SwitchItem on={false} text={f.leadsOff} /> : null}
            </ul>
          </section>
        ) : null}
      </Section>
      {!exhibitors.length ? (
        <AdminPanel><AdminEmptyState title={f.noExhibitorsTitle} body={f.noExhibitorsBody} /></AdminPanel>
      ) : (
        <>
          <Section title={f.listTitle}>
            <AdminDataView
              listKey="dogadjaji.follow-up"
              caption={f.listTitle}
              rows={rows}
              loadingLabel={f.loading}
              getRowId={(row) => row.participationId}
              columns={columns}
              tableClassName="min-w-[44rem]"
              rowClassName={(row) => (row.participationId === selected?.participationId ? "bg-[var(--admin-surface-muted)]" : undefined)}
              toolbar={
                <div className="grid gap-0.5">
                  <p className="text-xs text-[var(--admin-text-muted)]">{f.estimateHelp}</p>
                  {estimate?.capped ? <Meta>{f.estimateCapped}</Meta> : null}
                </div>
              }
              empty={{ title: f.noExhibitorsTitle, body: f.noExhibitorsBody }}
              renderCard={(row) => (
                <AdminDataCard
                  title={row.name}
                  badges={<TextState row={row} />}
                  fields={[
                    { label: f.colAdvanced, value: fmt(f.advancedCount, { count: row.advancedModels }) },
                    { label: f.colEstimate, value: <EstimateCell row={row} /> },
                  ]}
                />
              )}
              rowActions={(row) => (
                <button
                  type="button"
                  className={cn(adminSecondaryButtonClass, "min-h-9 px-3")}
                  aria-label={fmt(f.editAria, { name: row.name })}
                  aria-pressed={row.participationId === selected?.participationId}
                  onClick={() => onQueryChange({ izlagac: row.participationId, lead: null })}
                >
                  <PencilLine className="size-4" aria-hidden="true" />{f.edit}
                </button>
              )}
            />
          </Section>
          {selected ? (
            <Editor
              key={`${selected.participationId}-${selected.draft?.version ?? 0}-${selected.draft?.updatedAt ?? 0}-${selected.active?.version ?? 0}`}
              row={selected}
              eventTitle={eventTitle}
              preview={preview}
              query={query}
              onQueryChange={onQueryChange}
              actions={actions}
            />
          ) : rows ? <AdminPanel><p className="text-sm">{f.pickExhibitor}</p></AdminPanel> : null}
        </>
      )}
    </div>
  );
}
