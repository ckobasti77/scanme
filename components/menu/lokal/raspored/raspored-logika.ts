// ScanMe Menu V1 (K20) — the pure logic of the floor layout editor "Raspored"
// (master §9.2). No React: the surfaces of a venue, the effective layouts with
// the optimistic overrides, pixel → cell conversion for dragging, the keyboard
// reducer and the Serbian phrases. The grid rules themselves (moving, resizing,
// dropping, the automatic arrangement) stay in lib/menu/floor-layout.ts; this
// file only wires them to the screen.

import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuLokalRasporedSr as t } from "@/lib/i18n/sr/menu-lokal-raspored";
import {
  FLOOR_COLUMNS,
  isValidLayout,
  moveStep,
  placeLayouts,
  resizeStep,
  rowsNeeded,
  sameLayout,
  toggleShape,
  type FloorDirection,
  type FloorItem,
  type FloorLayout,
} from "@/lib/menu/floor-layout";
import type { LokalPozicija, LokalZona } from "@/lib/menu/lokal/model";

// --- Surfaces ----------------------------------------------------------------

export const BEZ_ZONE_KLJUC = "bez-zone";

/** One grid: a zone, "Bez zone", or the only grid of a venue without zones. */
export type PovrsRasporeda = {
  /** The zone id, or BEZ_ZONE_KLJUC. */
  kljuc: string;
  zona: LokalZona | null;
  /** The venue has no zones: one grid with no zone heading. */
  bezNaslova: boolean;
  /** Stable order (`order`, then id): the DOM must not reorder while a position moves, or focus would be lost. */
  pozicije: LokalPozicija[];
};

function poRedu(a: LokalPozicija, b: LokalPozicija): number {
  return a.order - b.order || a.id.localeCompare(b.id);
}

/**
 * The grids of the screen: one per zone in zone order, then "Bez zone" when it
 * has positions (a position whose zone is unknown also lands there, so none is
 * ever invisible). A venue without zones has one grid with no zone heading. No
 * positions at all → no grids.
 */
export function povrsiRasporeda(zones: readonly LokalZona[], positions: readonly LokalPozicija[]): PovrsRasporeda[] {
  if (positions.length === 0) return [];
  const sve = [...positions].sort(poRedu);
  if (zones.length === 0) return [{ kljuc: BEZ_ZONE_KLJUC, zona: null, bezNaslova: true, pozicije: sve }];
  const redom = [...zones].sort((a, b) => a.order - b.order);
  const poznate = new Set(redom.map((zona) => zona.id));
  const povrsi: PovrsRasporeda[] = redom.map((zona) => ({
    kljuc: zona.id,
    zona,
    bezNaslova: false,
    pozicije: sve.filter((pozicija) => pozicija.zoneId === zona.id),
  }));
  const bezZone = sve.filter((pozicija) => pozicija.zoneId == null || !poznate.has(pozicija.zoneId));
  if (bezZone.length > 0) povrsi.push({ kljuc: BEZ_ZONE_KLJUC, zona: null, bezNaslova: false, pozicije: bezZone });
  return povrsi;
}

// --- Effective layouts and optimistic overrides --------------------------------

/**
 * A layout shown before the server confirms it. `potvrdjeno` is set when the
 * save succeeded; `ranije` is what the server stored then, so the override
 * goes away as soon as the stored layout changes (or equals it).
 */
export type Preklapanje = { layout: FloorLayout; potvrdjeno: boolean; ranije: FloorLayout | null };
export type Preklapanja = ReadonlyMap<string, Preklapanje>;
export type Izmena = { positionId: string; layout: FloorLayout };
export type Prethodno = Izmena & { prethodno: Preklapanje | undefined };

/** Where every position of ONE surface is drawn (stored layout, else the automatic spot), overrides on top. */
export function efektivniRasporedi(
  pozicije: readonly LokalPozicija[],
  preklapanja: Preklapanja,
): Map<string, FloorLayout> {
  const stavke: FloorItem[] = pozicije.map((pozicija) => ({
    id: pozicija.id,
    kind: pozicija.kind,
    order: pozicija.order,
    layout: preklapanja.get(pozicija.id)?.layout ?? pozicija.layout,
  }));
  return placeLayouts(stavke);
}

