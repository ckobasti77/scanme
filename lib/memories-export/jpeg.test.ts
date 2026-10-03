// @vitest-environment node
//
// TASK-21 STEP 0 / DoD #3 — proven on OUTPUT BYTES: deriving from a real WebP
// yields a real JPEG at the source dimensions. sharp needs Node, so this one
// file opts into the node environment (the rest of the suite stays edge-runtime,
// exactly as transform.test.ts does).

import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { deriveExportJpeg } from "./jpeg";

// A stand-in for a stored WebP variant: a solid image encoded exactly the way
// the pipeline's WebP branch does (quality 78), so the deriver's input matches
// production.
async function makeWebp(width: number, height: number): Promise<Uint8Array> {
  const out = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 80, b: 200 },
    },
  })
    .webp({ quality: 78 })
    .toBuffer();
  return out;
}

describe("deriveExportJpeg", () => {
  test("produces a JPEG (SOI marker) at the source dimensions", async () => {
    const webp = await makeWebp(2048, 1365);
    const jpeg = await deriveExportJpeg(webp);
    // JPEG magic: FF D8 FF.
    expect(jpeg.data[0]).toBe(0xff);
    expect(jpeg.data[1]).toBe(0xd8);
    expect(jpeg.data[2]).toBe(0xff);
    expect(jpeg.width).toBe(2048);
    expect(jpeg.height).toBe(1365);
    // sharp confirms the format independently.
    const meta = await sharp(Buffer.from(jpeg.data)).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.width).toBe(2048);
    expect(meta.height).toBe(1365);
  });

  test("output carries no EXIF/GPS metadata", async () => {
    const webp = await makeWebp(640, 480);
    const jpeg = await deriveExportJpeg(webp);
    const meta = await sharp(Buffer.from(jpeg.data)).metadata();
    expect(meta.exif).toBeUndefined();
  });
});
