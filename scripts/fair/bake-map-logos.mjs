// Bakes the AMF map's monochrome logo look into the assets, so the map needs no
// CSS filter or mix-blend-mode on its labels (iOS Safari did not paint them).
//
// The map used `filter: grayscale(1) contrast(c)` + `mix-blend-mode: multiply`
// (+ opacity). For a grey value g, multiply over any backdrop B gives B·g, which
// is exactly black with alpha (1 − g) composited normally: B·(1 − α). So every
// pixel becomes black with alpha = srcAlpha · (1 − g′) · opacity, where g′ is
// the CSS grayscale + contrast of the pixel. Crops are the same presentation
// boxes the map used (`amfEntranceLogoCrops`, now baked in).
//
// Run: node scripts/fair/bake-map-logos.mjs
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const assets = join(root, "components/fair/map/brand-assets");
const out = join(assets, "map");
const providni = (name) => join(root, "public/sajam/izlagaci/2026/providni", `${name}.webp`);

const ENTRANCE = { contrast: 1.15, opacity: 1 };
const MOTO = { contrast: 1.3, opacity: 0.95 };

const LOGOS = [
  // Motorcycle stands in the hall (.motorcycleLogo).
  { key: "honda-moto", src: join(assets, "honda-moto.jpg"), ...MOTO },
  { key: "motogrini", src: join(assets, "motogrini.jpg"), ...MOTO },
  { key: "aprilia", src: join(assets, "aprilia.jpg"), ...MOTO },
  { key: "piaggio", src: join(assets, "piaggio.webp"), ...MOTO },
  // Entrance zone (.entranceLogo), with the former crop boxes [x, y, width, height].
  { key: "aster", src: providni("aster-marketing"), ...ENTRANCE },
  { key: "zepter", src: providni("zepter"), ...ENTRANCE },
  { key: "detailing", src: providni("detailing-store"), ...ENTRANCE },
  { key: "kostic", src: providni("kostic-rent-a-car"), ...ENTRANCE },
  { key: "direkcija", src: providni("jkp-direkcija-za-javni-prevoz"), ...ENTRANCE },
  { key: "ton", src: providni("turisticka-organizacija-nis"), ...ENTRANCE },
  { key: "parking", src: providni("jkp-parking-servis-nis"), ...ENTRANCE },
  { key: "amerikanac", src: join(assets, "amerikanac.jpg"), ...ENTRANCE },
  { key: "xtreme", src: join(root, "public/fair/izlagaci/2026/xtreme-motors.jpg"), crop: [16, 22, 272, 260], ...ENTRANCE },
  { key: "servoremont", src: join(assets, "servoremont.jpg"), crop: [12, 122, 278, 48], ...ENTRANCE },
  { key: "swm", src: join(assets, "swm.jpg"), crop: [0, 122, 300, 56], ...ENTRANCE },
  { key: "kia", src: join(assets, "kia.jpg"), crop: [3, 112, 294, 77], ...ENTRANCE },
  { key: "aodes", src: join(assets, "aodes.jpg"), crop: [0, 55, 300, 190], ...ENTRANCE },
  { key: "auto-happy", src: join(assets, "auto-happy.jpg"), crop: [10, 75, 286, 140], ...ENTRANCE },
  { key: "benni", src: join(assets, "benni.jpg"), crop: [6, 15, 286, 273], ...ENTRANCE },
  { key: "nm", src: join(assets, "nm-stomatologija.jpg"), crop: [6, 16, 290, 250], ...ENTRANCE },
  { key: "goes", src: join(assets, "goes.jpg"), crop: [19, 55, 264, 197], ...ENTRANCE },
];

await mkdir(out, { recursive: true });
for (const logo of LOGOS) {
  let image = sharp(logo.src).ensureAlpha();
  if (logo.crop) {
    const [left, top, width, height] = logo.crop;
    image = image.extract({ left, top, width, height });
  }
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < data.length; i += 4) {
    const grey = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    const contrasted = Math.min(1, Math.max(0, (grey - 0.5) * logo.contrast + 0.5));
    const alpha = (data[i + 3] / 255) * (1 - contrasted) * logo.opacity;
    pixels[i + 3] = Math.round(alpha * 255); // rgb stays 0: black
  }
  await sharp(pixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(join(out, `${logo.key}.png`));
  console.log(`${logo.key}.png ${info.width}×${info.height}`);
}
