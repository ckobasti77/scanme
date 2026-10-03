/// <reference types="vite/client" />

// Sajam 2026 B2 — the public read-only catalog resolver (BACKEND-HANDOFF §6,
// §7 fairPublic; JOVAN-DELTA §1, §3): no PII, server capabilities from
// lib/fair-entitlements.ts, no rating aggregate, grouped/ordered
// specifications, and reading a model is never a scan (HANDOFF §10).

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { Infer } from "convex/values";
import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { fairPublicEventView, fairPublicModelView } from "./lib/fairValidators";
import type { FairPublicEvent, FairPublicModel } from "../lib/fair-contract";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-03T10:00:00Z");
const ADMIN_EMAIL = "fair-admin@scanme.test";
const ISSUER = "https://fair-b2-public.test";
const REPORT_EMAIL = "izvestaji-test@example.invalid";
const CONTACT_EMAIL = "kontakt-test@example.invalid";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const MODEL_KEYS = [
  "brandId", "brandName", "capabilities", "displayName", "eventId", "eventSlug", "eventTitle", "exhibitorName", "id",
  "participationId", "priceText", "slug", "specificationGroups", "standId", "standMapLocationId",
];

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const accountId = await ctx.db.insert("accounts", {
      name: "TEST klijent", plan: "basic", status: "active", smkCode: "SMK-TP", ownerDisplayName: "TEST vlasnik",
      normalizedOwnerDisplayName: "test vlasnik", clientStatus: "active", adminV1MigrationVersion: 1, createdAt: NOW, updatedAt: NOW,
    });
    const contactId = await ctx.db.insert("accountContacts", {
      accountId, firstName: "TEST", lastName: "Kontakt", normalizedName: "test kontakt", normalizedEmail: CONTACT_EMAIL,
      positionTitle: "TEST", isOwner: true, status: "active", createdAt: NOW, updatedAt: NOW,
    });
    const businessId = await ctx.db.insert("businesses", {
      accountId, name: "TEST izlagač", slug: "test-izlagac", smlCode: "SML-TP", kind: "business", clientStatus: "active",
      adminV1MigrationVersion: 1, status: "active", createdAt: NOW,
    });
    const brandId = await ctx.db.insert("brands", { accountId, name: "TEST Volta", normalizedName: "test volta", revision: "1", colors: [], createdAt: NOW, updatedAt: NOW });
    return { adminId, accountId, contactId, businessId, brandId };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });

  const fair = async (code: string, status: "published" | "draft") => {
    const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
      code, slug: code, title: `TEST ${code}`, venueName: "TEST hala",
      startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-12T00:00:00+02:00"), status, garagePriority: 1,
    });
    const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
      eventId, externalKey: `${code}-izlagac`, accountId: ids.accountId, businessId: ids.businessId, primaryContactId: ids.contactId,
      reportRecipientEmail: REPORT_EMAIL, leadDeliveryNote: "TEST napomena o isporuci",
    });
    const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
      eventId, participationId, externalKey: `${code}-stand`, code: "TEST-A1", displayName: "TEST štand", mapLocationId: `${code}-loc-a1`,
    });
    return { eventId, participationId, standId };
  };
  const em = await fair("test-elektromobilnost-2026", "published");
  await admin.mutation(api.fairAdmin.upsertEventDay, { eventId: em.eventId, dateKey: "2026-10-10", label: "TEST dan 2", sortOrder: 2 });
  await admin.mutation(api.fairAdmin.upsertEventDay, { eventId: em.eventId, dateKey: "2026-10-09", label: "TEST dan 1", sortOrder: 1 });

  const model = async (
    where: typeof em,
    externalKey: string,
    packageTier: "included" | "starter" | "advanced",
    publish = true,
  ) => {
    const { modelId } = await admin.mutation(api.fairAdmin.upsertModel, {
      eventId: where.eventId, participationId: where.participationId, standId: where.standId, brandId: ids.brandId,
      externalKey, displayName: `TEST ${externalKey}`, variant: "TEST varijanta", priceText: "TEST cena", packageTier, passportEligible: false,
      // Stored out of order on purpose: the server returns group/item order.
      specifications: [
        { label: "TEST punjenje", value: "TEST 4", order: 4, groupId: "test-ostalo", groupLabel: "TEST ostalo", groupOrder: 2 },
        { label: "TEST snaga", value: "TEST 1", order: 1, groupId: "test-pogon", groupLabel: "TEST pogon", groupOrder: 1, isHighlight: true },
        { label: "TEST masa", value: "TEST 3", order: 3, groupId: "test-ostalo", groupLabel: "TEST ostalo", groupOrder: 2 },
        { label: "TEST domet", value: "TEST 2", order: 2, groupId: "test-pogon", groupLabel: "TEST pogon", groupOrder: 1 },
      ],
    });
    if (publish) await admin.mutation(api.fairAdmin.publishModel, { eventModelId: modelId });
    const slug = await t.run(async (ctx) => (await ctx.db.get(modelId))!.slug);
    return { modelId, slug };
  };
  const starter = await model(em, "test-volta-starter", "starter");
  const advanced = await model(em, "test-volta-advanced", "advanced");
  const included = await model(em, "test-volta-included", "included");
  const draft = await model(em, "test-volta-draft", "starter", false);
  const draftEvent = await fair("test-draft-fair-2026", "draft");
  return { t, admin, ...ids, em, draftEvent, starter, advanced, included, draft, model };
}

