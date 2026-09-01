/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { requireBusinessAccess } from "./lib/access";
import { getEntitlement } from "./lib/entitlements";

const modules = import.meta.glob("./**/*.ts");

const ISSUER = "https://test.local";
const ADMIN_EMAIL = "admin@scanme.test";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

// A platform-admin user (gates provisioning) and a REGULAR Enterprise-owner user
// (NOT an admin email — if it were, requireBusinessAccess would bypass membership
// and reaching N locations would prove nothing).
async function seedUsers(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminUserId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });
    const ownerUserId = await ctx.db.insert("users", {
      email: "owner@lanac.test",
      emailVerificationTime: now,
    });
    return { adminUserId, ownerUserId };
  });
}

function makeLocations(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Lokal ${i + 1}`,
    slug: `lanac-lokal-${i + 1}`,
  }));
}

// Drive the resumable continuation to completion by following `nextIndex` — the
// exact resume mechanism a crash recovery uses (re-invoke with the next index).
// Convex-test does not auto-run scheduled functions, so nothing double-executes.
async function drainFanOut(
  t: ReturnType<typeof convexTest>,
  accountId: Id<"accounts">,
  ownerUserId: Id<"users">,
  locations: Array<{ name: string; slug: string }>,
  startIndex = 0,
) {
  let index = startIndex;
  for (let guard = 0; guard < 1000; guard += 1) {
    const result = await t.mutation(
      internal.enterpriseProvisioning.provisionEnterpriseLocations,
      { accountId, ownerUserId, locations, index },
    );
    if (result.done) return;
    index = result.nextIndex;
  }
  throw new Error("fan-out did not terminate");
}

async function businessesForAccount(
  t: ReturnType<typeof convexTest>,
  accountId: Id<"accounts">,
) {
  return t.run((ctx) =>
    ctx.db
      .query("businesses")
      .withIndex("by_account", (q) => q.eq("accountId", accountId))
      .collect(),
  );
}

async function activeMemberships(
  t: ReturnType<typeof convexTest>,
  ownerUserId: Id<"users">,
) {
  return t.run((ctx) =>
    ctx.db
      .query("businessMemberships")
      .withIndex("by_userId_and_active", (q) =>
        q.eq("userId", ownerUserId).eq("active", true),
      )
      .collect(),
  );
}

describe("Enterprise provisioning (RFC-002 §2.2, §4 task 4)", () => {
  test("one owner user reaches all N locations through requireBusinessAccess unchanged", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });
    const N = 13;
    const locations = makeLocations(N);

    const { accountId, locationCount } = await asAdmin.mutation(
      api.enterpriseProvisioning.provisionEnterprise,
      { name: "Kafanski lanac d.o.o.", ownerUserId, locations },
    );
    expect(locationCount).toBe(N);
    await drainFanOut(t, accountId, ownerUserId, locations);

    const businesses = await businessesForAccount(t, accountId);
    expect(businesses).toHaveLength(N);

    // The success criterion: the owner reaches EVERY location through the
    // untouched requireBusinessAccess (viewer, via membership — no admin bypass).
    const asOwner = t.withIdentity({ subject: ownerUserId, issuer: ISSUER });
    for (const business of businesses) {
      const access = await asOwner.run((ctx) =>
        requireBusinessAccess(ctx, business.slug),
      );
      expect(access.business._id).toBe(business._id);
      expect(access.accessRole).toBe("viewer");
      expect(access.membership?.active).toBe(true);
    }
  });

  test("the account is one enterprise account with the expected plan shape", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });
    const locations = makeLocations(3);

    const { accountId } = await asAdmin.mutation(
      api.enterpriseProvisioning.provisionEnterprise,
      {
        name: "Kafanski lanac d.o.o.",
        ownerUserId,
        locations,
        planPeriod: "annual",
      },
    );
    await drainFanOut(t, accountId, ownerUserId, locations);

    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.plan).toBe("enterprise");
    expect(account?.status).toBe("active");
    expect(account?.planPeriod).toBe("annual");
    expect(account?.planSource).toBe("manual");
    expect(account?.planValidUntil).toBeUndefined();
  });

  test("account.overrides writes ONLY the keys actually set (never undefined)", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });
    const locations = makeLocations(1);

    const { accountId } = await asAdmin.mutation(
      api.enterpriseProvisioning.provisionEnterprise,
      {
        name: "Bespoke lanac",
        ownerUserId,
        locations,
        overrides: { photosPerGuest: 25 },
      },
    );
    await drainFanOut(t, accountId, ownerUserId, locations);

    const account = await t.run((ctx) => ctx.db.get(accountId));
    // Exactly one key. If undefined-valued keys leaked in, getEntitlement step 3
    // would spread them over the tier limits and delete those limits.
    expect(account?.overrides).toEqual({ photosPerGuest: 25 });
    expect(Object.keys(account?.overrides ?? {})).toEqual(["photosPerGuest"]);

    // The override merges over the mapped tier; unset keys keep the tier default.
    const business = (await businessesForAccount(t, accountId))[0];
    const resolved = await t.run((ctx) =>
      getEntitlement(ctx, business._id, "scanme_memories"),
    );
    expect(resolved?.limits.photosPerGuest).toBe(25);
    expect(resolved?.limits.maxImageDimension).toBe(4096); // premium tier default
  });

  test("no overrides arg → the account has no overrides field", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });
    const locations = makeLocations(1);
    const { accountId } = await asAdmin.mutation(
      api.enterpriseProvisioning.provisionEnterprise,
      { name: "Lanac bez override-a", ownerUserId, locations },
    );
    await drainFanOut(t, accountId, ownerUserId, locations);
    const account = await t.run((ctx) => ctx.db.get(accountId));
    expect(account?.overrides).toBeUndefined();
  });

  test("provisioning resumes cleanly after a mid-fan-out stop — no duplicates", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });
    const N = 25; // > PROVISION_BATCH (10) so the fan-out spans multiple steps
    const locations = makeLocations(N);

    const { accountId } = await asAdmin.mutation(
      api.enterpriseProvisioning.provisionEnterprise,
      { name: "Veliki lanac", ownerUserId, locations },
    );

    // Run ONLY the first batch, then stop — simulate a crash before the
    // continuation chain finishes (the scheduled next batch is never run).
    const firstStep = await t.mutation(
      internal.enterpriseProvisioning.provisionEnterpriseLocations,
      { accountId, ownerUserId, locations, index: 0 },
    );
    expect(firstStep.done).toBe(false);
    const partial = await businessesForAccount(t, accountId);
    expect(partial.length).toBeGreaterThan(0);
    expect(partial.length).toBeLessThan(N);

    // Resume from index 0 (the most adversarial resume — re-processes the batch
    // that already ran). Idempotent creates mean it converges without dupes.
    await drainFanOut(t, accountId, ownerUserId, locations, 0);

    const businesses = await businessesForAccount(t, accountId);
    expect(businesses).toHaveLength(N);
    const slugs = new Set(businesses.map((b) => b.slug));
    expect(slugs.size).toBe(N); // no duplicate businesses

    const memberships = await activeMemberships(t, ownerUserId);
    expect(memberships).toHaveLength(N); // no duplicate memberships
  });

  test("running the whole fan-out twice is idempotent", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });
    const N = 12;
    const locations = makeLocations(N);
    const { accountId } = await asAdmin.mutation(
      api.enterpriseProvisioning.provisionEnterprise,
      { name: "Idempotentni lanac", ownerUserId, locations },
    );

    await drainFanOut(t, accountId, ownerUserId, locations);
    await drainFanOut(t, accountId, ownerUserId, locations);

    expect(await businessesForAccount(t, accountId)).toHaveLength(N);
    expect(await activeMemberships(t, ownerUserId)).toHaveLength(N);
  });

  test("the entry's scheduled continuation completes the fan-out end-to-end", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });
    const N = 15;
    const locations = makeLocations(N);
    // Fake timers let finishAllScheduledFunctions drain the whole runAfter(0)
    // continuation chain the entry kicked off (the production path), proving the
    // entry actually wires the scheduler — which the direct-call tests do not.
    vi.useFakeTimers();
    try {
      const { accountId } = await asAdmin.mutation(
        api.enterpriseProvisioning.provisionEnterprise,
        { name: "Lanac sa schedulerom", ownerUserId, locations },
      );
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await businessesForAccount(t, accountId)).toHaveLength(N);
      expect(await activeMemberships(t, ownerUserId)).toHaveLength(N);
    } finally {
      vi.useRealTimers();
    }
  });

  test("a non-admin cannot provision", async () => {
    const t = convexTest(schema, modules);
    const { ownerUserId } = await seedUsers(t);
    const asOwner = t.withIdentity({ subject: ownerUserId, issuer: ISSUER });
    await expect(
      asOwner.mutation(api.enterpriseProvisioning.provisionEnterprise, {
        name: "Neovlašćeni",
        ownerUserId,
        locations: makeLocations(2),
      }),
    ).rejects.toThrow("administratorski");
  });

  test("a slug already owned by another business is refused (loud, not adopted)", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    // A pre-existing account-less business squats the slug the fan-out wants.
    await t.run(async (ctx) => {
      await ctx.db.insert("businesses", {
        name: "Postojeći",
        slug: "lanac-lokal-2",
        status: "active",
        createdAt: Date.now(),
      });
    });
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });
    const locations = makeLocations(3);
    const { accountId } = await asAdmin.mutation(
      api.enterpriseProvisioning.provisionEnterprise,
      { name: "Kolizioni lanac", ownerUserId, locations },
    );
    await expect(
      drainFanOut(t, accountId, ownerUserId, locations),
    ).rejects.toThrow(/već koristi/);
  });
});

describe("admin.customers grouping read (RFC-002 §2.6)", () => {
  test("an enterprise account is ONE expandable row; solo customers are full-width", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });

    // 1. An Enterprise account with 3 locations.
    const entLocations = makeLocations(3);
    const { accountId: entAccountId } = await asAdmin.mutation(
      api.enterpriseProvisioning.provisionEnterprise,
      { name: "Kafanski lanac", ownerUserId, locations: entLocations },
    );
    await drainFanOut(t, entAccountId, ownerUserId, entLocations);

    // 2. A solo account (single location), premium plan.
    const soloUser = await t.run((ctx) =>
      ctx.db.insert("users", { email: "solo@lok.test" }),
    );
    const soloLocations = [{ name: "Solo lokal", slug: "solo-lokal" }];
    const { accountId: soloAccountId } = await asAdmin.mutation(
      api.enterpriseProvisioning.provisionEnterprise,
      {
        name: "Solo nalog",
        ownerUserId: soloUser,
        locations: soloLocations,
        plan: "premium",
      },
    );
    await drainFanOut(t, soloAccountId, soloUser, soloLocations);

    // 3. A legacy account-less business (pre-backfill).
    await t.run(async (ctx) => {
      await ctx.db.insert("businesses", {
        name: "Legacy lokal",
        slug: "legacy-lokal",
        status: "active",
        createdAt: Date.now(),
      });
    });

    const rows = await asAdmin.query(api.admin.customers, {});

    const enterprise = rows.filter((r) => r.kind === "enterprise");
    expect(enterprise).toHaveLength(1);
    const entRow = enterprise[0];
    expect(entRow.kind === "enterprise" && entRow.account.id).toBe(entAccountId);
    expect(
      entRow.kind === "enterprise" && entRow.locations.length,
    ).toBe(3);

    // Solo account + legacy account-less business are both full-width solo rows.
    const solo = rows.filter((r) => r.kind === "solo");
    const legacyRow = solo.find(
      (r) => r.kind === "solo" && r.location.slug === "legacy-lokal",
    );
    expect(legacyRow).toBeDefined();
    expect(legacyRow && legacyRow.kind === "solo" && legacyRow.account).toBeNull();
    const soloRow = solo.find(
      (r) => r.kind === "solo" && r.location.slug === "solo-lokal",
    );
    expect(soloRow).toBeDefined();
    expect(
      soloRow && soloRow.kind === "solo" && soloRow.account?.plan,
    ).toBe("premium");
  });

  test("customers requires admin", async () => {
    const t = convexTest(schema, modules);
    const { ownerUserId } = await seedUsers(t);
    const asOwner = t.withIdentity({ subject: ownerUserId, issuer: ISSUER });
    await expect(asOwner.query(api.admin.customers, {})).rejects.toThrow(
      "administratorski",
    );
  });

  test("a solo customer carries the call-list phone + all its services", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });

    await asAdmin.mutation(api.admin.createBusiness, {
      name: "Kafić Ćira",
      slug: "kafic-cira",
      destinationUrl: "https://maps.google.com/cira",
      contacts: [
        {
          firstName: "Mika",
          lastName: "Mikić",
          email: "mika@cira.test",
          phone: "0641234567",
          positionTitle: "Vlasnik",
        },
      ],
    });

    const rows = await asAdmin.query(api.admin.customers, {});
    const row = rows.find(
      (r) => r.kind === "solo" && r.location.slug === "kafic-cira",
    );
    expect(row && row.kind === "solo").toBe(true);
    if (!row || row.kind !== "solo") throw new Error("solo row missing");
    expect(row.location.phone).toBe("0641234567");
    expect(row.location.contactName).toBe("Mika Mikić");
    // createBusiness seeds scanme_links + google_review profiles (both inactive).
    const types = row.location.services.map((s) => s.type).sort();
    expect(types).toEqual(["google_review", "scanme_links"]);
    expect(row.location.services.every((s) => s.status === "inactive")).toBe(true);
  });
});

describe("admin.setServiceProfileActive (RFC-002 §2.6, TASK-40)", () => {
  test("toggling a service writes EXACTLY ONE audit row (who/what/when)", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });

    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Bar Brut",
      slug: "bar-brut",
      destinationUrl: "https://maps.google.com/brut",
      contacts: [
        {
          firstName: "Ana",
          lastName: "Anić",
          email: "ana@brut.test",
          phone: "0607654321",
          positionTitle: "Vlasnik",
        },
      ],
    });
    const profileId = created.scanMeLinksProfileId;
    const businessId = created.businessId;

    // Activate → status flips, one audit row.
    const activated = await asAdmin.mutation(api.admin.setServiceProfileActive, {
      serviceProfileId: profileId,
      active: true,
    });
    expect(activated.changed).toBe(true);
    expect(activated.status).toBe("active");

    let audit = await t.run((ctx) =>
      ctx.db
        .query("adminAuditLog")
        .withIndex("by_businessId_and_createdAt", (q) =>
          q.eq("businessId", businessId),
        )
        .collect(),
    );
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("activate_service");
    expect(audit[0].actorUserId).toBe(adminUserId);
    expect(JSON.parse(audit[0].detail ?? "{}").service).toBe("scanme_links");

    // A no-op (already active) writes NOTHING.
    const noop = await asAdmin.mutation(api.admin.setServiceProfileActive, {
      serviceProfileId: profileId,
      active: true,
    });
    expect(noop.changed).toBe(false);
    audit = await t.run((ctx) =>
      ctx.db
        .query("adminAuditLog")
        .withIndex("by_businessId_and_createdAt", (q) =>
          q.eq("businessId", businessId),
        )
        .collect(),
    );
    expect(audit).toHaveLength(1);

    // Deactivate → one more audit row.
    const deactivated = await asAdmin.mutation(
      api.admin.setServiceProfileActive,
      { serviceProfileId: profileId, active: false },
    );
    expect(deactivated.changed).toBe(true);
    expect(deactivated.status).toBe("inactive");
    audit = await t.run((ctx) =>
      ctx.db
        .query("adminAuditLog")
        .withIndex("by_businessId_and_createdAt", (q) =>
          q.eq("businessId", businessId),
        )
        .order("desc")
        .collect(),
    );
    expect(audit).toHaveLength(2);
    expect(audit[0].action).toBe("deactivate_service");
  });

  test("setServiceProfileActive requires admin", async () => {
    const t = convexTest(schema, modules);
    const { adminUserId, ownerUserId } = await seedUsers(t);
    const asAdmin = t.withIdentity({ subject: adminUserId, issuer: ISSUER });
    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Klub Kula",
      slug: "klub-kula",
      destinationUrl: "https://maps.google.com/kula",
    });
    const asOwner = t.withIdentity({ subject: ownerUserId, issuer: ISSUER });
    await expect(
      asOwner.mutation(api.admin.setServiceProfileActive, {
        serviceProfileId: created.scanMeLinksProfileId,
        active: true,
      }),
    ).rejects.toThrow("administratorski");
  });
});
