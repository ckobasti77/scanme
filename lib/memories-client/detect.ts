// TASK-16 STEP 1 — content-based image format detection.
//
// BY BYTES, NEVER BY NAME OR MIME. Phones lie about both: Android file
// managers and messaging apps hand over HEICs renamed `.jpg`, iOS in-app
// browsers hand over `application/octet-stream`, and `File.type` is whatever
// the picker felt like stamping. The only thing that cannot lie is the magic
// number at the front of the bytes, so this module reads nothing else.
//
// Pure functions on a Uint8Array — no DOM, no File — so the vitest suite can
// prove the sniffing (including the mislabelled-file case) without a browser.

export type DetectedFormat =
  | "jpeg"
  | "png"
  | "webp"
  | "gif"
  | "avif"
  | "heic"
  | "unknown";

// How much of the file the sniffer needs. Every signature below sits in the
// first dozens of bytes; an ISO-BMFF `ftyp` box (HEIC/AVIF brands) is ~16–100
// bytes. 1 KiB is comfortably past any real ftyp with zero cost.
export const SNIFF_BYTES = 1024;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset + length > bytes.length) return "";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += String.fromCharCode(bytes[offset + i]);
  }
  return out;
}

// ISO-BMFF brands that mean "decode this with libheif". mif1/msf1 are the
// generic HEIF structural brands some encoders use as the major brand with
// the codec brand only in the compatibles list.
const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "hevc",
  "hevx",
  "heim",
  "heis",
  "hevm",
  "hevs",
  "mif1",
  "msf1",
]);
const AVIF_BRANDS = new Set(["avif", "avis"]);

// An ISO-BMFF container starts with a `ftyp` box: [0..3] box size (big
// endian), [4..7] "ftyp", [8..11] major brand, [12..15] minor version, then
// 4-byte compatible brands to the end of the box. AVIF is checked across ALL
// brands first because AVIF files routinely list `mif1` among their
// compatibles — brand-set order, not brand position, decides.
function sniffBmff(bytes: Uint8Array): "heic" | "avif" | null {
  if (bytes.length < 16 || ascii(bytes, 4, 4) !== "ftyp") return null;
  const boxSize =
    (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  const end = Math.min(
    boxSize > 0 ? boxSize : bytes.length,
    bytes.length,
  );
  const brands = [ascii(bytes, 8, 4)];
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    brands.push(ascii(bytes, offset, 4));
  }
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return "avif";
  if (brands.some((brand) => HEIC_BRANDS.has(brand))) return "heic";
  return null;
}

export function detectImageFormat(bytes: Uint8Array): DetectedFormat {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a")) {
    return "gif";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  const bmff = sniffBmff(bytes);
  if (bmff) return bmff;
  return "unknown";
}

// Which detected formats the browser's own decoder handles. HEIC is the one
// mainstream phone format no browser decodes natively — it alone routes to
// the lazily-loaded WASM decoder. AVIF is native almost everywhere by now;
// prepare.ts still falls back to WASM if the native decode refuses.
export function isBrowserNativeFormat(format: DetectedFormat): boolean {
  return format !== "heic" && format !== "unknown";
}
