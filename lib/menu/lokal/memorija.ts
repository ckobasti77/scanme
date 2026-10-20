// ScanMe Menu V1 (K20) — "Lokal i QR" on an in-memory model. The izlog
// (/dev/menu-lokal-preview) runs the REAL screen on invented data without a
// backend; these pure functions give it the same rules the Convex mutations of
// convex/menuFloor.ts and convex/menuQr.ts enforce (unique labels and zone
// names, seats and batch bounds, the floor grid of lib/menu/floor-layout.ts,
// a position with an active QR card cannot be archived, cards of ScanMe are
// read-only).
//
// Every function returns the next state and the outcome; the state is never
// mutated in place. A refused action returns the SAME state object, so a
// caller can tell "nothing changed" with `===`. Everything is deterministic:
// ids, keys and card codes come from a counter, dates from a fixed izlog clock.
//
// A position or zone that is not in the model is "archived" here (archiving
// removes it from the lists), so a missing id answers `positionArchived` /
// `zoneArchived` like the server does for an archived row.

import { MENU_ERROR } from "../errors/core";
import { FLOOR_ERROR } from "../errors/floor";
import {
  clampLayout,
  defaultLayoutSize,
  findFreeSpot,
  isValidLayout,
  overlapsAny,
  placeLayouts,
  type FloorItem,
  type FloorLayout,
  type FloorPositionKind,
} from "../floor-layout";
import {
  MENU_MAX_POSITION_BATCH,
  MENU_MAX_POSITIONS,
  MENU_MAX_QR_MINT_BATCH,
  MENU_MAX_SEATS,
  MENU_MAX_ZONES,
  MENU_TEXT,
} from "../limits";
import { normalizeArticleName, requiredText } from "../text";
import type {
  LokalIshod,
  LokalIzmenaPozicije,
  LokalKartica,
  LokalNovaPozicija,
  LokalPodaci,
  LokalPozicija,
  LokalRadnje,
  LokalStranica,
  LokalViseNovih,
  LokalZona,
} from "./model";

/** "Now" of the izlog: 17 Oct 2026, 18:27 in Belgrade (the clock of components/menu/fixtures). */
export const LOKAL_MEMORIJA_SADA = Date.UTC(2026, 9, 17, 16, 27, 0);
/** The printed label of a card that opens the menu's entry; the izlog passes the dictionary text. */
export const LOKAL_PODRAZUMEVANA_OZNAKA = "Meni";

export type LokalMemorija = {
  podaci: LokalPodaci;
  /** Counter for new ids, keys and card codes (deterministic). */
  sledeciBroj: number;
  /** `createdAt` of new cards (the izlog clock). Default LOKAL_MEMORIJA_SADA. */
  sada?: number;
  /** Label of a card that opens the menu's entry or its default page. Default LOKAL_PODRAZUMEVANA_OZNAKA. */
  podrazumevanaOznaka?: string;
};

export type LokalMemorijaOpcije = {
  sledeciBroj?: number;
  sada?: number;
  podrazumevanaOznaka?: string;
};

/** The memory over existing data (e.g. fixtureLokalPodaci). */
export function memorijaOd(podaci: LokalPodaci, opcije: LokalMemorijaOpcije = {}): LokalMemorija {
  return {
    podaci,
    sledeciBroj: opcije.sledeciBroj ?? 1,
    sada: opcije.sada ?? LOKAL_MEMORIJA_SADA,
    podrazumevanaOznaka: opcije.podrazumevanaOznaka ?? LOKAL_PODRAZUMEVANA_OZNAKA,
  };
}

/** A memory with no zones, positions or cards; only the pages a card may open. */
export function praznaMemorija(
  opcije: LokalMemorijaOpcije & { stranice?: readonly LokalStranica[] } = {},
): LokalMemorija {
  const { stranice = [], ...ostalo } = opcije;
  return memorijaOd(
    { zones: [], positions: [], cards: [], pages: stranice.map((s) => ({ ...s })), cardsTruncated: false },
    ostalo,
  );
}

