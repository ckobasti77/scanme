"use client";

import { useConvex, useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { buildCatalogView } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { attempt, outcome } from "@/components/admin/events/event-outcome";
import { SectionLoading } from "@/components/admin/events/sections/loading";
import {
  EventModelDetailView,
  EventModelsView,
  type ModelDetailActions,
  type ModelDetailSummary,
} from "@/components/admin/events/sections/modeli-view";
import { useResolveTest } from "@/components/admin/events/sections/qr-section";
import { eventDetailHref, eventSectionHref, interactionExhibitorHref } from "@/lib/admin-v1/event-sections";
import { modelListQuery } from "@/lib/admin-v1/model-filters";

// Admin UX A3 — containers of `modeli` (filters in the query string) and
// `modeli/[modelId]` (the same B1 mutations as before A3, plus read-only
// summaries from the existing B3–B5 admin queries and A3 fairAdminStats).

function useCheckedCatalog() {
  const { eventId, catalog, directory } = useAdminEvent();
  const validation = useQuery(api.fairAdmin.listValidationIssues, { eventId });
  const qrCodes = useQuery(api.fairAdminStats.getModelQrCodes, { eventId });
  return useMemo(() => (validation && qrCodes ? buildCatalogView(catalog, directory, validation, qrCodes) : undefined), [catalog, directory, validation, qrCodes]);
}

export function ModeliSection() {
  const { base } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const view = useCheckedCatalog();
  const listQuery = modelListQuery(query);
  if (!view) return <SectionLoading />;
  return (
    <EventModelsView
      catalog={view}
      query={query}
      onQueryChange={setQuery}
      modelHref={(id) => eventDetailHref(base, "modeli", id, listQuery)}
      importHref={eventSectionHref(base, "import")}
    />
  );
}

/** The model actions of the detail: the same B1 mutations and resolve test as before A3. */
export function useModelDetailActions(): ModelDetailActions {
  const publish = useMutation(api.fairAdmin.publishModel);
  const withdraw = useMutation(api.fairAdmin.withdrawModel);
  const upgrade = useMutation(api.fairAdmin.upgradePackage);
  const assignQr = useMutation(api.fairAdmin.assignQr);
  const { resolveTest } = useResolveTest();
  return {
    publish: (id) => outcome(() => publish({ eventModelId: id as Id<"fairEventModels"> })),
    withdraw: (id) => outcome(() => withdraw({ eventModelId: id as Id<"fairEventModels"> })),
    upgrade: (id, toTier) => outcome(() => upgrade({ eventModelId: id as Id<"fairEventModels">, toTier })),
    assignQr: (id, resolverCode) => outcome(() => assignQr({ eventModelId: id as Id<"fairEventModels">, resolverCode })),
    resolveTest,
  };
}

/** N2 — the typed sticker before the confirmation step of „Štampani kod“ (one read, not a subscription). */
function useQrLookup(): Pick<ModelDetailActions, "lookupQr"> {
  const { eventId } = useAdminEvent();
  const convex = useConvex();
  return { lookupQr: (code) => attempt(() => convex.query(api.fairAdminQr.getQrDetail, { eventId, code })) };
}

function useModelSummary(modelId: string): ModelDetailSummary {
  const { eventId, catalog } = useAdminEvent();
  const model = catalog.models.find((row) => row._id === modelId) ?? null;
  const interactions = useQuery(api.fairInteractionsAdmin.getEventInteractions, { eventId });
  const settings = useQuery(api.fairLeadsAdmin.getModelLeadSettings, model ? { eventModelId: model._id } : "skip");
  const leadCounts = useQuery(api.fairAdminStats.getLeadCounts, { eventId });
  const rotation = useQuery(api.fairSponsoredAdmin.getSponsoredRotationAdmin, { eventId });
  return useMemo(() => {
    if (!model) return {};
    const summary: ModelDetailSummary = {};
    if (interactions) {
      const days = [...catalog.days].sort((a, b) => a.sortOrder - b.sortOrder);
      const questions = interactions.questions.filter((row) => row.eventModelId === model._id);
      summary.questions = days.flatMap((day) => {
        const ofDay = questions.filter((row) => row.eventDayId === day._id);
        if (!ofDay.length) return [];
        const count = (status: string) => ofDay.filter((row) => row.status === status).length;
        return [{ dayLabel: day.label, published: count("published"), draft: count("draft"), closed: count("closed") }];
      });
      const surveys = interactions.surveys.filter((row) => row.eventModelId === model._id).sort((a, b) => b.version - a.version);
      const survey = surveys.find((row) => row.status === "published") ?? surveys[0];
      summary.survey = survey ? { version: survey.version, status: survey.status } : null;
      const passport = interactions.passports.find((row) => row.brandId === model.brandId);
      summary.passport = passport ? { status: passport.status, member: passport.members.some((member) => member.eventModelId === model._id && member.status === "required"), hidden: passport.hiddenAt !== undefined } : null;
    }
    if (settings) summary.forms = { interest: Boolean(settings.interest?.enabled), testDrive: Boolean(settings.testDrive?.enabled) };
    if (leadCounts) {
      const row = leadCounts.byModel.find((entry) => entry.eventModelId === model._id);
      summary.leads = { interest: row?.interest ?? 0, testDrive: row?.testDrive ?? 0, undelivered: row?.undelivered ?? 0, capped: leadCounts.capped };
    }
    if (rotation) {
      const item = rotation.active?.items.find((entry) => entry.eventModelId === model._id);
      summary.sponsored = item ? { state: "active", order: item.order + 1 }
        : rotation.candidates.some((entry) => entry.eventModelId === model._id) ? { state: "candidate" } : { state: "none" };
    }
    return summary;
  }, [model, catalog.days, interactions, settings, leadCounts, rotation]);
}

export function ModelDetailSection({ modelId }: { modelId: string }) {
  const { base } = useAdminEvent();
  const [query] = useAdminQueryState();
  const view = useCheckedCatalog();
  const actions = { ...useModelDetailActions(), ...useQrLookup() };
  const summary = useModelSummary(modelId);
  const listQuery = modelListQuery(query);
  if (!view) return <SectionLoading />;
  return (
    <EventModelDetailView
      key={modelId}
      catalog={view}
      modelId={modelId}
      actions={actions}
      query={query}
      listHref={eventSectionHref(base, "modeli", listQuery)}
      modelHref={(id) => eventDetailHref(base, "modeli", id, listQuery)}
      qrHref={(code) => eventDetailHref(base, "qr", code)}
      sectionHref={(path, extra) => eventSectionHref(base, path, extra)}
      interactionHref={(participationId, part, extra) => interactionExhibitorHref(base, participationId, extra, part)}
      summary={summary}
    />
  );
}
