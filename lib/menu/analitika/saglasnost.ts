// ScanMe Menu V1 (K29, P8) — the consent point of the analytics identifier
// (master §14.4: legal check before production). Whether the session id may
// be kept in the guest's browser is decided ONLY here:
//   - `iskljuceno` (default, and for every unknown value): never — sessions
//     and conversions are "not available", every other number still works;
//   - `ukljuceno`: always (only after the owner's and the lawyer's decision);
//   - `saglasnost`: only after the guest explicitly agreed (localStorage
//     `smm_an_saglasnost` = `da`; the question and its text are an open
//     question, docs/tasks/BLOCKED.md "SCANME MENU V1 — K29").
// The ingest route also strips the id while the mode is `iskljuceno`, so a
// modified browser cannot store it either.

export const ANALITIKA_REZIMI = ["iskljuceno", "ukljuceno", "saglasnost"] as const;
export type AnalitikaRezim = (typeof ANALITIKA_REZIMI)[number];

/** localStorage key of the guest's own answer (`da` / `ne`). */
export const SAGLASNOST_KLJUC = "smm_an_saglasnost";

/** `MENU_ANALYTICS_IDENTIFIERS`: `on` → ukljuceno, `consent` → saglasnost, anything else → iskljuceno. */
export function analitikaRezim(raw: string | undefined | null): AnalitikaRezim {
  const value = raw?.trim().toLowerCase();
  if (value === "on") return "ukljuceno";
  if (value === "consent") return "saglasnost";
  return "iskljuceno";
}

/** May this browser keep (and send) a session id? */
export function smeIdentifikator(rezim: AnalitikaRezim, izborGosta: string | null): boolean {
  if (rezim === "ukljuceno") return true;
  if (rezim === "saglasnost") return izborGosta === "da";
  return false;
}
