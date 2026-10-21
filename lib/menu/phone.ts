// ScanMe Menu V1 (K26) — tel: link from a free-form phone number.

// Keeps the digits and one leading "+" (only when the trimmed input starts with it).
// Returns null when fewer than 6 digits remain.
export function telHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}
