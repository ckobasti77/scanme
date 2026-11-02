import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { menuMediaModeValidator } from "./lib/menuDomainValidators";
import { requireMenuAccessToRow, type MenuAccess } from "./lib/menuAccess";
import { touchDraft } from "./lib/menuDraft";
import { generateUploadUrl, getUrl, remove } from "./lib/storage";
import { checkCas } from "../lib/menu/cas";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_MEDIA_ERROR, type MenuMediaErrorCode } from "../lib/menu/errors/media";
import {
  MENU_IMAGE_MAX_DIMENSION,
  checkMenuImage,
  checkStoredMenuImage,
  type MenuImageProblem,
} from "../lib/menu/image-validation";
import { MENU_TEXT } from "../lib/menu/limits";

// =============================================================================
// ScanMe Menu V1 — the image and icon of an article (K15; master §7.4, §7.9).
//
// An article shows an image, an icon from the Menu set, or nothing; the icon
// also stands in when the image cannot be shown. One main image per article,
// up to 10 MB, stored as web versions of at most 2.400 px without metadata.
//
// The upload is the Memories protocol (convex/memoriesPipeline.ts) for a
// signed-in editor:
//   1. reserveUpload (browser, the editor's session): checks role, type and
//      size, records a `reserved` upload and returns a Convex upload URL; the
//      browser stores the original there directly (no image bytes ride a
//      Next request);
//   2. uploadContext (the Next.js route /api/meni/slike, with the SAME user's
//      token AND the pipeline secret): claims the stored original for this
//      upload, re-checks its real type and size from `_storage`, and returns
//      a signed URL of the original and three upload URLs for the versions;
//   3. the route makes AVIF, WebP and a thumbnail with sharp (rotate from
//      EXIF, at most 2.400 px, every metadata byte dropped —
//      lib/menu/http/image-transform.ts);
//   4. commitProcessed (route, token + secret): one transaction inserts the
//      mediaAssets row, deletes the original, marks the upload processed and
//      makes the image the article's image in the DRAFT.
// The secret proves the route ran the transform (a browser cannot commit an
// unprocessed original); the token proves who asked. The old image is never
// deleted here: a published version may still show it.
//
// setArticleMedia picks image / icon / none by compare-and-set (draft).
// reapOrphans (cron) removes reserved or failed uploads older than a day with
// their blobs.
// =============================================================================

const UPLOADS_PER_HOUR = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const REAP_BATCH = 100;

function refuse(code: MenuMediaErrorCode | (typeof MENU_ERROR)[keyof typeof MENU_ERROR]): ConvexError<string> {
  return new ConvexError(code);
}

const PROBLEM_CODES: Record<MenuImageProblem, MenuMediaErrorCode> = {
  empty: MENU_MEDIA_ERROR.empty,
  too_large: MENU_MEDIA_ERROR.tooLarge,
  heic: MENU_MEDIA_ERROR.heic,
  wrong_type: MENU_MEDIA_ERROR.wrongType,
};

// Constant-time compare (no node:crypto in the Convex runtime), as in memoriesPipeline.
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The Next.js image route shares SCANME_PIPELINE_SECRET with Memories (one image pipeline secret). */
function requirePipelineSecret(provided: string): void {
  const expected = env.SCANME_PIPELINE_SECRET;
  if (!expected) throw refuse(MENU_MEDIA_ERROR.disabled);
  if (!timingSafeEqualString(provided, expected)) throw refuse(MENU_MEDIA_ERROR.invalidSecret);
}

async function articleForEdit(ctx: MutationCtx, articleId: Id<"menuArticles">) {
  const article = await ctx.db.get(articleId);
  if (!article) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, article.menuServiceId, "menu.edit");
  return { article, access };
}

/** How long a Convex upload URL accepts a file; a blob stored later is not this reservation's. */
const UPLOAD_URL_LIFETIME_MS = 60 * 60 * 1000;

/**
 * K34: whether a stored blob is the one this reservation's upload URL received —
 * stored after the reservation, within the URL's lifetime, and (rows from K34 on)
 * exactly the declared size. A blob that existed before (another venue's photo or
 * video) or a concurrent upload of someone else never matches.
 */
