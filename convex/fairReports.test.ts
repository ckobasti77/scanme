/// <reference types="vite/client" />

// Sajam 2026 B6 — analytics, daily dataset and report lifecycle
// (BACKEND-HANDOFF §5.6, §7, §10, §12 "Izveštaji i izolacija"; MASTER §12,
// §13). Metric sources are seeded with the same shard/row helpers the B2–B5
// write paths use. NOTHING IS SENT: global `fetch` is a mock, the Resend key
// is fake, and every test asserts on what the mock received.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { bumpFairCount, fairScanCountKeys } from "./lib/fairCountShards";
import { applyFairRating, fairAudienceVoteKey } from "./lib/fairInteractions";
import { fairTimeKeys } from "./lib/fairScans";
import { fairSponsoredCountKeys } from "./lib/fairSponsored";
import { FAIR_REPORT_MODELS_CAP, FAIR_REPORT_ROWS_CAP, type FairDailyDataset } from "./lib/fairReportDataset";
import { FAIR_PII_PURGE_AT_MS, FAIR_REPORT_READY_WITHIN_MS } from "../lib/fair-contract";
// Loaded up front (as fairLeads.test.ts does with its modules): the scheduler
// imports these dynamically, and a cold transform on a busy CPU could outlast
// convex-test's timer pumps in finishAllScheduledFunctions.
import "./fairAnalytics";
import "./fairEmails";
import "./fairEmailSender";
import "./fairReports";

const modules = import.meta.glob("./**/*.ts");

const BEFORE_OPENING = Date.parse("2026-10-08T12:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const DAY1_LATE = Date.parse("2026-10-09T23:30:00+02:00"); // 21:30 UTC, still 9 Oct in Belgrade
const DAY2_EARLY = Date.parse("2026-10-10T00:10:00+02:00"); // still 9 Oct in UTC, already day 2 in Belgrade
const DAY2 = Date.parse("2026-10-10T11:00:00+02:00");
const DAY1_END = Date.parse("2026-10-10T00:00:00+02:00");
const DAY2_END = Date.parse("2026-10-11T00:00:00+02:00");
/** K4: a manual build is allowed only once the day has closed. */
const DAY1_CLOSED = DAY1_END + 5 * 60_000;
const ADMIN_EMAIL = "fair-admin@scanme.test";
const ISSUER = "https://fair-b6.test";
const RECIPIENT_A = "izvestaj.a@example.invalid";
const EMAIL_B = "posetilac.b@example.invalid";

type ResendCall = { key: string | null; body: { to: string[]; subject: string; text: string; attachments?: { filename: string; content: string }[] } };
let calls: ResendCall[] = [];
/** visitor:model pairs already scanned in the current test (first scan = unique). */
const seenPairs = new Set<string>();
let respond: (call: number) => Response = (call) => Response.json({ id: `re_test_report_${call}` });

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.RESEND_API_KEY = "re_test_not_a_real_key";
  process.env.RESEND_FROM_EMAIL = "ScanMe TEST <test-sender@example.invalid>";
  calls = [];
  seenPairs.clear();
  respond = (call) => Response.json({ id: `re_test_report_${call}` });
  vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ key: headers.get("idempotency-key"), body: JSON.parse(String(init?.body)) });
    return respond(calls.length);
  }));
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_OPENING);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM_EMAIL;
});

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

type Tier = "included" | "starter" | "advanced";
const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const memberId = await ctx.db.insert("users", { email: "klijent@example.invalid" });
    const client = async (code: string, brandName: string) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: BEFORE_OPENING,
      });
      const brandId = await ctx.db.insert("brands", { accountId, name: brandName, normalizedName: brandName.toLowerCase(), revision: "1", colors: [], createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING });
      return { accountId, businessId, brandId };
    };
    return { adminId, memberId, a: await client("TA", "TEST Volta"), b: await client("TB", "TEST Om"), c: await client("TC", "TEST Nula") };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });

  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status: "published", garagePriority: 1,
  });
  const day = async (dateKey: string, sortOrder: number) =>
    (await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey, label: `TEST dan ${sortOrder}`, sortOrder })).dayId;
  const days = { d1: await day("2026-10-09", 1), d2: await day("2026-10-10", 2), d3: await day("2026-10-11", 3) };

  const exhibitor = async (key: string, client: typeof ids.a, location: string, recipient?: string) => {
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
      eventId, externalKey: `test-em-${key}`, accountId: client.accountId, businessId: client.businessId,
      ...(recipient ? { reportRecipientEmail: recipient } : {}),
    });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
      eventId, participationId, externalKey: `test-em-stand-${key}`, code: `TEST-${key.toUpperCase()}`, displayName: `TEST štand ${key}`, mapLocationId: location,
    });
    const model = async (externalKey: string, packageTier: Tier) => {
      const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
        eventId, participationId, standId, brandId: client.brandId, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
        specifications: [spec(1), spec(2)], packageTier, passportEligible: true,
      });
      await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
      return modelId;
    };
    return { participationId, standId, model };
  };
  const a = await exhibitor("a", ids.a, "ispred-14", RECIPIENT_A);
  const b = await exhibitor("b", ids.b, "ispred-15");
  const c = await exhibitor("c", ids.c, "ispred-16");
  const models = {
    a0: await a.model("test-volta-x0", "included"),
    a1: await a.model("test-volta-x1", "starter"),
    a2: await a.model("test-volta-x2", "advanced"),
    b1: await b.model("test-om-z1", "starter"),
    b2: await b.model("test-om-z2", "advanced"),
    c0: await c.model("test-nula-n0", "included"),
  };
  return { t, admin, member, ...ids, eventId, days, a, b, c, models };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}
