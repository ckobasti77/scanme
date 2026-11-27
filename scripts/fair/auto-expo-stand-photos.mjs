#!/usr/bin/env node
// Auto Expo 2026 (27. 11.): every photo of a model outside the slider shows the colour of the car
// on the stand (STAND_COLOR, same as scripts/fair/auto-expo-slider-assets.mjs):
//  - public/fair/auto-expo-2026/salon/*.webp  brand page cut-outs (alpha, same size as before)
//  - public/fair/auto-expo-2026/modeli/*.webp photoUrl (garage, compare, specs, OG)
// Source: tmp/auto-expo-fotografije (not in git). Ford renders sit on white, so the cut-out mask is
// taken from a saturated colour of the SAME angle (pixel-aligned renders) and applied to the stand
// colour; a white car on white could not be cut out by itself.
//   node scripts/fair/auto-expo-stand-photos.mjs
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const SRC = "tmp/auto-expo-fotografije";
const SALON = "public/fair/auto-expo-2026/salon";
const MODELI = "public/fair/auto-expo-2026/modeli";
const SLIDER = "public/fair/auto-expo-2026/slider";

const FORD = {
  "ford-kuga": { dir: "ford/ford-kuga/boje-360", code: "ford-kuga", stand: "crna-n4gm", maskFrom: "plava-n4fz", out: "ford-kuga-crna.webp", width: 937, slide: "crna" },
  "ford-puma-mhev": { dir: "ford/ford-puma/boje-360", code: "ford-puma", stand: "bela-n3gz", maskFrom: "crvena-n4jg", out: "ford-puma-bela.webp", width: 890, slide: "bela" },
};
const MG = {
  mg3: { file: "mg/mg3/boje-konfigurator", match: /_Comfort_White_/, out: "mg3-bela.webp" },
  "mg-hs-hybrid": { file: "mg/mg-hs-hybrid/boje-konfigurator", match: /HEV-Silver-/, out: "mg-hs-hybrid-srebrna.webp" },
  "mg-zs-hybrid": { file: "mg/mg-zs-hybrid/boje-konfigurator", match: /_COM_Red\./, out: "mg-zs-hybrid.webp" },
};

/** Background = near-white pixels reachable from the border (flood fill), so white body panels
 * enclosed by the car outline stay opaque. */
function floodMask(data, w, h) {
  const bg = new Uint8Array(w * h);
  const white = (i) => data[i * 3] > 244 && data[i * 3 + 1] > 244 && data[i * 3 + 2] > 244;
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop();
    if (bg[i] || !white(i)) continue;
    bg[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  const alpha = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i++) alpha[i] = bg[i] ? 0 : 255;
  return alpha;
}

async function fordCutout(slug, c) {
  const file = (color) => `${SRC}/${c.dir}/${color}/${c.code}-${color.split("-")[1]}-ugao21.jpg`;
  const mask = await sharp(file(c.maskFrom)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = mask.info;
  const alpha = floodMask(mask.data, w, h);
  const rgb = await sharp(file(c.stand)).removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(w * h * 4);
  let [x0, y0, x1, y1] = [w, h, 0, 0];
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
    if (alpha[i]) {
      const x = i % w, y = (i - x) / w;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const info = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 })
    .resize({ width: c.width })
    .webp({ quality: 86, alphaQuality: 95 })
    .toFile(`${SALON}/${c.out}`);
  console.log(slug, "salon", info.width, info.height);
}

async function mgCutout(slug, c) {
  const { readdirSync } = await import("node:fs");
  const name = readdirSync(`${SRC}/${c.file}`).find((f) => c.match.test(f));
  const trimmed = await sharp(`${SRC}/${c.file}/${name}`).trim({ threshold: 1 }).png().toBuffer();
  const info = await sharp(trimmed).resize({ width: 1400, withoutEnlargement: true }).webp({ quality: 86, alphaQuality: 95 }).toFile(`${SALON}/${c.out}`);
  console.log(slug, "salon", name, info.width, info.height);
}

/** photoUrl: the stand-colour slider frame, white trimmed and re-padded evenly (4:3-ish frames crop
 * it with object-fit: cover). */
async function modelPhoto(slug, src) {
  const trimmed = await sharp(src).flatten({ background: "#ffffff" }).trim({ background: "#ffffff", threshold: 12 }).toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const padX = Math.round(width * 0.08);
  const padY = Math.round(height * 0.14);
  // sharp runs resize before extend inside one pipeline, so pad first, then resize.
  const padded = await sharp(trimmed.data).extend({ left: padX, right: padX, top: padY, bottom: padY, background: "#ffffff" }).toBuffer();
  const info = await sharp(padded)
    .resize({ width: 1200, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(`${MODELI}/${slug}.webp`);
  console.log(slug, "photo", info.width, info.height);
}

mkdirSync(MODELI, { recursive: true });
for (const [slug, c] of Object.entries(FORD)) {
  await fordCutout(slug, c);
  await modelPhoto(slug, `${SLIDER}/${slug}/${c.slide}/01.webp`);
}
for (const [slug, c] of Object.entries(MG)) {
  await mgCutout(slug, c);
  await modelPhoto(slug, `${SALON}/${c.out}`);
}
