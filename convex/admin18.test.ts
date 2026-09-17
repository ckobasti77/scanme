/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-16T12:00:00Z");
const ADMIN_A = "admin18-a@scanme.test";
const ADMIN_B = "admin18-b@scanme.test";
const page = (numItems = 20, cursor: string | null = null) => ({ numItems, cursor });
const emptyPriceSnapshot = {
  engineVersion: 1,
  currency: "RSD" as const,
  lines: [], packages: [], groups: [],
  planLine: { plan: "basic" as const, period: null, amountRsd: 0, onRequest: false },
  servicesListRsd: 0, servicesChargedRsd: 0, savingsRsd: 0,
  recurringTotalRsd: 0, oneTimeTotalRsd: 0,
};
const emptyServices = {
  scanme_links: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
  google_review: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
  scanme_menu: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = `${ADMIN_A},${ADMIN_B}`;
});
afterEach(() => vi.useRealTimers());

function identity(userId: Id<"users">) {
  return { subject: userId, issuer: "https://admin-18.test" };
}

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminA = await ctx.db.insert("users", { email: ADMIN_A, name: "Teodora Admin" });
    const adminB = await ctx.db.insert("users", { email: ADMIN_B, name: "Milan Admin" });
    const outsider = await ctx.db.insert("users", { email: "outside@scanme.test", name: "Stranac" });
    const accountA = await ctx.db.insert("accounts", { name: "Bistro Most", plan: "premium", status: "active", smkCode: "SMK-MOS-001", ownerDisplayName: "Mina Most", normalizedOwnerDisplayName: "mina most", clientStatus: "active", adminV1MigrationVersion: 1, createdAt: 1, updatedAt: 1 });
    const accountB = await ctx.db.insert("accounts", { name: "Studio Most", plan: "basic", status: "active", smkCode: "SMK-STU-002", ownerDisplayName: "Sara Studio", normalizedOwnerDisplayName: "sara studio", clientStatus: "archived", adminV1MigrationVersion: 1, createdAt: 2, updatedAt: 2 });
    const businessA1 = await ctx.db.insert("businesses", { accountId: accountA, name: "Central", normalizedName: "central", slug: "central-most-18", kind: "business", smlCode: "SML-MOS-001", clientStatus: "active", adminV1MigrationVersion: 1, status: "active", createdAt: 3, updatedAt: 3 });
    const businessA2 = await ctx.db.insert("businesses", { accountId: accountA, name: "Obala", normalizedName: "obala", slug: "obala-most-18", kind: "business", smlCode: "SML-MOS-002", clientStatus: "active", adminV1MigrationVersion: 1, status: "active", createdAt: 4, updatedAt: 4 });
    const businessB = await ctx.db.insert("businesses", { accountId: accountB, name: "Central", normalizedName: "central", slug: "central-studio-18", kind: "business", smlCode: "SML-STU-001", clientStatus: "archived", adminV1MigrationVersion: 1, status: "active", createdAt: 5, updatedAt: 5 });
    const celebration = await ctx.db.insert("businesses", { name: "Central slavlje", slug: "central-slavlje-18", kind: "celebration", smlCode: "SML-SLA-001", clientStatus: "active", adminV1MigrationVersion: 1, status: "active", createdAt: 6, updatedAt: 6 });

    await ctx.db.insert("adminClientReadModels", { accountId: accountA, smkCode: "SMK-MOS-001", accountName: "Bistro Most", ownerDisplayName: "Mina Most", normalizedOwnerDisplayName: "mina most", defaultContactEmail: "mina@example.test", defaultContactPhone: "38164111222", firstVenueName: "Central", venueCount: 2, clientStatus: "active", signal: { severity: null, causeId: null }, urgencyRank: 3, serviceSummaries: emptyServices, premiumStatus: null, searchText: "bistro most mina most smkmos001 central obala", updatedAt: 10 });
    await ctx.db.insert("adminClientReadModels", { accountId: accountB, smkCode: "SMK-STU-002", accountName: "Studio Most", ownerDisplayName: "Sara Studio", normalizedOwnerDisplayName: "sara studio", defaultContactEmail: null, defaultContactPhone: null, firstVenueName: "Central", venueCount: 1, clientStatus: "archived", signal: { severity: null, causeId: null }, urgencyRank: 3, serviceSummaries: emptyServices, premiumStatus: null, searchText: "studio most sara studio smkstu002 central", updatedAt: 11 });
    const venue = async (accountId: Id<"accounts">, businessId: Id<"businesses">, smkCode: string, smlCode: string, owner: string, name: string, status: "active" | "archived") => ctx.db.insert("adminVenueReadModels", { accountId, businessId, smkCode, smlCode, ownerDisplayName: owner, venueName: name, normalizedVenueName: name.toLowerCase(), city: "Beograd", effectiveContactEmail: null, effectiveContactPhone: null, productCount: 1, channelCount: 1, serviceTypes: [], clientStatus: status, signal: { severity: null, causeId: null }, urgencyRank: 3, searchText: `${name.toLowerCase()} ${owner.toLowerCase()} ${smkCode.replaceAll("-", "").toLowerCase()} ${smlCode.replaceAll("-", "").toLowerCase()}`, updatedAt: 12 });
    await venue(accountA, businessA1, "SMK-MOS-001", "SML-MOS-001", "Mina Most", "Central", "active");
    await venue(accountA, businessA2, "SMK-MOS-001", "SML-MOS-002", "Mina Most", "Obala", "active");
    await venue(accountB, businessB, "SMK-STU-002", "SML-STU-001", "Sara Studio", "Central", "archived");

    const contactA = await ctx.db.insert("accountContacts", { accountId: accountA, firstName: "Mina", lastName: "Most", normalizedName: "mina most", normalizedEmail: "mina@example.test", normalizedPhone: "38164111222", positionTitle: "Vlasnica", isOwner: true, status: "active", createdAt: 10, updatedAt: 10 });
    await ctx.db.insert("adminContactReadModels", { contactId: contactA, accountId: accountA, accountName: "Bistro Most", smkCode: "SMK-MOS-001", displayName: "Mina Most", normalizedName: "mina most", normalizedEmail: "mina@example.test", normalizedPhone: "38164111222", positionTitle: "Vlasnica", status: "active", searchText: "mina most mina@example.test 38164111222 vlasnica bistro most smkmos001", updatedAt: 10 });

    const product = async (accountId: Id<"accounts">, businessId: Id<"businesses">, source: string, smk: string, sml: string, smf: string, owner: string, venueName: string) => ctx.db.insert("adminProductReadModels", { accountId, businessId, sourceRecordId: source, smkCode: smk, smlCode: sml, smfCode: smf, localSuffix: "011", smqCodes: [], ownerDisplayName: owner, venueName, productType: "two-piece-stand", displayName: "Dvodelni stalak", normalizedDisplayName: "dvodelni stalak", operationalStatus: "active", signal: { severity: null, causeId: null }, urgencyRank: 3, searchText: `${smf.replaceAll("-", "").toLowerCase()} dvodelni stalak ${venueName.toLowerCase()}`, updatedAt: 20 });
    await product(accountA, businessA1, "product-a1", "SMK-MOS-001", "SML-MOS-001", "SMF-0102-01-011", "Mina Most", "Central");
    await product(accountA, businessA2, "product-a2", "SMK-MOS-001", "SML-MOS-002", "SMF-0102-02-011", "Mina Most", "Obala");
    await product(accountB, businessB, "product-b", "SMK-STU-002", "SML-STU-001", "SMF-0208-01-011", "Sara Studio", "Central");

    const cardId = await ctx.db.insert("cards", { businessId: businessA1, cardCode: "CARD-18", label: "QR", status: "active", totalScans: 0, createdAt: 30, updatedAt: 30 });
    const subjectId = await ctx.db.insert("accessSubjects", { accountId: accountA, businessId: businessA1, anchorCardId: cardId, destinationKind: "legacy", createdAt: 30, updatedAt: 30 });
    const channelId = await ctx.db.insert("accessChannels", { accountId: accountA, businessId: businessA1, accountName: "Bistro Most", smkCode: "SMK-MOS-001", smlCode: "SML-MOS-001", venueName: "Central", city: "Beograd", subjectId, cardId, resolverCode: "r-ADMIN18", kind: "qr", state: "active", redirectEnabled: true, health: "healthy", smqCode: "SMQ-0102-01-016", binding: "digital", searchText: "smq010201016 qr bistro most central", totalScans: 0, lastActor: { kind: "system", source: "test" }, lastReason: "test", createdAt: 30, updatedAt: 30 });
    const digitalQrId = await ctx.db.insert("digitalQrCodes", { accountId: accountA, businessId: businessA1, smqCode: "SMQ-0102-01-016", channelId, originalSubjectId: subjectId, createdByUserId: adminA, createdAt: 30 });
    await ctx.db.patch(channelId, { digitalQrId });

    const orderId = await ctx.db.insert("orders", { accountId: accountA, status: "paid", plan: "basic", priceSnapshot: emptyPriceSnapshot, createdAt: 40, updatedAt: 40 });
    await ctx.db.insert("orderOperations", { orderId, accountId: accountA, createdByUserId: adminA, createdByName: "Teodora Admin", accountName: "Bistro Most", smkCode: "SMK-MOS-001", smpCode: "SMP-2026-001", primaryBusinessId: businessA1, primaryBusinessName: "Central", primarySmlCode: "SML-MOS-001", paymentState: "paid", designState: "template_selected", fulfillmentState: "awaiting_conditions", view: "active", priority: "normal", priorityRank: 1, assigneeId: adminA, assigneeName: "Teodora Admin", requiredMinor: 0, settledMinor: 0, reversedMinor: 0, currency: "RSD", lineCount: 0, unitCount: 0, problemCount: 0, migrationIssueCount: 0, provisioningReady: false, searchText: "smp2026001 bistro most smkmos001", migrationVersion: 1, createdAt: 40, updatedAt: 40 });
    return { adminA, adminB, outsider, accountA, accountB, businessA1, businessA2, businessB, celebration, contactA, channelId, orderId };
  });
  return {
    t,
    ...ids,
    adminAClient: t.withIdentity(identity(ids.adminA)),
    adminBClient: t.withIdentity(identity(ids.adminB)),
    outsiderClient: t.withIdentity(identity(ids.outsider)),
  };
}

