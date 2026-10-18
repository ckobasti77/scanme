// ScanMe Menu V1 (K17) — the ScanMe team's public contact for a fully custom
// menu design (master §15.2: "potpuno prilagođen dizajn procenjuje se i
// naplaćuje posebno"). The same public address the offer page already shows
// (components/offer-footer.tsx). Nothing is sent from the app: the editor
// opens the person's own mail program with a prepared message (mailto:).

export const SCANME_KONTAKT_EMAIL = "office@scanme.rs";

/** A mailto: link with a subject and a body (each encoded). */
export function mailtoLink(adresa: string, tema: string, telo: string): string {
  return `mailto:${adresa}?subject=${encodeURIComponent(tema)}&body=${encodeURIComponent(telo)}`;
}
