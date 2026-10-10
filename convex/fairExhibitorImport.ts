import { v, type Infer } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isAdminEmail } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { createEventOnlyClient } from "./fairAdmin";
import { fairEventByCode, upsertFairParticipation, upsertFairStand } from "./lib/fairCatalog";
import { normalizeWebsiteUrl } from "../lib/admin-v1/website";
import { fairMapLocationById, isFairMapStandLocation } from "../lib/fair-map";
import { fairMapRelocationCandidates } from "../lib/fair-map/relocate";
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
//  - P2 (Aleksa 8. 10., SYNC §2.3): six brands of the list (JMEV, Mazda,
//    Chery, Foton, Ferum Yudo, Bentu) are exhibitors of Aleksa's intake
//    (convex/fairSetup.ts). In an event with that intake participation the
//    list makes no second record of them (import and place skip them), and
//    reconcileSiteExhibitorsWithIntake withdraws a record made before and
//    fills what the intake participation still lacks (category; logo and
//    website when one brand stands for it). Aleksa's participations, brands,
//    models and slugs are never renamed or duplicated.
//  - P2 (RN N6) listStandsOffMap: read-only list of stands on a location
//    that is not on today's map, with a proposal; nothing is moved.

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

/**
 * P2 — the intake participation that is this site exhibitor in the event
 * (any status: a withdrawn intake participation still never brings the site
 * record back), or null.
 */
async function intakeParticipationOf(ctx: QueryCtx, eventId: Id<"fairEvents">, exhibitor: FairSiteExhibitor) {
  if (!exhibitor.intakeParticipationKey) return null;
  const key = exhibitor.intakeParticipationKey;
  return ctx.db
    .query("fairParticipations")
    .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", eventId).eq("externalKey", key))
    .unique();
}

const coveredRow = v.object({ key: v.string(), intakeParticipationKey: v.string() });

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
 * P2: an exhibitor whose intake participation is in the event is `covered`
 * and gets no client and no participation here (the intake one is it).
 */
export const importSiteExhibitors = internalMutation({
  args: { ownerEmail: v.string(), eventCode: v.string(), list: v.literal("elektromobilnost-2026") },
  returns: v.object({ exhibitors: v.number(), clients: counts, participations: counts, covered: v.array(coveredRow) }),
  handler: async (ctx, args) => {
    const actor = await requireImportActor(ctx, args.ownerEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_exhibitor_import_event_missing");
    const now = Date.now();
    const clients = tally();
    const participations = tally();
    const covered: Array<Infer<typeof coveredRow>> = [];
    const list = LISTS[args.list as ListKey];
    for (const exhibitor of list) {
      if (await intakeParticipationOf(ctx, event._id, exhibitor)) {
        covered.push({ key: exhibitor.key, intakeParticipationKey: exhibitor.intakeParticipationKey! });
        continue;
      }
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
        detail: { eventCode: event.code, list: args.list, clients, participations, covered: covered.length },
        now,
      });
    }
    return { exhibitors: list.length, clients, participations, covered };
  },
});

