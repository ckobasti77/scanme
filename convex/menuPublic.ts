import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { activeMenuServiceForBusiness } from "./lib/menuAccess";
import { getUrl as storageGetUrl } from "./lib/storage";
import { menuForBusiness } from "./menu";
import { MENU_VERSION_MAX_BYTES, MENU_VERSION_PART_MAX_BYTES } from "../lib/menu/budget";
import { MENU_MAX_ARTICLES } from "../lib/menu/limits";
import type { PublicImage } from "../lib/menu/public-view";
import {
  MENU_PART_ROOM_SERVICE,
  MENU_PART_SPLITTER,
  parsePublicPage,
  parseRoomService,
  parseSplitter,
  type PublicPageDoc,
  type PublicPageMeta,
  type PublicSplitterDoc,
} from "../lib/menu/snapshot";

// =============================================================================
// ScanMe Menu V1 (K05) — the public read path (master §6.1, §7; K01 A2).
//
// Guests read ONLY the published version (menuServices.liveVersionId: a few
// JSON parts by one index) plus two live layers: availability
// ("Privremeno nedostupno", its own small subscription) and the Room service
// switch. Nothing here reads a draft row, so editing never changes what a
// guest sees until Objavi, and a guest subscription is never invalidated by
// an edit. No identity: a service is public only while the business is
// active, its Menu service is active, the ScanMe profile is active and a
// version is published.
//
//   entry          "new" (a published version), "legacy" (the old menu still
//                  serves /[slug]/meni) or "none".
//   page           one page (by slug), or the splitter data when the menu has
//                  several visible pages and no page was asked for.
//   roomService    the Room service part, only while the live switch is on.
//   availability   article keys temporarily unavailable right now.
//   live           (K13) the small live layer an open phone subscribes to:
//                  the version number and the unavailable articles, by slug.
//   pageMedia      (K13) signed image URLs of one page, read once by the
//                  server render (never subscribed), at most
//                  MENU_PUBLIC_MEDIA_CAP point reads.
//
// K13 (plan K12-1): a service that replaced a legacy menu is public only after
// the cutover. Until then guests see the legacy menu and only the legacy
// writers mark "nema više" (K06), so the new model is not served beside it.
// Reverting the cutover sends guests back to the legacy menu.
// =============================================================================

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LANG_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/;
const MAX_PARTS_PER_DOC = Math.ceil(MENU_VERSION_MAX_BYTES / MENU_VERSION_PART_MAX_BYTES) + 1;
/** The most images one page resolves; articles past it fall back to their icon. */
export const MENU_PUBLIC_MEDIA_CAP = 400;

export async function activeBusinessBySlug(ctx: QueryCtx, slug: string): Promise<Doc<"businesses"> | null> {
  const clean = slug.trim().toLowerCase();
  if (clean.length > 80 || !SLUG_PATTERN.test(clean)) return null;
  const business = await ctx.db
    .query("businesses")
    .withIndex("by_slug", (q) => q.eq("slug", clean))
    .unique();
  if (!business || business.status === "inactive" || business.archivedAt !== undefined) return null;
  return business;
}

export type PublicService = {
  business: Doc<"businesses">;
  menuService: Doc<"menuServices">;
  version: Doc<"menuVersions">;
};

export async function isPubliclyServed(ctx: QueryCtx, menuService: Doc<"menuServices">): Promise<boolean> {
  if (menuService.status !== "active" || !menuService.liveVersionId || !menuService.serviceProfileId) {
    return false;
  }
  // K12-1: a migrated service goes public only with the cutover.
  if (menuService.legacyMenuId !== undefined && menuService.migration?.status !== "cutover") return false;
  const profile = await ctx.db.get(menuService.serviceProfileId);
  return profile?.status === "active" && profile.businessId === menuService.businessId;
}

export async function publicServiceOf(ctx: QueryCtx, business: Doc<"businesses">): Promise<PublicService | null> {
  const menuService = await activeMenuServiceForBusiness(ctx, business._id);
  if (!menuService || !(await isPubliclyServed(ctx, menuService))) return null;
  const version = await ctx.db.get(menuService.liveVersionId as Id<"menuVersions">);
  if (!version || version.menuServiceId !== menuService._id) return null;
  return { business, menuService, version };
}

