// ScanMe Menu V1 (K25) — the link of a venue's own reservation system
// (master §11.6: "V1 podržava link/redirect"; plan docs/meni/planovi/K24.md
// K24-16). ScanMe only links to it and never stores its reservations. Only an
// https address is accepted, without credentials in it, at most 500
// characters; the stored form is the URL's own normalization.

export const EXTERNAL_RESERVATION_URL_MAX = 500;

export function normalizeExternalReservationUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > EXTERNAL_RESERVATION_URL_MAX || /\s/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return null;
  // A real host name (scanme.rs, rezervacije.example.com): not "localhost", a bare word or an IP
  // address (the top-level label has letters).
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z][a-z0-9-]*$/i.test(url.hostname)) return null;
  const normalized = url.toString();
  return normalized.length <= EXTERNAL_RESERVATION_URL_MAX ? normalized : null;
}
