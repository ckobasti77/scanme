export const SCANME_LINKS_PRESET_KEYS = [
  "gentle",
  "ios",
  "lux",
  "rustic",
  "minimal",
  "bold",
] as const;

export type ScanMeLinksPresetKey = (typeof SCANME_LINKS_PRESET_KEYS)[number];

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

function buildDefaultDesign(
  presetKey: ScanMeLinksPresetKey,
): ScanMeLinksDesignV2 {
  const capability = SCANME_LINKS_PRESET_CAPABILITIES[presetKey];
  const radiusByPreset: Record<ScanMeLinksPresetKey, number> = {
    gentle: 26,
    ios: 28,
    lux: 12,
    rustic: 18,
    minimal: 16,
    bold: 18,
  };

  return {
    version: 2,
    presetKey,
    autoContrast: true,
    background: defaultBackground(presetKey),
    colors: { ...PRESET_COLORS[presetKey] },
    buttons: {
      variant: presetKey === "ios" ? "glass" : capability.allowedButtonVariants[0],
      radius: radiusByPreset[presetKey],
      borderWidth: 1,
      paddingX: 20,
      paddingY: 14,
      shadow: {
        enabled: presetKey !== "minimal",
        color: "#161916",
        x: 0,
        y: 8,
        blur: 24,
        opacity: presetKey === "ios" ? 0.12 : 0.16,
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
      headingWeight: presetKey === "lux" ? 500 : 600,
      bodyWeight: 500,
      alignment: "center",
      scale: "medium",
      lineHeight: 1.4,
      verticalSpacing: 16,
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

  return {
    version: 2,
    presetKey: resolvedPreset,
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
