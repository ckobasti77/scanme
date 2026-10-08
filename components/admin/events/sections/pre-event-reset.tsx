"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { AdminPanel } from "@/components/admin/admin-primitives";
import { adminFieldClass, adminPrimaryButtonClass, adminSecondaryButtonClass } from "@/components/admin/admin-ui/admin-controls";
import { dateTime, interactionCodeText } from "@/components/admin/admin-events-interactions";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { attempt } from "@/components/admin/events/event-outcome";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// JOVAN-DELTA 2026-10-08b — "Resetuj pre-event podatke" on Pregled: the dry
// run (fairPreEvent.previewPreEventReset) shows what visitors did before the
// opening; the reset needs the typed word RESETUJ and the counts shown here.

const CONFIRM_WORD = "RESETUJ";
const PREVIEW_CAP = 1000;

export function PreEventResetCard() {
  const { eventId } = useAdminEvent();
  const preview = useQuery(api.fairPreEvent.previewPreEventReset, { eventId });
  const reset = useMutation(api.fairPreEvent.resetPreEventData);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const t = dict.preEventReset;

  const rows = preview ? (Object.entries(preview.counts) as [keyof typeof t.categories, number][]).filter(([, count]) => count > 0) : [];

  async function confirm() {
    if (!preview) return;
    setPending(true);
    setMessage(null);
    const result = await attempt(() => reset({ eventId, confirm: word, expected: preview.counts }));
    setPending(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: interactionCodeText(result.code) });
      return;
    }
    setOpen(false);
    setWord("");
    setMessage({ tone: "ok", text: `${fmt(t.done, { deleted: result.value.deleted })}${result.value.continuing ? ` ${t.continuing}` : ""}` });
  }

  return (
    <AdminPanel className="grid gap-3 p-4" aria-labelledby="pre-event-reset-title">
      <h2 id="pre-event-reset-title" className="text-base font-semibold">{t.title}</h2>
      {preview === undefined ? (
        <p className="text-sm text-[var(--admin-text-muted)]">{t.loading}</p>
      ) : (
        <>
          <p className="text-sm text-[var(--admin-text-muted)]">{fmt(t.body, { cutoff: dateTime.format(preview.cutoff) })}</p>
          {rows.length === 0 ? (
            <p className="text-sm">{t.empty}</p>
          ) : (
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm sm:max-w-md">
              {rows.map(([category, count]) => (
                <div key={category} className="contents">
                  <dt>{t.categories[category]}</dt>
                  <dd className="text-right tabular-nums">{count >= PREVIEW_CAP ? fmt(t.capped, { count }) : count}</dd>
                </div>
              ))}
            </dl>
          )}
          {rows.length > 0 && !open ? (
            <button type="button" className={`${adminSecondaryButtonClass} justify-self-start`} disabled={pending} onClick={() => { setOpen(true); setMessage(null); }}>
              {t.start}
            </button>
          ) : null}
          {rows.length > 0 && open ? (
            <div className="grid gap-2 rounded-xl border border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] p-3 sm:max-w-md">
              <label className="grid gap-1 text-sm font-semibold" htmlFor="pre-event-reset-word">
                {t.confirmLabel}
                <input id="pre-event-reset-word" className={adminFieldClass} value={word} autoComplete="off" autoCapitalize="characters" onChange={(event) => setWord(event.target.value)} />
              </label>
              <span className="flex flex-wrap gap-2">
                <button type="button" className={adminPrimaryButtonClass} disabled={pending || word.trim() !== CONFIRM_WORD} onClick={() => void confirm()}>
                  {fmt(t.confirm, { total: preview.total })}
                </button>
                <button type="button" className={adminSecondaryButtonClass} disabled={pending} onClick={() => { setOpen(false); setWord(""); }}>{t.cancel}</button>
              </span>
            </div>
          ) : null}
        </>
      )}
      {message ? <p role="status" className={message.tone === "error" ? "text-sm font-semibold text-[var(--admin-warning)]" : "text-sm font-semibold"}>{message.text}</p> : null}
    </AdminPanel>
  );
}
