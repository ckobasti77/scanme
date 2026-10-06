"use client";

import { QrCode } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { issueText, type CatalogView, type EventsActions, type InventoryRowView, type Outcome, type Paged, type ResolveView } from "@/components/admin/admin-events";
import { AdminEmptyState, AdminPanel } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  adminFieldClass,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  type AdminColumn,
} from "@/components/admin/admin-ui";
import { Fact, Feedback, LoadMore, modelName, Section, type EventMessage } from "@/components/admin/events/event-ui";
import { BackLink } from "@/components/admin/events/sections/modeli-view";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import type { AdminEventsResolveProblem } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

// Admin UX A2 — `qr` (inventory, assign, release, resolve test) and
// `qr/[kod]` (one printed code). A4 replaces "Oslobodi" with "Upravljaj" and
// adds scan statistics and history.

function problemText(code: string) {
  return code in dict.resolveProblems ? dict.resolveProblems[code as AdminEventsResolveProblem] : fmt(dict.unknownProblem, { code });
}

function channelStateText(row: InventoryRowView) {
  return row.state ? dict.channelStates[row.state] : dict.unassigned;
}

function assignmentText(row: InventoryRowView) {
  return row.assignment ? (row.assignment.sameEvent ? row.assignment.modelName ?? row.assignment.modelId : dict.otherEvent) : dict.unassigned;
}

const inventoryColumns: AdminColumn<InventoryRowView>[] = [
  { id: "code", header: dict.colCode, rowHeader: true, sortValue: (row) => row.resolverCode, cell: (row) => <strong className="font-mono font-semibold">{row.resolverCode}</strong> },
  { id: "smq", header: dict.colSmq, sortValue: (row) => row.smqCode, cell: (row) => <span className="font-mono text-xs">{row.smqCode ?? "—"}</span> },
  { id: "state", header: dict.colChannelState, sortValue: channelStateText, cell: channelStateText },
  { id: "assignment", header: dict.colAssignment, sortValue: assignmentText, cell: assignmentText },
];