export function blobOfUpload(
  upload: Pick<Doc<"menuMediaUploads">, "createdAt" | "declaredSize">,
  blob: { _creationTime: number; size: number },
): boolean {
  if (blob._creationTime < upload.createdAt) return false;
  if (blob._creationTime > upload.createdAt + UPLOAD_URL_LIFETIME_MS) return false;
  return upload.declaredSize === undefined || blob.size === upload.declaredSize;
}

/**
 * The upload, authorized for the caller: the same person who reserved it, still
 * an editor of that menu. Anyone else gets not_found (no existence oracle).
 */
async function uploadForRoute(
  ctx: MutationCtx,
  uploadId: Id<"menuMediaUploads">,
): Promise<{ upload: Doc<"menuMediaUploads">; access: MenuAccess }> {
  const upload = await ctx.db.get(uploadId);
  if (!upload) throw refuse(MENU_ERROR.notFound);
  const access = await requireMenuAccessToRow(ctx, upload.menuServiceId, "menu.edit");
  if (access.user._id !== upload.userId) throw refuse(MENU_ERROR.notFound);
  return { upload, access };
}

// -----------------------------------------------------------------------------
// 1. Reserve
// -----------------------------------------------------------------------------

/**
 * Starts an image upload for an article: the file's reported type and size are
 * checked (the stored blob is checked again in uploadContext), at most
 * UPLOADS_PER_HOUR per menu. Returns the upload id and the URL the browser
 * POSTs the original to.
 */
export const reserveUpload = mutation({
  args: { articleId: v.id("menuArticles"), contentType: v.string(), size: v.number() },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const check = checkMenuImage({ type: args.contentType, name: "", size: args.size });
    if (!check.ok) throw refuse(PROBLEM_CODES[check.problem]);

    const now = Date.now();
    const recent = await ctx.db
      .query("menuMediaUploads")
      .withIndex("by_menuServiceId_and_createdAt", (q) =>
        q.eq("menuServiceId", article.menuServiceId).gte("createdAt", now - 60 * 60 * 1000),
      )
      .take(UPLOADS_PER_HOUR);
    if (recent.length >= UPLOADS_PER_HOUR) throw refuse(MENU_MEDIA_ERROR.tooMany);

    const uploadId = await ctx.db.insert("menuMediaUploads", {
      menuServiceId: article.menuServiceId,
      articleId: article._id,
      userId: access.user._id,
      status: "reserved",
      declaredSize: args.size,
      createdAt: now,
      updatedAt: now,
    });
    return { uploadId, uploadUrl: await generateUploadUrl(ctx) };
  },
});

// -----------------------------------------------------------------------------
// 2. Claim (the Next.js route)
// -----------------------------------------------------------------------------

/**
 * The route claims the stored original for the upload and gets what the
 * transform needs. A blob that is not an accepted image (or too large) marks
 * the upload failed and is deleted at once; that answer is RETURNED, not
 * thrown, so the failure is kept. A retry of a processed upload answers
 * `done` with the image.
 */
