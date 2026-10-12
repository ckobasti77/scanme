import { fairMapLabelPoint, fairMapLocationTakesStands, type FairMapGeometry, type FairMapPoint } from "@/lib/fair-map";
import type { AnalyticsHeatRow, AnalyticsModel } from "./types";

// ADMIN v2 X3 — the hall heat map as blocks (the 3D view, ZADATAK §6): every
// stand the organizer draws is a block on the floor plan. Its height is the
// number of scans, its colour the heat level of „Gde je gužva“ (unique per
// stand, the same scale as the public map and the 2D view). The zones of the
// map stand side by side on one floor. Pure: the scene only draws what this
// returns, and the list under the map reads the same blocks.

/** Empty space between two zones, as a share of the wider zone. */
const ZONE_GAP = 0.08;

export type HeatZone = {
  id: string;
  /** Where the zone starts on the shared floor (map pixels). */
  offsetX: number;
  width: number;
  height: number;
  outline: readonly FairMapPoint[] | null;
};

export type HeatBlock = {
  locationId: string;
  label: string;
  zoneId: string;
  /** The stand outline on the shared floor (map pixels, y down). */
  polygon: FairMapPoint[];
  /** Where the label stands (the centroid of the outline). */
  center: FairMapPoint;
  /** Scans of the period: the height before scaling. */
  value: number;
  /** value / the tallest block (0–1); 0 = a flat tile. */
  height: number;
  /** Heat level 0–1 (0 = no unique scan in the period: the neutral tile colour). */
  level: number;
  /** Unique per stand in the period and its share, for the label; null without a scan. */
  count: number | null;
  share: number | null;
};

export type HeatScene = { zones: HeatZone[]; blocks: HeatBlock[]; width: number; depth: number; maxValue: number };

/** Scans per map location: today's or the whole fair's (the heights of the blocks). */
export function locationScans(models: readonly AnalyticsModel[], period: "today" | "total"): Map<string, number> {
  const scans = new Map<string, number>();
  for (const model of models) {
    if (!model.mapLocationId) continue;
    scans.set(model.mapLocationId, (scans.get(model.mapLocationId) ?? 0) + model.scans[period]);
  }
  return scans;
}

/** The zones of the map that hold at least one stand of `heat` (a zone without a scan is not drawn, it is named under the map). */
export function heatZoneIds(geometry: FairMapGeometry, heat: readonly AnalyticsHeatRow[]): string[] {
  const hot = new Set(heat.map((row) => row.locationId));
  return geometry.zones.filter((zone) => zone.locations.some((location) => hot.has(location.id))).map((zone) => zone.id);
}

/** `zoneIds`: draw only these zones (default: all of the map). */
export function heatBlocks(geometry: FairMapGeometry, heat: readonly AnalyticsHeatRow[], values: ReadonlyMap<string, number>, zoneIds?: readonly string[]): HeatScene {
  const byLocation = new Map(heat.map((row) => [row.locationId, row]));
  const drawn = geometry.zones.filter((zone) => !zoneIds || zoneIds.includes(zone.id));
  const gap = Math.max(0, ...drawn.map((zone) => zone.image.width)) * ZONE_GAP;
  const zones: HeatZone[] = [];
  const blocks: HeatBlock[] = [];
  let offsetX = 0;
  for (const zone of drawn) {
    const move = (points: readonly FairMapPoint[]): FairMapPoint[] => points.map(([x, y]) => [x + offsetX, y]);
    zones.push({ id: zone.id, offsetX, width: zone.image.width, height: zone.image.height, outline: zone.outline ? move(zone.outline) : null });
    for (const location of zone.locations) {
      if (!fairMapLocationTakesStands(location)) continue;
      const row = byLocation.get(location.id);
      const polygon = move(location.polygon);
      blocks.push({
        locationId: location.id,
        label: location.label,
        zoneId: zone.id,
        polygon,
        center: fairMapLabelPoint(polygon),
        value: Math.max(0, values.get(location.id) ?? 0),
        height: 0,
        level: row?.level ?? 0,
        count: row?.count ?? null,
        share: row?.share ?? null,
      });
    }
    offsetX += zone.image.width + gap;
  }
  const maxValue = Math.max(0, ...blocks.map((block) => block.value));
  for (const block of blocks) block.height = maxValue > 0 ? block.value / maxValue : 0;
  return {
    zones,
    blocks,
    width: Math.max(0, offsetX - gap),
    depth: Math.max(0, ...drawn.map((zone) => zone.image.height)),
    maxValue,
  };
}
