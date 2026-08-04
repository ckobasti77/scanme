import {
  SCANME_LINKS_PRESET_KEYS,
  type ScanMeLinksBackgroundV2,
  type ScanMeLinksColorsV2,
  type ScanMeLinksDesignV2,
  type ScanMeLinksPresetKey,
} from "./scanme-links-design";

/**
 * A variation is a named colour/background swap inside a preset. It carries no
 * layout of its own: every variation of a preset renders the exact same markup
 * and the same CSS classes, and only moves the custom-property values the
 * template already reads.
 */
export type ScanMeLinksVariation = {
  key: string;
  label: string;
  colors: ScanMeLinksColorsV2;
  background: ScanMeLinksBackgroundV2;
  /** Only set when the variation intentionally departs from the preset default. */
  typography?: Partial<
    Pick<ScanMeLinksDesignV2["typography"], "fontKey" | "headingWeight">
  >;
  buttons?: Partial<Pick<ScanMeLinksDesignV2["buttons"], "variant">>;
  /** Three-stop preview used by the editor's variation cards. */
  swatch: readonly [string, string, string];
};

const NUDE_EDITORIAL: readonly ScanMeLinksVariation[] = [
  {
    key: "nude-editorial-1",
    label: "Ivory",
    swatch: ["#F6F0E8", "#FFFFFF", "#B99A80"],
    background: { category: "flat", color: "#F6F0E8" },
    colors: {
      page: "#F6F0E8",
      surface: "#FFFFFF",
      title: "#2E2823",
      body: "#6B615A",
      accent: "#B99A80",
      border: "#E7DACC",
      focus: "#8C7357",
      button: "#FFFFFF",
      buttonHover: "#FBF6F0",
      buttonText: "#2E2823",
      icon: "#4A4038",
    },
  },
  {
    key: "nude-editorial-2",
    label: "Sage",
    swatch: ["#829690", "#FFFFFF", "#35403D"],
    background: { category: "flat", color: "#829690" },
    colors: {
      page: "#829690",
      surface: "#FFFFFF",
      title: "#FFFFFF",
      // Matches the reference, where title and subtitle share one white.
      body: "#FFFFFF",
      accent: "#FFFFFF",
      border: "#FFFFFF",
      focus: "#FFFFFF",
      button: "#FFFFFF",
      buttonHover: "#F4F8F7",
      buttonText: "#35403D",
      icon: "#4C5A56",
    },
  },
  {
    key: "nude-editorial-3",
    label: "Paper",
    swatch: ["#FFFFFF", "#ECECEC", "#1A1A1A"],
    background: { category: "flat", color: "#FFFFFF" },
    colors: {
      page: "#FFFFFF",
      surface: "#F2F2F2",
      title: "#111111",
      body: "#55555A",
      accent: "#9B9B9B",
      border: "#DEDEDE",
      focus: "#6E6E6E",
      button: "#ECECEC",
      buttonHover: "#E3E3E3",
      buttonText: "#1A1A1A",
      icon: "#1A1A1A",
    },
  },
  {
    key: "nude-editorial-4",
    label: "Camel",
    swatch: ["#DDB98C", "#6B4A2F", "#F6EADA"],
    background: { category: "flat", color: "#DDB98C" },
    colors: {
      page: "#DDB98C",
      surface: "#EFD6B6",
      title: "#3A2A1C",
      body: "#5A4433",
      accent: "#6B4A2F",
      border: "#B98F63",
      focus: "#4A3220",
      button: "#6B4A2F",
      buttonHover: "#5C3F27",
      buttonText: "#F6EADA",
      icon: "#F6EADA",
    },
  },
];

