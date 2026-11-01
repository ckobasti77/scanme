// Izlog fixtures: three invented venues (zones, tables, rooms, occupancy) for
// the preview of the waiter panel, the floor plan and the guest requests.
// Fictional names only; deterministic (seeded keys, no clock).

import { createRng, fixturePrefixedKey, type Rng } from "./rng";
import type {
  IzlogOccupancyState,
  IzlogPosition,
  IzlogVenue,
  IzlogZone,
} from "./tipovi";

/** "Now" of every izlog fixture: 17 Oct 2026, 18:27 in Belgrade (16:27 UTC; summer time, two hours ahead of UTC). */
export const IZLOG_SADA = Date.UTC(2026, 9, 17, 16, 27, 0);

type Shape = "rect" | "round";
/** [label, seats, x, y, w, h, shape] on the 0-100 x 0-60 floor-plan grid. */
type TableLine = readonly [
  label: string,
  seats: number,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: Shape,
];

function makeZones(names: readonly string[], rng: Rng): IzlogZone[] {
  return names.map((name, order): IzlogZone => ({
    key: fixturePrefixedKey("zn", rng),
    name,
    order,
    active: true,
  }));
}

function makeTables(
  lines: readonly TableLine[],
  zoneKeyOf: (label: string) => string | null,
  rng: Rng,
  firstOrder: number,
): IzlogPosition[] {
  return lines.map(([label, seats, x, y, w, h, shape], index): IzlogPosition => ({
    key: fixturePrefixedKey("ps", rng),
    kind: "table",
    label,
    seats,
    zoneKey: zoneKeyOf(label),
    layout: { x, y, w, h, shape, rotation: 0 },
    order: firstOrder + index,
    active: true,
  }));
}

/** The occupancy of the tables named in `states`; every other position stays neutral (absent). */
function occupancyOf(
  positions: readonly IzlogPosition[],
  states: Readonly<Record<string, IzlogOccupancyState>>,
): Record<string, IzlogOccupancyState> {
  const occupancy: Record<string, IzlogOccupancyState> = {};
  for (const position of positions) {
    const state = states[position.label];
    if (state !== undefined) occupancy[position.key] = state;
  }
  return occupancy;
}

// --- Demo restoran -------------------------------------------------------------

const RESTAURANT_TABLES: readonly TableLine[] = [
  // Glavna sala
  ["Sto 1", 2, 4, 6, 6, 6, "round"],
  ["Sto 2", 2, 14, 6, 6, 6, "round"],
  ["Sto 3", 4, 24, 5, 10, 8, "rect"],
  ["Sto 4", 4, 38, 5, 10, 8, "rect"],
  ["Sto 5", 4, 4, 22, 10, 8, "rect"],
  ["Sto 6", 6, 20, 22, 14, 8, "rect"],
  ["Sto 7", 6, 40, 22, 14, 8, "rect"],
  ["Sto 8", 4, 6, 40, 8, 8, "round"],
  // Terasa
  ["Sto 9", 2, 66, 6, 6, 6, "round"],
  ["Sto 10", 2, 76, 6, 6, 6, "round"],
  ["Sto 11", 4, 66, 18, 10, 8, "rect"],
  ["Sto 12", 4, 82, 18, 10, 8, "rect"],
  // VIP
  ["Sto 13", 8, 28, 42, 16, 8, "rect"],
  ["Sto 14", 6, 50, 42, 14, 8, "rect"],
  ["Sto 15", 8, 72, 40, 12, 12, "round"],
];

const RESTAURANT_ZONE_NAMES = ["Glavna sala", "Terasa", "VIP"] as const;

