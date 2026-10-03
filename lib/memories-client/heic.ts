import { heicTo } from "heic-to";

// TASK-16 STEP 1 — the WASM decode boundary. This module is loaded ONLY via
// dynamic import() from prepare.ts, and only after the file's BYTES said HEIC
// (or an ISO-BMFF native decode failed) — never from a static import chain.
// Keeping the static `import { heicTo }` HERE is what lets the bundler split
// the ~3 MB heic-to/libheif payload into an on-demand chunk that the common
// case (iOS hands the picker a system-transcoded JPEG) never downloads.
//
// libheif applies the container's irot/imir transforms during decode, and the
// ImageBitmap it returns carries no metadata — so the orientation contract in
// prepare.ts (fully-applied pixels, no surviving tag) holds on this path too.
export async function decodeHeifToBitmap(file: Blob): Promise<ImageBitmap> {
  return await heicTo({ blob: file, type: "bitmap" });
}
