import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { env, mutation, type MutationCtx } from "./_generated/server";
import { getEntitlement } from "./lib/entitlements";
import { normalizeCode } from "./lib/codes";
import {
  generateUploadUrl,
  getUrl as storageGetUrl,
  remove as storageRemove,
} from "./lib/storage";
import {
  bumpShardedCount,
  sessionCountKey,
  spaceCountKey,
} from "./lib/countShards";
import {
  ORIGINAL_MAX_BYTES,
  PIPELINE_ERROR,
} from "../lib/memories-pipeline/protocol";

// =============================================================================
// TASK-15 — The reserve→commit protocol's Convex half (RFC-001 §2.8, risk #2).
//
// The sharp transform runs in a Next.js route handler (app/api/m/[code]/
// process), OUTSIDE Convex's transactional world. These two mutations are what
// keep the database authoritative anyway:
//
//   uploadContext — the CLAIM. Validates the photo is a `reserved` slot owned
//     by this guest, flips it to `processing`, pins the uploaded original
//     (originalStorageId), and returns everything the transform needs: the
//     entitlement's maxImageDimension (server-authoritative — the client's own
//     downscale is bandwidth UX only), the business logo URL, a signed URL for
//     the original, and three upload URLs for the variants.
//
//   commitProcessed — the COMMIT. In one transaction: inserts `mediaAssets`,
//     flips the photo to `ready`, deletes the original blob, and increments
//     the photoCount rollups. Idempotent per photoId, and it validates the
//     photo's STATE MACHINE, not just the secret — a leaked secret must still
//     not be able to inject an asset onto a photo that was never reserved
//     (only `processing` rows whose pinned original matches can commit).
//
// Both are PUBLIC mutations by necessity — the route handler calls them over
// ConvexHttpClient, which cannot reach internal functions — and are gated by
// SCANME_PIPELINE_SECRET (server env on both platforms, never client-visible,
// rotatable). A crash anywhere between claim and commit leaves a `processing`
// row + pinned original that memories.purgeStaleReservations reaps after 24h:
// a crash costs storage for one day, not forever.
//
// Every ConvexError here carries a MACHINE CODE, not prose: the only caller is
// our own route handler, which maps codes to HTTP statuses. Guest-facing copy
// for upload failures belongs to the TASK-17 UI and the i18n layer; nothing in
// this file is user-facing.
// =============================================================================

// Sanity bound for committed variant dimensions (premium tier clamps at 4096;
// nothing legitimate exceeds it, with headroom).
const VARIANT_MAX_DIMENSION = 8192;

// Constant-time string equality. The default Convex runtime has no
// node:crypto, so this is the classic XOR fold; unlike the audited demo.seed
// compare (RFC §1.e), it does not short-circuit on the first differing byte.
// (Length is not secret.)
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function requirePipelineSecret(provided: string) {
  const expected = env.SCANME_PIPELINE_SECRET;
  if (!expected) throw new ConvexError(PIPELINE_ERROR.disabled);
  if (!timingSafeEqualString(provided, expected)) {
    throw new ConvexError(PIPELINE_ERROR.invalidSecret);
  }
}

// Load the photo through the (space, guest) pair the route authenticated.
// A missing photo, a photo of another space, and a photo of another guest all
// throw the same notFound — existence is never disclosed across guests
// (same masking as memories.deleteMyPhoto).
async function loadOwnedPhoto(
  ctx: MutationCtx,
  rawCode: string,
  guestKey: string,
  photoId: Id<"memoriesPhotos">,
) {
  const code = normalizeCode(rawCode);
  if (!code) throw new ConvexError(PIPELINE_ERROR.notFound);
  const space = await ctx.db
    .query("memoriesSpaces")
    .withIndex("by_code", (q) => q.eq("code", code))
    .unique();
  if (!space) throw new ConvexError(PIPELINE_ERROR.notFound);
  const guest = await ctx.db
    .query("memoriesGuests")
    .withIndex("by_spaceId_and_guestKey", (q) =>
      q.eq("spaceId", space._id).eq("guestKey", guestKey),
    )
    .unique();
  if (!guest) throw new ConvexError(PIPELINE_ERROR.notFound);
  const photo = await ctx.db.get(photoId);
  if (!photo || photo.spaceId !== space._id || photo.guestId !== guest._id) {
    throw new ConvexError(PIPELINE_ERROR.notFound);
  }
  return { space, guest, photo };
}

