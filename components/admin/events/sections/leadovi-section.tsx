"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminEventsConsent,
  AdminEventsFollowUp,
  AdminEventsLeadForms,
  AdminEventsLeadList,
  type LeadsActions,
  type LeadsDelivery,
  type LeadsView,
} from "@/components/admin/admin-events-leads";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { modelFullName } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { leadsOutcome } from "@/components/admin/events/event-outcome";

// Admin UX A2 — containers of `leadovi` (received leads of `?izlagac=`),
// `leadovi/follow-up` and `interakcije/forme` (settings of `?model=`) and
// `leadovi/podesavanja` (consent). Each route runs only its own queries; the
// B4 functions are in convex/fairLeadsAdmin.ts.

const LEAD_PAGE = 25;

function useLeadsActions(): LeadsActions {
  const { eventId } = useAdminEvent();
  const saveConsentDraft = useMutation(api.fairLeadsAdmin.saveConsentDraft);
  const activateConsent = useMutation(api.fairLeadsAdmin.activateConsent);
  const retireConsent = useMutation(api.fairLeadsAdmin.retireConsent);
  const upsertLeadConfig = useMutation(api.fairLeadsAdmin.upsertLeadConfig);
  const upsertFollowUpTemplate = useMutation(api.fairLeadsAdmin.upsertFollowUpTemplate);
  const setFollowUpSuppressed = useMutation(api.fairLeadsAdmin.setFollowUpSuppressed);
  const retryEmailDelivery = useMutation(api.fairLeadsAdmin.retryEmailDelivery);
  return {
    saveConsentDraft: (kind, text, consentId) => leadsOutcome(() => saveConsentDraft({
      eventId, leadKind: kind, text, ...(consentId ? { consentId: consentId as Id<"fairConsentConfigs"> } : {}),
    })),
    activateConsent: (consentId, approval) => leadsOutcome(() => activateConsent({ consentId: consentId as Id<"fairConsentConfigs">, ...approval })),
    retireConsent: (consentId) => leadsOutcome(() => retireConsent({ consentId: consentId as Id<"fairConsentConfigs"> })),
    saveLeadConfig: (input) => leadsOutcome(() => upsertLeadConfig({
      eventModelId: input.modelId as Id<"fairEventModels">, leadKind: input.kind, contactRequirement: input.contactRequirement,
      ...(input.preferredContact ? { preferredContact: input.preferredContact } : {}), enabled: input.enabled,
    })),
    saveFollowUpTemplate: (modelId, subject, plainText) => leadsOutcome(() => upsertFollowUpTemplate({ eventModelId: modelId as Id<"fairEventModels">, subject, plainText })),
    setSuppressed: (leadId, suppressed) => leadsOutcome(() => setFollowUpSuppressed({ leadId: leadId as Id<"fairLeads">, suppressed })),
    retryDelivery: (deliveryId) => leadsOutcome(() => retryEmailDelivery({ deliveryId: deliveryId as Id<"fairEmailDeliveries"> })),
  };
}

function useParticipations() {
  const { catalog, directory } = useAdminEvent();
  return useMemo(() => {
    const businesses = new Map(directory.businesses.map((row) => [row.businessId, row.name]));
    return catalog.participations
      .map((row) => ({ id: row._id as string, exhibitorName: businesses.get(row.businessId) ?? row.externalKey }))
      .sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName, "sr-Latn-RS"));
  }, [catalog, directory]);
}

