/// <reference types="vite/client" />

// Sajam 2026 K1 — the Next → Convex gateway secret (RF nalaz 1,
// FAIR-BACKEND-CONTRACT §27). Every public fair function that takes a
// `visitorHash` refuses a call without FAIR_GATEWAY_SECRET (missing, wrong, or
// not configured on the deployment) with a stable code and changes no row;
// `cards.resolveAndRecord` keeps the generic scan and redirect and silently
// skips the fair part; new identities are capped per caller-IP HMAC. Runs on
// the integration TEST seed; the secrets here are TEST values, not real ones.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import schema from "./schema";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
const SEED_AT = Date.parse("2026-10-05T10:00:00+02:00");
const REHEARSAL = Date.parse("2026-10-08T11:00:00+02:00");
const ADMIN_EMAIL = "fair-k1@scanme.test";
const ISSUER = "https://fair-k1.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
// K3: a TEST legal approval record (not a real review), required by every consent activation.
const TEST_LEGAL_APPROVAL = { legalApprovedBy: "TEST pravna provera", legalApprovedAt: Date.parse("2026-10-01T12:00:00+02:00") };
// Same length, last character differs — the constant-time compare must still refuse it.
const WRONG_SECRET = "test-fair-gateway-secret-0123456789abcdeX";
const EM = "test-elektromobilnost-2026";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  // K3: the lead switches are on in this TEST env (see convex/fairLeads.test.ts for off).
  process.env.FAIR_LEADS_ENABLED = "true";
  process.env.FAIR_FOLLOWUP_ENABLED = "true";
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
  vi.useFakeTimers();
  vi.setSystemTime(SEED_AT);
});
afterEach(() => {
  delete process.env.FAIR_LEADS_ENABLED;
  delete process.env.FAIR_FOLLOWUP_ENABLED;
  delete process.env.FAIR_GATEWAY_SECRET;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);
let sequence = 0;
const nextId = (prefix: string) => `test-k1-${prefix}-${++sequence}`;
// A fresh 64-hex share-code hash per call (sync 2026-10-05: fairSharing).
const nextCodeHash = () => (++sequence).toString(16).padStart(64, "0");

/**
 * The TEST seed at the rehearsal, with one TEST visitor `me` who scanned both
 * TEST Volta models (passport complete) and an active TEST consent, so every
 * protected call below WOULD succeed with the right secret.
 */
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const adminId = await t.run((ctx) => ctx.db.insert("users", { email: ADMIN_EMAIL }));
  const seed = await t.mutation(internal.fairDevFixtures.seedIntegrationTest, {});
  const admin = t.withIdentity({ subject: adminId, issuer: ISSUER });
  const model = (externalKey: string) => t.run(async (ctx) => {
    const event = (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EM)).unique())!;
    return (await ctx.db.query("fairEventModels").withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", event._id).eq("externalKey", externalKey)).unique())!;
  });
  const qr = (externalKey: string) => seed.qr.find((row) => row.modelExternalKey === externalKey)!;
  vi.setSystemTime(REHEARSAL);
  const voltaX1 = await model("test-em26-volta-x1"); // Advanced
  const voltaX2 = await model("test-em26-volta-x2"); // Starter
  const omZ1 = await model("test-em26-om-z1"); // Advanced, in the snapshot
  const me = visitor();
  for (const key of ["test-em26-volta-x1", "test-em26-volta-x2"]) {
    await t.mutation(api.cards.resolveAndRecord, {
      cardCode: qr(key).resolverCode, requestId: nextId("setup"), deviceCategory: "mobile", ipHash: "test-hall-nat",
      fairGatewaySecret: GATEWAY_SECRET, fairIpHash: "test-hall-nat", fairVisitorHash: me,
    });
  }
  const passport = await t.query(api.fairInteractions.getMyPassportProgress, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventSlug: EM });
  const passportId = passport!.catalog.find((entry) => entry.brandName === "TEST Volta")!.passportId;
  const [question] = await t.query(api.fairPublic.listAudienceQuestionsForModel, { eventModelId: voltaX1._id, dateKey: "2026-10-08" });
  const survey = await t.query(api.fairPublic.getSurveyForModel, { eventModelId: voltaX1._id });
  const { consentId } = await admin.mutation(api.fairLeadsAdmin.saveConsentDraft, { eventId: voltaX2.eventId, leadKind: "interest", text: "TEST saglasnost: ScanMe i {izlagac}." });
  await admin.mutation(api.fairLeadsAdmin.activateConsent, { consentId, ...TEST_LEGAL_APPROVAL });
  return { t, qr, me, voltaX1, voltaX2, omZ1, passportId, questionId: question.id, surveyId: survey!.surveyId };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

