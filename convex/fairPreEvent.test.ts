/// <reference types="vite/client" />

// Pre-event access (JOVAN-DELTA 2026-10-08b): before the opening everything
// works (packages from their assignment, "Otvori odmah" for Glas publike,
// passports after the opening too), and what visitors did before the opening
// is left out of exhibitor numbers and removed by "Resetuj pre-event podatke".

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { readFairCount, fairScanCountKey } from "./lib/fairCountShards";
import { fairAudienceVoteKey, fairRatingCountKey } from "./lib/fairInteractions";
import { FAIR_PRE_EVENT_CATEGORIES } from "./fairPreEvent";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const OPENING = Date.parse("2026-10-09T00:00:00+02:00");
const BEFORE_OPENING = Date.parse("2026-10-08T12:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const ADMIN_EMAIL = "fair-pre-event@scanme.test";
const ISSUER = "https://fair-pre-event.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
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
    return { adminId, a: await client("TA", ["TEST Volta", "TEST Om"]), inventory: await client("TQ", []) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const [volta, om] = ids.a.brandIds;
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: OPENING, endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  const { dayId: day1 } = await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
    eventId, externalKey: "test-em-izlagac-a", accountId: ids.a.accountId, businessId: ids.a.businessId,
  });
  const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
    eventId, participationId, externalKey: "test-em-stand-a1", code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "ispred-14",
  });
  let qrSequence = 0;
  // Every paid package is imported as in b1-payload.json: package_active_from = the opening.
  const model = async (externalKey: string, brandId: Id<"brands">, packageTier: Tier) => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId, participationId, standId, brandId, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
      specifications: [spec(1), spec(2)], packageTier, passportEligible: true, packageActiveFrom: OPENING,
    });
    await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    const digitalQrId = await admin.mutation(api.adminProducts.createDigital, {
      accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key: `test-qr-pre-${++qrSequence}`,
    });
    const code = await t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(digitalQrId))!.channelId))!.resolverCode);
    await admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: code });
    return { id: modelId, code };
  };
  const starter = await model("test-volta-x1", volta, "starter");
  const advanced = await model("test-volta-x2", volta, "advanced");
  const included = await model("test-om-z1", om, "included");
  return { t, admin, ...ids, eventId, day1, participationId, standId, brands: { volta, om }, starter, advanced, included };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}
const count = (f: Fixture, key: string) => f.t.run(async (ctx) => readFairCount(ctx, key));

let requestSequence = 0;
const scan = (f: Fixture, code: string, visitorHash: string) =>
  f.t.mutation(api.cards.resolveAndRecord, {
    cardCode: code, requestId: `test-pre-request-${++requestSequence}`, deviceCategory: "mobile", ipHash: "test-hall-nat", fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash,
  });
const rate = (f: Fixture, visitorHash: string, eventModelId: string, values: { overall?: number; appearance?: number }) =>
  f.t.mutation(api.fairInteractions.upsertRating, { gatewaySecret: GATEWAY_SECRET, visitorHash, eventModelId, ...values });
const vote = (f: Fixture, visitorHash: string, questionId: string, optionId: string) =>
  f.t.mutation(api.fairInteractions.upsertAudienceVote, { gatewaySecret: GATEWAY_SECRET, visitorHash, questionId, optionId });
const question = async (f: Fixture, eventModelId: Id<"fairEventModels">, sortOrder: number) =>
  (await f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, { eventModelId, eventDayId: f.day1, prompt: `TEST pitanje ${sortOrder}`, options: options("a", "b"), sortOrder })).questionId;
const openNow = (f: Fixture, questionId: Id<"fairAudienceQuestions">) => f.admin.mutation(api.fairInteractionsAdmin.openAudienceQuestionNow, { questionId });

// -----------------------------------------------------------------------------