const runEverything = (f: Fixture) => f.t.finishAllScheduledFunctions(vi.runAllTimers);

// -----------------------------------------------------------------------------
// Seeding through the real B2–B5 projection helpers
// -----------------------------------------------------------------------------

let visitorSequence = 0;
async function newVisitor(f: Fixture): Promise<Id<"fairVisitors">> {
  visitorSequence += 1;
  const hash = visitorSequence.toString(16).padStart(64, "0");
  return f.t.run((ctx) => ctx.db.insert("fairVisitors", { visitorHash: hash, firstSeenAt: BEFORE_OPENING, lastSeenAt: BEFORE_OPENING }));
}

/** One recorded (non-admin) scan: same shard keys as recordFairScan (B2). */
async function scan(f: Fixture, eventModelId: Id<"fairEventModels">, at: number, visitorId: Id<"fairVisitors">) {
  const model = (await f.t.run((ctx) => ctx.db.get(eventModelId)))!;
  const time = fairTimeKeys(at);
  const pair = `${visitorId}:${eventModelId}`;
  const first = !seenPairs.has(pair);
  seenPairs.add(pair);
  await f.t.run(async (ctx) => {
    for (const key of fairScanCountKeys("scan_total", { eventModelId, standId: model.standId }, time)) await bumpFairCount(ctx, key);
    if (first) for (const key of fairScanCountKeys("scan_unique", { eventModelId, standId: model.standId }, time)) await bumpFairCount(ctx, key);
  });
}

async function lead(f: Fixture, eventModelId: Id<"fairEventModels">, kind: "interest" | "test_drive", at: number, email: string) {
  const visitorId = await newVisitor(f);
  return f.t.run(async (ctx) => {
    const model = (await ctx.db.get(eventModelId))!;
    return ctx.db.insert("fairLeads", {
      submissionId: `test-b6-lead-${visitorId}`, kind, visitorId, eventId: model.eventId, eventModelId, participationId: model.participationId,
      contactName: `TEST Kontakt ${email}`, email, consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST saglasnost",
      consentedAt: at, status: "received", followUpSuppressed: false, createdAt: at, purgeAt: FAIR_PII_PURGE_AT_MS,
    });
  });
}

async function rate(f: Fixture, eventModelId: Id<"fairEventModels">, values: Record<string, number>) {
  const visitorId = await newVisitor(f);
  await f.t.run(async (ctx) => {
    const model = (await ctx.db.get(eventModelId))!;
    await applyFairRating(ctx, { visitorId, model, values, now: DAY1 });
  });
}

async function question(f: Fixture, eventModelId: Id<"fairEventModels">, eventDayId: Id<"fairEventDays">, votes: [number, number]) {
  return f.t.run(async (ctx) => {
    const model = (await ctx.db.get(eventModelId))!;
    const questionId = await ctx.db.insert("fairAudienceQuestions", {
      eventId: model.eventId, eventDayId, eventModelId, prompt: `TEST pitanje ${eventModelId}`,
      options: [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }],
      status: "published", sortOrder: 1, startsAt: DAY1 - 3_600_000, showOnSponsoredRotation: false, createdAt: DAY1, updatedAt: DAY1,
    });
    for (let i = 0; i < votes[0]; i += 1) await bumpFairCount(ctx, fairAudienceVoteKey(questionId, "o1"));
    for (let i = 0; i < votes[1]; i += 1) await bumpFairCount(ctx, fairAudienceVoteKey(questionId, "o2"));
    return questionId;
  });
}

async function surveyResponses(f: Fixture, eventModelId: Id<"fairEventModels">, at: number, answers: string[]) {
  const surveyId = await f.t.run(async (ctx) => {
    const model = (await ctx.db.get(eventModelId))!;
    return ctx.db.insert("fairSurveys", {
      eventId: model.eventId, eventModelId, status: "published", version: 1, createdAt: DAY1, updatedAt: DAY1,
      questions: [{ id: "s1", prompt: "TEST kupujete li uskoro?", kind: "yes_no", options: [], required: false, order: 1 }],
    });
  });
  for (const value of answers) {
    const visitorId = await newVisitor(f);
    await f.t.run(async (ctx) => {
      const model = (await ctx.db.get(eventModelId))!;
      await ctx.db.insert("fairSurveyResponses", {
        submissionId: `test-b6-survey-${visitorId}`, visitorId, eventId: model.eventId, eventModelId, surveyId,
        answers: [{ questionId: "s1", value }], submittedAt: at,
      });
    });
  }
}

async function sponsored(f: Fixture, eventModelId: Id<"fairEventModels">, kind: "open_model" | "garage_add", at: number) {
  await f.t.run(async (ctx) => {
    for (const key of fairSponsoredCountKeys(kind, eventModelId, fairTimeKeys(at))) await bumpFairCount(ctx, key);
  });
}

/** Builds one run through the admin path and returns it with its frozen dataset. */
async function build(f: Fixture, eventDayId: Id<"fairEventDays">, participationId: Id<"fairParticipations">, format: "pdf" | "xlsx" | "csv" = "pdf") {
  const { reportRunId } = await f.admin.mutation(api.fairReports.requestReportBuild, { eventDayId, participationId, format });
  await runEverything(f);
  const result = await f.admin.query(api.fairReports.getReportRun, { reportRunId });
  return { reportRunId, run: result!.run, dataset: result!.dataset as FairDailyDataset };
}

