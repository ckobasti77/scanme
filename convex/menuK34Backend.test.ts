/// <reference types="vite/client" />

// ScanMe Menu V1 - K34 review fixes A8, A4 and A5 (the backend findings):
//
// A8: convex/menuFx.ts cut a slow source with `AbortSignal.timeout`, the one
//     outbound call in convex/ that did; where the static method is missing the
//     TypeError was swallowed and the rate never refreshed. It uses an
//     AbortController and a timer now (cleared in `finally`), like the others.
// A4: "Preuzmi ceo meni" (menuRoomService.importWholeMenu) made Room service
//     categories from sections WITHOUT their translations, and two sections
//     with the same name made two categories with the same name. A new category
//     now takes the confirmed name translations of its section (the source text
//     is identical, so the stored source hashes stay valid) and one name is one
//     category within an import, as it already was against existing categories.
// A5: MENU_MAX_COMBOS_PER_COMPONENT (200) was never enforced when a component
//     is added to a combo, so the 201st combo would never get the "check the
//     combo price" flag. createCombo and setComboComponents now refuse with
//     menu/limit_reached an article that is already a component of 200 combos.
//
// Fictional tenants only (the repo is public). The helpers are copied from
// convex/menuFx.test.ts, convex/menuRoomService.test.ts and
// convex/menuCombos.test.ts on purpose (a test file is not a module to import from).

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { newMenuKey } from "../lib/menu/keys";
import { MENU_MAX_COMBOS_PER_COMPONENT } from "../lib/menu/limits";
import { fieldTranslation, sourceHash } from "../lib/menu/translation-status";
import {
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  grantAccountPremium,
  seedMenuWorld,
  type MenuWorldSeed,
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

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  return { t, w };
}

const CODE_PATTERN = /\b(?:menu|plan|article|room_service)\/[a-z_]+/;

function errorCode(error: unknown): string {
  if (error instanceof ConvexError && typeof error.data === "string") return error.data;
  const text = error instanceof Error ? error.message : String(error);
  return text.match(CODE_PATTERN)?.[0] ?? text;
}

/** The machine code a call was refused with, or null when it succeeded. */
async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise;
    return null;
  } catch (error) {
    return errorCode(error);
  }
}

async function expectCode(promise: Promise<unknown>, code: string) {
  expect(await codeOf(promise)).toBe(code);
}

async function addSection(t: T, userId: Id<"users">, pageId: Id<"menuPages">, name: string) {
  return await as(t, userId).mutation(api.menuCatalog.addSection, { pageId, name });
}

async function quickAdd(t: T, userId: Id<"users">, sectionId: Id<"menuSections">, name: string, priceRsd?: number) {
  const result = await as(t, userId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId,
    name,
    ...(priceRsd !== undefined ? { priceRsd } : {}),
  });
  if (result.status !== "created") throw new Error(`expected created, got ${result.status}`);
  return result;
}

// =============================================================================
// A8 - menuFx: an AbortController, not AbortSignal.timeout
// =============================================================================

