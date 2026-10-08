/// <reference types="vite/client" />

// Sajam 2026 B1 — admin catalog, package upgrade, event-only clients and QR
// assignment (BACKEND-HANDOFF §5.1, §7 fairAdmin, §12 "Entitlements i
// aktivacije" + "Izveštaji i izolacija" event-only part).

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { FAIR_PRICE_ON_REQUEST_TEXT } from "../lib/fair-contract";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-03T10:00:00Z");
const ADMIN_EMAIL = "fair-admin@scanme.test";
const ISSUER = "https://fair-b1.test";
const page = (numItems = 50) => ({ numItems, cursor: null });

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

const spec = (order: number, isHighlight = false) => ({ label: `Stavka ${order}`, value: `Vrednost ${order}`, order, isHighlight });

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const outsiderId = await ctx.db.insert("users", { email: "outsider@example.invalid" });
    const client = async (code: string, brandNames: string[]) => {
      const accountId = await ctx.db.insert("accounts", {
        name: `Klijent ${code}`, plan: "basic", status: "active", smkCode: `SMK-${code}`, ownerDisplayName: `Vlasnik ${code}`,
        normalizedOwnerDisplayName: `vlasnik ${code.toLowerCase()}`, clientStatus: "active", adminV1MigrationVersion: 1, createdAt: NOW, updatedAt: NOW,
      });
      const contactId = await ctx.db.insert("accountContacts", {
        accountId, firstName: "Kontakt", lastName: code, normalizedName: `kontakt ${code.toLowerCase()}`, normalizedEmail: `${code.toLowerCase()}@example.invalid`,
        positionTitle: "Vlasnik", isOwner: true, status: "active", createdAt: NOW, updatedAt: NOW,
      });
      await ctx.db.patch(accountId, { defaultContactId: contactId });
      const businessId = await ctx.db.insert("businesses", {
        accountId, name: `Lokal ${code}`, slug: `lokal-${code.toLowerCase()}`, smlCode: `SML-${code}`, kind: "business", clientStatus: "active",
        adminV1MigrationVersion: 1, status: "active", createdAt: NOW,
      });
      const brandIds: Id<"brands">[] = [];
      for (const name of brandNames) {
        brandIds.push(await ctx.db.insert("brands", { accountId, name, normalizedName: name.toLowerCase(), revision: "1", colors: [], createdAt: NOW, updatedAt: NOW }));
      }
      return { accountId, contactId, businessId, brandIds };
    };
    const a = await client("FA", ["Volta", "Amper"]);
    const b = await client("FB", ["Om"]);
    const inventory = await client("QR", []);
    return { adminId, outsiderId, a, b, inventory };
  });
  const admin = t.withIdentity({ subject: ids.adminId, issuer: ISSUER });
  const outsider = t.withIdentity({ subject: ids.outsiderId, issuer: ISSUER });
  const { eventId } = await admin.mutation(api.fairAdmin.upsertEvent, {
    code: "elektromobilnost-2026", slug: "elektromobilnost-2026", title: "Sajam elektromobilnosti", venueName: "Beogradski sajam",
    startsAt: Date.parse("2026-10-09T00:00:00+02:00"), endsAt: Date.parse("2026-10-12T00:00:00+02:00"), garagePriority: 1,
    qrInventoryBusinessId: ids.inventory.businessId,
  });
  const { participationId } = await admin.mutation(api.fairAdmin.upsertParticipation, {
    eventId, externalKey: "em26-izlagac-a", accountId: ids.a.accountId, businessId: ids.a.businessId, primaryContactId: ids.a.contactId,
  });
  const { standId } = await admin.mutation(api.fairAdmin.upsertStand, {
    eventId, participationId, externalKey: "em26-stand-a12", code: "A12", displayName: "Štand A12", mapLocationId: "hala-1a",
  });
  const modelArgs = (overrides: Record<string, unknown> = {}) => ({
    eventId, participationId, standId, brandId: ids.a.brandIds[0], externalKey: "em26-volta-x1", displayName: "Volta X1", variant: "Premium",
    priceText: "4.990.000 RSD", specifications: [spec(1, true), spec(2)], packageTier: "starter" as const, passportEligible: true,
    ...overrides,
  });
  return { t, admin, outsider, ...ids, eventId, participationId, standId, modelArgs };
}
type Fixture = Awaited<ReturnType<typeof setup>>;

async function rowCount(f: Fixture, table: TableNames) {
  return f.t.run(async (ctx) => (await ctx.db.query(table).collect()).length);
}

