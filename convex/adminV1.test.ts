/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  requireBusinessPurchaseAccess,
  requireClientVenueCapability,
} from "./lib/clientAccountAccess";
import { normalizeAdminSearchText } from "./lib/adminV1Validators";

const modules = import.meta.glob("./**/*.ts");
const ISSUER = "https://admin-02.test";
const ADMIN_EMAIL = "admin@scanme.test";
const NOW = Date.parse("2026-09-10T10:00:00Z");

type TestBackend = ReturnType<typeof convexTest>;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

async function seedLegacyClient(
  t: TestBackend,
  key: string,
  options: { accountless?: boolean } = {},
) {
  return t.run(async (ctx) => {
    const users = {
      owner: await ctx.db.insert("users", { email: `owner-${key}@example.invalid` }),
      coOwner: await ctx.db.insert("users", { email: `coowner-${key}@example.invalid` }),
      manager: await ctx.db.insert("users", { email: `manager-${key}@example.invalid` }),
      finance: await ctx.db.insert("users", { email: `finance-${key}@example.invalid` }),
      viewer: await ctx.db.insert("users", { email: `viewer-${key}@example.invalid` }),
      outsider: await ctx.db.insert("users", { email: `outsider-${key}@example.invalid` }),
    };
    const accountId = options.accountless
      ? null
      : await ctx.db.insert("accounts", {
          name: `Legacy nalog ${key}`,
          plan: "basic",
          status: "active",
          planSource: "manual",
          createdAt: NOW - 1_000,
          updatedAt: NOW - 1_000,
        });
    const businesses: Id<"businesses">[] = [];
    for (let index = 0; index < 4; index += 1) {
      businesses.push(
        await ctx.db.insert("businesses", {
          name: index < 2 ? `Isti naziv ${key}` : `Lokal ${key} ${index + 1}`,
          slug: `admin-02-${key}-${index + 1}`,
          kind: "business",
          ...(accountId ? { accountId } : {}),
          status: "active",
          createdAt: NOW - 1_000,
        }),
      );
    }
    const ownerContactId = await ctx.db.insert("businessContacts", {
      businessId: businesses[0],
      firstName: "Test",
      lastName: `Vlasnik ${key}`,
      normalizedEmail: `shared-${key.toLowerCase()}@example.invalid`,
      phone: `38160000${key.length}1`,
      positionTitle: "Vlasnik",
      status: "active",
      authUserId: users.owner,
      createdAt: NOW - 900,
      updatedAt: NOW - 900,
    });
    const financeContactId = await ctx.db.insert("businessContacts", {
      businessId: businesses[0],
      firstName: "Test",
      lastName: `Finansije ${key}`,
      // Deliberately shared: migration must never merge people by email.
      normalizedEmail: `shared-${key.toLowerCase()}@example.invalid`,
      phone: `38160000${key.length}2`,
      positionTitle: "Finansije",
      status: "active",
      authUserId: users.finance,
      createdAt: NOW - 800,
      updatedAt: NOW - 800,
    });
    const managerContactId = await ctx.db.insert("businessContacts", {
      businessId: businesses[3],
      firstName: "Test",
      lastName: `Menadžer ${key}`,
      normalizedEmail: `manager-${key.toLowerCase()}@example.invalid`,
      phone: `38160000${key.length}3`,
      positionTitle: "Menadžer",
      status: "active",
      authUserId: users.manager,
      createdAt: NOW - 700,
      updatedAt: NOW - 700,
    });
    const legacyMembershipIds: Id<"businessMemberships">[] = [];
    for (const businessId of businesses) {
      legacyMembershipIds.push(
        await ctx.db.insert("businessMemberships", {
          userId: users.owner,
          businessId,
          accessRole: "viewer",
          active: true,
          createdAt: NOW - 600,
          updatedAt: NOW - 600,
        }),
      );
    }
    for (const [userId, businessId] of [
      [users.manager, businesses[3]],
      [users.finance, businesses[0]],
      [users.viewer, businesses[1]],
    ] as const) {
      legacyMembershipIds.push(
        await ctx.db.insert("businessMemberships", {
          userId,
          businessId,
          accessRole: "viewer",
          active: true,
          createdAt: NOW - 500,
          updatedAt: NOW - 500,
        }),
      );
    }
    return {
      accountId,
      businesses,
      users,
      ownerContactId,
      financeContactId,
      managerContactId,
      legacyMembershipIds,
    };
  });
}

