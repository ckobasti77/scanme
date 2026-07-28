/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { isSafePublicDestination, requireSlug } from "./lib/validation";
import {
  BUSINESS_SLUG_MAX_LENGTH,
  businessSlugFromName,
  canonicalBusinessSlugs,
} from "../lib/business-slug";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedLink(t: ReturnType<typeof convexTest>, slug: string, destinationUrl: string, active = true) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: `Lokal ${slug}`,
      slug,
      status: "active",
      createdAt: now,
    });
    const linkId = await ctx.db.insert("dynamicLinks", {
      businessId,
      slug,
      destinationUrl,
      type: "google_review",
      active,
      scanCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { businessId, linkId };
  });
}

async function adminClient(t: ReturnType<typeof convexTest>) {
  process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
  const adminId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      email: "admin@scanme.test",
      emailVerificationTime: Date.now(),
    }),
  );
  return t.withIdentity({ subject: adminId, issuer: "https://test.local" });
}

describe("QR preusmeravanje", () => {
  test("isti requestId broji tačno jednom i vraća trenutnu destinaciju", async () => {
    const t = convexTest(schema, modules);
    const destinationUrl = "https://search.google.com/local/writereview?placeid=test";
    const { linkId } = await seedLink(t, "zova-review", destinationUrl);
    const args = {
      slug: "zova-review",
      requestId: "11111111-1111-4111-8111-111111111111",
      deviceCategory: "mobile" as const,
    };

    await expect(t.mutation(api.redirects.resolveAndRecord, args)).resolves.toEqual({
      status: "available",
      destinationUrl,
    });
    await t.mutation(api.redirects.resolveAndRecord, args);

    const state = await t.run(async (ctx) => {
      const link = await ctx.db.get(linkId);
      const events = await ctx.db
        .query("scanEvents")
        .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
        .take(2);
      const daily = await ctx.db
        .query("dailyScanCounts")
        .withIndex("by_dynamicLinkId_and_dateKey", (q) => q.eq("dynamicLinkId", linkId))
        .take(2);
      return { count: link?.scanCount, events: events.length, daily: daily[0]?.count };
    });
    expect(state).toEqual({ count: 1, events: 1, daily: 1 });
  });

  test("promena destinacije važi već za sledeći sken", async () => {
    const t = convexTest(schema, modules);
    const { linkId } = await seedLink(t, "lav-review", "https://www.google.com/maps/place/old");
    const nextDestination = "https://reviews.example.com/lav";
    await t.run(async (ctx) => {
      await ctx.db.patch(linkId, { destinationUrl: nextDestination, updatedAt: Date.now() });
    });
    const result = await t.mutation(api.redirects.resolveAndRecord, {
      slug: "lav-review",
      requestId: "22222222-2222-4222-8222-222222222222",
      deviceCategory: "desktop",
    });
    expect(result).toEqual({ status: "available", destinationUrl: nextDestination });
  });

  test("bot događaj se čuva ali ne ulazi u primarne brojke", async () => {
    const t = convexTest(schema, modules);
    const { linkId } = await seedLink(t, "bot-review", "https://reviews.example.com/bot");
    await t.mutation(api.redirects.resolveAndRecord, {
      slug: "bot-review",
      requestId: "33333333-3333-4333-8333-333333333333",
      deviceCategory: "bot",
    });
    const count = await t.run(async (ctx) => (await ctx.db.get(linkId))?.scanCount);
    expect(count).toBe(0);
  });

  test("neaktivna i nebezbedna destinacija ne broje sken", async () => {
    const t = convexTest(schema, modules);
    const inactive = await seedLink(t, "inactive-review", "https://reviews.example.com/inactive", false);
    const unsafe = await seedLink(t, "unsafe-review", "https://localhost/private");
    await expect(t.mutation(api.redirects.resolveAndRecord, {
      slug: "inactive-review",
      requestId: "44444444-4444-4444-8444-444444444444",
    })).resolves.toEqual({ status: "inactive" });
    await expect(t.mutation(api.redirects.resolveAndRecord, {
      slug: "unsafe-review",
      requestId: "55555555-5555-4555-8555-555555555555",
    })).resolves.toEqual({ status: "invalid_destination" });
    const counts = await t.run(async (ctx) => [
      (await ctx.db.get(inactive.linkId))?.scanCount,
      (await ctx.db.get(unsafe.linkId))?.scanCount,
    ]);
    expect(counts).toEqual([0, 0]);
  });
});

