/// <reference types="vite/client" />

// Sajam 2026 B7 — the 16 Nov 2026 PII purge (BACKEND-HANDOFF §5.6, §12
// "purge batch ne prelazi limit, briše sve PII/visitor-linked izvore i ne dira
// ne-PII agregate"; MASTER §13, §18). The catalog comes from the B7
// integration TEST seed; the visitor-linkable rows are inserted directly so
// the purge meets more rows than one batch holds.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_PII_PURGE_AT_MS, FAIR_PURGE_CATEGORIES } from "../lib/fair-contract";
import { FAIR_PURGE_BATCH_SIZE, FAIR_PURGE_PREVIEW_CAP, FAIR_PURGE_STALL_MS, FAIR_PURGE_TABLES } from "./fairRetention";
import * as fairRetentionModule from "./fairRetention";

const modules = import.meta.glob("./**/*.ts");
const SEED_AT = Date.parse("2026-10-05T10:00:00+02:00");
const DAY = Date.parse("2026-10-09T11:00:00+02:00");
const ADMIN_EMAIL = "fair-b7@scanme.test";
const ISSUER = "https://fair-b7.test";
const VISITORS = 210;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  vi.useFakeTimers();
  vi.setSystemTime(SEED_AT);
});
afterEach(() => vi.useRealTimers());

