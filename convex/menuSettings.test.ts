/// <reference types="vite/client" />

// ScanMe Menu V1 — K03: languages in Settings (master §7.7). Standard allows at
// most two languages per Menu service, the source language "sr" included;
// Premium has no commercial limit, only the technical ceiling of 10. Languages
// are part of the draft (a real change bumps the revision) and an account that
// lost Premium can only cut down or reorder, never add.

import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { MENU_TRANSLATION_LANGUAGES } from "../lib/menu/languages";
import {
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  addVenueToAccount,
  grantAccountPremium,
  seedMenuWorld,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
});

// Typed by the schema (ReturnType<typeof convexTest> would lose the index types).
const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

async function world(t: T) {
  return await t.run(async (ctx) => await seedMenuWorld(ctx));
}

type World = Awaited<ReturnType<typeof world>>;

async function secondVenueOfA(t: T, w: World) {
  return await t.run(async (ctx) =>
    addVenueToAccount(ctx, {
      accountId: w.a.accountId,
      name: "Kafana kod Mike - Filijala",
      slug: "kafana-kod-mike-filijala",
      actorUserId: w.adminId,
    }),
  );
}

async function premiumForA(t: T, w: World) {
  await t.run(async (ctx) => grantAccountPremium(ctx, { accountId: w.a.accountId, via: "plan" }));
}

function setLanguages(
  t: T,
  userId: Id<"users">,
  menuServiceId: Id<"menuServices">,
  translations: string[],
) {
  return as(t, userId).mutation(api.menuSettings.setLanguages, { menuServiceId, translations });
}

/** The stored translations; undefined while the service has never saved languages. */
async function storedTranslations(t: T, menuServiceId: Id<"menuServices">) {
  const service = await t.run(async (ctx) => ctx.db.get(menuServiceId));
  return service?.settings?.languages?.translations;
}

async function revisionOf(t: T, menuServiceId: Id<"menuServices">) {
  const state = await t.run(async (ctx) =>
    ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
  );
  return state!.revision;
}

describe("menuSettings.languages (read)", () => {
  test("the default for A's owner: only the source language, Standard, limit two", async () => {
    const t = newTest();
    const w = await world(t);
    const result = await as(t, w.ownerId).query(api.menuSettings.languages, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(result).toEqual({ source: "sr", translations: [], maxLanguages: 2, tier: "standard" });
  });

  test("manager and editor (menu.read) can read it", async () => {
    const t = newTest();
    const w = await world(t);
    for (const userId of [w.managerId, w.editorId]) {
      const result = await as(t, userId).query(api.menuSettings.languages, {
        menuServiceId: w.a.menuServiceId,
      });
      expect(result).toEqual({ source: "sr", translations: [], maxLanguages: 2, tier: "standard" });
    }
  });

  test("null for finance, view-only, outsiders, another account's owner and signed-out callers", async () => {
    const t = newTest();
    const w = await world(t);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      const result = await as(t, userId).query(api.menuSettings.languages, {
        menuServiceId: w.a.menuServiceId,
      });
      expect(result).toBeNull();
    }
    expect(await t.query(api.menuSettings.languages, { menuServiceId: w.a.menuServiceId })).toBeNull();
  });

  test("reports the Premium tier and its limit once the account is Premium", async () => {
    const t = newTest();
    const w = await world(t);
    await premiumForA(t, w);
    const result = await as(t, w.ownerId).query(api.menuSettings.languages, {
      menuServiceId: w.a.menuServiceId,
    });
    expect(result).toEqual({ source: "sr", translations: [], maxLanguages: 10, tier: "premium" });
  });
});

