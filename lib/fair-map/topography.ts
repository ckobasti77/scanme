import type { FairPackageTier, FairPublicMapModel } from "../fair-contract";
import { getFairEntitlements } from "../fair-entitlements";
import { fairMapBounds } from "./shape";
import type { FairMapZoneId } from "./types";
import { fairMapSearchKey, type FairMapPlacedStand, type FairMapView } from "./view";

export const AMF_TOPOGRAPHIC_SIZE = { width: 1000, height: 1380 } as const;

type Anchor = {
  key: string;
  name: string;
  locationId: string | null;
  x: number;
  y: number;
  rx: number;
  ry: number;
  small?: boolean;
  moto?: boolean;
};

// Graphic anchors from the accepted north-up mockup and organizer's 2026 plan.
// These are NOT new mapLocationIds or fabricated exhibitor/model records.
export const AMF_HALL_ANCHORS: readonly Anchor[] = [
  { key: "skoda", name: "Škoda", locationId: "hala-10", x: 170, y: 225, rx: 145, ry: 180 },
  { key: "mercedes", name: "Mercedes-Benz", locationId: "hala-9", x: 165, y: 555, rx: 145, ry: 175 },
  { key: "fiat", name: "Fiat", locationId: "hala-8", x: 155, y: 865, rx: 135, ry: 120 },
  { key: "dongfeng", name: "Dongfeng", locationId: "hala-8", x: 155, y: 1060, rx: 135, ry: 130 },
  { key: "auto1", name: "AUTO1.com", locationId: "hala-11", x: 285, y: 88, rx: 57, ry: 54, small: true },
  { key: "grawe", name: "Grawe", locationId: null, x: 340, y: 210, rx: 42, ry: 46, small: true },
  { key: "geely", name: "Geely", locationId: "hala-2", x: 490, y: 155, rx: 112, ry: 105 },
  { key: "motogrini", name: "Motogrini", locationId: "hala-2", x: 670, y: 170, rx: 113, ry: 106 },
  { key: "tvs", name: "TVS", locationId: "hala-2", x: 575, y: 340, rx: 137, ry: 96 },
  { key: "toyota", name: "Toyota", locationId: "hala-2", x: 485, y: 525, rx: 117, ry: 117 },
  { key: "citroen", name: "Citroën", locationId: "hala-2", x: 675, y: 540, rx: 108, ry: 115 },
  { key: "lotos", name: "Lotos", locationId: null, x: 295, y: 530, rx: 42, ry: 49, small: true },
  { key: "vidovdan", name: "Vidovdan", locationId: null, x: 295, y: 685, rx: 44, ry: 49, small: true },
  { key: "vw", name: "Volkswagen", locationId: "hala-1", x: 490, y: 835, rx: 130, ry: 153 },
  { key: "audi", name: "Audi", locationId: "hala-1", x: 680, y: 835, rx: 129, ry: 153 },
  { key: "mg", name: "MG", locationId: "hala-3", x: 875, y: 190, rx: 103, ry: 124 },
  { key: "ford", name: "Ford", locationId: "hala-3", x: 875, y: 365, rx: 102, ry: 100 },
  { key: "renault", name: "Renault", locationId: "hala-5", x: 875, y: 565, rx: 105, ry: 123 },
  { key: "dacia", name: "Dacia", locationId: "hala-5", x: 875, y: 730, rx: 104, ry: 91 },
  { key: "peugeot", name: "Peugeot", locationId: "hala-6-7", x: 885, y: 895, rx: 94, ry: 78 },
  { key: "opel", name: "Opel", locationId: "hala-6-7", x: 885, y: 1010, rx: 91, ry: 73 },
  { key: "suzuki", name: "Suzuki", locationId: "hala-6-7", x: 885, y: 1125, rx: 90, ry: 72 },
  { key: "honda-car", name: "Honda", locationId: "hala-6-7", x: 885, y: 1230, rx: 88, ry: 67 },
  { key: "vespa", name: "Vespa", locationId: "hala-6-7", x: 435, y: 1155, rx: 99, ry: 100, moto: true },
  { key: "aprilia", name: "Aprilia", locationId: "hala-6-7", x: 550, y: 1155, rx: 86, ry: 100, moto: true },
  { key: "piaggio", name: "Piaggio", locationId: "hala-6-7", x: 655, y: 1155, rx: 86, ry: 100, moto: true },
  { key: "honda-moto", name: "Honda", locationId: "hala-6-7", x: 760, y: 1155, rx: 87, ry: 100, moto: true },
  { key: "raiffeisen", name: "Raiffeisen", locationId: null, x: 260, y: 1175, rx: 51, ry: 46, small: true },
];

