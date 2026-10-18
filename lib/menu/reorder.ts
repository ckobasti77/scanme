// ScanMe Menu V1 — where a moved article lands (K11; master §5.6, §13.4).
//
// A page's work area is a list of sections, each a list of placement ids. A
// move (drag and drop or the `Premesti` dialog) is described the way the
// server stores it: the placement, its target section and the placement it
// now stands directly BEFORE (null = the end of that section) —
// exactly the arguments of menuCatalog.movePlacement. Moving a row to where it
// already is yields null, so nothing is written and the draft stays clean.
// Pure: no React, no Convex.

export type RasporedSekcija = { id: string; redovi: readonly string[] };
export type Raspored = readonly RasporedSekcija[];

export type PlanPremestanja = {
  prikazId: string;
  uSekciju: string;
  /** The placement it now stands directly before; null = the end of the section. */
  prePrikaza: string | null;
};

export type PozicijaPrikaza = { sekcijaId: string; indeks: number; ukupno: number };

/** The ids of a page's sections and rows, in order. */
export function rasporedIz(sekcije: readonly { id: string; redovi: readonly { prikazId: string }[] }[]): RasporedSekcija[] {
  return sekcije.map((sekcija) => ({ id: sekcija.id, redovi: sekcija.redovi.map((red) => red.prikazId) }));
}

/** Section, 0-based index and section length of a row; null when it is not on the page. */
export function pozicijaPrikaza(raspored: Raspored, prikazId: string): PozicijaPrikaza | null {
  for (const sekcija of raspored) {
    const indeks = sekcija.redovi.indexOf(prikazId);
    if (indeks !== -1) return { sekcijaId: sekcija.id, indeks, ukupno: sekcija.redovi.length };
  }
  return null;
}

/**
 * The layout with `prikazId` taken out and put at `indeks` of section
 * `uSekciju` (counted in that section WITHOUT the moved row; clamped). The same
 * object comes back when the row or the section is unknown.
 */
export function postaviNaMesto(raspored: Raspored, prikazId: string, uSekciju: string, indeks: number): Raspored {
  const od = pozicijaPrikaza(raspored, prikazId);
  if (!od || !raspored.some((sekcija) => sekcija.id === uSekciju)) return raspored;
  return raspored.map((sekcija) => {
    let redovi = sekcija.redovi;
    if (sekcija.id === od.sekcijaId) redovi = redovi.filter((id) => id !== prikazId);
    if (sekcija.id === uSekciju) {
      const mesto = Math.max(0, Math.min(Math.trunc(indeks), redovi.length));
      redovi = [...redovi.slice(0, mesto), prikazId, ...redovi.slice(mesto)];
    }
    return redovi === sekcija.redovi ? sekcija : { id: sekcija.id, redovi };
  });
}

/**
 * The move that turns `pocetni` into `konacni` for `prikazId` (the other rows
 * keep their relative order), or null when the row ends up where it was.
 */
export function planIzRasporeda(pocetni: Raspored, konacni: Raspored, prikazId: string): PlanPremestanja | null {
  const pre = pozicijaPrikaza(pocetni, prikazId);
  const posle = pozicijaPrikaza(konacni, prikazId);
  if (!pre || !posle) return null;
  const sledeci = (raspored: Raspored, pozicija: PozicijaPrikaza) => {
    const sekcija = raspored.find((candidate) => candidate.id === pozicija.sekcijaId)!;
    return sekcija.redovi[pozicija.indeks + 1] ?? null;
  };
  const prePrikaza = sledeci(konacni, posle);
  if (pre.sekcijaId === posle.sekcijaId && sledeci(pocetni, pre) === prePrikaza) return null;
  return { prikazId, uSekciju: posle.sekcijaId, prePrikaza };
}

/** `Premesti`: the move that puts the row at `indeks` of `uSekciju`, or null when nothing changes. */
export function planNaMesto(raspored: Raspored, prikazId: string, uSekciju: string, indeks: number): PlanPremestanja | null {
  return planIzRasporeda(raspored, postaviNaMesto(raspored, prikazId, uSekciju, indeks), prikazId);
}

/**
 * Drag over another row or a section: where the dragged row stands now.
 * Over a row of the same section the row takes that row's place; over a row of
 * another section it goes before it, or after it when `posle`; over a section
 * (its header, or an empty section) it goes to the end of that section.
 */
