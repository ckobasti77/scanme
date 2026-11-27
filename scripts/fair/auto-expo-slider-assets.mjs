#!/usr/bin/env node
// Auto Expo 2026: slider photos of the five models from the owner's folder
// tmp/auto-expo-fotografije (not in git) -> public/fair/auto-expo-2026/slider/<slug>/…webp,
// plus the manifest lib/fair-gallery/auto-expo-2026.ts. Idempotent: same input, same output.
//   node scripts/fair/auto-expo-slider-assets.mjs
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = "tmp/auto-expo-fotografije";
const OUT = "public/fair/auto-expo-2026/slider";
const COLORS = {
  bela: ["Bela", "#f1f1ee"], crna: ["Crna", "#17181a"], plava: ["Plava", "#1d4ea0"], siva: ["Siva", "#6e7378"],
  zelena: ["Zelena", "#4d5c45"], crvena: ["Crvena", "#a8201a"], svetlosiva: ["Svetlosiva", "#b8bbbe"],
  srebrna: ["Srebrna", "#c3c6c9"], zuta: ["Žuta", "#e9c12a"],
};
// Boja vozila na štandu (27. 11.) ide prva: podrazumevana na slideru, salonu i fotografiji modela.
// Puma: naša "svetlosiva" (n4jc) je zelenkasta i ne liči na pravi auto, "siva" je pretamna -> bela.
// MG HS: srebrna (Silver) najviše liči na auto sa štanda.
const STAND_COLOR = { "ford-kuga": "crna", "ford-puma-mhev": "bela", "mg-zs-hybrid": "crvena", "mg-hs-hybrid": "srebrna", mg3: "bela" };
/** Renders of one angle are pixel-aligned across colours, and a white roof on the white studio is
 * invisible to carBox, so every colour takes the box of the black car (same angle, same frame). */
const blackBoxes = (groups) => {
  const black = groups.find((g) => g.id === "crna");
  return black ? groups.map((g) => ({ ...g, slides: g.slides.map((slide, i) => ({ ...slide, box: black.slides[i]?.box ?? black.slides[0].box })) })) : groups;
};
const standFirst = (slug, groups) => [...groups].sort((a, b) => (b.id === STAND_COLOR[slug]) - (a.id === STAND_COLOR[slug]));
const EN = { Black: "crna", Blue: "plava", Grey: "siva", Red: "crvena", Silver: "srebrna", White: "bela", Yellow: "zuta", Green: "zelena" };

/** Where the car is in a studio render, as fractions [x0, y0, x1, y1]: pixels clearly darker than
 * the white studio (any channel < 200, so the soft baked shadow stays out), at least 3 per row and
 * column. The slider frames the car with it (model-slider.module.css). */
async function carBox(file) {
  const { data, info } = await sharp(file).flatten({ background: "#ffffff" }).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: c } = info;
  const cols = new Uint32Array(w), rows = new Uint32Array(h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * c;
    if (data[i] < 200 || data[i + 1] < 200 || data[i + 2] < 200) { cols[x]++; rows[y]++; }
  }
  const first = (a) => a.findIndex((n) => n >= 3), last = (a) => a.length - 1 - [...a].reverse().findIndex((n) => n >= 3);
  const r = (n) => Math.round(n * 1000) / 1000;
  return [r(first(cols) / w), r(first(rows) / h), r((last(cols) + 1) / w), r((last(rows) + 1) / h)];
}

async function convert(src, dest, studio = true) {
  mkdirSync(path.dirname(dest), { recursive: true });
  const info = await sharp(src).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80, alphaQuality: 90 }).toFile(dest);
  const slide = { src: "/" + path.relative("public", dest).split(path.sep).join("/"), width: info.width, height: info.height };
  return studio ? { ...slide, box: await carBox(dest) } : slide;
}

function fordGroups(model, dir) {
  return readdirSync(dir).sort().map((folder) => {
    const id = folder.split("-")[0];
    const files = readdirSync(path.join(dir, folder)).filter((f) => /ugao\d+\.jpg$/.test(f)).sort();
    return { id, files: files.map((f, i) => [path.join(dir, folder, f), path.join(OUT, model, id, String(i + 1).padStart(2, "0") + ".webp")]) };
  });
}