/** Additive loader contract: explicit exhibitor switch wins over model tiers. */
export type FairMapHeatSource = {
  heatEligible?: boolean;
  packageTier?: FairPackageTier;
  brands?: ReadonlyArray<{ models: ReadonlyArray<{ packageTier?: FairPackageTier }> }>;
};

export function fairMapHeatEligible(source: FairMapHeatSource): boolean {
  if (typeof source.heatEligible === "boolean") return source.heatEligible;
  if (source.packageTier && getFairEntitlements(source.packageTier).modelAnalytics) return true;
  return source.brands?.some((brand) => brand.models.some((model) => model.packageTier && getFairEntitlements(model.packageTier).modelAnalytics)) ?? false;
}

/** No activity never removes the paid tint; an ineligible booth never heats up. */
export function fairMapContourOpacity(paid: boolean, level: number, band: number): number {
  if (!paid) return 0.025 + band * 0.015;
  const value = Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
  return 0.035 + band * (0.028 + value * 0.14);
}

export type AmfTopographicExhibit = Anchor & {
  zoneId: FairMapZoneId;
  participationId: string | null;
  brandId: string | null;
  ownerName: string | null;
  logoUrl?: string;
  paid: boolean;
  models: FairPublicMapModel[];
  passportIds: string[];
};

/** Never attribute a free neighbour's scans to a paid exhibitor on a shared location. */
export function fairMapTopographicLevel(
  exhibit: AmfTopographicExhibit,
  exhibits: readonly AmfTopographicExhibit[],
  locations: ReadonlyMap<string, number>,
  participations?: ReadonlyMap<string, number>,
): number {
  if (!exhibit.paid) return 0;
  if (exhibit.participationId && participations) return participations.get(exhibit.participationId) ?? 0;
  if (!exhibit.locationId) return 0;
  const mixed = exhibits.some((other) => other.locationId === exhibit.locationId && other.participationId && !other.paid);
  return mixed ? 0 : locations.get(exhibit.locationId) ?? 0;
}

function key(name: string): string {
  return fairMapSearchKey(name).replace(/^test\s+/, "").replace(/(?:_| )t$/, "").replace(/[^a-z0-9]/g, "");
}

function sameBrand(name: string, anchor: Anchor): boolean {
  const value = key(name);
  const expected = key(anchor.name);
  return value === expected || (anchor.key === "vw" && value === "vw") || (anchor.key === "mercedes" && value === "mercedes") || (anchor.key === "lotos" && value === "hotellotos") || (anchor.key === "vidovdan" && value === "restoranvidovdan") || (anchor.key === "raiffeisen" && value === "raiffeisenbank");
}

function modelData(row: FairMapPlacedStand, anchor: Anchor) {
  const brands = row.stand.brands.filter((brand) => sameBrand(brand.brandName, anchor));
  return {
    brandId: brands[0]?.brandId ?? null,
    models: brands.flatMap((brand) => brand.models),
    passportIds: row.passports.filter((entry) => brands.some((brand) => brand.brandId === entry.brandId)).map((entry) => entry.passportId),
  };
}