function restaurantVenue(): IzlogVenue {
  const rng = createRng(4101);
  const zones = makeZones(RESTAURANT_ZONE_NAMES, rng);
  const [mainHall, terrace, vip] = zones;
  const zoneKeyOf = (label: string): string | null => {
    const number = Number(label.replace("Sto ", ""));
    if (number <= 8) return mainHall.key;
    if (number <= 12) return terrace.key;
    return vip.key;
  };
  const tables = makeTables(RESTAURANT_TABLES, zoneKeyOf, rng, 0);
  const bar: IzlogPosition = {
    key: fixturePrefixedKey("ps", rng),
    kind: "other",
    label: "Šank",
    seats: null,
    zoneKey: null,
    layout: { x: 88, y: 40, w: 10, h: 14, shape: "rect", rotation: 0 },
    order: tables.length,
    active: true,
  };
  const positions = [...tables, bar];
  return {
    name: "Demo restoran",
    slug: "demo-restoran",
    kind: "restaurant",
    zones,
    positions,
    occupancy: occupancyOf(positions, {
      "Sto 1": "occupied",
      "Sto 2": "free",
      "Sto 3": "occupied",
      "Sto 4": "reserved",
      "Sto 5": "occupied",
      "Sto 6": "free",
      "Sto 7": "occupied",
      "Sto 9": "occupied",
      "Sto 10": "out_of_service",
      "Sto 11": "occupied",
      "Sto 13": "reserved",
    }),
    cardCount: 18,
  };
}

// --- Kafana kod Mike -----------------------------------------------------------

const CAFE_TABLES: readonly TableLine[] = [
  ["Sto 1", 2, 6, 8, 6, 6, "round"],
  ["Sto 2", 2, 20, 8, 6, 6, "round"],
  ["Sto 3", 4, 36, 8, 10, 8, "rect"],
  ["Sto 4", 4, 56, 8, 10, 8, "rect"],
  ["Sto 5", 4, 6, 30, 10, 8, "rect"],
  ["Sto 6", 4, 26, 30, 10, 8, "rect"],
  ["Sto 7", 3, 48, 30, 8, 8, "round"],
  ["Sto 8", 4, 68, 30, 10, 8, "rect"],
];

function cafeVenue(): IzlogVenue {
  const rng = createRng(4102);
  return {
    name: "Kafana kod Mike",
    slug: "kafana-kod-mike",
    kind: "cafe",
    zones: [],
    positions: makeTables(CAFE_TABLES, () => null, rng, 0),
    occupancy: null,
    cardCount: 8,
  };
}

// --- Hotel Primer ----------------------------------------------------------------

const HOTEL_TABLES: readonly TableLine[] = [
  // Restoran
  ["Sto 1", 2, 4, 6, 6, 6, "round"],
  ["Sto 2", 2, 14, 6, 6, 6, "round"],
  ["Sto 3", 4, 24, 5, 10, 8, "rect"],
  ["Sto 4", 4, 4, 22, 10, 8, "rect"],
  ["Sto 5", 4, 20, 22, 10, 8, "rect"],
  ["Sto 6", 6, 4, 40, 14, 8, "rect"],
  ["Sto 7", 6, 24, 40, 14, 8, "rect"],
  ["Sto 8", 8, 44, 5, 16, 8, "rect"],
  // Lobi bar
  ["Sto 9", 2, 70, 8, 6, 6, "round"],
  ["Sto 10", 2, 82, 8, 6, 6, "round"],
  ["Sto 11", 4, 70, 24, 10, 8, "rect"],
  ["Sto 12", 4, 70, 42, 10, 8, "rect"],
];

const HOTEL_ROOM_COUNT = 24;

function hotelVenue(): IzlogVenue {
  const rng = createRng(4103);
  const zones = makeZones(["Restoran", "Lobi bar"], rng);
  const [restaurant, lobby] = zones;
  const zoneKeyOf = (label: string): string | null =>
    Number(label.replace("Sto ", "")) <= 8 ? restaurant.key : lobby.key;
  const tables = makeTables(HOTEL_TABLES, zoneKeyOf, rng, 0);
  const rooms = Array.from({ length: HOTEL_ROOM_COUNT }, (_, index): IzlogPosition => ({
    key: fixturePrefixedKey("ps", rng),
    kind: "room",
    label: `Soba ${101 + index}`,
    seats: null,
    zoneKey: null,
    layout: null,
    order: tables.length + index,
    active: true,
  }));
  return {
    name: "Hotel Primer",
    slug: "hotel-primer",
    kind: "hotel",
    zones,
    positions: [...tables, ...rooms],
    occupancy: null,
    cardCount: 40,
  };
}

/** A fresh, deterministic venue. Every call builds a new object. */
export function fixtureVenue(kind: IzlogVenue["kind"] = "restaurant"): IzlogVenue {
  switch (kind) {
    case "cafe":
      return cafeVenue();
    case "hotel":
      return hotelVenue();
    case "restaurant":
      return restaurantVenue();
  }
}
