/// <reference types="vite/client" />

// ScanMe Menu V1 — K15: the image and icon of an article (convex/menuMedia.ts).
// reserveUpload -> uploadContext -> commitProcessed is the protocol the Next.js
// image route drives with the editor's token AND the pipeline secret;
// setArticleMedia is the compare-and-set choice of image / icon / none;
// reapOrphans removes stale uploads. Fictional venues only (seed.ts).

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { blobOfUpload } from "./menuMedia";
import schema from "./schema";
import { MENU_ERROR } from "../lib/menu/errors/core";
import { MENU_MEDIA_ERROR } from "../lib/menu/errors/media";
import { MENU_IMAGE_MAX_BYTES, MENU_IMAGE_MAX_DIMENSION } from "../lib/menu/image-validation";
import {
  SLUG_A,
  TEST_ADMIN_EMAIL,
  TEST_ISSUER,
  seedMenuWorld,
  type MenuWorldSeed,
} from "../lib/menu/testkit/seed";

const modules = import.meta.glob("./**/*.ts");

const SECRET = "test-pipeline-secret-0123456789abcdef";
const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  process.env.SCANME_ADMIN_EMAILS = TEST_ADMIN_EMAIL;
  process.env.SCANME_PIPELINE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.SCANME_PIPELINE_SECRET;
});

const newTest = () => convexTest(schema, modules);
type T = ReturnType<typeof newTest>;

function as(t: T, userId: Id<"users">) {
  return t.withIdentity({ subject: userId, issuer: TEST_ISSUER });
}

// -----------------------------------------------------------------------------
// World: tenant A with "Cevapi" (and a second article), tenant B with "Spageti".
// -----------------------------------------------------------------------------

async function setup() {
  const t = newTest();
  const w: MenuWorldSeed = await t.run(async (ctx) => await seedMenuWorld(ctx));
  const sectionA = await as(t, w.ownerId).mutation(api.menuCatalog.addSection, {
    pageId: w.a.defaultPageId,
    name: "Rostilj",
  });
  const added = await as(t, w.ownerId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId: sectionA.sectionId,
    name: "Cevapi",
    priceRsd: 600,
  });
  if (added.status !== "created") throw new Error("seed article was not created");
  const second = await as(t, w.ownerId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId: sectionA.sectionId,
    name: "Pljeskavica",
    priceRsd: 450,
  });
  if (second.status !== "created") throw new Error("second seed article was not created");

  const sectionB = await as(t, w.otherOwnerId).mutation(api.menuCatalog.addSection, {
    pageId: w.b.defaultPageId,
    name: "Pasta",
  });
  const addedB = await as(t, w.otherOwnerId).mutation(api.menuCatalog.quickAddArticle, {
    sectionId: sectionB.sectionId,
    name: "Spageti",
    priceRsd: 700,
  });
  if (addedB.status !== "created") throw new Error("tenant B article was not created");
  return {
    t,
    w,
    articleId: added.articleId,
    articleKey: added.key,
    secondArticleId: second.articleId,
    articleBId: addedB.articleId,
  };
}

async function storeBlob(t: T, bytes: number, type = "image/jpeg") {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(bytes).fill(7)], { type }));
    // convex-test omits contentType when it simulates storage/storeBlob; a real
    // direct upload fills this system-table field, so mirror it (as offerLogoUploads.test.ts does).
    const dbWithSystemWrites = ctx.db as unknown as {
      patch(tableName: "_storage", id: typeof storageId, value: { contentType: string }): Promise<void>;
    };
    await dbWithSystemWrites.patch("_storage", storageId, { contentType: type });
    return storageId;
  });
}

async function blobExists(t: T, id: Id<"_storage">) {
  return await t.run(async (ctx) => (await ctx.db.system.get("_storage", id)) !== null);
}

type Variants = {
  avif: { ref: Id<"_storage">; width: number; height: number; bytes: number };
  webp: { ref: Id<"_storage">; width: number; height: number; bytes: number };
  thumb: { ref: Id<"_storage">; width: number; height: number; bytes: number };
};

async function storeVariants(t: T, label = "x"): Promise<Variants> {
  return await t.run(async (ctx) => ({
    avif: { ref: await ctx.storage.store(new Blob([`avif-${label}`])), width: 1600, height: 1200, bytes: 6 },
    webp: { ref: await ctx.storage.store(new Blob([`webp-${label}`])), width: 1600, height: 1200, bytes: 6 },
    thumb: { ref: await ctx.storage.store(new Blob([`thumb-${label}`])), width: 320, height: 240, bytes: 7 },
  }));
}

async function insertAsset(t: T, businessId: Id<"businesses">, status: "ready" | "purged" = "ready") {
  const v = await storeVariants(t, "asset");
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("mediaAssets", {
        businessId,
        kind: "image",
        provider: "convex",
        variants: v,
        status,
        createdAt: Date.now(),
      }),
  );
}

async function reserve(t: T, userId: Id<"users">, articleId: Id<"menuArticles">, size = 1000, type = "image/jpeg") {
  return await as(t, userId).mutation(api.menuMedia.reserveUpload, { articleId, contentType: type, size });
}

/** Reserve + store a good original + claim it: the state in which the route transforms. */
async function claimed(t: T, userId: Id<"users">, articleId: Id<"menuArticles">) {
  const { uploadId } = await reserve(t, userId, articleId);
  const storageId = await storeBlob(t, 1000);
  const ctxResult = await as(t, userId).mutation(api.menuMedia.uploadContext, {
    secret: SECRET,
    uploadId,
    storageId,
  });
  if (ctxResult.status !== "ready") throw new Error(`expected ready, got ${ctxResult.status}`);
  return { uploadId, storageId };
}

