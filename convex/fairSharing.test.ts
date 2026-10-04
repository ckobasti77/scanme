/// <reference types="vite/client" />

import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { FAIR_PII_PURGE_AT_MS } from "../lib/fair-contract";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-09T10:00:00+02:00");
const VISITOR = "a".repeat(64);
// K1: a TEST gateway secret (not a real value), set as the Convex env below.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
const AUTH = { gatewaySecret: GATEWAY_SECRET, visitorHash: VISITOR };

beforeEach(() => {
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  delete process.env.FAIR_GATEWAY_SECRET;
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const accountId = await ctx.db.insert("accounts", { name: "TEST nalog", plan: "basic", status: "active", createdAt: NOW, updatedAt: NOW });
    const businessId = await ctx.db.insert("businesses", { accountId, name: "TEST izlagač", slug: "test-izlagac", status: "active", createdAt: NOW });
    const brandId = await ctx.db.insert("brands", { accountId, name: "TEST Audi", normalizedName: "test audi", revision: "1", colors: [], createdAt: NOW, updatedAt: NOW });
    const eventId = await ctx.db.insert("fairEvents", {
      code: "test-share-2026", slug: "test-share-2026", title: "TEST sajam", venueName: "TEST hala", timezone: "Europe/Belgrade",
      startsAt: NOW - 60_000, endsAt: NOW + 86_400_000, status: "live", garagePriority: 1,
      piiPurgeAt: Date.parse("2026-11-16T00:00:00+01:00"), minimumPublicVoteCount: 5, robotsIndexable: false, createdAt: NOW, updatedAt: NOW,
    });
    const participationId = await ctx.db.insert("fairParticipations", { externalKey: "test-participation", eventId, accountId, businessId, status: "active", createdAt: NOW, updatedAt: NOW });
    const standId = await ctx.db.insert("fairStands", { eventId, participationId, externalKey: "test-stand", code: "TEST-1", displayName: "TEST štand", mapLocationId: "ispred-14", status: "active", createdAt: NOW, updatedAt: NOW });
    const model = (slug: string, order: number) => ctx.db.insert("fairEventModels", {
      externalKey: `test-${slug}`, eventId, participationId, brandId, standId, slug, displayName: `TEST ${slug}`, priceText: "Cena na upit", specifications: [],
      packageTier: "advanced" as const, packageActivatedAt: NOW, passportEligible: true, status: "published" as const, sortOrder: order, createdAt: NOW, updatedAt: NOW,
    });
    return { eventId, first: await model("model-a", 1), second: await model("model-b", 2) };
  });
  return { t, ...ids };
}

describe("fair sharing and traffic", () => {
  test("creates a bounded same-event collection, reads it by hash and deduplicates retries", async () => {
    const f = await setup();
    const args = { ...AUTH, eventModelIds: [f.first, f.second], codeHash: "b".repeat(64), requestId: "test-share-001" };
    const created = await f.t.mutation(api.fairSharing.createShareCollection, args);
    expect(created).toMatchObject({ eventId: f.eventId, eventModelIds: [f.first, f.second], duplicate: false });
    const again = await f.t.mutation(api.fairSharing.createShareCollection, args);
    expect(again).toMatchObject({ collectionId: created.collectionId, duplicate: true });
    expect(await f.t.query(api.fairSharing.getShareCollectionByCodeHash, { codeHash: args.codeHash, now: NOW })).toMatchObject({ id: created.collectionId, eventModelIds: [f.first, f.second] });
    expect(await f.t.run((ctx) => ctx.db.query("fairShareCollections").collect())).toHaveLength(1);
  });

  test("traffic is anonymous, idempotent and never creates a scan", async () => {
    const f = await setup();
    const collection = await f.t.mutation(api.fairSharing.createShareCollection, { ...AUTH, eventModelIds: [f.first, f.second], codeHash: "c".repeat(64), requestId: "test-share-002" });
    const direct = { ...AUTH, kind: "direct_view", requestId: "test-traffic-001", eventModelId: f.first };
    expect(await f.t.mutation(api.fairSharing.recordTraffic, direct)).toMatchObject({ kind: "direct_view", duplicate: false });
    expect(await f.t.mutation(api.fairSharing.recordTraffic, direct)).toMatchObject({ kind: "direct_view", duplicate: true });
    await f.t.mutation(api.fairSharing.recordTraffic, { ...AUTH, kind: "share_action", requestId: "test-traffic-002", shareCollectionId: collection.collectionId, channel: "whatsapp", modelCount: 2 });
    await f.t.mutation(api.fairSharing.recordTraffic, { ...AUTH, kind: "share_open", requestId: "test-traffic-003", shareCollectionId: collection.collectionId });
    const rows = await f.t.run((ctx) => ctx.db.query("fairTrafficEvents").collect());
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.kind).sort()).toEqual(["direct_view", "share_action", "share_open"]);
    expect(rows.every((row) => !("visitorId" in row))).toBe(true);
    expect(await f.t.run((ctx) => ctx.db.query("fairScanEvents").collect())).toHaveLength(0);
    expect(await f.t.run((ctx) => ctx.db.query("cardScanEvents").collect())).toHaveLength(0);
  });

  test("the 16 November retention run removes raw traffic and shared collections", async () => {
    const f = await setup();
    const collection = await f.t.mutation(api.fairSharing.createShareCollection, { ...AUTH, eventModelIds: [f.first], codeHash: "d".repeat(64), requestId: "test-share-003" });
    await f.t.mutation(api.fairSharing.recordTraffic, { ...AUTH, kind: "share_open", requestId: "test-traffic-004", shareCollectionId: collection.collectionId });
    vi.setSystemTime(FAIR_PII_PURGE_AT_MS);
    expect((await f.t.mutation(internal.fairRetention.purgeTick, {})).status).toBe("started");
    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await f.t.run((ctx) => ctx.db.query("fairTrafficEvents").collect())).toEqual([]);
    expect(await f.t.run((ctx) => ctx.db.query("fairShareCollections").collect())).toEqual([]);
  });

  test("K1: without the gateway secret neither function writes anything", async () => {
    const f = await setup();
    const collection = { eventModelIds: [f.first, f.second], codeHash: "e".repeat(64), requestId: "test-share-004" };
    const traffic = { kind: "direct_view", requestId: "test-traffic-005", eventModelId: f.first };
    const rows = () => f.t.run(async (ctx) => JSON.stringify({
      visitors: await ctx.db.query("fairVisitors").collect(),
      collections: await ctx.db.query("fairShareCollections").collect(),
      traffic: await ctx.db.query("fairTrafficEvents").collect(),
    }));
    const before = await rows();
    for (const sent of [undefined, "test-fair-gateway-secret-0123456789abcdeX"]) {
      const auth = sent === undefined ? { visitorHash: VISITOR } : { gatewaySecret: sent, visitorHash: VISITOR };
      await expect(f.t.mutation(api.fairSharing.createShareCollection, { ...auth, ...collection })).rejects.toMatchObject({ data: { code: "FAIR_GATEWAY_UNAUTHORIZED" } });
      await expect(f.t.mutation(api.fairSharing.recordTraffic, { ...auth, ...traffic })).rejects.toMatchObject({ data: { code: "FAIR_GATEWAY_UNAUTHORIZED" } });
    }
    delete process.env.FAIR_GATEWAY_SECRET;
    await expect(f.t.mutation(api.fairSharing.recordTraffic, { ...AUTH, ...traffic })).rejects.toMatchObject({ data: { code: "FAIR_GATEWAY_NOT_CONFIGURED" } });
    expect(await rows()).toBe(before);
  });
});
