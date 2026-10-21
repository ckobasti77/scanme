// @vitest-environment node
//
// ScanMe Menu V1 (K15): the transform proven on OUTPUT BYTES (decoded with
// sharp), never on the code path. Inputs are made with sharp itself, plus the
// committed Memories orientation-6 fixture (lib/memories-pipeline/fixtures).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { MENU_IMAGE_ENCODE, transformMenuImage } from "./image-transform";

const MAX = 2400;
const fixturesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "memories-pipeline",
  "fixtures",
);
const fixture = (name: string) => readFileSync(path.join(fixturesDir, name));

function grey(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: "#808080" } });
}

async function decodeRaw(data: Buffer) {
  const { data: pixels, info } = await sharp(data).raw().toBuffer({ resolveWithObject: true });
  return { pixels, info };
}

function regionMean(
  pixels: Buffer,
  info: { width: number; channels: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const sums = [0, 0, 0];
  let count = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * info.width + x) * info.channels;
      sums[0] += pixels[i];
      sums[1] += pixels[i + 1];
      sums[2] += pixels[i + 2];
      count += 1;
    }
  }
  return sums.map((s) => s / count);
}

describe("transformMenuImage: size", () => {
  test("a 4000x3000 upload is clamped to 2400 on the longest side, aspect kept, in every full-size output", async () => {
    const input = await grey(4000, 3000).jpeg().toBuffer();
    const out = await transformMenuImage(input, MAX);

    for (const [name, variant] of [["avif", out.avif], ["webp", out.webp]] as const) {
      const { info } = await decodeRaw(variant.data);
      expect(Math.max(info.width, info.height), name).toBe(2400);
      expect(info.width, name).toBe(2400);
      expect(info.height, name).toBe(1800);
      expect(variant.width).toBe(info.width);
      expect(variant.height).toBe(info.height);
    }
  });

  test("the clamp follows the given maxDimension and works on a portrait image", async () => {
    const input = await grey(1500, 3000).jpeg().toBuffer();
    const out = await transformMenuImage(input, 1000);
    const { info } = await decodeRaw(out.webp.data);
    expect(info.height).toBe(1000);
    expect(info.width).toBe(500);
  });

  test("a small image is never enlarged", async () => {
    const input = await grey(800, 600).jpeg().toBuffer();
    const out = await transformMenuImage(input, MAX);
    for (const variant of [out.avif, out.webp]) {
      const { info } = await decodeRaw(variant.data);
      expect(info.width).toBe(800);
      expect(info.height).toBe(600);
    }
  });

  test("the thumbnail's longest side is at most 512 and keeps the aspect", async () => {
    const input = await grey(4000, 3000).jpeg().toBuffer();
    const out = await transformMenuImage(input, MAX);
    const { info } = await decodeRaw(out.thumb.data);
    expect(Math.max(info.width, info.height)).toBeLessThanOrEqual(MENU_IMAGE_ENCODE.thumb.size);
    expect(Math.max(info.width, info.height)).toBe(512);
    expect(info.width / info.height).toBeCloseTo(4 / 3, 1);
    expect(out.thumb.width).toBe(info.width);
    expect(out.thumb.height).toBe(info.height);
  });

  test("a small image keeps its size in the thumbnail too", async () => {
    const input = await grey(300, 200).png().toBuffer();
    const out = await transformMenuImage(input, MAX);
    const { info } = await decodeRaw(out.thumb.data);
    expect(info.width).toBe(300);
    expect(info.height).toBe(200);
  });
});

describe("transformMenuImage: orientation", () => {
  test("an EXIF orientation-6 landscape sensor image comes out portrait, upright in the pixels", async () => {
    const input = fixture("orientation-6.jpg");
    const inputMeta = await sharp(input).metadata();
    // Precondition: 320x200 sensor pixels tagged orientation 6, green on the sensor's left third.
    expect(inputMeta.orientation).toBe(6);
    expect(inputMeta.width).toBe(320);
    expect(inputMeta.height).toBe(200);

    const out = await transformMenuImage(input, MAX);
    for (const [name, variant] of [["avif", out.avif], ["webp", out.webp]] as const) {
      const { pixels, info } = await decodeRaw(variant.data);
      expect(info.width, `${name} width`).toBe(200);
      expect(info.height, `${name} height`).toBe(320);
      expect(variant.width).toBe(200);
      expect(variant.height).toBe(320);
      // The sensor's left column became the top row: green on top, blue at the bottom.
      const top = regionMean(pixels, info, 40, 10, 160, 90);
      const bottom = regionMean(pixels, info, 40, 230, 160, 310);
      expect(top[1], `${name} top green`).toBeGreaterThan(top[2] + 60);
      expect(bottom[2], `${name} bottom blue`).toBeGreaterThan(bottom[1] + 60);
      expect((await sharp(variant.data).metadata()).orientation).toBeUndefined();
    }
    expect(out.thumb.width).toBeLessThan(out.thumb.height);
  });
});

