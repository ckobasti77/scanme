// The admin audit trail writer (RFC-002 §2.6, TASK-32). Every admin mutation
// that changes a plan, a payment, a billing cycle, an entitlement, or a
// service's active state writes one row IN THE SAME TRANSACTION — who, what,
// when. Paid things are granted by hand; without this log the first dispute is
// unresolvable. `detail` is a machine-parseable JSON summary; prose is
// localized in the UI, never stored.

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function writeAdminAudit(
  ctx: MutationCtx,
  entry: {
    actorUserId: Id<"users">;
    accountId?: Id<"accounts">;
    businessId?: Id<"businesses">;
    /** Machine-parseable slug, e.g. "record_payment" | "void_payment" | "set_next_billing" | "create_order". */
    action: string;
    detail?: Record<string, unknown>;
    now: number;
  },
): Promise<Id<"adminAuditLog">> {
  return ctx.db.insert("adminAuditLog", {
    actorUserId: entry.actorUserId,
    ...(entry.accountId ? { accountId: entry.accountId } : {}),
    ...(entry.businessId ? { businessId: entry.businessId } : {}),
    action: entry.action,
    ...(entry.detail ? { detail: JSON.stringify(entry.detail) } : {}),
    createdAt: entry.now,
  });
}
