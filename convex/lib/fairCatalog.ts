import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  FAIR_DATE_KEY_PATTERN,
  FAIR_EVENT_TIMEZONE,
  FAIR_EXTERNAL_KEY_PATTERN,
  FAIR_MAX_HIGHLIGHT_SPECIFICATIONS,
  FAIR_MAX_SPECIFICATIONS_PER_MODEL,
  FAIR_PII_PURGE_AT_MS,
  FAIR_PRICE_ON_REQUEST_TEXT,
  FAIR_PUBLIC_VOTE_THRESHOLD,
  FAIR_SLUG_MAX_LENGTH,
  type FairAdminIssue,
  type FairAdminIssueCode,
  type FairErrorDetails,
  type FairPackageTier,
} from "../../lib/fair-contract";
import { fairPackageChangeProblem } from "../../lib/fair-entitlements";
import { isFairMapStandLocation } from "../../lib/fair-map";
import { belgradeDayBounds } from "../../lib/admin-v1/task-time";
import { isSafePublicDestination } from "./validation";
import { normalizeAdminEmail } from "./adminV1Validators";
import type { fairEventStatus, fairParticipationStatus, fairStandStatus } from "./fairValidators";

// Sajam automobila 2026 — B1 catalog core (BACKEND-HANDOFF §5.1, §7, §8).
// One write path shared by convex/fairAdmin.ts, convex/fairImport.ts and the
// DEV fixture. Every upsert is idempotent by its stable key and writes nothing
// when the stored row already matches. Links to EXISTING accounts/businesses/
// accountContacts/brands are validated; a missing or conflicting link is a
// hard error. Errors are ConvexError({ code, details? }) with stable codes from
// FAIR_ADMIN_ISSUE_CODES (lib/fair-contract.ts) — never user-facing text.

type Ctx = QueryCtx | MutationCtx;
export type UpsertResult = "created" | "updated" | "unchanged";

export function fairAdminError(code: FairAdminIssueCode, details?: FairErrorDetails): never {
  throw new ConvexError(details ? { code, details } : { code });
}

export const fairIssueValidator = v.object({
  severity: v.union(v.literal("error"), v.literal("warning")),
  code: v.string(),
  path: v.string(),
  details: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
});

export function fairIssue(
  severity: FairAdminIssue["severity"],
  code: FairAdminIssueCode,
  path: string,
  details?: FairErrorDetails,
): FairAdminIssue {
  return details ? { severity, code, path, details } : { severity, code, path };
}

export function throwFirstError(issues: readonly FairAdminIssue[]) {
  const error = issues.find((issue) => issue.severity === "error");
  if (error) fairAdminError(error.code, { path: error.path, ...error.details });
}

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

export function isFairExternalKey(value: string) {
  return value.length <= 160 && FAIR_EXTERNAL_KEY_PATTERN.test(value);
}

export function requireExternalKey(value: string, field: string) {
  if (!isFairExternalKey(value)) fairAdminError("INVALID_INPUT", { field });
  return value;
}

export function requireText(value: string, field: string, max = 200) {
  const text = value.trim();
  if (!text || text.length > max) fairAdminError("INVALID_INPUT", { field });
  return text;
}

export function optionalText(value: string | undefined, field: string, max = 500) {
  if (value === undefined) return undefined;
  const text = value.trim();
  if (text.length > max) fairAdminError("INVALID_INPUT", { field });
  return text || undefined;
}

/** Model slug from its public name: ASCII, lowercase, single hyphens, ≤80 chars. */
export function fairSlugify(value: string): string {
  return value
    .replace(/[đĐ]/g, "dj")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, FAIR_SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
}

export function isFairSlug(value: string) {
  return value.length <= FAIR_SLUG_MAX_LENGTH && FAIR_EXTERNAL_KEY_PATTERN.test(value);
}

/** Missing or blank price → the contract fallback plus a warning; never an invented price. */
export function fairPriceText(value: string | undefined) {
  const text = value?.trim();
  return text ? { priceText: text, missing: false } : { priceText: FAIR_PRICE_ON_REQUEST_TEXT, missing: true };
}

export function isApprovedPhotoUrl(value: string) {
  return isSafePublicDestination(value);
}