const hash = (i: number) => i.toString(16).padStart(64, "0");
const PII_TABLES = FAIR_PURGE_CATEGORIES.map((category) => FAIR_PURGE_TABLES[category]);
const KEPT_TABLES = [
  "fairEvents", "fairEventDays", "fairParticipations", "fairStands", "fairEventModels", "fairQrAssignments", "fairPackageActivations",
  "fairMetricCountShards", "fairAudienceQuestions", "fairSurveys", "fairConsentConfigs", "fairLeadConfigs", "fairMessageTemplates",
  "fairPassportConfigs", "fairPassportEligibleModels", "fairReportRuns", "fairSponsoredSnapshots", "fairSponsoredSnapshotItems",
] as const satisfies readonly TableNames[];

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const { adminId, memberId } = await t.run(async (ctx) => ({
    adminId: await ctx.db.insert("users", { email: ADMIN_EMAIL }),
    memberId: await ctx.db.insert("users", { email: "klijent@example.invalid" }),
  }));
  const seed = await t.mutation(internal.fairDevFixtures.seedIntegrationTest, {});
  vi.setSystemTime(DAY);
  const ids = await t.run(async (ctx) => {
    const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", "test-elektromobilnost-2026")).unique())!;
    const model = (await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", "test-em26-volta-x1")).unique())!;
    const question = (await ctx.db.query("fairAudienceQuestions").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", "test-em26-volta-x1-q-proba")).unique())!;
    const survey = (await ctx.db.query("fairSurveys").withIndex("by_eventModelId_and_status", (q) => q.eq("eventModelId", model._id).eq("status", "published")).unique())!;
    const now = DAY;
    for (let i = 0; i < VISITORS; i += 1) {
      const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: hash(i), firstSeenAt: now, lastSeenAt: now });
      const link = { visitorId, eventId: event._id, eventModelId: model._id };
      await ctx.db.insert("fairScanEvents", { ...link, requestId: `test-purge-scan-${i}`, standId: model.standId, brandId: model.brandId, occurredAt: now, dateKey: "2026-10-09", hourKey: "2026-10-09T11", isAdminExcluded: false });
      await ctx.db.insert("fairUniqueScans", { ...link, firstScannedAt: now, lastScannedAt: now, totalScanCount: 1 });
      await ctx.db.insert("fairRatings", { ...link, appearance: 4, createdAt: now, updatedAt: now });
      await ctx.db.insert("fairAudienceVotes", { ...link, questionId: question._id, optionId: "test-da", createdAt: now, updatedAt: now });
      await ctx.db.insert("fairPassportStamps", { ...link, brandId: model.brandId, scannedAt: now });
      await ctx.db.insert("fairBrandFavoriteVotes", { ...link, brandId: model.brandId, createdAt: now, updatedAt: now });
      await ctx.db.insert("fairSponsoredEvents", { requestId: `test-purge-sponsored-${i}`, eventId: event._id, eventModelId: model._id, surface: "garage", kind: "open_model", occurredAt: now, dateKey: "2026-10-09", hourKey: "2026-10-09T11", visitorId });
      await ctx.db.insert("fairSurveyResponses", { ...link, submissionId: `test-purge-survey-${i}`, surveyId: survey._id, answers: [{ questionId: "test-preporuka", value: "yes" }], submittedAt: now });
      if (i % 3 === 0) {
        const leadId = await ctx.db.insert("fairLeads", {
          ...link, submissionId: `test-purge-lead-${i}`, kind: "test_drive", participationId: model.participationId,
          contactName: `TEST Ime Prezime ${i}`, email: `purge-${i}@example.invalid`, phone: "+381 60 000 0007",
          consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST saglasnost za TEST Izlagač A", consentedAt: now,
          status: "received", followUpSuppressed: i % 2 === 0, ...(i % 2 === 0 ? { suppressedAt: now } : {}), createdAt: now, purgeAt: FAIR_PII_PURGE_AT_MS,
        });
        for (const kind of ["immediate_confirmation", "post_event_follow_up"] as const) {
          await ctx.db.insert("fairEmailDeliveries", { dedupeKey: `fair-lead/${leadId}/${kind}`, leadId, kind, recipient: `purge-${i}@example.invalid`, status: "sent", scheduledFor: now, attemptCount: 1, createdAt: now, updatedAt: now });
        }
      }
    }
    await ctx.db.insert("fairEmailDeliveries", { dedupeKey: "fair-report/test/1", kind: "daily_report", recipient: "izvestaji@example.invalid", status: "sent", scheduledFor: now, attemptCount: 1, createdAt: now, updatedAt: now });
    // Anonymous aggregates that must survive the purge.
    for (const [key, value] of [[`scan_total:model:${model._id}`, VISITORS], [`scan_unique:model:${model._id}`, VISITORS], [`rating_count_appearance:model:${model._id}`, VISITORS], [`audience_votes:question:${question._id}:test-da`, VISITORS]] as const) {
      await ctx.db.insert("fairMetricCountShards", { key, shard: 0, value });
    }
    return { eventId: event._id, modelId: model._id, questionId: question._id };
  });
  const admin = t.withIdentity({ subject: adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: memberId, issuer: ISSUER });
  return { t, admin, member, seed, ...ids };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function counts(f: Fixture, tables: readonly TableNames[]) {
  return f.t.run(async (ctx) => {
    const out: Record<string, number> = {};
    for (const table of tables) out[table] = (await ctx.db.query(table).collect()).length;
    return out;
  });
}
const rows = <T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> => f.t.run(async (ctx) => ctx.db.query(table).collect());
const snapshotOf = (f: Fixture) => f.t.run(async (ctx) => {
  const out: Record<string, unknown[]> = {};
  for (const table of KEPT_TABLES) out[table] = await ctx.db.query(table).collect();
  return out;
});
/** Runs the continuation that is due now (one purge transaction). */
async function nextBatch(f: Fixture) {
  vi.advanceTimersByTime(1);
  await f.t.finishInProgressScheduledFunctions();
}
const latestRun = async (f: Fixture) => (await f.t.query(internal.fairRetention.listPurgeRuns, {}))[0];

