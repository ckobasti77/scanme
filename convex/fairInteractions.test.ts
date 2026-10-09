/// <reference types="vite/client" />

// Sajam 2026 B3 — ratings, Glas publike, survey and brand passport
// (BACKEND-HANDOFF §5.3, §5.5, §7, §9, §10, §12 "Interakcije"; MASTER §7, §9,
// §11; JOVAN-DELTA §1, §3). Visitor hashes are made with the real Next-side
// helper, exactly as the gateway does; scans go through the existing
// cards.resolveAndRecord fair hook (B2), the only stamp writer.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { Infer } from "convex/values";
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import type {
  FairAudienceQuestionView,
  FairAudienceResultView,
  FairMyModelState,
  FairPassportState,
  FairRatingState,
  FairSurveyView,
} from "../lib/fair-contract";
import {
  fairAudienceQuestionView,
  fairAudienceResultView,
  fairMyModelStateView,
  fairPassportStateView,
  fairRatingStateView,
  fairSurveyView,
} from "./lib/fairValidators";
import { fairWholePercentages } from "./lib/fairInteractions";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
// The TEST elektromobilnost fair runs 9–11 Oct 2026 (Europe/Belgrade).
const BEFORE_OPENING = Date.parse("2026-10-08T12:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const DAY2 = Date.parse("2026-10-10T10:00:00+02:00");
const ADMIN_EMAIL = "fair-admin@scanme.test";
const ISSUER = "https://fair-b3.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";

// K1: a TEST gateway secret (not a real value), set as the Convex env in beforeEach.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_OPENING);
});
afterEach(() => vi.useRealTimers());

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });
const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);
const options = (...ids: string[]) => ids.map((id, index) => ({ id, label: `TEST opcija ${id}`, order: index + 1 }));

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

type Tier = "included" | "starter" | "advanced";

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const memberId = await ctx.db.insert("users", { email: "klijent@example.invalid" });
    const client = async (code: string, brandNames: string[]) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: BEFORE_OPENING,
      });
      const brandIds: Id<"brands">[] = [];
      for (const name of brandNames) {
        brandIds.push(await ctx.db.insert("brands", { accountId, name, normalizedName: name.toLowerCase(), revision: "1", colors: [], createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING }));
      }
      return { accountId, businessId, brandIds };
    };
    return { adminId, memberId, a: await client("TA", ["TEST Volta", "TEST Om", "TEST Solo"]), inventory: await client("TQ", []) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });
  const [volta, om, solo] = ids.a.brandIds;

  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  const { dayId: day1 } = await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const { dayId: day2 } = await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-10", label: "TEST dan 2", sortOrder: 2 });
  const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
    eventId, externalKey: "test-em-izlagac-a", accountId: ids.a.accountId, businessId: ids.a.businessId,
  });
  const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
    eventId, participationId, externalKey: "test-em-stand-a1", code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "ispred-14",
  });

  let qrSequence = 0;
  const model = async (externalKey: string, brandId: Id<"brands">, packageTier: Tier, opts: { qr?: boolean; publish?: boolean } = {}) => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId, participationId, standId, brandId, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
      specifications: [spec(1), spec(2)], packageTier, passportEligible: true,
    });
    if (opts.publish !== false) await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    let code: string | null = null;
    if (opts.qr) {
      const digitalQrId = await admin.mutation(api.adminProducts.createDigital, {
        accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key: `test-qr-b3-${++qrSequence}`,
      });
      code = await t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(digitalQrId))!.channelId))!.resolverCode);
      await admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: code });
    }
    return { id: modelId, code: code! };
  };
  const starter = await model("test-volta-x1", volta, "starter", { qr: true });
  const advanced = await model("test-volta-x2", volta, "advanced", { qr: true });
  const included = await model("test-om-z1", om, "included");
  const omStarter = await model("test-om-z2", om, "starter");
  const soloStarter = await model("test-solo-s1", solo, "starter");
  return { t, admin, member, ...ids, eventId, day1, day2, participationId, standId, brands: { volta, om, solo }, starter, advanced, included, omStarter, soloStarter, model };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}

let requestSequence = 0;
async function scan(f: Fixture, code: string, visitorHash: string) {
  return f.t.mutation(api.cards.resolveAndRecord, {
    cardCode: code, requestId: `test-b3-request-${++requestSequence}`, deviceCategory: "mobile", ipHash: "test-hall-nat", fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash,
  });
}

const rate = (f: Fixture, visitorHash: string, eventModelId: string, values: { overall?: number; appearance?: number; specifications?: number; price?: number }) =>
  f.t.mutation(api.fairInteractions.upsertRating, { gatewaySecret: GATEWAY_SECRET, visitorHash, eventModelId, ...values });

const summary = (f: Fixture, eventModelId: Id<"fairEventModels">) => f.admin.query(api.fairInteractionsAdmin.getModelInteractionSummary, { eventModelId });

const ratingField = (s: Awaited<ReturnType<typeof summary>>, field: string) => s.ratings.find((row) => row.field === field)!;