const URBAN_POP: readonly ScanMeLinksVariation[] = [
  {
    key: "urban-pop-1",
    label: "Blaze",
    swatch: ["#F02D1E", "#FBA61C", "#111111"],
    background: {
      category: "gradient",
      variant: "linear",
      startColor: "#F02D1E",
      endColor: "#FBA61C",
      angle: 168,
      centerX: 50,
      centerY: 50,
    },
    colors: {
      page: "#F02D1E",
      surface: "#FFFFFF",
      title: "#FFFFFF",
      body: "#FFE6DC",
      accent: "#111111",
      border: "#111111",
      focus: "#111111",
      button: "#FFFFFF",
      buttonHover: "#F1F1F1",
      buttonText: "#111111",
      icon: "#111111",
    },
  },
  {
    key: "urban-pop-2",
    label: "Neon",
    swatch: ["#A02BF5", "#3FE0C8", "#111111"],
    background: {
      category: "gradient",
      variant: "linear",
      startColor: "#A02BF5",
      endColor: "#3FE0C8",
      angle: 162,
      centerX: 50,
      centerY: 50,
    },
    colors: {
      page: "#A02BF5",
      surface: "#FFFFFF",
      title: "#34E7CF",
      body: "#FFFFFF",
      accent: "#111111",
      border: "#111111",
      focus: "#111111",
      button: "#FFFFFF",
      buttonHover: "#F1F1F1",
      buttonText: "#111111",
      icon: "#111111",
    },
  },
  {
    key: "urban-pop-3",
    label: "Midnight",
    swatch: ["#2B302E", "#B4F03C", "#FFFFFF"],
    background: { category: "flat", color: "#2B302E" },
    colors: {
      page: "#2B302E",
      surface: "#FFFFFF",
      title: "#B4F03C",
      body: "#D6D9D4",
      accent: "#111111",
      border: "#111111",
      focus: "#B4F03C",
      button: "#FFFFFF",
      buttonHover: "#F1F1F1",
      buttonText: "#111111",
      icon: "#111111",
    },
  },
  {
    key: "urban-pop-4",
    label: "Comic",
    swatch: ["#FFC91F", "#F5A300", "#111111"],
    background: {
      category: "pattern",
      variant: "dots",
      backgroundColor: "#FFC91F",
      patternColor: "#F0A000",
      scale: 16,
      opacity: 0.55,
    },
    colors: {
      page: "#FFC91F",
      surface: "#FFFFFF",
      title: "#FFFFFF",
      body: "#4A3800",
      accent: "#111111",
      border: "#111111",
      focus: "#111111",
      button: "#FFFFFF",
      buttonHover: "#F1F1F1",
      buttonText: "#111111",
      icon: "#111111",
    },
  },
];

const ARTISAN_CRAFT: readonly ScanMeLinksVariation[] = [
  {
    key: "artisan-craft-1",
    label: "Aged Paper",
    swatch: ["#EFE0C4", "#A87C52", "#6B3F1D"],
    background: {
      category: "texture",
      variant: "paper",
      backgroundColor: "#EFE0C4",
      tintColor: "#AE8B58",
      intensity: 0.8,
    },
    colors: {
      page: "#EFE0C4",
      surface: "#F7EEDD",
      title: "#6B3F1D",
      body: "#7A5C3E",
      accent: "#8A5A3B",
      border: "#C9A87C",
      focus: "#6B4325",
      button: "#90663C",
      buttonHover: "#7F562F",
      buttonText: "#FBF3E6",
      icon: "#FBF3E6",
    },
  },
  {
    key: "artisan-craft-2",
    label: "Navy Plaster",
    swatch: ["#24374F", "#A87C52", "#F3E7D2"],
    background: {
      category: "texture",
      variant: "linen",
      backgroundColor: "#24374F",
      tintColor: "#4A6484",
      intensity: 0.5,
    },
    colors: {
      page: "#24374F",
      surface: "#33496380",
      title: "#F3E7D2",
      body: "#D3C3A6",
      accent: "#C9A87C",
      border: "#8A6B49",
      focus: "#E0C79C",
      button: "#90663C",
      buttonHover: "#7F562F",
      buttonText: "#FBF3E6",
      icon: "#FBF3E6",
    },
  },
  {
    key: "artisan-craft-3",
    label: "Cream",
    swatch: ["#F5E6C8", "#8A5A3B", "#6B3F1D"],
    background: { category: "flat", color: "#F5E6C8" },
    colors: {
      page: "#F5E6C8",
      surface: "#FBF3E1",
      title: "#6B3F1D",
      body: "#7A5C3E",
      accent: "#8A5A3B",
      border: "#C9A87C",
      focus: "#6B4325",
      button: "#8A5A3B",
      buttonHover: "#794E32",
      buttonText: "#FBF3E6",
      icon: "#FBF3E6",
    },
  },
  {
    key: "artisan-craft-4",
    label: "Dark Wood",
    swatch: ["#2E1E13", "#8A2E22", "#E8D5A9"],
    background: {
      category: "texture",
      variant: "wood",
      backgroundColor: "#2E1E13",
      tintColor: "#6B4A2E",
      intensity: 0.9,
    },
    colors: {
      page: "#2E1E13",
      surface: "#43301F",
      title: "#E8D5A9",
      body: "#C0A47A",
      accent: "#C9A87C",
      border: "#6B4A2E",
      focus: "#E0C79C",
      button: "#8A2E22",
      buttonHover: "#77281D",
      buttonText: "#F6E3C8",
      icon: "#F6E3C8",
    },
  },
];

