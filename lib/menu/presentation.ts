// ScanMe Menu V1 (K05) — the appearance of the public menu as it is published
// (convex/schema.ts menuPresentation). K05 only publishes and restores it;
// K17 edits it and decides which palettes, fonts and layouts exist, K13
// renders it. A service without a menuPresentation row publishes these
// defaults, so every published version carries a complete appearance.
//
// `paletteId` / `fontPairId` "default" mean "the renderer's default" (never the
// ScanMe black-and-green panel palette, master §15.2 / mockup README); K17 maps
// them to its real ids.
//
// K17: `layoutVariant` is a Premium variant of the layout
// (lib/menu/identity/varijante.ts), absent when there is none — absent, not
// null, so a presentation without one serializes exactly as before.
// `defaultMediaMode` is the menu-wide display of article media, at most this
// much: "image" shows each article as it is set (photo, else its icon),
// "icon" turns photos into icons, "none" shows text only (master §7.4).

export type MenuLayout = "flow" | "categories" | "compact";
export type MenuDensity = "airy" | "standard" | "dense";
export type MenuEmphasis = "calm" | "bold";
export type MenuMediaMode = "image" | "icon" | "none";
export type MenuBranding = "standard" | "reduced";

export type MenuPresentationValues = {
  layout: MenuLayout;
  /** K17: a Premium variant of the layout; absent = none. */
  layoutVariant?: string;
  paletteId: string;
  /** Up to three brand colours (hex); null = none. */
  brandColors: string[] | null;
  fontPairId: string;
  density: MenuDensity;
  emphasis: MenuEmphasis;
  defaultMediaMode: MenuMediaMode;
  /** Search and filters show only when the venue turns them on (master §7.2). */
  search: boolean;
  /** Filter codes; never a price range (master §7.2, §20). */
  filters: string[];
  /** The informative EUR switch (master §5.3; shown only with a fresh rate, K14). */
  currencyToggle: boolean;
  branding: MenuBranding;
};

export const MENU_DEFAULT_PRESENTATION: MenuPresentationValues = {
  layout: "flow",
  paletteId: "default",
  brandColors: null,
  fontPairId: "default",
  density: "standard",
  emphasis: "calm",
  // K17: no menu-wide limit (every article as it is set), as the K13 renderer showed it.
  defaultMediaMode: "image",
  search: false,
  filters: [],
  currencyToggle: false,
  branding: "standard",
};
