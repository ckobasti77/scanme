/// <reference types="vite/client" />

// Admin UX A7 — the automatic brand passport (ADMIN-UX §6 Pasoš brenda and
// §12.2; MASTER §11; contract §9.31–§9.33): the condition and its reasons,
// the passport that appears and is withdrawn by itself, hiding without loss
// of progress, idempotent re-sync and the frozen set after the opening.
// Scans go through the real cards.resolveAndRecord fair hook (the only stamp
// writer); visitor hashes come from the real Next-side helper. TEST data only.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { fairBrandPassportProblems } from "../lib/fair-entitlements";
import type { FairImportPayload } from "./fairImport";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
// The TEST elektromobilnost fair opens 9 Oct 2026 00:00 (Europe/Belgrade).
const BEFORE_OPENING = Date.parse("2026-10-08T12:00:00+02:00");
const OPENING = Date.parse("2026-10-09T00:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const ADMIN_EMAIL = "fair-a7-admin@scanme.test";
const ISSUER = "https://fair-a7.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";
// K1: a TEST gateway secret (not a real value), set as the Convex env in beforeEach.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const SLUG = "test-elektromobilnost-2026";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_OPENING);
});
afterEach(() => vi.useRealTimers());

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });
const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);

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
    return { adminId, a: await client("TA", ["TEST Volta", "TEST Om", "TEST Solo"]), inventory: await client("TQ", []) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const [volta, om, solo] = ids.a.brandIds;
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: SLUG, slug: SLUG, title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: OPENING, endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
    eventId, externalKey: "test-em-izlagac-a", accountId: ids.a.accountId, businessId: ids.a.businessId,
  });
  const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
    eventId, participationId, externalKey: "test-em-stand-a1", code: "TEST-A1", displayName: "TEST štand A1", mapLocationId: "ispred-14",
  });

  let qrSequence = 0;
  const model = async (externalKey: string, brandId: Id<"brands">, packageTier: Tier, opts: { qr?: boolean; publish?: boolean; candidate?: boolean } = {}) => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId, participationId, standId, brandId, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
      specifications: [spec(1), spec(2)], packageTier, passportEligible: opts.candidate ?? true,
    });
    if (opts.publish !== false) await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    let code: string | null = null;
    if (opts.qr) {
      const digitalQrId = await admin.mutation(api.adminProducts.createDigital, {
        accountId: ids.inventory.accountId, businessId: ids.inventory.businessId, key: `test-qr-a7-${++qrSequence}`,
      });
      code = await t.run(async (ctx) => (await ctx.db.get((await ctx.db.get(digitalQrId))!.channelId))!.resolverCode);
      await admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: code });
    }
    return { id: modelId, code: code! };
  };
  return { t, admin, ...ids, eventId, participationId, brands: { volta, om, solo }, model };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function rows<T extends TableNames>(f: Pick<Fixture, "t">, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}
const jobs = async (f: Pick<Fixture, "t">) => (await f.t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect())).map((job) => job.name);
/** The sync scheduled after a catalog change runs right after it (its own transaction). */
const runJobs = (f: Pick<Fixture, "t">) => f.t.finishAllScheduledFunctions(vi.runAllTimers);
const overview = (f: Fixture) => f.admin.query(api.fairPassports.getPassportOverview, { eventId: f.eventId });
const brandRow = async (f: Fixture, brandId: Id<"brands">) => (await overview(f)).brands.find((row) => row.brandId === brandId)!;
const catalogBrands = async (f: Fixture) => (await f.t.query(api.fairPublic.getPassportCatalog, { eventSlug: SLUG }))!.catalog.map((entry) => entry.brandId);
const progress = async (f: Fixture, visitorHash: string) =>
  (await f.t.query(api.fairInteractions.getMyPassportProgress, { gatewaySecret: GATEWAY_SECRET, visitorHash, eventSlug: SLUG }))!;
