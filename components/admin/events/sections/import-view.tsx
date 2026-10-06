"use client";

import { FileJson } from "lucide-react";
import { useId, useRef, useState } from "react";
import { issueText, type CommitView, type DryRunView, type EventsActions } from "@/components/admin/admin-events";
import { adminFieldClass, adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/components/admin/admin-ui";
import { IssueList, Section } from "@/components/admin/events/event-ui";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Admin UX A2 — `import`: paste/upload → dryRun → commit (JSON v1). A5 adds
// the table import guide.

export function EventImportView({ actions }: { actions: Pick<EventsActions, "dryRun" | "commit"> }) {
  const textId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [checked, setChecked] = useState<{ text: string; view: DryRunView } | null>(null);
  const [committed, setCommitted] = useState<CommitView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canCommit = checked !== null && checked.text === text && checked.view.ok && !pending;

  function parse(): { ok: true; value: unknown } | { ok: false } {
    try {
      return { ok: true, value: JSON.parse(text) };
    } catch {
      setError(dict.importInvalidJson);
      return { ok: false };
    }
  }

  async function dryRun() {
    setError(null);
    setCommitted(null);
    const parsed = parse();
    if (!parsed.ok) return;
    setPending(true);
    try {
      const result = await actions.dryRun(parsed.value);
      if (result.ok) setChecked({ text, view: result.value });
      else { setChecked(null); setError(result.code === "ACTION_FAILED" ? dict.importShapeInvalid : issueText(result.code)); }
    } finally {
      setPending(false);
    }
  }

  async function commit() {
    const parsed = parse();
    if (!parsed.ok || !canCommit) return;
    setPending(true);
    setError(null);
    try {
      const result = await actions.commit(parsed.value);
      if (result.ok) { setCommitted(result.value); setChecked(null); }
      else setError(issueText(result.code));
    } finally {
      setPending(false);
    }
  }

  const summary = checked?.text === text ? checked.view : null;
  const entities = [["participations", dict.entityParticipations], ["stands", dict.entityStands], ["models", dict.entityModels]] as const;
  return (
    <div className="grid min-w-0 gap-5">
      <Section title={dict.importTitle}>
        <p className="text-sm text-[var(--admin-text-muted)]">{dict.importHelp}</p>
        <div className="mt-4 grid gap-3">
          <label htmlFor={textId} className="text-sm font-semibold">{dict.importTextLabel}</label>
          <textarea id={textId} value={text} onChange={(event) => setText(event.target.value)} rows={10} spellCheck={false} className={cn(adminFieldClass, "min-h-48 py-2 font-mono text-xs")} />
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then((value) => { setText(value); setError(null); }); event.target.value = ""; }} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={adminSecondaryButtonClass} onClick={() => fileRef.current?.click()}><FileJson className="size-4" aria-hidden="true" />{dict.importFile}</button>
            <button type="button" className={adminSecondaryButtonClass} disabled={pending || !text.trim()} onClick={() => void dryRun()}>{dict.dryRun}</button>
            <button type="button" className={adminPrimaryButtonClass} disabled={!canCommit} onClick={() => void commit()}>{dict.commit}</button>
          </div>
          {!canCommit ? <p className="text-xs text-[var(--admin-text-muted)]">{dict.commitNeedsDryRun}</p> : null}
        </div>
      </Section>
      <div role="status" aria-live="polite" className="grid gap-5">
        {error ? <p className="rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 text-sm font-semibold">{error}</p> : null}
        {summary ? (
          <Section title={dict.issuesTitle}>
            <p className="mb-3 text-sm font-semibold">{summary.ok ? dict.dryRunOk : dict.dryRunFailed}</p>
            <ul className="mb-4 grid gap-1 text-sm">
              {entities.map(([key, label]) => <li key={key}>{fmt(dict.summaryLine, { entity: label, new: summary.summary[key].new, existing: summary.summary[key].existing })}</li>)}
              <li>{fmt(dict.summaryUpgrades, { count: summary.summary.upgrades })}</li>
              <li>{fmt(dict.summaryQr, { count: summary.summary.qrAssignments })}</li>
            </ul>
            <IssueList issues={summary.issues} />
          </Section>
        ) : null}
        {committed ? (
          <Section title={committed.committed ? dict.commitDone : dict.commitRejected}>
            <ul className="mb-4 grid gap-1 text-sm">
              {entities.map(([key, label]) => <li key={key}>{fmt(dict.commitLine, { entity: label, ...committed.results[key] })}</li>)}
              <li>{fmt(dict.summaryUpgrades, { count: committed.results.upgrades })}</li>
              <li>{fmt(dict.summaryQr, { count: committed.results.qrAssignments })}</li>
            </ul>
            <IssueList issues={committed.issues} />
          </Section>
        ) : null}
      </div>
    </div>
  );
}