export function buildAmfTopographicExhibits(view: FairMapView): AmfTopographicExhibit[] {
  const hall = view.zones.find(({ zone }) => zone.id === "hala");
  const sources = [...view.zones.flatMap((zone) => zone.stands.map((row) => row.stand)), ...view.unplaced, ...view.withoutLocation];
  const paidByParticipation = new Map<string, boolean>();
  for (const source of sources) {
    if (paidByParticipation.has(source.participationId)) continue;
    const rows = sources.filter((row) => row.participationId === source.participationId) as FairMapHeatSource[];
    const flags = rows.map((row) => row.heatEligible).filter((value): value is boolean => typeof value === "boolean");
    paidByParticipation.set(source.participationId, flags.length ? flags.every(Boolean) : rows.some(fairMapHeatEligible));
  }
  const consumed = new Set<string>();
  const result: AmfTopographicExhibit[] = AMF_HALL_ANCHORS.map((anchor) => {
    const matches = hall?.stands.filter((row) => sameBrand(row.stand.exhibitorName, anchor) || row.stand.brands.some((brand) => sameBrand(brand.brandName, anchor))) ?? [];
    const row = matches.find((item) => item.stand.mapLocationId === anchor.locationId && (anchor.key.startsWith("honda") ? (item.stand.category === "moto") === Boolean(anchor.moto) : true)) ?? matches[0];
    if (row && matches.includes(row)) consumed.add(row.stand.standId);
    const unlocated = !row ? view.withoutLocation.find((item) => sameBrand(item.exhibitorName, anchor)) : undefined;
    const source = row?.stand ?? unlocated;
    return {
      ...anchor,
      locationId: row?.location.id ?? anchor.locationId,
      zoneId: "hala",
      participationId: source?.participationId ?? null,
      ownerName: source?.exhibitorName ?? null,
      ...(source?.logoUrl && (!row?.stand.brands.length || sameBrand(source.exhibitorName, anchor)) ? { logoUrl: source.logoUrl } : {}),
      paid: source ? paidByParticipation.get(source.participationId) ?? false : false,
      ...(row ? modelData(row, anchor) : { brandId: null, models: [], passportIds: [] }),
    };
  });

  // Additional catalog exhibitors are never filtered by payment or by having models.
  for (const zone of view.zones) {
    for (const location of zone.locations) {
      const extra = location.stands.filter((row) => !consumed.has(row.stand.standId));
      const box = fairMapBounds(location.location.polygon);
      const peers = AMF_HALL_ANCHORS.filter((anchor) => anchor.locationId === location.location.id);
      extra.forEach((row, index) => {
        const x = zone.zone.id === "hala" && peers.length ? peers.reduce((sum, item) => sum + item.x, 0) / peers.length : (box.minX + box.maxX) / 2 / zone.zone.image.width * 900 + 50;
        const y = zone.zone.id === "hala" && peers.length ? Math.max(...peers.map((item) => item.y + item.ry)) + 16 : (box.minY + box.maxY) / 2 / zone.zone.image.height * 1200 + 50;
        result.push({
          key: row.stand.standId,
          name: row.stand.exhibitorName,
          locationId: row.location.id,
          x: x + (index - (extra.length - 1) / 2) * 90,
          y,
          rx: zone.zone.id === "hala" ? 50 : Math.max(48, Math.min((box.maxX - box.minX) / zone.zone.image.width * 420, 130)),
          ry: zone.zone.id === "hala" ? 30 : Math.max(42, Math.min((box.maxY - box.minY) / zone.zone.image.height * 570, 125)),
          small: true,
          zoneId: zone.zone.id,
          participationId: row.stand.participationId,
          brandId: null,
          ownerName: row.stand.exhibitorName,
          logoUrl: row.stand.logoUrl,
          paid: paidByParticipation.get(row.stand.participationId) ?? false,
          models: row.stand.brands.flatMap((brand) => brand.models),
          passportIds: row.passports.map((entry) => entry.passportId),
        });
      });
    }
  }
  return result;
}

/** Smooth closed contours with deterministic, restrained cartographic irregularity. */
export function fairMapContourPath(exhibit: Pick<Anchor, "key" | "x" | "y" | "rx" | "ry">, band: number): string {
  const seed = [...exhibit.key].reduce((sum, letter) => sum + letter.charCodeAt(0), 0);
  const scale = 1 - band * 0.135;
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = index / 10 * Math.PI * 2;
    const irregularity = 1 + 0.1 * Math.sin(angle * 3 + seed) + 0.06 * Math.cos(angle * 2 + seed / 3);
    return { x: exhibit.x + Math.cos(angle) * exhibit.rx * scale * irregularity, y: exhibit.y + Math.sin(angle) * exhibit.ry * scale * irregularity };
  });
  const at = (index: number) => points[(index + points.length) % points.length];
  const n = (value: number) => Math.round(value * 10) / 10;
  return `M${n(points[0].x)},${n(points[0].y)} ${points.map((_, index) => {
    const a = at(index - 1), b = at(index), c = at(index + 1), d = at(index + 2);
    return `C${n(b.x + (c.x - a.x) / 6)},${n(b.y + (c.y - a.y) / 6)} ${n(c.x - (d.x - b.x) / 6)},${n(c.y - (d.y - b.y) / 6)} ${n(c.x)},${n(c.y)}`;
  }).join(" ")} Z`;
}

export function searchAmfTopographicExhibits(exhibits: readonly AmfTopographicExhibit[], query: string): AmfTopographicExhibit[] {
  const words = fairMapSearchKey(query).split(/\s+/).filter(Boolean);
  return exhibits.filter((item) => words.every((word) => fairMapSearchKey([item.name, item.ownerName ?? "", ...item.models.map((model) => model.displayName)].join(" ")).includes(word)));
}

/** Enlarged finger targets choose the nearest summit, so tiny partners remain reachable. */
export function hitAmfTopographicExhibit(exhibits: readonly AmfTopographicExhibit[], x: number, y: number, scale: number): AmfTopographicExhibit | null {
  let nearest: AmfTopographicExhibit | null = null;
  let distance = Infinity;
  for (const item of exhibits) {
    const rx = Math.max(item.rx * 0.7, 22 / scale), ry = Math.max(item.ry * 0.7, 22 / scale);
    if (((x - item.x) / rx) ** 2 + ((y - item.y) / ry) ** 2 > 1) continue;
    const candidate = Math.hypot(x - item.x, y - item.y);
    if (candidate < distance) { nearest = item; distance = candidate; }
  }
  return nearest;
}