/** K34: makes the reservation strictly younger than the given blobs (as if reserved a second after they were stored). */
async function reservedAfter(t: T, uploadId: Id<"menuMediaUploads">, blobs: Id<"_storage">[]) {
  await t.run(async (ctx) => {
    let newest = 0;
    for (const id of blobs) newest = Math.max(newest, (await ctx.db.system.get("_storage", id))!._creationTime);
    await ctx.db.patch(uploadId, { createdAt: Math.floor(newest) + 1000 });
  });
}

function claim(t: T, userId: Id<"users">, uploadId: Id<"menuMediaUploads">, storageId: Id<"_storage">, secret = SECRET) {
  return as(t, userId).mutation(api.menuMedia.uploadContext, { secret, uploadId, storageId });
}

function commit(
  t: T,
  userId: Id<"users">,
  uploadId: Id<"menuMediaUploads">,
  storageId: Id<"_storage">,
  variants: Variants,
  secret = SECRET,
) {
  return as(t, userId).mutation(api.menuMedia.commitProcessed, { secret, uploadId, storageId, variants });
}

async function uploadRow(t: T, uploadId: Id<"menuMediaUploads">) {
  return await t.run(async (ctx) => await ctx.db.get(uploadId));
}

async function articleRow(t: T, articleId: Id<"menuArticles">) {
  return await t.run(async (ctx) => await ctx.db.get(articleId));
}

async function assetCount(t: T) {
  return await t.run(async (ctx) => (await ctx.db.query("mediaAssets").collect()).length);
}

async function uploadCount(t: T) {
  return await t.run(async (ctx) => (await ctx.db.query("menuMediaUploads").collect()).length);
}

async function draftStatus(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const status = await as(t, userId).query(api.menuPublishing.draftStatus, { menuServiceId });
  if (!status) throw new Error("draftStatus returned null");
  return status;
}

async function publishNow(t: T, userId: Id<"users">, menuServiceId: Id<"menuServices">) {
  const owner = as(t, userId);
  const preview = await owner.query(api.menuPublishing.publishPreview, { menuServiceId });
  if (!preview) throw new Error("publishPreview returned null");
  const result = await owner.mutation(api.menuPublishing.publish, {
    menuServiceId,
    expectedRevision: preview.revision,
    acknowledgedWarnings: preview.fingerprint,
  });
  if (!result.ok) throw new Error(`publish refused: ${JSON.stringify(result)}`);
  return result;
}

type Choice = { mediaMode: "image" | "icon" | "none"; iconKey: string | null; imageMediaId: Id<"mediaAssets"> | null };
const NONE: Choice = { mediaMode: "none", iconKey: null, imageMediaId: null };

function setMedia(t: T, userId: Id<"users">, articleId: Id<"menuArticles">, expected: Choice, next: Choice) {
  return as(t, userId).mutation(api.menuMedia.setArticleMedia, { articleId, expected, next });
}

// =============================================================================
// reserveUpload
// =============================================================================

describe("menuMedia.reserveUpload", () => {
  test("owner, manager, editor and admin get an upload id and an upload URL, recorded as reserved for the caller", async () => {
    const { t, w, articleId } = await setup();
    for (const userId of [w.ownerId, w.managerId, w.editorId, w.adminId]) {
      const result = await reserve(t, userId, articleId);
      expect(typeof result.uploadUrl).toBe("string");
      expect(result.uploadUrl.length).toBeGreaterThan(0);
      const row = await uploadRow(t, result.uploadId);
      expect(row).toMatchObject({
        menuServiceId: w.a.menuServiceId,
        articleId,
        userId,
        status: "reserved",
      });
      expect(row?.storageId).toBeUndefined();
    }
  });

  test("finance, view-only, an outsider and the owner of another venue get menu/not_found and nothing is recorded", async () => {
    const { t, w, articleId } = await setup();
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      await expect(reserve(t, userId, articleId)).rejects.toThrow(MENU_ERROR.notFound);
    }
    expect(await uploadCount(t)).toBe(0);
  });

  test("an unauthenticated caller is refused", async () => {
    const { t, articleId } = await setup();
    await expect(
      t.mutation(api.menuMedia.reserveUpload, { articleId, contentType: "image/jpeg", size: 1000 }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    expect(await uploadCount(t)).toBe(0);
  });

  test("a tenant B article is not_found for tenant A's owner and vice versa", async () => {
    const { t, w, articleId, articleBId } = await setup();
    await expect(reserve(t, w.ownerId, articleBId)).rejects.toThrow(MENU_ERROR.notFound);
    await expect(reserve(t, w.otherOwnerId, articleId)).rejects.toThrow(MENU_ERROR.notFound);
    expect((await reserve(t, w.otherOwnerId, articleBId)).uploadId).toBeDefined();
  });

  test("a deleted article is not_found", async () => {
    const { t, w, articleId } = await setup();
    await t.run(async (ctx) => await ctx.db.delete(articleId));
    await expect(reserve(t, w.ownerId, articleId)).rejects.toThrow(MENU_ERROR.notFound);
  });

  test("with client editing switched off the owner gets menu/editing_disabled, the admin still reserves", async () => {
    const { t, w, articleId } = await setup();
    await t.run(async (ctx) => await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false }));
    await expect(reserve(t, w.ownerId, articleId)).rejects.toThrow(MENU_ERROR.editingDisabled);
    await expect(reserve(t, w.editorId, articleId)).rejects.toThrow(MENU_ERROR.editingDisabled);
    expect(await uploadCount(t)).toBe(0);
    expect((await reserve(t, w.adminId, articleId)).uploadId).toBeDefined();
  });

  test("refuses a wrong type, HEIC, an oversize, an empty and a non-finite size, and records nothing", async () => {
    const { t, w, articleId } = await setup();
    await expect(reserve(t, w.ownerId, articleId, 1000, "application/pdf")).rejects.toThrow(MENU_MEDIA_ERROR.wrongType);
    await expect(reserve(t, w.ownerId, articleId, 1000, "image/gif")).rejects.toThrow(MENU_MEDIA_ERROR.wrongType);
    await expect(reserve(t, w.ownerId, articleId, 1000, "image/heic")).rejects.toThrow(MENU_MEDIA_ERROR.heic);
    await expect(reserve(t, w.ownerId, articleId, MENU_IMAGE_MAX_BYTES + 1)).rejects.toThrow(MENU_MEDIA_ERROR.tooLarge);
    await expect(reserve(t, w.ownerId, articleId, 0)).rejects.toThrow(MENU_MEDIA_ERROR.empty);
    await expect(reserve(t, w.ownerId, articleId, -5)).rejects.toThrow(MENU_MEDIA_ERROR.empty);
    expect(await uploadCount(t)).toBe(0);
    // Exactly 10 MB is still accepted; png and webp too.
    expect((await reserve(t, w.ownerId, articleId, MENU_IMAGE_MAX_BYTES)).uploadId).toBeDefined();
    expect((await reserve(t, w.ownerId, articleId, 10, "image/png")).uploadId).toBeDefined();
    expect((await reserve(t, w.ownerId, articleId, 10, "image/webp")).uploadId).toBeDefined();
  });

  test("allows 60 uploads in an hour per menu and refuses the 61st with media/too_many; another menu is not affected", async () => {
    const { t, w, articleId, articleBId } = await setup();
    const now = Date.now();
    await t.run(async (ctx) => {
      for (let i = 0; i < 59; i += 1) {
        await ctx.db.insert("menuMediaUploads", {
          menuServiceId: w.a.menuServiceId,
          articleId,
          userId: w.ownerId,
          status: "reserved",
          createdAt: now - i * 1000,
          updatedAt: now - i * 1000,
        });
      }
    });
    // The 60th is allowed...
    await reserve(t, w.ownerId, articleId);
    // ...the 61st is not (whoever asks).
    await expect(reserve(t, w.ownerId, articleId)).rejects.toThrow(MENU_MEDIA_ERROR.tooMany);
    await expect(reserve(t, w.editorId, articleId)).rejects.toThrow(MENU_MEDIA_ERROR.tooMany);
    expect(await uploadCount(t)).toBe(60);
    // Menu B has its own budget.
    expect((await reserve(t, w.otherOwnerId, articleBId)).uploadId).toBeDefined();
  });

  test("uploads older than an hour do not count towards the limit", async () => {
    const { t, w, articleId } = await setup();
    const old = Date.now() - 2 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      for (let i = 0; i < 60; i += 1) {
        await ctx.db.insert("menuMediaUploads", {
          menuServiceId: w.a.menuServiceId,
          articleId,
          userId: w.ownerId,
          status: "reserved",
          createdAt: old,
          updatedAt: old,
        });
      }
    });
    expect((await reserve(t, w.ownerId, articleId)).uploadId).toBeDefined();
  });
});

