export const SCANME_LINKS_PRESET_KEYS = [
  "gentle",
  "ios",
  "lux",
  "rustic",
  "minimal",
  "bold",
  "nude-editorial",
  "urban-pop",
  "artisan-craft",
  "glass-minimalist",
  "wanderlust",
  "bistro",
  "bloom",
  "chicken",
  "pulse",
] as const;

export type ScanMeLinksPresetKey = (typeof SCANME_LINKS_PRESET_KEYS)[number];

/**
 * Where the destination icon sits relative to its button.
 *
 * `float-icon` is the original Option 2 treatment: a large circle that
 * overhangs the button's left edge. `inline-icon` keeps a compact tile inside
 * the button, which is what the four editorial presets are drawn around.
 */
export const SCANME_LINKS_LAYOUTS = ["float-icon", "inline-icon"] as const;
export type ScanMeLinksLayout = (typeof SCANME_LINKS_LAYOUTS)[number];

const PRESET_LAYOUTS: Record<ScanMeLinksPresetKey, ScanMeLinksLayout> = {
  gentle: "float-icon",
  ios: "float-icon",
  lux: "float-icon",
  rustic: "float-icon",
  minimal: "float-icon",
  bold: "float-icon",
  "nude-editorial": "inline-icon",
  "urban-pop": "inline-icon",
  "artisan-craft": "inline-icon",
  "glass-minimalist": "inline-icon",
  wanderlust: "inline-icon",
  bistro: "inline-icon",
  bloom: "inline-icon",
  chicken: "inline-icon",
  pulse: "inline-icon",
};

export function layoutForPreset(
  presetKey: ScanMeLinksPresetKey,
): ScanMeLinksLayout {
  return PRESET_LAYOUTS[presetKey];
}

/**
 * The rendering treatment applied to a template's icons. All three are strictly
 * monochrome (driven by `--links-icon`); they never introduce a second hue.
 *
 * `line` is the minimalist outline default. `solid` fills/thickens the glyph for
 * heavier templates. `soft-3d` extrudes a darker shade of the same colour under
 * the glyph and casts a soft shadow — depth from one hue, not colour.
 */
export const SCANME_LINKS_ICON_PACKAGES = [
  "line",
  "solid",
  "soft-3d",
] as const;
export type ScanMeLinksIconPackage =
  (typeof SCANME_LINKS_ICON_PACKAGES)[number];

const PRESET_ICON_PACKAGES: Record<
  ScanMeLinksPresetKey,
  ScanMeLinksIconPackage
> = {
  gentle: "line",
  ios: "line",
  lux: "line",
  rustic: "line",
  minimal: "line",
  bold: "solid",
  "nude-editorial": "line",
  "urban-pop": "soft-3d",
  "artisan-craft": "line",
  "glass-minimalist": "soft-3d",
  wanderlust: "line",
  bistro: "line",
  bloom: "line",
  chicken: "solid",
  pulse: "line",
};

export function iconPackageForPreset(
  presetKey: ScanMeLinksPresetKey,
): ScanMeLinksIconPackage {
  return PRESET_ICON_PACKAGES[presetKey];
}

export const SCANME_LINKS_BACKGROUND_CATEGORIES = [
  "flat",
  "gradient",
  "pattern",
  "texture",
  "media",
  "animation",
] as const;

export type ScanMeLinksBackgroundCategory =
  (typeof SCANME_LINKS_BACKGROUND_CATEGORIES)[number];

export const SCANME_LINKS_GRADIENT_VARIANTS = ["linear", "radial"] as const;
export type ScanMeLinksGradientVariant =
  (typeof SCANME_LINKS_GRADIENT_VARIANTS)[number];

export const SCANME_LINKS_PATTERN_VARIANTS = [
  "grid",
  "checker",
  "dots",
  "waves",
] as const;
export type ScanMeLinksPatternVariant =
  (typeof SCANME_LINKS_PATTERN_VARIANTS)[number];

export const SCANME_LINKS_TEXTURE_VARIANTS = [
  "paper",
  "linen",
  "wood",
  "metal",
] as const;
export type ScanMeLinksTextureVariant =
  (typeof SCANME_LINKS_TEXTURE_VARIANTS)[number];

export const SCANME_LINKS_MEDIA_TYPES = ["image", "video"] as const;
export type ScanMeLinksMediaType = (typeof SCANME_LINKS_MEDIA_TYPES)[number];

export const SCANME_LINKS_BACKGROUND_ANIMATIONS = [
  "aurora",
  "soft-waves",
] as const;
export type ScanMeLinksBackgroundAnimation =
  (typeof SCANME_LINKS_BACKGROUND_ANIMATIONS)[number];

export const SCANME_LINKS_BUTTON_VARIANTS = [
  "solid",
  "outline",
  "glass",
] as const;
export type ScanMeLinksButtonVariant =
  (typeof SCANME_LINKS_BUTTON_VARIANTS)[number];

export const SCANME_LINKS_BUTTON_ANIMATIONS = [
  "none",
  "stroke",
  "liquid-metal",
] as const;
export type ScanMeLinksButtonAnimation =
  (typeof SCANME_LINKS_BUTTON_ANIMATIONS)[number];

