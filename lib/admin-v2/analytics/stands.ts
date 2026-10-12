import type { AnalyticsData, AudienceData, EngagementData } from "./types";

// ADMIN v2 X3 — the stand ranking („Koji štand privlači i ko je na njemu?“)
// and what a package brings („Šta paket donosi?“). A stand is a map location:
// two exhibitors on one location are one stand with two segments.

export type StandSegment = { exhibitor: string; scans: number; models: number };

export type StandRank = {
  locationId: string;
  standCode: string;
  exhibitors: string[];
  /** Packages of the stand's models, in the order Napredni, Starter, Besplatan. */
  tiers: string[];
  models: number;
  scans: number;
  scansToday: number;
  uniquePerModel: number;
  /** Distinct visitors of the stand (one person, many cars = 1); null until the audience read is in. */
  visitors: number | null;
  leads: number;
  /** Leads / the stand's visitors (unique per model until they are known). */
  conversion: number | null;
  votes: number;
  /** Scans by exhibitor, the biggest first. */
  segments: StandSegment[];
  /** Scans / the first stand's scans (bar length, 0–1). */
  share: number;
  /** Scans / all scans of the fair. */
  fairShare: number | null;
};

const TIER_ORDER = ["advanced", "starter", "included"];
const tierPlace = (tier: string) => (TIER_ORDER.indexOf(tier) + 1 || 99);

export function standRanking(data: AnalyticsData, audience: AudienceData | undefined): StandRank[] {
  const visitors = new Map(audience?.locations.map((row) => [row.locationId, row.visitors]) ?? []);
  const rows = new Map<string, StandRank>();
  for (const model of data.models) {
    const key = model.mapLocationId || model.standCode;
    const row = rows.get(key) ?? {
      locationId: key, standCode: model.standCode, exhibitors: [], tiers: [], models: 0, scans: 0, scansToday: 0, uniquePerModel: 0,
      visitors: null, leads: 0, conversion: null, votes: 0, segments: [], share: 0, fairShare: null,
    };
    row.models += 1;
    row.scans += model.scans.total;
    row.scansToday += model.scans.today;
    row.uniquePerModel += model.uniquePerModel.total;
    row.leads += model.leads;
    row.votes += model.votes;
    if (!row.tiers.includes(model.tier)) row.tiers.push(model.tier);
    const segment = row.segments.find((entry) => entry.exhibitor === model.exhibitorName);
    if (segment) {
      segment.scans += model.scans.total;
      segment.models += 1;
    } else {
      row.segments.push({ exhibitor: model.exhibitorName, scans: model.scans.total, models: 1 });
    }
    rows.set(key, row);
  }
  const ordered = [...rows.values()].sort((a, b) => b.scans - a.scans || b.uniquePerModel - a.uniquePerModel || a.standCode.localeCompare(b.standCode, "sr", { numeric: true }));
  const top = ordered[0]?.scans ?? 0;
  const all = data.kpis.scans.total;
  return ordered.map((row) => {
    const standVisitors = audience ? (visitors.get(row.locationId) ?? 0) : null;
    const base = standVisitors ?? row.uniquePerModel;
    return {
      ...row,
      exhibitors: row.segments.map((segment) => segment.exhibitor).filter(Boolean).sort((a, b) => a.localeCompare(b, "sr")),
      tiers: [...row.tiers].sort((a, b) => tierPlace(a) - tierPlace(b)),
      segments: [...row.segments].sort((a, b) => b.scans - a.scans || a.exhibitor.localeCompare(b.exhibitor, "sr")),
      visitors: standVisitors,
      conversion: base > 0 ? row.leads / base : null,
      share: top > 0 ? row.scans / top : 0,
      fairShare: all > 0 ? row.scans / all : null,
    };
  });
}

/** Every exhibitor of the ranking: the keys the segment colours are assigned by. */
export function standExhibitors(data: AnalyticsData): string[] {
  return [...new Set(data.models.map((model) => model.exhibitorName))];
}

export type PackageRow = {
  tier: string;
  models: number;
  scans: number;
  scansPerModel: number;
  /** scansPerModel / the best package (bar length, 0–1). */
  share: number;
};

/** Scans per model by package; from the engagement read, or the same numbers from the ranking until it is in (or when it is partial). */
export function packageRows(data: AnalyticsData, engagement: EngagementData | undefined): PackageRow[] {
  const rows = engagement && !engagement.capped.days ? engagement.packages : localPackages(data);
  const best = Math.max(0, ...rows.map((row) => row.scansPerModel));
  return rows.map((row) => ({ ...row, share: best > 0 ? row.scansPerModel / best : 0 }));
}

function localPackages(data: AnalyticsData) {
  const byTier = new Map<string, { models: number; scans: number }>();
  for (const model of data.models) {
    const row = byTier.get(model.tier) ?? { models: 0, scans: 0 };
    row.models += 1;
    row.scans += model.scans.total;
    byTier.set(model.tier, row);
  }
  return [...byTier]
    .sort(([a], [b]) => tierPlace(a) - tierPlace(b) || a.localeCompare(b))
    .map(([tier, row]) => ({ tier, models: row.models, scans: row.scans, scansPerModel: Math.round((row.scans / row.models) * 10) / 10 }));
}

/** A package needs at least this many models for its scans per model to be an average worth comparing. */
export const PACKAGE_GAP_MIN_MODELS = 2;

/** The best and the weakest package by scans per model, and how many times they differ; null with fewer than two that have enough models. */
export function packageGap(rows: readonly PackageRow[]): { best: PackageRow; worst: PackageRow; times: number } | null {
  const withScans = rows.filter((row) => row.models >= PACKAGE_GAP_MIN_MODELS && row.scansPerModel > 0);
  if (withScans.length < 2) return null;
  const best = withScans.reduce((a, b) => (b.scansPerModel > a.scansPerModel ? b : a));
  const worst = withScans.reduce((a, b) => (b.scansPerModel < a.scansPerModel ? b : a));
  return best.tier === worst.tier ? null : { best, worst, times: best.scansPerModel / worst.scansPerModel };
}