// =============================================================================
// uploadContext
// =============================================================================

describe("menuMedia.uploadContext", () => {
  test("is disabled when the deployment has no pipeline secret", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId);
    const storageId = await storeBlob(t, 1000);
    delete process.env.SCANME_PIPELINE_SECRET;
    await expect(claim(t, w.ownerId, uploadId, storageId)).rejects.toThrow(MENU_MEDIA_ERROR.disabled);
    expect((await uploadRow(t, uploadId))?.storageId).toBeUndefined();
  });

  test("refuses a wrong secret (also a prefix of the right one) and claims nothing", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId);
    const storageId = await storeBlob(t, 1000);
    await expect(claim(t, w.ownerId, uploadId, storageId, "wrong-secret")).rejects.toThrow(MENU_MEDIA_ERROR.invalidSecret);
    await expect(claim(t, w.ownerId, uploadId, storageId, SECRET.slice(0, 10))).rejects.toThrow(
      MENU_MEDIA_ERROR.invalidSecret,
    );
    expect((await uploadRow(t, uploadId))?.storageId).toBeUndefined();
    expect(await blobExists(t, storageId)).toBe(true);
  });

  test("a good blob is claimed: ready, signed original URL, 2400 px, three upload URLs, storageId set", async () => {
    const { t, w, articleId } = await setup();
    // K34 (intentional): the reservation declares the size of the file it will store (as the browser does).
    const { uploadId } = await reserve(t, w.ownerId, articleId, 2048, "image/png");
    const storageId = await storeBlob(t, 2048, "image/png");
    const result = await claim(t, w.ownerId, uploadId, storageId);
    if (result.status !== "ready") throw new Error(`expected ready, got ${result.status}`);
    expect(typeof result.originalUrl).toBe("string");
    expect(result.originalUrl.length).toBeGreaterThan(0);
    expect(result.maxDimension).toBe(MENU_IMAGE_MAX_DIMENSION);
    expect(result.maxDimension).toBe(2400);
    const urls = [result.uploads.avif, result.uploads.webp, result.uploads.thumb];
    for (const url of urls) expect(typeof url).toBe("string");
    expect(new Set(urls).size).toBe(3);
    const row = await uploadRow(t, uploadId);
    expect(row).toMatchObject({ status: "reserved", storageId });
    expect(await blobExists(t, storageId)).toBe(true);
  });

  test("the same blob can be claimed again by the same upload (a retry of the route)", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    const again = await claim(t, w.ownerId, uploadId, storageId);
    expect(again.status).toBe("ready");
  });

  test("a different storageId after the first claim is media/wrong_state", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    const other = await storeBlob(t, 500);
    await expect(claim(t, w.ownerId, uploadId, other)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
    expect((await uploadRow(t, uploadId))?.storageId).toBe(storageId);
    expect(await blobExists(t, other)).toBe(true);
  });

  test("a blob already claimed by another upload is never taken over", async () => {
    const { t, w, articleId, secondArticleId } = await setup();
    const first = await claimed(t, w.ownerId, articleId);
    const { uploadId: second } = await reserve(t, w.ownerId, secondArticleId);
    await expect(claim(t, w.ownerId, second, first.storageId)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
    expect((await uploadRow(t, second))?.storageId).toBeUndefined();
    expect((await uploadRow(t, second))?.status).toBe("reserved");
    expect(await blobExists(t, first.storageId)).toBe(true);
  });

  test("a stored blob of the wrong content type is refused, the upload fails and the blob is deleted", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId);
    const storageId = await storeBlob(t, 1000, "application/pdf");
    expect(await claim(t, w.ownerId, uploadId, storageId)).toEqual({
      status: "refused",
      code: MENU_MEDIA_ERROR.wrongType,
    });
    expect((await uploadRow(t, uploadId))?.status).toBe("failed");
    expect(await blobExists(t, storageId)).toBe(false);
    // A failed upload cannot be claimed again (moved here in K34 from the over-10-MB test).
    const fresh = await storeBlob(t, 1000);
    await expect(claim(t, w.ownerId, uploadId, fresh)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
  });

  test("a stored HEIC blob answers media/heic", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId);
    const storageId = await storeBlob(t, 1000, "image/heic");
    expect(await claim(t, w.ownerId, uploadId, storageId)).toEqual({ status: "refused", code: MENU_MEDIA_ERROR.heic });
    expect((await uploadRow(t, uploadId))?.status).toBe("failed");
    expect(await blobExists(t, storageId)).toBe(false);
  });

  // K34 (intentional): a blob of another size than declared is not this reservation's blob (a
  // reservation cannot declare more than 10 MB or 0 bytes), so it is never touched: wrong_state,
  // the blob stays, the upload stays reserved. Before K34 such a blob was deleted, whoever's it was.
  test("a stored blob over 10 MB (not the declared size) is wrong_state and never deleted", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId, 1000);
    const storageId = await storeBlob(t, MENU_IMAGE_MAX_BYTES + 1);
    await expect(claim(t, w.ownerId, uploadId, storageId)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
    expect(await uploadRow(t, uploadId)).toMatchObject({ status: "reserved" });
    expect((await uploadRow(t, uploadId))?.storageId).toBeUndefined();
    expect(await blobExists(t, storageId)).toBe(true);
  });

  test("an empty stored blob is wrong_state on a K34 row, and media/empty on a row without a declared size", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId);
    const storageId = await storeBlob(t, 0);
    await expect(claim(t, w.ownerId, uploadId, storageId)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
    expect(await blobExists(t, storageId)).toBe(true);
    // A row from before K34 has no declared size: the stored-blob checks answer as before.
    await t.run(async (ctx) => await ctx.db.patch(uploadId, { declaredSize: undefined }));
    expect(await claim(t, w.ownerId, uploadId, storageId)).toEqual({ status: "refused", code: MENU_MEDIA_ERROR.empty });
    expect((await uploadRow(t, uploadId))?.status).toBe("failed");
  });

  // K34 (critical, HARDENING B7 re-rated): the storageId comes from the browser and ids of other
  // venues' files are public (old menus, Venue pages). Only the blob this reservation stored may
  // be read, copied or deleted.
  test("K34: another venue's existing image is never read, copied or deleted through a fresh reservation", async () => {
    const { t, w, articleId } = await setup();
    // Venue B's published image (any blob stored BEFORE the reservation), of the declared size even.
    const victim = await storeBlob(t, 1000);
    const victimAsset = await insertAsset(t, w.b.businessId);
    // mediaAssets keeps the ref as a plain string (other providers); here it is a Convex storage id.
    const victimRef = (await t.run(async (ctx) => (await ctx.db.get(victimAsset))!.variants.webp.ref)) as Id<"_storage">;
    const { uploadId } = await reserve(t, w.ownerId, articleId, 1000);
    await reservedAfter(t, uploadId, [victim, victimRef]);
    for (const storageId of [victim, victimRef]) {
      await expect(claim(t, w.ownerId, uploadId, storageId)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
      expect(await blobExists(t, storageId)).toBe(true);
    }
    // Nothing was claimed, nothing failed, no image was made.
    expect(await uploadRow(t, uploadId)).toMatchObject({ status: "reserved" });
    expect((await uploadRow(t, uploadId))?.storageId).toBeUndefined();
    expect(await assetCount(t)).toBe(1);
    // The upload still takes its own file (stored after the reservation, of the declared size).
    const own = await storeBlob(t, 1000);
    await t.run(async (ctx) => {
      const blob = await ctx.db.system.get("_storage", own);
      await ctx.db.patch(uploadId, { createdAt: Math.floor(blob!._creationTime) });
    });
    expect((await claim(t, w.ownerId, uploadId, own)).status).toBe("ready");
  });

  test("K34: blobOfUpload binds by time window and declared size", () => {
    const upload = { createdAt: 1_000_000, declaredSize: 2048 };
    expect(blobOfUpload(upload, { _creationTime: 1_000_000, size: 2048 })).toBe(true);
    expect(blobOfUpload(upload, { _creationTime: 1_000_000 + 60 * 60 * 1000, size: 2048 })).toBe(true);
    expect(blobOfUpload(upload, { _creationTime: 999_999.5, size: 2048 })).toBe(false);
    expect(blobOfUpload(upload, { _creationTime: 1_000_000 + 60 * 60 * 1000 + 1, size: 2048 })).toBe(false);
    expect(blobOfUpload(upload, { _creationTime: 1_000_500, size: 2047 })).toBe(false);
    // A row from before K34 (no declared size) is bound by time only.
    expect(blobOfUpload({ createdAt: 1_000_000, declaredSize: undefined }, { _creationTime: 1_000_500, size: 1 })).toBe(true);
  });

  test("K34: a wrong-type file of someone else is not deleted either (the refused branch is behind the same check)", async () => {
    const { t, w, articleId } = await setup();
    const video = await storeBlob(t, 4096, "video/mp4");
    const { uploadId } = await reserve(t, w.ownerId, articleId, 4096);
    await reservedAfter(t, uploadId, [video]);
    await expect(claim(t, w.ownerId, uploadId, video)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
    expect(await blobExists(t, video)).toBe(true);
    expect((await uploadRow(t, uploadId))?.status).toBe("reserved");
  });

  test("K34: a concurrent upload of another size, or a blob stored after the upload URL expired, is wrong_state", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId, 1000);
    const someoneElse = await storeBlob(t, 1234);
    await expect(claim(t, w.ownerId, uploadId, someoneElse)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
    expect(await blobExists(t, someoneElse)).toBe(true);
    // The reservation is older than an upload URL lives: a blob stored now is not its blob.
    const late = await storeBlob(t, 1000);
    await t.run(async (ctx) => {
      const blob = await ctx.db.system.get("_storage", late);
      await ctx.db.patch(uploadId, { createdAt: blob!._creationTime - 60 * 60 * 1000 - 1 });
    });
    await expect(claim(t, w.ownerId, uploadId, late)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
    expect(await blobExists(t, late)).toBe(true);
  });

  test("a missing blob throws media/empty", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId);
    const storageId = await storeBlob(t, 100);
    await t.run(async (ctx) => await ctx.storage.delete(storageId));
    await expect(claim(t, w.ownerId, uploadId, storageId)).rejects.toThrow(MENU_MEDIA_ERROR.empty);
  });

  test("another user than the reserver (even the venue owner) gets menu/not_found", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.editorId, articleId);
    const storageId = await storeBlob(t, 1000);
    await expect(claim(t, w.ownerId, uploadId, storageId)).rejects.toThrow(MENU_ERROR.notFound);
    await expect(claim(t, w.managerId, uploadId, storageId)).rejects.toThrow(MENU_ERROR.notFound);
    expect((await uploadRow(t, uploadId))?.storageId).toBeUndefined();
    expect(await blobExists(t, storageId)).toBe(true);
    // The reserver can.
    expect((await claim(t, w.editorId, uploadId, storageId)).status).toBe("ready");
  });

  test("outsiders, finance, view-only, the owner of another venue and anonymous callers are refused", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId);
    const storageId = await storeBlob(t, 1000);
    for (const userId of [w.outsiderId, w.financeId, w.viewOnlyId, w.otherOwnerId]) {
      await expect(claim(t, userId, uploadId, storageId)).rejects.toThrow(MENU_ERROR.notFound);
    }
    await expect(
      t.mutation(api.menuMedia.uploadContext, { secret: SECRET, uploadId, storageId }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    expect((await uploadRow(t, uploadId))?.storageId).toBeUndefined();
  });

  test("a processed upload answers done with its image id", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    const { mediaId } = await commit(t, w.ownerId, uploadId, storageId, await storeVariants(t));
    expect(await claim(t, w.ownerId, uploadId, storageId)).toEqual({ status: "done", mediaId });
  });

  test("with client editing off the editor cannot claim an upload reserved earlier", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.editorId, articleId);
    const storageId = await storeBlob(t, 1000);
    await t.run(async (ctx) => await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false }));
    await expect(claim(t, w.editorId, uploadId, storageId)).rejects.toThrow(MENU_ERROR.editingDisabled);
  });
});

