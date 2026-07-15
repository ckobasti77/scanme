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
    return { businessId, contactId, invitationId, pocUserId, otherUserId };
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
    })).resolves.toEqual({ accepted: true });

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
});
