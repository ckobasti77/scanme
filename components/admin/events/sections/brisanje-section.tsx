"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { AdminEventsPreEvent, type PreEventActions, type PreEventOutcome } from "@/components/admin/admin-events-pre-event";
import { AdminEventsRetention, type RetentionActions, type RetentionView } from "@/components/admin/admin-events-retention";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { attempt, interactionOutcome } from "@/components/admin/events/event-outcome";

// B7 — container of `brisanje` (convex/fairRetention.ts). The purge is
// global (both fairs share the 16 Nov date), so it does not depend on the
// chosen event. P1 — above it, the chosen event's pre-event data and its
// reset (convex/fairPreEvent.ts).

async function preEventOutcome(run: () => Promise<{ summary: { total: number; capped: boolean } }>): Promise<PreEventOutcome> {
  const result = await attempt(run);
  return result.ok ? { ok: true, total: result.value.summary.total, capped: result.value.summary.capped } : { ok: false, code: result.code };
}

function PreEventPart() {
  const { eventId } = useAdminEvent();
  const summary = useQuery(api.fairPreEvent.getPreEventSummary, { eventId });
  const reset = useMutation(api.fairPreEvent.resetPreEventData);
  const actions: PreEventActions = {
    dryRun: () => preEventOutcome(() => reset({ eventId, dryRun: true })),
    reset: (confirmSlug) => preEventOutcome(() => reset({ eventId, dryRun: false, confirmSlug })),
  };
  return <AdminEventsPreEvent summary={summary} actions={actions} />;
}

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
  return (
    <div className="grid min-w-0 gap-5">
      <PreEventPart />
      <AdminEventsRetention view={view} actions={actions} />
    </div>
  );
}
