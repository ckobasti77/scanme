import { v } from "convex/values";

// ScanMe Menu V1 — validators of the new Menu domain (K01 §3, recipe
// docs/menu/MENU-ARHITEKTURA.md). Imported by convex/schema.ts and by the
// menu* modules; this file must never import ../schema (cycle).
//
// Internal identifiers and union values are English like the rest of the
// schema; every word a user reads comes from lib/i18n (menu-domen surface).

export const menuModeValidator = v.union(
  v.literal("hospitality"),
  v.literal("services"),
  v.literal("retail"),
);

export const menuServiceStatusValidator = v.union(
  v.literal("active"),
  v.literal("archived"),
);

export const menuReservationsModeValidator = v.union(
  v.literal("off"),
  v.literal("form"),
  v.literal("external"),
);

// Live switches (Funkcionalnosti, master §13.7). They take effect immediately,
// they are not part of the draft/publish cycle (K01 A10, OTV 3).
export const menuFeaturesValidator = v.object({
  callWaiter: v.boolean(),
  billRequest: v.boolean(),
  ordering: v.boolean(),
  roomService: v.boolean(),
  occupancy: v.boolean(),
  reservations: menuReservationsModeValidator,
});

export const menuVisibilityValidator = v.union(
  v.literal("visible"),
  v.literal("hidden"),
);

// Master §3.3: a guest on one page does not automatically see the others,
// unless the client enables "back" or shared navigation.
export const menuPageNavigationValidator = v.union(
  v.literal("standalone"),
  v.literal("back"),
  v.literal("shared"),
);

export const menuArticleKindValidator = v.union(
  v.literal("item"),
  v.literal("combo"),
);

export const menuMediaModeValidator = v.union(
  v.literal("image"),
  v.literal("icon"),
  v.literal("none"),
);

export const menuMemberRoleValidator = v.union(
  v.literal("owner"),
  v.literal("manager"),
  v.literal("editor"),
);

export const menuMemberStatusValidator = v.union(
  v.literal("invited"),
  v.literal("active"),
  v.literal("removed"),
);

export const menuAuditActorKindValidator = v.union(
  v.literal("user"),
  v.literal("staff"),
  v.literal("admin"),
  v.literal("guest"),
  v.literal("system"),
);

// Small, flat, machine-readable detail (≤20 keys, enforced by the writer).
export const menuAuditDetailsValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean(), v.null()),
);

// CAS (lib/menu/cas.ts): the value the editor last saw; null = absent.
export const menuCasValueValidator = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.null(),
);

// -----------------------------------------------------------------------------
// K03 — settings, Funkcionalnosti switches and Room service
// -----------------------------------------------------------------------------

// The on/off switches of menuFeaturesValidator (reservations is three-state
// and gets its own writer in K25).
export const menuBooleanFeatureValidator = v.union(
  v.literal("callWaiter"),
  v.literal("billRequest"),
  v.literal("ordering"),
  v.literal("roomService"),
  v.literal("occupancy"),
);

// menuServices.settings — grows one optional key per step that needs it
// (working hours and reservations K25, panel thresholds K23/K28).
export const menuServiceSettingsValidator = v.object({
  // Master §7.7: managed in Settings, published with the menu. `translations`
  // never holds the source language; Standard allows one translation
  // (two languages), lib/menu/capabilities.ts.
  languages: v.optional(
    v.object({
      source: v.string(),
      translations: v.array(v.string()),
    }),
  ),
  // K04 — master §7.3: allergens are an OPTIONAL system of the venue. Absent
  // or false = off: no allergen UI in the public menu and no new records
  // (existing records are kept, never deleted). Content: goes through Objavi.
  allergensEnabled: v.optional(v.boolean()),
});

export const menuRoomServiceMarkupScopeValidator = v.union(
  v.literal("all"),
  v.literal("selected"),
);

// Raised when the base price of an article with a manual Room service price
// changes (master §5.3); null = the article had / has no base price.
export const menuRoomServicePriceWarningValidator = v.object({
  oldBaseRsd: v.union(v.number(), v.null()),
  newBaseRsd: v.union(v.number(), v.null()),
  at: v.number(),
});

// -----------------------------------------------------------------------------
// K04 — the article model: variants, add-on groups, combos, promotions,
// allergens, tags, translations and live availability (master §5.4–§5.7,
// §7.3, §7.5–§7.7)
// -----------------------------------------------------------------------------

// Inline translations of one entity (K01 A3; written by K16). Keys are
// language codes (lib/menu/languages.ts); the source language is never a
// key. `*Hash` is the hash of the source text the translation was made from,
// so the editor can mark a stale translation (§7.7); `suggested` (AI) is never
// published on its own.
export const menuTranslationEntryValidator = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  publicTitle: v.optional(v.string()),
  nameHash: v.optional(v.string()),
  descriptionHash: v.optional(v.string()),
  titleHash: v.optional(v.string()),
  status: v.union(v.literal("confirmed"), v.literal("suggested")),
  // K16: a pending AI suggestion lives NEXT TO the confirmed text, so asking
  // for one never un-publishes a confirmed translation; "suggested" status =
  // the entry holds only a suggestion (lib/menu/translation-status.ts).
  suggestion: v.optional(
    v.object({
      name: v.optional(v.string()),
      description: v.optional(v.string()),
      publicTitle: v.optional(v.string()),
      nameHash: v.optional(v.string()),
      descriptionHash: v.optional(v.string()),
      titleHash: v.optional(v.string()),
      at: v.number(),
    }),
  ),
});
export const menuTranslationsValidator = v.record(v.string(), menuTranslationEntryValidator);