/** Every app table, as one string: equal before and after = no row changed. */
const dump = (f: Fixture) => f.t.run(async (ctx) => {
  const all: Record<string, unknown> = {};
  for (const table of Object.keys(schema.tables) as TableNames[]) all[table] = await ctx.db.query(table).collect();
  return JSON.stringify(all);
});

/** One call of each protected public function (2 queries, 8 mutations; fairSharing added at the 2026-10-05 sync). */
function protectedCalls(f: Fixture, gatewaySecret: string | undefined, visitorHash = f.me) {
  const auth = gatewaySecret === undefined ? {} : { gatewaySecret };
  const write = { ...auth, ipHash: "test-hall-nat", visitorHash };
  return {
    getMyModelState: () => f.t.query(api.fairInteractions.getMyModelState, { ...auth, visitorHash, eventModelId: f.voltaX1._id }),
    getMyPassportProgress: () => f.t.query(api.fairInteractions.getMyPassportProgress, { ...auth, visitorHash, eventSlug: EM }),
    upsertRating: () => f.t.mutation(api.fairInteractions.upsertRating, { ...write, eventModelId: f.voltaX1._id, appearance: 5 }),
    upsertAudienceVote: () => f.t.mutation(api.fairInteractions.upsertAudienceVote, { ...write, questionId: f.questionId, optionId: "test-da" }),
    submitSurvey: () => f.t.mutation(api.fairInteractions.submitSurvey, { ...write, surveyId: f.surveyId, submissionId: nextId("survey"), answers: [{ questionId: "test-preporuka", value: "yes" }] }),
    upsertBrandFavorite: () => f.t.mutation(api.fairInteractions.upsertBrandFavorite, { ...write, passportId: f.passportId, eventModelId: f.voltaX1._id }),
    recordSponsoredAction: () => f.t.mutation(api.fairInteractions.recordSponsoredAction, { ...write, eventModelId: f.omZ1._id, surface: "garage", kind: "open_model", requestId: nextId("sponsored") }),
    submitLead: () => f.t.mutation(api.fairLeads.submitLead, {
      ...write, eventModelId: f.voltaX2._id, kind: "interest", submissionId: nextId("lead"), contactName: "TEST Posetilac", email: "k1@example.invalid", consentAccepted: true, consentVersion: 1,
    }),
    createShareCollection: () => f.t.mutation(api.fairSharing.createShareCollection, {
      ...write, eventModelIds: [f.voltaX1._id, f.voltaX2._id], codeHash: nextCodeHash(), requestId: nextId("share"),
    }),
    recordTraffic: () => f.t.mutation(api.fairSharing.recordTraffic, { ...write, kind: "direct_view", requestId: nextId("traffic"), eventModelId: f.voltaX1._id }),
  };
}

