// Izlog fixtures: the data of the "Lokal i QR" screen (zones, positions on a
// per-zone grid, pages and QR cards) for /dev/menu-lokal-preview. Built from
// the invented venues of ./lokal.ts. Fictional names and codes only;
// deterministic (seeded keys, scans relative to IZLOG_SADA, no clock).

import { isValidLayout, overlapsAny, type FloorLayout } from "@/lib/menu/floor-layout";
import type { LokalKartica, LokalPodaci, LokalPozicija, LokalStranica } from "@/lib/menu/lokal/model";
import { fixtureVenue, IZLOG_SADA } from "./lokal";
import { createRng, fixtureKey } from "./rng";
import type { IzlogPosition, IzlogVenue } from "./tipovi";

export type LokalQrStanje = "restoran" | "prazno" | "bez-zona" | "hotel";

/** The page key of an archived page that three of the invented cards still point at ("Stara karta"). */
export const LOKAL_QR_ARHIVIRANA_STRANICA = "pg_starakarta00";

const MINUT = 60_000;
const DAN = 24 * 60 * MINUT;
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// --- Venue-wide 0-100 x 0-60 grid to per-zone grids of FLOOR_COLUMNS columns --------

/** Venue-wide units per cell of the per-zone grid. */
const CELL = 4;

