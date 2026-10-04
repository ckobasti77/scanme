"use client";

import { Component, useMemo, useState, type ReactNode } from "react";
import { useAction, useConvex, useMutation, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminEventsSurface,
  type CatalogView,
  type EventsActions,
  type IssueView,
  type ModelView,
  type Outcome,
  type Result,
} from "@/components/admin/admin-events";
import type { InteractionOutcome, InteractionsActions, InteractionsView } from "@/components/admin/admin-events-interactions";
import { AdminEventsLeads, type LeadsActions, type LeadsDelivery, type LeadsOutcome, type LeadsView } from "@/components/admin/admin-events-leads";
import { AdminEventsSponsored, type SponsoredActions, type SponsoredView } from "@/components/admin/admin-events-sponsored";
import { AdminEventsReports, type ReportsActions, type ReportsView } from "@/components/admin/admin-events-reports";
import { AdminErrorState, AdminPanel } from "@/components/admin/admin-primitives";
import { adminEventsSr as dict } from "@/lib/i18n/sr/admin-events";

// Sajam 2026 B1A — wires the `Događaji` tab to the B1 admin functions
// (convex/fairAdmin.ts, convex/fairImport.ts; all requireAdmin). Backend
// errors arrive as ConvexError({ code, issues? }) and are shown through the
// admin-events dictionary.

type FailureData = { code?: unknown; issues?: unknown };

function failure(error: unknown): { ok: false; code: string; issues?: IssueView[] } {
  if (error instanceof ConvexError) {
    const data = error.data as FailureData | string;
    if (typeof data === "object" && data !== null && typeof data.code === "string") {
      return { ok: false, code: data.code, issues: Array.isArray(data.issues) ? (data.issues as IssueView[]) : undefined };
    }
  }
  return { ok: false, code: "ACTION_FAILED" };
}

async function attempt<T>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return failure(error);
  }
}

async function outcome(run: () => Promise<{ warnings?: IssueView[] } | unknown>): Promise<Outcome> {
  const result = await attempt(run);
  if (!result.ok) return result;
  const value = result.value as { warnings?: IssueView[] } | null;
  return { ok: true, warnings: value && Array.isArray(value.warnings) ? value.warnings : undefined };
}

async function interactionOutcome(run: () => Promise<unknown>): Promise<InteractionOutcome> {
  const result = await attempt(run);
  if (!result.ok) return { ok: false, code: result.code };
  const value = result.value as { problem?: unknown } | null;
  return { ok: true, problem: value && typeof value.problem === "string" ? value.problem : null };
}

const INVENTORY_PAGE = 50;
const CLIENT_PAGE = 25;
const LEAD_PAGE = 25;

