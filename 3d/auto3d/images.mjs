// Pretvara PNG postere iz output/auto3d/posters u AVIF i WebP (i OG u JPEG) preko sharp-a.
//
//   node 3d/auto3d/images.mjs [--webp-only]
//
// Budžet (A01 §4.4): AVIF ≤ 200.000 B, WebP ≤ 350.000 B, OG tačno 1200 × 630.
//
// A09: Blender daje samo auto na providnoj pozadini (posters.py, cameras.json). Pozadinu #0A0D11, pod i
// kontaktnu senku ovde crtamo istom formulom kao pregledač (viewer/environment.ts): disk poluprečnika
// 7 m u boji #151A21 sa radijalnom providnošću (255 → 200 na 0,45 → 0) i elipsa senke 2,5 × 5,6 m
// (crna, 0,6, 255 → 170 na 0,55 → 0), bez tone mapping-a i sa mešanjem u sRGB, kao canvas.
// Pod se u donjih 10 % slike i u bočnih 5 % pretapa u pozadinu: poster je `contain` u studiju, pa bi ispod njega
// ostao šav (studio je tu #0A0D11), vidljiv bez WebGL-a; canvas tu i dalje crta pod.
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = resolve(ROOT, "output/auto3d/posters");
const PUB = resolve(ROOT, "public/3d/auto3d");
const webpOnly = process.argv.includes("--webp-only");

const POSTERS = [
  ["sklopljen-desktop", 1920, 1080],
  ["rasklopljen-desktop", 1920, 1080],
  ["sklopljen-telefon", 1080, 1350],
  ["rasklopljen-telefon", 1080, 1350],
];

const BG = [0x0a, 0x0d, 0x11];
const FLOOR = { color: [0x15, 0x1a, 0x21], radius: 7, stops: [[0, 1], [0.45, 200 / 255], [1, 0]] };
const SHADOW = { half: [1.25, 2.8], z: -0.1, y: 0.002, opacity: 0.6, stops: [[0, 1], [0.55, 170 / 255], [1, 0]] };

function ramp(stops, t) {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, v1] = stops[i];
    const [t0, v0] = stops[i - 1];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return stops[stops.length - 1][1];
}

const smooth = (x) => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (3 - 2 * t);
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Pozadina, pod i senka kao RGB bafer u rezoluciji rendera (kamera iz cameras.json). */
function studioLayer(cam) {
  const { width: w, height: h, position: P, target: T, fov } = cam;
  const f = norm(sub(T, P));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const t = Math.tan((fov * Math.PI) / 360);
  const aspect = w / h;
  const buf = Buffer.alloc(w * h * 3);
  for (let j = 0; j < h; j++) {
    const ny = 1 - ((j + 0.5) / h) * 2;
    const edge = 1 - smooth((((j + 0.5) / h) - 0.9) / 0.1);
    for (let i = 0; i < w; i++) {
      const nx = ((i + 0.5) / w) * 2 - 1;
      const side = 1 - smooth((Math.abs(nx) - 0.9) / 0.1);
      const d = [0, 1, 2].map((k) => f[k] + r[k] * nx * t * aspect + u[k] * ny * t);
      let c = BG;
      if (d[1] < 0) {
        const s = -P[1] / d[1];
        const x = P[0] + d[0] * s;
        const z = P[2] + d[2] * s;
        const rr = Math.hypot(x, z) / FLOOR.radius;
        if (rr < 1) {
          const a = ramp(FLOOR.stops, rr);
          c = c.map((v, k) => v * (1 - a) + FLOOR.color[k] * a);
        }
        const ss = -(P[1] - SHADOW.y) / d[1];
        const gx = (P[0] + d[0] * ss) / SHADOW.half[0];
        const gz = (P[2] + d[2] * ss - SHADOW.z) / SHADOW.half[1];
        const rs = Math.hypot(gx, gz);
        if (rs < 1 && Math.abs(gx) <= 1 && Math.abs(gz) <= 1) {
          const a = SHADOW.opacity * ramp(SHADOW.stops, rs);
          c = c.map((v) => v * (1 - a));
        }
      }
      c = c.map((v, k) => BG[k] + (v - BG[k]) * edge * side);
      const o = (j * w + i) * 3;
      buf[o] = Math.round(c[0]);
      buf[o + 1] = Math.round(c[1]);
      buf[o + 2] = Math.round(c[2]);
    }
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } });
}

const cameras = existsSync(resolve(SRC, "cameras.json")) ? JSON.parse(readFileSync(resolve(SRC, "cameras.json"), "utf-8")) : {};

async function composed(key) {
  const src = resolve(SRC, `${key}.png`);
  if (!existsSync(src) || !cameras[key]) return null;
  const png = await studioLayer(cameras[key]).composite([{ input: src }]).png().toBuffer();
  return sharp(png);
}

for (const [key, w, h] of POSTERS) {
  const img = await composed(key);
  if (!img) continue;
  const base = img.resize(w, h, { fit: "cover" });
  const webp = resolve(PUB, `poster-${key}.webp`);
  await base.clone().webp({ quality: 80, effort: 6 }).toFile(webp);
  console.log(`${key}.webp: ${statSync(webp).size} B`);
  if (!webpOnly) {
    const avif = resolve(PUB, `poster-${key}.avif`);
    let quality = 55;
    await base.clone().avif({ quality, effort: 6 }).toFile(avif);
    while (statSync(avif).size > 200000 && quality > 30) {
      quality -= 5;
      await base.clone().avif({ quality, effort: 6 }).toFile(avif);
    }
    console.log(`${key}.avif: ${statSync(avif).size} B (q ${quality})`);
  }
}

const og = await composed("og");
if (og) {
  const out = resolve(PUB, "og.jpg");
  await og.resize(1200, 630, { fit: "cover" }).jpeg({ quality: 82, mozjpeg: true }).toFile(out);
  console.log(`og.jpg: ${statSync(out).size} B`);
}
