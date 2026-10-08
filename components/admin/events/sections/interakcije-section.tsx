"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { InteractionsActions, InteractionsView } from "@/components/admin/admin-events-interactions";
import { AdminLoadingState, AdminPanel } from "@/components/admin/admin-primitives";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { modelFullName, type EventCatalogData, type EventDirectoryData } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { attempt, interactionOutcome } from "@/components/admin/events/event-outcome";
import type { PackageModel, PackageUpgradeOutcome } from "@/components/admin/events/exhibitor-packages";
import { EventSurveysView } from "@/components/admin/events/sections/interakcije-ankete-view";
import { ExhibitorFormsPart } from "@/components/admin/events/sections/interakcije-forme-section";
import { EventAudienceView } from "@/components/admin/events/sections/interakcije-glas-publike-view";
import { EventInteractionExhibitorView } from "@/components/admin/events/sections/interakcije-izlagac-view";
import { EventInteractionExhibitorsView } from "@/components/admin/events/sections/interakcije-izlagaci-view";
import { EventPassportsView, type PassportsActions } from "@/components/admin/events/sections/interakcije-pasos-view";
import { eventDetailHref, eventSectionHref, interactionExhibitorHref, isInteractionPart, type InteractionPart } from "@/lib/admin-v1/event-sections";
import {
  buildInteractionExhibitorRows,
  interactionListQuery,
  interactionPartPatch,
  interactionPartQuery,
  interactionReportDay,
  scopeToExhibitor,
} from "@/lib/admin-v1/interaction-exhibitors";
import { buildPassportRows } from "@/lib/admin-v1/passport-overview";
import type { AdminQueryPatch } from "@/lib/admin-v1/query-state";
import type { FairPackageTier } from "@/lib/fair-contract";

// Izlagači 2026 — containers of `interakcije` (the exhibitor cards) and
// `interakcije/<participationId>` (one exhibitor with Glas publike, Ankete,
// Pasoš brenda and Forme of its cars). The data are the A6/A7 queries of the
// whole event (B3 convex/fairInteractionsAdmin.ts, A7 convex/fairPassports.ts,
// convex/fairLeadsAdmin.ts), narrowed to the exhibitor on the client; a
// package is given with fairAdmin.upgradePackage, one call per car.

export function useInteractionsActions(): InteractionsActions {
  const saveQuestion = useMutation(api.fairInteractionsAdmin.upsertAudienceQuestion);
  const publishQuestion = useMutation(api.fairInteractionsAdmin.publishAudienceQuestion);
  const closeQuestion = useMutation(api.fairInteractionsAdmin.closeAudienceQuestion);
  const openQuestionNow = useMutation(api.fairInteractionsAdmin.openAudienceQuestionNow);
  const setSponsoredResult = useMutation(api.fairInteractionsAdmin.setSponsoredResultQuestion);
  const saveSurveyDraft = useMutation(api.fairInteractionsAdmin.upsertSurveyDraft);
  const publishSurvey = useMutation(api.fairInteractionsAdmin.publishSurvey);
  const retireSurvey = useMutation(api.fairInteractionsAdmin.retireSurvey);
  return {
    saveQuestion: (input) => interactionOutcome(() => saveQuestion({
      ...(input.questionId ? { questionId: input.questionId as Id<"fairAudienceQuestions"> } : {}),
      eventModelId: input.modelId as Id<"fairEventModels">, eventDayId: input.dayId as Id<"fairEventDays">, prompt: input.prompt, options: input.options, sortOrder: input.sortOrder,
    })),
    publishQuestion: (questionId) => interactionOutcome(() => publishQuestion({ questionId: questionId as Id<"fairAudienceQuestions"> })),
    closeQuestion: (questionId) => interactionOutcome(() => closeQuestion({ questionId: questionId as Id<"fairAudienceQuestions"> })),
    openQuestionNow: (questionId) => interactionOutcome(() => openQuestionNow({ questionId: questionId as Id<"fairAudienceQuestions"> })),
    setSponsoredResult: (modelId, questionId) => interactionOutcome(() => setSponsoredResult({ eventModelId: modelId as Id<"fairEventModels">, questionId: questionId as Id<"fairAudienceQuestions"> | null })),
    saveSurveyDraft: (modelId, questions) => interactionOutcome(() => saveSurveyDraft({ eventModelId: modelId as Id<"fairEventModels">, questions })),
    publishSurvey: (surveyId) => interactionOutcome(() => publishSurvey({ surveyId: surveyId as Id<"fairSurveys"> })),
    retireSurvey: (surveyId) => interactionOutcome(() => retireSurvey({ surveyId: surveyId as Id<"fairSurveys"> })),
  };
}

