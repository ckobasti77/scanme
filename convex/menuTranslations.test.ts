/// <reference types="vite/client" />

// ScanMe Menu V1 — K16: translations in the editor (convex/menuTranslations.ts).
// Proven here: the status read (plan limit, AI availability), the Standard
// limit of two languages, typed translations (confirmed at once, draft only,
// compare-and-set, stale by hash, reviewed), the AI suggestion (Premium AND a
// key; never published before the owner confirms it), roles, tenant isolation
// and the view of a page / Room service. `fetch` is a stub in EVERY test: no
// request ever leaves the process. All data below is invented.

import { convexTest } from "convex-test";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { MENU_AI_DEFAULT_MODEL } from "./lib/menuAiTranslate";
import { MENU_MAX_LANGUAGES } from "../lib/menu/capabilities";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { TRANSLATION_ERROR } from "../lib/menu/errors/translation";
import { fieldTranslation, sourceHash, type MenuTranslations } from "../lib/menu/translation-status";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  grantAccountPremium,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;
type Kind = "page" | "section" | "article" | "variant" | "addonGroup" | "addonOption" | "roomServiceCategory";
type Field = "name" | "description" | "publicTitle";

const AI_KEY = "test-key-not-a-secret";
const ENV_NAMES = ["MENU_AI_TRANSLATE_KEY", "MENU_AI_TRANSLATE_MODEL", "SCANME_ADMIN_EMAILS"] as const;

let saved: Record<string, string | undefined>;
let fetchMock: ReturnType<typeof stubNever>;