describe("pristup klijentskom panelu", () => {
  test("POC dobija aktivni panel za automatski redirect posle prijave", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedLink(t, "landing-panel", "https://reviews.example.com/landing");
    const userId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("users", {
        email: "landing-poc@example.com",
        emailVerificationTime: now,
      });
      await ctx.db.insert("businessMemberships", {
        userId: id,
        businessId: seeded.businessId,
        accessRole: "viewer",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });

    await expect(t.withIdentity({ subject: userId, issuer: "https://test.local" }).query(api.clientPanel.myPanels, {}))
      .resolves.toEqual([{ slug: "landing-panel", name: "Lokal landing-panel" }]);
  });

  test("POC vidi metrike aktivnog linka kada lokal ima i stariji neaktivni link", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedLink(t, "lokal-sa-vise-linkova", "https://reviews.example.com/aktivan");
    const userId = await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(seeded.linkId, { scanCount: 7, updatedAt: now });
      await ctx.db.insert("dynamicLinks", {
        businessId: seeded.businessId,
        slug: "stari-neaktivni-link",
        destinationUrl: "https://reviews.example.com/stari",
        type: "google_review",
        active: false,
        scanCount: 99,
        createdAt: now - 1_000,
        updatedAt: now + 1_000,
      });
      const id = await ctx.db.insert("users", {
        email: "poc-vise-linkova@example.com",
        emailVerificationTime: now,
      });
      await ctx.db.insert("businessMemberships", {
        userId: id,
        businessId: seeded.businessId,
        accessRole: "viewer",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });
    const asPoc = t.withIdentity({ subject: userId, issuer: "https://test.local" });

    await expect(asPoc.query(api.clientPanel.metrics, { slug: "lokal-sa-vise-linkova" }))
      .resolves.toMatchObject({ status: "available", total: 7 });
  });

  test("član lokala A ne može da pročita lokal B", async () => {
    const t = convexTest(schema, modules);
    const localA = await seedLink(t, "lokal-a", "https://reviews.example.com/a");
    await seedLink(t, "lokal-b", "https://reviews.example.com/b");
    const userId = await t.run(async (ctx) => {
      const now = Date.now();
      const id = await ctx.db.insert("users", { email: "poc@example.com", emailVerificationTime: now });
      await ctx.db.insert("businessMemberships", {
        userId: id,
        businessId: localA.businessId,
        accessRole: "viewer",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      return id;
    });
    const asPoc = t.withIdentity({ subject: userId, issuer: "https://test.local" });
    await expect(asPoc.query(api.clientPanel.metrics, { slug: "lokal-a" })).resolves.toMatchObject({ status: "available", businessName: "Lokal lokal-a" });
    await expect(asPoc.query(api.clientPanel.metrics, { slug: "lokal-b" })).resolves.toEqual({ status: "forbidden" });
  });

  test("admin bez članstva može da vidi klijentske panele svih lokala", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    await seedLink(t, "lokal-a", "https://reviews.example.com/a");
    await seedLink(t, "lokal-b", "https://reviews.example.com/b");
    const adminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        email: "admin@scanme.test",
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: "https://test.local" });

    await expect(asAdmin.query(api.clientPanel.metrics, { slug: "lokal-a" })).resolves.toMatchObject({
      status: "available",
      businessName: "Lokal lokal-a",
    });
    await expect(asAdmin.query(api.clientPanel.metrics, { slug: "lokal-b" })).resolves.toMatchObject({
      status: "available",
      businessName: "Lokal lokal-b",
    });
    delete process.env.SCANME_ADMIN_EMAILS;
  });
});