export type LokalRadnjaMemorije =
  | { vrsta: "createPosition"; input: LokalNovaPozicija }
  | { vrsta: "createPositions"; input: LokalViseNovih }
  | { vrsta: "updatePosition"; positionId: string; change: LokalIzmenaPozicije }
  | { vrsta: "archivePosition"; positionId: string }
  | { vrsta: "setLayout"; positionId: string; layout: FloorLayout }
  | { vrsta: "setLayouts"; items: { positionId: string; layout: FloorLayout }[] }
  | { vrsta: "createZone"; name: string }
  | { vrsta: "renameZone"; zoneId: string; name: string }
  | { vrsta: "moveZone"; zoneId: string; direction: "up" | "down" }
  | { vrsta: "archiveZone"; zoneId: string }
  | { vrsta: "mintForPositions"; positionIds: string[]; pageKey: string | null }
  | { vrsta: "mintForPage"; pageKey: string | null; count: number }
  | { vrsta: "linkCard"; cardId: string; link: { pageKey: string | null; positionId: string | null } }
  | { vrsta: "setCardActive"; cardId: string; active: boolean };

export type LokalKorak = { stanje: LokalMemorija; ishod: LokalIshod };

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

function odbij(stanje: LokalMemorija, kod: string): LokalKorak {
  return { stanje, ishod: { ok: false, code: kod } };
}

function gotovo(stanje: LokalMemorija, izmena: Partial<LokalPodaci>, sledeciBroj = stanje.sledeciBroj): LokalKorak {
  return {
    stanje: { ...stanje, podaci: { ...stanje.podaci, ...izmena }, sledeciBroj },
    ishod: { ok: true },
  };
}

function bezPromene(stanje: LokalMemorija): LokalKorak {
  return { stanje, ishod: { ok: true } };
}

function jeCeo(broj: number, min: number, max: number): boolean {
  return Number.isInteger(broj) && broj >= min && broj <= max;
}

const VRSTE: readonly FloorPositionKind[] = ["table", "room", "other"];

function dobraVrsta(vrsta: FloorPositionKind): boolean {
  return VRSTE.includes(vrsta);
}

function dobraSedista(sedista: number | null): boolean {
  return sedista === null || jeCeo(sedista, 1, MENU_MAX_SEATS);
}

function postojiZona(zone: readonly LokalZona[], zoneId: string | null): boolean {
  return zoneId === null || zone.some((zona) => zona.id === zoneId);
}

function dopunjeno(broj: number): string {
  return String(broj).padStart(4, "0");
}

function poRedosledu<T extends { order: number; id: string }>(a: T, b: T): number {
  return a.order - b.order || a.id.localeCompare(b.id);
}

function sledeciRedosled(lista: readonly { order: number }[]): number {
  return lista.reduce((najveci, stavka) => Math.max(najveci, stavka.order), -1) + 1;
}

function nadjiKarticu(stanje: LokalMemorija, cardId: string): LokalKartica | undefined {
  return stanje.podaci.cards.find((kartica) => kartica.id === cardId);
}

// -----------------------------------------------------------------------------
// The floor: every zone (and "Bez zone") is its own surface
// -----------------------------------------------------------------------------

function uZoni(pozicije: readonly LokalPozicija[], zoneId: string | null): LokalPozicija[] {
  return pozicije.filter((pozicija) => pozicija.zoneId === zoneId);
}

/** Where every position of one zone is drawn (the plan places the ones without a layout). */
function efektivni(pozicije: readonly LokalPozicija[], zoneId: string | null): Map<string, FloorLayout> {
  const stavke: FloorItem[] = uZoni(pozicije, zoneId).map((pozicija) => ({
    id: pozicija.id,
    kind: pozicija.kind,
    order: pozicija.order,
    layout: pozicija.layout,
  }));
  return placeLayouts(stavke);
}