async function question(f: Fixture, eventModelId: Id<"fairEventModels">, day: Id<"fairEventDays">, sortOrder: number, extra: Partial<{ prompt: string; externalKey: string }> = {}) {
  const { questionId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, {
    eventModelId, eventDayId: day, prompt: extra.prompt ?? `TEST pitanje ${sortOrder}`, options: options("a", "b", "c"), sortOrder,
    ...(extra.externalKey ? { externalKey: extra.externalKey } : {}),
  });
  return questionId;
}

const vote = (f: Fixture, visitorHash: string, questionId: string, optionId: string) =>
  f.t.mutation(api.fairInteractions.upsertAudienceVote, { gatewaySecret: GATEWAY_SECRET, visitorHash, questionId, optionId });

const myState = (f: Fixture, visitorHash: string, eventModelId: string) => f.t.query(api.fairInteractions.getMyModelState, { gatewaySecret: GATEWAY_SECRET, visitorHash, eventModelId });

// -----------------------------------------------------------------------------

describe("ratings (HANDOFF §5.3, §10, §12; JOVAN-DELTA §1)", () => {
  test("Starter accepts exactly overall 1–5; Advanced only the three optional dimensions, never overall", async () => {
    const f = await setup();
    const v1 = visitor();
    expect(await rate(f, v1, f.starter.id, { overall: 4 })).toEqual({ mode: "overall", overall: 4 });
    for (const bad of [{ appearance: 4 }, { overall: 4, price: 3 }, { overall: 0 }, { overall: 0.5 }, { overall: 6 }, { overall: 2.25 }, {}]) {
      await expectCode(rate(f, v1, f.starter.id, bad), "INVALID_INPUT");
    }
    expect(await rate(f, v1, f.starter.id, { overall: 4.5 })).toEqual({ mode: "overall", overall: 4.5 });
    expect(await rate(f, v1, f.advanced.id, { price: 2 })).toEqual({ mode: "dimensions", price: 2 });
    expect(await rate(f, v1, f.advanced.id, { appearance: 5, specifications: 3 })).toEqual({ mode: "dimensions", appearance: 5, specifications: 3, price: 2 });
    for (const bad of [{ overall: 4 }, { overall: 4, appearance: 5 }, {}, { price: 9 }]) {
      await expectCode(rate(f, v1, f.advanced.id, bad), "INVALID_INPUT");
    }
    const stored = await rows(f, "fairRatings");
    expect(stored).toHaveLength(2);
    expect(stored.find((row) => row.eventModelId === f.advanced.id)).not.toHaveProperty("overall");
    // No derived overall exists for Advanced.
    expect(ratingField(await summary(f, f.advanced.id), "overall")).toMatchObject({ count: 0, sum: 0, average: null });
  });

  test("re-rating patches the same row: count stays, sum/average move; partial Advanced re-entry moves only sent dimensions", async () => {
    const f = await setup();
    const [v1, v2] = [visitor(), visitor()];
    await rate(f, v1, f.starter.id, { overall: 2 });
    await rate(f, v2, f.starter.id, { overall: 4 });
    expect(ratingField(await summary(f, f.starter.id), "overall")).toEqual({ field: "overall", count: 2, sum: 6, average: 3 });
    await rate(f, v1, f.starter.id, { overall: 5 });
    await rate(f, v1, f.starter.id, { overall: 5 });
    expect(ratingField(await summary(f, f.starter.id), "overall")).toEqual({ field: "overall", count: 2, sum: 9, average: 4.5 });
    expect((await rows(f, "fairRatings")).filter((row) => row.eventModelId === f.starter.id)).toHaveLength(2);

    await rate(f, v1, f.advanced.id, { appearance: 4 });
    await rate(f, v1, f.advanced.id, { price: 3 });
    await rate(f, v1, f.advanced.id, { appearance: 2 });
    const s = await summary(f, f.advanced.id);
    expect(ratingField(s, "appearance")).toMatchObject({ count: 1, sum: 2 });
    expect(ratingField(s, "price")).toMatchObject({ count: 1, sum: 3 });
    expect(ratingField(s, "specifications")).toMatchObject({ count: 0, sum: 0, average: null });
  });

  test("the visitor sees only their own rating; count/sum/average are admin-only", async () => {
    const f = await setup();
    const [v1, v2] = [visitor(), visitor()];
    await rate(f, v1, f.starter.id, { overall: 1 });
    for (let i = 0; i < 6; i++) await rate(f, visitor(), f.starter.id, { overall: 5 });
    expect((await myState(f, v1, f.starter.id)).rating).toEqual({ mode: "overall", overall: 1 });
    expect((await myState(f, v2, f.starter.id)).rating).toEqual({ mode: "overall" });
    expect(await f.t.query(api.fairInteractions.getMyModelState, { gatewaySecret: GATEWAY_SECRET, visitorHash: v2, eventModelId: f.advanced.id })).toMatchObject({ rating: { mode: "dimensions" } });
    await expect(f.member.query(api.fairInteractionsAdmin.getModelInteractionSummary, { eventModelId: f.starter.id })).rejects.toThrow();
    await expect(f.t.query(api.fairInteractionsAdmin.getModelInteractionSummary, { eventModelId: f.starter.id })).rejects.toThrow();
    expect(ratingField(await summary(f, f.starter.id), "overall")).toMatchObject({ count: 7, sum: 31 });
  });

  test("upgrade Starter → Advanced is not retroactive: the old overall stays, new entries take dimensions only", async () => {
    const f = await setup();
    const v1 = visitor();
    await rate(f, v1, f.starter.id, { overall: 3 });
    vi.setSystemTime(DAY1);
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.starter.id, toTier: "advanced" });
    await expectCode(rate(f, v1, f.starter.id, { overall: 5 }), "INVALID_INPUT");
    expect(await rate(f, v1, f.starter.id, { appearance: 5 })).toEqual({ mode: "dimensions", appearance: 5 });
    const s = await summary(f, f.starter.id);
    expect(ratingField(s, "overall")).toMatchObject({ count: 1, sum: 3 });
    expect(ratingField(s, "appearance")).toMatchObject({ count: 1, sum: 5 });
    expect((await rows(f, "fairRatings"))[0]).toMatchObject({ overall: 3, appearance: 5 });
  });

  test("unknown/draft model, ended event, bad hash and the per-visitor limit refuse without writing", async () => {
    const f = await setup();
    const v1 = visitor();
    const draft = await f.model("test-volta-draft", f.brands.volta, "starter", { publish: false });
    await expectCode(rate(f, v1, draft.id, { overall: 3 }), "FAIR_MODEL_NOT_FOUND");
    await expectCode(rate(f, v1, "nije-id", { overall: 3 }), "FAIR_MODEL_NOT_FOUND");
    await expectCode(rate(f, "A".repeat(64), f.starter.id, { overall: 3 }), "INVALID_INPUT");
    await f.t.run(async (ctx) => ctx.db.patch(f.eventId, { status: "ended" }));
    await expectCode(rate(f, v1, f.starter.id, { overall: 3 }), "EVENT_NOT_ACTIVE");
    expect(await rows(f, "fairRatings")).toHaveLength(0);
    expect(await rows(f, "fairVisitors")).toHaveLength(0);
    await f.t.run(async (ctx) => ctx.db.patch(f.eventId, { status: "live" }));

    for (let i = 0; i < 20; i++) await rate(f, v1, f.starter.id, { overall: (i % 5) + 1 });
    await expectCode(rate(f, v1, f.starter.id, { overall: 1 }), "RATE_LIMITED");
    // Another visitor behind the same NAT is not throttled.
    expect(await rate(f, visitor(), f.starter.id, { overall: 2 })).toEqual({ mode: "overall", overall: 2 });
  });
});