// =============================================================================
// failUpload
// =============================================================================

describe("menuMedia.failUpload", () => {
  test("a reserved upload fails and its claimed blob is deleted", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    expect(await as(t, w.ownerId).mutation(api.menuMedia.failUpload, { secret: SECRET, uploadId })).toEqual({ ok: true });
    expect((await uploadRow(t, uploadId))?.status).toBe("failed");
    expect(await blobExists(t, storageId)).toBe(false);
  });

  test("a reserved upload without a blob just fails", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId);
    expect(await as(t, w.ownerId).mutation(api.menuMedia.failUpload, { secret: SECRET, uploadId })).toEqual({ ok: true });
    expect((await uploadRow(t, uploadId))?.status).toBe("failed");
  });

  test("a processed upload is left alone", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    const { mediaId } = await commit(t, w.ownerId, uploadId, storageId, await storeVariants(t));
    expect(await as(t, w.ownerId).mutation(api.menuMedia.failUpload, { secret: SECRET, uploadId })).toEqual({ ok: true });
    expect(await uploadRow(t, uploadId)).toMatchObject({ status: "processed", mediaId });
  });

  test("needs the secret, the reserver and a menu editor", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.editorId, articleId);
    await expect(
      as(t, w.editorId).mutation(api.menuMedia.failUpload, { secret: "nope", uploadId }),
    ).rejects.toThrow(MENU_MEDIA_ERROR.invalidSecret);
    delete process.env.SCANME_PIPELINE_SECRET;
    await expect(
      as(t, w.editorId).mutation(api.menuMedia.failUpload, { secret: SECRET, uploadId }),
    ).rejects.toThrow(MENU_MEDIA_ERROR.disabled);
    process.env.SCANME_PIPELINE_SECRET = SECRET;
    for (const userId of [w.ownerId, w.outsiderId, w.financeId, w.otherOwnerId]) {
      await expect(
        as(t, userId).mutation(api.menuMedia.failUpload, { secret: SECRET, uploadId }),
      ).rejects.toThrow(MENU_ERROR.notFound);
    }
    await expect(t.mutation(api.menuMedia.failUpload, { secret: SECRET, uploadId })).rejects.toThrow(
      MENU_ERROR.unauthenticated,
    );
    expect((await uploadRow(t, uploadId))?.status).toBe("reserved");
    expect(await blobExists(t, storageId)).toBe(true);
  });
});

