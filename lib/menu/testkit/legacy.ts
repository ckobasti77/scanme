// ScanMe Menu V1 — legacy-shape fixtures for the K06 migration tests.
// Test-only: imported by convex/menu*.test.ts inside `t.run`. The legacy
// `menus` model (RFC-003 §2.13): an inline draft (`menus.draftModel`) plus
// published generations written EXACTLY like publishDraft writes them
// (convex/menu.ts insertPublishedRows), so two generations can coexist the
// way they do between a publish and its cleanup. Fictional venue and prices
// only (the repo is public).

import type { GenericMutationCtx } from "convex/server";
import type { DataModel, Doc, Id } from "../../../convex/_generated/dataModel";
import { insertPublishedRows } from "../../../convex/menu";
import type { MenuItem, MenuModel } from "../../menu-blocks";

type Ctx = GenericMutationCtx<DataModel>;

function item(
  id: string,
  name: string,
  fields: Partial<Omit<MenuItem, "id" | "name">> = {},
): MenuItem {
  return {
    id,
    name,
    productType: fields.productType ?? "jelo",
    available: fields.available ?? true,
    variants: fields.variants ?? [],
    pairings: fields.pairings ?? [],
    ...(fields.description !== undefined ? { description: fields.description } : {}),
    ...(fields.priceRsd !== undefined ? { priceRsd: fields.priceRsd } : {}),
    ...(fields.iconKey !== undefined ? { iconKey: fields.iconKey } : {}),
    ...(fields.photoStorageId !== undefined ? { photoStorageId: fields.photoStorageId } : {}),
    ...(fields.videoStorageId !== undefined ? { videoStorageId: fields.videoStorageId } : {}),
  };
}

/**
 * "Kafana kod Mike", legacy shape — three groups, eight items:
 *
 *   Topli napici (lista)
 *     itm-espreso    Espreso                150
 *     itm-domaca     Domaća kafa            120   productType "domaca kafa"
 *     itm-kapucino   Kapućino               —     variants mala 180 / velika 220
 *   Roštilj (galerija, daypart "rucak")
 *     itm-pljeskavica Pljeskavica           650   description with a line break; photo when given
 *     itm-cevapi     Ćevapi 10 kom          790   available: false ("nema više")
 *     itm-file       Pileći file            590   video when given
 *   Pića (lista)
 *     itm-voda       Kisela voda 0,33 l     160
 *     itm-limunada   Domaća limunada        250   "Ide uz" → itm-pljeskavica
 *
 * Plus one daypart ("Ručak", 12:00–16:00).
 */
export function legacyDraftModel(
  media: { photoStorageId?: Id<"_storage">; videoStorageId?: Id<"_storage"> } = {},
): MenuModel {
  return {
    groups: [
      {
        shape: "lista",
        base: { id: "grp-topli", title: "Topli napici" },
        items: [
          item("itm-espreso", "Espreso", { productType: "kafa", priceRsd: 150 }),
          item("itm-domaca", "Domaća kafa", { productType: "domaca kafa", priceRsd: 120 }),
          item("itm-kapucino", "Kapućino", {
            productType: "kafa",
            variants: [
              { id: "var-mala", label: "mala", priceRsd: 180 },
              { id: "var-velika", label: "velika", priceRsd: 220 },
            ],
          }),
        ],
      },
      {
        shape: "galerija",
        base: { id: "grp-rostilj", title: "Roštilj", daypartKey: "rucak" },
        items: [
          item("itm-pljeskavica", "Pljeskavica", {
            productType: "pljeskavica",
            priceRsd: 650,
            description: "Sa lukom i\nkajmakom",
            ...(media.photoStorageId ? { photoStorageId: media.photoStorageId } : {}),
          }),
          item("itm-cevapi", "Ćevapi 10 kom", { productType: "cevapi", priceRsd: 790, available: false }),
          item("itm-file", "Pileći file", {
            productType: "jelo",
            priceRsd: 590,
            ...(media.videoStorageId ? { videoStorageId: media.videoStorageId } : {}),
          }),
        ],
      },
      {
        shape: "lista",
        base: { id: "grp-pica", title: "Pića" },
        items: [
          item("itm-voda", "Kisela voda 0,33 l", { productType: "voda", priceRsd: 160 }),
          item("itm-limunada", "Domaća limunada", {
            productType: "sok",
            priceRsd: 250,
            pairings: [{ id: "par-1", pairedItemId: "itm-pljeskavica" }],
          }),
        ],
      },
    ],
    dayparts: [{ id: "dp-rucak", key: "rucak", label: "Ručak", startMinute: 720, endMinute: 960 }],
  };
}

