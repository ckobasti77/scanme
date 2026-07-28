import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getEmailData = internalQuery({
  args: { requestId: v.id("serviceActivationRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request || request.emailStatus !== "queued") return null;
    const business = await ctx.db.get(request.businessId);
    if (!business) return null;
    const contact = request.contactId ? await ctx.db.get(request.contactId) : null;
    return { request, business, contact };
  },
});

export const markEmailSent = internalMutation({
  args: {
    requestId: v.id("serviceActivationRequests"),
    messageId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      emailStatus: "sent",
      emailMessageId: args.messageId,
      emailFailureReason: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const markEmailFailed = internalMutation({
  args: {
    requestId: v.id("serviceActivationRequests"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.requestId, {
      emailStatus: "failed",
      emailFailureReason: args.reason.slice(0, 500),
      updatedAt: Date.now(),
    });
    return null;
  },
});

