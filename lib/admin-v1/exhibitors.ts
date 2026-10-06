// Admin UX A5 — `izlagaci`: every exhibitor (participation) of the event,
// event_only and standard, with its brands, models per package, QR coverage,
// lead count and stands. Pure: built from the event catalog the frame already
// loaded plus the A3 lead counts; filters live in the query string.

import type { FairClientSegment, FairPackageTier, FairParticipationStatus } from "@/lib/fair-contract";
import { matchesSearch, normalizeSearch } from "./hierarchy";
import type { AdminQueryPatch, AdminQueryState } from "./query-state";

export type ExhibitorSource = {
  participations: { id: string; accountId: string; exhibitorName: string; codes: string; segment: FairClientSegment; status: FairParticipationStatus }[];
  stands: { participationId: string; code: string; displayName: string }[];
  models: { participationId: string; brandName: string; tier: FairPackageTier; qrCode: string | null }[];
};

export type ExhibitorLeadCounts = { byParticipation: { participationId: string; total: number; undelivered: number }[]; capped: boolean };

export type ExhibitorRow = {
  id: string;
  accountId: string;
  name: string;
  codes: string;
  segment: FairClientSegment;
  status: FairParticipationStatus;
  brands: string[];
  models: Record<FairPackageTier, number> & { total: number };
  qr: { assigned: number; total: number };
  /** null = still loading. */
  leads: { total: number; undelivered: number } | null;
  stands: string[];
  searchText: string;
};

export const EXHIBITOR_SEGMENT_PARAM: Record<string, FairClientSegment> = { "event-only": "event_only", standard: "standard" };
export const EXHIBITOR_SEGMENT_VALUES = ["event-only", "standard"] as const;

const collator = new Intl.Collator("sr-Latn-RS", { numeric: true, sensitivity: "base" });

export function buildExhibitorRows(source: ExhibitorSource, leads?: ExhibitorLeadCounts | null): ExhibitorRow[] {
  return source.participations.map((participation) => {
    const models = source.models.filter((model) => model.participationId === participation.id);
    const brands = [...new Set(models.map((model) => model.brandName))].sort(collator.compare);
    const stands = source.stands.filter((stand) => stand.participationId === participation.id).map((stand) => `${stand.displayName} · ${stand.code}`);
    const lead = leads ? leads.byParticipation.find((row) => row.participationId === participation.id) : undefined;
    return {
      id: participation.id,
      accountId: participation.accountId,
      name: participation.exhibitorName,
      codes: participation.codes,
      segment: participation.segment,
      status: participation.status,
      brands,
      models: {
        total: models.length,
        included: models.filter((model) => model.tier === "included").length,
        starter: models.filter((model) => model.tier === "starter").length,
        advanced: models.filter((model) => model.tier === "advanced").length,
      },
      qr: { assigned: models.filter((model) => model.qrCode).length, total: models.length },
      leads: leads ? { total: lead?.total ?? 0, undelivered: lead?.undelivered ?? 0 } : null,
      stands,
      searchText: normalizeSearch([participation.exhibitorName, participation.codes, ...brands, ...stands].join(" ")),
    };
  }).sort((a, b) => collator.compare(a.name, b.name));
}

export function applyExhibitorFilters(rows: readonly ExhibitorRow[], query: AdminQueryState): ExhibitorRow[] {
  const segment = query.segment ? EXHIBITOR_SEGMENT_PARAM[query.segment] : undefined;
  return rows.filter((row) => (!segment || row.segment === segment) && matchesSearch(row.searchText, query.q));
}

/** Count per segment value under the search (the segment filter itself is not applied). */
export function exhibitorSegmentCounts(rows: readonly ExhibitorRow[], query: AdminQueryState): Record<string, number> {
  const searched = applyExhibitorFilters(rows, { ...query, segment: undefined });
  return Object.fromEntries(EXHIBITOR_SEGMENT_VALUES.map((value) => [value, searched.filter((row) => row.segment === EXHIBITOR_SEGMENT_PARAM[value]).length]));
}

export function clearExhibitorFiltersPatch(): AdminQueryPatch {
  return { q: null, segment: null };
}
