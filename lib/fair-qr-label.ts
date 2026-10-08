// Sajam 2026 N1 — the printed label of a fair sticker (`SA26-007`) as a field
// team types it on a phone. Pure; shared by Convex (convex/lib/fairQr.ts), the
// admin QR list (lib/admin-v1/qr-filters.ts) and the admin UI. The printed
// series lives in ONE place: FAIR_QR_LABEL_DEFAULT_FORMAT (also what
// convex/fairPrintInventory.ts prints); a live inventory's own format is
// derived from its labels (fairQrLabelFormatFromLabels / convex
// fairQrLabelFormatOf).

export type FairQrLabelFormat = {
  /** Upper-case series prefix before the dash (`SA26`). */
  prefix: string;
  /** Width of the zero-padded number (`007` → 3). */
  digits: number;
  /** Highest printed number (`SA26-100` → 100). */
  max: number;
};

/** The printed sticker series of Sajam automobila 2026: SA26-001 … SA26-100. */
export const FAIR_QR_LABEL_DEFAULT_FORMAT: FairQrLabelFormat = { prefix: "SA26", digits: 3, max: 100 };

const INPUT_MAX_LENGTH = 40;
/** Hyphen look-alikes a phone keyboard or a paste can produce, and `_`. */
const DASH_LIKE = /[‐-―−﹘﹣－_]/g;
const SEPARATORS = /^[\s-]+/;
/** A canonical serial label: prefix, one dash, digits (`SA26-007`, `TS26-100`). */
const SERIAL_LABEL = /^([A-Z][A-Z0-9]*)-(\d+)$/;

/** `SA26-007` for 7 in the given series. */
export function formatFairQrLabel(number: number, format: FairQrLabelFormat = FAIR_QR_LABEL_DEFAULT_FORMAT): string {
  return `${format.prefix}-${String(number).padStart(format.digits, "0")}`;
}

/** The parts of a canonical serial label, or null (`PANEL-2026-EVENT`, a resolver code, …). */
export function parseFairQrSerialLabel(label: string): { prefix: string; number: number; digits: number } | null {
  const match = SERIAL_LABEL.exec(label.trim().toUpperCase());
  if (!match) return null;
  return { prefix: match[1], number: Number(match[2]), digits: match[2].length };
}

/** Letter O and digit 0 are the same character on a sticker. */
const sameIgnoringO = (a: string, b: string) => a.replace(/O/g, "0") === b.replace(/O/g, "0");

/**
 * The canonical label (`SA26-007`) of a typed sticker number, or null.
 * Accepted: `7`, `07`, `007`, `sa26-7`, `SA26 7`, `SA26007`, `SA26_007`, an
 * en/em dash or another hyphen look-alike, letter O for zero, spaces around.
 * Refused: 0, a number above `format.max`, another prefix (`SA27-007`), a
 * leading separator (`-001`) and anything that is not a sticker number.
 */
export function normalizeFairQrLabel(input: string | null | undefined, format: FairQrLabelFormat = FAIR_QR_LABEL_DEFAULT_FORMAT): string | null {
  if (typeof input !== "string" || input.length > INPUT_MAX_LENGTH) return null;
  const text = input.normalize("NFKC").trim().toUpperCase().replace(DASH_LIKE, "-");
  if (!text) return null;
  const prefix = format.prefix.toUpperCase();
  const head = text.slice(0, prefix.length);
  const rest = head.length === prefix.length && sameIgnoringO(head, prefix) ? text.slice(prefix.length).replace(SEPARATORS, "") : text;
  const digits = rest.replace(/O/g, "0");
  if (!/^\d+$/.test(digits) || digits.length > format.digits + 2) return null;
  const number = Number(digits);
  if (!Number.isInteger(number) || number < 1 || number > format.max) return null;
  return formatFairQrLabel(number, format);
}

/**
 * The sticker series of an inventory from its labels: the prefix with the
 * highest printed number (panels and resolver-code labels are no series),
 * its number width and that number. null when no label is a serial.
 */
export function fairQrLabelFormatFromLabels(labels: Iterable<string>): FairQrLabelFormat | null {
  const series = new Map<string, FairQrLabelFormat>();
  for (const label of labels) {
    const serial = parseFairQrSerialLabel(label);
    if (!serial) continue;
    const known = series.get(serial.prefix);
    if (!known || serial.number > known.max) series.set(serial.prefix, { prefix: serial.prefix, digits: serial.digits, max: serial.number });
  }
  let best: FairQrLabelFormat | null = null;
  for (const format of series.values()) if (!best || format.max > best.max) best = format;
  return best;
}
