import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { processMenuImage, type MenuMediaPort } from "@/lib/menu/http/image-route";
import { transformMenuImage } from "@/lib/menu/http/image-transform";

// ScanMe Menu V1 (K15) — POST /api/meni/slike: the web versions of an article
// image (master §7.9). Thin: the logic and its tests are in
// lib/menu/http/image-route.ts, the protocol in convex/menuMedia.ts. Runs on
// the Node runtime because sharp needs it (the Memories pipeline,
// app/api/m/[code]/process, made the same choice). The caller is the signed-in
// editor (session token); the pipeline secret proves to Convex that this
// route made the versions.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "Content-Type": "application/json" };

function port(convexUrl: string, token: string): MenuMediaPort {
  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);
  return {
    uploadContext: (args) =>
      convex.mutation(api.menuMedia.uploadContext, {
        secret: args.secret,
        uploadId: args.uploadId as Id<"menuMediaUploads">,
        storageId: args.storageId as Id<"_storage">,
      }),
    failUpload: (args) =>
      convex.mutation(api.menuMedia.failUpload, { secret: args.secret, uploadId: args.uploadId as Id<"menuMediaUploads"> }),
    commitProcessed: (args) =>
      convex.mutation(api.menuMedia.commitProcessed, {
        secret: args.secret,
        uploadId: args.uploadId as Id<"menuMediaUploads">,
        storageId: args.storageId as Id<"_storage">,
        variants: {
          avif: { ...args.variants.avif, ref: args.variants.avif.ref as Id<"_storage"> },
          webp: { ...args.variants.webp, ref: args.variants.webp.ref as Id<"_storage"> },
          thumb: { ...args.variants.thumb, ref: args.variants.thumb.ref as Id<"_storage"> },
        },
      }),
  };
}

async function fetchBytes(url: string): Promise<Buffer | null> {
  const response = await fetch(url);
  if (!response.ok) return null;
  return Buffer.from(await response.arrayBuffer());
}

async function putVariant(uploadUrl: string, data: Buffer, contentType: string): Promise<string | null> {
  const response = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": contentType }, body: new Uint8Array(data) });
  if (!response.ok) return null;
  const body = (await response.json()) as { storageId?: unknown };
  return typeof body.storageId === "string" ? body.storageId : null;
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const result = await processMenuImage(body, {
    token: (await convexAuthNextjsToken()) ?? null,
    secret: process.env.SCANME_PIPELINE_SECRET,
    convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
    port,
    fetchBytes,
    putVariant,
    transform: transformMenuImage,
  });
  return new Response(JSON.stringify(result.body), { status: result.status, headers: HEADERS });
}