describe("feature without entitlement → stable code, no partial write (HANDOFF §12)", () => {
  test("included model: rating, question, survey and sponsored result are refused", async () => {
    const f = await setup();
    const v1 = visitor();
    await expectCode(rate(f, v1, f.included.id, { overall: 4 }), "FEATURE_NOT_ENTITLED");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { eventModelId: f.included.id, eventDayId: f.day1, prompt: "TEST", options: options("a", "b"), sortOrder: 1 }), "FAIR_FEATURE_NOT_ENTITLED");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.starter.id, questions: [{ id: "q1", prompt: "TEST", kind: "yes_no", options: [], required: false, order: 1 }] }), "FAIR_FEATURE_NOT_ENTITLED");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.starter.id, questionId: null }), "FAIR_FEATURE_NOT_ENTITLED");

    // A survey row that somehow sits on a Starter model still cannot be answered.
    const surveyId = await f.t.run(async (ctx) => ctx.db.insert("fairSurveys", {
      eventId: f.eventId, eventModelId: f.starter.id, status: "published", version: 1, createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING,
      questions: [{ id: "q1", prompt: "TEST", kind: "yes_no", options: [], required: false, order: 1 }],
    }));
    await expectCode(f.t.mutation(api.fairInteractions.submitSurvey, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, surveyId, submissionId: "test-submission-1", answers: [{ questionId: "q1", value: "yes" }] }), "FEATURE_NOT_ENTITLED");

    for (const table of ["fairRatings", "fairAudienceQuestions", "fairSurveyResponses", "fairVisitors", "fairMetricCountShards"] as const) {
      expect(await rows(f, table)).toHaveLength(0);
    }
  });
});