export function AdminEventsWorkspace() {
  const convex = useConvex();
  const events = useQuery(api.fairAdmin.listEvents);
  const [chosen, setChosen] = useState<Id<"fairEvents"> | null>(null);
  const sortedEvents = useMemo(() => events ? [...events].sort((a, b) => a.startsAt - b.startsAt) : undefined, [events]);
  const eventId = chosen ?? sortedEvents?.[0]?._id ?? null;
  const args = eventId ? { eventId } : "skip";
  const catalog = useQuery(api.fairAdmin.getEventCatalog, args);
  const directory = useQuery(api.fairAdmin.getEventDirectory, args);
  const validation = useQuery(api.fairAdmin.listValidationIssues, args);
  const qrConfigured = Boolean(catalog?.event.qrInventoryBusinessId);
  const inventory = usePaginatedQuery(api.fairAdmin.listQrInventory, eventId && qrConfigured ? { eventId } : "skip", { initialNumItems: INVENTORY_PAGE });
  const clients = usePaginatedQuery(api.fairAdmin.listEventClients, {}, { initialNumItems: CLIENT_PAGE });
  const interactionData = useQuery(api.fairInteractionsAdmin.getEventInteractions, args);

  const publish = useMutation(api.fairAdmin.publishModel);
  const withdraw = useMutation(api.fairAdmin.withdrawModel);
  const upgrade = useMutation(api.fairAdmin.upgradePackage);
  const assignQr = useMutation(api.fairAdmin.assignQr);
  const releaseQr = useMutation(api.fairAdmin.releaseQr);
  const commit = useMutation(api.fairImport.commit);
  const convert = useMutation(api.fairAdmin.convertEventClientToStandard);
  const saveQuestion = useMutation(api.fairInteractionsAdmin.upsertAudienceQuestion);
  const publishQuestion = useMutation(api.fairInteractionsAdmin.publishAudienceQuestion);
  const closeQuestion = useMutation(api.fairInteractionsAdmin.closeAudienceQuestion);
  const setSponsoredResult = useMutation(api.fairInteractionsAdmin.setSponsoredResultQuestion);
  const saveSurveyDraft = useMutation(api.fairInteractionsAdmin.upsertSurveyDraft);
  const publishSurvey = useMutation(api.fairInteractionsAdmin.publishSurvey);
  const retireSurvey = useMutation(api.fairInteractionsAdmin.retireSurvey);
  const openPassport = useMutation(api.fairInteractionsAdmin.upsertPassport);
  const publishPassport = useMutation(api.fairInteractionsAdmin.publishPassport);
  const withdrawPassport = useMutation(api.fairInteractionsAdmin.withdrawPassport);
  const removePassportModel = useMutation(api.fairInteractionsAdmin.removePassportModel);

  const view: CatalogView | undefined = useMemo(() => {
    if (!catalog || !directory || !validation) return undefined;
    const accounts = new Map(directory.accounts.map((row) => [row.accountId, row]));
    const businesses = new Map(directory.businesses.map((row) => [row.businessId, row]));
    const brands = new Map(directory.brands.map((row) => [row.brandId, row.name]));
    const participations = new Map(catalog.participations.map((row) => [row._id, row]));
    const stands = new Map(catalog.stands.map((row) => [row._id, row]));
    const qr = new Map(catalog.activeAssignments.map((row) => [row.eventModelId, row.resolverCode]));
    const issues = new Map(validation.map((row) => [row.eventModelId, row.issues as IssueView[]]));
    const exhibitor = (participationId: Id<"fairParticipations">) => {
      const participation = participations.get(participationId);
      return participation ? businesses.get(participation.businessId)?.name ?? accounts.get(participation.accountId)?.name ?? participation.externalKey : "—";
    };
    const models: ModelView[] = catalog.models.map((model) => {
      const stand = stands.get(model.standId);
      return {
        id: model._id,
        externalKey: model.externalKey,
        displayName: model.displayName,
        variant: model.variant,
        slug: model.slug,
        brandName: brands.get(model.brandId) ?? "—",
        exhibitorName: exhibitor(model.participationId),
        standLabel: stand ? `${stand.displayName} · ${stand.code}` : "—",
        tier: model.packageTier,
        status: model.status,
        priceText: model.priceText,
        specCount: model.specifications.length,
        highlightCount: model.specifications.filter((spec) => spec.isHighlight).length,
        hasPhoto: Boolean(model.photoUrl || model.photoStorageId),
        passportEligible: model.passportEligible,
        packageActivatedAt: model.packageActivatedAt,
        qrCode: qr.get(model._id) ?? null,
        issues: issues.get(model._id) ?? [],
      };
    }).sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName, "sr-Latn-RS") || a.displayName.localeCompare(b.displayName, "sr-Latn-RS"));
    return {
      days: [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder).map((day) => ({ dateKey: day.dateKey, label: day.label })),
      participations: catalog.participations.map((row) => {
        const account = accounts.get(row.accountId);
        const business = businesses.get(row.businessId);
        return {
          id: row._id,
          externalKey: row.externalKey,
          exhibitorName: business?.name ?? account?.name ?? row.externalKey,
          codes: [account?.smkCode, business?.smlCode].filter(Boolean).join(" · ") || "—",
          segment: account?.clientSegment ?? "standard",
          status: row.status,
        };
      }),
      stands: catalog.stands.map((row) => ({ id: row._id, externalKey: row.externalKey, code: row.code, displayName: row.displayName, mapLocationId: row.mapLocationId, exhibitorName: exhibitor(row.participationId), status: row.status })),
      models,
      qrConfigured: Boolean(catalog.event.qrInventoryBusinessId),
    };
  }, [catalog, directory, validation]);

  const modelNames = useMemo(() => new Map((view?.models ?? []).map((model) => [model.id, model.displayName])), [view]);

  // B3: Glas publike, survey versions and passports (convex/fairInteractionsAdmin.ts).
  const interactionsView: InteractionsView | undefined = useMemo(() => {
    if (!catalog || !directory || !interactionData) return undefined;
    const brandNames = new Map(directory.brands.map((row) => [row.brandId, row.name]));
    const fullName = (model: { displayName: string; variant?: string }) => `${model.displayName}${model.variant ? ` ${model.variant}` : ""}`;
    const names = new Map(catalog.models.map((model) => [model._id, fullName(model)]));
    const days = [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder);
    const dayLabels = new Map(days.map((day) => [day._id, day.label]));
    const live = catalog.models.filter((model) => model.status !== "withdrawn");
    const passportByBrand = new Map(interactionData.passports.map((row) => [row.brandId, row]));
    const brandIds = [...new Set([...live.map((model) => model.brandId), ...interactionData.passports.map((row) => row.brandId)])];
    return {
      models: live.map((model) => ({ id: model._id, name: fullName(model), brandName: brandNames.get(model.brandId) ?? "—", tier: model.packageTier })),
      days: days.map((day) => ({ id: day._id, label: day.label })),
      questions: interactionData.questions.map((row) => ({
        id: row._id, modelId: row.eventModelId, dayLabel: dayLabels.get(row.eventDayId) ?? "—", prompt: row.prompt, options: row.options,
        status: row.status, sortOrder: row.sortOrder, showOnSponsoredRotation: row.showOnSponsoredRotation,
      })),
      surveys: interactionData.surveys.map((row) => ({ id: row._id, modelId: row.eventModelId, version: row.version, status: row.status, questionCount: row.questions.length })),
      passports: brandIds.map((brandId) => {
        const passport = passportByBrand.get(brandId);
        return {
          id: passport?._id ?? null,
          brandId,
          brandName: brandNames.get(brandId) ?? "—",
          status: passport?.status ?? null,
          ...(passport?.frozenAt !== undefined ? { frozenAt: passport.frozenAt } : {}),
          members: (passport?.members ?? []).map((member) => ({ modelId: member.eventModelId, modelName: names.get(member.eventModelId) ?? "—", status: member.status })),
        };
      }).sort((a, b) => a.brandName.localeCompare(b.brandName, "sr-Latn-RS")),
    };
  }, [catalog, directory, interactionData]);

  const interactionActions: InteractionsActions = {
    saveQuestion: (input) => interactionOutcome(() => saveQuestion({
      eventModelId: input.modelId as Id<"fairEventModels">, eventDayId: input.dayId as Id<"fairEventDays">, prompt: input.prompt, options: input.options, sortOrder: input.sortOrder,
    })),
    publishQuestion: (questionId) => interactionOutcome(() => publishQuestion({ questionId: questionId as Id<"fairAudienceQuestions"> })),
    closeQuestion: (questionId) => interactionOutcome(() => closeQuestion({ questionId: questionId as Id<"fairAudienceQuestions"> })),
    setSponsoredResult: (modelId, questionId) => interactionOutcome(() => setSponsoredResult({ eventModelId: modelId as Id<"fairEventModels">, questionId: questionId as Id<"fairAudienceQuestions"> | null })),
    saveSurveyDraft: (modelId, questions) => interactionOutcome(() => saveSurveyDraft({ eventModelId: modelId as Id<"fairEventModels">, questions })),
    publishSurvey: (surveyId) => interactionOutcome(() => publishSurvey({ surveyId: surveyId as Id<"fairSurveys"> })),
    retireSurvey: (surveyId) => interactionOutcome(() => retireSurvey({ surveyId: surveyId as Id<"fairSurveys"> })),
    openPassport: (brandId) => interactionOutcome(() => eventId ? openPassport({ eventId, brandId: brandId as Id<"brands"> }) : Promise.reject(new Error("no event"))),
    publishPassport: (passportId) => interactionOutcome(() => publishPassport({ passportId: passportId as Id<"fairPassportConfigs"> })),
    withdrawPassport: (passportId) => interactionOutcome(() => withdrawPassport({ passportId: passportId as Id<"fairPassportConfigs"> })),
    removePassportModel: (passportId, modelId) => interactionOutcome(() => removePassportModel({ passportId: passportId as Id<"fairPassportConfigs">, eventModelId: modelId as Id<"fairEventModels"> })),
  };

  const actions: EventsActions = {
    publish: (modelId) => outcome(() => publish({ eventModelId: modelId as Id<"fairEventModels"> })),
    withdraw: (modelId) => outcome(() => withdraw({ eventModelId: modelId as Id<"fairEventModels"> })),
    upgrade: (modelId, toTier) => outcome(() => upgrade({ eventModelId: modelId as Id<"fairEventModels">, toTier })),
    assignQr: (modelId, resolverCode) => outcome(() => assignQr({ eventModelId: modelId as Id<"fairEventModels">, resolverCode })),
    releaseQr: (modelId, reason) => outcome(() => releaseQr({ eventModelId: modelId as Id<"fairEventModels">, reason })),
    resolveTest: (resolverCode) => attempt(async () => {
      const result = await convex.query(api.fairAdmin.resolveTest, { resolverCode });
      return { outcome: result.outcome, problem: result.problem, path: result.path };
    }),
    // The payload is validated by the Convex argument validator; a wrong shape
    // comes back as a failed call, never as a partial write.
    dryRun: (payload) => attempt(() => convex.query(api.fairImport.dryRun, { payload: payload as never })),
    commit: (payload) => attempt(() => commit({ payload: payload as never })),
    convert: (accountId) => outcome(() => convert({ accountId: accountId as Id<"accounts"> })),
  };

  return (
    <AdminEventsSurface
      events={sortedEvents?.map((event) => ({ id: event._id, title: event.title, status: event.status }))}
      selectedEventId={eventId}
      onSelectEvent={(id) => setChosen(id as Id<"fairEvents">)}
      catalog={view}
      inventory={{
        rows: inventory.results.map((row) => ({
          cardId: row.cardId,
          resolverCode: row.resolverCode,
          smqCode: row.smqCode,
          state: row.state,
          assignment: row.assignment ? { modelId: row.assignment.eventModelId, modelName: modelNames.get(row.assignment.eventModelId) ?? null, sameEvent: row.assignment.eventId === eventId } : null,
        })),
        status: inventory.status === "LoadingFirstPage" ? "loading" : "ready",
        canLoadMore: inventory.status === "CanLoadMore" || inventory.status === "LoadingMore",
        loadingMore: inventory.status === "LoadingMore",
        onLoadMore: () => inventory.loadMore(INVENTORY_PAGE),
      }}
      eventClients={{
        rows: clients.results.map((row) => ({ accountId: row.accountId, name: row.name, smkCode: row.smkCode })),
        status: clients.status === "LoadingFirstPage" ? "loading" : "ready",
        canLoadMore: clients.status === "CanLoadMore" || clients.status === "LoadingMore",
        loadingMore: clients.status === "LoadingMore",
        onLoadMore: () => clients.loadMore(CLIENT_PAGE),
      }}
      actions={actions}
      interactions={{ view: interactionsView, actions: interactionActions }}
      leads={eventId && catalog && directory ? <AdminEventsLeadsWorkspace eventId={eventId} catalog={catalog} directory={directory} /> : undefined}
      sponsored={eventId && catalog && directory ? <AdminEventsSponsoredWorkspace eventId={eventId} catalog={catalog} directory={directory} /> : undefined}
      reports={eventId && catalog && directory ? <AdminEventsReportsWorkspace eventId={eventId} catalog={catalog} directory={directory} /> : undefined}
    />
  );
}

