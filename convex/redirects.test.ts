/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { isSafePublicDestination, requireSlug } from "./lib/validation";

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

  test("admin nezavisno menja QR i klijentski slug", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    const seeded = await seedLink(t, "stari-slug", "https://reviews.example.com/scanme-primer");
    const adminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        email: "admin@scanme.test",
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: "https://test.local" });

    await asAdmin.mutation(api.admin.updateBusinessSlug, {
      businessId: seeded.businessId,
      linkId: seeded.linkId,
      kind: "qr",
      slug: "nova-qr-adresa",
    });
    await asAdmin.mutation(api.admin.updateBusinessSlug, {
      businessId: seeded.businessId,
      linkId: seeded.linkId,
      kind: "clientPanel",
      slug: "novi-klijentski-panel",
    });

    const state = await t.run(async (ctx) => ({
      business: await ctx.db.get(seeded.businessId),
      link: await ctx.db.get(seeded.linkId),
    }));
    expect(state.business?.slug).toBe("novi-klijentski-panel");
    expect(state.link?.slug).toBe("nova-qr-adresa");
    await expect(t.query(api.clientPanel.publicLocation, { slug: "novi-klijentski-panel" }))
      .resolves.toEqual({ name: "Lokal stari-slug" });
    await expect(t.query(api.clientPanel.publicLocation, { slug: "nova-qr-adresa" }))
      .resolves.toBeNull();
    await expect(t.mutation(api.redirects.resolveAndRecord, {
      slug: "nova-qr-adresa",
      requestId: "66666666-6666-4666-8666-666666666666",
    })).resolves.toMatchObject({ status: "available" });
    await expect(t.mutation(api.redirects.resolveAndRecord, {
      slug: "stari-slug",
      requestId: "77777777-7777-4777-8777-777777777777",
    })).resolves.toMatchObject({
      status: "available",
      destinationUrl: "https://reviews.example.com/scanme-primer",
    });
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("odštampani QR slug ostaje aktivan posle promene sluga i destinacije", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    const seeded = await seedLink(t, "odstampana-adresa", "https://reviews.example.com/stara");
    const other = await seedLink(t, "drugi-qr", "https://reviews.example.com/drugi");
    const adminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        email: "admin@scanme.test",
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: "https://test.local" });

    await asAdmin.mutation(api.admin.updateBusinessSlug, {
      businessId: seeded.businessId,
      linkId: seeded.linkId,
      kind: "qr",
      slug: "nova-adresa",
    });
    await asAdmin.mutation(api.admin.updateBusinessSlug, {
      businessId: seeded.businessId,
      linkId: seeded.linkId,
      kind: "clientPanel",
      slug: "novi-panel",
    });
    await asAdmin.mutation(api.admin.updateDestination, {
      linkId: seeded.linkId,
      destinationUrl: "https://reviews.example.com/nova",
    });
    await expect(asAdmin.mutation(api.admin.updateBusinessSlug, {
      businessId: other.businessId,
      linkId: other.linkId,
      kind: "qr",
      slug: "odstampana-adresa",
    })).rejects.toThrow("ranije odštampanu QR adresu");

    await expect(t.mutation(api.redirects.resolveAndRecord, {
      slug: "odstampana-adresa",
      requestId: "88888888-8888-4888-8888-888888888888",
    })).resolves.toEqual({
      status: "available",
      destinationUrl: "https://reviews.example.com/nova",
    });
    await expect(t.mutation(api.redirects.resolveAndRecord, {
      slug: "nova-adresa",
      requestId: "99999999-9999-4999-8999-999999999999",
    })).resolves.toEqual({
      status: "available",
      destinationUrl: "https://reviews.example.com/nova",
    });

    const state = await t.run(async (ctx) => {
      const aliases = await ctx.db
        .query("dynamicLinkAliases")
        .withIndex("by_dynamicLinkId", (q) => q.eq("dynamicLinkId", seeded.linkId))
        .take(10);
      return {
        aliases: aliases.map((alias) => alias.slug),
        scanCount: (await ctx.db.get(seeded.linkId))?.scanCount,
      };
    });
    expect(state).toEqual({ aliases: ["odstampana-adresa"], scanCount: 2 });
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("admin ne može da preuzme slug drugog lokala", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    const first = await seedLink(t, "prvi-lokal", "https://reviews.example.com/prvi");
    await seedLink(t, "drugi-lokal", "https://reviews.example.com/drugi");
    const adminId = await t.run(async (ctx) =>
      await ctx.db.insert("users", {
        email: "admin@scanme.test",
        emailVerificationTime: Date.now(),
      }),
    );
    const asAdmin = t.withIdentity({ subject: adminId, issuer: "https://test.local" });

    await expect(asAdmin.mutation(api.admin.updateBusinessSlug, {
      businessId: first.businessId,
      linkId: first.linkId,
      kind: "qr",
      slug: "drugi-lokal",
    })).rejects.toThrow("već koristi");
    delete process.env.SCANME_ADMIN_EMAILS;
  });

  test("admin menja tačno prikazani QR link kada lokal ima više linkova", async () => {
    process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
    const t = convexTest(schema, modules);
    const seeded = await seedLink(t, "aktuelni-link", "https://reviews.example.com/aktuelni");
    const olderLinkId = await t.run(async (ctx) => {
      const now = Date.now() - 1_000;
      return await ctx.db.insert("dynamicLinks", {
        businessId: seeded.businessId,
        slug: "stari-link",
        destinationUrl: "https://reviews.example.com/stari",
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

    await expect(asAdmin.mutation(api.admin.updateBusinessSlug, {
      businessId: seeded.businessId,
      linkId: seeded.linkId,
      kind: "qr",
      slug: "nova-aktuelna-adresa",
    })).resolves.toMatchObject({ qrSlug: "nova-aktuelna-adresa" });

    const state = await t.run(async (ctx) => ({
      current: await ctx.db.get(seeded.linkId),
      older: await ctx.db.get(olderLinkId),
    }));
    expect(state.current?.slug).toBe("nova-aktuelna-adresa");
    expect(state.older?.slug).toBe("stari-link");
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
  expect(requireSlug("studio-osmica")).toBe("studio-osmica");
});