// -----------------------------------------------------------------------------
// The claim
// -----------------------------------------------------------------------------

export const uploadContext = mutation({
  args: {
    secret: v.string(),
    code: v.string(),
    guestKey: v.string(),
    photoId: v.id("memoriesPhotos"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    requirePipelineSecret(args.secret);
    const { space, photo } = await loadOwnedPhoto(
      ctx,
      args.code,
      args.guestKey,
      args.photoId,
    );

    // Idempotent tail: a client retry after a completed run is a success, not
    // an error — the route answers 200 and the guest sees their photo.
    if (photo.status === "ready") return { alreadyReady: true as const };

    // The state machine: only a `reserved` slot can be claimed, and only a
    // `processing` claim can be re-claimed (a retry after a crash mid-
    // transform). hidden/deleted rows admit nothing.
    if (photo.status !== "reserved" && photo.status !== "processing") {
      throw new ConvexError(PIPELINE_ERROR.wrongState);
    }

    // The uploaded original must actually exist, and stay within the decode
    // budget. Metadata comes from the _storage system table — content type is
    // a client-supplied header and deliberately ignored; sharp sniffs the real
    // format on the route.
    const blob = await ctx.db.system.get("_storage", args.storageId);
    if (!blob) throw new ConvexError(PIPELINE_ERROR.blobMissing);
    if (blob.size > ORIGINAL_MAX_BYTES) {
      throw new ConvexError(PIPELINE_ERROR.blobTooLarge);
    }

    // Entitlement re-read at claim time, space-scoped resolution (§2.3). The
    // clamp dimension the transform applies comes from HERE — never from the
    // client.
    const entitlement = await getEntitlement(
      ctx,
      space.businessId,
      "scanme_memories",
      space._id,
    );
    if (!entitlement) throw new ConvexError(PIPELINE_ERROR.notEntitled);

    // A re-claim that presents a NEW original (the client re-uploaded before
    // retrying) supersedes the pinned one: delete the superseded blob so every
    // stored blob stays referenced by exactly one row at all times. The
    // superseded run's commit is refused by the originalStorageId match below.
    if (
      photo.status === "processing" &&
      photo.originalStorageId !== undefined &&
      photo.originalStorageId !== args.storageId
    ) {
      await storageRemove(ctx, photo.originalStorageId);
    }

    const now = Date.now();
    await ctx.db.patch(photo._id, {
      status: "processing",
      originalStorageId: args.storageId,
      updatedAt: now,
    });

    // The business watermark source (RFC §2.8): the tenant's logo, skipped
    // entirely when there is none — the route never substitutes text.
    const business = await ctx.db.get(space.businessId);
    const businessLogoUrl = business?.logoStorageId
      ? await storageGetUrl(ctx, business.logoStorageId)
      : (business?.logoUrl ?? null);

    const originalUrl = await storageGetUrl(ctx, args.storageId);
    if (!originalUrl) throw new ConvexError(PIPELINE_ERROR.blobMissing);

    return {
      alreadyReady: false as const,
      maxImageDimension: entitlement.limits.maxImageDimension,
      businessLogoUrl,
      originalUrl,
      uploads: {
        avif: await generateUploadUrl(ctx),
        webp: await generateUploadUrl(ctx),
        thumb: await generateUploadUrl(ctx),
      },
    };
  },
});

// -----------------------------------------------------------------------------
// The commit
// -----------------------------------------------------------------------------

const variantInputValidator = v.object({
  ref: v.id("_storage"),
  width: v.number(),
  height: v.number(),
});

type VariantInput = { ref: Id<"_storage">; width: number; height: number };

// The stored variant record: dimensions as sharp measured them on the route,
// byte size from the _storage system table — authoritative, never the caller's
// word. Also proves the ref actually exists before it is committed.
async function verifiedVariant(
  ctx: MutationCtx,
  variant: VariantInput,
): Promise<{ ref: string; width: number; height: number; bytes: number }> {
  if (
    !Number.isInteger(variant.width) ||
    !Number.isInteger(variant.height) ||
    variant.width < 1 ||
    variant.height < 1 ||
    variant.width > VARIANT_MAX_DIMENSION ||
    variant.height > VARIANT_MAX_DIMENSION
  ) {
    throw new ConvexError(PIPELINE_ERROR.variantInvalid);
  }
  const blob = await ctx.db.system.get("_storage", variant.ref);
  if (!blob) throw new ConvexError(PIPELINE_ERROR.variantMissing);
  return {
    ref: variant.ref,
    width: variant.width,
    height: variant.height,
    bytes: blob.size,
  };
}

export const commitProcessed = mutation({
  args: {
    secret: v.string(),
    photoId: v.id("memoriesPhotos"),
    // The original this pipeline run claimed. Doubles as the run token: a
    // superseded run (its claim re-claimed with a fresh upload) fails the
    // match below and never commits.
    originalStorageId: v.id("_storage"),
    variants: v.object({
      avif: variantInputValidator,
      webp: variantInputValidator,
      thumb: variantInputValidator,
    }),
  },
  handler: async (ctx, args) => {
    requirePipelineSecret(args.secret);
    const photo = await ctx.db.get(args.photoId);
    if (!photo) throw new ConvexError(PIPELINE_ERROR.notFound);

    // Idempotency per photoId: a retried commit — the route retrying, or two
    // racing runs — finds `ready` and returns the existing asset instead of
    // inserting a second mediaAssets row.
    if (photo.status === "ready" && photo.mediaAssetId !== undefined) {
      return {
        alreadyReady: true as const,
        mediaAssetId: photo.mediaAssetId,
      };
    }

    // THE STATE-MACHINE GATE (risk #2): the secret alone is not enough. Only a
    // photo the quota mutation reserved AND uploadContext claimed — status
    // `processing` — can receive an asset; `reserved` (never claimed),
    // `hidden` and `deleted` are refused even with a valid secret.
    if (photo.status !== "processing") {
      throw new ConvexError(PIPELINE_ERROR.wrongState);
    }
    if (photo.originalStorageId !== args.originalStorageId) {
      throw new ConvexError(PIPELINE_ERROR.staleRun);
    }

    const variants = {
      avif: await verifiedVariant(ctx, args.variants.avif),
      webp: await verifiedVariant(ctx, args.variants.webp),
      thumb: await verifiedVariant(ctx, args.variants.thumb),
    };

    const space = await ctx.db.get(photo.spaceId);
    if (!space) throw new ConvexError(PIPELINE_ERROR.notFound);

    // One transaction: asset insert, ready flip, original delete, rollups
    // (RFC §2.8 step 4). Convex mutations are transactions — a failure
    // anywhere rolls all of it back and the photo stays `processing` for a
    // retry or the 24h reaper.
    const now = Date.now();
    const mediaAssetId = await ctx.db.insert("mediaAssets", {
      businessId: space.businessId,
      kind: "image",
      provider: "convex",
      variants,
      status: "ready",
      createdAt: now,
    });
    await ctx.db.patch(photo._id, {
      status: "ready",
      mediaAssetId,
      // The original is deleted below; clear the pin so no field references a
      // dead blob (C.7: "deleted after processing").
      originalStorageId: undefined,
      updatedAt: now,
    });
    await storageRemove(ctx, args.originalStorageId);

    // The photoCount rollups (§2.8 — stats only, never enforcement; quota is
    // the index count in memories.reserveUpload). The session and space
    // rollups go through SHARDED counters (TASK-24): patching them directly
    // put one session row and one space row in the write set of every commit
    // of the night, which serialized the whole protocol — measured in
    // docs/perf/memories-load.md. The guest rollup stays a direct patch: a
    // guest's commits are sequential by construction (the client queue).
    await bumpShardedCount(ctx, sessionCountKey(photo.sessionId));
    await bumpShardedCount(ctx, spaceCountKey(space._id));
    const guest = await ctx.db.get(photo.guestId);
    if (guest) {
      await ctx.db.patch(guest._id, {
        photoCount: guest.photoCount + 1,
        updatedAt: now,
      });
    }

    return { alreadyReady: false as const, mediaAssetId };
  },
});