// B4: the Leadovi section (convex/fairLeadsAdmin.ts). Mounted only while its
// tab is open, so consent, settings and contact queries run only then.
async function leadsOutcome(run: () => Promise<unknown>): Promise<LeadsOutcome> {
  const result = await attempt(run);
  return result.ok ? { ok: true } : { ok: false, code: result.code };
}

type ExportedDelivery = FunctionReturnType<typeof api.fairLeadsAdmin.exportLeads>["page"][number]["confirmation"];

function deliveryView(row: ExportedDelivery): LeadsDelivery {
  return row ? { id: row.deliveryId, status: row.status, scheduledFor: row.scheduledFor, ...(row.lastError ? { lastError: row.lastError } : {}) } : null;
}

const modelFullName = (model: { displayName: string; variant?: string }) => (model.variant ? `${model.displayName} ${model.variant}` : model.displayName);

function AdminEventsLeadsWorkspace({ eventId, catalog, directory }: {
  eventId: Id<"fairEvents">;
  catalog: FunctionReturnType<typeof api.fairAdmin.getEventCatalog>;
  directory: FunctionReturnType<typeof api.fairAdmin.getEventDirectory>;
}) {
  const [modelChoice, setModelChoice] = useState<string | null>(null);
  const [participationChoice, setParticipationChoice] = useState<string | null>(null);
  const consents = useQuery(api.fairLeadsAdmin.getEventConsents, { eventId });

  const participations = useMemo(() => {
    const businesses = new Map(directory.businesses.map((row) => [row.businessId, row.name]));
    return catalog.participations
      .map((row) => ({ id: row._id as string, exhibitorName: businesses.get(row.businessId) ?? row.externalKey }))
      .sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName, "sr-Latn-RS"));
  }, [catalog, directory]);
  const modelNames = useMemo(() => new Map(catalog.models.map((model) => [model._id as string, modelFullName(model)])), [catalog]);
  const models = useMemo(() => {
    const exhibitors = new Map(participations.map((row) => [row.id, row.exhibitorName]));
    return catalog.models
      .filter((model) => model.status !== "withdrawn" && model.packageTier !== "included")
      .map((model) => ({ id: model._id as string, name: modelFullName(model), exhibitorName: exhibitors.get(model.participationId) ?? "—", tier: model.packageTier }))
      .sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName, "sr-Latn-RS") || a.name.localeCompare(b.name, "sr-Latn-RS"));
  }, [catalog, participations]);
  const modelId = models.find((model) => model.id === modelChoice)?.id ?? models[0]?.id ?? null;
  const participationId = participations.find((row) => row.id === participationChoice)?.id ?? participations[0]?.id ?? null;
  const settings = useQuery(api.fairLeadsAdmin.getModelLeadSettings, modelId ? { eventModelId: modelId as Id<"fairEventModels"> } : "skip");
  const leads = usePaginatedQuery(
    api.fairLeadsAdmin.exportLeads,
    participationId ? { eventId, participationId: participationId as Id<"fairParticipations"> } : "skip",
    { initialNumItems: LEAD_PAGE },
  );

  const saveConsentDraft = useMutation(api.fairLeadsAdmin.saveConsentDraft);
  const activateConsent = useMutation(api.fairLeadsAdmin.activateConsent);
  const retireConsent = useMutation(api.fairLeadsAdmin.retireConsent);
  const upsertLeadConfig = useMutation(api.fairLeadsAdmin.upsertLeadConfig);
  const upsertFollowUpTemplate = useMutation(api.fairLeadsAdmin.upsertFollowUpTemplate);
  const setFollowUpSuppressed = useMutation(api.fairLeadsAdmin.setFollowUpSuppressed);
  const retryEmailDelivery = useMutation(api.fairLeadsAdmin.retryEmailDelivery);

  const view: LeadsView = {
    models,
    participations,
    consents: consents?.map((row) => ({
      id: row.consentId, kind: row.leadKind, version: row.version, status: row.status, text: row.text,
      ...(row.activatedAt !== undefined ? { activatedAt: row.activatedAt } : {}),
    })),
    modelId,
    onSelectModel: setModelChoice,
    modelSettings: settings ? { tier: settings.packageTier, interest: settings.interest, testDrive: settings.testDrive, followUpTemplate: settings.followUpTemplate } : undefined,
    participationId,
    onSelectParticipation: setParticipationChoice,
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

  const actions: LeadsActions = {
    saveConsentDraft: (kind, text, consentId) => leadsOutcome(() => saveConsentDraft({
      eventId, leadKind: kind, text, ...(consentId ? { consentId: consentId as Id<"fairConsentConfigs"> } : {}),
    })),
    activateConsent: (consentId) => leadsOutcome(() => activateConsent({ consentId: consentId as Id<"fairConsentConfigs"> })),
    retireConsent: (consentId) => leadsOutcome(() => retireConsent({ consentId: consentId as Id<"fairConsentConfigs"> })),
    saveLeadConfig: (input) => leadsOutcome(() => upsertLeadConfig({
      eventModelId: input.modelId as Id<"fairEventModels">, leadKind: input.kind, contactRequirement: input.contactRequirement,
      ...(input.preferredContact ? { preferredContact: input.preferredContact } : {}), enabled: input.enabled,
    })),
    saveFollowUpTemplate: (modelId, subject, plainText) => leadsOutcome(() => upsertFollowUpTemplate({ eventModelId: modelId as Id<"fairEventModels">, subject, plainText })),
    setSuppressed: (leadId, suppressed) => leadsOutcome(() => setFollowUpSuppressed({ leadId: leadId as Id<"fairLeads">, suppressed })),
    retryDelivery: (deliveryId) => leadsOutcome(() => retryEmailDelivery({ deliveryId: deliveryId as Id<"fairEmailDeliveries"> })),
  };

  return <AdminEventsLeads view={view} actions={actions} />;
}