// Admin/import input for one specification. Group and highlight are optional
// because 04-specifications.csv has neither column yet (contract §9.5): absent
// means group "general" with an empty label (the frontend renders no group
// heading) and isHighlight false. Nothing is derived from the label text.
export const fairSpecificationInput = v.object({
  id: v.optional(v.string()),
  groupId: v.optional(v.string()),
  groupLabel: v.optional(v.string()),
  groupOrder: v.optional(v.number()),
  label: v.string(),
  value: v.string(),
  order: v.number(),
  isHighlight: v.optional(v.boolean()),
});
export type FairSpecificationInput = Infer<typeof fairSpecificationInput>;
export type FairSpecification = Doc<"fairEventModels">["specifications"][number];

const DEFAULT_SPEC_GROUP_ID = "general";

function positiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

/** Normalizes and validates specifications; ordered by group, then item order. */
export function normalizeFairSpecifications(
  items: readonly FairSpecificationInput[],
  path: string,
): { specifications: FairSpecification[]; issues: FairAdminIssue[] } {
  const issues: FairAdminIssue[] = [];
  if (items.length > FAIR_MAX_SPECIFICATIONS_PER_MODEL) {
    issues.push(fairIssue("error", "FAIR_SPECIFICATIONS_INVALID", path, { reason: "too_many", count: items.length }));
  }
  const orders = new Set<number>();
  const ids = new Set<string>();
  const groups = new Map<string, { label: string; order: number }>();
  const specifications: FairSpecification[] = [];
  items.forEach((item, index) => {
    const at = `${path}[${index}]`;
    const label = item.label.trim();
    const value = item.value.trim();
    if (!label || !value || label.length > 200 || value.length > 500) {
      issues.push(fairIssue("error", "FAIR_SPECIFICATIONS_INVALID", at, { reason: "label_or_value" }));
    }
    if (!positiveInteger(item.order) || orders.has(item.order)) {
      issues.push(fairIssue("error", "FAIR_SPECIFICATIONS_INVALID", at, { reason: "order" }));
    }
    orders.add(item.order);
    const id = item.id?.trim() || `spec-${item.order}`;
    if (!isFairExternalKey(id) || ids.has(id)) {
      issues.push(fairIssue("error", "FAIR_SPECIFICATIONS_INVALID", at, { reason: "id" }));
    }
    ids.add(id);
    const groupId = item.groupId?.trim() || DEFAULT_SPEC_GROUP_ID;
    const groupLabel = item.groupLabel?.trim() ?? "";
    const groupOrder = item.groupOrder ?? 1;
    const known = groups.get(groupId);
    if (!isFairExternalKey(groupId) || !positiveInteger(groupOrder) || groupLabel.length > 120 || (known && (known.label !== groupLabel || known.order !== groupOrder))) {
      issues.push(fairIssue("error", "FAIR_SPECIFICATIONS_INVALID", at, { reason: "group" }));
    }
    if (!known) groups.set(groupId, { label: groupLabel, order: groupOrder });
    specifications.push({ id, groupId, groupLabel, groupOrder, label, value, order: item.order, isHighlight: item.isHighlight ?? false });
  });
  issues.push(...highlightIssues(specifications, path));
  specifications.sort((a, b) => a.groupOrder - b.groupOrder || a.order - b.order);
  return { specifications, issues };
}

export function highlightIssues(specifications: readonly FairSpecification[], path: string): FairAdminIssue[] {
  const highlights = specifications.filter((spec) => spec.isHighlight).length;
  return highlights > FAIR_MAX_HIGHLIGHT_SPECIFICATIONS
    ? [fairIssue("error", "FAIR_HIGHLIGHT_LIMIT", path, { count: highlights, max: FAIR_MAX_HIGHLIGHT_SPECIFICATIONS })]
    : [];
}

// -----------------------------------------------------------------------------
// Map location seam
// -----------------------------------------------------------------------------

/** Shape rule: non-empty, ≤120, no whitespace. */
export function isFairMapLocationId(id: string) {
  return id.length > 0 && id.length <= 120 && !/\s/.test(id);
}

/** Shape rule plus M0 geometry: the id is an exhibitor stand on the event's map (lib/fair-map). */
export function isFairEventMapLocationId(eventCode: string, id: string) {
  return isFairMapLocationId(id) && isFairMapStandLocation(eventCode, id);
}

