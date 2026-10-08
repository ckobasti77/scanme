import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import schema from "./schema";
import { requireAdmin } from "./lib/access";
import { accessState } from "./lib/accessValidators";
import { writeAdminAudit } from "./lib/adminAudit";
import { upsertClientReadModel, upsertVenueReadModel } from "./lib/adminReadModelEngine";
import { normalizeAdminEmail, normalizeAdminHumanCode, normalizeAdminPhone, normalizeAdminSearchText } from "./lib/adminV1Validators";
import {
  activeAssignmentForModel,
  fairAdminError,
  fairIssue,
  fairIssueValidator,
  fairPublishIssuesFromFacts,
  fairSpecificationInput,
  isFairEventMapLocationId,
  optionalText,
  requireFairEvent,
  requireText,
  setFairModelStatus,
  upgradeFairModelPackage,
  upsertFairEvent,
  upsertFairEventDay,
  upsertFairModel,
  upsertFairParticipation,
  upsertFairStand,
} from "./lib/fairCatalog";
import { scheduleFairBrandPassportSync } from "./lib/fairPassportSync";
import { syncFairSponsoredSnapshot } from "./lib/fairSponsored";
import {
  activeAssignmentForChannel,
  assignFairQr,
  fairQrKindOf,
  fairQrModelFactsLoader,
  fairResolveTest,
  findInventoryCode,
  releaseFairQr,
} from "./lib/fairQr";
import {
  fairClientSegment,
  fairEventStatus,
  fairModelStatus,
  fairPackageTier,
  fairParticipationStatus,
  fairQrKind,
  fairStandStatus,
} from "./lib/fairValidators";
import { requireSlug } from "./lib/validation";
import { FAIR_ADMIN_LIST_LIMIT, fairClientSegmentOf, type FairAdminIssue } from "../lib/fair-contract";

// Sajam automobila 2026 — B1 admin commands (BACKEND-HANDOFF §7 `fairAdmin`).
// Every function requires requireAdmin; the ScanMe team enters all data (no
// exhibitor account or self-service). Writes go through convex/lib/fairCatalog
// and convex/lib/fairQr, are idempotent by externalKey / stable keys, and fail
// with ConvexError({ code }) using FAIR_ADMIN_ISSUE_CODES.

const upsertResult = v.union(v.literal("created"), v.literal("updated"), v.literal("unchanged"));

// -----------------------------------------------------------------------------
// Catalog upserts
// -----------------------------------------------------------------------------

export const upsertEvent = mutation({
  args: {
    code: v.string(),
    slug: v.string(),
    title: v.string(),
    venueName: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    status: v.optional(fairEventStatus),
    garagePriority: v.number(),
    qrInventoryBusinessId: v.optional(v.id("businesses")),
  },
  returns: v.object({ eventId: v.id("fairEvents"), result: upsertResult }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return upsertFairEvent(ctx, args, Date.now());
  },
});

export const upsertEventDay = mutation({
  args: { eventId: v.id("fairEvents"), dateKey: v.string(), label: v.string(), sortOrder: v.number() },
  returns: v.object({ dayId: v.id("fairEventDays"), result: upsertResult }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return upsertFairEventDay(ctx, args);
  },
});

export const upsertParticipation = mutation({
  args: {
    eventId: v.id("fairEvents"),
    externalKey: v.string(),
    accountId: v.id("accounts"),
    businessId: v.id("businesses"),
    primaryContactId: v.optional(v.id("accountContacts")),
    reportRecipientEmail: v.optional(v.string()),
    leadDeliveryNote: v.optional(v.string()),
    status: v.optional(fairParticipationStatus),
  },
  returns: v.object({ participationId: v.id("fairParticipations"), result: upsertResult }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return upsertFairParticipation(ctx, args, Date.now());
  },
});

export const upsertStand = mutation({
  args: {
    eventId: v.id("fairEvents"),
    participationId: v.id("fairParticipations"),
    externalKey: v.string(),
    code: v.string(),
    displayName: v.string(),
    mapLocationId: v.string(),
    status: v.optional(fairStandStatus),
  },
  returns: v.object({ standId: v.id("fairStands"), result: upsertResult }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return upsertFairStand(ctx, args, Date.now());
  },
});