/** The size a position keeps when it is placed again: its own when valid, else the default of its kind. */
function velicinaOd(pozicija: Pick<LokalPozicija, "kind" | "layout">): Pick<FloorLayout, "w" | "h" | "shape"> {
  const { layout } = pozicija;
  if (layout && isValidLayout(layout)) return { w: layout.w, h: layout.h, shape: layout.shape };
  return defaultLayoutSize(pozicija.kind);
}

/**
 * The first free spot among `zauzeto` (which grows by the new layout). null
 * only when the whole zone surface is full; the plan then draws the position
 * from its default spot like any position without a layout.
 */
function smesti(zauzeto: FloorLayout[], velicina: Pick<FloorLayout, "w" | "h" | "shape">): FloorLayout | null {
  const mesto = findFreeSpot(zauzeto, velicina);
  if (!mesto) return null;
  const layout = clampLayout({ ...velicina, ...mesto });
  zauzeto.push(layout);
  return layout;
}

function kopija(layout: FloorLayout): FloorLayout {
  return { x: layout.x, y: layout.y, w: layout.w, h: layout.h, shape: layout.shape };
}

// -----------------------------------------------------------------------------
// Positions
// -----------------------------------------------------------------------------

function zauzetaOznaka(pozicije: readonly LokalPozicija[], oznaka: string, osim?: string): boolean {
  const kljuc = normalizeArticleName(oznaka);
  return pozicije.some((pozicija) => pozicija.id !== osim && normalizeArticleName(pozicija.label) === kljuc);
}

/** One or many new positions of one kind in one zone; all or nothing. */
function dodajPozicije(
  stanje: LokalMemorija,
  vrsta: FloorPositionKind,
  oznake: readonly string[],
  sedista: number | null,
  zoneId: string | null,
): LokalKorak {
  const { positions, zones } = stanje.podaci;
  if (!postojiZona(zones, zoneId)) return odbij(stanje, FLOOR_ERROR.zoneArchived);
  if (positions.length + oznake.length > MENU_MAX_POSITIONS) return odbij(stanje, MENU_ERROR.limitReached);
  const videne = new Set(positions.map((pozicija) => normalizeArticleName(pozicija.label)));
  for (const oznaka of oznake) {
    const kljuc = normalizeArticleName(oznaka);
    if (videne.has(kljuc)) return odbij(stanje, FLOOR_ERROR.positionLabelTaken);
    videne.add(kljuc);
  }
  const zauzeto = Array.from(efektivni(positions, zoneId).values());
  let broj = stanje.sledeciBroj;
  let redosled = sledeciRedosled(positions);
  const nove = oznake.map((oznaka): LokalPozicija => {
    const n = broj;
    broj += 1;
    const redniBroj = redosled;
    redosled += 1;
    return {
      id: `p-${n}`,
      key: `ps_mem${dopunjeno(n)}`,
      kind: vrsta,
      label: oznaka,
      seats: sedista,
      zoneId,
      layout: smesti(zauzeto, defaultLayoutSize(vrsta)),
      order: redniBroj,
    };
  });
  return gotovo(stanje, { positions: [...positions, ...nove] }, broj);
}

function napraviPoziciju(stanje: LokalMemorija, ulaz: LokalNovaPozicija): LokalKorak {
  const oznaka = requiredText(ulaz.label, MENU_TEXT.positionLabel);
  if (oznaka === null || !dobraVrsta(ulaz.kind) || !dobraSedista(ulaz.seats)) {
    return odbij(stanje, MENU_ERROR.invalidInput);
  }
  return dodajPozicije(stanje, ulaz.kind, [oznaka], ulaz.seats, ulaz.zoneId);
}

