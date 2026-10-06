"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AdminEventsPassports,
  AdminEventsQuestions,
  AdminEventsSurveys,
  type InteractionsActions,
  type InteractionsView,
} from "@/components/admin/admin-events-interactions";
import { modelFullName } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { interactionOutcome } from "@/components/admin/events/event-outcome";

// Admin UX A2 — containers of `interakcije/glas-publike`, `/ankete` and
// `/pasos` (B3, convex/fairInteractionsAdmin.ts). `interakcije/forme` is in
// leadovi-section.tsx (the B4 lead settings).

function useInteractions(): { view: InteractionsView | undefined; actions: InteractionsActions } {
  const { eventId, catalog, directory } = useAdminEvent();
  const interactionData = useQuery(api.fairInteractionsAdmin.getEventInteractions, { eventId });
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

  const view: InteractionsView | undefined = useMemo(() => {
    if (!interactionData) return undefined;
    const brandNames = new Map(directory.brands.map((row) => [row.brandId, row.name]));
    const names = new Map(catalog.models.map((model) => [model._id, modelFullName(model)]));
    const days = [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder);
    const dayLabels = new Map(days.map((day) => [day._id, day.label]));
    const live = catalog.models.filter((model) => model.status !== "withdrawn");
    const passportByBrand = new Map(interactionData.passports.map((row) => [row.brandId, row]));
    const brandIds = [...new Set([...live.map((model) => model.brandId), ...interactionData.passports.map((row) => row.brandId)])];
    return {
      models: live.map((model) => ({ id: model._id, name: modelFullName(model), brandName: brandNames.get(model.brandId) ?? "—", tier: model.packageTier })),
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

  const actions: InteractionsActions = {
    saveQuestion: (input) => interactionOutcome(() => saveQuestion({
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
  return { view, actions };
}

export function GlasPublikeSection() {
  return <AdminEventsQuestions {...useInteractions()} />;
}

export function AnketeSection() {
  return <AdminEventsSurveys {...useInteractions()} />;
}

export function PasosSection() {
  return <AdminEventsPassports {...useInteractions()} />;
}
