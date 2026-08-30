import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireSlug } from "./validation";
// Convex CAN import the typed i18n dictionary: it is pure data + a pure
// formatter with no React/Next/Node dependency, so it bundles into the Convex
// runtime exactly as `../lib/scanme-links-design` already does for
// convex/scanMeLinks.ts. See TASK-04 report.
import { fmt, getDict } from "../../lib/i18n";

type DatabaseCtx = QueryCtx | MutationCtx;

export class BusinessAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BusinessAccessDeniedError";
  }
}

function denyBusinessAccess(message: string): never {
  throw new BusinessAccessDeniedError(message);
}

function selectPrimaryLink(links: Doc<"dynamicLinks">[]) {
  return links.reduce<Doc<"dynamicLinks"> | null>((selected, link) => {
    if (!selected) return link;
    if (link.active !== selected.active) return link.active ? link : selected;
    return link.updatedAt > selected.updatedAt ? link : selected;
  }, null);
}

export function adminEmails() {
  return new Set(
    (env.SCANME_ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminEmail(email: string | undefined) {
  return Boolean(email && adminEmails().has(email.trim().toLowerCase()));
}

export async function requireAuthUser(ctx: DatabaseCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new ConvexError("Niste prijavljeni.");
  const user = await ctx.db.get(userId);
  if (!user) throw new ConvexError("Korisnički nalog nije pronađen.");
  return user;
}

export async function requireAdmin(ctx: DatabaseCtx) {
  const user = await requireAuthUser(ctx);
  if (!isAdminEmail(user.email)) throw new ConvexError("Nemate administratorski pristup.");
  return user;
}

// Shared prefix: authenticate, resolve the business (by slug or by business
// id), and enforce the active-status gate. No `dynamicLinks` lookup — that is
// specific to the Google Review panel (see requireGoogleReviewPanelBySlug).
async function resolveBusinessForAccess(ctx: DatabaseCtx, slugOrId: string) {
  const userId = await getAuthUserId(ctx);
  if (!userId) denyBusinessAccess("Niste prijavljeni.");
  const user = await ctx.db.get(userId);
  if (!user) denyBusinessAccess("Korisnički nalog nije pronađen.");
  const businessId = ctx.db.normalizeId("businesses", slugOrId);
  const business = businessId
    ? await ctx.db.get(businessId)
    : await ctx.db
        .query("businesses")
        .withIndex("by_slug", (q) => q.eq("slug", requireSlug(slugOrId)))
        .unique();
  if (!business || business.status === "inactive") {
    denyBusinessAccess("Panel nije dostupan.");
  }
  return { user, business };
}

// Admin passes with no membership; otherwise an active membership is required.
async function requireAdminOrActiveMembership(
  ctx: DatabaseCtx,
  user: Doc<"users">,
  business: Doc<"businesses">,
) {
  if (isAdminEmail(user.email)) {
    return { membership: null, accessRole: "admin" as const };
  }
  const membership = await ctx.db
    .query("businessMemberships")
    .withIndex("by_userId_and_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", business._id),
    )
    .unique();
  if (!membership?.active) denyBusinessAccess("Nemate pristup ovom lokalu.");
  return { membership, accessRole: "viewer" as const };
}

// Product-agnostic panel access: a business owning any service (or none yet)
// can reach its own panel. No `dynamicLinks` requirement (RFC-001 §2.1).
export async function requireBusinessAccess(ctx: DatabaseCtx, slugOrId: string) {
  const { user, business } = await resolveBusinessForAccess(ctx, slugOrId);
  const { membership, accessRole } = await requireAdminOrActiveMembership(
    ctx,
    user,
    business,
  );
  return { user, business, membership, accessRole };
}

// The legacy Google Review panel access, preserving today's exact return shape
// (including `link`) and check order so existing clientPanel.ts callers are
// untouched: business → link → admin-or-membership.
export async function requireGoogleReviewPanelBySlug(
  ctx: DatabaseCtx,
  rawSlug: string,
) {
  const { user, business } = await resolveBusinessForAccess(ctx, rawSlug);
  const links = await ctx.db
    .query("dynamicLinks")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", business._id).eq("type", "google_review"),
    )
    .order("desc")
    .take(20);
  const link = selectPrimaryLink(links);
  if (!link) denyBusinessAccess("Panel nije pronađen.");
  const { membership, accessRole } = await requireAdminOrActiveMembership(
    ctx,
    user,
    business,
  );
  return { user, business, link, membership, accessRole };
}

// Brand product names. These are proper nouns, not localizable prose, so they
// stay as code constants; the localizable sentence they slot into now lives in
// the typed dictionary (lib/i18n/sr/venue-editor.ts), resolving the TASK-03
// TODO(i18n).
const SERVICE_PRODUCT_NAMES: Record<Doc<"serviceProfiles">["type"], string> = {
  scanme_links: "ScanMe Links",
  google_review: "Google Review",
  scanme_venue: "ScanMe Venue",
  scanme_memories: "ScanMe Memories",
};

// Editor access, lifted from convex/scanMeLinks.ts and parameterized by the
// service types the call site allows (RFC-001 §2.1). Links passes
// ["scanme_links"] and behaves identically to the former requireEditorAccess.
export async function requireServiceEditorAccess(
  ctx: DatabaseCtx,
  profile: Doc<"serviceProfiles">,
  allowedTypes: readonly Doc<"serviceProfiles">["type"][],
) {
  if (!allowedTypes.includes(profile.type)) {
    throw new ConvexError("Servisni profil nije pronađen.");
  }
  const user = await requireAuthUser(ctx);
  if (isAdminEmail(user.email)) return { role: "admin" as const, user };
  if (!profile.clientEditingEnabled) {
    const productName = SERVICE_PRODUCT_NAMES[profile.type];
    throw new ConvexError(
      fmt(getDict("venue-editor").editorAccessDisabled, {
        product: productName,
      }),
    );
  }
  const membership = await ctx.db
    .query("businessMemberships")
    .withIndex("by_userId_and_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", profile.businessId),
    )
    .unique();
  if (!membership?.active) {
    throw new ConvexError("Nemate pristup ovom lokalu.");
  }
  return { role: "client" as const, user };
}