describe("pre-event access: nothing waits for the opening", () => {
  test("a package imported with package_active_from = opening is in force at once; tier rules still apply", async () => {
    const f = await setup();
    const models = await rows(f, "fairEventModels");
    expect(models.filter((row) => row.packageTier !== "included").every((row) => row.packageActivatedAt === BEFORE_OPENING)).toBe(true);
    expect((await rows(f, "fairPackageActivations")).every((row) => row.activatedAt === BEFORE_OPENING)).toBe(true);

    const v1 = visitor();
    expect(await rate(f, v1, f.starter.id, { overall: 4 })).toEqual({ mode: "overall", overall: 4 });
    expect(await rate(f, v1, f.advanced.id, { appearance: 5 })).toEqual({ mode: "dimensions", appearance: 5 });
    await expectCode(rate(f, v1, f.included.id, { overall: 4 }), "FEATURE_NOT_ENTITLED");
    await expectCode(rate(f, v1, f.starter.id, { appearance: 4 }), "INVALID_INPUT");

    const { surveyId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertSurveyDraft, {
      eventModelId: f.advanced.id, questions: [{ id: "q1", prompt: "TEST", kind: "yes_no", options: [], required: false, order: 1 }],
    });
    await f.admin.mutation(api.fairInteractionsAdmin.publishSurvey, { surveyId });
    expect(await f.t.mutation(api.fairInteractions.submitSurvey, { gatewaySecret: GATEWAY_SECRET, visitorHash: v1, surveyId, submissionId: "test-pre-survey-1", answers: [{ questionId: "q1", value: "yes" }] }))
      .toMatchObject({ duplicate: false });
  });

  test("Glas publike: \"Otvori odmah\" opens a question before its day, with the daily limit; the public list shows it", async () => {
    const f = await setup();
    const q1 = await question(f, f.starter.id, 1);
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId: q1 });
    await expectCode(vote(f, visitor(), q1, "a"), "QUESTION_NOT_OPEN");
    const list = (openAt?: number) => f.t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: f.starter.id, dateKey: "2026-10-08", ...(openAt ? { openAt } : {}) });
    expect(await list(Date.now())).toEqual([]);

    expect(await openNow(f, q1)).toEqual({ status: "published", startsAt: BEFORE_OPENING, remainingForDay: 0 });
    expect(await vote(f, visitor(), q1, "a")).toMatchObject({ myOptionId: "a" });
    expect((await list(Date.now())).map((row) => row.id)).toEqual([q1]);
    expect(await list()).toEqual([]);

    // Starter: one question per fair day, an early opening counts toward it.
    const q2 = await question(f, f.starter.id, 2);
    await expectCode(openNow(f, q2), "FAIR_QUESTION_DAY_LIMIT");
    // A draft opens directly; a closed question never reopens.
    const draft = await question(f, f.advanced.id, 1);
    expect(await openNow(f, draft)).toMatchObject({ status: "published", startsAt: BEFORE_OPENING });
    await f.admin.mutation(api.fairInteractionsAdmin.closeAudienceQuestion, { questionId: draft });
    await expectCode(openNow(f, draft), "FAIR_QUESTION_STATUS");
    await expectCode(question(f, f.included.id, 1), "FAIR_FEATURE_NOT_ENTITLED");
  });

  test("passports: published and stamped before the opening; created and published after it too", async () => {
    const f = await setup();
    const { passportId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertPassport, { eventId: f.eventId, brandId: f.brands.volta });
    expect(await f.admin.mutation(api.fairInteractionsAdmin.publishPassport, { passportId })).toMatchObject({ status: "published" });
    const v1 = visitor();
    await scan(f, f.starter.code, v1);
    expect(await rows(f, "fairPassportStamps")).toHaveLength(1);
    expect((await f.t.query(api.fairPublic.getPassportCatalog, { eventSlug: "test-elektromobilnost-2026" }))).toMatchObject({ catalog: [expect.objectContaining({ passportId })] });

    // After the opening a brand without a passport still gets one.
    await f.t.run(async (ctx) => {
      for (const row of await ctx.db.query("fairPassportEligibleModels").collect()) await ctx.db.delete(row._id);
      for (const row of await ctx.db.query("fairPassportStamps").collect()) await ctx.db.delete(row._id);
      await ctx.db.delete(passportId);
    });
    vi.setSystemTime(DAY1);
    expect(await f.admin.mutation(api.fairPassports.refreshPassports, { eventId: f.eventId })).toMatchObject({ created: 1, frozen: 0 });
  });

  test("an existing catalog with packages from the opening is aligned to now; a re-run moves nothing", async () => {
    const f = await setup();
    await f.t.run(async (ctx) => {
      for (const model of await ctx.db.query("fairEventModels").collect()) if (model.packageTier !== "included") await ctx.db.patch(model._id, { packageActivatedAt: OPENING });
      for (const row of await ctx.db.query("fairPackageActivations").collect()) await ctx.db.patch(row._id, { activatedAt: OPENING });
    });
    await expectCode(rate(f, visitor(), f.starter.id, { overall: 4 }), "FEATURE_NOT_ENTITLED");
    expect(await f.t.mutation(internal.fairPreEvent.alignFuturePackageActivations, { dryRun: true })).toEqual({ models: ["test-volta-x1", "test-volta-x2"], activationsMoved: 2 });
    await expectCode(rate(f, visitor(), f.starter.id, { overall: 4 }), "FEATURE_NOT_ENTITLED");
    expect(await f.t.mutation(internal.fairPreEvent.alignFuturePackageActivations, { dryRun: false, eventCode: "test-elektromobilnost-2026" })).toMatchObject({ activationsMoved: 2 });
    expect(await rate(f, visitor(), f.starter.id, { overall: 4 })).toEqual({ mode: "overall", overall: 4 });
    expect(await f.t.mutation(internal.fairPreEvent.alignFuturePackageActivations, { dryRun: false })).toEqual({ models: [], activationsMoved: 0 });
  });
});

