import sharp from "sharp";
import { scanmeWatermarkPng } from "./scanme-watermark";

// =============================================================================
// TASK-15 — the server image transform (RFC-001 §2.8). Pure bytes-in/bytes-out:
// no Convex, no HTTP, no React — the route handler feeds it the original and
// stores what comes back, and the vitest suite asserts on the output bytes.
//
// THE ORDER IS THE POINT, and it is not negotiable:
//
//   1. `.rotate()` with NO argument, FIRST. sharp reads the EXIF Orientation
//      tag at decode time and bakes the rotation into the pixels. Everything
//      downstream of this file is metadata-free (raw pixels, then encodes
//      without `withMetadata`), so if this call were missing — or ordered
//      after the pixels left the EXIF-carrying original — the orientation
//      would be stripped WITHOUT being applied, and every portrait iPhone
//      photo would land sideways. That is the single most common bug in this
//      kind of pipeline; transform.test.ts proves the fix on output bytes
//      with an orientation-6 fixture.
//   2. Metadata strip. Never calling `withMetadata`/`keepExif` IS the strip:
//      sharp's documented default output behaviour is "strip all metadata and
//      convert to the device-independent sRGB colour space" — EXIF (GPS
//      included), ICC, XMP all gone, and Display-P3 iPhone pixels are
//      converted, not mislabelled. A wedding photo carrying the venue's GPS
//      coordinates is a privacy leak (RFC §2.10); the tests assert the output
//      bytes carry no EXIF at all.
//   3. Dimension clamp to the entitlement's maxImageDimension — SERVER-
//      authoritative. The client's own downscale is bandwidth UX only; this
//      resize runs unconditionally, so no client can exceed its plan.
//   4. Watermarks (spec below), composited onto the clamped pixels.
//   5. Encodes: AVIF primary, WebP fallback (iOS ≤ 15), WebP thumbnail for
//      grid views — all from one composited master, so the three variants are
//      pixel-consistent.
// =============================================================================

// --- Watermark spec (RFC §2.8, confirmed §0.7) -------------------------------
// ScanMe wordmark: bottom-RIGHT, width 8% of the image width, 70% opacity,
// subtle shadow for legibility on light photos. Business logo: bottom-LEFT,
// same treatment, SKIPPED ENTIRELY when the business has no logo — never a
// text stand-in. Both scale with the image (all geometry derives from the
// image width), so they read the same on a 2048px and a 4096px render.
const WATERMARK_WIDTH_FRACTION = 0.08;
const WATERMARK_OPACITY = 0.7;
// Distance of the logo ink from the photo edges. Not fixed by the spec; 2% of
// the width keeps it proportional on every tier.
const WATERMARK_MARGIN_FRACTION = 0.02;
// Shadow alpha before the whole badge is faded to 70% — effective ≈ 0.39,
// "subtle" but enough to carry a white wordmark over a white tablecloth.
const WATERMARK_SHADOW_ALPHA = 0.55;
// A business logo with a pathological aspect ratio (a tall banner) must never
// curtain the photo: same 8%-width rule, with a hard height ceiling.
const BUSINESS_LOGO_MAX_HEIGHT_FRACTION = 0.15;

// --- Encode settings ---------------------------------------------------------
// AVIF is the CPU cost of this pipeline (200 runs/hour at a wedding — the
// measured numbers live in the TASK-15 report and the bench script). Effort 3
// cuts encode time roughly in half versus sharp's default 4 with a visually
// negligible size delta at quality 50, which is AVIF's sweet spot for photos.
// WebP is the compatibility fallback, quality 78 ≈ classic "high quality web
// photo"; the 512px thumbnail serves 3-column phone grids at 3× DPR.
export const ENCODE_SETTINGS = {
  avif: { quality: 50, effort: 3 },
  webp: { quality: 78, effort: 4 },
  thumb: { size: 512, quality: 70 },
} as const;

// Decode-bomb guard: refuse anything above 80 megapixels before allocating
// (an iPhone panorama is ~40MP; a real phone photo never comes close).
const LIMIT_INPUT_PIXELS = 80_000_000;

export interface TransformVariant {
  data: Buffer;
  width: number;
  height: number;
}

export interface TransformTimings {
  /** decode + auto-orient + clamp + watermark compositing, ms */
  prepareMs: number;
  avifMs: number;
  webpMs: number;
  thumbMs: number;
}

export interface TransformResult {
  avif: TransformVariant;
  webp: TransformVariant;
  thumb: TransformVariant;
  timings: TransformTimings;
}

export interface TransformOptions {
  /** The entitlement's max dimension (2048/2560/4096 by tier) — from Convex,
   * never from the client. */
  maxDimension: number;
  /** The business logo file bytes, or null/undefined when the business has no
   * logo — in which case the bottom-left watermark is skipped entirely. */
  businessLogo?: Buffer | null;
}

// A watermark badge: the logo colorized/faded per spec on a transparent
// canvas, with its shadow pre-composited. `ink` is the logo's box inside the
// badge (the transparent apron around it carries shadow spill), so placement
// can put the INK, not the apron, at the margin.
interface Badge {
  data: Buffer;
  width: number;
  height: number;
  ink: { left: number; top: number; width: number; height: number };
}