async function digitalQr(f: Fixture, key: string, scope = { accountId: f.inventory.accountId, businessId: f.inventory.businessId }) {
  const id = await f.admin.mutation(api.adminProducts.createDigital, { ...scope, key });
  return f.t.run(async (ctx) => {
    const code = (await ctx.db.get(id))!;
    return (await ctx.db.get(code.channelId))!;
  });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ data: expect.objectContaining({ code }) });
}

describe("authorization", () => {
  test("every fairAdmin and import function refuses a non-admin and an anonymous caller", async () => {
    const f = await setup();
    const { modelId } = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs());
    const payload = { version: 1, eventCode: "elektromobilnost-2026", participations: [] };
    const calls = (client: typeof f.admin | typeof f.t) => [
      client.mutation(api.fairAdmin.upsertEvent, { code: "x", slug: "x", title: "x", venueName: "x", startsAt: 1, endsAt: 2, garagePriority: 1 }),
      client.mutation(api.fairAdmin.upsertEventDay, { eventId: f.eventId, dateKey: "2026-10-09", label: "Dan 1", sortOrder: 1 }),
      client.mutation(api.fairAdmin.upsertParticipation, { eventId: f.eventId, externalKey: "x", accountId: f.a.accountId, businessId: f.a.businessId }),
      client.mutation(api.fairAdmin.upsertStand, { eventId: f.eventId, participationId: f.participationId, externalKey: "x", code: "x", displayName: "x", mapLocationId: "x" }),
      client.mutation(api.fairAdmin.ensureBrand, { accountId: f.a.accountId, name: "Novi" }),
      client.mutation(api.fairAdmin.upsertModel, f.modelArgs({ externalKey: "x" })),
      client.mutation(api.fairAdmin.publishModel, { eventModelId: modelId }),
      client.mutation(api.fairAdmin.withdrawModel, { eventModelId: modelId }),
      client.mutation(api.fairAdmin.upgradePackage, { eventModelId: modelId, toTier: "advanced" }),
      client.mutation(api.fairAdmin.createEventClient, { accountName: "x", ownerDisplayName: "x", smkCode: "SMK-X", contact: { firstName: "x", lastName: "x", positionTitle: "x" }, venue: { name: "x", slug: "x-x", smlCode: "SML-X" } }),
      client.query(api.fairAdmin.listEventClients, { paginationOpts: page() }),
      client.mutation(api.fairAdmin.convertEventClientToStandard, { accountId: f.a.accountId }),
      client.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: "ABCDEFGH" }),
      client.mutation(api.fairAdmin.releaseQr, { eventModelId: modelId, reason: "x" }),
      client.query(api.fairAdmin.listQrInventory, { eventId: f.eventId, paginationOpts: page() }),
      client.query(api.fairAdmin.resolveTest, { resolverCode: "ABCDEFGH" }),
      client.query(api.fairAdmin.listEvents, {}),
      client.query(api.fairAdmin.getEventCatalog, { eventId: f.eventId }),
      client.query(api.fairAdmin.listValidationIssues, { eventId: f.eventId }),
      client.query(api.fairAdmin.getEventDirectory, { eventId: f.eventId }),
      client.query(api.fairImport.dryRun, { payload }),
      client.mutation(api.fairImport.commit, { payload }),
    ];
    for (const client of [f.outsider, f.t]) {
      const results = await Promise.allSettled(calls(client));
      expect(results.map((r) => r.status)).toEqual(results.map(() => "rejected"));
      for (const r of results) expect(String((r as PromiseRejectedResult).reason)).toMatch(/administratorski pristup|Niste prijavljeni/);
    }
  });
});

