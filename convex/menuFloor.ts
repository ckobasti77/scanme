import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  getMenuAccess,
  loadOwned,
  requireMenuAccess,
  requireMenuAccessToRow,
  type MenuAccess,
} from "./lib/menuAccess";
import { auditActorKind, writeMenuAudit } from "./lib/menuDraft";
import {
  menuPositionKindValidator,
  menuPositionLayoutValidator,
} from "./lib/menuDomainValidators";
import { positionHasActiveQr } from "./lib/menuQrResolve";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { FLOOR_ERROR } from "../lib/menu/errors/floor";
import {
  defaultLayoutSize,
  findFreeSpot,
  isValidLayout,
  overlapsAny,
  placeLayouts,
  sameLayout,
  type FloorItem,
  type FloorLayout,
  type FloorPositionKind,
} from "../lib/menu/floor-layout";
import { newMenuKey } from "../lib/menu/keys";
import {
  MENU_MAX_POSITIONS,
  MENU_MAX_POSITION_BATCH,
  MENU_MAX_SEATS,
  MENU_MAX_ZONES,
  MENU_TEXT,
} from "../lib/menu/limits";
import type { LokalPozicija, LokalZona } from "../lib/menu/lokal/model";
import { orderAfter } from "../lib/menu/order";
import { normalizeArticleName, requiredText } from "../lib/menu/text";

// =============================================================================
// ScanMe Menu V1 — zones, positions and the floor layout (K20; master §9,
// §13.6). Tables, rooms and other spots are OPERATIONAL data: every change
// applies at once and never goes through the draft (no touchDraft, K19-12).
//
// Everything here needs "venue.edit" (owner, manager, ScanMe admin); the editor,
// finance and view-only roles are refused. Mutations addressed by a row id take
// the service from the row (requireMenuAccessToRow): a caller with no role in
// that service gets `menu/not_found`, exactly as for a missing id. Errors are
// codes (MENU_ERROR / FLOOR_ERROR), never prose.
//
// Uniqueness is decided over ACTIVE rows only (an archived zone or position
// frees its name), from the bounded list of active rows the mutation reads
// anyway, so it is exact whatever the number of archived rows. Each zone (and
// "Bez zone") is its own grid surface (lib/menu/floor-layout.ts); the layout of
// a position is checked against the OTHER positions of the same surface.
// =============================================================================

type DatabaseCtx = QueryCtx | MutationCtx;
type PositionDoc = Doc<"menuPositions">;
type LayoutSize = Pick<FloorLayout, "w" | "h" | "shape">;

/** Longest prefix of a batch label ("Sto" in "Sto 12"), master §9.2. */
const PREFIX_MAX = 30;
/** Highest first number of a batch ("Dodaj stolove 1–20"). */
const BATCH_FROM_MAX = 9999;

// -----------------------------------------------------------------------------
// Reads (bounded, indexed)
// -----------------------------------------------------------------------------

async function activeZones(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  limit: number = MENU_MAX_ZONES + 1,
): Promise<Doc<"menuZones">[]> {
  return await ctx.db
    .query("menuZones")
    .withIndex("by_menuServiceId_and_active_and_order", (q) =>
      q.eq("menuServiceId", menuServiceId).eq("active", true),
    )
    .take(limit);
}

async function activePositions(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  limit: number = MENU_MAX_POSITIONS + 1,
): Promise<PositionDoc[]> {
  return await ctx.db
    .query("menuPositions")
    .withIndex("by_menuServiceId_and_active_and_order", (q) =>
      q.eq("menuServiceId", menuServiceId).eq("active", true),
    )
    .take(limit);
}

/** The active positions of one surface; `undefined` = "Bez zone". */
async function activePositionsOfZone(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
  zoneId: Id<"menuZones"> | undefined,
): Promise<PositionDoc[]> {
  return await ctx.db
    .query("menuPositions")
    .withIndex("by_menuServiceId_and_active_and_zoneId", (q) =>
      q.eq("menuServiceId", menuServiceId).eq("active", true).eq("zoneId", zoneId),
    )
    .take(MENU_MAX_POSITIONS + 1);
}