function usePassportsActions(eventId: Id<"fairEvents">): PassportsActions {
  const refresh = useMutation(api.fairPassports.refreshPassports);
  const setHidden = useMutation(api.fairPassports.setPassportHidden);
  const removeModel = useMutation(api.fairInteractionsAdmin.removePassportModel);
  return {
    refresh: async () => {
      const result = await attempt(() => refresh({ eventId }));
      return result.ok ? { ok: true, summary: result.value } : result;
    },
    setHidden: async (passportId, hidden) => {
      const result = await attempt(() => setHidden({ passportId: passportId as Id<"fairPassportConfigs">, hidden }));
      return result.ok ? { ok: true } : result;
    },
    removeModel: async (passportId, modelId) => {
      const result = await attempt(() => removeModel({ passportId: passportId as Id<"fairPassportConfigs">, eventModelId: modelId as Id<"fairEventModels"> }));
      return result.ok ? { ok: true } : result;
    },
  };
}

/** One car's package upgrade (fairAdmin.upgradePackage, the same mutation as the Modeli detail). */
function usePackageUpgrade(): (modelId: string, to: FairPackageTier) => Promise<PackageUpgradeOutcome> {
  const upgrade = useMutation(api.fairAdmin.upgradePackage);
  return useCallback(async (modelId, to) => {
    const result = await attempt(() => upgrade({ eventModelId: modelId as Id<"fairEventModels">, toTier: to }));
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  }, [upgrade]);
}

/** Exhibitor names of the event (business, else account, else the participation key). */
function exhibitorNames(catalog: EventCatalogData, directory: EventDirectoryData) {
  const accounts = new Map(directory.accounts.map((row) => [row.accountId as string, row.name]));
  const businesses = new Map(directory.businesses.map((row) => [row.businessId as string, row.name]));
  return new Map(catalog.participations.map((row) => [row._id as string, businesses.get(row.businessId) ?? accounts.get(row.accountId) ?? row.externalKey]));
}

/** Live cars of the event with their package, per exhibitor (the packages panel). */
function packageModelsByExhibitor(catalog: EventCatalogData, directory: EventDirectoryData) {
  const brands = new Map(directory.brands.map((row) => [row.brandId as string, row.name]));
  const byExhibitor = new Map<string, PackageModel[]>();
  for (const model of catalog.models) {
    if (model.status === "withdrawn") continue;
    const list = byExhibitor.get(model.participationId) ?? [];
    list.push({ id: model._id, name: modelFullName(model), brandName: brands.get(model.brandId) ?? "—", tier: model.packageTier, packageActivatedAt: model.packageActivatedAt, status: model.status });
    byExhibitor.set(model.participationId, list);
  }
  for (const list of byExhibitor.values()) list.sort((a, b) => a.brandName.localeCompare(b.brandName, "sr-Latn-RS") || a.name.localeCompare(b.name, "sr-Latn-RS"));
  return byExhibitor;
}

/**
 * Everything both pages read: the exhibitor rows (cards), the Glas publike /
 * Ankete view of every live car and the passports. `undefined` = loading.
 */
