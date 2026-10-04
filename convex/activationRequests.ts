import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { serviceTypeValidator } from "./schema";
import { requireAdmin, requireAuthUser } from "./lib/access";
import { syncAutomaticAction } from "./lib/adminActionEngine";
import { syncServiceOperationReadModel } from "./lib/adminReadModelEngine";

const requestedServiceValidator = serviceTypeValidator;

async function syncCanonicalRequestAction(
  ctx: MutationCtx,
  request: Doc<"serviceActivationRequests">,
) {
  const [business, profile] = await Promise.all([
    ctx.db.get(request.businessId),
    ctx.db.get(request.serviceProfileId),
  ]);
  if (!business || !profile) return;
  const isOpen = request.status !== "closed";
  await syncAutomaticAction(ctx, {
    domain: "service_activation_request",
    sourceRecordId: request._id,
    causeKind: "activation_requested",
    sourceVersion: `${request.status}:${request.updatedAt}`,
    isOpen,
    ...(business.accountId ? { accountId: business.accountId } : {}),
    businessId: business._id,
    serviceProfileId: profile._id,
    severity: "information",
    relevantAt: request.updatedAt,
    priority: {
      blocking: false,
      overdue: false,
      dueToday: false,
      needsReply: false,
      graceOrWarning: false,
      waitingOn: "scanme",
    },
    contextHref: request.requestedService === "scanme_links"
      ? "/admin/usluge/links"
      : request.requestedService === "google_review"
        ? "/admin/usluge/review"
        : "/admin/usluge/meni",
    description: "Zahtev za aktivaciju usluge čeka obradu.",
  }, request.updatedAt);
  if (!business.accountId || !(["scanme_links", "google_review", "scanme_menu"] as const).includes(profile.type as "scanme_links" | "google_review" | "scanme_menu")) return;
  const subscription = await ctx.db
    .query("subscriptions")
    .withIndex("by_accountId_and_targetKey", (q) =>
      q.eq("accountId", business.accountId!).eq("targetKey", `service:${profile._id}`),
    )
    .unique();
  const state = subscription?.facts.status === "active" && subscription.facts.warning
    ? "warning"
    : subscription?.facts.status ?? "inactive";
  await syncServiceOperationReadModel(ctx, {
    accountId: business.accountId,
    businessId: business._id,
    serviceProfileId: profile._id,
    serviceType: profile.type as "scanme_links" | "google_review" | "scanme_menu",
    state,
    updatedAt: request.updatedAt,
  });
}

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
    if (!membership?.active) throw new ConvexError("Nemate pristup ovom lokalu.");
    const profile = await ctx.db
      .query("serviceProfiles")
      .withIndex("by_businessId_and_type", (q) =>
        q.eq("businessId", args.businessId).eq("type", args.requestedService),
      )
      .unique();
    if (!profile) throw new ConvexError("Servis nije pronađen.");
    if (profile.status === "active") throw new ConvexError("Servis je već aktivan.");
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
    const request = await ctx.db.get(requestId);
    if (request) await syncCanonicalRequestAction(ctx, request);
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
          // The stored `requestedService` is now the widened service union
          // (RFC-001 §2.1). The legacy admin activation table renders only the
          // two original services and is out of scope for this task (no new
          // product UI). Narrow to that consumer's shape at the boundary so the
          // untouched component keeps type-checking; the runtime value is
          // unchanged, and no venue/memories request exists to mislabel yet.
          requestedService: request.requestedService as
            | "scanme_links"
            | "google_review",
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
    if (!request) throw new ConvexError("Upit nije pronađen.");
    const updatedAt = Date.now();
    await ctx.db.patch(request._id, { status: args.status, updatedAt });
    await syncCanonicalRequestAction(ctx, { ...request, status: args.status, updatedAt });
    return { updated: true };
  },
});
