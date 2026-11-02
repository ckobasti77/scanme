/// <reference types="vite/client" />

// ScanMe Menu V1 — K04: "Privremeno nedostupno" (master §5.6). A live,
// operational layer: it changes at once, never through the draft (the draft
// revision does not move) and never by publishing. Covered: the toggle and its
// idempotency, the draft staying untouched, roles (including client editing
// switched off), and tenant isolation.

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import {
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

const CODE_PATTERN = /\bmenu\/[a-z_]+/;

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    if (error instanceof ConvexError && typeof error.data === "string") return error.data;
    const text = error instanceof Error ? error.message : String(error);
    return text.match(CODE_PATTERN)?.[0] ?? text;
  }
}

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

/** One article "Pljeskavica" (450) on the default page of a tenant. */
async function article(t: T, ownerId: Id<"users">, pageId: Id<"menuPages">, name = "Pljeskavica") {
  const { sectionId } = await as(t, ownerId).mutation(api.menuCatalog.addSection, {
    pageId,
    name: "Roštilj",
  });
  const result = await as(t, ownerId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name,
    priceRsd: 450,
  });
  if (result.status !== "created") throw new Error("expected created");
  return result;
}

async function revision(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(async (ctx) => {
    const state = await ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique();
    return state?.revision ?? -1;
  });
}

async function availabilityRows(t: T, menuServiceId: Id<"menuServices">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("menuAvailability")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
        .collect(),
  );
}

describe("menuAvailability — Privremeno nedostupno (live)", () => {
  test("marks unavailable and back, keyed by the stable article key", async () => {
    const { t, w } = await setup();
    const { articleId, key } = await article(t, w.ownerId, w.a.defaultPageId);

    const off = await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId,
      available: false,
    });
    expect(off).toEqual({ available: false, changed: true });
    const rows = await availabilityRows(t, w.a.menuServiceId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ articleKey: key, setByUserId: w.ownerId });
    expect(
      await as(t, w.ownerId).query(api.menuAvailability.unavailableArticles, {
        menuServiceId: w.a.menuServiceId,
      }),
    ).toEqual([{ articleKey: key, since: rows[0].since }]);

    const on = await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId,
      available: true,
    });
    expect(on).toEqual({ available: true, changed: true });
    expect(await availabilityRows(t, w.a.menuServiceId)).toHaveLength(0);
  });

  test("is idempotent: repeating a state writes nothing new", async () => {
    const { t, w } = await setup();
    const { articleId } = await article(t, w.ownerId, w.a.defaultPageId);
    const owner = as(t, w.ownerId);

    expect(
      await owner.mutation(api.menuAvailability.setAvailability, { articleId, available: true }),
    ).toEqual({ available: true, changed: false });
    await owner.mutation(api.menuAvailability.setAvailability, { articleId, available: false });
    expect(
      await owner.mutation(api.menuAvailability.setAvailability, { articleId, available: false }),
    ).toEqual({ available: false, changed: false });
    expect(await availabilityRows(t, w.a.menuServiceId)).toHaveLength(1);
  });

  test("goes live without touching the draft: the draft revision does not move", async () => {
    const { t, w } = await setup();
    const { articleId } = await article(t, w.ownerId, w.a.defaultPageId);
    const before = await revision(t, w.a.menuServiceId);

    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId,
      available: false,
    });
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId,
      available: true,
    });

    expect(await revision(t, w.a.menuServiceId)).toBe(before);
    const stored = await t.run(async (ctx) => await ctx.db.get(articleId));
    expect(stored).not.toHaveProperty("available");
  });
});