async function rows(t: Awaited<ReturnType<typeof setup>>["t"], table: TableNames) {
  return t.run(async (ctx) => ctx.db.query(table).collect());
}

describe("getEventBySlug", () => {
  test("returns the public event with Belgrade days in order; draft and unknown events are not public", async () => {
    const f = await setup();
    const event = await f.t.query(api.fairPublic.getEventBySlug, { slug: "test-elektromobilnost-2026" });
    expect(event).toMatchObject({
      id: f.em.eventId, code: "test-elektromobilnost-2026", slug: "test-elektromobilnost-2026", timezone: "Europe/Belgrade", status: "published",
    });
    expect(event?.days.map((day) => [day.dateKey, day.label])).toEqual([["2026-10-09", "TEST dan 1"], ["2026-10-10", "TEST dan 2"]]);
    expect(Object.keys(event!).sort()).toEqual(
      ["code", "days", "endsAt", "garagePriority", "id", "slug", "startsAt", "status", "timezone", "title", "venueName"],
    );
    expect(await f.t.query(api.fairPublic.getEventBySlug, { slug: "test-draft-fair-2026" })).toBeNull();
    expect(await f.t.query(api.fairPublic.getEventBySlug, { slug: "nepostojeci" })).toBeNull();
    expect(await f.t.query(api.fairPublic.getEventBySlug, { slug: "x".repeat(500) })).toBeNull();
  });
});

