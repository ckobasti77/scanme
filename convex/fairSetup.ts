import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { isAdminEmail } from "./lib/access";
import { writeAdminAudit } from "./lib/adminAudit";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";
import { fairEventByCode, fairIssueValidator, setFairModelStatus, upsertFairEvent, upsertFairEventDay } from "./lib/fairCatalog";
import { scheduleFairBrandPassportSync } from "./lib/fairPassportSync";
import { syncFairSponsoredSnapshot } from "./lib/fairSponsored";
import { fairModelTierAt } from "./lib/fairInteractions";
import { applyDestination, prepareDestination, syncChannel } from "./lib/accessOperations";
import { fairContactRequirement, fairLeadKind, fairModelHighlight } from "./lib/fairValidators";
import type { Doc } from "./_generated/dataModel";
import { createEventOnlyClient } from "./fairAdmin";
import { commitFairImport, fairImportPayload, planFairImport } from "./fairImport";
import {
  FAIR_ADMIN_LIST_LIMIT,
  FAIR_AUDIENCE_OPTIONS_MAX,
  FAIR_AUDIENCE_OPTIONS_MIN,
  FAIR_SURVEY_MAX_QUESTIONS,
  FAIR_SURVEY_OPTIONS_MAX,
} from "../lib/fair-contract";
import { getFairEntitlements } from "../lib/fair-entitlements";

// Fair events — REAL event setup (docs/events/sajam-automobila-2026/
// RUNBOOK-EVENT-SETUP.md). Internal only, run with `npx convex run` (DEV first,
// then `--prod`). Same write paths as the admin `Događaji` tab and the B1
// import; every step is idempotent. Exhibitor contacts are unknown, so each
// event_only client gets a placeholder contact (no email/phone) to fill later.
// Nothing here invents prices, specifications, photos or stands: those come
// only from the intake payload (intake/elektromobilnost-2026-2026-10-07/b1-payload.json,
// docs/events/auto-moto-fest-2026/intake/).

type SetupEvent = {
  code: string;
  title: string;
  venueName: string;
  startsAt: number;
  endsAt: number;
  garagePriority: number;
  days: ReadonlyArray<{ dateKey: string; label: string }>;
  // SMK/SML follow the existing fair format (SMK-SAJAM-26-QR); fixed codes keep
  // the same payload valid on DEV and PROD.
  exhibitors: ReadonlyArray<{ code: string; accountName: string; shortName: string; brands: readonly string[]; city?: string }>;
};

const DEFAULT_EVENT_CODE = "elektromobilnost-2026";

const EVENTS: Record<string, SetupEvent> = {
  "elektromobilnost-2026": {
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
    exhibitors: [
      { code: "CUBI", accountName: "CUBI d.o.o.", shortName: "CUBI", brands: ["JMEV"] },
      { code: "GRAND-MOTORS", accountName: "Grand Motors d.o.o.", shortName: "Grand Motors", brands: ["Mazda", "Chery"] },
      { code: "AUTO-MIG", accountName: "AUTO MIG d.o.o. Niš", shortName: "Auto Mig", brands: ["Foton"], city: "Niš" },
      { code: "FERUM", accountName: "Ferum d.o.o.", shortName: "Ferum", brands: ["Yudo"] },
      { code: "BENTU", accountName: "BENTU MOTORS D.O.O", shortName: "BENTU", brands: ["BENTU"] },
    ],
  },
  "auto-moto-fest-2026": {
    code: "auto-moto-fest-2026",
    title: "Auto Moto Fest 2026",
    venueName: "Hala Čair, Niš",
    // 30 Oct 2026: the real opening (10:00). The passport set freezes here, so
    // the intake must be imported before it; the public gate has its own time.
    startsAt: Date.parse("2026-10-30T10:00:00+01:00"),
    endsAt: Date.parse("2026-11-02T00:00:00+01:00"),
    garagePriority: 2,
    days: [
      { dateKey: "2026-10-30", label: "Petak, 30. oktobar" },
      { dateKey: "2026-10-31", label: "Subota, 31. oktobar" },
      { dateKey: "2026-11-01", label: "Nedelja, 1. novembar" },
    ],
    // Real AMF intake (amf-2026-unos-podaci.json, 30 Oct 2026). GRAND-MOTORS
    // is the same client as on elektromobilnost-2026 (same SMK/SML codes).
    exhibitors: [
      { code: "AUTOCACAK-PROMET", accountName: "AutoČačak Promet d.o.o.", shortName: "AutoČačak Promet", brands: ["Škoda"] },
      { code: "NIKOM", accountName: "Nikom grupacija (NIKOM-AUTO DOO)", shortName: "Nikom", brands: ["Dongfeng", "Fiat"] },
      { code: "GRAND-MOTORS", accountName: "Grand Motors d.o.o.", shortName: "Grand Motors", brands: ["MG", "Ford", "Ineos"] },
      { code: "SWM", accountName: "SWM", shortName: "SWM", brands: ["SWM"] },
    ],
  },
};

