// The design engine's product-agnostic validators (RFC-001 §2.5).
//
// Two jobs:
//   1. Re-export the V2 background union so the Links validator file needs zero
//      edits and future product validators (Venue, TASK-07) never import from a
//      Links-named module — one source of truth for the background shape.
//   2. Define shadow and typography validators of *identical shape* to the Links
//      ones, but **independently** — the RFC is explicit that a product design
//      validator must not compose `scanMeDesignValidator`, whose `presetKey` /
//      `iconStyle` unions are Links-hardcoded. Duplicating these two small,
//      stable shapes is the deliberate price of that decoupling; the shapes are
//      pinned to the Links equivalents by the golden/shared-schema tests.

import { v } from "convex/values";

export { scanMeDesignV2BackgroundValidator } from "./scanMeDesignValidators";

// Same six fields as the Links `scanMeShadowValidator`; defined here so no
// product validator reaches into the Links file for it.
export const designShadowValidator = v.object({
  enabled: v.boolean(),
  color: v.string(),
  x: v.number(),
  y: v.number(),
  blur: v.number(),
  opacity: v.number(),
});

// The 12-key design-engine font enum, mirroring `DESIGN_FONT_KEYS` in
// lib/design-engine/typography.ts (which owns the render stacks). Kept in sync
// with that const by the venue token-compiler test.
export const designFontKeyValidator = v.union(
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
);

export const designWeightValidator = v.union(
  v.literal(400),
  v.literal(500),
  v.literal(600),
  v.literal(700),
);

export const designScaleValidator = v.union(
  v.literal("small"),
  v.literal("medium"),
  v.literal("large"),
);

export const designAlignmentValidator = v.union(
  v.literal("left"),
  v.literal("center"),
  v.literal("right"),
);

// Same shape as the Links typography object, minus nothing — a product is free
// to constrain it further in its own capability catalog.
export const designTypographyValidator = v.object({
  fontKey: designFontKeyValidator,
  headingWeight: designWeightValidator,
  bodyWeight: designWeightValidator,
  alignment: designAlignmentValidator,
  scale: designScaleValidator,
  lineHeight: v.number(),
  verticalSpacing: v.number(),
});
