// Providne kopije logoa izlagača za mapu sajma (9. 10. 2026).
//
// Organizatorovi logoi (public/fair/izlagaci/2026/, JPG 300×300) imaju belu
// podlogu, pa je mapa iza svakog logoa crtala beli kvadrat. Skripta od svakog
// originala pravi providnu WebP kopiju u public/sajam/izlagaci/2026/providni/,
// tačno one veličine koju deklariše FAIR_MAP_LOGO_THUMBS (lib/fair-map/logos.ts):
//
// 1. Pozadina = skoro bela oblast (sve tri komponente ≥ FLOOD_MIN, mala
//    zasićenost) povezana sa ivicom slike, plus male zatvorene bele oblasti
//    (unutrašnjost slova O, D, A…, ispod HOLE_MAX_SHARE slike). Velika bela
//    površina UNUTAR logoa (štit, ovalni okvir) je deo znaka i ostaje neprovidna.
// 2. Na pozadini i u pojasu od EDGE_BAND px oko nje radi se „boja u alfu“ za
//    belu (kao GIMP Color to Alpha): alfa = koliko se piksel razlikuje od bele
//    (JPG šum ispod ALPHA_RAMP_START je čista pozadina), a boja se vraća na onu
//    pre mešanja sa belom. Ivica logoa zato nema beli obod ni na tamnoj podlozi.
// 3. Providna margina se odseca, a logo se smešta (contain) u deklarisanu
//    veličinu sa providnim ostatkom.
//
// Pokretanje: node scripts/fair/map-logos-transparent.mjs
// Bez novih paketa: sharp je već zavisnost projekta.

import { mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE_DIR = join(ROOT, "public/fair/izlagaci/2026");
const OUT_DIR = join(ROOT, "public/sajam/izlagaci/2026/providni");
const FLOOD_MIN = 214;
const FLOOD_MAX_CHROMA = 40;
const EDGE_BAND = 2;
/** Zatvorena bela oblast manja od ovog udela slike je rupa u slovu, ne deo znaka. */
const HOLE_MAX_SHARE = 0.015;
/** JPG šum: razlika od bele ispod ovoga je pozadina; iznad se rampa razvlači do pune alfe. */
const ALPHA_RAMP_START = 0.1;

/** FAIR_MAP_LOGO_THUMBS iz lib/fair-map/logos.ts (jedan izvor istine, bez kopiranja tabele). */
function readThumbTable() {
  const source = readFileSync(join(ROOT, "lib/fair-map/logos.ts"), "utf8");
  const block = source.slice(source.indexOf("FAIR_MAP_LOGO_THUMBS"), source.indexOf("};", source.indexOf("FAIR_MAP_LOGO_THUMBS")));
  const rows = [...block.matchAll(/"([^"]+)":\s*\[(\d+),\s*(\d+)\]/g)].map((match) => [match[1], Number(match[2]), Number(match[3])]);
  if (rows.length === 0) throw new Error("FAIR_MAP_LOGO_THUMBS nije pronađen u lib/fair-map/logos.ts");
  return rows;
}

function removeWhiteBackground(data, width, height) {
  const count = width * height;
  const candidate = new Uint8Array(count);
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const low = Math.min(r, g, b);
    // Already transparent (PNG) or near white with little colour.
    candidate[index] = data[offset + 3] < 128 || (low >= FLOOD_MIN && Math.max(r, g, b) - low <= FLOOD_MAX_CHROMA) ? 1 : 0;
  }

  // Background: candidates connected to the image edge (4-neighbour flood fill).
  const background = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const seed = (index) => {
    if (candidate[index] && !background[index]) {
      background[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x += 1) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) seed(index - 1);
    if (x < width - 1) seed(index + 1);
    if (index >= width) seed(index - width);
    if (index < count - width) seed(index + width);
  }

  // Enclosed near-white regions: small ones are letter counters → background too.
  const seen = new Uint8Array(background);
  for (let start = 0; start < count; start += 1) {
    if (!candidate[start] || seen[start]) continue;
    head = 0;
    tail = 0;
    seen[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      for (const next of [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, index - width, index + width]) {
        if (next < 0 || next >= count || !candidate[next] || seen[next]) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    if (tail < count * HOLE_MAX_SHARE) for (let k = 0; k < tail; k += 1) background[queue[k]] = 1;
  }

  // The anti-aliased rim: EDGE_BAND px around the background.
  const soften = new Uint8Array(background);
  for (let pass = 0; pass < EDGE_BAND; pass += 1) {
    const grown = new Uint8Array(soften);
    for (let index = 0; index < count; index += 1) {
      if (soften[index]) continue;
      const x = index % width;
      if ((x > 0 && soften[index - 1]) || (x < width - 1 && soften[index + 1]) || (index >= width && soften[index - width]) || (index < count - width && soften[index + width])) grown[index] = 1;
    }
    soften.set(grown);
  }

  // Colour to alpha (white) on the background and its rim.
  for (let index = 0; index < count; index += 1) {
    if (!soften[index]) continue;
    const offset = index * 4;
    const sourceAlpha = data[offset + 3] / 255;
    let alpha = 0;
    for (let channel = 0; channel < 3; channel += 1) alpha = Math.max(alpha, (255 - data[offset + channel]) / 255);
    alpha = Math.max(0, (alpha - ALPHA_RAMP_START) / (1 - ALPHA_RAMP_START));
    for (let channel = 0; channel < 3; channel += 1) {
      data[offset + channel] = alpha === 0 ? 0 : Math.round(Math.min(255, Math.max(0, 255 - (255 - data[offset + channel]) / alpha)));
    }
    data[offset + 3] = Math.round(alpha * sourceAlpha * 255);
  }
  return data;
}

async function convert(file, targetWidth, targetHeight) {
  const { data, info } = await sharp(join(SOURCE_DIR, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cleared = removeWhiteBackground(data, info.width, info.height);
  const trimmed = await sharp(cleared, { raw: { width: info.width, height: info.height, channels: 4 } })
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 1 })
    .png()
    .toBuffer();
  const output = join(OUT_DIR, file.replace(/\.[a-z]+$/i, ".webp"));
  await sharp(trimmed)
    .resize(targetWidth, targetHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 }, kernel: "lanczos3" })
    .webp({ quality: 72, alphaQuality: 70, effort: 6, smartSubsample: true })
    .toFile(output);
  return { output, bytes: statSync(output).size };
}

mkdirSync(OUT_DIR, { recursive: true });
let total = 0;
for (const [file, width, height] of readThumbTable()) {
  const { bytes } = await convert(file, width, height);
  total += bytes;
  console.log(`${file.padEnd(40)} → providni/${file.replace(/\.[a-z]+$/i, ".webp")} ${width}×${height} ${bytes} B`);
}
console.log(`ukupno ${total} B`);