describe("admin kreiranje lokala", () => {
  test("u jednoj mutaciji kreira lokal, link, POC i queued pozivnicu", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    const adminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        email: "admin@scanme.test",
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: "https://test.local" });
    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Zova",
      // Legacy value is accepted during rollout but deliberately ignored.
      slug: "zova-test",
      destinationUrl: "https://search.google.com/local/writereview?placeid=zova",
      firstName: "Milan",
      lastName: "Jovanović",
      email: "milan@zova.test",
      phone: "+38160111222",
      positionTitle: "Vlasnik",
    });
    const invitationId = created.invitationId;
    if (!invitationId) throw new Error("Test setup nije kreirao pozivnicu.");
    const rows = await t.run(async (ctx) => {
      const business = await ctx.db.get(created.businessId);
      const link = await ctx.db.get(created.linkId);
      const invitation = await ctx.db.get(invitationId);
      const contact = invitation ? await ctx.db.get(invitation.contactId) : null;
      const profiles = await ctx.db
        .query("serviceProfiles")
        .withIndex("by_businessId", (q) => q.eq("businessId", created.businessId))
        .take(10);
      return { business, link, invitation, contact, profiles };
    });
    expect(rows.business).toMatchObject({ name: "Zova", status: "active" });
    expect(rows.link).toMatchObject({
      slug: "zova-google-review",
      active: false,
      scanCount: 0,
    });
    expect(rows.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "scanme_links", slug: "zova", status: "inactive" }),
        expect.objectContaining({
          type: "google_review",
          slug: "zova-google-review",
          status: "inactive",
        }),
      ]),
    );
    expect(rows.contact).toMatchObject({ normalizedEmail: "milan@zova.test", status: "invited" });
    expect(rows.invitation).toMatchObject({ status: "queued", normalizedEmail: "milan@zova.test" });
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("promena naziva atomski menja kanonski graf, čuva metrike i ne dira sekundarni link", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await adminClient(t);
    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Stari Lokal",
      destinationUrl: "https://reviews.example.com/stari",
    });
    const seeded = await t.run(async (ctx) => {
      const config = (
        await ctx.db
          .query("scanMeLinksConfigs")
          .withIndex("by_serviceProfileId", (q) =>
            q.eq("serviceProfileId", created.scanMeLinksProfileId),
          )
          .unique()
      )!;
      await ctx.db.patch(config._id, {
        draftDisplayName: "Draft kopija",
        publishedDisplayName: "Published kopija",
        hasUnpublishedChanges: true,
        draftRevision: 7,
        publishedRevision: 5,
      });
      await ctx.db.patch(created.scanMeLinksProfileId, {
        totalScans: 11,
        totalPageViews: 12,
        totalConvertedSessions: 13,
      });
      await ctx.db.patch(created.googleReviewProfileId, {
        totalScans: 21,
        totalPageViews: 22,
        totalConvertedSessions: 23,
      });
      await ctx.db.patch(created.linkId, { scanCount: 31 });
      const now = Date.now() - 1_000;
      const secondaryLinkId = await ctx.db.insert("dynamicLinks", {
        businessId: created.businessId,
        slug: "sekundarni-google-review",
        destinationUrl: "https://reviews.example.com/sekundarni",
        type: "google_review",
        active: false,
        scanCount: 41,
        createdAt: now,
        updatedAt: now,
      });
      return { configId: config._id, secondaryLinkId };
    });

    await expect(
      asAdmin.mutation(api.admin.updateBusinessName, {
        businessId: created.businessId,
        name: "Studio Forma",
      }),
    ).resolves.toEqual({
      name: "Studio Forma",
      slug: "studio-forma",
      reviewSlug: "studio-forma-google-review",
    });

    const state = await t.run(async (ctx) => {
      const serviceAliases = await ctx.db
        .query("serviceSlugAliases")
        .withIndex("by_slug")
        .collect();
      const linkAliases = await ctx.db
        .query("dynamicLinkAliases")
        .withIndex("by_slug")
        .collect();
      return {
        business: await ctx.db.get(created.businessId),
        linksProfile: await ctx.db.get(created.scanMeLinksProfileId),
        reviewProfile: await ctx.db.get(created.googleReviewProfileId),
        primary: await ctx.db.get(created.linkId),
        secondary: await ctx.db.get(seeded.secondaryLinkId),
        config: await ctx.db.get(seeded.configId),
        serviceAliases: serviceAliases.map((alias) => alias.slug).sort(),
        linkAliases: linkAliases.map((alias) => alias.slug).sort(),
      };
    });
    expect(state.business).toMatchObject({ name: "Studio Forma", slug: "studio-forma" });
    expect(state.linksProfile).toMatchObject({
      slug: "studio-forma",
      totalScans: 11,
      totalPageViews: 12,
      totalConvertedSessions: 13,
    });
    expect(state.reviewProfile).toMatchObject({
      slug: "studio-forma-google-review",
      totalScans: 21,
      totalPageViews: 22,
      totalConvertedSessions: 23,
    });
    expect(state.primary).toMatchObject({
      slug: "studio-forma-google-review",
      scanCount: 31,
    });
    expect(state.secondary).toMatchObject({
      slug: "sekundarni-google-review",
      scanCount: 41,
    });
    expect(state.config).toMatchObject({
      draftDisplayName: "Studio Forma",
      publishedDisplayName: "Studio Forma",
      hasUnpublishedChanges: true,
      draftRevision: 7,
      publishedRevision: 5,
    });
    expect(state.serviceAliases).toEqual(["stari-lokal", "stari-lokal-google-review"]);
    expect(state.linkAliases).toEqual(["stari-lokal-google-review"]);
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("sopstveni istorijski slug može ponovo da postane kanonski", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await adminClient(t);
    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Originalni Lokal",
      destinationUrl: "https://reviews.example.com/originalni",
    });

    await asAdmin.mutation(api.admin.updateBusinessName, {
      businessId: created.businessId,
      name: "Novi Lokal",
    });
    await asAdmin.mutation(api.admin.updateBusinessName, {
      businessId: created.businessId,
      name: "Originalni Lokal",
    });

    const state = await t.run(async (ctx) => {
      const serviceAliases = await ctx.db.query("serviceSlugAliases").collect();
      const linkAliases = await ctx.db.query("dynamicLinkAliases").collect();
      return {
        business: await ctx.db.get(created.businessId),
        linksProfile: await ctx.db.get(created.scanMeLinksProfileId),
        reviewProfile: await ctx.db.get(created.googleReviewProfileId),
        link: await ctx.db.get(created.linkId),
        serviceAliases: serviceAliases.map((alias) => alias.slug).sort(),
        linkAliases: linkAliases.map((alias) => alias.slug).sort(),
      };
    });
    expect(state.business?.slug).toBe("originalni-lokal");
    expect(state.linksProfile?.slug).toBe("originalni-lokal");
    expect(state.reviewProfile?.slug).toBe("originalni-lokal-google-review");
    expect(state.link?.slug).toBe("originalni-lokal-google-review");
    expect(state.serviceAliases).toEqual(["novi-lokal", "novi-lokal-google-review"]);
    expect(state.linkAliases).toEqual(["novi-lokal-google-review"]);
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("aktivni i istorijski slug drugog lokala odbijaju promenu bez delimičnih upisa", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await adminClient(t);
    const first = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Prvi Lokal",
      destinationUrl: "https://reviews.example.com/prvi",
    });
    const second = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Drugi Lokal",
      destinationUrl: "https://reviews.example.com/drugi",
    });

    await expect(
      asAdmin.mutation(api.admin.updateBusinessName, {
        businessId: first.businessId,
        name: "Drugi Lokal",
      }),
    ).rejects.toThrow("već koristi");

    await asAdmin.mutation(api.admin.updateBusinessName, {
      businessId: second.businessId,
      name: "Treći Lokal",
    });
    await expect(
      asAdmin.mutation(api.admin.updateBusinessName, {
        businessId: first.businessId,
        name: "Drugi Lokal",
      }),
    ).rejects.toThrow("već koristi");

    const state = await t.run(async (ctx) => {
      const config = await ctx.db
        .query("scanMeLinksConfigs")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", first.scanMeLinksProfileId),
        )
        .unique();
      const serviceAliases = await ctx.db
        .query("serviceSlugAliases")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", first.scanMeLinksProfileId),
        )
        .collect();
      const linkAliases = await ctx.db
        .query("dynamicLinkAliases")
        .withIndex("by_dynamicLinkId", (q) => q.eq("dynamicLinkId", first.linkId))
        .collect();
      return {
        business: await ctx.db.get(first.businessId),
        linksProfile: await ctx.db.get(first.scanMeLinksProfileId),
        reviewProfile: await ctx.db.get(first.googleReviewProfileId),
        link: await ctx.db.get(first.linkId),
        config,
        serviceAliases,
        linkAliases,
      };
    });
    expect(state.business).toMatchObject({ name: "Prvi Lokal", slug: "prvi-lokal" });
    expect(state.linksProfile?.slug).toBe("prvi-lokal");
    expect(state.reviewProfile?.slug).toBe("prvi-lokal-google-review");
    expect(state.link?.slug).toBe("prvi-lokal-google-review");
    expect(state.config?.draftDisplayName).toBe("Prvi Lokal");
    expect(state.serviceAliases).toHaveLength(0);
    expect(state.linkAliases).toHaveLength(0);
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("promena kanonskog naziva je admin-only", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await adminClient(t);
    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Zaštićeni Lokal",
      destinationUrl: "https://reviews.example.com/zasticeni",
    });

    await expect(
      t.mutation(api.admin.updateBusinessName, {
        businessId: created.businessId,
        name: "Nedozvoljeni Naziv",
      }),
    ).rejects.toThrow();
    const business = await t.run(async (ctx) => await ctx.db.get(created.businessId));
    expect(business).toMatchObject({ name: "Zaštićeni Lokal", slug: "zasticeni-lokal" });
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("legacy primarni QR na base slugu može direktno da se preimenuje i vrati", async () => {
    const t = convexTest(schema, modules);
    const asAdmin = await adminClient(t);
    const created = await asAdmin.mutation(api.admin.createBusiness, {
      name: "Legacy Lokal",
      destinationUrl: "https://reviews.example.com/legacy",
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(created.linkId, { slug: "legacy-lokal" });
    });

    await asAdmin.mutation(api.admin.updateBusinessName, {
      businessId: created.businessId,
      name: "Preimenovani Legacy Lokal",
    });
    await asAdmin.mutation(api.admin.updateBusinessName, {
      businessId: created.businessId,
      name: "Legacy Lokal",
    });
    await expect(
      asAdmin.mutation(api.admin.updateBusinessName, {
        businessId: created.businessId,
        name: "Legacy Lokal",
      }),
    ).resolves.toEqual({
      name: "Legacy Lokal",
      slug: "legacy-lokal",
      reviewSlug: "legacy-lokal-google-review",
    });

    const state = await t.run(async (ctx) => ({
      link: await ctx.db.get(created.linkId),
      aliases: await ctx.db
        .query("dynamicLinkAliases")
        .withIndex("by_dynamicLinkId", (q) => q.eq("dynamicLinkId", created.linkId))
        .collect(),
    }));
    expect(state.link?.slug).toBe("legacy-lokal-google-review");
    expect(state.aliases.map((alias) => alias.slug).sort()).toEqual([
      "legacy-lokal",
      "preimenovani-legacy-lokal-google-review",
    ]);
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("admin prikazuje aktivni QR link kada demo lokal ima i neaktivni link", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    const seeded = await seedLink(t, "aktivan-review", "https://reviews.example.com/aktivan");
    await t.run(async (ctx) => {
      const now = Date.now() + 1_000;
      await ctx.db.insert("dynamicLinks", {
        businessId: seeded.businessId,
        slug: "neaktivan-review",
        destinationUrl: "https://reviews.example.com/neaktivan",
        type: "google_review",
        active: false,
        scanCount: 0,
        createdAt: now,
        updatedAt: now,
      });
    });
    const adminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        email: "admin@scanme.test",
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: "https://test.local" });

    const businesses = await asAdmin.query(api.admin.listBusinesses, {});
    expect(businesses[0]?.link).toMatchObject({
      id: seeded.linkId,
      slug: "aktivan-review",
      active: true,
    });
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("arhiviranje je dozvoljeno tek posle deaktivacije i čuva podatke lokala", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    const seeded = await seedLink(t, "lokal-za-arhivu", "https://reviews.example.com/arhiva");
    const { adminId, contactId, secondaryLinkId } = await t.run(async (ctx) => {
      const now = Date.now();
      const adminId = await ctx.db.insert("users", {
        email: "admin@scanme.test",
        emailVerificationTime: now,
      });
      const contactId = await ctx.db.insert("businessContacts", {
        businessId: seeded.businessId,
        firstName: "Test",
        lastName: "Kontakt",
        normalizedEmail: "kontakt@example.com",
        phone: "+38160111222",
        positionTitle: "Vlasnik",
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
      const secondaryLinkId = await ctx.db.insert("dynamicLinks", {
        businessId: seeded.businessId,
        slug: "lokal-za-arhivu-drugi-link",
        destinationUrl: "https://reviews.example.com/arhiva-drugi",
        type: "google_review",
        active: true,
        scanCount: 12,
        createdAt: now,
        updatedAt: now,
      });
      return { adminId, contactId, secondaryLinkId };
    });
    const asAdmin = t.withIdentity({ subject: adminId, issuer: "https://test.local" });

    await expect(asAdmin.mutation(api.admin.archiveBusiness, {
      businessId: seeded.businessId,
    })).rejects.toThrow("deaktiviran");
    await asAdmin.mutation(api.admin.setBusinessActive, {
      businessId: seeded.businessId,
      active: false,
    });
    await expect(asAdmin.mutation(api.admin.archiveBusiness, {
      businessId: seeded.businessId,
    })).resolves.toMatchObject({ archivedAt: expect.any(Number) });

    const state = await t.run(async (ctx) => ({
      business: await ctx.db.get(seeded.businessId),
      primaryLink: await ctx.db.get(seeded.linkId),
      secondaryLink: await ctx.db.get(secondaryLinkId),
      contact: await ctx.db.get(contactId),
    }));
    expect(state.business).toMatchObject({
      name: "Lokal lokal-za-arhivu",
      status: "inactive",
      archivedAt: expect.any(Number),
    });
    expect(state.primaryLink?.active).toBe(false);
    expect(state.secondaryLink).toMatchObject({ active: false, scanCount: 12 });
    expect(state.contact).toMatchObject({ normalizedEmail: "kontakt@example.com" });
    await expect(asAdmin.mutation(api.admin.setBusinessActive, {
      businessId: seeded.businessId,
      active: true,
    })).rejects.toThrow("Arhivirani lokal");

    const businesses = await asAdmin.query(api.admin.listBusinesses, {});
    expect(businesses.find((business) => business.id === seeded.businessId)?.archivedAt)
      .toEqual(expect.any(Number));
    delete process.env.SCANME_ADMIN_EMAILS;
  });
});