function migrationArgs(
  seed: Awaited<ReturnType<typeof seedLegacyClient>>,
  key: string,
  dryRun: boolean,
) {
  const codeKey = key.toUpperCase();
  return {
    ...(seed.accountId ? { accountId: seed.accountId } : {}),
    smkCode: `SMK-${codeKey}`,
    ownerDisplayName: `Test Vlasnik ${key}`,
    primaryOwnerUserId: seed.users.owner,
    primaryOwnerBusinessContactId: seed.ownerContactId,
    defaultBusinessContactId: seed.ownerContactId,
    venues: seed.businesses.map((businessId, index) => ({
      businessId,
      smlCode: `SML-${codeKey}-${index + 1}`,
      city: "Test grad",
      address: `Test adresa ${index + 1}`,
    })),
    dryRun,
    now: NOW,
  };
}

async function migrateLegacyClient(
  t: TestBackend,
  seed: Awaited<ReturnType<typeof seedLegacyClient>>,
  key: string,
) {
  return t.mutation(
    internal.adminV1Migrations.migrateLegacyClient,
    migrationArgs(seed, key, false),
  );
}

async function finishOrganizationFixture(
  t: TestBackend,
  seed: Awaited<ReturnType<typeof seedLegacyClient>>,
  accountId: Id<"accounts">,
) {
  return t.run(async (ctx) => {
    const contacts = await ctx.db
      .query("accountContacts")
      .withIndex("by_accountId", (q) => q.eq("accountId", accountId))
      .take(20);
    const contactByLegacy = new Map(
      contacts.map((contact) => [String(contact.legacyBusinessContactId), contact]),
    );
    const ownerContact = contactByLegacy.get(String(seed.ownerContactId))!;
    const financeContact = contactByLegacy.get(String(seed.financeContactId))!;
    const managerContact = contactByLegacy.get(String(seed.managerContactId))!;

    const members = await ctx.db
      .query("accountMemberships")
      .withIndex("by_accountId_and_active", (q) =>
        q.eq("accountId", accountId).eq("active", true),
      )
      .take(20);
    const memberByUser = new Map(members.map((member) => [String(member.userId), member]));
    const manager = memberByUser.get(String(seed.users.manager))!;
    const finance = memberByUser.get(String(seed.users.finance))!;
    await ctx.db.patch(manager._id, {
      contactId: managerContact._id,
      role: "venue_management",
      canBuyServices: true,
      canBuyPremium: false,
      updatedAt: NOW + 1,
    });
    await ctx.db.patch(finance._id, {
      contactId: financeContact._id,
      role: "finance",
      canBuyServices: true,
      canBuyPremium: true,
      updatedAt: NOW + 1,
    });
    const coOwnerId = await ctx.db.insert("accountMemberships", {
      accountId,
      userId: seed.users.coOwner,
      role: "full_access",
      active: true,
      venueAccess: "all",
      canBuyServices: true,
      canBuyPremium: true,
      createdAt: NOW + 1,
      updatedAt: NOW + 1,
    });
    const legalEntities = [];
    const brands = [];
    const groups = [];
    for (let index = 0; index < 2; index += 1) {
      const name = `Test firma ${index + 1}`;
      legalEntities.push(
        await ctx.db.insert("legalEntities", {
          accountId,
          name,
          normalizedName: normalizeAdminSearchText(name),
          taxId: `TESTPIB${index + 1}`,
          registrationNumber: `TESTMB${index + 1}`,
          address: `Adresa firme ${index + 1}`,
          createdAt: NOW,
          updatedAt: NOW,
        }),
      );
      const brandName = `Test brend ${index + 1}`;
      brands.push(
        await ctx.db.insert("brands", {
          accountId,
          name: brandName,
          normalizedName: normalizeAdminSearchText(brandName),
          revision: "fixture-r1",
          colors: ["#172A20"],
          createdAt: NOW,
          updatedAt: NOW,
        }),
      );
      const groupName = `Test grupa ${index + 1}`;
      groups.push(
        await ctx.db.insert("venueGroups", {
          accountId,
          name: groupName,
          normalizedName: normalizeAdminSearchText(groupName),
          createdAt: NOW,
          updatedAt: NOW,
        }),
      );
    }
    const friendTagId = await ctx.db.insert("accountTags", {
      accountId,
      kind: "friend",
      label: "Prijatelj",
      normalizedLabel: "prijatelj",
      createdAt: NOW,
      updatedAt: NOW,
    });
    for (let index = 0; index < seed.businesses.length; index += 1) {
      await ctx.db.patch(seed.businesses[index], {
        legalEntityId: legalEntities[index % 2],
        brandId: brands[index % 2],
        venueGroupId: groups[index % 2],
        updatedAt: NOW + 1,
      });
    }
    return {
      contacts,
      ownerContactId: ownerContact._id,
      financeContactId: financeContact._id,
      managerContactId: managerContact._id,
      managerMembershipId: manager._id,
      coOwnerMembershipId: coOwnerId,
      legalEntities,
      brands,
      groups,
      friendTagId,
    };
  });
}

