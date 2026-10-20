import type { FairPackageTier, FairPublicMapModel } from "../fair-contract";
import { getFairEntitlements } from "../fair-entitlements";
import { fairMapBounds } from "./shape";
import type { FairMapPoint, FairMapZoneId } from "./types";
import { amfEntrancePoint, amfForecourtPoint, AMF_ENTRANCE_STANDS, AMF_FORECOURT_SCALE } from "./amf-entrance-plan";
import { fairMapSearchKey, type FairMapPlacedStand, type FairMapView } from "./view";
import { AMF_EXHIBITOR_WEBSITES, fairMapWebsiteUrl } from "./websites";

export const AMF_TOPOGRAPHIC_SIZE = { width: 1000, height: 1450 } as const;
export const AMF_TOPOGRAPHIC_HALL = "M220 26 H775 Q825 26 875 62 L946 96 Q990 119 990 181 V1230 Q990 1285 950 1315 L900 1340 H170 L72 1305 Q10 1272 10 1210 V180 Q10 127 66 99 L170 48 Q196 26 220 26 Z";

/** Fill tall phone screens by stretching the hall, not the logos or text. */
export function amfTopographicSize(viewport: { width: number; height: number }) {
  return { width: AMF_TOPOGRAPHIC_SIZE.width, height: Math.max(1100, (viewport.height - 8) / Math.max(viewport.width - 8, 1) * AMF_TOPOGRAPHIC_SIZE.width) };
}

/** Keep the summit pop-up next to its anchor and inside the visible map. */
export function amfTopographicPopupPosition(anchor: { x: number; y: number }, viewport: { width: number; height: number }, popup: { width: number; height: number }) {
  return {
    x: Math.max(8, Math.min(viewport.width - popup.width - 8, anchor.x - popup.width / 2)),
    y: Math.max(8, Math.min(viewport.height - popup.height - 8, anchor.y - popup.height - 24 >= 8 ? anchor.y - popup.height - 24 : anchor.y + 24)),
  };
}

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
  area?: "foyer" | "outdoor";
  aliases?: readonly string[];
  footprint?: readonly FairMapPoint[];
};

// Graphic anchors from the accepted north-up mockup and organizer's 2026 plan.
// These are NOT new mapLocationIds or fabricated exhibitor/model records.
export const AMF_HALL_ANCHORS: readonly Anchor[] = [
  { key: "skoda", name: "Škoda", locationId: "hala-10", x: 170, y: 425, rx: 150, ry: 240 },
  { key: "mercedes", name: "Mercedes-Benz", locationId: "hala-9", x: 170, y: 852.5, rx: 155, ry: 180 },
  { key: "fiat", name: "Fiat", locationId: "hala-8", x: 105, y: 1100, rx: 72, ry: 66 },
  { key: "dongfeng", name: "Dongfeng", locationId: "hala-8", x: 245, y: 1080, rx: 82, ry: 90 },
  { key: "auto1", name: "AUTO 1", locationId: "hala-11", x: 235, y: 96, rx: 57, ry: 54, small: true },
  { key: "grawe", name: "Grawe", locationId: null, x: 340, y: 240, rx: 42, ry: 46, small: true },
  { key: "geely", name: "Geely", locationId: "hala-2", x: 555, y: 160, rx: 155, ry: 105 },
  { key: "motogrini", name: "Motogrini", locationId: "hala-2", x: 555, y: 310, rx: 140, ry: 58, moto: true },
  { key: "tvs", name: "TVS", locationId: "hala-2", x: 555, y: 450, rx: 140, ry: 58, moto: true },
  { key: "toyota", name: "Toyota", locationId: "hala-2", x: 460, y: 595, rx: 95, ry: 92 },
  { key: "citroen", name: "Citroën", locationId: "hala-2", x: 625, y: 595, rx: 95, ry: 92 },
  { key: "lotos", name: "Lotos", locationId: null, x: 320, y: 735, rx: 42, ry: 45, small: true },
  { key: "vidovdan", name: "Vidovdan", locationId: null, x: 320, y: 970, rx: 44, ry: 42, small: true },
  { key: "vw", name: "Volkswagen", locationId: "hala-1", x: 460, y: 900, rx: 100, ry: 145 },
  { key: "audi", name: "Audi", locationId: "hala-1", x: 625, y: 900, rx: 100, ry: 145 },
  { key: "mg", name: "MG", locationId: "hala-3", x: 825, y: 285, rx: 132, ry: 145 },
  { key: "ford", name: "Ford", locationId: "hala-3", x: 835, y: 460, rx: 132, ry: 92 },
  { key: "renault", name: "Renault", locationId: "hala-5", x: 905, y: 695, rx: 70, ry: 100 },
  { key: "dacia", name: "Dacia", locationId: "hala-5", x: 755, y: 725, rx: 70, ry: 100 },
  { key: "peugeot", name: "Peugeot", locationId: "hala-6-7", x: 765, y: 1035, rx: 67, ry: 80 },
  { key: "opel", name: "Opel", locationId: "hala-6-7", x: 900, y: 935, rx: 70, ry: 62 },
  { key: "suzuki", name: "Suzuki", locationId: "hala-6-7", x: 890, y: 1100, rx: 70, ry: 70 },
  { key: "honda-car", name: "Honda", locationId: "hala-6-7", x: 790, y: 1230, rx: 75, ry: 70 },
  // The four motorcycle marks share the lower wing of stand 6-7 on the
  // organizer's plan; they are not four full-size stands.
  { key: "vespa", name: "Vespa", locationId: "hala-6-7", x: 465, y: 1175, rx: 70, ry: 44, moto: true },
  { key: "aprilia", name: "Aprilia", locationId: "hala-6-7", x: 450, y: 1280, rx: 56, ry: 40, moto: true },
  { key: "piaggio", name: "Piaggio", locationId: "hala-6-7", x: 595, y: 1280, rx: 56, ry: 44, moto: true },
  { key: "honda-moto", name: "Honda", locationId: "hala-6-7", x: 660, y: 1175, rx: 58, ry: 44, moto: true },
  { key: "raiffeisen", name: "Raiffeisen", locationId: null, x: 260, y: 1190, rx: 51, ry: 46, small: true },
];

