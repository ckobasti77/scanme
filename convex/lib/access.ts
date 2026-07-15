import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "../_generated/dataModel";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireSlug } from "./validation";

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
  if (!userId) throw new Error("Niste prijavljeni.");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("Korisnički nalog nije pronađen.");
  return user;
}

export async function requireAdmin(ctx: DatabaseCtx) {
  const user = await requireAuthUser(ctx);
  if (!isAdminEmail(user.email)) throw new Error("Nemate administratorski pristup.");
  return user;
}

export async function requireBusinessAccessBySlug(ctx: DatabaseCtx, rawSlug: string) {
  const userId = await getAuthUserId(ctx);
  if (!userId) denyBusinessAccess("Niste prijavljeni.");
  const user = await ctx.db.get(userId);
  if (!user) denyBusinessAccess("Korisnički nalog nije pronađen.");
  const slug = requireSlug(rawSlug);
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!business || business.status === "inactive") {
    denyBusinessAccess("Panel nije dostupan.");
  }
  const links = await ctx.db
    .query("dynamicLinks")
    .withIndex("by_businessId_and_type", (q) =>
      q.eq("businessId", business._id).eq("type", "google_review"),
    )
    .order("desc")
    .take(20);
  const link = selectPrimaryLink(links);
  if (!link) denyBusinessAccess("Panel nije pronađen.");

  if (isAdminEmail(user.email)) {
    return { user, business, link, membership: null, accessRole: "admin" as const };
  }

  const membership = await ctx.db
    .query("businessMemberships")
    .withIndex("by_userId_and_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", business._id),
    )
    .unique();
  if (!membership?.active) denyBusinessAccess("Nemate pristup ovom lokalu.");

  return { user, business, link, membership, accessRole: "viewer" as const };
}
