import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id, TableNames } from "./_generated/dataModel";
import { action, env, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { aiTranslate, aiTranslateConfig } from "./lib/menuAiTranslate";
import { getMenuAccess, requireMenuAccessToRow, type MenuAccess } from "./lib/menuAccess";
import { getMenuCapabilities, requireMenuCapability } from "./lib/menuCapabilities";
import { touchDraft } from "./lib/menuDraft";
import { loadDraft } from "./lib/menuDraftLoad";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_PLAN_ERROR } from "../lib/menu/errors/plan";
import { TRANSLATION_ERROR } from "../lib/menu/errors/translation";
import { publishedLanguages, type MenuDraftSnapshot } from "../lib/menu/snapshot";
import type { StudioPrevodVrsta } from "../lib/menu/studio/model";
import { granicaPrevoda, POLJA_PREVODA, prevodiRoomServicea, prevodiStranice } from "../lib/menu/studio/prevodi";
import {
  fieldTranslation,
  sourceHash,
  withConfirmedSuggestion,
  withReviewedTranslation,
  withSuggestion,
  withTypedTranslation,
  withoutSuggestion,
  type MenuTranslationField,
  type MenuTranslations,
} from "../lib/menu/translation-status";

// =============================================================================
// ScanMe Menu V1 — translations in the editor (K16; master §7.7, P7).
//
// Languages are managed in Settings (menuSettings.setLanguages); here the
// editor writes the translated TEXT of pages, sections, articles, variants,
// add-on groups and options, and Room service categories:
//   - typed text is confirmed at once and goes into the draft (Objavi
//     publishes it); compare-and-set on the confirmed text last seen;
//   - every confirmed field keeps the hash of its source text, so a later
//     change of the source marks it stale (lib/menu/translation-status.ts);
//   - the AI SUGGESTION (Premium AND a configured key) is stored next to the
//     confirmed text and is NEVER published until the owner confirms it.
// A language outside Settings is refused; one above the plan's limit (lost
// Premium) is refused as the plan limit. Access: reads "menu.read", writes
// "menu.edit" on the row's own Menu service (no cross-tenant oracle).
// =============================================================================

const kindValidator = v.union(
  v.literal("page"),
  v.literal("section"),
  v.literal("article"),
  v.literal("variant"),
  v.literal("addonGroup"),
  v.literal("addonOption"),
  v.literal("roomServiceCategory"),
);
const fieldValidator = v.union(v.literal("name"), v.literal("description"), v.literal("publicTitle"));
type Kind = Infer<typeof kindValidator>;

const TABLE: Record<Kind, TableNames> = {
  page: "menuPages",
  section: "menuSections",
  article: "menuArticles",
  variant: "menuVariants",
  addonGroup: "menuAddonGroups",
  addonOption: "menuAddonOptions",
  roomServiceCategory: "menuRoomServiceCategories",
};

type TranslatableDoc = {
  _id: Id<TableNames>;
  menuServiceId: Id<"menuServices">;
  name?: string;
  description?: string;
  publicTitle?: string;
  translations?: MenuTranslations;
};

type DbCtx = QueryCtx | MutationCtx;

async function loadRow(ctx: DbCtx, kind: Kind, id: string): Promise<TranslatableDoc> {
  const normalized = ctx.db.normalizeId(TABLE[kind], id);
  const row = normalized ? ((await ctx.db.get(normalized)) as TranslatableDoc | null) : null;
  if (!row) throw new ConvexError(MENU_ERROR.notFound);
  return row;
}

function sourcesOf(kind: Kind, row: TranslatableDoc): Partial<Record<MenuTranslationField, string | null>> {
  const out: Partial<Record<MenuTranslationField, string | null>> = {};
  for (const field of POLJA_PREVODA[kind]) out[field] = row[field] ?? null;
  return out;
}

