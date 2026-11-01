// ScanMe Menu V1 (K22) — the code of the waiter-panel link
// /[slug]/konobar/[kod] (plan docs/meni/planovi/K19.md K19-13). Ten Crockford
// base32 characters (about 50 bits, the alphabet of printed card codes
// without I L O U), so the panel cannot be found from the internet even
// though a PIN is only three digits. A wrong code is a 404. The Owner or a
// Manager can change it (menuStaff.rotatePanelCode), which signs every device
// out. Pure: the Convex runtime, Next handlers and tests share it.

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PANEL_CODE_LENGTH = 10;

/** A new random panel code. `random` is injectable for tests. */
export function newPanelCode(
  random: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length)),
): string {
  let code = "";
  // 256 % 32 === 0: a plain modulo is exactly uniform over the alphabet.
  for (const byte of random(PANEL_CODE_LENGTH)) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

/**
 * The canonical code of a URL segment, or null when it cannot be one.
 * Uppercase; the look-alikes map as on printed cards (I, L → 1; O → 0).
 */
export function normalizePanelCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length > 32) return null;
  const mapped = raw.trim().toUpperCase().replace(/[IL]/g, "1").replace(/O/g, "0");
  if (mapped.length !== PANEL_CODE_LENGTH) return null;
  for (const char of mapped) if (!ALPHABET.includes(char)) return null;
  return mapped;
}

/** The path of a venue's waiter panel. */
export function waiterPanelPath(slug: string, code: string): string {
  return `/${slug}/konobar/${code}`;
}

/** The path the staff cookies are scoped to (every panel route of the venue). */
export function waiterCookiePath(slug: string): string {
  return `/${slug}/konobar`;
}
