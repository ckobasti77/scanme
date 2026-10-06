"use client";

import { CalendarClock, CircleSlash, Inbox, Link2, Mail, PanelRightOpen } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type ReactNode } from "react";
import type { CatalogView, ModelView, Paged } from "@/components/admin/admin-events";
import { ConfirmAction, Feedback, Meta, interactionCodeText, useRunner } from "@/components/admin/admin-events-interactions";
import { AdminEmptyState, AdminLoadingState, AdminPanel, AdminStatus } from "@/components/admin/admin-primitives";
import {
  AdminDataCard,
  AdminDataView,
  AdminFilterBar,
  AdminHierarchyPicker,
  adminFieldClass,
  adminSecondaryButtonClass,
  type AdminColumn,
  type AdminFilterChip,
} from "@/components/admin/admin-ui";
import { Feedback as EventFeedback, Section, eventDateTime, modelName, type EventMessage } from "@/components/admin/events/event-ui";
import { clearLeadInboxPatch, hasLeadInboxFilter, leadDeliveryDeadline, type LeadDeadline } from "@/components/admin/events/leads-logic";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { HierarchyData } from "@/lib/admin-v1/hierarchy";
import { modelHierarchy } from "@/lib/admin-v1/model-filters";
import type { AdminQueryPatch, AdminQueryState } from "@/lib/admin-v1/query-state";
import type { FairEmailDeliveryStatus, FairLeadActivityGroup, FairLeadKind, FairPackageTier } from "@/lib/fair-contract";
import { fmt } from "@/lib/i18n/format";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";
import { cn } from "@/lib/utils";

// Admin UX A8 — `leadovi` (ADMIN-UX §7; MASTER §8, §12, §13): the inbox of
// the event's leads with the Izlagač → Brend → Model, type, delivery and
// date filters, Tabela/Kartice, the lead detail in a drawer (`?lead=`) with
// the visitor's activity ONLY on that exhibitor's models, delivery to the
// exhibitor (one lead or the whole exhibitor), the PII file per exhibitor
// (moved here from Izveštaji), suppression and email retry. Presentational;
// data and actions come from leadovi-section.tsx (convex/fairLeadsInbox.ts,
// convex/fairLeadsAdmin.ts, convex/fairReports.ts). PII is shown only here,
// to ScanMe admins; the URL carries at most the lead id.

const t = dict.leadInbox;

export type InboxDelivery = { id: string; status: FairEmailDeliveryStatus; scheduledFor: number; lastError?: string } | null;
export type InboxLead = {
  id: string;
  createdAt: number;
  kind: FairLeadKind;
  modelId: string;
  participationId: string;
  contactName: string;
  email?: string;
  phone?: string;
  delivered: boolean;
  deliveredAt?: number;
  followUpSuppressed: boolean;
  confirmation: InboxDelivery;
  followUp: InboxDelivery;
};

type Group<T> = { shared: boolean; capped: boolean; items: T[] };
export type LeadActivityView = {
  tierAtLead: FairPackageTier;
  scans?: Group<{ eventModelId: string; firstAt: number; lastAt: number; count: number }>;
  ratings?: Group<{ eventModelId: string; at: number; overall?: number; appearance?: number; specifications?: number; price?: number }>;
  audienceVotes?: Group<{ eventModelId: string; at: number; prompt: string; answer: string }>;
  surveyAnswers?: Group<{ eventModelId: string; at: number; answers: { prompt: string; kind: "yes_no" | "single_choice"; answer: string }[] }>;
  passport?: Group<{ brandId: string; required: number | null; stamps: { eventModelId: string; at: number }[]; favoriteModelId?: string }>;
  sponsoredActions?: Group<{ eventModelId: string; kind: "open_model" | "garage_add"; at: number }>;
};
export type LeadDetail = {
  lead: InboxLead & { consentVersion: number; consentTextSnapshot: string; consentedAt: number; suppressedAt?: number };
  activity: LeadActivityView;
};