describe("Standard: at most two languages, the source included", () => {
  test("one translation is fine; two are refused with plan/language_limit and nothing changes", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;

    expect(await setLanguages(t, w.ownerId, id, ["en"])).toEqual({ ok: true });
    expect(await storedTranslations(t, id)).toEqual(["en"]);
    const stored = await t.run(async (ctx) => ctx.db.get(id));
    expect(stored?.settings?.languages).toEqual({ source: "sr", translations: ["en"] });

    await expect(setLanguages(t, w.ownerId, id, ["en", "de"])).rejects.toThrow(
      MENU_PLAN_ERROR.languageLimit,
    );
    expect(await storedTranslations(t, id)).toEqual(["en"]);

    const read = await as(t, w.ownerId).query(api.menuSettings.languages, { menuServiceId: id });
    expect(read).toEqual({ source: "sr", translations: ["en"], maxLanguages: 2, tier: "standard" });
  });

  test("replacing the only translation with another one is fine", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;
    await setLanguages(t, w.ownerId, id, ["en"]);
    await setLanguages(t, w.ownerId, id, ["de"]);
    expect(await storedTranslations(t, id)).toEqual(["de"]);
  });
});

describe("Premium: no commercial limit, technical maximum ten", () => {
  test("three translations are fine", async () => {
    const t = newTest();
    const w = await world(t);
    await premiumForA(t, w);
    await setLanguages(t, w.ownerId, w.a.menuServiceId, ["en", "de", "it"]);
    expect(await storedTranslations(t, w.a.menuServiceId)).toEqual(["en", "de", "it"]);
  });

  test("nine translations (ten languages) are fine; ten translations hit the technical maximum", async () => {
    const t = newTest();
    const w = await world(t);
    await premiumForA(t, w);
    const id = w.a.menuServiceId;
    const nine = MENU_TRANSLATION_LANGUAGES.slice(0, 9);
    const ten = MENU_TRANSLATION_LANGUAGES.slice(0, 10);

    await setLanguages(t, w.ownerId, id, nine);
    expect(await storedTranslations(t, id)).toEqual(nine);

    await expect(setLanguages(t, w.ownerId, id, ten)).rejects.toThrow(MENU_PLAN_ERROR.languageLimit);
    expect(await storedTranslations(t, id)).toEqual(nine);
  });

  test("a subscription Premium (active or grace) gives the same room", async () => {
    for (const status of ["active", "grace"] as const) {
      const t = newTest();
      const w = await world(t);
      await t.run(async (ctx) =>
        grantAccountPremium(ctx, { accountId: w.a.accountId, via: "subscription", status }),
      );
      await setLanguages(t, w.ownerId, w.a.menuServiceId, ["en", "de", "it"]);
      expect(await storedTranslations(t, w.a.menuServiceId)).toEqual(["en", "de", "it"]);
    }
  });
});

describe("an account that lost Premium keeps its languages but cannot add", () => {
  test("removing and reordering are allowed above the limit, adding is not, dropping to the limit is", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;
    await premiumForA(t, w);
    await setLanguages(t, w.ownerId, id, ["en", "de", "it"]);

    // Premium is gone: the account is Basic again (Standard languages).
    await t.run(async (ctx) => ctx.db.patch(w.a.accountId, { plan: "basic" }));
    const read = await as(t, w.ownerId).query(api.menuSettings.languages, { menuServiceId: id });
    expect(read).toEqual({
      source: "sr",
      translations: ["en", "de", "it"],
      maxLanguages: 2,
      tier: "standard",
    });

    // Reordering the same three is fine.
    await setLanguages(t, w.ownerId, id, ["it", "en", "de"]);
    expect(await storedTranslations(t, id)).toEqual(["it", "en", "de"]);

    // Removing one is fine (still over the limit: sr + 2 translations = 3).
    await setLanguages(t, w.ownerId, id, ["en", "de"]);
    expect(await storedTranslations(t, id)).toEqual(["en", "de"]);

    // Adding a NEW code while still over the limit is refused, nothing changes.
    await expect(setLanguages(t, w.ownerId, id, ["en", "de", "fr"])).rejects.toThrow(
      MENU_PLAN_ERROR.languageLimit,
    );
    await expect(setLanguages(t, w.ownerId, id, ["en", "fr"])).rejects.toThrow(
      MENU_PLAN_ERROR.languageLimit,
    );
    expect(await storedTranslations(t, id)).toEqual(["en", "de"]);

    // Dropping to the Standard limit is fine, and from there new codes fit again.
    await setLanguages(t, w.ownerId, id, ["en"]);
    expect(await storedTranslations(t, id)).toEqual(["en"]);
    await setLanguages(t, w.ownerId, id, ["de"]);
    expect(await storedTranslations(t, id)).toEqual(["de"]);
    await expect(setLanguages(t, w.ownerId, id, ["de", "fr"])).rejects.toThrow(
      MENU_PLAN_ERROR.languageLimit,
    );
  });
});

