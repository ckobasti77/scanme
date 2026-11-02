// ScanMe Menu V1 (K29) — the session (master §14.4): a run of one browser's
// events on one venue's menu with no pause of 30 minutes or longer. The id is
// random, kept per venue in localStorage with the time of the last activity,
// and replaced after every such pause — so there is no lasting "visitor", no
// link between venues and no fingerprint. Clearing the browser or incognito
// makes a new session (accepted). The rollup applies the same rule on the
// server (`nastavljaSesiju`), so a stale id cannot stretch a session.

import { MENU_ANALYTICS_SESSION_GAP_MS } from "./definicije";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const DUZINA = 16;

/** The shape of a session id (also checked by the server). */
export const SESIJA_PATTERN = /^[0-9a-hjkmnp-tv-z]{16}$/;

/** localStorage key of the venue's session state. */
export function kljucSesije(slug: string): string {
  return `smm_an:${slug}`;
}

export type StanjeSesije = {
  /** The session id. */
  s: string;
  /** The last activity (ms). */
  t: number;
};

export type RandomBytes = (length: number) => Uint8Array;

const cryptoBytes: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

export function noviIdSesije(random: RandomBytes = cryptoBytes): string {
  const bytes = random(DUZINA);
  let id = "";
  for (let index = 0; index < DUZINA; index += 1) id += ALPHABET[bytes[index] % ALPHABET.length];
  return id;
}

/** A stored state, or null when missing or damaged. */
export function citajStanje(raw: string | null): StanjeSesije | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { s, t } = value as Record<string, unknown>;
    if (typeof s !== "string" || !SESIJA_PATTERN.test(s) || typeof t !== "number" || !Number.isFinite(t)) return null;
    return { s, t };
  } catch {
    return null;
  }
}

/** The same session continues when the pause is shorter than 30 minutes. */
export function nastavljaSesiju(poslednjaAktivnostMs: number, sadaMs: number): boolean {
  return sadaMs - poslednjaAktivnostMs < MENU_ANALYTICS_SESSION_GAP_MS;
}

/**
 * The state after one more event: the same id while the session continues;
 * a new id after a pause of 30 minutes or more, or when the stored time is
 * in the future (a clock moved back).
 */
export function sledecaSesija(stanje: StanjeSesije | null, sadaMs: number, noviId: () => string = noviIdSesije): StanjeSesije {
  if (stanje && stanje.t <= sadaMs && nastavljaSesiju(stanje.t, sadaMs)) return { s: stanje.s, t: sadaMs };
  return { s: noviId(), t: sadaMs };
}
