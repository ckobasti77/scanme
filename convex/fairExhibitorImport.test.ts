/// <reference types="vite/client" />

// Izlagači 2026 — the organizer's exhibitor list written into one event
// (convex/fairExhibitorImport.ts): canonical event-only clients with logo and
// website, one active participation each, idempotent and never overwriting a
// hand edit; the client profile of such an exhibitor (no ScanMe login) with
// its website; and the event moved to the printed SA26 inventory: labels are
// listed and found, codes of the old inventory that still lead to its models
// stay manageable. TEST event data; the exhibitor list is the public one.

import { convexTest } from "convex-test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { ELEKTROMOBILNOST_2026_EXHIBITORS } from "../lib/fair-import/izlagaci-2026";

vi.mock("server-only", () => ({}));

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-10-06T21:00:00+02:00");
const ADMIN_EMAIL = "izlagaci-2026@scanme.test";
const ISSUER = "https://izlagaci-2026.test";
const EM = "test-elektromobilnost-2026";
const AMF = "test-auto-moto-fest-2026";
const LIST = "elektromobilnost-2026" as const;
const COUNT = ELEKTROMOBILNOST_2026_EXHIBITORS.length;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
  process.env.FAIR_GATEWAY_SECRET = "test-fair-gateway-secret-0123456789abcdef";
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("no network in tests"); }));
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  delete process.env.FAIR_GATEWAY_SECRET;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const { adminId, memberId } = await t.run(async (ctx) => ({
    adminId: await ctx.db.insert("users", { email: ADMIN_EMAIL }),
    memberId: await ctx.db.insert("users", { email: "klijent@example.invalid" }),
  }));
  const seed = await t.mutation(internal.fairDevFixtures.seedIntegrationTest, {});
  const eventId = await t.run(async (ctx) => (await ctx.db.query("fairEvents").withIndex("by_code", (q) => q.eq("code", EM)).unique())!._id);
  return {
    t,
    seed,
    eventId,
    admin: t.withIdentity({ subject: adminId, issuer: ISSUER }),
    member: t.withIdentity({ subject: memberId, issuer: ISSUER }),
  };
}

type Fixture = Awaited<ReturnType<typeof setup>>;
const importList = (f: Fixture, ownerEmail = ADMIN_EMAIL, eventCode = EM) =>
  f.t.mutation(internal.fairExhibitorImport.importSiteExhibitors, { ownerEmail, eventCode, list: LIST });

async function exhibitor(f: Fixture, key: string) {
  return f.t.run(async (ctx) => {
    const upper = key.toUpperCase();
    const account = (await ctx.db.query("accounts").withIndex("by_smkCode", (q) => q.eq("smkCode", `SMK-IZL26-${upper}`)).first())!;
    const business = (await ctx.db.query("businesses").withIndex("by_smlCode", (q) => q.eq("smlCode", `SML-IZL26-${upper}`)).first())!;
    const contact = account.defaultContactId ? await ctx.db.get(account.defaultContactId) : null;
    const participation = await ctx.db
      .query("fairParticipations")
      .withIndex("by_eventId_and_externalKey", (q) => q.eq("eventId", f.eventId).eq("externalKey", `izl26-${key}`))
      .unique();
    return { account, business, contact, participation };
  });
}

