/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { isSafePublicDestination } from "./lib/validation";

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
      slug: "zova-test",
      destinationUrl: "https://search.google.com/local/writereview?placeid=zova",
      firstName: "Milan",
      lastName: "Jovanović",
      email: "milan@zova.test",
      phone: "+38160111222",
      positionTitle: "Vlasnik",
    });
    const rows = await t.run(async (ctx) => {
      const business = await ctx.db.get(created.businessId);
      const link = await ctx.db.get(created.linkId);
      const invitation = await ctx.db.get(created.invitationId);
      const contact = invitation ? await ctx.db.get(invitation.contactId) : null;
      return { business, link, invitation, contact };
    });
    expect(rows.business).toMatchObject({ name: "Zova", status: "active" });
    expect(rows.link).toMatchObject({ slug: "zova-test", active: true, scanCount: 0 });
    expect(rows.contact).toMatchObject({ normalizedEmail: "milan@zova.test", status: "invited" });
    expect(rows.invitation).toMatchObject({ status: "queued", normalizedEmail: "milan@zova.test" });
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("admin menja naziv lokala bez promene sluga i QR linka", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    const seeded = await seedLink(t, "scanme-primer", "https://reviews.example.com/scanme-primer");
    const adminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        email: "admin@scanme.test",
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: "https://test.local" });

    await expect(asAdmin.mutation(api.admin.updateBusinessName, {
      businessId: seeded.businessId,
      name: "Novi naziv lokala",
    })).resolves.toEqual({ name: "Novi naziv lokala" });

    const state = await t.run(async (ctx) => ({
      business: await ctx.db.get(seeded.businessId),
      link: await ctx.db.get(seeded.linkId),
    }));
    expect(state.business?.name).toBe("Novi naziv lokala");
    expect(state.business?.slug).toBe("scanme-primer");
    expect(state.link?.slug).toBe("scanme-primer");
    delete process.env.SCANME_ADMIN_EMAILS;
  });
});

test("dozvoljava javni HTTPS domen, a odbija lokalne i privatne adrese", () => {
  expect(isSafePublicDestination("https://reviews.example.com/lokal")).toBe(true);
  expect(isSafePublicDestination("http://reviews.example.com/lokal")).toBe(false);
  expect(isSafePublicDestination("https://localhost/lokal")).toBe(false);
  expect(isSafePublicDestination("https://192.168.1.10/lokal")).toBe(false);
});
