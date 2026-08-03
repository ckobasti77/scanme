import { ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { normalizeEmail, requireSlug } from "./validation";

type DatabaseCtx = QueryCtx | MutationCtx;

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashInvitationToken(token: string) {
  const bytes = new TextEncoder().encode(token.trim());
  return toHex(await crypto.subtle.digest("SHA-256", bytes));
}

export async function findInvitationByToken(ctx: DatabaseCtx, token: string, rawSlug: string) {
  const slug = requireSlug(rawSlug);
  if (token.length < 32 || token.length > 256) return null;
  const tokenHash = await hashInvitationToken(token);
  const invitation = await ctx.db
    .query("businessInvitations")
    .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
    .unique();
  if (!invitation) return null;
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!business || business._id !== invitation.businessId) return null;
  return { invitation, business };
}

export async function acceptInvitationForUser(
  ctx: MutationCtx,
  invitationId: Id<"businessInvitations">,
  userId: Id<"users">,
) {
  const invitation = await ctx.db.get(invitationId);
  const user = await ctx.db.get(userId);
  if (!invitation || !user?.email) throw new ConvexError("Pozivnica nije dostupna.");
  if (
    invitation.status !== "sent" &&
    invitation.status !== "queued" &&
    invitation.status !== "failed"
  ) {
    throw new ConvexError("Pozivnica više nije aktivna.");
  }
  if (invitation.expiresAt <= Date.now()) {
    await ctx.db.patch(invitation._id, { status: "expired", updatedAt: Date.now() });
    throw new ConvexError("Pozivnica je istekla. Zatražite novu od ScanMe administratora.");
  }
  if (normalizeEmail(user.email) !== invitation.normalizedEmail) {
    throw new ConvexError("Pozivnica pripada drugoj email adresi.");
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
