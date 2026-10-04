import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { buildBusinessContactViews } from "./lib/contacts";

// TASK-59 (RFC-003 §2.10) data read for the item-inquiry email: given a
// PUBLISHED menu item, resolve the business name, the item name, and the
// owner contact email the "Upit" mail goes to. Reuses the shared POC contact
// picker (active contact, falling back to the most recent inactive one) so
// this surface does not invent a second "who is the owner" rule.
export const getInquiryEmailData = internalQuery({
  args: { itemId: v.id("menuItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) return null;
    const menu = await ctx.db.get(item.menuId);
    if (!menu || menu.status !== "published") return null;
    const business = await ctx.db.get(menu.businessId);
    if (!business) return null;
    const { contact } = await buildBusinessContactViews(ctx, business._id);
    return {
      itemName: item.name,
      businessName: business.name,
      contactEmail: contact?.email ?? null,
    };
  },
});
