/// <reference types="vite/client" />

// TASK-18 STEP 1 — the Memories provisioning mutations, provable with
// convex-test: admin-gating, the derived `-memories` slug, idempotent granting,
// a deactivation that keeps every space/session/photo, celebrations +
// partnerships as first writers, the commission SNAPSHOT (and its stability
// when the partnership later changes), and the guarantee that a celebration is
// NOT created through admin.createBusiness (no Links profile, no dynamicLink).

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { getEntitlement } from "./lib/entitlements";

const modules = import.meta.glob("./**/*.ts");

const ADMIN_EMAIL = "admin@scanme.test";
const CLIENT_EMAIL = "klijent@scanme.test";
const ISSUER = "https://test.local";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN_EMAIL;
});

async function seed(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const now = Date.now();
    const adminId = await ctx.db.insert("users", {
      email: ADMIN_EMAIL,
      emailVerificationTime: now,
    });
    const clientId = await ctx.db.insert("users", {
      email: CLIENT_EMAIL,
      emailVerificationTime: now,
    });
    const businessId = await ctx.db.insert("businesses", {
      name: "Kafana Kod Šarana",
      slug: "kod-sarana",
      status: "active",
      createdAt: now,
    });
    const partnerBusinessId = await ctx.db.insert("businesses", {
      name: "Sala Grand",
      slug: "sala-grand",
      status: "active",
      createdAt: now,
    });
    return { adminId, clientId, businessId, partnerBusinessId };
  });
}

function admin(t: ReturnType<typeof convexTest>, adminId: Id<"users">) {
  return t.withIdentity({ subject: adminId, issuer: ISSUER });
}

// Inside t.run convex-test loses schema index types (project memory) — use
// .filter, not .withIndex. Production code uses the real indexes.
async function memoriesProfiles(
  t: ReturnType<typeof convexTest>,
  businessId: Id<"businesses">,
) {
  return t.run((ctx) =>
    ctx.db
      .query("serviceProfiles")
      .filter((q) =>
        q.and(
          q.eq(q.field("businessId"), businessId),
          q.eq(q.field("type"), "scanme_memories"),
        ),
      )
      .collect(),
  );
}

async function spaces(
  t: ReturnType<typeof convexTest>,
  businessId: Id<"businesses">,
) {
  return t.run((ctx) =>
    ctx.db
      .query("memoriesSpaces")
      .filter((q) => q.eq(q.field("businessId"), businessId))
      .collect(),
  );
}

