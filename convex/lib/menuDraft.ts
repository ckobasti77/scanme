import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MENU_ERROR } from "../../lib/menu/errors/core";
import type { MenuAuditAction } from "../../lib/menu/audit";

// ScanMe Menu V1 — draft bookkeeping and the background audit writer (K02).
// Every draft mutation calls touchDraft EXACTLY ONCE: it bumps the draft
// revision (K05 publishes against it), records who edited last and keeps the
// exact article count behind MENU_MAX_ARTICLES. One write per mutation.

type DatabaseCtx = QueryCtx | MutationCtx;

export async function loadDraftState(
  ctx: DatabaseCtx,
  menuServiceId: Id<"menuServices">,
): Promise<Doc<"menuDraftState">> {
  const state = await ctx.db
    .query("menuDraftState")
    .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
    .unique();
  if (!state) throw new ConvexError(MENU_ERROR.notFound);
  return state;
}

export async function touchDraft(
  ctx: MutationCtx,
  menuServiceId: Id<"menuServices">,
  // null = a system edit (K06 migration): "who edited last" becomes nobody.
  userId: Id<"users"> | null,
  change: { articleDelta?: number } = {},
): Promise<number> {
  const state = await loadDraftState(ctx, menuServiceId);
  const revision = state.revision + 1;
  await ctx.db.patch(state._id, {
    revision,
    articleCount: Math.max(0, state.articleCount + (change.articleDelta ?? 0)),
    lastEditAt: Date.now(),
    lastEditByUserId: userId ?? undefined,
  });
  return revision;
}

const MAX_AUDIT_DETAIL_KEYS = 20;

export async function writeMenuAudit(
  ctx: MutationCtx,
  entry: {
    menuServiceId: Id<"menuServices">;
    actorKind: Doc<"menuAuditLog">["actorKind"];
    actorUserId?: Id<"users">;
    actorRef?: string;
    action: MenuAuditAction;
    entityType?: string;
    entityKey?: string;
    details?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  const details =
    entry.details && Object.keys(entry.details).length > 0
      ? Object.fromEntries(Object.entries(entry.details).slice(0, MAX_AUDIT_DETAIL_KEYS))
      : undefined;
  await ctx.db.insert("menuAuditLog", {
    menuServiceId: entry.menuServiceId,
    actorKind: entry.actorKind,
    ...(entry.actorUserId ? { actorUserId: entry.actorUserId } : {}),
    ...(entry.actorRef ? { actorRef: entry.actorRef } : {}),
    action: entry.action,
    ...(entry.entityType ? { entityType: entry.entityType } : {}),
    ...(entry.entityKey ? { entityKey: entry.entityKey } : {}),
    ...(details ? { details } : {}),
    createdAt: Date.now(),
  });
}

/** Audit actor kind of an account-user access (admin vs client user). */
export function auditActorKind(actor: string): "admin" | "user" {
  return actor === "admin" ? "admin" : "user";
}