describe("A8: menuFx.refreshRate timeout", () => {
  const URL_OK = "https://nbs-relay.example.test/kurs/eur.json";
  const FIXTURE = { code: "EUR", date: "2026-10-16", parity: 1, exchange_middle: 117.1655 };
  const ENV_NAMES = ["MENU_FX_ENABLED", "MENU_FX_URL"] as const;
  let saved: Record<string, string | undefined>;
  let timeoutDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
    process.env.MENU_FX_ENABLED = "true";
    process.env.MENU_FX_URL = URL_OK;
    timeoutDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, "timeout");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    for (const name of ENV_NAMES) {
      if (saved[name] === undefined) delete process.env[name];
      else process.env[name] = saved[name];
    }
    // Put the static method back exactly as it was (a test below removes it).
    if (timeoutDescriptor) Object.defineProperty(AbortSignal, "timeout", timeoutDescriptor);
    else delete (AbortSignal as unknown as Record<string, unknown>).timeout;
  });

  const rows = (t: T) => t.run(async (ctx) => await ctx.db.query("menuExchangeRates").collect());

  test("[A8] where AbortSignal.timeout does not exist the rate is still stored, and the request gets a live signal", async () => {
    vi.useFakeTimers();
    const t = newTest();
    // The runtime without the static method: calling it is "AbortSignal.timeout is not a function".
    Object.defineProperty(AbortSignal, "timeout", { configurable: true, writable: true, value: undefined });
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        signals.push(init?.signal);
        return new Response(JSON.stringify(FIXTURE), { status: 200, headers: { "Content-Type": "application/json" } });
      }),
    );

    const timersBefore = vi.getTimerCount();
    expect(await t.action(internal.menuFx.refreshRate, {})).toBe("stored");

    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(false);
    expect(await rows(t)).toHaveLength(1);
    // The timeout timer is cleared once the answer is read: nothing is left to abort later.
    expect(vi.getTimerCount()).toBe(timersBefore);
  });

  test("[A8] a source that never answers is cut after 10 seconds: error, nothing stored, no timer left", async () => {
    vi.useFakeTimers();
    const t = newTest();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    );

    const timersBefore = vi.getTimerCount();
    let settled = false;
    const pending = t.action(internal.menuFx.refreshRate, {}).then((result) => {
      settled = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe("error");
    expect(await rows(t)).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(timersBefore);
  });
});

// =============================================================================
// A4 - "Preuzmi ceo meni": category translations, one category per name
// =============================================================================