/** Rows of a surface: its content plus one free row, at least FLOOR_MIN_ROWS. */
export function redoviPovrsi(layouts: ReadonlyMap<string, FloorLayout>): number {
  return rowsNeeded(layouts.values());
}

export function primeniPreklapanja(preklapanja: Preklapanja, izmene: readonly Izmena[]): Map<string, Preklapanje> {
  const sledece = new Map(preklapanja);
  for (const izmena of izmene) {
    sledece.set(izmena.positionId, { layout: izmena.layout, potvrdjeno: false, ranije: null });
  }
  return sledece;
}

/**
 * Drops the overrides the server state has caught up with: the stored layout
 * equals it, the confirmed save has since been replaced by a newer stored
 * layout, or the position is gone. Returns the same map when nothing drops.
 */
export function ocistiPreklapanja(preklapanja: Preklapanja, pozicije: readonly LokalPozicija[]): Preklapanja {
  if (preklapanja.size === 0) return preklapanja;
  const poId = new Map(pozicije.map((pozicija) => [pozicija.id, pozicija]));
  let sledece: Map<string, Preklapanje> | null = null;
  for (const [id, preklapanje] of preklapanja) {
    const pozicija = poId.get(id);
    const zastarelo =
      !pozicija ||
      sameLayout(pozicija.layout, preklapanje.layout) ||
      (preklapanje.potvrdjeno && !sameLayout(pozicija.layout, preklapanje.ranije));
    if (zastarelo) {
      sledece ??= new Map(preklapanja);
      sledece.delete(id);
    }
  }
  return sledece ?? preklapanja;
}

/** The save succeeded: remember what the server stored then, and drop what is already caught up. */
export function potvrdiPreklapanja(
  preklapanja: Preklapanja,
  izmene: readonly Izmena[],
  pozicije: readonly LokalPozicija[],
): Preklapanja {
  const poId = new Map(pozicije.map((pozicija) => [pozicija.id, pozicija]));
  const sledece = new Map(preklapanja);
  for (const izmena of izmene) {
    const tekuce = sledece.get(izmena.positionId);
    // A newer edit of the same position owns the override now.
    if (!tekuce || !sameLayout(tekuce.layout, izmena.layout)) continue;
    sledece.set(izmena.positionId, {
      ...tekuce,
      potvrdjeno: true,
      ranije: poId.get(izmena.positionId)?.layout ?? null,
    });
  }
  return ocistiPreklapanja(sledece, pozicije);
}

/** The save failed: put back what each position showed before (unless a newer edit owns it). */
export function vratiPreklapanja(preklapanja: Preklapanja, izmene: readonly Prethodno[]): Map<string, Preklapanje> {
  const sledece = new Map(preklapanja);
  for (const { positionId, layout, prethodno } of izmene) {
    const tekuce = sledece.get(positionId);
    if (!tekuce || !sameLayout(tekuce.layout, layout)) continue;
    if (prethodno) sledece.set(positionId, prethodno);
    else sledece.delete(positionId);
  }
  return sledece;
}

function jeSacuvan(pozicija: LokalPozicija): boolean {
  return pozicija.layout !== null && isValidLayout(pozicija.layout);
}

/**
 * What one edit saves. A position with no stored layout is only drawn at an
 * automatic spot; if one position moved and the others stayed automatic, they
 * would jump into the spot it left. So the first edit of a surface also stores
 * the automatic spots of its unplaced positions (the changed one comes last).
 */
