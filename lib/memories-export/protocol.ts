// TASK-21 — constants and machine error codes shared across the export's three
// worlds: the Convex orchestration (memoriesExport.ts), the Node worker
// (memoriesExportWorker.ts), the panel UI, and the bench. Dependency-free on
// purpose (mirrors lib/memories-pipeline/protocol.ts) so every runtime imports
// it without dragging anything platform-specific along.

// Photos per continuation. Small enough that one batch's decoded JPEGs
// (≈ BATCH × ~0.6–2 MB) stay well under any action's memory ceiling, so the
// build never becomes "one giant action"; large enough that a 400-photo event
// is ~20 continuations, not 400.
export const EXPORT_BATCH_SIZE = 20;

// How long a finished archive's download link lives. After this the archive blob
// is purged by cron and the link is dead — the export is a keepsake snapshot,
// not perpetual hosting. The panel copy (exportLifetimeNote) states the same 14.
export const EXPORT_LINK_TTL_DAYS = 14;

// Stored on the job row's `error` when a build fails; the panel maps each to a
// Serbian sentence (memories-panel: exportError*). Prose never crosses this
// boundary — only the code.
export const MEMORIES_EXPORT_ERROR = {
  noPhotos: "no_photos",
  buildFailed: "build_failed",
  storageFailed: "storage_failed",
} as const;

export type MemoriesExportErrorCode =
  (typeof MEMORIES_EXPORT_ERROR)[keyof typeof MEMORIES_EXPORT_ERROR];
