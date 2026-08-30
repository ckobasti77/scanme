import { v } from "convex/values";

export const scanMePresetKeyValidator = v.union(
  v.literal("gentle"),
  v.literal("lux"),
  v.literal("ios"),
  v.literal("frosty"),
  v.literal("noir"),
  v.literal("neon"),
  v.literal("nature"),
);

export const scanMeDesignPresetKeyValidator = v.union(
  scanMePresetKeyValidator,
  v.literal("custom"),
);

export const scanMeDesignV2PresetKeyValidator = v.union(
  v.literal("gentle"),
  v.literal("ios"),
  v.literal("lux"),
  v.literal("rustic"),
  v.literal("minimal"),
  v.literal("bold"),
  v.literal("nude-editorial"),
  v.literal("urban-pop"),
  v.literal("artisan-craft"),
  v.literal("glass-minimalist"),
  v.literal("wanderlust"),
  v.literal("bistro"),
  v.literal("bloom"),
  v.literal("chicken"),
  v.literal("pulse"),
);

export const scanMeDesignStateValidator = v.union(
  v.literal("uninitialized"),
  v.literal("ready"),
);

export const destinationPresentationValidator = v.union(
  v.literal("button"),
  v.literal("social"),
);

export const paletteSchemeTypeValidator = v.union(
  v.literal("complementary"),
  v.literal("analogous"),
  v.literal("monochromatic"),
  v.literal("triadic"),
  v.literal("split-complementary"),
);

export const paletteAnalysisValidator = v.object({
  original: v.array(v.string()),
  adjusted: v.array(v.string()),
  correctedRoles: v.array(v.string()),
  generationMode: v.optional(v.union(v.literal("light"), v.literal("dark"))),
  lockedSlots: v.optional(v.array(v.boolean())),
  schemeType: v.optional(paletteSchemeTypeValidator),
});

export const scanMeBackgroundValidator = v.union(
  v.object({
    kind: v.literal("solid"),
    color: v.string(),
  }),
  v.object({
    kind: v.literal("gradient"),
    from: v.string(),
    to: v.string(),
    angle: v.number(),
    overlayColor: v.string(),
    overlayOpacity: v.number(),
  }),
  v.object({
    kind: v.literal("pattern"),
    pattern: v.union(
      v.literal("grid"),
      v.literal("dots"),
      v.literal("waves"),
    ),
    backgroundColor: v.string(),
    patternColor: v.string(),
    opacity: v.number(),
  }),
  v.object({
    kind: v.literal("image"),
    builtInAsset: v.optional(v.literal("nature")),
    fit: v.union(v.literal("cover"), v.literal("contain")),
    position: v.union(
      v.literal("center"),
      v.literal("top"),
      v.literal("bottom"),
    ),
    overlayColor: v.string(),
    overlayOpacity: v.number(),
  }),
);

export const scanMeDesignV1Validator = v.object({
  version: v.literal(1),
  presetKey: scanMeDesignPresetKeyValidator,
  autoContrast: v.boolean(),
  background: scanMeBackgroundValidator,
  colors: v.object({
    page: v.string(),
    surface: v.string(),
    title: v.string(),
    body: v.string(),
    accent: v.string(),
    border: v.string(),
    focus: v.string(),
    button: v.string(),
    buttonHover: v.string(),
    buttonText: v.string(),
  }),
  buttons: v.object({
    variant: v.union(
      v.literal("solid"),
      v.literal("outline"),
      v.literal("glass"),
    ),
    radius: v.number(),
    borderWidth: v.number(),
    shadow: v.union(
      v.literal("none"),
      v.literal("soft"),
      v.literal("elevated"),
    ),
    paddingX: v.number(),
    paddingY: v.number(),
    animation: v.union(
      v.literal("none"),
      v.literal("lift"),
      v.literal("glow"),
      v.literal("liquid"),
    ),
  }),
  typography: v.object({
    family: v.union(
      v.literal("mono"),
      v.literal("sans"),
      v.literal("serif"),
    ),
    headingWeight: v.union(
      v.literal(400),
      v.literal(500),
      v.literal(600),
      v.literal(700),
    ),
    bodyWeight: v.union(
      v.literal(400),
      v.literal(500),
      v.literal(600),
      v.literal(700),
    ),
    alignment: v.union(
      v.literal("left"),
      v.literal("center"),
      v.literal("right"),
    ),
    scale: v.union(
      v.literal("small"),
      v.literal("medium"),
      v.literal("large"),
    ),
    lineHeight: v.number(),
    verticalSpacing: v.number(),
  }),
});

export const scanMeLegacyDesignValidator = scanMeDesignV1Validator;

