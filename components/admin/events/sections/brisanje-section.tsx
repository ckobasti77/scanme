"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { AdminEventsRetention, type RetentionActions, type RetentionView } from "@/components/admin/admin-events-retention";
import { interactionOutcome } from "@/components/admin/events/event-outcome";

// B7 — container of `brisanje` (convex/fairRetention.ts). The purge is
// global (both fairs share the 16 Nov date), so it does not depend on the
// chosen event.

export function BrisanjeSection() {
  const overview = useQuery(api.fairRetention.getRetentionOverview, {});
  const startDryRun = useMutation(api.fairRetention.startPurgeDryRun);
  // Browser time, read once per mount: the countdown to 16 Nov (A9).
  const [now] = useState(() => Date.now());
  const view: RetentionView | undefined = useMemo(() => {
    if (!overview) return undefined;
    return {
      purgeAt: overview.preview.purgeAt,
      capPerCategory: overview.preview.capPerCategory,
      preview: overview.preview.categories,
      runs: overview.runs.map((run) => ({
        id: run.runId,
        mode: run.mode,
        trigger: run.trigger,
        status: run.status,
        startedAt: run.startedAt,
        ...(run.finishedAt !== undefined ? { finishedAt: run.finishedAt } : {}),
        batches: run.batches,
        totalRows: run.totalRows,
        categories: run.categories.map((entry) => ({ category: entry.category, rows: entry.rows, status: entry.status })),
      })),
      now,
    };
  }, [overview, now]);
  const actions: RetentionActions = { startDryRun: () => interactionOutcome(() => startDryRun({})) };
  return <AdminEventsRetention view={view} actions={actions} />;
}