/** Models with at least `Zainteresovan sam` (Starter+) and the one chosen in `?model=`. */
function useModelPart(): Pick<LeadsView, "models" | "modelId" | "onSelectModel" | "modelSettings"> {
  const { catalog } = useAdminEvent();
  const participations = useParticipations();
  const [query, setQuery] = useAdminQueryState();
  const models = useMemo(() => {
    const exhibitors = new Map(participations.map((row) => [row.id, row.exhibitorName]));
    return catalog.models
      .filter((model) => model.status !== "withdrawn" && model.packageTier !== "included")
      .map((model) => ({ id: model._id as string, name: modelFullName(model), exhibitorName: exhibitors.get(model.participationId) ?? "—", tier: model.packageTier }))
      .sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName, "sr-Latn-RS") || a.name.localeCompare(b.name, "sr-Latn-RS"));
  }, [catalog, participations]);
  const modelId = models.find((model) => model.id === query.model)?.id ?? models[0]?.id ?? null;
  const settings = useQuery(api.fairLeadsAdmin.getModelLeadSettings, modelId ? { eventModelId: modelId as Id<"fairEventModels"> } : "skip");
  return {
    models,
    modelId,
    onSelectModel: (id) => setQuery({ model: id }),
    modelSettings: settings ? { tier: settings.packageTier, interest: settings.interest, testDrive: settings.testDrive, followUpTemplate: settings.followUpTemplate } : undefined,
  };
}

export function FormeSection() {
  return <AdminEventsLeadForms view={useModelPart()} actions={useLeadsActions()} />;
}

export function FollowUpSection() {
  return <AdminEventsFollowUp view={useModelPart()} actions={useLeadsActions()} />;
}

export function PodesavanjaSection() {
  const { eventId } = useAdminEvent();
  const consents = useQuery(api.fairLeadsAdmin.getEventConsents, { eventId });
  const actions = useLeadsActions();
  const view: Pick<LeadsView, "consents"> = {
    consents: consents?.map((row) => ({
      id: row.consentId, kind: row.leadKind, version: row.version, status: row.status, text: row.text,
      ...(row.activatedAt !== undefined ? { activatedAt: row.activatedAt } : {}),
      ...(row.legalApprovedBy !== undefined ? { legalApprovedBy: row.legalApprovedBy } : {}),
      ...(row.legalApprovedAt !== undefined ? { legalApprovedAt: row.legalApprovedAt } : {}),
    })),
  };
  return <AdminEventsConsent view={view} actions={actions} />;
}

type ExportedDelivery = FunctionReturnType<typeof api.fairLeadsAdmin.exportLeads>["page"][number]["confirmation"];

function deliveryView(row: ExportedDelivery): LeadsDelivery {
  return row ? { id: row.deliveryId, status: row.status, scheduledFor: row.scheduledFor, ...(row.lastError ? { lastError: row.lastError } : {}) } : null;
}

export function LeadoviSection() {
  const { eventId, catalog } = useAdminEvent();
  const participations = useParticipations();
  const [query, setQuery] = useAdminQueryState();
  const actions = useLeadsActions();
  const participationId = participations.find((row) => row.id === query.izlagac)?.id ?? participations[0]?.id ?? null;
  const modelNames = useMemo(() => new Map(catalog.models.map((model) => [model._id as string, modelFullName(model)])), [catalog]);
  const leads = usePaginatedQuery(
    api.fairLeadsAdmin.exportLeads,
    participationId ? { eventId, participationId: participationId as Id<"fairParticipations"> } : "skip",
    { initialNumItems: LEAD_PAGE },
  );
  const view: Pick<LeadsView, "participations" | "participationId" | "onSelectParticipation" | "leads"> = {
    participations,
    participationId,
    onSelectParticipation: (id) => setQuery({ izlagac: id }),
    leads: {
      rows: leads.results.map((row) => ({
        id: row.leadId,
        createdAt: row.createdAt,
        kind: row.kind,
        modelName: modelNames.get(row.eventModelId) ?? "—",
        contactName: row.contactName,
        ...(row.email !== undefined ? { email: row.email } : {}),
        ...(row.phone !== undefined ? { phone: row.phone } : {}),
        consentVersion: row.consentVersion,
        followUpSuppressed: row.followUpSuppressed,
        confirmation: deliveryView(row.confirmation),
        followUp: deliveryView(row.followUp),
      })),
      status: leads.status === "LoadingFirstPage" ? "loading" : "ready",
      canLoadMore: leads.status === "CanLoadMore" || leads.status === "LoadingMore",
      loadingMore: leads.status === "LoadingMore",
      onLoadMore: () => leads.loadMore(LEAD_PAGE),
    },
  };
  return <AdminEventsLeadList view={view} actions={actions} />;
}