async function seedDay1(f: Fixture) {
  const v1 = await newVisitor(f);
  const v2 = await newVisitor(f);
  for (let i = 0; i < 10; i += 1) await scan(f, f.models.a1, DAY1, v1); // 10 total, 1 unique (HANDOFF §10)
  await scan(f, f.models.a1, DAY1, v2);
  await scan(f, f.models.a2, DAY1_LATE, v1);
  await scan(f, f.models.a0, DAY1, v1);
  await scan(f, f.models.b1, DAY1, v2);
  await lead(f, f.models.a1, "interest", DAY1, "a1.lead@example.invalid");
  await lead(f, f.models.a2, "test_drive", DAY1, "a2.lead@example.invalid");
  await lead(f, f.models.b1, "interest", DAY1, EMAIL_B);
  await rate(f, f.models.a1, { overall: 4 });
  await rate(f, f.models.a1, { overall: 5 });
  await rate(f, f.models.a2, { appearance: 5, price: 3 });
  // A stored overall on the Advanced model (from a Starter period) never appears as a 4th Advanced rating.
  await rate(f, f.models.a2, { overall: 2 });
  await question(f, f.models.a1, f.days.d1, [3, 1]);
  await surveyResponses(f, f.models.a2, DAY1, ["yes", "yes", "no"]);
  await sponsored(f, f.models.a2, "open_model", DAY1);
  await sponsored(f, f.models.a2, "garage_add", DAY1);
}

const byModel = (dataset: FairDailyDataset, eventModelId: Id<"fairEventModels">) => dataset.models.find((row) => row.eventModelId === eventModelId)!;

// =============================================================================
// Package projections
// =============================================================================

describe("B6 package projections (HANDOFF §10, §12; MASTER §12)", () => {
  test("included sees only stand total/unique; Starter/Advanced get exactly their contract groups, absent groups are omitted", async () => {
    const f = await setup();
    await seedDay1(f);
    vi.setSystemTime(DAY1_CLOSED);
    const { dataset } = await build(f, f.days.d1, f.a.participationId);

    // Stand total/unique (every package): all of exhibitor A's scans on its stand.
    expect(dataset.stands).toEqual([expect.objectContaining({ standId: f.a.standId, total: 13, unique: 4 })]);

    const included = byModel(dataset, f.models.a0);
    expect(included.metrics).toEqual(["stand_scans"]);
    for (const key of ["scans", "interest", "testDrive", "ratings", "audience", "surveys", "sponsored"]) expect(included).not.toHaveProperty(key);

    const starter = byModel(dataset, f.models.a1);
    expect(starter.scans).toEqual({ total: 11, unique: 2 });
    expect(starter.interest).toEqual({ count: 1, capped: false });
    expect(starter.ratings).toEqual([{ field: "overall", count: 2, average: 4.5 }]);
    expect(starter.audience).toEqual([expect.objectContaining({ totalVotes: 4, options: [expect.objectContaining({ count: 3 }), expect.objectContaining({ count: 1 })] })]);
    // No fake Advanced zeros on Starter.
    for (const key of ["testDrive", "surveys", "sponsored"]) expect(starter).not.toHaveProperty(key);

    const advanced = byModel(dataset, f.models.a2);
    expect(advanced.scans).toEqual({ total: 1, unique: 1 });
    expect(advanced.testDrive).toEqual({ count: 1, capped: false });
    expect(advanced.interest).toEqual({ count: 0, capped: false });
    expect(advanced.ratings?.map((row) => row.field)).toEqual(["appearance", "specifications", "price"]);
    expect(advanced.ratings?.find((row) => row.field === "appearance")).toEqual({ field: "appearance", count: 1, average: 5 });
    expect(advanced.surveys?.[0]).toMatchObject({ responses: 3, questions: [{ answers: [{ value: "yes", count: 2 }, { value: "no", count: 1 }] }] });
    expect(advanced.sponsored).toEqual({ openModel: 1, garageAdd: 1 });

    // Hourly: only entitled models (starter + advanced), Belgrade hours of 9 Oct.
    expect(dataset.hourly).toHaveLength(24);
    expect(dataset.hourly?.find((hour) => hour.hourKey === "2026-10-09T10")).toEqual({ hourKey: "2026-10-09T10", total: 11, unique: 2 });
    expect(dataset.hourly?.find((hour) => hour.hourKey === "2026-10-09T23")).toEqual({ hourKey: "2026-10-09T23", total: 1, unique: 1 });
    expect(dataset.hourly?.reduce((sum, hour) => sum + hour.total, 0)).toBe(12);
    expect(dataset).not.toHaveProperty("comparison");
  });

  test("an included-only exhibitor's report holds the stand totals and nothing per model", async () => {
    const f = await setup();
    const v = await newVisitor(f);
    await scan(f, f.models.c0, DAY1, v);
    await scan(f, f.models.c0, DAY1, v);
    vi.setSystemTime(DAY1_CLOSED);
    const { dataset } = await build(f, f.days.d1, f.c.participationId);
    expect(dataset.stands).toEqual([expect.objectContaining({ total: 2, unique: 1 })]);
    expect(dataset.models).toEqual([expect.objectContaining({ eventModelId: f.models.c0, metrics: ["stand_scans"] })]);
    expect(dataset.models[0]).not.toHaveProperty("scans");
    expect(dataset).not.toHaveProperty("hourly");
  });

  test("an upgrade mid-fair: earlier scans stay, the new group starts that day, and the comparison stays like-for-like", async () => {
    const f = await setup();
    const v = await newVisitor(f);
    await scan(f, f.models.b1, DAY1, v);
    await lead(f, f.models.b1, "interest", DAY1, EMAIL_B);
    vi.setSystemTime(DAY2);
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.models.b1, toTier: "advanced" });
    await scan(f, f.models.b1, DAY2, await newVisitor(f));
    await scan(f, f.models.b1, DAY2, v);
    await lead(f, f.models.b1, "test_drive", DAY2, EMAIL_B);

    vi.setSystemTime(DAY2_END + 60_000);
    const { dataset: day1 } = await build(f, f.days.d1, f.b.participationId);
    expect(byModel(day1, f.models.b1).tier).toBe("starter");
    expect(byModel(day1, f.models.b1)).not.toHaveProperty("testDrive");

    const { dataset: day2 } = await build(f, f.days.d2, f.b.participationId);
    const upgraded = byModel(day2, f.models.b1);
    expect(upgraded.tier).toBe("advanced");
    expect(upgraded.testDrive).toEqual({ count: 1, capped: false });
    expect(upgraded.scans).toEqual({ total: 2, unique: 1 });
    const comparison = Object.fromEntries((day2.comparison?.rows ?? []).map((row) => [row.metric, [row.current, row.previous]]));
    expect(comparison.scans_total).toEqual([2, 1]);
    expect(comparison.interest).toEqual([0, 1]);
    // b2 (Advanced on both days) has test drive both days; b1 did not have it yesterday → only b2 counts.
    expect(comparison.test_drive).toEqual([0, 0]);
    expect(day2.comparison?.previousDateKey).toBe("2026-10-09");
  });
});