export async function publicParts(
  ctx: QueryCtx,
  versionId: Id<"menuVersions">,
  lang: string,
  pageKey: string,
): Promise<string[]> {
  const rows = await ctx.db
    .query("menuVersionParts")
    .withIndex("by_versionId_and_scope_and_lang_and_pageKey_and_part", (q) =>
      q.eq("versionId", versionId).eq("scope", "public").eq("lang", lang).eq("pageKey", pageKey),
    )
    .take(MAX_PARTS_PER_DOC);
  return rows.map((row) => row.data);
}

/** The asked language when the version has it, else the source language. */
function resolveLang(version: Doc<"menuVersions">, lang: string | undefined): string {
  const asked = lang?.trim().toLowerCase();
  if (asked && LANG_PATTERN.test(asked) && version.languages.includes(asked)) return asked;
  return version.languages[0] ?? "sr";
}

export async function splitterOf(ctx: QueryCtx, service: PublicService, lang: string): Promise<PublicSplitterDoc | null> {
  const [data] = await publicParts(ctx, service.version._id, lang, MENU_PART_SPLITTER);
  return data ? parseSplitter(data) : null;
}

/** The venue logo for the splitter and the header (K13): a stored file first, else an external URL. */
async function logoUrlOf(ctx: QueryCtx, business: Doc<"businesses">): Promise<string | null> {
  if (business.logoStorageId) {
    const url = await storageGetUrl(ctx, business.logoStorageId);
    if (url) return url;
  }
  return business.logoUrl ?? null;
}

function common(service: PublicService, splitter: PublicSplitterDoc, logoUrl: string | null) {
  return {
    menuServiceId: service.menuService._id,
    versionNumber: service.version.number,
    business: { name: service.business.name, slug: service.business.slug },
    logoUrl,
    lang: splitter.lang,
    sourceLang: splitter.sourceLang,
    languages: splitter.languages,
    pages: splitter.pages,
    presentation: splitter.presentation,
    allergensEnabled: splitter.allergensEnabled,
    roomService: splitter.roomService && service.menuService.features.roomService,
  };
}

/** Which path serves /[slug]/meni: the new model, the legacy menu, or nothing. */
export const entry = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const business = await activeBusinessBySlug(ctx, args.slug);
    if (!business) return { kind: "none" as const };
    const service = await publicServiceOf(ctx, business);
    if (service) return { kind: "new" as const, versionNumber: service.version.number };
    const legacy = await menuForBusiness(ctx, business._id);
    if (legacy?.status === "published") return { kind: "legacy" as const };
    return { kind: "none" as const };
  },
});

/**
 * One page of the published menu in one language (a confirmed translation or
 * the source text, decided at publish time). Without `pageSlug`: the only
 * visible page, or `kind: "splitter"` when there are several (or none). null
 * when the venue has no published menu or the page is not public.
 */
type PageArgs = { slug: string; pageSlug?: string; lang?: string };

type LoadedPage =
  | { kind: "splitter"; service: PublicService; splitter: PublicSplitterDoc }
  | { kind: "page"; service: PublicService; splitter: PublicSplitterDoc; meta: PublicPageMeta; doc: PublicPageDoc };

/** The splitter, or the page asked for (the only page without a slug), of the published version. */
async function loadPage(ctx: QueryCtx, args: PageArgs): Promise<LoadedPage | null> {
  const business = await activeBusinessBySlug(ctx, args.slug);
  if (!business) return null;
  const service = await publicServiceOf(ctx, business);
  if (!service) return null;
  const splitter = await splitterOf(ctx, service, resolveLang(service.version, args.lang));
  if (!splitter) return null;

  let meta = splitter.pages[0];
  if (args.pageSlug !== undefined) {
    const found = splitter.pages.find((row) => row.slug === args.pageSlug);
    if (!found) return null;
    meta = found;
  } else if (splitter.pages.length !== 1) {
    return { kind: "splitter", service, splitter };
  }
  const doc = parsePublicPage(await publicParts(ctx, service.version._id, splitter.lang, meta.key));
  if (!doc) return null;
  return { kind: "page", service, splitter, meta, doc };
}

