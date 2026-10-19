// Istorija pregledača za stranicu /sajam/3d (odluka E9, A03 §4.3). Čisto: odlučuje šta se radi sa
// adresom kad se stanje promeni.
//
// - otvaranje dela iz scene ili liste (`null → deo`) pravi novi unos (push), pa „Nazad“ zatvara deo;
// - zamena dela, grupa i režim samo menjaju trenutni unos (replace), da se istorija ne puni;
// - zatvaranje dela čiji je unos napravila ova strana ide nazad (back), a inače replace;
// - stanje koje je došlo iz adrese (direktan link, „Nazad“ i „Napred“) nikad ne pravi unos.

import { urlFromState, type Auto3dState } from "./state";
import { serializeUrlState } from "./url-state";

export type HistoryOp = "none" | "push" | "replace" | "back";

/** Oznaka u `history.state` za unos koji je napravilo otvaranje dela. */
export const PART_ENTRY_MARK = "a3-part";

export function searchOf(s: Auto3dState): string {
  return serializeUrlState(urlFromState(s));
}

export function historyOp(prev: Auto3dState, next: Auto3dState, currentSearch: string): HistoryOp {
  if (searchOf(next) === currentSearch) return "none";
  if (prev.part === null && next.part !== null && next.origin !== "url") return "push";
  if (prev.part !== null && next.part === null && prev.pushedPart) return "back";
  return "replace";
}