// =============================================================================
// Isolation and day boundaries
// =============================================================================

describe("B6 isolation and Europe/Belgrade day boundaries (HANDOFF §12)", () => {
  test("exhibitor A never receives a model, lead or answer of exhibitor B", async () => {
    const f = await setup();
    await seedDay1(f);
    vi.setSystemTime(DAY1_CLOSED);
    const { dataset } = await build(f, f.days.d1, f.a.participationId);
    expect(dataset.models.map((row) => row.eventModelId).sort()).toEqual([f.models.a0, f.models.a1, f.models.a2].sort());
    const serialized = JSON.stringify(dataset);
    for (const foreign of [f.models.b1, f.models.b2, f.b.participationId, f.b.standId, "TEST test-om-z1", "TEST izlagač TB", EMAIL_B]) expect(serialized).not.toContain(foreign);
    // No contact at all in an aggregate report.
    for (const pii of ["a1.lead@example.invalid", "a2.lead@example.invalid", "TEST Kontakt", "@example.invalid"]) expect(serialized).not.toContain(pii);

    // The per-model read refuses a foreign model even when asked directly.
    expect(await f.t.query(internal.fairAnalytics.modelDayRaw, { eventModelId: f.models.b1, participationId: f.a.participationId, eventDayId: f.days.d1 })).toBeNull();
    // A day of another event is refused too.
    const other = await f.admin.mutation(api.fairAdmin.upsertEvent, {
      code: "test-auto-moto-fest-2026", slug: "test-auto-moto-fest-2026", title: "TEST AMF", venueName: "TEST hala",
      startsAt: Date.parse("2026-10-30T00:00:00+01:00"), endsAt: Date.parse("2026-11-02T00:00:00+01:00"), status: "published", garagePriority: 2,
    });
    const otherDay = (await f.admin.mutation(api.fairAdmin.upsertEventDay, { eventId: other.eventId, dateKey: "2026-10-30", label: "TEST AMF dan 1", sortOrder: 1 })).dayId;
    expect(await f.t.query(internal.fairAnalytics.modelDayRaw, { eventModelId: f.models.a1, participationId: f.a.participationId, eventDayId: otherDay })).toBeNull();
    expect(await f.t.query(internal.fairAnalytics.reportContext, { participationId: f.a.participationId, eventDayId: otherDay })).toBeNull();
    await expectCode(f.admin.mutation(api.fairReports.requestReportBuild, { eventDayId: otherDay, participationId: f.a.participationId, format: "pdf" }), "FAIR_LINK_CONFLICT");
  });

  test("a scan at 23:30 Belgrade is day 1 and one at 00:10 Belgrade is day 2, whatever the server zone says", async () => {
    const f = await setup();
    const v = await newVisitor(f);
    await scan(f, f.models.a1, DAY1_LATE, v);
    await scan(f, f.models.a1, DAY2_EARLY, await newVisitor(f));
    await lead(f, f.models.a1, "interest", DAY1_END - 60_000, "kasno@example.invalid");
    await lead(f, f.models.a1, "interest", DAY1_END, "rano@example.invalid");
    vi.setSystemTime(DAY2_END + 60_000);
    const { dataset: day1 } = await build(f, f.days.d1, f.a.participationId);
    const { dataset: day2 } = await build(f, f.days.d2, f.a.participationId);
    expect(byModel(day1, f.models.a1).scans).toEqual({ total: 1, unique: 1 });
    expect(byModel(day2, f.models.a1).scans).toEqual({ total: 1, unique: 1 });
    expect(byModel(day1, f.models.a1).interest?.count).toBe(1);
    expect(byModel(day2, f.models.a1).interest?.count).toBe(1);
    expect(day1.windowStart).toBe(Date.parse("2026-10-09T00:00:00+02:00"));
    expect(day1.windowEnd).toBe(DAY1_END);
    expect(day2.hourly?.find((hour) => hour.hourKey === "2026-10-10T00")?.total).toBe(1);
    expect(day1.hourly?.find((hour) => hour.hourKey === "2026-10-09T23")?.total).toBe(1);
  });
});

// =============================================================================
// Lifecycle: nothing is sent without a manual approval
// =============================================================================