/**
 * Seam for the stand ↔ map contract (HANDOFF §8, DATA-INTAKE §5). Since M0
 * each id must be a location of the event's map geometry that takes stands
 * (lib/fair-map; a `test-` event uses the real map, a placeholder is never a
 * stand). Owner decision O4 (Aleksa, 2026-10-08; also Jovan's N3): different
 * stands/exhibitors may share one map location (e.g. hala-6: AUTO MIG/Foton and
 * Grand Motors/Mazda+Chery), so a shared id is only a FAIR_MAP_LOCATION_TAKEN
 * warning, never an error; an invalid or unknown id stays an error.
 * `participationKey`/`participationId` (N3 callers) are accepted and unused.
 */
export async function validateMapLocationIds(
  ctx: Ctx,
  eventId: Id<"fairEvents"> | null,
  entries: ReadonlyArray<{ standKey: string; participationKey?: string; participationId?: Id<"fairParticipations">; mapLocationId: string; path: string }>,
): Promise<FairAdminIssue[]> {
  const issues: FairAdminIssue[] = [];
  const owners = new Map<string, string>();
  const event = eventId ? await ctx.db.get(eventId) : null;
  for (const entry of entries) {
    const id = entry.mapLocationId.trim();
    if (!isFairMapLocationId(id)) {
      issues.push(fairIssue("error", "FAIR_MAP_LOCATION_INVALID", entry.path));
      continue;
    }
    if (eventId && (!event || !isFairMapStandLocation(event.code, id))) {
      issues.push(fairIssue("error", "FAIR_MAP_LOCATION_INVALID", entry.path, { mapLocationId: id }));
      continue;
    }
    const owner = owners.get(id);
    if (owner !== undefined && owner !== entry.standKey) {
      issues.push(fairIssue("warning", "FAIR_MAP_LOCATION_TAKEN", entry.path, { mapLocationId: id }));
      continue;
    }
    owners.set(id, entry.standKey);
    if (!eventId) continue;
    const stands = await ctx.db
      .query("fairStands")
      .withIndex("by_eventId_and_mapLocationId", (q) => q.eq("eventId", eventId).eq("mapLocationId", id))
      .take(10);
    if (stands.some((stand) => stand.status !== "withdrawn" && stand.externalKey !== entry.standKey)) {
      issues.push(fairIssue("warning", "FAIR_MAP_LOCATION_TAKEN", entry.path, { mapLocationId: id }));
    }
  }
  return issues;
}

// -----------------------------------------------------------------------------
// Shared reads
// -----------------------------------------------------------------------------

// Key-order-insensitive comparison: stored objects do not keep insertion order.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).filter((key) => row[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(row[key])}`).join(",")}}`;
  }
  return value === undefined ? "undefined" : JSON.stringify(value);
}

function sameValue(a: unknown, b: unknown) {
  return stableJson(a) === stableJson(b);
}

function changedFields<T extends Record<string, unknown>>(doc: Record<string, unknown>, fields: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(fields) as (keyof T)[]) {
    if (!sameValue(doc[key as string], fields[key])) changed[key] = fields[key];
  }
  return changed;
}

export async function requireFairEvent(ctx: Ctx, eventId: Id<"fairEvents">) {
  const event = await ctx.db.get(eventId);
  if (!event) fairAdminError("FAIR_EVENT_NOT_FOUND");
  return event;
}

export async function fairEventByCode(ctx: Ctx, code: string) {
  return ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", code)).unique();
}

export async function fairModelBySlug(ctx: Ctx, eventId: Id<"fairEvents">, slug: string) {
  return ctx.db.query("fairEventModels").withIndex("by_eventId_and_slug", (q) => q.eq("eventId", eventId).eq("slug", slug)).take(2);
}

export async function activeAssignmentForModel(ctx: Ctx, eventModelId: Id<"fairEventModels">) {
  return ctx.db
    .query("fairQrAssignments")
    .withIndex("by_eventModelId_and_status", (q) => q.eq("eventModelId", eventModelId).eq("status", "assigned"))
    .first();
}

/**
 * Account → business → contact link check (HANDOFF §5.1, §8): every record must
 * exist and belong to the same account. Celebration tenants are never exhibitors.
 */