const GLASS_MINIMALIST: readonly ScanMeLinksVariation[] = [
  {
    key: "glass-minimalist-1",
    label: "Deep Teal",
    swatch: ["#1E6B72", "#0A1E2A", "#FFFFFF"],
    background: {
      category: "gradient",
      variant: "radial",
      startColor: "#1E6B72",
      endColor: "#0A1E2A",
      angle: 135,
      centerX: 42,
      centerY: 34,
    },
    colors: {
      page: "#0A1E2A",
      surface: "#2E6F78",
      title: "#FFFFFF",
      body: "#CFE3E6",
      accent: "#7FB6C4",
      border: "#FFFFFF",
      focus: "#9FD3E0",
      button: "#FFFFFF",
      buttonHover: "#FFFFFF",
      buttonText: "#FFFFFF",
      icon: "#FFFFFF",
    },
  },
  {
    key: "glass-minimalist-2",
    label: "Slate",
    swatch: ["#5B7486", "#1E2428", "#DCEBF5"],
    background: {
      category: "gradient",
      variant: "linear",
      startColor: "#5B7486",
      endColor: "#1E2428",
      angle: 168,
      centerX: 50,
      centerY: 50,
    },
    colors: {
      page: "#1E2428",
      surface: "#596B76",
      title: "#DCEBF5",
      body: "#C0CFD8",
      accent: "#9BB6C6",
      border: "#FFFFFF",
      focus: "#CFE2ED",
      button: "#FFFFFF",
      buttonHover: "#FFFFFF",
      buttonText: "#FFFFFF",
      icon: "#FFFFFF",
    },
  },
  {
    key: "glass-minimalist-3",
    label: "Blanc",
    swatch: ["#FFFFFF", "#F2F2F2", "#111111"],
    background: { category: "flat", color: "#FFFFFF" },
    colors: {
      page: "#FFFFFF",
      surface: "#F0F0F0",
      title: "#111111",
      body: "#4A4A4A",
      accent: "#8A8A8A",
      border: "#E0E0E0",
      focus: "#6E6E6E",
      button: "#FFFFFF",
      buttonHover: "#FFFFFF",
      buttonText: "#1A1A1A",
      icon: "#111111",
    },
  },
  {
    key: "glass-minimalist-4",
    label: "Gold",
    swatch: ["#A46F00", "#6B4A12", "#FFF6E0"],
    // The reference sets this variation in a serif; the others stay geometric.
    typography: { fontKey: "cormorant-garamond" },
    background: {
      category: "gradient",
      variant: "linear",
      startColor: "#A46F00",
      endColor: "#6B4A12",
      angle: 152,
      centerX: 50,
      centerY: 50,
    },
    colors: {
      page: "#6B4A12",
      surface: "#8A6420",
      title: "#FFF6E0",
      body: "#EAD8AC",
      accent: "#E8C46A",
      border: "#FFFFFF",
      focus: "#F2DCA6",
      button: "#FFFFFF",
      buttonHover: "#FFFFFF",
      buttonText: "#FFF6E0",
      icon: "#FFF6E0",
    },
  },
];

export const SCANME_LINKS_VARIATIONS: Record<
  ScanMeLinksPresetKey,
  readonly ScanMeLinksVariation[]
> = {
  gentle: [],
  ios: [],
  lux: [],
  rustic: [],
  minimal: [],
  bold: [],
  "nude-editorial": NUDE_EDITORIAL,
  "urban-pop": URBAN_POP,
  "artisan-craft": ARTISAN_CRAFT,
  "glass-minimalist": GLASS_MINIMALIST,
};

export function variationsForPreset(presetKey: ScanMeLinksPresetKey) {
  return SCANME_LINKS_VARIATIONS[presetKey];
}

export function findVariation(
  presetKey: ScanMeLinksPresetKey,
  variationKey: string | undefined,
): ScanMeLinksVariation | null {
  if (!variationKey) return null;
  return (
    SCANME_LINKS_VARIATIONS[presetKey].find(
      (variation) => variation.key === variationKey,
    ) ?? null
  );
}

/**
 * Returns `design` with the variation's tokens applied. Everything the
 * variation does not name — button geometry, spacing, shadows, alignment —
 * is left exactly as the caller had it, so a user who tuned the radius keeps
 * that radius when switching colours.
 */
export function applyVariation(
  design: ScanMeLinksDesignV2,
  variation: ScanMeLinksVariation,
): ScanMeLinksDesignV2 {
  return {
    ...design,
    variationKey: variation.key,
    colors: { ...variation.colors },
    background: { ...variation.background },
    buttons: { ...design.buttons, ...variation.buttons },
    typography: { ...design.typography, ...variation.typography },
  };
}

export const ALL_VARIATION_KEYS = SCANME_LINKS_PRESET_KEYS.flatMap((presetKey) =>
  SCANME_LINKS_VARIATIONS[presetKey].map((variation) => variation.key),
);