describe("B6 report lifecycle (HANDOFF §5.6, §12; MASTER §12)", () => {
  test("send refuses pending_review; only a manual approval lets the outbox send exactly one email with the file", async () => {
    const f = await setup();
    await seedDay1(f);
    vi.setSystemTime(DAY1_END + 5 * 60_000);
    const { reportRunId, run } = await build(f, f.days.d1, f.a.participationId);
    expect(run).toMatchObject({ status: "pending_review", hasFile: true, recipient: RECIPIENT_A, sendCount: 0 });

    await expectCode(f.admin.mutation(api.fairReports.sendReportRun, { reportRunId }), "FAIR_REPORT_NOT_APPROVED");
    await runEverything(f);
    expect(await rows(f, "fairEmailDeliveries")).toHaveLength(0);
    expect(calls).toHaveLength(0);

    await f.admin.mutation(api.fairReports.approveReportRun, { reportRunId });
    const approved = (await f.t.run((ctx) => ctx.db.get(reportRunId)))!;
    expect(approved).toMatchObject({ status: "approved", approvedByUserId: f.adminId, reviewedByUserId: f.adminId });
    await expectCode(f.admin.mutation(api.fairReports.approveReportRun, { reportRunId }), "FAIR_REPORT_STATUS");

    await f.admin.mutation(api.fairReports.sendReportRun, { reportRunId });
    // A second click while the first delivery is queued is refused.
    await expectCode(f.admin.mutation(api.fairReports.sendReportRun, { reportRunId }), "FAIR_REPORT_STATUS");
    await runEverything(f);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe(`fair-report/${reportRunId}/1`);
    expect(calls[0].body.to).toEqual([RECIPIENT_A]);
    expect(calls[0].body.attachments).toHaveLength(1);
    expect(calls[0].body.attachments![0].filename).toBe("presek-test-elektromobilnost-2026-2026-10-09-test-izlagac-ta.pdf");
    expect(atob(calls[0].body.attachments![0].content).startsWith("%PDF-1.4")).toBe(true);
    expect((await f.t.run((ctx) => ctx.db.get(reportRunId)))).toMatchObject({ status: "sent", providerMessageId: "re_test_report_1" });
    const deliveries = await rows(f, "fairEmailDeliveries");
    expect(deliveries).toEqual([expect.objectContaining({ kind: "daily_report", reportRunId, status: "sent", dedupeKey: `fair-report/${reportRunId}/1` })]);

    // `send` refuses `sent`; resend sends the same reviewed file with a new key.
    await expectCode(f.admin.mutation(api.fairReports.sendReportRun, { reportRunId }), "FAIR_REPORT_NOT_APPROVED");
    await f.admin.mutation(api.fairReports.resendReportRun, { reportRunId, recipient: "drugi@example.invalid" });
    await runEverything(f);
    expect(calls).toHaveLength(2);
    expect(calls[1].key).toBe(`fair-report/${reportRunId}/2`);
    expect(calls[1].body.to).toEqual(["drugi@example.invalid"]);
    expect(calls[1].body.attachments![0].content).toBe(calls[0].body.attachments![0].content);
  });

  test("an outbox row for an UNAPPROVED run is never delivered (gate re-checked at claim time)", async () => {
    const f = await setup();
    await seedDay1(f);
    vi.setSystemTime(DAY1_CLOSED);
    const { reportRunId } = await build(f, f.days.d1, f.a.participationId);
    const deliveryId = await f.t.run((ctx) => ctx.db.insert("fairEmailDeliveries", {
      dedupeKey: `fair-report/${reportRunId}/1`, reportRunId, kind: "daily_report", recipient: RECIPIENT_A, status: "queued",
      scheduledFor: Date.now(), attemptCount: 0, createdAt: Date.now(), updatedAt: Date.now(),
    }));
    await f.t.action(internal.fairEmailSender.sendDelivery, { deliveryId });
    expect(calls).toHaveLength(0);
    expect(await f.t.run((ctx) => ctx.db.get(deliveryId))).toMatchObject({ status: "failed", lastError: "REPORT_NOT_SENDABLE" });
    expect(await f.t.run((ctx) => ctx.db.get(reportRunId))).toMatchObject({ status: "pending_review" });
  });

  test("a failed send fails the run; retry re-queues it without a new approval; a correction is a new run that needs its own approval", async () => {
    const f = await setup();
    await seedDay1(f);
    vi.setSystemTime(DAY1_CLOSED);
    const { reportRunId } = await build(f, f.days.d1, f.a.participationId);
    await f.admin.mutation(api.fairReports.approveReportRun, { reportRunId });
    respond = () => new Response(JSON.stringify({ message: "rejected" }), { status: 422 });
    await f.admin.mutation(api.fairReports.sendReportRun, { reportRunId });
    await runEverything(f);
    expect(await f.t.run((ctx) => ctx.db.get(reportRunId))).toMatchObject({ status: "failed", error: "PROVIDER_REJECTED:422" });

    respond = (call) => Response.json({ id: `re_test_report_${call}` });
    expect(await f.admin.mutation(api.fairReports.retryReportRun, { reportRunId })).toEqual({ status: "approved" });
    await runEverything(f);
    expect(await f.t.run((ctx) => ctx.db.get(reportRunId))).toMatchObject({ status: "sent" });
    expect(calls.map((call) => call.key)).toEqual([`fair-report/${reportRunId}/1`, `fair-report/${reportRunId}/2`]);

    const { reportRunId: correctionId } = await f.admin.mutation(api.fairReports.createReportCorrection, { reportRunId, format: "xlsx" });
    await runEverything(f);
    const correction = (await f.t.run((ctx) => ctx.db.get(correctionId)))!;
    expect(correction).toMatchObject({ status: "pending_review", correctionOfReportRunId: reportRunId, format: "xlsx", recipient: RECIPIENT_A });
    await expectCode(f.admin.mutation(api.fairReports.sendReportRun, { reportRunId: correctionId }), "FAIR_REPORT_NOT_APPROVED");
    await f.admin.mutation(api.fairReports.approveReportRun, { reportRunId: correctionId });
    await f.admin.mutation(api.fairReports.sendReportRun, { reportRunId: correctionId });
    await runEverything(f);
    expect(calls).toHaveLength(3);
    expect(calls[2].body.text).toContain("ispravljena verzija");
    expect(calls[2].body.attachments![0].filename.endsWith(".xlsx")).toBe(true);
  });

  test("a failed build is retried back into review; a run without a recipient cannot be sent", async () => {
    const f = await setup();
    vi.setSystemTime(DAY1_CLOSED);
    const { reportRunId } = await f.admin.mutation(api.fairReports.requestReportBuild, { eventDayId: f.days.d1, participationId: f.b.participationId, format: "csv" });
    await f.t.run((ctx) => ctx.db.patch(reportRunId, { status: "failed", error: "BUILD_FAILED" }));
    await runEverything(f); // the scheduled build finds a non-queued run and does nothing
    expect(await f.admin.mutation(api.fairReports.retryReportRun, { reportRunId })).toEqual({ status: "queued" });
    await runEverything(f);
    expect(await f.t.run((ctx) => ctx.db.get(reportRunId))).toMatchObject({ status: "pending_review" });
    await f.admin.mutation(api.fairReports.approveReportRun, { reportRunId });
    await expectCode(f.admin.mutation(api.fairReports.sendReportRun, { reportRunId }), "FAIR_REPORT_RECIPIENT_MISSING");
    await expectCode(f.admin.mutation(api.fairReports.sendReportRun, { reportRunId, recipient: "nije-adresa" }), "FAIR_REPORT_RECIPIENT_MISSING");
    expect(await rows(f, "fairEmailDeliveries")).toHaveLength(0);
  });

  test("every report function is admin-only", async () => {
    const f = await setup();
    vi.setSystemTime(DAY1_CLOSED);
    const { reportRunId } = await build(f, f.days.d1, f.a.participationId);
    const refused = [
      f.member.query(api.fairReports.listReportRuns, { eventId: f.eventId }),
      f.member.query(api.fairReports.getReportRun, { reportRunId }),
      f.member.mutation(api.fairReports.requestReportBuild, { eventDayId: f.days.d1, participationId: f.a.participationId, format: "pdf" }),
      f.member.mutation(api.fairReports.approveReportRun, { reportRunId }),
      f.member.mutation(api.fairReports.sendReportRun, { reportRunId }),
      f.member.mutation(api.fairReports.resendReportRun, { reportRunId }),
      f.member.mutation(api.fairReports.retryReportRun, { reportRunId }),
      f.member.mutation(api.fairReports.createReportCorrection, { reportRunId }),
      f.member.action(api.fairReports.downloadReportRun, { reportRunId, format: "csv" }),
      f.member.action(api.fairReports.exportLeadsFile, { eventId: f.eventId, participationId: f.a.participationId, format: "csv" }),
      f.member.action(api.fairReports.exportOrganizerAggregate, { eventId: f.eventId, format: "csv" }),
      f.t.query(api.fairReports.listReportRuns, { eventId: f.eventId }),
      f.t.action(api.fairReports.downloadReportRun, { reportRunId, format: "csv" }),
    ];
    for (const call of refused) await expect(call).rejects.toThrow();
    expect(await f.t.run((ctx) => ctx.db.get(reportRunId))).toMatchObject({ status: "pending_review" });
  });
});