function useInteractionData(now: number, dateKey: string | undefined) {
  const { eventId, catalog, directory } = useAdminEvent();
  const interactionData = useQuery(api.fairInteractionsAdmin.getEventInteractions, { eventId });
  const overview = useQuery(api.fairPassports.getPassportOverview, { eventId });

  const names = useMemo(() => exhibitorNames(catalog, directory), [catalog, directory]);
  const days = useMemo(() => [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder).map((day) => ({ id: day._id as string, dateKey: day.dateKey, label: day.label, startsAt: day.startsAt, endsAt: day.endsAt })), [catalog]);

  const view: InteractionsView | undefined = useMemo(() => {
    if (!interactionData) return undefined;
    const brandNames = new Map(directory.brands.map((row) => [row.brandId as string, row.name]));
    const models = catalog.models.filter((model) => model.status !== "withdrawn").map((model) => ({
      id: model._id as string,
      name: modelFullName(model),
      brandId: model.brandId as string,
      brandName: brandNames.get(model.brandId) ?? "—",
      exhibitorId: model.participationId as string,
      exhibitorName: names.get(model.participationId) ?? "—",
      externalKey: model.externalKey,
      tier: model.packageTier,
      packageActivatedAt: model.packageActivatedAt,
      status: model.status,
    })).sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName, "sr-Latn-RS") || a.brandName.localeCompare(b.brandName, "sr-Latn-RS") || a.name.localeCompare(b.name, "sr-Latn-RS"));
    return {
      models,
      days,
      questions: interactionData.questions.map((row) => ({
        id: row._id, modelId: row.eventModelId, dayId: row.eventDayId, prompt: row.prompt, options: row.options,
        status: row.status, sortOrder: row.sortOrder, showOnSponsoredRotation: row.showOnSponsoredRotation,
        startsAt: row.startsAt, ...(row.endsAt !== undefined ? { endsAt: row.endsAt } : {}),
      })),
      surveys: interactionData.surveys.map((row) => ({
        id: row._id, modelId: row.eventModelId, version: row.version, status: row.status, ...(row.title !== undefined ? { title: row.title } : {}),
        questions: row.questions.map((question) => ({ id: question.id, prompt: question.prompt, kind: question.kind, options: question.options, order: question.order })),
      })),
    };
  }, [catalog, directory, interactionData, names, days]);

  const passportRows = useMemo(() => {
    if (!overview) return undefined;
    return buildPassportRows(overview, {
      brands: new Map(directory.brands.map((row) => [row.brandId as string, row.name])),
      exhibitors: names,
      models: new Map(catalog.models.map((model) => [model._id as string, { name: modelFullName(model), status: model.status }])),
    }, now);
  }, [overview, directory, names, catalog, now]);

  const rows = useMemo(() => buildInteractionExhibitorRows({
    participations: catalog.participations.map((row) => ({ id: row._id, accountId: row.accountId, businessId: row.businessId, externalKey: row.externalKey, status: row.status })),
    models: catalog.models.map((model) => ({ id: model._id, participationId: model.participationId, brandId: model.brandId, tier: model.packageTier, packageActivatedAt: model.packageActivatedAt, status: model.status })),
    accounts: new Map(directory.accounts.map((row) => [row.accountId as string, { name: row.name, websiteUrl: row.websiteUrl }])),
    businesses: new Map(directory.businesses.map((row) => [row.businessId as string, { name: row.name, logoUrl: row.logoUrl }])),
    brands: new Map(directory.brands.map((row) => [row.brandId as string, row.name])),
    days,
    questions: view?.questions,
    surveys: view?.surveys,
    passports: passportRows?.map((row) => ({ exhibitorId: row.exhibitorId, brandId: row.brandId, state: row.state })),
  }, now, dateKey), [catalog, directory, days, view, passportRows, now, dateKey]);

  return { rows, view, passportRows, eventStartsAt: overview?.eventStartsAt, days };
}