test("dozvoljava javni HTTPS domen, a odbija lokalne i privatne adrese", () => {
  expect(isSafePublicDestination("https://reviews.example.com/lokal")).toBe(true);
  expect(isSafePublicDestination("http://reviews.example.com/lokal")).toBe(false);
  expect(isSafePublicDestination("https://localhost/lokal")).toBe(false);
  expect(isSafePublicDestination("https://192.168.1.10/lokal")).toBe(false);
});

test("rezerviše sistemske root slugove", () => {
  expect(() => requireSlug("admin")).toThrow("rezervisana");
  expect(() => requireSlug("api")).toThrow("rezervisana");
  expect(() => requireSlug("icon")).toThrow("rezervisana");
  expect(() => requireSlug("client-panel")).toThrow("rezervisana");
  expect(() => requireSlug("preview-login")).toThrow("rezervisana");
  expect(requireSlug("studio-osmica")).toBe("studio-osmica");
});

describe("kanonski slug iz naziva lokala", () => {
  test("normalizuje srpsku latinicu, razmake i interpunkciju", () => {
    expect(canonicalBusinessSlugs("Studio Forma")).toEqual({
      slug: "studio-forma",
      reviewSlug: "studio-forma-google-review",
    });
    expect(businessSlugFromName("  Đorđe Čačić — ŠŽ!  ")).toBe("djordje-cacic-sz");
    expect(businessSlugFromName("Kafe... Bar / Beograd")).toBe("kafe-bar-beograd");
  });

  test("ograničava base slug i odbija prazan ili rezervisan rezultat", () => {
    expect(businessSlugFromName("a".repeat(100))).toHaveLength(
      BUSINESS_SLUG_MAX_LENGTH,
    );
    expect(() => businessSlugFromName("***")).toThrow("latinično slovo ili cifru");
    expect(() => businessSlugFromName("Client panel")).toThrow("rezervisanu");
    expect(() => businessSlugFromName("Preview login")).toThrow("rezervisanu");
  });
});

