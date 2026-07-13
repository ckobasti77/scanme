import { getAuthUserId } from "@convex-dev/auth/server";
import { env, type MutationCtx, type QueryCtx } from "../_generated/server";
import { requireSlug } from "./validation";

type DatabaseCtx = QueryCtx | MutationCtx;

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
  const user = await requireAuthUser(ctx);
  const slug = requireSlug(rawSlug);
  const link = await ctx.db
    .query("dynamicLinks")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!link) throw new Error("Panel nije pronađen.");

  const business = await ctx.db.get(link.businessId);
  if (!business || business.status === "inactive") {
    throw new Error("Panel nije dostupan.");
  }

  if (isAdminEmail(user.email)) {
    return { user, business, link, membership: null, accessRole: "admin" as const };
  }

  const membership = await ctx.db
    .query("businessMemberships")
    .withIndex("by_userId_and_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", link.businessId),
    )
    .unique();
  if (!membership?.active) throw new Error("Nemate pristup ovom lokalu.");

  return { user, business, link, membership, accessRole: "viewer" as const };
}
