import { v, type Infer } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { isAdminEmail } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { createEventOnlyClient } from "./fairAdmin";
import { fairEventByCode, upsertFairParticipation, upsertFairStand } from "./lib/fairCatalog";
import { normalizeWebsiteUrl } from "../lib/admin-v1/website";
import { fairMapLocationById, isFairMapStandLocation } from "../lib/fair-map";
import {
  ELEKTROMOBILNOST_2026_EXHIBITORS,
  FAIR_SITE_EXHIBITORS_SOURCE,
  fairSiteExhibitorCodes,
  fairSiteExhibitorMapZone,
  fairSiteLogoUrl,
  fairSiteStandFields,
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
//  - N3 placeSiteExhibitors: the same list on the organizer map (stands,
//    category, zone), with the same rules: idempotent, no overwrite.

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

const placeSkipReason = v.union(
  v.literal("no_map_location"),
  v.literal("participation_missing"),
  v.literal("participation_withdrawn"),
  v.literal("location_not_on_map"),
  v.literal("stand_withdrawn"),
  v.literal("stand_edited"),
  v.literal("stand_exists_for_location"),
);
type PlaceSkip = { key: string; reason: Infer<typeof placeSkipReason>; mapLocationId?: string };

/**
 * N3 — puts the organizer's exhibitors on the map of event `eventCode`
 * (after importSiteExhibitors): one fairStands row per (participation,
 * location) of lib/fair-import/izlagaci-2026.ts, stable key
 * `izl26-<key>-<mapLocationId>`, `code` = the organizer's label (a later car
 * import finds the stand by it), plus the participation's map category and,
 * for an exhibitor without a place on the map, the zone the organizer names.
 * Idempotent: a second run writes nothing. Never overwrites a hand edit (a
 * changed stand, a category or zone set by hand) and never withdraws or
 * revives anything; what it leaves alone is reported with a reason.
 * `npx convex run fairExhibitorImport:placeSiteExhibitors
 *   '{"ownerEmail":"<admin>","eventCode":"elektromobilnost-2026","list":"elektromobilnost-2026"}'`
 */
export const placeSiteExhibitors = internalMutation({
  args: { ownerEmail: v.string(), eventCode: v.string(), list: v.literal("elektromobilnost-2026") },
  returns: v.object({
    exhibitors: v.number(),
    stands: counts,
    participations: counts,
    skipped: v.array(v.object({ key: v.string(), reason: placeSkipReason, mapLocationId: v.optional(v.string()) })),
  }),
  handler: async (ctx, args) => {
    const actor = await requireImportActor(ctx, args.ownerEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_exhibitor_import_event_missing");
    const now = Date.now();
    const stands = tally();
    const participations = tally();
    const skipped: PlaceSkip[] = [];
    const list = LISTS[args.list as ListKey];
    for (const exhibitor of list) {
      const participation = await ctx.db
        .query("fairParticipations")
        .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", fairSiteExhibitorCodes(exhibitor.key).participationKey))
        .unique();
      if (!participation) {
        skipped.push({ key: exhibitor.key, reason: "participation_missing" });
        continue;
      }
      if (participation.status === "withdrawn") {
        skipped.push({ key: exhibitor.key, reason: "participation_withdrawn" });
        continue;
      }
      // Map data on the participation: only what is still missing.
      const fill = {
        ...(participation.category === undefined ? { category: exhibitor.category } : {}),
        ...(!exhibitor.locations.length && participation.mapZoneId === undefined ? { mapZoneId: fairSiteExhibitorMapZone(exhibitor.zone) } : {}),
      };
      if (Object.keys(fill).length) {
        await ctx.db.patch(participation._id, { ...fill, updatedAt: now });
        participations.updated += 1;
      } else {
        participations.unchanged += 1;
      }
      if (!exhibitor.locations.length) {
        skipped.push({ key: exhibitor.key, reason: "no_map_location" });
        continue;
      }
      const own = await ctx.db
        .query("fairStands")
        .withIndex("by_eventId_and_participationId", (q) => q.eq("eventId", event._id).eq("participationId", participation._id))
        .take(100);
      for (const mapLocationId of exhibitor.locations) {
        const hit = fairMapLocationById(event.code, mapLocationId);
        if (!hit || !isFairMapStandLocation(event.code, mapLocationId)) {
          skipped.push({ key: exhibitor.key, reason: "location_not_on_map", mapLocationId });
          continue;
        }
        const fields = fairSiteStandFields(exhibitor.key, hit.location);
        const existing = own.find((stand) => stand.externalKey === fields.externalKey) ?? null;
        if (existing) {
          if (existing.status === "withdrawn") skipped.push({ key: exhibitor.key, reason: "stand_withdrawn", mapLocationId });
          else if (existing.code !== fields.code || existing.displayName !== fields.displayName || existing.mapLocationId !== mapLocationId) {
            skipped.push({ key: exhibitor.key, reason: "stand_edited", mapLocationId });
          } else stands.unchanged += 1;
          continue;
        }
        // A stand the team made by hand for this exhibitor on this location already covers it.
        if (own.some((stand) => stand.mapLocationId === mapLocationId && stand.status !== "withdrawn")) {
          skipped.push({ key: exhibitor.key, reason: "stand_exists_for_location", mapLocationId });
          continue;
        }
        const { standId } = await upsertFairStand(ctx, {
          eventId: event._id,
          participationId: participation._id,
          externalKey: fields.externalKey,
          code: fields.code,
          displayName: fields.displayName,
          mapLocationId,
          status: "active",
        }, now);
        own.push((await ctx.db.get(standId))!);
        stands.created += 1;
      }
    }
    if (stands.created || participations.updated) {
      await writeAdminAudit(ctx, {
        actorUserId: actor._id,
        action: "fair_site_exhibitors_placed",
        detail: { eventCode: event.code, list: args.list, stands, participations, skipped: skipped.length },
        now,
      });
    }
    return { exhibitors: list.length, stands, participations, skipped };
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