function between(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The layouts of ONE zone (or of "Bez zone"): the minimum x/y of its bounding
 * box becomes the origin, every unit divides into cells. A layout that comes
 * out invalid or overlapping an earlier one is dropped to null (the plan
 * places it).
 */
function convertGroup(group: readonly IzlogPosition[]): Map<string, FloorLayout | null> {
  const drawn = group.flatMap((position) => (position.layout ? [position.layout] : []));
  const minX = Math.min(...drawn.map((layout) => layout.x));
  const minY = Math.min(...drawn.map((layout) => layout.y));
  const result = new Map<string, FloorLayout | null>();
  const accepted: FloorLayout[] = [];
  for (const position of group) {
    const source = position.layout;
    if (!source) {
      result.set(position.key, null);
      continue;
    }
    const candidate: FloorLayout = {
      x: Math.round((source.x - minX) / CELL),
      y: Math.round((source.y - minY) / CELL),
      w: between(Math.round(source.w / CELL), 1, 8),
      h: between(Math.round(source.h / CELL), 1, 8),
      shape: source.shape,
    };
    if (isValidLayout(candidate) && !overlapsAny(candidate, accepted)) {
      accepted.push(candidate);
      result.set(position.key, candidate);
    } else {
      result.set(position.key, null);
    }
  }
  return result;
}

function zonesAndPositions(venue: IzlogVenue): Pick<LokalPodaci, "zones" | "positions"> {
  const active = venue.positions.filter((position) => position.active);
  const groups = new Map<string | null, IzlogPosition[]>();
  for (const position of active) {
    const group = groups.get(position.zoneKey) ?? [];
    group.push(position);
    groups.set(position.zoneKey, group);
  }
  const layouts = new Map<string, FloorLayout | null>();
  for (const group of groups.values()) {
    for (const [key, layout] of convertGroup(group)) layouts.set(key, layout);
  }
  return {
    zones: venue.zones
      .filter((zone) => zone.active)
      .map((zone) => ({ id: zone.key, key: zone.key, name: zone.name, order: zone.order })),
    positions: active.map(
      (position): LokalPozicija => ({
        id: position.key,
        key: position.key,
        kind: position.kind,
        label: position.label,
        seats: position.seats,
        zoneId: position.zoneKey,
        layout: layouts.get(position.key) ?? null,
        order: position.order,
      }),
    ),
  };
}

// --- Pages ------------------------------------------------------------------------

type PageLine = readonly [name: string, slug: string, isDefault: boolean];

function pagesOf(seed: number, lines: readonly PageLine[]): LokalStranica[] {
  const rng = createRng(seed);
  return lines.map(([name, slug, isDefault]) => ({ key: fixtureKey("page", rng), name, slug, isDefault }));
}

const RESTAURANT_PAGES: readonly PageLine[] = [
  ["Kompletan meni", "glavni", true],
  ["Vinska karta", "vinska-karta", false],
  ["Doručak", "dorucak", false],
];
const CAFE_PAGES: readonly PageLine[] = [
  ["Kompletan meni", "glavni", true],
  ["Karta pića", "karta-pica", false],
];
const HOTEL_PAGES: readonly PageLine[] = [
  ["Kompletan meni", "glavni", true],
  ["Bar karta", "bar-karta", false],
];

// --- Cards ------------------------------------------------------------------------

type CardLine = {
  label: string;
  /** Label of the position the card opens; undefined = no position. */
  position?: string;
  /** Slug of the page the card opens; undefined = the menu's entry. */
  page?: string;
  /** Page key that is not among the pages (an archived page). */
  archivedPage?: string;
  disabled?: boolean;
  managedByScanMe?: boolean;
  /** The card now leads somewhere else; its Menu link is kept. */
  otherDestination?: boolean;
  /** An adopted card with no Menu link row at all. */
  noLink?: boolean;
  scans: number;
  /** Minutes before IZLOG_SADA; null = never scanned. */
  lastScanMinutesAgo: number | null;
  createdDaysAgo: number;
};

/** Cards of the venue from compact lines; codes are drawn from a seeded generator, unique per venue. */
function cardsOf(
  seed: number,
  positions: readonly LokalPozicija[],
  pages: readonly LokalStranica[],
  lines: readonly CardLine[],
): LokalKartica[] {
  const rng = createRng(seed);
  const used = new Set<string>();
  const nextCode = (): string => {
    for (;;) {
      let code = "";
      for (let index = 0; index < 8; index += 1) code += CODE_ALPHABET[rng.int(0, CODE_ALPHABET.length - 1)];
      if (!used.has(code)) {
        used.add(code);
        return code;
      }
    }
  };
  const positionId = (label: string): string => {
    const found = positions.find((position) => position.label === label);
    if (!found) throw new Error(`fixture: no position "${label}"`);
    return found.id;
  };
  const pageKey = (slug: string): string => {
    const found = pages.find((page) => page.slug === slug);
    if (!found) throw new Error(`fixture: no page "${slug}"`);
    return found.key;
  };
  return lines.map((line, index): LokalKartica => {
    const link = line.noLink
      ? null
      : {
          pageKey: line.archivedPage ?? (line.page === undefined ? null : pageKey(line.page)),
          positionId: line.position === undefined ? null : positionId(line.position),
          active: true,
        };
    return {
      id: `kf-${String(index + 1).padStart(2, "0")}`,
      cardCode: nextCode(),
      label: line.label,
      status: line.disabled ? "disabled" : "active",
      managedByScanMe: line.managedByScanMe === true,
      opensMenu: line.otherDestination !== true,
      link,
      totalScans: line.scans,
      lastScanAt: line.lastScanMinutesAgo === null ? null : IZLOG_SADA - line.lastScanMinutesAgo * MINUT,
      createdAt: IZLOG_SADA - line.createdDaysAgo * DAN,
    };
  });
}

/** [scans, minutes since the last scan], one per table "Sto 1"…; scans 0 = never scanned. */
type Activity = readonly [scans: number, lastScanMinutesAgo: number | null];

function tableCards(first: number, activity: readonly Activity[], createdDaysAgo: number): CardLine[] {
  return activity.map(([scans, lastScanMinutesAgo], index) => ({
    label: `Sto ${first + index}`,
    position: `Sto ${first + index}`,
    scans,
    lastScanMinutesAgo,
    createdDaysAgo,
  }));
}

// --- Demo restoran ------------------------------------------------------------------

const RESTAURANT_ACTIVITY: readonly Activity[] = [
  [214, 4],
  [87, 22],
  [340, 2],
  [51, 185],
  [129, 47],
  [0, null],
  [76, 1_380],
  [18, 4_320],
  [163, 12],
  [9, 9_000],
  [42, 95],
  [0, null],
];

function restaurantData(): LokalPodaci {
  const { zones, positions } = zonesAndPositions(fixtureVenue("restaurant"));
  const pages = pagesOf(4201, RESTAURANT_PAGES);
  const lines: CardLine[] = [
    ...tableCards(1, RESTAURANT_ACTIVITY.slice(0, 4), 118),
    ...tableCards(5, RESTAURANT_ACTIVITY.slice(4, 8), 96),
    ...tableCards(9, RESTAURANT_ACTIVITY.slice(8), 74),
    // Sto 13 has two cards: the table card and one that opens the wine list.
    { label: "Sto 13", position: "Sto 13", scans: 58, lastScanMinutesAgo: 31, createdDaysAgo: 61 },
    {
      label: "Sto 13 vino",
      position: "Sto 13",
      page: "vinska-karta",
      scans: 23,
      lastScanMinutesAgo: 120,
      createdDaysAgo: 20,
    },
    // Sto 14: disabled. Sto 15 and the bar position have no card of their own.
    {
      label: "Sto 14",
      position: "Sto 14",
      disabled: true,
      scans: 11,
      lastScanMinutesAgo: 30_240,
      createdDaysAgo: 90,
    },
    // A card at the bar that opens the wine list with no position.
    { label: "Šank, vinska karta", page: "vinska-karta", scans: 96, lastScanMinutesAgo: 7, createdDaysAgo: 40 },
    // An adopted card (ScanMe access channel): read-only here.
    {
      label: "Ulaz (ScanMe)",
      managedByScanMe: true,
      noLink: true,
      scans: 402,
      lastScanMinutesAgo: 1,
      createdDaysAgo: 200,
    },
    // The card now leads somewhere else; its Menu link to Sto 3 is kept.
    {
      label: "Sto 3 stara kartica",
      position: "Sto 3",
      otherDestination: true,
      scans: 133,
      lastScanMinutesAgo: 86_400,
      createdDaysAgo: 150,
    },
    // A card whose page was archived.
    {
      label: "Stara karta",
      archivedPage: LOKAL_QR_ARHIVIRANA_STRANICA,
      scans: 5,
      lastScanMinutesAgo: 47_520,
      createdDaysAgo: 140,
    },
  ];
  return { zones, positions, cards: cardsOf(4301, positions, pages, lines), pages, cardsTruncated: false };
}

// --- Kafana kod Mike (no zones) -------------------------------------------------------

function cafeData(): LokalPodaci {
  const { zones, positions } = zonesAndPositions(fixtureVenue("cafe"));
  const pages = pagesOf(4202, CAFE_PAGES);
  const lines: CardLine[] = [
    ...tableCards(1, [[64, 9], [31, 75], [118, 3], [22, 640]], 80),
    { label: "Sto 6", position: "Sto 6", scans: 0, lastScanMinutesAgo: null, createdDaysAgo: 30 },
    {
      label: "Sto 3 piće",
      position: "Sto 3",
      page: "karta-pica",
      scans: 14,
      lastScanMinutesAgo: 210,
      createdDaysAgo: 30,
    },
    {
      label: "Sto 8",
      position: "Sto 8",
      disabled: true,
      scans: 7,
      lastScanMinutesAgo: 20_160,
      createdDaysAgo: 80,
    },
    { label: "Pult, karta pića", page: "karta-pica", scans: 45, lastScanMinutesAgo: 18, createdDaysAgo: 30 },
  ];
  return { zones, positions, cards: cardsOf(4302, positions, pages, lines), pages, cardsTruncated: false };
}

// --- Hotel Primer -----------------------------------------------------------------------

const ROOM_ACTIVITY: readonly Activity[] = [
  [12, 180],
  [5, 2_900],
  [0, null],
  [31, 55],
  [8, 640],
  [2, 4_300],
  [19, 12],
  [7, 1_500],
  [0, null],
  [14, 330],
];

function hotelData(): LokalPodaci {
  const { zones, positions } = zonesAndPositions(fixtureVenue("hotel"));
  const pages = pagesOf(4203, HOTEL_PAGES);
  const lines: CardLine[] = [
    ...ROOM_ACTIVITY.map(
      ([scans, lastScanMinutesAgo], index): CardLine => ({
        label: `Soba ${101 + index}`,
        position: `Soba ${101 + index}`,
        scans,
        lastScanMinutesAgo,
        createdDaysAgo: 150,
      }),
    ),
    ...tableCards(1, [[88, 15], [40, 130], [26, 2_000], [9, 7_200]], 110),
    { label: "Sto 9", position: "Sto 9", page: "bar-karta", scans: 52, lastScanMinutesAgo: 6, createdDaysAgo: 60 },
    { label: "Sto 10", position: "Sto 10", page: "bar-karta", scans: 0, lastScanMinutesAgo: null, createdDaysAgo: 60 },
    { label: "Lobi bar, bar karta", page: "bar-karta", scans: 73, lastScanMinutesAgo: 25, createdDaysAgo: 60 },
  ];
  return { zones, positions, cards: cardsOf(4303, positions, pages, lines), pages, cardsTruncated: false };
}

// --- Entry point ------------------------------------------------------------------------

/**
 * A fresh, deterministic "Lokal i QR" model. "restoran" has three zones, a bar
 * and every card situation the screen shows (two cards on one table, a
 * disabled one, a table with none, an adopted card, a card that leads
 * elsewhere, a card of an archived page); "bez-zona" is the cafe (one
 * surface); "hotel" has two zones and rooms 101-124 with cards for 101-110;
 * "prazno" has pages only.
 */
export function fixtureLokalPodaci(stanje: LokalQrStanje = "restoran"): LokalPodaci {
  switch (stanje) {
    case "bez-zona":
      return cafeData();
    case "hotel":
      return hotelData();
    case "prazno":
      return {
        zones: [],
        positions: [],
        cards: [],
        pages: pagesOf(4201, RESTAURANT_PAGES),
        cardsTruncated: false,
      };
    case "restoran":
      return restaurantData();
  }
}
