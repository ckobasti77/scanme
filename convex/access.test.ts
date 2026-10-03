/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import {
  BusinessAccessDeniedError,
  requireBusinessAccess,
  requireGoogleReviewPanelBySlug,
} from "./lib/access";

const modules = import.meta.glob("./**/*.ts");

// A business that owns neither Links nor Google Review (no `dynamicLinks` row)
// must still reach its own panel via requireBusinessAccess, but must be denied
// by the Google-Review-specific requireGoogleReviewPanelBySlug (RFC-001 §2.1).
async function seedBusinessWithoutDynamicLinks() {
  process.env.SCANME_ADMIN_EMAILS = "admin@scanme.test";
  const t = convexTest(schema, modules);
  const seeded = await t.run(async (ctx) => {
    const now = Date.now();
    const memberId = await ctx.db.insert("users", {
      email: "member@venue.test",
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Venue Only",
      slug: "venue-only",
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("businessMemberships", {
      userId: memberId,
      businessId,
      accessRole: "viewer",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    return { memberId, businessId };
  });
  return {
    t,
    ...seeded,
    asMember: t.withIdentity({
      subject: seeded.memberId,
      issuer: "https://test.local",
    }),
  };
}

describe("panel access decoupled from dynamicLinks", () => {
  test("requireBusinessAccess passes for a business with no dynamicLinks row", async () => {
    const { asMember, businessId } = await seedBusinessWithoutDynamicLinks();
    const access = await asMember.run(async (ctx) =>
      requireBusinessAccess(ctx, "venue-only"),
    );
    expect(access.business._id).toBe(businessId);
    expect(access.accessRole).toBe("viewer");
    expect(access.membership?.active).toBe(true);
  });

  test("requireBusinessAccess also resolves by business id", async () => {
    const { asMember, businessId } = await seedBusinessWithoutDynamicLinks();
    const access = await asMember.run(async (ctx) =>
      requireBusinessAccess(ctx, businessId),
    );
    expect(access.business._id).toBe(businessId);
  });

  test("requireGoogleReviewPanelBySlug fails for the same business (no dynamicLinks)", async () => {
    const { asMember } = await seedBusinessWithoutDynamicLinks();
    await expect(
      asMember.run(async (ctx) =>
        requireGoogleReviewPanelBySlug(ctx, "venue-only"),
      ),
    ).rejects.toThrow("Panel nije pronađen.");
  });

  test("the denial is a BusinessAccessDeniedError", async () => {
    const { asMember } = await seedBusinessWithoutDynamicLinks();
    await expect(
      asMember.run(async (ctx) =>
        requireGoogleReviewPanelBySlug(ctx, "venue-only"),
      ),
    ).rejects.toBeInstanceOf(BusinessAccessDeniedError);
  });
});
