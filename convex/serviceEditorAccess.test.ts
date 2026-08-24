/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { requireServiceEditorAccess } from "./lib/access";

const modules = import.meta.glob("./**/*.ts");

// Step 0.3 (TASK-03): the now-shared editor-access gate must REJECT a profile
// whose type is not in the allowedTypes list, before any auth/membership check.
describe("requireServiceEditorAccess type gate (RFC-001 §2.1)", () => {
  test("rejects a profile whose type is not in allowedTypes", async () => {
    const t = convexTest(schema, modules);
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
        status: "active",
        clientEditingEnabled: true,
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      t.run(async (ctx) => {
        const profile = await ctx.db.get(venueProfileId);
        // A Links-only call site must not accept a scanme_venue profile.
        return requireServiceEditorAccess(ctx, profile!, ["scanme_links"]);
      }),
    ).rejects.toThrow("Servisni profil nije pronađen.");
  });

  test("accepts a profile whose type IS in allowedTypes (admin path)", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    const seeded = await t.run(async (ctx) => {
      const now = Date.now();
      const adminId = await ctx.db.insert("users", {
        email: "admin@scanme.test",
        emailVerificationTime: now,
      });
      const businessId = await ctx.db.insert("businesses", {
        name: "Klub Venue",
        slug: "klub-venue",
        status: "active",
        createdAt: now,
      });
      const profileId = await ctx.db.insert("serviceProfiles", {
        businessId,
        type: "scanme_venue",
        slug: "klub-venue-venue",
        status: "active",
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: now,
        updatedAt: now,
      });
      return { adminId, profileId };
    });

    const asAdmin = t.withIdentity({
      subject: seeded.adminId,
      issuer: "https://test.local",
    });
    const access = await asAdmin.run(async (ctx) => {
      const profile = await ctx.db.get(seeded.profileId);
      return requireServiceEditorAccess(ctx, profile!, ["scanme_venue"]);
    });
    expect(access.role).toBe("admin");
  });
});