describe("K1: every visitor-specific fair function requires FAIR_GATEWAY_SECRET", () => {
  test("without the secret, with a wrong or shortened one, and with none configured on Convex: a stable code and no row changes", async () => {
    const f = await setup();
    const scenarios: Array<{ env: string | undefined; sent: string | undefined; code: string }> = [
      { env: GATEWAY_SECRET, sent: undefined, code: "FAIR_GATEWAY_UNAUTHORIZED" },
      { env: GATEWAY_SECRET, sent: WRONG_SECRET, code: "FAIR_GATEWAY_UNAUTHORIZED" },
      { env: GATEWAY_SECRET, sent: GATEWAY_SECRET.slice(0, -1), code: "FAIR_GATEWAY_UNAUTHORIZED" },
      { env: GATEWAY_SECRET, sent: "", code: "FAIR_GATEWAY_UNAUTHORIZED" },
      // Fail closed: Convex without the env (or with a too short one) refuses even a matching value.
      { env: undefined, sent: GATEWAY_SECRET, code: "FAIR_GATEWAY_NOT_CONFIGURED" },
      { env: "", sent: "", code: "FAIR_GATEWAY_NOT_CONFIGURED" },
      { env: "test-too-short-secret", sent: "test-too-short-secret", code: "FAIR_GATEWAY_NOT_CONFIGURED" },
    ];
    for (const scenario of scenarios) {
      if (scenario.env === undefined) delete process.env.FAIR_GATEWAY_SECRET;
      else process.env.FAIR_GATEWAY_SECRET = scenario.env;
      const before = await dump(f);
      for (const visitorHash of [f.me, visitor()]) {
        for (const [name, call] of Object.entries(protectedCalls(f, scenario.sent, visitorHash))) {
          await expect(call(), `${name} ${scenario.code}`).rejects.toMatchObject({ data: { code: scenario.code } });
        }
      }
      expect(await dump(f)).toBe(before);
    }

    // Sanity: the same calls with the right secret succeed, so every refusal above came from the gateway check.
    process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
    const outputs: unknown[] = [];
    for (const call of Object.values(protectedCalls(f, GATEWAY_SECRET))) outputs.push(await call());
    expect(outputs).toHaveLength(10);
    expect(JSON.stringify(outputs)).not.toContain(GATEWAY_SECRET);
    expect(await dump(f)).not.toContain(GATEWAY_SECRET);
  }, 30_000); // many calls in one convex-test transaction log; 5 s is too tight on a loaded machine (as f37edac)

  test("the secret is checked before anything else: a malformed hash without it is still FAIR_GATEWAY_UNAUTHORIZED", async () => {
    const f = await setup();
    for (const call of Object.values(protectedCalls(f, undefined, "abc"))) {
      await expect(call()).rejects.toMatchObject({ data: { code: "FAIR_GATEWAY_UNAUTHORIZED" } });
    }
    for (const call of Object.values(protectedCalls(f, GATEWAY_SECRET, "abc"))) {
      await expect(call()).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    }
  }, 30_000); // many calls in one convex-test transaction log; 5 s is too tight on a loaded machine (as f37edac)
});

describe("K1: cards.resolveAndRecord without the secret", () => {
  test("records the generic event and redirects as before, but writes no fair scan, visitor, counter or stamp", async () => {
    const f = await setup();
    const code = f.qr("test-em26-volta-x1").resolverCode;
    const path = f.qr("test-em26-volta-x1").path;
    const fairState = () => f.t.run(async (ctx) => JSON.stringify({
      scans: await ctx.db.query("fairScanEvents").collect(),
      unique: await ctx.db.query("fairUniqueScans").collect(),
      visitors: await ctx.db.query("fairVisitors").collect(),
      stamps: await ctx.db.query("fairPassportStamps").collect(),
      counters: await ctx.db.query("fairMetricCountShards").collect(),
    }));
    const counts = () => f.t.query(internal.fairScans.modelScanCounts, { eventModelId: f.voltaX1._id });
    const before = await fairState();
    const countsBefore = await counts();
    const cases: Array<{ secret?: string; env?: string }> = [
      {},
      { secret: WRONG_SECRET },
      { secret: GATEWAY_SECRET, env: "unset" },
    ];
    for (const [index, item] of cases.entries()) {
      if (item.env === "unset") delete process.env.FAIR_GATEWAY_SECRET;
      const requestId = `test-k1-generic-${index}`;
      for (const visitorHash of [f.me, visitor()]) {
        const outcome = await f.t.mutation(api.cards.resolveAndRecord, {
          cardCode: code, requestId: `${requestId}-${visitorHash.slice(0, 6)}`, deviceCategory: "mobile", ipHash: "test-hall-nat",
          ...(item.secret ? { fairGatewaySecret: item.secret } : {}), fairIpHash: "test-hall-nat", fairVisitorHash: visitorHash,
        });
        expect(outcome).toEqual({ kind: "fair_model", path, fairScan: "gateway_rejected" });
        const generic = await f.t.run((ctx) => ctx.db.query("cardScanEvents").withIndex("by_requestId", (q) => q.eq("requestId", `${requestId}-${visitorHash.slice(0, 6)}`)).collect());
        expect(generic).toHaveLength(1);
      }
      process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
    }
    expect(await fairState()).toBe(before);
    expect(await counts()).toEqual(countsBefore);

    // The same scan through the real gateway (with the secret) counts again.
    const counted = await f.t.mutation(api.cards.resolveAndRecord, {
      cardCode: code, requestId: "test-k1-counted", deviceCategory: "mobile", ipHash: "test-hall-nat",
      fairGatewaySecret: GATEWAY_SECRET, fairIpHash: "test-hall-nat", fairVisitorHash: f.me,
    });
    expect(counted).toEqual({ kind: "fair_model", path, fairScan: "recorded" });
    expect((await counts())!.model.total).toBe(countsBefore!.model.total + 1);
    expect(JSON.stringify(counted)).not.toContain(GATEWAY_SECRET);
  }, 30_000); // many calls in one convex-test transaction log; 5 s is too tight on a loaded machine (as f37edac)
});

