import {
  detectImageFormat,
  SNIFF_BYTES,
  type DetectedFormat,
} from "./detect";

// TASK-16 STEPS 1+2 — decode whatever the phone handed over, downscale, and
// encode a fast JPEG for the wire.
//
// WHAT THIS SHRINK IS — AND IS NOT. The downscale/encode here is BANDWIDTH UX
// ONLY: it exists so a 12 MP, 4 MB phone photo does not ride a saturated
// wedding-hall uplink at full size. It is NOT a security control and NOT the
// product's real clamp — the server re-decodes and re-clamps unconditionally
// to the plan's dimension (lib/memories-pipeline/transform.ts), so a hostile
// client that skips all of this changes nothing about what is stored or
// served.
//
// Deliberately NOT here (RFC-001 §2.8):
//  - NO AVIF ENCODE ON THE CLIENT: AVIF encoding costs seconds per image on a
//    mid-range Android and encoder support is uneven; the server produces the
//    AVIF (and WebP) variants from our JPEG.
//  - NO WATERMARK ON THE CLIENT: a client-drawn mark is trivially stripped by
//    a modified client; the server composites both watermarks
//    authoritatively.
//
// DECODING REALITY (STEP 1): on iOS, a photo picked through
// `<input type="file" accept="image/*">` is usually ALREADY transcoded to
// JPEG by the system picker. HEIC bytes arrive mainly from the Files app and
// some in-app browsers. The WASM HEIC decoder is therefore a fallback path,
// not the common path — it is `import()`ed lazily in decodeViaWasm() and only
// after the BYTES said HEIC (or a BMFF native decode failed), so the ~3 MB
// decoder chunk never loads for the guests who will never need it.
//
// ORIENTATION (STEP 2, the classic trap): the bitmap is decoded with
// `imageOrientation: "from-image"`, so EXIF rotation is FULLY applied to the
// pixels, and `canvas.toBlob` emits a JPEG with NO metadata at all — canvas
// never writes EXIF. Fully-applied pixels + no Orientation tag is the one
// consistent pair: the server's `.rotate()` (which honors EXIF when present)
// sees no tag and correctly does nothing. The failure modes this rules out:
// rotated pixels with a surviving Orientation tag (double rotation), or
// unrotated pixels with the tag stripped (sideways forever) — the
// "half-applied" states the server transform cannot repair. The HEIC path has
// the same property: libheif applies the container's irot/imir transforms
// during decode and its output carries no orientation metadata.

// Quality ~0.85 per the task: visually transparent for phone photos while
// cutting a typical original to a fraction of its size.
export const CLIENT_JPEG_QUALITY = 0.85;

export type PrepareFailure = "not_an_image" | "decode_failed";

// Typed, i18n-free failure: the queue maps `reason` to the memories dict
// (notAnImage / decodeFailed) where the item state is rendered. The module
// itself never renders copy.
export class PrepareError extends Error {
  readonly reason: PrepareFailure;
  constructor(reason: PrepareFailure, cause?: unknown) {
    super(reason);
    this.name = "PrepareError";
    this.reason = reason;
    this.cause = cause;
  }
}

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  sourceFormat: DetectedFormat;
  sourceBytes: number;
  preparedBytes: number;
}

// Fit (width × height) inside a max-by-max box, preserving aspect ratio and
// NEVER enlarging — a small image passes through at its own size. Pure and
// unit-tested; the canvas work below is exercised in the browser QA.
export function fitWithin(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const largest = Math.max(width, height);
  if (largest <= maxDimension || largest === 0) {
    return { width, height };
  }
  const scale = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function sniffFile(file: Blob): Promise<DetectedFormat> {
  const head = new Uint8Array(
    await file.slice(0, SNIFF_BYTES).arrayBuffer(),
  );
  return detectImageFormat(head);
}

// The lazy WASM boundary: this dynamic import() is the ONLY way heic.ts (and
// through it the heic-to/libheif bundle) ever loads, so bundlers split it
// into its own on-demand chunk.
async function decodeViaWasm(file: Blob): Promise<ImageBitmap> {
  const { decodeHeifToBitmap } = await import("./heic");
  return decodeHeifToBitmap(file);
}

async function decodeToBitmap(
  file: Blob,
  format: DetectedFormat,
): Promise<ImageBitmap> {
  if (format === "heic") {
    // No mainstream browser decodes HEIC natively — straight to WASM.
    try {
      return await decodeViaWasm(file);
    } catch (cause) {
      throw new PrepareError("decode_failed", cause);
    }
  }
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (cause) {
    if (format === "avif") {
      // Older Safari has no native AVIF; give the WASM decoder one shot.
      try {
        return await decodeViaWasm(file);
      } catch (wasmCause) {
        throw new PrepareError("decode_failed", wasmCause);
      }
    }
    throw new PrepareError("decode_failed", cause);
  }
}

// Decode → downscale → encode. Throws PrepareError("not_an_image") before
// touching any decoder when the bytes are not an image format we know —
// early, and without ever having reserved anything when the queue calls this
// first. `maxDimension` comes from the server's reservation response
// (the entitlement's plan dimension) — never hardcoded here.
export async function prepareForUpload(
  file: Blob,
  maxDimension: number,
): Promise<PreparedImage> {
  const sourceFormat = await sniffFile(file);
  if (sourceFormat === "unknown") {
    throw new PrepareError("not_an_image");
  }

  const bitmap = await decodeToBitmap(file, sourceFormat);
  try {
    const { width, height } = fitWithin(
      bitmap.width,
      bitmap.height,
      maxDimension,
    );
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new PrepareError("decode_failed");
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CLIENT_JPEG_QUALITY),
    );
    // Release the backing store eagerly — iOS caps total canvas memory, and a
    // 10-photo batch would otherwise hold ten decoded frames.
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      throw new PrepareError("decode_failed");
    }
    return {
      blob,
      width,
      height,
      sourceFormat,
      sourceBytes: file.size,
      preparedBytes: blob.size,
    };
  } finally {
    bitmap.close();
  }
}