describe("ADMIN-18 global search", () => {
  test("auth, exact codes, normalization, archived state, disambiguation and hrefs", async () => {
    const f = await seed();
    const search = (group: "clients" | "venues" | "contacts" | "products" | "channels" | "orders", term: string) => f.adminAClient.query(api.adminGlobalSearch.list, { group, term, paginationOpts: page() });
    await expect(f.t.query(api.adminGlobalSearch.list, { group: "clients", term: "Most", paginationOpts: page() })).rejects.toThrow();
    await expect(f.outsiderClient.query(api.adminGlobalSearch.list, { group: "clients", term: "Most", paginationOpts: page() })).rejects.toThrow("administratorski");
    expect((await search("clients", "smk-mos-001")).page[0]).toMatchObject({ code: "SMK-MOS-001", href: `/admin/klijenti/${f.accountA}` });
    expect((await search("venues", "sml-mos-001")).page[0]).toMatchObject({ code: "SML-MOS-001", smlCode: "SML-MOS-001" });
    expect((await search("products", "smf-0102-01-011")).page[0]).toMatchObject({ code: "SMF-0102-01-011" });
    expect((await search("channels", "smq-0102-01-016")).page[0]).toMatchObject({ code: "SMQ-0102-01-016", href: expect.stringContaining(`/admin/operativa/qr?channel=${f.channelId}`) });
    expect((await search("orders", "smp-2026-001")).page[0]).toMatchObject({ code: "SMP-2026-001", href: `/admin/operativa/porudzbine?order=${f.orderId}` });
    expect((await search("contacts", " MINA@EXAMPLE.TEST ")).page[0]).toMatchObject({ title: "Mina Most", smkCode: "SMK-MOS-001" });
    expect((await search("contacts", "+381 64-111-222")).page[0]).toMatchObject({ title: "Mina Most" });
    expect((await search("clients", "Studio")).page[0]).toMatchObject({ status: "archived" });
    const sameName = await search("venues", "Central");
    expect(new Set(sameName.page.map((row) => `${row.smkCode}:${row.smlCode}`))).toEqual(new Set(["SMK-MOS-001:SML-MOS-001", "SMK-STU-002:SML-STU-001"]));
    expect((await search("venues", "SML-SLA-001")).page).toEqual([]);
  });

  test("server cursor is stable and empty, long and partial-SMF rules stay bounded", async () => {
    const f = await seed();
    const first = await f.adminAClient.query(api.adminGlobalSearch.list, { group: "venues", term: "Central", paginationOpts: page(1) });
    expect(first.page).toHaveLength(1);
    expect(first.isDone).toBe(false);
    const second = await f.adminAClient.query(api.adminGlobalSearch.list, { group: "venues", term: "Central", paginationOpts: page(1, first.continueCursor) });
    expect(second.page).toHaveLength(1);
    expect(second.page[0].id).not.toBe(first.page[0].id);
    expect((await f.adminAClient.query(api.adminGlobalSearch.list, { group: "clients", term: "", paginationOpts: page() })).page).toEqual([]);
    await expect(f.adminAClient.query(api.adminGlobalSearch.list, { group: "clients", term: "x".repeat(121), paginationOpts: page() })).rejects.toThrow("term_too_long");
    expect((await f.adminAClient.query(api.adminGlobalSearch.list, { group: "products", term: "#011", paginationOpts: page() })).page).toEqual([]);
    const accountScoped = await f.adminAClient.query(api.adminGlobalSearch.list, { group: "products", term: "011", accountId: f.accountA, paginationOpts: page() });
    expect(accountScoped.page.map((row) => row.smlCode)).toEqual(["SML-MOS-001", "SML-MOS-002"]);
    const businessScoped = await f.adminAClient.query(api.adminGlobalSearch.list, { group: "products", term: "011", accountId: f.accountA, businessId: f.businessA2, paginationOpts: page() });
    expect(businessScoped.page).toHaveLength(1);
    expect(businessScoped.page[0]).toMatchObject({ smlCode: "SML-MOS-002", code: "SMF-0102-02-011" });
    expect(accountScoped.page.some((row) => row.smkCode === "SMK-STU-002")).toBe(false);
    await expect(f.adminAClient.query(api.adminGlobalSearch.list, { group: "products", term: "011", accountId: f.accountB, businessId: f.businessA1, paginationOpts: page() })).rejects.toThrow("scope_invalid");
  });
});