const requiredOf = async (f: Fixture, passportId: Id<"fairPassportConfigs">) =>
  (await rows(f, "fairPassportEligibleModels")).filter((row) => row.passportConfigId === passportId && row.status === "required").map((row) => row.eventModelId);
const favorite = (f: Fixture, visitorHash: string, passportId: string, eventModelId: string) =>
  f.t.mutation(api.fairInteractions.upsertBrandFavorite, { gatewaySecret: GATEWAY_SECRET, visitorHash, passportId, eventModelId });

let requestSequence = 0;
function scan(f: Fixture, code: string, visitorHash: string) {
  return f.t.mutation(api.cards.resolveAndRecord, {
    cardCode: code, requestId: `test-a7-request-${++requestSequence}`, deviceCategory: "mobile", ipHash: "test-hall-nat", fairGatewaySecret: GATEWAY_SECRET, fairVisitorHash: visitorHash,
  });
}

// -----------------------------------------------------------------------------

describe("A7 condition (MASTER §11; lib/fair-entitlements fairBrandPassportProblems)", () => {
  const m = (status: Doc<"fairEventModels">["status"], packageTier: Tier, passportEligible = true, participationId = "p1") => ({ status, packageTier, passportEligible, participationId });

  test("two published Starter+ candidates of one exhibitor meet it; every broken rule is reported with its count", () => {
    expect(fairBrandPassportProblems([m("published", "starter"), m("published", "advanced")])).toEqual({ eligible: true, exhibited: 2, problems: [] });
    // Withdrawn models do not count.
    expect(fairBrandPassportProblems([m("published", "starter"), m("withdrawn", "included"), m("published", "starter")]).eligible).toBe(true);
    expect(fairBrandPassportProblems([m("published", "starter"), m("withdrawn", "starter")])).toEqual({
      eligible: false, exhibited: 1, problems: [{ code: "fewer_than_two_models", count: 1 }],
    });
    expect(fairBrandPassportProblems([m("published", "starter"), m("published", "starter"), m("published", "included")])).toEqual({
      eligible: false, exhibited: 3, problems: [{ code: "model_below_starter", count: 1 }],
    });
    expect(fairBrandPassportProblems([m("draft", "included", false), m("published", "starter"), m("published", "advanced", true, "p2")]).problems).toEqual([
      { code: "model_not_published", count: 1 },
      { code: "model_not_candidate", count: 1 },
      { code: "model_below_starter", count: 1 },
      { code: "multiple_exhibitors", count: 2 },
    ]);
  });
});