// B5: the Sponzorisano section (convex/fairSponsoredAdmin.ts and the B3
// result-question choice). Mounted only while its tab is open.
function AdminEventsSponsoredWorkspace({ eventId, catalog, directory }: {
  eventId: Id<"fairEvents">;
  catalog: FunctionReturnType<typeof api.fairAdmin.getEventCatalog>;
  directory: FunctionReturnType<typeof api.fairAdmin.getEventDirectory>;
}) {
  const rotation = useQuery(api.fairSponsoredAdmin.getSponsoredRotationAdmin, { eventId });
  const interactions = useQuery(api.fairInteractionsAdmin.getEventInteractions, { eventId });
  const publish = useMutation(api.fairSponsoredAdmin.publishSponsoredSnapshot);
  const setSponsoredResult = useMutation(api.fairInteractionsAdmin.setSponsoredResultQuestion);
  // Browser time, read once per mount: tells a future package activation apart.
  const [now] = useState(() => Date.now());

  const view: SponsoredView | undefined = useMemo(() => {
    if (!rotation || !interactions) return undefined;
    const brandNames = new Map(directory.brands.map((row) => [row.brandId as string, row.name]));
    const candidateIds = new Set<string>(rotation.candidates.map((row) => row.eventModelId));
    return {
      models: catalog.models.map((model) => ({ id: model._id, name: modelFullName(model), brandName: brandNames.get(model.brandId) ?? "—" })),
      active: rotation.active
        ? {
            version: rotation.active.version,
            ...(rotation.active.publishedAt !== undefined ? { publishedAt: rotation.active.publishedAt } : {}),
            items: rotation.active.items.map((item) => ({ modelId: item.eventModelId, order: item.order, ...(item.audienceQuestionId ? { questionId: item.audienceQuestionId } : {}) })),
          }
        : null,
      history: rotation.history.map((row) => ({ id: row.snapshotId, version: row.version, status: row.status, ...(row.publishedAt !== undefined ? { publishedAt: row.publishedAt } : {}) })),
      candidates: rotation.candidates.map((row) => ({ modelId: row.eventModelId, activatedAt: row.packageActivatedAt, ...(row.audienceQuestionId ? { questionId: row.audienceQuestionId } : {}) })),
      questions: interactions.questions
        .filter((row) => row.status !== "draft" && (candidateIds.has(row.eventModelId) || rotation.active?.items.some((item) => item.audienceQuestionId === row._id)))
        .map((row) => ({ id: row._id, modelId: row.eventModelId, prompt: row.prompt, status: row.status })),
      now,
    };
  }, [rotation, interactions, catalog, directory, now]);

  const actions: SponsoredActions = {
    publish: () => interactionOutcome(() => publish({ eventId })),
    setResult: (modelId, questionId) => interactionOutcome(() => setSponsoredResult({ eventModelId: modelId as Id<"fairEventModels">, questionId: questionId as Id<"fairAudienceQuestions"> | null })),
  };

  return <AdminEventsSponsored view={view} actions={actions} />;
}

