"use client";

import { useAction, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminEventsConsent, type LeadsActions, type LeadsView } from "@/components/admin/admin-events-leads";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { downloadAdminFile } from "@/components/admin/events/download-file";
import { useAdminEvent, useCatalogViewWithoutChecks } from "@/components/admin/events/event-context";
import { attempt, leadsOutcome } from "@/components/admin/events/event-outcome";
import { modelName } from "@/components/admin/events/event-ui";
import { leadInboxFilter, pickFollowUpExhibitor } from "@/components/admin/events/leads-logic";
import { EventFollowUpView, type FollowUpActions } from "@/components/admin/events/sections/leadovi-follow-up-view";
import { EventLeadsInboxView, type InboxDelivery, type InboxLead, type LeadInboxActions } from "@/components/admin/events/sections/leadovi-view";
import { eventSectionHref, interactionExhibitorHref } from "@/lib/admin-v1/event-sections";
import { modelHierarchy } from "@/lib/admin-v1/model-filters";
import type { AdminQueryState } from "@/lib/admin-v1/query-state";
import type { FairEmailDeliveryStatus } from "@/lib/fair-contract";

// Admin UX A8 — containers of `leadovi` (inbox, `?lead=` detail with the
// visitor's activity, delivery, PII file per exhibitor), `leadovi/follow-up`
// (one text per exhibitor) and `leadovi/podesavanja` (consent). Each route
// runs only its own queries: convex/fairLeadsInbox.ts, convex/fairFollowUps.ts,
// convex/fairLeadsAdmin.ts, convex/fairReports.ts (exportLeadsFile).

const LEAD_PAGE = 25;
const MINUTE = 60_000;

/** The minute clock of the delivery deadline (the query itself never reads the clock). */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), MINUTE);
    return () => clearInterval(timer);
  }, []);
  return now;
}

type Delivery = { deliveryId: string; status: FairEmailDeliveryStatus; scheduledFor: number; lastError?: string } | null;

function deliveryOf(row: Delivery): InboxDelivery {
  return row ? { id: row.deliveryId, status: row.status, scheduledFor: row.scheduledFor, ...(row.lastError ? { lastError: row.lastError } : {}) } : null;
}

type ListedLead = {
  leadId: string; createdAt: number; kind: InboxLead["kind"]; eventModelId: string; participationId: string; contactName: string; email?: string; phone?: string;
  status: "received" | "delivered"; deliveredAt?: number; followUpSuppressed: boolean; confirmation: Delivery; followUp: Delivery;
};

function inboxLead(row: ListedLead): InboxLead {
  return {
    id: row.leadId,
    createdAt: row.createdAt,
    kind: row.kind,
    modelId: row.eventModelId,
    participationId: row.participationId,
    contactName: row.contactName,
    ...(row.email !== undefined ? { email: row.email } : {}),
    ...(row.phone !== undefined ? { phone: row.phone } : {}),
    delivered: row.status === "delivered",
    ...(row.deliveredAt !== undefined ? { deliveredAt: row.deliveredAt } : {}),
    followUpSuppressed: row.followUpSuppressed,
    confirmation: deliveryOf(row.confirmation),
    followUp: deliveryOf(row.followUp),
  };
}

function useInboxActions(): LeadInboxActions {
  const { eventId } = useAdminEvent();
  const markDelivered = useMutation(api.fairLeadsInbox.markLeadsDelivered);
  const setFollowUpSuppressed = useMutation(api.fairLeadsAdmin.setFollowUpSuppressed);
  const retryEmailDelivery = useMutation(api.fairLeadsAdmin.retryEmailDelivery);
  const exportLeads = useAction(api.fairReports.exportLeadsFile);
  return {
    markDelivered: (leadIds) => leadsOutcome(() => markDelivered({ eventId, leadIds: leadIds as Id<"fairLeads">[] })),
    markExhibitorDelivered: async (participationId) => {
      const result = await attempt(() => markDelivered({ eventId, participationId: participationId as Id<"fairParticipations"> }));
      return result.ok ? { ok: true, delivered: result.value.delivered, hasMore: result.value.hasMore } : { ok: false, code: result.code };
    },
    setSuppressed: (leadId, suppressed) => leadsOutcome(() => setFollowUpSuppressed({ leadId: leadId as Id<"fairLeads">, suppressed })),
    retryDelivery: (deliveryId) => leadsOutcome(() => retryEmailDelivery({ deliveryId: deliveryId as Id<"fairEmailDeliveries"> })),
    exportLeads: (participationId, format) => leadsOutcome(async () => downloadAdminFile(await exportLeads({ eventId, participationId: participationId as Id<"fairParticipations">, format }))),
  };
}

