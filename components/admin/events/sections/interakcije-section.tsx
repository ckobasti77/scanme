"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { InteractionsActions, InteractionsView } from "@/components/admin/admin-events-interactions";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { modelFullName } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { attempt, interactionOutcome } from "@/components/admin/events/event-outcome";
import { EventSurveysView } from "@/components/admin/events/sections/interakcije-ankete-view";
import { EventAudienceView } from "@/components/admin/events/sections/interakcije-glas-publike-view";
import { EventPassportsView, type PassportsActions } from "@/components/admin/events/sections/interakcije-pasos-view";
import { buildPassportRows } from "@/lib/admin-v1/passport-overview";

// Admin UX A2 — containers of `interakcije/glas-publike`, `/ankete` and
// `/pasos` (B3, convex/fairInteractionsAdmin.ts). `interakcije/forme` is in
// interakcije-forme-section.tsx (A7). A6: the model's exhibitor, brand and
// package activation go to the picker and the quota; the form's model and
// day live in the query string (`?model=&dan=`). A7: Pasoš reads the
// automatic passports (convex/fairPassports.ts).

export function useInteractionsActions(): InteractionsActions {
  const saveQuestion = useMutation(api.fairInteractionsAdmin.upsertAudienceQuestion);
  const publishQuestion = useMutation(api.fairInteractionsAdmin.publishAudienceQuestion);
  const closeQuestion = useMutation(api.fairInteractionsAdmin.closeAudienceQuestion);
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
    setSponsoredResult: (modelId, questionId) => interactionOutcome(() => setSponsoredResult({ eventModelId: modelId as Id<"fairEventModels">, questionId: questionId as Id<"fairAudienceQuestions"> | null })),
    saveSurveyDraft: (modelId, questions) => interactionOutcome(() => saveSurveyDraft({ eventModelId: modelId as Id<"fairEventModels">, questions })),
    publishSurvey: (surveyId) => interactionOutcome(() => publishSurvey({ surveyId: surveyId as Id<"fairSurveys"> })),
    retireSurvey: (surveyId) => interactionOutcome(() => retireSurvey({ surveyId: surveyId as Id<"fairSurveys"> })),
  };
}

function useInteractions(): { view: InteractionsView | undefined; actions: InteractionsActions } {
  const { eventId, catalog, directory } = useAdminEvent();
  const interactionData = useQuery(api.fairInteractionsAdmin.getEventInteractions, { eventId });
  const actions = useInteractionsActions();

  const view: InteractionsView | undefined = useMemo(() => {
    if (!interactionData) return undefined;
    const brandNames = new Map(directory.brands.map((row) => [row.brandId, row.name]));
    const accounts = new Map(directory.accounts.map((row) => [row.accountId, row.name]));
    const businesses = new Map(directory.businesses.map((row) => [row.businessId, row.name]));
    const exhibitorNames = new Map(catalog.participations.map((row) => [row._id, businesses.get(row.businessId) ?? accounts.get(row.accountId) ?? row.externalKey]));
    const days = [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder);
    const live = catalog.models.filter((model) => model.status !== "withdrawn");
    const models = live.map((model) => ({
      id: model._id,
      name: modelFullName(model),
      brandId: model.brandId,
      brandName: brandNames.get(model.brandId) ?? "—",
      exhibitorId: model.participationId,
      exhibitorName: exhibitorNames.get(model.participationId) ?? "—",
      externalKey: model.externalKey,
      tier: model.packageTier,
      packageActivatedAt: model.packageActivatedAt,
      status: model.status,
    })).sort((a, b) => a.exhibitorName.localeCompare(b.exhibitorName, "sr-Latn-RS") || a.brandName.localeCompare(b.brandName, "sr-Latn-RS") || a.name.localeCompare(b.name, "sr-Latn-RS"));
    return {
      models,
      days: days.map((day) => ({ id: day._id, dateKey: day.dateKey, label: day.label, startsAt: day.startsAt, endsAt: day.endsAt })),
      questions: interactionData.questions.map((row) => ({
        id: row._id, modelId: row.eventModelId, dayId: row.eventDayId, prompt: row.prompt, options: row.options,
        status: row.status, sortOrder: row.sortOrder, showOnSponsoredRotation: row.showOnSponsoredRotation,
      })),
      surveys: interactionData.surveys.map((row) => ({
        id: row._id, modelId: row.eventModelId, version: row.version, status: row.status, ...(row.title !== undefined ? { title: row.title } : {}),
        questions: row.questions.map((question) => ({ id: question.id, prompt: question.prompt, kind: question.kind, options: question.options, order: question.order })),
      })),
    };
  }, [catalog, directory, interactionData]);

  return { view, actions };
}

export function GlasPublikeSection() {
  const [query, setQuery] = useAdminQueryState();
  const [now] = useState(() => Date.now());
  return <EventAudienceView {...useInteractions()} now={now} query={query} onQueryChange={setQuery} />;
}

export function AnketeSection() {
  const [query, setQuery] = useAdminQueryState();
  const [now] = useState(() => Date.now());
  return <EventSurveysView {...useInteractions()} now={now} query={query} onQueryChange={setQuery} />;
}

/** Exhibitor names of the event (business, else account, else the participation key). */
export function useExhibitorNames() {
  const { catalog, directory } = useAdminEvent();
  return useMemo(() => {
    const accounts = new Map(directory.accounts.map((row) => [row.accountId, row.name]));
    const businesses = new Map(directory.businesses.map((row) => [row.businessId, row.name]));
    return catalog.participations
      .map((row) => ({ id: row._id as string, name: businesses.get(row.businessId) ?? accounts.get(row.accountId) ?? row.externalKey }))
      .sort((a, b) => a.name.localeCompare(b.name, "sr-Latn-RS"));
  }, [catalog, directory]);
}

export function PasosSection() {
  const { eventId, catalog, directory } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const [now] = useState(() => Date.now());
  const exhibitors = useExhibitorNames();
  const overview = useQuery(api.fairPassports.getPassportOverview, { eventId });
  const refresh = useMutation(api.fairPassports.refreshPassports);
  const setHidden = useMutation(api.fairPassports.setPassportHidden);
  const removeModel = useMutation(api.fairInteractionsAdmin.removePassportModel);
  const rows = useMemo(() => {
    if (!overview) return undefined;
    const names = {
      brands: new Map(directory.brands.map((row) => [row.brandId as string, row.name])),
      exhibitors: new Map(exhibitors.map((row) => [row.id, row.name])),
      models: new Map(catalog.models.map((model) => [model._id as string, { name: modelFullName(model), status: model.status }])),
    };
    return buildPassportRows(overview, names, now);
  }, [overview, directory, exhibitors, catalog, now]);
  const actions: PassportsActions = {
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
  return <EventPassportsView rows={rows} eventStartsAt={overview?.eventStartsAt} exhibitors={exhibitors} query={query} onQueryChange={setQuery} actions={actions} />;
}
