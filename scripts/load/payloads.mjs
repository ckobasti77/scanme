// TASK-24 — real JPEG payloads at phone resolutions. The client pipeline PUTs
// the *prepared* image (downscaled to the plan dimension, JPEG q0.85 — see
// lib/memories-client/prepare.ts), so that is the shape generated here:
// distinct synthetic "photos" (noise base + composited shapes, mildly blurred
// so they compress like camera texture, not like white noise), NOT 1 KB stubs.
//
// Flood mode additionally pre-encodes ONE variant set with the exact
// transform encode settings (lib/memories-pipeline/transform.ts: AVIF q50/e3,
// WebP q78/e4, 512px thumb q70) so the direct engine can commit at full
// pressure without a per-photo sharp stage.

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sceneSvg(seed, width, height) {
  const rand = mulberry32(seed);
  const hue = () => Math.floor(rand() * 360);
  let shapes = "";
  for (let i = 0; i < 14; i += 1) {
    const cx = Math.floor(rand() * width);
    const cy = Math.floor(rand() * height);
    const r = Math.floor((0.05 + rand() * 0.25) * width);
    shapes += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsla(${hue()},${40 + Math.floor(rand() * 40)}%,${30 + Math.floor(rand() * 40)}%,${(0.25 + rand() * 0.5).toFixed(2)})"/>`;
  }
  for (let i = 0; i < 6; i += 1) {
    const x = Math.floor(rand() * width * 0.8);
    const y = Math.floor(rand() * height * 0.8);
    shapes += `<rect x="${x}" y="${y}" width="${Math.floor(rand() * width * 0.4)}" height="${Math.floor(rand() * height * 0.4)}" fill="hsla(${hue()},50%,50%,${(0.15 + rand() * 0.35).toFixed(2)})" transform="rotate(${Math.floor(rand() * 90)} ${x} ${y})"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue()},45%,35%)"/>
    <stop offset="1" stop-color="hsl(${hue()},55%,60%)"/>
  </linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)" opacity="0.75"/>${shapes}</svg>`;
}

async function renderPhoto(seed, width, height, quality) {
  return await sharp({
    create: {
      width,
      height,
      channels: 3,
      noise: { type: "gaussian", mean: 120, sigma: 11 },
    },
  })
    .composite([{ input: Buffer.from(sceneSvg(seed, width, height)) }])
    .blur(0.7)
    .jpeg({ quality })
    .toBuffer();
}

// A pool of distinct prepared-upload JPEGs, cached on disk across runs.
export async function ensurePhotoPool(dir, { count, longEdge }) {
  mkdirSync(dir, { recursive: true });
  const pool = [];
  for (let i = 0; i < count; i += 1) {
    const file = join(dir, `photo-${longEdge}-${i}.jpg`);
    if (!existsSync(file)) {
      // Mixed portrait/landscape like a camera roll.
      const portrait = i % 3 !== 0;
      const w = portrait ? Math.round(longEdge * 0.75) : longEdge;
      const h = portrait ? longEdge : Math.round(longEdge * 0.75);
      writeFileSync(file, await renderPhoto(1000 + i, w, h, 85));
    }
    pool.push(readFileSync(file));
  }
  return pool;
}

// Flood kit: one small original + one variant set encoded exactly like the
// production transform, reused byte-for-byte by every flood commit (each PUT
// still creates a distinct storage blob).
export async function ensureFloodKit(dir) {
  mkdirSync(dir, { recursive: true });
  const originalFile = join(dir, "flood-original.jpg");
  if (!existsSync(originalFile)) {
    writeFileSync(originalFile, await renderPhoto(7, 1280, 960, 80));
  }
  const original = readFileSync(originalFile);

  const variantMeta = join(dir, "flood-variants.json");
  const files = {
    avif: join(dir, "flood.avif"),
    webp: join(dir, "flood.webp"),
    thumb: join(dir, "flood-thumb.webp"),
  };
  if (
    !existsSync(variantMeta) ||
    !existsSync(files.avif) ||
    !existsSync(files.webp) ||
    !existsSync(files.thumb)
  ) {
    const source = await renderPhoto(11, 1920, 2560, 90);
    const avif = await sharp(source)
      .avif({ quality: 50, effort: 3 })
      .toBuffer({ resolveWithObject: true });
    const webp = await sharp(source)
      .webp({ quality: 78, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(source)
      .resize({ width: 512, height: 512, fit: "inside" })
      .webp({ quality: 70 })
      .toBuffer({ resolveWithObject: true });
    writeFileSync(files.avif, avif.data);
    writeFileSync(files.webp, webp.data);
    writeFileSync(files.thumb, thumb.data);
    writeFileSync(
      variantMeta,
      JSON.stringify({
        avif: { width: avif.info.width, height: avif.info.height },
        webp: { width: webp.info.width, height: webp.info.height },
        thumb: { width: thumb.info.width, height: thumb.info.height },
      }),
    );
  }
  const meta = JSON.parse(readFileSync(variantMeta, "utf8"));
  return {
    original,
    variants: {
      avif: {
        data: readFileSync(files.avif),
        contentType: "image/avif",
        ...meta.avif,
      },
      webp: {
        data: readFileSync(files.webp),
        contentType: "image/webp",
        ...meta.webp,
      },
      thumb: {
        data: readFileSync(files.thumb),
        contentType: "image/webp",
        ...meta.thumb,
      },
    },
  };
}