describe("A4: menuRoomService.importWholeMenu", () => {
  const RS = api.menuRoomService;

  async function premium(t: T, accountId: Id<"accounts">) {
    await t.run(async (ctx) => {
      await grantAccountPremium(ctx, { accountId, via: "plan" });
    });
  }

  async function categoriesOf(t: T, menuServiceId: Id<"menuServices">) {
    return await t.run(async (ctx) =>
      ctx.db
        .query("menuRoomServiceCategories")
        .withIndex("by_menuServiceId_and_order", (q) => q.eq("menuServiceId", menuServiceId))
        .collect(),
    );
  }

  const namesIn = (view: { categories: { name: string; items: { article: { name: string } }[] }[] }) =>
    view.categories.map((category) => ({ name: category.name, items: category.items.map((item) => item.article.name) }));

  test("[A4] a new category takes the confirmed name translations of its section, with their source hashes; descriptions and suggestions stay behind", async () => {
    const { t, w } = await setup();
    await premium(t, w.a.accountId);
    const owner = as(t, w.ownerId);
    const drinks = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
    const food = await addSection(t, w.ownerId, w.a.defaultPageId, "Hrana");
    await quickAdd(t, w.ownerId, drinks.sectionId, "Jelen pivo", 200);
    await quickAdd(t, w.ownerId, food.sectionId, "Pljeskavica", 450);

    // What the translation editor (K16) stores on a section: a confirmed English name with its description
    // and a pending suggestion, a French name made from an OLDER source text (stale), a German entry that
    // holds only a suggestion.
    const hash = sourceHash("Pića");
    await t.run(async (ctx) => {
      await ctx.db.patch(drinks.sectionId, {
        translations: {
          en: {
            status: "confirmed",
            name: "Drinks",
            nameHash: hash,
            description: "Cold drinks",
            descriptionHash: "d1",
            suggestion: { name: "Beverages", nameHash: hash, at: 1 },
          },
          fr: { status: "confirmed", name: "Boissons", nameHash: "an-older-source-hash" },
          de: { status: "suggested", suggestion: { name: "Getränke", nameHash: hash, at: 1 } },
        },
      });
    });

    expect(await owner.mutation(RS.importWholeMenu, { menuServiceId: w.a.menuServiceId })).toEqual({
      categoriesCreated: 2,
      itemsAdded: 2,
      alreadyIn: 0,
    });

    const [pica, hrana] = await categoriesOf(t, w.a.menuServiceId);
    expect([pica.name, hrana.name]).toEqual(["Pića", "Hrana"]);
    // Only the confirmed names, each with the hash it came with.
    expect(pica.translations).toEqual({
      en: { status: "confirmed", name: "Drinks", nameHash: hash },
      fr: { status: "confirmed", name: "Boissons", nameHash: "an-older-source-hash" },
    });
    // A section without translations makes a category without them (no empty object).
    expect(hrana).not.toHaveProperty("translations");

    // The hash is the hash of the category's own name, so the language keeps its state: done stays done,
    // a stale translation stays stale (it is not silently turned into "done").
    expect(fieldTranslation(pica.name, pica.translations?.en, "name")).toMatchObject({ status: "done", confirmed: "Drinks" });
    expect(fieldTranslation(pica.name, pica.translations?.fr, "name")).toMatchObject({ status: "stale", confirmed: "Boissons" });
    expect(fieldTranslation(pica.name, pica.translations?.de, "name")).toMatchObject({ status: "missing", confirmed: null });

    // And the translation editor's Room service list shows it.
    const list = await owner.query(api.menuTranslations.view, {
      menuServiceId: w.a.menuServiceId,
      scope: { kind: "roomService" },
    });
    const stavka = list?.items.find((item) => item.key === pica.key);
    expect(stavka?.izvor).toEqual({ name: "Pića" });
    expect(stavka?.prevodi?.en?.name).toBe("Drinks");
  });

  test("[A4] an existing category with the section's name is re-used and keeps its own translations", async () => {
    const { t, w } = await setup();
    await premium(t, w.a.accountId);
    const owner = as(t, w.ownerId);
    const food = await addSection(t, w.ownerId, w.a.defaultPageId, "Hrana");
    await quickAdd(t, w.ownerId, food.sectionId, "Pljeskavica", 450);
    const own = { en: { status: "confirmed" as const, name: "Room food", nameHash: sourceHash("Hrana") } };
    const existing = await owner.mutation(RS.addCategory, { menuServiceId: w.a.menuServiceId, name: "Hrana" });
    await t.run(async (ctx) => {
      await ctx.db.patch(existing.categoryId, { translations: own });
      await ctx.db.patch(food.sectionId, {
        translations: { en: { status: "confirmed", name: "Food", nameHash: sourceHash("Hrana") } },
      });
    });

    expect(await owner.mutation(RS.importWholeMenu, { menuServiceId: w.a.menuServiceId })).toEqual({
      categoriesCreated: 0,
      itemsAdded: 1,
      alreadyIn: 0,
    });

    const categories = await categoriesOf(t, w.a.menuServiceId);
    expect(categories).toHaveLength(1);
    expect(categories[0]._id).toBe(existing.categoryId);
    expect(categories[0].translations).toEqual(own);
  });

  test("[A4] two sections with the same name become ONE category within an import; a second import adds nothing", async () => {
    const { t, w } = await setup();
    await premium(t, w.a.accountId);
    const owner = as(t, w.ownerId);
    const id = w.a.menuServiceId;
    const first = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
    const food = await addSection(t, w.ownerId, w.a.defaultPageId, "Hrana");
    const second = await addSection(t, w.ownerId, w.a.defaultPageId, "Pića");
    await quickAdd(t, w.ownerId, first.sectionId, "Jelen pivo", 200);
    await quickAdd(t, w.ownerId, food.sectionId, "Pljeskavica", 450);
    await quickAdd(t, w.ownerId, second.sectionId, "Espreso", 150);
    await quickAdd(t, w.ownerId, second.sectionId, "Limunada", 180);
    // The first section of the name is the one the category is made from.
    await t.run(async (ctx) => {
      await ctx.db.patch(first.sectionId, {
        translations: { en: { status: "confirmed", name: "Drinks", nameHash: sourceHash("Pića") } },
      });
    });

    expect(await owner.mutation(RS.importWholeMenu, { menuServiceId: id })).toEqual({
      categoriesCreated: 2,
      itemsAdded: 4,
      alreadyIn: 0,
    });

    const categories = await categoriesOf(t, id);
    expect(categories.map((category) => category.name)).toEqual(["Pića", "Hrana"]);
    expect(categories[0].translations?.en?.name).toBe("Drinks");
    const view = must(await owner.query(RS.get, { menuServiceId: id }));
    expect(namesIn(view)).toEqual([
      { name: "Pića", items: ["Jelen pivo", "Espreso", "Limunada"] },
      { name: "Hrana", items: ["Pljeskavica"] },
    ]);

    // Nothing is added twice by a second import.
    expect(await owner.mutation(RS.importWholeMenu, { menuServiceId: id })).toEqual({
      categoriesCreated: 0,
      itemsAdded: 0,
      alreadyIn: 4,
    });
    expect(await categoriesOf(t, id)).toHaveLength(2);
  });
});