export async function participationLinkIssues(
  ctx: Ctx,
  input: { accountId: Id<"accounts">; businessId: Id<"businesses">; primaryContactId?: Id<"accountContacts"> },
  path: string,
): Promise<FairAdminIssue[]> {
  const [account, business] = await Promise.all([ctx.db.get(input.accountId), ctx.db.get(input.businessId)]);
  if (!account) return [fairIssue("error", "FAIR_LINK_NOT_FOUND", path, { link: "account" })];
  if (!business) return [fairIssue("error", "FAIR_LINK_NOT_FOUND", path, { link: "business" })];
  if (business.accountId !== account._id || business.kind === "celebration") {
    return [fairIssue("error", "FAIR_LINK_CONFLICT", path, { link: "business" })];
  }
  if (input.primaryContactId) {
    const contact = await ctx.db.get(input.primaryContactId);
    if (!contact) return [fairIssue("error", "FAIR_LINK_NOT_FOUND", path, { link: "contact" })];
    if (contact.accountId !== account._id) return [fairIssue("error", "FAIR_LINK_CONFLICT", path, { link: "contact" })];
  }
  return [];
}

// -----------------------------------------------------------------------------
// Upsert cores
// -----------------------------------------------------------------------------

export type FairEventInput = {
  code: string;
  slug: string;
  title: string;
  venueName: string;
  startsAt: number;
  endsAt: number;
  status?: Infer<typeof fairEventStatus>;
  garagePriority: number;
  qrInventoryBusinessId?: Id<"businesses">;
};

export async function upsertFairEvent(ctx: MutationCtx, input: FairEventInput, now: number) {
  const code = requireExternalKey(input.code, "code");
  if (!isFairSlug(input.slug)) fairAdminError("INVALID_INPUT", { field: "slug" });
  if (!Number.isFinite(input.startsAt) || !Number.isFinite(input.endsAt) || input.startsAt >= input.endsAt) {
    fairAdminError("INVALID_INPUT", { field: "startsAt" });
  }
  if (!Number.isInteger(input.garagePriority)) fairAdminError("INVALID_INPUT", { field: "garagePriority" });
  if (input.qrInventoryBusinessId && !(await ctx.db.get(input.qrInventoryBusinessId))) {
    fairAdminError("FAIR_LINK_NOT_FOUND", { link: "qrInventoryBusiness" });
  }
  const existing = await fairEventByCode(ctx, code);
  const slugOwner = await ctx.db.query("fairEvents").withIndex("by_slug", (q) => q.eq("slug", input.slug)).first();
  if (slugOwner && slugOwner._id !== existing?._id) fairAdminError("FAIR_SLUG_TAKEN", { field: "slug" });
  const fields = {
    slug: input.slug,
    title: requireText(input.title, "title"),
    venueName: requireText(input.venueName, "venueName"),
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    garagePriority: input.garagePriority,
    ...(input.status ? { status: input.status } : {}),
    ...(input.qrInventoryBusinessId ? { qrInventoryBusinessId: input.qrInventoryBusinessId } : {}),
  };
  if (!existing) {
    const eventId = await ctx.db.insert("fairEvents", {
      code,
      ...fields,
      status: input.status ?? "draft",
      timezone: FAIR_EVENT_TIMEZONE,
      piiPurgeAt: FAIR_PII_PURGE_AT_MS,
      minimumPublicVoteCount: FAIR_PUBLIC_VOTE_THRESHOLD,
      robotsIndexable: false,
      createdAt: now,
      updatedAt: now,
    });
    return { eventId, result: "created" as UpsertResult };
  }
  const changed = changedFields(existing, fields);
  if (!Object.keys(changed).length) return { eventId: existing._id, result: "unchanged" as UpsertResult };
  await ctx.db.patch(existing._id, { ...changed, updatedAt: now });
  return { eventId: existing._id, result: "updated" as UpsertResult };
}

