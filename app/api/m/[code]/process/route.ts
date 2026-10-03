import { ConvexError } from "convex/values";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeCode } from "@/convex/lib/codes";
import {
  guestCookieName,
  verifyGuestCookieValue,
} from "@/lib/memories-guest-cookie";
import {
  PIPELINE_ERROR,
  type PipelineErrorCode,
} from "@/lib/memories-pipeline/protocol";
import { transformMemoryPhoto } from "@/lib/memories-pipeline/transform";

// =============================================================================
// TASK-15 — POST /api/m/[code]/process: the sharp stage of the image pipeline
// (RFC-001 §2.8). Runs HERE — a Next.js route handler on the Node runtime, on
// purpose, not in a Convex "use node" action: libvips native binaries are
// first-class on Vercel Node functions, while carrying sharp into Convex is
// the fragile path (binary/runtime matching, decoded buffers near the action
// memory ceiling). The stated cost is that this code runs OUTSIDE Convex's
// transactions; the reserve→commit protocol (convex/memoriesPipeline.ts)
// keeps the database authoritative anyway, and the 24h reaper bounds what a
// crash can leak.
//
// The body-size problem is already solved upstream: the browser PUTs the
// original DIRECTLY to Convex storage (reserveUpload's uploadUrl) and this
// route receives only { photoId, storageId } — no image bytes ever ride the
// request.
//
// Flow: verify the guest cookie's HMAC → claim the photo via the secret-gated
// uploadContext (validates `reserved` + ownership server-side; returns the
// entitlement's maxImageDimension and the business logo — NEVER trusted from
// the client) → fetch the original → transform (rotate → strip → clamp →
// watermarks → AVIF/WebP/thumb) → POST the three variants to minted upload
// URLs → secret-gated commit.
//
// Machine-to-machine endpoint: responses are JSON status codes, no prose (the
// TASK-17 guest UI maps statuses to i18n copy).
// =============================================================================

// Node runtime (sharp), never cached — every call is one specific photo's
// processing run.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
};