describe("Izlagači 2026: the organizer's list in one event", () => {
  test("every exhibitor becomes an event-only client with its logo and website and one active participation", async () => {
    const f = await setup();
    expect(await importList(f)).toEqual({
      exhibitors: COUNT,
      clients: { created: COUNT, updated: 0, unchanged: 0 },
      participations: { created: COUNT, updated: 0, unchanged: 0 },
    });
    const ferum = await exhibitor(f, "ferum-baw");
    expect(ferum.account).toMatchObject({ name: "Ferum BAW", smkCode: "SMK-IZL26-FERUM-BAW", clientSegment: "event_only", clientStatus: "active", websiteUrl: "https://www.ferum-doo.com/" });
    expect(ferum.business).toMatchObject({ name: "Ferum BAW", smlCode: "SML-IZL26-FERUM-BAW", logoUrl: "/fair/izlagaci/2026/ferum-baw.jpg", accountId: ferum.account._id });
    expect(ferum.participation).toMatchObject({ accountId: ferum.account._id, businessId: ferum.business._id, status: "active" });
    // The list has no people: an explicit placeholder contact, never an invented e-mail or phone.
    expect(ferum.contact).toMatchObject({ firstName: "Kontakt", lastName: "nije unet", isOwner: true, status: "active" });
    expect(ferum.contact?.normalizedEmail).toBeUndefined();
    expect(ferum.contact?.normalizedPhone).toBeUndefined();
    // No link on the organizer's page → no website.
    expect((await exhibitor(f, "makete")).account.websiteUrl).toBeUndefined();

    const directory = await f.admin.query(api.fairAdmin.getEventDirectory, { eventId: f.eventId });
    expect(directory.accounts.find((row) => row.accountId === ferum.account._id)).toMatchObject({ websiteUrl: "https://www.ferum-doo.com/", clientSegment: "event_only" });
    expect(directory.businesses.find((row) => row.businessId === ferum.business._id)).toMatchObject({ logoUrl: "/fair/izlagaci/2026/ferum-baw.jpg" });
  });

  test("a second run changes nothing; a website edited by hand is never overwritten; one audit row per real change", async () => {
    const f = await setup();
    await importList(f);
    expect(await importList(f)).toEqual({
      exhibitors: COUNT,
      clients: { created: 0, updated: 0, unchanged: COUNT },
      participations: { created: 0, updated: 0, unchanged: COUNT },
    });
    const { account } = await exhibitor(f, "ferum-baw");
    expect(await f.admin.mutation(api.adminClientProfiles.setWebsite, { accountId: account._id, websiteUrl: "ferum.rs/baw" })).toEqual({ websiteUrl: "https://ferum.rs/baw" });
    const third = await importList(f);
    expect(third.clients).toEqual({ created: 0, updated: 0, unchanged: COUNT });
    expect((await exhibitor(f, "ferum-baw")).account.websiteUrl).toBe("https://ferum.rs/baw");
    const audit = await f.t.run((ctx) => ctx.db.query("adminAuditLog").withIndex("by_createdAt").collect());
    expect(audit.filter((row) => row.action === "fair_site_exhibitors_imported")).toHaveLength(1);
    expect(audit.filter((row) => row.action === "fair_site_exhibitor_created")).toHaveLength(COUNT);
  });

  test("a missing logo or website is filled on the next run, an uploaded logo is kept", async () => {
    const f = await setup();
    await importList(f);
    const toyota = await exhibitor(f, "toyota");
    const bentu = await exhibitor(f, "bentu");
    const storageId = await f.t.run((ctx) => ctx.storage.store(new Blob(["TEST logo"], { type: "image/png" })));
    await f.t.run(async (ctx) => {
      await ctx.db.patch(toyota.account._id, { websiteUrl: undefined });
      await ctx.db.patch(toyota.business._id, { logoUrl: undefined });
      await ctx.db.patch(bentu.business._id, { logoUrl: undefined, logoStorageId: storageId });
    });
    const again = await importList(f);
    expect(again.clients).toEqual({ created: 0, updated: 1, unchanged: COUNT - 1 });
    expect((await exhibitor(f, "toyota")).account.websiteUrl).toBe("https://www.toyota.rs/retailers/raavex-group-doo");
    expect((await exhibitor(f, "toyota")).business.logoUrl).toBe("/fair/izlagaci/2026/toyota.jpg");
    expect((await exhibitor(f, "bentu")).business.logoUrl).toBeUndefined();
    // The directory serves the uploaded file of Bentu.
    const directory = await f.admin.query(api.fairAdmin.getEventDirectory, { eventId: f.eventId });
    expect(directory.businesses.find((row) => row.businessId === bentu.business._id)?.logoUrl).toMatch(/^https?:\/\//);
  });

  test("only a ScanMe admin e-mail may run it, and only into an existing event", async () => {
    const f = await setup();
    await expect(importList(f, "klijent@example.invalid")).rejects.toThrow("fair_exhibitor_import_admin_missing");
    await expect(importList(f, ADMIN_EMAIL, "nema-takvog")).rejects.toThrow("fair_exhibitor_import_event_missing");
    expect((await f.t.run((ctx) => ctx.db.query("accounts").withIndex("by_smkCode", (q) => q.eq("smkCode", "SMK-IZL26-FERUM-BAW")).first()))).toBeNull();
  });
});

describe("Izlagači 2026: the client profile of an imported exhibitor", () => {
  test("opens without a ScanMe login (event-only), shows the website; the website is checked, cleared and audited", async () => {
    const f = await setup();
    await importList(f);
    const { account } = await exhibitor(f, "scanme");
    const profile = await f.admin.query(api.adminClientProfiles.getProfile, { accountId: account._id });
    expect(profile).toMatchObject({ accountName: "ScanMe", smkCode: "SMK-IZL26-SCANME", websiteUrl: "https://www.scanme.rs/" });
    await expect(f.admin.mutation(api.adminClientProfiles.setWebsite, { accountId: account._id, websiteUrl: "javascript:alert(1)" })).rejects.toThrow("admin_profile_website_invalid");
    await expect(f.member.mutation(api.adminClientProfiles.setWebsite, { accountId: account._id, websiteUrl: "https://primer.rs" })).rejects.toThrow();
    expect(await f.admin.mutation(api.adminClientProfiles.setWebsite, { accountId: account._id, websiteUrl: "  " })).toEqual({ websiteUrl: null });
    expect((await f.admin.query(api.adminClientProfiles.getProfile, { accountId: account._id }))?.websiteUrl).toBeNull();
    const audit = await f.t.run((ctx) => ctx.db.query("adminAuditLog").withIndex("by_accountId_and_createdAt", (q) => q.eq("accountId", account._id)).collect());
    expect(audit.filter((row) => row.action === "admin_v1_client_website_updated")).toHaveLength(1);
  });
});

describe("Izlagači 2026: the event on the printed SA26 inventory", () => {
  test("link once, SA26 labels in the list and found by label; old codes of its models stay manageable, nothing else", async () => {
    const f = await setup();
    const printed = await f.t.mutation(internal.fairPrintInventory.provisionBatch, { ownerEmail: ADMIN_EMAIL, startOrdinal: 1, count: 3 });
    expect(printed.map((row) => row.printedCode)).toEqual(["SA26-001", "SA26-002", "SA26-003"]);
    // Not this event's inventory yet.
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.eventId, code: "SA26-001" })).toBeNull();

    const before = await f.t.run(async (ctx) => (await ctx.db.get(f.eventId))!.qrInventoryBusinessId);
    const linked = await f.t.mutation(internal.fairExhibitorImport.linkEventQrInventory, { ownerEmail: ADMIN_EMAIL, eventCode: EM, inventorySmlCode: "sml-sajam-26-qr" });
    expect(linked).toMatchObject({ result: "updated", previousInventoryBusinessId: before });
    expect(await f.t.mutation(internal.fairExhibitorImport.linkEventQrInventory, { ownerEmail: ADMIN_EMAIL, eventCode: EM, inventorySmlCode: "SML-SAJAM-26-QR" })).toMatchObject({ result: "unchanged" });
    await expect(f.t.mutation(internal.fairExhibitorImport.linkEventQrInventory, { ownerEmail: ADMIN_EMAIL, eventCode: EM, inventorySmlCode: "SML-NEMA" })).rejects.toThrow("fair_qr_inventory_business_missing");

    const page = await f.admin.query(api.fairAdmin.listQrInventory, { eventId: f.eventId, paginationOpts: { numItems: 10, cursor: null } });
    expect(page.page.map((row) => row.label)).toEqual(["SA26-001", "SA26-002", "SA26-003"]);
    const detail = await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.eventId, code: "sa26-002" });
    expect(detail).toMatchObject({ label: "SA26-002", resolverCode: printed[1].resolverCode, smqCode: printed[1].smqCode, current: null });

    // A TEST code of the old inventory that leads to a model of this event: its detail still opens.
    const old = f.seed.qr.find((row) => row.eventCode === EM)!;
    const oldDetail = await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.eventId, code: old.resolverCode });
    expect(oldDetail?.current).toMatchObject({ sameEvent: true });
    // The other event's codes are not reachable from here.
    const amf = f.seed.qr.find((row) => row.eventCode === AMF)!;
    expect(await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.eventId, code: amf.resolverCode })).toBeNull();

    // „Ukloni vezu“ frees the model; a new assignment takes a printed code, by label in the bulk check too.
    const modelId = oldDetail!.current!.eventModelId;
    await f.admin.mutation(api.fairAdmin.releaseQr, { eventModelId: modelId, reason: "TEST prelazak na SA26 nalepnice" });
    const model = await f.t.run((ctx) => ctx.db.get(modelId));
    const other = f.seed.qr.find((row) => row.eventCode === EM && row.modelExternalKey !== model!.externalKey)!;
    const check = await f.admin.query(api.fairAdminQr.bulkAssignQrDryRun, { eventId: f.eventId, rows: [{ code: "SA26-001", model: model!.externalKey }, { code: old.resolverCode, model: other.modelExternalKey }] });
    expect(check.rows.map((row) => [row.status, row.issue ?? null])).toEqual([["ok", null], ["error", "FAIR_QR_NOT_IN_INVENTORY"]]);
    await f.admin.mutation(api.fairAdmin.assignQr, { eventModelId: modelId, resolverCode: printed[0].resolverCode });
    expect((await f.admin.query(api.fairAdminQr.getQrDetail, { eventId: f.eventId, code: "SA26-001" }))?.current).toMatchObject({ eventModelId: modelId, sameEvent: true });
  });
});
