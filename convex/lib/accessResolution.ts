import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isSafePublicDestination } from "./validation";

type Ctx = QueryCtx | MutationCtx;
type Target = Pick<Doc<"cardTargets">, "kind" | "spaceId" | "eventId" | "serviceProfileId" | "url" | "splitterItems"> & { cardId?: Doc<"cardTargets">["cardId"] };

/** Live existence/ownership validation shared by activation and every /r hop. */
export async function destinationProblem(ctx: Ctx, subject: Doc<"accessSubjects">, target: Target | null): Promise<string | undefined> {
  const business = await ctx.db.get(subject.businessId);
  const account = await ctx.db.get(subject.accountId);
  if (!business || !account || business.accountId !== account._id) return "destination_ownership";
  if (business.status === "inactive" || business.clientStatus === "archived" || account.clientStatus === "archived") return "destination_archived";
  if (!target) return "destination_missing";
  if (target.cardId && target.cardId !== subject.anchorCardId) return "resolver_target_ownership";
  if (subject.destinationInput?.kind === "services") {
    for (const id of subject.destinationInput.serviceProfileIds) {
      const profile = await ctx.db.get(id);
      if (!profile || profile.businessId !== business._id) return "destination_service_ownership";
      if (profile.status !== "active") return "destination_service_inactive";
    }
  }
  if (subject.destinationInput?.kind === "dynamic_link") {
    const link = await ctx.db.get(subject.destinationInput.dynamicLinkId);
    if (!link || link.businessId !== business._id) return "destination_link_ownership";
    if (!link.active) return "destination_link_inactive";
    // The destination is an immutable approved snapshot. A source URL change
    // requires an explicit retarget, never an unaudited redirect change.
    if (link.destinationUrl !== target.url) return "destination_link_changed";
  }
  const items = target.kind === "splitter" ? target.splitterItems : [target];
  if (!items?.length || items.length > 8) return "destination_splitter_invalid";
  for (const item of items) {
    if (item.kind === "url" && (!item.url || !isSafePublicDestination(item.url))) return "destination_url_unsafe";
    if (item.kind === "service_page") {
      const profile = item.serviceProfileId ? await ctx.db.get(item.serviceProfileId) : null;
      if (!profile || profile.businessId !== business._id) return "destination_service_ownership";
      if (profile.status !== "active") return "destination_service_inactive";
    }
    if (item.kind === "memories_space") {
      const space = item.spaceId ? await ctx.db.get(item.spaceId) : null;
      if (!space || space.businessId !== business._id) return "destination_space_ownership";
    }
    if (item.kind === "event") {
      const event = item.eventId ? await ctx.db.get(item.eventId) : null;
      if (!event || event.businessId !== business._id) return "destination_event_ownership";
    }
  }
  return undefined;
}

export async function channelProblem(ctx: Ctx, channel: Doc<"accessChannels">, subject: Doc<"accessSubjects">, target: Target | null) {
  const card = await ctx.db.get(channel.cardId);
  if (!card || card.accessChannelId !== channel._id || card.cardCode !== channel.resolverCode || card.businessId !== channel.businessId || channel.subjectId !== subject._id || channel.accountId !== subject.accountId || channel.businessId !== subject.businessId || channel.physicalProductId !== subject.physicalProductId) return "resolver_mapping_invalid";
  if (channel.manualProblem) return channel.manualProblem;
  if (channel.health !== "healthy") return `health_${channel.health}`;
  if (subject.physicalProductId) {
    const product = await ctx.db.get(subject.physicalProductId);
    if (!product || product.qc !== "passed") return product?.qc === "failed" ? "qc_failed" : "qc_pending";
  }
  return destinationProblem(ctx, subject, target);
}

/** Compatibility boundary: unadopted cards keep their original behavior. */
export async function cardResolution(ctx: Ctx, card: Doc<"cards">) {
  if (!card.accessChannelId) {
    return { channel: null, subject: null, target: card.currentTargetId ? await ctx.db.get(card.currentTargetId) : null, problem: undefined };
  }
  const channel = await ctx.db.get(card.accessChannelId);
  const subject = channel ? await ctx.db.get(channel.subjectId) : null;
  if (!channel || !subject || channel.cardId !== card._id || channel.businessId !== card.businessId || subject.accountId !== channel.accountId || subject.businessId !== channel.businessId) {
    return { channel, subject, target: null, problem: "resolver_mapping_invalid" };
  }
  const target = subject.currentTargetId ? await ctx.db.get(subject.currentTargetId) : null;
  if (target && target.cardId !== subject.anchorCardId) return { channel, subject, target: null, problem: "resolver_target_ownership" };
  const problem = await channelProblem(ctx, channel, subject, target);
  return { channel, subject, target, problem };
}
