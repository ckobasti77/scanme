// ScanMe Menu V1 (K23) — the connection of a waiter's device (master §10.2;
// plan docs/meni/planovi/K19.md K19-22; MENU-UX §9 "Bez veze").
//
//   online    everything works
//   offline   a clear strip "Nema veze sa internetom · prikaz od 18:52";
//             Preuzmi, Završi, Otkaži and the table status are disabled with
//             the reason; timers keep running on the device; NOTHING is queued
//             (no double accept when the connection comes back)
//   ponovo    the connection just came back: the panel re-reads the venue
//             (Convex resubscribes), says "Veza je vraćena." once, and the
//             waiter's view (filters, the open table or request) is kept
//
// Pure: a reducer over the browser's online state and the realtime socket.

export type VezaStanje = "online" | "offline" | "ponovo";

export type Veza = {
  stanje: VezaStanje;
  /** The last moment the panel was known to be connected (the strip says "prikaz od …"). */
  poslednjeOsvezenje: number | null;
  /** While `ponovo`: until when the "back online" note stays. */
  ponovoDo: number | null;
};

/** How long "Veza je vraćena." stays after the connection came back. */
export const PONOVO_MS = 4000;

export const POCETNA_VEZA: Veza = { stanje: "online", poslednjeOsvezenje: null, ponovoDo: null };

/**
 * The next connection state for what the device sees now (`online`) at `sada`.
 * Going offline keeps the last moment it was connected; coming back shows
 * `ponovo` for PONOVO_MS, then `online`.
 */
export function sledecaVeza(prethodna: Veza, online: boolean, sada: number): Veza {
  if (!online) {
    if (prethodna.stanje === "offline") return prethodna;
    return { stanje: "offline", poslednjeOsvezenje: sada, ponovoDo: null };
  }
  if (prethodna.stanje === "offline") {
    return { stanje: "ponovo", poslednjeOsvezenje: sada, ponovoDo: sada + PONOVO_MS };
  }
  if (prethodna.stanje === "ponovo" && prethodna.ponovoDo !== null && sada >= prethodna.ponovoDo) {
    return { stanje: "online", poslednjeOsvezenje: sada, ponovoDo: null };
  }
  if (prethodna.stanje === "online") {
    return prethodna.poslednjeOsvezenje === sada ? prethodna : { ...prethodna, poslednjeOsvezenje: sada };
  }
  return prethodna;
}

/** Actions that need the server wait while offline (never queued). */
export function radnjeDozvoljene(veza: Veza): boolean {
  return veza.stanje !== "offline";
}