/** null = allowed; else the refusal code (outside Settings, the source, or above the plan's limit). */
function languageRefusal(menuService: Doc<"menuServices">, maxLanguages: number, lang: string): string | null {
  const settings = {
    languages: menuService.settings?.languages ?? null,
    allergensEnabled: null,
  };
  const { source, languages, dropped } = publishedLanguages(settings, maxLanguages);
  if (lang === source) return TRANSLATION_ERROR.languageOff;
  if (dropped.includes(lang)) return MENU_PLAN_ERROR.languageLimit;
  return languages.includes(lang) ? null : TRANSLATION_ERROR.languageOff;
}

async function editRow(ctx: MutationCtx, kind: Kind, id: string, lang: string) {
  const row = await loadRow(ctx, kind, id);
  const access = await requireMenuAccessToRow(ctx, row.menuServiceId, "menu.edit");
  const capabilities = await getMenuCapabilities(ctx, access.business._id);
  const refusal = languageRefusal(access.menuService, capabilities.maxLanguages, lang);
  if (refusal) throw new ConvexError(refusal);
  return { row, access };
}

async function write(ctx: MutationCtx, access: MenuAccess, row: TranslatableDoc, next: MenuTranslations | undefined) {
  if (JSON.stringify(next ?? null) === JSON.stringify(row.translations ?? null)) return { ok: true as const };
  await ctx.db.patch(row._id, { translations: next, updatedAt: Date.now() } as never);
  await touchDraft(ctx, row.menuServiceId, access.user._id);
  return { ok: true as const };
}

// -----------------------------------------------------------------------------
// Reads
// -----------------------------------------------------------------------------

function aiState(premium: boolean): { available: boolean; reason: "premium" | "key" | null } {
  if (!premium) return { available: false, reason: "premium" };
  if (!aiTranslateConfig(env)) return { available: false, reason: "key" };
  return { available: true, reason: null };
}

/**
 * The languages the editor shows translation fields for (Settings order,
 * within the plan's limit), those above the limit, and whether the AI
 * suggestion is available (Premium AND a configured key) — and why not.
 */
export const status = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const capabilities = await getMenuCapabilities(ctx, access.business._id);
    const { source, languages, dropped } = publishedLanguages(
      { languages: access.menuService.settings?.languages ?? null, allergensEnabled: null },
      capabilities.maxLanguages,
    );
    return {
      source,
      translations: languages.slice(1),
      overLimit: dropped,
      maxLanguages: capabilities.maxLanguages,
      ai: aiState(capabilities.aiTranslations),
    };
  },
});

function idMap(docs: Awaited<ReturnType<typeof loadDraft>>["docs"]) {
  const maps: Record<StudioPrevodVrsta, Map<string, string>> = {
    page: new Map(docs.pages.map((d) => [d.key, d._id])),
    section: new Map(docs.sections.map((d) => [d.key, d._id])),
    article: new Map(docs.articles.map((d) => [d.key, d._id])),
    variant: new Map(docs.variants.map((d) => [d.key, d._id])),
    addonGroup: new Map(docs.addonGroups.map((d) => [d.key, d._id])),
    addonOption: new Map(docs.addonOptions.map((d) => [d.key, d._id])),
    roomServiceCategory: new Map(docs.roomServiceCategories.map((d) => [d.key, d._id])),
  };
  return (kind: StudioPrevodVrsta, key: string) => maps[kind].get(key) ?? key;
}

/**
 * Everything a guest reads on one page (or the Room service categories), with
 * the source texts and every translation, for the translations view. Built on
 * the same draft snapshot as Objavi (bounded by its limits). Subscribed only
 * while the view is open. null for every refusal.
 */
