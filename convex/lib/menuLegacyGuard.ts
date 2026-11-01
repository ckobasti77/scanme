import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { menuEditorSr } from "../../lib/i18n/sr/menu-editor";

// ScanMe Menu V1 (K06) — no double writes after the cutover (K01 §6). Once a
// Menu service has taken over a legacy menu (`migration.status === "cutover"`,
// set only by the internal menuMigration.cutoverLegacyMenu after the new model
// is published), the legacy writers refuse: the old editor, its publish and
// live "nema više", and the old admin import and publish. Before the cutover
// they work exactly as before. The message is plain text, the convention of
// the legacy surfaces (they show `ConvexError.data` as is).

const MAX_SERVICES_PER_LEGACY_MENU = 10;

export async function assertLegacyMenuWritable(
  ctx: MutationCtx,
  menuId: Id<"menus">,
): Promise<void> {
  const services = await ctx.db
    .query("menuServices")
    .withIndex("by_legacyMenuId", (q) => q.eq("legacyMenuId", menuId))
    .take(MAX_SERVICES_PER_LEGACY_MENU);
  if (services.some((service) => service.migration?.status === "cutover")) {
    throw new ConvexError(menuEditorSr.legacyMigrated);
  }
}