export function LeadoviSection() {
  const { eventId, base } = useAdminEvent();
  const catalog = useCatalogViewWithoutChecks();
  const [query, setQuery] = useAdminQueryState();
  const actions = useInboxActions();
  const now = useMinuteClock();
  const hierarchy = useMemo(() => modelHierarchy(catalog.models, modelName), [catalog.models]);
  const filter = leadInboxFilter(query, hierarchy);
  const leads = usePaginatedQuery(
    api.fairLeadsInbox.listEventLeads,
    {
      eventId,
      ...(filter.eventModelId ? { eventModelId: filter.eventModelId as Id<"fairEventModels"> } : {}),
      ...(filter.participationId ? { participationId: filter.participationId as Id<"fairParticipations"> } : {}),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.delivered !== undefined ? { delivered: filter.delivered } : {}),
      ...(filter.from !== undefined ? { from: filter.from } : {}),
      ...(filter.to !== undefined ? { to: filter.to } : {}),
    },
    { initialNumItems: LEAD_PAGE },
  );
  const counts = useQuery(api.fairAdminStats.getLeadCounts, { eventId });
  const switches = useQuery(api.fairLeadsAdmin.getLeadSwitches, {});
  const detail = useQuery(api.fairLeadsInbox.getLeadDetail, query.lead ? { leadId: query.lead as Id<"fairLeads"> } : "skip");

  const rows = useMemo(() => {
    const all = leads.results.map((row) => inboxLead(row as ListedLead));
    return filter.brandModelIds ? all.filter((row) => filter.brandModelIds!.has(row.modelId)) : all;
  }, [leads.results, filter.brandModelIds]);
  const undelivered = counts ? { count: counts.byParticipation.reduce((sum, row) => sum + row.undelivered, 0), capped: counts.capped } : undefined;
  const listQuery: AdminQueryState = { ...query };
  delete listQuery.lead;

  return (
    <EventLeadsInboxView
      catalog={catalog}
      leads={{
        rows,
        status: leads.status === "LoadingFirstPage" ? "loading" : "ready",
        canLoadMore: leads.status === "CanLoadMore" || leads.status === "LoadingMore",
        loadingMore: leads.status === "LoadingMore",
        onLoadMore: () => leads.loadMore(LEAD_PAGE),
      }}
      query={query}
      onQueryChange={setQuery}
      leadHref={(leadId) => eventSectionHref(base, "leadovi", { ...listQuery, lead: leadId })}
      undelivered={undelivered}
      now={now}
      leadsEnabled={switches?.leadsEnabled}
      detail={query.lead ? (detail === undefined ? undefined : detail === null ? null : {
        lead: { ...inboxLead(detail.lead as ListedLead), consentVersion: detail.lead.consentVersion, consentTextSnapshot: detail.lead.consentTextSnapshot, consentedAt: detail.lead.consentedAt, ...(detail.lead.suppressedAt !== undefined ? { suppressedAt: detail.lead.suppressedAt } : {}) },
        activity: detail.activity,
      }) : null}
      links={{
        // Izlagači 2026: Forme are on the exhibitor's Interakcije page (the filtered exhibitor's, else the list).
        forms: filter.participationId ? interactionExhibitorHref(base, filter.participationId, {}, "forme") : eventSectionHref(base, "interakcije"),
        followUp: eventSectionHref(base, "leadovi/follow-up"),
        settings: eventSectionHref(base, "leadovi/podesavanja"),
      }}
      actions={actions}
    />
  );
}

