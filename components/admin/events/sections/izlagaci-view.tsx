"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { issueText, type EventClientView, type EventsActions, type Paged } from "@/components/admin/admin-events";
import { AdminEmptyState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  AdminFilterBar,
  adminPrimaryButtonClass,
  adminSecondaryButtonClass,
  type AdminColumn,
  type AdminFilterChip,
  type AdminFilterFacet,
} from "@/components/admin/admin-ui";
import { Feedback, LoadMore, Meta, SegmentStatus, Section, type EventMessage } from "@/components/admin/events/event-ui";
import { ExhibitorLogo, ExhibitorWebsiteLink } from "@/components/admin/events/exhibitor-identity";
import type { FollowUpTextState } from "@/components/admin/events/leads-logic";
import {
  applyExhibitorFilters,
  clearExhibitorFiltersPatch,
  EXHIBITOR_SEGMENT_VALUES,
  exhibitorSegmentCounts,
  type ExhibitorRow,
} from "@/lib/admin-v1/exhibitors";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { adminUiSr } from "@/lib/i18n/sr/admin-ui";
import { cn } from "@/lib/utils";

// Admin UX A5 — `izlagaci` (formerly "Event-only klijenti"): every exhibitor
// of the event, event_only and standard, with brands, models per package, QR
// coverage, leads, follow-up (A8: the state of the exhibitor's text) and
// stands; filter by segment and search (query
// string). A row opens Modeli filtered to the exhibitor. "Prebaci u redovne
// klijente" stays for event_only exhibitors and, in a collapsed list, for
// event_only clients without a participation in this event.

const list = dict.exhibitorList;

function ModelsCell({ row }: { row: ExhibitorRow }) {
  return (
    <>
      <strong className="font-semibold tabular-nums">{row.models.total}</strong>
      <Meta>{fmt(list.modelsByTier, { included: row.models.included, starter: row.models.starter, advanced: row.models.advanced })}</Meta>
    </>
  );
}

function QrCell({ row }: { row: ExhibitorRow }) {
  const { assigned, total } = row.qr;
  const tone = !total ? "neutral" : assigned === total ? "active" : "waiting";
  return (
    <span aria-label={fmt(list.qrCoverageAria, { assigned, total })}>
      <AdminStatus label={`${assigned}/${total}`} tone={tone} className="whitespace-nowrap tabular-nums" />
    </span>
  );
}

function LeadsCell({ row }: { row: ExhibitorRow }) {
  if (!row.leads) return <span className="text-[var(--admin-text-muted)]">{list.none}</span>;
  return (
    <>
      <strong className="font-semibold tabular-nums">{row.leads.total}</strong>
      {row.leads.undelivered ? <Meta>{fmt(list.leadsUndelivered, { count: row.leads.undelivered })}</Meta> : null}
    </>
  );
}

/** A8 — the state of the exhibitor's follow-up text (fairFollowUps.getExhibitorFollowUps); unknown while it loads. */
export type ExhibitorFollowUpState = { state: FollowUpTextState; advancedModels: number };

function FollowUpCell({ row, followUps, followUpHref }: { row: ExhibitorRow; followUps?: ReadonlyMap<string, ExhibitorFollowUpState>; followUpHref?: (participationId: string) => string }) {
  const value = followUps?.get(row.id);
  if (!followUps || !value) return <span title={list.followUpPendingHint} className="text-[var(--admin-text-muted)]">{list.followUpPending}<span className="sr-only">{list.followUpPendingHint}</span></span>;
  if (value.state === "none" && value.advancedModels === 0) return <AdminStatus label={list.followUpNoAdvanced} tone="muted" className="whitespace-nowrap" />;
  const badge = <AdminStatus label={dict.followUps.states[value.state]} tone={value.state === "active" ? "active" : "waiting"} className="whitespace-nowrap" />;
  return followUpHref ? <Link href={followUpHref(row.id)} aria-label={fmt(list.followUpOpenAria, { name: row.name })} className="inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{badge}</Link> : badge;
}

/** SMK above SML, each on one line (the joined `codes` is "SMK · SML"). */
function CodesCell({ row }: { row: ExhibitorRow }) {
  return <span className="grid font-mono text-xs leading-5 whitespace-nowrap">{row.codes.split(" · ").map((code) => <span key={code}>{code}</span>)}</span>;
}

