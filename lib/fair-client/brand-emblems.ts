// Square brand emblems for small round marks (the survey chat-head). Only a
// trimmed, square emblem is legible at 24 px; a wide wordmark is not, so a
// brand without an entry gets the chat icon instead (owner decision 2026-10-08).
// Until the server projects a brand logo, this is a curated local list.

const EMBLEMS: Readonly<Record<string, string>> = {
  jmev: "/fair/elektromobilnost-2026/jmev-emblem.png",
};

/** The emblem path for a brand name (`TEST ` prefix and case ignored), or null. */
export function fairBrandEmblem(brandName: string): string | null {
  const key = brandName.replace(/^TEST\s+/i, "").trim().toLocaleLowerCase("sr-Latn");
  return Object.hasOwn(EMBLEMS, key) ? EMBLEMS[key] : null;
}