describe("Glas publike (HANDOFF §5.3, §10; MASTER §9.1)", () => {
  test("daily publish limit: Starter 1, Advanced 5; an upgrade mid-day lifts the day to 5 including the Starter question", async () => {
    const f = await setup();
    vi.setSystemTime(DAY1);
    const q1 = await question(f, f.starter.id, f.day1, 1);
    const q2 = await question(f, f.starter.id, f.day1, 2);
    expect(await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: q1 })).toEqual({ status: "published", remainingForDay: 0 });
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: q2 }), "FAIR_QUESTION_DAY_LIMIT");
    // Another day has its own allowance; closing does not free a slot.
    const other = await question(f, f.starter.id, f.day2, 1);
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: other });
    await f.admin.mutation(api.fairInteractionsAdmin.closeAudienceQuestion, { questionId: q1 });
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: q2 }), "FAIR_QUESTION_DAY_LIMIT");

    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.starter.id, toTier: "advanced" });
    const more = [q2, await question(f, f.starter.id, f.day1, 3), await question(f, f.starter.id, f.day1, 4), await question(f, f.starter.id, f.day1, 5)];
    const remaining = [];
    for (const id of more) remaining.push((await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: id })).remainingForDay);
    expect(remaining).toEqual([3, 2, 1, 0]);
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: await question(f, f.starter.id, f.day1, 6) }), "FAIR_QUESTION_DAY_LIMIT");
  });

  test("question validation: 2–5 options with unique ids, day of the same event, admin only", async () => {
    const f = await setup();
    const base = { eventModelId: f.advanced.id, eventDayId: f.day1, prompt: "TEST pitanje", sortOrder: 1 };
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...base, options: options("a") }), "INVALID_INPUT");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...base, options: options("a", "b", "c", "d", "e", "f") }), "INVALID_INPUT");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...base, options: options("a", "a") }), "INVALID_INPUT");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...base, prompt: "  ", options: options("a", "b") }), "INVALID_INPUT");
    await expect(f.member.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...base, options: options("a", "b") })).rejects.toThrow();
    const { questionId, result } = await f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...base, externalKey: "test-q-1", options: options("a", "b") });
    expect(result).toBe("created");
    expect(await f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...base, externalKey: "test-q-1", options: options("a", "b") })).toEqual({ questionId, result: "unchanged" });
    expect(await rows(f, "fairAudienceQuestions")).toHaveLength(1);
  });

  test("one changeable vote: the counter moves from the old to the new option and the voter total stays", async () => {
    const f = await setup();
    vi.setSystemTime(DAY1);
    const q = await question(f, f.advanced.id, f.day1, 1);
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: q });
    const v1 = visitor();
    await vote(f, v1, q, "a");
    await vote(f, visitor(), q, "a");
    await vote(f, v1, q, "b");
    await vote(f, v1, q, "b");
    const s = (await summary(f, f.advanced.id)).questions[0];
    expect(s).toEqual({ questionId: q, total: 2, options: [{ optionId: "a", count: 1 }, { optionId: "b", count: 1 }, { optionId: "c", count: 0 }] });
    expect(await rows(f, "fairAudienceVotes")).toHaveLength(2);
  });

  test("results stay hidden below 5 votes (own answer kept), then whole percentages that sum to 100", async () => {
    const f = await setup();
    vi.setSystemTime(DAY1);
    const q = await question(f, f.advanced.id, f.day1, 1);
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: q });
    const me = visitor();
    expect(await vote(f, me, q, "c")).toEqual({ questionId: q, state: "waiting_for_minimum", myOptionId: "c" });
    for (const optionId of ["a", "a", "b"]) await vote(f, visitor(), q, optionId);
    expect(await f.t.query(api.fairPublic.getAudienceQuestionResult, { questionId: q })).toEqual({ questionId: q, state: "waiting_for_minimum" });
    expect((await myState(f, me, f.advanced.id)).audience).toEqual([{ questionId: q, state: "waiting_for_minimum", myOptionId: "c" }]);
    const fifth = await vote(f, visitor(), q, "b");
    expect(fifth).toMatchObject({ state: "public" });
    const result = await f.t.query(api.fairPublic.getAudienceQuestionResult, { questionId: q });
    expect(result).toEqual({ questionId: q, state: "public", options: [{ optionId: "a", percentage: 40 }, { optionId: "b", percentage: 40 }, { optionId: "c", percentage: 20 }] });
    expect((await myState(f, me, f.advanced.id)).audience).toEqual([{ ...result, myOptionId: "c" }]);
    expect(fairWholePercentages([1, 1, 1])).toEqual([34, 33, 33]);
    expect(fairWholePercentages([2, 1, 0, 4]).reduce((a, b) => a + b, 0)).toBe(100);
  });

  test("after the first vote prompt and options are immutable; a new meaning is a new question starting from zero", async () => {
    const f = await setup();
    vi.setSystemTime(DAY1);
    const q = await question(f, f.advanced.id, f.day1, 1);
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: q });
    // Before any vote the published text may still be corrected.
    await f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { questionId: q, eventModelId: f.advanced.id, eventDayId: f.day1, prompt: "TEST ispravka", options: options("a", "b", "c"), sortOrder: 1 });
    await vote(f, visitor(), q, "a");
    const edit = { questionId: q, eventModelId: f.advanced.id, eventDayId: f.day1, sortOrder: 1 };
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...edit, prompt: "TEST novo značenje", options: options("a", "b", "c") }), "FAIR_QUESTION_LOCKED");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...edit, prompt: "TEST ispravka", options: options("a", "b") }), "FAIR_QUESTION_LOCKED");
    expect((await f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { ...edit, prompt: "TEST ispravka", options: options("a", "b", "c"), sortOrder: 2 })).result).toBe("updated");
    const fresh = await question(f, f.advanced.id, f.day1, 3, { prompt: "TEST novo značenje" });
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: fresh });
    expect(fresh).not.toBe(q);
    expect((await summary(f, f.advanced.id)).questions.find((row) => row.questionId === fresh)?.total).toBe(0);
  });

  test("votes only inside an open question: draft, closed, outside the day window and unknown options refuse", async () => {
    const f = await setup();
    const q = await question(f, f.advanced.id, f.day1, 1);
    vi.setSystemTime(DAY1);
    await expectCode(vote(f, visitor(), q, "a"), "QUESTION_NOT_OPEN");
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: q });
    await expectCode(vote(f, visitor(), q, "x"), "INVALID_INPUT");
    vi.setSystemTime(DAY2);
    await expectCode(vote(f, visitor(), q, "a"), "QUESTION_NOT_OPEN");
    vi.setSystemTime(DAY1);
    await f.admin.mutation(api.fairInteractionsAdmin.closeAudienceQuestion, { questionId: q });
    await expectCode(vote(f, visitor(), q, "a"), "QUESTION_NOT_OPEN");
    expect(await rows(f, "fairAudienceVotes")).toHaveLength(0);
    expect(await rows(f, "fairVisitors")).toHaveLength(0);
    // The result of a closed question stays readable.
    expect(await f.t.query(api.fairPublic.getAudienceQuestionResult, { questionId: q })).toEqual({ questionId: q, state: "waiting_for_minimum" });
  });

  test("public list per day and the single sponsored-result question of an Advanced model", async () => {
    const f = await setup();
    const q1 = await question(f, f.advanced.id, f.day1, 2);
    const q0 = await question(f, f.advanced.id, f.day1, 1);
    const qd2 = await question(f, f.advanced.id, f.day2, 1);
    const draft = await question(f, f.advanced.id, f.day1, 3);
    for (const id of [q1, q0, qd2]) await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: id });
    const day1 = await f.t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: f.advanced.id, dateKey: "2026-10-09" });
    expect(day1.map((row) => row.id)).toEqual([q0, q1]);
    expect(day1[0]).toEqual({ id: q0, eventModelId: f.advanced.id, dateKey: "2026-10-09", prompt: "TEST pitanje 1", options: options("a", "b", "c"), order: 1 });
    expect((await f.t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: f.advanced.id })).map((row) => row.id)).toEqual([q0, q1, qd2]);
    expect(await f.t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: f.included.id })).toEqual([]);

    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.advanced.id, questionId: draft }), "FAIR_QUESTION_STATUS");
    await f.admin.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.advanced.id, questionId: q0 });
    await f.admin.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.advanced.id, questionId: qd2 });
    const flagged = (await rows(f, "fairAudienceQuestions")).filter((row) => row.showOnSponsoredRotation).map((row) => row._id);
    expect(flagged).toEqual([qd2]);
    await f.admin.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.advanced.id, questionId: null });
    expect((await rows(f, "fairAudienceQuestions")).some((row) => row.showOnSponsoredRotation)).toBe(false);
  });
});