export function InterakcijeSection() {
  const { base, catalog, directory } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const [now] = useState(() => Date.now());
  const { rows, days } = useInteractionData(now, query.dan);
  const upgrade = usePackageUpgrade();
  const packages = useMemo(() => packageModelsByExhibitor(catalog, directory), [catalog, directory]);
  const kept = interactionListQuery(query);
  return (
    <EventInteractionExhibitorsView
      rows={rows}
      dayLabel={interactionReportDay(days, now, query.dan)?.label ?? null}
      query={query}
      onQueryChange={setQuery}
      exhibitorHref={(participationId) => interactionExhibitorHref(base, participationId, kept)}
      packagesOf={(participationId) => packages.get(participationId) ?? []}
      onUpgrade={upgrade}
      now={now}
      importHref={eventSectionHref(base, "import")}
      modelHref={(modelId) => eventDetailHref(base, "modeli", modelId)}
    />
  );
}

/** After the parts load, `#ankete`… (a Modeli detail link) lands on its part; the browser's own jump ran on the empty page. */
function useScrollToPart(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const id = window.location.hash.slice(1);
    if (isInteractionPart(id)) document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [ready]);
}

function PartLoading() {
  return <AdminPanel><AdminLoadingState compact /></AdminPanel>;
}

export function InterakcijeIzlagacSection({ participationId }: { participationId: string }) {
  const { eventId, base, catalog, directory } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const [now] = useState(() => Date.now());
  const { rows, view, passportRows, eventStartsAt } = useInteractionData(now, query.dan);
  const actions = useInteractionsActions();
  const passportActions = usePassportsActions(eventId);
  const upgrade = usePackageUpgrade();
  const models = useMemo(() => packageModelsByExhibitor(catalog, directory).get(participationId) ?? [], [catalog, directory, participationId]);
  const exhibitor = rows.find((row) => row.id === participationId) ?? null;
  const scoped = useMemo(() => (view ? scopeToExhibitor(view, participationId) : undefined), [view, participationId]);
  const passports = useMemo(() => passportRows?.filter((row) => row.exhibitorId === participationId), [passportRows, participationId]);
  useScrollToPart(Boolean(exhibitor?.hasInteractions && scoped && passports));

  const part = (name: InteractionPart) => ({
    query: interactionPartQuery(name, query),
    onQueryChange: (patch: AdminQueryPatch) => setQuery(interactionPartPatch(name, patch)),
  });
  const listQuery = interactionListQuery(query);

  return (
    <EventInteractionExhibitorView
      exhibitor={exhibitor}
      models={models}
      now={now}
      listHref={eventSectionHref(base, "interakcije", listQuery)}
      profileHref={exhibitor ? `/admin/klijenti/${encodeURIComponent(exhibitor.accountId)}` : null}
      modelsHref={eventSectionHref(base, "modeli", { izlagac: participationId })}
      importHref={eventSectionHref(base, "import")}
      modelHref={(modelId) => eventDetailHref(base, "modeli", modelId)}
      onUpgrade={upgrade}
      parts={{
        "glas-publike": scoped ? <EventAudienceView view={scoped} actions={actions} now={now} {...part("glas-publike")} scoped /> : <PartLoading />,
        ankete: scoped ? <EventSurveysView view={scoped} actions={actions} now={now} {...part("ankete")} /> : <PartLoading />,
        pasos: (
          <EventPassportsView
            rows={passports}
            eventStartsAt={eventStartsAt}
            exhibitors={exhibitor ? [{ id: exhibitor.id, name: exhibitor.name }] : []}
            {...part("pasos")}
            actions={passportActions}
            scoped
          />
        ),
        forme: <ExhibitorFormsPart exhibitor={{ id: participationId, name: exhibitor?.name ?? "" }} {...part("forme")} />,
      }}
    />
  );
}
