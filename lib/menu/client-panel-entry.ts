// ScanMe Menu V1 — where the existing client panel shows the ScanMe Menu
// entry (K08). The panel of the other services stays exactly as it was: the
// entry is an extra block that opens the new Menu shell, never a tab that
// replaces one. Pure, so the decision is tested without rendering
// (components/client-panel/** tests do not run).

export type MeniUlazStanje = "ucitava" | "nema" | "dostupno";

/** `menuPanel.entry` as the panel sees it: undefined while the query loads. */
export function meniUlazStanje(entry: { status: "none" | "available" } | undefined): MeniUlazStanje {
  if (entry === undefined) return "ucitava";
  return entry.status === "available" ? "dostupno" : "nema";
}

export type MeniUlazMesto =
  /** Above the service tabs (the Links / Google Review overview is available). */
  | "iznad-tabova"
  /** Above the Venue and/or Memories sections (no overview). */
  | "iznad-dodatnih"
  /** The venue has only ScanMe Menu: the entry replaces the access-denied screen. */
  | "samo-meni"
  /** Nothing else to show and the Menu answer is not here yet: keep loading, don't flash "no access". */
  | "ceka";

export function meniUlazMesto(input: {
  overview: "available" | "forbidden";
  venue: boolean;
  memories: boolean;
  meni: MeniUlazStanje;
}): MeniUlazMesto | null {
  if (input.overview === "available") return input.meni === "dostupno" ? "iznad-tabova" : null;
  if (input.venue || input.memories) return input.meni === "dostupno" ? "iznad-dodatnih" : null;
  if (input.meni === "dostupno") return "samo-meni";
  return input.meni === "ucitava" ? "ceka" : null;
}
