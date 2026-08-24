/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedAdmin() {
  process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
  const t = convexTest(schema, modules);
  const adminId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      email: "admin@scanme.test",
      emailVerificationTime: Date.now(),
    }),
  );
  return {
    t,
    adminId,
    asAdmin: t.withIdentity({ subject: adminId, issuer: "https://test.local" }),
  };
}

describe("setServiceActive un-gated for new service types (RFC-001 §2.1)", () => {
  test("succeeds on a scanme_venue profile", async () => {
    const { t, asAdmin } = await seedAdmin();
    const venueProfileId = await t.run(async (ctx) => {
      const now = Date.now();
      const businessId = await ctx.db.insert("businesses", {
        name: "Klub Venue",
        slug: "klub-venue",
        status: "active",
        createdAt: now,
      });
      return ctx.db.insert("serviceProfiles", {
        businessId,
        type: "scanme_venue",
        slug: "klub-venue-venue",
        status: "inactive",
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    const result = await asAdmin.mutation(api.scanMeLinks.setServiceActive, {
      serviceProfileId: venueProfileId,
      active: true,
    });
    expect(result.active).toBe(true);

    const profile = await t.run(async (ctx) => ctx.db.get(venueProfileId));
    expect(profile?.status).toBe("active");
  });
});

describe("businesses.kind validation (RFC-001 §2.1.6)", () => {
  test("a row with no kind validates, and one with kind 'celebration' validates", async () => {
    const { t } = await seedAdmin();
    const ids = await t.run(async (ctx) => {
      const now = Date.now();
      const legacyId = await ctx.db.insert("businesses", {
        name: "Legacy No Kind",
        slug: "legacy-no-kind",
        status: "active",
        createdAt: now,
      });
      const celebrationId = await ctx.db.insert("businesses", {
        name: "Jovana i Marko",
        slug: "jovana-i-marko",
        kind: "celebration",
        status: "active",
        createdAt: now,
      });
      return { legacyId, celebrationId };
    });

    const rows = await t.run(async (ctx) => ({
      legacy: await ctx.db.get(ids.legacyId),
      celebration: await ctx.db.get(ids.celebrationId),
    }));
    expect(rows.legacy?.kind).toBeUndefined();
    expect(rows.celebration?.kind).toBe("celebration");
  });
});

describe("reserved slugs after the pre-flight scan (RFC-001 §2.7)", () => {
  test("creating a business slugged 'm' throws the reserved-slug error", async () => {
    const { asAdmin } = await seedAdmin();
    await expect(
      asAdmin.mutation(api.admin.createBusiness, {
        name: "M Test",
        slug: "m",
        destinationUrl: "https://maps.google.com/review",
      }),
    ).rejects.toThrow("rezervisana za ScanMe sistem");
  });

  test("creating a business slugged 'venue' still succeeds", async () => {
    const { t, asAdmin } = await seedAdmin();
    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Venue Slug",
      slug: "venue",
      destinationUrl: "https://maps.google.com/review",
    });
    const business = await t.run(async (ctx) => ctx.db.get(created.businessId));
    expect(business?.slug).toBe("venue");
  });
});
