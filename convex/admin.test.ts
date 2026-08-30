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
    asAdmin: t.withIdentity({ subject: adminId, issuer: "https://test.local" }),
  };
}

describe("updateBusinessName slug sync", () => {
  test("renaming re-slugs every service and keeps the old QR address working", async () => {
    const { t, asAdmin } = await seedAdmin();
    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Resend Test 2",
      slug: "resend-test-2",
      destinationUrl: "https://maps.google.com/review",
    });

    const result = await asAdmin.mutation(api.admin.updateBusinessName, {
      businessId: created.businessId,
      name: "Teodora Test 2",
    });
    expect(result.clientPanelSlug).toBe("teodora-test-2");
    expect(result.qrSlug).toBe("teodora-test-2-google-review");

    await t.run(async (ctx) => {
      const business = await ctx.db.get(created.businessId);
      expect(business?.name).toBe("Teodora Test 2");
      expect(business?.slug).toBe("teodora-test-2");

      const linksProfile = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", created.businessId).eq("type", "scanme_links"),
        )
        .unique();
      expect(linksProfile?.slug).toBe("teodora-test-2");

      const reviewProfile = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", created.businessId).eq("type", "google_review"),
        )
        .unique();
      expect(reviewProfile?.slug).toBe("teodora-test-2-google-review");

      const link = await ctx.db.get(created.linkId);
      expect(link?.slug).toBe("teodora-test-2-google-review");

      // The old printed QR slug still resolves via an alias.
      const linkAlias = await ctx.db
        .query("dynamicLinkAliases")
        .withIndex("by_slug", (q) => q.eq("slug", "resend-test-2-google-review"))
        .unique();
      expect(linkAlias?.dynamicLinkId).toBe(created.linkId);
      const serviceAlias = await ctx.db
        .query("serviceSlugAliases")
        .withIndex("by_slug", (q) => q.eq("slug", "resend-test-2"))
        .unique();
      expect(serviceAlias?.serviceProfileId).toBe(linksProfile?._id);

      // The editor page title (display name) followed the rename.
      const config = await ctx.db
        .query("scanMeLinksConfigs")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", linksProfile!._id),
        )
        .unique();
      expect(config?.draftDisplayName).toBe("Teodora Test 2");
    });
  });

  test("a colliding rename auto-suffixes instead of throwing", async () => {
    const { asAdmin } = await seedAdmin();
    await asAdmin.mutation(api.admin.createBusiness, {
      name: "Cafe One",
      slug: "cafe-one",
      destinationUrl: "https://maps.google.com/a",
    });
    const second = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Cafe Two",
      slug: "cafe-two",
      destinationUrl: "https://maps.google.com/b",
    });

    const result = await asAdmin.mutation(api.admin.updateBusinessName, {
      businessId: second.businessId,
      name: "Cafe One",
    });
    expect(result.clientPanelSlug).toBe("cafe-one-2");
    expect(result.qrSlug).toBe("cafe-one-2-google-review");
  });

  test("a customized editor title is not overwritten by a rename", async () => {
    const { t, asAdmin } = await seedAdmin();
    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Original Naziv",
      slug: "original-naziv",
      destinationUrl: "https://maps.google.com/c",
    });
    const linksProfileId = await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId_and_type", (q) =>
          q.eq("businessId", created.businessId).eq("type", "scanme_links"),
        )
        .unique();
      const config = await ctx.db
        .query("scanMeLinksConfigs")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", profile!._id),
        )
        .unique();
      // Simulate a client who customized the page title in the editor.
      await ctx.db.patch(config!._id, { draftDisplayName: "Custom Page Title" });
      return profile!._id;
    });

    await asAdmin.mutation(api.admin.updateBusinessName, {
      businessId: created.businessId,
      name: "Novi Naziv",
    });

    await t.run(async (ctx) => {
      const config = await ctx.db
        .query("scanMeLinksConfigs")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", linksProfileId),
        )
        .unique();
      expect(config?.draftDisplayName).toBe("Custom Page Title");
    });
  });
});