export function pomeriPrevlacenjem(
  raspored: Raspored,
  prikazId: string,
  meta: { vrsta: "red"; prikazId: string; posle: boolean } | { vrsta: "sekcija"; sekcijaId: string },
): Raspored {
  const od = pozicijaPrikaza(raspored, prikazId);
  if (!od) return raspored;
  if (meta.vrsta === "sekcija") {
    if (meta.sekcijaId === od.sekcijaId) return raspored;
    const cilj = raspored.find((sekcija) => sekcija.id === meta.sekcijaId);
    if (!cilj) return raspored;
    return postaviNaMesto(raspored, prikazId, cilj.id, cilj.redovi.length);
  }
  if (meta.prikazId === prikazId) return raspored;
  const kod = pozicijaPrikaza(raspored, meta.prikazId);
  if (!kod) return raspored;
  if (kod.sekcijaId === od.sekcijaId) {
    // Same section: take the place of the row underneath (arrayMove semantics).
    if (kod.indeks === od.indeks) return raspored;
    return postaviNaMesto(raspored, prikazId, kod.sekcijaId, kod.indeks);
  }
  return postaviNaMesto(raspored, prikazId, kod.sekcijaId, kod.indeks + (meta.posle ? 1 : 0));
}

/**
 * Applies a move to the sections of the work area (what the screen shows
 * until the server confirms). A plan whose row or target is gone is ignored;
 * sections it does not touch keep their identity.
 */
export function primeniPremestanje<R extends { prikazId: string }, S extends { id: string; redovi: readonly R[] }>(
  sekcije: readonly S[],
  plan: PlanPremestanja,
): S[] {
  let red: R | undefined;
  for (const sekcija of sekcije) {
    red = sekcija.redovi.find((candidate) => candidate.prikazId === plan.prikazId);
    if (red) break;
  }
  const cilj = sekcije.find((sekcija) => sekcija.id === plan.uSekciju);
  // A row cannot stand before itself: such a plan is no move.
  if (!red || !cilj || plan.prePrikaza === plan.prikazId) return sekcije.slice();
  if (plan.prePrikaza !== null && !cilj.redovi.some((candidate) => candidate.prikazId === plan.prePrikaza)) {
    return sekcije.slice();
  }
  const pomeren = red;
  return sekcije.map((sekcija) => {
    const imaRed = sekcija.redovi.includes(pomeren);
    if (!imaRed && sekcija.id !== plan.uSekciju) return sekcija;
    let redovi = sekcija.redovi.filter((candidate) => candidate !== pomeren);
    if (sekcija.id === plan.uSekciju) {
      const mesto = plan.prePrikaza === null ? redovi.length : redovi.findIndex((candidate) => candidate.prikazId === plan.prePrikaza);
      redovi = [...redovi.slice(0, mesto), pomeren, ...redovi.slice(mesto)];
    }
    const isto = redovi.length === sekcija.redovi.length && redovi.every((candidate, index) => candidate === sekcija.redovi[index]);
    return isto ? sekcija : { ...sekcija, redovi };
  });
}

/** Moving a section to `naIndeks` (clamped): the new index, or null when it stays where it is. */
export function planSekcije(sekcijaIds: readonly string[], sekcijaId: string, naIndeks: number): number | null {
  const od = sekcijaIds.indexOf(sekcijaId);
  if (od === -1) return null;
  const cilj = Math.max(0, Math.min(Math.trunc(naIndeks), sekcijaIds.length - 1));
  return cilj === od ? null : cilj;
}

/** Sections in the order after moving `sekcijaId` to `naIndeks` (identity when nothing changes). */
export function primeniPremestanjeSekcije<S extends { id: string }>(sekcije: readonly S[], sekcijaId: string, naIndeks: number): S[] {
  const cilj = planSekcije(
    sekcije.map((sekcija) => sekcija.id),
    sekcijaId,
    naIndeks,
  );
  if (cilj === null) return sekcije.slice();
  const ostale = sekcije.filter((sekcija) => sekcija.id !== sekcijaId);
  const pomerena = sekcije.find((sekcija) => sekcija.id === sekcijaId)!;
  return [...ostale.slice(0, cilj), pomerena, ...ostale.slice(cilj)];
}