describe("grantMemories (venue subscription channel)", () => {
  test("creates the -memories profile, a recurring active space, and a basic entitlement", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);

    const result = await as.mutation(api.memoriesAdmin.grantMemories, {
      businessId,
      planKey: "basic",
    });
    expect(result.created).toBe(true);
    expect(result.code).toHaveLength(8);

    const profiles = await memoriesProfiles(t, businessId);
    expect(profiles).toHaveLength(1);
    expect(profiles[0].slug).toBe("kod-sarana-memories");
    expect(profiles[0].status).toBe("active");

    const spaceRows = await spaces(t, businessId);
    expect(spaceRows).toHaveLength(1);
    expect(spaceRows[0].mode).toBe("recurring");
    expect(spaceRows[0].status).toBe("active");
    expect(spaceRows[0].publicGalleryEnabled).toBe(false);
    expect(spaceRows[0].wallEnabled).toBe(false);

    const entitlement = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(entitlement?.planKey).toBe("basic");
    expect(entitlement?.status).toBe("active");
    expect(entitlement?.limits.photosPerGuest).toBe(3);
  });

  test("granting twice is idempotent: no second profile, no second space, one entitlement", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);

    const first = await as.mutation(api.memoriesAdmin.grantMemories, {
      businessId,
      planKey: "basic",
    });
    const second = await as.mutation(api.memoriesAdmin.grantMemories, {
      businessId,
      planKey: "premium",
    });

    expect(second.created).toBe(false);
    expect(second.memoriesProfileId).toBe(first.memoriesProfileId);
    expect(second.spaceId).toBe(first.spaceId);
    expect(await memoriesProfiles(t, businessId)).toHaveLength(1);
    expect(await spaces(t, businessId)).toHaveLength(1);

    const entitlements = await t.run((ctx) =>
      ctx.db
        .query("entitlements")
        .filter((q) =>
          q.and(
            q.eq(q.field("businessId"), businessId),
            q.eq(q.field("product"), "scanme_memories"),
          ),
        )
        .collect(),
    );
    expect(entitlements).toHaveLength(1);
    // The re-grant changed the tier in place.
    expect(entitlements[0].planKey).toBe("premium");
  });

  test("a non-admin and an unauthenticated caller are rejected", async () => {
    const t = convexTest(schema, modules);
    const { clientId, businessId } = await seed(t);

    await expect(
      t
        .withIdentity({ subject: clientId, issuer: ISSUER })
        .mutation(api.memoriesAdmin.grantMemories, { businessId, planKey: "basic" }),
    ).rejects.toThrow(/administratorski/i);
    await expect(
      t.mutation(api.memoriesAdmin.grantMemories, { businessId, planKey: "basic" }),
    ).rejects.toThrow(/prijavljeni/i);
    expect(await memoriesProfiles(t, businessId)).toHaveLength(0);
  });

  test("an unknown plan key is rejected", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    await expect(
      admin(t, adminId).mutation(api.memoriesAdmin.grantMemories, {
        businessId,
        planKey: "enterprise",
      }),
    ).rejects.toThrow(/plan/i);
  });
});

describe("deactivateMemories", () => {
  test("flips the profile inactive and expires the entitlement, but leaves the space, session and photos intact", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    const as = admin(t, adminId);

    const grant = await as.mutation(api.memoriesAdmin.grantMemories, {
      businessId,
      planKey: "basic",
    });

    // Populate a session + a guest + a ready photo on the space.
    const { sessionId, photoId } = await t.run(async (ctx) => {
      const now = Date.now();
      const sessionId = await ctx.db.insert("memoriesSessions", {
        spaceId: grant.spaceId,
        dateKey: "2026-08-26",
        status: "open",
        openedAt: now,
        photoCount: 1,
        guestCount: 1,
        updatedAt: now,
      });
      const guestId = await ctx.db.insert("memoriesGuests", {
        spaceId: grant.spaceId,
        guestKey: "k".repeat(43),
        photoCount: 1,
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      });
      const photoId = await ctx.db.insert("memoriesPhotos", {
        spaceId: grant.spaceId,
        sessionId,
        guestId,
        visibility: "everyone",
        status: "ready",
        createdAt: now,
        updatedAt: now,
      });
      return { sessionId, photoId };
    });

    await as.mutation(api.memoriesAdmin.deactivateMemories, { businessId });

    const profiles = await memoriesProfiles(t, businessId);
    expect(profiles[0].status).toBe("inactive");

    // The entitlement is expired (getEntitlement returns only active rows).
    const entitlement = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(entitlement).toBeNull();

    // Space, session and photo all survive untouched.
    const rows = await spaces(t, businessId);
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(grant.spaceId);
    const session = await t.run((ctx) => ctx.db.get(sessionId));
    expect(session).not.toBeNull();
    const photo = await t.run((ctx) => ctx.db.get(photoId));
    expect(photo?.status).toBe("ready");

    // Re-granting reactivates both the profile and the entitlement.
    await as.mutation(api.memoriesAdmin.grantMemories, {
      businessId,
      planKey: "basic",
    });
    expect((await memoriesProfiles(t, businessId))[0].status).toBe("active");
    const reEntitlement = await t.run((ctx) =>
      getEntitlement(ctx, businessId, "scanme_memories"),
    );
    expect(reEntitlement?.status).toBe("active");
  });

  test("deactivating a business with no Memories profile throws", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId } = await seed(t);
    await expect(
      admin(t, adminId).mutation(api.memoriesAdmin.deactivateMemories, {
        businessId,
      }),
    ).rejects.toThrow(/profil/i);
  });
});