export const SCANME_LINKS_FONT_KEYS = [
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
export type ScanMeLinksFontKey = (typeof SCANME_LINKS_FONT_KEYS)[number];

export const SCANME_LINKS_ICON_STYLES = [
  "soft-line",
  "ios-rounded",
  "luxury-line",
  "rustic-stamp",
  "minimal-line",
  "bold-fill",
  "editorial-outline",
  "pop-sticker",
  "craft-badge",
  "glass-tile",
  "wanderlust-glow",
  "bistro-seal",
  "bloom-soft",
  "chicken-comic",
  "pulse-neon",
] as const;
export type ScanMeLinksIconStyle =
  (typeof SCANME_LINKS_ICON_STYLES)[number];

export type ScanMeLinksColorsV2 = {
  page: string;
  surface: string;
  title: string;
  body: string;
  accent: string;
  border: string;
  focus: string;
  button: string;
  buttonHover: string;
  buttonText: string;
  icon: string;
};

export type ScanMeLinksBackgroundV2 =
  | {
      category: "flat";
      color: string;
    }
  | {
      category: "gradient";
      variant: ScanMeLinksGradientVariant;
      startColor: string;
      endColor: string;
      angle: number;
      centerX: number;
      centerY: number;
    }
  | {
      category: "pattern";
      variant: ScanMeLinksPatternVariant;
      backgroundColor: string;
      patternColor: string;
      scale: number;
      opacity: number;
    }
  | {
      category: "texture";
      variant: ScanMeLinksTextureVariant;
      backgroundColor: string;
      tintColor: string;
      intensity: number;
    }
  | {
      category: "media";
      mediaType: ScanMeLinksMediaType;
      fit: "cover" | "contain";
      zoom: number;
      positionX: number;
      positionY: number;
      overlayColor: string;
      overlayOpacity: number;
    }
  | {
      category: "animation";
      variant: ScanMeLinksBackgroundAnimation;
      baseColor: string;
      accentColor: string;
      speed: number;
      intensity: number;
    };

export type ScanMeLinksShadowV2 = {
  enabled: boolean;
  color: string;
  x: number;
  y: number;
  blur: number;
  opacity: number;
};

export type ScanMeLinksDesignV2 = {
  version: 2;
  presetKey: ScanMeLinksPresetKey;
  /**
   * Which colour variation of `presetKey` is active. The variation's tokens are
   * already flattened into `colors`/`background`, so this only drives editor
   * affordances; `undefined` means the palette was hand-edited.
   */
  variationKey?: string;
  autoContrast: boolean;
  background: ScanMeLinksBackgroundV2;
  colors: ScanMeLinksColorsV2;
  buttons: {
    variant: ScanMeLinksButtonVariant;
    radius: number;
    borderWidth: number;
    paddingX: number;
    paddingY: number;
    shadow: ScanMeLinksShadowV2;
    animation: ScanMeLinksButtonAnimation;
  };
  effects: {
    // Global text shadow, applied to any text element without its own override.
    textShadow: ScanMeLinksShadowV2;
    // Optional per-element overrides. When present they replace the global shadow for
    // that element only; when absent the element inherits `textShadow`.
    titleShadow?: ScanMeLinksShadowV2;
    descriptionShadow?: ScanMeLinksShadowV2;
    buttonTextShadow?: ScanMeLinksShadowV2;
    logoShadow: ScanMeLinksShadowV2;
  };
  typography: {
    fontKey: ScanMeLinksFontKey;
    headingWeight: 400 | 500 | 600 | 700;
    bodyWeight: 400 | 500 | 600 | 700;
    alignment: "left" | "center" | "right";
    scale: "small" | "medium" | "large";
    lineHeight: number;
    verticalSpacing: number;
  };
  iconStyle: ScanMeLinksIconStyle;
};

export type ScanMeLinksDesignV2Input = Omit<ScanMeLinksDesignV2, "effects"> & {
  effects?: ScanMeLinksDesignV2["effects"];
};

type ScanMeLinksBackgroundVariantMap = {
  flat: readonly ["flat"];
  gradient: readonly ScanMeLinksGradientVariant[];
  pattern: readonly ScanMeLinksPatternVariant[];
  texture: readonly ScanMeLinksTextureVariant[];
  media: readonly ScanMeLinksMediaType[];
  animation: readonly ScanMeLinksBackgroundAnimation[];
};

export type ScanMeLinksPresetCapabilities = {
  key: ScanMeLinksPresetKey;
  label: string;
  description: string;
  tier: "basic" | "premium";
  preview: {
    background: string;
    surface: string;
    accent: string;
    text: string;
  };
  allowedBackgroundCategories: readonly ScanMeLinksBackgroundCategory[];
  allowedBackgroundVariants: Partial<ScanMeLinksBackgroundVariantMap>;
  allowedButtonVariants: readonly ScanMeLinksButtonVariant[];
  fonts: readonly ScanMeLinksFontKey[];
  iconStyle: ScanMeLinksIconStyle;
  recommendedBackgroundCategory: ScanMeLinksBackgroundCategory;
};

export const SCANME_LINKS_PRESET_CAPABILITIES: Record<
  ScanMeLinksPresetKey,
  ScanMeLinksPresetCapabilities
> = {
  gentle: {
    key: "gentle",
    label: "Gentle",
    description: "Meke površine i miran, prijateljski ritam.",
    tier: "basic",
    preview: {
      background: "#F7F1EA",
      surface: "#FFFDFC",
      accent: "#D98B79",
      text: "#27231F",
    },
    allowedBackgroundCategories: ["flat", "gradient", "pattern", "media"],
    allowedBackgroundVariants: {
      flat: ["flat"],
      gradient: ["linear", "radial"],
      pattern: ["dots", "waves"],
      media: ["image", "video"],
    },
    allowedButtonVariants: ["solid", "outline"],
    fonts: ["dm-sans", "nunito-sans", "source-sans-3"],
    iconStyle: "soft-line",
    recommendedBackgroundCategory: "flat",
  },
  ios: {
    key: "ios",
    label: "iOS",
    description: "Čiste sistemske forme i diskretne staklaste površine.",
    tier: "basic",
    preview: {
      background: "#EAF1FF",
      surface: "#FFFFFFCC",
      accent: "#4C7DFF",
      text: "#111827",
    },
    allowedBackgroundCategories: [
      "flat",
      "gradient",
      "media",
      "animation",
    ],
    allowedBackgroundVariants: {
      flat: ["flat"],
      gradient: ["linear", "radial"],
      media: ["image", "video"],
      animation: ["aurora", "soft-waves"],
    },
    allowedButtonVariants: ["solid", "outline", "glass"],
    fonts: ["system-ui", "inter", "manrope"],
    iconStyle: "ios-rounded",
    recommendedBackgroundCategory: "gradient",
  },
  lux: {
    key: "lux",
    label: "Lux",
    description: "Elegantna tipografija, duboki tonovi i precizni detalji.",
    tier: "basic",
    preview: {
      background: "#171717",
      surface: "#292724",
      accent: "#C8A96B",
      text: "#F8F4EC",
    },
    allowedBackgroundCategories: ["flat", "gradient", "texture", "media"],
    allowedBackgroundVariants: {
      flat: ["flat"],
      gradient: ["linear", "radial"],
      texture: ["linen", "metal"],
      media: ["image", "video"],
    },
    allowedButtonVariants: ["solid", "outline"],
    fonts: ["cormorant-garamond", "playfair-display", "lora"],
    iconStyle: "luxury-line",
    recommendedBackgroundCategory: "texture",
  },
  rustic: {
    key: "rustic",
    label: "Rustic",
    description: "Topli prirodni materijali i taktilni detalji.",
    tier: "basic",
    preview: {
      background: "#E7D2B8",
      surface: "#F8EEDF",
      accent: "#8A4F32",
      text: "#33241A",
    },
    allowedBackgroundCategories: ["flat", "pattern", "texture", "media"],
    allowedBackgroundVariants: {
      flat: ["flat"],
      pattern: ["grid", "checker", "dots"],
      texture: ["paper", "linen", "wood"],
      media: ["image"],
    },
    allowedButtonVariants: ["solid", "outline"],
    fonts: ["lora", "libre-baskerville", "source-sans-3"],
    iconStyle: "rustic-stamp",
    recommendedBackgroundCategory: "texture",
  },
  minimal: {
    key: "minimal",
    label: "Minimal",
    description: "Neutralan sistem sa jasnom hijerarhijom i više prostora.",
    tier: "basic",
    preview: {
      background: "#F4F5F7",
      surface: "#FFFFFF",
      accent: "#292D32",
      text: "#15171A",
    },
    allowedBackgroundCategories: ["flat", "gradient", "pattern", "media"],
    allowedBackgroundVariants: {
      flat: ["flat"],
      gradient: ["linear", "radial"],
      pattern: ["grid", "dots"],
      media: ["image", "video"],
    },
    allowedButtonVariants: ["solid", "outline"],
    fonts: ["inter", "manrope", "dm-sans"],
    iconStyle: "minimal-line",
    recommendedBackgroundCategory: "flat",
  },
  bold: {
    key: "bold",
    label: "Bold",
    description: "Snažan kontrast, krupne forme i izražena akcentna boja.",
    tier: "basic",
    preview: {
      background: "#4B3EFF",
      surface: "#15111F",
      accent: "#C6FF4A",
      text: "#FFFFFF",
    },
    allowedBackgroundCategories: [
      "flat",
      "gradient",
      "pattern",
      "media",
      "animation",
    ],
    allowedBackgroundVariants: {
      flat: ["flat"],
      gradient: ["linear", "radial"],
      pattern: ["checker", "waves"],
      media: ["image", "video"],
      animation: ["aurora", "soft-waves"],
    },
    allowedButtonVariants: ["solid", "outline"],
    fonts: ["space-grotesk", "archivo", "inter"],
    iconStyle: "bold-fill",
    recommendedBackgroundCategory: "gradient",
  },
  "nude-editorial": {
    key: "nude-editorial",
    label: "Nude Editorial",
    description: "Mirni nude tonovi, serif naslov i tanke pill forme.",
    tier: "basic",
    preview: {
      background: "#F5EFE7",
      surface: "#FFFFFF",
      accent: "#B99A80",
      text: "#2E2823",
    },
    allowedBackgroundCategories: ["flat", "gradient", "texture", "media"],
    allowedBackgroundVariants: {
      flat: ["flat"],
      gradient: ["linear", "radial"],
      texture: ["paper", "linen"],
      media: ["image", "video"],
    },
    allowedButtonVariants: ["solid", "outline"],
    fonts: ["cormorant-garamond", "playfair-display", "lora"],
    iconStyle: "editorial-outline",
    recommendedBackgroundCategory: "flat",
  },
  "urban-pop": {
    key: "urban-pop",
    label: "Urban Pop",
    description: "Debeo crni okvir, tvrda senka i krupna verzalna tipografija.",
    tier: "basic",
    preview: {
      background: "#E8402A",
      surface: "#FFFFFF",
      accent: "#111111",
      text: "#FFFFFF",
    },
    allowedBackgroundCategories: [
      "flat",
      "gradient",
      "pattern",
      "media",
      "animation",
    ],
    allowedBackgroundVariants: {
      flat: ["flat"],
      gradient: ["linear", "radial"],
      pattern: ["dots", "checker", "waves"],
      media: ["image", "video"],
      animation: ["aurora", "soft-waves"],
    },
    allowedButtonVariants: ["solid", "outline"],
    fonts: ["archivo", "space-grotesk", "inter"],
    iconStyle: "pop-sticker",
    recommendedBackgroundCategory: "gradient",
  },
  "artisan-craft": {
    key: "artisan-craft",
    label: "Artisan Craft",
    description: "Papir i drvo, topli zanatski tonovi i serif naslov.",
    tier: "basic",
    preview: {
      background: "#EFE3CC",
      surface: "#F7EEDD",
      accent: "#8A5A3B",
      text: "#4A2F1B",
    },
    allowedBackgroundCategories: ["flat", "pattern", "texture", "media"],
    allowedBackgroundVariants: {
      flat: ["flat"],
      pattern: ["grid", "dots"],
      texture: ["paper", "linen", "wood"],
      media: ["image", "video"],
    },
    allowedButtonVariants: ["solid", "outline"],
    fonts: ["lora", "libre-baskerville", "source-sans-3"],
    iconStyle: "craft-badge",
    recommendedBackgroundCategory: "texture",
  },
  "glass-minimalist": {
    key: "glass-minimalist",
    label: "Glass Minimalist",
    description: "Zamućeno staklo, tanak svetli rub i vazdušasti naslov.",
    tier: "basic",
    preview: {
      background: "#123038",
      surface: "#FFFFFF",
      accent: "#7FB6C4",
      text: "#FFFFFF",
    },
    allowedBackgroundCategories: [
      "flat",
      "gradient",
      "texture",
      "media",
      "animation",
    ],
    allowedBackgroundVariants: {
      flat: ["flat"],
      gradient: ["linear", "radial"],
      texture: ["metal", "linen"],
      media: ["image", "video"],
      animation: ["aurora", "soft-waves"],
    },
    allowedButtonVariants: ["glass", "solid", "outline"],
    fonts: ["manrope", "inter", "cormorant-garamond"],
    iconStyle: "glass-tile",
    recommendedBackgroundCategory: "gradient",
  },
  wanderlust: {
    key: "wanderlust",
    label: "Wanderlust",
    description: "Tamna aurora pozadina, tirkizni neonski sjaj i beli kružni bedževi.",
    tier: "premium",
    preview: {
      background: "#081318",
      surface: "rgba(16, 32, 40, 0.75)",
      accent: "#4ED8C7",
      text: "#FFFFFF",
    },
    allowedBackgroundCategories: [
      "media",
      "animation",
      "gradient",
      "flat",
    ],
    allowedBackgroundVariants: {
      media: ["image", "video"],
      animation: ["aurora", "soft-waves"],
      gradient: ["linear", "radial"],
      flat: ["flat"],
    },
    allowedButtonVariants: ["glass", "solid", "outline"],
    fonts: ["dm-sans", "inter", "manrope", "nunito-sans"],
    iconStyle: "wanderlust-glow",
    recommendedBackgroundCategory: "media",
  },
  bistro: {
    key: "bistro",
    label: "Bistro",
    description: "Rustično tamno drvo, ovalna dugmad boje terakote sa duplim zlatnim rubom.",
    tier: "premium",
    preview: {
      background: "#1C0D08",
      surface: "#522216",
      accent: "#E0B27E",
      text: "#F7E6D0",
    },
    allowedBackgroundCategories: [
      "media",
      "texture",
      "flat",
      "gradient",
    ],
    allowedBackgroundVariants: {
      media: ["image", "video"],
      texture: ["wood", "paper", "linen"],
      flat: ["flat"],
      gradient: ["linear", "radial"],
    },
    allowedButtonVariants: ["glass", "solid", "outline"],
    fonts: ["cormorant-garamond", "playfair-display", "lora", "libre-baskerville"],
    iconStyle: "bistro-seal",
    recommendedBackgroundCategory: "media",
  },
  bloom: {
    key: "bloom",
    label: "Bloom",
    description: "Pastelni prelaz zalaska sunca, lebdeće snežno-bele kartice sa mekom senkom.",
    tier: "premium",
    preview: {
      background: "#DEC2DB",
      surface: "#FFFFFF",
      accent: "#B65E7D",
      text: "#2D2430",
    },
    allowedBackgroundCategories: [
      "media",
      "gradient",
      "flat",
      "animation",
    ],
    allowedBackgroundVariants: {
      media: ["image", "video"],
      gradient: ["linear", "radial"],
      flat: ["flat"],
      animation: ["aurora", "soft-waves"],
    },
    allowedButtonVariants: ["solid", "glass", "outline"],
    fonts: ["dm-sans", "nunito-sans", "inter", "manrope"],
    iconStyle: "bloom-soft",
    recommendedBackgroundCategory: "media",
  },
  chicken: {
    key: "chicken",
    label: "Chicken",
    description: "Pop-art strip stil sa halftone tačkicama, nalepnice sa debelim 3D crnim rubom.",
    tier: "premium",
    preview: {
      background: "#F6C928",
      surface: "#FFFFFF",
      accent: "#298BE8",
      text: "#000000",
    },
    allowedBackgroundCategories: [
      "media",
      "pattern",
      "flat",
      "gradient",
    ],
    allowedBackgroundVariants: {
      media: ["image", "video"],
      pattern: ["dots", "checker", "waves"],
      flat: ["flat"],
      gradient: ["linear", "radial"],
    },
    allowedButtonVariants: ["solid", "outline"],
    fonts: ["archivo", "space-grotesk", "inter"],
    iconStyle: "chicken-comic",
    recommendedBackgroundCategory: "media",
  },
  pulse: {
    key: "pulse",
    label: "Pulse",
    description: "Cyberpunk noćni klub stil, kosi sci-fi uglovi i dvobojni neonski cijan-ciklama preliv.",
    tier: "premium",
    preview: {
      background: "#080B10",
      surface: "#101622",
      accent: "#00F0FF",
      text: "#FFFFFF",
    },
    allowedBackgroundCategories: [
      "media",
      "gradient",
      "animation",
      "flat",
    ],
    allowedBackgroundVariants: {
      media: ["image", "video"],
      gradient: ["linear", "radial"],
      animation: ["aurora", "soft-waves"],
      flat: ["flat"],
    },
    allowedButtonVariants: ["glass", "solid", "outline"],
    fonts: ["space-grotesk", "manrope", "inter", "archivo"],
    iconStyle: "pulse-neon",
    recommendedBackgroundCategory: "media",
  },
};

const PRESET_COLORS: Record<ScanMeLinksPresetKey, ScanMeLinksColorsV2> = {
  gentle: {
    page: "#F7F1EA",
    surface: "#FFFDFC",
    title: "#27231F",
    body: "#625B54",
    accent: "#D98B79",
    border: "#E8DCD2",
    focus: "#9F5E50",
    button: "#FFFDFC",
    buttonHover: "#F8ECE5",
    buttonText: "#27231F",
    icon: "#27231F",
  },
  ios: {
    page: "#EAF1FF",
    surface: "#FFFFFFCC",
    title: "#111827",
    body: "#526070",
    accent: "#4C7DFF",
    border: "#FFFFFF99",
    focus: "#2459D8",
    button: "#FFFFFFB8",
    buttonHover: "#FFFFFFD9",
    buttonText: "#111827",
    icon: "#2367ED",
  },
  lux: {
    page: "#171717",
    surface: "#292724",
    title: "#F8F4EC",
    body: "#C9C0B4",
    accent: "#C8A96B",
    border: "#5C5140",
    focus: "#E1C586",
    button: "#25231F",
    buttonHover: "#343028",
    buttonText: "#F8F4EC",
    icon: "#C8A96B",
  },
  rustic: {
    page: "#E7D2B8",
    surface: "#F8EEDF",
    title: "#33241A",
    body: "#6B503D",
    accent: "#8A4F32",
    border: "#C6A985",
    focus: "#673720",
    button: "#F4E5D2",
    buttonHover: "#EBD7BF",
    buttonText: "#33241A",
    icon: "#7B432A",
  },
  minimal: {
    page: "#F4F5F7",
    surface: "#FFFFFF",
    title: "#15171A",
    body: "#60656D",
    accent: "#292D32",
    border: "#DDE0E4",
    focus: "#17191C",
    button: "#FFFFFF",
    buttonHover: "#F0F1F3",
    buttonText: "#15171A",
    icon: "#292D32",
  },
  bold: {
    page: "#4B3EFF",
    surface: "#15111F",
    title: "#FFFFFF",
    body: "#E5E0FF",
    accent: "#C6FF4A",
    border: "#7D72FF",
    focus: "#C6FF4A",
    button: "#15111F",
    buttonHover: "#272038",
    buttonText: "#FFFFFF",
    icon: "#C6FF4A",
  },
  "nude-editorial": {
    page: "#F5EFE7",
    surface: "#FFFFFF",
    title: "#2E2823",
    body: "#6B615A",
    accent: "#B99A80",
    border: "#E2D6C9",
    focus: "#8C7357",
    button: "#FFFFFF",
    buttonHover: "#FBF6F0",
    buttonText: "#2E2823",
    icon: "#4A4038",
  },
  "urban-pop": {
    page: "#E8402A",
    surface: "#FFFFFF",
    title: "#FFFFFF",
    body: "#FFF1EC",
    accent: "#111111",
    border: "#111111",
    focus: "#111111",
    button: "#FFFFFF",
    buttonHover: "#F1F1F1",
    buttonText: "#111111",
    icon: "#111111",
  },
  "artisan-craft": {
    page: "#EFE3CC",
    surface: "#F7EEDD",
    title: "#4A2F1B",
    body: "#7A5C3E",
    accent: "#8A5A3B",
    border: "#C9A87C",
    focus: "#6B4325",
    button: "#A87C52",
    buttonHover: "#966C45",
    buttonText: "#FBF3E6",
    icon: "#FBF3E6",
  },
  "glass-minimalist": {
    page: "#123038",
    surface: "#FFFFFF",
    title: "#FFFFFF",
    body: "#D5E3E6",
    accent: "#7FB6C4",
    border: "#FFFFFF",
    focus: "#9FD3E0",
    button: "#FFFFFF",
    buttonHover: "#FFFFFF",
    buttonText: "#FFFFFF",
    icon: "#FFFFFF",
  },
  wanderlust: {
    page: "#070D12",
    surface: "#10222B",
    title: "#FFFFFF",
    body: "#4ED8C7",
    accent: "#4ED8C7",
    border: "#38C9B8",
    focus: "#4ED8C7",
    button: "rgba(14, 26, 33, 0.65)",
    buttonHover: "rgba(22, 38, 48, 0.78)",
    buttonText: "#FFFFFF",
    icon: "#14968B",
  },
  bistro: {
    page: "#140A06",
    surface: "#522216",
    title: "#F7E6D0",
    body: "#D4B18C",
    accent: "#E0B27E",
    border: "#C48D5E",
    focus: "#E0B27E",
    button: "#522216",
    buttonHover: "#662C1E",
    buttonText: "#FFFFFF",
    icon: "#E0B27E",
  },
  bloom: {
    page: "#E6D3DF",
    surface: "#FFFFFF",
    title: "#2D2430",
    body: "#6E6172",
    accent: "#B65E7D",
    border: "#F0E4EC",
    focus: "#B65E7D",
    button: "#FFFFFF",
    buttonHover: "#FAF5F8",
    buttonText: "#2D2430",
    icon: "#B65E7D",
  },
  chicken: {
    page: "#F6C928",
    surface: "#FFFFFF",
    title: "#FFFFFF",
    body: "#000000",
    accent: "#298BE8",
    border: "#000000",
    focus: "#298BE8",
    button: "#FFFFFF",
    buttonHover: "#F7F7F7",
    buttonText: "#000000",
    icon: "#000000",
  },
  pulse: {
    page: "#070A0F",
    surface: "#101622",
    title: "#FFFFFF",
    body: "#E040FB",
    accent: "#00F0FF",
    border: "#00F0FF",
    focus: "#00F0FF",
    button: "rgba(16, 22, 34, 0.85)",
    buttonHover: "rgba(24, 33, 50, 0.95)",
    buttonText: "#FFFFFF",
    icon: "#00F0FF",
  },
};

function defaultBackground(
  presetKey: ScanMeLinksPresetKey,
  category = SCANME_LINKS_PRESET_CAPABILITIES[presetKey]
    .recommendedBackgroundCategory,
): ScanMeLinksBackgroundV2 {
  const colors = PRESET_COLORS[presetKey];
  const variants =
    SCANME_LINKS_PRESET_CAPABILITIES[presetKey].allowedBackgroundVariants;

  switch (category) {
    case "gradient":
      return {
        category: "gradient",
        variant: variants.gradient?.[0] ?? "linear",
        startColor: colors.page,
        endColor: colors.accent,
        angle: 135,
        centerX: 50,
        centerY: 50,
      };
    case "pattern":
      return {
        category: "pattern",
        variant: variants.pattern?.[0] ?? "grid",
        backgroundColor: colors.page,
        patternColor: colors.accent,
        scale: 24,
        opacity: 0.18,
      };
    case "texture":
      return {
        category: "texture",
        variant: variants.texture?.[0] ?? "paper",
        backgroundColor: colors.page,
        tintColor: colors.accent,
        intensity: 0.2,
      };
    case "media":
      return {
        category: "media",
        mediaType: variants.media?.[0] ?? "image",
        fit: "cover",
        zoom: 1,
        positionX: 50,
        positionY: 50,
        overlayColor: colors.page,
        overlayOpacity: 0.12,
      };
    case "animation":
      return {
        category: "animation",
        variant: variants.animation?.[0] ?? "aurora",
        baseColor: colors.page,
        accentColor: colors.accent,
        speed: 1,
        intensity: 0.4,
      };
    case "flat":
    default:
      return {
        category: "flat",
        color: colors.page,
      };
  }
}

/**
 * Per-preset deviations from the shared defaults below. Only the four
 * editorial presets need entries; the original six keep the historic values by
 * having no entry at all.
 */
const PRESET_TUNING: Partial<
  Record<
    ScanMeLinksPresetKey,
    {
      borderWidth?: number;
      paddingX?: number;
      paddingY?: number;
      shadow?: Partial<ScanMeLinksShadowV2>;
      headingWeight?: ScanMeLinksDesignV2["typography"]["headingWeight"];
      bodyWeight?: ScanMeLinksDesignV2["typography"]["bodyWeight"];
      scale?: ScanMeLinksDesignV2["typography"]["scale"];
      lineHeight?: number;
      verticalSpacing?: number;
    }
  >
> = {
  "nude-editorial": {
    paddingX: 22,
    paddingY: 16,
    shadow: { color: "#2E2823", y: 6, blur: 18, opacity: 0.1 },
    headingWeight: 400,
    scale: "large",
    lineHeight: 1.35,
    verticalSpacing: 14,
  },
  "urban-pop": {
    borderWidth: 3,
    paddingX: 18,
    paddingY: 16,
    // A hard, un-blurred offset is what reads as a sticker rather than a card.
    shadow: { color: "#111111", x: 4, y: 4, blur: 0, opacity: 1 },
    headingWeight: 700,
    bodyWeight: 700,
    scale: "large",
    lineHeight: 1.25,
    verticalSpacing: 14,
  },
  "artisan-craft": {
    paddingY: 15,
    shadow: { color: "#3A2413", y: 6, blur: 16, opacity: 0.22 },
    headingWeight: 500,
    bodyWeight: 400,
    scale: "large",
    lineHeight: 1.35,
    verticalSpacing: 14,
  },
  "glass-minimalist": {
    paddingY: 16,
    shadow: { color: "#05161A", y: 10, blur: 30, opacity: 0.28 },
    headingWeight: 400,
    scale: "large",
    lineHeight: 1.3,
    verticalSpacing: 14,
  },
  wanderlust: {
    borderWidth: 1.5,
    paddingX: 18,
    paddingY: 14,
    shadow: { color: "#4ED8C7", x: 0, y: 0, blur: 20, opacity: 0.28 },
    headingWeight: 700,
    bodyWeight: 600,
    scale: "large",
    lineHeight: 1.3,
    verticalSpacing: 15,
  },
  bistro: {
    borderWidth: 1.5,
    paddingX: 18,
    paddingY: 14,
    shadow: { color: "#000000", y: 6, blur: 16, opacity: 0.35 },
    headingWeight: 600,
    bodyWeight: 400,
    scale: "large",
    lineHeight: 1.25,
    verticalSpacing: 15,
  },
  bloom: {
    borderWidth: 1,
    paddingX: 20,
    paddingY: 15,
    shadow: { color: "#8E5F7B", y: 12, blur: 28, opacity: 0.2 },
    headingWeight: 700,
    bodyWeight: 500,
    scale: "large",
    lineHeight: 1.25,
    verticalSpacing: 16,
  },
  chicken: {
    borderWidth: 3,
    paddingX: 18,
    paddingY: 14,
    shadow: { color: "#000000", x: 4, y: 5, blur: 0, opacity: 1 },
    headingWeight: 700,
    bodyWeight: 700,
    scale: "large",
    lineHeight: 1.15,
    verticalSpacing: 15,
  },
  pulse: {
    borderWidth: 1.5,
    paddingX: 18,
    paddingY: 14,
    shadow: { color: "#00F0FF", x: 0, y: 0, blur: 18, opacity: 0.35 },
    headingWeight: 700,
    bodyWeight: 700,
    scale: "large",
    lineHeight: 1.2,
    verticalSpacing: 15,
  },
};

function buildDefaultDesign(
  presetKey: ScanMeLinksPresetKey,
): ScanMeLinksDesignV2 {
  const capability = SCANME_LINKS_PRESET_CAPABILITIES[presetKey];
  const tuning = PRESET_TUNING[presetKey] ?? {};
  const radiusByPreset: Record<ScanMeLinksPresetKey, number> = {
    gentle: 26,
    ios: 28,
    lux: 12,
    rustic: 18,
    minimal: 16,
    bold: 18,
    "nude-editorial": 999,
    "urban-pop": 12,
    "artisan-craft": 16,
    "glass-minimalist": 16,
    wanderlust: 20,
    bistro: 999,
    bloom: 22,
    chicken: 18,
    pulse: 14,
  };

  return {
    version: 2,
    presetKey,
    variationKey: `${presetKey}-1`,
    autoContrast: true,
    background: defaultBackground(presetKey),
    colors: { ...PRESET_COLORS[presetKey] },
    buttons: {
      variant: presetKey === "ios" ? "glass" : capability.allowedButtonVariants[0],
      radius: radiusByPreset[presetKey],
      borderWidth: tuning.borderWidth ?? 1,
      paddingX: tuning.paddingX ?? 20,
      paddingY: tuning.paddingY ?? 14,
      shadow: {
        enabled: presetKey !== "minimal",
        color: "#161916",
        x: 0,
        y: 8,
        blur: 24,
        opacity: presetKey === "ios" ? 0.12 : 0.16,
        ...tuning.shadow,
      },
      animation: "none",
    },
    effects: {
      textShadow: {
        enabled: false,
        color: "#161916",
        x: 0,
        y: 2,
        blur: 8,
        opacity: 0.2,
      },
      logoShadow: {
        enabled: false,
        color: "#161916",
        x: 0,
        y: 6,
        blur: 18,
        opacity: 0.18,
      },
    },
    typography: {
      fontKey: capability.fonts[0],
      headingWeight:
        tuning.headingWeight ?? (presetKey === "lux" ? 500 : 600),
      bodyWeight: tuning.bodyWeight ?? 500,
      alignment: "center",
      scale: tuning.scale ?? "medium",
      lineHeight: tuning.lineHeight ?? 1.4,
      verticalSpacing: tuning.verticalSpacing ?? 16,
    },
    iconStyle: capability.iconStyle,
  };
}

export function isScanMeLinksPresetKey(
  value: unknown,
): value is ScanMeLinksPresetKey {
  return (
    typeof value === "string" &&
    (SCANME_LINKS_PRESET_KEYS as readonly string[]).includes(value)
  );
}

export function safeScanMeLinksPresetKey(
  value: unknown,
): ScanMeLinksPresetKey {
  return isScanMeLinksPresetKey(value) ? value : "gentle";
}

export function createDefaultScanMeLinksDesignV2(
  presetKey?: unknown,
): ScanMeLinksDesignV2 {
  return buildDefaultDesign(safeScanMeLinksPresetKey(presetKey));
}

export const SCANME_LINKS_DESIGN_DEFAULT_V2 =
  createDefaultScanMeLinksDesignV2();

export const DEFAULT_SCANME_LINKS_DESIGN_V2 =
  SCANME_LINKS_DESIGN_DEFAULT_V2;

function includesValue<T extends string>(
  values: readonly T[] | undefined,
  value: string,
): value is T {
  return Boolean(values?.includes(value as T));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : minimum;
}

function normalizeBackground(
  background: ScanMeLinksBackgroundV2,
  presetKey: ScanMeLinksPresetKey,
): ScanMeLinksBackgroundV2 {
  const capability = SCANME_LINKS_PRESET_CAPABILITIES[presetKey];

  if (!capability.allowedBackgroundCategories.includes(background.category)) {
    return defaultBackground(presetKey);
  }

  switch (background.category) {
    case "gradient":
      if (
        !includesValue(
          capability.allowedBackgroundVariants.gradient,
          background.variant,
        )
      ) {
        return defaultBackground(presetKey, "gradient");
      }
      return {
        ...background,
        angle: clamp(background.angle, 0, 360),
        centerX: clamp(background.centerX, 0, 100),
        centerY: clamp(background.centerY, 0, 100),
      };
    case "pattern":
      if (
        !includesValue(
          capability.allowedBackgroundVariants.pattern,
          background.variant,
        )
      ) {
        return defaultBackground(presetKey, "pattern");
      }
      return {
        ...background,
        scale: clamp(background.scale, 4, 160),
        opacity: clamp(background.opacity, 0, 1),
      };
    case "texture":
      if (
        !includesValue(
          capability.allowedBackgroundVariants.texture,
          background.variant,
        )
      ) {
        return defaultBackground(presetKey, "texture");
      }
      return {
        ...background,
        intensity: clamp(background.intensity, 0, 1),
      };
    case "media":
      if (
        !includesValue(
          capability.allowedBackgroundVariants.media,
          background.mediaType,
        )
      ) {
        return defaultBackground(presetKey, "media");
      }
      return {
        ...background,
        zoom: clamp(background.zoom, 1, 3),
        positionX: clamp(background.positionX, 0, 100),
        positionY: clamp(background.positionY, 0, 100),
        overlayOpacity: clamp(background.overlayOpacity, 0, 1),
      };
    case "animation":
      if (
        !includesValue(
          capability.allowedBackgroundVariants.animation,
          background.variant,
        )
      ) {
        return defaultBackground(presetKey, "animation");
      }
      return {
        ...background,
        speed: clamp(background.speed, 0.25, 2),
        intensity: clamp(background.intensity, 0, 1),
      };
    case "flat":
      return { ...background };
  }
}

export function normalizeDesignForPreset(
  design: ScanMeLinksDesignV2Input | null | undefined,
  presetKey?: unknown,
): ScanMeLinksDesignV2 {
  const resolvedPreset = safeScanMeLinksPresetKey(
    presetKey ?? design?.presetKey,
  );
  const fallback = buildDefaultDesign(resolvedPreset);

  if (!design) {
    return fallback;
  }

  const capability = SCANME_LINKS_PRESET_CAPABILITIES[resolvedPreset];
  const buttonVariant = capability.allowedButtonVariants.includes(
    design.buttons.variant,
  )
    ? design.buttons.variant
    : fallback.buttons.variant;
  const fontKey = capability.fonts.includes(design.typography.fontKey)
    ? design.typography.fontKey
    : fallback.typography.fontKey;

  const normalizeShadow = (
    shadow: ScanMeLinksShadowV2 | undefined,
    shadowFallback: ScanMeLinksShadowV2,
  ): ScanMeLinksShadowV2 => {
    const value = shadow ?? shadowFallback;
    return {
      ...shadowFallback,
      ...value,
      x: clamp(value.x, -64, 64),
      y: clamp(value.y, -64, 64),
      blur: clamp(value.blur, 0, 96),
      opacity: clamp(value.opacity, 0, 1),
    };
  };

  // A variation key only means anything inside its own preset, so one carried
  // over from a different preset is dropped rather than shown as active.
  const variationKey =
    design.variationKey && design.variationKey.startsWith(`${resolvedPreset}-`)
      ? design.variationKey
      : undefined;

  return {
    version: 2,
    presetKey: resolvedPreset,
    ...(variationKey ? { variationKey } : {}),
    autoContrast: design.autoContrast,
    background: normalizeBackground(design.background, resolvedPreset),
    colors: { ...fallback.colors, ...design.colors },
    buttons: {
      ...design.buttons,
      variant: buttonVariant,
      radius: clamp(design.buttons.radius, 0, 999),
      borderWidth: clamp(design.buttons.borderWidth, 0, 8),
      paddingX: clamp(design.buttons.paddingX, 8, 48),
      paddingY: clamp(design.buttons.paddingY, 8, 32),
      shadow: normalizeShadow(design.buttons.shadow, fallback.buttons.shadow),
    },
    effects: {
      textShadow: normalizeShadow(
        design.effects?.textShadow,
        fallback.effects.textShadow,
      ),
      ...(design.effects?.titleShadow
        ? {
            titleShadow: normalizeShadow(
              design.effects.titleShadow,
              fallback.effects.textShadow,
            ),
          }
        : {}),
      ...(design.effects?.descriptionShadow
        ? {
            descriptionShadow: normalizeShadow(
              design.effects.descriptionShadow,
              fallback.effects.textShadow,
            ),
          }
        : {}),
      ...(design.effects?.buttonTextShadow
        ? {
            buttonTextShadow: normalizeShadow(
              design.effects.buttonTextShadow,
              fallback.effects.textShadow,
            ),
          }
        : {}),
      logoShadow: normalizeShadow(
        design.effects?.logoShadow,
        fallback.effects.logoShadow,
      ),
    },
    typography: {
      ...design.typography,
      fontKey,
      lineHeight: clamp(design.typography.lineHeight, 1, 2),
      verticalSpacing: clamp(design.typography.verticalSpacing, 0, 64),
    },
    iconStyle: capability.iconStyle,
  };
}

export function createSafeScanMeLinksDesignV2(
  design?: ScanMeLinksDesignV2 | null,
): ScanMeLinksDesignV2 {
  return normalizeDesignForPreset(design, design?.presetKey);
}
