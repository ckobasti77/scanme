import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { normalizeAdminSearchText } from "./adminV1Validators";

export async function upsertContactReadModel(
  ctx: MutationCtx,
  contactId: Id<"accountContacts">,
) {
  const contact = await ctx.db.get(contactId);
  if (!contact) throw new ConvexError("admin_search_contact_missing");
  const account = await ctx.db
    .query("adminClientReadModels")
    .withIndex("by_accountId", (q) => q.eq("accountId", contact.accountId))
    .unique();
  if (!account) throw new ConvexError("admin_search_account_projection_missing");
  const displayName = `${contact.firstName} ${contact.lastName}`.trim();
  const fields = {
    contactId: contact._id,
    accountId: contact.accountId,
    accountName: account.accountName,
    smkCode: account.smkCode,
    displayName,
    normalizedName: normalizeAdminSearchText(displayName),
    ...(contact.normalizedEmail ? { normalizedEmail: contact.normalizedEmail } : {}),
    ...(contact.normalizedPhone ? { normalizedPhone: contact.normalizedPhone } : {}),
    positionTitle: contact.positionTitle,
    status: contact.status,
    searchText: normalizeAdminSearchText([
      displayName,
      contact.normalizedEmail,
      contact.normalizedPhone,
      contact.positionTitle,
      account.accountName,
      account.smkCode,
    ].filter(Boolean).join(" ")),
    updatedAt: contact.updatedAt,
  };
  const existing = await ctx.db
    .query("adminContactReadModels")
    .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      ...fields,
      normalizedEmail: contact.normalizedEmail,
      normalizedPhone: contact.normalizedPhone,
    });
    return existing._id;
  }
  return ctx.db.insert("adminContactReadModels", fields);
}