describe("menuAvailability — roles", () => {
  test("owner, manager, editor and admin may toggle", async () => {
    const { t, w } = await setup();
    const { articleId } = await article(t, w.ownerId, w.a.defaultPageId);
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      expect(
        await codeOf(
          as(t, userId).mutation(api.menuAvailability.setAvailability, {
            articleId,
            available: false,
          }),
        ),
      ).toBeNull();
      expect(
        await codeOf(
          as(t, userId).mutation(api.menuAvailability.setAvailability, {
            articleId,
            available: true,
          }),
        ),
      ).toBeNull();
    }
  });

  test("finance, view-only and outsiders get not_found and read null", async () => {
    const { t, w } = await setup();
    const { articleId } = await article(t, w.ownerId, w.a.defaultPageId);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId]) {
      expect(
        await codeOf(
          as(t, userId).mutation(api.menuAvailability.setAvailability, {
            articleId,
            available: false,
          }),
        ),
      ).toBe(MENU_ERROR.notFound);
      expect(
        await as(t, userId).query(api.menuAvailability.unavailableArticles, {
          menuServiceId: w.a.menuServiceId,
        }),
      ).toBeNull();
    }
    expect(await availabilityRows(t, w.a.menuServiceId)).toHaveLength(0);
  });

  test("anonymous callers are refused", async () => {
    const { t, w } = await setup();
    const { articleId } = await article(t, w.ownerId, w.a.defaultPageId);
    expect(
      await codeOf(t.mutation(api.menuAvailability.setAvailability, { articleId, available: false })),
    ).toBe(MENU_ERROR.unauthenticated);
  });

  test("works while ScanMe switched client editing off (operational, not editing)", async () => {
    const { t, w } = await setup();
    const { articleId } = await article(t, w.ownerId, w.a.defaultPageId);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false });
    });

    expect(
      await codeOf(
        as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
          articleId,
          expectedPriceRsd: 450,
          priceRsd: 500,
        }),
      ),
    ).toBe(MENU_ERROR.editingDisabled);
    expect(
      await codeOf(
        as(t, w.managerId).mutation(api.menuAvailability.setAvailability, {
          articleId,
          available: false,
        }),
      ),
    ).toBeNull();
  });

  test("an inactive Menu profile stops it", async () => {
    const { t, w } = await setup();
    const { articleId } = await article(t, w.ownerId, w.a.defaultPageId);
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.serviceProfileId, { status: "inactive" });
    });
    expect(
      await codeOf(
        as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
          articleId,
          available: false,
        }),
      ),
    ).toBe(MENU_ERROR.serviceInactive);
  });
});

describe("menuAvailability — tenant isolation", () => {
  test("another account cannot toggle or read this venue", async () => {
    const { t, w } = await setup();
    const { articleId } = await article(t, w.ownerId, w.a.defaultPageId);
    expect(
      await codeOf(
        as(t, w.otherOwnerId).mutation(api.menuAvailability.setAvailability, {
          articleId,
          available: false,
        }),
      ),
    ).toBe(MENU_ERROR.notFound);
    expect(
      await as(t, w.otherOwnerId).query(api.menuAvailability.unavailableArticles, {
        menuServiceId: w.a.menuServiceId,
      }),
    ).toBeNull();
    expect(await availabilityRows(t, w.a.menuServiceId)).toHaveLength(0);
  });

  test("each venue sees only its own unavailable articles", async () => {
    const { t, w } = await setup();
    const a = await article(t, w.ownerId, w.a.defaultPageId, "Pljeskavica");
    const b = await article(t, w.otherOwnerId, w.b.defaultPageId, "Ćevapi");
    await as(t, w.ownerId).mutation(api.menuAvailability.setAvailability, {
      articleId: a.articleId,
      available: false,
    });
    await as(t, w.otherOwnerId).mutation(api.menuAvailability.setAvailability, {
      articleId: b.articleId,
      available: false,
    });

    const seenByA = await as(t, w.ownerId).query(api.menuAvailability.unavailableArticles, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(seenByA?.map((row) => row.articleKey)).toEqual([a.key]);
    const seenByB = await as(t, w.otherOwnerId).query(api.menuAvailability.unavailableArticles, {
      menuServiceId: w.b.menuServiceId,
    });
    expect(seenByB?.map((row) => row.articleKey)).toEqual([b.key]);
  });
});
