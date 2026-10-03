// TASK-21 STEP 0 — deriving the export JPEG (RFC-001 §2.8/§2.10).
//
// THE FORMAT DECISION. The pipeline stores AVIF (primary) + WebP (fallback) +
// thumb; NEITHER AVIF nor WebP belongs in a downloadable archive. A couple takes
// this ZIP to a print shop, opens it in Windows Photo Viewer, hands it to a
// photographer — and AVIF fails or renders inconsistently across a lot of that
// world. So every exported image is a JPEG.
//
// DERIVE AT EXPORT TIME, from the stored WebP variant. The alternative — keeping
// a fourth JPEG derivative per photo at pipeline time — would cost storage
// FOREVER, for every photo of every event, to serve an archive most couples
// download once. Deriving here pays CPU per export instead, and needs no schema
// change to `mediaAssets` and no touch to the frozen TASK-15 pipeline.
//
// WHY WebP AND NOT AVIF as the source: both full-size variants come from the
// SAME watermarked, EXIF-stripped, plan-clamped master (transform.ts), so they
// carry the same picture at the plan's maximum dimension — the exported JPEG is
// the largest quality the plan allows, watermarks already burned in. WebP just
// decodes far cheaper than AVIF (no libheif/libaom path), which matters when the
// job decodes 400 of them. We CANNOT do better than these variants: the original
// camera file was deleted after processing (TASK-15), so no untouched original
// exists to export — the honest best is the processed, watermarked master.
//
// sharp is imported DYNAMICALLY inside the function so this module loads in the
// Convex edge runtime (convex-test globs the worker that imports it) without
// ever pulling the native binary; it only loads when an export actually runs, in
// Node.

// Quality 90 mozjpeg: a "keep it forever / send it to print" quality. The WebP
// source is already YUV420, so JPEG's default 4:2:0 subsampling adds no further
// chroma loss beyond what the pipeline already committed to.
export const EXPORT_JPEG_QUALITY = 90;

export interface ExportJpeg {
  data: Uint8Array;
  width: number;
  height: number;
}

export async function deriveExportJpeg(webp: Uint8Array): Promise<ExportJpeg> {
  const sharp = (await import("sharp")).default;
  const out = await sharp(webp)
    // No withMetadata/keepExif: the JPEG carries no EXIF, no GPS, no ICC — the
    // WebP was already stripped, and this keeps the archive metadata-clean too.
    .jpeg({ quality: EXPORT_JPEG_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}