async function canonicalFixture(t: TestBackend, key: string) {
  const seed = await seedLegacyClient(t, key);
  const migrated = await migrateLegacyClient(t, seed, key);
  if (!migrated.accountId) throw new Error("fixture migration did not create an account");
  const organization = await finishOrganizationFixture(t, seed, migrated.accountId);
  return { seed, accountId: migrated.accountId, organization };
}

describe("ADMIN-02 migration and additive organization model", () => {
  test("dry-run is write-free; apply and retry are idempotent without email merging", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedLegacyClient(t, "A");
    const dryRun = await t.mutation(
      internal.adminV1Migrations.migrateLegacyClient,
      migrationArgs(seed, "A", true),
    );
    expect(dryRun).toMatchObject({
      dryRun: true,
      accountId: seed.accountId,
      createdAccount: false,
      venues: 4,
      sourceContacts: 3,
      sourceMemberships: 7,
    });
    const before = await t.run(async (ctx) => ({
      account: await ctx.db.get(seed.accountId!),
      contacts: await ctx.db
        .query("accountContacts")
        .withIndex("by_accountId", (q) => q.eq("accountId", seed.accountId!))
        .take(10),
    }));
    expect(before.account?.adminV1MigrationVersion).toBeUndefined();
    expect(before.contacts).toEqual([]);

    const first = await migrateLegacyClient(t, seed, "A");
    expect(first).toMatchObject({
      dryRun: false,
      accountId: seed.accountId,
      createdAccount: false,
      createdContacts: 3,
      createdMemberships: 4,
      createdScopes: 3,
    });
    const retry = await migrateLegacyClient(t, seed, "A");
    expect(retry).toMatchObject({
      createdAccount: false,
      createdContacts: 0,
      createdMemberships: 0,
      createdScopes: 0,
    });
    const state = await t.run(async (ctx) => ({
      account: await ctx.db.get(seed.accountId!),
      contacts: await ctx.db
        .query("accountContacts")
        .withIndex("by_accountId", (q) => q.eq("accountId", seed.accountId!))
        .take(10),
      memberships: await ctx.db
        .query("accountMemberships")
        .withIndex("by_accountId_and_active", (q) =>
          q.eq("accountId", seed.accountId!).eq("active", true),
        )
        .take(20),
      mappings: await ctx.db
        .query("adminV1MigrationMappings")
        .withIndex("by_version_and_sourceKind_and_sourceId")
        .take(20),
    }));
    expect(state.account).toMatchObject({
      smkCode: "SMK-A",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
    });
    expect(state.contacts).toHaveLength(3);
    expect(
      state.contacts.filter(
        (contact) => contact.normalizedEmail === "shared-a@example.invalid",
      ),
    ).toHaveLength(2);
    expect(state.memberships).toHaveLength(4);
    expect(
      state.memberships.filter((member) => member.role === "full_access"),
    ).toHaveLength(1);
    expect(
      state.memberships.filter((member) => member.role === "view_only"),
    ).toHaveLength(3);
    expect(state.memberships.every((member) =>
      member.role === "full_access" ||
      (!member.canBuyServices && !member.canBuyPremium)
    )).toBe(true);
    expect(state.mappings).toHaveLength(10);
  });

  test("an explicitly grouped account-less client becomes one SMK with four SMLs", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedLegacyClient(t, "SOLO", { accountless: true });
    const result = await migrateLegacyClient(t, seed, "SOLO");
    expect(result.createdAccount).toBe(true);
    expect(result.accountId).not.toBeNull();
    const state = await t.run(async (ctx) => ({
      account: await ctx.db.get(result.accountId!),
      venues: await ctx.db
        .query("businesses")
        .withIndex("by_account", (q) => q.eq("accountId", result.accountId!))
        .take(10),
    }));
    expect(state.account).toMatchObject({
      smkCode: "SMK-SOLO",
      ownerDisplayName: "Test Vlasnik SOLO",
      adminV1MigrationVersion: 1,
    });
    expect(state.venues).toHaveLength(4);
    expect(new Set(state.venues.map((venue) => venue.smlCode)).size).toBe(4);
    expect(state.venues.every((venue) => venue.accountId === result.accountId)).toBe(true);
  });

  test("duplicate SMK and SML codes are rejected before partial migration writes", async () => {
    const t = convexTest(schema, modules);
    const firstSeed = await seedLegacyClient(t, "ONE");
    await migrateLegacyClient(t, firstSeed, "ONE");
    const secondSeed = await seedLegacyClient(t, "TWO");
    const duplicateSmk = {
      ...migrationArgs(secondSeed, "TWO", false),
      smkCode: "SMK-ONE",
    };
    await expect(
      t.mutation(internal.adminV1Migrations.migrateLegacyClient, duplicateSmk),
    ).rejects.toThrow("SMK kod se već koristi");
    const duplicateSml = migrationArgs(secondSeed, "TWO", false);
    duplicateSml.venues[0] = {
      ...duplicateSml.venues[0],
      smlCode: "SML-ONE-1",
    };
    await expect(
      t.mutation(internal.adminV1Migrations.migrateLegacyClient, duplicateSml),
    ).rejects.toThrow("SML kod se već koristi");
    const untouched = await t.run((ctx) => ctx.db.get(secondSeed.accountId!));
    expect(untouched?.adminV1MigrationVersion).toBeUndefined();
  });

  test("oversized clients stop before an unsafe all-at-once migration", async () => {
    const t = convexTest(schema, modules);
    const seed = await seedLegacyClient(t, "BOUND");
    const extraBusinesses = await t.run(async (ctx) => {
      const ids: Id<"businesses">[] = [];
      for (let index = 0; index < 17; index += 1) {
        ids.push(await ctx.db.insert("businesses", {
          name: `Dodatni lokal ${index + 1}`,
          slug: `admin-02-bound-extra-${index + 1}`,
          kind: "business",
          accountId: seed.accountId!,
          status: "active",
          createdAt: NOW,
        }));
      }
      return ids;
    });
    const args = migrationArgs(seed, "BOUND", false);
    args.venues.push(...extraBusinesses.map((businessId, index) => ({
      businessId,
      smlCode: `SML-BOUND-${index + 5}`,
      city: "Test grad",
      address: `Dodatna adresa ${index + 1}`,
    })));
    await expect(
      t.mutation(internal.adminV1Migrations.migrateLegacyClient, args),
    ).rejects.toThrow("bezbednu granicu");
    expect((await t.run((ctx) => ctx.db.get(seed.accountId!)))?.smkCode).toBeUndefined();
  });
});

