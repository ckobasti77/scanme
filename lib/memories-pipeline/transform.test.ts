// @vitest-environment node
//
// TASK-15 STEP 5 — the transform, proven on OUTPUT BYTES, never on the code
// path: every assertion below decodes the actual AVIF/WebP/thumb buffers the
// pipeline would store (sharp needs Node, hence the per-file environment; the
// rest of the suite stays on edge-runtime).
//
// Fixtures are committed binaries with committed provenance
// (fixtures/generate.mjs); each test re-asserts the precondition it relies on
// so a bad regeneration fails loudly instead of passing vacuously.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { ENCODE_SETTINGS, transformMemoryPhoto } from "./transform";

const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);
const fixture = (name: string) => readFileSync(path.join(fixturesDir, name));

// The EXIF GPS IFD pointer is TIFF tag 0x8825; its two bytes appearing in the
// EXIF blob (either endianness) is the byte-level "this file carries GPS".
function hasGpsIfdPointer(exif: Buffer): boolean {
  for (let i = 0; i < exif.length - 1; i += 1) {
    if (
      (exif[i] === 0x88 && exif[i + 1] === 0x25) ||
      (exif[i] === 0x25 && exif[i + 1] === 0x88)
    ) {
      return true;
    }
  }
  return false;
}

async function decodeRaw(data: Buffer) {
  const { data: pixels, info } = await sharp(data)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { pixels, info };
}

// Channel means and min/max luma over a pixel region of decoded output.
function regionStats(
  pixels: Buffer,
  info: { width: number; channels: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  let count = 0;
  const sums = [0, 0, 0];
  let minLuma = 255;
  let maxLuma = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * info.width + x) * info.channels;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      sums[0] += r;
      sums[1] += g;
      sums[2] += b;
      const luma = (r + g + b) / 3;
      if (luma < minLuma) minLuma = luma;
      if (luma > maxLuma) maxLuma = luma;
      count += 1;
    }
  }
  return {
    mean: sums.map((s) => s / count) as [number, number, number],
    minLuma,
    maxLuma,
    spread: maxLuma - minLuma,
  };
}

const EXIF_MARKER = Buffer.from("Exif\0\0", "latin1");

describe("EXIF stripping (privacy — RFC §2.10)", () => {
  test("a GPS-tagged JPEG produces outputs with no EXIF at all, and no GPS", async () => {
    const input = fixture("gps-tagged.jpg");

    // Precondition: the fixture genuinely carries EXIF with a GPS IFD.
    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.exif).toBeDefined();
    expect(hasGpsIfdPointer(inputMeta.exif!)).toBe(true);

    const out = await transformMemoryPhoto(input, { maxDimension: 2048 });
    for (const [name, variant] of Object.entries({
      avif: out.avif,
      webp: out.webp,
      thumb: out.thumb,
    })) {
      // Parsed: sharp finds no EXIF container in the output bytes.
      const meta = await sharp(variant.data).metadata();
      expect(meta.exif, `${name} must carry no EXIF`).toBeUndefined();
      // Raw bytes: the EXIF payload marker does not appear anywhere either —
      // no EXIF container means no GPS block, but scan the bytes anyway.
      expect(
        variant.data.includes(EXIF_MARKER),
        `${name} bytes must not contain an Exif payload`,
      ).toBe(false);
    }
  });
});