/** The admin user the audit rows are written for; must be a configured admin. */
async function setupActor(ctx: MutationCtx, email: string) {
  const normalized = email.trim().toLowerCase();
  const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", normalized)).first();
  if (!user || !isAdminEmail(user.email)) throw new Error("fair_setup_actor_not_admin");
  return user._id;
}

const counts = v.object({ created: v.number(), updated: v.number(), unchanged: v.number() });

export const bootstrapEvent = internalMutation({
  args: { actorEmail: v.string(), eventCode: v.optional(v.string()) },
  returns: v.object({
    eventId: v.id("fairEvents"),
    event: v.union(v.literal("created"), v.literal("updated"), v.literal("unchanged")),
    days: counts,
    clients: v.array(v.object({ accountName: v.string(), smkCode: v.string(), smlCode: v.string(), result: v.union(v.literal("created"), v.literal("unchanged")) })),
    brands: v.object({ created: v.number(), unchanged: v.number() }),
  }),
  handler: async (ctx, args) => {
    const EVENT = EVENTS[args.eventCode ?? DEFAULT_EVENT_CODE];
    if (!EVENT) throw new Error("fair_setup_event_unknown");
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
    for (const exhibitor of EVENT.exhibitors) {
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
          ...(exhibitor.city ? { city: exhibitor.city } : {}),
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

const audienceGroup = v.object({
  modelSlugs: v.array(v.string()),
  questions: v.array(v.object({ prompt: v.string(), options: v.array(v.string()) })),
  /** "all": every question every day; "perDay": day N gets question N. */
  mode: v.union(v.literal("all"), v.literal("perDay")),
  /** 1-based question shown with the model's sponsored rotation (Advanced only). */
  sponsoredQuestion: v.optional(v.number()),
});

/**
 * AMF 30 Oct 2026: publishes the exhibitors' Glas publike questions per fair
 * day (idempotent by externalKey `q-<slug>-<dateKey>-<n>`), within the same
 * per-day package quota as fairInteractionsAdmin.publishAudienceQuestion. The
 * sponsored flag goes on the `sponsorDateKey` instance of that question.
 */
export const setupAudienceQuestions = internalMutation({
  args: { actorEmail: v.string(), eventCode: v.string(), sponsorDateKey: v.string(), groups: v.array(audienceGroup) },
  returns: v.object({ created: v.number(), updated: v.number(), unchanged: v.number(), sponsored: v.number() }),
  handler: async (ctx, args) => {
    const actorUserId = await setupActor(ctx, args.actorEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_setup_event_missing");
    const now = Date.now();
    const days = (await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", event._id)).take(10))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const counts = { created: 0, updated: 0, unchanged: 0, sponsored: 0 };
    for (const group of args.groups) {
      for (const slug of group.modelSlugs) {
        const model = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_slug", (q) => q.eq("eventId", event._id).eq("slug", slug)).unique();
        if (!model) throw new Error(`fair_setup_model_missing:${slug}`);
        const perDay = getFairEntitlements(await fairModelTierAt(ctx, model, now), event.code).audienceQuestionsPerDay;
        let sponsoredId = null;
        for (const [dayIndex, day] of days.entries()) {
          const numbers = group.mode === "all" ? group.questions.map((_, i) => i + 1) : group.questions[dayIndex] ? [dayIndex + 1] : [];
          if (numbers.length > perDay) throw new Error(`fair_setup_question_quota:${slug}:${day.dateKey}`);
          for (const n of numbers) {
            const question = group.questions[n - 1];
            if (question.options.length < FAIR_AUDIENCE_OPTIONS_MIN || question.options.length > FAIR_AUDIENCE_OPTIONS_MAX) throw new Error(`fair_setup_question_options:${slug}:${n}`);
            const externalKey = `q-${slug}-${day.dateKey}-${n}`;
            const fields = {
              eventDayId: day._id,
              prompt: question.prompt.trim(),
              options: question.options.map((label, i) => ({ id: `o${i + 1}`, label: label.trim(), order: i + 1 })),
              status: "published" as const,
              sortOrder: n,
              startsAt: day.startsAt,
              endsAt: day.endsAt,
            };
            const existing = await ctx.db.query("fairAudienceQuestions").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", externalKey)).first();
            let id = existing?._id;
            if (!existing) {
              id = await ctx.db.insert("fairAudienceQuestions", { eventId: event._id, eventModelId: model._id, externalKey, ...fields, showOnSponsoredRotation: false, createdAt: now, updatedAt: now });
              counts.created += 1;
            } else if (JSON.stringify([existing.prompt, existing.options, existing.status, existing.sortOrder, existing.startsAt, existing.endsAt]) !== JSON.stringify([fields.prompt, fields.options, fields.status, fields.sortOrder, fields.startsAt, fields.endsAt])) {
              await ctx.db.patch(existing._id, { ...fields, updatedAt: now });
              counts.updated += 1;
            } else counts.unchanged += 1;
            if (group.sponsoredQuestion === n && day.dateKey === args.sponsorDateKey) sponsoredId = id;
          }
        }
        if (group.sponsoredQuestion !== undefined && getFairEntitlements(model.packageTier).sponsoredMapRotation) {
          const all = await ctx.db.query("fairAudienceQuestions").withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", model._id)).take(50);
          for (const row of all) {
            const want = row._id === sponsoredId;
            if (row.showOnSponsoredRotation !== want) await ctx.db.patch(row._id, { showOnSponsoredRotation: want, updatedAt: now });
          }
          if (sponsoredId) counts.sponsored += 1;
        }
      }
    }
    await syncFairSponsoredSnapshot(ctx, event._id, now, actorUserId);
    await writeAdminAudit(ctx, { actorUserId, action: "fair_setup_audience_questions", detail: { eventCode: event.code, ...counts }, now });
    return counts;
  },
});

/**
 * AMF 30 Oct 2026: one published survey per listed model (questions verbatim;
 * `free_text` and a single_choice `writeInLabel` allowed). Idempotent: an
 * identical published version is left as is, a different one is replaced by a
 * new version (the old one is retired, its answers stay). `surveyAllTiers`
 * marks the owner override for the participation (Nikom: Starter included).
 */
export const setupSurveys = internalMutation({
  args: {
    actorEmail: v.string(),
    eventCode: v.string(),
    groups: v.array(v.object({
      modelSlugs: v.array(v.string()),
      surveyAllTiers: v.boolean(),
      questions: v.array(v.object({
        prompt: v.string(),
        kind: v.union(v.literal("single_choice"), v.literal("free_text")),
        options: v.array(v.string()),
        writeInLabel: v.optional(v.string()),
      })),
    })),
  },
  returns: v.object({ published: v.number(), unchanged: v.number() }),
  handler: async (ctx, args) => {
    const actorUserId = await setupActor(ctx, args.actorEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_setup_event_missing");
    const now = Date.now();
    const counts = { published: 0, unchanged: 0 };
    for (const group of args.groups) {
      if (group.questions.length < 1 || group.questions.length > FAIR_SURVEY_MAX_QUESTIONS) throw new Error("fair_setup_survey_size");
      const questions = group.questions.map((question, index) => {
        if (question.kind === "single_choice" && (question.options.length < FAIR_AUDIENCE_OPTIONS_MIN || question.options.length > FAIR_SURVEY_OPTIONS_MAX)) throw new Error(`fair_setup_survey_options:${index + 1}`);
        if (question.kind === "free_text" && (question.options.length || question.writeInLabel)) throw new Error(`fair_setup_survey_free_text:${index + 1}`);
        return {
          id: `q${index + 1}`,
          prompt: question.prompt.trim(),
          kind: question.kind,
          options: question.options.map((label, i) => ({ id: `o${i + 1}`, label: label.trim(), order: i + 1 })),
          ...(question.writeInLabel ? { writeInLabel: question.writeInLabel.trim() } : {}),
          required: false,
          order: index + 1,
        };
      });
      for (const slug of group.modelSlugs) {
        const model = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_slug", (q) => q.eq("eventId", event._id).eq("slug", slug)).unique();
        if (!model) throw new Error(`fair_setup_model_missing:${slug}`);
        const participation = await ctx.db.get(model.participationId);
        if (!participation) throw new Error(`fair_setup_participation_missing:${slug}`);
        if ((participation.surveyAllTiers === true) !== group.surveyAllTiers) await ctx.db.patch(participation._id, { surveyAllTiers: group.surveyAllTiers, updatedAt: now });
        const tier = await fairModelTierAt(ctx, model, now);
        if (!getFairEntitlements(tier).survey && !(group.surveyAllTiers && tier !== "included")) throw new Error(`fair_setup_survey_not_entitled:${slug}`);
        const versions = await ctx.db.query("fairSurveys").withIndex("by_eventModelId_and_status", (q) => q.eq("eventModelId", model._id)).take(20);
        const current = versions.find((row) => row.status === "published");
        if (current && JSON.stringify(current.questions) === JSON.stringify(questions)) {
          counts.unchanged += 1;
          continue;
        }
        for (const row of versions) if (row.status === "published" || row.status === "draft") await ctx.db.patch(row._id, { status: "retired", updatedAt: now });
        await ctx.db.insert("fairSurveys", {
          eventId: event._id,
          eventModelId: model._id,
          status: "published",
          questions,
          version: versions.reduce((max, row) => Math.max(max, row.version), 0) + 1,
          createdAt: now,
          updatedAt: now,
        });
        counts.published += 1;
      }
    }
    await writeAdminAudit(ctx, { actorUserId, action: "fair_setup_surveys", detail: { eventCode: event.code, ...counts }, now });
    return counts;
  },
});

/**
 * AMF 30 Oct 2026: retires the given inventory stickers (redirect off →
 * channel `inactive`, reversible) and points one panel's dynamic link at a new
 * URL through the regular retarget path (applyDestination), never by editing
 * the link alone. Panels are refused in `retireLabels`. `dryRun` only reports.
 */
export const amfQrHousekeeping = internalMutation({
  args: { actorEmail: v.string(), inventorySmlCode: v.string(), retireLabels: v.array(v.string()), panelLabel: v.string(), panelUrl: v.string(), dryRun: v.boolean() },
  returns: v.array(v.object({ label: v.string(), before: v.string(), after: v.string() })),
  handler: async (ctx, args) => {
    const actorUserId = await setupActor(ctx, args.actorEmail);
    const inventory = await ctx.db.query("businesses").withIndex("by_smlCode", (q) => q.eq("smlCode", args.inventorySmlCode)).first();
    if (!inventory) throw new Error("fair_qr_inventory_business_missing");
    const now = Date.now();
    const actor = { kind: "admin" as const, userId: actorUserId };
    const describe = async (subject: Doc<"accessSubjects">) => {
      const target = subject.currentTargetId ? await ctx.db.get(subject.currentTargetId) : null;
      if (target?.kind === "url") return target.url ?? "url";
      if (target?.kind === "fair_model" && target.fairEventModelId) {
        const model = await ctx.db.get(target.fairEventModelId);
        const event = model ? await ctx.db.get(model.eventId) : null;
        return `${event?.code ?? "?"}/${model?.slug ?? "?"}`;
      }
      return target?.kind ?? "none";
    };
    const out: Array<{ label: string; before: string; after: string }> = [];
    for (const label of [...args.retireLabels, args.panelLabel]) {
      const card = await ctx.db.query("cards").withIndex("by_businessId_and_label", (q) => q.eq("businessId", inventory._id).eq("label", label)).first();
      const channel = card?.accessChannelId ? await ctx.db.get(card.accessChannelId) : null;
      const subject = channel ? await ctx.db.get(channel.subjectId) : null;
      if (!card || !channel || !subject) throw new Error(`fair_setup_qr_missing:${label}`);
      const before = `${channel.state} → ${await describe(subject)}`;
      if (label !== args.panelLabel) {
        if (label.startsWith("PANEL")) throw new Error(`fair_setup_panel_in_retire_list:${label}`);
        if (!args.dryRun && channel.redirectEnabled) await syncChannel(ctx, { ...channel, redirectEnabled: false }, subject, actor, "AMF 2026: SA26-001…015 povučeni (Sajam elektromobilnosti)", now);
        out.push({ label, before, after: args.dryRun ? before : `inactive → ${await describe(subject)}` });
        continue;
      }
      const input = subject.destinationInput;
      if (input?.kind !== "dynamic_link") throw new Error(`fair_setup_panel_not_dynamic:${label}`);
      if (!args.dryRun) {
        const link = await ctx.db.get(input.dynamicLinkId);
        if (!link) throw new Error("fair_setup_panel_link_missing");
        await ctx.db.patch(link._id, { destinationUrl: args.panelUrl, updatedAt: now });
        const prepared = await prepareDestination(ctx, subject.businessId, input);
        await applyDestination(ctx, subject, input, prepared, actorUserId, "AMF 2026: glavni pano vodi na mapu sajma", now);
      }
      const fresh = (await ctx.db.get(subject._id))!;
      const freshChannel = (await ctx.db.get(channel._id))!;
      out.push({ label, before, after: args.dryRun ? `${before} (dry run → ${args.panelUrl})` : `${freshChannel.state} → ${await describe(fresh)}` });
    }
    if (!args.dryRun) await writeAdminAudit(ctx, { actorUserId, businessId: inventory._id, action: "fair_setup_amf_qr_housekeeping", detail: { retired: args.retireLabels, panel: args.panelLabel, panelUrl: args.panelUrl }, now });
    return out;
  },
});

/**
 * AMF 30 Oct 2026: lead forms. Activates the consent text per lead kind with
 * the legal approval record given by the owner, and writes the exhibitor
 * default + per-model fairLeadConfigs (only where the package has the right:
 * interest Starter+, test drive according to the event-scoped catalog). Leads stay ScanMe-only (no
 * exhibitor recipient is configured anywhere). Idempotent.
 */
export const setupLeads = internalMutation({
  args: {
    actorEmail: v.string(),
    eventCode: v.string(),
    consentText: v.string(),
    legalApprovedBy: v.string(),
    /** 30 Oct 2026 (Nikom): model selector + purchase questions in "Zainteresovan sam". */
    extraFieldsParticipations: v.optional(v.array(v.string())),
    configs: v.array(v.object({
      participationExternalKey: v.string(),
      leadKind: fairLeadKind,
      contactRequirement: fairContactRequirement,
    })),
  },
  returns: v.object({ consents: v.number(), defaults: v.number(), modelConfigs: v.number(), skippedNotEntitled: v.number() }),
  handler: async (ctx, args) => {
    const actorUserId = await setupActor(ctx, args.actorEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_setup_event_missing");
    const now = Date.now();
    const counts = { consents: 0, defaults: 0, modelConfigs: 0, skippedNotEntitled: 0 };
    for (const leadKind of ["interest", "test_drive"] as const) {
      const active = await ctx.db.query("fairConsentConfigs").withIndex("by_eventId_and_leadKind_and_status", (q) => q.eq("eventId", event._id).eq("leadKind", leadKind).eq("status", "active")).first();
      if (active?.text === args.consentText) continue;
      if (active) await ctx.db.patch(active._id, { status: "retired", updatedAt: now });
      const last = await ctx.db.query("fairConsentConfigs").withIndex("by_eventId_and_leadKind_and_version", (q) => q.eq("eventId", event._id).eq("leadKind", leadKind)).order("desc").first();
      await ctx.db.insert("fairConsentConfigs", { eventId: event._id, leadKind, version: (last?.version ?? 0) + 1, text: args.consentText, status: "active", activatedAt: now, legalApprovedBy: args.legalApprovedBy, legalApprovedAt: now, createdAt: now, updatedAt: now });
      counts.consents += 1;
    }
    for (const config of args.configs) {
      const participation = await ctx.db.query("fairParticipations").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", config.participationExternalKey)).unique();
      if (!participation) throw new Error(`fair_setup_participation_missing:${config.participationExternalKey}`);
      const extra = args.extraFieldsParticipations?.includes(config.participationExternalKey) === true;
      if ((participation.leadInterestExtraFields === true) !== extra) await ctx.db.patch(participation._id, { leadInterestExtraFields: extra, updatedAt: now });
      const fields = { enabled: true, contactRequirement: config.contactRequirement, updatedByUserId: actorUserId, updatedAt: now };
      const existingDefault = await ctx.db.query("fairParticipationLeadDefaults").withIndex("by_participationId_and_leadKind", (q) => q.eq("participationId", participation._id).eq("leadKind", config.leadKind)).first();
      if (existingDefault) await ctx.db.patch(existingDefault._id, fields);
      else await ctx.db.insert("fairParticipationLeadDefaults", { eventId: event._id, participationId: participation._id, leadKind: config.leadKind, ...fields, createdAt: now });
      counts.defaults += 1;
      const models = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id)).take(FAIR_ADMIN_LIST_LIMIT);
      for (const model of models.filter((row) => row.participationId === participation._id && row.status !== "withdrawn")) {
        const rights = getFairEntitlements(await fairModelTierAt(ctx, model, now), event.code);
        if (config.leadKind === "interest" ? !rights.interest : !rights.testDrive) {
          counts.skippedNotEntitled += 1;
          continue;
        }
        const existing = await ctx.db.query("fairLeadConfigs").withIndex("by_eventModelId_and_leadKind", (q) => q.eq("eventModelId", model._id).eq("leadKind", config.leadKind)).first();
        if (existing) await ctx.db.patch(existing._id, { ...fields, source: "default" });
        else await ctx.db.insert("fairLeadConfigs", { eventModelId: model._id, leadKind: config.leadKind, ...fields, source: "default", createdAt: now });
        counts.modelConfigs += 1;
      }
    }
    await writeAdminAudit(ctx, { actorUserId, action: "fair_setup_leads", detail: { eventCode: event.code, legalApprovedBy: args.legalApprovedBy, ...counts }, now });
    return counts;
  },
});

const sponsorPick = v.object({ modelSlug: v.string(), question: v.number() });

/**
 * AMF 30 Oct 2026 (owner): the sponsored-rotation result follows the fair
 * day. Points each listed model's flag at its question `n` of `dateKey`
 * (externalKey `q-<slug>-<dateKey>-<n>` from setupAudienceQuestions), clears
 * the model's other flags and refreshes the snapshot. A model without that
 * day's question keeps its flag as it is. Idempotent.
 */
export const pointSponsoredToDay = internalMutation({
  args: { eventCode: v.string(), dateKey: v.string(), picks: v.array(sponsorPick) },
  returns: v.object({ pointed: v.number(), missing: v.array(v.string()) }),
  handler: async (ctx, args) => {
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_setup_event_missing");
    const now = Date.now();
    let pointed = 0;
    const missing: string[] = [];
    for (const pick of args.picks) {
      const externalKey = `q-${pick.modelSlug}-${args.dateKey}-${pick.question}`;
      const chosen = await ctx.db.query("fairAudienceQuestions").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", externalKey)).first();
      if (!chosen || chosen.status !== "published") {
        missing.push(externalKey);
        continue;
      }
      const all = await ctx.db.query("fairAudienceQuestions").withIndex("by_eventModelId_and_eventDayId", (q) => q.eq("eventModelId", chosen.eventModelId)).take(50);
      for (const row of all) {
        const want = row._id === chosen._id;
        if (row.showOnSponsoredRotation !== want) await ctx.db.patch(row._id, { showOnSponsoredRotation: want, updatedAt: now });
      }
      pointed += 1;
    }
    await syncFairSponsoredSnapshot(ctx, event._id, now);
    return { pointed, missing };
  },
});

/** Schedules pointSponsoredToDay at the start (Europe/Belgrade) of each listed fair day. */
export const scheduleSponsoredDays = internalMutation({
  args: { actorEmail: v.string(), eventCode: v.string(), dateKeys: v.array(v.string()), picks: v.array(sponsorPick) },
  returns: v.array(v.object({ dateKey: v.string(), runAt: v.number() })),
  handler: async (ctx, args) => {
    const actorUserId = await setupActor(ctx, args.actorEmail);
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_setup_event_missing");
    const out: Array<{ dateKey: string; runAt: number }> = [];
    for (const dateKey of args.dateKeys) {
      const day = await ctx.db.query("fairEventDays").withIndex("by_eventId_and_dateKey", (q) => q.eq("eventId", event._id).eq("dateKey", dateKey)).unique();
      if (!day) throw new Error(`fair_setup_day_missing:${dateKey}`);
      await ctx.scheduler.runAt(day.startsAt, internal.fairSetup.pointSponsoredToDay, { eventCode: args.eventCode, dateKey, picks: args.picks });
      out.push({ dateKey, runAt: day.startsAt });
    }
    await writeAdminAudit(ctx, { actorUserId, action: "fair_setup_sponsored_days_scheduled", detail: { eventCode: event.code, days: out }, now: Date.now() });
    return out;
  },
});

/**
 * AMF 31 Oct 2026: sets or clears `fairEventModels.highlight` ("most_popular" |
 * "most_popular_day1") for one model by event code + model slug without a
 * deploy. Passing `highlight: null` (or omitting `highlight`) clears it.
 */
export const setModelHighlight = internalMutation({
  args: {
    eventCode: v.string(),
    modelSlug: v.string(),
    highlight: v.optional(v.union(fairModelHighlight, v.null())),
    actorEmail: v.optional(v.string()),
  },
  returns: v.object({
    eventModelId: v.id("fairEventModels"),
    modelSlug: v.string(),
    before: v.union(fairModelHighlight, v.null()),
    after: v.union(fairModelHighlight, v.null()),
  }),
  handler: async (ctx, args) => {
    const actorUserId = args.actorEmail ? await setupActor(ctx, args.actorEmail) : undefined;
    const event = await fairEventByCode(ctx, args.eventCode);
    if (!event) throw new Error("fair_setup_event_missing");
    const model = await ctx.db
      .query("fairEventModels")
      .withIndex("by_eventId_and_slug", (q) => q.eq("eventId", event._id).eq("slug", args.modelSlug))
      .unique();
    if (!model) throw new Error(`fair_setup_model_missing:${args.modelSlug}`);
    const before = model.highlight ?? null;
    const next = args.highlight ?? undefined;
    const after = next ?? null;
    const now = Date.now();
    if (before !== after) {
      await ctx.db.patch(model._id, { highlight: next, updatedAt: now });
      if (actorUserId) {
        const participation = await ctx.db.get(model.participationId);
        await writeAdminAudit(ctx, {
          actorUserId,
          accountId: participation?.accountId,
          businessId: participation?.businessId,
          action: "fair_model_highlight_updated",
          detail: { eventModelId: model._id, modelSlug: model.slug, before, after },
          now,
        });
      }
    }
    return { eventModelId: model._id, modelSlug: model.slug, before, after };
  },
});
