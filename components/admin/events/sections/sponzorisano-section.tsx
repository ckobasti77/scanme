"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminEventsSponsored, type SponsoredActions, type SponsoredView } from "@/components/admin/admin-events-sponsored";
import { modelFullName } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { interactionOutcome } from "@/components/admin/events/event-outcome";

// B5 — container of `sponzorisano` (convex/fairSponsoredAdmin.ts and the B3
// result-question choice).

export function SponzorisanoSection() {
  const { eventId, catalog, directory } = useAdminEvent();
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