function napraviViseNovih(stanje: LokalMemorija, ulaz: LokalViseNovih): LokalKorak {
  if (
    !dobraVrsta(ulaz.kind) ||
    !dobraSedista(ulaz.seats) ||
    !jeCeo(ulaz.count, 1, MENU_MAX_POSITION_BATCH) ||
    !jeCeo(ulaz.from, 0, 9999)
  ) {
    return odbij(stanje, MENU_ERROR.invalidInput);
  }
  const prefiks = requiredText(ulaz.prefix, MENU_TEXT.positionLabel);
  if (prefiks === null) return odbij(stanje, MENU_ERROR.invalidInput);
  const oznake: string[] = [];
  for (let i = 0; i < ulaz.count; i += 1) {
    const oznaka = requiredText(`${prefiks} ${ulaz.from + i}`, MENU_TEXT.positionLabel);
    if (oznaka === null) return odbij(stanje, MENU_ERROR.invalidInput);
    oznake.push(oznaka);
  }
  return dodajPozicije(stanje, ulaz.kind, oznake, ulaz.seats, ulaz.zoneId);
}

function izmeniPoziciju(stanje: LokalMemorija, positionId: string, izmena: LokalIzmenaPozicije): LokalKorak {
  const { positions, zones } = stanje.podaci;
  const pozicija = positions.find((p) => p.id === positionId);
  if (!pozicija) return odbij(stanje, FLOOR_ERROR.positionArchived);

  let oznaka = pozicija.label;
  if (izmena.label !== undefined) {
    const ociscena = requiredText(izmena.label, MENU_TEXT.positionLabel);
    if (ociscena === null) return odbij(stanje, MENU_ERROR.invalidInput);
    oznaka = ociscena;
  }
  let vrsta = pozicija.kind;
  if (izmena.kind !== undefined) {
    if (!dobraVrsta(izmena.kind)) return odbij(stanje, MENU_ERROR.invalidInput);
    vrsta = izmena.kind;
  }
  let sedista = pozicija.seats;
  if (izmena.seats !== undefined) {
    if (!dobraSedista(izmena.seats)) return odbij(stanje, MENU_ERROR.invalidInput);
    sedista = izmena.seats;
  }
  const menjaZonu = izmena.zoneId !== undefined && izmena.zoneId !== pozicija.zoneId;
  if (menjaZonu && !postojiZona(zones, izmena.zoneId ?? null)) return odbij(stanje, FLOOR_ERROR.zoneArchived);
  if (oznaka !== pozicija.label && zauzetaOznaka(positions, oznaka, pozicija.id)) {
    return odbij(stanje, FLOOR_ERROR.positionLabelTaken);
  }

  let zoneId = pozicija.zoneId;
  let layout = pozicija.layout;
  if (menjaZonu) {
    // The position keeps its size and shape and takes the first free spot of the target surface.
    zoneId = izmena.zoneId ?? null;
    const ostale = positions.filter((p) => p.id !== pozicija.id);
    const zauzeto = Array.from(efektivni(ostale, zoneId).values());
    layout = smesti(zauzeto, velicinaOd({ kind: vrsta, layout: pozicija.layout }));
  }

  const izmenjena: LokalPozicija = { ...pozicija, label: oznaka, kind: vrsta, seats: sedista, zoneId, layout };
  return gotovo(stanje, { positions: positions.map((p) => (p.id === pozicija.id ? izmenjena : p)) });
}

function imaAktivnuKarticu(kartice: readonly LokalKartica[], positionId: string): boolean {
  return kartice.some(
    (kartica) =>
      kartica.status === "active" &&
      kartica.opensMenu &&
      kartica.link !== null &&
      kartica.link.active &&
      kartica.link.positionId === positionId,
  );
}

function arhivirajPoziciju(stanje: LokalMemorija, positionId: string): LokalKorak {
  const { positions, cards } = stanje.podaci;
  if (!positions.some((p) => p.id === positionId)) return odbij(stanje, FLOOR_ERROR.positionArchived);
  if (imaAktivnuKarticu(cards, positionId)) return odbij(stanje, FLOOR_ERROR.positionHasQr);
  return gotovo(stanje, { positions: positions.filter((p) => p.id !== positionId) });
}

