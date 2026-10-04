/// <reference types="vite/client" />

// Sajam 2026 B7 — read limits and rate limits on a larger seed (BACKEND-HANDOFF
// §9, §11 B7 "performance/read-limit pregled", §12 "query pagination/cap
// ponašanje na većem seed-u"). The large catalog is the realistic upper bound
// of one fair: all 100 printed QR identities on one event (25 brands × 4
// models, 25 Advanced in the snapshot, 10 passports, 170 questions). Every hot
// public read must answer completely within its caps; the abuse limits are
// checked with the exact numbers documented in convex/lib/rateLimits.ts and
// lib/fair-contract.ts.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT, FAIR_LEAD_RECIPIENT_WINDOW_MS, FAIR_MAX_MODEL_IDS_PER_READ, FAIR_PII_PURGE_AT_MS } from "../lib/fair-contract";
import { fairAudienceVoteKey, fairFavoriteKey } from "./lib/fairInteractions";
import { fairSponsoredSeed } from "./lib/fairSponsored";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-09T12:00:00+02:00");
const ADMIN_EMAIL = "fair-b7-perf@scanme.test";
const ISSUER = "https://fair-b7-perf.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const SLUG = "test-perf-2026";

// K1: a TEST gateway secret (not a real value), set as the Convex env in beforeEach.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);

/** 25 brands × 4 models on one event; brands 0–9 are all Starter+ (passports). */
async function largeFair() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const me = visitor();
  const ids = await t.run(async (ctx) => {
    const now = NOW - 86_400_000;
    const eventId = await ctx.db.insert("fairEvents", {
      code: SLUG, slug: SLUG, title: "TEST veliki sajam", venueName: "TEST hala", timezone: "Europe/Belgrade",
      startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status: "published",
      garagePriority: 1, piiPurgeAt: FAIR_PII_PURGE_AT_MS, minimumPublicVoteCount: 5, robotsIndexable: false, createdAt: now, updatedAt: now,
    });
    const dayId = await ctx.db.insert("fairEventDays", { eventId, dateKey: "2026-10-09", label: "TEST dan 1", startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-10T00:00:00+02:00"), sortOrder: 1 });
    const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: me, firstSeenAt: now, lastSeenAt: now });
    const models: Id<"fairEventModels">[] = [];
    const advanced: Id<"fairEventModels">[] = [];
    const flagged = new Map<Id<"fairEventModels">, Id<"fairAudienceQuestions">>();
    const passports: Id<"fairPassportConfigs">[] = [];
    for (let e = 0; e < 5; e += 1) {
      const accountId = await ctx.db.insert("accounts", { name: `TEST izlagač ${e}`, plan: "basic", status: "active", createdAt: now, updatedAt: now });
      const businessId = await ctx.db.insert("businesses", { accountId, name: `TEST izlagač ${e}`, slug: `test-perf-izlagac-${e}`, status: "active", createdAt: now });
      const participationId = await ctx.db.insert("fairParticipations", { externalKey: `test-perf-p${e}`, eventId, accountId, businessId, status: "active", createdAt: now, updatedAt: now });
      for (let b = e * 5; b < e * 5 + 5; b += 1) {
        const brandId = await ctx.db.insert("brands", { accountId, name: `TEST brend ${b}`, normalizedName: `test brend ${b}`, revision: "1", colors: [], createdAt: now, updatedAt: now });
        const standId = await ctx.db.insert("fairStands", { eventId, participationId, externalKey: `test-perf-s${b}`, code: `T${b}`, displayName: `TEST štand ${b}`, mapLocationId: `test-loc-${b}`, status: "active", createdAt: now, updatedAt: now });
        const brandModels: Id<"fairEventModels">[] = [];
        for (let m = 0; m < 4; m += 1) {
          const packageTier = m === 0 ? "advanced" : b < 10 || m === 1 ? "starter" : "included";
          const modelId = await ctx.db.insert("fairEventModels", {
            externalKey: `test-perf-m${b}-${m}`, eventId, participationId, brandId, standId, slug: `test-perf-m${b}-${m}`, displayName: `TEST model ${b}-${m}`,
            priceText: "TEST cena", specifications: [{ id: "s1", groupId: "g", groupLabel: "TEST", groupOrder: 1, label: "TEST", value: "TEST", order: 1, isHighlight: true }],
            packageTier, packageActivatedAt: now, passportEligible: true, status: "published", sortOrder: m, createdAt: now, updatedAt: now,
          });
          models.push(modelId);
          brandModels.push(modelId);
          const questionCount = packageTier === "advanced" ? 5 : packageTier === "starter" ? 1 : 0;
          for (let q = 0; q < questionCount; q += 1) {
            const questionId = await ctx.db.insert("fairAudienceQuestions", {
              eventId, eventDayId: dayId, eventModelId: modelId, externalKey: `test-perf-q${b}-${m}-${q}`, prompt: `TEST pitanje ${q}?`,
              options: [{ id: "da", label: "TEST da", order: 1 }, { id: "ne", label: "TEST ne", order: 2 }], status: "published", sortOrder: q,
              startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-10T00:00:00+02:00"), showOnSponsoredRotation: packageTier === "advanced" && q === 0, createdAt: now, updatedAt: now,
            });
            if (packageTier === "advanced" && q === 0) {
              flagged.set(modelId, questionId);
              await ctx.db.insert("fairMetricCountShards", { key: fairAudienceVoteKey(questionId, "da"), shard: 0, value: 7 });
              await ctx.db.insert("fairAudienceVotes", { visitorId, eventId, eventModelId: modelId, questionId, optionId: "da", createdAt: now, updatedAt: now });
            }
          }
          if (packageTier === "advanced") {
            advanced.push(modelId);
            await ctx.db.insert("fairSurveys", { eventId, eventModelId: modelId, status: "published", questions: [{ id: "q1", prompt: "TEST?", kind: "yes_no", options: [], required: false, order: 1 }], version: 1, createdAt: now, updatedAt: now });
          }
        }
        if (b < 10) {
          const passportId = await ctx.db.insert("fairPassportConfigs", { eventId, brandId, participationId, status: "published", frozenAt: now, publishedAt: now, createdAt: now, updatedAt: now });
          passports.push(passportId);
          for (const eventModelId of brandModels) {
            await ctx.db.insert("fairPassportEligibleModels", { passportConfigId: passportId, eventId, brandId, eventModelId, status: "required", createdAt: now });
            await ctx.db.insert("fairPassportStamps", { visitorId, eventId, brandId, eventModelId, scannedAt: now });
          }
          await ctx.db.insert("fairBrandFavoriteVotes", { visitorId, eventId, brandId, eventModelId: brandModels[0], createdAt: now, updatedAt: now });
          await ctx.db.insert("fairMetricCountShards", { key: fairFavoriteKey(passportId, brandModels[0]), shard: 0, value: 6 });
        }
      }
    }
    const snapshotId = await ctx.db.insert("fairSponsoredSnapshots", { eventId, version: 1, dayKey: "2026-10-09", seed: fairSponsoredSeed(eventId), status: "published", publishedAt: now });
    for (const [order, eventModelId] of advanced.entries()) {
      await ctx.db.insert("fairSponsoredSnapshotItems", { snapshotId, eventModelId, order, audienceQuestionId: flagged.get(eventModelId) });
    }
    return { eventId, models, advanced, passports };
  });
  return { t, me, ...ids };
}