const placeSkipReason = v.union(
  v.literal("covered_by_intake"),
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
 * revives anything; what it leaves alone is reported with a reason. P2: an
 * exhibitor covered by its intake participation is skipped
 * (`covered_by_intake`): the intake stand is its place on the map.
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
      if (await intakeParticipationOf(ctx, event._id, exhibitor)) {
        skipped.push({ key: exhibitor.key, reason: "covered_by_intake" });
        continue;
      }
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

const reconcileFill = v.union(v.literal("category"), v.literal("logo"), v.literal("website"));
const reconcileRow = v.object({
  key: v.string(),
  intakeParticipationKey: v.string(),
  /** The intake participation (Aleksa's) that is this exhibitor; null = not in this event (nothing done). */
  intake: v.union(v.null(), v.object({
    exhibitorName: v.string(),
    status: v.string(),
    stands: v.array(v.object({ code: v.string(), mapLocationId: v.string(), status: v.string() })),
  })),
  /**
   * The site record: `absent`; `withdrawn` (earlier); `withdraw` (withdrawn
   * now, or in a dry run: would be); `has_models` (kept: it holds cars, a
   * person decides).
   */
  site: v.union(v.literal("absent"), v.literal("withdrawn"), v.literal("withdraw"), v.literal("has_models")),
  siteStands: v.number(),
  /** What the intake participation gets from the site list (only what it lacks). */
  fill: v.array(reconcileFill),
});

/**
 * P2 (Aleksa 8. 10., SYNC §2.3) — the map follows Aleksa's intake: for every
 * site exhibitor that IS an intake participation of the event (JMEV → CUBI,
 * Mazda/Chery → Grand Motors, Foton → AUTO MIG, Ferum Yudo → Ferum, Bentu →
 * BENTU), a site participation made before the intake is withdrawn with its
 * stands (never when it holds a car: `has_models`), and the intake
 * participation gets what it lacks for the map: the category, and the logo
 * and website when exactly one site brand stands for it (Grand Motors has two:
 * category only). Nothing of Aleksa's is renamed, moved or duplicated.
 * `dryRun` (default true) writes nothing and reports what a real run does; a
 * second real run reports nothing to do.
 * `npx convex run fairExhibitorImport:reconcileSiteExhibitorsWithIntake
 *   '{"ownerEmail":"<admin>","eventCode":"elektromobilnost-2026","list":"elektromobilnost-2026","dryRun":true}'`
 */
export const reconcileSiteExhibitorsWithIntake = internalMutation({
  args: { ownerEmail: v.string(), eventCode: v.string(), list: v.literal("elektromobilnost-2026"), dryRun: v.optional(v.boolean()) },
  returns: v.object({
    dryRun: v.boolean(),
    rows: v.array(reconcileRow),
    summary: v.object({ siteParticipationsWithdrawn: v.number(), siteStandsWithdrawn: v.number(), intakeFilled: v.number() }),
  }),
  handler: async (ctx, args) => {
    const actor = await requireImportActor(ctx, args.ownerEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_exhibitor_import_event_missing");
    const dryRun = args.dryRun ?? true;
    const now = Date.now();
    const list = LISTS[args.list as ListKey];
    const covering = (intakeKey: string) => list.filter((row) => row.intakeParticipationKey === intakeKey);
    const filledIntakes = new Set<Id<"fairParticipations">>();
    const rows: Array<Infer<typeof reconcileRow>> = [];
    const summary = { siteParticipationsWithdrawn: 0, siteStandsWithdrawn: 0, intakeFilled: 0 };
    for (const exhibitor of list) {
      if (!exhibitor.intakeParticipationKey) continue;
      const intake = await intakeParticipationOf(ctx, event._id, exhibitor);
      if (!intake) {
        rows.push({ key: exhibitor.key, intakeParticipationKey: exhibitor.intakeParticipationKey, intake: null, site: "absent", siteStands: 0, fill: [] });
        continue;
      }
      const [business, account, intakeStands] = await Promise.all([
        ctx.db.get(intake.businessId),
        ctx.db.get(intake.accountId),
        ctx.db.query("fairStands").withIndex("by_eventId_and_participationId", (q) => q.eq("eventId", event._id).eq("participationId", intake._id)).take(20),
      ]);

      // The site record of this exhibitor, if the list wrote one before the intake.
      let site: Infer<typeof reconcileRow>["site"] = "absent";
      let siteStands = 0;
      const siteParticipation = await ctx.db
        .query("fairParticipations")
        .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", fairSiteExhibitorCodes(exhibitor.key).participationKey))
        .unique();
      if (siteParticipation?.status === "withdrawn") site = "withdrawn";
      else if (siteParticipation) {
        const stands = await ctx.db
          .query("fairStands")
          .withIndex("by_eventId_and_participationId", (q) => q.eq("eventId", event._id).eq("participationId", siteParticipation._id))
          .take(100);
        let hasModels = false;
        for (const stand of stands) {
          const models = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_standId", (q) => q.eq("eventId", event._id).eq("standId", stand._id)).take(50);
          if (models.some((model) => model.status !== "withdrawn")) hasModels = true;
        }
        if (hasModels) site = "has_models";
        else {
          site = "withdraw";
          const open = stands.filter((stand) => stand.status !== "withdrawn");
          siteStands = open.length;
          summary.siteParticipationsWithdrawn += 1;
          summary.siteStandsWithdrawn += open.length;
          if (!dryRun) {
            for (const stand of open) await ctx.db.patch(stand._id, { status: "withdrawn", updatedAt: now });
            await ctx.db.patch(siteParticipation._id, { status: "withdrawn", updatedAt: now });
          }
        }
      }

      // What the intake participation still lacks for the map (never an overwrite).
      const fill: Array<Infer<typeof reconcileFill>> = [];
      if (!filledIntakes.has(intake._id)) {
        filledIntakes.add(intake._id);
        const sources = covering(exhibitor.intakeParticipationKey);
        const categories = new Set(sources.map((row) => row.category));
        const single = sources.length === 1 ? sources[0] : null;
        const websiteUrl = single?.websiteUrl ? normalizeWebsiteUrl(single.websiteUrl) : null;
        const intakePatch = intake.category === undefined && categories.size === 1 ? { category: exhibitor.category } : null;
        const logoUrl = single && business && !business.logoUrl && !business.logoStorageId ? fairSiteLogoUrl(single) : null;
        const website = websiteUrl && account && !account.websiteUrl ? websiteUrl : null;
        if (intakePatch) fill.push("category");
        if (logoUrl) fill.push("logo");
        if (website) fill.push("website");
        if (fill.length) summary.intakeFilled += 1;
        if (!dryRun) {
          if (intakePatch) await ctx.db.patch(intake._id, { ...intakePatch, updatedAt: now });
          if (logoUrl && business) await ctx.db.patch(business._id, { logoUrl, updatedAt: now });
          if (website && account) await ctx.db.patch(account._id, { websiteUrl: website, updatedAt: now });
        }
      }
      rows.push({
        key: exhibitor.key,
        intakeParticipationKey: exhibitor.intakeParticipationKey,
        intake: {
          exhibitorName: business?.name ?? intake.externalKey,
          status: intake.status,
          stands: intakeStands.map((stand) => ({ code: stand.code, mapLocationId: stand.mapLocationId, status: stand.status })),
        },
        site,
        siteStands,
        fill,
      });
    }
    if (!dryRun && (summary.siteParticipationsWithdrawn || summary.intakeFilled)) {
      await writeAdminAudit(ctx, {
        actorUserId: actor._id,
        action: "fair_site_exhibitors_reconciled",
        detail: { eventCode: event.code, list: args.list, ...summary },
        now,
      });
    }
    return { dryRun, rows, summary };
  },
});

/**
 * P2 (RN N6) — read-only: the stands of an event (not withdrawn) whose
 * `mapLocationId` is not a stand location of today's map (lib/fair-map; e.g.
 * S1–S5, 20/21/22, 12/13/15 of the M0 drawing). They are off the public map
 * and publishing their cars fails with FAIR_MAP_LOCATION_INVALID. Each with
 * its exhibitor, the old location, the candidates of today's map and a
 * proposal when it is unambiguous (one candidate, or the one the organizer's
 * list gives the site exhibitor). Nothing is moved.
 * `npx convex run fairExhibitorImport:listStandsOffMap '{"eventCode":"elektromobilnost-2026"}'`
 */
export const listStandsOffMap = internalQuery({
  args: { eventCode: v.string() },
  returns: v.object({
    eventCode: v.string(),
    checked: v.number(),
    capped: v.boolean(),
    offMap: v.array(v.object({
      standId: v.id("fairStands"),
      standCode: v.string(),
      standName: v.string(),
      status: v.string(),
      exhibitorName: v.string(),
      participationKey: v.string(),
      mapLocationId: v.string(),
      candidates: v.array(v.string()),
      proposal: v.union(v.string(), v.null()),
      cars: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_exhibitor_import_event_missing");
    const STANDS_CAP = 500;
    const stands = await ctx.db.query("fairStands").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id)).take(STANDS_CAP + 1);
    const siteByParticipationKey = new Map(ELEKTROMOBILNOST_2026_EXHIBITORS.map((row) => [fairSiteExhibitorCodes(row.key).participationKey, row]));
    const offMap = [];
    for (const stand of stands.slice(0, STANDS_CAP)) {
      if (stand.status === "withdrawn" || isFairMapStandLocation(event.code, stand.mapLocationId)) continue;
      const participation = await ctx.db.get(stand.participationId);
      const business = participation ? await ctx.db.get(participation.businessId) : null;
      const candidates = fairMapRelocationCandidates(event.code, stand.mapLocationId);
      const site = participation ? siteByParticipationKey.get(participation.externalKey) : undefined;
      const listed = site ? candidates.filter((id) => site.locations.includes(id)) : [];
      const proposal = candidates.length === 1 ? candidates[0] : listed.length === 1 ? listed[0] : null;
      const models = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_standId", (q) => q.eq("eventId", event._id).eq("standId", stand._id)).take(50);
      offMap.push({
        standId: stand._id,
        standCode: stand.code,
        standName: stand.displayName,
        status: stand.status,
        exhibitorName: business?.name ?? participation?.externalKey ?? "—",
        participationKey: participation?.externalKey ?? "—",
        mapLocationId: stand.mapLocationId,
        candidates,
        proposal,
        cars: models.filter((model) => model.status !== "withdrawn").length,
      });
    }
    return { eventCode: event.code, checked: Math.min(stands.length, STANDS_CAP), capped: stands.length > STANDS_CAP, offMap };
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
