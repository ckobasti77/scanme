export type FairPassportStyle = "unlock" | "stamps";

export type FairEventPresentation = {
  themeClass: "fair-event--electromobility" | "fair-event--auto-moto";
  /** "unlock": hold-to-unlock cards; "stamps": perforated stamps stuck by tap. */
  passportStyle: FairPassportStyle;
};

const ELECTROMOBILITY: FairEventPresentation = { themeClass: "fair-event--electromobility", passportStyle: "unlock" };
const AUTO_MOTO: FairEventPresentation = { themeClass: "fair-event--auto-moto", passportStyle: "stamps" };

// One row per event (base slug, without "test-"). Unlisted events keep the
// old rule: elektromobilnost-* is the cool look, everything else the warm one.
const EVENT_PRESENTATIONS: Record<string, FairEventPresentation> = {
  "elektromobilnost-2026": ELECTROMOBILITY,
  "auto-moto-fest-2026": AUTO_MOTO,
};

export function fairEventPresentation(eventSlug: string): FairEventPresentation {
  const base = eventSlug.replace(/^test-/, "");
  return EVENT_PRESENTATIONS[base] ?? (base.startsWith("elektromobilnost-") ? ELECTROMOBILITY : AUTO_MOTO);
}

export function fairEventThemeClass(eventSlug: string): string {
  return fairEventPresentation(eventSlug).themeClass;
}
