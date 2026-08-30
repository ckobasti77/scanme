// The 12-key design-engine font enum and its render font stacks, defined once
// (RFC-001 §1.a/§1.b found the enum duplicated in four places). The stacks
// mirror the ScanMe Links render map exactly — lifted verbatim from the
// option-two Links template, which imports FONT_STACKS back. The editor's
// swatch map (components/admin) deliberately stays as it is; its divergence
// from this map is a recorded TASK-06 finding, not reconciled here.

export const DESIGN_FONT_KEYS = [
  "dm-sans",
  "nunito-sans",
  "source-sans-3",
  "system-ui",
  "inter",
  "manrope",
  "cormorant-garamond",
  "playfair-display",
  "lora",
  "libre-baskerville",
  "space-grotesk",
  "archivo",
] as const;

export type DesignFontKey = (typeof DESIGN_FONT_KEYS)[number];

// Face names come from the Fontsource packages imported in app/layout.tsx. The
// "… Variable" suffix is Fontsource's own naming for its variable builds, so it
// has to be spelled exactly; the trailing stack only covers the swap window.
export const FONT_STACKS: Record<DesignFontKey, string> = {
  "dm-sans": '"DM Sans Variable", "Segoe UI", Arial, sans-serif',
  "nunito-sans": '"Nunito Sans Variable", "Segoe UI", Arial, sans-serif',
  "source-sans-3": '"Source Sans 3 Variable", "Segoe UI", Arial, sans-serif',
  "system-ui": 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  inter: '"Inter Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
  manrope: '"Manrope Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
  "cormorant-garamond":
    '"Cormorant Garamond Variable", Georgia, "Times New Roman", serif',
  "playfair-display":
    '"Playfair Display Variable", Georgia, "Times New Roman", serif',
  lora: '"Lora Variable", Georgia, "Times New Roman", serif',
  "libre-baskerville":
    '"Libre Baskerville", Georgia, "Times New Roman", serif',
  "space-grotesk":
    '"Space Grotesk Variable", "Arial Narrow", Arial, sans-serif',
  archivo: '"Archivo Variable", "Arial Narrow", Arial, sans-serif',
};