function ResolvePanel({ actions, initialCode = "" }: { actions: Pick<EventsActions, "resolveTest">; initialCode?: string }) {
  const [pending, setPending] = useState(false);
  const [resolveCode, setResolveCode] = useState(initialCode);
  const [resolved, setResolved] = useState<{ code: string; view: ResolveView } | null>(null);
  const [error, setError] = useState<EventMessage>(null);

  async function resolve() {
    const code = resolveCode.trim();
    if (!code) return;
    setPending(true);
    setError(null);
    try {
      const result = await actions.resolveTest(code);
      if (result.ok) setResolved({ code, view: result.value });
      else setError({ tone: "error", text: issueText(result.code) });
    } finally {
      setPending(false);
    }
  }

  return (
    <Section title={dict.resolveTitle}>
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.resolveHelp}</p>
      <form className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,16rem)_auto] sm:items-end sm:justify-start" onSubmit={(event) => { event.preventDefault(); void resolve(); }}>
        <label className="grid gap-1.5 text-sm font-semibold">{dict.resolveCode}<input value={resolveCode} onChange={(event) => setResolveCode(event.target.value)} autoComplete="off" spellCheck={false} className={cn(adminFieldClass, "font-mono uppercase")} /></label>
        <button type="submit" className={adminSecondaryButtonClass} disabled={pending || !resolveCode.trim()}>{dict.resolveSubmit}</button>
      </form>
      <Feedback message={error} />
      <div role="status" aria-live="polite">
        {resolved ? (
          <div className="mt-4 grid gap-1 rounded-xl bg-[var(--admin-surface-muted)] p-3 text-sm">
            <strong className="font-mono">{resolved.code}</strong>
            {resolved.view.outcome === "fair_model" ? <p>{dict.resolveOpens}: <span className="break-all font-mono">{resolved.view.path}</span></p>
              : resolved.view.outcome === "other" ? <p>{dict.resolveOther}</p>
              : <p>{dict.resolveBlocked}: {problemText(resolved.view.problem ?? "destination_missing")}{resolved.view.path ? <span className="block break-all font-mono text-xs text-[var(--admin-text-muted)]">{resolved.view.path}</span> : null}</p>}
            <p className="text-xs text-[var(--admin-text-muted)]">{dict.resolveLiveNote}</p>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

export function EventQrView({ catalog, inventory, actions, qrHref }: {
  catalog: CatalogView;
  inventory: Paged<InventoryRowView>;
  actions: Pick<EventsActions, "assignQr" | "releaseQr" | "resolveTest">;
  qrHref: (code: string) => string;
}) {
  const [message, setMessage] = useState<EventMessage>(null);
  const [pending, setPending] = useState(false);
  const [assignModel, setAssignModel] = useState("");
  const [assignCode, setAssignCode] = useState("");
  const [releasing, setReleasing] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState("");
  const free = catalog.models.filter((model) => !model.qrCode);

  async function run(action: () => Promise<Outcome>, success: string, after?: () => void) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await action();
      setMessage(outcome.ok ? { tone: "ok", text: success } : { tone: "error", text: issueText(outcome.code), issues: outcome.issues });
      if (outcome.ok) after?.();
    } finally {
      setPending(false);
    }
  }

  if (!catalog.qrConfigured) return <AdminPanel><AdminEmptyState title={dict.sectionLabels.qr} body={dict.qrNotConfigured} /></AdminPanel>;
  return (
    <div className="grid min-w-0 gap-5">
      <p className="text-sm text-[var(--admin-text-muted)]">{dict.qrSubtitle}</p>
      <Section title={dict.assignTitle}>
        {free.length ? (
          <form className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,14rem)_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); if (assignModel && assignCode.trim()) void run(() => actions.assignQr(assignModel, assignCode.trim()), dict.assignDone, () => { setAssignCode(""); setAssignModel(""); }); }}>
            <label className="grid gap-1.5 text-sm font-semibold">{dict.assignModel}
              <select value={assignModel} onChange={(event) => setAssignModel(event.target.value)} className={adminFieldClass}>
                <option value="">{dict.modelPickPlaceholder}</option>
                {free.map((model) => <option key={model.id} value={model.id}>{modelName(model)} · {model.brandName}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold">{dict.assignCode}
              <input value={assignCode} onChange={(event) => setAssignCode(event.target.value)} placeholder={dict.assignCodePlaceholder} autoComplete="off" spellCheck={false} className={cn(adminFieldClass, "font-mono uppercase")} />
            </label>
            <button type="submit" className={adminPrimaryButtonClass} disabled={pending || !assignModel || !assignCode.trim()}>{dict.assignSubmit}</button>
          </form>
        ) : <p className="text-sm text-[var(--admin-text-muted)]">{dict.assignNoModels}</p>}
      </Section>
      <Feedback message={message} />
      <Section title={dict.sectionLabels.qr}>
        <AdminDataView
          listKey="dogadjaji.qr"
          caption={dict.sectionLabels.qr}
          rows={inventory.status === "loading" ? undefined : inventory.rows}
          loadingLabel={dict.loading}
          empty={{ title: dict.sectionLabels.qr, body: dict.qrEmpty }}
          getRowId={(row) => row.cardId}
          columns={inventoryColumns}
          renderCard={(row) => (
            <AdminDataCard
              title={<span className="font-mono">{row.resolverCode}</span>}
              subtitle={row.smqCode ? <span className="font-mono">{row.smqCode}</span> : undefined}
              aside={<QrCode className="size-4" aria-hidden="true" />}
              fields={[{ label: dict.colChannelState, value: channelStateText(row) }, { label: dict.colAssignment, value: assignmentText(row) }]}
            />
          )}
          rowActions={(row) => (
            <>
              <Link href={qrHref(row.resolverCode)} className={adminSecondaryButtonClass} aria-label={`${dict.openDetail} ${row.resolverCode}`}>{dict.openDetail}</Link>
              {row.assignment?.sameEvent && releasing !== row.cardId ? <button type="button" className={adminSecondaryButtonClass} disabled={pending} onClick={() => { setReleasing(row.cardId); setReleaseReason(""); }}>{dict.release}</button> : null}
            </>
          )}
          rowDetail={(row) => (row.assignment?.sameEvent && releasing === row.cardId ? (
            <form className="grid gap-2 sm:max-w-md" onSubmit={(event) => { event.preventDefault(); const modelId = row.assignment!.modelId; if (releaseReason.trim()) void run(() => actions.releaseQr(modelId, releaseReason.trim()), dict.releaseDone, () => { setReleasing(null); setReleaseReason(""); }); }}>
              <label className="grid gap-1 text-xs font-semibold">{dict.releaseReason}<input autoFocus value={releaseReason} onChange={(event) => setReleaseReason(event.target.value)} className={adminFieldClass} /></label>
              <span className="flex flex-wrap gap-2">
                <button type="submit" className={adminPrimaryButtonClass} disabled={pending || !releaseReason.trim()}>{dict.releaseConfirm}</button>
                <button type="button" className={adminSecondaryButtonClass} onClick={() => { setReleasing(null); setReleaseReason(""); }}>{dict.cancel}</button>
              </span>
            </form>
          ) : null)}
        />
        <LoadMore list={inventory} />
      </Section>
      <ResolvePanel actions={actions} />
    </div>
  );
}

export function EventQrDetailView({ catalog, code, row, actions, listHref, modelHref, generalQrHref }: {
  catalog: CatalogView;
  code: string;
  /** The inventory row when it is among the loaded ones. */
  row: InventoryRowView | null;
  actions: Pick<EventsActions, "resolveTest">;
  listHref: string;
  modelHref: (modelId: string) => string;
  generalQrHref: string;
}) {
  const model = catalog.models.find((entry) => entry.qrCode === code) ?? null;
  return (
    <div className="grid min-w-0 gap-5">
      <BackLink href={listHref} label={dict.backToList} />
      <Section title={code} action={<Link href={generalQrHref} className={adminSecondaryButtonClass}>{dict.qrDetailGeneralAdmin}</Link>}>
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Fact label={dict.colSmq} value={<span className="font-mono">{row?.smqCode ?? "—"}</span>} />
          <Fact label={dict.colChannelState} value={row ? channelStateText(row) : "—"} />
          <Fact label={dict.qrDetailModel} value={model ? <Link href={modelHref(model.id)} className="underline underline-offset-4">{modelName(model)} · {model.brandName}</Link> : row ? assignmentText(row) : dict.unassigned} />
        </dl>
        {row ? null : <p className="mt-4 text-sm text-[var(--admin-text-muted)]">{dict.qrDetailNotLoaded}</p>}
      </Section>
      <ResolvePanel actions={actions} initialCode={code} />
    </div>
  );
}