describe("idempotent catalog upserts and hard errors", () => {
  test("repeating every upsert with the same input writes nothing new", async () => {
    const f = await setup();
    const day = { eventId: f.eventId, dateKey: "2026-10-09", label: "Petak", sortOrder: 1 };
    expect((await f.admin.mutation(api.fairAdmin.upsertEventDay, day)).result).toBe("created");
    const first = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs());
    expect(first.result).toBe("created");
    const before = await f.t.run(async (ctx) => ({
      event: await ctx.db.get(f.eventId), model: await ctx.db.get(first.modelId), stand: await ctx.db.get(f.standId), participation: await ctx.db.get(f.participationId),
    }));
    vi.setSystemTime(NOW + 60_000);
    const event = before.event!;
    expect((await f.admin.mutation(api.fairAdmin.upsertEvent, {
      code: event.code, slug: event.slug, title: event.title, venueName: event.venueName, startsAt: event.startsAt, endsAt: event.endsAt,
      garagePriority: event.garagePriority, qrInventoryBusinessId: f.inventory.businessId,
    })).result).toBe("unchanged");
    expect((await f.admin.mutation(api.fairAdmin.upsertEventDay, day)).result).toBe("unchanged");
    expect((await f.admin.mutation(api.fairAdmin.upsertParticipation, { eventId: f.eventId, externalKey: "em26-izlagac-a", accountId: f.a.accountId, businessId: f.a.businessId, primaryContactId: f.a.contactId })).result).toBe("unchanged");
    expect((await f.admin.mutation(api.fairAdmin.upsertStand, { eventId: f.eventId, participationId: f.participationId, externalKey: "em26-stand-a12", code: "A12", displayName: "Štand A12", mapLocationId: "hala-1a" })).result).toBe("unchanged");
    const again = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs());
    expect(again).toMatchObject({ modelId: first.modelId, result: "unchanged" });
    const after = await f.t.run(async (ctx) => ({
      event: await ctx.db.get(f.eventId), model: await ctx.db.get(first.modelId), stand: await ctx.db.get(f.standId), participation: await ctx.db.get(f.participationId),
    }));
    expect(after).toEqual(before);
    for (const table of ["fairEvents", "fairEventDays", "fairParticipations", "fairStands", "fairEventModels", "fairPackageActivations"] as const) {
      expect(await rowCount(f, table)).toBe(1);
    }
    // A real edit patches the same row, keeps the slug and leaves the QR alone.
    const edited = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ displayName: "Volta X1 Plus", priceText: undefined }));
    expect(edited.result).toBe("updated");
    expect(edited.warnings.map((w) => w.code)).toContain("FAIR_PRICE_MISSING");
    const model = await f.t.run((ctx) => ctx.db.get(first.modelId));
    expect(model).toMatchObject({ slug: "volta-x1-premium", displayName: "Volta X1 Plus", priceText: FAIR_PRICE_ON_REQUEST_TEXT, status: "draft" });
  });

  test("missing or conflicting account/business/contact/brand links are hard errors", async () => {
    const f = await setup();
    const p = { eventId: f.eventId, externalKey: "em26-izlagac-x" };
    await expectCode(f.admin.mutation(api.fairAdmin.upsertParticipation, { ...p, accountId: f.a.accountId, businessId: f.b.businessId }), "FAIR_LINK_CONFLICT");
    await expectCode(f.admin.mutation(api.fairAdmin.upsertParticipation, { ...p, accountId: f.a.accountId, businessId: f.a.businessId, primaryContactId: f.b.contactId }), "FAIR_LINK_CONFLICT");
    // Same participation key re-linked to another client.
    await expectCode(f.admin.mutation(api.fairAdmin.upsertParticipation, { eventId: f.eventId, externalKey: "em26-izlagac-a", accountId: f.b.accountId, businessId: f.b.businessId }), "FAIR_LINK_CONFLICT");
    // Same business twice in one event under another key.
    await expectCode(f.admin.mutation(api.fairAdmin.upsertParticipation, { ...p, accountId: f.a.accountId, businessId: f.a.businessId }), "FAIR_DUPLICATE_KEY");
    const deletedBusiness = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("businesses", { accountId: f.a.accountId, name: "Obrisan", slug: "obrisan", status: "active", createdAt: NOW });
      await ctx.db.delete(id);
      return id;
    });
    await expectCode(f.admin.mutation(api.fairAdmin.upsertParticipation, { ...p, accountId: f.a.accountId, businessId: deletedBusiness }), "FAIR_LINK_NOT_FOUND");
    // Brand of another account.
    await expectCode(f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ brandId: f.b.brandIds[0] })), "FAIR_LINK_CONFLICT");
    // Stand of another event/participation, duplicate slug, duplicate map location.
    await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs());
    await expectCode(f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ externalKey: "em26-volta-x1-copy" })), "FAIR_SLUG_TAKEN");
    await expectCode(f.admin.mutation(api.fairAdmin.upsertStand, { eventId: f.eventId, participationId: f.participationId, externalKey: "em26-stand-a13", code: "A13", displayName: "A13", mapLocationId: "hala-1a" }), "FAIR_MAP_LOCATION_TAKEN");
    await expectCode(f.admin.mutation(api.fairAdmin.upsertStand, { eventId: f.eventId, participationId: f.participationId, externalKey: "em26-stand-a14", code: "A14", displayName: "A14", mapLocationId: "  " }), "FAIR_MAP_LOCATION_INVALID");
    // M0 geometry: unknown id, another event's id and the ScanMe location are not stands of this map.
    for (const mapLocationId of ["hala-99", "hala-6-7", "scanme"]) {
      await expectCode(f.admin.mutation(api.fairAdmin.upsertStand, { eventId: f.eventId, participationId: f.participationId, externalKey: "em26-stand-a15", code: "A15", displayName: "A15", mapLocationId }), "FAIR_MAP_LOCATION_INVALID");
    }
    await expectCode(f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ externalKey: "Neispravan Ključ" })), "INVALID_INPUT");
    expect(await rowCount(f, "fairParticipations")).toBe(1);
    expect(await rowCount(f, "fairEventModels")).toBe(1);
  });
});

