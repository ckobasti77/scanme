import { ConvexError, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { generateCode } from "./codes";
import { accessDestinationInput, SUBJECT_CHANNEL_LIMIT } from "./accessValidators";
import { channelProblem, destinationProblem } from "./accessResolution";
import { syncAutomaticAction } from "./adminActionEngine";
import { writeAdminAudit } from "./adminAudit";
import { normalizeAdminSearchText } from "./adminV1Validators";
import { adminDomainSr } from "../../lib/i18n/sr/admin-domain";
import { validateTargetSpec } from "../cards";

type Ctx = QueryCtx | MutationCtx;
export type DestinationInput = Infer<typeof accessDestinationInput>;
export type Actor = Doc<"accessChannels">["lastActor"];
export function textRequired(value: string, max = 500) {
  if (!value.trim() || value.trim().length > max) throw new ConvexError("access_text_required");
  return value.trim();
}
export function fingerprint(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const row = value as Record<string, unknown>;
    return `{${Object.keys(row).filter(k => row[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${fingerprint(row[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export async function replay(ctx: Ctx, key: string, payload: unknown) {
  textRequired(key, 160);
  const previous = await ctx.db.query("accessCommands").withIndex("by_key", q => q.eq("key", key)).unique();
  if (previous && previous.fingerprint !== fingerprint(payload)) throw new ConvexError("access_idempotency_payload_mismatch");
  return previous;
}
export async function remember(ctx: MutationCtx, key: string, payload: unknown, result: { productIds?: Id<"physicalProducts">[]; digitalQrId?: Id<"digitalQrCodes">; failureReason?: string } = {}) {
  const previous = await replay(ctx, key, payload);
  const row = { key, fingerprint: fingerprint(payload), productIds: result.productIds ?? [], digitalQrId: result.digitalQrId, failureReason: result.failureReason, createdAt: previous?.createdAt ?? Date.now() };
  if (previous) await ctx.db.patch(previous._id, row); else await ctx.db.insert("accessCommands", row);
}
export async function requireScope(ctx: Ctx, accountId: Id<"accounts">, businessId: Id<"businesses">) {
  const [account, business] = await Promise.all([ctx.db.get(accountId), ctx.db.get(businessId)]);
  if (!account || !business || business.accountId !== accountId) throw new ConvexError("access_cross_account_venue");
  return { account, business };
}
export async function subjectInScope(ctx: Ctx, subjectId: Id<"accessSubjects">, accountId: Id<"accounts">, businessId: Id<"businesses">) {
  await requireScope(ctx, accountId, businessId);
  const subject = await ctx.db.get(subjectId);
  if (!subject || subject.accountId !== accountId || subject.businessId !== businessId) throw new ConvexError("access_cross_account_venue");
  return subject;
}

export async function uniqueCode(ctx: MutationCtx, kind: "SMF" | "SMQ" | "resolver") {
  for (let attempt = 0; attempt < 8; attempt++) {
    const suffix = generateCode();
    const code = kind === "resolver" ? suffix : `${kind}-${suffix}`;
    const taken = kind === "SMF"
      ? await ctx.db.query("physicalProducts").withIndex("by_smfCode", q => q.eq("smfCode", code)).unique()
      : kind === "SMQ"
        ? await ctx.db.query("digitalQrCodes").withIndex("by_smqCode", q => q.eq("smqCode", code)).unique()
        : await ctx.db.query("cards").withIndex("by_cardCode", q => q.eq("cardCode", code)).unique();
    const reserved = kind === "SMF" ? await ctx.db.query("orderSmfReferences").withIndex("by_reference", q => q.eq("reference", code)).unique() : null;
    if (!taken && !reserved) return code;
  }
  throw new ConvexError("access_code_collision");
}

export async function prepareDestination(ctx: Ctx, businessId: Id<"businesses">, input: DestinationInput) {
  if (input.kind === "dynamic_link") {
    const link = await ctx.db.get(input.dynamicLinkId);
    if (!link || link.businessId !== businessId) throw new ConvexError("access_destination_ownership");
    return { fields: await validateTargetSpec(ctx, businessId, { kind: "url", url: link.destinationUrl }), kind: "dynamic_url" as const };
  }
  if (input.serviceProfileIds.length < 1 || input.serviceProfileIds.length > 3 || new Set(input.serviceProfileIds).size !== input.serviceProfileIds.length) throw new ConvexError("access_services_invalid");
  const profiles: Doc<"serviceProfiles">[] = [];
  for (const id of input.serviceProfileIds) {
    const profile = await ctx.db.get(id);
    if (!profile || profile.businessId !== businessId) throw new ConvexError("access_destination_ownership");
    if (!["scanme_links", "google_review", "scanme_menu"].includes(profile.type) || profiles.some(p => p.type === profile.type)) throw new ConvexError("access_services_invalid");
    profiles.push(profile);
  }
  const links = profiles.find(p => p.type === "scanme_links");
  const selected = links ?? profiles[0];
  if (profiles.length === 1 || links) {
    return { fields: await validateTargetSpec(ctx, businessId, selected.type === "scanme_menu" ? { kind: "menu" } : { kind: "service_page", serviceProfileId: selected._id }), kind: profiles.length === 1 ? "service" as const : "links_splitter" as const };
  }
  const fields = await validateTargetSpec(ctx, businessId, { kind: "splitter", splitterItems: profiles.map(p => p.type === "scanme_menu"
    ? { kind: "menu", label: adminDomainSr.services.scanme_menu }
    : { kind: "service_page", serviceProfileId: p._id, label: adminDomainSr.services.scanme_review }) });
  return { fields, kind: "generic_splitter" as const };
}

export async function channelsFor(ctx: Ctx, subjectId: Id<"accessSubjects">) {
  const channels = await ctx.db.query("accessChannels").withIndex("by_subjectId", q => q.eq("subjectId", subjectId)).take(SUBJECT_CHANNEL_LIMIT + 1);
  if (channels.length > SUBJECT_CHANNEL_LIMIT) throw new ConvexError("access_channel_limit");
  return channels;
}

export async function syncChannel(ctx: MutationCtx, channel: Doc<"accessChannels">, subject: Doc<"accessSubjects">, actor: Actor, reason: string, now: number) {
  const target = subject.currentTargetId ? await ctx.db.get(subject.currentTargetId) : null;
  const problemReason = await channelProblem(ctx, channel, subject, target);
  const state = problemReason ? "problem" as const : channel.redirectEnabled ? "active" as const : "inactive" as const;
  const old = await ctx.db.get(channel._id);
  if (!old) throw new ConvexError("access_channel_missing");
  const changed = state !== old.state || old.health !== channel.health || old.redirectEnabled !== channel.redirectEnabled || old.problemReason !== problemReason || old.manualProblem !== channel.manualProblem;
  if (changed) {
    const resumeState = state === "problem" ? (old.state === "problem" ? old.resumeState : old.state) : undefined;
    await ctx.db.patch(channel._id, { state, resumeState, health: channel.health, redirectEnabled: channel.redirectEnabled, manualProblem: channel.manualProblem, problemReason, lastActor: actor, lastReason: reason, updatedAt: now });
    await ctx.db.insert("accessChannelEvents", { channelId: channel._id, fromState: old.state, toState: state, health: channel.health, redirectEnabled: channel.redirectEnabled, problemReason, actor, reason, createdAt: now });
  }
  await syncAutomaticAction(ctx, {
    domain: "qr_nfc", sourceRecordId: channel._id, causeKind: "channel_problem", sourceVersion: problemReason ?? "healthy",
    isOpen: state === "problem", accountId: channel.accountId, businessId: channel.businessId, productRef: subject.physicalProductId,
    severity: "blocking", relevantAt: changed ? now : old.updatedAt, priority: { blocking: true, overdue: false, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "scanme" },
  }, now);
  return { ...channel, state, problemReason };
}

export function projectColor(channels: Doc<"accessChannels">[], kind: "qr" | "nfc") {
  const selected = channels.filter(c => c.kind === kind);
  if (!selected.length) return "gray" as const;
  if (selected.some(c => c.state === "problem")) return "red" as const;
  return selected.some(c => c.state === "active") ? "green" as const : "orange" as const;
}

export async function refreshInventory(ctx: MutationCtx, subject: Doc<"accessSubjects">, now: number) {
  if (!subject.physicalProductId) return;
  const product = await ctx.db.get(subject.physicalProductId);
  if (!product) throw new ConvexError("access_product_missing");
  const channels = await channelsFor(ctx, subject._id);
  if (!channels.length) throw new ConvexError("access_channel_required");
  const placement = subject.currentPlacementId ? await ctx.db.get(subject.currentPlacementId) : null;
  const row = {
    productId: product._id, subjectId: subject._id, accountId: product.accountId, businessId: product.businessId,
    smfCode: product.smfCode, localSuffix: product.localSuffix, productType: product.productType,
    productLabel: adminDomainSr.products[product.productType], position: placement?.name ?? "",
    qr: projectColor(channels, "qr"), nfc: projectColor(channels, "nfc"),
    state: channels.some(c => c.state === "problem") ? "problem" as const : channels.some(c => c.state === "active") ? "active" as const : "inactive" as const,
    destinationKind: subject.destinationKind, currentTargetId: subject.currentTargetId,
    searchText: normalizeAdminSearchText([product.smfCode, product.smfCode.replaceAll("-", ""), product.localSuffix, adminDomainSr.products[product.productType], placement?.name, ...channels.flatMap(c => [c.resolverCode, c.smqCode])].filter(Boolean).join(" ")),
    updatedAt: now,
  };
  const existing = await ctx.db.query("productInventory").withIndex("by_productId", q => q.eq("productId", product._id)).unique();
  if (existing) await ctx.db.patch(existing._id, row); else await ctx.db.insert("productInventory", row);
}

export async function applyDestination(ctx: MutationCtx, subject: Doc<"accessSubjects">, input: DestinationInput, prepared: Awaited<ReturnType<typeof prepareDestination>>, actorUserId: Id<"users">, reason: string, now: number) {
  if (!subject.anchorCardId) throw new ConvexError("access_anchor_missing");
  const targetId = await ctx.db.insert("cardTargets", { cardId: subject.anchorCardId, ...prepared.fields, createdByUserId: actorUserId, createdAt: now });
  const patch = { currentTargetId: targetId, destinationKind: prepared.kind, destinationInput: input, updatedAt: now };
  await ctx.db.patch(subject._id, patch);
  await ctx.db.insert("accessDestinationHistory", { subjectId: subject._id, previousTargetId: subject.currentTargetId, targetId, actor: { kind: "admin", userId: actorUserId }, reason, createdAt: now });
  const updated = { ...subject, ...patch };
  for (const channel of await channelsFor(ctx, subject._id)) {
    await syncChannel(ctx, channel, updated, { kind: "admin", userId: actorUserId }, reason, now);
  }
  await refreshInventory(ctx, updated, now);
  await writeAdminAudit(ctx, { actorUserId, accountId: subject.accountId, businessId: subject.businessId, action: "access_destination_changed", detail: { subjectId: subject._id, previousTargetId: subject.currentTargetId, targetId, reason }, now });
  return targetId;
}

export async function createChannel(ctx: MutationCtx, subject: Doc<"accessSubjects">, kind: "qr" | "nfc", actorUserId: Id<"users">, now: number, legacy?: Doc<"cards">) {
  const resolverCode = legacy?.cardCode ?? await uniqueCode(ctx, "resolver");
  const cardId = legacy?._id ?? await ctx.db.insert("cards", { businessId: subject.businessId, cardCode: resolverCode, label: resolverCode, status: "active", totalScans: 0, createdAt: now, updatedAt: now });
  const channelId = await ctx.db.insert("accessChannels", {
    accountId: subject.accountId, businessId: subject.businessId, subjectId: subject._id, cardId, resolverCode, kind,
    state: "problem", redirectEnabled: legacy?.status === "active", health: legacy ? "healthy" : "unverified",
    problemReason: legacy ? "destination_missing" : "health_unverified", physicalProductId: subject.physicalProductId,
    binding: subject.physicalProductId ? "physical" : "digital", searchText: resolverCode,
    totalScans: legacy?.totalScans ?? 0, lastActor: { kind: "admin", userId: actorUserId }, lastReason: "created", createdAt: now, updatedAt: now,
  });
  await ctx.db.patch(cardId, { accessChannelId: channelId });
  if (!subject.anchorCardId) await ctx.db.patch(subject._id, { anchorCardId: cardId });
  await ctx.db.insert("accessChannelEvents", { channelId, toState: "problem", health: legacy ? "healthy" : "unverified", redirectEnabled: legacy?.status === "active", problemReason: legacy ? "destination_missing" : "health_unverified", actor: { kind: "admin", userId: actorUserId }, reason: "created", createdAt: now });
  return { channelId, cardId, resolverCode };
}

export async function assertDestinationHealthy(ctx: Ctx, subject: Doc<"accessSubjects">, prepared: Awaited<ReturnType<typeof prepareDestination>>, input: DestinationInput) {
  const problem = await destinationProblem(ctx, { ...subject, destinationInput: input }, prepared.fields);
  if (problem) throw new ConvexError(problem);
}
