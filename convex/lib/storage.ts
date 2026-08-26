import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// The storage hygiene wrapper (RFC-001 §2.4 C.8, TASK-15). Every storage touch
// of the Memories media pipeline goes through this module — the upload-URL
// mints (reserveUpload, uploadContext), the signed reads (uploadContext), the
// original-blob delete at commit, and the purge cron — so that one concern
// lives in one file. It is NOT a provider abstraction: Convex file storage IS
// the storage (§0.6), there is no config switch and no second implementation.
//
// A `put(blob)` helper is deliberately absent: no Convex function stores blobs
// server-side today. The Next.js pipeline writes variants by POSTing to upload
// URLs minted HERE — mutations cannot call `ctx.storage.store`, and the upload
// URL is the platform primitive for external writers. Add `put` only when an
// action actually needs it.

export async function generateUploadUrl(ctx: MutationCtx): Promise<string> {
  return await ctx.storage.generateUploadUrl();
}

export async function getUrl(
  ctx: QueryCtx | MutationCtx,
  ref: Id<"_storage">,
): Promise<string | null> {
  return await ctx.storage.getUrl(ref);
}

export async function remove(
  ctx: MutationCtx,
  ref: Id<"_storage">,
): Promise<void> {
  await ctx.storage.delete(ref);
}