describe("createCelebration (celebration channel)", () => {
  const baseArgs = {
    kind: "svadba" as const,
    title: "Jovana i Marko",
    eventDate: Date.parse("2026-09-12T18:00:00Z"),
    acquisitionChannel: "direct" as const,
    contactName: "Jovana Jovanović",
    planKey: "premium",
  };

  test("provisions a celebration tenant, its celebrations row, a memories profile, an entitlement, a one_off space + session — and NOT through admin.createBusiness", async () => {
    const t = convexTest(schema, modules);
    const { adminId } = await seed(t);
    const as = admin(t, adminId);

    const result = await as.mutation(
      api.memoriesAdmin.createCelebration,
      baseArgs,
    );
    expect(result.code).toHaveLength(8);
    expect(result.slug.startsWith("celebration-")).toBe(true);

    const business = await t.run((ctx) => ctx.db.get(result.businessId));
    expect(business?.kind).toBe("celebration");
    expect(business?.name).toBe("Jovana i Marko");

    // NOT via admin.createBusiness: no Links profile, no google_review link.
    const profiles = await t.run((ctx) =>
      ctx.db
        .query("serviceProfiles")
        .filter((q) => q.eq(q.field("businessId"), result.businessId))
        .collect(),
    );
    expect(profiles).toHaveLength(1);
    expect(profiles[0].type).toBe("scanme_memories");
    const links = await t.run((ctx) =>
      ctx.db
        .query("dynamicLinks")
        .filter((q) => q.eq(q.field("businessId"), result.businessId))
        .collect(),
    );
    expect(links).toHaveLength(0);

    // The celebrations row.
    const celebration = await t.run((ctx) => ctx.db.get(result.celebrationId));
    expect(celebration?.kind).toBe("svadba");
    expect(celebration?.status).toBe("booked");
    expect(celebration?.acquisitionChannel).toBe("direct");
    expect(celebration?.referralCommissionPercent).toBeUndefined();

    // one_off space + its single open session.
    const space = await t.run((ctx) => ctx.db.get(result.spaceId));
    expect(space?.mode).toBe("one_off");
    expect(space?.windowStartAt).toBe(baseArgs.eventDate);
    const session = await t.run((ctx) => ctx.db.get(result.sessionId));
    expect(session?.status).toBe("open");

    const entitlement = await t.run((ctx) =>
      getEntitlement(ctx, result.businessId, "scanme_memories"),
    );
    expect(entitlement?.planKey).toBe("premium");
  });

  test("a partner sale snapshots the partnership's commission onto the celebration, and the snapshot is stable when the partnership later changes", async () => {
    const t = convexTest(schema, modules);
    const { adminId, partnerBusinessId } = await seed(t);
    const as = admin(t, adminId);

    const { partnershipId } = await as.mutation(
      api.memoriesAdmin.createPartnership,
      { partnerBusinessId, commissionPercent: 10 },
    );

    const result = await as.mutation(api.memoriesAdmin.createCelebration, {
      ...baseArgs,
      acquisitionChannel: "partner",
      referredByBusinessId: partnerBusinessId,
    });
    expect(result.referralCommissionPercent).toBe(10);
    const celebration = await t.run((ctx) => ctx.db.get(result.celebrationId));
    expect(celebration?.referredByBusinessId).toBe(partnerBusinessId);
    expect(celebration?.referralCommissionPercent).toBe(10);

    // Renegotiate the partnership to 20% — the celebration keeps 10%.
    await t.run((ctx) => ctx.db.patch(partnershipId, { commissionPercent: 20 }));
    const after = await t.run((ctx) => ctx.db.get(result.celebrationId));
    expect(after?.referralCommissionPercent).toBe(10);
  });

  test("the partner channel requires a partner with an active partnership", async () => {
    const t = convexTest(schema, modules);
    const { adminId, partnerBusinessId } = await seed(t);
    const as = admin(t, adminId);

    // No partner id at all.
    await expect(
      as.mutation(api.memoriesAdmin.createCelebration, {
        ...baseArgs,
        acquisitionChannel: "partner",
      }),
    ).rejects.toThrow(/partnera/i);

    // A partner that has no partnership row.
    await expect(
      as.mutation(api.memoriesAdmin.createCelebration, {
        ...baseArgs,
        acquisitionChannel: "partner",
        referredByBusinessId: partnerBusinessId,
      }),
    ).rejects.toThrow(/ugovor/i);
  });

  test("a non-admin cannot create a celebration", async () => {
    const t = convexTest(schema, modules);
    const { clientId } = await seed(t);
    await expect(
      t
        .withIdentity({ subject: clientId, issuer: ISSUER })
        .mutation(api.memoriesAdmin.createCelebration, baseArgs),
    ).rejects.toThrow(/administratorski/i);
  });
});

