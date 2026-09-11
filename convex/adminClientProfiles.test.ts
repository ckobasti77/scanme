/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-11T12:00:00Z");
const ADMIN_EMAIL = "admin-profile@scanme.test";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

afterEach(() => vi.useRealTimers());

function identity(userId: Id<"users">) {
  return { subject: userId, issuer: "https://admin-07.test" };
}

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN_EMAIL });
    const outsiderId = await ctx.db.insert("users", { email: "outsider@example.invalid" });
    const accountId = await ctx.db.insert("accounts", {
      name: "Bistro Zelen d.o.o.", plan: "premium", status: "active",
      billingModel: "subscriptions_v1", smkCode: "SMK-BZE-001",
      ownerDisplayName: "Ana Petrović", normalizedOwnerDisplayName: "ana petrovic",
      clientStatus: "active", adminV1MigrationVersion: 1,
      adminV1MigratedAt: NOW - 1000, createdAt: NOW - 1000, updatedAt: NOW - 1000,
    });
    const defaultContactId = await ctx.db.insert("accountContacts", {
      accountId, firstName: "Ana", lastName: "Petrović", normalizedName: "ana petrovic",
      normalizedEmail: "ana@example.invalid", normalizedPhone: "381641234567",
      positionTitle: "Vlasnica", isOwner: true, status: "active",
      createdAt: NOW - 1000, updatedAt: NOW - 1000,
    });
    const secondContactId = await ctx.db.insert("accountContacts", {
      accountId, firstName: "Marko", lastName: "Ilić", normalizedName: "marko ilic",
      normalizedEmail: "marko@example.invalid", positionTitle: "Operativa",
      isOwner: false, status: "active", createdAt: NOW - 900, updatedAt: NOW - 900,
    });
    const primaryOwnerMembershipId = await ctx.db.insert("accountMemberships", {
      accountId, userId: adminId, contactId: defaultContactId, role: "full_access",
      active: true, venueAccess: "all", canBuyServices: true, canBuyPremium: true,
      createdAt: NOW - 950, updatedAt: NOW - 950,
    });
    await ctx.db.patch(accountId, { defaultContactId, primaryOwnerMembershipId });
    const businessId = await ctx.db.insert("businesses", {
      accountId, name: "Bistro Zelen Dorćol", normalizedName: "bistro zelen dorcol",
      slug: "bistro-zelen-dorcol-admin-07", kind: "business", smlCode: "SML-BZE-001",
      clientStatus: "active", city: "Beograd", normalizedCity: "beograd",
      address: "Cara Dušana 42", adminV1MigrationVersion: 1,
      status: "active", createdAt: NOW - 800, updatedAt: NOW - 800,
    });
    const serviceProfileId = await ctx.db.insert("serviceProfiles", {
      businessId, type: "scanme_menu", slug: "admin-07-menu", status: "active",
      totalScans: 0, totalPageViews: 0, totalConvertedSessions: 0,
      createdAt: NOW - 700, updatedAt: NOW - 700,
    });
    await ctx.db.insert("adminClientReadModels", {
      accountId, smkCode: "SMK-BZE-001", accountName: "Bistro Zelen d.o.o.",
      ownerDisplayName: "Ana Petrović", normalizedOwnerDisplayName: "ana petrovic",
      defaultContactEmail: "ana@example.invalid", defaultContactPhone: "381641234567",
      firstVenueName: "Bistro Zelen Dorćol", firstVenueSlug: "bistro-zelen-dorcol-admin-07",
      venueCount: 1, clientStatus: "active", signal: { severity: null, causeId: null },
      urgencyRank: 3, serviceSummaries: {
        scanme_links: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
        google_review: { total: 0, active: 0, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: null },
        scanme_menu: { total: 1, active: 1, warning: 0, grace: 0, suspended: 0, inactive: 0, problem: 0, worst: "active" },
      }, premiumStatus: null, searchText: "ana petrovic bistro zelen", updatedAt: NOW - 500,
    });
    await ctx.db.insert("adminVenueReadModels", {
      accountId, businessId, smkCode: "SMK-BZE-001", smlCode: "SML-BZE-001",
      ownerDisplayName: "Ana Petrović", venueName: "Bistro Zelen Dorćol",
      normalizedVenueName: "bistro zelen dorcol", city: "Beograd",
      effectiveContactEmail: "ana@example.invalid", effectiveContactPhone: "381641234567",
      productCount: 14, channelCount: 2, serviceTypes: ["scanme_menu"], clientStatus: "active",
      signal: { severity: null, causeId: null }, urgencyRank: 3,
      searchText: "ana petrovic bistro zelen dorcol", updatedAt: NOW - 500,
    });
    const actionItemId = await ctx.db.insert("actionItems", {
      causeId: "manual_problem:profile:contact_check", sourceDomain: "manual_problem",
      sourceRecordId: "profile-contact-check", causeKind: "contact_check",
      sourceVersion: "v1", sourceFingerprint: "profile-contact-check:v1",
      accountId, businessId, severity: "warning", severityRank: 1, state: "open",
      priorityClass: "other", priorityRank: 6, priorityAt: NOW - 400,
      relevantAt: NOW - 400, description: "Proveri kontakt lokala.",
      contextHref: "/admin/klijenti", resolutionRule: "manual_problem_resolution",
      createdAt: NOW - 400, updatedAt: NOW - 400,
    });
    await ctx.db.insert("actionItemEvents", {
      actionItemId, causeId: "manual_problem:profile:contact_check", event: "opened",
      actor: { kind: "system", source: "admin-07-test" }, toState: "open", createdAt: NOW - 400,
    });
    const otherAccountId = await ctx.db.insert("accounts", {
      name: "Drugi nalog", plan: "basic", status: "active", createdAt: NOW - 300, updatedAt: NOW - 300,
    });
    const otherContactId = await ctx.db.insert("accountContacts", {
      accountId: otherAccountId, firstName: "Drugi", lastName: "Kontakt", normalizedName: "drugi kontakt",
      positionTitle: "Vlasnik", isOwner: true, status: "active", createdAt: NOW - 300, updatedAt: NOW - 300,
    });
    return { adminId, outsiderId, accountId, defaultContactId, secondContactId, businessId, serviceProfileId, actionItemId, otherContactId };
  });
  return { t, ...ids, admin: t.withIdentity(identity(ids.adminId)), outsider: t.withIdentity(identity(ids.outsiderId)) };
}