describe("K1: new identities per caller-IP HMAC (fairVisitorCreate: capacity 300, 120/min)", () => {
  test("one address mints at most 300 identities at once; existing visitors and other addresses are unaffected; it refills", async () => {
    const f = await setup();
    const code = f.qr("test-em26-volta-x2").resolverCode;
    let n = 0;
    // A distinct generic ipHash per request isolates the fair bucket from the generic per-IP cardResolve one.
    // Returns the fair status of a fair_model redirect, else the outcome kind (which then fails the expectation).
    const scan = async (visitorHash: string, fairIpHash: string) => {
      const outcome = await f.t.mutation(api.cards.resolveAndRecord, {
        cardCode: code, requestId: `test-k1-ip-${++n}`, deviceCategory: "mobile", ipHash: `test-generic-${n}`,
        fairGatewaySecret: GATEWAY_SECRET, fairIpHash, fairVisitorHash: visitorHash,
      });
      return outcome.kind === "fair_model" ? outcome.fairScan : outcome.kind;
    };
    const visitors = () => f.t.run(async (ctx) => (await ctx.db.query("fairVisitors").collect()).length);
    const start = await visitors();
    // A hall behind one NAT: 300 new phones in the same minute all get an identity.
    for (let i = 0; i < 300; i += 1) expect(await scan(visitor(), "test-ip-hall")).toBe("recorded");
    expect(await visitors()).toBe(start + 300);

    // The 301st new identity from that address is refused; the generic scan and the redirect (fair_model) still happen.
    expect(await scan(visitor(), "test-ip-hall")).toBe("rate_limited");
    expect(await f.t.run((ctx) => ctx.db.query("cardScanEvents").withIndex("by_requestId", (q) => q.eq("requestId", `test-k1-ip-${n}`)).collect())).toHaveLength(1);
    expect(await visitors()).toBe(start + 300);
    // The same bucket guards interactions: a new visitor from that address cannot rate, nothing is written.
    const before = await dump(f);
    await expect(f.t.mutation(api.fairInteractions.upsertRating, {
      gatewaySecret: GATEWAY_SECRET, ipHash: "test-ip-hall", visitorHash: visitor(), eventModelId: f.voltaX2._id, overall: 4,
    })).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } });
    expect(await dump(f)).toBe(before);

    // An existing visitor behind that address is not a new identity and still counts.
    expect(await scan(f.me, "test-ip-hall")).toBe("recorded");
    expect(await f.t.mutation(api.fairInteractions.upsertRating, {
      gatewaySecret: GATEWAY_SECRET, ipHash: "test-ip-hall", visitorHash: f.me, eventModelId: f.voltaX2._id, overall: 4,
    })).toMatchObject({ mode: "overall", overall: 4 });
    // Another address (another phone network) is not affected.
    expect(await scan(visitor(), "test-ip-mobile")).toBe("recorded");
    // 120/min refill: about 30 s later 60 new identities fit again, not hundreds.
    vi.advanceTimersByTime(30_100);
    const outcomes: string[] = [];
    for (let i = 0; i < 70; i += 1) outcomes.push(await scan(visitor(), "test-ip-hall"));
    expect(outcomes.filter((status) => status === "recorded")).toHaveLength(60);
    expect(outcomes.slice(60).every((status) => status === "rate_limited")).toBe(true);
  }, 300_000);
});