describe("survey (HANDOFF §5.3; MASTER §9.2)", () => {
  const yesNo = (id: string, order: number, required = false) => ({ id, prompt: `TEST ${id}`, kind: "yes_no" as const, options: [], required, order });
  const choice = (id: string, order: number) => ({ id, prompt: `TEST ${id}`, kind: "single_choice" as const, options: options("x", "y"), required: false, order });

  async function published(f: Fixture) {
    const { surveyId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: [yesNo("q1", 1), choice("q2", 2)] });
    await f.admin.mutation(api.fairInteractionsAdmin.publishSurvey, { surveyId });
    return surveyId;
  }
  const submit = (f: Fixture, visitorHash: string, surveyId: string, submissionId: string, answers: Array<{ questionId: string; value: string }>) =>
    f.t.mutation(api.fairInteractions.submitSurvey, { gatewaySecret: GATEWAY_SECRET, visitorHash, surveyId, submissionId, answers });

  test("Advanced only, at most 5 yes_no/single_choice questions; yes_no carries no options", async () => {
    const f = await setup();
    const six = [1, 2, 3, 4, 5, 6].map((n) => yesNo(`q${n}`, n));
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: six }), "FAIR_SURVEY_INVALID");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: [] }), "FAIR_SURVEY_INVALID");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: [{ ...yesNo("q1", 1), options: options("a", "b") }] }), "FAIR_SURVEY_INVALID");
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: [{ ...choice("q1", 1), options: options("a") }] }), "FAIR_SURVEY_INVALID");
    const surveyId = await published(f);
    const view = await f.t.query(api.fairPublic.getSurveyForModel, { eventModelId: f.advanced.id });
    expect(view).toEqual({ surveyId, eventModelId: f.advanced.id, version: 1, questions: [{ id: "q1", prompt: "TEST q1", kind: "yes_no", options: [], order: 1 }, { id: "q2", prompt: "TEST q2", kind: "single_choice", options: options("x", "y"), order: 2 }] });
    expect(await f.t.query(api.fairPublic.getSurveyForModel, { eventModelId: f.starter.id })).toBeNull();
  });

  test("submit needs ≥1 valid answer; idempotent by submissionId; one final response per visitor and model", async () => {
    const f = await setup();
    const surveyId = await published(f);
    const me = visitor();
    for (const answers of [[], [{ questionId: "q1", value: "maybe" }], [{ questionId: "q2", value: "z" }], [{ questionId: "q9", value: "yes" }], [{ questionId: "q1", value: "yes" }, { questionId: "q1", value: "no" }]]) {
      await expectCode(submit(f, me, surveyId, "test-sub-bad", answers), "INVALID_INPUT");
    }
    await expectCode(submit(f, me, surveyId, "x", [{ questionId: "q1", value: "yes" }]), "INVALID_INPUT");
    expect(await rows(f, "fairVisitors")).toHaveLength(0);

    const first = await submit(f, me, surveyId, "test-sub-0001", [{ questionId: "q1", value: "yes" }]);
    expect(first).toMatchObject({ surveyId, version: 1, duplicate: false });
    expect(await submit(f, me, surveyId, "test-sub-0001", [{ questionId: "q1", value: "no" }])).toEqual({ ...first, duplicate: true });
    await expectCode(submit(f, visitor(), surveyId, "test-sub-0001", [{ questionId: "q1", value: "yes" }]), "SUBMISSION_DUPLICATE");
    await expectCode(submit(f, me, surveyId, "test-sub-0002", [{ questionId: "q2", value: "x" }]), "SURVEY_ALREADY_SUBMITTED");
    expect((await rows(f, "fairSurveyResponses")).map((row) => row.answers)).toEqual([[{ questionId: "q1", value: "yes" }]]);
    expect((await myState(f, me, f.advanced.id)).survey).toEqual({ state: "submitted", surveyId, version: 1, submittedAt: first.submittedAt });
    expect((await myState(f, visitor(), f.advanced.id)).survey).toEqual({ state: "open", surveyId, version: 1 });

    // A new version does not reopen the survey for a visitor who already sent one.
    const { surveyId: v2 } = await f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: [yesNo("q1", 1)] });
    await f.admin.mutation(api.fairInteractionsAdmin.publishSurvey, { surveyId: v2 });
    await expectCode(submit(f, me, v2, "test-sub-0003", [{ questionId: "q1", value: "no" }]), "SURVEY_ALREADY_SUBMITTED");
    await expectCode(submit(f, visitor(), surveyId, "test-sub-0004", [{ questionId: "q1", value: "no" }]), "SURVEY_NOT_OPEN");
  });

  test("a published version is never edited in place: a new structure is a new version and retires the old one", async () => {
    const f = await setup();
    const surveyId = await published(f);
    await expectCode(f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, surveyId, questions: [yesNo("q1", 1)] }), "FAIR_SURVEY_LOCKED");
    const draft = await f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: [yesNo("q1", 1)] });
    expect(draft).toMatchObject({ version: 2, result: "created" });
    expect(await f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: [yesNo("q1", 1), yesNo("q2", 2)] })).toMatchObject({ surveyId: draft.surveyId, version: 2, result: "updated" });
    expect(await f.admin.mutation(api.fairInteractionsAdmin.publishSurvey, { surveyId: draft.surveyId })).toEqual({ status: "published", retiredSurveyIds: [surveyId] });
    const stored = await rows(f, "fairSurveys");
    expect(stored.map((row) => [row.version, row.status])).toEqual([[1, "retired"], [2, "published"]]);
    expect(stored[0].questions.map((row) => row.id)).toEqual(["q1", "q2"]);
  });

  test("a required question must be answered", async () => {
    const f = await setup();
    const { surveyId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: [yesNo("q1", 1, true), yesNo("q2", 2)] });
    await f.admin.mutation(api.fairInteractionsAdmin.publishSurvey, { surveyId });
    await expectCode(submit(f, visitor(), surveyId, "test-sub-req-1", [{ questionId: "q2", value: "yes" }]), "INVALID_INPUT");
    expect(await submit(f, visitor(), surveyId, "test-sub-req-2", [{ questionId: "q1", value: "no" }])).toMatchObject({ duplicate: false });
  });
});