export const page = query({
  args: { slug: v.string(), pageSlug: v.optional(v.string()), lang: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const loaded = await loadPage(ctx, args);
    if (!loaded) return null;
    const logoUrl = await logoUrlOf(ctx, loaded.service.business);
    if (loaded.kind === "splitter") {
      return { kind: "splitter" as const, ...common(loaded.service, loaded.splitter, logoUrl) };
    }
    return {
      kind: "page" as const,
      ...common(loaded.service, loaded.splitter, logoUrl),
      page: loaded.doc.page,
      sections: loaded.doc.sections,
    };
  },
});

/**
 * Signed URLs of the images of one page (K13, plan K12-7), keyed by
 * imageMediaId. Read once by the server render, never subscribed. Only ready
 * assets of the venue itself; an article without an entry falls back to its
 * icon. At most MENU_PUBLIC_MEDIA_CAP point reads.
 */
export const pageMedia = query({
  args: { slug: v.string(), pageSlug: v.optional(v.string()), lang: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const out: Record<string, PublicImage> = {};
    const loaded = await loadPage(ctx, args);
    if (!loaded || loaded.kind !== "page") return out;
    const ids = new Set<string>();
    for (const section of loaded.doc.sections) {
      for (const article of section.articles) {
        if (article.media.mode === "image" && article.media.imageMediaId) ids.add(article.media.imageMediaId);
      }
    }
    const businessId = loaded.service.business._id;
    for (const id of [...ids].slice(0, MENU_PUBLIC_MEDIA_CAP)) {
      const assetId = ctx.db.normalizeId("mediaAssets", id);
      if (!assetId) continue;
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.status !== "ready" || asset.businessId !== businessId) continue;
      const thumbUrl = await storageGetUrl(ctx, asset.variants.thumb.ref as Id<"_storage">);
      const url = await storageGetUrl(ctx, asset.variants.webp.ref as Id<"_storage">);
      if (!thumbUrl || !url) continue;
      out[id] = { thumbUrl, url, width: asset.variants.webp.width, height: asset.variants.webp.height };
    }
    return out;
  },
});

/** Room service of the published version, only while the live switch is on. */
export const roomService = query({
  args: { slug: v.string(), lang: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const business = await activeBusinessBySlug(ctx, args.slug);
    if (!business) return null;
    const service = await publicServiceOf(ctx, business);
    if (!service || !service.menuService.features.roomService) return null;
    const splitter = await splitterOf(ctx, service, resolveLang(service.version, args.lang));
    if (!splitter || !splitter.roomService) return null;
    const parts = await publicParts(ctx, service.version._id, splitter.lang, MENU_PART_ROOM_SERVICE);
    if (parts.length === 0) return null;
    return { ...common(service, splitter, await logoUrlOf(ctx, business)), ...parseRoomService(parts) };
  },
});

/**
 * Live "Privremeno nedostupno" (master §5.6): keys of the articles that are
 * unavailable right now. Changes at once, without publishing. null when the
 * service is not publicly served.
 */
export const availability = query({
  args: { menuServiceId: v.id("menuServices") },
  handler: async (ctx, args) => {
    const menuService = await ctx.db.get(args.menuServiceId);
    if (!menuService || !(await isPubliclyServed(ctx, menuService))) return null;
    const business = await ctx.db.get(menuService.businessId);
    if (!business || business.status === "inactive" || business.archivedAt !== undefined) return null;
    const rows = await ctx.db
      .query("menuAvailability")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", menuService._id))
      .take(MENU_MAX_ARTICLES);
    return { articleKeys: rows.map((row) => row.articleKey).sort() };
  },
});

/**
 * The live layer of the public menu (K13, plan K12-3): what an open phone
 * subscribes to instead of the whole page. A new versionNumber is a new
 * publication (the guest is offered it; the page never jumps on its own);
 * unavailableKeys is "Privremeno nedostupno" right now. null when the venue
 * serves no published new-model menu.
 */
export const live = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const business = await activeBusinessBySlug(ctx, args.slug);
    if (!business) return null;
    const service = await publicServiceOf(ctx, business);
    if (!service) return null;
    const rows = await ctx.db
      .query("menuAvailability")
      .withIndex("by_menuServiceId", (q) => q.eq("menuServiceId", service.menuService._id))
      .take(MENU_MAX_ARTICLES);
    return {
      menuServiceId: service.menuService._id,
      versionNumber: service.version.number,
      unavailableKeys: rows.map((row) => row.articleKey).sort(),
    };
  },
});
