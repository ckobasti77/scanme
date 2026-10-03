import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

// Shared POC contact view used by both admin modules (ScanMe Review and ScanMe Links) so
// their POC access cards render from an identical shape: the active contacts (falling back
// to the most recent inactive one when none are active), each with its latest invitation.
export async function buildBusinessContactViews(
  ctx: QueryCtx,
  businessId: Id<"businesses">,
) {
  const contactRows = await ctx.db
    .query("businessContacts")
    .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
    .order("asc")
    .take(50);
  const activeContactRows = contactRows.filter(
    (contact) => contact.status !== "inactive",
  );
  const orderedContactRows = activeContactRows.length
    ? activeContactRows
    : contactRows.length
      ? [contactRows[contactRows.length - 1]]
      : [];
  const contacts = await Promise.all(
    orderedContactRows.map(async (contact) => {
      const invitations = await ctx.db
        .query("businessInvitations")
        .withIndex("by_contactId", (q) => q.eq("contactId", contact._id))
        .order("desc")
        .take(1);
      const invitation = invitations[0] ?? null;
      return {
        id: contact._id,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.normalizedEmail,
        phone: contact.phone,
        positionTitle: contact.positionTitle,
        status: contact.status,
        invitation: invitation
          ? {
              id: invitation._id,
              status: invitation.status,
              expiresAt: invitation.expiresAt,
              failureReason: invitation.failureReason ?? null,
              sentAt: invitation.sentAt ?? null,
            }
          : null,
      };
    }),
  );
  const contact = contacts[0] ?? null;
  return { contact, contacts, invitation: contact?.invitation ?? null };
}