describe("A7 automatic brand passport (ADMIN-UX §6, §12.2)", () => {
  test("a brand with two published Starter models gets a published passport by itself; one without Starter or a single model gets the reason, an upgrade completes it", async () => {
    const f = await setup();
    const x1 = await f.model("test-volta-x1", f.brands.volta, "starter");
    expect(await jobs(f)).toEqual([]); // one model: nothing would change, nothing is scheduled
    const x2 = await f.model("test-volta-x2", f.brands.volta, "starter");
    expect(await jobs(f)).toEqual(["fairPassports:syncBrandPassport"]);
    await runJobs(f);

    const [config] = await rows(f, "fairPassportConfigs");
    expect(config).toMatchObject({ brandId: f.brands.volta, participationId: f.participationId, status: "published", frozenAt: OPENING, publishedAt: BEFORE_OPENING, autoSyncedAt: BEFORE_OPENING });
    expect(config.hiddenAt).toBeUndefined();
    expect(await requiredOf(f, config._id)).toEqual([x1.id, x2.id]);
    expect(await catalogBrands(f)).toEqual([f.brands.volta]);
    expect(await brandRow(f, f.brands.volta)).toMatchObject({ eligible: true, exhibited: 2, problems: [], freezesAt: OPENING, passport: { passportId: config._id, status: "published" } });

    // Om: one Starter and one model without a package → no passport, the reason says which rule.
    await f.model("test-om-z1", f.brands.om, "starter");
    const z2 = await f.model("test-om-z2", f.brands.om, "included");
    // Solo: a single Starter model.
    await f.model("test-solo-s1", f.brands.solo, "starter");
    await runJobs(f);
    expect(await brandRow(f, f.brands.om)).toMatchObject({ eligible: false, exhibited: 2, problems: [{ code: "model_below_starter", count: 1 }], passport: null });
    expect(await brandRow(f, f.brands.solo)).toMatchObject({ eligible: false, exhibited: 1, problems: [{ code: "fewer_than_two_models", count: 1 }], passport: null });
    expect(await catalogBrands(f)).toEqual([f.brands.volta]);

    // The package upgrade completes the condition: the passport appears without a click.
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: z2.id, toTier: "starter" });
    await runJobs(f);
    expect((await catalogBrands(f)).sort()).toEqual([f.brands.volta, f.brands.om].sort());
    expect(await brandRow(f, f.brands.om)).toMatchObject({ eligible: true, problems: [], passport: { status: "published" } });
  });

  test("losing the condition withdraws the passport, meeting it again republishes it with the new set; earned stamps are never lost", async () => {
    const f = await setup();
    const x1 = await f.model("test-volta-x1", f.brands.volta, "starter", { qr: true });
    const x2 = await f.model("test-volta-x2", f.brands.volta, "advanced", { qr: true });
    await runJobs(f);
    const [config] = await rows(f, "fairPassportConfigs");
    const me = visitor();
    await scan(f, x1.code, me);
    expect(await rows(f, "fairPassportStamps")).toHaveLength(1);

    // A third Volta model without Starter: the brand no longer meets the condition.
    const x3 = await f.model("test-volta-x3", f.brands.volta, "included", { qr: true });
    await runJobs(f);
    expect((await f.t.run(async (ctx) => ctx.db.get(config._id)))!.status).toBe("withdrawn");
    expect(await catalogBrands(f)).toEqual([]);
    expect(await brandRow(f, f.brands.volta)).toMatchObject({ eligible: false, problems: [{ code: "model_below_starter", count: 1 }] });
    expect(await rows(f, "fairPassportStamps")).toHaveLength(1);

    // Upgraded: published again, the set is now all three; the old stamp still counts.
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: x3.id, toTier: "starter" });
    await runJobs(f);
    expect(await rows(f, "fairPassportConfigs")).toHaveLength(1);
    expect((await f.t.run(async (ctx) => ctx.db.get(config._id)))!.status).toBe("published");
    expect(await requiredOf(f, config._id)).toEqual([x1.id, x2.id, x3.id]);
    expect((await progress(f, me)).progress).toEqual([{ passportId: config._id, stampedModelIds: [x1.id], stampedCount: 1, requiredCount: 3, completed: false }]);

    // A withdrawn model leaves the set before the opening; it is not deleted and comes back when published.
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: x2.id });
    await runJobs(f);
    expect(await requiredOf(f, config._id)).toEqual([x1.id, x3.id]);
    await f.admin.mutation(api.fairAdmin.publishModel, { eventModelId: x2.id });
    await runJobs(f);
    expect((await requiredOf(f, config._id)).sort()).toEqual([x1.id, x2.id, x3.id].sort());
    expect(await rows(f, "fairPassportEligibleModels")).toHaveLength(3);
  });

  test("a hidden passport is not public anywhere, keeps stamping and loses nothing; Prikaži restores everyone's progress", async () => {
    const f = await setup();
    const x1 = await f.model("test-volta-x1", f.brands.volta, "starter", { qr: true });
    const x2 = await f.model("test-volta-x2", f.brands.volta, "starter", { qr: true });
    await runJobs(f);
    const [config] = await rows(f, "fairPassportConfigs");

    expect(await f.admin.mutation(api.fairPassports.setPassportHidden, { passportId: config._id, hidden: true })).toEqual({ passportId: config._id, hidden: true, changed: true });
    expect(await f.admin.mutation(api.fairPassports.setPassportHidden, { passportId: config._id, hidden: true })).toEqual({ passportId: config._id, hidden: true, changed: false });
    // The sync keeps a hidden passport up to date but never shows it.
    const x3 = await f.model("test-volta-x3", f.brands.volta, "starter", { qr: true });
    await runJobs(f);
    expect(await requiredOf(f, config._id)).toEqual([x1.id, x2.id, x3.id]);
    expect((await f.t.run(async (ctx) => ctx.db.get(config._id)))!.hiddenAt).toBe(BEFORE_OPENING);
    expect(await brandRow(f, f.brands.volta)).toMatchObject({ eligible: true, passport: { status: "published", hiddenAt: BEFORE_OPENING } });

    vi.setSystemTime(DAY1);
    const me = visitor();
    await scan(f, x1.code, me);
    await scan(f, x2.code, me);
    // Not in the catalog (map, garage), not on the model page, no favorite — but both stamps are stored.
    expect(await catalogBrands(f)).toEqual([]);
    expect(await progress(f, me)).toEqual({ eventId: f.eventId, catalog: [], progress: [] });
    const state = await f.t.query(api.fairInteractions.getMyModelState, { gatewaySecret: GATEWAY_SECRET, visitorHash: me, eventModelId: x1.id });
    expect(state.passport).toBeNull();
    await expectCode(favorite(f, me, config._id, x1.id), "PASSPORT_NOT_ACTIVE");
    expect((await rows(f, "fairPassportStamps")).map((row) => row.eventModelId)).toEqual([x1.id, x2.id]);

    expect(await f.admin.mutation(api.fairPassports.setPassportHidden, { passportId: config._id, hidden: false })).toEqual({ passportId: config._id, hidden: false, changed: true });
    expect(await catalogBrands(f)).toEqual([f.brands.volta]);
    expect((await progress(f, me)).progress).toEqual([{ passportId: config._id, stampedModelIds: [x1.id, x2.id], stampedCount: 2, requiredCount: 3, completed: false }]);
    await scan(f, x3.code, me);
    expect(await favorite(f, me, config._id, x2.id)).toMatchObject({ stampedCount: 3, requiredCount: 3, completed: true, favoriteModelId: x2.id });
    expect((await brandRow(f, f.brands.volta)).passport?.hiddenAt).toBeUndefined();
    expect((await rows(f, "adminAuditLog")).map((row) => row.action).filter((action) => action.startsWith("fair_passport_"))).toEqual(["fair_passport_hidden", "fair_passport_shown"]);
  });

  test("re-sync is idempotent: no duplicate passport or member, nothing rewritten, a no-op schedules nothing", async () => {
    const f = await setup();
    await f.model("test-volta-x1", f.brands.volta, "starter");
    await f.model("test-volta-x2", f.brands.volta, "starter");
    await runJobs(f);
    const before = JSON.stringify([await rows(f, "fairPassportConfigs"), await rows(f, "fairPassportEligibleModels")]);
    const scheduled = (await jobs(f)).length;

    vi.setSystemTime(BEFORE_OPENING + 60_000);
    expect(await f.admin.mutation(api.fairPassports.refreshPassports, { eventId: f.eventId })).toEqual({ created: 0, updated: 0, withdrawn: 0, unchanged: 1, frozen: 0, too_many_models: 0 });
    expect(await f.admin.mutation(api.fairPassports.refreshPassports, { eventId: f.eventId })).toEqual({ created: 0, updated: 0, withdrawn: 0, unchanged: 1, frozen: 0, too_many_models: 0 });
    expect(await f.t.mutation(internal.fairPassports.syncEventPassports, { eventId: f.eventId })).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(await f.t.mutation(internal.fairPassports.syncBrandPassport, { eventId: f.eventId, brandId: f.brands.volta })).toBe("unchanged");
    // A single Solo model and a re-publish change no passport: no job.
    await f.model("test-solo-s1", f.brands.solo, "starter");
    expect((await jobs(f)).length).toBe(scheduled);
    expect(JSON.stringify([await rows(f, "fairPassportConfigs"), await rows(f, "fairPassportEligibleModels")])).toBe(before);
    expect(await rows(f, "fairPassportConfigs")).toHaveLength(1);
    expect(await rows(f, "fairPassportEligibleModels")).toHaveLength(2);
  });

  test("from the opening the set is frozen: new, withdrawn and upgraded models change nothing; the emergency removal still works and keeps stamps", async () => {
    const f = await setup();
    const x1 = await f.model("test-volta-x1", f.brands.volta, "starter", { qr: true });
    const x2 = await f.model("test-volta-x2", f.brands.volta, "starter", { qr: true });
    await runJobs(f);
    const [config] = await rows(f, "fairPassportConfigs");

    vi.setSystemTime(DAY1);
    const me = visitor();
    await scan(f, x2.code, me);
    const scheduled = (await jobs(f)).length;
    const x3 = await f.model("test-volta-x3", f.brands.volta, "starter");
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: x2.id });
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: x1.id, toTier: "advanced" });
    expect((await jobs(f)).length).toBe(scheduled); // frozen: nothing to schedule
    expect(await f.admin.mutation(api.fairPassports.refreshPassports, { eventId: f.eventId })).toMatchObject({ frozen: 1, created: 0, updated: 0, withdrawn: 0 });
    expect(await requiredOf(f, config._id)).toEqual([x1.id, x2.id]);
    expect(await brandRow(f, f.brands.volta)).toMatchObject({ freezesAt: OPENING, passport: { status: "published", frozenAt: OPENING } });
    expect((await f.t.run(async (ctx) => ctx.db.get(config._id)))!.updatedAt).toBe(BEFORE_OPENING);
    expect(x3.id).toBeDefined();

    // Emergency removal (B3, manual) of the withdrawn car: M shrinks, the stamp stays, and no later sync puts it back.
    expect(await f.admin.mutation(api.fairInteractionsAdmin.removePassportModel, { passportId: config._id, eventModelId: x2.id })).toEqual({ status: "removed", requiredCount: 1 });
    await f.admin.mutation(api.fairPassports.refreshPassports, { eventId: f.eventId });
    expect(await requiredOf(f, config._id)).toEqual([x1.id]);
    expect(await rows(f, "fairPassportStamps")).toHaveLength(1);
    expect((await brandRow(f, f.brands.volta)).members.find((row) => row.eventModelId === x2.id)).toMatchObject({ status: "removed", removedByAdmin: true });
  });

  test("a manual decision wins: a passport withdrawn by hand is frozen and the sync never republishes it", async () => {
    const f = await setup();
    await f.model("test-volta-x1", f.brands.volta, "starter");
    await f.model("test-volta-x2", f.brands.volta, "starter");
    await runJobs(f);
    const [config] = await rows(f, "fairPassportConfigs");
    vi.setSystemTime(BEFORE_OPENING + 60_000);
    await f.admin.mutation(api.fairInteractionsAdmin.withdrawPassport, { passportId: config._id });
    expect((await f.t.run(async (ctx) => ctx.db.get(config._id)))!.frozenAt).toBe(BEFORE_OPENING + 60_000);
    await f.model("test-volta-x3", f.brands.volta, "starter");
    expect(await f.admin.mutation(api.fairPassports.refreshPassports, { eventId: f.eventId })).toMatchObject({ frozen: 1, created: 0, updated: 0 });
    expect((await f.t.run(async (ctx) => ctx.db.get(config._id)))!.status).toBe("withdrawn");
    expect(await catalogBrands(f)).toEqual([]);
  });

  test("non-admins cannot read, refresh or hide; a missing passport is a stable code", async () => {
    const f = await setup();
    const member = f.t.withIdentity({ subject: await f.t.run(async (ctx) => ctx.db.insert("users", { email: "klijent-a7@example.invalid" })), issuer: ISSUER });
    for (const caller of [f.t, member]) {
      await expect(caller.query(api.fairPassports.getPassportOverview, { eventId: f.eventId })).rejects.toThrow();
      await expect(caller.mutation(api.fairPassports.refreshPassports, { eventId: f.eventId })).rejects.toThrow();
    }
    const ghost = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("fairPassportConfigs", { eventId: f.eventId, brandId: f.brands.solo, participationId: f.participationId, status: "draft", createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING });
      await ctx.db.delete(id);
      return id;
    });
    await expectCode(f.admin.mutation(api.fairPassports.setPassportHidden, { passportId: ghost, hidden: true }), "FAIR_PASSPORT_NOT_FOUND");
  });
});