export const view = query({
  args: {
    menuServiceId: v.id("menuServices"),
    scope: v.union(v.object({ kind: v.literal("page"), pageId: v.id("menuPages") }), v.object({ kind: v.literal("roomService") })),
  },
  handler: async (ctx, args) => {
    const access = await getMenuAccess(ctx, { menuServiceId: args.menuServiceId }, "menu.read");
    if (!access) return null;
    const { docs, snapshot } = await loadDraft(ctx, access.menuService);
    const idOf = idMap(docs);
    if (args.scope.kind === "roomService") {
      return { title: null, items: prevodiRoomServicea(snapshot, idOf), truncated: false };
    }
    const pageId = args.scope.pageId;
    const page = docs.pages.find((candidate) => candidate._id === pageId);
    if (!page) return null;
    const list = prevodiStranice(snapshot as MenuDraftSnapshot, page.key, idOf);
    return list ? { title: page.name, items: list.stavke, truncated: list.skraceno } : null;
  },
});

// -----------------------------------------------------------------------------
// Writes
// -----------------------------------------------------------------------------

/**
 * The owner typed (or cleared, null) one translated field: confirmed at once,
 * into the draft. Compare-and-set on the confirmed text the editor last saw.
 */
export const setTranslation = mutation({
  args: {
    kind: kindValidator,
    id: v.string(),
    lang: v.string(),
    field: fieldValidator,
    expected: v.union(v.string(), v.null()),
    value: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const { row, access } = await editRow(ctx, args.kind, args.id, args.lang);
    if (!POLJA_PREVODA[args.kind].includes(args.field)) throw new ConvexError(MENU_ERROR.invalidInput);
    const source = row[args.field];
    if (!source) throw new ConvexError(TRANSLATION_ERROR.nothingToTranslate);
    if (args.value !== null && args.value.trim().length > granicaPrevoda(args.kind, args.field)) {
      throw new ConvexError(MENU_ERROR.invalidInput);
    }
    const current = fieldTranslation(source, row.translations?.[args.lang], args.field).confirmed;
    if ((current ?? null) !== (args.expected ?? null)) {
      return { ok: false as const, conflicts: ["translation"], current: { translation: current }, attempted: { translation: args.value } };
    }
    return await write(ctx, access, row, withTypedTranslation(row.translations, args.lang, args.field, args.value, source));
  },
});

/** The owner confirmed the AI suggestion (as shown, or with edited fields): only now can it be published. */
export const confirmSuggestion = mutation({
  args: {
    kind: kindValidator,
    id: v.string(),
    lang: v.string(),
    edited: v.optional(v.object({ name: v.optional(v.string()), description: v.optional(v.string()), publicTitle: v.optional(v.string()) })),
  },
  handler: async (ctx, args) => {
    const { row, access } = await editRow(ctx, args.kind, args.id, args.lang);
    const edited = args.edited ?? {};
    for (const field of Object.keys(edited) as MenuTranslationField[]) {
      const text = edited[field];
      if (!POLJA_PREVODA[args.kind].includes(field) || (text !== undefined && text.trim().length > granicaPrevoda(args.kind, field))) {
        throw new ConvexError(MENU_ERROR.invalidInput);
      }
    }
    return await write(ctx, access, row, withConfirmedSuggestion(row.translations, args.lang, edited));
  },
});

/** The owner rejected the suggestion: it is dropped; the confirmed text stays. */
export const dropSuggestion = mutation({
  args: { kind: kindValidator, id: v.string(), lang: v.string() },
  handler: async (ctx, args) => {
    const row = await loadRow(ctx, args.kind, args.id);
    const access = await requireMenuAccessToRow(ctx, row.menuServiceId, "menu.edit");
    return await write(ctx, access, row, withoutSuggestion(row.translations, args.lang));
  },
});

/** "Prevod je i dalje dobar": a stale translation the owner keeps; its hashes move to the current source. */
export const markReviewed = mutation({
  args: { kind: kindValidator, id: v.string(), lang: v.string() },
  handler: async (ctx, args) => {
    const { row, access } = await editRow(ctx, args.kind, args.id, args.lang);
    return await write(ctx, access, row, withReviewedTranslation(row.translations, args.lang, sourcesOf(args.kind, row)));
  },
});

// -----------------------------------------------------------------------------
// The AI suggestion (Premium + key; mocked in tests)
// -----------------------------------------------------------------------------

