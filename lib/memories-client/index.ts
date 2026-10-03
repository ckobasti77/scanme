// TASK-16 — the client image pipeline: decode, downscale, queue (RFC-001
// §2.8, client side). Headless on purpose: no React, no DOM assumptions
// beyond canvas/XHR inside function bodies, no copy of its own (item errors
// carry memories-dict strings). TASK-17's guest screens consume exactly this
// surface; the /dev/memories-upload harness exercises it today.
export {
  detectImageFormat,
  isBrowserNativeFormat,
  SNIFF_BYTES,
  type DetectedFormat,
} from "./detect";
export {
  CLIENT_JPEG_QUALITY,
  fitWithin,
  PrepareError,
  prepareForUpload,
  sniffFile,
  type PreparedImage,
  type PrepareFailure,
} from "./prepare";
export {
  MemoriesUploadQueue,
  type ProcessOutcome,
  type PrepareFn,
  type SniffFn,
  type QueueSnapshot,
  type RenewResult,
  type ReserveResult,
  type UploadBackend,
  type UploadItemPhase,
  type UploadItemSnapshot,
  type UploadItemState,
  type UploadQueueEvent,
  type UploadQueueOptions,
} from "./queue";
export {
  createUploadBackend,
  PROCESS_TIMEOUT_MS,
  PUT_STALL_TIMEOUT_MS,
  type UploadBackendOptions,
} from "./backend";