type FollowUpColumn = { followUps?: ReadonlyMap<string, ExhibitorFollowUpState>; followUpHref?: (participationId: string) => string };

/** Izlagači 2026 — logo, name (to the exhibitor's cars) and website. */
function NameCell({ row, href }: { row: ExhibitorRow; href: string }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <ExhibitorLogo name={row.name} logoUrl={row.logoUrl} size="sm" />
      <span className="grid min-w-0">
        <Link href={href} className="font-semibold underline-offset-4 [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">{row.name}</Link>
        {row.websiteUrl ? <ExhibitorWebsiteLink url={row.websiteUrl} ariaLabel={fmt(dict.interactionExhibitors.websiteAria, { name: row.name })} className="min-h-6 w-fit max-w-full" /> : null}
      </span>
    </span>
  );
}

function exhibitorColumns(modelsHref: (participationId: string) => string, convertButton: (row: ExhibitorRow, compact: boolean) => ReactNode, followUp: FollowUpColumn): AdminColumn<ExhibitorRow>[] {
  return [
    {
      id: "name", header: list.colExhibitor, rowHeader: true, sortValue: (row) => row.name,
      cell: (row) => <NameCell row={row} href={modelsHref(row.id)} />,
    },
    { id: "codes", header: list.colCodes, sortValue: (row) => row.codes, cell: (row) => <CodesCell row={row} /> },
    // In the table the move to regular clients sits under the segment it changes (keeps the row narrow).
    { id: "segment", header: list.colSegment, sortValue: (row) => row.segment, cell: (row) => <span className="grid justify-items-start gap-1"><span className="whitespace-nowrap"><SegmentStatus segment={row.segment} /></span>{row.segment === "event_only" ? convertButton(row, true) : null}</span> },
    { id: "brands", header: list.colBrands, sortValue: (row) => row.brands.join(", "), cell: (row) => (row.brands.length ? row.brands.join(", ") : <span className="text-[var(--admin-text-muted)]">{list.none}</span>) },
    { id: "models", header: list.colModels, sortValue: (row) => row.models.total, cell: (row) => <ModelsCell row={row} /> },
    { id: "qr", header: list.colQr, sortValue: (row) => (row.qr.total ? row.qr.assigned / row.qr.total : -1), cell: (row) => <QrCell row={row} /> },
    { id: "leads", header: list.colLeads, sortValue: (row) => row.leads?.total ?? null, cell: (row) => <LeadsCell row={row} /> },
    { id: "followUp", header: list.colFollowUp, hideBelow: "2xl", cell: (row) => <FollowUpCell row={row} {...followUp} /> },
    { id: "stands", header: list.colStands, hideBelow: "2xl", sortValue: (row) => row.stands.join(", "), cell: (row) => <span className="text-xs">{row.stands.length ? row.stands.join(", ") : list.none}</span> },
  ];
}

/** Inline confirmation of "Prebaci u redovne klijente" (the account keeps its ID, contacts, QR and history). */
function useConvert(actions: Pick<EventsActions, "convert">) {
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
  const button = (accountId: string, name: string, compact = false) => (confirming === accountId ? null : (
    <button
      type="button"
      className={compact
        ? "min-h-6 text-left text-xs font-semibold underline underline-offset-4 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]"
        : cn(adminSecondaryButtonClass, "min-h-9 px-3")}
      disabled={pending}
      aria-label={fmt(list.convertAria, { name })}
      onClick={() => setConfirming(accountId)}
    >
      {dict.convert}
    </button>
  ));
  const confirm = (accountId: string, name: string) => (confirming === accountId ? (
    <span className="grid gap-2 sm:max-w-sm">
      <span className="text-sm">{fmt(dict.convertConfirmBody, { name })}</span>
      <span className="flex flex-wrap gap-2">
        <button type="button" autoFocus className={adminPrimaryButtonClass} disabled={pending} onClick={() => void convert(accountId)}>{dict.convertConfirm}</button>
        <button type="button" className={adminSecondaryButtonClass} disabled={pending} onClick={() => setConfirming(null)}>{dict.cancel}</button>
      </span>
    </span>
  ) : null);
  return { button, confirm, message };
}

