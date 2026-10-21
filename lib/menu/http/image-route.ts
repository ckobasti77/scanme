import { ConvexError } from "convex/values";
import { MENU_ERROR } from "../errors/core";
import { MENU_MEDIA_ERROR } from "../errors/media";
import type { MenuImageVersions } from "./image-transform";

// =============================================================================
// ScanMe Menu V1 (K15) — POST /api/meni/slike, the sharp stage of an article
// image (master §7.9). The route file (app/api/meni/slike/route.ts) is thin:
// it reads the session token and the env and calls this with real
// dependencies; the tests call it with fakes. The protocol is in
// convex/menuMedia.ts:
//   body { uploadId, storageId } → uploadContext (claim: the stored original
//   is the right type and size, the caller reserved it) → fetch the original
//   → transform (rotate, ≤ 2.400 px, no metadata, AVIF + WebP + thumbnail) →
//   POST the versions to the minted upload URLs → commitProcessed (one
//   transaction: image, original deleted, article image in the draft).
// The browser never sends image bytes here (it stored the original in
// Convex storage itself), only two ids.
// Answers are JSON with a machine code; the editor words them through
// menu-domen (`errors[code]`).
// =============================================================================

export type MenuUploadContext =
  | { status: "done"; mediaId: string }
  | { status: "refused"; code: string }
  | {
      status: "ready";
      originalUrl: string;
      maxDimension: number;
      uploads: { avif: string; webp: string; thumb: string };
    };

type Variant = { ref: string; width: number; height: number; bytes: number };

/** The three Convex mutations the route calls, with the caller's session already set. */
export type MenuMediaPort = {
  uploadContext(args: { secret: string; uploadId: string; storageId: string }): Promise<MenuUploadContext>;
  failUpload(args: { secret: string; uploadId: string }): Promise<unknown>;
  commitProcessed(args: {
    secret: string;
    uploadId: string;
    storageId: string;
    variants: { avif: Variant; webp: Variant; thumb: Variant };
  }): Promise<{ mediaId: string }>;
};

export type MenuImageRouteDeps = {
  /** The signed-in user's Convex token (null = not signed in). */
  token: string | null;
  secret: string | undefined;
  convexUrl: string | undefined;
  /** The mutations, as the signed-in user. */
  port: (convexUrl: string, token: string) => MenuMediaPort;
  fetchBytes: (url: string) => Promise<Buffer | null>;
  putVariant: (uploadUrl: string, data: Buffer, contentType: string) => Promise<string | null>;
  transform: (original: Buffer, maxDimension: number) => Promise<MenuImageVersions>;
};

export type MenuImageRouteResult = { status: number; body: { ok: boolean; code?: string; mediaId?: string } };

const ID = /^[A-Za-z0-9_-]{1,128}$/;

/** A Convex refusal (ConvexError with a machine code) as an HTTP status. */
export function statusForMenuMediaCode(code: string): number {
  switch (code) {
    case MENU_ERROR.unauthenticated:
      return 401;
    case MENU_ERROR.forbidden:
    case MENU_ERROR.editingDisabled:
    case MENU_ERROR.serviceInactive:
      return 403;
    case MENU_ERROR.notFound:
      return 404;
    case MENU_MEDIA_ERROR.wrongState:
      return 409;
    case MENU_MEDIA_ERROR.tooLarge:
      return 413;
    case MENU_MEDIA_ERROR.wrongType:
    case MENU_MEDIA_ERROR.heic:
    case MENU_MEDIA_ERROR.empty:
    case MENU_MEDIA_ERROR.unreadable:
      return 422;
    case MENU_MEDIA_ERROR.disabled:
    case MENU_MEDIA_ERROR.invalidSecret:
      // Both mean the two platforms' env is misconfigured, not a bad request.
      return 503;
    default:
      return 502;
  }
}

function refusal(error: unknown): MenuImageRouteResult {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return { status: statusForMenuMediaCode(error.data), body: { ok: false, code: error.data } };
  }
  return { status: 502, body: { ok: false } };
}

function readBody(body: unknown): { uploadId: string; storageId: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const { uploadId, storageId } = body as { uploadId?: unknown; storageId?: unknown };
  if (typeof uploadId !== "string" || typeof storageId !== "string") return null;
  if (!ID.test(uploadId) || !ID.test(storageId)) return null;
  return { uploadId, storageId };
}

export async function processMenuImage(body: unknown, deps: MenuImageRouteDeps): Promise<MenuImageRouteResult> {
  if (!deps.secret || !deps.convexUrl) return { status: 503, body: { ok: false, code: MENU_MEDIA_ERROR.disabled } };
  if (!deps.token) return { status: 401, body: { ok: false, code: MENU_ERROR.unauthenticated } };
  const ids = readBody(body);
  if (!ids) return { status: 400, body: { ok: false, code: MENU_ERROR.invalidInput } };
  const port = deps.port(deps.convexUrl, deps.token);
  const { secret } = deps;

  // 1. The claim: the stored blob is checked against its real `_storage` metadata.
  let context: MenuUploadContext;
  try {
    context = await port.uploadContext({ secret, ...ids });
  } catch (error) {
    return refusal(error);
  }
  if (context.status === "done") return { status: 200, body: { ok: true, mediaId: context.mediaId } };
  if (context.status === "refused") {
    return { status: statusForMenuMediaCode(context.code), body: { ok: false, code: context.code } };
  }

  // 2. The original and 3. the transform. A file that does not decode fails the upload.
  const original = await deps.fetchBytes(context.originalUrl);
  if (!original) return { status: 502, body: { ok: false } };
  let versions: MenuImageVersions;
  try {
    versions = await deps.transform(original, context.maxDimension);
  } catch {
    try {
      await port.failUpload({ secret, uploadId: ids.uploadId });
    } catch {
      // The day-old reaper removes it anyway.
    }
    return { status: 422, body: { ok: false, code: MENU_MEDIA_ERROR.unreadable } };
  }

  // 4. The versions, then 5. the commit (idempotent on the Convex side).
  const [avif, webp, thumb] = await Promise.all([
    deps.putVariant(context.uploads.avif, versions.avif.data, "image/avif"),
    deps.putVariant(context.uploads.webp, versions.webp.data, "image/webp"),
    deps.putVariant(context.uploads.thumb, versions.thumb.data, "image/webp"),
  ]);
  if (!avif || !webp || !thumb) return { status: 502, body: { ok: false } };
  const variant = (ref: string, v: MenuImageVersions["avif"]): Variant => ({
    ref,
    width: v.width,
    height: v.height,
    bytes: v.data.length,
  });
  try {
    const { mediaId } = await port.commitProcessed({
      secret,
      ...ids,
      variants: { avif: variant(avif, versions.avif), webp: variant(webp, versions.webp), thumb: variant(thumb, versions.thumb) },
    });
    return { status: 200, body: { ok: true, mediaId } };
  } catch (error) {
    return refusal(error);
  }
}
