/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
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

// TASK-41 (RFC-002 §2.6, §4 task 13) — the per-location admin read that the
// per-location subpages and the location sidebar sit on. The gate is
// server-authoritative: the subpage exists iff its service is active; a missing
// location returns null (the caller renders notFound()).
describe("admin.location per-location read", () => {
  async function seedBusiness(
    t: ReturnType<typeof convexTest>,
    name: string,
    slug: string,
    accountId?: Id<"accounts">,
  ) {
    return t.run((ctx) =>
      ctx.db.insert("businesses", {
        name,
        slug,
        status: "active",
        ...(accountId ? { accountId } : {}),
        createdAt: Date.now(),
      }),
    );
  }

  async function seedProfile(
    t: ReturnType<typeof convexTest>,
    businessId: Id<"businesses">,
    type: Doc<"serviceProfiles">["type"],
    slug: string,
    status: "active" | "inactive" = "active",
  ) {
    return t.run((ctx) => {
      const now = Date.now();
      return ctx.db.insert("serviceProfiles", {
        businessId,
        type,
        slug,
        status,
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
  }

  test("a non-admin is refused", async () => {
    const t = convexTest(schema, modules);
    const businessId = await seedBusiness(t, "Lokal", "lokal");
    // Unauthenticated.
    await expect(t.query(api.admin.location, { businessId })).rejects.toThrow();
    // Authenticated but not an admin.
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const clientId = await t.run((ctx) =>
      ctx.db.insert("users", { email: "client@example.test" }),
    );
    const asClient = t.withIdentity({
      subject: clientId,
      issuer: "https://test.local",
    });
    await expect(
      asClient.query(api.admin.location, { businessId }),
    ).rejects.toThrow();
  });

  test("a missing location returns null (behaves as if it does not exist)", async () => {
    const { t, asAdmin } = await seedAdmin();
    const businessId = await seedBusiness(t, "Lokal", "lokal");
    await t.run((ctx) => ctx.db.delete(businessId));
    const view = await asAdmin.query(api.admin.location, { businessId });
    expect(view).toBeNull();
  });

  test("an archived location returns null", async () => {
    const { t, asAdmin } = await seedAdmin();
    const businessId = await seedBusiness(t, "Lokal", "lokal");
    await t.run((ctx) =>
      ctx.db.patch(businessId, { archivedAt: Date.now() }),
    );
    const view = await asAdmin.query(api.admin.location, { businessId });
    expect(view).toBeNull();
  });

  test("a solo location is full width (not enterprise) and reports each service's active flag", async () => {
    const { t, asAdmin } = await seedAdmin();
    const businessId = await seedBusiness(t, "Kafić", "kafic");
    await seedProfile(t, businessId, "scanme_links", "kafic", "active");
    await seedProfile(t, businessId, "google_review", "kafic-gr", "active");
    await seedProfile(t, businessId, "scanme_venue", "kafic-v", "inactive");

    const view = await asAdmin.query(api.admin.location, { businessId });
    expect(view).not.toBeNull();
    expect(view!.isEnterprise).toBe(false);
    expect(view!.siblings).toHaveLength(1);
    expect(view!.siblings[0].id).toBe(businessId);

    const byType = new Map(view!.services.map((s) => [s.type, s.active]));
    // The active services back their subpages; the inactive one is present but
    // flagged inactive, so its subpage 404s in the UI.
    expect(byType.get("scanme_links")).toBe(true);
    expect(byType.get("google_review")).toBe(true);
    expect(byType.get("scanme_venue")).toBe(false);
  });

  test("a multi-location account is enterprise; siblings list every location with its active-service count", async () => {
    const { t, asAdmin } = await seedAdmin();
    const accountId = await t.run((ctx) => {
      const now = Date.now();
      return ctx.db.insert("accounts", {
        name: "Kafanski lanac",
        plan: "premium",
        planPeriod: "annual",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    });
    const first = await seedBusiness(t, "Lokal A", "lokal-a", accountId);
    const second = await seedBusiness(t, "Lokal B", "lokal-b", accountId);
    await seedProfile(t, first, "scanme_links", "lokal-a", "active");
    await seedProfile(t, first, "scanme_venue", "lokal-a-v", "active");
    await seedProfile(t, second, "scanme_links", "lokal-b", "active");
    await seedProfile(t, second, "google_review", "lokal-b-gr", "inactive");

    const view = await asAdmin.query(api.admin.location, {
      businessId: first,
    });
    expect(view!.isEnterprise).toBe(true);
    expect(view!.account?.name).toBe("Kafanski lanac");
    expect(view!.siblings).toHaveLength(2);
    const counts = new Map(
      view!.siblings.map((s) => [s.id, s.activeServiceCount]),
    );
    expect(counts.get(first)).toBe(2);
    expect(counts.get(second)).toBe(1); // the inactive google_review is not counted
  });

  test("a single-location account is NOT enterprise (no sidebar)", async () => {
    const { t, asAdmin } = await seedAdmin();
    const accountId = await t.run((ctx) => {
      const now = Date.now();
      return ctx.db.insert("accounts", {
        name: "Solo nalog",
        plan: "basic",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    });
    const businessId = await seedBusiness(t, "Jedini lokal", "jedini", accountId);
    await seedProfile(t, businessId, "scanme_links", "jedini", "active");

    const view = await asAdmin.query(api.admin.location, { businessId });
    expect(view!.isEnterprise).toBe(false);
    expect(view!.siblings).toHaveLength(1);
  });
});
