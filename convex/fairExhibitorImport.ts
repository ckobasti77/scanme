import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isAdminEmail } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { createEventOnlyClient } from "./fairAdmin";
import { fairEventByCode, upsertFairParticipation } from "./lib/fairCatalog";
import { normalizeWebsiteUrl } from "../lib/admin-v1/website";
import {
  ELEKTROMOBILNOST_2026_EXHIBITORS,
  FAIR_SITE_EXHIBITORS_SOURCE,
  fairSiteExhibitorCodes,
  fairSiteLogoUrl,
  type FairSiteExhibitor,
} from "../lib/fair-import/izlagaci-2026";

// Izlagači 2026 — internal, idempotent writes of the organizer's exhibitor
// list (lib/fair-import/izlagaci-2026.ts) into one event, plus linking an
// event to an existing QR inventory business. Run from the CLI by the ScanMe
// team (`npx convex run fairExhibitorImport:...`), never from the browser.
//
//  - An exhibitor = the same canonical event-only client that
//    fairAdmin.createEventClient writes (createEventOnlyClient: account,
//    contact, business, read models, audit) + one active participation.
//    The organizer's list has no people, so the required default contact is
//    an explicit placeholder ("Kontakt nije unet") the team edits in the
//    client profile once the exhibitor's application arrives — never a
//    made-up person, e-mail or phone.
//  - Idempotent by the stable codes (SMK/SML/participation key). A second
//    run changes nothing; it only fills a website or logo that is still
//    missing, so a value the team edited by hand is never overwritten.

const LISTS = { "elektromobilnost-2026": ELEKTROMOBILNOST_2026_EXHIBITORS } as const;
type ListKey = keyof typeof LISTS;

const counts = v.object({ created: v.number(), updated: v.number(), unchanged: v.number() });

/** The required default contact of an imported exhibitor until the real one is entered (no e-mail, no phone). */
export const FAIR_SITE_PLACEHOLDER_CONTACT = { firstName: "Kontakt", lastName: "nije unet", positionTitle: "Popuniti iz prijave izlagača" } as const;

async function requireImportActor(ctx: MutationCtx, ownerEmail: string): Promise<Doc<"users">> {
  const email = ownerEmail.trim().toLowerCase();
  const user = (await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first())
    ?? (await ctx.db.query("users").withIndex("email", (q) => q.eq("email", ownerEmail.trim())).first());
  if (!user || !isAdminEmail(user.email)) throw new Error("fair_exhibitor_import_admin_missing");
  return user;
}

type Tally = { created: number; updated: number; unchanged: number };
const tally = (): Tally => ({ created: 0, updated: 0, unchanged: 0 });

async function upsertSiteExhibitorClient(
  ctx: MutationCtx,
  exhibitor: FairSiteExhibitor,
  actorUserId: Id<"users">,
  now: number,
): Promise<{ accountId: Id<"accounts">; businessId: Id<"businesses">; result: "created" | "updated" | "unchanged" }> {
  const codes = fairSiteExhibitorCodes(exhibitor.key);
  const websiteUrl = exhibitor.websiteUrl ? normalizeWebsiteUrl(exhibitor.websiteUrl) : null;
  if (exhibitor.websiteUrl && !websiteUrl) throw new Error(`fair_exhibitor_import_website_invalid:${exhibitor.key}`);
  const logoUrl = fairSiteLogoUrl(exhibitor);

  const account = await ctx.db.query("accounts").withIndex("by_smkCode", (q) => q.eq("smkCode", codes.smkCode)).first();
  if (account) {
    const business = await ctx.db.query("businesses").withIndex("by_smlCode", (q) => q.eq("smlCode", codes.smlCode)).first();
    if (!business || business.accountId !== account._id) throw new Error(`fair_exhibitor_import_business_conflict:${exhibitor.key}`);
    let changed = false;
    if (websiteUrl && !account.websiteUrl) {
      await ctx.db.patch(account._id, { websiteUrl, updatedAt: now });
      changed = true;
    }
    if (!business.logoUrl && !business.logoStorageId) {
      await ctx.db.patch(business._id, { logoUrl, updatedAt: now });
      changed = true;
    }
    return { accountId: account._id, businessId: business._id, result: changed ? "updated" : "unchanged" };
  }

  const name = exhibitor.name.trim();
  const created = await createEventOnlyClient(ctx, {
    accountName: name,
    ownerDisplayName: name,
    smkCode: codes.smkCode,
    contact: { ...FAIR_SITE_PLACEHOLDER_CONTACT },
    venue: { name, slug: codes.slug, smlCode: codes.smlCode },
  }, actorUserId, now);
  await ctx.db.patch(created.accountId, { ...(websiteUrl ? { websiteUrl } : {}), updatedAt: now });
  await ctx.db.patch(created.businessId, { logoUrl, updatedAt: now });
  await writeAdminAudit(ctx, {
    actorUserId,
    accountId: created.accountId,
    businessId: created.businessId,
    action: "fair_site_exhibitor_created",
    detail: { key: exhibitor.key, smkCode: codes.smkCode, source: FAIR_SITE_EXHIBITORS_SOURCE },
    now,
  });
  return { accountId: created.accountId, businessId: created.businessId, result: "created" };
}