export function FollowUpSection() {
  const { eventId, catalog: raw } = useAdminEvent();
  const catalog = useCatalogViewWithoutChecks();
  const [query, setQuery] = useAdminQueryState();
  const rows = useQuery(api.fairFollowUps.getExhibitorFollowUps, { eventId });
  const estimate = useQuery(api.fairFollowUps.estimateFollowUps, { eventId });
  const switches = useQuery(api.fairLeadsAdmin.getLeadSwitches, {});
  // The same exhibitor the view opens (sorted by name, as listed).
  const names = new Map(catalog.participations.map((row) => [row.id, row.exhibitorName]));
  const selected = pickFollowUpExhibitor(
    rows ? [...rows].sort((a, b) => (names.get(a.participationId) ?? "").localeCompare(names.get(b.participationId) ?? "", "sr-Latn-RS")) : undefined,
    query.izlagac,
  );
  const preview = useQuery(
    api.fairFollowUps.previewExhibitorFollowUp,
    selected ? { participationId: selected.participationId, ...(query.lead ? { leadId: query.lead as Id<"fairLeads"> } : {}) } : "skip",
  );
  const saveDraft = useMutation(api.fairFollowUps.saveExhibitorFollowUpDraft);
  const activate = useMutation(api.fairFollowUps.activateExhibitorFollowUp);
  const retire = useMutation(api.fairFollowUps.retireExhibitorFollowUp);
  const actions: FollowUpActions = {
    saveDraft: (participationId, subject, plainText) => leadsOutcome(() => saveDraft({ participationId: participationId as Id<"fairParticipations">, subject, plainText })),
    activate: (templateId) => leadsOutcome(() => activate({ templateId: templateId as Id<"fairExhibitorFollowUpTemplates"> })),
    retire: (templateId) => leadsOutcome(() => retire({ templateId: templateId as Id<"fairExhibitorFollowUpTemplates"> })),
  };
  return (
    <EventFollowUpView
      exhibitors={catalog.participations.map((row) => ({ id: row.id, name: row.exhibitorName }))}
      eventTitle={raw.event.title}
      rows={rows}
      estimate={estimate}
      switches={switches}
      preview={selected ? preview : undefined}
      query={query}
      onQueryChange={setQuery}
      actions={actions}
    />
  );
}

export function PodesavanjaSection() {
  const { eventId } = useAdminEvent();
  const consents = useQuery(api.fairLeadsAdmin.getEventConsents, { eventId });
  const saveConsentDraft = useMutation(api.fairLeadsAdmin.saveConsentDraft);
  const activateConsent = useMutation(api.fairLeadsAdmin.activateConsent);
  const retireConsent = useMutation(api.fairLeadsAdmin.retireConsent);
  const actions: LeadsActions = {
    saveConsentDraft: (kind, text, consentId) => leadsOutcome(() => saveConsentDraft({
      eventId, leadKind: kind, text, ...(consentId ? { consentId: consentId as Id<"fairConsentConfigs"> } : {}),
    })),
    activateConsent: (consentId, approval) => leadsOutcome(() => activateConsent({ consentId: consentId as Id<"fairConsentConfigs">, ...approval })),
    retireConsent: (consentId) => leadsOutcome(() => retireConsent({ consentId: consentId as Id<"fairConsentConfigs"> })),
  };
  const view: LeadsView = {
    consents: consents?.map((row) => ({
      id: row.consentId, kind: row.leadKind, version: row.version, status: row.status, text: row.text,
      ...(row.activatedAt !== undefined ? { activatedAt: row.activatedAt } : {}),
      ...(row.legalApprovedBy !== undefined ? { legalApprovedBy: row.legalApprovedBy } : {}),
      ...(row.legalApprovedAt !== undefined ? { legalApprovedAt: row.legalApprovedAt } : {}),
    })),
  };
  return <AdminEventsConsent view={view} actions={actions} />;
}