describe("brand passport (HANDOFF §5.5; MASTER §11; JOVAN-DELTA §3)", () => {
  const publish = (f: Fixture, passportId: Id<"fairPassportConfigs">) => f.admin.mutation(api.fairInteractionsAdmin.publishPassport, { passportId });
  const open = async (f: Fixture, brandId: Id<"brands">) => (await f.admin.mutation(api.fairInteractionsAdmin.upsertPassport, { eventId: f.eventId, brandId })).passportId;
  const favorite = (f: Fixture, visitorHash: string, passportId: string, eventModelId: string) =>
    f.t.mutation(api.fairInteractions.upsertBrandFavorite, { gatewaySecret: GATEWAY_SECRET, visitorHash, passportId, eventModelId });

  test("publish needs ≥2 exhibited models, all published Starter+ candidates, and must happen before opening", async () => {
    const f = await setup();
    expect(await f.admin.mutation(api.fairInteractionsAdmin.upsertPassport, { eventId: f.eventId, brandId: f.brands.om })).toMatchObject({ result: "created", problem: "model_below_starter" });
    await expectCode(publish(f, await open(f, f.brands.om)), "FAIR_PASSPORT_NOT_ELIGIBLE");
    await expectCode(publish(f, await open(f, f.brands.solo)), "FAIR_PASSPORT_NOT_ELIGIBLE");
    const volta = await open(f, f.brands.volta);
    vi.setSystemTime(DAY1);
    await expectCode(publish(f, volta), "FAIR_PASSPORT_EVENT_STARTED");
    vi.setSystemTime(BEFORE_OPENING);
    expect(await publish(f, volta)).toEqual({ status: "published", requiredModelIds: [f.starter.id, f.advanced.id] });
    // Frozen: a model added later is not part of the set.
    await f.model("test-volta-x3", f.brands.volta, "starter");
    expect(await publish(f, volta)).toEqual({ status: "published", requiredModelIds: [f.starter.id, f.advanced.id] });
    expect((await rows(f, "fairPassportEligibleModels")).map((row) => row.eventModelId)).toEqual([f.starter.id, f.advanced.id]);
    await expect(f.member.mutation(api.fairInteractionsAdmin.publishPassport, { passportId: volta })).rejects.toThrow();
  });

  test("scan stamps idempotently; favorite only after completion; changeable; result public from 5 favorites", async () => {
    const f = await setup();
    const passportId = await open(f, f.brands.volta);
    vi.setSystemTime(BEFORE_OPENING - 60_000);
    const early = visitor();
    await scan(f, f.starter.code, early);
    expect(await rows(f, "fairPassportStamps")).toHaveLength(0);
    vi.setSystemTime(BEFORE_OPENING);
    await publish(f, passportId);
    vi.setSystemTime(DAY1);

    const me = visitor();
    const catalog = await f.t.query(api.fairPublic.getPassportCatalog, { eventSlug: "test-elektromobilnost-2026" });
    expect(catalog).toEqual({
      eventId: f.eventId,
      catalog: [{
        passportId, eventId: f.eventId, brandId: f.brands.volta, brandName: "TEST Volta", standMapLocationIds: ["ispred-14"],
        models: [
          { eventModelId: f.starter.id, slug: expect.any(String), displayName: "TEST test-volta-x1" },
          { eventModelId: f.advanced.id, slug: expect.any(String), displayName: "TEST test-volta-x2" },
        ],
      }],
    });
    const progress = async (hash: string) => (await f.t.query(api.fairInteractions.getMyPassportProgress, { gatewaySecret: GATEWAY_SECRET, visitorHash: hash, eventSlug: "test-elektromobilnost-2026" }))!.progress[0];
    expect(await progress(me)).toEqual({ passportId, stampedModelIds: [], stampedCount: 0, requiredCount: 2, completed: false });

    await scan(f, f.starter.code, me);
    await scan(f, f.starter.code, me);
    expect(await progress(me)).toMatchObject({ stampedCount: 1, requiredCount: 2, completed: false });
    await expectCode(favorite(f, me, passportId, f.starter.id), "PASSPORT_NOT_COMPLETE");
    await expectCode(favorite(f, visitor(), passportId, f.starter.id), "PASSPORT_NOT_COMPLETE");
    expect(await rows(f, "fairBrandFavoriteVotes")).toHaveLength(0);

    await scan(f, f.advanced.code, me);
    expect(await rows(f, "fairPassportStamps")).toHaveLength(2);
    await expectCode(favorite(f, me, passportId, f.included.id), "INVALID_INPUT");
    expect(await favorite(f, me, passportId, f.starter.id)).toEqual({
      passportId, stampedModelIds: [f.starter.id, f.advanced.id], stampedCount: 2, requiredCount: 2, completed: true,
      favoriteModelId: f.starter.id, favoriteResult: { state: "waiting_for_minimum" },
    });
    expect(await favorite(f, me, passportId, f.advanced.id)).toMatchObject({ favoriteModelId: f.advanced.id });
    expect(await rows(f, "fairBrandFavoriteVotes")).toHaveLength(1);

    for (const choice of [f.advanced.id, f.starter.id, f.advanced.id]) {
      const other = visitor();
      await scan(f, f.starter.code, other);
      await scan(f, f.advanced.code, other);
      await favorite(f, other, passportId, choice);
    }
    expect((await myState(f, me, f.starter.id)).passport?.favoriteResult).toEqual({ state: "waiting_for_minimum" });
    const fifth = visitor();
    await scan(f, f.starter.code, fifth);
    await scan(f, f.advanced.code, fifth);
    expect((await favorite(f, fifth, passportId, f.starter.id)).favoriteResult).toEqual({
      state: "public", options: [{ eventModelId: f.starter.id, percentage: 40 }, { eventModelId: f.advanced.id, percentage: 60 }],
    });
  });

  test("emergency removal keeps earned stamps; M shrinks; a withdrawn passport refuses favorites", async () => {
    const f = await setup();
    const passportId = await open(f, f.brands.volta);
    await publish(f, passportId);
    vi.setSystemTime(DAY1);
    const me = visitor();
    await scan(f, f.advanced.code, me);
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.starter.id });
    expect(await f.admin.mutation(api.fairInteractionsAdmin.removePassportModel, { passportId, eventModelId: f.starter.id })).toEqual({ status: "removed", requiredCount: 1 });
    const state = await myState(f, me, f.advanced.id);
    expect(state.passport).toMatchObject({ stampedModelIds: [f.advanced.id], stampedCount: 1, requiredCount: 1, completed: true });
    expect(await rows(f, "fairPassportStamps")).toHaveLength(1);
    await favorite(f, me, passportId, f.advanced.id);
    await f.admin.mutation(api.fairInteractionsAdmin.withdrawPassport, { passportId });
    await expectCode(favorite(f, me, passportId, f.advanced.id), "PASSPORT_NOT_ACTIVE");
    expect(await rows(f, "fairBrandFavoriteVotes")).toHaveLength(1);
    expect((await f.t.query(api.fairPublic.getPassportCatalog, { eventSlug: "test-elektromobilnost-2026" }))!.catalog).toEqual([]);
  });
});