describe("transformMenuImage: metadata", () => {
  test("EXIF, XMP and ICC of the input never reach any output", async () => {
    const input = await grey(1200, 800)
      .jpeg()
      .withMetadata({ exif: { IFD0: { Copyright: "secret-copyright", Make: "secret-make" } }, icc: "p3" })
      .toBuffer();
    const inputMeta = await sharp(input).metadata();
    // Precondition: the input really carries EXIF and an ICC profile.
    expect(inputMeta.exif).toBeDefined();
    expect(inputMeta.icc).toBeDefined();

    const out = await transformMenuImage(input, MAX);
    for (const [name, variant] of [["avif", out.avif], ["webp", out.webp], ["thumb", out.thumb]] as const) {
      const meta = await sharp(variant.data).metadata();
      expect(meta.exif, `${name} exif`).toBeUndefined();
      expect(meta.xmp, `${name} xmp`).toBeUndefined();
      expect(meta.icc, `${name} icc`).toBeUndefined();
      expect(variant.data.includes(Buffer.from("secret-copyright")), `${name} copyright bytes`).toBe(false);
      expect(variant.data.includes(Buffer.from("secret-make")), `${name} make bytes`).toBe(false);
      expect(variant.data.includes(Buffer.from("Exif\0\0", "latin1")), `${name} Exif marker`).toBe(false);
    }
  });

  test("a GPS-tagged JPEG produces outputs without EXIF", async () => {
    const input = fixture("gps-tagged.jpg");
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const out = await transformMenuImage(input, MAX);
    for (const variant of [out.avif, out.webp, out.thumb]) {
      expect((await sharp(variant.data).metadata()).exif).toBeUndefined();
    }
  });
});

describe("transformMenuImage: formats", () => {
  test("avif is a HEIF/AVIF container, webp and thumb are WebP", async () => {
    const input = await grey(1000, 700).jpeg().toBuffer();
    const out = await transformMenuImage(input, MAX);
    const avifMeta = await sharp(out.avif.data).metadata();
    expect(avifMeta.format).toBe("heif");
    expect(avifMeta.compression).toBe("av1");
    expect((await sharp(out.webp.data).metadata()).format).toBe("webp");
    expect((await sharp(out.thumb.data).metadata()).format).toBe("webp");
    for (const variant of [out.avif, out.webp, out.thumb]) {
      expect(variant.data.length).toBeGreaterThan(0);
    }
  });

  test("a PNG input is accepted", async () => {
    const input = await grey(600, 400).png().toBuffer();
    const out = await transformMenuImage(input, MAX);
    expect((await sharp(out.webp.data).metadata()).format).toBe("webp");
  });
});

describe("transformMenuImage: no watermark", () => {
  test("a uniform grey image has the same mean colour in both bottom corners and the centre", async () => {
    const input = await grey(4000, 3000).jpeg({ quality: 95 }).toBuffer();
    const out = await transformMenuImage(input, MAX);

    for (const [name, variant] of [["webp", out.webp], ["thumb", out.thumb]] as const) {
      const { pixels, info } = await decodeRaw(variant.data);
      const w = info.width;
      const h = info.height;
      const cw = Math.floor(w * 0.1);
      const ch = Math.floor(h * 0.1);
      const bottomRight = regionMean(pixels, info, w - cw, h - ch, w, h);
      const bottomLeft = regionMean(pixels, info, 0, h - ch, cw, h);
      const centre = regionMean(
        pixels,
        info,
        Math.floor(w / 2 - cw / 2),
        Math.floor(h / 2 - ch / 2),
        Math.floor(w / 2 + cw / 2),
        Math.floor(h / 2 + ch / 2),
      );
      for (let c = 0; c < 3; c += 1) {
        expect(Math.abs(bottomRight[c] - centre[c]), `${name} bottom-right channel ${c}`).toBeLessThanOrEqual(3);
        expect(Math.abs(bottomLeft[c] - centre[c]), `${name} bottom-left channel ${c}`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("transformMenuImage: bad input", () => {
  test("a non-image buffer rejects", async () => {
    await expect(transformMenuImage(Buffer.from("definitely not an image"), MAX)).rejects.toThrow();
  });

  test("an empty buffer rejects", async () => {
    await expect(transformMenuImage(Buffer.alloc(0), MAX)).rejects.toThrow();
  });
});
