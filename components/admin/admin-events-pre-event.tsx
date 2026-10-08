"use client";

import { useId, useState } from "react";
import { AdminEmptyState, AdminPanel } from "@/components/admin/admin-primitives";
import {
  Feedback,
  Meta,
  Row,
  RowList,
  Section,
  dateTime,
  field,
  interactionCodeText,
  primaryButton,
  secondaryButton,
} from "@/components/admin/admin-events-interactions";
import type { FairPreEventSummary } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Sajam 2026 P1 (Aleksa, 8. 10. 2026) — „Pre-event podaci“ in `brisanje`:
// how many visitor rows of this event were written before its start, per
// kind, a dry run, and „Resetuj pre-event podatke“ once the event's slug is
// typed back. Presentational only; data and actions come from
// brisanje-section.tsx (convex/fairPreEvent.ts). The reset never touches the
// catalog, QR, consents, forms or anything written from the start on.

export type PreEventOutcome = { ok: true; total: number; capped: boolean } | { ok: false; code: string };

export type PreEventActions = {
  /** Counts only; nothing is deleted. */
  dryRun: () => Promise<PreEventOutcome>;
  /** Starts the reset; refused unless `confirmSlug` is the event's slug. */
  reset: (confirmSlug: string) => Promise<PreEventOutcome>;
};

type Message = { tone: "ok" | "error"; text: string } | null;

/** The typed confirmation unlocks the delete only when it is exactly the event's slug. Pure; shared with the test. */
export function preEventConfirmMatches(typed: string, eventSlug: string): boolean {
  return eventSlug.length > 0 && typed.trim() === eventSlug;
}

export function AdminEventsPreEvent({ summary, actions }: { summary: FairPreEventSummary | undefined; actions: PreEventActions | undefined }) {
  const t = dict.preEvent;
  const inputId = useId();
  const hintId = useId();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  if (!summary || !actions) return <AdminPanel><AdminEmptyState title={t.title} body={t.unavailable} /></AdminPanel>;

  const count = (row: FairPreEventSummary["categories"][number]) => (row.capped ? fmt(t.countCapped, { count: row.count }) : String(row.count));
  const matches = preEventConfirmMatches(typed, summary.eventSlug);
  const closeConfirm = () => {
    setConfirming(false);
    setTyped("");
  };

  async function run(action: () => Promise<PreEventOutcome>, success: string, after?: () => void) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      if (outcome.ok) {
        setMessage({ tone: "ok", text: fmt(success, { total: outcome.total }) });
        after?.();
      } else {
        setMessage({ tone: "error", text: interactionCodeText(outcome.code) });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title={t.title} help={t.help}>
      <p className="break-words text-sm font-semibold">{fmt(t.boundary, { date: dateTime.format(summary.startsAt) })}</p>

      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{t.countsTitle}</h3>
        <strong className="text-sm tabular-nums">{fmt(summary.capped ? t.totalCapped : t.total, { total: summary.total })}</strong>
      </div>
      <Meta>{fmt(t.countsHelp, { cap: summary.capPerCategory })}</Meta>
      {summary.total === 0 ? (
        <p className="mt-3 text-sm">{t.empty}</p>
      ) : (
        <RowList>
          {summary.categories.map((row) => (
            <Row key={row.category}>
              <span className="min-w-0 break-words text-sm">{t.categories[row.category]}</span>
              <strong className="text-sm tabular-nums">{count(row)}</strong>
            </Row>
          ))}
        </RowList>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} disabled={pending} onClick={() => void run(actions.dryRun, t.dryRunDone)}>
          {t.dryRun}
        </button>
        {confirming ? null : (
          <button
            type="button"
            className={secondaryButton}
            disabled={pending}
            onClick={() => {
              setConfirming(true);
              setTyped("");
              setMessage(null);
            }}
          >
            {t.reset}
          </button>
        )}
      </div>

      {confirming ? (
        <div className="mt-4 grid gap-3 rounded-xl border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] p-3 sm:max-w-lg">
          <strong className="text-sm">{t.confirmTitle}</strong>
          <p className="text-sm">{t.confirmBody}</p>
          <label htmlFor={inputId} className="break-words text-sm font-semibold">{fmt(t.confirmLabel, { slug: summary.eventSlug })}</label>
          <input
            id={inputId}
            className={cn(field, "text-base sm:text-sm")}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-describedby={hintId}
          />
          <span id={hintId} className="block break-words text-xs text-[var(--admin-text-muted)]">{t.confirmHint}</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButton}
              disabled={pending || !matches}
              onClick={() => void run(() => actions.reset(typed.trim()), t.started, closeConfirm)}
            >
              {t.confirmButton}
            </button>
            <button type="button" className={secondaryButton} disabled={pending} onClick={closeConfirm}>
              {t.cancel}
            </button>
          </div>
        </div>
      ) : null}
      <Feedback message={message} />

      <h3 className="mt-5 text-sm font-semibold">{t.keptTitle}</h3>
      <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-sm">
        {t.kept.map((line) => <li key={line} className="break-words">{line}</li>)}
      </ul>
    </Section>
  );
}
