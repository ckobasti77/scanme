// ScanMe Menu V1 (K17) — machine codes of the menu appearance (master §7.1,
// §15.2). Dependency-free like ./core.ts; the Serbian text lives in the
// `menu-domen` dictionary (`errors[code]`).

export const PRESENTATION_ERROR = {
  /** The palette is not one of the curated palettes (nor the venue's brand palette). */
  unknownPalette: "presentation/unknown_palette",
  /** The font pair is not one of the curated pairs. */
  unknownFontPair: "presentation/unknown_font_pair",
  /** The layout variant does not belong to the chosen layout. */
  variantMismatch: "presentation/variant_mismatch",
  /** Brand colours: 1–3 colours as #RRGGBB, the main colour required. */
  invalidBrandColors: "presentation/invalid_brand_colors",
  /** The brand palette would not be readable (automatic contrast check). */
  unreadable: "presentation/unreadable",
} as const;

export type PresentationErrorCode = (typeof PRESENTATION_ERROR)[keyof typeof PRESENTATION_ERROR];
