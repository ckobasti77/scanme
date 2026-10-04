// Sajam automobila 2026 — map geometry types (M0). Pure TypeScript: no
// React/Next/Node imports, so Convex (`validateMapLocationIds`) and the map
// components read the same data.
//
// Coordinates are pixels of the organizer's source image; an SVG viewBox of
// `0 0 width height` lays the polygons exactly over the image. The geometry
// carries no exhibitor or brand names: those come from the fair catalog
// through `fairStands.mapLocationId`.

/** Base event code of a geometry (DATA-INTAKE §1). `test-<key>` events use the same map. */
export type FairMapKey = "elektromobilnost-2026" | "auto-moto-fest-2026";

export type FairMapZoneId = "hala" | "ispred";

export type FairMapPoint = readonly [x: number, y: number];

export type FairMapLocation = {
  /** `mapLocationId`: `<zone>-<label slug>`, unique within the event. */
  id: string;
  /** Literal stand label printed on the organizer map ("10B", "6-7", "S3"). */
  label: string;
  /** `scanme` is the single special ScanMe location; never an exhibitor stand. */
  kind: "stand" | "scanme";
  /** `organizer` = traced from the organizer image; `placeholder` = not on the organizer map yet. */
  placement: "organizer" | "placeholder";
  polygon: readonly FairMapPoint[];
};

/** Only landmarks drawn on the organizer map. Never a route or a "you are here". */
export type FairMapLandmark = {
  id: string;
  kind: "entrance" | "stairs";
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
  locations: readonly FairMapLocation[];
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

export function fairMapStand(id: string, label: string, polygon: readonly FairMapPoint[]): FairMapLocation {
  return { id, label, kind: "stand", placement: "organizer", polygon };
}