/** A zone and the caller's venue.edit access, from a zone id taken from an argument. */
async function loadZoneForEdit(
  ctx: MutationCtx,
  zoneId: Id<"menuZones">,
): Promise<{ zone: Doc<"menuZones">; access: MenuAccess }> {
  const found = await ctx.db.get(zoneId);
  if (!found) throw new ConvexError(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, found.menuServiceId, "venue.edit");
  const zone = await loadOwned(ctx, zoneId, access.menuService._id);
  return { zone, access };
}

/** A position and the caller's venue.edit access, from a position id taken from an argument. */
async function loadPositionForEdit(
  ctx: MutationCtx,
  positionId: Id<"menuPositions">,
): Promise<{ position: PositionDoc; access: MenuAccess }> {
  const found = await ctx.db.get(positionId);
  if (!found) throw new ConvexError(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, found.menuServiceId, "venue.edit");
  const position = await loadOwned(ctx, positionId, access.menuService._id);
  return { position, access };
}

/** A zone of this service that can still take positions (foreign id = not_found). */
async function activeZoneOf(
  ctx: MutationCtx,
  zoneId: Id<"menuZones">,
  menuServiceId: Id<"menuServices">,
): Promise<Doc<"menuZones">> {
  const zone = await loadOwned(ctx, zoneId, menuServiceId);
  if (!zone.active) throw new ConvexError(FLOOR_ERROR.zoneArchived);
  return zone;
}

// -----------------------------------------------------------------------------
// Validation
// -----------------------------------------------------------------------------

/**
 * A required name or label: cleaned, 1..max characters and with something left
 * once punctuation is folded away (so it can be told apart from other names).
 */
function cleanName(raw: string, max: number): { text: string; normalized: string } {
  const text = requiredText(raw, max);
  const normalized = text === null ? "" : normalizeArticleName(text);
  if (text === null || normalized === "") throw new ConvexError(MENU_ERROR.invalidInput);
  return { text, normalized };
}

/** null = no seat count (the field is removed); otherwise a whole number 1..MENU_MAX_SEATS. */
function cleanSeats(seats: number | null): number | undefined {
  if (seats === null) return undefined;
  if (!Number.isInteger(seats) || seats < 1 || seats > MENU_MAX_SEATS) {
    throw new ConvexError(MENU_ERROR.invalidInput);
  }
  return seats;
}

function assertZoneNameFree(
  zones: readonly Doc<"menuZones">[],
  normalized: string,
  exceptId: Id<"menuZones"> | null,
): void {
  if (zones.some((zone) => zone._id !== exceptId && zone.nameNormalized === normalized)) {
    throw new ConvexError(FLOOR_ERROR.zoneNameTaken);
  }
}

// -----------------------------------------------------------------------------
// Layout of one surface
// -----------------------------------------------------------------------------

function floorItems(rows: readonly PositionDoc[]): FloorItem[] {
  return rows.map((row) => ({
    id: row._id,
    kind: row.kind,
    order: row.order,
    layout: row.layout ?? null,
  }));
}

/** Where the given positions of ONE surface are drawn (stored layouts, the rest placed by order). */
function effectiveLayouts(rows: readonly PositionDoc[]): FloorLayout[] {
  return [...placeLayouts(floorItems(rows)).values()];
}

/** The size a position keeps when it moves to another surface. */
function sizeOf(
  position: Pick<PositionDoc, "layout">,
  kind: FloorPositionKind,
): LayoutSize {
  const layout = position.layout;
  if (layout && isValidLayout(layout)) return { w: layout.w, h: layout.h, shape: layout.shape };
  return defaultLayoutSize(kind);
}

