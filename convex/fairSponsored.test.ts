/// <reference types="vite/client" />

// Sajam 2026 B5 — sponsored snapshot and read projections (BACKEND-HANDOFF
// §5.7, §7, §11 B5, §12 "sponzorisani snapshot prikazuje svaki Advanced model
// jednom pre ponavljanja i sve display instance računaju isti slot"; MASTER
// §10; JOVAN-DELTA §2: no impression, no map/display write, garage writes only
// `open_model` and `garage_add`). The active slot is computed exactly as the
// frontend does, with lib/fair-client/rotation-slot.ts (read, never changed).

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import type { Infer } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
// A9: the scheduled sync job lives in this module; loaded once up front so finishAllScheduledFunctions
// does not wait for its first (cold) module transform under a full-suite load.
import "./fairSponsoredAdmin";
import {
  FAIR_GARAGE_ROTATION_INTERVAL_MS,
  FAIR_MAP_ROTATION_INTERVAL_MS,
  type FairSponsoredActionResult,
  type FairSponsoredRotationView,
} from "../lib/fair-contract";
import {
  FAIR_GARAGE_ROTATION_INTERVAL_MS as CLIENT_GARAGE_INTERVAL_MS,
  FAIR_MAP_ROTATION_INTERVAL_MS as CLIENT_MAP_INTERVAL_MS,
  getFairRotationItem,
  getFairRotationSlot,
} from "../lib/fair-client/rotation-slot";
import { fairSponsoredActionResultView, fairSponsoredRotationView } from "./lib/fairValidators";
import { fairSponsoredCountKeys, fairSponsoredOrder, fairSponsoredSeed } from "./lib/fairSponsored";
import { readFairCount } from "./lib/fairCountShards";

vi.mock("server-only", () => ({}));
const { fairVisitorHash, generateFairVisitorToken } = await import("../lib/fair-server/visitor");

const modules = import.meta.glob("./**/*.ts");
// The TEST elektromobilnost fair runs 9–11 Oct 2026 (Europe/Belgrade).
const BEFORE_OPENING = Date.parse("2026-10-08T12:00:00+02:00");
const DAY1 = Date.parse("2026-10-09T10:00:00+02:00");
const DAY2 = Date.parse("2026-10-10T09:30:00+02:00");
const EVENT_ENDS = Date.parse("2026-10-12T00:00:00+02:00");
const ADMIN_EMAIL = "fair-admin@scanme.test";
const ISSUER = "https://fair-b5.test";
const SECRET = "test-fair-visitor-secret-0123456789abcdef";

// K1: a TEST gateway secret (not a real value), set as the Convex env in beforeEach.
const GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = GATEWAY_SECRET;
  vi.useFakeTimers();
  vi.setSystemTime(BEFORE_OPENING);
});
afterEach(() => {
  vi.useRealTimers();
});

const spec = (order: number) => ({ label: `TEST stavka ${order}`, value: `TEST ${order}`, order, isHighlight: order === 1 });
const visitor = () => fairVisitorHash(generateFairVisitorToken(), SECRET);
let requestSequence = 0;
const requestId = () => `test-b5-request-${++requestSequence}`;

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

type Tier = "included" | "starter" | "advanced";

/**
 * `auto: false` (the B5 tests) turns the A9 automatic publish off right after
 * the event is created, so the manual flow is tested exactly as before;
 * `auto: true` (the A9 tests) keeps the default (on).
 */
