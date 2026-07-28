/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { hashInvitationToken } from "./lib/invitations";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);

async function seedInvitation(t: ReturnType<typeof convexTest>) {
  const token = "invite-token-" + "a".repeat(52);
  const tokenHash = await hashInvitationToken(token);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      name: "Lokal Test",
      slug: "lokal-test",
      status: "active",
      createdAt: now,
    });
    const serviceProfileId = await ctx.db.insert("serviceProfiles", {
      businessId,
      type: "scanme_links",
      slug: "lokal-test",
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: now,
      updatedAt: now,
    });
    const contactId = await ctx.db.insert("businessContacts", {
      businessId,
      firstName: "Petar",
      lastName: "Petrović",
      normalizedEmail: "poc@example.com",
      phone: "+38160111222",
      positionTitle: "Vlasnik",
      status: "invited",
      createdAt: now,
      updatedAt: now,
    });
    const invitationId = await ctx.db.insert("businessInvitations", {
      businessId,
      contactId,
      normalizedEmail: "poc@example.com",
      tokenHash,
      status: "sent",
      expiresAt: now + 60_000,
      createdAt: now,
      updatedAt: now,
    });
    const pocUserId = await ctx.db.insert("users", {
      email: "poc@example.com",
      emailVerificationTime: now,
    });
    const otherUserId = await ctx.db.insert("users", {
      email: "admin@example.com",
      emailVerificationTime: now,
    });
    return {
      businessId,
      contactId,
      invitationId,
      serviceProfileId,
      pocUserId,
      otherUserId,
    };
  });
  return { ...seeded, token };
}

describe("aktivacija POC pozivnice", () => {
  test("prikazuje email trenutno prijavljenog naloga pre prihvatanja", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedInvitation(t);
    const asOtherUser = t.withIdentity({ subject: seeded.otherUserId, issuer: "https://test.local" });

    await expect(asOtherUser.query(api.invitations.currentViewer, {})).resolves.toEqual({
      email: "admin@example.com",
    });
    await expect(asOtherUser.mutation(api.invitations.claim, {
      slug: "lokal-test",
      token: seeded.token,
    })).rejects.toThrow("Pozivnica pripada drugoj email adresi");
  });

  test("nalog sa emailom iz pozivnice dobija samo članstvo tog lokala", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedInvitation(t);
    const asPoc = t.withIdentity({ subject: seeded.pocUserId, issuer: "https://test.local" });

    await expect(asPoc.mutation(api.invitations.claim, {
      slug: "lokal-test",
      token: seeded.token,
    })).resolves.toEqual({ accepted: true, canonicalSlug: "lokal-test" });

    const state = await t.run(async (ctx) => {
      const invitation = await ctx.db.get(seeded.invitationId);
      const contact = await ctx.db.get(seeded.contactId);
      const membership = await ctx.db
        .query("businessMemberships")
        .withIndex("by_userId_and_businessId", (q) =>
          q.eq("userId", seeded.pocUserId).eq("businessId", seeded.businessId),
        )
        .unique();
      return { invitation, contact, membership };
    });

    expect(state.invitation?.status).toBe("accepted");
    expect(state.contact).toMatchObject({ status: "active", authUserId: seeded.pocUserId });
    expect(state.membership).toMatchObject({ active: true, accessRole: "viewer" });
  });

  test("stara ScanMe adresa pozivnice ostaje važeća i vraća kanonski slug", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedInvitation(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.patch(seeded.businessId, { slug: "novi-lokal-test" });
      await ctx.db.patch(seeded.serviceProfileId, {
        slug: "novi-lokal-test",
        updatedAt: now,
      });
      await ctx.db.insert("serviceSlugAliases", {
        slug: "lokal-test",
        serviceProfileId: seeded.serviceProfileId,
        createdAt: now,
      });
      await ctx.db.insert("dynamicLinks", {
        businessId: seeded.businessId,
        slug: "novi-lokal-test-google-review",
        destinationUrl: "https://reviews.example.com/novi-lokal-test",
        type: "google_review",
        active: true,
        scanCount: 4,
        createdAt: now,
        updatedAt: now,
      });
    });
    const asPoc = t.withIdentity({
      subject: seeded.pocUserId,
      issuer: "https://test.local",
    });

    await expect(t.query(api.invitations.getStatus, {
      slug: "lokal-test",
      token: seeded.token,
    })).resolves.toMatchObject({
      status: "valid",
      businessName: "Lokal Test",
      canonicalSlug: "novi-lokal-test",
    });
    await expect(t.query(api.clientPanel.publicLocation, {
      slug: "lokal-test",
    })).resolves.toEqual({
      name: "Lokal Test",
      canonicalSlug: "novi-lokal-test",
    });
    await expect(asPoc.mutation(api.invitations.claim, {
      slug: "lokal-test",
      token: seeded.token,
    })).resolves.toEqual({
      accepted: true,
      canonicalSlug: "novi-lokal-test",
    });
    await expect(asPoc.query(api.clientPanel.metrics, {
      slug: "lokal-test",
    })).resolves.toMatchObject({
      status: "available",
      businessName: "Lokal Test",
      canonicalSlug: "novi-lokal-test",
      total: 4,
    });
  });

  test("Google Review slug i alias drugog lokala ne mogu da preuzmu pozivnicu", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seedInvitation(t);
    const slugs = await t.run(async (ctx) => {
      const now = Date.now();
      const reviewProfileId = await ctx.db.insert("serviceProfiles", {
        businessId: seeded.businessId,
        type: "google_review",
        slug: "lokal-test-google-review",
        status: "active",
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("serviceSlugAliases", {
        slug: "stari-review-slug",
        serviceProfileId: reviewProfileId,
        createdAt: now,
      });

      const otherBusinessId = await ctx.db.insert("businesses", {
        name: "Drugi Lokal",
        slug: "drugi-lokal",
        status: "active",
        createdAt: now,
      });
      const otherProfileId = await ctx.db.insert("serviceProfiles", {
        businessId: otherBusinessId,
        type: "scanme_links",
        slug: "drugi-lokal",
        status: "active",
        totalScans: 0,
        totalPageViews: 0,
        totalConvertedSessions: 0,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("serviceSlugAliases", {
        slug: "stari-drugi-lokal",
        serviceProfileId: otherProfileId,
        createdAt: now,
      });
      return {
        reviewSlug: "lokal-test-google-review",
        reviewAlias: "stari-review-slug",
        otherAlias: "stari-drugi-lokal",
      };
    });
    const asPoc = t.withIdentity({
      subject: seeded.pocUserId,
      issuer: "https://test.local",
    });

    for (const slug of [
      slugs.reviewSlug,
      slugs.reviewAlias,
      slugs.otherAlias,
    ]) {
      await expect(t.query(api.invitations.getStatus, {
        slug,
        token: seeded.token,
      })).resolves.toEqual({ status: "invalid" });
      await expect(asPoc.mutation(api.invitations.claim, {
        slug,
        token: seeded.token,
      })).rejects.toThrow("Pozivnica nije ispravna");
    }
  });
});
