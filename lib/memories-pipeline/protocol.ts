// The reserve→commit protocol's shared vocabulary (TASK-15, RFC-001 §2.8).
// Dependency-free on purpose: convex/memoriesPipeline.ts (the Convex half)
// and app/api/m/[code]/process/route.ts (the Next half) both import it, and
// neither may drag the other's runtime into its bundle — sharp must never
// reach a Convex bundle, and Convex function registration must never run in
// the route. Keep this file free of imports.

// Machine error codes carried as ConvexError data by the secret-gated
// pipeline mutations. Not user-facing: the only caller is our own route
// handler, which maps them to HTTP statuses; guest-facing upload copy belongs
// to the TASK-17 UI and the i18n layer.
export const PIPELINE_ERROR = {
  /** SCANME_PIPELINE_SECRET is not configured on the deployment. */
  disabled: "pipeline:disabled",
  invalidSecret: "pipeline:invalid_secret",
  /** Space/guest/photo missing or not owned — masked as one code on purpose. */
  notFound: "pipeline:not_found",
  /** The photo's status admits no claim/commit (hidden, deleted, or an
   * un-claimed commit). */
  wrongState: "pipeline:wrong_state",
  /** The commit's pinned original does not match — a superseded pipeline run. */
  staleRun: "pipeline:stale_run",
  blobMissing: "pipeline:blob_missing",
  blobTooLarge: "pipeline:blob_too_large",
  notEntitled: "pipeline:not_entitled",
  variantMissing: "pipeline:variant_missing",
  variantInvalid: "pipeline:variant_invalid",
} as const;

export type PipelineErrorCode =
  (typeof PIPELINE_ERROR)[keyof typeof PIPELINE_ERROR];

// Defense-in-depth cap on the uploaded original. The TASK-16 client downscales
// to the plan dimension and encodes JPEG (single-digit MB); anything near this
// cap is not a phone photo. Bounds sharp's decode memory on the route.
export const ORIGINAL_MAX_BYTES = 25 * 1024 * 1024;
