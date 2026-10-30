// AMF 2026 (30 Oct 2026): converts the exhibitors' own photos (source folder
// "Sajam '26 (specifikacije)") into the app's model photo format: landscape
// WebP, max 1600 px wide, quality 78, in public/fair/auto-moto-fest-2026/.
// No photo is generated; crops only make portrait/square originals landscape.
// Usage: node scripts/fair/amf-photos.mjs "<source folder>" [<swm page-3 png>]
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [source, swmPng] = process.argv.slice(2);
if (!source) throw new Error("usage: amf-photos.mjs <source folder> [<swm png>]");
const out = join(process.cwd(), "public/fair/auto-moto-fest-2026");
mkdirSync(out, { recursive: true });

// slug → [source path, optional crop { left, top, width, height } in source px]
const PHOTOS = {
  "skoda-fabia": ["Skoda/Skoda Fotke/Fabia_BS_001_Front_Static.jpg"],
  "skoda-kamiq": ["Skoda/Skoda Fotke/kamiq.webp"],
  "skoda-octavia": ["Skoda/Skoda Fotke/3_Octavia post.jpg", { left: 0, top: 1150, width: 4368, height: 2730 }],
  // No extension; the file is WebP (detected by sharp from its bytes).
  "skoda-karoq": ["Skoda/Skoda Fotke/karoq"],
  "skoda-kodiaq": ["Skoda/Skoda Fotke/skoda-kodiaq-ng-m55-home-tiles-square.jpg", { left: 0, top: 200, width: 946, height: 591 }],
  "skoda-superb": ["Skoda/Skoda Fotke/skoda-superb-combi-ng-m55-home-tiles-square.jpg", { left: 0, top: 180, width: 946, height: 591 }],
  // Website capture: the crop drops the carousel arrows at both edges.
  "dongfeng-m-hero-817": ["Dongfeng/Dongfeng slike/M HERO 817/a5zae5tzae5t6.webp", { left: 170, top: 0, width: 1580, height: 1080 }],
  "dongfeng-box": ["Dongfeng/Dongfeng slike/BOX/e57usetzasetz.png"],
  "dongfeng-forthing-t5-hev": ["Dongfeng/Dongfeng slike/T5 HEV/aetzaertzaert.jpg"],
  "fiat-grande-panda": ["Dongfeng/Dongfeng slike/Grande Panda/wtzaetzaetz.jpg"],
  "mg-zs-hybrid": ["Grand Motors, ford, etc/grand motors foto/MG ZS HEV.jpg"],
  "mg-hs-hybrid": ["Grand Motors, ford, etc/grand motors foto/MG HS HEV.jpg"],
  "mg-s5-ev": ["Grand Motors, ford, etc/grand motors foto/MG S5 ev.jpg"],
  "ford-puma-mhev": ["Grand Motors, ford, etc/grand motors foto/Ford Puma mHEV.jpg"],
  "ford-kuga": ["Grand Motors, ford, etc/grand motors foto/Ford Kuga.jpg"],
  "ford-ranger-raptor": ["Grand Motors, ford, etc/grand motors foto/raptor.png"],
  "ineos-grenadier": ["Grand Motors, ford, etc/grand motors foto/Ineos Grenadier.jpg"],
};

async function write(slug, input, crop) {
  let image = sharp(input).rotate();
  if (crop) image = image.extract(crop);
  const info = await image
    .flatten({ background: "#ffffff" })
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 78, effort: 6 })
    .toFile(join(out, `${slug}.webp`));
  console.log(`${slug}.webp ${info.width}x${info.height} ${(info.size / 1024).toFixed(0)} KB`);
}

for (const [slug, [path, crop]] of Object.entries(PHOTOS)) await write(slug, join(source, path), crop);
// SWM G01 Pro: the car image of page 3 of the SWM PDF (transparent PNG
// rebuilt from the PDF's image + soft mask streams), centred on the car.
if (swmPng) await write("swm-g01-pro", swmPng, { left: 540, top: 0, width: 1580, height: 1085 });