describe("event directory (B1A)", () => {
  test("returns only names, human codes, segment, website and logo for the event's catalog", async () => {
    const f = await setup();
    await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs());
    const directory = await f.admin.query(api.fairAdmin.getEventDirectory, { eventId: f.eventId });
    expect(directory).toEqual({
      accounts: [{ accountId: f.a.accountId, name: "Klijent FA", smkCode: "SMK-FA", clientSegment: "standard", websiteUrl: null }],
      businesses: [{ businessId: f.a.businessId, name: "Lokal FA", smlCode: "SML-FA", logoUrl: null }],
      brands: [{ brandId: f.a.brandIds[0], name: "Volta" }],
    });
    expect(JSON.stringify(directory)).not.toContain("@example.invalid");
    // Izlagači 2026: the public website and logo of the exhibitor (contacts stay out).
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.a.accountId, { websiteUrl: "https://primer.rs/" });
      await ctx.db.patch(f.a.businessId, { logoUrl: "/fair/izlagaci/2026/primer.jpg" });
    });
    const withIdentity = await f.admin.query(api.fairAdmin.getEventDirectory, { eventId: f.eventId });
    expect(withIdentity.accounts[0].websiteUrl).toBe("https://primer.rs/");
    expect(withIdentity.businesses[0].logoUrl).toBe("/fair/izlagaci/2026/primer.jpg");
  });
});

describe("publish validation", () => {
  test("at most 4 highlights, unique slug, price fallback, optional photo, stand needs a map location", async () => {
    const f = await setup();
    await expectCode(f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ specifications: [1, 2, 3, 4, 5].map((n) => spec(n, true)) })), "FAIR_HIGHLIGHT_LIMIT");
    const four = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ priceText: "  ", specifications: [1, 2, 3, 4, 5].map((n) => spec(n, n <= 4)) }));
    const published = await f.admin.mutation(api.fairAdmin.publishModel, { eventModelId: four.modelId });
    expect(published).toMatchObject({ status: "published", changed: true });
    expect(published.warnings.map((w) => w.code).sort()).toEqual(["FAIR_PHOTO_MISSING", "FAIR_PRICE_MISSING", "FAIR_QR_MISSING"]);
    expect((await f.t.run((ctx) => ctx.db.get(four.modelId)))!.priceText).toBe(FAIR_PRICE_ON_REQUEST_TEXT);
    expect((await f.admin.mutation(api.fairAdmin.publishModel, { eventModelId: four.modelId })).changed).toBe(false);

    // Rows that bypassed the upsert are still caught at publish time.
    const broken = await f.t.run(async (ctx) => {
      const model = (await ctx.db.get(four.modelId))!;
      const { _id, _creationTime, ...rest } = model;
      void _id; void _creationTime;
      return ctx.db.insert("fairEventModels", { ...rest, externalKey: "em26-broken", status: "draft", specifications: [1, 2, 3, 4, 5].map((n) => ({ ...spec(n, true), id: `s${n}`, groupId: "g", groupLabel: "", groupOrder: 1 })) });
    });
    await expect(f.admin.mutation(api.fairAdmin.publishModel, { eventModelId: broken })).rejects.toMatchObject({
      data: { code: "FAIR_PUBLISH_INVALID", issues: expect.arrayContaining([expect.objectContaining({ code: "FAIR_HIGHLIGHT_LIMIT" }), expect.objectContaining({ code: "FAIR_SLUG_TAKEN" })]) },
    });
    const empty = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ externalKey: "em26-volta-x2", displayName: "Volta X2", specifications: [] }));
    await expect(f.admin.mutation(api.fairAdmin.publishModel, { eventModelId: empty.modelId })).rejects.toMatchObject({ data: { code: "FAIR_PUBLISH_INVALID" } });
    await f.t.run((ctx) => ctx.db.patch(f.standId, { mapLocationId: "" }));
    await expect(f.admin.mutation(api.fairAdmin.publishModel, { eventModelId: four.modelId })).rejects.toMatchObject({
      data: { code: "FAIR_PUBLISH_INVALID", issues: expect.arrayContaining([expect.objectContaining({ code: "FAIR_MAP_LOCATION_INVALID" })]) },
    });
    const issues = await f.admin.query(api.fairAdmin.listValidationIssues, { eventId: f.eventId });
    expect(issues.find((row) => row.eventModelId === broken)!.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["FAIR_MAP_LOCATION_INVALID", "FAIR_HIGHLIGHT_LIMIT", "FAIR_SLUG_TAKEN"]));
    expect((await f.admin.mutation(api.fairAdmin.withdrawModel, { eventModelId: four.modelId })).status).toBe("withdrawn");
  });
});