export async function upsertFairEventDay(
  ctx: MutationCtx,
  input: { eventId: Id<"fairEvents">; dateKey: string; label: string; sortOrder: number },
) {
  const event = await requireFairEvent(ctx, input.eventId);
  let bounds: { start: number; end: number };
  try {
    if (!FAIR_DATE_KEY_PATTERN.test(input.dateKey)) throw new Error("date");
    bounds = belgradeDayBounds(input.dateKey);
  } catch {
    fairAdminError("INVALID_INPUT", { field: "dateKey" });
  }
  // The Belgrade calendar day must overlap the event window.
  if (bounds.end <= event.startsAt || bounds.start >= event.endsAt) fairAdminError("INVALID_INPUT", { field: "dateKey" });
  if (!Number.isInteger(input.sortOrder)) fairAdminError("INVALID_INPUT", { field: "sortOrder" });
  const fields = { label: requireText(input.label, "label", 120), startsAt: bounds.start, endsAt: bounds.end, sortOrder: input.sortOrder };
  const existing = await ctx.db
    .query("fairEventDays")
    .withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", event._id).eq("dateKey", input.dateKey))
    .unique();
  if (!existing) {
    const dayId = await ctx.db.insert("fairEventDays", { eventId: event._id, dateKey: input.dateKey, ...fields });
    return { dayId, result: "created" as UpsertResult };
  }
  const changed = changedFields(existing, fields);
  if (!Object.keys(changed).length) return { dayId: existing._id, result: "unchanged" as UpsertResult };
  await ctx.db.patch(existing._id, changed);
  return { dayId: existing._id, result: "updated" as UpsertResult };
}

export type FairParticipationInput = {
  eventId: Id<"fairEvents">;
  externalKey: string;
  accountId: Id<"accounts">;
  businessId: Id<"businesses">;
  primaryContactId?: Id<"accountContacts">;
  reportRecipientEmail?: string;
  leadDeliveryNote?: string;
  status?: Infer<typeof fairParticipationStatus>;
};

export async function upsertFairParticipation(ctx: MutationCtx, input: FairParticipationInput, now: number) {
  const event = await requireFairEvent(ctx, input.eventId);
  const externalKey = requireExternalKey(input.externalKey, "externalKey");
  throwFirstError(await participationLinkIssues(ctx, input, "participation"));
  const existing = await ctx.db
    .query("fairParticipations")
    .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", externalKey))
    .unique();
  if (existing && (existing.accountId !== input.accountId || existing.businessId !== input.businessId)) {
    fairAdminError("FAIR_LINK_CONFLICT", { link: "participation" });
  }
  const sameBusiness = await ctx.db
    .query("fairParticipations")
    .withIndex("by_eventId_and_businessId", (q) => q.eq("eventId", event._id).eq("businessId", input.businessId))
    .first();
  if (sameBusiness && sameBusiness.externalKey !== externalKey) fairAdminError("FAIR_DUPLICATE_KEY", { field: "businessId" });
  const reportRecipientEmail = input.reportRecipientEmail?.trim() ? normalizeAdminEmail(input.reportRecipientEmail) : undefined;
  if (reportRecipientEmail !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportRecipientEmail)) {
    fairAdminError("INVALID_INPUT", { field: "reportRecipientEmail" });
  }
  const fields = {
    ...(input.primaryContactId ? { primaryContactId: input.primaryContactId } : {}),
    ...(reportRecipientEmail ? { reportRecipientEmail } : {}),
    ...(input.leadDeliveryNote !== undefined ? { leadDeliveryNote: optionalText(input.leadDeliveryNote, "leadDeliveryNote") } : {}),
    ...(input.status ? { status: input.status } : {}),
  };
  if (!existing) {
    const participationId = await ctx.db.insert("fairParticipations", {
      externalKey,
      eventId: event._id,
      accountId: input.accountId,
      businessId: input.businessId,
      ...fields,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    });
    return { participationId, result: "created" as UpsertResult };
  }
  const changed = changedFields(existing, fields);
  if (!Object.keys(changed).length) return { participationId: existing._id, result: "unchanged" as UpsertResult };
  await ctx.db.patch(existing._id, { ...changed, updatedAt: now });
  return { participationId: existing._id, result: "updated" as UpsertResult };
}

export type FairStandInput = {
  eventId: Id<"fairEvents">;
  participationId: Id<"fairParticipations">;
  externalKey: string;
  code: string;
  displayName: string;
  mapLocationId: string;
  status?: Infer<typeof fairStandStatus>;
};

