import { v } from "convex/values";
import { query } from "./_generated/server";
import { getMenuAccess, resolveMenuAccess } from "./lib/menuAccess";
import { getMenuCapabilities } from "./lib/menuCapabilities";
import { MENU_ERROR } from "../lib/menu/errors/core";

// =============================================================================
// ScanMe Menu V1 — the client panel shell (K08, master §13.1).
//
// Two small, self-bounded read models (the `clientPanel.venuePanel` shape):
//   - `entry`: does the existing client panel offer "Otvori ScanMe Menu"?
//   - `shellContext`: what the shell needs — the venue, the locked mode (shown,
//     never changed: master §4.1), the caller's role and the plan.
// Identity comes from ctx.auth through the one Menu access helper; the slug
// only names the venue. Neither query throws for access: the shell shows a
// screen for each refusal instead of an error toast. Later sections (K27+)
// add their own queries next to these.
// =============================================================================

/**
 * The ScanMe Menu entry of the existing client panel. `available` only when
 * the venue has an active Menu service the caller may open (`menu.read`);
 * everything else — no service, no role, service switched off, signed out —
 * is `none`, so a venue without ScanMe Menu sees its panel unchanged.
 */
export const entry = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { businessSlug: args.slug }, "menu.read");
    return access ? { status: "available" as const } : { status: "none" as const };
  },
});

/**
 * Everything the panel shell renders around a section.
 *   - `unauthenticated`: sign in first (the existing client panel login).
 *   - `forbidden`: no role here, or no Menu service at this venue — one answer
 *     for both, so the slug is not an oracle for which venues have Menu.
 *   - `inactive`: the caller has a role, but ScanMe switched the service off.
 *   - `available`: the venue, the mode, the actor and the plan. What each
 *     actor sees is decided on the client by lib/menu/panel-nav.ts from the
 *     same permission matrix the backend enforces; every section's own query
 *     checks its permission again.
 */
export const shellContext = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const outcome = await resolveMenuAccess(ctx, { businessSlug: args.slug });
    if (outcome === MENU_ERROR.unauthenticated) return { status: "unauthenticated" as const };
    if (outcome === MENU_ERROR.serviceInactive) return { status: "inactive" as const };
    if (typeof outcome === "string") return { status: "forbidden" as const };

    const { menuService, business } = outcome;
    const capabilities = await getMenuCapabilities(ctx, business._id);
    return {
      status: "available" as const,
      menuServiceId: menuService._id,
      business: { name: business.name, slug: business.slug },
      mode: menuService.mode,
      actor: outcome.actor,
      /** False when ScanMe switched client editing off; the Editor shows it (K10). */
      canEdit: outcome.canEdit,
      plan: capabilities.tier,
    };
  },
});