describe("auto-orientation (.rotate() before the strip)", () => {
  test("an EXIF orientation-6 portrait comes out upright in the output pixels", async () => {
    const input = fixture("orientation-6.jpg");

    // Precondition: 320×200 sensor pixels tagged orientation 6 (rotate 90° CW
    // to display), green stripe on the sensor's LEFT third.
    const inputMeta = await sharp(input).metadata();
    expect(inputMeta.orientation).toBe(6);
    expect(inputMeta.width).toBe(320);
    expect(inputMeta.height).toBe(200);

    const out = await transformMemoryPhoto(input, { maxDimension: 4096 });

    for (const [name, variant] of Object.entries({
      avif: out.avif,
      webp: out.webp,
    })) {
      // Dimensions swapped on the actual output bytes: 320×200 → 200×320.
      const { pixels, info } = await decodeRaw(variant.data);
      expect(info.width, `${name} width`).toBe(200);
      expect(info.height, `${name} height`).toBe(320);

      // The sensor's left column became the display's top row: the green
      // stripe now covers the TOP third, blue the bottom. Had the metadata
      // been stripped without .rotate() first, the image would still be
      // 320×200 with the stripe on the left — sideways.
      const top = regionStats(pixels, info, 40, 10, 160, 90);
      const bottom = regionStats(pixels, info, 40, 230, 160, 310);
      expect(top.mean[1], `${name} top must be green`).toBeGreaterThan(
        top.mean[2] + 60,
      );
      expect(bottom.mean[2], `${name} bottom must be blue`).toBeGreaterThan(
        bottom.mean[1] + 60,
      );
      // And no EXIF survives to re-rotate it at display time.
      const meta = await sharp(variant.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
    }
  });
});

describe("server-authoritative dimension clamp (§2.9)", () => {
  test("a 3000×2000 upload is clamped to 2048 on the basic tier", async () => {
    const out = await transformMemoryPhoto(fixture("oversized.jpg"), {
      maxDimension: 2048,
    });
    const { info } = await decodeRaw(out.avif.data);
    expect(Math.max(info.width, info.height)).toBe(2048);
    expect(info.width / info.height).toBeCloseTo(1.5, 2); // aspect preserved
    const webpInfo = (await decodeRaw(out.webp.data)).info;
    expect(Math.max(webpInfo.width, webpInfo.height)).toBe(2048);
  });

  test("the same upload is clamped to 2560 on the standard tier", async () => {
    const out = await transformMemoryPhoto(fixture("oversized.jpg"), {
      maxDimension: 2560,
    });
    const { info } = await decodeRaw(out.avif.data);
    expect(Math.max(info.width, info.height)).toBe(2560);
    expect(info.width / info.height).toBeCloseTo(1.5, 2);
  });

  test("a photo already inside the clamp is never enlarged", async () => {
    const out = await transformMemoryPhoto(fixture("flat-gray.jpg"), {
      maxDimension: 4096,
    });
    const { info } = await decodeRaw(out.avif.data);
    expect(info.width).toBe(800);
    expect(info.height).toBe(600);
  });
});

describe("watermarks (§2.8: ScanMe bottom-right; business bottom-left or skipped)", () => {
  // flat-gray.jpg is uniform 128-gray: any corner-region variance in the
  // output can only be a watermark. Geometry on the 800×600 fixture:
  // margin = 16px, logo width = 64px (8% of 800).
  const inkBand = { y0: 600 - 16 - 30, y1: 600 - 8 } as const;
  const rightRegion = [800 - 16 - 64, inkBand.y0, 800 - 8, inkBand.y1] as const;
  const leftRegion = [8, inkBand.y0, 16 + 64, inkBand.y1] as const;
  const centerRegion = [300, 250, 500, 350] as const;

  test("precondition: the base fixture is genuinely flat", async () => {
    const { pixels, info } = await decodeRaw(fixture("flat-gray.jpg"));
    const center = regionStats(pixels, info, ...centerRegion);
    expect(center.spread).toBeLessThan(6);
  });

  test("with a business logo: both watermarks, in the right corners", async () => {
    const out = await transformMemoryPhoto(fixture("flat-gray.jpg"), {
      maxDimension: 2048,
      businessLogo: fixture("business-logo.png"),
    });
    const { pixels, info } = await decodeRaw(out.webp.data);

    // Untouched center stays flat — watermarks are corner-local.
    const center = regionStats(pixels, info, ...centerRegion);
    expect(center.spread).toBeLessThan(14);

    // Bottom-right: the white ScanMe ink brightens over the gray, its shadow
    // darkens under it — the legibility mechanism itself.
    const right = regionStats(pixels, info, ...rightRegion);
    expect(right.maxLuma).toBeGreaterThan(170);
    expect(right.minLuma).toBeLessThan(105);

    // Bottom-left: the red business logo dominates the red channel.
    const left = regionStats(pixels, info, ...leftRegion);
    expect(left.mean[0]).toBeGreaterThan(left.mean[2] + 20);

    // The thumbnail carries the same watermarks, scaled with the image.
    const thumb = await decodeRaw(out.thumb.data);
    const scale = thumb.info.width / info.width;
    const thumbRight = regionStats(
      thumb.pixels,
      thumb.info,
      Math.floor(rightRegion[0] * scale),
      Math.floor(rightRegion[1] * scale),
      Math.ceil(rightRegion[2] * scale),
      Math.ceil(rightRegion[3] * scale),
    );
    expect(thumbRight.spread).toBeGreaterThan(40);
  });

  test("without a business logo: only the ScanMe mark — nothing at bottom-left", async () => {
    const out = await transformMemoryPhoto(fixture("flat-gray.jpg"), {
      maxDimension: 2048,
      businessLogo: null,
    });
    const { pixels, info } = await decodeRaw(out.webp.data);

    // ScanMe mark still present bottom-right.
    const right = regionStats(pixels, info, ...rightRegion);
    expect(right.spread).toBeGreaterThan(40);

    // Bottom-left is untouched flat gray: no logo, and no text stand-in —
    // nothing was drawn there at all.
    const left = regionStats(pixels, info, ...leftRegion);
    expect(left.spread).toBeLessThan(14);
    expect(Math.abs(left.mean[0] - left.mean[2])).toBeLessThan(6);
  });
});

describe("the three variants", () => {
  test("AVIF + WebP + thumbnail are all produced with real dimensions and bytes", async () => {
    const out = await transformMemoryPhoto(fixture("gps-tagged.jpg"), {
      maxDimension: 2048,
    });

    // Container formats, from the bytes.
    expect((await sharp(out.avif.data).metadata()).format).toBe("heif");
    expect((await sharp(out.webp.data).metadata()).format).toBe("webp");
    expect((await sharp(out.thumb.data).metadata()).format).toBe("webp");

    // Reported dimensions match the decoded output bytes (what the commit
    // records into mediaAssets).
    for (const variant of [out.avif, out.webp, out.thumb]) {
      expect(variant.data.length).toBeGreaterThan(0);
      const { info } = await decodeRaw(variant.data);
      expect(variant.width).toBe(info.width);
      expect(variant.height).toBe(info.height);
    }
    expect(out.avif.width).toBe(640);
    expect(out.avif.height).toBe(480);
    expect(
      Math.max(out.thumb.width, out.thumb.height),
    ).toBe(ENCODE_SETTINGS.thumb.size);
  });

  test("a non-image body is rejected, not encoded", async () => {
    await expect(
      transformMemoryPhoto(Buffer.from("definitely not an image"), {
        maxDimension: 2048,
      }),
    ).rejects.toThrow();
  });
});