/**
 * Brands are account-scoped existing records (no fair copy). The app had no
 * brand writer, so this creates the brand in the EXISTING `brands` table when
 * absent — idempotent by (account, normalized name). Logo/colors stay empty
 * until real materials arrive (never invented).
 */
export const ensureBrand = mutation({
  args: { accountId: v.id("accounts"), name: v.string() },
  returns: v.object({ brandId: v.id("brands"), result: upsertResult }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (!(await ctx.db.get(args.accountId))) fairAdminError("FAIR_LINK_NOT_FOUND", { link: "account" });
    const name = requireText(args.name, "name", 120);
    const normalizedName = normalizeAdminSearchText(name);
    const existing = await ctx.db
      .query("brands")
      .withIndex("by_accountId_and_normalizedName", (q) => q.eq("accountId", args.accountId).eq("normalizedName", normalizedName))
      .first();
    if (existing) return { brandId: existing._id, result: "unchanged" as const };
    const now = Date.now();
    const brandId = await ctx.db.insert("brands", { accountId: args.accountId, name, normalizedName, revision: "1", colors: [], createdAt: now, updatedAt: now });
    return { brandId, result: "created" as const };
  },
});

export const upsertModel = mutation({
  args: {
    eventId: v.id("fairEvents"),
    participationId: v.id("fairParticipations"),
    standId: v.id("fairStands"),
    brandId: v.id("brands"),
    externalKey: v.string(),
    slug: v.optional(v.string()),
    displayName: v.string(),
    variant: v.optional(v.string()),
    priceText: v.optional(v.string()),
    specifications: v.array(fairSpecificationInput),
    photoUrl: v.optional(v.string()),
    packageTier: fairPackageTier,
    packageActiveFrom: v.optional(v.number()),
    passportEligible: v.boolean(),
    sortOrder: v.optional(v.number()),
  },
  returns: v.object({ modelId: v.id("fairEventModels"), result: upsertResult, warnings: v.array(fairIssueValidator) }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return upsertFairModel(ctx, args, admin._id, Date.now());
  },
});

// -----------------------------------------------------------------------------
// Publish / withdraw / upgrade
// -----------------------------------------------------------------------------

const statusResult = v.object({ status: fairModelStatus, changed: v.boolean(), warnings: v.array(fairIssueValidator) });

async function changeModelStatus(ctx: MutationCtx, eventModelId: Id<"fairEventModels">, status: "published" | "withdrawn") {
  const admin = await requireAdmin(ctx);
  const now = Date.now();
  const { model, changed, warnings: publishWarnings } = await setFairModelStatus(ctx, eventModelId, status, now);
  // N1: a withdrawn model KEEPS its sticker link (re-publishing restores the
  // scan at once; the sticker is still on the car) and the result says so
  // visibly; the dashboard counts it as `qr_on_withdrawn`. No silent link.
  const linked = status === "withdrawn" ? await activeAssignmentForModel(ctx, model._id) : null;
  const warnings = linked
    ? [...publishWarnings, fairIssue("warning", "FAIR_QR_STILL_LINKED", "qr", { resolverCode: linked.resolverCode, label: (await ctx.db.get(linked.cardId))?.label ?? linked.resolverCode })]
    : publishWarnings;
  if (changed) {
    const participation = await ctx.db.get(model.participationId);
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: participation?.accountId,
      businessId: participation?.businessId,
      action: status === "published" ? "fair_model_published" : "fair_model_withdrawn",
      detail: { eventModelId: model._id, from: model.status, to: status, ...(linked ? { qrStillLinked: linked.resolverCode } : {}) },
      now,
    });
    // Admin UX A7: the brand's automatic passport follows the catalog.
    await scheduleFairBrandPassportSync(ctx, model.eventId, model.brandId, now);
    // Admin UX A9: so does the sponsored snapshot (same transaction, no-op without a difference).
    await syncFairSponsoredSnapshot(ctx, model.eventId, now, admin._id);
  }
  return { status, changed, warnings };
}

export const publishModel = mutation({
  args: { eventModelId: v.id("fairEventModels") },
  returns: statusResult,
  handler: async (ctx, args) => changeModelStatus(ctx, args.eventModelId, "published"),
});

export const withdrawModel = mutation({
  args: { eventModelId: v.id("fairEventModels") },
  returns: statusResult,
  handler: async (ctx, args) => changeModelStatus(ctx, args.eventModelId, "withdrawn"),
});