describe("getModelBySlug", () => {
  test("projects the published model with server-ordered groups and no PII", async () => {
    const f = await setup();
    const view = await f.t.query(api.fairPublic.getModelBySlug, { eventSlug: "test-elektromobilnost-2026", modelSlug: f.starter.slug });
    expect(view).not.toBeNull();
    expect(Object.keys(view!).sort()).toEqual([...MODEL_KEYS, "variant"].sort());
    expect(view).toMatchObject({
      id: f.starter.modelId, eventId: f.em.eventId, eventSlug: "test-elektromobilnost-2026", eventTitle: "TEST test-elektromobilnost-2026",
      participationId: f.em.participationId, exhibitorName: "TEST izlagač", brandId: f.brandId, brandName: "TEST Volta", standId: f.em.standId,
      standMapLocationId: "test-elektromobilnost-2026-loc-a1", slug: f.starter.slug, priceText: "TEST cena",
    });
    expect(view!.specificationGroups.map((group) => [group.id, group.order, group.items.map((item) => item.order)])).toEqual([
      ["test-pogon", 1, [1, 2]],
      ["test-ostalo", 2, [3, 4]],
    ]);
    expect(view!.specificationGroups[0].items[0]).toMatchObject({ label: "TEST snaga", isHighlight: true });
    const dump = JSON.stringify(view);
    for (const secret of [REPORT_EMAIL, CONTACT_EMAIL, "TEST napomena o isporuci", "SMK-TP", "SML-TP", "\"starter\"", "packageTier"]) {
      expect(dump).not.toContain(secret);
    }
  });

  test("capabilities come from lib/fair-entitlements.ts × live facts, never from a tier string", async () => {
    const f = await setup();
    const read = (slug: string) => f.t.query(api.fairPublic.getModelBySlug, { eventSlug: "test-elektromobilnost-2026", modelSlug: slug });
    const none = { canSubmitInterest: false, canRequestTestDrive: false, hasAudienceQuestions: false, hasSurvey: false, isSponsored: false };
    expect((await read(f.included.slug))?.capabilities).toEqual({ ratingMode: "none", ...none });
    expect((await read(f.starter.slug))?.capabilities).toEqual({ ratingMode: "overall", ...none });
    expect((await read(f.advanced.slug))?.capabilities).toEqual({ ratingMode: "dimensions", ...none });

    // Enabled lead configs: interest is Starter+, test drive only Advanced.
    await f.t.run(async (ctx) => {
      for (const eventModelId of [f.included.modelId, f.starter.modelId, f.advanced.modelId]) {
        for (const leadKind of ["interest", "test_drive"] as const) {
          await ctx.db.insert("fairLeadConfigs", {
            eventModelId, leadKind, contactRequirement: "one_of", enabled: true, updatedByUserId: f.adminId, createdAt: NOW, updatedAt: NOW,
          });
        }
      }
    });
    expect((await read(f.included.slug))?.capabilities).toMatchObject({ canSubmitInterest: false, canRequestTestDrive: false });
    expect((await read(f.starter.slug))?.capabilities).toMatchObject({ canSubmitInterest: true, canRequestTestDrive: false });
    expect((await read(f.advanced.slug))?.capabilities).toMatchObject({ canSubmitInterest: true, canRequestTestDrive: true });
  });

  test("never returns a rating count, sum or average (JOVAN-DELTA §1)", async () => {
    const f = await setup();
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 7; i++) {
        const visitorId = await ctx.db.insert("fairVisitors", { visitorHash: String(i).repeat(64), firstSeenAt: NOW, lastSeenAt: NOW });
        await ctx.db.insert("fairRatings", { visitorId, eventId: f.em.eventId, eventModelId: f.starter.modelId, overall: 5, createdAt: NOW, updatedAt: NOW });
      }
    });
    const view = await f.t.query(api.fairPublic.getModelBySlug, { eventSlug: "test-elektromobilnost-2026", modelSlug: f.starter.slug });
    expect(Object.keys(view!).sort()).toEqual([...MODEL_KEYS, "variant"].sort());
    expect(JSON.stringify(view)).not.toMatch(/average|ratingCount|ratingSum|visitorHash/i);
  });

  test("draft, withdrawn and unknown models are not public", async () => {
    const f = await setup();
    const read = (modelSlug: string) => f.t.query(api.fairPublic.getModelBySlug, { eventSlug: "test-elektromobilnost-2026", modelSlug });
    expect(await read(f.draft.slug)).toBeNull();
    await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: f.advanced.modelId });
    expect(await read(f.advanced.slug)).toBeNull();
    expect(await read("nepostojeci-model")).toBeNull();
    expect(await f.t.query(api.fairPublic.getModelBySlug, { eventSlug: "nepostojeci", modelSlug: f.starter.slug })).toBeNull();
  });
});

describe("getModelsByIds (local garage)", () => {
  test("returns published models in input order across events; skips unknown, malformed, draft and duplicate ids", async () => {
    const f = await setup();
    const other = await f.model(f.draftEvent, "test-volta-other-fair", "starter");
    const views = await f.t.query(api.fairPublic.getModelsByIds, {
      ids: [f.advanced.modelId, "nije-id", f.draft.modelId, other.modelId, f.starter.modelId, f.advanced.modelId],
    });
    expect(views.map((view) => view.id)).toEqual([f.advanced.modelId, other.modelId, f.starter.modelId]);
  });

  test(`refuses more than 50 ids`, async () => {
    const f = await setup();
    const ids = Array.from({ length: 51 }, () => f.starter.modelId as string);
    await expect(f.t.query(api.fairPublic.getModelsByIds, { ids })).rejects.toMatchObject({ data: { code: "INVALID_INPUT" } });
    expect(await f.t.query(api.fairPublic.getModelsByIds, { ids: ids.slice(0, 50) })).toHaveLength(1);
  });
});

describe("a model read is not a scan (HANDOFF §10)", () => {
  test("opening a model from the garage or a sponsored card writes nothing", async () => {
    const f = await setup();
    for (let i = 0; i < 5; i++) {
      await f.t.query(api.fairPublic.getModelBySlug, { eventSlug: "test-elektromobilnost-2026", modelSlug: f.starter.slug });
      await f.t.query(api.fairPublic.getModelsByIds, { ids: [f.starter.modelId, f.advanced.modelId] });
    }
    for (const table of ["fairScanEvents", "fairUniqueScans", "fairVisitors", "fairMetricCountShards", "cardScanEvents"] as const) {
      expect(await rows(f.t, table), table).toEqual([]);
    }
  });
});

describe("contract types and validators never drift", () => {
  test("the public view validators equal FairPublicEvent / FairPublicModel", () => {
    expectTypeOf<Infer<typeof fairPublicEventView>>().toEqualTypeOf<FairPublicEvent>();
    expectTypeOf<Infer<typeof fairPublicModelView>>().toEqualTypeOf<FairPublicModel>();
  });
});
