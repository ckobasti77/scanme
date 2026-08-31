import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { rateLimiter } from "./lib/rateLimits";
import { generateUploadUrl, getUrl, remove } from "./lib/storage";
import { requireText } from "./lib/validation";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const UPLOAD_LIFETIME_MS = 24 * 60 * 60 * 1000;
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/svg+xml"]);

function validateSessionToken(value: string): string {
  return requireText(value, "Oznaka sesije", 32, 128);
}

export const reserve = mutation({
  args: { sessionToken: v.string(), fileName: v.string() },
  returns: v.object({
    uploadId: v.id("offerLogoUploads"),
    uploadUrl: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const sessionToken = validateSessionToken(args.sessionToken);
    const fileName = requireText(args.fileName, "Naziv fajla", 1, 180);
    const limited = await rateLimiter.limit(ctx, "offerLogoUpload", {
      key: sessionToken,
    });
    if (!limited.ok) {
      throw new ConvexError("Previše pokušaja. Sačekajte malo i pokušajte ponovo.");
    }

    const now = Date.now();
    const expiresAt = now + UPLOAD_LIFETIME_MS;
    const uploadId = await ctx.db.insert("offerLogoUploads", {
      sessionToken,
      fileName,
      status: "reserved",
      createdAt: now,
      updatedAt: now,
      expiresAt,
    });
    await ctx.scheduler.runAt(expiresAt, internal.offerLogoUploads.cleanupAbandoned, {
      uploadId,
    });
    return { uploadId, uploadUrl: await generateUploadUrl(ctx), expiresAt };
  },
});

export const commit = mutation({
  args: {
    uploadId: v.id("offerLogoUploads"),
    sessionToken: v.string(),
    storageId: v.id("_storage"),
  },
  returns: v.union(
    v.object({ status: v.literal("ready"), previewUrl: v.union(v.string(), v.null()) }),
    v.object({
      status: v.literal("rejected"),
      reason: v.union(v.literal("missing"), v.literal("type"), v.literal("size")),
    }),
  ),
  handler: async (ctx, args) => {
    const sessionToken = validateSessionToken(args.sessionToken);
    const upload = await ctx.db.get("offerLogoUploads", args.uploadId);
    if (!upload || upload.sessionToken !== sessionToken) {
      throw new ConvexError("Logo upload nije pronađen.");
    }
    if (upload.expiresAt <= Date.now()) {
      throw new ConvexError("Logo upload je istekao. Dodajte logo ponovo.");
    }
    if (upload.status === "attached") {
      throw new ConvexError("Logo je već vezan za poslati upit.");
    }
    if (upload.status === "ready") {
      if (upload.storageId !== args.storageId) {
        throw new ConvexError("Logo upload se ne poklapa sa rezervacijom.");
      }
      return { status: "ready" as const, previewUrl: await getUrl(ctx, args.storageId) };
    }

    const metadata = await ctx.db.system.get("_storage", args.storageId);
    if (!metadata) return { status: "rejected" as const, reason: "missing" as const };
    if (!metadata.contentType || !ALLOWED_CONTENT_TYPES.has(metadata.contentType)) {
      await remove(ctx, args.storageId);
      await ctx.db.delete("offerLogoUploads", upload._id);
      return { status: "rejected" as const, reason: "type" as const };
    }
    if (metadata.size > MAX_FILE_SIZE) {
      await remove(ctx, args.storageId);
      await ctx.db.delete("offerLogoUploads", upload._id);
      return { status: "rejected" as const, reason: "size" as const };
    }

    await ctx.db.patch("offerLogoUploads", upload._id, {
      storageId: args.storageId,
      contentType: metadata.contentType,
      size: metadata.size,
      status: "ready",
      updatedAt: Date.now(),
    });
    return { status: "ready" as const, previewUrl: await getUrl(ctx, args.storageId) };
  },
});

export const preview = query({
  args: { uploadId: v.id("offerLogoUploads"), sessionToken: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: v.union(v.literal("reserved"), v.literal("ready"), v.literal("attached")),
      fileName: v.string(),
      previewUrl: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("offerLogoUploads", args.uploadId);
    if (!upload || upload.sessionToken !== args.sessionToken) return null;
    return {
      status: upload.status,
      fileName: upload.fileName,
      previewUrl: upload.storageId ? await ctx.storage.getUrl(upload.storageId) : null,
    };
  },
});

export const cleanupAbandoned = internalMutation({
  args: { uploadId: v.id("offerLogoUploads") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const upload = await ctx.db.get("offerLogoUploads", args.uploadId);
    if (!upload || upload.status === "attached" || upload.expiresAt > Date.now()) return null;
    if (upload.storageId) await remove(ctx, upload.storageId);
    await ctx.db.delete("offerLogoUploads", upload._id);
    return null;
  },
});

export async function readyStorageForLead(
  ctx: MutationCtx,
  uploadId: Id<"offerLogoUploads">,
  sessionToken: string,
): Promise<Id<"_storage">> {
  const upload = await ctx.db.get("offerLogoUploads", uploadId);
  if (
    !upload ||
    upload.sessionToken !== validateSessionToken(sessionToken) ||
    upload.status !== "ready" ||
    !upload.storageId ||
    upload.expiresAt <= Date.now()
  ) {
    throw new ConvexError("Logo nije spreman. Dodajte ga ponovo pre slanja upita.");
  }
  return upload.storageId;
}