export type LeadActionOutcome = { ok: true } | { ok: false; code: string };
export type LeadInboxActions = {
  markDelivered: (leadIds: string[]) => Promise<LeadActionOutcome>;
  markExhibitorDelivered: (participationId: string) => Promise<{ ok: true; delivered: number; hasMore: boolean } | { ok: false; code: string }>;
  setSuppressed: (leadId: string, suppressed: boolean) => Promise<LeadActionOutcome>;
  retryDelivery: (deliveryId: string) => Promise<LeadActionOutcome>;
  exportLeads: (participationId: string, format: "csv" | "xlsx") => Promise<LeadActionOutcome>;
};

export type EventLeadsInboxViewProps = {
  catalog: CatalogView;
  /** The current page(s) of fairLeadsInbox.listEventLeads, already narrowed by brand. */
  leads: Paged<InboxLead>;
  query: AdminQueryState;
  onQueryChange: (patch: AdminQueryPatch) => void;
  /** `?lead=<id>` with the list filters (a link, so Back closes the drawer). */
  leadHref: (leadId: string) => string;
  /** Undelivered leads of the event (fairAdminStats.getLeadCounts); undefined = loading. */
  undelivered: { count: number; capped: boolean } | undefined;
  /** Minute clock for the deadline. */
  now: number;
  /** K3 switch (boolean only); undefined = loading. */
  leadsEnabled: boolean | undefined;
  /** The lead of `?lead=`; undefined = loading, null = not found. */
  detail: LeadDetail | null | undefined;
  links: { forms: string; followUp: string; settings: string };
  actions: LeadInboxActions;
};

// -----------------------------------------------------------------------------
// Shared text
// -----------------------------------------------------------------------------

function deliveryErrorText(lastError: string | undefined) {
  const code = (lastError ?? "").split(":")[0];
  return code in dict.deliveryErrors ? dict.deliveryErrors[code as keyof typeof dict.deliveryErrors] : null;
}

function emailLine(delivery: InboxDelivery, label: string, followUp: boolean) {
  if (!delivery) return fmt(label, { status: dict.deliveryNone });
  if (followUp && delivery.status === "queued") return fmt(dict.followUpPlanned, { date: eventDateTime.format(delivery.scheduledFor) });
  const error = delivery.status === "failed" || delivery.status === "skipped" ? deliveryErrorText(delivery.lastError) : null;
  const status = dict.deliveryStatus[delivery.status];
  return fmt(label, { status: error ? `${status} (${error})` : status });
}

function emailsText(row: InboxLead) {
  return [emailLine(row.confirmation, dict.confirmationLabel, false), ...(row.followUp ? [emailLine(row.followUp, dict.followUpLabel, true)] : [])].join(" · ");
}

function contactText(row: Pick<InboxLead, "email" | "phone">) {
  return `${row.email ?? dict.leadNoEmail} · ${row.phone ?? dict.leadNoPhone}`;
}

function DeliveredBadge({ row }: { row: Pick<InboxLead, "delivered"> }) {
  return <AdminStatus label={row.delivered ? t.delivered : t.notDelivered} tone={row.delivered ? "active" : "waiting"} />;
}

function deadlineText(deadline: LeadDeadline) {
  return deadline.kind === "passed" ? t.deadlinePassed : deadline.kind === "today" ? t.deadlineToday : fmt(t.deadlineDays, { days: deadline.days });
}

const dateOnly = new Intl.DateTimeFormat("sr-Latn-RS", { dateStyle: "medium", timeZone: "Europe/Belgrade" });

// -----------------------------------------------------------------------------
// Inbox
// -----------------------------------------------------------------------------

type Names = { model: (id: string) => ModelView | undefined; exhibitor: (id: string) => string };