describe("ADMIN-18 unified activity", () => {
  test("projection is idempotent, safe, filterable and cursor paginated", async () => {
    const f = await seed();
    const started = await f.adminAClient.mutation(api.adminSupport.start, { accountId: f.accountA, businessId: f.businessA1 });
    await f.t.mutation(internal.adminActivity.recordNonAdminEvent, { sourceKey: "system:1", sourceDomain: "subscription", sourceRecordId: "1", accountId: f.accountA, objectKind: "subscription", objectLabel: "Premium", action: "subscription_reconciled", category: "subscription", actorKind: "system", actorDisplayName: "Sistem", occurredAt: NOW + 1, summaryLabel: "Premium", href: `/admin/klijenti/${f.accountA}` });
    const shared = { sourceKey: "mailbox:1", sourceDomain: "conversation", sourceRecordId: "mail-1", accountId: f.accountA, objectKind: "conversation", objectLabel: "Inbox", action: "message_sent", category: "communication" as const, actorKind: "shared_mailbox" as const, actorDisplayName: "Poslato iz zajedničkog sandučeta", occurredAt: NOW + 2, summaryLabel: "Inbox", href: "/admin/inbox" };
    expect(await f.t.mutation(internal.adminActivity.recordNonAdminEvent, shared)).toMatchObject({ changed: true });
    expect(await f.t.mutation(internal.adminActivity.recordNonAdminEvent, shared)).toMatchObject({ changed: false });
    const auditId = await f.t.run((ctx) => ctx.db.insert("adminAuditLog", { actorUserId: f.adminA, accountId: f.accountA, action: "private_payload_test", detail: JSON.stringify({ emailBody: "PRIVATNA PORUKA", token: "SECRET", cookie: "COOKIE", session: "SESSION", device: "DEVICE" }), createdAt: NOW + 3 }));
    const dry = await f.t.mutation(internal.adminActivity.backfill, { source: "admin_audit", cursor: null, limit: 20, dryRun: true });
    expect(dry).toMatchObject({ written: 0, isDone: true });
    expect(await f.t.run((ctx) => ctx.db.query("adminActivityRows").withIndex("by_sourceKey", (q) => q.eq("sourceKey", `adminAuditLog:${auditId}`)).unique())).toBeNull();
    const real = await f.t.mutation(internal.adminActivity.backfill, { source: "admin_audit", cursor: null, limit: 1, dryRun: false });
    if (!real.isDone) await f.t.mutation(internal.adminActivity.backfill, { source: "admin_audit", cursor: real.continueCursor, limit: 20, dryRun: false });
    const replay = await f.t.mutation(internal.adminActivity.backfill, { source: "admin_audit", cursor: null, limit: 20, dryRun: false });
    expect(replay.written).toBe(0);
    const all = await f.adminAClient.query(api.adminActivity.list, { accountId: f.accountA, paginationOpts: page(1) });
    expect(all.page).toHaveLength(1);
    if (!all.isDone) {
      const next = await f.adminAClient.query(api.adminActivity.list, { accountId: f.accountA, paginationOpts: page(1, all.continueCursor) });
      expect(next.page[0].sourceKey).not.toBe(all.page[0].sourceKey);
    }
    const support = await f.adminAClient.query(api.adminActivity.list, { businessId: f.businessA1, category: "support", actorKey: `user:${f.adminA}`, paginationOpts: page() });
    expect(support.page[0]).toMatchObject({ actorKind: "admin", actorDisplayName: "Teodora Admin", href: `/admin/klijenti/${f.accountA}` });
    const system = await f.adminAClient.query(api.adminActivity.list, { category: "subscription", actorKey: "kind:system", paginationOpts: page() });
    expect(system.page[0]).toMatchObject({ actorKind: "system", actorDisplayName: "Sistem" });
    const mailbox = await f.adminAClient.query(api.adminActivity.list, { category: "communication", actorKey: "kind:shared_mailbox", paginationOpts: page() });
    expect(mailbox.page[0]).toMatchObject({ actorKind: "shared_mailbox", actorDisplayName: "Poslato iz zajedničkog sandučeta" });
    const projected = await f.t.run((ctx) => ctx.db.query("adminActivityRows").withIndex("by_sourceKey", (q) => q.eq("sourceKey", `adminAuditLog:${auditId}`)).unique());
    expect(projected?.sourceKey).toBe(`adminAuditLog:${auditId}`);
    expect(JSON.stringify(projected)).not.toMatch(/PRIVATNA PORUKA|SECRET|COOKIE|SESSION|DEVICE|emailBody|token|login|logout|lastSeen|ipAddress/i);
    expect(started.contextId).toBeTruthy();
  });
});