describe("validation", () => {
  test("an unknown code, the source language and duplicates are menu/invalid_input", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;
    await premiumForA(t, w);
    await setLanguages(t, w.ownerId, id, ["de"]);

    for (const bad of [["xx"], ["sr"], ["en", "sr"], ["en", "en"], [""], ["en", "de", "en"]]) {
      await expect(setLanguages(t, w.ownerId, id, bad), JSON.stringify(bad)).rejects.toThrow(
        MENU_ERROR.invalidInput,
      );
    }
    expect(await storedTranslations(t, id)).toEqual(["de"]);
  });

  test("the same validation holds on Standard", async () => {
    const t = newTest();
    const w = await world(t);
    for (const bad of [["xx"], ["sr"], ["en", "en"]]) {
      await expect(setLanguages(t, w.ownerId, w.a.menuServiceId, bad)).rejects.toThrow(
        MENU_ERROR.invalidInput,
      );
    }
    expect(await storedTranslations(t, w.a.menuServiceId)).toBeUndefined();
  });

  test("codes are trimmed and lower-cased before they are stored", async () => {
    const t = newTest();
    const w = await world(t);
    await setLanguages(t, w.ownerId, w.a.menuServiceId, [" EN "]);
    expect(await storedTranslations(t, w.a.menuServiceId)).toEqual(["en"]);

    await premiumForA(t, w);
    await setLanguages(t, w.ownerId, w.a.menuServiceId, ["De", " it", "FR "]);
    expect(await storedTranslations(t, w.a.menuServiceId)).toEqual(["de", "it", "fr"]);
  });

  test("different spellings of one code are a duplicate", async () => {
    const t = newTest();
    const w = await world(t);
    await premiumForA(t, w);
    await expect(setLanguages(t, w.ownerId, w.a.menuServiceId, ["en", " EN"])).rejects.toThrow(
      MENU_ERROR.invalidInput,
    );
  });
});

describe("who may change the languages (settings.edit)", () => {
  test("owner, manager and ScanMe admin may; the last one wins", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;

    await setLanguages(t, w.ownerId, id, ["en"]);
    expect(await storedTranslations(t, id)).toEqual(["en"]);
    await setLanguages(t, w.managerId, id, ["de"]);
    expect(await storedTranslations(t, id)).toEqual(["de"]);
    await setLanguages(t, w.adminId, id, ["fr"]);
    expect(await storedTranslations(t, id)).toEqual(["fr"]);
  });

  test("an editor is forbidden; finance, view-only, outsiders and another account's owner get not_found", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;
    await setLanguages(t, w.ownerId, id, ["en"]);

    await expect(setLanguages(t, w.editorId, id, ["de"])).rejects.toThrow(MENU_ERROR.forbidden);
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      await expect(setLanguages(t, userId, id, ["de"])).rejects.toThrow(MENU_ERROR.notFound);
    }
    expect(await storedTranslations(t, id)).toEqual(["en"]);
  });

  test("a signed-out caller is unauthenticated", async () => {
    const t = newTest();
    const w = await world(t);
    await expect(
      t.mutation(api.menuSettings.setLanguages, {
        menuServiceId: w.a.menuServiceId,
        translations: ["en"],
      }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    expect(await storedTranslations(t, w.a.menuServiceId)).toBeUndefined();
  });
});