function inboxColumns(names: Names): AdminColumn<InboxLead>[] {
  const modelText = (row: InboxLead) => {
    const model = names.model(row.modelId);
    return model ? modelName(model) : t.unknownModel;
  };
  return [
    {
      id: "name",
      header: t.colLead,
      rowHeader: true,
      sortValue: (row) => row.contactName,
      width: "16rem",
      cell: (row) => <><strong className="block font-semibold [overflow-wrap:anywhere]">{row.contactName}</strong><span className="block text-xs text-[var(--admin-text-muted)] [overflow-wrap:anywhere]">{contactText(row)}</span></>,
    },
    { id: "received", header: t.colReceived, sortValue: (row) => row.createdAt, cell: (row) => <span className="whitespace-nowrap">{eventDateTime.format(row.createdAt)}</span> },
    { id: "kind", header: t.colKindModel, sortValue: (row) => dict.leadKinds[row.kind], cell: (row) => <><span className="block">{dict.leadKinds[row.kind]}</span><Meta>{modelText(row)}</Meta></> },
    { id: "exhibitor", header: t.colExhibitor, hideBelow: "xl", sortValue: (row) => names.exhibitor(row.participationId), cell: (row) => names.exhibitor(row.participationId) },
    {
      id: "delivery",
      header: t.colDelivery,
      sortValue: (row) => (row.delivered ? 1 : 0),
      cell: (row) => <span className="grid justify-items-start gap-1"><DeliveredBadge row={row} />{row.deliveredAt ? <Meta>{fmt(t.deliveredOn, { date: eventDateTime.format(row.deliveredAt) })}</Meta> : null}</span>,
    },
    {
      id: "emails",
      header: t.colEmails,
      // The same lines are in the card and in the detail; the table keeps its actions in view up to 1536 px.
      hideBelow: "2xl",
      cell: (row) => <span className="grid justify-items-start gap-1"><Meta>{emailsText(row)}</Meta>{row.followUpSuppressed ? <AdminStatus label={dict.followUpSuppressedBadge} tone="neutral" /> : null}</span>,
    },
  ];
}

function DateField({ label, value, onChange }: { label: string; value: string | undefined; onChange: (next: string | null) => void }) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold">{label}</label>
      <input id={id} type="date" value={value ?? ""} min="2026-10-01" max="2026-11-15" onChange={(event) => onChange(event.target.value || null)} className={adminFieldClass} />
    </div>
  );
}

function InboxFilters({ hierarchy, query, onQueryChange }: { hierarchy: HierarchyData; query: AdminQueryState; onQueryChange: (patch: AdminQueryPatch) => void }) {
  const exhibitor = hierarchy.exhibitors.find((row) => row.id === query.izlagac);
  const brand = hierarchy.brands.find((row) => row.id === query.brend);
  const model = hierarchy.models.find((row) => row.id === query.model);
  const chips: AdminFilterChip[] = [];
  if (exhibitor) chips.push({ id: "izlagac", label: `${t.colExhibitor}: ${exhibitor.label}`, onRemove: () => onQueryChange({ izlagac: null, brend: null, model: null }) });
  if (brand) chips.push({ id: "brend", label: `${dict.colBrand}: ${brand.label}`, onRemove: () => onQueryChange({ brend: null, model: null }) });
  if (model) chips.push({ id: "model", label: `${dict.colModel}: ${model.label}`, onRemove: () => onQueryChange({ model: null }) });
  if (query.tip) chips.push({ id: "tip", label: fmt(t.chipKind, { value: t.kindOptions[query.tip as keyof typeof t.kindOptions] }), onRemove: () => onQueryChange({ tip: null }) });
  if (query.isporuka) chips.push({ id: "isporuka", label: fmt(t.chipDelivery, { value: t.deliveryOptions[query.isporuka as keyof typeof t.deliveryOptions] }), onRemove: () => onQueryChange({ isporuka: null }) });
  if (query.od) chips.push({ id: "od", label: fmt(t.chipFrom, { date: query.od }), onRemove: () => onQueryChange({ od: null }) });
  if (query.do) chips.push({ id: "do", label: fmt(t.chipTo, { date: query.do }), onRemove: () => onQueryChange({ do: null }) });
  return (
    <AdminFilterBar
      label={t.filtersLabel}
      hierarchy={
        <div className="grid min-w-0 gap-3">
          <AdminHierarchyPicker
            data={hierarchy}
            value={{ exhibitorId: query.izlagac, brandId: query.brend, modelId: query.model }}
            label={t.hierarchyLabel}
            onChange={(next) => onQueryChange({ izlagac: next.exhibitorId ?? null, brend: next.brandId ?? null, model: next.modelId ?? null, lead: null })}
          />
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:max-w-xl">
            <DateField label={t.fromLabel} value={query.od} onChange={(od) => onQueryChange({ od })} />
            <DateField label={t.toLabel} value={query.do} onChange={(next) => onQueryChange({ do: next })} />
          </div>
        </div>
      }
      facets={[
        { id: "tip", label: t.facetKind, options: (["zainteresovan", "probna-voznja"] as const).map((value) => ({ value, label: t.kindOptions[value] })) },
        { id: "isporuka", label: t.facetDelivery, options: (["ne", "da"] as const).map((value) => ({ value, label: t.deliveryOptions[value] })) },
      ]}
      values={query}
      onFacetChange={(id, next) => onQueryChange({ [id]: next ?? null })}
      chips={chips}
      onClear={() => onQueryChange(clearLeadInboxPatch())}
    />
  );
}

