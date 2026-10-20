import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { getMenuAccess, requireMenuAccessToRow } from "./lib/menuAccess";
import { getMenuCapabilities } from "./lib/menuCapabilities";
import { presentationValues } from "./lib/menuDraftLoad";
import { touchDraft } from "./lib/menuDraft";
import {
  menuBrandingValidator,
  menuDensityValidator,
  menuEmphasisValidator,
  menuLayoutValidator,
  menuMediaModeValidator,
} from "./lib/menuDomainValidators";
import { checkCas, type CasValue } from "../lib/menu/cas";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { izgledCas, izmenaCas, proveriIzmenuIzgleda, type IzgledIzmena, type IzgledPolje } from "../lib/menu/identity/izbor";
import { MENU_DEFAULT_PRESENTATION, type MenuPresentationValues } from "../lib/menu/presentation";

// =============================================================================
// ScanMe Menu V1 (K17) — the appearance of the public menu (master §7.1,
// §7.4, §13.4, §15.2; recipe §2.1d): layout and its Premium variants, palette
// (curated, or the venue's brand palette after the automatic contrast check),
// font pair, density, emphasis, the menu-wide media display, the guest tools
// (search, filters, EUR switch) and the footer.
//
// One row per Menu service (menuPresentation). Without a row the defaults of
// lib/menu/presentation.ts apply. A change is DRAFT content: touchDraft once
// per real change and guests see it only after `Objavi` (K05 publishes the row
// into the version). The rules — curated values only, the Premium gate on what
// a change chooses, the contrast check of a brand palette — live in
// lib/menu/identity/izbor.ts, shared with the editor's memory implementation.
//
// Access: reading needs "menu.read"; writing "menu.edit" with client editing
// switched on (Vlasnik, Menadžer, Urednik; ScanMe admin). The service comes
// from the argument and is proven by requireMenuAccessToRow: a caller without
// a role in it gets `menu/not_found`, never a hint that it exists.
// =============================================================================

type DbCtx = QueryCtx | MutationCtx;

async function loadRow(ctx: DbCtx, menuServiceId: Id<"menuServices">): Promise<Doc<"menuPresentation"> | null> {
  return await ctx.db
    .query("menuPresentation")
    .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
    .first();
}

function valuesOf(row: Doc<"menuPresentation"> | null): MenuPresentationValues {
  return row ? presentationValues(row) : MENU_DEFAULT_PRESENTATION;
}

/** The fields of a change; every one optional, `null` removes the variant or the brand colours. */
const izmenaValidator = v.object({
  layout: v.optional(menuLayoutValidator),
  layoutVariant: v.optional(v.union(v.string(), v.null())),
  paletteId: v.optional(v.string()),
  brandColors: v.optional(v.union(v.array(v.string()), v.null())),
  fontPairId: v.optional(v.string()),
  density: v.optional(menuDensityValidator),
  emphasis: v.optional(menuEmphasisValidator),
  defaultMediaMode: v.optional(menuMediaModeValidator),
  search: v.optional(v.boolean()),
  filters: v.optional(v.array(v.string())),
  currencyToggle: v.optional(v.boolean()),
  branding: v.optional(menuBrandingValidator),
});

/** Length guards before any rule runs (ids and colours are short; lists are small). */
function withinBounds(izmena: IzgledIzmena): boolean {
  const kratko = (value: string | undefined) => value === undefined || value.length <= 40;
  return (
    kratko(izmena.paletteId) &&
    kratko(izmena.fontPairId) &&
    kratko(izmena.layoutVariant ?? undefined) &&
    (izmena.brandColors == null || (izmena.brandColors.length <= 3 && izmena.brandColors.every((c) => c.length <= 9))) &&
    (izmena.filters === undefined || (izmena.filters.length <= 20 && izmena.filters.every((code) => code.length <= 40)))
  );
}

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

/**
 * The DRAFT appearance of a Menu service (the editor's Izgled), with what the
 * account may choose. null for every refusal (no error toast on load).
 */
export const get = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const capabilities = await getMenuCapabilities(ctx, access.business._id);
    const row = await loadRow(ctx, access.menuService._id);
    return {
      values: valuesOf(row),
      plan: { extraLayouts: capabilities.extraLayouts, reducedBranding: capabilities.reducedBranding },
      canEdit: access.canEdit && access.permissions.includes("menu.edit"),
      updatedAt: row?.updatedAt ?? null,
    };
  },
});

// -----------------------------------------------------------------------------
// Write (draft)
// -----------------------------------------------------------------------------

/**
 * One change of the appearance, by compare-and-set on the values this person
 * last saw (`expected` names exactly the fields of `patch`). A refusal throws
 * its code (menu/…, plan/premium_required, presentation/…); a conflict returns
 * `{ ok: false, conflicts, current, attempted }` (lists as JSON text) and
 * writes nothing; a change that changes nothing returns `{ ok: true }` without
 * touching the draft.
 */
export const update = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    expected: izmenaValidator,
    patch: izmenaValidator,
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.edit");
    const patch = args.patch as IzgledIzmena;
    const expected = args.expected as IzgledIzmena;
    const patchKeys = Object.keys(izmenaCas(patch)) as IzgledPolje[];
    const expectedCas = izmenaCas(expected);
    // `expected` must name exactly the changed fields (null counts: "was absent").
    const expectedKeys = Object.keys(args.expected).filter((key) => (args.expected as Record<string, unknown>)[key] !== undefined);
    if (
      patchKeys.length === 0 ||
      expectedKeys.length !== patchKeys.length ||
      patchKeys.some((key) => !expectedKeys.includes(key)) ||
      !withinBounds(patch)
    ) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }

    const menuServiceId = access.menuService._id;
    const row = await loadRow(ctx, menuServiceId);
    const current = valuesOf(row);
    const casExpected: Partial<Record<IzgledPolje, CasValue>> = {};
    for (const key of patchKeys) casExpected[key] = expectedCas[key] ?? null;
    const cas = checkCas<IzgledPolje>(izgledCas(current), casExpected, izmenaCas(patch));
    if (!cas.ok) return cas;

    const capabilities = await getMenuCapabilities(ctx, access.business._id);
    const result = proveriIzmenuIzgleda(current, patch, {
      extraLayouts: capabilities.extraLayouts,
      reducedBranding: capabilities.reducedBranding,
    });
    if (!result.ok) throw new ConvexError(result.kod);
    if (!result.promena) return { ok: true as const };

    const next = result.vrednosti;
    const now = Date.now();
    const fields = {
      layout: next.layout,
      // undefined removes the field on patch (no variant).
      layoutVariant: next.layoutVariant,
      paletteId: next.paletteId,
      brandColors: next.brandColors ?? undefined,
      fontPairId: next.fontPairId,
      density: next.density,
      emphasis: next.emphasis,
      defaultMediaMode: next.defaultMediaMode,
      search: next.search,
      filters: next.filters,
      currencyToggle: next.currencyToggle,
      branding: next.branding,
      updatedAt: now,
      updatedByUserId: access.user._id,
    };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("menuPresentation", { menuServiceId, ...fields, createdAt: now });
    await touchDraft(ctx, menuServiceId, access.user._id);
    return { ok: true as const };
  },
});