describe("ADMIN-18 admin support context", () => {
  test("real server identity owns enter/exit without membership or public-auth weakening", async () => {
    const f = await seed();
    await expect(f.outsiderClient.mutation(api.adminSupport.start, { accountId: f.accountA })).rejects.toThrow("administratorski");
    await expect(f.t.mutation(api.adminSupport.start, { accountId: f.accountA })).rejects.toThrow();
    await expect(f.adminAClient.mutation(api.adminSupport.start, { accountId: f.accountA, businessId: f.businessB })).rejects.toThrow("scope_mismatch");
    await expect(f.adminAClient.mutation(api.adminSupport.start, { accountId: f.accountA, adminUserId: f.adminB } as never)).rejects.toThrow();
    const membershipsBefore = await f.t.run((ctx) => ctx.db.query("accountMemberships").take(20));
    const started = await f.adminAClient.mutation(api.adminSupport.start, { accountId: f.accountA, businessId: f.businessA1 });
    const stored = await f.t.run((ctx) => ctx.db.get(started.contextId));
    expect(stored).toMatchObject({ adminUserId: f.adminA, accountId: f.accountA, businessId: f.businessA1, state: "active" });
    expect(await f.t.run((ctx) => ctx.db.query("accountMemberships").take(20))).toEqual(membershipsBefore);
    await expect(f.adminBClient.query(api.adminSupport.getContext, { contextId: started.contextId })).rejects.toThrow("forbidden");
    expect(await f.outsiderClient.query(api.clientPanel.overview, { slug: "central-most-18" })).toMatchObject({ status: "forbidden" });
    expect(await f.adminAClient.query(api.adminSupport.readOverview, { contextId: started.contextId })).toMatchObject({ ownerDisplayName: "Mina Most", venueCount: 2 });
    await f.adminAClient.mutation(api.adminSupport.exit, { contextId: started.contextId });
    expect(await f.t.run((ctx) => ctx.db.get(started.contextId))).toMatchObject({ state: "ended", endedAt: NOW });
    await expect(f.adminAClient.query(api.adminSupport.readOverview, { contextId: started.contextId })).rejects.toThrow("context_ended");
    const events = await f.adminAClient.query(api.adminActivity.list, { accountId: f.accountA, category: "support", paginationOpts: page() });
    expect(events.page.map((row) => row.action)).toEqual(["admin_debug_exited", "admin_debug_entered"]);
    expect(await f.t.run((ctx) => ctx.db.query("accountMemberships").take(20))).toEqual(membershipsBefore);
  });
});