/**
 * A concrete layout at the first free spot of `occupied` (which then includes
 * it), or undefined when the surface is full: the plan then places it by order.
 */
function takeFreeSpot(occupied: FloorLayout[], size: LayoutSize): FloorLayout | undefined {
  const spot = findFreeSpot(occupied, size);
  if (!spot) return undefined;
  const layout: FloorLayout = { x: spot.x, y: spot.y, w: size.w, h: size.h, shape: size.shape };
  occupied.push(layout);
  return layout;
}

// -----------------------------------------------------------------------------
// Read
// -----------------------------------------------------------------------------

/** The active zones and positions of the venue, by order. null for every refusal. */
export const overview = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { businessSlug: args.slug }, "venue.edit");
    if (!access) return null;
    const menuServiceId = access.menuService._id;
    const zones = await activeZones(ctx, menuServiceId, MENU_MAX_ZONES);
    const positions = await activePositions(ctx, menuServiceId, MENU_MAX_POSITIONS);
    return {
      zones: zones.map(
        (zone): LokalZona => ({
          id: zone._id,
          key: zone.key,
          name: zone.name,
          order: zone.order,
        }),
      ),
      positions: positions.map(
        (position): LokalPozicija => ({
          id: position._id,
          key: position.key,
          kind: position.kind,
          label: position.label,
          seats: position.seats ?? null,
          zoneId: position.zoneId ?? null,
          layout: position.layout ?? null,
          order: position.order,
        }),
      ),
    };
  },
});

// -----------------------------------------------------------------------------
// Zones
// -----------------------------------------------------------------------------

