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

export const scanMeDesignStateValidator = v.union(
  v.literal("uninitialized"),
  v.literal("ready"),
);

export const destinationPresentationValidator = v.union(
  v.literal("button"),
  v.literal("social"),
);

export const paletteAnalysisValidator = v.object({
  original: v.array(v.string()),
  adjusted: v.array(v.string()),
  correctedRoles: v.array(v.string()),
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

export const scanMeDesignValidator = v.object({
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
