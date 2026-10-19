// Kako se deo prikazuje u režimu i uz filter grupe (A03 §2.3, §2.5). Čisto; pregledač samo primenjuje.
//
// - kostur: karoserija (delovi i deco__karoserija__*) je sakrivena;
// - grupa: delovi drugih sistema su prigušeni (providnost 0,10, sivo) i ne mogu da se kliknu.

import type { SystemId } from "./catalog";

export type Mode = "rendgen" | "lak" | "kostur";
export type PartVisual = "normal" | "dim" | "hidden";

export const MODES: readonly Mode[] = ["rendgen", "lak", "kostur"];

export function partVisual(system: SystemId, mode: Mode, group: SystemId | null): PartVisual {
  if (mode === "kostur" && system === "karoserija") return "hidden";
  if (group !== null && system !== group) return "dim";
  return "normal";
}

/** Samo deo koji se vidi u punoj boji može da se klikne ili pređe mišem. */
export function isPickable(visual: PartVisual): boolean {
  return visual === "normal";
}

/** Grupa koja ne može da postoji u režimu (karoserija u kosturu) vraća režim na rendgen. */
export function modeForGroup(mode: Mode, group: SystemId | null): Mode {
  return mode === "kostur" && group === "karoserija" ? "rendgen" : mode;
}