export const upgradePackage = mutation({
  args: { eventModelId: v.id("fairEventModels"), toTier: fairPackageTier, note: v.optional(v.string()) },
  returns: v.object({ activationId: v.id("fairPackageActivations"), fromTier: fairPackageTier, toTier: fairPackageTier, activatedAt: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const now = Date.now();
    const result = await upgradeFairModelPackage(ctx, args, admin._id, now);
    const model = await ctx.db.get(args.eventModelId);
    const participation = model ? await ctx.db.get(model.participationId) : null;
    await writeAdminAudit(ctx, {
      actorUserId: admin._id,
      accountId: participation?.accountId,
      businessId: participation?.businessId,
      action: "fair_package_upgraded",
      detail: { eventModelId: args.eventModelId, activationId: result.activationId, from: result.fromTier, to: result.toTier },
      now,
    });
    // Admin UX A7: an upgrade to Starter can complete the brand's passport condition.
    if (model) await scheduleFairBrandPassportSync(ctx, model.eventId, model.brandId, now);
    // Admin UX A9: an upgrade to Napredni re-publishes the sponsored snapshot
    // now, or (a package that starts later) at its activation moment.
    if (model) await syncFairSponsoredSnapshot(ctx, model.eventId, now, admin._id);
    return result;
  },
});

// -----------------------------------------------------------------------------
// Event-only clients (MASTER §4.6, HANDOFF §5.1)
// -----------------------------------------------------------------------------

/**
 * Creates a client that exists only because of the fair: the SAME canonical
 * accounts/accountContacts/businesses records a regular client uses, with
 * clientSegment "event_only" so the regular Clients directory skips it.
 * Idempotent by smkCode.
 */
export const createEventClient = mutation({
  args: {
    accountName: v.string(),
    ownerDisplayName: v.string(),
    smkCode: v.string(),
    contact: v.object({
      firstName: v.string(),
      lastName: v.string(),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      positionTitle: v.string(),
    }),
    venue: v.object({ name: v.string(), slug: v.string(), smlCode: v.string(), city: v.optional(v.string()) }),
  },
  returns: v.object({
    accountId: v.id("accounts"),
    businessId: v.id("businesses"),
    contactId: v.id("accountContacts"),
    result: v.union(v.literal("created"), v.literal("unchanged")),
  }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return createEventOnlyClient(ctx, args, admin._id, Date.now());
  },
});

export type EventClientInput = {
  accountName: string;
  ownerDisplayName: string;
  smkCode: string;
  contact: { firstName: string; lastName: string; email?: string; phone?: string; positionTitle: string };
  venue: { name: string; slug: string; smlCode: string; city?: string };
};

function humanCode(value: string, prefix: "SMK" | "SML", field: string) {
  try {
    return normalizeAdminHumanCode(value, prefix);
  } catch {
    fairAdminError("INVALID_INPUT", { field });
  }
}

export async function createEventOnlyClient(ctx: MutationCtx, args: EventClientInput, actorUserId: Id<"users">, now: number) {
  const smkCode = humanCode(args.smkCode, "SMK", "smkCode");
  const smlCode = humanCode(args.venue.smlCode, "SML", "venue.smlCode");
  const accountName = requireText(args.accountName, "accountName", 120);
  const existing = await ctx.db.query("accounts").withIndex("by_smkCode", (q) => q.eq("smkCode", smkCode)).first();
  if (existing) {
    const business = await ctx.db.query("businesses").withIndex("by_smlCode", (q) => q.eq("smlCode", smlCode)).first();
    const contactId = existing.defaultContactId;
    if (!business || !contactId || existing.clientSegment !== "event_only" || existing.name !== accountName || business.accountId !== existing._id) {
      fairAdminError("FAIR_CLIENT_CODE_TAKEN", { field: "smkCode" });
    }
    return { accountId: existing._id, businessId: business._id, contactId, result: "unchanged" as const };
  }
  if (await ctx.db.query("businesses").withIndex("by_smlCode", (q) => q.eq("smlCode", smlCode)).first()) {
    fairAdminError("FAIR_CLIENT_CODE_TAKEN", { field: "venue.smlCode" });
  }
  let slug: string;
  try {
    slug = requireSlug(args.venue.slug);
  } catch {
    fairAdminError("INVALID_INPUT", { field: "venue.slug" });
  }
  if (await ctx.db.query("businesses").withIndex("by_slug", (q) => q.eq("slug", slug)).first()) fairAdminError("FAIR_SLUG_TAKEN", { field: "venue.slug" });
  const ownerDisplayName = requireText(args.ownerDisplayName, "ownerDisplayName", 120);
  const venueName = requireText(args.venue.name, "venue.name", 120);
  const city = optionalText(args.venue.city, "venue.city", 80);
  const firstName = requireText(args.contact.firstName, "contact.firstName", 80);
  const lastName = requireText(args.contact.lastName, "contact.lastName", 80);
  const email = args.contact.email?.trim() ? normalizeAdminEmail(args.contact.email) : undefined;
  const phone = args.contact.phone?.trim() ? normalizeAdminPhone(args.contact.phone) : undefined;
  if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fairAdminError("INVALID_INPUT", { field: "contact.email" });
  const accountId = await ctx.db.insert("accounts", {
    name: accountName,
    plan: "basic",
    status: "active",
    planSource: "manual",
    smkCode,
    ownerDisplayName,
    normalizedOwnerDisplayName: normalizeAdminSearchText(ownerDisplayName),
    clientStatus: "active",
    adminV1MigrationVersion: 1,
    adminV1MigratedAt: now,
    clientSegment: "event_only",
    createdAt: now,
    updatedAt: now,
  });
  const contactId = await ctx.db.insert("accountContacts", {
    accountId,
    firstName,
    lastName,
    normalizedName: normalizeAdminSearchText(`${firstName} ${lastName}`),
    ...(email ? { normalizedEmail: email } : {}),
    ...(phone ? { normalizedPhone: phone } : {}),
    positionTitle: requireText(args.contact.positionTitle, "contact.positionTitle", 80),
    isOwner: true,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(accountId, { defaultContactId: contactId });
  const businessId = await ctx.db.insert("businesses", {
    accountId,
    name: venueName,
    normalizedName: normalizeAdminSearchText(venueName),
    slug,
    kind: "business",
    smlCode,
    clientStatus: "active",
    ...(city ? { city, normalizedCity: normalizeAdminSearchText(city) } : {}),
    adminV1MigrationVersion: 1,
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await upsertClientReadModel(ctx, { accountId, venueCount: 1, firstVenueName: venueName, updatedAt: now });
  await upsertVenueReadModel(ctx, { businessId, productCount: 0, channelCount: 0, updatedAt: now });
  await writeAdminAudit(ctx, { actorUserId, accountId, businessId, action: "fair_event_client_created", detail: { smkCode, smlCode }, now });
  return { accountId, businessId, contactId, result: "created" as const };
}

const eventClientView = v.object({
  accountId: v.id("accounts"),
  name: v.string(),
  smkCode: v.union(v.string(), v.null()),
  ownerDisplayName: v.union(v.string(), v.null()),
  clientStatus: v.union(v.literal("active"), v.literal("archived"), v.null()),
  createdAt: v.number(),
});

export const listEventClients = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(eventClientView),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await ctx.db
      .query("accounts")
      .withIndex("by_clientSegment", (q) => q.eq("clientSegment", "event_only"))
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((account) => ({
        accountId: account._id,
        name: account.name,
        smkCode: account.smkCode ?? null,
        ownerDisplayName: account.ownerDisplayName ?? null,
        clientStatus: account.clientStatus ?? null,
        createdAt: account.createdAt,
      })),
    };
  },
});

const CONVERT_VENUE_LIMIT = 100;

/**
 * `Prebaci u redovne klijente` (MASTER §4.6): patches the SAME account and its
 * read-model projections to "standard". No ID, contact, business, QR, history
 * or event row is copied or rewritten. Idempotent.
 */
export const convertEventClientToStandard = mutation({
  args: { accountId: v.id("accounts") },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const account = await ctx.db.get(args.accountId);
    if (!account) fairAdminError("FAIR_LINK_NOT_FOUND", { link: "account" });
    if (account.clientSegment !== "event_only") return { changed: false };
    const now = Date.now();
    await ctx.db.patch(account._id, { clientSegment: "standard", updatedAt: now });
    const clientRow = await ctx.db.query("adminClientReadModels").withIndex("by_accountId", (q) => q.eq("accountId", account._id)).unique();
    if (clientRow) await ctx.db.patch(clientRow._id, { clientSegment: "standard" });
    const venueRows = await ctx.db
      .query("adminVenueReadModels")
      .withIndex("by_accountId_and_normalizedVenueName", (q) => q.eq("accountId", account._id))
      .take(CONVERT_VENUE_LIMIT + 1);
    if (venueRows.length > CONVERT_VENUE_LIMIT) fairAdminError("INVALID_INPUT", { reason: "venue_limit" });
    for (const row of venueRows) await ctx.db.patch(row._id, { clientSegment: "standard" });
    await writeAdminAudit(ctx, { actorUserId: admin._id, accountId: account._id, action: "fair_event_client_converted", detail: { from: "event_only", to: "standard" }, now });
    return { changed: true };
  },
});