/** Adds a zone after the last active one. */
export const createZone = mutation({
  args: { slug: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const access = await requireMenuAccess(ctx, { businessSlug: args.slug }, "venue.edit");
    const { text, normalized } = cleanName(args.name, MENU_TEXT.zoneName);
    const menuServiceId = access.menuService._id;
    const zones = await activeZones(ctx, menuServiceId);
    assertZoneNameFree(zones, normalized, null);
    if (zones.length >= MENU_MAX_ZONES) throw new ConvexError(MENU_ERROR.limitReached);

    const now = Date.now();
    const zoneId = await ctx.db.insert("menuZones", {
      menuServiceId,
      key: newMenuKey("zone"),
      name: text,
      nameNormalized: normalized,
      order: zones.length > 0 ? zones[zones.length - 1].order + 1 : 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { zoneId };
  },
});

export const renameZone = mutation({
  args: { zoneId: v.id("menuZones"), name: v.string() },
  handler: async (ctx, args) => {
    const { zone } = await loadZoneForEdit(ctx, args.zoneId);
    if (!zone.active) throw new ConvexError(FLOOR_ERROR.zoneArchived);
    const { text, normalized } = cleanName(args.name, MENU_TEXT.zoneName);
    assertZoneNameFree(await activeZones(ctx, zone.menuServiceId), normalized, zone._id);
    if (text === zone.name) return null;
    await ctx.db.patch(zone._id, { name: text, nameNormalized: normalized, updatedAt: Date.now() });
    return null;
  },
});

/** Swaps the zone with its neighbour among the active zones; no neighbour = nothing happens. */
export const moveZone = mutation({
  args: { zoneId: v.id("menuZones"), direction: v.union(v.literal("up"), v.literal("down")) },
  handler: async (ctx, args) => {
    const { zone } = await loadZoneForEdit(ctx, args.zoneId);
    if (!zone.active) throw new ConvexError(FLOOR_ERROR.zoneArchived);
    const zones = await activeZones(ctx, zone.menuServiceId);
    const index = zones.findIndex((row) => row._id === zone._id);
    if (index < 0) throw new ConvexError(MENU_ERROR.notFound);
    const neighbour = zones[args.direction === "up" ? index - 1 : index + 1];
    if (!neighbour) return null;
    const now = Date.now();
    await ctx.db.patch(zone._id, { order: neighbour.order, updatedAt: now });
    await ctx.db.patch(neighbour._id, { order: zone.order, updatedAt: now });
    return null;
  },
});

/**
 * Archives a zone (never deletes it): every active position of the zone moves to
 * "Bez zone" and gets a fresh spot on that surface, keeping its size and shape.
 */
export const archiveZone = mutation({
  args: { zoneId: v.id("menuZones") },
  handler: async (ctx, args) => {
    const { zone, access } = await loadZoneForEdit(ctx, args.zoneId);
    if (!zone.active) return { movedPositions: 0 };
    const menuServiceId = zone.menuServiceId;

    const moved = await activePositionsOfZone(ctx, menuServiceId, zone._id);
    moved.sort((a, b) => a.order - b.order || a._id.localeCompare(b._id));
    const occupied = effectiveLayouts(await activePositionsOfZone(ctx, menuServiceId, undefined));

    const now = Date.now();
    for (const position of moved) {
      await ctx.db.patch(position._id, {
        zoneId: undefined,
        layout: takeFreeSpot(occupied, sizeOf(position, position.kind)),
        updatedAt: now,
      });
    }
    await ctx.db.patch(zone._id, { active: false, updatedAt: now });
    await writeMenuAudit(ctx, {
      menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "zone.archived",
      entityType: "zone",
      entityKey: zone.key,
      details: { name: zone.name, movedPositions: moved.length },
    });
    return { movedPositions: moved.length };
  },
});

// -----------------------------------------------------------------------------
// Positions
// -----------------------------------------------------------------------------

/**
 * Inserts positions after the last active one, each on the first free spot of
 * its zone's surface. All or nothing: every check runs before the first insert.
 */
async function insertPositions(
  ctx: MutationCtx,
  access: MenuAccess,
  input: {
    kind: FloorPositionKind;
    labels: readonly string[];
    seats: number | null;
    zoneId: Id<"menuZones"> | null;
  },
): Promise<Id<"menuPositions">[]> {
  const menuServiceId = access.menuService._id;
  const seats = cleanSeats(input.seats);
  const labels = input.labels.map((label) => cleanName(label, MENU_TEXT.positionLabel));
  const zone = input.zoneId ? await activeZoneOf(ctx, input.zoneId, menuServiceId) : null;

  const active = await activePositions(ctx, menuServiceId);
  const taken = new Set(active.map((row) => row.labelNormalized));
  for (const { normalized } of labels) {
    if (taken.has(normalized)) throw new ConvexError(FLOOR_ERROR.positionLabelTaken);
    taken.add(normalized);
  }
  if (active.length + labels.length > MENU_MAX_POSITIONS) {
    throw new ConvexError(MENU_ERROR.limitReached);
  }

  const zoneId = zone?._id;
  const occupied = effectiveLayouts(active.filter((row) => row.zoneId === zoneId));
  let last = active.length > 0 ? active[active.length - 1].order : null;
  const now = Date.now();
  const ids: Id<"menuPositions">[] = [];
  for (const { text, normalized } of labels) {
    last = orderAfter(last);
    const layout = takeFreeSpot(occupied, defaultLayoutSize(input.kind));
    ids.push(
      await ctx.db.insert("menuPositions", {
        menuServiceId,
        key: newMenuKey("position"),
        kind: input.kind,
        label: text,
        labelNormalized: normalized,
        ...(seats !== undefined ? { seats } : {}),
        ...(zoneId ? { zoneId } : {}),
        ...(layout ? { layout } : {}),
        order: last,
        active: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }
  return ids;
}

export const createPosition = mutation({
  args: {
    slug: v.string(),
    kind: menuPositionKindValidator,
    label: v.string(),
    seats: v.union(v.number(), v.null()),
    zoneId: v.union(v.id("menuZones"), v.null()),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccess(ctx, { businessSlug: args.slug }, "venue.edit");
    const [positionId] = await insertPositions(ctx, access, {
      kind: args.kind,
      labels: [args.label],
      seats: args.seats,
      zoneId: args.zoneId,
    });
    return { positionId };
  },
});

/** "Sto 1" … "Sto 20" in one call: `${prefix} ${from + i}` for i in 0..count-1. */
export const createPositions = mutation({
  args: {
    slug: v.string(),
    kind: menuPositionKindValidator,
    prefix: v.string(),
    from: v.number(),
    count: v.number(),
    seats: v.union(v.number(), v.null()),
    zoneId: v.union(v.id("menuZones"), v.null()),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccess(ctx, { businessSlug: args.slug }, "venue.edit");
    const prefix = requiredText(args.prefix, PREFIX_MAX);
    if (prefix === null) throw new ConvexError(MENU_ERROR.invalidInput);
    if (!Number.isInteger(args.from) || args.from < 0 || args.from > BATCH_FROM_MAX) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }
    if (!Number.isInteger(args.count) || args.count < 1 || args.count > MENU_MAX_POSITION_BATCH) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }
    const positionIds = await insertPositions(ctx, access, {
      kind: args.kind,
      labels: Array.from({ length: args.count }, (_, index) => `${prefix} ${args.from + index}`),
      seats: args.seats,
      zoneId: args.zoneId,
    });
    return { positionIds };
  },
});

/**
 * Changes the fields that are present. `seats: null` removes the seat count;
 * `zoneId: null` moves the position to "Bez zone". A zone change gives the
 * position a fresh spot on the target surface (same size and shape).
 */
export const updatePosition = mutation({
  args: {
    positionId: v.id("menuPositions"),
    label: v.optional(v.string()),
    kind: v.optional(menuPositionKindValidator),
    seats: v.optional(v.union(v.number(), v.null())),
    zoneId: v.optional(v.union(v.id("menuZones"), v.null())),
  },
  handler: async (ctx, args) => {
    const { position } = await loadPositionForEdit(ctx, args.positionId);
    if (!position.active) throw new ConvexError(FLOOR_ERROR.positionArchived);
    const menuServiceId = position.menuServiceId;
    const patch: Partial<PositionDoc> = {};

    const kind = args.kind ?? position.kind;
    if (kind !== position.kind) patch.kind = kind;

    if (args.seats !== undefined) {
      const seats = cleanSeats(args.seats);
      if (seats !== position.seats) patch.seats = seats;
    }

    let active: PositionDoc[] | null = null;
    if (args.label !== undefined) {
      const { text, normalized } = cleanName(args.label, MENU_TEXT.positionLabel);
      if (normalized !== position.labelNormalized) {
        active = await activePositions(ctx, menuServiceId);
        if (active.some((row) => row._id !== position._id && row.labelNormalized === normalized)) {
          throw new ConvexError(FLOOR_ERROR.positionLabelTaken);
        }
      }
      if (text !== position.label) {
        patch.label = text;
        patch.labelNormalized = normalized;
      }
    }

    if (args.zoneId !== undefined) {
      const targetZoneId = args.zoneId ?? undefined;
      if (targetZoneId !== position.zoneId) {
        if (targetZoneId) await activeZoneOf(ctx, targetZoneId, menuServiceId);
        active ??= await activePositions(ctx, menuServiceId);
        const occupied = effectiveLayouts(
          active.filter((row) => row._id !== position._id && row.zoneId === targetZoneId),
        );
        patch.zoneId = targetZoneId;
        patch.layout = takeFreeSpot(occupied, sizeOf(position, kind));
      }
    }

    if (Object.keys(patch).length === 0) return null;
    await ctx.db.patch(position._id, { ...patch, updatedAt: Date.now() });
    return null;
  },
});

/** Places one position. It may not overlap the other positions of its zone's surface. */
export const setLayout = mutation({
  args: { positionId: v.id("menuPositions"), layout: menuPositionLayoutValidator },
  handler: async (ctx, args) => {
    const { position } = await loadPositionForEdit(ctx, args.positionId);
    if (!position.active) throw new ConvexError(FLOOR_ERROR.positionArchived);
    if (!isValidLayout(args.layout)) throw new ConvexError(FLOOR_ERROR.invalidLayout);

    const others = (
      await activePositionsOfZone(ctx, position.menuServiceId, position.zoneId)
    ).filter((row) => row._id !== position._id);
    if (overlapsAny(args.layout, effectiveLayouts(others))) {
      throw new ConvexError(FLOOR_ERROR.invalidLayout);
    }
    if (sameLayout(position.layout ?? null, args.layout)) return null;
    await ctx.db.patch(position._id, { layout: args.layout, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Places many positions at once ("Rasporedi automatski", swapping two tables).
 * All or nothing: per zone, the final arrangement (the new layouts plus the
 * effective layouts of the positions that stay) must have no overlap.
 */
export const setLayouts = mutation({
  args: {
    slug: v.string(),
    items: v.array(
      v.object({ positionId: v.id("menuPositions"), layout: menuPositionLayoutValidator }),
    ),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccess(ctx, { businessSlug: args.slug }, "venue.edit");
    if (args.items.length > MENU_MAX_POSITION_BATCH) throw new ConvexError(MENU_ERROR.invalidInput);
    const menuServiceId = access.menuService._id;

    const changes = new Map<Id<"menuPositions">, FloorLayout>();
    const positions: PositionDoc[] = [];
    for (const item of args.items) {
      if (changes.has(item.positionId)) throw new ConvexError(MENU_ERROR.invalidInput);
      const position = await loadOwned(ctx, item.positionId, menuServiceId);
      if (!position.active) throw new ConvexError(FLOOR_ERROR.positionArchived);
      if (!isValidLayout(item.layout)) throw new ConvexError(FLOOR_ERROR.invalidLayout);
      changes.set(position._id, item.layout);
      positions.push(position);
    }

    for (const zoneId of new Set(positions.map((position) => position.zoneId))) {
      const rows = await activePositionsOfZone(ctx, menuServiceId, zoneId);
      const staying = effectiveLayouts(rows.filter((row) => !changes.has(row._id)));
      const placed = rows.flatMap((row) => {
        const layout = changes.get(row._id);
        return layout ? [layout] : [];
      });
      placed.forEach((layout, index) => {
        if (overlapsAny(layout, staying) || overlapsAny(layout, placed.slice(index + 1))) {
          throw new ConvexError(FLOOR_ERROR.invalidLayout);
        }
      });
    }

    const now = Date.now();
    for (const position of positions) {
      const layout = changes.get(position._id);
      if (!layout || sameLayout(position.layout ?? null, layout)) continue;
      await ctx.db.patch(position._id, { layout, updatedAt: now });
    }
    return null;
  },
});

/**
 * Archives a position and frees its label. Refused while an active QR card
 * stands on it (unlink or disable the card first). Archiving twice is a no-op.
 */
export const archivePosition = mutation({
  args: { positionId: v.id("menuPositions") },
  handler: async (ctx, args) => {
    const { position, access } = await loadPositionForEdit(ctx, args.positionId);
    if (!position.active) return null;
    const blocked = await positionHasActiveQr(ctx, {
      menuServiceId: position.menuServiceId,
      businessId: access.business._id,
      positionId: position._id,
    });
    if (blocked) throw new ConvexError(FLOOR_ERROR.positionHasQr);

    await ctx.db.patch(position._id, { active: false, updatedAt: Date.now() });
    await writeMenuAudit(ctx, {
      menuServiceId: position.menuServiceId,
      actorKind: auditActorKind(access.actor),
      actorUserId: access.user._id,
      action: "position.archived",
      entityType: "position",
      entityKey: position.key,
      details: { label: position.label },
    });
    return null;
  },
});