/**
 * New layouts for one or many positions, all or nothing. Each layout must be
 * valid and must not overlap any other position of the same zone: a position
 * in the same call counts at its new layout, every other one where the plan
 * draws it now (so a drop onto a visibly taken spot is refused, a swap works).
 */
function postaviRasporede(
  stanje: LokalMemorija,
  stavke: readonly { positionId: string; layout: FloorLayout }[],
): LokalKorak {
  const { positions } = stanje.podaci;
  if (!jeCeo(stavke.length, 1, MENU_MAX_POSITION_BATCH)) return odbij(stanje, MENU_ERROR.invalidInput);
  if (new Set(stavke.map((s) => s.positionId)).size !== stavke.length) {
    return odbij(stanje, MENU_ERROR.invalidInput);
  }
  const nove = new Map<string, FloorLayout>();
  for (const stavka of stavke) {
    if (!positions.some((p) => p.id === stavka.positionId)) return odbij(stanje, FLOOR_ERROR.positionArchived);
    if (!isValidLayout(stavka.layout)) return odbij(stanje, FLOOR_ERROR.invalidLayout);
    nove.set(stavka.positionId, kopija(stavka.layout));
  }
  const izmenjeneZone = new Set(positions.filter((p) => nove.has(p.id)).map((p) => p.zoneId));
  for (const zoneId of Array.from(izmenjeneZone)) {
    const nacrtano = efektivni(positions, zoneId);
    const clanovi = uZoni(positions, zoneId);
    const konacno = clanovi.map((p) => ({ id: p.id, layout: nove.get(p.id) ?? nacrtano.get(p.id) }));
    for (const { id } of konacno) {
      const novi = nove.get(id);
      if (!novi) continue;
      const drugi = konacno.flatMap((stavka) => (stavka.id !== id && stavka.layout ? [stavka.layout] : []));
      if (overlapsAny(novi, drugi)) return odbij(stanje, FLOOR_ERROR.invalidLayout);
    }
  }
  return gotovo(stanje, {
    positions: positions.map((p) => {
      const layout = nove.get(p.id);
      return layout ? { ...p, layout } : p;
    }),
  });
}

// -----------------------------------------------------------------------------
// Zones
// -----------------------------------------------------------------------------

function zauzetoImeZone(zone: readonly LokalZona[], ime: string, osim?: string): boolean {
  const kljuc = normalizeArticleName(ime);
  return zone.some((zona) => zona.id !== osim && normalizeArticleName(zona.name) === kljuc);
}

function napraviZonu(stanje: LokalMemorija, ime: string): LokalKorak {
  const { zones } = stanje.podaci;
  const ociscena = requiredText(ime, MENU_TEXT.zoneName);
  if (ociscena === null) return odbij(stanje, MENU_ERROR.invalidInput);
  if (zones.length + 1 > MENU_MAX_ZONES) return odbij(stanje, MENU_ERROR.limitReached);
  if (zauzetoImeZone(zones, ociscena)) return odbij(stanje, FLOOR_ERROR.zoneNameTaken);
  const n = stanje.sledeciBroj;
  const zona: LokalZona = {
    id: `z-${n}`,
    key: `zn_mem${dopunjeno(n)}`,
    name: ociscena,
    order: sledeciRedosled(zones),
  };
  return gotovo(stanje, { zones: [...zones, zona] }, n + 1);
}

function preimenujZonu(stanje: LokalMemorija, zoneId: string, ime: string): LokalKorak {
  const { zones } = stanje.podaci;
  if (!zones.some((z) => z.id === zoneId)) return odbij(stanje, FLOOR_ERROR.zoneArchived);
  const ociscena = requiredText(ime, MENU_TEXT.zoneName);
  if (ociscena === null) return odbij(stanje, MENU_ERROR.invalidInput);
  if (zauzetoImeZone(zones, ociscena, zoneId)) return odbij(stanje, FLOOR_ERROR.zoneNameTaken);
  return gotovo(stanje, { zones: zones.map((z) => (z.id === zoneId ? { ...z, name: ociscena } : z)) });
}