type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function stubNever() {
  const mock = vi.fn<FetchFn>(async () => {
    throw new Error("the network must not be touched");
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** A stubbed Anthropic answer. */
function stubAi(body: unknown, status = 200) {
  const mock = vi.fn<FetchFn>(async () => {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", mock);
  fetchMock = mock;
  return mock;
}

const answer = (text: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

beforeEach(() => {
  saved = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));
  delete process.env.MENU_AI_TRANSLATE_KEY;
  delete process.env.MENU_AI_TRANSLATE_MODEL;
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  fetchMock = stubNever();
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const name of ENV_NAMES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

// -----------------------------------------------------------------------------
// Error helpers
// -----------------------------------------------------------------------------

const CODE_PATTERN = /\b(?:menu|plan|translation)\/[a-z_]+/;

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

// -----------------------------------------------------------------------------
// World: tenant A sells Ćevapi (with a variant) in "Roštilj"; tenant B has its own.
// -----------------------------------------------------------------------------

async function premium(t: T, accountId: Id<"accounts">) {
  await t.run(async (ctx) => {
    await grantAccountPremium(ctx, { accountId, via: "plan" });
  });
}

/** Premium is gone again (a plan Premium that ended or was withdrawn). */
async function downgrade(t: T, accountId: Id<"accounts">) {
  await t.run(async (ctx) => {
    await ctx.db.patch(accountId, { plan: "basic", updatedAt: Date.now() });
  });
}

async function setLanguages(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">, translations: string[]) {
  return await as(t, userId).mutation(api.menuSettings.setLanguages, { menuServiceId, translations });
}

async function setup(options: { premium?: boolean; languages?: string[] } = {}) {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  if (options.premium) await premium(t, w.a.accountId);
  const owner = as(t, w.ownerId);
  const grill = await owner.mutation(api.menuCatalog.addSection, { pageId: w.a.defaultPageId, name: "Roštilj" });
  const created = await owner.mutation(api.menuCatalog.quickAddArticle, {
    sectionId: grill.sectionId,
    name: "Ćevapi",
    priceRsd: 650,
  });
  if (created.status !== "created") throw new Error(`expected created, got ${created.status}`);
  const variant = await owner.mutation(api.menuArticleOptions.addVariant, {
    articleId: created.articleId,
    name: "Velika porcija",
    priceRsd: 900,
  });
  const pasta = await as(t, w.otherOwnerId).mutation(api.menuCatalog.addSection, {
    pageId: w.b.defaultPageId,
    name: "Pasta",
  });
  const foreign = await as(t, w.otherOwnerId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId: pasta.sectionId,
    name: "Špageti",
    priceRsd: 700,
  });
  if (foreign.status !== "created") throw new Error(`expected created, got ${foreign.status}`);
  const foreignVariant = await as(t, w.otherOwnerId).mutation(api.menuArticleOptions.addVariant, {
    articleId: foreign.articleId,
    name: "Velika",
  });
  if (options.languages) await setLanguages(t, w.ownerId, w.a.menuServiceId, options.languages);
  return {
    t,
    w,
    sectionId: grill.sectionId,
    articleId: created.articleId,
    articleKey: created.key,
    variantId: variant.variantId,
    foreign: {
      sectionId: pasta.sectionId,
      articleId: foreign.articleId,
      variantId: foreignVariant.variantId,
    },
  };
}

function setTr(
  t: T,
  userId: Id<"users"> | null,
  input: { kind: Kind; id: string; lang?: string; field?: Field; expected?: string | null; value: string | null },
) {
  const actor = userId ? as(t, userId) : t;
  return actor.mutation(api.menuTranslations.setTranslation, {
    kind: input.kind,
    id: input.id,
    lang: input.lang ?? "en",
    field: input.field ?? "name",
    expected: input.expected ?? null,
    value: input.value,
  });
}

function suggest(t: T, userId: Id<"users">, kind: Kind, id: string, lang = "en") {
  return as(t, userId).action(api.menuTranslations.suggest, { kind, id, lang });
}

async function articleDoc(t: T, articleId: Id<"menuArticles">) {
  const doc = await t.run(async (ctx) => ctx.db.get(articleId));
  if (!doc) throw new Error("article missing");
  return doc;
}

async function translationsOf(t: T, articleId: Id<"menuArticles">): Promise<MenuTranslations | undefined> {
  return (await articleDoc(t, articleId)).translations as MenuTranslations | undefined;
}

async function revisionOf(t: T, menuServiceId: Id<"menuServices">) {
  const state = await t.run(async (ctx) =>
    ctx.db
      .query("menuDraftState")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuServiceId))
      .unique(),
  );
  if (!state) throw new Error("draft state missing");
  return state.revision;
}

async function draftState(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const status = await as(t, userId).query(api.menuPublishing.draftStatus, { menuServiceId });
  if (!status) throw new Error("draftStatus returned null");
  return status.state;
}

async function previewOf(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const preview = await as(t, userId).query(api.menuPublishing.publishPreview, { menuServiceId });
  if (!preview) throw new Error("publishPreview returned null");
  return preview;
}

async function publishNow(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const preview = await previewOf(t, userId, menuServiceId);
  const result = await as(t, userId).mutation(api.menuPublishing.publish, {
    menuServiceId,
    expectedRevision: preview.revision,
    acknowledgedWarnings: preview.fingerprint,
  });
  if (!result.ok) throw new Error(`publish refused: ${JSON.stringify(result)}`);
  return result;
}

/** What a guest reads on the (only) public page in `lang`. */
async function guest(t: T, lang?: string) {
  const result = await t.query(api.menuPublic.page, { slug: SLUG_A, ...(lang ? { lang } : {}) });
  if (!result || result.kind !== "page") throw new Error(`no public page for ${lang ?? "default"}`);
  return {
    sections: result.sections.map((section) => section.name),
    articles: result.sections.flatMap((section) => section.articles.map((article) => article.name)),
  };
}

const ALLOWED = ["ownerId", "managerId", "editorId", "adminId"] as const;
const REFUSED = ["financeId", "viewOnlyId", "outsiderId", "otherOwnerId"] as const;

// =============================================================================
// status
// =============================================================================

describe("menuTranslations.status", () => {
  test("Standard: two languages at most, the AI suggestion needs Premium", async () => {
    const { t, w } = await setup();
    expect(await as(t, w.ownerId).query(api.menuTranslations.status, { menuServiceId: w.a.menuServiceId })).toEqual({
      source: "sr",
      translations: [],
      overLimit: [],
      maxLanguages: 2,
      ai: { available: false, reason: "premium" },
    });
  });

  test("Standard stays 'premium' even with a key configured", async () => {
    const { t, w } = await setup();
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const status = await as(t, w.ownerId).query(api.menuTranslations.status, { menuServiceId: w.a.menuServiceId });
    expect(status?.ai).toEqual({ available: false, reason: "premium" });
  });

  test("Premium without a key: reason 'key'; a blank key is no key", async () => {
    const { t, w } = await setup({ premium: true });
    const owner = as(t, w.ownerId);
    const status = await owner.query(api.menuTranslations.status, { menuServiceId: w.a.menuServiceId });
    expect(status).toMatchObject({ maxLanguages: MENU_MAX_LANGUAGES, ai: { available: false, reason: "key" } });
    process.env.MENU_AI_TRANSLATE_KEY = "   ";
    expect((await owner.query(api.menuTranslations.status, { menuServiceId: w.a.menuServiceId }))?.ai).toEqual({
      available: false,
      reason: "key",
    });
  });

  test("Premium with MENU_AI_TRANSLATE_KEY: available", async () => {
    const { t, w } = await setup({ premium: true });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const status = await as(t, w.ownerId).query(api.menuTranslations.status, { menuServiceId: w.a.menuServiceId });
    expect(status?.ai).toEqual({ available: true, reason: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("lists the Settings languages in order; after Premium is lost the ones above the limit are overLimit", async () => {
    const { t, w } = await setup({ premium: true, languages: ["en", "de", "fr"] });
    const owner = as(t, w.ownerId);
    const id = w.a.menuServiceId;
    expect(await owner.query(api.menuTranslations.status, { menuServiceId: id })).toMatchObject({
      translations: ["en", "de", "fr"],
      overLimit: [],
    });
    await downgrade(t, w.a.accountId);
    expect(await owner.query(api.menuTranslations.status, { menuServiceId: id })).toMatchObject({
      maxLanguages: 2,
      translations: ["en"],
      overLimit: ["de", "fr"],
      ai: { available: false, reason: "premium" },
    });
  });

  test("owner, manager, editor and admin read it; finance, view-only, an outsider, another venue's owner and anonymous get null", async () => {
    const { t, w } = await setup();
    for (const key of ALLOWED) {
      expect(await as(t, w[key]).query(api.menuTranslations.status, { menuServiceId: w.a.menuServiceId })).not.toBeNull();
    }
    for (const key of REFUSED) {
      expect(await as(t, w[key]).query(api.menuTranslations.status, { menuServiceId: w.a.menuServiceId })).toBeNull();
    }
    expect(await t.query(api.menuTranslations.status, { menuServiceId: w.a.menuServiceId })).toBeNull();
  });
});

// =============================================================================
// The Standard limit of two languages
// =============================================================================

describe("the language limit", () => {
  test("Standard: two translations are refused (plan/language_limit), one is accepted", async () => {
    const { t, w } = await setup();
    const id = w.a.menuServiceId;
    await expectCode(setLanguages(t, w.ownerId, id, ["en", "de"]), MENU_PLAN_ERROR.languageLimit);
    expect(MENU_PLAN_ERROR.languageLimit).toBe("plan/language_limit");
    expect(await setLanguages(t, w.ownerId, id, ["en"])).toEqual({ ok: true });
    const languages = await as(t, w.ownerId).query(api.menuSettings.languages, { menuServiceId: id });
    expect(languages).toMatchObject({ source: "sr", translations: ["en"], maxLanguages: 2 });
  });

  test("a language that is not in Settings: translation/language_off (also the source language)", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    await expectCode(setTr(t, w.ownerId, { kind: "article", id: articleId, lang: "de", value: "Cevapi" }), TRANSLATION_ERROR.languageOff);
    await expectCode(setTr(t, w.ownerId, { kind: "article", id: articleId, lang: "sr", value: "Ćevapi" }), "translation/language_off");
    expect(await translationsOf(t, articleId)).toBeUndefined();
    await expectCode(
      as(t, w.ownerId).mutation(api.menuTranslations.markReviewed, { kind: "article", id: articleId, lang: "de" }),
      TRANSLATION_ERROR.languageOff,
    );
    await expectCode(
      as(t, w.ownerId).mutation(api.menuTranslations.confirmSuggestion, { kind: "article", id: articleId, lang: "de" }),
      TRANSLATION_ERROR.languageOff,
    );
  });

  test("Premium lost: a language above the limit is plan/language_limit, the one inside still works", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en", "de"] });
    await downgrade(t, w.a.accountId);
    await expectCode(setTr(t, w.ownerId, { kind: "article", id: articleId, lang: "de", value: "Cevapi" }), MENU_PLAN_ERROR.languageLimit);
    await expectCode(
      as(t, w.ownerId).mutation(api.menuTranslations.markReviewed, { kind: "article", id: articleId, lang: "de" }),
      "plan/language_limit",
    );
    expect(await setTr(t, w.ownerId, { kind: "article", id: articleId, lang: "en", value: "Cevapi" })).toEqual({ ok: true });
    expect(await translationsOf(t, articleId)).toMatchObject({ en: { status: "confirmed", name: "Cevapi" } });
  });

  test("Premium lost: the suggestion is refused as a Premium feature, with no network call", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    await downgrade(t, w.a.accountId);
    await expectCode(suggest(t, w.ownerId, "article", articleId), MENU_PLAN_ERROR.premiumRequired);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// =============================================================================
// setTranslation
// =============================================================================

describe("menuTranslations.setTranslation", () => {
  test("writes a confirmed text with the hash of the source name", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    expect(await setTr(t, w.ownerId, { kind: "article", id: articleId, value: "  Cevapi  grill " })).toEqual({ ok: true });
    expect(await translationsOf(t, articleId)).toEqual({
      en: { status: "confirmed", name: "Cevapi grill", nameHash: sourceHash("Ćevapi") },
    });
    const doc = await articleDoc(t, articleId);
    expect(doc.name).toBe("Ćevapi");
  });

  test("goes into the draft only: the public menu changes with the next publish", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    const id = w.a.menuServiceId;
    await publishNow(t, w.ownerId, id);
    expect(await draftState(t, w.ownerId, id)).toBe("clean");
    const enBefore = await guest(t, "en");
    expect(enBefore.articles).toEqual(["Ćevapi"]);
    const srBefore = await guest(t);

    const revision = await revisionOf(t, id);
    await setTr(t, w.ownerId, { kind: "article", id: articleId, value: "Cevapi grill" });
    expect(await revisionOf(t, id)).toBe(revision + 1);
    expect(await draftState(t, w.ownerId, id)).toBe("dirty");
    expect(await guest(t, "en")).toEqual(enBefore);
    expect(await guest(t)).toEqual(srBefore);

    await publishNow(t, w.ownerId, id);
    expect(await draftState(t, w.ownerId, id)).toBe("clean");
    expect((await guest(t, "en")).articles).toEqual(["Cevapi grill"]);
    expect(await guest(t)).toEqual(srBefore);
  });

  test("a no-op write (same text) does not touch the draft", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    await setTr(t, w.ownerId, { kind: "article", id: articleId, value: "Cevapi grill" });
    const revision = await revisionOf(t, w.a.menuServiceId);
    expect(await setTr(t, w.ownerId, { kind: "article", id: articleId, expected: "Cevapi grill", value: "Cevapi grill" })).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revision);
  });

  test("compare-and-set: a stale 'expected' returns the conflict with the current and the attempted text, writes nothing", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    await setTr(t, w.ownerId, { kind: "article", id: articleId, value: "Cevapi" });
    const revision = await revisionOf(t, w.a.menuServiceId);

    const conflict = await setTr(t, w.managerId, { kind: "article", id: articleId, expected: null, value: "Grilled meat" });
    expect(conflict).toEqual({
      ok: false,
      conflicts: ["translation"],
      current: { translation: "Cevapi" },
      attempted: { translation: "Grilled meat" },
    });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revision);
    expect((await translationsOf(t, articleId))?.en.name).toBe("Cevapi");

    // The editor retries with what it sees now.
    expect(await setTr(t, w.managerId, { kind: "article", id: articleId, expected: "Cevapi", value: "Grilled meat" })).toEqual({ ok: true });
    expect((await translationsOf(t, articleId))?.en.name).toBe("Grilled meat");
  });

  test("null clears the text; an entry with nothing left is removed", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    await setTr(t, w.ownerId, { kind: "article", id: articleId, value: "Cevapi" });
    expect(await setTr(t, w.ownerId, { kind: "article", id: articleId, expected: "Cevapi", value: null })).toEqual({ ok: true });
    expect(await translationsOf(t, articleId)).toBeUndefined();
  });

  test("a field that does not belong to the kind is menu/invalid_input", async () => {
    const { t, w, articleId, sectionId, variantId } = await setup({ languages: ["en"] });
    await expectCode(setTr(t, w.ownerId, { kind: "article", id: articleId, field: "publicTitle", value: "Naslov" }), MENU_ERROR.invalidInput);
    await expectCode(setTr(t, w.ownerId, { kind: "section", id: sectionId, field: "publicTitle", value: "Naslov" }), "menu/invalid_input");
    await expectCode(setTr(t, w.ownerId, { kind: "variant", id: variantId, field: "description", value: "Opis" }), "menu/invalid_input");
    await expectCode(setTr(t, w.ownerId, { kind: "page", id: w.a.defaultPageId, field: "name", value: "Meni" }), "menu/invalid_input");
    expect(await translationsOf(t, articleId)).toBeUndefined();
  });

  test("longer than the source field may be (120 for an article name) is menu/invalid_input; exactly 120 is fine", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    await expectCode(setTr(t, w.ownerId, { kind: "article", id: articleId, value: "x".repeat(121) }), MENU_ERROR.invalidInput);
    expect(await translationsOf(t, articleId)).toBeUndefined();
    expect(await setTr(t, w.ownerId, { kind: "article", id: articleId, value: "x".repeat(120) })).toEqual({ ok: true });
    // The description of an article may be 600 characters.
    await as(t, w.ownerId).mutation(api.menuCatalog.updateArticleFields, {
      articleId,
      expected: { description: null },
      patch: { description: "Domaći ćevapi" },
    });
    await expectCode(setTr(t, w.ownerId, { kind: "article", id: articleId, field: "description", value: "y".repeat(601) }), "menu/invalid_input");
  });

  test("a source field that is empty has nothing to translate", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    await expectCode(
      setTr(t, w.ownerId, { kind: "article", id: articleId, field: "description", value: "Grilled" }),
      TRANSLATION_ERROR.nothingToTranslate,
    );
    await expectCode(setTr(t, w.ownerId, { kind: "page", id: w.a.defaultPageId, field: "publicTitle", value: "Our menu" }), "translation/nothing_to_translate");
  });

  test("a changed source makes the translation stale (hash); markReviewed makes it done again", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    await setTr(t, w.ownerId, { kind: "article", id: articleId, value: "Cevapi" });
    const entry = async () => (await translationsOf(t, articleId))?.en;
    expect(fieldTranslation((await articleDoc(t, articleId)).name, await entry(), "name").status).toBe("done");

    await as(t, w.ownerId).mutation(api.menuCatalog.updateArticleFields, {
      articleId,
      expected: { name: "Ćevapi" },
      patch: { name: "Ćevapi sa lukom" },
    });
    const source = (await articleDoc(t, articleId)).name;
    expect(source).toBe("Ćevapi sa lukom");
    expect(fieldTranslation(source, await entry(), "name")).toMatchObject({ status: "stale", confirmed: "Cevapi" });

    expect(await as(t, w.ownerId).mutation(api.menuTranslations.markReviewed, { kind: "article", id: articleId, lang: "en" })).toEqual({ ok: true });
    expect(await entry()).toMatchObject({ name: "Cevapi", nameHash: sourceHash("Ćevapi sa lukom") });
    expect(fieldTranslation(source, await entry(), "name").status).toBe("done");
  });

  test("markReviewed on an entry that holds only a suggestion changes nothing", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    stubAi(answer('{"name":"Grilled meat"}'));
    await suggest(t, w.ownerId, "article", articleId);
    const before = await translationsOf(t, articleId);
    expect(await as(t, w.ownerId).mutation(api.menuTranslations.markReviewed, { kind: "article", id: articleId, lang: "en" })).toEqual({ ok: true });
    expect(await translationsOf(t, articleId)).toEqual(before);
  });

  test("owner, manager, editor and admin may write; finance, view-only, an outsider, another venue's owner and anonymous get a refusal (anonymous: menu/unauthenticated)", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    let current: string | null = null;
    for (const [index, key] of ALLOWED.entries()) {
      const value = `Cevapi ${index}`;
      expect(await setTr(t, w[key], { kind: "article", id: articleId, expected: current, value })).toEqual({ ok: true });
      current = value;
    }
    const before = await translationsOf(t, articleId);
    for (const key of REFUSED) {
      await expectCode(setTr(t, w[key], { kind: "article", id: articleId, expected: current, value: "Hacked" }), MENU_ERROR.notFound);
    }
    await expectCode(setTr(t, null, { kind: "article", id: articleId, expected: current, value: "Hacked" }), "menu/unauthenticated");
    expect(await translationsOf(t, articleId)).toEqual(before);
  });

  test("a refused write leaves the draft revision alone", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    const revision = await revisionOf(t, w.a.menuServiceId);
    await codeOf(setTr(t, w.financeId, { kind: "article", id: articleId, value: "Nope" }));
    await codeOf(setTr(t, w.ownerId, { kind: "article", id: articleId, lang: "de", value: "Nope" }));
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revision);
  });
});

