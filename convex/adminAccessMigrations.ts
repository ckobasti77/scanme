import { ConvexError, v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { internalMutation } from "./_generated/server";
import { requireAdmin } from "./lib/access";
import { createChannel, syncChannel, uniqueCode } from "./lib/accessOperations";
import { syncAutomaticAction } from "./lib/adminActionEngine";
import { normalizeCode } from "./lib/codes";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";
import { writeAdminAudit } from "./lib/adminAudit";

const result = v.object({ sourceCardId: v.id("cards"), status: v.union(v.literal("ready"), v.literal("mapped"), v.literal("blocked")), reason: v.optional(v.string()), digitalQrId: v.optional(v.id("digitalQrCodes")), channelId: v.optional(v.id("accessChannels")) });

/** Explicit, additive migration. Events, daily rollups and old targets are
 * referenced through cardId, never copied or assigned invented placements. */
export const migrateLegacyCards = internalMutation({
  args: { paginationOpts: paginationOptsValidator, dryRun: v.boolean() },
  returns: paginationResultValidator(result),
  handler: async (ctx, args) => {
    const actor = await requireAdmin(ctx);
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 25) throw new ConvexError("access_migration_batch_invalid");
    const batch = await ctx.db.query("cards").withIndex("by_creation_time").paginate({ ...args.paginationOpts, maximumRowsRead: 25, maximumBytesRead: 1_000_000 });
    const page = [];
    for (const card of batch.page) {
      const business = await ctx.db.get(card.businessId);
      const account = business?.accountId ? await ctx.db.get(business.accountId) : null;
      const collisions = await ctx.db.query("cards").withIndex("by_cardCode", q => q.eq("cardCode", card.cardCode)).take(2);
      let reason = !business || !account ? "legacy_ownership_missing" : normalizeCode(card.cardCode) !== card.cardCode ? "legacy_code_invalid" : collisions.length !== 1 ? "legacy_code_collision" : undefined;
      const mapped = card.accessChannelId ? await ctx.db.get(card.accessChannelId) : null;
      const mappedSubject = mapped ? await ctx.db.get(mapped.subjectId) : null;
      if (card.accessChannelId && (!mapped || !mappedSubject || mapped.cardId !== card._id || mapped.resolverCode !== card.cardCode || mapped.accountId !== account?._id || mapped.businessId !== business?._id || mappedSubject.accountId !== mapped.accountId || mappedSubject.businessId !== mapped.businessId)) reason = "legacy_mapping_conflict";
      let smqCode: string | undefined;
      if (!reason && !mapped && !args.dryRun) {
        try { smqCode = await uniqueCode(ctx, "SMQ"); }
        catch (error) {
          if (!(error instanceof ConvexError) || error.data !== "access_code_collision") throw error;
          reason = "legacy_smq_collision";
        }
      }
      const issue = await ctx.db.query("accessMigrationIssues").withIndex("by_cardId", q => q.eq("cardId", card._id)).unique();
      const now = Date.now();
      if (!args.dryRun) {
        if (reason) {
          const fields = { cardId: card._id, reason, resolvedAt: undefined, updatedAt: now };
          if (issue && (issue.reason !== reason || issue.resolvedAt !== undefined)) await ctx.db.patch(issue._id, fields);
          else if (!issue) await ctx.db.insert("accessMigrationIssues", fields);
          if (!issue || issue.reason !== reason || issue.resolvedAt !== undefined) await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: account?._id, businessId: business?._id, action: "legacy_card_mapping_blocked", detail: { sourceCardId: card._id, reason }, now });
        } else if (issue && !issue.resolvedAt) await ctx.db.patch(issue._id, { resolvedAt: now, updatedAt: now });
        await syncAutomaticAction(ctx, { domain: "qr_nfc", sourceRecordId: card._id, causeKind: "migration_conflict", sourceVersion: reason ?? "mapped", isOpen: !!reason, accountId: account?._id, businessId: business?._id, severity: "blocking", relevantAt: issue && issue.reason === reason && issue.resolvedAt === undefined ? issue.updatedAt : now, priority: { blocking: true, overdue: false, dueToday: false, needsReply: false, graceOrWarning: false, waitingOn: "scanme" } }, now);
      }
      if (reason) { page.push({ sourceCardId: card._id, status: "blocked" as const, reason }); continue; }
      if (mapped) { page.push({ sourceCardId: card._id, status: "mapped" as const, digitalQrId: mapped.digitalQrId, channelId: mapped._id }); continue; }
      if (args.dryRun) { page.push({ sourceCardId: card._id, status: "ready" as const }); continue; }
      const subjectId = await ctx.db.insert("accessSubjects", { accountId: account!._id, businessId: card.businessId, anchorCardId: card._id, currentTargetId: card.currentTargetId, destinationKind: "legacy", createdAt: now, updatedAt: now });
      const created = await createChannel(ctx, (await ctx.db.get(subjectId))!, "qr", actor._id, now, card);
      const digitalQrId = await ctx.db.insert("digitalQrCodes", { accountId: account!._id, businessId: card.businessId, smqCode: smqCode!, channelId: created.channelId, originalSubjectId: subjectId, legacyCardId: card._id, createdByUserId: actor._id, createdAt: now });
      await ctx.db.patch(subjectId, { digitalQrId });
      await ctx.db.patch(created.channelId, { digitalQrId, smqCode, searchText: normalizeAdminSearchText(`${smqCode} ${smqCode!.replaceAll("-", "")} ${card.cardCode} ${card.label}`) });
      await syncChannel(ctx, (await ctx.db.get(created.channelId))!, (await ctx.db.get(subjectId))!, { kind: "admin", userId: actor._id }, "legacy_adopted", now);
      await writeAdminAudit(ctx, { actorUserId: actor._id, accountId: account!._id, businessId: card.businessId, action: "legacy_card_mapped", detail: { sourceCardId: card._id, channelId: created.channelId, digitalQrId, sourceTargetId: card.currentTargetId, historyMode: "original_card_references" }, now });
      page.push({ sourceCardId: card._id, status: "mapped" as const, digitalQrId, channelId: created.channelId });
    }
    return { ...batch, page };
  },
});