// =============================================================================
// commitProcessed
// =============================================================================

describe("menuMedia.commitProcessed", () => {
  test("inserts a ready asset of the venue's business, deletes the original, marks the upload processed and sets the article image", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.editorId, articleId);
    const variants = await storeVariants(t, "commit");
    const before = await draftStatus(t, w.ownerId, w.a.menuServiceId);

    const { mediaId } = await commit(t, w.editorId, uploadId, storageId, variants);

    const asset = await t.run(async (ctx) => await ctx.db.get(mediaId));
    expect(asset).toMatchObject({
      businessId: w.a.businessId,
      kind: "image",
      provider: "convex",
      status: "ready",
      variants,
    });
    expect(await blobExists(t, storageId)).toBe(false);
    for (const variant of Object.values(variants)) expect(await blobExists(t, variant.ref)).toBe(true);
    expect(await uploadRow(t, uploadId)).toMatchObject({ status: "processed", mediaId });
    expect(await articleRow(t, articleId)).toMatchObject({
      mediaMode: "image",
      imageMediaId: mediaId,
      updatedByUserId: w.editorId,
    });
    const after = await draftStatus(t, w.ownerId, w.a.menuServiceId);
    expect(after.revision).toBeGreaterThan(before.revision);
  });

  test("the draft becomes dirty while the public menu stays exactly as published", async () => {
    const { t, w, articleId } = await setup();
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).state).toBe("clean");
    const publicBefore = await t.query(api.menuPublic.page, { slug: SLUG_A });
    const mediaBefore = await t.query(api.menuPublic.pageMedia, { slug: SLUG_A });
    expect(publicBefore).not.toBeNull();

    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    await commit(t, w.ownerId, uploadId, storageId, await storeVariants(t));

    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).state).toBe("dirty");
    expect(await t.query(api.menuPublic.page, { slug: SLUG_A })).toEqual(publicBefore);
    expect(await t.query(api.menuPublic.pageMedia, { slug: SLUG_A })).toEqual(mediaBefore);

    // After publishing the new image is public.
    await publishNow(t, w.ownerId, w.a.menuServiceId);
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).state).toBe("clean");
    const mediaAfter = await t.query(api.menuPublic.pageMedia, { slug: SLUG_A });
    expect(Object.keys(mediaAfter)).toHaveLength(1);
  });

  test("is idempotent: a second commit returns the same media id and inserts nothing", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    const first = await commit(t, w.ownerId, uploadId, storageId, await storeVariants(t, "one"));
    const assets = await assetCount(t);
    const revision = (await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision;

    const second = await commit(t, w.ownerId, uploadId, storageId, await storeVariants(t, "two"));
    expect(second).toEqual(first);
    expect(await assetCount(t)).toBe(assets);
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision).toBe(revision);
  });

  test("keeps the icon as the stand-in and does not delete the previous image asset", async () => {
    const { t, w, articleId } = await setup();
    const previous = await insertAsset(t, w.a.businessId);
    await t.run(async (ctx) => await ctx.db.patch(articleId, { mediaMode: "image", imageMediaId: previous, iconKey: "burger" }));
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    const { mediaId } = await commit(t, w.ownerId, uploadId, storageId, await storeVariants(t));
    expect(mediaId).not.toBe(previous);
    expect(await articleRow(t, articleId)).toMatchObject({ imageMediaId: mediaId, iconKey: "burger", mediaMode: "image" });
    expect(await t.run(async (ctx) => (await ctx.db.get(previous))?.status)).toBe("ready");
  });

  test("dimensions over 2400 px, zero or fractional dimensions and zero bytes are menu/invalid_input and nothing is written", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    const assets = await assetCount(t);
    const revision = (await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision;
    const good = await storeVariants(t);
    const bads: Variants[] = [
      { ...good, avif: { ...good.avif, width: 2401 } },
      { ...good, webp: { ...good.webp, height: 2401 } },
      { ...good, thumb: { ...good.thumb, width: 0 } },
      { ...good, thumb: { ...good.thumb, height: 10.5 } },
      { ...good, avif: { ...good.avif, bytes: 0 } },
    ];
    for (const bad of bads) {
      await expect(commit(t, w.ownerId, uploadId, storageId, bad)).rejects.toThrow(MENU_ERROR.invalidInput);
    }
    expect(await assetCount(t)).toBe(assets);
    expect(await uploadRow(t, uploadId)).toMatchObject({ status: "reserved", storageId });
    expect(await blobExists(t, storageId)).toBe(true);
    expect((await articleRow(t, articleId))?.mediaMode).toBe("none");
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision).toBe(revision);
    // 2400 exactly is accepted.
    const edge: Variants = { ...good, avif: { ...good.avif, width: 2400, height: 2400 } };
    await commit(t, w.ownerId, uploadId, storageId, edge);
  });

  test("a storageId other than the claimed one, or a commit before any claim, is media/wrong_state", async () => {
    const { t, w, articleId } = await setup();
    const unclaimed = await reserve(t, w.ownerId, articleId);
    const stray = await storeBlob(t, 100);
    const variants = await storeVariants(t);
    await expect(commit(t, w.ownerId, unclaimed.uploadId, stray, variants)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);

    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    await expect(commit(t, w.ownerId, uploadId, stray, variants)).rejects.toThrow(MENU_MEDIA_ERROR.wrongState);
    expect(await assetCount(t)).toBe(0);
    expect(await blobExists(t, storageId)).toBe(true);
    expect(await blobExists(t, stray)).toBe(true);
    expect((await uploadRow(t, uploadId))?.status).toBe("reserved");
  });

  test("a failed upload cannot be committed", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    await as(t, w.ownerId).mutation(api.menuMedia.failUpload, { secret: SECRET, uploadId });
    await expect(commit(t, w.ownerId, uploadId, storageId, await storeVariants(t))).rejects.toThrow(
      MENU_MEDIA_ERROR.wrongState,
    );
    expect(await assetCount(t)).toBe(0);
  });

  test("a wrong or missing secret commits nothing", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.ownerId, articleId);
    const variants = await storeVariants(t);
    await expect(commit(t, w.ownerId, uploadId, storageId, variants, "wrong")).rejects.toThrow(MENU_MEDIA_ERROR.invalidSecret);
    delete process.env.SCANME_PIPELINE_SECRET;
    await expect(commit(t, w.ownerId, uploadId, storageId, variants)).rejects.toThrow(MENU_MEDIA_ERROR.disabled);
    expect(await assetCount(t)).toBe(0);
    expect((await uploadRow(t, uploadId))?.status).toBe("reserved");
    expect(await blobExists(t, storageId)).toBe(true);
    expect((await articleRow(t, articleId))?.mediaMode).toBe("none");
  });

  test("only the reserver, still a menu editor, can commit; everyone else is refused", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.editorId, articleId);
    const variants = await storeVariants(t);
    for (const userId of [w.ownerId, w.managerId, w.outsiderId, w.financeId, w.viewOnlyId, w.otherOwnerId]) {
      await expect(commit(t, userId, uploadId, storageId, variants)).rejects.toThrow(MENU_ERROR.notFound);
    }
    await expect(
      t.mutation(api.menuMedia.commitProcessed, { secret: SECRET, uploadId, storageId, variants }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    await t.run(async (ctx) => await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false }));
    await expect(commit(t, w.editorId, uploadId, storageId, variants)).rejects.toThrow(MENU_ERROR.editingDisabled);
    expect(await assetCount(t)).toBe(0);
    expect((await articleRow(t, articleId))?.mediaMode).toBe("none");
  });

  test("tenant isolation: the asset belongs to the uploader's business, never to another", async () => {
    const { t, w, articleBId } = await setup();
    const { uploadId, storageId } = await claimed(t, w.otherOwnerId, articleBId);
    const { mediaId } = await commit(t, w.otherOwnerId, uploadId, storageId, await storeVariants(t));
    expect((await t.run(async (ctx) => await ctx.db.get(mediaId)))?.businessId).toBe(w.b.businessId);
  });
});