/** No outbox row without its lead, no visitor-linkable row without its visitor. */
async function noOrphans(f: Fixture) {
  return f.t.run(async (ctx) => {
    const visitors = new Set((await ctx.db.query("fairVisitors").collect()).map((row) => row._id));
    const leads = new Set((await ctx.db.query("fairLeads").collect()).map((row) => row._id));
    const linked: { visitorId?: Id<"fairVisitors"> }[] = [
      ...(await ctx.db.query("fairLeads").collect()), ...(await ctx.db.query("fairSurveyResponses").collect()), ...(await ctx.db.query("fairRatings").collect()),
      ...(await ctx.db.query("fairAudienceVotes").collect()), ...(await ctx.db.query("fairBrandFavoriteVotes").collect()), ...(await ctx.db.query("fairPassportStamps").collect()),
      ...(await ctx.db.query("fairSponsoredEvents").collect()), ...(await ctx.db.query("fairUniqueScans").collect()), ...(await ctx.db.query("fairScanEvents").collect()),
    ];
    const deliveries = await ctx.db.query("fairEmailDeliveries").collect();
    return deliveries.every((row) => row.leadId === undefined || leads.has(row.leadId)) && linked.every((row) => row.visitorId === undefined || visitors.has(row.visitorId));
  });
}

describe("B7 purge preview and dry run", () => {
  test("the preview counts each category up to its cap; a dry run counts every row exactly and deletes nothing", async () => {
    const f = await setup();
    const before = await counts(f, PII_TABLES);
    expect(before).toMatchObject({ fairVisitors: VISITORS, fairLeads: 70, fairEmailDeliveries: 141, fairScanEvents: VISITORS });

    const preview = await f.t.query(internal.fairRetention.previewPurge, {});
    expect(preview.purgeAt).toBe(FAIR_PII_PURGE_AT_MS);
    expect(preview.categories.map((row) => row.category)).toEqual([...FAIR_PURGE_CATEGORIES]);
    for (const row of preview.categories) {
      const total = before[FAIR_PURGE_TABLES[row.category]];
      expect(row).toEqual({ category: row.category, count: Math.min(total, FAIR_PURGE_PREVIEW_CAP), capped: total > FAIR_PURGE_PREVIEW_CAP });
    }

    const started = await f.t.mutation(internal.fairRetention.startDryRun, {});
    expect(started.created).toBe(true);
    expect(await f.t.mutation(internal.fairRetention.startDryRun, {})).toEqual({ runId: started.runId, created: false });
    expect((await latestRun(f)).totalRows).toBe(FAIR_PURGE_BATCH_SIZE);
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await latestRun(f);
    expect(run).toMatchObject({ mode: "dry_run", trigger: "cli", status: "completed" });
    for (const entry of run.categories) expect({ category: entry.category, rows: entry.rows, status: entry.status }).toEqual({ category: entry.category, rows: before[FAIR_PURGE_TABLES[entry.category]], status: "done" });
    const total = Object.values(before).reduce((sum, value) => sum + value, 0);
    expect(run.totalRows).toBe(total);
    expect(run.batches).toBeGreaterThanOrEqual(Math.ceil(total / FAIR_PURGE_BATCH_SIZE));
    expect(await counts(f, PII_TABLES)).toEqual(before);
  });

  test("before 16 Nov 00:00 (Belgrade) the cron never deletes", async () => {
    const f = await setup();
    const before = await counts(f, PII_TABLES);
    vi.setSystemTime(FAIR_PII_PURGE_AT_MS - 1);
    expect(await f.t.mutation(internal.fairRetention.purgeTick, {})).toEqual({ status: "not_due" });
    expect(await counts(f, PII_TABLES)).toEqual(before);
    expect(await f.t.query(internal.fairRetention.listPurgeRuns, {})).toEqual([]);
  });
});