function pomeriZonu(stanje: LokalMemorija, zoneId: string, smer: "up" | "down"): LokalKorak {
  const { zones } = stanje.podaci;
  const poredane = [...zones].sort(poRedosledu);
  const i = poredane.findIndex((z) => z.id === zoneId);
  if (i < 0) return odbij(stanje, FLOOR_ERROR.zoneArchived);
  if (smer !== "up" && smer !== "down") return odbij(stanje, MENU_ERROR.invalidInput);
  const susedno = poredane[smer === "up" ? i - 1 : i + 1];
  if (!susedno) return bezPromene(stanje);
  const ova = poredane[i];
  const zamenjene = zones
    .map((z) => {
      if (z.id === ova.id) return { ...z, order: susedno.order };
      if (z.id === susedno.id) return { ...z, order: ova.order };
      return z;
    })
    .sort(poRedosledu);
  return gotovo(stanje, { zones: zamenjene });
}

/** The zone leaves the list; its positions move to "Bez zone" on fresh, non-overlapping spots of that surface. */
function arhivirajZonu(stanje: LokalMemorija, zoneId: string): LokalKorak {
  const { zones, positions } = stanje.podaci;
  if (!zones.some((z) => z.id === zoneId)) return odbij(stanje, FLOOR_ERROR.zoneArchived);
  const zauzeto = Array.from(efektivni(positions, null).values());
  const premesteno = new Map<string, LokalPozicija>();
  for (const pozicija of uZoni(positions, zoneId).sort(poRedosledu)) {
    premesteno.set(pozicija.id, { ...pozicija, zoneId: null, layout: smesti(zauzeto, velicinaOd(pozicija)) });
  }
  return gotovo(stanje, {
    zones: zones.filter((z) => z.id !== zoneId),
    positions: positions.map((p) => premesteno.get(p.id) ?? p),
  });
}

// -----------------------------------------------------------------------------
// QR cards
// -----------------------------------------------------------------------------

const KOD_ABECEDA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KOD_MODUL = 2 ** 40;
const KOD_KORAK = 2654435761;
const KOD_SO = 618033988;

/**
 * The 8-character card code of counter value `broj`: base 32 of an odd
 * multiple of it modulo 2^40 (one-to-one for counters below 2^40), so the same
 * counter always gives the same code and no two counters give the same one.
 */
export function kodKartice(broj: number): string {
  let vrednost = (broj * KOD_KORAK + KOD_SO) % KOD_MODUL;
  let kod = "";
  for (let i = 0; i < 8; i += 1) {
    kod = KOD_ABECEDA[vrednost % 32] + kod;
    vrednost = Math.floor(vrednost / 32);
  }
  return kod;
}

type NovaKartica = { label: string; pageKey: string | null; positionId: string | null };

function napraviKartice(stanje: LokalMemorija, nove: readonly NovaKartica[]): LokalKorak {
  const { cards } = stanje.podaci;
  const zauzetiKodovi = new Set(cards.map((kartica) => kartica.cardCode));
  const sada = stanje.sada ?? LOKAL_MEMORIJA_SADA;
  let broj = stanje.sledeciBroj;
  const napravljene = nove.map((nova): LokalKartica => {
    let n = broj;
    broj += 1;
    let kod = kodKartice(n);
    while (zauzetiKodovi.has(kod)) {
      n = broj;
      broj += 1;
      kod = kodKartice(n);
    }
    zauzetiKodovi.add(kod);
    return {
      id: `k-${n}`,
      cardCode: kod,
      label: nova.label,
      status: "active",
      managedByScanMe: false,
      opensMenu: true,
      link: { pageKey: nova.pageKey, positionId: nova.positionId, active: true },
      totalScans: 0,
      lastScanAt: null,
      createdAt: sada,
    };
  });
  return gotovo(stanje, { cards: [...cards, ...napravljene] }, broj);
}

