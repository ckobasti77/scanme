import { v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { channelsFor } from "./lib/accessOperations";
import { writeAdminAudit } from "./lib/adminAudit";
import { normalizeAdminEmail, normalizeAdminHumanCode, normalizeAdminSearchText } from "./lib/adminV1Validators";
import {
  activeAssignmentForModel,
  fairEventByCode,
  fairIssue,
  fairIssueValidator,
  fairModelBySlug,
  fairPriceText,
  fairSlugify,
  fairSpecificationInput,
  isApprovedPhotoUrl,
  isFairExternalKey,
  isFairSlug,
  normalizeFairSpecifications,
  upgradeFairModelPackage,
  upsertFairModel,
  upsertFairParticipation,
  upsertFairStand,
  validateMapLocationIds,
  type UpsertResult,
} from "./lib/fairCatalog";
import { activeAssignmentForChannel, assignFairQr, findInventoryChannel } from "./lib/fairQr";
import { fairClientSegment, fairPackageTier } from "./lib/fairValidators";
import {
  FAIR_IMPORT_MAX_MODELS,
  FAIR_IMPORT_MAX_PARTICIPATIONS,
  FAIR_IMPORT_VERSION,
  fairClientSegmentOf,
  type FairAdminIssue,
  type FairPackageTier,
} from "../lib/fair-contract";
import { fairTierRank } from "../lib/fair-entitlements";

// Sajam automobila 2026 — B1 internal import (BACKEND-HANDOFF §8,
// DATA-INTAKE-SPEC). One versioned JSON document per event; the exact shape
// and the CSV column mapping are in FAIR-BACKEND-CONTRACT.md §11.
//  - dryRun is a query: it CANNOT write. It returns every error and warning.
//  - commit re-runs the same plan, writes nothing if any error exists, and
//    otherwise upserts idempotently by event + externalKey (a second identical
//    commit changes no row).
// Existing clients are referenced by their human codes (accountExternalKey =
// accounts.smkCode, businessExternalKey = businesses.smlCode) and brands by
// (account, name) — contract §9.10 is the open question about these keys.
// Nothing is invented: a missing price becomes the contract fallback with a
// warning, a missing photo is only a warning.

const importStand = v.object({
  externalKey: v.string(),
  code: v.string(),
  displayName: v.optional(v.string()),
  mapLocationId: v.string(),
});

const importModel = v.object({
  externalKey: v.string(),
  displayName: v.string(),
  variant: v.optional(v.string()),
  slug: v.optional(v.string()),
  priceText: v.optional(v.string()),
  packageTier: fairPackageTier,
  /** ISO 8601 with zone, e.g. 2026-10-09T09:00:00+02:00 (DATA-INTAKE §2). */
  packageActiveFrom: v.optional(v.string()),
  assignedResolverCode: v.optional(v.string()),
  specifications: v.array(fairSpecificationInput),
  photoUrl: v.optional(v.string()),
  passportEligible: v.boolean(),
  sortOrder: v.optional(v.number()),
});

const importBrand = v.object({
  externalKey: v.string(),
  name: v.string(),
  stand: importStand,
  models: v.array(importModel),
});

const importParticipation = v.object({
  externalKey: v.string(),
  accountExternalKey: v.string(),
  businessExternalKey: v.string(),
  clientSegment: v.optional(fairClientSegment),
  reportEmail: v.optional(v.string()),
  primaryContactEmail: v.optional(v.string()),
  leadDeliveryNote: v.optional(v.string()),
  brands: v.array(importBrand),
});

export const fairImportPayload = v.object({
  version: v.number(),
  eventCode: v.string(),
  participations: v.array(importParticipation),
});
export type FairImportPayload = Infer<typeof fairImportPayload>;

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type PlannedModel = {
  input: FairImportPayload["participations"][number]["brands"][number]["models"][number];
  path: string;
  existing: Doc<"fairEventModels"> | null;
  slug: string;
  packageActiveFrom?: number;
  upgradeTo: FairPackageTier | null;
  assignCode: string | null;
};
type PlannedBrand = { brandId: Id<"brands">; standKey: string; models: PlannedModel[] };
type PlannedParticipation = {
  input: FairImportPayload["participations"][number];
  accountId: Id<"accounts">;
  businessId: Id<"businesses">;
  primaryContactId?: Id<"accountContacts">;
  existing: Doc<"fairParticipations"> | null;
  brands: PlannedBrand[];
};
type PlannedStand = {
  input: FairImportPayload["participations"][number]["brands"][number]["stand"];
  participationKey: string;
  displayName: string;
  existing: Doc<"fairStands"> | null;
};

export type FairImportPlan = {
  issues: FairAdminIssue[];
  event: Doc<"fairEvents"> | null;
  participations: PlannedParticipation[];
  stands: Map<string, PlannedStand>;
};

function humanCode(value: string, prefix: "SMK" | "SML") {
  try {
    return normalizeAdminHumanCode(value, prefix);
  } catch {
    return null;
  }
}

/** Read-only validation of the whole payload. Shared by dryRun and commit. */
export async function planFairImport(ctx: QueryCtx | MutationCtx, payload: FairImportPayload): Promise<FairImportPlan> {
  const issues: FairAdminIssue[] = [];
  const plan: FairImportPlan = { issues, event: null, participations: [], stands: new Map() };
  if (payload.version !== FAIR_IMPORT_VERSION) {
    issues.push(fairIssue("error", "FAIR_IMPORT_VERSION_UNSUPPORTED", "version", { version: payload.version }));
    return plan;
  }
  const event = await fairEventByCode(ctx, payload.eventCode);
  if (!event) {
    issues.push(fairIssue("error", "FAIR_EVENT_NOT_FOUND", "eventCode"));
    return plan;
  }
  plan.event = event;
  const modelCount = payload.participations.reduce((sum, p) => sum + p.brands.reduce((n, b) => n + b.models.length, 0), 0);
  if (payload.participations.length > FAIR_IMPORT_MAX_PARTICIPATIONS || modelCount > FAIR_IMPORT_MAX_MODELS) {
    issues.push(fairIssue("error", "FAIR_IMPORT_TOO_LARGE", "participations", { models: modelCount }));
    return plan;
  }

  const participationKeys = new Set<string>();
  const businessIds = new Set<string>();
  const modelKeys = new Set<string>();
  const slugs = new Set<string>();
  const resolverCodes = new Set<string>();
  const mapEntries: Array<{ standKey: string; mapLocationId: string; path: string }> = [];

  for (const [pIndex, p] of payload.participations.entries()) {
    const pPath = `participations[${pIndex}]`;
    if (!isFairExternalKey(p.externalKey)) issues.push(fairIssue("error", "INVALID_INPUT", `${pPath}.externalKey`));
    if (participationKeys.has(p.externalKey)) issues.push(fairIssue("error", "FAIR_DUPLICATE_KEY", `${pPath}.externalKey`));
    participationKeys.add(p.externalKey);

    const smkCode = humanCode(p.accountExternalKey, "SMK");
    const smlCode = humanCode(p.businessExternalKey, "SML");
    const account = smkCode ? await ctx.db.query("accounts").withIndex("by_smkCode", (q) => q.eq("smkCode", smkCode)).first() : null;
    const business = smlCode ? await ctx.db.query("businesses").withIndex("by_smlCode", (q) => q.eq("smlCode", smlCode)).first() : null;
    if (!account) {
      issues.push(fairIssue("error", "FAIR_LINK_NOT_FOUND", `${pPath}.accountExternalKey`, { link: "account" }));
      continue;
    }
    if (!business) {
      issues.push(fairIssue("error", "FAIR_LINK_NOT_FOUND", `${pPath}.businessExternalKey`, { link: "business" }));
      continue;
    }
    if (business.accountId !== account._id || business.kind === "celebration") {
      issues.push(fairIssue("error", "FAIR_LINK_CONFLICT", `${pPath}.businessExternalKey`, { link: "business" }));
      continue;
    }
    if (businessIds.has(business._id)) issues.push(fairIssue("error", "FAIR_DUPLICATE_KEY", `${pPath}.businessExternalKey`));
    businessIds.add(business._id);
    if (p.clientSegment && p.clientSegment !== fairClientSegmentOf(account.clientSegment)) {
      issues.push(fairIssue("error", "FAIR_CLIENT_SEGMENT_MISMATCH", `${pPath}.clientSegment`, { stored: fairClientSegmentOf(account.clientSegment) }));
    }
    let primaryContactId: Id<"accountContacts"> | undefined;
    if (p.primaryContactEmail?.trim()) {
      const email = normalizeAdminEmail(p.primaryContactEmail);
      const contact = await ctx.db
        .query("accountContacts")
        .withIndex("by_accountId_and_normalizedEmail", (q) => q.eq("accountId", account._id).eq("normalizedEmail", email))
        .first();
      if (!contact) issues.push(fairIssue("error", "FAIR_LINK_NOT_FOUND", `${pPath}.primaryContactEmail`, { link: "contact" }));
      else primaryContactId = contact._id;
    }
    if (p.reportEmail?.trim() && !EMAIL.test(normalizeAdminEmail(p.reportEmail))) issues.push(fairIssue("error", "INVALID_INPUT", `${pPath}.reportEmail`));
    const existing = await ctx.db
      .query("fairParticipations")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", p.externalKey))
      .unique();
    if (existing && (existing.accountId !== account._id || existing.businessId !== business._id)) {
      issues.push(fairIssue("error", "FAIR_LINK_CONFLICT", pPath, { link: "participation" }));
    }
    const sameBusiness = await ctx.db
      .query("fairParticipations")
      .withIndex("by_eventId_and_businessId", (q) => q.eq("eventId", event._id).eq("businessId", business._id))
      .first();
    if (sameBusiness && sameBusiness.externalKey !== p.externalKey) issues.push(fairIssue("error", "FAIR_DUPLICATE_KEY", `${pPath}.businessExternalKey`));

    const planned: PlannedParticipation = { input: p, accountId: account._id, businessId: business._id, primaryContactId, existing, brands: [] };
    plan.participations.push(planned);
    const brandKeys = new Set<string>();

    for (const [bIndex, b] of p.brands.entries()) {
      const bPath = `${pPath}.brands[${bIndex}]`;
      if (!isFairExternalKey(b.externalKey) || brandKeys.has(b.externalKey)) issues.push(fairIssue("error", isFairExternalKey(b.externalKey) ? "FAIR_DUPLICATE_KEY" : "INVALID_INPUT", `${bPath}.externalKey`));
      brandKeys.add(b.externalKey);
      const brand = await ctx.db
        .query("brands")
        .withIndex("by_accountId_and_normalizedName", (q) => q.eq("accountId", account._id).eq("normalizedName", normalizeAdminSearchText(b.name)))
        .first();
      if (!brand) {
        issues.push(fairIssue("error", "FAIR_LINK_NOT_FOUND", `${bPath}.name`, { link: "brand" }));
        continue;
      }

      // Stand: one per brand row; the same stand key may repeat (shared by
      // brands of one participation) only with identical data.
      const s = b.stand;
      const sPath = `${bPath}.stand`;
      if (!isFairExternalKey(s.externalKey)) issues.push(fairIssue("error", "INVALID_INPUT", `${sPath}.externalKey`));
      if (!s.code.trim()) issues.push(fairIssue("error", "INVALID_INPUT", `${sPath}.code`));
      const seenStand = plan.stands.get(s.externalKey);
      if (seenStand) {
        if (seenStand.participationKey !== p.externalKey || seenStand.input.code !== s.code || seenStand.input.mapLocationId !== s.mapLocationId || seenStand.input.displayName !== s.displayName) {
          issues.push(fairIssue("error", "FAIR_DUPLICATE_KEY", `${sPath}.externalKey`));
        }
      } else {
        const existingStand = await ctx.db
          .query("fairStands")
          .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", s.externalKey))
          .unique();
        if (existingStand && existingStand.participationId !== existing?._id) {
          issues.push(fairIssue("error", "FAIR_LINK_CONFLICT", sPath, { link: "stand" }));
        }
        plan.stands.set(s.externalKey, { input: s, participationKey: p.externalKey, displayName: s.displayName?.trim() || brand.name, existing: existingStand });
        mapEntries.push({ standKey: s.externalKey, mapLocationId: s.mapLocationId, path: `${sPath}.mapLocationId` });
      }

      const plannedBrand: PlannedBrand = { brandId: brand._id, standKey: s.externalKey, models: [] };
      planned.brands.push(plannedBrand);

      for (const [mIndex, m] of b.models.entries()) {
        const mPath = `${bPath}.models[${mIndex}]`;
        if (!isFairExternalKey(m.externalKey)) issues.push(fairIssue("error", "INVALID_INPUT", `${mPath}.externalKey`));
        if (modelKeys.has(m.externalKey)) issues.push(fairIssue("error", "FAIR_DUPLICATE_KEY", `${mPath}.externalKey`));
        modelKeys.add(m.externalKey);
        if (!m.displayName.trim()) issues.push(fairIssue("error", "INVALID_INPUT", `${mPath}.displayName`));
        const existingModel = await ctx.db
          .query("fairEventModels")
          .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", m.externalKey))
          .unique();
        if (existingModel && (existingModel.participationId !== existing?._id || existingModel.brandId !== brand._id)) {
          issues.push(fairIssue("error", "FAIR_LINK_CONFLICT", mPath, { link: "model" }));
        }
        let upgradeTo: FairPackageTier | null = null;
        if (existingModel && existingModel.packageTier !== m.packageTier) {
          if (fairTierRank(m.packageTier) < fairTierRank(existingModel.packageTier)) {
            issues.push(fairIssue("error", "FAIR_PACKAGE_DOWNGRADE", `${mPath}.packageTier`, { from: existingModel.packageTier, to: m.packageTier }));
          } else {
            upgradeTo = m.packageTier;
          }
        }
        const variant = m.variant?.trim();
        const slug = existingModel && m.slug === undefined
          ? existingModel.slug
          : m.slug ?? fairSlugify(variant ? `${m.displayName} ${variant}` : m.displayName);
        if (!isFairSlug(slug)) {
          issues.push(fairIssue("error", "INVALID_INPUT", `${mPath}.slug`));
        } else {
          if (slugs.has(slug)) issues.push(fairIssue("error", "FAIR_SLUG_TAKEN", `${mPath}.slug`, { slug }));
          slugs.add(slug);
          const owners = await fairModelBySlug(ctx, event._id, slug);
          if (owners.some((owner) => owner.externalKey !== m.externalKey)) issues.push(fairIssue("error", "FAIR_SLUG_TAKEN", `${mPath}.slug`, { slug }));
        }
        issues.push(...normalizeFairSpecifications(m.specifications, `${mPath}.specifications`).issues);
        if (fairPriceText(m.priceText).missing) issues.push(fairIssue("warning", "FAIR_PRICE_MISSING", `${mPath}.priceText`));
        if (m.photoUrl === undefined) issues.push(fairIssue("warning", "FAIR_PHOTO_MISSING", `${mPath}.photoUrl`));
        else if (!isApprovedPhotoUrl(m.photoUrl)) issues.push(fairIssue("error", "INVALID_INPUT", `${mPath}.photoUrl`));
        let packageActiveFrom: number | undefined;
        if (m.packageActiveFrom !== undefined) {
          packageActiveFrom = ISO_DATETIME.test(m.packageActiveFrom) ? Date.parse(m.packageActiveFrom) : Number.NaN;
          if (!Number.isFinite(packageActiveFrom)) issues.push(fairIssue("error", "INVALID_INPUT", `${mPath}.packageActiveFrom`));
        }
        if (m.sortOrder !== undefined && !Number.isInteger(m.sortOrder)) issues.push(fairIssue("error", "INVALID_INPUT", `${mPath}.sortOrder`));

        // QR: an EXISTING free code of the event inventory; never generated here.
        let assignCode: string | null = null;
        const modelAssignment = existingModel ? await activeAssignmentForModel(ctx, existingModel._id) : null;
        if (m.assignedResolverCode?.trim()) {
          const found = await findInventoryChannel(ctx, event, m.assignedResolverCode);
          if ("problem" in found) {
            issues.push(fairIssue("error", found.problem, `${mPath}.assignedResolverCode`));
          } else {
            const code = found.channel.resolverCode;
            if (resolverCodes.has(code)) issues.push(fairIssue("error", "FAIR_QR_ALREADY_ASSIGNED", `${mPath}.assignedResolverCode`, { resolverCode: code }));
            resolverCodes.add(code);
            const channelAssignment = await activeAssignmentForChannel(ctx, found.channel._id);
            const sameModel = channelAssignment !== null && channelAssignment.eventModelId === existingModel?._id;
            if (channelAssignment && !sameModel) {
              issues.push(fairIssue("error", "FAIR_QR_ALREADY_ASSIGNED", `${mPath}.assignedResolverCode`, { resolverCode: code }));
            } else if (modelAssignment && !sameModel) {
              issues.push(fairIssue("error", "FAIR_MODEL_ALREADY_ASSIGNED", `${mPath}.assignedResolverCode`));
            } else if (!sameModel) {
              if ((await channelsFor(ctx, found.channel.subjectId)).length !== 1) issues.push(fairIssue("error", "FAIR_QR_SUBJECT_SHARED", `${mPath}.assignedResolverCode`));
              assignCode = code;
            }
          }
        } else if (!modelAssignment) {
          issues.push(fairIssue("warning", "FAIR_QR_MISSING", `${mPath}.assignedResolverCode`));
        }
        plannedBrand.models.push({ input: m, path: mPath, existing: existingModel, slug, packageActiveFrom, upgradeTo, assignCode });
      }
    }
  }
  issues.push(...(await validateMapLocationIds(ctx, event._id, mapEntries)));
  return plan;
}

function countPlan(plan: FairImportPlan) {
  const models = plan.participations.flatMap((p) => p.brands.flatMap((b) => b.models));
  const stands = [...plan.stands.values()];
  return {
    participations: { new: plan.participations.filter((p) => !p.existing).length, existing: plan.participations.filter((p) => p.existing).length },
    stands: { new: stands.filter((s) => !s.existing).length, existing: stands.filter((s) => s.existing).length },
    models: { new: models.filter((m) => !m.existing).length, existing: models.filter((m) => m.existing).length },
    upgrades: models.filter((m) => m.upgradeTo).length,
    qrAssignments: models.filter((m) => m.assignCode).length,
  };
}

const newExisting = v.object({ new: v.number(), existing: v.number() });
const planSummary = v.object({ participations: newExisting, stands: newExisting, models: newExisting, upgrades: v.number(), qrAssignments: v.number() });

export const dryRun = query({
  args: { payload: fairImportPayload },
  returns: v.object({ ok: v.boolean(), issues: v.array(fairIssueValidator), summary: planSummary }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const plan = await planFairImport(ctx, args.payload);
    return { ok: !plan.issues.some((issue) => issue.severity === "error"), issues: plan.issues, summary: countPlan(plan) };
  },
});

const resultCounts = v.object({ created: v.number(), updated: v.number(), unchanged: v.number() });
const commitResults = v.object({ participations: resultCounts, stands: resultCounts, models: resultCounts, upgrades: v.number(), qrAssignments: v.number() });

function emptyCounts() {
  return { created: 0, updated: 0, unchanged: 0 };
}

/** Shared by the admin mutation and the DEV fixture. Writes only when the plan has no error. */
export async function commitFairImport(ctx: MutationCtx, payload: FairImportPayload, actorUserId: Id<"users">, now: number) {
  const plan = await planFairImport(ctx, payload);
  const results = { participations: emptyCounts(), stands: emptyCounts(), models: emptyCounts(), upgrades: 0, qrAssignments: 0 };
  const event = plan.event;
  if (!event || plan.issues.some((issue) => issue.severity === "error")) {
    return { committed: false, issues: plan.issues, results };
  }
  const count = (bucket: { created: number; updated: number; unchanged: number }, result: UpsertResult) => {
    bucket[result] += 1;
  };
  const participationIds = new Map<string, Id<"fairParticipations">>();
  for (const p of plan.participations) {
    const { participationId, result } = await upsertFairParticipation(ctx, {
      eventId: event._id,
      externalKey: p.input.externalKey,
      accountId: p.accountId,
      businessId: p.businessId,
      ...(p.primaryContactId ? { primaryContactId: p.primaryContactId } : {}),
      ...(p.input.reportEmail?.trim() ? { reportRecipientEmail: p.input.reportEmail } : {}),
      ...(p.input.leadDeliveryNote !== undefined ? { leadDeliveryNote: p.input.leadDeliveryNote } : {}),
    }, now);
    participationIds.set(p.input.externalKey, participationId);
    count(results.participations, result);
  }
  const standIds = new Map<string, Id<"fairStands">>();
  for (const [key, s] of plan.stands) {
    const { standId, result } = await upsertFairStand(ctx, {
      eventId: event._id,
      participationId: participationIds.get(s.participationKey)!,
      externalKey: key,
      code: s.input.code,
      displayName: s.displayName,
      mapLocationId: s.input.mapLocationId,
    }, now);
    standIds.set(key, standId);
    count(results.stands, result);
  }
  for (const p of plan.participations) {
    const participationId = participationIds.get(p.input.externalKey)!;
    for (const b of p.brands) {
      for (const m of b.models) {
        if (m.existing && m.upgradeTo) {
          await upgradeFairModelPackage(ctx, { eventModelId: m.existing._id, toTier: m.upgradeTo, note: "import" }, actorUserId, now);
          results.upgrades += 1;
        }
        const { modelId, result } = await upsertFairModel(ctx, {
          eventId: event._id,
          participationId,
          standId: standIds.get(b.standKey)!,
          brandId: b.brandId,
          externalKey: m.input.externalKey,
          slug: m.slug,
          displayName: m.input.displayName,
          variant: m.input.variant,
          priceText: m.input.priceText,
          specifications: m.input.specifications,
          photoUrl: m.input.photoUrl,
          packageTier: m.input.packageTier,
          packageActiveFrom: m.packageActiveFrom,
          passportEligible: m.input.passportEligible,
          sortOrder: m.input.sortOrder,
        }, actorUserId, now);
        count(results.models, result);
        if (m.assignCode) {
          const assigned = await assignFairQr(ctx, { eventModelId: modelId, resolverCode: m.assignCode, reason: "import" }, actorUserId, now);
          if (assigned.created) results.qrAssignments += 1;
        }
      }
    }
  }
  await writeAdminAudit(ctx, {
    actorUserId,
    action: "fair_import_committed",
    detail: { eventId: event._id, eventCode: event.code, version: payload.version, results },
    now,
  });
  return { committed: true, issues: plan.issues, results };
}

export const commit = mutation({
  args: { payload: fairImportPayload },
  returns: v.object({ committed: v.boolean(), issues: v.array(fairIssueValidator), results: commitResults }),
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const result = await commitFairImport(ctx, args.payload, admin._id, Date.now());
    // Admin UX A7: imported models and packages can change the brands'
    // automatic passports; the sync runs right after, in its own transaction.
    const event = result.committed ? await fairEventByCode(ctx, args.payload.eventCode) : null;
    if (event) await ctx.scheduler.runAfter(0, internal.fairPassports.syncEventPassports, { eventId: event._id });
    return result;
  },
});