async function setup({ auto = false }: { auto?: boolean } = {}) {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const memberId = await ctx.db.insert("users", { email: "klijent@example.invalid" });
    const client = async (code: string, brandName: string | null) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `TEST klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `TEST vlasnik ${code}`,
        normalizedOwnerDisplayName: `test vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING,
      });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `TEST izlagač ${code}`, slug: `test-izlagac-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: BEFORE_OPENING,
      });
      const brandId = brandName
        ? await ctx.db.insert("brands", { accountId, name: brandName, normalizedName: brandName.toLowerCase(), revision: "1", colors: [], createdAt: BEFORE_OPENING, updatedAt: BEFORE_OPENING })
        : null;
      return { accountId, businessId, brandId };
    };
    return { adminId, memberId, a: await client("TA", "TEST Volta"), b: await client("TB", "TEST Om"), inventory: await client("TQ", null) };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const member = t.withIdentity({ subject: ids.memberId, issuer: ISSUER });

  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", title: "TEST elektromobilnost", venueName: "TEST hala",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: EVENT_ENDS, status: "published", garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  if (!auto) await admin.mutation(api.fairSponsoredAdmin.setSponsoredAutoPublish, { eventId, enabled: false });
  const { dayId } = await admin.mutation(api.fairAdmin.upsertEventDay, { eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });
  const exhibitor = async (key: string, client: typeof ids.a, location: string) => {
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
      eventId, externalKey: `test-em-${key}`, accountId: client.accountId, businessId: client.businessId,
    });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
      eventId, participationId, externalKey: `test-em-stand-${key}`, code: `TEST-${key}`, displayName: `TEST štand ${key}`, mapLocationId: location,
    });
    const model = async (externalKey: string, packageTier: Tier, opts: { publish?: boolean; packageActiveFrom?: number } = {}) => {
      const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
        eventId, participationId, standId, brandId: client.brandId!, externalKey, displayName: `TEST ${externalKey}`, priceText: "TEST cena",
        specifications: [spec(1), spec(2)], packageTier, passportEligible: true,
        ...(opts.packageActiveFrom !== undefined ? { packageActiveFrom: opts.packageActiveFrom } : {}),
      });
      if (opts.publish !== false) await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
      return modelId;
    };
    return { participationId, standId, model };
  };
  const a = await exhibitor("a", ids.a, "ispred-14");
  const b = await exhibitor("b", ids.b, "ispred-15");
  const models = {
    included: await a.model("test-volta-x0", "included"),
    starter: await a.model("test-volta-x1", "starter"),
    advanced: await a.model("test-volta-x2", "advanced"),
    advanced2: await a.model("test-volta-x3", "advanced"),
    advancedB: await b.model("test-om-z2", "advanced"),
    draftAdvanced: await b.model("test-om-z3", "advanced", { publish: false }),
    // Advanced only from day 2 (imported with a future package_active_from).
    laterAdvanced: await b.model("test-om-z4", "advanced", { packageActiveFrom: DAY2 }),
  };
  vi.setSystemTime(DAY1);
  return { t, admin, member, adminId: ids.adminId, clients: { a: ids.a, b: ids.b }, eventId, dayId, a, b, models, eventSlug: "test-elektromobilnost-2026" };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function rows<T extends TableNames>(f: Fixture, table: T): Promise<Doc<T>[]> {
  return f.t.run(async (ctx) => ctx.db.query(table).collect());
}
const publish = (f: Fixture) => f.admin.mutation(api.fairSponsoredAdmin.publishSponsoredSnapshot, { eventId: f.eventId });
const mapRotation = (f: Fixture) => f.t.query(api.fairPublic.getSponsoredMapRotation, { eventSlug: f.eventSlug });
const garageRotation = (f: Fixture) => f.t.query(api.fairPublic.getSponsoredGarageRotation, { eventSlug: f.eventSlug });
const ids = (view: FairSponsoredRotationView | null) => (view?.items ?? []).map((item) => item.eventModelId);
function action(f: Fixture, visitorHash: string, eventModelId: Id<"fairEventModels">, extra: Partial<{ surface: string; kind: string; requestId: string }> = {}) {
  return f.t.mutation(api.fairInteractions.recordSponsoredAction, {
    gatewaySecret: GATEWAY_SECRET,
    visitorHash, eventModelId, surface: "garage", kind: "open_model", requestId: requestId(), ...extra,
  });
}
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, inner]) => [key, ...keysOf(inner)]);
}
const count = (f: Fixture, key: string) => f.t.run(async (ctx) => readFairCount(ctx, key));

const SCAN_AND_WRITE_TABLES = [
  "fairSponsoredEvents", "fairVisitors", "fairScanEvents", "fairUniqueScans", "fairMetricCountShards", "cardScanEvents", "fairPassportStamps",
] as const;
async function tableSizes(f: Fixture) {
  const out: Record<string, number> = {};
  for (const table of SCAN_AND_WRITE_TABLES) out[table] = (await rows(f, table)).length;
  return out;
}

// =============================================================================
// Manual publish: an immutable list of every published Advanced model
// =============================================================================

describe("B5 publishSponsoredSnapshot (HANDOFF §5.7, MASTER §10)", () => {
  test("only admins publish; the list holds exactly the published Advanced models, stably shuffled by seed + dayKey", async () => {
    const f = await setup();
    await expect(f.t.mutation(api.fairSponsoredAdmin.publishSponsoredSnapshot, { eventId: f.eventId })).rejects.toThrow();
    await expect(f.member.mutation(api.fairSponsoredAdmin.publishSponsoredSnapshot, { eventId: f.eventId })).rejects.toThrow();
    await expect(f.t.query(api.fairSponsoredAdmin.getSponsoredRotationAdmin, { eventId: f.eventId })).rejects.toThrow();
    expect(await rows(f, "fairSponsoredSnapshots")).toHaveLength(0);

    const result = await publish(f);
    const advanced = [f.models.advanced, f.models.advanced2, f.models.advancedB];
    const seed = fairSponsoredSeed(f.eventId);
    expect(result).toMatchObject({ version: 1, dayKey: "2026-10-09", seed, publishedAt: DAY1, itemCount: 3, retiredSnapshotIds: [] });

    const [snapshot] = await rows(f, "fairSponsoredSnapshots");
    expect(snapshot).toMatchObject({ eventId: f.eventId, version: 1, dayKey: "2026-10-09", seed, status: "published", publishedAt: DAY1, publishedByUserId: f.adminId });
    const items = (await rows(f, "fairSponsoredSnapshotItems")).sort((x, y) => x.order - y.order);
    expect(items.map((item) => item.order)).toEqual([0, 1, 2]);
    expect(items.map((item) => item.eventModelId)).toEqual(fairSponsoredOrder(advanced, seed, "2026-10-09"));
    // Starter, included, an unpublished Advanced and a not-yet-active Advanced never enter.
    for (const excluded of [f.models.included, f.models.starter, f.models.draftAdvanced, f.models.laterAdvanced]) {
      expect(items.some((item) => item.eventModelId === excluded)).toBe(false);
    }

    const audit = (await rows(f, "adminAuditLog")).filter((row) => row.action === "fair_sponsored_snapshot_published");
    expect(audit).toHaveLength(1);
  });

  test("the snapshot is immutable: a new publish retires the old one and never edits its items", async () => {
    const f = await setup();
    const first = await publish(f);
    const before = (await rows(f, "fairSponsoredSnapshotItems")).map(({ _id, snapshotId, eventModelId, order }) => ({ _id, snapshotId, eventModelId, order }));

    // Upgrade a Starter model during the day, then publish again by hand.
    vi.setSystemTime(DAY1 + 3_600_000);
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.models.starter, toTier: "advanced" });
    const stale = await mapRotation(f);
    expect(ids(stale)).not.toContain(f.models.starter); // nothing changes until a manual publish
    const second = await publish(f);
    expect(second).toMatchObject({ version: 2, itemCount: 4, retiredSnapshotIds: [first.snapshotId] });

    const snapshots = (await rows(f, "fairSponsoredSnapshots")).sort((x, y) => x.version - y.version);
    expect(snapshots.map((row) => row.status)).toEqual(["retired", "published"]);
    expect(snapshots.filter((row) => row.status === "published")).toHaveLength(1);
    // Version 1 items are byte-for-byte the same rows.
    const afterFirst = (await rows(f, "fairSponsoredSnapshotItems")).filter((row) => row.snapshotId === first.snapshotId)
      .map(({ _id, snapshotId, eventModelId, order }) => ({ _id, snapshotId, eventModelId, order }));
    expect(afterFirst).toEqual(before);

    // The new snapshot includes the upgraded model; on the same day the others keep their relative order.
    const view = await mapRotation(f);
    expect(view?.version).toBe(2);
    expect(ids(view)).toContain(f.models.starter);
    expect(ids(view).filter((id) => id !== f.models.starter)).toEqual(before.sort((x, y) => x.order - y.order).map((row) => row.eventModelId));
  });

  test("a package that starts later joins only with a publish after it is active; withdrawn models leave the public rotation", async () => {
    const f = await setup();
    await publish(f);
    expect(ids(await mapRotation(f))).not.toContain(f.models.laterAdvanced);
    const admin = await f.admin.query(api.fairSponsoredAdmin.getSponsoredRotationAdmin, { eventId: f.eventId });
    expect(admin.candidates.find((row) => row.eventModelId === f.models.laterAdvanced)?.packageActivatedAt).toBe(DAY2);

    vi.setSystemTime(DAY2);
    const next = await publish(f);
    expect(next.dayKey).toBe("2026-10-10");
    expect(ids(await mapRotation(f))).toContain(f.models.laterAdvanced);

    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.models.advanced });
    const view = await garageRotation(f);
    expect(ids(view)).not.toContain(f.models.advanced);
    expect(view?.items).toHaveLength(3);
  });

  test("an empty list is allowed and takes the rotation down; admin view lists versions and candidates", async () => {
    const f = await setup();
    expect(await mapRotation(f)).toBeNull(); // nothing published yet
    for (const model of [f.models.advanced, f.models.advanced2, f.models.advancedB]) {
      await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: model });
    }
    const result = await publish(f);
    expect(result.itemCount).toBe(0);
    expect((await mapRotation(f))?.items).toEqual([]);
    const admin = await f.admin.query(api.fairSponsoredAdmin.getSponsoredRotationAdmin, { eventId: f.eventId });
    expect(admin.active?.items).toEqual([]);
    expect(admin.history.map((row) => [row.version, row.status])).toEqual([[1, "published"]]);
  });
});

// =============================================================================
// Read projections and the shared slot
// =============================================================================

describe("B5 sponsored projections (map 12 s, garage 8 s)", () => {
  test("the projection carries seed/version/epoch and the intervals rotation-slot.ts expects", async () => {
    const f = await setup();
    const { snapshotId, seed } = await publish(f);
    const map = await mapRotation(f);
    const garage = await garageRotation(f);
    expect(FAIR_MAP_ROTATION_INTERVAL_MS).toBe(CLIENT_MAP_INTERVAL_MS);
    expect(FAIR_GARAGE_ROTATION_INTERVAL_MS).toBe(CLIENT_GARAGE_INTERVAL_MS);
    expect(map).toMatchObject({ surface: "map", eventId: f.eventId, snapshotId, version: 1, dayKey: "2026-10-09", seed, epochMs: DAY1, intervalMs: 12_000 });
    expect(garage).toMatchObject({ surface: "garage", eventId: f.eventId, snapshotId, version: 1, dayKey: "2026-10-09", seed, epochMs: DAY1, intervalMs: 8_000 });
    expect(ids(garage)).toEqual(ids(map));
    expect(map!.items.map((item) => item.order)).toEqual([0, 1, 2]);
    // No impression or metric field is promised anywhere in the projection.
    expect(keysOf([map, garage]).filter((key) => /impression|view|count|metric/i.test(key))).toEqual([]);
  });

  test("every Advanced model is shown once before any repeats, for both intervals", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.models.starter, toTier: "advanced" });
    await publish(f);
    for (const view of [await mapRotation(f), await garageRotation(f)]) {
      const n = view!.items.length;
      expect(n).toBe(4);
      const shown = Array.from({ length: n * 3 }, (_, slot) =>
        getFairRotationItem(view!.items, { epochMs: view!.epochMs, nowMs: view!.epochMs + slot * view!.intervalMs + 1, intervalMs: view!.intervalMs })!.item.eventModelId);
      for (let cycle = 0; cycle < 3; cycle += 1) {
        const window = shown.slice(cycle * n, cycle * n + n);
        expect(new Set(window).size).toBe(n); // each model exactly once per cycle
        expect(window).toEqual(ids(view));
      }
    }
  });

  test("all display instances compute the same slot for the same moment", async () => {
    const f = await setup();
    await publish(f);
    // Three independent displays read the projection separately (different moments of loading).
    const displays = [await mapRotation(f), await mapRotation(f), await mapRotation(f)];
    for (const nowMs of [DAY1 - 5_000, DAY1, DAY1 + 11_999, DAY1 + 12_000, DAY1 + 37 * 12_000 + 6_000, DAY1 + 8 * 3_600_000]) {
      const picks = displays.map((view) => {
        const slot = getFairRotationSlot({ epochMs: view!.epochMs, nowMs, intervalMs: view!.intervalMs, itemCount: view!.items.length });
        return { model: view!.items[slot!.index].eventModelId, slot: slot!.slotNumber, next: slot!.nextSlotAt };
      });
      expect(new Set(picks.map((pick) => JSON.stringify(pick))).size).toBe(1);
    }
  });

  test("photo fallback: own photo, else brand logo, else the event placeholder — never another model's photo", async () => {
    const f = await setup();
    const photo = "https://example.com/test-volta-x2.jpg";
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.models.advanced, { photoUrl: photo });
      const logo = await ctx.storage.store(new Blob(["TEST logo"], { type: "image/png" }));
      await ctx.db.patch(f.clients.b.brandId!, { logoStorageId: logo });
    });
    await publish(f);
    const view = await garageRotation(f);
    const card = (id: Id<"fairEventModels">) => view!.items.find((item) => item.eventModelId === id)!;
    expect(card(f.models.advanced)).toMatchObject({ visual: "photo", photoUrl: photo });
    expect(card(f.models.advanced)).not.toHaveProperty("brandLogoUrl");
    expect(card(f.models.advancedB).visual).toBe("brand_logo");
    expect(card(f.models.advancedB).brandLogoUrl).toEqual(expect.any(String));
    expect(card(f.models.advancedB)).not.toHaveProperty("photoUrl");
    expect(card(f.models.advanced2).visual).toBe("event_placeholder");
    expect(card(f.models.advanced2)).not.toHaveProperty("photoUrl");
    expect(card(f.models.advanced2)).not.toHaveProperty("brandLogoUrl");
    expect(view!.items.filter((item) => item.photoUrl === photo).map((item) => item.eventModelId)).toEqual([f.models.advanced]);
    expect(card(f.models.advancedB)).toMatchObject({ eventSlug: f.eventSlug, brandName: "TEST Om", displayName: "TEST test-om-z2", standMapLocationId: "ispred-15", priceText: "TEST cena" });
  });

  test("map shows the admin-chosen question result (waiting below 5 votes, then whole percentages); garage never does; no voting on the map", async () => {
    const f = await setup();
    const { questionId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, {
      eventModelId: f.models.advanced, eventDayId: f.dayId, prompt: "TEST pitanje za mapu",
      options: [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }], sortOrder: 1,
    });
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId });
    await f.admin.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.models.advanced, questionId });
    await publish(f);
    const item = (await rows(f, "fairSponsoredSnapshotItems")).find((row) => row.eventModelId === f.models.advanced);
    expect(item?.audienceQuestionId).toBe(questionId);

    const cardOf = (view: FairSponsoredRotationView | null) => view!.items.find((row) => row.eventModelId === f.models.advanced)!;
    expect(cardOf(await mapRotation(f)).audienceResult).toEqual({
      questionId, prompt: "TEST pitanje za mapu",
      options: [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }],
      result: { questionId, state: "waiting_for_minimum" },
    });
    for (const optionId of ["o1", "o1", "o2", "o1"]) {
      await f.t.mutation(api.fairInteractions.upsertAudienceVote, { gatewaySecret: GATEWAY_SECRET, visitorHash: visitor(), questionId, optionId });
      expect(cardOf(await mapRotation(f)).audienceResult?.result.state).toBe("waiting_for_minimum");
    }
    await f.t.mutation(api.fairInteractions.upsertAudienceVote, { gatewaySecret: GATEWAY_SECRET, visitorHash: visitor(), questionId, optionId: "o2" });
    expect(cardOf(await mapRotation(f)).audienceResult?.result).toEqual({
      questionId, state: "public", options: [{ optionId: "o1", percentage: 60 }, { optionId: "o2", percentage: 40 }],
    });
    expect(cardOf(await garageRotation(f))).not.toHaveProperty("audienceResult");
    // Models without a chosen question carry no result (the map shows model + stand only).
    expect((await mapRotation(f))!.items.filter((row) => row.audienceResult).map((row) => row.eventModelId)).toEqual([f.models.advanced]);
  });

  test("reading the projections writes nothing (no impression, no visitor, no scan, no counter)", async () => {
    const f = await setup();
    await publish(f);
    const before = await tableSizes(f);
    for (let index = 0; index < 5; index += 1) {
      await mapRotation(f);
      await garageRotation(f);
    }
    expect(await tableSizes(f)).toEqual(before);
    expect(before.fairSponsoredEvents).toBe(0);
    expect(before.fairVisitors).toBe(0);
  });

  test("a draft event or an unknown slug has no public rotation", async () => {
    const f = await setup();
    await publish(f);
    expect(await f.t.query(api.fairPublic.getSponsoredMapRotation, { eventSlug: "test-nepostoji" })).toBeNull();
    await f.t.run(async (ctx) => ctx.db.patch(f.eventId, { status: "draft" }));
    expect(await mapRotation(f)).toBeNull();
    expect(await garageRotation(f)).toBeNull();
  });
});

// =============================================================================
// recordSponsoredAction — garage only, explicit actions only
// =============================================================================

describe("B5 recordSponsoredAction (JOVAN-DELTA §2)", () => {
  test("open_model and garage_add from the garage are stored with Belgrade time keys and anonymous counters — never as a scan", async () => {
    const f = await setup();
    await publish(f);
    const hash = visitor();
    const open = await action(f, hash, f.models.advanced, { kind: "open_model" });
    const add = await action(f, hash, f.models.advanced, { kind: "garage_add" });
    expect(open).toEqual({ eventModelId: f.models.advanced, kind: "open_model", recordedAt: DAY1, duplicate: false });
    expect(add.kind).toBe("garage_add");

    const events = await rows(f, "fairSponsoredEvents");
    expect(events).toHaveLength(2);
    const [visitorRow] = await rows(f, "fairVisitors");
    for (const row of events) {
      expect(row).toMatchObject({ eventId: f.eventId, eventModelId: f.models.advanced, surface: "garage", dateKey: "2026-10-09", hourKey: "2026-10-09T10", visitorId: visitorRow._id });
    }
    expect(JSON.stringify(await rows(f, "fairVisitors"))).not.toContain("token");
    for (const kind of ["open_model", "garage_add"] as const) {
      for (const key of fairSponsoredCountKeys(kind, f.models.advanced, { dateKey: "2026-10-09", hourKey: "2026-10-09T10" })) {
        expect(await count(f, key)).toBe(1);
      }
    }
    // Not the QR scan pipeline: no scan row, unique scan, generic card scan, stamp or scan counter.
    for (const table of ["fairScanEvents", "fairUniqueScans", "cardScanEvents", "fairPassportStamps"] as const) {
      expect(await rows(f, table)).toHaveLength(0);
    }
    expect((await rows(f, "fairMetricCountShards")).some((row) => row.key.startsWith("scan_"))).toBe(false);
    expect((await rows(f, "fairMetricCountShards")).some((row) => /impression/.test(row.key))).toBe(false);
  });

  test("the map, the displays and any other kind are refused without a write", async () => {
    const f = await setup();
    await publish(f);
    const hash = visitor();
    for (const surface of ["map", "display", "Garage", ""]) await expectCode(action(f, hash, f.models.advanced, { surface }), "INVALID_INPUT");
    for (const kind of ["impression", "view", "scan", "auto_add", ""]) await expectCode(action(f, hash, f.models.advanced, { kind }), "INVALID_INPUT");
    await expectCode(action(f, hash, f.models.advanced, { requestId: "x" }), "INVALID_INPUT");
    await expectCode(action(f, "NOT-A-HASH", f.models.advanced), "INVALID_INPUT");
    expect(await tableSizes(f)).toMatchObject({ fairSponsoredEvents: 0, fairVisitors: 0, fairMetricCountShards: 0 });
  });

  test("only an Advanced model in the published snapshot; Starter, included, unknown and not-yet-published are refused", async () => {
    const f = await setup();
    const hash = visitor();
    await expectCode(action(f, hash, f.models.advanced), "FEATURE_NOT_ENTITLED"); // no snapshot yet
    await publish(f);
    await expectCode(action(f, hash, f.models.starter), "FEATURE_NOT_ENTITLED");
    await expectCode(action(f, hash, f.models.included), "FEATURE_NOT_ENTITLED");
    await expectCode(action(f, hash, f.models.draftAdvanced), "FAIR_MODEL_NOT_FOUND");
    await expectCode(action(f, hash, "nepostoji" as Id<"fairEventModels">), "FAIR_MODEL_NOT_FOUND");
    // Upgraded after the publish: not in the snapshot until the next manual publish.
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.models.starter, toTier: "advanced" });
    await expectCode(action(f, hash, f.models.starter), "FEATURE_NOT_ENTITLED");
    expect(await rows(f, "fairSponsoredEvents")).toHaveLength(0);
    expect(await rows(f, "fairVisitors")).toHaveLength(0);
    await publish(f);
    expect((await action(f, hash, f.models.starter)).duplicate).toBe(false);
  });

  test("requestId dedupe: a retry stores nothing new; the same id from another visitor, model or kind is refused", async () => {
    const f = await setup();
    await publish(f);
    const hash = visitor();
    const id = requestId();
    await action(f, hash, f.models.advanced, { requestId: id });
    vi.setSystemTime(DAY1 + 5_000);
    expect(await action(f, hash, f.models.advanced, { requestId: id })).toEqual({ eventModelId: f.models.advanced, kind: "open_model", recordedAt: DAY1, duplicate: true });
    await expectCode(action(f, visitor(), f.models.advanced, { requestId: id }), "SUBMISSION_DUPLICATE");
    await expectCode(action(f, hash, f.models.advanced2, { requestId: id }), "SUBMISSION_DUPLICATE");
    await expectCode(action(f, hash, f.models.advanced, { requestId: id, kind: "garage_add" }), "SUBMISSION_DUPLICATE");
    expect(await rows(f, "fairSponsoredEvents")).toHaveLength(1);
    expect(await count(f, `sponsored_open_model:model:${f.models.advanced}`)).toBe(1);
  });

  test("per-visitor rate limit fairSponsoredAction (capacity 10); another visitor is not affected", async () => {
    const f = await setup();
    await publish(f);
    const hash = visitor();
    for (let index = 0; index < 10; index += 1) await action(f, hash, f.models.advanced, { kind: index % 2 ? "garage_add" : "open_model" });
    await expectCode(action(f, hash, f.models.advanced), "RATE_LIMITED");
    expect(await rows(f, "fairSponsoredEvents")).toHaveLength(10);
    expect((await action(f, visitor(), f.models.advanced)).duplicate).toBe(false);
  });

  test("an event that no longer accepts interactions refuses the action", async () => {
    const f = await setup();
    await publish(f);
    await f.t.run(async (ctx) => ctx.db.patch(f.eventId, { status: "ended" }));
    await expectCode(action(f, visitor(), f.models.advanced), "EVENT_NOT_ACTIVE");
  });
});

// =============================================================================
// Admin UX A9 — the automatic snapshot (ADMIN-UX §8, §12.1; a decision for
// Aleksa's review against MASTER §10 "ručnom admin akcijom")
// =============================================================================

const snapshots = async (f: Fixture) => (await rows(f, "fairSponsoredSnapshots")).sort((x, y) => x.version - y.version);
async function activeItems(f: Fixture) {
  const active = (await snapshots(f)).find((row) => row.status === "published");
  if (!active) return [];
  return (await rows(f, "fairSponsoredSnapshotItems")).filter((row) => row.snapshotId === active._id).sort((x, y) => x.order - y.order);
}
const scheduledSyncs = async (f: Fixture) =>
  (await f.t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").collect())).filter((job) => job.name === "fairSponsoredAdmin:syncSponsoredSnapshotJob");
const rotationAdmin = (f: Fixture) => f.admin.query(api.fairSponsoredAdmin.getSponsoredRotationAdmin, { eventId: f.eventId });
const autoAudit = async (f: Fixture) => (await rows(f, "adminAuditLog")).filter((row) => row.action === "fair_sponsored_snapshot_auto_published");

describe("A9 automatic sponsored snapshot (ADMIN-UX §8, §12.1)", () => {
  test("publishing Advanced models and an upgrade to Napredni publish the snapshot by themselves, as the system, with the same mixing rules", async () => {
    const f = await setup({ auto: true });
    // Setup published three Advanced models one by one before the opening: one new version each.
    const seed = fairSponsoredSeed(f.eventId);
    const history = await snapshots(f);
    expect(history.map((row) => [row.version, row.status, row.trigger, row.dayKey])).toEqual([
      [1, "retired", "auto", "2026-10-08"], [2, "retired", "auto", "2026-10-08"], [3, "published", "auto", "2026-10-08"],
    ]);
    expect(history.every((row) => row.publishedByUserId === undefined)).toBe(true);
    expect((await activeItems(f)).map((item) => item.eventModelId)).toEqual(fairSponsoredOrder([f.models.advanced, f.models.advanced2, f.models.advancedB], seed, "2026-10-08"));

    // An upgrade during the fair day: a new version, shuffled for that day.
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.models.starter, toTier: "advanced" });
    const latest = (await snapshots(f)).at(-1)!;
    expect(latest).toMatchObject({ version: 4, status: "published", trigger: "auto", dayKey: "2026-10-09", publishedAt: DAY1, seed });
    expect(latest.publishedByUserId).toBeUndefined();
    expect((await snapshots(f)).filter((row) => row.status === "published")).toHaveLength(1);
    expect((await activeItems(f)).map((item) => item.eventModelId)).toEqual(
      fairSponsoredOrder([f.models.advanced, f.models.advanced2, f.models.advancedB, f.models.starter], seed, "2026-10-09"),
    );
    // The admin whose change caused it is in the audit; the snapshot itself is the system's.
    const audit = await autoAudit(f);
    expect(audit).toHaveLength(4);
    expect(audit.every((row) => row.actorUserId === f.adminId)).toBe(true);

    // The map, the displays and the garage read the same published snapshot as before (a new version = a new snapshotId).
    const map = await mapRotation(f);
    const garage = await garageRotation(f);
    expect(map).toMatchObject({ snapshotId: latest._id, version: 4, epochMs: DAY1, intervalMs: 12_000 });
    expect(garage).toMatchObject({ snapshotId: latest._id, version: 4, epochMs: DAY1, intervalMs: 8_000 });
    expect(ids(map)).toEqual((await activeItems(f)).map((item) => item.eventModelId));
    expect(ids(garage)).toEqual(ids(map));
  });

  test("withdrawing a model publishes again; a call without a difference makes no version", async () => {
    const f = await setup({ auto: true });
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.models.advanced });
    expect((await snapshots(f)).at(-1)).toMatchObject({ version: 4, status: "published", trigger: "auto" });
    expect((await activeItems(f)).map((item) => item.eventModelId)).not.toContain(f.models.advanced);
    expect(ids(await mapRotation(f))).toHaveLength(2);

    // No difference, no version: the same withdraw again, publishing a published model, a Starter
    // upgrade, clearing a question that was never chosen, and the scheduled job itself.
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.models.advanced });
    await f.admin.mutation(api.fairAdmin.publishModel, { eventModelId: f.models.advanced2 });
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.models.included, toTier: "starter" });
    await f.admin.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.models.advanced2, questionId: null });
    expect(await f.t.mutation(internal.fairSponsoredAdmin.syncSponsoredSnapshotJob, { eventId: f.eventId })).toBe("unchanged");
    expect(await snapshots(f)).toHaveLength(4);
    expect(await autoAudit(f)).toHaveLength(4);

    // Publishing it again brings it back, in a new version.
    await f.admin.mutation(api.fairAdmin.publishModel, { eventModelId: f.models.advanced });
    expect((await snapshots(f)).at(-1)).toMatchObject({ version: 5, status: "published", trigger: "auto" });
    expect(ids(await mapRotation(f))).toContain(f.models.advanced);
  });

  test("choosing the map question publishes it without a manual step; the vote total is an admin-only number", async () => {
    const f = await setup({ auto: true });
    const { questionId } = await f.admin.mutation(api.fairInteractionsAdmin.upsertAudienceQuestion, {
      eventModelId: f.models.advanced, eventDayId: f.dayId, prompt: "TEST pitanje za mapu",
      options: [{ id: "o1", label: "TEST da", order: 1 }, { id: "o2", label: "TEST ne", order: 2 }], sortOrder: 1,
    });
    await f.admin.mutation(api.fairInteractionsAdmin.publishAudienceQuestion, { questionId });
    expect(await snapshots(f)).toHaveLength(3); // a new question alone is not a difference
    await f.admin.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.models.advanced, questionId });
    expect((await snapshots(f)).at(-1)).toMatchObject({ version: 4, trigger: "auto" });
    expect((await activeItems(f)).find((item) => item.eventModelId === f.models.advanced)?.audienceQuestionId).toBe(questionId);
    const card = (await mapRotation(f))!.items.find((item) => item.eventModelId === f.models.advanced)!;
    expect(card.audienceResult).toMatchObject({ questionId, prompt: "TEST pitanje za mapu", result: { state: "waiting_for_minimum" } });
    // The same choice again is not a difference.
    await f.admin.mutation(api.fairInteractionsAdmin.setSponsoredResultQuestion, { eventModelId: f.models.advanced, questionId });
    expect(await snapshots(f)).toHaveLength(4);

    for (const optionId of ["o1", "o2"]) {
      await f.t.mutation(api.fairInteractions.upsertAudienceVote, { gatewaySecret: GATEWAY_SECRET, visitorHash: visitor(), questionId, optionId });
    }
    await expect(f.t.query(api.fairSponsoredAdmin.getSponsoredQuestionVotes, { eventId: f.eventId })).rejects.toThrow();
    await expect(f.member.query(api.fairSponsoredAdmin.getSponsoredQuestionVotes, { eventId: f.eventId })).rejects.toThrow();
    const votes = await f.admin.query(api.fairSponsoredAdmin.getSponsoredQuestionVotes, { eventId: f.eventId });
    expect(votes).toEqual({ threshold: 5, questions: [{ eventModelId: f.models.advanced, questionId, votes: 2 }] });
    expect(JSON.stringify(votes)).not.toMatch(/visitor|optionId/);
    expect(await snapshots(f)).toHaveLength(4); // votes never publish
  });

  test("a package that starts later enters by itself at its activation: one scheduled check, never applied early", async () => {
    const f = await setup({ auto: true });
    expect(ids(await mapRotation(f))).not.toContain(f.models.laterAdvanced);
    const [job, ...more] = await scheduledSyncs(f);
    expect(more).toHaveLength(0);
    expect(job).toMatchObject({ scheduledTime: DAY2, args: [{ eventId: f.eventId }] });
    // Further catalog changes do not schedule the same check again.
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.models.advanced2 });
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.models.starter, toTier: "advanced" });
    expect(await scheduledSyncs(f)).toHaveLength(1);
    const versions = (await snapshots(f)).length;

    await f.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await snapshots(f)).length).toBe(versions + 1);
    const latest = (await snapshots(f)).at(-1)!;
    expect(latest.trigger).toBe("auto");
    expect(latest.publishedAt).toBeGreaterThanOrEqual(DAY2);
    expect(ids(await mapRotation(f))).toContain(f.models.laterAdvanced);
    expect(ids(await mapRotation(f))).not.toContain(f.models.advanced2);
  });

  test("turned off, the list stays manual (Osveži); turned on, it is brought up to date at once", async () => {
    const f = await setup({ auto: true });
    expect((await rotationAdmin(f)).autoPublish).toBe(true);
    expect(await f.admin.mutation(api.fairSponsoredAdmin.setSponsoredAutoPublish, { eventId: f.eventId, enabled: false })).toEqual({ enabled: false, changed: true, sync: null });
    expect((await rotationAdmin(f)).autoPublish).toBe(false);
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: f.models.starter, toTier: "advanced" });
    expect(await snapshots(f)).toHaveLength(3);
    expect(ids(await mapRotation(f))).not.toContain(f.models.starter);

    // The manual publish ("Osveži") still works and is marked as the admin's.
    await publish(f);
    expect((await snapshots(f)).at(-1)).toMatchObject({ version: 4, trigger: "admin", publishedByUserId: f.adminId });
    expect((await rotationAdmin(f)).active).toMatchObject({ version: 4, trigger: "admin" });
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.models.starter });
    expect(await snapshots(f)).toHaveLength(4);

    expect(await f.admin.mutation(api.fairSponsoredAdmin.setSponsoredAutoPublish, { eventId: f.eventId, enabled: true })).toEqual({ enabled: true, changed: true, sync: "published" });
    expect((await snapshots(f)).at(-1)).toMatchObject({ version: 5, trigger: "auto" });
    expect(ids(await mapRotation(f))).not.toContain(f.models.starter);
    expect(await f.admin.mutation(api.fairSponsoredAdmin.setSponsoredAutoPublish, { eventId: f.eventId, enabled: true })).toEqual({ enabled: true, changed: false, sync: "unchanged" });
    expect(await snapshots(f)).toHaveLength(5);
    const actions = (await rows(f, "adminAuditLog")).map((row) => row.action);
    expect(actions.filter((action) => action === "fair_sponsored_auto_disabled")).toHaveLength(1);
    expect(actions.filter((action) => action === "fair_sponsored_auto_enabled")).toHaveLength(1);
    await expect(f.member.mutation(api.fairSponsoredAdmin.setSponsoredAutoPublish, { eventId: f.eventId, enabled: false })).rejects.toThrow();
    expect((await rotationAdmin(f)).autoPublish).toBe(true);
  });

  test("the scheduled job (after an import) publishes a change made outside the admin commands; the admin view shows source, pictures and versions", async () => {
    const f = await setup({ auto: true });
    const photo = "https://example.com/test-volta-x2.jpg";
    // As an import commit leaves it: the catalog changed without an admin command in this transaction.
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.models.draftAdvanced, { status: "published" });
      await ctx.db.patch(f.models.advanced, { photoUrl: photo });
    });
    expect(ids(await mapRotation(f))).not.toContain(f.models.draftAdvanced);
    expect(await f.t.mutation(internal.fairSponsoredAdmin.syncSponsoredSnapshotJob, { eventId: f.eventId })).toBe("published");
    expect(ids(await mapRotation(f))).toContain(f.models.draftAdvanced);
    expect(await autoAudit(f)).toHaveLength(3); // the job has no admin: only the three setup publishes are audited

    const view = await rotationAdmin(f);
    expect(view.autoPublish).toBe(true);
    expect(view.active).toMatchObject({ version: 4, trigger: "auto", dayKey: "2026-10-09" });
    const item = (id: Id<"fairEventModels">) => view.active!.items.find((row) => row.eventModelId === id)!;
    expect(item(f.models.advanced)).toMatchObject({ visual: "photo", photoUrl: photo });
    expect(item(f.models.advanced2)).toMatchObject({ visual: "event_placeholder" });
    expect(item(f.models.advanced2)).not.toHaveProperty("photoUrl");
    expect(view.history.map((row) => [row.version, row.trigger])).toEqual([[4, "auto"], [3, "auto"], [2, "auto"], [1, "auto"]]);
    expect(keysOf(view).filter((key) => /impression|visitor|count|metric/i.test(key))).toEqual([]);
  });

  test("reading the rotation and the admin views writes nothing and publishes nothing", async () => {
    const f = await setup({ auto: true });
    const state = async () => JSON.stringify([await tableSizes(f), await snapshots(f), await rows(f, "fairSponsoredSnapshotItems"), await rows(f, "fairEvents")]);
    const before = await state();
    for (let index = 0; index < 3; index += 1) {
      await mapRotation(f);
      await garageRotation(f);
      await rotationAdmin(f);
      await f.admin.query(api.fairSponsoredAdmin.getSponsoredQuestionVotes, { eventId: f.eventId });
    }
    expect(await state()).toBe(before);
  });
});

// =============================================================================
// Pure helpers and the contract
// =============================================================================

describe("B5 stable daily shuffle and contract types", () => {
  const list = ["m01", "m02", "m03", "m04", "m05", "m06", "m07", "m08"];

  test("same seed + day = same order; it is a permutation; adding a model keeps the others' order", () => {
    const order = fairSponsoredOrder(list, "seed-a", "2026-10-09");
    expect(fairSponsoredOrder([...list].reverse(), "seed-a", "2026-10-09")).toEqual(order);
    expect([...order].sort()).toEqual(list);
    const grown = fairSponsoredOrder([...list, "m09"], "seed-a", "2026-10-09");
    expect(grown.filter((id) => id !== "m09")).toEqual(order);
    // A different day reshuffles (for this fixed list the order differs).
    expect(fairSponsoredOrder(list, "seed-a", "2026-10-10")).not.toEqual(order);
    expect(fairSponsoredOrder(["m01", "m01"], "seed-a", "2026-10-09")).toEqual(["m01"]);
  });

  test("validators equal the lib/fair-contract types", () => {
    expectTypeOf<Infer<typeof fairSponsoredRotationView>>().toEqualTypeOf<FairSponsoredRotationView>();
    expectTypeOf<Infer<typeof fairSponsoredActionResultView>>().toEqualTypeOf<FairSponsoredActionResult>();
  });
});