/** Who may ask, what to translate. Throws the same refusals as a write. */
export const suggestionContext = internalQuery({
  args: { kind: kindValidator, id: v.string(), lang: v.string() },
  handler: async (ctx, args) => {
    const row = await loadRow(ctx, args.kind, args.id);
    const access = await requireMenuAccessToRow(ctx, row.menuServiceId, "menu.edit");
    const capabilities = await requireMenuCapability(ctx, access.business._id, "aiTranslations");
    const refusal = languageRefusal(access.menuService, capabilities.maxLanguages, args.lang);
    if (refusal) throw new ConvexError(refusal);
    const sources = sourcesOf(args.kind, row);
    const texts: Record<string, string> = {};
    for (const field of POLJA_PREVODA[args.kind]) {
      const source = sources[field];
      if (source) texts[field] = source;
    }
    const languages = access.menuService.settings?.languages;
    return { from: languages?.source ?? "sr", texts };
  },
});

/** Stores the suggestion only if the sources are still the ones that were translated. */
export const storeSuggestion = internalMutation({
  args: {
    kind: kindValidator,
    id: v.string(),
    lang: v.string(),
    texts: v.object({ name: v.optional(v.string()), description: v.optional(v.string()), publicTitle: v.optional(v.string()) }),
    sourceHashes: v.object({ name: v.optional(v.string()), description: v.optional(v.string()), publicTitle: v.optional(v.string()) }),
  },
  handler: async (ctx, args) => {
    const { row, access } = await editRow(ctx, args.kind, args.id, args.lang);
    await requireMenuCapability(ctx, access.business._id, "aiTranslations");
    const sources = sourcesOf(args.kind, row);
    for (const field of POLJA_PREVODA[args.kind]) {
      const source = sources[field];
      const asked = args.sourceHashes[field];
      if ((source ? sourceHash(source) : undefined) !== asked) throw new ConvexError(TRANSLATION_ERROR.sourceChanged);
    }
    const texts: Partial<Record<MenuTranslationField, string>> = {};
    for (const field of POLJA_PREVODA[args.kind]) {
      const text = args.texts[field];
      if (text && text.trim().length <= granicaPrevoda(args.kind, field)) texts[field] = text;
    }
    if (Object.keys(texts).length === 0) throw new ConvexError(TRANSLATION_ERROR.aiFailed);
    await write(ctx, access, row, withSuggestion(row.translations, args.lang, texts, sources, Date.now()));
    return { fields: Object.keys(texts).length };
  },
});

/**
 * "Predloži prevod": asks the AI service for a suggestion of one thing in one
 * language and stores it NEXT TO the confirmed text. Premium only; switched
 * off without MENU_AI_TRANSLATE_KEY (no network call). Never publishes.
 */
export const suggest = action({
  args: { kind: kindValidator, id: v.string(), lang: v.string() },
  handler: async (ctx, args): Promise<{ fields: number }> => {
    const context: { from: string; texts: Record<string, string> } = await ctx.runQuery(internal.menuTranslations.suggestionContext, args);
    const config = aiTranslateConfig(env);
    if (!config) throw new ConvexError(TRANSLATION_ERROR.aiDisabled);
    if (Object.keys(context.texts).length === 0) throw new ConvexError(TRANSLATION_ERROR.nothingToTranslate);
    const result = await aiTranslate(config, { from: context.from, to: args.lang, texts: context.texts });
    if (!result.ok) throw new ConvexError(TRANSLATION_ERROR.aiFailed);
    const sourceHashes: Partial<Record<MenuTranslationField, string>> = {};
    for (const [field, text] of Object.entries(context.texts)) sourceHashes[field as MenuTranslationField] = sourceHash(text);
    return await ctx.runMutation(internal.menuTranslations.storeSuggestion, {
      ...args,
      texts: result.texts as Partial<Record<MenuTranslationField, string>>,
      sourceHashes,
    });
  },
});
