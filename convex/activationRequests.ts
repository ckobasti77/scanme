import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAdmin, requireAuthUser } from "./lib/access";

const requestedServiceValidator = v.union(
  v.literal("scanme_links"),
  v.literal("google_review"),
);

export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    requestedService: requestedServiceValidator,
  },
  handler: async (ctx, args) => {
    const user = await requireAuthUser(ctx);
    const membership = await ctx.db
      .query("businessMemberships")
      .withIndex("by_userId_and_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId),
      )
      .unique();
    if (!membership?.active) throw new Error("Nemate pristup ovom lokalu.");
    const profile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", args.requestedService),
      )
      .unique();
    if (!profile) throw new Error("Servis nije pronađen.");
    if (profile.status === "active") throw new Error("Servis je već aktivan.");
    const existing = await ctx.db
      .query("serviceActivationRequests")
      .withIndex("by_businessId_and_requestedService", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("requestedService", args.requestedService),
      )
      .order("desc")
      .take(10);
    const open = existing.find((request) => request.status !== "closed");
    if (open) return { status: "duplicate" as const, requestId: open._id };

    const contacts = await ctx.db
      .query("businessContacts")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .take(50);
    const contact =
      contacts.find((row) => row.authUserId === user._id && row.status !== "inactive") ??
      contacts.find((row) => row.status !== "inactive") ??
      null;
    const now = Date.now();
    const requestId = await ctx.db.insert("serviceActivationRequests", {
      businessId: args.businessId,
      serviceProfileId: profile._id,
      requestedService: args.requestedService,
      ...(contact ? { contactId: contact._id } : {}),
      status: "new",
      requestedAt: now,
      updatedAt: now,
      emailStatus: "queued",
    });
    await ctx.scheduler.runAfter(
      0,
      internal.activationRequestEmails.sendActivationRequest,
      { requestId },
    );
    return { status: "created" as const, requestId };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const requests = await ctx.db
      .query("serviceActivationRequests")
      .withIndex("by_status_and_requestedAt")
      .order("desc")
      .take(100);
    return await Promise.all(
      requests.map(async (request) => {
        const [business, contact] = await Promise.all([
          ctx.db.get(request.businessId),
          request.contactId ? ctx.db.get(request.contactId) : null,
        ]);
        return {
          id: request._id,
          businessName: business?.name ?? "Nepoznat lokal",
          businessId: request.businessId,
          requestedService: request.requestedService,
          status: request.status,
          requestedAt: request.requestedAt,
          emailStatus: request.emailStatus,
          emailFailureReason: request.emailFailureReason ?? null,
          contact: contact
            ? {
                name: `${contact.firstName} ${contact.lastName}`.trim(),
                email: contact.normalizedEmail,
                phone: contact.phone,
              }
            : null,
        };
      }),
    );
  },
});

export const setStatus = mutation({
  args: {
    requestId: v.id("serviceActivationRequests"),
    status: v.union(v.literal("new"), v.literal("contacted"), v.literal("closed")),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Upit nije pronađen.");
    await ctx.db.patch(request._id, { status: args.status, updatedAt: Date.now() });
    return { updated: true };
  },
});