function HandOver({ exhibitorId, exhibitorName, actions }: { exhibitorId: string | undefined; exhibitorName: string | null; actions: LeadInboxActions }) {
  const exportRun = useRunner();
  const [markMessage, setMarkMessage] = useState<EventMessage>(null);
  const [markPending, setMarkPending] = useState(false);

  async function markAll(participationId: string) {
    setMarkPending(true);
    setMarkMessage(null);
    try {
      const outcome = await actions.markExhibitorDelivered(participationId);
      setMarkMessage(outcome.ok
        ? { tone: "ok", text: fmt(outcome.hasMore ? t.markExhibitorMore : t.markExhibitorDone, { count: outcome.delivered }) }
        : { tone: "error", text: interactionCodeText(outcome.code) });
    } finally {
      setMarkPending(false);
    }
  }

  return (
    <Section title={t.handOverTitle}>
      <p className="mb-3 max-w-3xl text-sm text-[var(--admin-text-muted)]">{t.handOverHelp}</p>
      {!exhibitorId || !exhibitorName ? (
        <p className="text-sm">{t.handOverPick}</p>
      ) : (
        <div className="grid gap-3">
          <p className="text-sm font-semibold [overflow-wrap:anywhere]">{fmt(t.handOverExhibitor, { name: exhibitorName })}</p>
          <Meta>{dict.reportsLeadsWarning}</Meta>
          <div className="flex flex-wrap gap-2">
            {(["csv", "xlsx"] as const).map((format) => (
              <button key={format} type="button" className={adminSecondaryButtonClass} disabled={exportRun.pending} onClick={() => void exportRun.run(() => actions.exportLeads(exhibitorId, format), t.exportDone)}>
                {fmt(t.exportDownload, { format: dict.reportsFormats[format] })}
              </button>
            ))}
            <ConfirmAction label={t.markExhibitor} body={t.markExhibitorConfirm} disabled={markPending} onConfirm={() => void markAll(exhibitorId)} />
          </div>
          <Feedback message={exportRun.message} />
          <EventFeedback message={markMessage} />
        </div>
      )}
    </Section>
  );
}