describe("ADMIN-07 client profile", () => {
  test("admin-only profile read is link-safe and returns real bounded summaries", async () => {
    const fixture = await seed();
    await expect(fixture.outsider.query(api.adminClientProfiles.getProfile, { accountId: fixture.accountId })).rejects.toThrow("Nemate administratorski pristup");
    expect(await fixture.admin.query(api.adminClientProfiles.getProfile, { accountId: "not-an-id" })).toBeNull();
    const profile = await fixture.admin.query(api.adminClientProfiles.getProfile, { accountId: fixture.accountId });
    expect(profile).toMatchObject({ smkCode: "SMK-BZE-001", venueCount: 1, defaultContactId: fixture.defaultContactId });
    expect(profile?.contacts).toHaveLength(2);
    const venues = await fixture.admin.query(api.adminClientProfiles.listVenues, { accountId: fixture.accountId, paginationOpts: { numItems: 1, cursor: null } });
    expect(venues.page[0]).toMatchObject({ businessId: fixture.businessId, productCount: 14 });
    const detail = await fixture.admin.query(api.adminClientProfiles.getVenueDetail, { accountId: fixture.accountId, businessId: fixture.businessId });
    expect(detail).toMatchObject({ productCount: 14, contactSource: "account" });
    expect(detail?.services[0]).toMatchObject({ profileId: fixture.serviceProfileId, type: "scanme_menu", subscription: null });
  });

  test("selecting a contact is read-only; explicit default change updates the directory and audit", async () => {
    const fixture = await seed();
    await fixture.admin.query(api.adminClientProfiles.getProfile, { accountId: fixture.accountId });
    expect((await fixture.t.run((ctx) => ctx.db.get(fixture.accountId)))?.defaultContactId).toBe(fixture.defaultContactId);
    await fixture.admin.mutation(api.adminClientProfiles.setDefaultContact, { accountId: fixture.accountId, contactId: fixture.secondContactId });
    const profile = await fixture.admin.query(api.adminClientProfiles.getProfile, { accountId: fixture.accountId });
    expect(profile?.defaultContactId).toBe(fixture.secondContactId);
    const evidence = await fixture.t.run(async (ctx) => ({
      readModel: await ctx.db.query("adminClientReadModels").withIndex("by_accountId", (q) => q.eq("accountId", fixture.accountId)).unique(),
      audit: await ctx.db.query("adminAuditLog").withIndex("by_accountId_and_createdAt", (q) => q.eq("accountId", fixture.accountId)).take(10),
    }));
    expect(evidence.readModel?.defaultContactEmail).toBe("marko@example.invalid");
    expect(evidence.audit.some((row) => row.action === "admin_v1_contact_default_changed")).toBe(true);
  });

  test("contact CRUD normalizes input and never permits deactivating the active default", async () => {
    const fixture = await seed();
    const created = await fixture.admin.mutation(api.adminClientProfiles.createContact, {
      accountId: fixture.accountId, firstName: "  Mila ", lastName: " Jović ",
      positionTitle: " Menadžer ", email: " MILA@EXAMPLE.INVALID ", phone: "+381 64 222 33 44",
    });
    let contact = await fixture.t.run((ctx) => ctx.db.get(created.contactId));
    expect(contact).toMatchObject({ normalizedName: "mila jovic", normalizedEmail: "mila@example.invalid", normalizedPhone: "381642223344", status: "active" });
    await fixture.admin.mutation(api.adminClientProfiles.updateContact, { accountId: fixture.accountId, contactId: created.contactId, firstName: "Mila", lastName: "Jović", positionTitle: "Direktorka", email: "mila@example.invalid", phone: "381642223344" });
    await fixture.admin.mutation(api.adminClientProfiles.setContactStatus, { accountId: fixture.accountId, contactId: created.contactId, status: "inactive" });
    contact = await fixture.t.run((ctx) => ctx.db.get(created.contactId));
    expect(contact).toMatchObject({ positionTitle: "Direktorka", status: "inactive" });
    await expect(fixture.admin.mutation(api.adminClientProfiles.setContactStatus, { accountId: fixture.accountId, contactId: fixture.defaultContactId, status: "inactive" })).rejects.toThrow("admin_profile_default_contact_cannot_deactivate");
    await expect(fixture.admin.mutation(api.adminClientProfiles.updateContact, { accountId: fixture.accountId, contactId: fixture.otherContactId, firstName: "Drugi", lastName: "Kontakt", positionTitle: "Vlasnik", email: "", phone: "" })).rejects.toThrow("admin_profile_contact_not_found");
  });

  test("opening context is read-only and manual resolution requires an audited note", async () => {
    const fixture = await seed();
    await fixture.admin.query(api.adminClientProfiles.listActionHistory, { accountId: fixture.accountId, actionItemId: fixture.actionItemId, paginationOpts: { numItems: 12, cursor: null } });
    expect((await fixture.t.run((ctx) => ctx.db.get(fixture.actionItemId)))?.state).toBe("open");
    await expect(fixture.admin.mutation(api.adminClientProfiles.resolveManualProblem, { accountId: fixture.accountId, actionItemId: fixture.actionItemId, note: "" })).rejects.toThrow("action_resolution_note_required");
    await fixture.admin.mutation(api.adminClientProfiles.resolveManualProblem, { accountId: fixture.accountId, actionItemId: fixture.actionItemId, note: "Kontakt je potvrđen telefonom." });
    const item = await fixture.t.run((ctx) => ctx.db.get(fixture.actionItemId));
    expect(item).toMatchObject({ state: "resolved", resolutionNote: "Kontakt je potvrđen telefonom." });
    const history = await fixture.admin.query(api.adminClientProfiles.listActionHistory, { accountId: fixture.accountId, actionItemId: fixture.actionItemId, paginationOpts: { numItems: 12, cursor: null } });
    expect(history.page[0]).toMatchObject({ event: "manual_resolved", actorKind: "admin", reason: "Kontakt je potvrđen telefonom." });
  });
});
