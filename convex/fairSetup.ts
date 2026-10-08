import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { isAdminEmail } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";
import { fairEventByCode, fairIssueValidator, setFairModelStatus, upsertFairEvent, upsertFairEventDay } from "./lib/fairCatalog";
import { scheduleFairBrandPassportSync } from "./lib/fairPassportSync";
import { syncFairSponsoredSnapshot } from "./lib/fairSponsored";
import { createEventOnlyClient } from "./fairAdmin";
import { commitFairImport, fairImportPayload, planFairImport } from "./fairImport";
import { FAIR_ADMIN_LIST_LIMIT } from "../lib/fair-contract";

// Sajam elektromobilnosti 2026 — REAL event setup (docs/events/sajam-automobila-2026/
// RUNBOOK-EVENT-SETUP.md). Internal only, run with `npx convex run` (DEV first,
// then `--prod`). Same write paths as the admin `Događaji` tab and the B1
// import; every step is idempotent. Exhibitor contacts are unknown, so each
// event_only client gets a placeholder contact (no email/phone) to fill later.
// Nothing here invents prices, specifications, photos or stands: those come
// only from the intake payload (intake/elektromobilnost-2026-2026-10-07/b1-payload.json).

const EVENT = {
  code: "elektromobilnost-2026",
  title: "Sajam elektromobilnosti 2026",
  venueName: "Hala Čair, Niš",
  startsAt: Date.parse("2026-10-09T00:00:00+02:00"),
  endsAt: Date.parse("2026-10-12T00:00:00+02:00"),
  // TEST fixtures: elektromobilnost 1, Auto Moto Fest 2 (garage shows it first).
  garagePriority: 1,
  days: [
    { dateKey: "2026-10-09", label: "Petak, 9. oktobar" },
    { dateKey: "2026-10-10", label: "Subota, 10. oktobar" },
    { dateKey: "2026-10-11", label: "Nedelja, 11. oktobar" },
  ],
} as const;

// SMK/SML follow the existing fair format (SMK-SAJAM-26-QR); fixed codes keep
// the same payload valid on DEV and PROD.
const EXHIBITORS = [
  { code: "CUBI", accountName: "CUBI d.o.o.", shortName: "CUBI", brands: ["JMEV"] },
  { code: "GRAND-MOTORS", accountName: "Grand Motors d.o.o.", shortName: "Grand Motors", brands: ["Mazda", "Chery"] },
  { code: "AUTO-MIG", accountName: "AUTO MIG d.o.o. Niš", shortName: "Auto Mig", brands: ["Foton"], city: "Niš" },
  { code: "FERUM", accountName: "Ferum d.o.o.", shortName: "Ferum", brands: ["Yudo"] },
  { code: "BENTU", accountName: "BENTU MOTORS D.O.O", shortName: "BENTU", brands: ["BENTU"] },
] as const;

/** The admin user the audit rows are written for; must be a configured admin. */
async function setupActor(ctx: MutationCtx, email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", normalized)).first();
  if (!user || !isAdminEmail(user.email)) throw new Error("fair_setup_actor_not_admin");
  return user._id;
}

const counts = v.object({ created: v.number(), updated: v.number(), unchanged: v.number() });

export const bootstrapEvent = internalMutation({
  args: { actorEmail: v.string() },
  returns: v.object({
    eventId: v.id("fairEvents"),
    event: v.union(v.literal("created"), v.literal("updated"), v.literal("unchanged")),
    days: counts,
    clients: v.array(v.object({ accountName: v.string(), smkCode: v.string(), smlCode: v.string(), result: v.union(v.literal("created"), v.literal("unchanged")) })),
    brands: v.object({ created: v.number(), unchanged: v.number() }),
  }),
  handler: async (ctx, args) => {
    const actorUserId = await setupActor(ctx, args.actorEmail);
    const now = Date.now();
    const event = await upsertFairEvent(ctx, {
      code: EVENT.code,
      slug: EVENT.code,
      title: EVENT.title,
      venueName: EVENT.venueName,
      startsAt: EVENT.startsAt,
      endsAt: EVENT.endsAt,
      status: "published",
      garagePriority: EVENT.garagePriority,
    }, now);
    const days = { created: 0, updated: 0, unchanged: 0 };
    for (const [index, day] of EVENT.days.entries()) {
      const { result } = await upsertFairEventDay(ctx, { eventId: event.eventId, dateKey: day.dateKey, label: day.label, sortOrder: index + 1 });
      days[result] += 1;
    }
    const clients = [];
    const brands = { created: 0, unchanged: 0 };
    for (const exhibitor of EXHIBITORS) {
      const smkCode = `SMK-SAJAM-26-${exhibitor.code}`;
      const smlCode = `SML-SAJAM-26-${exhibitor.code}`;
      const client = await createEventOnlyClient(ctx, {
        accountName: exhibitor.accountName,
        ownerDisplayName: exhibitor.accountName,
        smkCode,
        contact: { firstName: "Kontakt", lastName: exhibitor.shortName, positionTitle: "Sajamski kontakt" },
        venue: {
          name: exhibitor.accountName,
          slug: `sajam-26-${exhibitor.code.toLowerCase()}`,
          smlCode,
          ...("city" in exhibitor ? { city: exhibitor.city } : {}),
        },
      }, actorUserId, now);
      clients.push({ accountName: exhibitor.accountName, smkCode, smlCode, result: client.result });
      // Same rule as fairAdmin.ensureBrand: idempotent by (account, normalized name).
      for (const name of exhibitor.brands) {
        const normalizedName = normalizeAdminSearchText(name);
        const existing = await ctx.db
          .query("brands")
          .withIndex("by_accountId_and_normalizedName", (q) => q.eq("accountId", client.accountId).eq("normalizedName", normalizedName))
          .first();
        if (existing) {
          brands.unchanged += 1;
          continue;
        }
        await ctx.db.insert("brands", { accountId: client.accountId, name, normalizedName, revision: "1", colors: [], createdAt: now, updatedAt: now });
        brands.created += 1;
      }
    }
    return { eventId: event.eventId, event: event.result, days, clients, brands };
  },
});

