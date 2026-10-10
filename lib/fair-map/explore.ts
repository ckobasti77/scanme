import { FAIR_EXHIBITOR_CATEGORIES, FAIR_MAP_ZONE_IDS, type FairExhibitorCategory, type FairPublicMapStand } from "../fair-contract";
import type { FairMapLocation, FairMapStandGroup, FairMapZoneId } from "./types";
import { fairMapSearchKey, type FairMapPlacedLocation, type FairMapPlacedStand, type FairMapView } from "./view";

// N4 — pure logic of the map v2: category filters with counts, search over
// exhibitor / brand / model, which locations stay lit, the exhibitor
// directory by category, the selected location and the ?zona= / ?stand=
// deep link. React only renders what these return.

export const FAIR_MAP_FILTERS = ["sve", ...FAIR_EXHIBITOR_CATEGORIES] as const;
export type FairMapFilter = (typeof FAIR_MAP_FILTERS)[number];

/** An exhibitor's directory group; exhibitors without a category stay apart (never guessed). */
export type FairMapDirectoryKey = FairExhibitorCategory | "bez-kategorije";

/** Every exhibitor once, with every place it has on the map. */
export type FairMapExhibitorEntry = {
  participationId: string;
  exhibitorName: string;
  logoUrl?: string;
  websiteUrl?: string;
  category?: FairExhibitorCategory;
  /** Placed stands, in geometry order (Venera Bike: three). */
  places: FairMapPlacedStand[];
  /** Stands whose mapLocationId is not on this map. */
  unplaced: FairPublicMapStand[];
  /** Set when the exhibitor has no stand yet (the zone the organizer names, if any). */
  withoutLocation?: { zoneId?: FairMapZoneId };
};

const byName = (a: { exhibitorName: string }, b: { exhibitorName: string }) => a.exhibitorName.localeCompare(b.exhibitorName, "sr");

export function fairMapExhibitors(view: FairMapView): FairMapExhibitorEntry[] {
  const entries = new Map<string, FairMapExhibitorEntry>();
  const entry = (row: { participationId: string; exhibitorName: string; logoUrl?: string; websiteUrl?: string; category?: FairExhibitorCategory }) => {
    let hit = entries.get(row.participationId);
    if (!hit) {
      hit = {
        participationId: row.participationId,
        exhibitorName: row.exhibitorName,
        ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}),
        ...(row.websiteUrl ? { websiteUrl: row.websiteUrl } : {}),
        ...(row.category ? { category: row.category } : {}),
        places: [],
        unplaced: [],
      };
      entries.set(row.participationId, hit);
    }
    return hit;
  };
  for (const zone of view.zones) for (const location of zone.locations) for (const placed of location.stands) entry(placed.stand).places.push(placed);
  for (const stand of view.unplaced) entry(stand).unplaced.push(stand);
  // A stored `zadnji-deo` is the rear of the hall (owner, 9. 10.): no map has that zone, so it reads as Hala.
  for (const row of view.withoutLocation) entry(row).withoutLocation = row.zoneId ? { zoneId: row.zoneId === "zadnji-deo" ? "hala" : row.zoneId } : {};
  return [...entries.values()].sort(byName);
}

/** Exhibitors per filter chip (each exhibitor once, wherever and however often it stands). */
export function fairMapFilterCounts(view: FairMapView): Record<FairMapFilter, number> {
  const counts = Object.fromEntries(FAIR_MAP_FILTERS.map((key) => [key, 0])) as Record<FairMapFilter, number>;
  for (const row of fairMapExhibitors(view)) {
    counts.sve += 1;
    if (row.category) counts[row.category] += 1;
  }
  return counts;
}

function words(query: string) {
  return fairMapSearchKey(query).split(/\s+/).filter(Boolean);
}

function standHaystack(stand: FairPublicMapStand, location: FairMapLocation | null) {
  return fairMapSearchKey(
    [
      stand.exhibitorName,
      stand.code,
      location?.label ?? "",
      ...stand.brands.flatMap((brand) => [brand.brandName, ...brand.models.flatMap((model) => [model.displayName, model.variant ?? ""])]),
    ].join(" "),
  );
}

const inFilter = (category: FairExhibitorCategory | undefined, filter: FairMapFilter) => filter === "sve" || category === filter;

/** A stand passes the category filter and every word of the query (case and diacritics ignored). */
export function fairMapStandMatches(stand: FairPublicMapStand, location: FairMapLocation | null, filter: FairMapFilter, query: string): boolean {
  if (!inFilter(stand.category, filter)) return false;
  const list = words(query);
  if (!list.length) return true;
  const haystack = standHaystack(stand, location);
  return list.every((word) => haystack.includes(word));
}

/** Locations that stay lit (one matching exhibitor is enough); null = nothing is filtered, nothing dims. */
export function fairMapLitLocations(view: FairMapView, filter: FairMapFilter, query: string): Set<string> | null {
  if (filter === "sve" && !words(query).length) return null;
  const lit = new Set<string>();
  for (const zone of view.zones) {
    for (const row of zone.locations) {
      if (row.stands.some((placed) => fairMapStandMatches(placed.stand, row.location, filter, query))) lit.add(row.location.id);
    }
  }
  return lit;
}

export type FairMapSearchResult = {
  key: string;
  participationId: string;
  exhibitorName: string;
  logoUrl?: string;
  /** Null for an exhibitor without a place on the map. */
  place: { zoneId: FairMapZoneId; location: FairMapLocation } | null;
  zoneHint?: FairMapZoneId;
  /** Models of the stand that match the query (for the result line). */
  models: string[];
  brands: string[];
};