describe("no public function returns rating aggregates or another visitor's state (JOVAN-DELTA §1)", () => {
  test("every public read and the visitor projections carry no count/sum/average of ratings", async () => {
    const f = await setup();
    const passportId = (await f.admin.mutation(api.fairInteractionsAdmin.upsertPassport, { eventId: f.eventId, brandId: f.brands.volta })).passportId;
    await f.admin.mutation(api.fairInteractionsAdmin.publishPassport, { passportId });
    vi.setSystemTime(DAY1);
    const q = await question(f, f.advanced.id, f.day1, 1);
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: q });
    const { surveyId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, { eventModelId: f.advanced.id, questions: [{ id: "q1", prompt: "TEST", kind: "yes_no", options: [], required: false, order: 1 }] });
    await f.admin.mutation(api.fairInteractionsAdmin.publishSurvey, { surveyId });
    const others = Array.from({ length: 7 }, visitor);
    for (const hash of others) {
      await rate(f, hash, f.starter.id, { overall: 5 });
      await rate(f, hash, f.advanced.id, { appearance: 5, specifications: 4, price: 3 });
      await vote(f, hash, q, "a");
    }
    const me = visitor();
    const slug = "test-elektromobilnost-2026";
    const modelSlug = (await rows(f, "fairEventModels")).find((row) => row._id === f.advanced.id)!.slug;
    const outputs = [
      await f.t.query(api.fairPublic.getEventBySlug, { slug }),
      await f.t.query(api.fairPublic.getModelBySlug, { eventSlug: slug, modelSlug }),
      await f.t.query(api.fairPublic.getModelsByIds, { ids: [f.starter.id, f.advanced.id] }),
      await f.t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: f.advanced.id }),
      await f.t.query(api.fairPublic.getAudienceQuestionResult, { questionId: q }),
      await f.t.query(api.fairPublic.getSurveyForModel, { eventModelId: f.advanced.id }),
      await f.t.query(api.fairPublic.getPassportCatalog, { eventSlug: slug }),
      await myState(f, me, f.starter.id),
      await myState(f, me, f.advanced.id),
      await f.t.query(api.fairInteractions.getMyPassportProgress, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventSlug: slug }),
    ];
    const keys = new Set<string>();
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { keys.add(key); walk(child); }
    };
    outputs.forEach(walk);
    for (const key of keys) expect(key).not.toMatch(/sum|average|avg|mean|total|ratingCount|^count$|votes/i);
    // The visitor who rated nothing sees no rating values at all (no one else's).
    expect(outputs[7]).toMatchObject({ rating: { mode: "overall" }, audience: [] });
    expect((outputs[7] as FairMyModelState).rating).toEqual({ mode: "overall" });
    expect((outputs[8] as FairMyModelState).rating).toEqual({ mode: "dimensions" });
    // Nothing above holds a visitor hash.
    expect(JSON.stringify(outputs)).not.toContain(others[0]);
  });

  test("view validators equal the lib/fair-contract types", () => {
    expectTypeOf<Infer<typeof fairRatingStateView>>().toEqualTypeOf<FairRatingState>();
    expectTypeOf<Infer<typeof fairAudienceQuestionView>>().toEqualTypeOf<FairAudienceQuestionView>();
    expectTypeOf<Infer<typeof fairAudienceResultView>>().toEqualTypeOf<FairAudienceResultView>();
    expectTypeOf<Infer<typeof fairSurveyView>>().toEqualTypeOf<FairSurveyView>();
    expectTypeOf<Infer<typeof fairPassportStateView>>().toEqualTypeOf<FairPassportState>();
    expectTypeOf<Infer<typeof fairMyModelStateView>>().toEqualTypeOf<FairMyModelState>();
  });
});