/**
 * Writes the organizer's exhibitor list into the event `eventCode`:
 * `npx convex run fairExhibitorImport:importSiteExhibitors
 *   '{"ownerEmail":"<admin>","eventCode":"elektromobilnost-2026","list":"elektromobilnost-2026"}'`
 */
export const importSiteExhibitors = internalMutation({
  args: { ownerEmail: v.string(), eventCode: v.string(), list: v.literal("elektromobilnost-2026") },
  returns: v.object({ exhibitors: v.number(), clients: counts, participations: counts }),
  handler: async (ctx, args) => {
    const actor = await requireImportActor(ctx, args.ownerEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_exhibitor_import_event_missing");
    const now = Date.now();
    const clients = tally();
    const participations = tally();
    const list = LISTS[args.list as ListKey];
    for (const exhibitor of list) {
      const client = await upsertSiteExhibitorClient(ctx, exhibitor, actor._id, now);
      clients[client.result] += 1;
      const participation = await upsertFairParticipation(ctx, {
        eventId: event._id,
        externalKey: fairSiteExhibitorCodes(exhibitor.key).participationKey,
        accountId: client.accountId,
        businessId: client.businessId,
        status: "active",
      }, now);
      participations[participation.result] += 1;
    }
    if (clients.created || clients.updated || participations.created || participations.updated) {
      await writeAdminAudit(ctx, {
        actorUserId: actor._id,
        action: "fair_site_exhibitors_imported",
        detail: { eventCode: event.code, list: args.list, clients, participations },
        now,
      });
    }
    return { exhibitors: list.length, clients, participations };
  },
});

/**
 * Points one event at an existing QR inventory business (by its SML code),
 * e.g. the printed SA26 inventory of convex/fairPrintInventory.ts:
 * `npx convex run fairExhibitorImport:linkEventQrInventory
 *   '{"ownerEmail":"<admin>","eventCode":"…","inventorySmlCode":"SML-SAJAM-26-QR"}'`.
 * Existing QR assignments are not touched.
 */
export const linkEventQrInventory = internalMutation({
  args: { ownerEmail: v.string(), eventCode: v.string(), inventorySmlCode: v.string() },
  returns: v.object({
    result: v.union(v.literal("updated"), v.literal("unchanged")),
    inventoryBusinessId: v.id("businesses"),
    previousInventoryBusinessId: v.union(v.id("businesses"), v.null()),
  }),
  handler: async (ctx, args) => {
    const actor = await requireImportActor(ctx, args.ownerEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_exhibitor_import_event_missing");
    const smlCode = args.inventorySmlCode.trim().toUpperCase();
    const inventory = await ctx.db.query("businesses").withIndex("by_smlCode", (q) => q.eq("smlCode", smlCode)).first();
    if (!inventory) throw new Error("fair_qr_inventory_business_missing");
    const previous = event.qrInventoryBusinessId ?? null;
    if (previous === inventory._id) return { result: "unchanged" as const, inventoryBusinessId: inventory._id, previousInventoryBusinessId: previous };
    const now = Date.now();
    await ctx.db.patch(event._id, { qrInventoryBusinessId: inventory._id, updatedAt: now });
    await writeAdminAudit(ctx, {
      actorUserId: actor._id,
      businessId: inventory._id,
      action: "fair_event_qr_inventory_linked",
      detail: { eventCode: event.code, inventorySmlCode: smlCode, previousInventoryBusinessId: previous },
      now,
    });
    return { result: "updated" as const, inventoryBusinessId: inventory._id, previousInventoryBusinessId: previous };
  },
});