function json(status: number, body: object) {
  return new Response(JSON.stringify(body), {
    status,
    headers: new Headers({
      ...BASE_HEADERS,
      "Content-Type": "application/json",
    }),
  });
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

// The pipeline mutations answer with machine codes (ConvexError data); this is
// the single place they become HTTP statuses.
function statusForPipelineError(code: PipelineErrorCode): number {
  switch (code) {
    case PIPELINE_ERROR.notFound:
      return 404;
    case PIPELINE_ERROR.wrongState:
    case PIPELINE_ERROR.staleRun:
      return 409;
    case PIPELINE_ERROR.blobMissing:
      return 400;
    case PIPELINE_ERROR.blobTooLarge:
      return 413;
    case PIPELINE_ERROR.notEntitled:
      return 403;
    case PIPELINE_ERROR.disabled:
    case PIPELINE_ERROR.invalidSecret:
      // Both mean the two platforms' env is misconfigured, not a bad request.
      return 503;
    default:
      return 502;
  }
}

function pipelineErrorResponse(error: unknown): Response | null {
  if (error instanceof ConvexError && typeof error.data === "string") {
    const code = error.data as PipelineErrorCode;
    return json(statusForPipelineError(code), { ok: false, code });
  }
  return null;
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

// POST a produced variant to its minted Convex upload URL; returns the storage
// id Convex answers with.
async function putVariant(
  uploadUrl: string,
  data: Buffer,
  contentType: string,
): Promise<Id<"_storage"> | null> {
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: new Uint8Array(data),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { storageId?: unknown };
  return typeof body.storageId === "string"
    ? (body.storageId as Id<"_storage">)
    : null;
}

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/m/[code]/process">,
) {
  const { code: rawCode } = await params;
  const code = normalizeCode(rawCode);
  if (!code) return json(404, { ok: false });

  const guestSecret = process.env.SCANME_GUEST_SECRET;
  const pipelineSecret = process.env.SCANME_PIPELINE_SECRET;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!guestSecret || !pipelineSecret || !convexUrl) {
    return json(503, { ok: false });
  }

  // The guest cookie is the caller's identity (RFC §2.6): HMAC-verified here,
  // so Convex stays crypto-free. No cookie, no pipeline.
  const cookie = readCookie(request, guestCookieName(code));
  const guestKey =
    cookie && cookie.length <= 256
      ? verifyGuestCookieValue(cookie, code, guestSecret)
      : null;
  if (!guestKey) return json(401, { ok: false });

  let photoId: string;
  let storageId: string;
  try {
    const body = (await request.json()) as {
      photoId?: unknown;
      storageId?: unknown;
    };
    if (
      typeof body.photoId !== "string" ||
      typeof body.storageId !== "string" ||
      body.photoId.length > 128 ||
      body.storageId.length > 128
    ) {
      return json(400, { ok: false });
    }
    photoId = body.photoId;
    storageId = body.storageId;
  } catch {
    return json(400, { ok: false });
  }

  const convex = new ConvexHttpClient(convexUrl);

  // 1. THE CLAIM — reserved → processing, original pinned; returns the
  //    server-authoritative context.
  let context;
  try {
    context = await convex.mutation(api.memoriesPipeline.uploadContext, {
      secret: pipelineSecret,
      code,
      guestKey,
      photoId: photoId as Id<"memoriesPhotos">,
      storageId: storageId as Id<"_storage">,
    });
  } catch (error) {
    return pipelineErrorResponse(error) ?? json(502, { ok: false });
  }
  // A retry of an already-completed run is a success, idempotently.
  if (context.alreadyReady) return json(200, { ok: true, alreadyReady: true });

  // 2. THE INPUTS. The business logo is fetched only when the business HAS
  //    one; a fetch failure of an existing logo fails the run (retryable)
  //    rather than silently shipping an unbranded photo — the no-logo skip is
  //    the only path without the bottom-left watermark, and text is never
  //    substituted.
  const original = await fetchBytes(context.originalUrl);
  if (!original) return json(502, { ok: false });
  let businessLogo: Buffer | null = null;
  if (context.businessLogoUrl) {
    businessLogo = await fetchBytes(context.businessLogoUrl);
    if (!businessLogo) return json(502, { ok: false });
  }

  // 3. THE TRANSFORM — rotate() first, strip, clamp to the entitlement,
  //    watermark, encode (lib/memories-pipeline/transform.ts).
  let transformed;
  try {
    transformed = await transformMemoryPhoto(original, {
      maxDimension: context.maxImageDimension,
      businessLogo,
    });
  } catch {
    // Not a decodable image (or a decode bomb). The claim stays `processing`;
    // the 24h reaper frees the slot and the blob.
    return json(422, { ok: false, code: "invalid_image" });
  }

  // 4. STORE the three variants via the minted upload URLs.
  const [avifRef, webpRef, thumbRef] = await Promise.all([
    putVariant(context.uploads.avif, transformed.avif.data, "image/avif"),
    putVariant(context.uploads.webp, transformed.webp.data, "image/webp"),
    putVariant(context.uploads.thumb, transformed.thumb.data, "image/webp"),
  ]);
  if (!avifRef || !webpRef || !thumbRef) return json(502, { ok: false });

  // 5. THE COMMIT — one Convex transaction: mediaAssets insert, ready flip,
  //    original delete, rollups. Idempotent per photoId and state-machine
  //    validated on the Convex side.
  try {
    await convex.mutation(api.memoriesPipeline.commitProcessed, {
      secret: pipelineSecret,
      photoId: photoId as Id<"memoriesPhotos">,
      originalStorageId: storageId as Id<"_storage">,
      variants: {
        avif: {
          ref: avifRef,
          width: transformed.avif.width,
          height: transformed.avif.height,
        },
        webp: {
          ref: webpRef,
          width: transformed.webp.width,
          height: transformed.webp.height,
        },
        thumb: {
          ref: thumbRef,
          width: transformed.thumb.width,
          height: transformed.thumb.height,
        },
      },
    });
  } catch (error) {
    return pipelineErrorResponse(error) ?? json(502, { ok: false });
  }

  // One structured line per processed photo: the wedding-night observability
  // for "how long does an encode take in production" (no PII — ids only).
  const { timings } = transformed;
  console.log(
    JSON.stringify({
      route: "m/process",
      photoId,
      width: transformed.avif.width,
      height: transformed.avif.height,
      prepareMs: Math.round(timings.prepareMs),
      avifMs: Math.round(timings.avifMs),
      webpMs: Math.round(timings.webpMs),
      thumbMs: Math.round(timings.thumbMs),
      avifBytes: transformed.avif.data.length,
      webpBytes: transformed.webp.data.length,
      thumbBytes: transformed.thumb.data.length,
    }),
  );

  return json(200, { ok: true });
}
