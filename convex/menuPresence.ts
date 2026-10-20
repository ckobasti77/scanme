import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { getMenuAccess, requireMenuAccessToRow } from "./lib/menuAccess";
import { menuPresenceEntityTypeValidator } from "./lib/menuDomainValidators";
import { MENU_ERROR } from "../lib/menu/errors/core";

// =============================================================================
// ScanMe Menu V1 (K05) — who is editing what (master §6.1: "sistem prikazuje
// ko trenutno uređuje isti artikal").
//
// A light signal, not a lock: the editor sends a heartbeat with the entity it
// has open; everyone else reads ONE subscription per service
// (listForService) and highlights the entity. To keep writes and
// re-renders low, a heartbeat for the same entity writes only when the row is
// close to expiring (PRESENCE_REFRESH_MS), and the list takes a `nowBucket`
// the client quantizes (queries never read the clock). Rows expire by
// themselves; a cron deletes old ones. Conflicting values are never solved
// here: CAS (lib/menu/cas.ts) refuses the second write with both values.
//
// The local table is used instead of @convex-dev/presence because the run
// adds no packages (P5).
// =============================================================================

/** A row is shown until this long after its last write. */
export const PRESENCE_TTL_MS = 45_000;
/** A heartbeat for the same entity writes only when less than TTL − this remains. */
export const PRESENCE_REFRESH_MS = 15_000;
/** Rows one list returns (editors of one service). */
const MAX_PRESENCE_ROWS = 100;
/** Expired rows the cleanup deletes per batch. */
const CLEANUP_BATCH = 500;
/** Expired rows are kept this long for nothing; then deleted. */
const CLEANUP_GRACE_MS = 60_000;

const SESSION_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
const ENTITY_KEY_MAX = 64;

/**
 * "I have this open." `entityType` / `entityKey` absent = in the editor, on
 * nothing in particular. Needs `menu.edit`.
 */
export const heartbeat = mutation({
  args: {
    menuServiceId: v.id("menuServices"),
    sessionId: v.string(),
    entityType: v.optional(menuPresenceEntityTypeValidator),
    entityKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.edit");
    if (!SESSION_PATTERN.test(args.sessionId)) throw new ConvexError(MENU_ERROR.invalidInput);
    if (args.entityKey !== undefined && (args.entityKey.length === 0 || args.entityKey.length > ENTITY_KEY_MAX)) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }
    if (args.entityKey !== undefined && args.entityType === undefined) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }
    const userId = access.user._id;
    const now = Date.now();
    const expiresAt = now + PRESENCE_TTL_MS;
    const rows = await ctx.db
      .query("menuEditorPresence")
      .withIndex("by_userId_and_sessionId", (q) => q.eq("userId", userId).eq("sessionId", args.sessionId))
      .take(5);
    const [row, ...extra] = rows;
    for (const duplicate of extra) await ctx.db.delete(duplicate._id);

    if (
      row &&
      row.menuServiceId === args.menuServiceId &&
      row.entityType === args.entityType &&
      row.entityKey === args.entityKey &&
      row.expiresAt - now > PRESENCE_TTL_MS - PRESENCE_REFRESH_MS
    ) {
      return { written: false as const, expiresAt: row.expiresAt };
    }
    const fields = {
      menuServiceId: args.menuServiceId,
      entityType: args.entityType,
      entityKey: args.entityKey,
      expiresAt,
      updatedAt: now,
    };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("menuEditorPresence", { userId, sessionId: args.sessionId, ...fields });
    return { written: true as const, expiresAt };
  },
});

/** "I closed the editor": removes this session's row at once. */
export const leave = mutation({
  args: { menuServiceId: v.id("menuServices"), sessionId: v.string() },
  handler: async (ctx, args) => {
    const access = await requireMenuAccessToRow(ctx, args.menuServiceId, "menu.read");
    const rows = await ctx.db
      .query("menuEditorPresence")
      .withIndex("by_userId_and_sessionId", (q) =>
        q.eq("userId", access.user._id).eq("sessionId", args.sessionId),
      )
      .take(5);
    for (const row of rows) await ctx.db.delete(row._id);
    return null;
  },
});

/**
 * Everyone in this service's editor right now (rows that expire after
 * `nowBucket`, the client clock quantized to ~15 s), one entry per person and
 * entity. null for every refusal.
 */
export const listForService = query({
  args: { menuServiceId: v.id("menuServices"), nowBucket: v.number() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    if (!Number.isFinite(args.nowBucket)) return { entries: [] };
    const rows = await ctx.db
      .query("menuEditorPresence")
      .withIndex("by_menuServiceId_and_expiresAt", (q) =>
        q.eq("menuServiceId", args.menuServiceId).gt("expiresAt", args.nowBucket),
      )
      .take(MAX_PRESENCE_ROWS);
    const names = new Map<Id<"users">, string | null>();
    const seen = new Set<string>();
    const entries: {
      userId: Id<"users">;
      name: string | null;
      isMe: boolean;
      entityType: string | null;
      entityKey: string | null;
      since: number;
    }[] = [];
    for (const row of rows) {
      const id = `${row.userId}|${row.entityType ?? ""}|${row.entityKey ?? ""}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (!names.has(row.userId)) {
        const user = await ctx.db.get(row.userId);
        names.set(row.userId, user?.name ?? user?.email ?? null);
      }
      entries.push({
        userId: row.userId,
        name: names.get(row.userId) ?? null,
        isMe: row.userId === access.user._id,
        entityType: row.entityType ?? null,
        entityKey: row.entityKey ?? null,
        since: row.updatedAt,
      });
    }
    return { entries };
  },
});

/** Cron: deletes rows that expired more than a minute ago, in batches. */
export const cleanupExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("menuEditorPresence")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", Date.now() - CLEANUP_GRACE_MS))
      .take(CLEANUP_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === CLEANUP_BATCH) {
      await ctx.scheduler.runAfter(0, internal.menuPresence.cleanupExpired, {});
    }
    return null;
  },
});