// =============================================================================
// setArticleMedia
// =============================================================================

describe("menuMedia.setArticleMedia", () => {
  test("switches to an icon, then to an image of this business, then to none, each through the draft", async () => {
    const { t, w, articleId } = await setup();
    const asset = await insertAsset(t, w.a.businessId);
    const r0 = (await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision;

    const icon: Choice = { mediaMode: "icon", iconKey: "burger", imageMediaId: null };
    expect(await setMedia(t, w.ownerId, articleId, NONE, icon)).toEqual({ ok: true });
    expect(await articleRow(t, articleId)).toMatchObject({ mediaMode: "icon", iconKey: "burger" });
    const r1 = (await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision;
    expect(r1).toBeGreaterThan(r0);

    const image: Choice = { mediaMode: "image", iconKey: "burger", imageMediaId: asset };
    expect(await setMedia(t, w.ownerId, articleId, icon, image)).toEqual({ ok: true });
    expect(await articleRow(t, articleId)).toMatchObject({ mediaMode: "image", iconKey: "burger", imageMediaId: asset });

    // Clearing keeps the asset (published versions may still show it).
    expect(await setMedia(t, w.ownerId, articleId, image, NONE)).toEqual({ ok: true });
    const row = await articleRow(t, articleId);
    expect(row?.mediaMode).toBe("none");
    expect(row?.iconKey).toBeUndefined();
    expect(row?.imageMediaId).toBeUndefined();
    expect(await t.run(async (ctx) => (await ctx.db.get(asset))?.status)).toBe("ready");
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision).toBeGreaterThan(r1);
  });

  test("a stale expected choice returns the conflict with current and attempted and writes nothing", async () => {
    const { t, w, articleId } = await setup();
    const icon: Choice = { mediaMode: "icon", iconKey: "pizza", imageMediaId: null };
    await setMedia(t, w.ownerId, articleId, NONE, icon);
    const before = await articleRow(t, articleId);
    const revision = (await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision;

    const stale = await setMedia(t, w.managerId, articleId, NONE, { mediaMode: "icon", iconKey: "burger", imageMediaId: null });
    expect(stale).toEqual({
      ok: false,
      conflicts: ["media"],
      current: { media: "icon|pizza|" },
      attempted: { media: "icon|burger|" },
    });
    expect(await articleRow(t, articleId)).toEqual(before);
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision).toBe(revision);
  });

  test("setting what is already set is a no-op that does not touch the draft", async () => {
    const { t, w, articleId } = await setup();
    const revision = (await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision;
    expect(await setMedia(t, w.ownerId, articleId, NONE, NONE)).toEqual({ ok: true });
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision).toBe(revision);
  });

  test("image mode without an image id, an empty icon and a 61 character icon key are menu/invalid_input", async () => {
    const { t, w, articleId } = await setup();
    await expect(
      setMedia(t, w.ownerId, articleId, NONE, { mediaMode: "image", iconKey: null, imageMediaId: null }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    await expect(
      setMedia(t, w.ownerId, articleId, NONE, { mediaMode: "icon", iconKey: "   ", imageMediaId: null }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    await expect(
      setMedia(t, w.ownerId, articleId, NONE, { mediaMode: "icon", iconKey: "k".repeat(61), imageMediaId: null }),
    ).rejects.toThrow(MENU_ERROR.invalidInput);
    expect((await articleRow(t, articleId))?.mediaMode).toBe("none");
    // 60 characters is the longest accepted.
    expect(
      await setMedia(t, w.ownerId, articleId, NONE, { mediaMode: "icon", iconKey: "k".repeat(60), imageMediaId: null }),
    ).toEqual({ ok: true });
  });

  test("an image of ANOTHER business, and one that is purged, is menu/not_found and nothing is written", async () => {
    const { t, w, articleId } = await setup();
    const foreign = await insertAsset(t, w.b.businessId);
    const purged = await insertAsset(t, w.a.businessId, "purged");
    const revision = (await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision;
    for (const imageMediaId of [foreign, purged]) {
      await expect(
        setMedia(t, w.ownerId, articleId, NONE, { mediaMode: "image", iconKey: null, imageMediaId }),
      ).rejects.toThrow(MENU_ERROR.notFound);
    }
    expect((await articleRow(t, articleId))?.mediaMode).toBe("none");
    expect((await draftStatus(t, w.ownerId, w.a.menuServiceId)).revision).toBe(revision);
  });

  test("owner, manager, editor and admin may set; finance, view-only, outsider and the other venue's owner get not_found; anonymous is refused", async () => {
    const { t, w, articleId } = await setup();
    const icon: Choice = { mediaMode: "icon", iconKey: "burger", imageMediaId: null };
    for (const userId of [w.financeId, w.viewOnlyId, w.outsiderId, w.otherOwnerId]) {
      await expect(setMedia(t, userId, articleId, NONE, icon)).rejects.toThrow(MENU_ERROR.notFound);
    }
    await expect(
      t.mutation(api.menuMedia.setArticleMedia, { articleId, expected: NONE, next: icon }),
    ).rejects.toThrow(MENU_ERROR.unauthenticated);
    expect((await articleRow(t, articleId))?.mediaMode).toBe("none");

    let current: Choice = NONE;
    for (const [index, userId] of [w.ownerId, w.managerId, w.editorId, w.adminId].entries()) {
      const next: Choice = { mediaMode: "icon", iconKey: `ikona-${index}`, imageMediaId: null };
      expect(await setMedia(t, userId, articleId, current, next)).toEqual({ ok: true });
      current = next;
    }
    expect((await articleRow(t, articleId))?.iconKey).toBe("ikona-3");
  });

  test("with client editing off the owner gets menu/editing_disabled", async () => {
    const { t, w, articleId } = await setup();
    await t.run(async (ctx) => await ctx.db.patch(w.a.serviceProfileId, { clientEditingEnabled: false }));
    await expect(
      setMedia(t, w.ownerId, articleId, NONE, { mediaMode: "icon", iconKey: "burger", imageMediaId: null }),
    ).rejects.toThrow(MENU_ERROR.editingDisabled);
  });

  test("tenant isolation: tenant B's article is not_found for tenant A's owner", async () => {
    const { t, w, articleBId } = await setup();
    await expect(
      setMedia(t, w.ownerId, articleBId, NONE, { mediaMode: "icon", iconKey: "burger", imageMediaId: null }),
    ).rejects.toThrow(MENU_ERROR.notFound);
  });
});

// =============================================================================
// reapOrphans
// =============================================================================

describe("menuMedia.reapOrphans", () => {
  test("deletes reserved and failed uploads older than 24 h with their blobs; fresh and processed ones stay", async () => {
    const { t, w, articleId } = await setup();
    const now = Date.now();
    const old = now - DAY_MS - 60_000;
    const recent = now - DAY_MS + 60 * 60 * 1000;
    const media = await insertAsset(t, w.a.businessId);

    const ids = await t.run(async (ctx) => {
      const blob = async () => await ctx.storage.store(new Blob(["x"]));
      const row = async (
        status: "reserved" | "failed" | "processed",
        createdAt: number,
        storageId?: Id<"_storage">,
        mediaId?: Id<"mediaAssets">,
      ) =>
        await ctx.db.insert("menuMediaUploads", {
          menuServiceId: w.a.menuServiceId,
          articleId,
          userId: w.ownerId,
          status,
          createdAt,
          updatedAt: createdAt,
          ...(storageId ? { storageId } : {}),
          ...(mediaId ? { mediaId } : {}),
        });
      const oldReservedBlob = await blob();
      const oldFailedBlob = await blob();
      const freshBlob = await blob();
      const recentBlob = await blob();
      const goneBlob = await blob();
      await ctx.storage.delete(goneBlob);
      return {
        oldReserved: await row("reserved", old, oldReservedBlob),
        oldReservedBlob,
        oldFailed: await row("failed", old, oldFailedBlob),
        oldFailedBlob,
        oldNoBlob: await row("reserved", old),
        oldGoneBlob: await row("failed", old, goneBlob),
        fresh: await row("reserved", now, freshBlob),
        freshBlob,
        recent: await row("reserved", recent, recentBlob),
        recentBlob,
        oldProcessed: await row("processed", old, undefined, media),
      };
    });

    const result = await t.mutation(internal.menuMedia.reapOrphans, {});
    expect(result).toEqual({ reaped: 4 });

    const exists = async (id: Id<"menuMediaUploads">) => (await uploadRow(t, id)) !== null;
    expect(await exists(ids.oldReserved)).toBe(false);
    expect(await exists(ids.oldFailed)).toBe(false);
    expect(await exists(ids.oldNoBlob)).toBe(false);
    expect(await exists(ids.oldGoneBlob)).toBe(false);
    expect(await blobExists(t, ids.oldReservedBlob)).toBe(false);
    expect(await blobExists(t, ids.oldFailedBlob)).toBe(false);

    expect(await exists(ids.fresh)).toBe(true);
    expect(await exists(ids.recent)).toBe(true);
    expect(await exists(ids.oldProcessed)).toBe(true);
    expect(await blobExists(t, ids.freshBlob)).toBe(true);
    expect(await blobExists(t, ids.recentBlob)).toBe(true);

    // Nothing left to do on a second run.
    expect(await t.mutation(internal.menuMedia.reapOrphans, {})).toEqual({ reaped: 0 });
  });

  test("a just-reserved upload survives and is reaped once it is older than 24 h", async () => {
    const { t, w, articleId } = await setup();
    const { uploadId } = await reserve(t, w.ownerId, articleId);
    expect(await t.mutation(internal.menuMedia.reapOrphans, {})).toEqual({ reaped: 0 });
    // The row is aged directly (createdAt in the past) instead of moving the clock.
    await t.run(async (ctx) => {
      const old = Date.now() - DAY_MS - 1;
      await ctx.db.patch(uploadId, { createdAt: old, updatedAt: old });
    });
    expect(await t.mutation(internal.menuMedia.reapOrphans, {})).toEqual({ reaped: 1 });
    expect(await uploadRow(t, uploadId)).toBeNull();
  });
});