describe("B7 purge execution (16 Nov 2026)", () => {
  test("bounded batches in order delete every PII row, leave no orphan, keep aggregates and catalog, audit without identifiers", async () => {
    const f = await setup();
    const before = await counts(f, PII_TABLES);
    const total = Object.values(before).reduce((sum, value) => sum + value, 0);
    const kept = await snapshotOf(f);

    vi.setSystemTime(FAIR_PII_PURGE_AT_MS);
    const started = await f.t.mutation(internal.fairRetention.purgeTick, {});
    expect(started.status).toBe("started");
    let remaining = total - FAIR_PURGE_BATCH_SIZE;
    for (let guard = 0; guard < 100; guard += 1) {
      const left = Object.values(await counts(f, PII_TABLES)).reduce((sum, value) => sum + value, 0);
      // One transaction never deletes more than one batch.
      expect(left).toBeGreaterThanOrEqual(Math.max(0, remaining));
      expect(await noOrphans(f)).toBe(true);
      if ((await latestRun(f)).status === "completed") break;
      remaining = left - FAIR_PURGE_BATCH_SIZE;
      await nextBatch(f);
    }

    const run = await latestRun(f);
    expect(run).toMatchObject({ mode: "execute", trigger: "cron", status: "completed", totalRows: total });
    expect(run.batches).toBe(Math.ceil(total / FAIR_PURGE_BATCH_SIZE) + (total % FAIR_PURGE_BATCH_SIZE === 0 ? 1 : 0));
    expect(Object.fromEntries(run.categories.map((entry) => [entry.category, entry.rows]))).toEqual(
      Object.fromEntries(FAIR_PURGE_CATEGORIES.map((category) => [category, before[FAIR_PURGE_TABLES[category]]])),
    );
    // Category order: each one finished before the next started.
    for (let i = 1; i < run.categories.length; i += 1) expect(run.categories[i].startedAt!).toBeGreaterThanOrEqual(run.categories[i - 1].finishedAt!);
    expect(Object.values(await counts(f, PII_TABLES)).every((value) => value === 0)).toBe(true);
    expect(await snapshotOf(f)).toEqual(kept);

    // The audit row holds counts, enums and times — no hash, contact, name or row id.
    const audit = JSON.stringify(await rows(f, "fairPurgeRuns"));
    for (const secret of [hash(0), hash(VISITORS - 1), "example.invalid", "TEST Ime", "saglasnost", f.modelId, f.eventId]) expect(audit).not.toContain(secret);

    // Public results still come from the anonymous aggregates.
    expect(await f.t.query(api.fairPublic.getAudienceQuestionResult, { questionId: f.questionId })).toMatchObject({
      state: "public",
      options: [{ optionId: "test-da", percentage: 100 }, { optionId: "test-ne", percentage: 0 }],
    });
    expect(await f.t.mutation(internal.fairRetention.purgeTick, {})).toEqual({ status: "clean" });
  });

  test("a lost continuation is resumed from the last committed batch: nothing counted twice, nothing skipped", async () => {
    const f = await setup();
    const before = await counts(f, PII_TABLES);
    vi.setSystemTime(FAIR_PII_PURGE_AT_MS);
    const { runId } = await f.t.mutation(internal.fairRetention.purgeTick, {});
    // Drop the pending continuation, as if the scheduler lost it.
    await f.t.run(async (ctx) => {
      for (const job of await ctx.db.system.query("_scheduled_functions").collect()) {
        if (job.state.kind === "pending") await ctx.scheduler.cancel(job._id);
      }
    });
    const stuck = await latestRun(f);
    expect(stuck).toMatchObject({ status: "running", batches: 1, totalRows: FAIR_PURGE_BATCH_SIZE });

    vi.setSystemTime(FAIR_PII_PURGE_AT_MS + 60_000);
    expect(await f.t.mutation(internal.fairRetention.purgeTick, {})).toEqual({ status: "running", runId });
    expect((await latestRun(f)).batches).toBe(1);
    vi.setSystemTime(FAIR_PII_PURGE_AT_MS + FAIR_PURGE_STALL_MS);
    expect(await f.t.mutation(internal.fairRetention.purgeTick, {})).toEqual({ status: "resumed", runId });
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await latestRun(f);
    expect(run.status).toBe("completed");
    expect(Object.fromEntries(run.categories.map((entry) => [entry.category, entry.rows]))).toEqual(
      Object.fromEntries(FAIR_PURGE_CATEGORIES.map((category) => [category, before[FAIR_PURGE_TABLES[category]]])),
    );
    expect(Object.values(await counts(f, PII_TABLES)).every((value) => value === 0)).toBe(true);
  });

  test("a PII row that appears after the purge (a report email queued by hand) is purged by the next tick; scans write no visitor", async () => {
    const f = await setup();
    vi.setSystemTime(FAIR_PII_PURGE_AT_MS);
    await f.t.mutation(internal.fairRetention.purgeTick, {});
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await f.t.mutation(internal.fairRetention.purgeTick, {})).toEqual({ status: "clean" });

    await f.t.run(async (ctx) => {
      await ctx.db.insert("fairEmailDeliveries", { dedupeKey: "fair-report/late/1", kind: "daily_report", recipient: "kasno@example.invalid", status: "queued", scheduledFor: Date.now(), attemptCount: 0, createdAt: Date.now(), updatedAt: Date.now() });
    });
    expect((await f.t.mutation(internal.fairRetention.purgeTick, {})).status).toBe("started");
    expect(await rows(f, "fairEmailDeliveries")).toEqual([]);
    expect((await latestRun(f)).categories.find((entry) => entry.category === "email_deliveries")?.rows).toBe(1);

    // A device whose clock is wrong still sends its cookie: no visitor row, no fair scan.
    const qr = f.seed.qr.find((row) => row.modelExternalKey === "test-em26-volta-x1")!;
    const outcome = await f.t.mutation(api.cards.resolveAndRecord, { cardCode: qr.resolverCode, requestId: "test-after-purge-1", deviceCategory: "mobile", ipHash: "test-hall-nat", fairVisitorHash: hash(9999) });
    expect(outcome).toMatchObject({ kind: "fair_model", fairScan: "no_visitor" });
    await expect(f.t.mutation(api.fairInteractions.upsertRating, { visitorHash: hash(9999), eventModelId: f.modelId, appearance: 5 })).rejects.toMatchObject({ data: { code: "EVENT_NOT_ACTIVE" } });
    expect(await rows(f, "fairVisitors")).toEqual([]);
    expect(await rows(f, "fairScanEvents")).toEqual([]);
  });
});