describe("B7 hot public reads on the largest realistic fair (100 models)", () => {
  test("map, rotation, passport catalog and the visitor's passport answer completely within their caps", async () => {
    const f = await largeFair();
    const map = await f.t.query(api.fairPublic.getEventMap, { eventSlug: SLUG });
    expect(map!.stands).toHaveLength(25);
    expect(map!.stands.flatMap((stand) => stand.brands.flatMap((brand) => brand.models))).toHaveLength(100);

    const rotation = await f.t.query(api.fairPublic.getSponsoredMapRotation, { eventSlug: SLUG });
    expect(rotation!.items).toHaveLength(25);
    expect(rotation!.items.every((item) => item.audienceResult?.result.state === "public")).toBe(true);
    expect((await f.t.query(api.fairPublic.getSponsoredGarageRotation, { eventSlug: SLUG }))!.items).toHaveLength(25);

    const catalog = await f.t.query(api.fairPublic.getPassportCatalog, { eventSlug: SLUG });
    expect(catalog!.catalog).toHaveLength(10);
    expect(catalog!.catalog.every((entry) => entry.models.length === 4)).toBe(true);
    const mine = await f.t.query(api.fairInteractions.getMyPassportProgress, { gatewaySecret: GATEWAY_SECRET, visitorHash: f.me, eventSlug: SLUG });
    expect(mine!.progress).toHaveLength(10);
    expect(mine!.progress.every((row) => row.completed && row.stampedCount === 4 && row.requiredCount === 4 && row.favoriteResult?.state === "public")).toBe(true);

    const state = await f.t.query(api.fairInteractions.getMyModelState, { gatewaySecret: GATEWAY_SECRET, visitorHash: f.me, eventModelId: f.advanced[0] });
    expect(state.audience).toHaveLength(1);
    expect(state.passport).toMatchObject({ completed: true });
    expect(await f.t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: f.advanced[0], dateKey: "2026-10-09" })).toHaveLength(5);
  });

  test("garage reads are capped at 50 IDs; more is a stable INVALID_INPUT, not a long read", async () => {
    const f = await largeFair();
    const page = await f.t.query(api.fairPublic.getModelsByIds, { ids: f.models.slice(0, FAIR_MAX_MODEL_IDS_PER_READ) });
    expect(page).toHaveLength(FAIR_MAX_MODEL_IDS_PER_READ);
    expect(page.filter((model) => model.capabilities.isSponsored)).toHaveLength(13);
    await expect(f.t.query(api.fairPublic.getModelsByIds, { ids: f.models.slice(0, FAIR_MAX_MODEL_IDS_PER_READ + 1) })).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
  });
});