function postojiStranica(stranice: readonly LokalStranica[], pageKey: string | null): boolean {
  return pageKey === null || stranice.some((stranica) => stranica.key === pageKey);
}

function napraviZaPozicije(stanje: LokalMemorija, positionIds: readonly string[], pageKey: string | null): LokalKorak {
  const { positions, pages } = stanje.podaci;
  if (!jeCeo(positionIds.length, 1, MENU_MAX_QR_MINT_BATCH)) return odbij(stanje, MENU_ERROR.invalidInput);
  const jedinstveni = Array.from(new Set(positionIds));
  const izabrane: LokalPozicija[] = [];
  for (const id of jedinstveni) {
    const pozicija = positions.find((p) => p.id === id);
    if (!pozicija) return odbij(stanje, FLOOR_ERROR.positionArchived);
    izabrane.push(pozicija);
  }
  if (!postojiStranica(pages, pageKey)) return odbij(stanje, FLOOR_ERROR.pageUnavailable);
  return napraviKartice(
    stanje,
    izabrane.map((pozicija) => ({ label: pozicija.label, pageKey, positionId: pozicija.id })),
  );
}

function napraviZaStranicu(stanje: LokalMemorija, pageKey: string | null, broj: number): LokalKorak {
  const { pages } = stanje.podaci;
  if (!jeCeo(broj, 1, MENU_MAX_QR_MINT_BATCH)) return odbij(stanje, MENU_ERROR.invalidInput);
  const stranica = pageKey === null ? undefined : pages.find((s) => s.key === pageKey);
  if (pageKey !== null && !stranica) return odbij(stanje, FLOOR_ERROR.pageUnavailable);
  const oznaka =
    stranica && !stranica.isDefault ? stranica.name : (stanje.podrazumevanaOznaka ?? LOKAL_PODRAZUMEVANA_OZNAKA);
  return napraviKartice(
    stanje,
    Array.from({ length: broj }, () => ({ label: oznaka, pageKey, positionId: null })),
  );
}

function povezi(
  stanje: LokalMemorija,
  cardId: string,
  veza: { pageKey: string | null; positionId: string | null },
): LokalKorak {
  const { cards, pages, positions } = stanje.podaci;
  const kartica = nadjiKarticu(stanje, cardId);
  if (!kartica) return odbij(stanje, MENU_ERROR.notFound);
  if (kartica.managedByScanMe) return odbij(stanje, FLOOR_ERROR.cardReadOnly);
  if (!kartica.opensMenu) return odbij(stanje, FLOOR_ERROR.cardNotMenu);
  if (!postojiStranica(pages, veza.pageKey)) return odbij(stanje, FLOOR_ERROR.pageUnavailable);
  if (veza.positionId !== null && !positions.some((p) => p.id === veza.positionId)) {
    return odbij(stanje, FLOOR_ERROR.positionArchived);
  }
  const izmenjena: LokalKartica = {
    ...kartica,
    link: { pageKey: veza.pageKey, positionId: veza.positionId, active: true },
  };
  return gotovo(stanje, { cards: cards.map((k) => (k.id === cardId ? izmenjena : k)) });
}

function postaviAktivnost(stanje: LokalMemorija, cardId: string, aktivna: boolean): LokalKorak {
  const { cards } = stanje.podaci;
  const kartica = nadjiKarticu(stanje, cardId);
  if (!kartica) return odbij(stanje, MENU_ERROR.notFound);
  if (kartica.managedByScanMe) return odbij(stanje, FLOOR_ERROR.cardReadOnly);
  const izmenjena: LokalKartica = { ...kartica, status: aktivna ? "active" : "disabled" };
  return gotovo(stanje, { cards: cards.map((k) => (k.id === cardId ? izmenjena : k)) });
}

