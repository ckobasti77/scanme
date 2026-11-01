// ScanMe Menu V1 (K14, plan K12 §6.4) — the language of a public menu page
// (master §7.7). The language is in the address (`?jezik=<kod>`, plan K12-10),
// so a link can be shared and the server render is right. A missing
// translation never shows as empty: the publication already writes the
// source text into every field without a confirmed translation (`localized`,
// lib/menu/snapshot.ts); here are the address rules around it.

/** The page language from the address: a published language, else the source (the first). */
export function jezikIzUpita(param: string | null | undefined, jezici: readonly string[]): string {
  const izvorni = jezici[0] ?? "sr";
  const trazeni = param?.trim().toLowerCase();
  return trazeni && jezici.includes(trazeni) ? trazeni : izvorni;
}

/** A public link that keeps the guest's language; the source language needs no parameter. */
export function saJezikom(href: string, jezik: string, jezici: readonly string[]): string {
  if (jezik === (jezici[0] ?? "sr") || !jezici.includes(jezik)) return href;
  const hes = href.indexOf("#");
  const put = hes >= 0 ? href.slice(0, hes) : href;
  const fragment = hes >= 0 ? href.slice(hes) : "";
  return `${put}${put.includes("?") ? "&" : "?"}jezik=${encodeURIComponent(jezik)}${fragment}`;
}
