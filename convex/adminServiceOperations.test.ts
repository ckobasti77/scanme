/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.parse("2026-09-15T10:00:00Z");
const ADMIN = "admin-services@scanme.test";

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = ADMIN;
});

function identity(userId: Id<"users">) {
  return { subject: userId, issuer: "https://admin-services.test" };
}

async function seed(t: ReturnType<typeof convexTest>) {
  const ids = await t.run(async (ctx) => {
    const adminId = await ctx.db.insert("users", { email: ADMIN });
    const outsiderId = await ctx.db.insert("users", { email: "outsider-services@scanme.test" });
    const accountId = await ctx.db.insert("accounts", {
      name: "Operativni nalog",
      plan: "premium",
      status: "active",
      billingModel: "subscriptions_v1",
      smkCode: "SMK-OPS-001",
      ownerDisplayName: "Mila Operativna",
      normalizedOwnerDisplayName: "mila operativna",
      clientStatus: "active",
      adminV1MigrationVersion: 1,
      adminV1MigratedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const businessId = await ctx.db.insert("businesses", {
      accountId,
      name: "Kafe Operativa",
      normalizedName: "kafe operativa",
      slug: "kafe-operativa-admin-15",
      kind: "business",
      smlCode: "SML-OPS-001",
      clientStatus: "active",
      status: "active",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const createProfile = async (type: "scanme_links" | "google_review" | "scanme_menu") => ctx.db.insert("serviceProfiles", {
      businessId,
      type,
      slug: `admin-15-${type}`,
      status: "active",
      totalScans: 0,
      totalPageViews: 0,
      totalConvertedSessions: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const linksId = await createProfile("scanme_links");
    const reviewId = await createProfile("google_review");
    const menuId = await createProfile("scanme_menu");
    for (const [serviceProfileId, serviceType, filterState] of [
      [linksId, "scanme_links", "warning"],
      [reviewId, "google_review", "active"],
      [menuId, "scanme_menu", "problem"],
    ] as const) {
      await ctx.db.insert("adminServiceOperationReadModels", {
        accountId,
        businessId,
        serviceProfileId,
        serviceType,
        subscriptionState: "active",
        warning: filterState === "warning",
        paidThrough: NOW + 30 * 86_400_000,
        graceEndsAt: null,
        configurationState: serviceType === "scanme_menu" ? "draft" : "configured",
        filterState,
        smkCode: "SMK-OPS-001",
        smlCode: "SML-OPS-001",
        accountName: "Operativni nalog",
        ownerDisplayName: "Mila Operativna",
        venueName: "Kafe Operativa",
        normalizedVenueName: "kafe operativa",
        publicSlug: `admin-15-${serviceType}`,
        productCount: 2,
        qrCount: 2,
        nfcCount: 0,
        problemCount: 0,
        signal: { severity: null, causeId: null },
        urgencyRank: filterState === "problem" ? 0 : filterState === "warning" ? 1 : 3,
        searchText: "mila operativna kafe operativa smk ops 001 smkops001 sml ops 001 smlops001",
        updatedAt: NOW,
      });
    }
    return { adminId, outsiderId, linksId, reviewId, menuId };
  });
  return {
    ...ids,
    admin: t.withIdentity(identity(ids.adminId)),
    outsider: t.withIdentity(identity(ids.outsiderId)),
  };
}

describe("ADMIN-15 service operations", () => {
  test("limits every service list to a typed, indexed page and preserves warning separately", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const result = await ids.admin.query(api.adminServiceOperations.list, {
      serviceType: "scanme_links",
      filter: "all",
      sort: "urgency",
      paginationOpts: { numItems: 1, cursor: null },
    });
    expect(result.page).toHaveLength(1);
    expect(result.page[0]).toMatchObject({ serviceProfileId: ids.linksId, subscriptionState: "active", filterState: "warning", warning: true });
    const search = await ids.admin.query(api.adminServiceOperations.list, {
      serviceType: "scanme_links",
      filter: "warning",
      sort: "name",
      search: "SML-OPS-001",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(search.page.map((row) => row.serviceProfileId)).toEqual([ids.linksId]);
  });

  test("rejects non-admin list and detail reads", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    await expect(ids.outsider.query(api.adminServiceOperations.list, {
      serviceType: "scanme_menu",
      filter: "all",
      sort: "urgency",
      paginationOpts: { numItems: 10, cursor: null },
    })).rejects.toThrow();
    await expect(ids.outsider.query(api.adminServiceOperations.detail, {
      serviceProfileId: ids.menuId,
    })).rejects.toThrow();
  });
});
