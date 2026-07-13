import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { acceptInvitationForUser, findInvitationByToken } from "./lib/invitations";

export const getStatus = query({
  args: { token: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const found = await findInvitationByToken(ctx, args.token, args.slug);
    if (!found) return { status: "invalid" as const };
    const { invitation } = found;
    if (invitation.expiresAt <= Date.now()) return { status: "expired" as const };
    if (invitation.status === "accepted") return { status: "accepted" as const };
    if (invitation.status === "revoked" || invitation.status === "expired") {
      return { status: invitation.status };
    }
    const contact = await ctx.db.get(invitation.contactId);
    const business = await ctx.db.get(invitation.businessId);
    if (!contact || !business) return { status: "invalid" as const };
    return {
      status: "valid" as const,
      email: invitation.normalizedEmail,
      firstName: contact.firstName,
      businessName: business.name,
    };
  },
});

export const claim = mutation({
  args: { token: v.string(), slug: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Prijavite se da biste prihvatili pozivnicu.");
    const found = await findInvitationByToken(ctx, args.token, args.slug);
    if (!found) throw new Error("Pozivnica nije ispravna.");
    if (found.invitation.status === "accepted") {
      const contact = await ctx.db.get(found.invitation.contactId);
      if (contact?.authUserId === userId) return { accepted: true };
      throw new Error("Pozivnica je već iskorišćena.");
    }
    await acceptInvitationForUser(ctx, found.invitation._id, userId);
    return { accepted: true };
  },
});

export const getEmailData = internalQuery({
  args: { invitationId: v.id("businessInvitations") },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation) return null;
    const contact = await ctx.db.get(invitation.contactId);
    const business = await ctx.db.get(invitation.businessId);
    const link = await ctx.db
      .query("dynamicLinks")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", invitation.businessId).eq("type", "google_review"),
      )
      .unique();
    if (!contact || !business || !link) return null;
    return { invitation, contact, business, slug: link.slug };
  },
});

export const prepareForSend = internalMutation({
  args: { invitationId: v.id("businessInvitations"), tokenHash: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.status === "revoked" || invitation.status === "accepted") {
      return false;
    }
    if (invitation.expiresAt <= Date.now()) {
      await ctx.db.patch(invitation._id, { status: "expired", updatedAt: Date.now() });
      return false;
    }
    await ctx.db.patch(invitation._id, {
      tokenHash: args.tokenHash,
      status: "queued",
      failureReason: undefined,
      updatedAt: Date.now(),
    });
    return true;
  },
});

export const markSent = internalMutation({
  args: { invitationId: v.id("businessInvitations"), resendEmailId: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.status === "revoked" || invitation.status === "accepted") return;
    await ctx.db.patch(invitation._id, {
      status: "sent",
      resendEmailId: args.resendEmailId,
      sentAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const markFailed = internalMutation({
  args: { invitationId: v.id("businessInvitations"), failureReason: v.string() },
  handler: async (ctx, args) => {
    const invitation = await ctx.db.get(args.invitationId);
    if (!invitation || invitation.status === "revoked" || invitation.status === "accepted") return;
    await ctx.db.patch(invitation._id, {
      status: "failed",
      failureReason: args.failureReason.slice(0, 300),
      failedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