describe("package upgrade", () => {
  test("upgrade only upward, audit row in the same mutation, QR identity untouched", async () => {
    const f = await setup();
    const { modelId } = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ packageActiveFrom: Date.parse("2026-10-09T09:00:00+02:00") }));
    const channel = await digitalQr(f, "inv-1");
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: channel.resolverCode });
    const before = await f.t.run(async (ctx) => {
      const subject = (await ctx.db.get(channel.subjectId))!;
      return { subject, card: await ctx.db.get(channel.cardId), assignments: await ctx.db.query("fairQrAssignments").collect(), targets: (await ctx.db.query("cardTargets").collect()).length };
    });
    const initial = await f.t.run((ctx) => ctx.db.query("fairPackageActivations").collect());
    expect(initial).toEqual([expect.objectContaining({ fromTier: "included", toTier: "starter", activatedAt: Date.parse("2026-10-09T09:00:00+02:00"), note: "initial_tier" })]);

    // Upgrade on the second fair day takes effect at that instant.
    const upgradeAt = Date.parse("2026-10-10T12:30:00+02:00");
    vi.setSystemTime(upgradeAt);
    const result = await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: modelId, toTier: "advanced" });
    expect(result).toMatchObject({ fromTier: "starter", toTier: "advanced" });
    const after = await f.t.run(async (ctx) => ({
      model: (await ctx.db.get(modelId))!,
      activation: (await ctx.db.get(result.activationId))!,
      subject: (await ctx.db.get(channel.subjectId))!,
      card: await ctx.db.get(channel.cardId),
      assignments: await ctx.db.query("fairQrAssignments").collect(),
      targets: (await ctx.db.query("cardTargets").collect()).length,
    }));
    expect(after.model).toMatchObject({ packageTier: "advanced", packageActivatedAt: upgradeAt });
    expect(after.activation).toMatchObject({ eventModelId: modelId, fromTier: "starter", toTier: "advanced", activatedAt: upgradeAt, actorUserId: f.adminId });
    expect(after.subject.currentTargetId).toBe(before.subject.currentTargetId);
    expect(after.card).toEqual(before.card);
    expect(after.assignments).toEqual(before.assignments);
    expect(after.targets).toBe(before.targets);

    const activations = await rowCount(f, "fairPackageActivations");
    await expectCode(f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: modelId, toTier: "starter" }), "FAIR_PACKAGE_DOWNGRADE");
    await expectCode(f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: modelId, toTier: "advanced" }), "FAIR_PACKAGE_SAME_TIER");
    await expectCode(f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ packageTier: "included" })), "FAIR_PACKAGE_CHANGE_REQUIRES_UPGRADE");
    expect(await rowCount(f, "fairPackageActivations")).toBe(activations);
    expect((await f.t.run((ctx) => ctx.db.get(modelId)))!.packageTier).toBe("advanced");
  });

  test("an included model upgraded during the fair gets one activation per step", async () => {
    const f = await setup();
    const { modelId } = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ packageTier: "included" }));
    expect(await rowCount(f, "fairPackageActivations")).toBe(0);
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: modelId, toTier: "starter" });
    await f.admin.mutation(api.fairAdmin.upgradePackage, { eventModelId: modelId, toTier: "advanced", note: "doplata" });
    const rows = await f.t.run((ctx) => ctx.db.query("fairPackageActivations").withIndex("by_eventModelId_and_activatedAt", (q) => q.eq("eventModelId", modelId)).collect());
    expect(rows.map((r) => [r.fromTier, r.toTier])).toEqual([["included", "starter"], ["starter", "advanced"]]);
  });
});