describe("createPartnership", () => {
  test("rejects a second active partnership for the same partner", async () => {
    const t = convexTest(schema, modules);
    const { adminId, partnerBusinessId } = await seed(t);
    const as = admin(t, adminId);
    await as.mutation(api.memoriesAdmin.createPartnership, {
      partnerBusinessId,
      commissionPercent: 12,
    });
    await expect(
      as.mutation(api.memoriesAdmin.createPartnership, {
        partnerBusinessId,
        commissionPercent: 15,
      }),
    ).rejects.toThrow(/aktivan/i);
  });

  test("rejects an out-of-range commission", async () => {
    const t = convexTest(schema, modules);
    const { adminId, partnerBusinessId } = await seed(t);
    await expect(
      admin(t, adminId).mutation(api.memoriesAdmin.createPartnership, {
        partnerBusinessId,
        commissionPercent: 140,
      }),
    ).rejects.toThrow(/provizija/i);
  });
});

describe("listMemoriesSpaces (admin read model)", () => {
  test("lists spaces across businesses and celebrations with plan tier and partner info; non-admin rejected", async () => {
    const t = convexTest(schema, modules);
    const { adminId, businessId, partnerBusinessId, clientId } = await seed(t);
    const as = admin(t, adminId);

    await as.mutation(api.memoriesAdmin.grantMemories, {
      businessId,
      planKey: "standard",
    });
    await as.mutation(api.memoriesAdmin.createPartnership, {
      partnerBusinessId,
      commissionPercent: 10,
    });
    await as.mutation(api.memoriesAdmin.createCelebration, {
      kind: "rodjendan",
      title: "Petar 30",
      eventDate: Date.parse("2026-10-01T18:00:00Z"),
      acquisitionChannel: "partner",
      referredByBusinessId: partnerBusinessId,
      contactName: "Petar Petrović",
      planKey: "basic",
    });

    const rows = await as.query(api.memoriesAdmin.listMemoriesSpaces, {});
    expect(rows).toHaveLength(2);
    const celebrationRow = rows.find((r) => r.tenantKind === "celebration");
    expect(celebrationRow?.mode).toBe("one_off");
    expect(celebrationRow?.celebration?.acquisitionChannel).toBe("partner");
    expect(celebrationRow?.celebration?.partnerName).toBe("Sala Grand");
    expect(celebrationRow?.celebration?.referralCommissionPercent).toBe(10);
    const businessRow = rows.find((r) => r.tenantKind === "business");
    expect(businessRow?.planKey).toBe("standard");

    await expect(
      t
        .withIdentity({ subject: clientId, issuer: ISSUER })
        .query(api.memoriesAdmin.listMemoriesSpaces, {}),
    ).rejects.toThrow(/administratorski/i);
  });
});