// =============================================================================
// Daily cron: ready within 60 minutes of the day's close
// =============================================================================

describe("B6 daily dataset sweep (MASTER §12: ready ≤ 60 min after close)", () => {
  test("after the day closes the sweep queues one run per active daily-report exhibitor, builds it at once and never sends", async () => {
    const f = await setup();
    await seedDay1(f);
    vi.setSystemTime(DAY1_END - 60_000);
    expect(await f.t.mutation(internal.fairReports.sweepDailyReports, {})).toEqual({ created: 0, more: false });

    vi.setSystemTime(DAY1_END + 15 * 60_000); // the first 15-minute cron tick after midnight
    expect(await f.t.mutation(internal.fairReports.sweepDailyReports, {})).toEqual({ created: 2, more: false });
    await runEverything(f);
    const runs = await rows(f, "fairReportRuns");
    expect(runs.map((row) => row.participationId).sort()).toEqual([f.a.participationId, f.b.participationId].sort()); // C is included-only
    for (const row of runs) {
      expect(row).toMatchObject({ eventDayId: f.days.d1, status: "pending_review", format: "pdf", dataThrough: DAY1_END });
      expect(row.dataset?.builtAt).toBeDefined();
      expect(row.dataset!.builtAt - DAY1_END).toBeLessThan(FAIR_REPORT_READY_WITHIN_MS);
    }
    // Idempotent; nothing is sent.
    expect(await f.t.mutation(internal.fairReports.sweepDailyReports, {})).toEqual({ created: 0, more: false });
    expect(await rows(f, "fairEmailDeliveries")).toHaveLength(0);
    expect(calls).toHaveLength(0);

    // Days that closed more than 24 h ago (the last one closed 12 Oct 00:00) are not backfilled by surprise.
    vi.setSystemTime(Date.parse("2026-10-13T01:00:00+02:00"));
    expect(await f.t.mutation(internal.fairReports.sweepDailyReports, {})).toEqual({ created: 0, more: false });
  });

  test("the cron is registered every 15 minutes, well inside the 60-minute deadline", async () => {
    const crons = (await import("./crons")).default as unknown as { crons: Record<string, { schedule: { type: string; minutes?: number }; name: string }> };
    const job = crons.crons["fair daily report sweep"];
    expect(job.schedule).toMatchObject({ type: "interval", minutes: 15 });
    expect(job.name).toBe("fairReports:sweepDailyReports");
  });
});

// =============================================================================
// K4 (RF finding 4): an early manual build never blocks the daily report
// =============================================================================