export async function upsertFairStand(ctx: MutationCtx, input: FairStandInput, now: number) {
  const event = await requireFairEvent(ctx, input.eventId);
  const externalKey = requireExternalKey(input.externalKey, "externalKey");
  const participation = await ctx.db.get(input.participationId);
  if (!participation || participation.eventId !== event._id) fairAdminError("FAIR_LINK_CONFLICT", { link: "participation" });
  const existing = await ctx.db
    .query("fairStands")
    .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", externalKey))
    .unique();
  if (existing && existing.participationId !== participation._id) fairAdminError("FAIR_LINK_CONFLICT", { link: "stand" });
  const mapLocationId = input.mapLocationId.trim();
  throwFirstError(await validateMapLocationIds(ctx, event._id, [{ standKey: externalKey, participationKey: participation._id, participationId: participation._id, mapLocationId, path: "mapLocationId" }]));
  const fields = {
    code: requireText(input.code, "code", 40),
    displayName: requireText(input.displayName, "displayName", 120),
    mapLocationId,
    ...(input.status ? { status: input.status } : {}),
  };
  if (!existing) {
    const standId = await ctx.db.insert("fairStands", {
      eventId: event._id,
      participationId: participation._id,
      externalKey,
      ...fields,
      status: input.status ?? "active",
      createdAt: now,
      updatedAt: now,
    });
    return { standId, result: "created" as UpsertResult };
  }
  const changed = changedFields(existing, fields);
  if (!Object.keys(changed).length) return { standId: existing._id, result: "unchanged" as UpsertResult };
  await ctx.db.patch(existing._id, { ...changed, updatedAt: now });
  return { standId: existing._id, result: "updated" as UpsertResult };
}

export type FairModelInput = {
  eventId: Id<"fairEvents">;
  participationId: Id<"fairParticipations">;
  standId: Id<"fairStands">;
  brandId: Id<"brands">;
  externalKey: string;
  slug?: string;
  displayName: string;
  variant?: string;
  priceText?: string;
  specifications: FairSpecificationInput[];
  photoUrl?: string;
  packageTier: FairPackageTier;
  /** When the initial tier takes effect (DATA-INTAKE `package_active_from`); default now. */
  packageActiveFrom?: number;
  passportEligible: boolean;
  sortOrder?: number;
};

/**
 * Creates or updates one exhibited model. The package tier is set only at
 * creation (with an initial `included → tier` activation row, contract §9.16);
 * afterwards it changes only through upgradeFairModelPackage. Status is never
 * changed here (publish/withdraw do that). The slug is stable once created.
 */
