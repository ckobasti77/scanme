"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminEventsPassports,
  type InteractionsActions,
  type InteractionsView,
} from "@/components/admin/admin-events-interactions";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { modelFullName } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { interactionOutcome } from "@/components/admin/events/event-outcome";
import { EventSurveysView } from "@/components/admin/events/sections/interakcije-ankete-view";
import { EventAudienceView } from "@/components/admin/events/sections/interakcije-glas-publike-view";

// Admin UX A2 — containers of `interakcije/glas-publike`, `/ankete` and
// `/pasos` (B3, convex/fairInteractionsAdmin.ts). `interakcije/forme` is in
// leadovi-section.tsx (the B4 lead settings). A6: the model's exhibitor,
// brand and package activation go to the picker and the quota; the form's
// model and day live in the query string (`?model=&dan=`).

export function useInteractionsActions(): InteractionsActions {
  const { eventId } = useAdminEvent();
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
    openPassport: (brandId) => interactionOutcome(() => openPassport({ eventId, brandId: brandId as Id<"brands"> })),
    publishPassport: (passportId) => interactionOutcome(() => publishPassport({ passportId: passportId as Id<"fairPassportConfigs"> })),
    withdrawPassport: (passportId) => interactionOutcome(() => withdrawPassport({ passportId: passportId as Id<"fairPassportConfigs"> })),
    removePassportModel: (passportId, modelId) => interactionOutcome(() => removePassportModel({ passportId: passportId as Id<"fairPassportConfigs">, eventModelId: modelId as Id<"fairEventModels"> })),
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
    const names = new Map(catalog.models.map((model) => [model._id, modelFullName(model)]));
    const days = [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder);
    const live = catalog.models.filter((model) => model.status !== "withdrawn");
    const passportByBrand = new Map(interactionData.passports.map((row) => [row.brandId, row]));
    const brandIds = [...new Set([...live.map((model) => model.brandId), ...interactionData.passports.map((row) => row.brandId)])];
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

export function PasosSection() {
  return <AdminEventsPassports {...useInteractions()} />;
}