// -----------------------------------------------------------------------------
// The entry points
// -----------------------------------------------------------------------------

/** One action on the memory: the next state and the outcome. A refused action returns the same state object. */
export function primeniRadnju(stanje: LokalMemorija, radnja: LokalRadnjaMemorije): LokalKorak {
  switch (radnja.vrsta) {
    case "createPosition":
      return napraviPoziciju(stanje, radnja.input);
    case "createPositions":
      return napraviViseNovih(stanje, radnja.input);
    case "updatePosition":
      return izmeniPoziciju(stanje, radnja.positionId, radnja.change);
    case "archivePosition":
      return arhivirajPoziciju(stanje, radnja.positionId);
    case "setLayout":
      return postaviRasporede(stanje, [{ positionId: radnja.positionId, layout: radnja.layout }]);
    case "setLayouts":
      return postaviRasporede(stanje, radnja.items);
    case "createZone":
      return napraviZonu(stanje, radnja.name);
    case "renameZone":
      return preimenujZonu(stanje, radnja.zoneId, radnja.name);
    case "moveZone":
      return pomeriZonu(stanje, radnja.zoneId, radnja.direction);
    case "archiveZone":
      return arhivirajZonu(stanje, radnja.zoneId);
    case "mintForPositions":
      return napraviZaPozicije(stanje, radnja.positionIds, radnja.pageKey);
    case "mintForPage":
      return napraviZaStranicu(stanje, radnja.pageKey, radnja.count);
    case "linkCard":
      return povezi(stanje, radnja.cardId, radnja.link);
    case "setCardActive":
      return postaviAktivnost(stanje, radnja.cardId, radnja.active);
  }
}

/**
 * The `LokalRadnje` the screen calls, over a state the izlog keeps (a React
 * ref or state). Each call applies at once to the state `get()` returns now,
 * stores the next state with `set` (not when the action was refused) and
 * resolves with the outcome.
 */
export function napraviRadnje(get: () => LokalMemorija, set: (stanje: LokalMemorija) => void): LokalRadnje {
  const izvrsi = (radnja: LokalRadnjaMemorije): Promise<LokalIshod> => {
    const trenutno = get();
    const { stanje, ishod } = primeniRadnju(trenutno, radnja);
    if (stanje !== trenutno) set(stanje);
    return Promise.resolve(ishod);
  };
  return {
    createPosition: (input) => izvrsi({ vrsta: "createPosition", input }),
    createPositions: (input) => izvrsi({ vrsta: "createPositions", input }),
    updatePosition: (positionId, change) => izvrsi({ vrsta: "updatePosition", positionId, change }),
    archivePosition: (positionId) => izvrsi({ vrsta: "archivePosition", positionId }),
    setLayout: (positionId, layout) => izvrsi({ vrsta: "setLayout", positionId, layout }),
    setLayouts: (items) => izvrsi({ vrsta: "setLayouts", items }),
    createZone: (name) => izvrsi({ vrsta: "createZone", name }),
    renameZone: (zoneId, name) => izvrsi({ vrsta: "renameZone", zoneId, name }),
    moveZone: (zoneId, direction) => izvrsi({ vrsta: "moveZone", zoneId, direction }),
    archiveZone: (zoneId) => izvrsi({ vrsta: "archiveZone", zoneId }),
    mintForPositions: (positionIds, pageKey) => izvrsi({ vrsta: "mintForPositions", positionIds, pageKey }),
    mintForPage: (pageKey, count) => izvrsi({ vrsta: "mintForPage", pageKey, count }),
    linkCard: (cardId, link) => izvrsi({ vrsta: "linkCard", cardId, link }),
    setCardActive: (cardId, active) => izvrsi({ vrsta: "setCardActive", cardId, active }),
  };
}