// -----------------------------------------------------------------------------
// After a committed import the whole event is synced (fixture as in fairImport.test.ts)
// -----------------------------------------------------------------------------

describe("A7 sync after a catalog import", () => {
  test("a committed import schedules the event sync; it picks up the brands that meet the condition", async () => {
    const t = convexTest(schema, modules);
    rateLimiterTest.register(t);
    const adminId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("users", { email: ADMIN_EMAIL });
      const accountId = await ctx.db.insert("accounts", {
        name: "TEST klijent FA", plan: "basic", status: "active", smkCode: "SMK-FA", ownerDisplayName: "TEST vlasnik FA",
        normalizedOwnerDisplayName: "test vlasnik fa", clientStatus: "active", adminV1MigrationVersion: 1, clientSegment: "event_only", createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING,
      });
      await ctx.db.insert("businesses", {
        accountId, name: "TEST lokal FA", slug: "test-lokal-fa", smlCode: "SML-FA", kind: "business", clientStatus: "active", adminV1MigrationVersion: 1, status: "active", createdAt: BEFORE_OPENING,
      });
      await ctx.db.insert("brands", { accountId, name: "TEST Volta", normalizedName: "test volta", revision: "1", colors: [], createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING });
      return id;
    });
    const admin = t.withIdentity({ subject: adminId, issuer: ISSUER });
    await admin.mutation(api.fairAdmin.upsertEvent, {
      code: "elektromobilnost-2026", slug: "elektromobilnost-2026", title: "TEST Sajam elektromobilnosti", venueName: "TEST hala",
      startsAt: OPENING, endsAt: Date.parse("2026-10-12T00:00:00+02:00"), garagePriority: 1,
    });
    const model = (key: string) => ({ externalKey: key, displayName: `TEST ${key}`, priceText: "TEST cena", packageTier: "starter" as const, passportEligible: true, specifications: [{ label: "TEST", value: "TEST", order: 1 }] });
    const payload: FairImportPayload = {
      version: 1,
      eventCode: "elektromobilnost-2026",
      participations: [{
        externalKey: "test-em26-izlagac-a", accountExternalKey: "SMK-FA", businessExternalKey: "SML-FA", clientSegment: "event_only",
        brands: [{ externalKey: "test-volta", name: "TEST Volta", stand: { externalKey: "test-em26-stand-a12", code: "A12", mapLocationId: "hala-1a" }, models: [model("test-em26-volta-x1"), model("test-em26-volta-x2")] }],
      }],
    };
    expect(await admin.mutation(api.fairImport.commit, { payload })).toMatchObject({ committed: true });
    expect(await jobs({ t })).toEqual(["fairPassports:syncEventPassports"]);
    // The imported models are drafts; once they are published (here directly, as an import of a published
    // catalog would leave them) the scheduled job creates the passport.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("fairEventModels").collect()) await ctx.db.patch(row._id, { status: "published" });
    });
    await runJobs({ t });
    const [config] = await rows({ t }, "fairPassportConfigs");
    expect(config).toMatchObject({ status: "published", frozenAt: OPENING });
    expect(await rows({ t }, "fairPassportEligibleModels")).toHaveLength(2);
  });
});