test("kanonska migracija ima audit, dry-run, idempotentno izvršenje i verifikaciju", async () => {
  const t = convexTest(schema, modules);
  const asAdmin = await adminClient(t);
  const created = await asAdmin.mutation(api.admin.createBusiness, {
    name: "Migracioni Lokal",
    destinationUrl: "https://reviews.example.com/migracioni",
  });
  const seeded = await t.run(async (ctx) => {
    const config = (
      await ctx.db
        .query("scanMeLinksConfigs")
        .withIndex("by_serviceProfileId", (q) =>
          q.eq("serviceProfileId", created.scanMeLinksProfileId),
        )
        .unique()
    )!;
    await ctx.db.patch(created.businessId, { slug: "legacy-business" });
    await ctx.db.patch(created.scanMeLinksProfileId, {
      slug: "legacy-scanme",
      totalScans: 101,
      totalPageViews: 102,
      totalConvertedSessions: 103,
    });
    await ctx.db.patch(created.googleReviewProfileId, {
      slug: "legacy-review-profile",
      totalScans: 201,
      totalPageViews: 202,
      totalConvertedSessions: 203,
    });
    await ctx.db.patch(created.linkId, { slug: "legacy-qr", scanCount: 301 });
    await ctx.db.patch(config._id, {
      draftDisplayName: "Legacy draft",
      publishedDisplayName: "Legacy published",
      hasUnpublishedChanges: true,
      draftRevision: 17,
      publishedRevision: 11,
    });
    const now = Date.now() - 10_000;
    const secondaryLinkId = await ctx.db.insert("dynamicLinks", {
      businessId: created.businessId,
      slug: "sekundarni-migracioni-link",
      destinationUrl: "https://reviews.example.com/sekundarni-migracioni",
      type: "google_review",
      active: false,
      scanCount: 401,
      createdAt: now,
      updatedAt: now,
    });
    return { configId: config._id, secondaryLinkId };
  });

  await expect(
    t.query(internal.migrations.auditCanonicalBusinessIdentity, {}),
  ).resolves.toMatchObject({ checked: 1, ok: true, needsMigration: 1 });
  await expect(
    t.mutation(internal.migrations.migrateCanonicalBusinessIdentity, {
      dryRun: true,
    }),
  ).resolves.toMatchObject({
    checked: 1,
    migrated: false,
    changes: 0,
    needsMigration: 1,
  });
  const firstRun = await t.mutation(
    internal.migrations.migrateCanonicalBusinessIdentity,
    {},
  );
  expect(firstRun.migrated).toBe(true);
  expect(firstRun.changes).toBeGreaterThan(0);
  await expect(
    t.mutation(internal.migrations.migrateCanonicalBusinessIdentity, {}),
  ).resolves.toMatchObject({
    checked: 1,
    migrated: true,
    changes: 0,
    needsMigration: 0,
  });
  await expect(
    t.query(internal.migrations.verifyCanonicalBusinessIdentity, {}),
  ).resolves.toEqual({ checked: 1, ok: true, problems: [] });

  const state = await t.run(async (ctx) => ({
    business: await ctx.db.get(created.businessId),
    linksProfile: await ctx.db.get(created.scanMeLinksProfileId),
    reviewProfile: await ctx.db.get(created.googleReviewProfileId),
    primary: await ctx.db.get(created.linkId),
    secondary: await ctx.db.get(seeded.secondaryLinkId),
    config: await ctx.db.get(seeded.configId),
    serviceAliases: (await ctx.db.query("serviceSlugAliases").collect())
      .map((alias) => alias.slug)
      .sort(),
    linkAliases: (await ctx.db.query("dynamicLinkAliases").collect())
      .map((alias) => alias.slug)
      .sort(),
  }));
  expect(state.business).toMatchObject({
    name: "Migracioni Lokal",
    slug: "migracioni-lokal",
  });
  expect(state.linksProfile).toMatchObject({
    slug: "migracioni-lokal",
    totalScans: 101,
    totalPageViews: 102,
    totalConvertedSessions: 103,
  });
  expect(state.reviewProfile).toMatchObject({
    slug: "migracioni-lokal-google-review",
    totalScans: 201,
    totalPageViews: 202,
    totalConvertedSessions: 203,
  });
  expect(state.primary).toMatchObject({
    slug: "migracioni-lokal-google-review",
    scanCount: 301,
  });
  expect(state.secondary).toMatchObject({
    slug: "sekundarni-migracioni-link",
    scanCount: 401,
  });
  expect(state.config).toMatchObject({
    draftDisplayName: "Migracioni Lokal",
    publishedDisplayName: "Migracioni Lokal",
    hasUnpublishedChanges: true,
    draftRevision: 17,
    publishedRevision: 11,
  });
  expect(state.serviceAliases).toEqual([
    "legacy-business",
    "legacy-qr",
    "legacy-review-profile",
    "legacy-scanme",
  ]);
  expect(state.linkAliases).toEqual(["legacy-qr"]);
  delete process.env.SCANME_ADMIN_EMAILS;
});