describe("Resetuj pre-event podatke", () => {
  test("dry run, typed confirmation, stale check; deletes only pre-event rows and takes them out of the counters", async () => {
    const f = await setup();
    const { passportId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertPassport, { eventId: f.eventId, brandId: f.brands.volta });
    await f.admin.mutation(api.fairInteractionsAdmin.publishPassport, { passportId });
    const q1 = await question(f, f.advanced.id, 1);
    await openNow(f, q1);

    // Setup day: a tester scans both cars (passport complete), rates, votes, picks a favorite.
    const tester = visitor();
    await scan(f, f.starter.code, tester);
    await scan(f, f.advanced.code, tester);
    await rate(f, tester, f.starter.id, { overall: 2 });
    await vote(f, tester, q1, "a");
    await f.t.mutation(api.fairInteractions.upsertBrandFavorite, { gatewaySecret: GATEWAY_SECRET, visitorHash: tester, passportId, eventModelId: f.starter.id });

    // Fair day: a real visitor.
    vi.setSystemTime(DAY1);
    const real = visitor();
    await scan(f, f.starter.code, real);
    await rate(f, real, f.starter.id, { overall: 5 });
    await vote(f, real, q1, "b");

    const preview = await f.admin.query(api.fairPreEvent.previewPreEventReset, { eventId: f.eventId });
    expect(preview).toMatchObject({ cutoff: OPENING, total: 9, capped: false });
    expect(preview.counts).toMatchObject({ scan_events: 2, unique_scans: 2, passport_stamps: 2, ratings: 1, audience_votes: 1, brand_favorites: 1, leads: 0 });

    // Exhibitor-facing scan totals already skip the setup day.
    const reportStands = await f.t.run(async (ctx) => (await ctx.db.query("fairStands").collect()).map((row) => row._id));
    expect(await count(f, fairScanCountKey("scan_total", "stand", reportStands[0]))).toBe(3);

    await expectCode(f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, confirm: "da", expected: preview.counts }), "FAIR_PRE_EVENT_RESET_CONFIRM");
    await expectCode(f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, confirm: "RESETUJ", expected: { ...preview.counts, ratings: 0 } }), "FAIR_PRE_EVENT_RESET_STALE");
    expect(await f.admin.mutation(api.fairPreEvent.resetPreEventData, { eventId: f.eventId, confirm: "RESETUJ", expected: preview.counts })).toEqual({ deleted: 9, continuing: false });

    expect((await f.admin.query(api.fairPreEvent.previewPreEventReset, { eventId: f.eventId })).total).toBe(0);
    for (const category of FAIR_PRE_EVENT_CATEGORIES) expect(typeof preview.counts[category]).toBe("number");
    // Only the fair-day rows remain, and every counter equals them.
    expect(await rows(f, "fairScanEvents")).toHaveLength(1);
    expect(await rows(f, "fairRatings")).toMatchObject([{ overall: 5 }]);
    expect(await rows(f, "fairAudienceVotes")).toMatchObject([{ optionId: "b" }]);
    expect(await rows(f, "fairBrandFavoriteVotes")).toEqual([]);
    expect(await count(f, fairScanCountKey("scan_total", "model", f.starter.id))).toBe(1);
    expect(await count(f, fairScanCountKey("scan_unique", "model", f.starter.id))).toBe(1);
    expect(await count(f, fairScanCountKey("scan_total", "stand", reportStands[0]))).toBe(1);
    expect(await count(f, fairScanCountKey("scan_total", "model", f.advanced.id))).toBe(0);
    expect(await count(f, fairScanCountKey("scan_total", "model", f.starter.id, "2026-10-08"))).toBe(0);
    expect(await count(f, fairRatingCountKey("overall", f.starter.id))).toBe(1);
    expect(await count(f, fairAudienceVoteKey(q1, "a"))).toBe(0);
    expect(await count(f, fairAudienceVoteKey(q1, "b"))).toBe(1);
    // Catalog, passport and the question are untouched.
    expect(await rows(f, "fairPassportConfigs")).toHaveLength(1);
    expect(await rows(f, "fairAudienceQuestions")).toHaveLength(1);
    expect(await rows(f, "fairEventModels")).toHaveLength(3);
  });
});