/** Search results: one per exhibitor and place, exhibitors without a place included; at most `limit`. */
export function fairMapSearch(view: FairMapView, filter: FairMapFilter, query: string, limit = 8): FairMapSearchResult[] {
  const list = words(query);
  if (!list.length) return [];
  const out: FairMapSearchResult[] = [];
  for (const row of fairMapExhibitors(view)) {
    for (const placed of row.places) {
      if (!fairMapStandMatches(placed.stand, placed.location, filter, query)) continue;
      // A model is named in the result when the query points at it: every word is in its exhibitor/brand/model text and one is in the model itself.
      const models = placed.stand.brands.flatMap((brand) =>
        brand.models.filter((model) => {
          const own = fairMapSearchKey(`${model.displayName} ${model.variant ?? ""}`);
          const all = fairMapSearchKey(`${row.exhibitorName} ${brand.brandName} ${model.displayName} ${model.variant ?? ""}`);
          return list.every((word) => all.includes(word)) && list.some((word) => own.includes(word));
        }),
      );
      out.push({
        key: placed.stand.standId,
        participationId: row.participationId,
        exhibitorName: row.exhibitorName,
        ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}),
        place: { zoneId: placed.zoneId, location: placed.location },
        models: models.map((model) => (model.variant ? `${model.displayName} ${model.variant}` : model.displayName)),
        brands: placed.stand.brands.map((brand) => brand.brandName),
      });
    }
    if (row.withoutLocation && inFilter(row.category, filter) && list.every((word) => fairMapSearchKey(row.exhibitorName).includes(word))) {
      out.push({
        key: `bez-${row.participationId}`,
        participationId: row.participationId,
        exhibitorName: row.exhibitorName,
        ...(row.logoUrl ? { logoUrl: row.logoUrl } : {}),
        place: null,
        ...(row.withoutLocation.zoneId ? { zoneHint: row.withoutLocation.zoneId } : {}),
        models: [],
        brands: [],
      });
    }
  }
  return out.slice(0, limit);
}

export type FairMapDirectoryGroup = { key: FairMapDirectoryKey; entries: FairMapExhibitorEntry[] };

/** The exhibitor list by category (in filter order, then by name); one category only when a filter is chosen. */
export function fairMapDirectory(view: FairMapView, filter: FairMapFilter): FairMapDirectoryGroup[] {
  const exhibitors = fairMapExhibitors(view);
  const keys: FairMapDirectoryKey[] = filter === "sve" ? [...FAIR_EXHIBITOR_CATEGORIES, "bez-kategorije"] : [filter];
  return keys
    .map((key) => ({ key, entries: exhibitors.filter((row) => (key === "bez-kategorije" ? !row.category : row.category === key)) }))
    .filter((group) => group.entries.length > 0);
}

export type FairMapLocationSummary = FairMapPlacedLocation & {
  zoneId: FairMapZoneId;
  /** The stand label shown once (the group's for a box of 12, 13 or 15). */
  label: string;
  areaM2?: number;
  group?: FairMapStandGroup;
};

/** The occupied location with its zone, shown label and m², exhibitors sorted by name (the focused one first). */
export function fairMapLocationSummary(view: FairMapView, locationId: string, focusParticipationId?: string): FairMapLocationSummary | null {
  for (const zoneView of view.zones) {
    const hit = zoneView.locations.find((row) => row.location.id === locationId);
    if (!hit) continue;
    const group = hit.location.group ? zoneView.zone.groups?.find((row) => row.id === hit.location.group) : undefined;
    const stands = [...hit.stands].sort((a, b) => {
      if (focusParticipationId) {
        if (a.stand.participationId === focusParticipationId) return -1;
        if (b.stand.participationId === focusParticipationId) return 1;
      }
      return a.stand.exhibitorName.localeCompare(b.stand.exhibitorName, "sr");
    });
    const areaM2 = hit.location.areaM2 ?? group?.areaM2;
    return {
      location: hit.location,
      stands,
      zoneId: zoneView.zone.id,
      label: group?.label ?? hit.location.label,
      ...(areaM2 !== undefined ? { areaM2 } : {}),
      ...(group ? { group } : {}),
    };
  }
  return null;
}

/** The organizer-confirmed ScanMe location of the map, if any exhibitor stands there or not. */
export function fairMapScanmeTarget(view: FairMapView): { zoneId: FairMapZoneId; locationId: string } | null {
  for (const zoneView of view.zones) if (zoneView.scanme) return { zoneId: zoneView.zone.id, locationId: zoneView.scanme.id };
  return null;
}

export type FairMapDeepLink = { zoneId: FairMapZoneId | null; locationId: string | null };

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

/**
 * `?zona=` and `?stand=<mapLocationId>` → the zone to show and the occupied
 * location to open. The stand wins over a different zona; unknown values are
 * ignored. `prikaz` is never read or touched here.
 */
export function fairMapReadDeepLink(params: { zona?: string | string[]; stand?: string | string[] }, view: FairMapView): FairMapDeepLink {
  const zone = first(params.zona);
  const zoneId = (FAIR_MAP_ZONE_IDS as readonly string[]).includes(zone) && view.zones.some((row) => row.zone.id === zone) ? (zone as FairMapZoneId) : null;
  const summary = first(params.stand) ? fairMapLocationSummary(view, first(params.stand)) : null;
  return summary ? { zoneId: summary.zoneId, locationId: summary.location.id } : { zoneId, locationId: null };
}

/** The page's query string with `zona`/`stand` set (or removed); every other parameter, `prikaz` included, is kept. */
export function fairMapDeepLinkSearch(search: string, link: FairMapDeepLink): string {
  const params = new URLSearchParams(search);
  if (link.zoneId) params.set("zona", link.zoneId);
  else params.delete("zona");
  if (link.locationId) params.set("stand", link.locationId);
  else params.delete("stand");
  const out = params.toString();
  return out ? `?${out}` : "";
}
