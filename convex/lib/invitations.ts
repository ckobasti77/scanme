import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { resolveBusinessByScanMeSlug } from "./access";
import { normalizeEmail } from "./validation";

type DatabaseCtx = QueryCtx | MutationCtx;

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashInvitationToken(token: string) {
  const bytes = new TextEncoder().encode(token.trim());
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

export async function findInvitationByToken(ctx: DatabaseCtx, token: string, rawSlug: string) {
  if (token.length < 32 || token.length > 256) return null;
  const tokenHash = await hashInvitationToken(token);
  const invitation = await ctx.db
    .query("businessInvitations")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!invitation) return null;
  const resolved = await resolveBusinessByScanMeSlug(ctx, rawSlug);
  if (!resolved || resolved.business._id !== invitation.businessId) return null;
  return { invitation, ...resolved };
}

export async function acceptInvitationForUser(
  ctx: MutationCtx,
  invitationId: Id<"businessInvitations">,
  userId: Id<"users">,
) {
  const invitation = await ctx.db.get(invitationId);
  const user = await ctx.db.get(userId);
  if (!invitation || !user?.email) throw new Error("Pozivnica nije dostupna.");
  if (
    invitation.status !== "sent" &&
    invitation.status !== "queued" &&
    invitation.status !== "failed"
  ) {
    throw new Error("Pozivnica više nije aktivna.");
  }
  if (invitation.expiresAt <= Date.now()) {
    await ctx.db.patch(invitation._id, { status: "expired", updatedAt: Date.now() });
    throw new Error("Pozivnica je istekla. Zatražite novu od ScanMe administratora.");
  }
  if (normalizeEmail(user.email) !== invitation.normalizedEmail) {
    throw new Error("Pozivnica pripada drugoj email adresi.");
  }

  const now = Date.now();
  const membership = await ctx.db
    .query("businessMemberships")
    .withIndex("by_userId_and_businessId", (q) =>
      q.eq("userId", userId).eq("businessId", invitation.businessId),
    )
    .unique();
  if (membership) {
    await ctx.db.patch(membership._id, { active: true, updatedAt: now });
  } else {
    await ctx.db.insert("businessMemberships", {
      userId,
      businessId: invitation.businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  await ctx.db.patch(invitation.contactId, {
    authUserId: userId,
    status: "active",
    updatedAt: now,
  });
  await ctx.db.patch(invitation._id, {
    status: "accepted",
    acceptedAt: now,
    updatedAt: now,
  });
}