export function EventLeadsInboxView({ catalog, leads, query, onQueryChange, leadHref, undelivered, now, leadsEnabled, detail, links, actions }: EventLeadsInboxViewProps) {
  const rowRun = useRunner();
  const hierarchy = useMemo(() => modelHierarchy(catalog.models, modelName), [catalog.models]);
  const models = useMemo(() => new Map(catalog.models.map((model) => [model.id, model])), [catalog.models]);
  const exhibitors = useMemo(() => new Map(catalog.participations.map((row) => [row.id, row.exhibitorName])), [catalog.participations]);
  const names: Names = useMemo(() => ({ model: (id) => models.get(id), exhibitor: (id) => exhibitors.get(id) ?? t.unknownExhibitor }), [models, exhibitors]);
  const columns = useMemo(() => inboxColumns(names), [names]);
  const filtered = hasLeadInboxFilter(query);
  const deadline = leadDeliveryDeadline(now);
  const openLead = query.lead ? leads.rows.find((row) => row.id === query.lead) ?? null : null;

  return (
    <div className="grid min-w-0 gap-4">
      <Section title={dict.sectionLabels.leadovi}>
        <p className="mb-3 max-w-3xl text-sm text-[var(--admin-text-muted)]">{t.help}</p>
        <div className="grid gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface-muted)] p-3 text-sm sm:grid-cols-2" role="status" aria-live="polite">
          <p className="flex min-w-0 items-start gap-2 font-semibold">
            <Inbox className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {undelivered === undefined ? dict.loading : fmt(undelivered.capped ? t.undeliveredCapped : t.undelivered, { count: undelivered.count })}
          </p>
          <p className={cn("flex min-w-0 items-start gap-2", deadline.kind !== "days" || deadline.days <= 3 ? "font-semibold text-[var(--admin-danger)]" : "")}>
            <CalendarClock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {deadlineText(deadline)}
          </p>
          {leadsEnabled === false ? (
            <p className="flex min-w-0 items-start gap-2 sm:col-span-2">
              <CircleSlash className="mt-0.5 size-4 shrink-0 text-[var(--admin-warning)]" aria-hidden="true" />
              {t.leadsOff}
            </p>
          ) : null}
        </div>
        <nav aria-label={t.linksLabel} className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {[[links.forms, t.formsLink], [links.followUp, t.followUpLink], [links.settings, t.settingsLink]].map(([href, label]) => (
            <Link key={href} href={href} className="inline-flex min-h-9 items-center gap-1.5 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--admin-focus,var(--admin-ink))]">
              <Link2 className="size-4" aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>
      </Section>
      <InboxFilters hierarchy={hierarchy} query={query} onQueryChange={onQueryChange} />
      <Section title={t.listTitle}>
        <AdminDataView
          listKey="dogadjaji.leadovi"
          caption={t.listTitle}
          rows={leads.status === "loading" ? undefined : leads.rows}
          loadingLabel={dict.loading}
          getRowId={(row) => row.id}
          columns={columns}
          tableClassName="min-w-[48rem]"
          rowClassName={(row) => (row.id === query.lead ? "bg-[var(--admin-surface-muted)]" : undefined)}
          toolbar={
            <p className="text-sm font-semibold" role="status" aria-live="polite">
              {fmt(leads.canLoadMore ? t.countMore : t.count, { shown: leads.rows.length })}
            </p>
          }
          empty={filtered ? { title: t.emptyFilteredTitle, body: t.emptyFilteredBody } : { title: t.emptyTitle, body: t.emptyBody }}
          renderCard={(row) => {
            const model = names.model(row.modelId);
            return (
              <AdminDataCard
                title={row.contactName}
                subtitle={fmt(t.leadLine, { kind: dict.leadKinds[row.kind], model: model ? modelName(model) : t.unknownModel, date: eventDateTime.format(row.createdAt) })}
                badges={<><DeliveredBadge row={row} />{row.followUpSuppressed ? <AdminStatus label={dict.followUpSuppressedBadge} tone="neutral" /> : null}</>}
                fields={[
                  { label: dict.colContact, value: contactText(row) },
                  { label: t.colExhibitor, value: names.exhibitor(row.participationId) },
                  { label: t.colEmails, value: emailsText(row) },
                ]}
              />
            );
          }}
          rowActions={(row) => (
            <>
              <Link href={leadHref(row.id)} scroll={false} aria-label={fmt(t.openAria, { name: row.contactName })} className={cn(adminSecondaryButtonClass, "min-h-9 px-3 whitespace-nowrap")}>
                <PanelRightOpen className="size-4" aria-hidden="true" />{t.open}
              </Link>
              {!row.delivered ? (
                <button
                  type="button"
                  className={cn(adminSecondaryButtonClass, "min-h-9 px-3 whitespace-nowrap")}
                  aria-label={fmt(t.markDeliveredAria, { name: row.contactName })}
                  disabled={rowRun.pending}
                  onClick={() => void rowRun.run(() => actions.markDelivered([row.id]), t.markDeliveredDone)}
                >
                  {t.markDelivered}
                </button>
              ) : null}
            </>
          )}
          footer={leads.canLoadMore ? (
            <button type="button" className={cn(adminSecondaryButtonClass, "w-fit")} disabled={leads.loadingMore} onClick={leads.onLoadMore}>{leads.loadingMore ? dict.loadingMore : dict.loadMore}</button>
          ) : null}
        />
        <Feedback message={rowRun.message} />
      </Section>
      <HandOver exhibitorId={query.izlagac && exhibitors.has(query.izlagac) ? query.izlagac : undefined} exhibitorName={query.izlagac ? exhibitors.get(query.izlagac) ?? null : null} actions={actions} />
      <LeadDetailDrawer
        open={Boolean(query.lead)}
        onClose={() => onQueryChange({ lead: null })}
        title={openLead?.contactName ?? detail?.lead.contactName ?? t.detailTitle}
      >
        <LeadDetailPanel detail={detail} names={names} brandName={(id) => catalog.models.find((model) => model.brandId === id)?.brandName ?? t.unknownBrand} actions={actions} />
      </LeadDetailDrawer>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Detail (drawer)
// -----------------------------------------------------------------------------

function LeadDetailDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="right" className="admin-v1 w-full max-w-none gap-0 overflow-y-auto border-[var(--admin-border)] bg-[var(--admin-surface-strong)] p-0 text-[var(--admin-ink)] sm:max-w-[40rem] motion-reduce:duration-0">
        <SheetHeader className="border-b border-[var(--admin-border)] p-4 pr-14 text-left sm:p-5 sm:pr-14">
          <SheetTitle className="text-lg font-semibold [overflow-wrap:anywhere]">{title}</SheetTitle>
          <SheetDescription className="text-sm text-[var(--admin-text-muted)]">{t.detailDescription}</SheetDescription>
        </SheetHeader>
        <div className="p-4 sm:p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function DetailBlock({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-2 border-b border-[var(--admin-border)] py-4 first:pt-0 last:border-b-0">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const GROUP_ORDER: FairLeadActivityGroup[] = ["scans", "ratings", "audienceVotes", "surveyAnswers", "passport", "sponsoredActions"];
const RATING_FIELDS = ["overall", "appearance", "specifications", "price"] as const;

function ActivityGroup({ group, state, children }: { group: FairLeadActivityGroup; state: { shared: boolean; capped: boolean; count: number }; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-1.5 rounded-lg border border-[var(--admin-border)] p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{t.activityGroups[group]}</h4>
        <AdminStatus label={state.shared ? t.activityShared : t.activityNotShared} tone={state.shared ? "active" : "neutral"} />
      </div>
      {state.count ? <ul className="grid gap-1 text-sm">{children}</ul> : <Meta>{t.activityEmpty}</Meta>}
      {state.capped ? <Meta>{t.activityCapped}</Meta> : null}
    </div>
  );
}

function ActivityList({ activity, names, brandName }: { activity: LeadActivityView; names: Names; brandName: (id: string) => string }) {
  const model = (id: string) => {
    const row = names.model(id);
    return row ? modelName(row) : t.unknownModel;
  };
  const answer = (item: { kind: "yes_no" | "single_choice"; answer: string }) => (item.kind === "yes_no" ? (item.answer === "yes" ? t.yes : item.answer === "no" ? t.no : item.answer) : item.answer);
  const blocks: ReactNode[] = [];
  for (const group of GROUP_ORDER) {
    if (group === "scans" && activity.scans) {
      const g = activity.scans;
      blocks.push(<ActivityGroup key={group} group={group} state={{ ...g, count: g.items.length }}>{g.items.map((item) => (
        <li key={item.eventModelId}><strong className="font-semibold">{model(item.eventModelId)}</strong> <Meta>{fmt(t.scanLine, { count: item.count, first: eventDateTime.format(item.firstAt), last: eventDateTime.format(item.lastAt) })}</Meta></li>
      ))}</ActivityGroup>);
    }
    if (group === "ratings" && activity.ratings) {
      const g = activity.ratings;
      blocks.push(<ActivityGroup key={group} group={group} state={{ ...g, count: g.items.length }}>{g.items.map((item) => (
        <li key={item.eventModelId}><strong className="font-semibold">{model(item.eventModelId)}</strong>: {RATING_FIELDS.flatMap((field) => (item[field] !== undefined ? [`${t.ratingFields[field]} ${item[field]}`] : [])).join(" · ")}</li>
      ))}</ActivityGroup>);
    }
    if (group === "audienceVotes" && activity.audienceVotes) {
      const g = activity.audienceVotes;
      blocks.push(<ActivityGroup key={group} group={group} state={{ ...g, count: g.items.length }}>{g.items.map((item, index) => (
        <li key={`${item.eventModelId}-${index}`} className="[overflow-wrap:anywhere]"><strong className="font-semibold">{model(item.eventModelId)}</strong> — {item.prompt}: <em className="not-italic font-semibold">{item.answer}</em></li>
      ))}</ActivityGroup>);
    }
    if (group === "surveyAnswers" && activity.surveyAnswers) {
      const g = activity.surveyAnswers;
      blocks.push(<ActivityGroup key={group} group={group} state={{ ...g, count: g.items.length }}>{g.items.map((item, index) => (
        <li key={`${item.eventModelId}-${index}`} className="grid gap-0.5">
          <strong className="font-semibold">{model(item.eventModelId)}</strong>
          {item.answers.map((entry, at) => <span key={at} className="[overflow-wrap:anywhere]">{entry.prompt}: <span className="font-semibold">{answer(entry)}</span></span>)}
        </li>
      ))}</ActivityGroup>);
    }
    if (group === "passport" && activity.passport) {
      const g = activity.passport;
      blocks.push(<ActivityGroup key={group} group={group} state={{ ...g, count: g.items.length }}>{g.items.map((item) => (
        <li key={item.brandId} className="grid gap-0.5">
          <span><strong className="font-semibold">{brandName(item.brandId)}</strong>: {item.required !== null ? fmt(t.passportLine, { stamped: item.stamps.length, required: item.required }) : fmt(t.passportLineNoTotal, { stamped: item.stamps.length })}</span>
          {item.favoriteModelId ? <Meta>{fmt(t.favoriteLine, { model: model(item.favoriteModelId) })}</Meta> : null}
        </li>
      ))}</ActivityGroup>);
    }
    if (group === "sponsoredActions" && activity.sponsoredActions) {
      const g = activity.sponsoredActions;
      blocks.push(<ActivityGroup key={group} group={group} state={{ ...g, count: g.items.length }}>{g.items.map((item, index) => (
        <li key={`${item.eventModelId}-${index}`}><strong className="font-semibold">{model(item.eventModelId)}</strong>: {t.sponsoredKinds[item.kind]} <Meta>{eventDateTime.format(item.at)}</Meta></li>
      ))}</ActivityGroup>);
    }
  }
  return <div className="grid gap-2">{blocks}</div>;
}

/** The drawer body; exported for the component tests (the drawer itself is a portal). */
export function LeadDetailPanel({ detail, names, brandName, actions }: { detail: LeadDetail | null | undefined; names: Names; brandName: (id: string) => string; actions: LeadInboxActions }) {
  const run = useRunner();
  if (detail === undefined) return <AdminLoadingState label={t.detailLoading} />;
  if (detail === null) return <AdminEmptyState title={t.detailTitle} body={t.detailMissing} />;
  const { lead, activity } = detail;
  const model = names.model(lead.modelId);
  const exhibitor = names.exhibitor(lead.participationId);
  return (
    <div className="grid min-w-0">
      <DetailBlock title={t.contactTitle}>
        <p className="text-sm text-[var(--admin-text-muted)]">{fmt(t.leadLine, { kind: dict.leadKinds[lead.kind], model: model ? modelName(model) : t.unknownModel, date: eventDateTime.format(lead.createdAt) })}</p>
        <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
          <dt className="text-[var(--admin-text-muted)]">{t.contactName}</dt><dd className="font-semibold [overflow-wrap:anywhere]">{lead.contactName}</dd>
          <dt className="text-[var(--admin-text-muted)]">{t.contactEmail}</dt><dd className="[overflow-wrap:anywhere]">{lead.email ?? dict.leadNoEmail}</dd>
          <dt className="text-[var(--admin-text-muted)]">{t.contactPhone}</dt><dd>{lead.phone ?? dict.leadNoPhone}</dd>
          <dt className="text-[var(--admin-text-muted)]">{t.colExhibitor}</dt><dd className="[overflow-wrap:anywhere]">{exhibitor}</dd>
        </dl>
        <Meta>{fmt(t.tierAtLead, { tier: dict.tiers[activity.tierAtLead] })}</Meta>
      </DetailBlock>
      <DetailBlock title={t.consentTitle}>
        <Meta>{fmt(t.consentLine, { version: lead.consentVersion, date: eventDateTime.format(lead.consentedAt) })}</Meta>
        <p className="rounded-lg bg-[var(--admin-surface-muted)] p-3 text-sm break-words whitespace-pre-wrap">{lead.consentTextSnapshot}</p>
      </DetailBlock>
      <DetailBlock title={t.deliveryTitle} aside={<DeliveredBadge row={lead} />}>
        {lead.deliveredAt ? <Meta>{fmt(t.deliveredOn, { date: eventDateTime.format(lead.deliveredAt) })}</Meta> : (
          <button type="button" className={cn(adminSecondaryButtonClass, "w-fit")} disabled={run.pending} onClick={() => void run.run(() => actions.markDelivered([lead.id]), t.markDeliveredDone)}>{t.markDelivered}</button>
        )}
      </DetailBlock>
      <DetailBlock title={t.emailsTitle} aside={<Mail className="size-4 text-[var(--admin-text-muted)]" aria-hidden="true" />}>
        <p className="text-sm">{emailLine(lead.confirmation, dict.confirmationLabel, false)}</p>
        {lead.followUp ? <p className="text-sm">{emailLine(lead.followUp, dict.followUpLabel, true)}</p> : null}
        {lead.suppressedAt ? <Meta>{fmt(t.suppressedOn, { date: dateOnly.format(lead.suppressedAt) })}</Meta> : null}
        <div className="flex flex-wrap gap-2">
          {lead.followUp?.status === "queued" && !lead.followUpSuppressed ? (
            <ConfirmAction label={dict.suppress} body={dict.suppressConfirm} disabled={run.pending} onConfirm={() => void run.run(() => actions.setSuppressed(lead.id, true), dict.suppressDone)} />
          ) : null}
          {lead.followUp?.status === "queued" && lead.followUpSuppressed ? (
            <button type="button" className={adminSecondaryButtonClass} disabled={run.pending} onClick={() => void run.run(() => actions.setSuppressed(lead.id, false), dict.unsuppressDone)}>{dict.unsuppress}</button>
          ) : null}
          {lead.confirmation?.status === "failed" ? (
            <button type="button" className={adminSecondaryButtonClass} disabled={run.pending} onClick={() => void run.run(() => actions.retryDelivery(lead.confirmation!.id), dict.retryDone)}>{dict.retryConfirmation}</button>
          ) : null}
          {lead.followUp?.status === "failed" ? (
            <button type="button" className={adminSecondaryButtonClass} disabled={run.pending} onClick={() => void run.run(() => actions.retryDelivery(lead.followUp!.id), dict.retryDone)}>{dict.retryFollowUp}</button>
          ) : null}
        </div>
        <Feedback message={run.message} />
      </DetailBlock>
      <DetailBlock title={fmt(t.activityTitle, { exhibitor })}>
        <p className="text-xs text-[var(--admin-text-muted)]">{t.activityHelp}</p>
        <ActivityList activity={activity} names={names} brandName={brandName} />
      </DetailBlock>
    </div>
  );
}

/** Without the event catalog the section cannot name models or exhibitors. */
export function LeadsInboxUnavailable() {
  return <AdminPanel><AdminEmptyState title={dict.tabLeads} body={dict.leadsUnavailable} /></AdminPanel>;
}