describe("languages are part of the draft", () => {
  test("a real change bumps the revision by exactly one; a no-op and a refusal do not", async () => {
    const t = newTest();
    const w = await world(t);
    const id = w.a.menuServiceId;
    expect(await revisionOf(t, id)).toBe(0);

    await setLanguages(t, w.ownerId, id, ["en"]);
    expect(await revisionOf(t, id)).toBe(1);

    // Same list: a successful no-op.
    expect(await setLanguages(t, w.ownerId, id, ["en"])).toEqual({ ok: true });
    expect(await setLanguages(t, w.ownerId, id, [" EN "])).toEqual({ ok: true });
    expect(await revisionOf(t, id)).toBe(1);

    // Refusals: plan limit, invalid input, role.
    await expect(setLanguages(t, w.ownerId, id, ["en", "de"])).rejects.toThrow(
      MENU_PLAN_ERROR.languageLimit,
    );
    await expect(setLanguages(t, w.ownerId, id, ["xx"])).rejects.toThrow(MENU_ERROR.invalidInput);
    await expect(setLanguages(t, w.editorId, id, ["de"])).rejects.toThrow(MENU_ERROR.forbidden);
    expect(await revisionOf(t, id)).toBe(1);

    // Removing the last translation is a real change too.
    await setLanguages(t, w.ownerId, id, []);
    expect(await revisionOf(t, id)).toBe(2);
    expect(await storedTranslations(t, id)).toEqual([]);
  });

  test("an empty list on a service that never saved languages is a no-op", async () => {
    const t = newTest();
    const w = await world(t);
    expect(await setLanguages(t, w.ownerId, w.a.menuServiceId, [])).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(0);
  });
});

describe("tenant boundary", () => {
  test("two venues of account A have independent language lists", async () => {
    const t = newTest();
    const w = await world(t);
    const second = await secondVenueOfA(t, w);

    await setLanguages(t, w.ownerId, w.a.menuServiceId, ["en"]);
    expect(await storedTranslations(t, w.a.menuServiceId)).toEqual(["en"]);
    expect(await storedTranslations(t, second.menuServiceId)).toBeUndefined();
    expect(await revisionOf(t, second.menuServiceId)).toBe(0);

    await setLanguages(t, w.ownerId, second.menuServiceId, ["de"]);
    expect(await storedTranslations(t, second.menuServiceId)).toEqual(["de"]);
    expect(await storedTranslations(t, w.a.menuServiceId)).toEqual(["en"]);

    const read = await as(t, w.ownerId).query(api.menuSettings.languages, {
      menuServiceId: second.menuServiceId,
    });
    expect(read).toEqual({ source: "sr", translations: ["de"], maxLanguages: 2, tier: "standard" });
  });

  test("the Premium of account A lets BOTH its venues have three translations; account B stays on Standard", async () => {
    const t = newTest();
    const w = await world(t);
    const second = await secondVenueOfA(t, w);
    await premiumForA(t, w);

    await setLanguages(t, w.ownerId, w.a.menuServiceId, ["en", "de", "it"]);
    await setLanguages(t, w.ownerId, second.menuServiceId, ["fr", "es", "pt"]);
    expect(await storedTranslations(t, w.a.menuServiceId)).toEqual(["en", "de", "it"]);
    expect(await storedTranslations(t, second.menuServiceId)).toEqual(["fr", "es", "pt"]);

    // Account B never got Premium: two translations are over its limit.
    await expect(setLanguages(t, w.otherOwnerId, w.b.menuServiceId, ["en", "de"])).rejects.toThrow(
      MENU_PLAN_ERROR.languageLimit,
    );
    expect(await storedTranslations(t, w.b.menuServiceId)).toBeUndefined();
  });

  test("another account's owner can neither read nor write A's languages, and A's owner cannot touch B's", async () => {
    const t = newTest();
    const w = await world(t);
    await setLanguages(t, w.ownerId, w.a.menuServiceId, ["en"]);

    expect(
      await as(t, w.otherOwnerId).query(api.menuSettings.languages, {
        menuServiceId: w.a.menuServiceId,
      }),
    ).toBeNull();
    await expect(setLanguages(t, w.otherOwnerId, w.a.menuServiceId, ["de"])).rejects.toThrow(
      MENU_ERROR.notFound,
    );
    await expect(setLanguages(t, w.ownerId, w.b.menuServiceId, ["de"])).rejects.toThrow(
      MENU_ERROR.notFound,
    );
    expect(await storedTranslations(t, w.a.menuServiceId)).toEqual(["en"]);
    expect(await storedTranslations(t, w.b.menuServiceId)).toBeUndefined();
  });
});