// -----------------------------------------------------------------------------
// QR inventory, assignment and resolve test
// -----------------------------------------------------------------------------

/**
 * `resolverCode` takes any typed code of the event's CURRENT inventory: the
 * resolver code, the SMQ serial or (N1) the printed label (`7`, `SA26-007`).
 * N1: a panel or a withdrawn model is refused; `modelStatus` tells the admin
 * that a draft model's sticker reads „kartica nije aktivna“ until published.
 */
export const assignQr = mutation({
  args: { eventModelId: v.id("fairEventModels"), resolverCode: v.string(), reason: v.optional(v.string()) },
  returns: v.object({ assignmentId: v.id("fairQrAssignments"), created: v.boolean(), modelStatus: fairModelStatus }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return assignFairQr(ctx, args, admin._id, Date.now());
  },
});

export const releaseQr = mutation({
  args: { eventModelId: v.id("fairEventModels"), reason: v.string() },
  returns: v.object({ assignmentId: v.union(v.id("fairQrAssignments"), v.null()), released: v.boolean() }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    return releaseFairQr(ctx, args, admin._id, Date.now());
  },
});

const QR_INVENTORY_PAGE_MAX = 100;

const inventoryRow = v.object({
  cardId: v.id("cards"),
  resolverCode: v.string(),
  /** Izlagači 2026: the printed label of the card (`SA26-001`, cards.label). */
  label: v.string(),
  /** N1: a car sticker or a panel. */
  kind: fairQrKind,
  accessChannelId: v.union(v.id("accessChannels"), v.null()),
  smqCode: v.union(v.string(), v.null()),
  state: v.union(accessState, v.null()),
  problemReason: v.union(v.string(), v.null()),
  assignment: v.union(
    v.object({
      assignmentId: v.id("fairQrAssignments"),
      eventId: v.id("fairEvents"),
      eventModelId: v.id("fairEventModels"),
      // N1: the car as the field team names it.
      modelStatus: v.union(fairModelStatus, v.null()),
      exhibitorName: v.union(v.string(), v.null()),
      standCode: v.union(v.string(), v.null()),
      standName: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
});

/** The event's QR inventory (existing cards of the inventory business), one bounded page. */
export const listQrInventory = query({
  args: { eventId: v.id("fairEvents"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(inventoryRow),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    if (!event.qrInventoryBusinessId) fairAdminError("FAIR_QR_INVENTORY_NOT_CONFIGURED");
    if (args.paginationOpts.numItems > QR_INVENTORY_PAGE_MAX) fairAdminError("INVALID_INPUT", { field: "numItems" });
    const businessId = event.qrInventoryBusinessId;
    const cards = await ctx.db.query("cards").withIndex("by_businessId", (q) => q.eq("businessId", businessId)).paginate(args.paginationOpts);
    const facts = fairQrModelFactsLoader(ctx);
    const page = [];
    for (const card of cards.page) {
      const channel = card.accessChannelId ? await ctx.db.get(card.accessChannelId) : null;
      const [assignment, subject] = channel ? await Promise.all([activeAssignmentForChannel(ctx, channel._id), ctx.db.get(channel.subjectId)]) : [null, null];
      const model = assignment ? await facts(assignment.eventModelId) : null;
      page.push({
        cardId: card._id,
        resolverCode: card.cardCode,
        label: card.label,
        kind: fairQrKindOf(subject),
        accessChannelId: channel?._id ?? null,
        smqCode: channel?.smqCode ?? null,
        state: channel?.state ?? null,
        problemReason: channel?.problemReason ?? null,
        assignment: assignment
          ? {
            assignmentId: assignment._id,
            eventId: assignment.eventId,
            eventModelId: assignment.eventModelId,
            modelStatus: model?.model.status ?? null,
            exhibitorName: model?.exhibitorName ?? null,
            standCode: model?.standCode ?? null,
            standName: model?.standName ?? null,
          }
          : null,
      });
    }
    return { ...cards, page };
  },
});

/**
 * What /r/[cardCode] would open for a code. N1: with `eventId` the code may be
 * typed like everywhere else in the QR admin (label `7` / `SA26-007`, SMQ or
 * resolver code of that event's inventory); without it, the resolver code.
 */
export const resolveTest = query({
  args: { resolverCode: v.string(), eventId: v.optional(v.id("fairEvents")) },
  returns: v.object({
    resolverCode: v.string(),
    outcome: v.union(v.literal("fair_model"), v.literal("other"), v.literal("invalid")),
    problem: v.union(v.string(), v.null()),
    channelState: v.union(accessState, v.null()),
    targetKind: v.union(v.string(), v.null()),
    eventModelId: v.union(v.id("fairEventModels"), v.null()),
    modelStatus: v.union(fairModelStatus, v.null()),
    assignmentId: v.union(v.id("fairQrAssignments"), v.null()),
    path: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.eventId) {
      const found = await findInventoryCode(ctx, await requireFairEvent(ctx, args.eventId), args.resolverCode);
      if ("channel" in found) return fairResolveTest(ctx, found.channel.resolverCode);
    }
    return fairResolveTest(ctx, args.resolverCode);
  },
});

// -----------------------------------------------------------------------------
// Bounded reads for the `Događaji` tab (B1A)
// -----------------------------------------------------------------------------

export const listEvents = query({
  args: {},
  returns: v.array(schema.doc("fairEvents")),
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return ctx.db.query("fairEvents").withIndex("by_status_and_startsAt").take(50);
  },
});

/** One event's catalog, ≤ FAIR_ADMIN_LIST_LIMIT rows per table (also read by fairDashboard, A10). */
export async function loadEventCatalog(ctx: QueryCtx, eventId: Id<"fairEvents">) {
  const take = async <T>(rows: Promise<T[]>) => {
    const list = await rows;
    if (list.length > FAIR_ADMIN_LIST_LIMIT) fairAdminError("INVALID_INPUT", { reason: "catalog_limit" });
    return list;
  };
  const [days, participations, stands, models, assignments] = await Promise.all([
    take(ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", eventId)).take(FAIR_ADMIN_LIST_LIMIT + 1)),
    take(ctx.db.query("fairParticipations").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", eventId)).take(FAIR_ADMIN_LIST_LIMIT + 1)),
    take(ctx.db.query("fairStands").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", eventId)).take(FAIR_ADMIN_LIST_LIMIT + 1)),
    take(ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", eventId)).take(FAIR_ADMIN_LIST_LIMIT + 1)),
    take(ctx.db.query("fairQrAssignments").withIndex("by_eventId_and_status", (q) => q.eq("eventId", eventId).eq("status", "assigned")).take(FAIR_ADMIN_LIST_LIMIT + 1)),
  ]);
  return { days, participations, stands, models, assignments };
}

export const getEventCatalog = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    event: schema.doc("fairEvents"),
    days: v.array(schema.doc("fairEventDays")),
    participations: v.array(schema.doc("fairParticipations")),
    stands: v.array(schema.doc("fairStands")),
    models: v.array(schema.doc("fairEventModels")),
    activeAssignments: v.array(schema.doc("fairQrAssignments")),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const { assignments, ...catalog } = await loadEventCatalog(ctx, event._id);
    return { event, ...catalog, activeAssignments: assignments };
  },
});

/** Publish problems of every model in the event, from one preloaded snapshot (no per-model reads). */
export const listValidationIssues = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.array(v.object({ eventModelId: v.id("fairEventModels"), externalKey: v.string(), status: fairModelStatus, issues: v.array(fairIssueValidator) })),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    return eventValidationIssues(event, await loadEventCatalog(ctx, event._id));
  },
});

/** Publish problems of every model from the preloaded catalog (shared with fairDashboard, A10). */
export function eventValidationIssues(
  event: Doc<"fairEvents">,
  { participations, stands, models, assignments }: Pick<Awaited<ReturnType<typeof loadEventCatalog>>, "participations" | "stands" | "models" | "assignments">,
) {
  const participationById = new Map<Id<"fairParticipations">, Doc<"fairParticipations">>(participations.map((row) => [row._id, row]));
  const standById = new Map<Id<"fairStands">, Doc<"fairStands">>(stands.map((row) => [row._id, row]));
  const assigned = new Set(assignments.map((row) => row.eventModelId));
  const slugCount = new Map<string, number>();
  for (const model of models) slugCount.set(model.slug, (slugCount.get(model.slug) ?? 0) + 1);
  return models.map((model) => {
    const stand = standById.get(model.standId) ?? null;
    const mapIssues: FairAdminIssue[] = [];
    if (stand) {
      if (!isFairEventMapLocationId(event.code, stand.mapLocationId)) mapIssues.push({ severity: "error", code: "FAIR_MAP_LOCATION_INVALID", path: "stand.mapLocationId" });
      // Owner decision O4 (Aleksa, 8. 10.; N3): stands may share a location — only a warning for the admin.
      else if (stands.some((other) => other._id !== stand._id && other.status !== "withdrawn" && other.mapLocationId === stand.mapLocationId)) {
        mapIssues.push({ severity: "warning", code: "FAIR_MAP_LOCATION_TAKEN", path: "stand.mapLocationId", details: { mapLocationId: stand.mapLocationId } });
      }
    }
    return {
      eventModelId: model._id,
      externalKey: model.externalKey,
      status: model.status,
      issues: fairPublishIssuesFromFacts(model, {
        eventExists: true,
        participation: participationById.get(model.participationId) ?? null,
        stand,
        mapIssues,
        slugTaken: (slugCount.get(model.slug) ?? 0) > 1,
        hasActiveQr: assigned.has(model._id),
      }),
    };
  });
}

/**
 * B1A: display names for one event's catalog (the `Događaji` tab). Only names,
 * human codes and the client segment — no contact or other PII. Each distinct
 * account/business/brand is read once by id; the id sets are bounded by the
 * catalog limit (FAIR_ADMIN_LIST_LIMIT).
 */
export const getEventDirectory = query({
  args: { eventId: v.id("fairEvents") },
  returns: v.object({
    accounts: v.array(v.object({
      accountId: v.id("accounts"),
      name: v.string(),
      smkCode: v.union(v.string(), v.null()),
      clientSegment: fairClientSegment,
      // Izlagači 2026: the client's website (accounts.websiteUrl).
      websiteUrl: v.union(v.string(), v.null()),
    })),
    businesses: v.array(v.object({
      businessId: v.id("businesses"),
      name: v.string(),
      smlCode: v.union(v.string(), v.null()),
      // Izlagači 2026: the exhibitor logo — the uploaded file, else the stored URL/path.
      logoUrl: v.union(v.string(), v.null()),
    })),
    brands: v.array(v.object({ brandId: v.id("brands"), name: v.string() })),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const event = await requireFairEvent(ctx, args.eventId);
    const { participations, models } = await loadEventCatalog(ctx, event._id);
    const accountIds = [...new Set(participations.map((row) => row.accountId))];
    const businessIds = [...new Set(participations.map((row) => row.businessId))];
    const brandIds = [...new Set(models.map((row) => row.brandId))];
    const [accounts, businesses, brands] = await Promise.all([
      Promise.all(accountIds.map((id) => ctx.db.get(id))),
      Promise.all(businessIds.map((id) => ctx.db.get(id))),
      Promise.all(brandIds.map((id) => ctx.db.get(id))),
    ]);
    const logoUrls = await Promise.all(businesses.map(async (row) => {
      if (!row) return null;
      if (row.logoStorageId) return (await ctx.storage.getUrl(row.logoStorageId)) ?? row.logoUrl ?? null;
      return row.logoUrl ?? null;
    }));
    return {
      accounts: accounts.flatMap((row) => row ? [{ accountId: row._id, name: row.name, smkCode: row.smkCode ?? null, clientSegment: fairClientSegmentOf(row.clientSegment), websiteUrl: row.websiteUrl ?? null }] : []),
      businesses: businesses.flatMap((row, index) => row ? [{ businessId: row._id, name: row.name, smlCode: row.smlCode ?? null, logoUrl: logoUrls[index] }] : []),
      brands: brands.flatMap((row) => row ? [{ brandId: row._id, name: row.name }] : []),
    };
  },
});