export function planCuvanja(args: {
  pozicije: readonly LokalPozicija[];
  preklapanja: Preklapanja;
  layouts: ReadonlyMap<string, FloorLayout>;
  id: string;
  layout: FloorLayout;
}): Izmena[] {
  const { pozicije, preklapanja, layouts, id, layout } = args;
  const zamrznute: Izmena[] = [];
  for (const pozicija of pozicije) {
    if (pozicija.id === id || jeSacuvan(pozicija) || preklapanja.has(pozicija.id)) continue;
    const mesto = layouts.get(pozicija.id);
    if (mesto) zamrznute.push({ positionId: pozicija.id, layout: mesto });
  }
  return [...zamrznute, { positionId: id, layout }];
}

// --- Geometry ------------------------------------------------------------------

function zaokruzi(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** A layout as percentages of its grid (the grid is FLOOR_COLUMNS wide and `redova` tall, in square cells). */
export function geometrija(layout: FloorLayout, redova: number): { levo: number; vrh: number; sirina: number; visina: number } {
  return {
    levo: zaokruzi((layout.x / FLOOR_COLUMNS) * 100),
    vrh: zaokruzi((layout.y / redova) * 100),
    sirina: zaokruzi((layout.w / FLOOR_COLUMNS) * 100),
    visina: zaokruzi((layout.h / redova) * 100),
  };
}

export const procenat = (value: number): string => `${value}%`;

/** The hairlines between the cells, as one SVG path in cell units (viewBox 0 0 FLOOR_COLUMNS redova). */
export function putanjaMreze(redova: number): string {
  const delovi: string[] = [];
  for (let x = 1; x < FLOOR_COLUMNS; x += 1) delovi.push(`M${x} 0V${redova}`);
  for (let y = 1; y < redova; y += 1) delovi.push(`M0 ${y}H${FLOOR_COLUMNS}`);
  return delovi.join("");
}

function ogranici(value: number, min: number, max: number): number {
  const ograniceno = Math.min(max, Math.max(min, value));
  return ograniceno === 0 ? 0 : ograniceno; // never -0
}

/** Whole cells for a pixel distance (0 when the cell size is unknown). Never -0. */
export function pikseliUCelije(px: number, celijaPx: number): number {
  if (!Number.isFinite(px) || !Number.isFinite(celijaPx) || celijaPx <= 0) return 0;
  const celije = Math.round(px / celijaPx);
  return celije === 0 ? 0 : celije;
}

/**
 * A drag distance in whole cells, kept inside the visible grid (so a drop past
 * the edge lands on the edge instead of failing). The pointer drop then goes
 * through dropAt, which refuses a taken spot.
 */
export function pomerajUCelije(args: {
  dxPx: number;
  dyPx: number;
  celijaPx: number;
  layout: FloorLayout;
  redova: number;
}): { dx: number; dy: number } {
  const { dxPx, dyPx, celijaPx, layout, redova } = args;
  const dx = ogranici(pikseliUCelije(dxPx, celijaPx), -layout.x, Math.max(0, FLOOR_COLUMNS - layout.w - layout.x));
  const dy = ogranici(pikseliUCelije(dyPx, celijaPx), -layout.y, Math.max(0, redova - layout.h - layout.y));
  return { dx, dy };
}

/** The drag transform snapped to whole cells and kept inside the grid (the drag library's modifier). */
export function prikvaciPomeraj(
  pomeraj: { x: number; y: number },
  celijaPx: number,
  layout: FloorLayout,
  redova: number,
): { x: number; y: number } {
  const { dx, dy } = pomerajUCelije({ dxPx: pomeraj.x, dyPx: pomeraj.y, celijaPx, layout, redova });
  return { x: dx * celijaPx, y: dy * celijaPx };
}

// --- Labels ---------------------------------------------------------------------

function duzina(tekst: string): number {
  return Array.from(tekst).length;
}

/**
 * The short form of a label for a small cell: the number at the end ("Sto 12"
 * → "12", "Soba 101" → "101", "Sto 12a" → "12a"), else the first word, cut to
 * three letters and an ellipsis when it is longer than four.
 */
export function skratiOznaku(label: string): string {
  const reci = label.trim().split(/\s+/).filter(Boolean);
  if (reci.length === 0) return "";
  const poslednja = reci[reci.length - 1];
  if (/\d/.test(poslednja) && duzina(poslednja) <= 4) return poslednja;
  const prva = reci[0];
  return duzina(prva) <= 4 ? prva : `${Array.from(prva).slice(0, 3).join("")}…`;
}

/** What a position of this size can show: the full label (3+ cells wide), a second line (2×2 and up). */
export function prikazMesta(
  layout: FloorLayout,
  pozicija: Pick<LokalPozicija, "kind" | "seats">,
): { punaOznaka: boolean; drugiRed: boolean } {
  const imaSta = (pozicija.seats ?? 0) > 0 || pozicija.kind !== "table";
  return {
    punaOznaka: layout.w >= 3,
    drugiRed: layout.w >= 2 && layout.h >= 2 && imaSta,
  };
}

export function brojMesta(n: number): string {
  return fmt(srPluralCategory(n) === "one" ? t.mesto : t.mesta, { n });
}

export function brojSedista(n: number): string {
  return fmt(srPluralCategory(n) === "one" ? t.sediste : t.sedista, { n });
}

export function polozajTekst(layout: FloorLayout): string {
  return fmt(t.polozaj, { kolona: layout.x + 1, red: layout.y + 1 });
}

export function velicinaTekst(layout: FloorLayout): string {
  return fmt(t.velicina, { sirina: layout.w, visina: layout.h });
}

/** The accessible name of a position in the grid: label, kind, seats, place, size, shape. */
export function opisMesta(pozicija: Pick<LokalPozicija, "label" | "kind" | "seats">, layout: FloorLayout): string {
  const delovi: string[] = [pozicija.label, t.vrsta[pozicija.kind]];
  if (pozicija.seats !== null && pozicija.seats > 0) delovi.push(brojSedista(pozicija.seats));
  delovi.push(polozajTekst(layout), velicinaTekst(layout), t.oblik[layout.shape]);
  return delovi.join(", ");
}

export type StaPromene = "pomeranje" | "velicina" | "oblik";

/** What a screen reader hears after a change: "Sto 5: kolona 4, red 2". */
export function najavaPromene(sta: StaPromene, naziv: string, layout: FloorLayout): string {
  switch (sta) {
    case "pomeranje":
      return fmt(t.najava.pomereno, { naziv, kolona: layout.x + 1, red: layout.y + 1 });
    case "velicina":
      return fmt(t.najava.velicina, { naziv, sirina: layout.w, visina: layout.h });
    case "oblik":
      return fmt(t.najava.oblik, { naziv, oblik: t.oblik[layout.shape] });
  }
}

/** The Serbian text of an error code of the domain dictionary; the fallback when the code is unknown. */
export function tekstGreske(
  code: string,
  mapa: Readonly<Record<string, string | undefined>>,
  rezerva: string,
): string {
  const tekst = Object.prototype.hasOwnProperty.call(mapa, code) ? mapa[code] : undefined;
  return tekst ?? rezerva;
}

// --- Keyboard -------------------------------------------------------------------

/** Cell-based order of reading: top to bottom, left to right. */
export function redosledCitanja(layouts: ReadonlyMap<string, FloorLayout>): string[] {
  return [...layouts.entries()]
    .sort(([aId, a], [bId, b]) => a.y - b.y || a.x - b.x || aId.localeCompare(bId))
    .map(([id]) => id);
}

/**
 * The neighbour in a direction, by the centres of the positions: the nearest
 * one in that half-plane, preferring the ones in line. null at the edge.
 */
export function susedUSmeru(
  layouts: ReadonlyMap<string, FloorLayout>,
  odId: string,
  smer: FloorDirection,
): string | null {
  const od = layouts.get(odId);
  if (!od) return null;
  const ox = 2 * od.x + od.w;
  const oy = 2 * od.y + od.h;
  let najbolji: string | null = null;
  let najboljiRezultat = Number.POSITIVE_INFINITY;
  for (const [id, drugi] of layouts) {
    if (id === odId) continue;
    const dx = 2 * drugi.x + drugi.w - ox;
    const dy = 2 * drugi.y + drugi.h - oy;
    const [glavno, bocno] =
      smer === "left" ? [-dx, dy] : smer === "right" ? [dx, dy] : smer === "up" ? [-dy, dx] : [dy, dx];
    if (glavno <= 0) continue;
    const rezultat = glavno + 2 * Math.abs(bocno);
    if (rezultat < najboljiRezultat || (rezultat === najboljiRezultat && najbolji !== null && id < najbolji)) {
      najbolji = id;
      najboljiRezultat = rezultat;
    }
  }
  return najbolji;
}

/** Select a position, or clear the selection when it is already the selected one. */
export function prebaciIzbor(izabranoId: string | null, id: string): string | null {
  return izabranoId === id ? null : id;
}

export type TasterStanje = {
  /** The position that has keyboard focus. */
  fokusId: string;
  /** The selected ("picked up") position, anywhere on the screen; null = none. */
  izabranoId: string | null;
  /** The effective layouts of the surface the focus is in. */
  layouts: ReadonlyMap<string, FloorLayout>;
};

export type TasterIshod =
  /** Not a key of the layout: leave the browser's default alone. */
  | { vrsta: "nista" }
  | { vrsta: "fokus"; id: string }
  | { vrsta: "izaberi"; id: string | null }
  | { vrsta: "izmena"; id: string; layout: FloorLayout; sta: StaPromene }
  /** The step is blocked (the edge, a neighbour, the size bounds). */
  | { vrsta: "granica"; id: string; sta: "pomeranje" | "velicina" }
  | { vrsta: "otvori"; id: string };

const SMEROVI: Readonly<Record<string, FloorDirection>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/**
 * What a key does on a position of the grid. With the focused position
 * selected: arrows move it (moveStep), Shift + arrows resize it (resizeStep),
 * O flips the shape, U opens it, Esc lets it go. Otherwise arrows and Home/End
 * only move the focus between positions. Enter and Space are the button's own
 * click, which selects (prebaciIzbor). Keys with Ctrl, Alt or Meta never get
 * here: the browser's shortcuts stay.
 */
export function primeniTaster(stanje: TasterStanje, key: string, shift: boolean): TasterIshod {
  const { fokusId, izabranoId, layouts } = stanje;
  const layout = layouts.get(fokusId);
  if (!layout) return { vrsta: "nista" };
  const jeIzabrano = izabranoId === fokusId;

  if (key === "Escape") return izabranoId !== null ? { vrsta: "izaberi", id: null } : { vrsta: "nista" };

  const smer = SMEROVI[key];
  if (smer) {
    if (!jeIzabrano) {
      if (shift) return { vrsta: "nista" };
      return { vrsta: "fokus", id: susedUSmeru(layouts, fokusId, smer) ?? fokusId };
    }
    const druga = [...layouts].filter(([id]) => id !== fokusId).map(([, mesto]) => mesto);
    if (shift) {
      const sledece = resizeStep(layout, smer, druga);
      return sledece
        ? { vrsta: "izmena", id: fokusId, layout: sledece, sta: "velicina" }
        : { vrsta: "granica", id: fokusId, sta: "velicina" };
    }
    const sledece = moveStep(layout, smer, druga);
    return sledece
      ? { vrsta: "izmena", id: fokusId, layout: sledece, sta: "pomeranje" }
      : { vrsta: "granica", id: fokusId, sta: "pomeranje" };
  }

  if (key === "Home" || key === "End") {
    if (jeIzabrano) return { vrsta: "nista" };
    const redom = redosledCitanja(layouts);
    return { vrsta: "fokus", id: (key === "Home" ? redom[0] : redom[redom.length - 1]) ?? fokusId };
  }

  const slovo = key.length === 1 ? key.toLowerCase() : "";
  if (jeIzabrano && slovo === "o") {
    return { vrsta: "izmena", id: fokusId, layout: toggleShape(layout), sta: "oblik" };
  }
  if (jeIzabrano && slovo === "u") return { vrsta: "otvori", id: fokusId };
  return { vrsta: "nista" };
}