function must<V>(value: V | null | undefined, what = "value"): V {
  if (value === null || value === undefined) throw new Error(`expected ${what}, got ${String(value)}`);
  return value;
}

// =============================================================================
// A5 - a component is in at most MENU_MAX_COMBOS_PER_COMPONENT combos
// =============================================================================

describe("A5: the limit of combos per component", () => {
  const C = api.menuCombos;
  const LIMIT = MENU_MAX_COMBOS_PER_COMPONENT;

  /** Section "Meniji" with Pomfrit (the busy component), Burger and Sok, by the owner of tenant A. */
  async function fixture(t: T, w: MenuWorldSeed) {
    const section = await addSection(t, w.ownerId, w.a.defaultPageId, "Meniji");
    const fries = await quickAdd(t, w.ownerId, section.sectionId, "Pomfrit", 250);
    const burger = await quickAdd(t, w.ownerId, section.sectionId, "Burger", 650);
    const juice = await quickAdd(t, w.ownerId, section.sectionId, "Sok", 120);
    return {
      sectionId: section.sectionId,
      friesId: fries.articleId,
      friesKey: fries.key,
      burgerId: burger.articleId,
      juiceId: juice.articleId,
    };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;

  /** `count` combo articles with one component row each for `componentId` (written directly: cheap). */
  async function fillCombos(t: T, w: MenuWorldSeed, componentId: Id<"menuArticles">, count: number) {
    return await t.run(async (ctx) => {
      const now = Date.now();
      const ids: Id<"menuArticles">[] = [];
      for (let n = 0; n < count; n += 1) {
        const comboId = await ctx.db.insert("menuArticles", {
          menuServiceId: w.a.menuServiceId,
          key: newMenuKey("article"),
          kind: "combo",
          name: `Kombo ${n}`,
          nameNormalized: `kombo ${n}`,
          basePriceRsd: 500,
          mediaMode: "none",
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("menuComboComponents", {
          menuServiceId: w.a.menuServiceId,
          comboArticleId: comboId,
          componentArticleId: componentId,
          quantity: 1,
          order: 1024,
          createdAt: now,
        });
        ids.push(comboId);
      }
      return ids;
    });
  }

  const combosOf = (t: T, componentId: Id<"menuArticles">) =>
    t.run(async (ctx) =>
      ctx.db
        .query("menuComboComponents")
        .withIndex("by_componentArticleId", (q) => q.eq("componentArticleId", componentId))
        .collect(),
    );

  /** What a refused write must leave alone. */
  async function state(t: T, w: MenuWorldSeed) {
    return await t.run(async (ctx) => ({
      draft: await ctx.db
        .query("menuDraftState")
        .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", w.a.menuServiceId))
        .unique(),
      articles: (
        await ctx.db
          .query("menuArticles")
          .withIndex("by_menuServiceId_and_key", (q) => q.eq("menuServiceId", w.a.menuServiceId))
          .collect()
      ).length,
      components: (
        await ctx.db
          .query("menuComboComponents")
          .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", w.a.menuServiceId))
          .collect()
      ).length,
    }));
  }

  const createFor = (t: T, w: MenuWorldSeed, f: Fixture, name: string, articleIds: Id<"menuArticles">[]) =>
    as(t, w.ownerId).mutation(C.createCombo, {
      sectionId: f.sectionId,
      name,
      components: articleIds.map((articleId) => ({ articleId, quantity: 1 })),
    });

  test("[A5] the limit is 200 and createCombo takes an article into the 200th combo but refuses the 201st", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    expect(LIMIT).toBe(200);
    await fillCombos(t, w, f.friesId, LIMIT - 1);
    expect(await combosOf(t, f.friesId)).toHaveLength(LIMIT - 1);

    // The 200th combo is fine ...
    const last = await createFor(t, w, f, "Poslednji kombo", [f.friesId]);
    expect(await combosOf(t, f.friesId)).toHaveLength(LIMIT);

    // ... the 201st is refused, whatever else it holds, and nothing is written.
    const before = await state(t, w);
    await expectCode(createFor(t, w, f, "Kombo 201", [f.friesId]), MENU_ERROR.limitReached);
    await expectCode(createFor(t, w, f, "Kombo 201", [f.burgerId, f.friesId]), MENU_ERROR.limitReached);
    expect(await state(t, w)).toEqual(before);
    expect(await combosOf(t, f.friesId)).toHaveLength(LIMIT);

    // An article that is in few combos is not affected by its busy neighbour.
    const other = await createFor(t, w, f, "Burger meni", [f.burgerId, f.juiceId]);
    expect(await combosOf(t, f.burgerId)).toHaveLength(1);
    expect(other.articleId).not.toBe(last.articleId);
  });

  test("[A5] setComboComponents: an article new to the combo is refused at the limit; one the combo already has may stay, change quantity or leave, and then fits again", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const [member] = await fillCombos(t, w, f.friesId, LIMIT);
    expect(await combosOf(t, f.friesId)).toHaveLength(LIMIT);
    const owner = as(t, w.ownerId);
    const plain = await createFor(t, w, f, "Burger meni", [f.burgerId]);

    // Adding it to a combo that does not have it yet: refused, both as an extra and as the only component.
    const before = await state(t, w);
    await expectCode(
      owner.mutation(C.setComboComponents, {
        comboArticleId: plain.articleId,
        components: [
          { articleId: f.burgerId, quantity: 1 },
          { articleId: f.friesId, quantity: 1 },
        ],
      }),
      MENU_ERROR.limitReached,
    );
    await expectCode(
      owner.mutation(C.setComboComponents, {
        comboArticleId: plain.articleId,
        components: [{ articleId: f.friesId, quantity: 1 }],
      }),
      MENU_ERROR.limitReached,
    );
    expect(await state(t, w)).toEqual(before);

    // A combo that already has it keeps it: another quantity and another neighbour are not "new".
    expect(
      await owner.mutation(C.setComboComponents, {
        comboArticleId: member,
        components: [
          { articleId: f.friesId, quantity: 2 },
          { articleId: f.juiceId, quantity: 1 },
        ],
      }),
    ).toEqual({ ok: true });
    expect(await combosOf(t, f.friesId)).toHaveLength(LIMIT);

    // It leaves one combo: 199, so the other combo can take it now (and only that one).
    expect(
      await owner.mutation(C.setComboComponents, {
        comboArticleId: member,
        components: [{ articleId: f.juiceId, quantity: 1 }],
      }),
    ).toEqual({ ok: true });
    expect(await combosOf(t, f.friesId)).toHaveLength(LIMIT - 1);
    expect(
      await owner.mutation(C.setComboComponents, {
        comboArticleId: plain.articleId,
        components: [
          { articleId: f.burgerId, quantity: 1 },
          { articleId: f.friesId, quantity: 1 },
        ],
      }),
    ).toEqual({ ok: true });
    expect(await combosOf(t, f.friesId)).toHaveLength(LIMIT);
    await expectCode(
      owner.mutation(C.setComboComponents, {
        comboArticleId: member,
        components: [{ articleId: f.friesId, quantity: 1 }],
      }),
      MENU_ERROR.limitReached,
    );
  });

  test("[A5] with the article in 200 combos, a price change flags every one of them (nothing is left without the flag)", async () => {
    const { t, w } = await setup();
    const f = await fixture(t, w);
    const combos = await fillCombos(t, w, f.friesId, LIMIT - 1);
    combos.push((await createFor(t, w, f, "Poslednji kombo", [f.friesId])).articleId);
    expect(await combosOf(t, f.friesId)).toHaveLength(LIMIT);

    await as(t, w.ownerId).mutation(api.menuCatalog.setBasePrice, {
      articleId: f.friesId,
      expectedPriceRsd: 250,
      priceRsd: 280,
    });

    const flagged = await t.run(async (ctx) => {
      const rows = await Promise.all(combos.map((id) => ctx.db.get(id)));
      return rows.filter((row) => row?.priceCheck?.changedComponentKeys.includes(f.friesKey)).length;
    });
    expect(flagged).toBe(LIMIT);
  });
});