describe("B7 rate limits behind one hall NAT", () => {
  test("the generic per-IP cardResolve bucket admits 300 scans per minute from one NAT address, then refills 5 per second (§9.27)", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
    vi.setSystemTime(Date.parse("2026-10-05T10:00:00+02:00"));
    const seed = await t.mutation(internal.fairDevFixtures.seedIntegrationTest, {});
    vi.setSystemTime(Date.parse("2026-10-08T11:00:00+02:00"));
    const code = seed.qr.find((row) => row.modelExternalKey === "test-em26-volta-x1")!.resolverCode;
    const scan = (n: number) => t.mutation(api.cards.resolveAndRecord, { cardCode: code, requestId: `test-nat-${n}`, deviceCategory: "mobile", ipHash: "test-hall-nat", fairGatewaySecret: GATEWAY_SECRET, fairIpHash: "test-hall-nat", fairVisitorHash: visitor() });
    const outcomes: string[] = [];
    for (let n = 0; n < 300; n += 1) outcomes.push((await scan(n)).kind);
    expect(outcomes.every((kind) => kind === "fair_model")).toBe(true);
    expect(await scan(300)).toEqual({ kind: "rate_limited" });
    vi.advanceTimersByTime(1_000);
    for (let n = 301; n < 306; n += 1) expect((await scan(n)).kind).toBe("fair_model");
    expect(await scan(306)).toEqual({ kind: "rate_limited" });
    // Another NAT address (another phone network) is not affected.
    expect((await t.mutation(api.cards.resolveAndRecord, { cardCode: code, requestId: "test-nat-other", deviceCategory: "mobile", ipHash: "test-mobile-nat", fairGatewaySecret: GATEWAY_SECRET, fairIpHash: "test-mobile-nat", fairVisitorHash: visitor() })).kind).toBe("fair_model");
  }, 180_000);

  test("one address gets at most 10 lead confirmations an hour, however many visitor hashes ask; nothing is stored for a refused submit", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const adminId = await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
    vi.setSystemTime(Date.parse("2026-10-05T10:00:00+02:00"));
    await t.mutation(internal.fairDevFixtures.seedIntegrationTest, {});
    vi.setSystemTime(Date.parse("2026-10-08T11:00:00+02:00"));
    const admin = t.withIdentity({ subject: adminId, issuer: ISSUER });
    const { eventId, models } = await t.run(async (ctx) => {
      const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", "test-elektromobilnost-2026")).unique())!;
      const rows = await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id)).collect();
      return { eventId: event._id, models: rows.filter((row) => row.packageTier !== "included").map((row) => row._id) };
    });
    const { consentId } = await admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId, leadKind: "interest", text: "TEST saglasnost: ScanMe i {izlagac}." });
    await admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId });
    let n = 0;
    const submit = (email: string | undefined, phone?: string) =>
      t.mutation(api.fairLeads.submitLead, {
        gatewaySecret: GATEWAY_SECRET,
        visitorHash: visitor(), eventModelId: models[n % models.length], kind: "interest", submissionId: `test-cap-${++n}`, contactName: "TEST Žrtva",
        ...(email ? { email } : {}), ...(phone ? { phone } : {}), consentAccepted: true, consentVersion: 1,
      });
    for (let i = 0; i < FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT; i += 1) await submit(i % 2 ? "zrtva@example.invalid" : "Zrtva@Example.invalid");
    const before = await t.run(async (ctx) => ({ leads: (await ctx.db.query("fairLeads").collect()).length, visitors: (await ctx.db.query("fairVisitors").collect()).length }));
    await expect(submit("ZRTVA@example.invalid")).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });
    expect(await t.run(async (ctx) => ({ leads: (await ctx.db.query("fairLeads").collect()).length, visitors: (await ctx.db.query("fairVisitors").collect()).length }))).toEqual(before);
    // Other addresses and phone-only leads are unaffected; the window frees the address again.
    await submit("neko.drugi@example.invalid");
    await submit(undefined, "+381 60 000 0099");
    vi.advanceTimersByTime(FAIR_LEAD_RECIPIENT_WINDOW_MS);
    await submit("zrtva@example.invalid");
    const recipients = await t.run(async (ctx) => (await ctx.db.query("fairEmailDeliveries").collect()).filter((row) => row.kind === "immediate_confirmation").map((row) => row.recipient));
    expect(recipients.filter((row) => row === "zrtva@example.invalid")).toHaveLength(FAIR_LEAD_CONFIRMATIONS_PER_RECIPIENT + 1);
  }, 120_000);
});
