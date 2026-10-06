// Izlagači 2026 — the public address a printed fair QR code encodes:
// `<origin>/r/<resolverCode>` (the one resolver, MASTER §2; JOVAN-DELTA §1).
// The admin draws the QR of the deployment it runs on (window origin), so on
// production it is exactly the printed sticker (https://scanme.rs/r/…) and a
// scan from the screen tests the real destination.

export const FAIR_QR_DEFAULT_ORIGIN = "https://scanme.rs";

export function fairQrPublicUrl(origin: string, resolverCode: string): string {
  const base = origin.replace(/\/+$/, "") || FAIR_QR_DEFAULT_ORIGIN;
  return `${base}/r/${encodeURIComponent(resolverCode)}`;
}
