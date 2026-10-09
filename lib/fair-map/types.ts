// Sajam automobila 2026 — map geometry types (M0). Pure TypeScript: no
// React/Next/Node imports, so Convex (`validateMapLocationIds`) and the map
// components read the same data.
//
// Coordinates are pixels of the organizer's source image; an SVG viewBox of
// `0 0 width height` lays the polygons exactly over the image. The geometry
// carries no exhibitor or brand names: those come from the fair catalog
// through `fairStands.mapLocationId`.

import type { FairMapZoneIdValue } from "../fair-contract";

/** Base event code of a geometry (DATA-INTAKE §1). `test-<key>` events use the same map. */
export type FairMapKey = "elektromobilnost-2026" | "auto-moto-fest-2026";

/**
 * The zones a map draws: only Hala and Ispred hale (owner, 9. 10. 2026: there
 * is no "Zadnji deo"). `zadnji-deo` stays in FairMapZoneIdValue only because
 * the backend still accepts it as a stored value (AUTO1's participation);
 * no map has that zone.
 */
export type FairMapZoneId = Exclude<FairMapZoneIdValue, "zadnji-deo">;

export type FairMapPoint = readonly [x: number, y: number];

/**
 * - `stand`: a stand box the organizer draws;
 * - `scanme`: the single ScanMe location (N3: the organizer's stand 14 in front
 *   of the hall, "ENIGMA IT / ScanMe"); never a generic stand style;
 * - `partner`: a partner logo the organizer puts on the edge of an aisle
 *   (N3: Hotel Lotos, Restoran Vidovdan) — a point, not a stand;
 * - `area`: an open area without stand numbers (N3: the rear area).
 */
export type FairMapLocationKind = "stand" | "scanme" | "partner" | "area";

export type FairMapLocation = {
  /** `mapLocationId`: `<zone>` or `<zone>-<label slug>`, unique within the event. */
  id: string;
  /**
   * Literal stand label printed on the organizer map ("10B", "6-7", "20–22").
   * A partner point has none: its label says where it is ("uz 10B"); an area is named.
   */
  label: string;
  kind: FairMapLocationKind;
  /** `organizer` = traced from the organizer image; `placeholder` = not on the organizer map yet. */
  placement: "organizer" | "placeholder";
  /** Traced outline; for a partner point the outline of its logo. */
  polygon: readonly FairMapPoint[];
  /** Area from the organizer's map (m²). A box of a split stand has none: its group has it. */
  areaM2?: number;
  /** Id of the `FairMapStandGroup` this box belongs to (stands 12, 13, 15 in front of the hall). */
  group?: string;
  /** N4: where the stand number is drawn when the organizer prints it outside the box (default: inside, top left). */
  badge?: FairMapPoint;
};

/**
 * One organizer stand drawn as several boxes with different exhibitors
 * (N3). Each box is its own location; the stand label is shown once.
 */
export type FairMapStandGroup = {
  id: string;
  label: string;
  areaM2?: number;
  /** N4: where the group label is drawn (the organizer prints it beside the boxes). */
  badge?: FairMapPoint;
};

/** Only landmarks drawn on the organizer map. Never a route or a "you are here". */
export type FairMapLandmark = {
  id: string;
  kind: "entrance" | "stairs" | "parking" | "totem";
  polygon: readonly FairMapPoint[];
};

export type FairMapZone = {
  id: FairMapZoneId;
  image: {
    /** Copy in `public/` of the organizer image. */
    src: string;
    width: number;
    height: number;
    /** File name on sajamautomobila.com/ucesnici-2026 (the date is in the name). */
    organizerFile: string;
  };
  /** N4: outline of the zone (hall walls, the area in front of the hall) for the vector map. */
  outline?: readonly FairMapPoint[];
  locations: readonly FairMapLocation[];
  groups?: readonly FairMapStandGroup[];
  landmarks: readonly FairMapLandmark[];
};

export type FairMapGeometry = {
  key: FairMapKey;
  /** Working draft until the organizer confirms the stand list (V2 §15). */
  status: "draft";
  sourcePage: string;
  /** Day the organizer images were downloaded. */
  capturedOn: string;
  zones: readonly FairMapZone[];
};

export function fairMapStand(
  id: string,
  label: string,
  polygon: readonly FairMapPoint[],
  extra: Pick<FairMapLocation, "areaM2" | "group" | "badge"> = {},
): FairMapLocation {
  return { id, label, kind: "stand", placement: "organizer", polygon, ...extra };
}

/** A fair stand (fairStands row) may sit on every location the organizer draws, never on a placeholder. */
export function fairMapLocationTakesStands(location: FairMapLocation): boolean {
  return location.placement === "organizer";
}