// Visitor-confirmed placement, 19 Oct: the numbered entrance booths are
// indoors, while S1-S6 are on the open-air forecourt. No new backend IDs.
export const AMF_ENTRANCE_ANCHORS: readonly Anchor[] = ([
  { key: "aster", name: "Aster Marketing", locationId: "ispred-12", x: 287, y: 72, rx: 53, ry: 26, area: "foyer" },
  { key: "zepter", name: "Zepter", locationId: "ispred-12", x: 389, y: 72, rx: 53, ry: 26, area: "foyer" },
  { key: "makete", name: "Makete", locationId: "ispred-13", x: 215, y: 174, rx: 40, ry: 34, area: "foyer" },
  { key: "lukac", name: "Lukač", locationId: "ispred-13", x: 200, y: 245, rx: 40, ry: 34, area: "foyer" },
  { key: "nm", name: "NM stomatologija", locationId: "ispred-13", x: 184, y: 322, rx: 40, ry: 34, area: "foyer" },
  { key: "detailing", name: "Detailing Store", locationId: "ispred-13", x: 164, y: 414, rx: 48, ry: 45, area: "foyer" },
  { key: "kostic", name: "Kostić Rent a Car", locationId: "ispred-16", x: 140, y: 510, rx: 55, ry: 30, area: "foyer" },
  { key: "scanme", name: "ScanMe", aliases: ["Enigma IT"], locationId: "ispred-14", x: 333, y: 186, rx: 43, ry: 32, area: "foyer" },
  { key: "amerikanac", name: "Amerikanac", locationId: "ispred-15", x: 460, y: 190, rx: 45, ry: 35, area: "foyer" },
  { key: "direkcija", name: "Direkcija za javni prevoz Niš", aliases: ["JKP Direkcija za javni prevoz", "JGP Niš"], locationId: "ispred-15", x: 498, y: 340, rx: 60, ry: 35, area: "foyer" },
  { key: "ton", name: "Turistička organizacija Niš", locationId: "ispred-15", x: 512, y: 414, rx: 45, ry: 35, area: "foyer" },
  { key: "goes", name: "Goes", locationId: "ispred-17", x: 333, y: 497, rx: 98, ry: 60, area: "foyer" },
  { key: "auto-happy-foyer", name: "Auto Happy", locationId: "ispred-19", x: 139, y: 661, rx: 66, ry: 44, area: "foyer" },
  { key: "benni", name: "Benni", aliases: ["Benni Plus"], locationId: "ispred-20", x: 376, y: 691, rx: 37, ry: 28, area: "foyer" },
  { key: "servoremont", name: "Servoremont", locationId: "ispred-21", x: 490, y: 679, rx: 75, ry: 32, area: "foyer" },
  { key: "parking", name: "Parking servis Niš", aliases: ["JKP Parking servis Niš"], locationId: "ispred-22", x: 592, y: 652, rx: 40, ry: 28, area: "foyer" },
  { key: "aodes", name: "AODES", aliases: ["Odes"], locationId: "ispred-s1-s2", x: 630, y: 890, rx: 145, ry: 100, area: "outdoor" },
  { key: "xtreme", name: "Xtreme Motors", locationId: "ispred-s3", x: 856, y: 880, rx: 128, ry: 81, area: "outdoor" },
  { key: "auto-happy-outdoor", name: "Auto Happy", locationId: "ispred-s4", x: 650, y: 1024, rx: 86, ry: 52, area: "outdoor" },
  // S6 appears on the supplied newer plan but has no shared geometry ID yet.
  { key: "swm", name: "SWM", locationId: null, x: 820, y: 1024, rx: 86, ry: 52, area: "outdoor" },
  { key: "kia", name: "Kia", locationId: "ispred-s5", x: 990, y: 999, rx: 130, ry: 83, area: "outdoor" },
] satisfies Anchor[]).map((anchor) => {
  const footprint = anchor.area === "foyer" ? AMF_ENTRANCE_STANDS[anchor.key]?.map(amfEntrancePoint) : undefined;
  const box = footprint ? fairMapBounds(footprint) : undefined;
  const point = anchor.area === "outdoor" ? amfForecourtPoint([anchor.x, anchor.y]) : [anchor.x, anchor.y] as const;
  const [x, y] = box ? [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2] : amfEntrancePoint(point);
  const scale = anchor.area === "outdoor" ? AMF_FORECOURT_SCALE : 1;
  return { ...anchor, x, y, rx: box ? (box.maxX - box.minX) / 2 : anchor.rx * 0.85 * scale, ry: box ? (box.maxY - box.minY) / 2 : anchor.ry * 0.85 * scale, footprint };
});

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
  websiteUrl?: string;
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
  if (anchor.aliases?.some((alias) => key(alias) === value)) return true;
  return value === expected || (anchor.key === "auto1" && value === "auto1com") || (anchor.key === "vw" && value === "vw") || (anchor.key === "mercedes" && value === "mercedes") || (anchor.key === "lotos" && value === "hotellotos") || (anchor.key === "vidovdan" && value === "restoranvidovdan") || (anchor.key === "raiffeisen" && value === "raiffeisenbank");
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
  const sources = [...view.zones.flatMap((zone) => zone.stands.map((row) => row.stand)), ...view.unplaced, ...view.withoutLocation];
  const paidByParticipation = new Map<string, boolean>();
  for (const source of sources) {
    if (paidByParticipation.has(source.participationId)) continue;
    const rows = sources.filter((row) => row.participationId === source.participationId) as FairMapHeatSource[];
    const flags = rows.map((row) => row.heatEligible).filter((value): value is boolean => typeof value === "boolean");
    paidByParticipation.set(source.participationId, flags.length ? flags.every(Boolean) : rows.some(fairMapHeatEligible));
  }
  const consumed = new Set<string>();
  const result: AmfTopographicExhibit[] = [...AMF_HALL_ANCHORS, ...AMF_ENTRANCE_ANCHORS].map((anchor) => {
    const zoneId = anchor.area ? "ispred" : "hala";
    const zone = view.zones.find(({ zone }) => zone.id === zoneId);
    const matches = zone?.stands.filter((row) => sameBrand(row.stand.exhibitorName, anchor) || row.stand.brands.some((brand) => sameBrand(brand.brandName, anchor))) ?? [];
    const row = matches.find((item) => item.stand.mapLocationId === anchor.locationId && (anchor.key.startsWith("honda") ? (item.stand.category === "moto") === Boolean(anchor.moto) : true)) ?? matches[0];
    if (row && matches.includes(row)) consumed.add(row.stand.standId);
    const unlocated = !row ? view.withoutLocation.find((item) => sameBrand(item.exhibitorName, anchor)) : undefined;
    const source = row?.stand ?? unlocated;
    return {
      ...anchor,
      locationId: row?.location.id ?? anchor.locationId,
      zoneId,
      participationId: source?.participationId ?? null,
      ownerName: source?.exhibitorName ?? null,
      websiteUrl: fairMapWebsiteUrl(source?.websiteUrl) ?? AMF_EXHIBITOR_WEBSITES[anchor.key],
      ...(source?.logoUrl && (!row?.stand.brands.length || sameBrand(source.exhibitorName, anchor)) ? { logoUrl: source.logoUrl } : {}),
      paid: anchor.area === "foyer" ? false : source ? paidByParticipation.get(source.participationId) ?? false : false,
      ...(row ? modelData(row, anchor) : { brandId: null, models: [], passportIds: [] }),
    };
  });

  // Additional catalog exhibitors are never filtered by payment or by having models.
  for (const zone of view.zones) {
    for (const location of zone.locations) {
      const extra = location.stands.filter((row) => !consumed.has(row.stand.standId));
      const box = fairMapBounds(location.location.polygon);
      const peers = [...AMF_HALL_ANCHORS, ...AMF_ENTRANCE_ANCHORS].filter((anchor) => anchor.locationId === location.location.id);
      extra.forEach((row, index) => {
        const entrancePoint = amfEntrancePoint([(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2]);
        const x = zone.zone.id === "ispred" ? entrancePoint[0] : peers.length ? peers.reduce((sum, item) => sum + item.x, 0) / peers.length : (box.minX + box.maxX) / 2 / zone.zone.image.width * 900 + 50;
        const y = zone.zone.id === "ispred" ? entrancePoint[1] : peers.length ? Math.max(...peers.map((item) => item.y + item.ry)) + 16 : (box.minY + box.maxY) / 2 / zone.zone.image.height * 1200 + 50;
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
          websiteUrl: fairMapWebsiteUrl(row.stand.websiteUrl),
          ...(zone.zone.id === "ispred" ? { area: location.location.id.startsWith("ispred-s") ? "outdoor" as const : "foyer" as const } : {}),
          paid: zone.zone.id === "ispred" && !location.location.id.startsWith("ispred-s") ? false : paidByParticipation.get(row.stand.participationId) ?? false,
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