describe("B7 retention access", () => {
  test("preview, dry run and audit are admin-only; deletion has no public entry; the cron runs every 15 minutes", async () => {
    const f = await setup();
    for (const caller of [f.t, f.member]) {
      await expect(caller.query(api.fairRetention.getRetentionOverview, {})).rejects.toThrow();
      await expect(caller.mutation(api.fairRetention.startPurgeDryRun, {})).rejects.toThrow();
    }
    const overview = await f.admin.query(api.fairRetention.getRetentionOverview, {});
    expect(overview.preview.categories).toHaveLength(FAIR_PURGE_CATEGORIES.length);
    expect(await f.admin.mutation(api.fairRetention.startPurgeDryRun, {})).toMatchObject({ created: true });
    expect((await f.admin.query(api.fairRetention.getRetentionOverview, {})).runs[0]).toMatchObject({ mode: "dry_run", trigger: "admin" });

    type Registered = { isPublic?: boolean; isInternal?: boolean };
    const visibility = Object.fromEntries(
      Object.entries(fairRetentionModule)
        .filter(([, value]) => typeof value === "function" || (typeof value === "object" && value !== null && ("isPublic" in value || "isInternal" in value)))
        .map(([name, fn]) => [name, (fn as Registered).isPublic ? "public" : (fn as Registered).isInternal ? "internal" : "other"]),
    );
    expect(visibility).toEqual({
      purgeContinue: "internal", purgeTick: "internal", previewPurge: "internal", startDryRun: "internal", listPurgeRuns: "internal",
      getRetentionOverview: "public", startPurgeDryRun: "public",
    });

    const crons = (await import("./crons")).default as unknown as { crons: Record<string, { schedule: { type: string; minutes?: number }; name: string }> };
    expect(crons.crons["fair pii purge"]).toMatchObject({ schedule: { type: "interval", minutes: 15 }, name: "fairRetention:purgeTick" });
  });
});
