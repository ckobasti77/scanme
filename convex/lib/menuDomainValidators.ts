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