describe("ADMIN-02 contacts, ownership and membership authorization", () => {
  test("one SMK owns multiple SMLs, firms, brands, groups, tags and contacts", async () => {
    const t = convexTest(schema, modules);
    const fixture = await canonicalFixture(t, "ORG");
    const state = await t.run(async (ctx) => ({
      venues: await ctx.db
        .query("businesses")
        .withIndex("by_account", (q) => q.eq("accountId", fixture.accountId))
        .take(10),
      entities: await ctx.db
        .query("legalEntities")
        .withIndex("by_accountId", (q) => q.eq("accountId", fixture.accountId))
        .take(10),
      brands: await ctx.db
        .query("brands")
        .withIndex("by_accountId", (q) => q.eq("accountId", fixture.accountId))
        .take(10),
      groups: await ctx.db
        .query("venueGroups")
        .withIndex("by_accountId", (q) => q.eq("accountId", fixture.accountId))
        .take(10),
      tags: await ctx.db
        .query("accountTags")
        .withIndex("by_accountId", (q) => q.eq("accountId", fixture.accountId))
        .take(10),
      contacts: await ctx.db
        .query("accountContacts")
        .withIndex("by_accountId", (q) => q.eq("accountId", fixture.accountId))
        .take(10),
    }));
    expect(state.venues).toHaveLength(4);
    expect(state.entities).toHaveLength(2);
    expect(state.brands).toHaveLength(2);
    expect(state.groups).toHaveLength(2);
    expect(state.contacts).toHaveLength(3);
    expect(state.tags).toMatchObject([{ kind: "friend", label: "Prijatelj" }]);
    for (const venue of state.venues) {
      expect(state.entities.some((entity) => entity._id === venue.legalEntityId)).toBe(true);
      expect(state.brands.some((brand) => brand._id === venue.brandId)).toBe(true);
      expect(state.groups.some((group) => group._id === venue.venueGroupId)).toBe(true);
    }
  });

  test("account default is live; venue override stays local and never copies contact data", async () => {
    const t = convexTest(schema, modules);
    const fixture = await canonicalFixture(t, "CONTACT");
    const asOwner = t.withIdentity({
      subject: fixture.seed.users.owner,
      issuer: ISSUER,
    });
    const asManager = t.withIdentity({
      subject: fixture.seed.users.manager,
      issuer: ISSUER,
    });
    expect((await asOwner.query(api.clientAccounts.getAccount, {
      accountId: fixture.accountId,
    })).defaultContact.id).toBe(fixture.organization.ownerContactId);

    await asOwner.mutation(api.clientAccounts.setDefaultContact, {
      accountId: fixture.accountId,
      contactId: fixture.organization.financeContactId,
    });
    const accountAfter = await asOwner.query(api.clientAccounts.getAccount, {
      accountId: fixture.accountId,
    });
    expect(accountAfter.defaultContact.id).toBe(fixture.organization.financeContactId);
    const inherited = await asOwner.query(api.clientAccounts.getVenue, {
      businessId: fixture.seed.businesses[0],
    });
    expect(inherited.contactSource).toBe("account");
    expect(inherited.effectiveContact.id).toBe(fixture.organization.financeContactId);

    await asManager.mutation(api.clientAccounts.setVenueDefaultContactOverride, {
      businessId: fixture.seed.businesses[3],
      contactId: fixture.organization.ownerContactId,
    });
    const overridden = await asManager.query(api.clientAccounts.getVenue, {
      businessId: fixture.seed.businesses[3],
    });
    expect(overridden.contactSource).toBe("venue_override");
    expect(overridden.effectiveContact.id).toBe(fixture.organization.ownerContactId);
    expect((await asOwner.query(api.clientAccounts.getAccount, {
      accountId: fixture.accountId,
    })).defaultContact.id).toBe(fixture.organization.financeContactId);

    await t.run((ctx) =>
      ctx.db.patch(fixture.organization.financeContactId, {
        normalizedPhone: "381601234567",
        updatedAt: NOW + 2,
      }),
    );
    expect((await asOwner.query(api.clientAccounts.getAccount, {
      accountId: fixture.accountId,
    })).defaultContact.phone).toBe("381601234567");
    const rawAccount = await t.run((ctx) => ctx.db.get(fixture.accountId));
    expect(rawAccount?.defaultContactId).toBe(fixture.organization.financeContactId);
    expect(rawAccount).not.toHaveProperty("defaultContactName");
    expect(rawAccount).not.toHaveProperty("defaultContactPhone");
  });

  test("manager can buy/pay when granted, but cannot cancel or leave venue scope", async () => {
    const t = convexTest(schema, modules);
    const fixture = await canonicalFixture(t, "CAP");
    const asManager = t.withIdentity({
      subject: fixture.seed.users.manager,
      issuer: ISSUER,
    });
    const ownVenue = await asManager.query(api.clientAccounts.getVenue, {
      businessId: fixture.seed.businesses[3],
    });
    expect(ownVenue.access.role).toBe("venue_management");
    expect(ownVenue.access.capabilities).toMatchObject({
      canBuyServices: true,
      canBuyPremium: false,
      canCancelService: false,
      canManageVenue: true,
    });
    await expect(
      asManager.run((ctx) =>
        requireBusinessPurchaseAccess(ctx, fixture.seed.businesses[3]),
      ),
    ).resolves.toBeDefined();
    await expect(
      asManager.run((ctx) =>
        requireClientVenueCapability(
          ctx,
          fixture.seed.businesses[3],
          "cancel_service",
        ),
      ),
    ).rejects.toThrow("Nemate pristup");
    await expect(
      asManager.query(api.clientAccounts.getVenue, {
        businessId: fixture.seed.businesses[0],
      }),
    ).rejects.toThrow("Nemate pristup");
    const asViewer = t.withIdentity({
      subject: fixture.seed.users.viewer,
      issuer: ISSUER,
    });
    await expect(
      asViewer.run((ctx) =>
        requireBusinessPurchaseAccess(ctx, fixture.seed.businesses[1]),
      ),
    ).rejects.toThrow("Nemate pristup");

    const asCoOwner = t.withIdentity({
      subject: fixture.seed.users.coOwner,
      issuer: ISSUER,
    });
    await expect(
      asCoOwner.run((ctx) =>
        requireClientVenueCapability(
          ctx,
          fixture.seed.businesses[0],
          "cancel_service",
        ),
      ),
    ).resolves.toBeDefined();
  });

  test("foreign account, venue and contact IDs are rejected server-side", async () => {
    const t = convexTest(schema, modules);
    const first = await canonicalFixture(t, "OWN");
    const second = await canonicalFixture(t, "OTHER");
    const asOwner = t.withIdentity({ subject: first.seed.users.owner, issuer: ISSUER });
    const asOutsider = t.withIdentity({ subject: first.seed.users.outsider, issuer: ISSUER });
    await expect(
      asOutsider.query(api.clientAccounts.getAccount, { accountId: first.accountId }),
    ).rejects.toThrow("Nemate pristup");
    await expect(
      asOwner.query(api.clientAccounts.getAccount, { accountId: second.accountId }),
    ).rejects.toThrow("Nemate pristup");
    await expect(
      asOwner.query(api.clientAccounts.getVenue, {
        businessId: second.seed.businesses[0],
      }),
    ).rejects.toThrow("Nemate pristup");
    await expect(
      asOwner.mutation(api.clientAccounts.setDefaultContact, {
        accountId: first.accountId,
        contactId: second.organization.ownerContactId,
      }),
    ).rejects.toThrow("nije pronađen u ovom nalogu");
    await expect(
      asOwner.mutation(api.clientAccounts.setVenueDefaultContactOverride, {
        businessId: second.seed.businesses[0],
        contactId: first.organization.ownerContactId,
      }),
    ).rejects.toThrow("Nemate pristup");
  });

  test("primary ownership is one pointer while several members keep full access", async () => {
    const t = convexTest(schema, modules);
    const fixture = await canonicalFixture(t, "OWNER");
    const asOwner = t.withIdentity({ subject: fixture.seed.users.owner, issuer: ISSUER });
    const transferred = await asOwner.mutation(api.clientAccounts.transferPrimaryOwner, {
      accountId: fixture.accountId,
      membershipId: fixture.organization.coOwnerMembershipId,
      reason: "Test prenosa vlasništva",
    });
    expect(transferred.primaryOwnerMembershipId).toBe(
      fixture.organization.coOwnerMembershipId,
    );
    const state = await t.run(async (ctx) => ({
      account: await ctx.db.get(fixture.accountId),
      fullAccess: await ctx.db
        .query("accountMemberships")
        .withIndex("by_accountId_and_role", (q) =>
          q.eq("accountId", fixture.accountId).eq("role", "full_access"),
        )
        .take(10),
    }));
    expect(state.account?.primaryOwnerMembershipId).toBe(
      fixture.organization.coOwnerMembershipId,
    );
    expect(state.fullAccess).toHaveLength(2);
    expect(state.fullAccess.every((member) => member.active)).toBe(true);
    await expect(
      asOwner.mutation(api.clientAccounts.transferPrimaryOwner, {
        accountId: fixture.accountId,
        membershipId: state.fullAccess.find(
          (member) => member._id !== fixture.organization.coOwnerMembershipId,
        )!._id,
        reason: "Stari vlasnik pokušava povratak",
      }),
    ).rejects.toThrow("Samo primarni vlasnik");
  });

  test("SMK/SML relacije remain ID-based when display codes change", async () => {
    const t = convexTest(schema, modules);
    const fixture = await canonicalFixture(t, "IDS");
    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.accountId, { smkCode: "SMK-RENAMED" });
      await ctx.db.patch(fixture.seed.businesses[0], { smlCode: "SML-RENAMED-1" });
    });
    const asOwner = t.withIdentity({ subject: fixture.seed.users.owner, issuer: ISSUER });
    const venue = await asOwner.query(api.clientAccounts.getVenue, {
      businessId: fixture.seed.businesses[0],
    });
    expect(venue.account.id).toBe(fixture.accountId);
    expect(venue.venue.id).toBe(fixture.seed.businesses[0]);
    expect(venue.account.code).toBe("SMK-RENAMED");
    expect(venue.venue.code).toBe("SML-RENAMED-1");
  });
});
