import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { channelsFor, refreshInventory, syncChannel } from "./accessOperations";
import { channelProblem } from "./accessResolution";

export async function requireDispatchReady(ctx: MutationCtx, product: Doc<"physicalProducts">) {
  const subject = await ctx.db.get(product.subjectId);
  if (!subject || product.qc !== "passed") throw new ConvexError("access_delivery_requires_activation");
  const channels = await channelsFor(ctx, subject._id);
  const target = subject.currentTargetId ? await ctx.db.get(subject.currentTargetId) : null;
  if (!channels.length) throw new ConvexError("access_delivery_requires_activation");
  for (const channel of channels) {
    if (channel.state !== "active" || !channel.redirectEnabled || await channelProblem(ctx, channel, subject, target)) throw new ConvexError("access_delivery_requires_activation");
  }
}

export async function productForReference(ctx: MutationCtx, smf: string, orderLineId: Id<"orderLines">) {
  const product = await ctx.db.query("physicalProducts").withIndex("by_smfCode", q => q.eq("smfCode", smf)).unique();
  if (!product || product.orderLineId !== orderLineId) throw new ConvexError("admin_order_real_smf_required");
  return product;
}

/** New QC identifies actual units. Legacy QC rows remain readable, unguessed. */
export async function selectQcProducts(ctx: MutationCtx, job: Doc<"printJobs">, line: Doc<"orderLines">, count: number, checked: Doc<"qualityChecks">[], selected?: Id<"physicalProducts">[]) {
  const jobLines = await ctx.db.query("printJobLines").withIndex("by_printJobId", q => q.eq("printJobId", job._id)).take(101);
  if (jobLines.length > 100) throw new ConvexError("access_print_job_limit");
  const jobLine = jobLines.find(row => row.orderLineId === line._id);
  if (!jobLine) throw new ConvexError("access_qc_line_missing");
  const products: Doc<"physicalProducts">[] = [];
  for (const ref of jobLine.smfReferences) products.push(await productForReference(ctx, ref, line._id));
  const alreadyChecked = new Set(checked.flatMap(check => check.physicalProductIds ?? []));
  if (checked.some(check => check.orderLineId === line._id && !check.physicalProductIds)) throw new ConvexError("access_legacy_qc_mapping_required");
  const available = products.filter(product => !alreadyChecked.has(product._id));
  const ids = selected ?? (count === available.length ? available.map(product => product._id) : []);
  if (ids.length !== count || new Set(ids).size !== count) throw new ConvexError("access_qc_explicit_units_required");
  for (const id of ids) {
    if (!available.some(p => p._id === id)) throw new ConvexError("access_qc_product_not_available");
  }
  return ids;
}

export async function applyQc(ctx: MutationCtx, check: Doc<"qualityChecks">, now: number) {
  const actor = { kind: "admin" as const, userId: check.checkedByUserId };
  let activeChannelCount = 0;
  let problemChannelCount = 0;
  for (const id of check.physicalProductIds ?? []) {
    const product = await ctx.db.get(id);
    if (!product || product.orderLineId !== check.orderLineId) throw new ConvexError("access_qc_product_mismatch");
    await ctx.db.patch(product._id, { qc: check.result === "pass" ? "passed" : "failed", qualityCheckId: check._id, printJobId: check.printJobId, updatedAt: now });
    const subject = (await ctx.db.get(product.subjectId))!;
    for (const channel of await channelsFor(ctx, subject._id)) {
      // Only channel kinds explicitly verified by QC become healthy.
      // A reported hardware fault/manual problem still needs resolution.
      const updated = { ...channel, health: check.result === "pass" && channel.health === "unverified" && check.verifiedChannelKinds?.includes(channel.kind) ? "healthy" as const : channel.health,
        redirectEnabled: check.result === "pass" ? true : channel.redirectEnabled };
      const result = await syncChannel(ctx, updated, subject, actor, check.reason ?? "qc_passed", now);
      if (result.state === "active") activeChannelCount++;
      if (result.state === "problem") problemChannelCount++;
    }
    await refreshInventory(ctx, subject, now);
  }
  const signal = await ctx.db.query("orderActivationSignals").withIndex("by_qualityCheckId", q => q.eq("qualityCheckId", check._id)).unique();
  if (signal) await ctx.db.patch(signal._id, { state: problemChannelCount ? "problem" : "applied", processedAt: now, activeChannelCount, problemChannelCount });
}