describe("K4 report build before the day closes (RF finding 4)", () => {
  test("requestReportBuild refuses a day that has not closed with FAIR_DAY_NOT_CLOSED and stores nothing", async () => {
    const f = await setup();
    await seedDay1(f);
    vi.setSystemTime(DAY1_LATE);
    await expectCode(f.admin.mutation(api.fairReports.requestReportBuild, { eventDayId: f.days.d1, participationId: f.a.participationId, format: "pdf" }), "FAIR_DAY_NOT_CLOSED");
    vi.setSystemTime(DAY1_END - 1);
    await expectCode(f.admin.mutation(api.fairReports.requestReportBuild, { eventDayId: f.days.d1, participationId: f.a.participationId, format: "pdf" }), "FAIR_DAY_NOT_CLOSED");
    // Day 1 has closed, day 2 has not.
    vi.setSystemTime(DAY1_CLOSED);
    await expectCode(f.admin.mutation(api.fairReports.requestReportBuild, { eventDayId: f.days.d2, participationId: f.a.participationId, format: "pdf" }), "FAIR_DAY_NOT_CLOSED");
    await runEverything(f);
    expect(await rows(f, "fairReportRuns")).toHaveLength(0);

    // Exactly at the close the build is allowed.
    vi.setSystemTime(DAY1_END);
    const { run } = await build(f, f.days.d1, f.a.participationId);
    expect(run).toMatchObject({ status: "pending_review", dateKey: "2026-10-09" });

    // A correction of a run whose day is still open is refused the same way.
    vi.setSystemTime(DAY2);
    const earlyDay2 = await f.t.run((ctx) => ctx.db.insert("fairReportRuns", {
      eventId: f.eventId, eventDayId: f.days.d2, participationId: f.a.participationId, status: "pending_review",
      dataThrough: DAY2_END, format: "pdf", createdAt: DAY2, updatedAt: DAY2,
    }));
    await expectCode(f.admin.mutation(api.fairReports.createReportCorrection, { reportRunId: earlyDay2 }), "FAIR_DAY_NOT_CLOSED");
    expect(await rows(f, "fairReportRuns")).toHaveLength(2);
  });

  test("the sweep still makes the daily report after the close when an earlier run of that day exists", async () => {
    const f = await setup();
    await seedDay1(f);
    // An existing row from before K4: built by hand at 23:30, frozen with dataThrough = endsAt.
    vi.setSystemTime(DAY1_LATE);
    const early = await f.t.run((ctx) => ctx.db.insert("fairReportRuns", {
      eventId: f.eventId, eventDayId: f.days.d1, participationId: f.a.participationId, status: "pending_review",
      dataThrough: DAY1_END, format: "pdf", createdAt: DAY1_LATE, updatedAt: DAY1_LATE,
    }));
    // B already got a manual build after the close: that one still counts as the day's run.
    vi.setSystemTime(DAY1_CLOSED);
    const { reportRunId: manualB } = await build(f, f.days.d1, f.b.participationId);

    vi.setSystemTime(DAY1_END + 15 * 60_000);
    expect(await f.t.mutation(internal.fairReports.sweepDailyReports, {})).toEqual({ created: 1, more: false });
    await runEverything(f);
    const runs = await rows(f, "fairReportRuns");
    expect(runs.filter((row) => row.participationId === f.b.participationId).map((row) => row._id)).toEqual([manualB]);
    const forA = runs.filter((row) => row.participationId === f.a.participationId);
    expect(forA).toHaveLength(2);
    const daily = forA.find((row) => row._id !== early)!;
    expect(daily).toMatchObject({ eventDayId: f.days.d1, status: "pending_review", format: "pdf", dataThrough: DAY1_END });
    expect(daily.createdAt).toBeGreaterThanOrEqual(DAY1_END);
    expect(daily.dataset!.builtAt).toBeGreaterThanOrEqual(DAY1_END);
    expect(daily.dataset!.builtAt - DAY1_END).toBeLessThan(FAIR_REPORT_READY_WITHIN_MS);
    // The 23:30 scan of A2 is in the real daily report.
    expect(byModel(daily.dataset!, f.models.a2).scans).toMatchObject({ total: 1 });
    // The early row is left as it was (it is never rebuilt or deleted).
    expect(await f.t.run((ctx) => ctx.db.get(early))).toMatchObject({ status: "pending_review", createdAt: DAY1_LATE });

    // Idempotent from here on; nothing is sent.
    expect(await f.t.mutation(internal.fairReports.sweepDailyReports, {})).toEqual({ created: 0, more: false });
    expect(await rows(f, "fairEmailDeliveries")).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

// =============================================================================
// Larger seed: caps and pagination
// =============================================================================

describe("B6 caps and pagination on a larger seed (HANDOFF §12)", () => {
  test("more models than the cap → the first FAIR_REPORT_MODELS_CAP and an explicit truncation flag", async () => {
    const f = await setup();
    await f.t.run(async (ctx) => {
      const template = (await ctx.db.get(f.models.b1))!;
      const fields: Partial<typeof template> = { ...template };
      delete fields._id;
      delete fields._creationTime;
      for (let i = 0; i < FAIR_REPORT_MODELS_CAP + 5; i += 1) {
        await ctx.db.insert("fairEventModels", { ...(fields as Omit<typeof template, "_id" | "_creationTime">), externalKey: `test-om-bulk-${i}`, slug: `test-om-bulk-${i}`, displayName: `TEST bulk ${i}`, sortOrder: i + 10 });
      }
    });
    vi.setSystemTime(DAY1_CLOSED);
    const { dataset } = await build(f, f.days.d1, f.b.participationId);
    expect(dataset.models).toHaveLength(FAIR_REPORT_MODELS_CAP);
    expect(dataset.modelsTruncated).toBe(true);
  });

  test("a lead count above the read cap is reported as capped, never silently cut", async () => {
    const f = await setup();
    const visitorId = await newVisitor(f);
    await f.t.run(async (ctx) => {
      const model = (await ctx.db.get(f.models.b1))!;
      for (let i = 0; i <= FAIR_REPORT_ROWS_CAP; i += 1) {
        await ctx.db.insert("fairLeads", {
          submissionId: `test-b6-bulk-${i}`, kind: "interest", visitorId, eventId: model.eventId, eventModelId: model._id, participationId: model.participationId,
          contactName: "TEST bulk", phone: "+381600000000", consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST", consentedAt: DAY1,
          status: "received", followUpSuppressed: false, createdAt: DAY1 + i, purgeAt: FAIR_PII_PURGE_AT_MS,
        });
      }
    });
    vi.setSystemTime(DAY1_CLOSED);
    const { dataset } = await build(f, f.days.d1, f.b.participationId);
    expect(byModel(dataset, f.models.b1).interest).toEqual({ count: FAIR_REPORT_ROWS_CAP, capped: true });
  });

  test("the PII lead export pages through every lead of ONE exhibitor and is a separate file", async () => {
    const f = await setup();
    const visitorId = await newVisitor(f);
    await f.t.run(async (ctx) => {
      const a1 = (await ctx.db.get(f.models.a1))!;
      for (let i = 0; i < 450; i += 1) {
        await ctx.db.insert("fairLeads", {
          submissionId: `test-b6-export-${i}`, kind: "interest", visitorId, eventId: a1.eventId, eventModelId: a1._id, participationId: a1.participationId,
          contactName: `TEST Izvoz ${i}`, email: `izvoz${i}@example.invalid`, consentAccepted: true, consentVersion: 1, consentTextSnapshot: "TEST", consentedAt: DAY1,
          status: "received", followUpSuppressed: false, createdAt: DAY1 + i, purgeAt: FAIR_PII_PURGE_AT_MS,
        });
      }
    });
    await lead(f, f.models.b1, "interest", DAY1, EMAIL_B);
    const file = await f.admin.action(api.fairReports.exportLeadsFile, { eventId: f.eventId, participationId: f.a.participationId, format: "csv" });
    const text = new TextDecoder().decode(new Uint8Array(await new Blob(file.chunks).arrayBuffer()));
    expect(file.fileName).toBe("kontakti-test-izlagac-ta-test-elektromobilnost.csv");
    for (const i of [0, 199, 200, 449]) expect(text).toContain(`izvoz${i}@example.invalid`);
    expect(text).not.toContain(EMAIL_B);
    // The aggregate report of the same exhibitor never carries these contacts.
    vi.setSystemTime(DAY1_CLOSED);
    const { dataset } = await build(f, f.days.d1, f.a.participationId);
    expect(JSON.stringify(dataset)).not.toContain("izvoz0@example.invalid");
    // A participation of another event is refused.
    await expectCode(f.admin.action(api.fairReports.exportLeadsFile, { eventId: f.eventId, participationId: (await f.t.run(async (ctx) => {
      const event = await ctx.db.insert("fairEvents", {
        code: "test-x", slug: "test-x", title: "TEST X", venueName: "TEST", timezone: "Europe/Belgrade", startsAt: DAY1, endsAt: DAY2, status: "draft",
        garagePriority: 9, piiPurgeAt: FAIR_PII_PURGE_AT_MS, minimumPublicVoteCount: 5, robotsIndexable: false, createdAt: DAY1, updatedAt: DAY1,
      });
      const own = (await ctx.db.get(f.a.participationId))!;
      return ctx.db.insert("fairParticipations", { externalKey: "test-x", eventId: event, accountId: own.accountId, businessId: own.businessId, status: "active", createdAt: DAY1, updatedAt: DAY1 });
    })), format: "csv" }), "FAIR_LINK_NOT_FOUND");
  });

  test("the organizer aggregate sums all exhibitors per day with no exhibitor split, contact or survey answer", async () => {
    const f = await setup();
    await seedDay1(f);
    const file = await f.admin.action(api.fairReports.exportOrganizerAggregate, { eventId: f.eventId, format: "csv" });
    const text = new TextDecoder().decode(new Uint8Array(await new Blob(file.chunks).arrayBuffer()));
    expect(text).toContain("TEST dan 1,09.10.2026.,14,5,2,1");
    for (const hidden of ["TEST izlagač", "TEST test-volta", "@example.invalid", "TEST Kontakt", "kupujete"]) expect(text).not.toContain(hidden);
  });

  test("listing and download return the reviewed dataset in every format without new storage", async () => {
    const f = await setup();
    await seedDay1(f);
    vi.setSystemTime(DAY1_CLOSED);
    const { reportRunId } = await build(f, f.days.d1, f.a.participationId, "csv");
    const list = await f.admin.query(api.fairReports.listReportRuns, { eventId: f.eventId });
    expect(list).toEqual([expect.objectContaining({ reportRunId, exhibitorName: "TEST izlagač TA", status: "pending_review", format: "csv", dateKey: "2026-10-09" })]);
    expect(list[0]).not.toHaveProperty("dataset");
    const storedBefore = await f.t.run((ctx) => ctx.db.system.query("_storage").collect());
    for (const format of ["pdf", "xlsx", "csv"] as const) {
      const file = await f.admin.action(api.fairReports.downloadReportRun, { reportRunId, format });
      expect(file.fileName.endsWith(`.${format}`)).toBe(true);
      expect(file.chunks.length).toBeGreaterThan(0);
    }
    expect(await f.t.run((ctx) => ctx.db.system.query("_storage").collect())).toHaveLength(storedBefore.length);
  });
});