export async function upsertFairModel(ctx: MutationCtx, input: FairModelInput, actorUserId: Id<"users">, now: number) {
  const event = await requireFairEvent(ctx, input.eventId);
  const externalKey = requireExternalKey(input.externalKey, "externalKey");
  const [participation, stand, brand] = await Promise.all([
    ctx.db.get(input.participationId),
    ctx.db.get(input.standId),
    ctx.db.get(input.brandId),
  ]);
  if (!participation || participation.eventId !== event._id) fairAdminError("FAIR_LINK_CONFLICT", { link: "participation" });
  if (!stand || stand.eventId !== event._id || stand.participationId !== participation._id) fairAdminError("FAIR_LINK_CONFLICT", { link: "stand" });
  if (!brand) fairAdminError("FAIR_LINK_NOT_FOUND", { link: "brand" });
  if (brand.accountId !== participation.accountId) fairAdminError("FAIR_LINK_CONFLICT", { link: "brand" });
  const existing = await ctx.db
    .query("fairEventModels")
    .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", externalKey))
    .unique();
  if (existing && (existing.participationId !== participation._id || existing.brandId !== brand._id)) {
    fairAdminError("FAIR_LINK_CONFLICT", { link: "model" });
  }
  if (existing && existing.packageTier !== input.packageTier) fairAdminError("FAIR_PACKAGE_CHANGE_REQUIRES_UPGRADE");
  const displayName = requireText(input.displayName, "displayName", 120);
  const variant = optionalText(input.variant, "variant", 120);
  const slug = existing && input.slug === undefined
    ? existing.slug
    : input.slug ?? fairSlugify(variant ? `${displayName} ${variant}` : displayName);
  if (!isFairSlug(slug)) fairAdminError("INVALID_INPUT", { field: "slug" });
  const slugOwners = await fairModelBySlug(ctx, event._id, slug);
  if (slugOwners.some((model) => model._id !== existing?._id)) fairAdminError("FAIR_SLUG_TAKEN", { slug });
  const { specifications, issues } = normalizeFairSpecifications(input.specifications, "specifications");
  throwFirstError(issues);
  if (input.photoUrl !== undefined && !isApprovedPhotoUrl(input.photoUrl)) fairAdminError("INVALID_INPUT", { field: "photoUrl" });
  if (input.sortOrder !== undefined && !Number.isInteger(input.sortOrder)) fairAdminError("INVALID_INPUT", { field: "sortOrder" });
  const price = fairPriceText(input.priceText);
  const warnings: FairAdminIssue[] = [];
  if (price.missing) warnings.push(fairIssue("warning", "FAIR_PRICE_MISSING", "priceText"));
  if (!input.photoUrl && !existing?.photoStorageId) warnings.push(fairIssue("warning", "FAIR_PHOTO_MISSING", "photoUrl"));
  const fields = {
    standId: stand._id,
    slug,
    displayName,
    variant,
    priceText: price.priceText,
    specifications,
    photoUrl: input.photoUrl,
    passportEligible: input.passportEligible,
    sortOrder: input.sortOrder ?? existing?.sortOrder ?? 0,
  };
  if (!existing) {
    const activatedAt = input.packageActiveFrom ?? now;
    if (!Number.isFinite(activatedAt)) fairAdminError("INVALID_INPUT", { field: "packageActiveFrom" });
    const modelId = await ctx.db.insert("fairEventModels", {
      externalKey,
      eventId: event._id,
      participationId: participation._id,
      brandId: brand._id,
      ...fields,
      packageTier: input.packageTier,
      packageActivatedAt: activatedAt,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    if (input.packageTier !== "included") {
      await ctx.db.insert("fairPackageActivations", {
        eventModelId: modelId,
        eventId: event._id,
        fromTier: "included",
        toTier: input.packageTier,
        activatedAt,
        actorUserId,
        note: "initial_tier",
      });
    }
    return { modelId, result: "created" as UpsertResult, warnings };
  }
  const changed = changedFields(existing, fields);
  if (!Object.keys(changed).length) return { modelId: existing._id, result: "unchanged" as UpsertResult, warnings };
  await ctx.db.patch(existing._id, { ...changed, updatedAt: now });
  return { modelId: existing._id, result: "updated" as UpsertResult, warnings };
}

/**
 * Upgrade only (included → starter → advanced, HANDOFF §4.1) via the central
 * entitlement rule. The model's tier and its fairPackageActivations audit row
 * are written in this one mutation; the QR assignment and card target are not
 * touched. The activation takes effect now (or when the current tier starts,
 * if that is still ahead) — never retroactively.
 */
export async function upgradeFairModelPackage(
  ctx: MutationCtx,
  input: { eventModelId: Id<"fairEventModels">; toTier: FairPackageTier; note?: string },
  actorUserId: Id<"users">,
  now: number,
) {
  const model = await ctx.db.get(input.eventModelId);
  if (!model) fairAdminError("FAIR_MODEL_NOT_FOUND");
  const problem = fairPackageChangeProblem(model.packageTier, input.toTier);
  if (problem === "same_tier") fairAdminError("FAIR_PACKAGE_SAME_TIER", { tier: model.packageTier });
  if (problem === "downgrade") fairAdminError("FAIR_PACKAGE_DOWNGRADE", { from: model.packageTier, to: input.toTier });
  const note = optionalText(input.note, "note", 200);
  // An upgrade entered before the current tier takes effect (e.g. a package
  // imported with a future package_active_from) starts with it, never before
  // it — otherwise the history would read as a later downgrade.
  const activatedAt = Math.max(now, model.packageActivatedAt);
  await ctx.db.patch(model._id, { packageTier: input.toTier, packageActivatedAt: activatedAt, updatedAt: now });
  const activationId = await ctx.db.insert("fairPackageActivations", {
    eventModelId: model._id,
    eventId: model.eventId,
    fromTier: model.packageTier,
    toTier: input.toTier,
    activatedAt,
    actorUserId,
    ...(note ? { note } : {}),
  });
  return { activationId, fromTier: model.packageTier, toTier: input.toTier, activatedAt };
}

// -----------------------------------------------------------------------------
// Publish validation
// -----------------------------------------------------------------------------

/** Facts the publish rules need; loaded per model or preloaded per event. */
export type FairPublishFacts = {
  eventExists: boolean;
  participation: Doc<"fairParticipations"> | null;
  stand: Doc<"fairStands"> | null;
  /** Map-location seam result for the model's stand. */
  mapIssues: FairAdminIssue[];
  /** Another model of the same event already uses this slug. */
  slugTaken: boolean;
  hasActiveQr: boolean;
};

/**
 * Publish rules (HANDOFF §5.1, §6, §8; DATA-INTAKE §5): ≤4 highlights, 1–100
 * specifications (DATA-INTAKE §5.6), slug unique in the event, a price text
 * (fallback allowed, flagged), photo optional, a non-withdrawn stand with a
 * valid mapLocationId and a non-withdrawn participation. A missing QR is a
 * warning: the physical scan check is a separate human gate (DATA-INTAKE §7).
 */
export function fairPublishIssuesFromFacts(model: Doc<"fairEventModels">, facts: FairPublishFacts): FairAdminIssue[] {
  const issues: FairAdminIssue[] = [];
  if (!facts.eventExists) issues.push(fairIssue("error", "FAIR_EVENT_NOT_FOUND", "eventId"));
  if (!facts.participation || facts.participation.status === "withdrawn") issues.push(fairIssue("error", "FAIR_LINK_CONFLICT", "participationId"));
  if (!facts.stand || facts.stand.status === "withdrawn") issues.push(fairIssue("error", "FAIR_MAP_LOCATION_INVALID", "standId"));
  else issues.push(...facts.mapIssues);
  if (!model.specifications.length || model.specifications.length > FAIR_MAX_SPECIFICATIONS_PER_MODEL) {
    issues.push(fairIssue("error", "FAIR_SPECIFICATIONS_INVALID", "specifications", { count: model.specifications.length }));
  }
  issues.push(...highlightIssues(model.specifications, "specifications"));
  if (!isFairSlug(model.slug)) issues.push(fairIssue("error", "INVALID_INPUT", "slug"));
  if (facts.slugTaken) issues.push(fairIssue("error", "FAIR_SLUG_TAKEN", "slug"));
  if (!model.priceText.trim()) issues.push(fairIssue("error", "INVALID_INPUT", "priceText"));
  if (model.priceText === FAIR_PRICE_ON_REQUEST_TEXT) issues.push(fairIssue("warning", "FAIR_PRICE_MISSING", "priceText"));
  if (!model.photoUrl && !model.photoStorageId) issues.push(fairIssue("warning", "FAIR_PHOTO_MISSING", "photoUrl"));
  if (!facts.hasActiveQr) issues.push(fairIssue("warning", "FAIR_QR_MISSING", "qr"));
  return issues;
}

export async function fairModelPublishIssues(ctx: Ctx, model: Doc<"fairEventModels">): Promise<FairAdminIssue[]> {
  const [event, participation, stand] = await Promise.all([
    ctx.db.get(model.eventId),
    ctx.db.get(model.participationId),
    ctx.db.get(model.standId),
  ]);
  const mapIssues = stand
    ? await validateMapLocationIds(ctx, model.eventId, [{ standKey: stand.externalKey, participationKey: stand.participationId, participationId: stand.participationId, mapLocationId: stand.mapLocationId, path: "stand.mapLocationId" }])
    : [];
  const slugOwners = await fairModelBySlug(ctx, model.eventId, model.slug);
  return fairPublishIssuesFromFacts(model, {
    eventExists: event !== null,
    participation,
    stand,
    mapIssues,
    slugTaken: slugOwners.some((other) => other._id !== model._id),
    hasActiveQr: (await activeAssignmentForModel(ctx, model._id)) !== null,
  });
}

export async function setFairModelStatus(
  ctx: MutationCtx,
  eventModelId: Id<"fairEventModels">,
  status: "published" | "withdrawn",
  now: number,
) {
  const model = await ctx.db.get(eventModelId);
  if (!model) fairAdminError("FAIR_MODEL_NOT_FOUND");
  const issues = status === "published" ? await fairModelPublishIssues(ctx, model) : [];
  const errors = issues.filter((issue) => issue.severity === "error");
  if (errors.length) {
    throw new ConvexError({ code: "FAIR_PUBLISH_INVALID" as FairAdminIssueCode, issues: errors });
  }
  if (model.status !== status) await ctx.db.patch(model._id, { status, updatedAt: now });
  return { model, changed: model.status !== status, warnings: issues };
}