async function build() {
  const gallery = {};
  for (const [slug, folder] of [["ford-kuga", "ford/ford-kuga"], ["ford-puma-mhev", "ford/ford-puma"]]) {
    const groups = [];
    for (const group of fordGroups(slug, path.join(SRC, folder, "boje-360"))) {
      const slides = await Promise.all(group.files.map(([s, d]) => convert(s, d)));
      groups.push({ id: group.id, label: COLORS[group.id][0], swatch: COLORS[group.id][1], slides });
    }
    gallery[slug] = { mode: "angles", groups: standFirst(slug, blackBoxes(groups)), extra: [] };
  }
  const mgPick = {
    mg3: ["mg/mg3/boje-konfigurator", (f) => /_Comfort_/.test(f) && !/_150-31\.png$/.test(f), (f) => f.match(/Comfort_([A-Za-z]+)_/)[1]],
    "mg-hs-hybrid": ["mg/mg-hs-hybrid/boje-konfigurator", () => true, (f) => f.match(/HEV-([A-Za-z]+)-/)[1]],
    "mg-zs-hybrid": ["mg/mg-zs-hybrid/boje-konfigurator", (f) => /_COM_/.test(f), (f) => f.match(/_COM_([A-Za-z]+)\./)[1]],
  };
  const order = ["bela", "crna", "siva", "srebrna", "plava", "crvena", "zelena", "zuta"];
  for (const [slug, [folder, keep, color]] of Object.entries(mgPick)) {
    const files = readdirSync(path.join(SRC, folder)).filter(keep);
    const entries = files.map((f) => ({ f, id: EN[color(f)] })).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const groups = [];
    for (const { f, id } of entries) {
      const slide = await convert(path.join(SRC, folder, f), path.join(OUT, slug, "boje", id + ".webp"));
      groups.push({ id, label: COLORS[id][0], swatch: COLORS[id][1], slides: [slide] });
    }
    const extra = [];
    if (slug === "mg-zs-hybrid") {
      const gal = readdirSync(path.join(SRC, "mg/mg-zs-hybrid/galerija")).sort();
      for (const [i, f] of gal.entries()) extra.push(await convert(path.join(SRC, "mg/mg-zs-hybrid/galerija", f), path.join(OUT, slug, "galerija", String(i + 1).padStart(2, "0") + ".webp"), false));
      extra.push(await convert(path.join(SRC, "mg/mg-zs-hybrid/profil/MG-ZS-Hybrid-plus-side.webp"), path.join(OUT, slug, "profil.webp"), false));
    }
    gallery[slug] = { mode: "colors", groups: standFirst(slug, blackBoxes(groups)), extra };
  }
  const ts = `// Generisano: node scripts/fair/auto-expo-slider-assets.mjs — ne menjati ručno.
/** \`box\`: the car in a studio render, fractions [x0, y0, x1, y1] of the image (scripts/fair/auto-expo-slider-assets.mjs). */
export type FairGallerySlide = { src: string; width: number; height: number; box?: readonly [number, number, number, number] };
export type FairGalleryGroup = { id: string; label: string; swatch: string; slides: readonly FairGallerySlide[] };
/** "angles": swatch bira boju, slajdovi su uglovi te boje. "colors": svaka boja je slajd, \`extra\` ide posle boja. */
export type FairModelGallery = { mode: "angles" | "colors"; groups: readonly FairGalleryGroup[]; extra: readonly FairGallerySlide[] };
export const AUTO_EXPO_2026_GALLERY: Readonly<Record<string, FairModelGallery>> = ${JSON.stringify(gallery, null, 2)};
`;
  writeFileSync("lib/fair-gallery/auto-expo-2026.ts", ts);
  const counts = Object.fromEntries(Object.entries(gallery).map(([k, g]) => [k, g.groups.reduce((n, gr) => n + gr.slides.length, 0) + g.extra.length]));
  console.log(counts);
}
build();