/** A legacy model of `groups` × `itemsPerGroup` plain priced items (batch tests). */
export function legacyBigModel(groups: number, itemsPerGroup: number): MenuModel {
  return {
    groups: Array.from({ length: groups }, (_, groupIndex) => ({
      shape: "lista" as const,
      base: { id: `grp-${groupIndex}`, title: `Grupa ${groupIndex + 1}` },
      items: Array.from({ length: itemsPerGroup }, (_, itemIndex) =>
        item(`itm-${groupIndex}-${itemIndex}`, `Artikal ${groupIndex + 1}.${itemIndex + 1}`, {
          priceRsd: 100 + groupIndex * 10 + itemIndex,
        }),
      ),
    })),
    dayparts: [],
  };
}

/**
 * A legacy `menus` row for `businessId`. `draft` is stored as menus.draftModel
 * (omit it for a menu that has only published rows — the live source).
 * Every model in `generations` is published as generation 1, 2, … through
 * insertPublishedRows; the LAST one is live (`publishedGeneration`), the
 * earlier ones coexist as if their cleanup had not run yet.
 */
export async function seedLegacyMenu(
  ctx: Ctx,
  input: {
    businessId: Id<"businesses">;
    serviceProfileId?: Id<"serviceProfiles">;
    draft?: MenuModel;
    generations?: MenuModel[];
    draftRevision?: number;
    hasUnpublishedChanges?: boolean;
    daypartOverride?: string;
  },
): Promise<{ menuId: Id<"menus">; liveGeneration: number | null }> {
  const now = Date.now();
  const generations = input.generations ?? [];
  const draftRevision = input.draftRevision ?? 1;
  const menuId = await ctx.db.insert("menus", {
    businessId: input.businessId,
    ...(input.serviceProfileId ? { serviceProfileId: input.serviceProfileId } : {}),
    status: generations.length > 0 ? "published" : "draft",
    design: null,
    ...(input.draft ? { draftModel: input.draft as unknown as NonNullable<Doc<"menus">["draftModel"]> } : {}),
    draftRevision,
    publishedRevision: generations.length > 0 ? draftRevision : 0,
    hasUnpublishedChanges: input.hasUnpublishedChanges ?? false,
    ...(input.daypartOverride ? { daypartOverride: input.daypartOverride } : {}),
    createdAt: now,
    updatedAt: now,
  });
  for (const [index, model] of generations.entries()) {
    await insertPublishedRows(ctx, menuId, model, index + 1);
  }
  if (generations.length > 0) {
    await ctx.db.patch(menuId, { publishedGeneration: generations.length, publishedAt: now });
  }
  return { menuId, liveGeneration: generations.length > 0 ? generations.length : null };
}

/** Every row of the six legacy tables for one menu — "nothing was deleted or changed". */
export async function legacySnapshot(ctx: Ctx, menuId: Id<"menus">) {
  const menu = await ctx.db.get(menuId);
  const groups = await ctx.db
    .query("menuGroups")
    .withIndex("by_menuId_and_order", (q) => q.eq("menuId", menuId))
    .collect();
  const items = await ctx.db
    .query("menuItems")
    .withIndex("by_menuId", (q) => q.eq("menuId", menuId))
    .collect();
  const variants = [];
  const pairings = [];
  for (const row of items) {
    variants.push(
      ...(await ctx.db
        .query("itemVariants")
        .withIndex("by_itemId_and_order", (q) => q.eq("itemId", row._id))
        .collect()),
    );
    pairings.push(
      ...(await ctx.db
        .query("itemPairings")
        .withIndex("by_itemId", (q) => q.eq("itemId", row._id))
        .collect()),
    );
  }
  const dayparts = await ctx.db
    .query("menuDayparts")
    .withIndex("by_menuId_and_order", (q) => q.eq("menuId", menuId))
    .collect();
  return { menu, groups, items, variants, pairings, dayparts };
}