// lib/menu/allergens.ts MENU_ALLERGEN_CODES (a test keeps the two equal).
export const menuAllergenCodeValidator = v.union(
  v.literal("gluten"),
  v.literal("crustaceans"),
  v.literal("eggs"),
  v.literal("fish"),
  v.literal("peanuts"),
  v.literal("soybeans"),
  v.literal("milk"),
  v.literal("nuts"),
  v.literal("celery"),
  v.literal("mustard"),
  v.literal("sesame"),
  v.literal("sulphites"),
  v.literal("lupin"),
  v.literal("molluscs"),
  v.literal("other"),
);

// Absent on the article = UNKNOWN, never "safe" (§7.3). `otherText` describes
// `other` ("Drugo") and exists only when `other` is listed.
export const menuArticleAllergensValidator = v.object({
  contains: v.array(menuAllergenCodeValidator),
  mayContain: v.array(menuAllergenCodeValidator),
  otherText: v.optional(v.string()),
});

// lib/menu/tags.ts MENU_TAG_CODES (a test keeps the two equal).
export const menuTagCodeValidator = v.union(
  v.literal("vegan"),
  v.literal("vegetarian"),
  v.literal("spicy"),
  v.literal("recommended"),
  v.literal("new"),
  v.literal("house_special"),
  v.literal("homemade"),
);

export const menuPromoModeValidator = v.union(v.literal("price"), v.literal("percent"));
export const menuPromoLabelValidator = v.union(v.literal("promo"), v.literal("recommended"));

// §7.6: a regular price and an optional promo price OR percent; the client
// enters one and the other is derived (lib/menu/promo.ts). Only the entered
// value is stored (`priceRsd` for mode "price", whole `percent` 1..99 for mode
// "percent"), so a percent promo follows a later base-price change. `active`
// is the manual switch (Standard); `startsAt` / `endsAt` are the Premium
// schedule. The regular price comes back by itself after `endsAt`: activity
// is computed from time where the promo is read, never by a job.
export const menuPromoValidator = v.object({
  active: v.boolean(),
  mode: menuPromoModeValidator,
  priceRsd: v.optional(v.number()),
  percent: v.optional(v.number()),
  label: v.optional(menuPromoLabelValidator),
  startsAt: v.optional(v.number()),
  endsAt: v.optional(v.number()),
});

// §5.4: "check the combo price" (lib/menu/combo.ts MenuComboPriceCheck). Set
// when a component's price changes or a component is deleted; cleared only by
// the client's decision. Never changes the combo price.
export const menuComboPriceCheckValidator = v.object({
  since: v.number(),
  changedComponentKeys: v.array(v.string()),
  removedComponentNames: v.array(v.string()),
});

export const menuAddonSelectionValidator = v.union(v.literal("single"), v.literal("multiple"));

// A manual Room service price of one variant (K03 deferred it to K04). Same
// warning semantics as the article's manual RS price: the variant price
// change that made the manual price stale.
export const menuRoomServiceVariantPriceValidator = v.object({
  variantKey: v.string(),
  priceRsd: v.number(),
  priceWarning: v.optional(menuRoomServicePriceWarningValidator),
});

// -----------------------------------------------------------------------------
// K05 — draft, publishing, versions, appearance and editor presence
// (master §6.1; lib/menu/snapshot.ts)
// -----------------------------------------------------------------------------

// What one publication changed for guests (lib/menu/publish-summary.ts).
export const menuPublishSummaryValidator = v.object({
  changedPrices: v.number(),
  newArticles: v.number(),
  removedArticles: v.number(),
  structural: v.object({
    hidden: v.number(),
    removedFromPage: v.number(),
    deleted: v.number(),
    reordered: v.number(),
  }),
});

export const menuVersionPartScopeValidator = v.union(v.literal("public"), v.literal("internal"));

export const menuLayoutValidator = v.union(
  v.literal("flow"),
  v.literal("categories"),
  v.literal("compact"),
);
export const menuDensityValidator = v.union(
  v.literal("airy"),
  v.literal("standard"),
  v.literal("dense"),
);
export const menuEmphasisValidator = v.union(v.literal("calm"), v.literal("bold"));
export const menuBrandingValidator = v.union(v.literal("standard"), v.literal("reduced"));

// What the editor is looking at (master §6.1: "ko trenutno uređuje isti
// artikal"). Later steps may add kinds (widening only).
export const menuPresenceEntityTypeValidator = v.union(
  v.literal("article"),
  v.literal("section"),
  v.literal("page"),
  v.literal("room_service"),
  v.literal("settings"),
  v.literal("presentation"),
);

// K06 — migration of the legacy `menus` model (recipe §12). Kept on the Menu
// service: which legacy menu it migrates, from which source (the inline
// draft or the live generation) at which revision, and the phase. A source
// that changes after the run started is refused (purge first, then migrate
// again), so two runs never mix two versions of the old menu. `cutover`
// blocks the legacy writers (convex/lib/menuLegacyGuard.ts).
export const menuLegacyMigrationValidator = v.object({
  status: v.union(v.literal("running"), v.literal("migrated"), v.literal("cutover")),
  legacyMenuId: v.id("menus"),
  sourceKind: v.union(v.literal("draft"), v.literal("live")),
  // menus.draftRevision (draft) or menus.publishedGeneration (live).
  sourceRevision: v.number(),
  startedAt: v.number(),
  migratedAt: v.optional(v.number()),
  cutoverAt: v.optional(v.number()),
});