describe("QR inventory assignment", () => {
  test("atomic assign/release, one active per channel and per model, resolve test without a scan", async () => {
    const f = await setup();
    const x1 = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs());
    const x2 = await f.admin.mutation(api.fairAdmin.upsertModel, f.modelArgs({ externalKey: "em26-volta-x2", displayName: "Volta X2", variant: undefined }));
    const qr1 = await digitalQr(f, "inv-1");
    const qr2 = await digitalQr(f, "inv-2");
    const foreign = await digitalQr(f, "foreign", { accountId: f.b.accountId, businessId: f.b.businessId });

    const before = await f.t.run(async (ctx) => ({ history: (await ctx.db.query("accessDestinationHistory").collect()).length, card: (await ctx.db.get(qr1.cardId))! }));
    const assigned = await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: x1.modelId, resolverCode: qr1.resolverCode.toLowerCase() });
    expect(assigned.created).toBe(true);
    const state = await f.t.run(async (ctx) => {
      const subject = (await ctx.db.get(qr1.subjectId))!;
      return {
        subject,
        target: (await ctx.db.get(subject.currentTargetId!))!,
        channel: (await ctx.db.get(qr1._id))!,
        card: (await ctx.db.get(qr1.cardId))!,
        history: await ctx.db.query("accessDestinationHistory").withIndex("by_subjectId_and_createdAt", (q) => q.eq("subjectId", subject._id)).collect(),
        assignment: (await ctx.db.get(assigned.assignmentId))!,
      };
    });
    expect(state.target).toMatchObject({ kind: "fair_model", fairEventModelId: x1.modelId, cardId: qr1.cardId });
    expect(state.subject).toMatchObject({ destinationKind: "fair_model", destinationInput: { kind: "fair_model", eventModelId: x1.modelId } });
    expect(state.history.at(-1)).toMatchObject({ targetId: state.subject.currentTargetId, actor: { kind: "admin", userId: f.adminId } });
    expect(state.history).toHaveLength(1);
    expect(await rowCount(f, "accessDestinationHistory")).toBe(before.history + 1);
    expect(state.channel).toMatchObject({ state: "active", businessId: f.inventory.businessId, accountId: f.inventory.accountId });
    expect(state.card.businessId).toBe(before.card.businessId);
    expect(state.assignment).toMatchObject({ status: "assigned", accessChannelId: qr1._id, accessSubjectId: qr1.subjectId, cardId: qr1.cardId, resolverCode: qr1.resolverCode, assignedByUserId: f.adminId });

    // Idempotent re-assign; conflicts never write a partial row.
    // N1: the result names the model's status (x1 is still a draft here).
    expect(await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: x1.modelId, resolverCode: qr1.resolverCode })).toEqual({ assignmentId: assigned.assignmentId, created: false, modelStatus: "draft" });
    const counts = async () => ({ assignments: await rowCount(f, "fairQrAssignments"), targets: await rowCount(f, "cardTargets"), history: await rowCount(f, "accessDestinationHistory") });
    const stable = await counts();
    await expectCode(f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: x2.modelId, resolverCode: qr1.resolverCode }), "FAIR_QR_ALREADY_ASSIGNED");
    await expectCode(f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: x1.modelId, resolverCode: qr2.resolverCode }), "FAIR_MODEL_ALREADY_ASSIGNED");
    await expectCode(f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: x2.modelId, resolverCode: foreign.resolverCode }), "FAIR_QR_NOT_IN_INVENTORY");
    await expectCode(f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: x2.modelId, resolverCode: "nije-kod" }), "FAIR_QR_NOT_IN_INVENTORY");
    expect(await counts()).toEqual(stable);

    // Resolve test: draft model is not opened; published model is; no scan written.
    expect(await f.admin.query(api.fairAdmin.resolveTest, { resolverCode: qr1.resolverCode })).toMatchObject({ outcome: "invalid", problem: "fair_model_not_published", path: "/sajam/elektromobilnost-2026/model/volta-x1-premium" });
    await f.admin.mutation(api.fairAdmin.publishModel, { eventModelId: x1.modelId });
    expect(await f.admin.query(api.fairAdmin.resolveTest, { resolverCode: qr1.resolverCode })).toMatchObject({
      outcome: "fair_model", problem: null, targetKind: "fair_model", eventModelId: x1.modelId, assignmentId: assigned.assignmentId, path: "/sajam/elektromobilnost-2026/model/volta-x1-premium",
    });
    expect(await f.admin.query(api.fairAdmin.resolveTest, { resolverCode: "ZZZZZZZZ" })).toMatchObject({ outcome: "invalid", problem: "code_unknown" });
    expect(await rowCount(f, "cardScanEvents")).toBe(0);
    expect((await f.t.run((ctx) => ctx.db.get(qr1.cardId)))!.totalScans).toBe(0);

    const inventory = await f.admin.query(api.fairAdmin.listQrInventory, { eventId: f.eventId, paginationOpts: page() });
    expect(inventory.page.map((row) => [row.resolverCode, row.assignment?.eventModelId ?? null])).toEqual(expect.arrayContaining([[qr1.resolverCode, x1.modelId], [qr2.resolverCode, null]]));
    expect(inventory.page.some((row) => row.resolverCode === foreign.resolverCode)).toBe(false);

    // Release: same transaction marks the row and takes the code out of service.
    const released = await f.admin.mutation(api.fairAdmin.releaseQr, { eventModelId: x1.modelId, reason: "Pogrešna nalepnica" });
    expect(released).toEqual({ assignmentId: assigned.assignmentId, released: true });
    expect(await f.t.run((ctx) => ctx.db.get(assigned.assignmentId))).toMatchObject({ status: "released", releasedAt: NOW, releasedByUserId: f.adminId, reason: "Pogrešna nalepnica" });
    expect(await f.t.run((ctx) => ctx.db.get(qr1._id))).toMatchObject({ state: "problem", problemReason: "destination_fair_unassigned" });
    expect(await f.admin.query(api.fairAdmin.resolveTest, { resolverCode: qr1.resolverCode })).toMatchObject({ outcome: "invalid", problem: "destination_fair_unassigned" });
    expect(await f.admin.mutation(api.fairAdmin.releaseQr, { eventModelId: x1.modelId, reason: "Ponovo" })).toEqual({ assignmentId: null, released: false });

    // The freed code can go to another model: new immutable target + history.
    const re = await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: x2.modelId, resolverCode: qr1.resolverCode });
    const reState = await f.t.run(async (ctx) => {
      const subject = (await ctx.db.get(qr1.subjectId))!;
      const history = await ctx.db.query("accessDestinationHistory").withIndex("by_subjectId_and_createdAt", (q) => q.eq("subjectId", subject._id)).collect();
      return { subject, target: (await ctx.db.get(subject.currentTargetId!))!, last: history.at(-1)!, oldTarget: (await ctx.db.get(state.subject.currentTargetId!))! };
    });
    expect(re.created).toBe(true);
    expect(reState.target).toMatchObject({ kind: "fair_model", fairEventModelId: x2.modelId });
    expect(reState.last).toMatchObject({ previousTargetId: state.subject.currentTargetId, targetId: reState.subject.currentTargetId });
    expect(reState.oldTarget).toMatchObject({ kind: "fair_model", fairEventModelId: x1.modelId });
    expect(await f.t.run((ctx) => ctx.db.query("fairQrAssignments").withIndex("by_accessChannelId_and_status", (q) => q.eq("accessChannelId", qr1._id).eq("status", "assigned")).collect())).toHaveLength(1);
  });

  test("the generic access API still cannot create a fair_model destination", async () => {
    const f = await setup();
    await expect(f.admin.mutation(api.adminProducts.createDigital, {
      accountId: f.inventory.accountId, businessId: f.inventory.businessId, key: "generic-fair",
      destination: { kind: "fair_model", eventModelId: "x" } as never,
    })).rejects.toThrow();
  });
});

