import sharp from "sharp";

// =============================================================================
// ScanMe Menu V1 (K15) — the server transform of an article image (master
// §7.9: a web format, responsive sizes up to about 2.400 px, no metadata).
// Bytes in, bytes out: no Convex, no HTTP; the route /api/meni/slike feeds it
// the original and stores what comes back, and the tests decode the output.
//
// The order is the Memories pipeline's (lib/memories-pipeline/transform.ts),
// without its watermarks — a menu photo is the venue's own image:
//   1. `.rotate()` with no argument FIRST: the EXIF orientation is baked into
//      the pixels while it can still be read (a portrait phone photo would
//      otherwise land sideways once the metadata is gone);
//   2. the strip: nothing calls `withMetadata`, and the `.raw()` master is
//      pixels only, so EXIF (GPS included), XMP and ICC never reach an output
//      (sharp converts to sRGB);
//   3. the clamp to `maxDimension` on the longest side, never enlarging;
//   4. AVIF (primary), WebP (fallback, what the public detail shows) and a
//      WebP thumbnail for the list, all from the one master.
// =============================================================================

export const MENU_IMAGE_ENCODE = {
  avif: { quality: 50, effort: 3 },
  webp: { quality: 80, effort: 4 },
  thumb: { size: 512, quality: 72 },
} as const;

/** Decode-bomb guard: refuse anything above 80 megapixels before allocating. */
const LIMIT_INPUT_PIXELS = 80_000_000;

export type MenuImageVariant = { data: Buffer; width: number; height: number };

export type MenuImageVersions = { avif: MenuImageVariant; webp: MenuImageVariant; thumb: MenuImageVariant };

export async function transformMenuImage(original: Buffer, maxDimension: number): Promise<MenuImageVersions> {
  const master = await sharp(original, { limitInputPixels: LIMIT_INPUT_PIXELS })
    .rotate()
    .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const raw = { raw: { width: master.info.width, height: master.info.height, channels: master.info.channels } };

  const [avif, webp, thumb] = await Promise.all([
    sharp(master.data, raw).avif(MENU_IMAGE_ENCODE.avif).toBuffer({ resolveWithObject: true }),
    sharp(master.data, raw).webp(MENU_IMAGE_ENCODE.webp).toBuffer({ resolveWithObject: true }),
    sharp(master.data, raw)
      .resize({
        width: MENU_IMAGE_ENCODE.thumb.size,
        height: MENU_IMAGE_ENCODE.thumb.size,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: MENU_IMAGE_ENCODE.thumb.quality })
      .toBuffer({ resolveWithObject: true }),
  ]);
  const variant = (result: { data: Buffer; info: { width: number; height: number } }): MenuImageVariant => ({
    data: result.data,
    width: result.info.width,
    height: result.info.height,
  });
  return { avif: variant(avif), webp: variant(webp), thumb: variant(thumb) };
}
