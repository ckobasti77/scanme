"use client";

import { useState } from "react";
import { issueText, type EventClientView, type EventsActions, type Paged } from "@/components/admin/admin-events";
import { AdminDataCard, AdminDataView, adminPrimaryButtonClass, adminSecondaryButtonClass, type AdminColumn } from "@/components/admin/admin-ui";
import { Feedback, LoadMore, SegmentStatus, Section, type EventMessage } from "@/components/admin/events/event-ui";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Admin UX A2 — `izlagaci` (formerly "Event-only klijenti"): the event-only
// clients and their move to regular clients. A5 lists every exhibitor of
// the event here.

const eventClientColumns: AdminColumn<EventClientView>[] = [
  { id: "name", header: dict.colName, rowHeader: true, sortValue: (row) => row.name, cell: (row) => <strong className="font-semibold">{row.name}</strong> },
  { id: "smk", header: dict.colCode, sortValue: (row) => row.smkCode, cell: (row) => <span className="font-mono text-xs">{row.smkCode ?? "—"}</span> },
  { id: "segment", header: dict.colSegment, cell: () => <SegmentStatus segment="event_only" /> },
];

export function EventExhibitorsView({ clients, actions }: { clients: Paged<EventClientView>; actions: Pick<EventsActions, "convert"> }) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<EventMessage>(null);
  async function convert(accountId: string) {
    setPending(true);
    try {
      const outcome = await actions.convert(accountId);
      setMessage(outcome.ok ? { tone: "ok", text: dict.convertDone } : { tone: "error", text: issueText(outcome.code) });
      setConfirming(null);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="grid min-w-0 gap-5">
      <Section title={dict.sectionLabels.izlagaci}>
        <p className="mb-4 text-sm text-[var(--admin-text-muted)]">{dict.clientsSubtitle}</p>
        <AdminDataView
          listKey="dogadjaji.izlagaci"
          caption={dict.sectionLabels.izlagaci}
          rows={clients.status === "loading" ? undefined : clients.rows}
          loadingLabel={dict.loading}
          empty={{ title: dict.sectionLabels.izlagaci, body: dict.clientsEmpty }}
          getRowId={(row) => row.accountId}
          columns={eventClientColumns}
          renderCard={(row) => <AdminDataCard title={row.name} subtitle={<span className="font-mono">{row.smkCode ?? "—"}</span>} badges={<SegmentStatus segment="event_only" />} />}
          rowActions={(row) => (confirming === row.accountId ? null : <button type="button" className={adminSecondaryButtonClass} disabled={pending} onClick={() => setConfirming(row.accountId)}>{dict.convert}</button>)}
          rowDetail={(row) => (confirming === row.accountId ? (
            <span className="grid gap-2 sm:max-w-sm">
              <span className="text-sm">{fmt(dict.convertConfirmBody, { name: row.name })}</span>
              <span className="flex flex-wrap gap-2">
                <button type="button" autoFocus className={adminPrimaryButtonClass} disabled={pending} onClick={() => void convert(row.accountId)}>{dict.convertConfirm}</button>
                <button type="button" className={adminSecondaryButtonClass} disabled={pending} onClick={() => setConfirming(null)}>{dict.cancel}</button>
              </span>
            </span>
          ) : null)}
        />
        <LoadMore list={clients} />
      </Section>
      <Feedback message={message} />
    </div>
  );
}