const newExisting = v.object({ new: v.number(), existing: v.number() });

export const importDryRun = internalQuery({
  args: { payload: fairImportPayload },
  returns: v.object({
    ok: v.boolean(),
    issues: v.array(fairIssueValidator),
    summary: v.object({ participations: newExisting, stands: newExisting, models: newExisting, upgrades: v.number(), qrAssignments: v.number() }),
  }),
  handler: async (ctx, args) => {
    const plan = await planFairImport(ctx, args.payload);
    const models = plan.participations.flatMap((p) => p.brands.flatMap((b) => b.models));
    const stands = [...plan.stands.values()];
    const split = <T extends { existing: unknown }>(rows: T[]) => ({ new: rows.filter((row) => !row.existing).length, existing: rows.filter((row) => row.existing).length });
    return {
      ok: !plan.issues.some((issue) => issue.severity === "error"),
      issues: plan.issues,
      summary: {
        participations: split(plan.participations),
        stands: split(stands),
        models: split(models),
        upgrades: models.filter((m) => m.upgradeTo).length,
        qrAssignments: models.filter((m) => m.assignCode).length,
      },
    };
  },
});

export const importCommit = internalMutation({
  args: { payload: fairImportPayload, actorEmail: v.string() },
  returns: v.object({
    committed: v.boolean(),
    issues: v.array(fairIssueValidator),
    results: v.object({ participations: counts, stands: counts, models: counts, upgrades: v.number(), qrAssignments: v.number() }),
  }),
  handler: async (ctx, args) => {
    const actorUserId = await setupActor(ctx, args.actorEmail);
    return commitFairImport(ctx, args.payload, actorUserId, Date.now());
  },
});

/**
 * Publishes every draft model of the event through the same publish
 * validation and audit row as fairAdmin.publishModel. One publish error
 * aborts the whole mutation, so nothing is half-published. Like publishModel,
 * it then brings every brand's automatic passport and the sponsored snapshot
 * up to date (no-op without a difference, so a re-run is safe).
 */
export const publishEventModels = internalMutation({
  args: { eventCode: v.string(), actorEmail: v.string() },
  returns: v.object({
    published: v.array(v.string()),
    alreadyPublished: v.number(),
    warnings: v.array(v.object({ slug: v.string(), codes: v.array(v.string()) })),
  }),
  handler: async (ctx, args) => {
    const actorUserId = await setupActor(ctx, args.actorEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_setup_event_missing");
    const now = Date.now();
    const models = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id))
      .take(FAIR_ADMIN_LIST_LIMIT);
    const published: string[] = [];
    const warnings: Array<{ slug: string; codes: string[] }> = [];
    let alreadyPublished = 0;
    for (const model of models) {
      if (model.status === "published") {
        alreadyPublished += 1;
        continue;
      }
      if (model.status !== "draft") continue;
      const result = await setFairModelStatus(ctx, model._id, "published", now);
      const participation = await ctx.db.get(model.participationId);
      await writeAdminAudit(ctx, {
        actorUserId,
        accountId: participation?.accountId,
        businessId: participation?.businessId,
        action: "fair_model_published",
        detail: { eventModelId: model._id, from: model.status, to: "published" },
        now,
      });
      published.push(model.slug);
      if (result.warnings.length) warnings.push({ slug: model.slug, codes: result.warnings.map((issue) => issue.code) });
    }
    for (const brandId of new Set(models.map((model) => model.brandId))) {
      await scheduleFairBrandPassportSync(ctx, event._id, brandId, now);
    }
    await syncFairSponsoredSnapshot(ctx, event._id, now, actorUserId);
    return { published, alreadyPublished, warnings };
  },
});
