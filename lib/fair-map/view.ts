import type { FairPassportCatalogEntry, FairPassportProgress, FairPublicMapStand, FairPublicMapUnlocatedExhibitor } from "../fair-contract";
import { fairMapLocationTakesStands, type FairMapGeometry, type FairMapLocation, type FairMapZone, type FairMapZoneId } from "./types";

// M1 — joins the M0 geometry with the public fair catalog (by mapLocationId)
// and the published passport catalog. Pure: the map component renders it.
// N3: every exhibitor is on the map (also without a published model), several
// exhibitors may share one location, and a location may be a stand box, the
// ScanMe stand, a partner point or an open area.

export type FairMapPlacedStand = {
  stand: FairPublicMapStand;
  zoneId: FairMapZoneId;
  location: FairMapLocation;
  /** Brands of this stand with an active (published) passport. */
  passports: FairPassportCatalogEntry[];
};

/** N3 — one occupied map location with every stand placed on it, in catalog order. */
export type FairMapPlacedLocation = {
  location: FairMapLocation;
  stands: FairMapPlacedStand[];
};

export type FairMapZoneView = {
  zone: FairMapZone;
  stands: FairMapPlacedStand[];
  /** N3 — the occupied locations of this zone, each once, in geometry order. */
  locations: FairMapPlacedLocation[];
  /** Only an organizer-confirmed ScanMe location is shown publicly (M0 open question 1; N3: stand 14). */
  scanme: FairMapLocation | null;
};

export type FairMapView = {
  zones: FairMapZoneView[];
  /** Stands whose mapLocationId is not on this event's map. */
  unplaced: FairPublicMapStand[];
  /** N3 — exhibitors of the event without a stand yet (with the zone the organizer names, if any). */
  withoutLocation: FairPublicMapUnlocatedExhibitor[];
};

export function buildFairMapView(
  geometry: FairMapGeometry,
  stands: readonly FairPublicMapStand[],
  passportCatalog: readonly FairPassportCatalogEntry[],
  withoutLocation: readonly FairPublicMapUnlocatedExhibitor[] = [],
): FairMapView {
  const located = new Map<string, { zoneId: FairMapZoneId; location: FairMapLocation }>();
  for (const zone of geometry.zones) {
    for (const location of zone.locations) {
      if (fairMapLocationTakesStands(location)) located.set(location.id, { zoneId: zone.id, location });
    }
  }
  const zones: FairMapZoneView[] = geometry.zones.map((zone) => ({
    zone,
    stands: [],
    locations: [],
    scanme: zone.locations.find((location) => location.kind === "scanme" && location.placement === "organizer") ?? null,
  }));
  const unplaced: FairPublicMapStand[] = [];
  for (const stand of stands) {
    const hit = located.get(stand.mapLocationId);
    if (!hit) {
      unplaced.push(stand);
      continue;
    }
    const brandIds = new Set(stand.brands.map((brand) => brand.brandId));
    zones
      .find((view) => view.zone.id === hit.zoneId)!
      .stands.push({ stand, zoneId: hit.zoneId, location: hit.location, passports: passportCatalog.filter((entry) => brandIds.has(entry.brandId)) });
  }
  for (const view of zones) {
    view.locations = view.zone.locations.flatMap((location) => {
      const here = view.stands.filter((row) => row.location.id === location.id);
      return here.length ? [{ location, stands: here }] : [];
    });
  }
  return { zones, unplaced, withoutLocation: [...withoutLocation] };
}

/** N3 — the occupied location `mapLocationId` with its zone, or null. */
export function fairMapPlacedLocation(view: FairMapView, mapLocationId: string): (FairMapPlacedLocation & { zoneId: FairMapZoneId }) | null {
  for (const zoneView of view.zones) {
    const hit = zoneView.locations.find((row) => row.location.id === mapLocationId);
    if (hit) return { ...hit, zoneId: zoneView.zone.id };
  }
  return null;
}

/** The visitor's N/M for one passport, or null while unknown. */
export function fairPassportProgressFor(progress: readonly FairPassportProgress[] | null, entry: FairPassportCatalogEntry) {
  if (!progress) return null;
  const own = progress.find((row) => row.passportId === entry.passportId);
  return {
    stamped: own?.stampedCount ?? 0,
    required: own?.requiredCount ?? entry.models.length,
    completed: own?.completed ?? false,
  };
}

/** Case- and diacritic-insensitive (č → c, đ → dj) match. */
export function fairMapSearchKey(text: string) {
  return text
    .toLocaleLowerCase("sr")
    .replaceAll("đ", "dj")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Stands whose exhibitor, stand label/code, brand or model matches every word of the query. */
export function searchFairMapStands(stands: readonly FairMapPlacedStand[], query: string): FairMapPlacedStand[] {
  const words = fairMapSearchKey(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return stands.filter(({ stand, location }) => {
    const haystack = fairMapSearchKey(
      [
        stand.exhibitorName,
        stand.displayName,
        stand.code,
        location.label,
        ...stand.brands.flatMap((brand) => [brand.brandName, ...brand.models.flatMap((model) => [model.displayName, model.variant ?? ""])]),
      ].join(" "),
    );
    return words.every((word) => haystack.includes(word));
  });
}