export const uploadContext = mutation({
  args: { secret: v.string(), uploadId: v.id("menuMediaUploads"), storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    requirePipelineSecret(args.secret);
    const { upload } = await uploadForRoute(ctx, args.uploadId);
    if (upload.status === "processed" && upload.mediaId) {
      return { status: "done" as const, mediaId: upload.mediaId };
    }
    if (upload.status !== "reserved") throw refuse(MENU_MEDIA_ERROR.wrongState);
    if (upload.storageId !== undefined && upload.storageId !== args.storageId) {
      throw refuse(MENU_MEDIA_ERROR.wrongState);
    }
    // A blob already claimed by another upload is never taken over.
    const claimed = await ctx.db
      .query("menuMediaUploads")
      .withIndex("by_storageId", (q) => q.eq("storageId", args.storageId))
      .take(2);
    if (claimed.some((row) => row._id !== upload._id)) throw refuse(MENU_MEDIA_ERROR.wrongState);

    const meta = await ctx.db.system.get("_storage", args.storageId);
    if (!meta) throw refuse(MENU_MEDIA_ERROR.empty);
    // K34 (critical): the storageId comes from the caller, and ids of other venues' files
    // are public (old menus, Venue pages). Only the blob THIS reservation stored is ever
    // read, copied or deleted: saved after the reservation, while its upload URL lives,
    // with the byte size declared at reservation. Anything else is wrong_state, untouched.
    if (!blobOfUpload(upload, meta)) throw refuse(MENU_MEDIA_ERROR.wrongState);
    const now = Date.now();
    const check = checkStoredMenuImage({ contentType: meta.contentType ?? null, size: meta.size });
    if (!check.ok) {
      await remove(ctx, args.storageId);
      await ctx.db.patch(upload._id, { status: "failed", updatedAt: now });
      return { status: "refused" as const, code: PROBLEM_CODES[check.problem] };
    }
    const originalUrl = await getUrl(ctx, args.storageId);
    if (!originalUrl) throw refuse(MENU_MEDIA_ERROR.empty);
    if (upload.storageId === undefined) {
      await ctx.db.patch(upload._id, { storageId: args.storageId, updatedAt: now });
    }
    return {
      status: "ready" as const,
      originalUrl,
      maxDimension: MENU_IMAGE_MAX_DIMENSION,
      uploads: {
        avif: await generateUploadUrl(ctx),
        webp: await generateUploadUrl(ctx),
        thumb: await generateUploadUrl(ctx),
      },
    };
  },
});