// B6: the Izveštaji section (convex/fairReports.ts). Mounted only while its
// tab is open; files are rendered by admin-only actions and downloaded in the
// browser (nothing is parked anywhere).
type FileResult = { fileName: string; mimeType: string; chunks: ArrayBuffer[] };

function downloadFile(result: FileResult) {
  const blob = new Blob(result.chunks, { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function AdminEventsReportsWorkspace({ eventId, catalog, directory }: {
  eventId: Id<"fairEvents">;
  catalog: FunctionReturnType<typeof api.fairAdmin.getEventCatalog>;
  directory: FunctionReturnType<typeof api.fairAdmin.getEventDirectory>;
}) {
  const runs = useQuery(api.fairReports.listReportRuns, { eventId });
  const [reviewId, setReviewId] = useState<Id<"fairReportRuns"> | null>(null);
  const reviewed = useQuery(api.fairReports.getReportRun, reviewId ? { reportRunId: reviewId } : "skip");
  const build = useMutation(api.fairReports.requestReportBuild);
  const approve = useMutation(api.fairReports.approveReportRun);
  const send = useMutation(api.fairReports.sendReportRun);
  const resend = useMutation(api.fairReports.resendReportRun);
  const retry = useMutation(api.fairReports.retryReportRun);
  const correct = useMutation(api.fairReports.createReportCorrection);
  const download = useAction(api.fairReports.downloadReportRun);
  const exportLeads = useAction(api.fairReports.exportLeadsFile);
  const exportOrganizer = useAction(api.fairReports.exportOrganizerAggregate);

  const view: ReportsView | undefined = useMemo(() => {
    if (!runs) return undefined;
    const businessNames = new Map(directory.businesses.map((row) => [row.businessId as string, row.name]));
    return {
      days: [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder).map((day) => ({ id: day._id, label: day.label, dateKey: day.dateKey })),
      participations: catalog.participations.map((row) => ({ id: row._id, name: businessNames.get(row.businessId) ?? row.externalKey })),
      runs: runs.map((row) => ({
        id: row.reportRunId,
        dayLabel: row.dayLabel,
        dateKey: row.dateKey,
        participationId: row.participationId,
        exhibitorName: row.exhibitorName,
        status: row.status,
        format: row.format,
        createdAt: row.createdAt,
        hasFile: row.hasFile,
        ...(row.recipient !== undefined ? { recipient: row.recipient } : {}),
        ...(row.error !== undefined ? { error: row.error } : {}),
        ...(row.approvedAt !== undefined ? { approvedAt: row.approvedAt } : {}),
        ...(row.correctionOfReportRunId !== undefined ? { correctionOf: row.correctionOfReportRunId } : {}),
        sendCount: row.sendCount,
        lastDelivery: row.lastDelivery,
      })),
      review: reviewId ? { runId: reviewId, dataset: reviewed === undefined ? undefined : reviewed?.dataset ?? null } : null,
    };
  }, [runs, reviewed, reviewId, catalog, directory]);

  const runId = (id: string) => id as Id<"fairReportRuns">;
  const actions: ReportsActions = {
    build: (dayId, participationId, format) => interactionOutcome(() => build({ eventDayId: dayId as Id<"fairEventDays">, participationId: participationId as Id<"fairParticipations">, format })),
    approve: (id) => interactionOutcome(() => approve({ reportRunId: runId(id) })),
    send: (id, recipient) => interactionOutcome(() => send({ reportRunId: runId(id), ...(recipient ? { recipient } : {}) })),
    resend: (id, recipient) => interactionOutcome(() => resend({ reportRunId: runId(id), ...(recipient ? { recipient } : {}) })),
    retry: (id) => interactionOutcome(() => retry({ reportRunId: runId(id) })),
    correct: (id) => interactionOutcome(() => correct({ reportRunId: runId(id) })),
    download: (id, format) => interactionOutcome(async () => downloadFile(await download({ reportRunId: runId(id), format }))),
    exportLeads: (participationId, format) => interactionOutcome(async () => downloadFile(await exportLeads({ eventId, participationId: participationId as Id<"fairParticipations">, format }))),
    exportOrganizer: (format) => interactionOutcome(async () => downloadFile(await exportOrganizer({ eventId, format }))),
    review: (id) => setReviewId(id ? runId(id) : null),
  };

  return <AdminEventsReports view={view} actions={actions} />;
}

export class AdminEventsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <AdminPanel><AdminErrorState title={dict.errorTitle} body={dict.errorBody} retryLabel={dict.retry} onRetry={() => window.location.reload()} /></AdminPanel>;
    return this.props.children;
  }
}