describe("event-only clients", () => {
  async function standardClientRow(f: Fixture) {
    await f.t.run(async (ctx) => {
      await ctx.db.insert("adminClientReadModels", {
        accountId: f.a.accountId, smkCode: "SMK-FA", accountName: "Klijent FA", ownerDisplayName: "Vlasnik FA", normalizedOwnerDisplayName: "vlasnik fa",
        defaultContactEmail: null, defaultContactPhone: null, firstVenueName: null, venueCount: 1, clientStatus: "active",
        signal: { severity: null, causeId: null }, urgencyRank: 3,
        serviceSummaries: {
          scanme_links: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
          google_review: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
          scanme_menu: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
        },
        premiumStatus: null, searchText: "vlasnik fa klijent", updatedAt: NOW,
      });
    });
  }
  const eventClient = {
    accountName: "Auto Kuća Test d.o.o.", ownerDisplayName: "Petar Petrović", smkCode: "smk-ev-1",
    contact: { firstName: "Petar", lastName: "Petrović", email: "Petar@Example.invalid", positionTitle: "Direktor" },
    venue: { name: "Auto Kuća Test", slug: "auto-kuca-test", smlCode: "SML-EV-1", city: "Beograd" },
  };

  test("event-only client is not in the standard Clients list; conversion patches the same records", async () => {
    const f = await setup();
    await standardClientRow(f);
    const created = await f.admin.mutation(api.fairAdmin.createEventClient, eventClient);
    expect(created.result).toBe("created");
    expect(await f.admin.mutation(api.fairAdmin.createEventClient, eventClient)).toEqual({ ...created, result: "unchanged" });
    const stored = await f.t.run(async (ctx) => ({
      account: (await ctx.db.get(created.accountId))!,
      business: (await ctx.db.get(created.businessId))!,
      contact: (await ctx.db.get(created.contactId))!,
      clientRow: (await ctx.db.query("adminClientReadModels").withIndex("by_accountId", (q) => q.eq("accountId", created.accountId)).unique())!,
      venueRow: (await ctx.db.query("adminVenueReadModels").withIndex("by_businessId", (q) => q.eq("businessId", created.businessId)).unique())!,
    }));
    expect(stored.account).toMatchObject({ clientSegment: "event_only", smkCode: "SMK-EV-1", defaultContactId: created.contactId });
    expect(stored.business).toMatchObject({ accountId: created.accountId, smlCode: "SML-EV-1", kind: "business" });
    expect(stored.contact).toMatchObject({ accountId: created.accountId, normalizedEmail: "petar@example.invalid" });
    expect(stored.clientRow.clientSegment).toBe("event_only");
    expect(stored.venueRow.clientSegment).toBe("event_only");

    const listed = async (search?: string) => (await f.admin.query(api.adminReadModels.listClients, { paginationOpts: page(), status: "all", sort: "name", ...(search ? { search } : {}) })).page.map((row) => row.accountId);
    expect(await listed()).toEqual([f.a.accountId]);
    expect(await listed("petar")).toEqual([]);
    const eventClients = await f.admin.query(api.fairAdmin.listEventClients, { paginationOpts: page() });
    expect(eventClients.page.map((row) => row.accountId)).toEqual([created.accountId]);

    // The client takes part in the fair and gets a QR before conversion.
    const p = await f.admin.mutation(api.fairAdmin.upsertParticipation, { eventId: f.eventId, externalKey: "em26-auto-kuca", accountId: created.accountId, businessId: created.businessId, primaryContactId: created.contactId });
    await digitalQr(f, "event-client-qr", { accountId: created.accountId, businessId: created.businessId });
    const tables = ["accounts", "businesses", "accountContacts", "brands", "cards", "accessChannels", "accessSubjects", "digitalQrCodes", "fairParticipations", "adminClientReadModels", "adminVenueReadModels"] as const;
    const countsBefore = await Promise.all(tables.map((table) => rowCount(f, table)));
    const snapshot = await f.t.run(async (ctx) => ({ business: await ctx.db.get(created.businessId), contact: await ctx.db.get(created.contactId), participation: await ctx.db.get(p.participationId) }));

    expect(await f.admin.mutation(api.fairAdmin.convertEventClientToStandard, { accountId: created.accountId })).toEqual({ changed: true });
    expect(await f.admin.mutation(api.fairAdmin.convertEventClientToStandard, { accountId: created.accountId })).toEqual({ changed: false });
    expect(await Promise.all(tables.map((table) => rowCount(f, table)))).toEqual(countsBefore);
    expect(await f.t.run(async (ctx) => ({ business: await ctx.db.get(created.businessId), contact: await ctx.db.get(created.contactId), participation: await ctx.db.get(p.participationId) }))).toEqual(snapshot);
    expect((await f.t.run((ctx) => ctx.db.get(created.accountId)))!.clientSegment).toBe("standard");
    expect((await listed()).sort()).toEqual([f.a.accountId, created.accountId].sort());
    expect(await listed("petar")).toEqual([created.accountId]);
    expect((await f.admin.query(api.fairAdmin.listEventClients, { paginationOpts: page() })).page).toEqual([]);
  });

  test("a taken SMK/SML code or an existing standard client is never overwritten", async () => {
    const f = await setup();
    await expectCode(f.admin.mutation(api.fairAdmin.createEventClient, { ...eventClient, smkCode: "SMK-FA" }), "FAIR_CLIENT_CODE_TAKEN");
    await expectCode(f.admin.mutation(api.fairAdmin.createEventClient, { ...eventClient, venue: { ...eventClient.venue, smlCode: "SML-FA" } }), "FAIR_CLIENT_CODE_TAKEN");
    await expectCode(f.admin.mutation(api.fairAdmin.createEventClient, { ...eventClient, smkCode: "nije kod" }), "INVALID_INPUT");
    expect((await f.t.run((ctx) => ctx.db.get(f.a.accountId)))!.clientSegment).toBeUndefined();
    expect(await f.admin.mutation(api.fairAdmin.convertEventClientToStandard, { accountId: f.a.accountId })).toEqual({ changed: false });
  });
});