/** The route could not decode the original: the upload fails and the blob goes. */
export const failUpload = mutation({
  args: { secret: v.string(), uploadId: v.id("menuMediaUploads") },
  handler: async (ctx, args) => {
    requirePipelineSecret(args.secret);
    const { upload } = await uploadForRoute(ctx, args.uploadId);
    if (upload.status !== "reserved") return { ok: true as const };
    if (upload.storageId) await remove(ctx, upload.storageId);
    await ctx.db.patch(upload._id, { status: "failed", updatedAt: Date.now() });
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// 4. Commit (the Next.js route)
// -----------------------------------------------------------------------------

const variantValidator = v.object({
  ref: v.id("_storage"),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
});

function validVariant(variant: { width: number; height: number; bytes: number }): boolean {
  return (
    Number.isInteger(variant.width) &&
    Number.isInteger(variant.height) &&
    variant.width > 0 &&
    variant.height > 0 &&
    variant.width <= MENU_IMAGE_MAX_DIMENSION &&
    variant.height <= MENU_IMAGE_MAX_DIMENSION &&
    Number.isInteger(variant.bytes) &&
    variant.bytes > 0
  );
}

/**
 * One transaction: the image (mediaAssets, of this business), the original
 * deleted, the upload processed, and the image set as the article's image in
 * the draft (image mode; its icon stays as the stand-in). Idempotent: a
 * processed upload answers with its image again.
 */
export const commitProcessed = mutation({
  args: {
    secret: v.string(),
    uploadId: v.id("menuMediaUploads"),
    storageId: v.id("_storage"),
    variants: v.object({ avif: variantValidator, webp: variantValidator, thumb: variantValidator }),
  },
  handler: async (ctx, args) => {
    requirePipelineSecret(args.secret);
    const { upload, access } = await uploadForRoute(ctx, args.uploadId);
    if (upload.status === "processed" && upload.mediaId) return { mediaId: upload.mediaId };
    if (upload.status !== "reserved" || upload.storageId !== args.storageId) {
      throw refuse(MENU_MEDIA_ERROR.wrongState);
    }
    const { avif, webp, thumb } = args.variants;
    if (![avif, webp, thumb].every(validVariant)) throw refuse(MENU_ERROR.invalidInput);

    const now = Date.now();
    const mediaId = await ctx.db.insert("mediaAssets", {
      businessId: access.business._id,
      kind: "image",
      provider: "convex",
      variants: {
        avif: { ref: avif.ref, width: avif.width, height: avif.height, bytes: avif.bytes },
        webp: { ref: webp.ref, width: webp.width, height: webp.height, bytes: webp.bytes },
        thumb: { ref: thumb.ref, width: thumb.width, height: thumb.height, bytes: thumb.bytes },
      },
      status: "ready",
      createdAt: now,
    });
    await remove(ctx, args.storageId);
    await ctx.db.patch(upload._id, { status: "processed", mediaId, updatedAt: now });

    const article = await ctx.db.get(upload.articleId);
    if (article && article.menuServiceId === upload.menuServiceId) {
      await ctx.db.patch(article._id, {
        mediaMode: "image",
        imageMediaId: mediaId,
        updatedAt: now,
        updatedByUserId: access.user._id,
      });
      await touchDraft(ctx, article.menuServiceId, access.user._id);
    }
    return { mediaId };
  },
});

// -----------------------------------------------------------------------------
// Image, icon or nothing (draft)
// -----------------------------------------------------------------------------

const mediaChoiceValidator = v.object({
  mediaMode: menuMediaModeValidator,
  iconKey: v.union(v.string(), v.null()),
  imageMediaId: v.union(v.id("mediaAssets"), v.null()),
});

function mediaKey(choice: { mediaMode: string; iconKey: string | null; imageMediaId: string | null }): string {
  return `${choice.mediaMode}|${choice.iconKey ?? ""}|${choice.imageMediaId ?? ""}`;
}

/**
 * What the article shows, by compare-and-set on the choice the editor last saw:
 * an image (it must be a ready image of this business), an icon of the Menu
 * set or nothing. The icon is kept with an image: it stands in when the image
 * cannot be shown. Clearing the image keeps the image asset (versions may show it).
 */
export const setArticleMedia = mutation({
  args: { articleId: v.id("menuArticles"), expected: mediaChoiceValidator, next: mediaChoiceValidator },
  handler: async (ctx, args) => {
    const { article, access } = await articleForEdit(ctx, args.articleId);
    const { next } = args;
    if (next.iconKey !== null && (next.iconKey.trim() === "" || next.iconKey.length > MENU_TEXT.iconKey)) {
      throw refuse(MENU_ERROR.invalidInput);
    }
    if (next.mediaMode === "image" && next.imageMediaId === null) throw refuse(MENU_ERROR.invalidInput);

    const current = {
      mediaMode: article.mediaMode,
      iconKey: article.iconKey ?? null,
      imageMediaId: article.imageMediaId ?? null,
    };
    const cas = checkCas<"media">({ media: mediaKey(current) }, { media: mediaKey(args.expected) }, { media: mediaKey(next) });
    if (!cas.ok) return cas;
    if (mediaKey(current) === mediaKey(next)) return { ok: true as const };

    if (next.imageMediaId !== null && next.imageMediaId !== current.imageMediaId) {
      const asset = await ctx.db.get(next.imageMediaId);
      if (!asset || asset.status !== "ready" || asset.businessId !== access.business._id) {
        throw refuse(MENU_ERROR.notFound);
      }
    }
    await ctx.db.patch(article._id, {
      mediaMode: next.mediaMode,
      iconKey: next.iconKey ?? undefined,
      imageMediaId: next.imageMediaId ?? undefined,
      updatedAt: Date.now(),
      updatedByUserId: access.user._id,
    });
    await touchDraft(ctx, article.menuServiceId, access.user._id);
    return { ok: true as const };
  },
});

// -----------------------------------------------------------------------------
// Orphans (cron)
// -----------------------------------------------------------------------------

/** Reserved or failed uploads older than a day: the blob (when there is one) and the row go. */
export const reapOrphans = internalMutation({
  args: {},
  handler: async (ctx) => {
    const before = Date.now() - DAY_MS;
    let reaped = 0;
    for (const status of ["reserved", "failed"] as const) {
      const rows = await ctx.db
        .query("menuMediaUploads")
        .withIndex("by_status_and_createdAt", (q) => q.eq("status", status).lt("createdAt", before))
        .take(REAP_BATCH);
      for (const row of rows) {
        if (row.storageId) {
          const meta = await ctx.db.system.get("_storage", row.storageId);
          if (meta) await remove(ctx, row.storageId);
        }
        await ctx.db.delete(row._id);
        reaped += 1;
      }
    }
    return { reaped };
  },
});