// =============================================================================
// Tenant isolation
// =============================================================================

describe("tenant isolation", () => {
  test("an id of another venue, with the identity of this venue's owner, is menu/not_found for every mutation", async () => {
    const { t, w, foreign } = await setup({ premium: true, languages: ["en"] });
    // The other venue has the same languages, so only the tenant check can refuse.
    await premium(t, w.b.accountId);
    await setLanguages(t, w.otherOwnerId, w.b.menuServiceId, ["en"]);
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const owner = as(t, w.ownerId);
    const cases: { kind: Kind; id: string }[] = [
      { kind: "article", id: foreign.articleId },
      { kind: "section", id: foreign.sectionId },
      { kind: "variant", id: foreign.variantId },
      { kind: "page", id: w.b.defaultPageId },
    ];
    for (const { kind, id } of cases) {
      await expectCode(setTr(t, w.ownerId, { kind, id, value: "Hacked" }), MENU_ERROR.notFound);
      await expectCode(owner.mutation(api.menuTranslations.confirmSuggestion, { kind, id, lang: "en" }), "menu/not_found");
      await expectCode(owner.mutation(api.menuTranslations.dropSuggestion, { kind, id, lang: "en" }), "menu/not_found");
      await expectCode(owner.mutation(api.menuTranslations.markReviewed, { kind, id, lang: "en" }), "menu/not_found");
      await expectCode(suggest(t, w.ownerId, kind, id), "menu/not_found");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    const stored = await t.run(async (ctx) => ({
      article: (await ctx.db.get(foreign.articleId))?.translations,
      section: (await ctx.db.get(foreign.sectionId))?.translations,
      variant: (await ctx.db.get(foreign.variantId))?.translations,
    }));
    expect(stored).toEqual({ article: undefined, section: undefined, variant: undefined });
  });

  test("a garbage id, an empty id and an id of another table are menu/not_found", async () => {
    const { t, w, sectionId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const owner = as(t, w.ownerId);
    for (const id of ["not-an-id", "", "k57abc", sectionId]) {
      await expectCode(setTr(t, w.ownerId, { kind: "article", id, value: "x" }), MENU_ERROR.notFound);
      await expectCode(owner.mutation(api.menuTranslations.confirmSuggestion, { kind: "article", id, lang: "en" }), "menu/not_found");
      await expectCode(owner.mutation(api.menuTranslations.dropSuggestion, { kind: "article", id, lang: "en" }), "menu/not_found");
      await expectCode(owner.mutation(api.menuTranslations.markReviewed, { kind: "article", id, lang: "en" }), "menu/not_found");
      await expectCode(suggest(t, w.ownerId, "article", id), "menu/not_found");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("the other venue's owner can translate their own article but not ours", async () => {
    const { t, w, articleId, foreign } = await setup({ languages: ["en"] });
    await setLanguages(t, w.otherOwnerId, w.b.menuServiceId, ["en"]);
    expect(await setTr(t, w.otherOwnerId, { kind: "article", id: foreign.articleId, value: "Spaghetti" })).toEqual({ ok: true });
    await expectCode(setTr(t, w.otherOwnerId, { kind: "article", id: articleId, value: "Hacked" }), MENU_ERROR.notFound);
    expect(await translationsOf(t, articleId)).toBeUndefined();
  });
});

// =============================================================================
// The AI suggestion
// =============================================================================

describe("menuTranslations.suggest", () => {
  test("a) Standard: plan/premium_required and no network call (even with a key)", async () => {
    const { t, w, articleId } = await setup({ languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    await expectCode(suggest(t, w.ownerId, "article", articleId), MENU_PLAN_ERROR.premiumRequired);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await translationsOf(t, articleId)).toBeUndefined();
  });

  test("b) Premium without MENU_AI_TRANSLATE_KEY: translation/ai_disabled and no network call", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    await expectCode(suggest(t, w.ownerId, "article", articleId), TRANSLATION_ERROR.aiDisabled);
    process.env.MENU_AI_TRANSLATE_KEY = "  ";
    await expectCode(suggest(t, w.ownerId, "article", articleId), "translation/ai_disabled");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await translationsOf(t, articleId)).toBeUndefined();
  });

  test("c) is stored next to nothing, is never published before it is confirmed, and is published after", async () => {
    const { t, w, articleId, articleKey } = await setup({ premium: true, languages: ["en"] });
    const id = w.a.menuServiceId;
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    stubAi(answer('{"name":"Grilled meat"}'));

    expect(await suggest(t, w.ownerId, "article", articleId)).toEqual({ fields: 1 });
    const stored = await translationsOf(t, articleId);
    expect(stored?.en.status).toBe("suggested");
    expect(stored?.en.name).toBeUndefined();
    expect(stored?.en.suggestion).toMatchObject({ name: "Grilled meat", nameHash: sourceHash("Ćevapi") });
    expect(fieldTranslation("Ćevapi", stored?.en, "name")).toEqual({ status: "suggested", confirmed: null, suggestion: "Grilled meat" });

    // Published as it is: the English page still shows the SERBIAN name, and the warning still counts it.
    const preview = await previewOf(t, w.ownerId, id);
    const missing = preview.warnings.find((warning) => warning.code === "translation_missing" && warning.lang === "en");
    expect(missing?.entityKeys).toContain(articleKey);
    await publishNow(t, w.ownerId, id);
    expect((await guest(t, "en")).articles).toEqual(["Ćevapi"]);

    // Confirmed by the owner: only now it is the translation.
    expect(await as(t, w.ownerId).mutation(api.menuTranslations.confirmSuggestion, { kind: "article", id: articleId, lang: "en" })).toEqual({ ok: true });
    expect(await translationsOf(t, articleId)).toEqual({
      en: { status: "confirmed", name: "Grilled meat", nameHash: sourceHash("Ćevapi") },
    });
    expect(await draftState(t, w.ownerId, id)).toBe("dirty");
    expect((await guest(t, "en")).articles).toEqual(["Ćevapi"]);
    const after = await previewOf(t, w.ownerId, id);
    const stillMissing = after.warnings.find((warning) => warning.code === "translation_missing" && warning.lang === "en");
    expect(stillMissing?.entityKeys ?? []).not.toContain(articleKey);
    await publishNow(t, w.ownerId, id);
    expect((await guest(t, "en")).articles).toEqual(["Grilled meat"]);
    expect((await guest(t)).articles).toEqual(["Ćevapi"]);
  });

  test("c) next to a confirmed text the suggestion changes nothing that is published; confirming with edits wins", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    const id = w.a.menuServiceId;
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    await setTr(t, w.ownerId, { kind: "article", id: articleId, value: "Cevapi" });
    await publishNow(t, w.ownerId, id);

    stubAi(answer('{"name":"Grilled meat"}'));
    await suggest(t, w.ownerId, "article", articleId);
    expect((await translationsOf(t, articleId))?.en).toMatchObject({
      status: "confirmed",
      name: "Cevapi",
      nameHash: sourceHash("Ćevapi"),
      suggestion: { name: "Grilled meat" },
    });
    // Nothing published changed: even after publishing, guests read the confirmed text.
    await publishNow(t, w.ownerId, id);
    expect((await guest(t, "en")).articles).toEqual(["Cevapi"]);

    await as(t, w.ownerId).mutation(api.menuTranslations.confirmSuggestion, {
      kind: "article",
      id: articleId,
      lang: "en",
      edited: { name: "Grilled cevapi" },
    });
    expect(await translationsOf(t, articleId)).toEqual({
      en: { status: "confirmed", name: "Grilled cevapi", nameHash: sourceHash("Ćevapi") },
    });
  });

  test("c) a field the model did not return gets no suggestion", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    await as(t, w.ownerId).mutation(api.menuCatalog.updateArticleFields, {
      articleId,
      expected: { description: null },
      patch: { description: "Domaći ćevapi sa lukom" },
    });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    stubAi(answer('Here you go: {"name":"Grilled meat","unknown":"x"} done'));
    expect(await suggest(t, w.ownerId, "article", articleId)).toEqual({ fields: 1 });
    const suggestion = (await translationsOf(t, articleId))?.en.suggestion;
    expect(suggestion?.name).toBe("Grilled meat");
    expect(suggestion?.description).toBeUndefined();
  });

  test("d) the request: Anthropic Messages URL, key and version headers, default model, the source text in the prompt", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const mock = stubAi(answer('{"name":"Grilled meat"}'));
    await suggest(t, w.ownerId, "article", articleId);

    expect(mock).toHaveBeenCalledTimes(1);
    const [url, init] = mock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(AI_KEY);
    expect(headers["anthropic-version"]).toBeTruthy();
    const body = JSON.parse(String(init?.body));
    expect(body.model).toBe("claude-opus-5-5");
    expect(MENU_AI_DEFAULT_MODEL).toBe("claude-opus-5-5");
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content).toContain("Ćevapi");
    expect(body.messages[0].content).toContain('"sr"');
    expect(body.messages[0].content).toContain('"en"');
  });

  test("d) MENU_AI_TRANSLATE_MODEL overrides the model (trimmed); blank falls back to the default", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    process.env.MENU_AI_TRANSLATE_MODEL = "  claude-test-model  ";
    const mock = stubAi(answer('{"name":"Grilled meat"}'));
    await suggest(t, w.ownerId, "article", articleId);
    expect(JSON.parse(String(mock.mock.calls[0][1]?.body)).model).toBe("claude-test-model");

    process.env.MENU_AI_TRANSLATE_MODEL = "   ";
    await suggest(t, w.ownerId, "article", articleId);
    expect(JSON.parse(String(mock.mock.calls[1][1]?.body)).model).toBe("claude-opus-5-5");
  });

  test("e) a 500, a refusal, text that is not JSON, JSON without the asked keys, a network error: translation/ai_failed and nothing stored", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const id = w.a.menuServiceId;
    const revision = await revisionOf(t, id);

    const failures: (() => void)[] = [
      () => stubAi({ error: { type: "api_error" } }, 500),
      () => stubAi({ stop_reason: "refusal", content: [{ type: "text", text: '{"name":"Grilled meat"}' }] }),
      () => stubAi(answer("Sorry, I cannot do that.")),
      () => stubAi(answer('{"description":"only a field nobody asked for"}')),
      () => stubAi(answer('{"name":"   "}')),
      () => stubAi({ stop_reason: "end_turn", content: [] }),
      () => stubAi(answer(`{"name":"${"x".repeat(121)}"}`)),
      () => {
        fetchMock = vi.fn<FetchFn>(async () => {
          throw new Error("offline");
        });
        vi.stubGlobal("fetch", fetchMock);
      },
    ];
    for (const arrange of failures) {
      arrange();
      await expectCode(suggest(t, w.ownerId, "article", articleId), TRANSLATION_ERROR.aiFailed);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await translationsOf(t, articleId)).toBeUndefined();
    }
    expect(await revisionOf(t, id)).toBe(revision);
  });

  test("f) dropSuggestion removes it and leaves the confirmed text; an entry with only a suggestion disappears", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    stubAi(answer('{"name":"Grilled meat"}'));
    const owner = as(t, w.ownerId);

    await suggest(t, w.ownerId, "article", articleId);
    expect(await owner.mutation(api.menuTranslations.dropSuggestion, { kind: "article", id: articleId, lang: "en" })).toEqual({ ok: true });
    expect(await translationsOf(t, articleId)).toBeUndefined();

    await setTr(t, w.ownerId, { kind: "article", id: articleId, value: "Cevapi" });
    const confirmed = await translationsOf(t, articleId);
    await suggest(t, w.ownerId, "article", articleId);
    expect((await translationsOf(t, articleId))?.en.suggestion).toBeDefined();
    await owner.mutation(api.menuTranslations.dropSuggestion, { kind: "article", id: articleId, lang: "en" });
    expect(await translationsOf(t, articleId)).toEqual(confirmed);

    // Dropping when there is nothing to drop is an ok no-op and does not touch the draft.
    const revision = await revisionOf(t, w.a.menuServiceId);
    expect(await owner.mutation(api.menuTranslations.dropSuggestion, { kind: "article", id: articleId, lang: "en" })).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revision);
  });

  test("confirmSuggestion without a suggestion is an ok no-op; bad edited fields are menu/invalid_input", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const owner = as(t, w.ownerId);
    const revision = await revisionOf(t, w.a.menuServiceId);
    expect(await owner.mutation(api.menuTranslations.confirmSuggestion, { kind: "article", id: articleId, lang: "en" })).toEqual({ ok: true });
    expect(await revisionOf(t, w.a.menuServiceId)).toBe(revision);

    stubAi(answer('{"name":"Grilled meat"}'));
    await suggest(t, w.ownerId, "article", articleId);
    await expectCode(
      owner.mutation(api.menuTranslations.confirmSuggestion, { kind: "article", id: articleId, lang: "en", edited: { publicTitle: "Title" } }),
      MENU_ERROR.invalidInput,
    );
    await expectCode(
      owner.mutation(api.menuTranslations.confirmSuggestion, { kind: "article", id: articleId, lang: "en", edited: { name: "x".repeat(121) } }),
      "menu/invalid_input",
    );
    expect((await translationsOf(t, articleId))?.en.status).toBe("suggested");
  });

  test("g) owner, manager, editor and admin may ask for a suggestion", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const mock = stubAi(answer('{"name":"Grilled meat"}'));
    for (const key of ALLOWED) {
      expect(await suggest(t, w[key], "article", articleId)).toEqual({ fields: 1 });
    }
    expect(mock).toHaveBeenCalledTimes(ALLOWED.length);
  });

  test("g) finance, view-only, an outsider and another venue's owner get menu/not_found; no network call", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const mock = stubAi(answer('{"name":"Grilled meat"}'));
    for (const key of REFUSED) {
      await expectCode(suggest(t, w[key], "article", articleId), MENU_ERROR.notFound);
    }
    expect(mock).not.toHaveBeenCalled();
    expect(await translationsOf(t, articleId)).toBeUndefined();
  });

  test("a language outside Settings is translation/language_off, no network call", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    await expectCode(suggest(t, w.ownerId, "article", articleId, "de"), TRANSLATION_ERROR.languageOff);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("nothing to translate (a page without a public title): translation/nothing_to_translate, no network call", async () => {
    const { t, w } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const page = await t.run(async (ctx) => ctx.db.get(w.a.defaultPageId));
    expect(page?.publicTitle).toBeUndefined();
    await expectCode(suggest(t, w.ownerId, "page", w.a.defaultPageId), TRANSLATION_ERROR.nothingToTranslate);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a source that changed while the model answered: translation/source_changed, nothing stored", async () => {
    const { t, w, articleId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    fetchMock = vi.fn<FetchFn>(async () => {
      await as(t, w.managerId).mutation(api.menuCatalog.updateArticleFields, {
        articleId,
        expected: { name: "Ćevapi" },
        patch: { name: "Ćevapi sa lukom" },
      });
      return new Response(JSON.stringify(answer('{"name":"Grilled meat"}')), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expectCode(suggest(t, w.ownerId, "article", articleId), TRANSLATION_ERROR.sourceChanged);
    expect(await translationsOf(t, articleId)).toBeUndefined();
  });

  test("works for a variant (name only) and stores nothing for fields the kind does not have", async () => {
    const { t, w, variantId } = await setup({ premium: true, languages: ["en"] });
    process.env.MENU_AI_TRANSLATE_KEY = AI_KEY;
    const mock = stubAi(answer('{"name":"Large portion","description":"ignored"}'));
    expect(await suggest(t, w.ownerId, "variant", variantId)).toEqual({ fields: 1 });
    const prompt = JSON.parse(String(mock.mock.calls[0][1]?.body)).messages[0].content as string;
    expect(prompt).toContain("Velika porcija");
    const variant = await t.run(async (ctx) => ctx.db.get(variantId));
    expect((variant?.translations as MenuTranslations | undefined)?.en.suggestion).toMatchObject({ name: "Large portion" });
  });
});

// =============================================================================
// view
// =============================================================================

describe("menuTranslations.view", () => {
  async function pageWorld() {
    const world = await setup({ premium: true, languages: ["en"] });
    const { t, w, articleId } = world;
    await as(t, w.ownerId).mutation(api.menuArticleOptions.createAddonGroup, {
      articleId,
      name: "Prilozi",
      selection: "multiple",
      required: false,
      options: [{ name: "Kajmak", priceDeltaRsd: 80 }],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(w.a.defaultPageId, { publicTitle: "Naš meni" });
    });
    return world;
  }

  function viewPage(t: T, userId: Id<"users"> | null, menuServiceId: Id<"menuServices">, pageId: Id<"menuPages">) {
    const actor = userId ? as(t, userId) : t;
    return actor.query(api.menuTranslations.view, { menuServiceId, scope: { kind: "page", pageId } });
  }

  test("a page lists its title, sections, articles, variants and add-ons, each with a real id that setTranslation accepts", async () => {
    const { t, w, sectionId, articleId, variantId } = await pageWorld();
    const result = await viewPage(t, w.ownerId, w.a.menuServiceId, w.a.defaultPageId);
    expect(result).not.toBeNull();
    expect(result?.title).not.toBeNull();
    expect(result?.truncated).toBe(false);
    const items = result?.items ?? [];
    expect(items.map((item) => item.vrsta)).toEqual(["page", "section", "article", "variant", "addonGroup", "addonOption"]);
    const byKind = (kind: string) => items.find((item) => item.vrsta === kind);
    expect(byKind("page")).toMatchObject({ id: w.a.defaultPageId, izvor: { publicTitle: "Naš meni" }, prevodi: null });
    expect(byKind("section")).toMatchObject({ id: sectionId, izvor: { name: "Roštilj", description: null } });
    expect(byKind("article")).toMatchObject({ id: articleId, izvor: { name: "Ćevapi" } });
    expect(byKind("variant")).toMatchObject({ id: variantId, izvor: { name: "Velika porcija" }, pripada: "Ćevapi" });
    expect(byKind("addonGroup")?.izvor).toEqual({ name: "Prilozi" });
    expect(byKind("addonOption")).toMatchObject({ izvor: { name: "Kajmak" }, pripada: "Prilozi" });

    // Every id is addressable by setTranslation.
    for (const item of items) {
      for (const [field, source] of Object.entries(item.izvor)) {
        if (!source) continue;
        const result = await setTr(t, w.ownerId, {
          kind: item.vrsta,
          id: item.id,
          field: field as Field,
          value: `EN ${source}`,
        });
        expect(result).toEqual({ ok: true });
      }
    }
    const after = await viewPage(t, w.ownerId, w.a.menuServiceId, w.a.defaultPageId);
    for (const item of after?.items ?? []) {
      expect(item.prevodi?.en?.status).toBe("confirmed");
    }
  });

  test("Room service scope lists the Room service categories", async () => {
    const { t, w } = await setup({ premium: true, languages: ["en"] });
    const owner = as(t, w.ownerId);
    const empty = await owner.query(api.menuTranslations.view, { menuServiceId: w.a.menuServiceId, scope: { kind: "roomService" } });
    expect(empty).toEqual({ title: null, items: [], truncated: false });

    const first = await owner.mutation(api.menuRoomService.addCategory, { menuServiceId: w.a.menuServiceId, name: "Hrana u sobu" });
    await owner.mutation(api.menuRoomService.addCategory, { menuServiceId: w.a.menuServiceId, name: "Pića u sobu" });
    const listed = await owner.query(api.menuTranslations.view, { menuServiceId: w.a.menuServiceId, scope: { kind: "roomService" } });
    expect(listed?.items.map((item) => [item.vrsta, item.izvor.name])).toEqual([
      ["roomServiceCategory", "Hrana u sobu"],
      ["roomServiceCategory", "Pića u sobu"],
    ]);
    expect(listed?.items[0].id).toBe(first.categoryId);
    expect(await setTr(t, w.ownerId, { kind: "roomServiceCategory", id: first.categoryId, value: "Food to the room" })).toEqual({ ok: true });
    const again = await owner.query(api.menuTranslations.view, { menuServiceId: w.a.menuServiceId, scope: { kind: "roomService" } });
    expect(again?.items[0].prevodi?.en).toMatchObject({ status: "confirmed", name: "Food to the room" });
  });

  test("refusals are null: finance, view-only, an outsider, another venue's owner, anonymous", async () => {
    const { t, w } = await setup({ languages: ["en"] });
    for (const key of REFUSED) {
      expect(await viewPage(t, w[key], w.a.menuServiceId, w.a.defaultPageId)).toBeNull();
      expect(
        await as(t, w[key]).query(api.menuTranslations.view, { menuServiceId: w.a.menuServiceId, scope: { kind: "roomService" } }),
      ).toBeNull();
    }
    expect(await viewPage(t, null, w.a.menuServiceId, w.a.defaultPageId)).toBeNull();
    for (const key of ALLOWED) {
      expect(await viewPage(t, w[key], w.a.menuServiceId, w.a.defaultPageId)).not.toBeNull();
    }
  });

  test("another venue's pageId is null, also through the caller's own service and through the other venue's service", async () => {
    const { t, w } = await setup({ languages: ["en"] });
    expect(await viewPage(t, w.ownerId, w.a.menuServiceId, w.b.defaultPageId)).toBeNull();
    expect(await viewPage(t, w.ownerId, w.b.menuServiceId, w.b.defaultPageId)).toBeNull();
    expect(await viewPage(t, w.otherOwnerId, w.b.menuServiceId, w.a.defaultPageId)).toBeNull();
    expect(await viewPage(t, w.otherOwnerId, w.b.menuServiceId, w.b.defaultPageId)).not.toBeNull();
  });
});