export type EventExhibitorsViewProps = {
  /** buildExhibitorRows(catalog, leadCounts). */
  exhibitors: ExhibitorRow[];
  leadsCapped: boolean;
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  /** `modeli?izlagac=<participationId>`. */
  modelsHref: (participationId: string) => string;
  importHref: string;
  /** All event_only clients (paged); the ones with a participation here are shown above. */
  clients: Paged<EventClientView>;
  actions: Pick<EventsActions, "convert">;
  /** A8 — follow-up text state per participation; undefined = not loaded (the column shows "—"). */
  followUps?: ReadonlyMap<string, ExhibitorFollowUpState>;
  /** A8 — `leadovi/follow-up?izlagac=<participationId>`. */
  followUpHref?: (participationId: string) => string;
};

export function EventExhibitorsView({ exhibitors, leadsCapped, query, onQueryChange, modelsHref, importHref, clients, actions, followUps, followUpHref }: EventExhibitorsViewProps) {
  const filtered = applyExhibitorFilters(exhibitors, query);
  const counts = exhibitorSegmentCounts(exhibitors, query);
  const convert = useConvert(actions);
  const columns = exhibitorColumns(modelsHref, (row, compact) => convert.button(row.accountId, row.name, compact), { followUps, followUpHref });
  const participants = new Set(exhibitors.map((row) => row.accountId));
  const otherClients = clients.rows.filter((row) => !participants.has(row.accountId));

  const facets: AdminFilterFacet[] = [{
    id: "segment",
    label: list.facetSegment,
    options: EXHIBITOR_SEGMENT_VALUES.map((value) => ({ value, label: list.segments[value], count: counts[value] })),
  }];
  const chips: AdminFilterChip[] = [];
  if (query.q) chips.push({ id: "q", label: fmt(list.searchChip, { q: query.q }), onRemove: () => onQueryChange({ q: null }) });
  if (query.segment && (EXHIBITOR_SEGMENT_VALUES as readonly string[]).includes(query.segment)) {
    chips.push({ id: "segment", label: `${list.facetSegment}: ${list.segments[query.segment as (typeof EXHIBITOR_SEGMENT_VALUES)[number]]}`, onRemove: () => onQueryChange({ segment: null }) });
  }
  const clear = () => onQueryChange(clearExhibitorFiltersPatch());

  return (
    <div className="grid min-w-0 gap-4">
      {exhibitors.length ? (
        <AdminFilterBar
          label={list.filterLabel}
          search={{ value: query.q ?? "", onChange: (q) => onQueryChange({ q: q || null }), label: list.searchLabel, placeholder: list.searchPlaceholder }}
          facets={facets}
          values={query}
          onFacetChange={(id, next) => onQueryChange({ [id]: next ?? null })}
          chips={chips}
          onClear={clear}
        />
      ) : null}
      <Section title={dict.sectionLabels.izlagaci}>
        <p className="mb-4 text-sm text-[var(--admin-text-muted)]">{list.subtitle}</p>
        {exhibitors.length ? (
          <AdminDataView
            listKey="dogadjaji.izlagaci"
            caption={dict.sectionLabels.izlagaci}
            rows={filtered}
            getRowId={(row) => row.id}
            columns={columns}
            tableClassName="min-w-[52rem]"
            toolbar={<p className="text-sm font-semibold" role="status" aria-live="polite">{fmt(list.count, { shown: filtered.length, total: exhibitors.length })}</p>}
            empty={
              <div className="grid justify-items-center gap-2 pb-4">
                <AdminEmptyState title={list.noMatchTitle} body={list.noMatchBody} className="min-h-40" />
                <button type="button" onClick={clear} className={adminSecondaryButtonClass}>{adminUiSr.filters.clear}</button>
              </div>
            }
            renderCard={(row) => (
              <AdminDataCard
                title={
                  <span className="flex min-w-0 items-center gap-3">
                    <ExhibitorLogo name={row.name} logoUrl={row.logoUrl} size="md" />
                    <span className="grid min-w-0">
                      <Link href={modelsHref(row.id)} className="text-base underline-offset-4 [overflow-wrap:anywhere] hover:underline">{row.name}</Link>
                      {row.websiteUrl ? <ExhibitorWebsiteLink url={row.websiteUrl} ariaLabel={fmt(dict.interactionExhibitors.websiteAria, { name: row.name })} className="min-h-6 w-fit font-normal" /> : null}
                    </span>
                  </span>
                }
                subtitle={<span className="font-mono">{row.codes}</span>}
                badges={<><SegmentStatus segment={row.segment} /><QrCell row={row} /></>}
                fields={[
                  { label: list.colBrands, value: row.brands.length ? row.brands.join(", ") : list.none },
                  { label: list.colModels, value: <ModelsCell row={row} /> },
                  { label: list.colLeads, value: <LeadsCell row={row} /> },
                  { label: list.colFollowUp, value: <FollowUpCell row={row} followUps={followUps} followUpHref={followUpHref} /> },
                  { label: list.colStands, value: row.stands.length ? row.stands.join(", ") : list.none },
                ]}
              />
            )}
            rowActions={(row, context) => (
              <span className="flex flex-wrap justify-end gap-2">
                {context.view === "kartice" && row.segment === "event_only" ? convert.button(row.accountId, row.name) : null}
                <Link href={`/admin/klijenti/${encodeURIComponent(row.accountId)}`} aria-label={fmt(list.openProfileAria, { name: row.name })} className={cn(adminSecondaryButtonClass, "min-h-9 px-3 whitespace-nowrap")}>
                  {list.openProfile}
                </Link>
                <Link href={modelsHref(row.id)} aria-label={fmt(list.openModelsAria, { name: row.name })} className={cn(adminSecondaryButtonClass, "min-h-9 px-3 whitespace-nowrap")}>
                  {list.openModels}<ChevronRight className="size-4" aria-hidden="true" />
                </Link>
              </span>
            )}
            rowDetail={(row) => convert.confirm(row.accountId, row.name)}
          />
        ) : (
          <div className="grid justify-items-center gap-2 pb-4">
            <AdminEmptyState title={list.emptyTitle} body={list.emptyBody} className="min-h-40" />
            <Link href={importHref} className={adminPrimaryButtonClass}>{list.emptyAction}</Link>
          </div>
        )}
        {leadsCapped ? <p className="mt-3 text-xs text-[var(--admin-text-muted)]">{list.leadsCapped}</p> : null}
      </Section>
      <Feedback message={convert.message} />
      <AdminPanel className="min-w-0 p-4 sm:p-5">
        <details>
          <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">
            {list.otherClientsTitle}{clients.status === "ready" ? ` (${otherClients.length}${clients.canLoadMore ? "+" : ""})` : ""}
          </summary>
          <p className="mt-3 mb-4 text-sm text-[var(--admin-text-muted)]">{list.otherClientsHelp}</p>
          <AdminDataView
            listKey="dogadjaji.izlagaci.ostali"
            caption={list.otherClientsTitle}
            rows={clients.status === "loading" ? undefined : otherClients}
            loadingLabel={dict.loading}
            empty={{ title: list.otherClientsTitle, body: list.otherClientsEmpty }}
            getRowId={(row) => row.accountId}
            columns={otherClientColumns}
            renderCard={(row) => <AdminDataCard title={row.name} subtitle={<span className="font-mono">{row.smkCode ?? list.none}</span>} badges={<SegmentStatus segment="event_only" />} />}
            rowActions={(row) => convert.button(row.accountId, row.name)}
            rowDetail={(row) => convert.confirm(row.accountId, row.name)}
          />
          <LoadMore list={clients} />
        </details>
      </AdminPanel>
    </div>
  );
}

const otherClientColumns: AdminColumn<EventClientView>[] = [
  { id: "name", header: dict.colName, rowHeader: true, sortValue: (row) => row.name, cell: (row) => <strong className="font-semibold">{row.name}</strong> },
  { id: "smk", header: dict.colCode, sortValue: (row) => row.smkCode, cell: (row) => <span className="font-mono text-xs">{row.smkCode ?? list.none}</span> },
  { id: "segment", header: dict.colSegment, cell: () => <SegmentStatus segment="event_only" /> },
];