export const scanMeDesignV2BackgroundValidator = v.union(
  v.object({
    category: v.literal("flat"),
    color: v.string(),
  }),
  v.object({
    category: v.literal("gradient"),
    variant: v.union(v.literal("linear"), v.literal("radial")),
    startColor: v.string(),
    endColor: v.string(),
    angle: v.number(),
    centerX: v.number(),
    centerY: v.number(),
  }),
  v.object({
    category: v.literal("pattern"),
    variant: v.union(
      v.literal("grid"),
      v.literal("checker"),
      v.literal("dots"),
      v.literal("waves"),
    ),
    backgroundColor: v.string(),
    patternColor: v.string(),
    scale: v.number(),
    opacity: v.number(),
  }),
  v.object({
    category: v.literal("texture"),
    variant: v.union(
      v.literal("paper"),
      v.literal("linen"),
      v.literal("wood"),
      v.literal("metal"),
    ),
    backgroundColor: v.string(),
    tintColor: v.string(),
    intensity: v.number(),
  }),
  v.object({
    category: v.literal("media"),
    mediaType: v.union(v.literal("image"), v.literal("video")),
    fit: v.union(v.literal("cover"), v.literal("contain")),
    zoom: v.number(),
    positionX: v.number(),
    positionY: v.number(),
    overlayColor: v.string(),
    overlayOpacity: v.number(),
  }),
  v.object({
    category: v.literal("animation"),
    variant: v.union(v.literal("aurora"), v.literal("soft-waves")),
    baseColor: v.string(),
    accentColor: v.string(),
    speed: v.number(),
    intensity: v.number(),
  }),
);

const scanMeShadowValidator = v.object({
  enabled: v.boolean(),
  color: v.string(),
  x: v.number(),
  y: v.number(),
  blur: v.number(),
  opacity: v.number(),
});

export const scanMeDesignV2Validator = v.object({
  version: v.literal(2),
  presetKey: scanMeDesignV2PresetKeyValidator,
  autoContrast: v.boolean(),
  background: scanMeDesignV2BackgroundValidator,
  colors: v.object({
    page: v.string(),
    surface: v.string(),
    title: v.string(),
    body: v.string(),
    accent: v.string(),
    border: v.string(),
    focus: v.string(),
    button: v.string(),
    buttonHover: v.string(),
    buttonText: v.string(),
    icon: v.string(),
  }),
  buttons: v.object({
    variant: v.union(
      v.literal("solid"),
      v.literal("outline"),
      v.literal("glass"),
    ),
    radius: v.number(),
    borderWidth: v.number(),
    paddingX: v.number(),
    paddingY: v.number(),
    shadow: scanMeShadowValidator,
    animation: v.union(
      v.literal("none"),
      v.literal("stroke"),
      v.literal("liquid-metal"),
    ),
  }),
  effects: v.optional(
    v.object({
      textShadow: scanMeShadowValidator,
      titleShadow: v.optional(scanMeShadowValidator),
      descriptionShadow: v.optional(scanMeShadowValidator),
      buttonTextShadow: v.optional(scanMeShadowValidator),
      logoShadow: scanMeShadowValidator,
    }),
  ),
  typography: v.object({
    fontKey: v.union(
      v.literal("dm-sans"),
      v.literal("nunito-sans"),
      v.literal("source-sans-3"),
      v.literal("system-ui"),
      v.literal("inter"),
      v.literal("manrope"),
      v.literal("cormorant-garamond"),
      v.literal("playfair-display"),
      v.literal("lora"),
      v.literal("libre-baskerville"),
      v.literal("space-grotesk"),
      v.literal("archivo"),
    ),
    headingWeight: v.union(
      v.literal(400),
      v.literal(500),
      v.literal(600),
      v.literal(700),
    ),
    bodyWeight: v.union(
      v.literal(400),
      v.literal(500),
      v.literal(600),
      v.literal(700),
    ),
    alignment: v.union(
      v.literal("left"),
      v.literal("center"),
      v.literal("right"),
    ),
    scale: v.union(
      v.literal("small"),
      v.literal("medium"),
      v.literal("large"),
    ),
    lineHeight: v.number(),
    verticalSpacing: v.number(),
  }),
  iconStyle: v.union(
    v.literal("soft-line"),
    v.literal("ios-rounded"),
    v.literal("luxury-line"),
    v.literal("rustic-stamp"),
    v.literal("minimal-line"),
    v.literal("bold-fill"),
    v.literal("editorial-outline"),
    v.literal("pop-sticker"),
    v.literal("craft-badge"),
    v.literal("glass-tile"),
    v.literal("wanderlust-glow"),
    v.literal("bistro-seal"),
    v.literal("bloom-soft"),
    v.literal("chicken-comic"),
    v.literal("pulse-neon"),
  ),
  // Identifies which colour variation of a preset is active. Purely an editor
  // affordance: the variation's tokens are already stored in `colors` and
  // `background`, so an unknown or missing key degrades to "custom".
  variationKey: v.optional(v.string()),
});

export const scanMeDesignValidator = v.union(
  scanMeDesignV1Validator,
  scanMeDesignV2Validator,
);
