import { v } from "convex/values";
import {
  designShadowValidator,
  designTypographyValidator,
  scanMeDesignV2BackgroundValidator,
} from "./designEngineValidators";

// The ScanMe Menu validators (RFC-003 §2.1, §2.3, §2.5 — TASK-51): the
// page-level design document `lib/design-engine/menu-tokens.ts` compiles, and
// the INLINE menu model `lib/menu-blocks.ts` defines, as stored on the
// `menus` draft side (`draftModel` / `draftDesign`). FORKED from
// `convex/lib/venueValidators.ts` (RFC-003 §1.a): Menu and Venue diverge, so
// nothing here imports the Venue validators; only the product-agnostic
// design-engine validators (typography, shadow, the V2 background union) are
// shared — one source of truth for shapes that are genuinely the same.
//
// The PUBLISHED menu is not validated here: it lives in the six §2.13 tables,
// whose validators are the schema itself; `lib/menu-rows.ts` translates.

// ---------------------------------------------------------------------------
// Page-level design (`--menu-*` tokens compile from this — §1.b, TASK-48)
// ---------------------------------------------------------------------------

export const menuColorsValidator = v.object({
  page: v.string(),
  surface: v.string(),
  title: v.string(),
  body: v.string(),
  accent: v.string(),
  border: v.string(),
  focus: v.string(),
  icon: v.string(),
});

export const menuEffectsValidator = v.object({
  textShadow: designShadowValidator,
  logoShadow: designShadowValidator,
});

export const menuDesignValidator = v.object({
  version: v.literal(1),
  colors: menuColorsValidator,
  typography: designTypographyValidator,
  background: scanMeDesignV2BackgroundValidator,
  effects: v.optional(menuEffectsValidator),
});

// ---------------------------------------------------------------------------
// The inline model — `lib/menu-blocks.ts` verbatim, as Convex validators.
// Storage ids are branded here (`v.id("_storage")`) and typed as plain strings
// in the pure model; the runtime shape is identical — cast at the boundary,
// exactly as `convex/venue.ts` does for Venue blocks.
// ---------------------------------------------------------------------------

// The five shapes — the same five literals as `menuGroups.shape` (§2.13).
export const menuGroupShapeValidator = v.union(
  v.literal("lista"),
  v.literal("galerija"),
  v.literal("traka"),
  v.literal("istaknuto"),
  v.literal("tabela_varijanti"),
);

export const itemVariantValidator = v.object({
  id: v.string(),
  label: v.string(),
  priceRsd: v.number(),
});

export const itemPairingValidator = v.object({
  id: v.string(),
  pairedItemId: v.string(),
});

export const menuItemValidator = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  productType: v.string(),
  priceRsd: v.optional(v.number()),
  iconKey: v.optional(v.string()),
  photoStorageId: v.optional(v.id("_storage")),
  videoStorageId: v.optional(v.id("_storage")),
  available: v.boolean(),
  variants: v.array(itemVariantValidator),
  pairings: v.array(itemPairingValidator),
});

export const menuGroupBaseValidator = v.object({
  id: v.string(),
  title: v.string(),
  iconKey: v.optional(v.string()),
  daypartKey: v.optional(v.string()),
});

export const menuGroupValidator = v.object({
  shape: menuGroupShapeValidator,
  base: menuGroupBaseValidator,
  items: v.array(menuItemValidator),
});

export const menuDaypartValidator = v.object({
  id: v.string(),
  key: v.string(),
  label: v.string(),
  startMinute: v.number(),
  endMinute: v.number(),
});

export const menuModelValidator = v.object({
  groups: v.array(menuGroupValidator),
  dayparts: v.array(menuDaypartValidator),
  daypartOverride: v.optional(v.string()),
});
