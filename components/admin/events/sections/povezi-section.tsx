"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { LinkStickerActions, RecentLinkView } from "@/components/admin/admin-events";
import { useAdminQueryState } from "@/components/admin/admin-ui/use-admin-query-state";
import { useMinuteNow } from "@/components/admin/admin-ui/use-minute-now";
import { usePolledQuery } from "@/components/admin/admin-ui/use-polled-query";
import { buildCatalogView } from "@/components/admin/events/event-catalog";
import { useAdminEvent } from "@/components/admin/events/event-context";
import { attempt } from "@/components/admin/events/event-outcome";
import { EventLinkStickerView } from "@/components/admin/events/sections/povezi-view";
import { eventDetailHref } from "@/lib/admin-v1/event-sections";
import { FAIR_QR_LABEL_DEFAULT_FORMAT } from "@/lib/fair-qr-label";

// Sajam 2026 N2 — container of `povezi`. The sticker of `?kod=` is read once
// and again after every save, undo or conflict (usePolledQuery: getQrDetail
// holds scan counters, A0 nalaz 0.5); the cars' sticker labels and the recent
// links are reactive (they change only with links). `now` for canUndo is the
// minute clock (queries never read the time).

export function useLinkStickerActions(): LinkStickerActions {
  const { eventId } = useAdminEvent();
  const link = useMutation(api.fairAdminQr.linkSticker);
  const undo = useMutation(api.fairAdminQr.undoLink);
  return {
    link: (input) => attempt(async () => {
      const result = await link({
        eventId,
        code: input.code,
        eventModelId: input.modelId as Id<"fairEventModels">,
        expectedHolderModelId: input.expectedHolderModelId as Id<"fairEventModels"> | null,
        replaceModelSticker: input.replaceModelSticker,
      });
      return {
        assignmentId: result.assignmentId,
        label: result.label,
        modelId: input.modelId,
        modelStatus: result.modelStatus,
        created: result.created,
        ...(result.movedFromModelId ? { movedFromModelId: result.movedFromModelId } : {}),
        ...(result.replacedLabel ? { replacedLabel: result.replacedLabel } : {}),
      };
    }),
    undo: (assignmentId) => attempt(async () => {
      const result = await undo({ assignmentId: assignmentId as Id<"fairQrAssignments"> });
      return { restoredToModelId: result.restoredToModelId, restoredReplacedLabel: result.restoredReplacedLabel };
    }),
  };
}

export function PoveziSection() {
  const { eventId, base, catalog, directory } = useAdminEvent();
  const [query, setQuery] = useAdminQueryState();
  const qrConfigured = Boolean(catalog.event.qrInventoryBusinessId);
  const qrCodes = useQuery(api.fairAdminStats.getModelQrCodes, { eventId });
  const view = useMemo(() => buildCatalogView(catalog, directory, undefined, qrCodes), [catalog, directory, qrCodes]);
  const now = useMinuteNow();
  const recent = useQuery(api.fairAdminQr.listRecentLinks, qrConfigured ? { eventId, now } : "skip");
  const sticker = usePolledQuery(api.fairAdminQr.getQrDetail, qrConfigured && query.kod ? { eventId, code: query.kod } : "skip");
  const actions = useLinkStickerActions();
  const recentRows = useMemo<RecentLinkView[] | undefined>(() => recent?.links.map((row) => ({
    assignmentId: row.assignmentId,
    label: row.label,
    modelId: row.eventModelId,
    modelName: row.modelName ? (row.modelVariant ? `${row.modelName} ${row.modelVariant}` : row.modelName) : null,
    exhibitorName: row.exhibitorName,
    standCode: row.standCode,
    linkedAt: row.linkedAt,
    linkedByName: row.linkedByName,
    canUndo: row.canUndo,
  })), [recent]);
  return (
    <EventLinkStickerView
      catalog={view}
      labelFormat={recent?.labelFormat ?? FAIR_QR_LABEL_DEFAULT_FORMAT}
      query={query}
      onQueryChange={setQuery}
      sticker={sticker.data}
      stickerFailed={sticker.data === undefined && Boolean(sticker.error)}
      recent={recentRows}
      actions={actions}
      onChanged={sticker.refresh}
      qrHref={(code) => eventDetailHref(base, "qr", code)}
    />
  );
}
