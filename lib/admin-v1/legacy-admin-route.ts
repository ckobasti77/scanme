import "server-only";

import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function readLegacyAdminLocation(businessId: string) {
  const token = await convexAuthNextjsToken();
  if (!token) return { access: "unauthenticated" as const };

  const me = await fetchQuery(api.admin.me, {}, { token });
  if (!me.isAdmin) return { access: "forbidden" as const };

  try {
    const location = await fetchQuery(
      api.admin.location,
      { businessId: businessId as Id<"businesses"> },
      { token },
    );
    return { access: "admin" as const, location };
  } catch (error) {
    if (
      error instanceof Error &&
      /argument validation|invalid.*id|expected.*id/i.test(error.message)
    ) {
      return { access: "admin" as const, location: null };
    }
    throw error;
  }
}
