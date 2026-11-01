// ScanMe Menu V1 — `Izaberi više` (K11; master §13.4, K09 §4.5). The mode
// selects rows of the open page (placements, so "Ukloni sa ove stranice" and
// "Sakrij" know which appearance is meant); price, availability and deletion
// act on the articles behind them, each once. One action touches at most
// MENU_MAX_BULK_BATCH articles or placements. Pure: sets in, sets out.

import { MENU_MAX_BULK_BATCH } from "../limits";
import type { StudioArtikal, StudioRadniSadrzaj, StudioRed } from "./model";

export const STUDIO_MAX_IZBOR = MENU_MAX_BULK_BATCH;

export type StanjeIzbora = "nista" | "deo" | "sve";

/** Adds or removes one row. */
export function prebaciIzbor(izabrani: ReadonlySet<string>, prikazId: string): Set<string> {
  const sledeci = new Set(izabrani);
  if (sledeci.has(prikazId)) sledeci.delete(prikazId);
  else sledeci.add(prikazId);
  return sledeci;
}

/** The three states of a section's checkbox (an empty section is "nista"). */
export function stanjeSekcije(prikazIds: readonly string[], izabrani: ReadonlySet<string>): StanjeIzbora {
  let broj = 0;
  for (const id of prikazIds) if (izabrani.has(id)) broj += 1;
  if (broj === 0) return "nista";
  return broj === prikazIds.length ? "sve" : "deo";
}

/** The section checkbox: all of its rows when not all are selected, none when all are. */
export function prebaciSekciju(izabrani: ReadonlySet<string>, prikazIds: readonly string[]): Set<string> {
  const sledeci = new Set(izabrani);
  if (stanjeSekcije(prikazIds, izabrani) === "sve") {
    for (const id of prikazIds) sledeci.delete(id);
  } else {
    for (const id of prikazIds) sledeci.add(id);
  }
  return sledeci;
}

/** Drops ids that are no longer on the page (moved away, removed, deleted); the same set when nothing is dropped. */
export function ocistiIzbor(izabrani: ReadonlySet<string>, sadrzaj: StudioRadniSadrzaj): ReadonlySet<string> {
  if (izabrani.size === 0) return izabrani;
  const postoje = new Set<string>();
  for (const sekcija of sadrzaj.sekcije) for (const red of sekcija.redovi) postoje.add(red.prikazId);
  let sve = true;
  for (const id of izabrani) if (!postoje.has(id)) sve = false;
  if (sve) return izabrani;
  return new Set([...izabrani].filter((id) => postoje.has(id)));
}

/** The selected rows in page order. */
export function izabraniRedovi(sadrzaj: StudioRadniSadrzaj, izabrani: ReadonlySet<string>): StudioRed[] {
  const redovi: StudioRed[] = [];
  for (const sekcija of sadrzaj.sekcije) for (const red of sekcija.redovi) if (izabrani.has(red.prikazId)) redovi.push(red);
  return redovi;
}

/** The articles behind the selected rows, each once, in page order. */
export function artikliIzbora(redovi: readonly StudioRed[]): StudioArtikal[] {
  const videni = new Set<string>();
  const artikli: StudioArtikal[] = [];
  for (const red of redovi) {
    if (videni.has(red.artikal.id)) continue;
    videni.add(red.artikal.id);
    artikli.push(red.artikal);
  }
  return artikli;
}

/** More rows (or articles) than one action may take. */
export function prekoGranice(broj: number): boolean {
  return broj > STUDIO_MAX_IZBOR;
}
