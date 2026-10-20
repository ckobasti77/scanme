// ScanMe Menu V1 (K20) — the view model of "Lokal i QR" (master §9, §13.6).
//
// One contract for three producers: the Convex queries (convex/menuFloor.ts
// `overview`, convex/menuQr.ts `listCards`) return these shapes, the izlog
// keeps them in memory (lib/menu/lokal/memorija.ts), and the presentational
// screen (components/menu/lokal/**) reads only them. Ids are plain strings
// here (Convex ids on the route, invented keys in the izlog). Pure types.

import type { FloorLayout, FloorPositionKind } from "../floor-layout";

export type LokalZona = {
  id: string;
  key: string;
  name: string;
  order: number;
};

export type LokalPozicija = {
  id: string;
  key: string;
  kind: FloorPositionKind;
  label: string;
  seats: number | null;
  /** null = "Bez zone" (available to all staff, master §9.3). */
  zoneId: string | null;
  /** null = not placed yet; the plan places it automatically (lib/menu/floor-layout.ts placeLayouts). */
  layout: FloorLayout | null;
  order: number;
};

/** An active (not archived) standard page a card may open. */
export type LokalStranica = {
  key: string;
  /** Internal name as in the editor ("Kompletan meni" for the default page). */
  name: string;
  slug: string;
  isDefault: boolean;
};

/** One QR card of the business whose destination is the Menu (or was, for diagnostics). */
export type LokalKartica = {
  id: string;
  cardCode: string;
  /** Printed label of the card ("Sto 12", "Vinska karta"). */
  label: string;
  status: "active" | "disabled";
  /** An adopted card (ScanMe access channel, ADMIN-12): read-only here. */
  managedByScanMe: boolean;
  /** The card's current destination is the Menu. */
  opensMenu: boolean;
  /** The Menu link of the card; null = opens the menu's first page with no position. */
  link: {
    pageKey: string | null;
    positionId: string | null;
    active: boolean;
  } | null;
  totalScans: number;
  lastScanAt: number | null;
  createdAt: number;
};

export type LokalPodaci = {
  zones: LokalZona[];
  positions: LokalPozicija[];
  cards: LokalKartica[];
  pages: LokalStranica[];
  /** More Menu cards exist than the section reads at once (MENU_MAX_QR_CARDS). */
  cardsTruncated: boolean;
};

/**
 * What the screen can ask for. Every action resolves to `{ ok: true }` or
 * `{ ok: false, code }` with a machine error code (lib/menu/errors/floor.ts,
 * lib/menu/errors/core.ts) that the screen maps to Serbian; nothing throws
 * into the UI. The route implements them with Convex mutations, the izlog in
 * memory with the same rules.
 */
export type LokalIshod = { ok: true } | { ok: false; code: string };

export type LokalNovaPozicija = {
  kind: FloorPositionKind;
  label: string;
  seats: number | null;
  zoneId: string | null;
};

export type LokalViseNovih = {
  kind: FloorPositionKind;
  /** "Sto" → "Sto 1", "Sto 2", … */
  prefix: string;
  from: number;
  count: number;
  seats: number | null;
  zoneId: string | null;
};

export type LokalIzmenaPozicije = {
  label?: string;
  kind?: FloorPositionKind;
  seats?: number | null;
  zoneId?: string | null;
};

export type LokalRadnje = {
  createPosition(input: LokalNovaPozicija): Promise<LokalIshod>;
  createPositions(input: LokalViseNovih): Promise<LokalIshod>;
  updatePosition(positionId: string, change: LokalIzmenaPozicije): Promise<LokalIshod>;
  archivePosition(positionId: string): Promise<LokalIshod>;
  setLayout(positionId: string, layout: FloorLayout): Promise<LokalIshod>;
  /** "Rasporedi automatski" for one zone (null = "Bez zone"): many layouts at once. */
  setLayouts(items: { positionId: string; layout: FloorLayout }[]): Promise<LokalIshod>;
  createZone(name: string): Promise<LokalIshod>;
  renameZone(zoneId: string, name: string): Promise<LokalIshod>;
  moveZone(zoneId: string, direction: "up" | "down"): Promise<LokalIshod>;
  archiveZone(zoneId: string): Promise<LokalIshod>;
  /** One card per position (label = position label), opening `pageKey` (null = the menu's entry). */
  mintForPositions(positionIds: string[], pageKey: string | null): Promise<LokalIshod>;
  /** `count` cards with no position, opening `pageKey` (e.g. the wine list at the bar). */
  mintForPage(pageKey: string | null, count: number): Promise<LokalIshod>;
  linkCard(cardId: string, link: { pageKey: string | null; positionId: string | null }): Promise<LokalIshod>;
  setCardActive(cardId: string, active: boolean): Promise<LokalIshod>;
};

/** The three views of the section (?pogled=, docs/MENI-PLAN.md §7). */
export type LokalPogled = "lista" | "raspored" | "kartice";

/**
 * Props of the presentational screen (components/menu/lokal/lokal-ekran.tsx).
 * The route (lokal-ruta.tsx) passes Convex data and mutations; the izlog
 * passes invented data and the in-memory store (lib/menu/lokal/memorija.ts).
 */
export type LokalEkranProps = {
  podaci: LokalPodaci;
  radnje: LokalRadnje;
  pogled: LokalPogled;
  onPogled(pogled: LokalPogled): void;
  /** Origin the printed QR codes encode: `${qrOrigin}/r/${cardCode}`. */
  qrOrigin: string;
  /** The venue's public menu (/{slug}/meni), for "Otvori javni meni". */
  meniHref: string;
  /** Izlog snapshots: the drawer of this position starts open. */
  pocetnaPozicija?: string | null;
  /** Izlog snapshots: the print sheet starts open. */
  pocetnaStampa?: boolean;
};
