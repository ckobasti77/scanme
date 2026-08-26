// Regenerates the committed TASK-15 test fixtures (and the embedded ScanMe
// watermark module) deterministically from code. Run from the repo root:
//
//   node lib/memories-pipeline/fixtures/generate.mjs
//
// The fixtures are committed binaries; this script exists so their provenance
// is code, not folklore. transform.test.ts re-asserts every precondition it
// relies on (the GPS fixture really carries GPS, the orientation fixture
// really says 6), so a bad regeneration fails loudly.
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..", "..");

// --- 0. the embedded watermark module (see scanme-watermark.ts provenance) ---
async function watermarkModule() {
  const png = await sharp(
    path.join(repoRoot, "public", "brand", "scanme-wordmark-mask.png"),
  )
    .resize({ width: 800 })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
  const b64 = JSON.stringify(png.toString("base64")).replace(
    /(.{100})/g,
    '$1" +\n  "',
  );
  const body = `// The ScanMe wordmark used as the guest-photo watermark (TASK-15, RFC-001
// §2.8). Embedded as base64 so the pipeline needs no runtime filesystem or
// network access to its own brand asset — bulletproof across next dev, the
// Vercel function bundle, and vitest, with no output-file-tracing concerns.
//
// Provenance: public/brand/scanme-wordmark-mask.png (2400×502, an alpha-only
// mask — RGB all 0, the shape lives in the alpha channel; the marketing site
// uses it via CSS mask), downscaled to 800px wide — 2.4× the largest width the
// watermark ever renders at (8% of a 4096px premium image = 328px) — and
// re-encoded lossless. Regenerate with lib/memories-pipeline/fixtures/
// generate.mjs (step 0) if the brand asset changes.
//
// The transform colorizes it white via negate({ alpha: false }) and derives
// the legibility shadow from this same alpha — see transform.ts.

export const SCANME_WATERMARK_PNG_BASE64 =
${b64};

export function scanmeWatermarkPng(): Buffer {
  return Buffer.from(SCANME_WATERMARK_PNG_BASE64, "base64");
}
`;
  fs.writeFileSync(
    path.join(here, "..", "scanme-watermark.ts"),
    body,
  );
}

// A photo-ish base: smooth gradients (not noise — noise is an encoder's worst
// case and nothing like a phone photo).
function gradientRaw(width, height) {
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      data[i] = Math.round((x / width) * 255);
      data[i + 1] = Math.round((y / height) * 255);
      data[i + 2] = Math.round(((x + y) / (width + height)) * 255);
    }
  }
  return data;
}

// --- 1. gps-tagged.jpg: 640×480, GPS EXIF (Belgrade), orientation 1 ----------
async function gpsTagged() {
  const jpeg = await sharp(gradientRaw(640, 480), {
    raw: { width: 640, height: 480, channels: 3 },
  })
    .jpeg({ quality: 90 })
    .withExifMerge({
      IFD0: { Make: "ScanMe fixtures", Model: "TASK-15" },
      IFD3: {
        GPSVersionID: "2 2 0 0",
        GPSLatitudeRef: "N",
        GPSLatitude: "44/1 49/1 0/1",
        GPSLongitudeRef: "E",
        GPSLongitude: "20/1 27/1 0/1",
      },
    })
    .toBuffer();
  fs.writeFileSync(path.join(here, "gps-tagged.jpg"), jpeg);
  const meta = await sharp(jpeg).metadata();
  const exif = meta.exif ? meta.exif.toString("latin1") : "";
  console.log(
    "gps-tagged.jpg",
    jpeg.length,
    "bytes; exif:",
    Boolean(meta.exif),
    "gps-marker:",
    exif.includes("N") && Boolean(meta.exif),
  );
}

// --- 2. orientation-6.jpg: sensor 320×200, green LEFT third ------------------
// Orientation 6 = rotate 90° CW to display: the sensor's left column becomes
// the display's TOP row, and the displayed image is 200×320 portrait.
async function orientation6() {
  const width = 320;
  const height = 200;
  const data = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3;
      if (x < width / 3) {
        data[i + 1] = 200; // green stripe on the sensor's left
      } else {
        data[i + 2] = 200; // blue elsewhere
      }
    }
  }
  const jpeg = await sharp(data, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  fs.writeFileSync(path.join(here, "orientation-6.jpg"), jpeg);
  const meta = await sharp(jpeg).metadata();
  console.log(
    "orientation-6.jpg",
    jpeg.length,
    "bytes; orientation:",
    meta.orientation,
    `${meta.width}x${meta.height}`,
  );
}

// --- 3. oversized.jpg: 3000×2000, above every tier's clamp -------------------
async function oversized() {
  const jpeg = await sharp(gradientRaw(3000, 2000), {
    raw: { width: 3000, height: 2000, channels: 3 },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
  fs.writeFileSync(path.join(here, "oversized.jpg"), jpeg);
  console.log("oversized.jpg", jpeg.length, "bytes");
}

// --- 4. flat-gray.jpg: 800×600 uniform mid-gray ------------------------------
// Uniform on purpose: any pixel variance in a corner region after the
// transform can only have come from a watermark.
async function flatGray() {
  const jpeg = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .jpeg({ quality: 95 })
    .toBuffer();
  fs.writeFileSync(path.join(here, "flat-gray.jpg"), jpeg);
  console.log("flat-gray.jpg", jpeg.length, "bytes");
}

// --- 5. business-logo.png: 160×64 solid red, opaque --------------------------
// Red so the bottom-left region's red dominance proves THIS logo (and not the
// white ScanMe mark) landed there.
async function businessLogo() {
  const png = await sharp({
    create: {
      width: 160,
      height: 64,
      channels: 4,
      background: { r: 220, g: 30, b: 30, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(here, "business-logo.png"), png);
  console.log("business-logo.png", png.length, "bytes");
}

await watermarkModule();
await gpsTagged();
await orientation6();
await oversized();
await flatGray();
await businessLogo();
console.log("fixtures written to", here);