async function buildBadge(
  logo: Buffer,
  targetWidth: number,
  maxHeight: number,
  colorizeWhite: boolean,
): Promise<Badge | null> {
  if (targetWidth < 8) return null; // sub-8px ink is noise, not a watermark
  const resized = await sharp(logo)
    .resize({
      width: targetWidth,
      height: Math.max(8, maxHeight),
      fit: "inside",
    })
    // The brand asset is an alpha mask (RGB all 0); negate turns the ink
    // white while leaving the alpha untouched. Business logos keep their own
    // colors.
    .negate(colorizeWhite ? { alpha: false } : false)
    .ensureAlpha()
    .png()
    .toBuffer({ resolveWithObject: true });
  const inkWidth = resized.info.width;
  const inkHeight = resized.info.height;

  // The apron around the ink lets the shadow blur spread instead of clipping
  // at the ink's bounding box; the offset pushes the shadow down-right.
  const pad = Math.max(2, Math.round(inkWidth * 0.06));
  const offset = Math.max(1, Math.round(inkWidth * 0.02));
  const padded = await sharp(resized.data)
    .extend({
      top: pad,
      bottom: pad,
      left: pad,
      right: pad,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const paddedWidth = padded.info.width;
  const paddedHeight = padded.info.height;

  // The shadow is the logo's own alpha, blurred and darkened: legible on a
  // light photo, invisible where the photo is already dark.
  const shadowAlpha = await sharp(padded.data)
    .ensureAlpha()
    .extractChannel(3)
    .blur(Math.max(0.7, inkWidth * 0.02))
    .linear(WATERMARK_SHADOW_ALPHA, 0)
    .toBuffer();
  const shadow = await sharp({
    create: {
      width: paddedWidth,
      height: paddedHeight,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .joinChannel(shadowAlpha)
    .png()
    .toBuffer();

  const badgeWidth = paddedWidth + offset;
  const badgeHeight = paddedHeight + offset;
  // Two passes on purpose: sharp applies `composite` at the END of a
  // pipeline, so an opacity `linear` chained onto the same instance would hit
  // only the base canvas, not the composited result.
  const assembled = await sharp({
    create: {
      width: badgeWidth,
      height: badgeHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: shadow, left: offset, top: offset },
      { input: padded.data, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  const faded = await sharp(assembled)
    .linear([1, 1, 1, WATERMARK_OPACITY], [0, 0, 0, 0])
    .png()
    .toBuffer();

  return {
    data: faded,
    width: badgeWidth,
    height: badgeHeight,
    ink: { left: pad, top: pad, width: inkWidth, height: inkHeight },
  };
}

export async function transformMemoryPhoto(
  original: Buffer,
  options: TransformOptions,
): Promise<TransformResult> {
  const prepareStart = performance.now();

  // STEP 1+2+3 — auto-orient FIRST (while the EXIF Orientation tag is still
  // readable on the input), then clamp. The `.raw()` boundary is where every
  // byte of metadata dies: only pixels cross it.
  const master = await sharp(original, { limitInputPixels: LIMIT_INPUT_PIXELS })
    .rotate() // no argument: bake the EXIF orientation into the pixels
    .resize({
      width: options.maxDimension,
      height: options.maxDimension,
      fit: "inside",
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = master.info.width;
  const height = master.info.height;
  const margin = Math.max(4, Math.round(width * WATERMARK_MARGIN_FRACTION));
  const logoWidth = Math.round(width * WATERMARK_WIDTH_FRACTION);

  // STEP 4 — the watermarks.
  const overlays: { input: Buffer; left: number; top: number }[] = [];
  const scanme = await buildBadge(
    scanmeWatermarkPng(),
    logoWidth,
    height, // the wordmark is 4.8:1 — the height cap never binds for it
    true,
  );
  if (scanme && scanme.width <= width && scanme.height <= height) {
    overlays.push({
      input: scanme.data,
      left: Math.max(0, width - margin - scanme.ink.left - scanme.ink.width),
      top: Math.max(0, height - margin - scanme.ink.top - scanme.ink.height),
    });
  }
  if (options.businessLogo) {
    const business = await buildBadge(
      options.businessLogo,
      logoWidth,
      Math.round(height * BUSINESS_LOGO_MAX_HEIGHT_FRACTION),
      false,
    );
    if (business && business.width <= width && business.height <= height) {
      overlays.push({
        input: business.data,
        left: Math.max(0, margin - business.ink.left),
        top: Math.max(
          0,
          height - margin - business.ink.top - business.ink.height,
        ),
      });
    }
  }

  const composited = await sharp(master.data, { raw: master.info })
    .composite(overlays)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const prepareMs = performance.now() - prepareStart;

  // STEP 5 — the encodes, all from the one composited master. No
  // `withMetadata` anywhere: the outputs carry no EXIF, no GPS, no ICC — sRGB
  // pixels only. removeAlpha drops the all-opaque alpha plane compositing
  // introduced.
  const encodeInput = () =>
    sharp(composited.data, { raw: composited.info }).removeAlpha();

  const avifStart = performance.now();
  const avif = await encodeInput()
    .avif(ENCODE_SETTINGS.avif)
    .toBuffer({ resolveWithObject: true });
  const avifMs = performance.now() - avifStart;

  const webpStart = performance.now();
  const webp = await encodeInput()
    .webp(ENCODE_SETTINGS.webp)
    .toBuffer({ resolveWithObject: true });
  const webpMs = performance.now() - webpStart;

  const thumbStart = performance.now();
  const thumb = await encodeInput()
    .resize({
      width: ENCODE_SETTINGS.thumb.size,
      height: ENCODE_SETTINGS.thumb.size,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: ENCODE_SETTINGS.thumb.quality })
    .toBuffer({ resolveWithObject: true });
  const thumbMs = performance.now() - thumbStart;

  return {
    avif: { data: avif.data, width: avif.info.width, height: avif.info.height },
    webp: { data: webp.data, width: webp.info.width, height: webp.info.height },
    thumb: {
      data: thumb.data,
      width: thumb.info.width,
      height: thumb.info.height,
    },
    timings: { prepareMs, avifMs, webpMs, thumbMs },
  };
}
