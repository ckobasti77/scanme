import { ConvexError } from "convex/values";
import { memoriesSr } from "@/lib/i18n/sr/memories";
import {
  PrepareError,
  prepareForUpload,
  sniffFile,
  type PreparedImage,
} from "./prepare";
import type { DetectedFormat } from "./detect";

// =============================================================================
// TASK-16 STEP 3 — the upload queue. This is the whole point of the client
// module: getting a night's photos off one phone, over a saturated hall
// network, without lying to the guest about what is safe.
//
// SEQUENTIAL PER DEVICE, NEVER PARALLEL. Three photos uploading at once from
// one phone share one thin pipe: all three slow down together, all three hit
// their timeouts together, and the guest loses everything at once. One at a
// time means the first two are already committed when the third fails — the
// failure costs one photo's progress, not the night. The pump below can, by
// construction, only run one item end-to-end at a time; there is no
// concurrency knob to misconfigure.
//
// THE RESERVATION CONTRACT (STEP 0, convex/memories.ts): an item's `photoId`
// is minted by exactly ONE reserveUpload call and is reused by every retry —
// automatic or manual — for the item's whole lifetime. Retries fetch fresh
// upload URLs through renewUploadUrl (Convex upload URLs are short-lived and
// single-use), never a second reservation. When an item fails definitively,
// releaseReservation frees the guest's quota slot immediately.
//
// SUCCESS IS THE SERVER'S WORD, NEVER OURS. An item reaches `ready` only when
// POST /m/[code]/process answers 200 — i.e. the Convex commit transaction
// (mediaAssets insert + status flip) confirmed. A guest told "saved" who
// finds nothing later is worse than a guest looking at a retry button, so no
// optimistic transition exists in this file.
//
// WHAT ACTUALLY HAPPENS ON iOS WHEN THE PHONE LOCKS MID-UPLOAD (and the
// Android equivalent, backgrounding the tab): JS execution freezes wholesale —
// timers stop, the event loop halts, and the in-flight XHR/fetch is severed
// by the network stack either at freeze time or on resume; depending on the
// iOS version it rejects promptly on resume or simply hangs with no error,
// ever. Nothing observable happens DURING the lock; recovery is entirely
// about what we do on resume. On unlock, visibilitychange/pageshow/online
// fire kick(), which (a) short-circuits any backoff sleep that was pending,
// and (b) aborts an in-flight transfer that has made no progress for
// STALE_TRANSFER_MS — covering the hung-socket case the OS never errors out.
// The aborted attempt re-enters the retry loop with NO extra backoff:
// renewUploadUrl → re-upload → process, against the same photoId. Items
// already `ready` stay ready; the active item loses at most its own transfer
// progress. And when the page is alive but the network is down (some
// browsers deliver exactly that during a lock), failures with
// navigator.onLine === false do not spend the retry budget at all — the item
// holds until connectivity returns, so a minutes-long lock cannot exhaust
// its way into a manual-retry state. The queue and its File handles live in page memory, which
// suspension preserves — a full page RELOAD is a different event and is what
// the beforeunload warning below is for.
// =============================================================================

export type UploadItemState =
  | "queued"
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

// Sub-step of the active item, for observability (the dev harness log and
// TASK-17's fine-grained progress). Machine keys, not copy.
export type UploadItemPhase =
  | "idle"
  | "sniffing"
  | "reserving"
  | "renewing"
  | "preparing"
  | "putting"
  | "waiting_retry"
  | "committing";

export interface ReserveResult {
  photoId: string;
  uploadUrl: string;
  maxImageDimension: number;
  limit: number;
  remaining: number;
}

export type RenewResult =
  | { alreadyReady: true }
  | { alreadyReady: false; uploadUrl: string };

export interface ProcessOutcome {
  ok: boolean;
  status: number;
  code?: string;
}

// The transport the queue drives. Injected so the queue's behavior — strict
// sequentiality, same-photoId retries, release on definitive failure — is
// provable in vitest with a scripted fake; createUploadBackend (backend.ts)
// is the real one.
export interface UploadBackend {
  reserve(): Promise<ReserveResult>;
  renewUploadUrl(photoId: string): Promise<RenewResult>;
  putOriginal(
    uploadUrl: string,
    blob: Blob,
    onProgress: (fraction: number) => void,
    signal: AbortSignal,
  ): Promise<string>;
  process(
    photoId: string,
    storageId: string,
    signal: AbortSignal,
  ): Promise<ProcessOutcome>;
  release(photoId: string): Promise<void>;
}

export type PrepareFn = (
  file: Blob,
  maxDimension: number,
) => Promise<PreparedImage>;

export type SniffFn = (file: Blob) => Promise<DetectedFormat>;

export interface UploadItemSnapshot {
  id: string;
  name: string;
  state: UploadItemState;
  phase: UploadItemPhase;
  /** 0..1 across the original's transfer; 1 only when `ready`. */
  progress: number;
  attempt: number;
  photoId: string | null;
  /** Guest-language copy from the memories dict (server- or client-raised). */
  errorMessage: string | null;
  /** true: the slot is still held and retry(id) resumes with the same photoId. */
  canRetry: boolean;
  sourceBytes: number;
  preparedBytes: number | null;
  sourceFormat: string | null;
  width: number | null;
  height: number | null;
  enqueuedAt: number;
  finishedAt: number | null;
}

export interface QueueSnapshot {
  items: UploadItemSnapshot[];
  quota: { limit: number; remaining: number } | null;
  /** Anything queued, uploading, or processing — drives the unload warning. */
  hasPendingWork: boolean;
}

export interface UploadQueueEvent {
  at: number;
  itemId: string | null;
  type: string;
  detail?: string;
}

export interface UploadQueueOptions {
  backend: UploadBackend;
  /** Test seam; defaults to the real decode/downscale/encode pipeline. */
  prepare?: PrepareFn;
  /** Test seam; defaults to the real byte sniffer. */
  sniff?: SniffFn;
  onEvent?: (event: UploadQueueEvent) => void;
  /**
   * Wire window/document listeners (visibility/pageshow/online kicks and the
   * navigate-away warning). Default: true when a window exists. The unload
   * warning uses the browser's own generic dialog (custom text is ignored by
   * modern browsers), so no copy is needed here.
   */
  lifecycle?: boolean;
  maxAutoAttempts?: number;
}

interface QueueItem {
  id: string;
  file: Blob;
  name: string;
  state: UploadItemState;
  phase: UploadItemPhase;
  progress: number;
  attempt: number;
  sniffed: boolean;
  photoId: string | null;
  uploadUrl: string | null;
  storageId: string | null;
  maxImageDimension: number | null;
  prepared: PreparedImage | null;
  errorMessage: string | null;
  canRetry: boolean;
  removed: boolean;
  /** Skip the backoff wait once after a kick — connectivity just returned. */
  kicked: boolean;
  lastProgressAt: number;
  enqueuedAt: number;
  finishedAt: number | null;
}

// Retry pacing. Six attempts spread over ~1 minute of waiting: long enough to
// ride out a network brownout, short enough that a guest staring at the
// screen gets an honest `failed` (with a working retry) instead of a spinner.
const BACKOFF_BASE_MS = 1000;
const BACKOFF_CAP_MS = 30_000;
const BACKOFF_JITTER_MS = 250;
const DEFAULT_MAX_AUTO_ATTEMPTS = 6;
// On resume/online, an in-flight transfer with no progress for this long is a
// dead socket the OS will never error — abort it and retry immediately.
const STALE_TRANSFER_MS = 10_000;
// While navigator.onLine === false, retries hold instead of burning the
// auto-retry budget against a radio that is definitely down (a locked phone
// is offline for MINUTES — the budget would exhaust and turn every long lock
// into a manual retry). The online kick wakes the hold early; this is only
// the re-check backstop for browsers whose online event misfires. Only the
// explicit `false` is trusted — onLine === true famously proves nothing.
const OFFLINE_HOLD_MS = 60_000;

// HTTP statuses worth retrying. 409 is included deliberately: a resumed
// client can race its own pre-lock pipeline run (wrong_state/stale_run); the
// retried process call then lands on the committed row and answers
// alreadyReady via renew, or succeeds outright.
const RETRYABLE_HTTP = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
// pipeline:blob_missing means our storageId never became a complete blob —
// recoverable by renewing the URL and re-uploading, unlike the other 4xx.
const BLOB_MISSING_CODE = "pipeline:blob_missing";

class TerminalFailure extends Error {
  constructor(
    readonly userMessage: string,
    readonly causeDetail?: unknown,
  ) {
    super("terminal");
  }
}

class RetryableFailure extends Error {
  constructor(
    readonly detail: string,
    readonly resetStorage = false,
  ) {
    super("retryable");
  }
}

function backoffDelay(attempt: number): number {
  const exp = Math.min(
    BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1),
    BACKOFF_CAP_MS,
  );
  return exp + Math.floor(Math.random() * BACKOFF_JITTER_MS);
}

function prepareErrorMessage(reason: PrepareError["reason"]): string {
  return reason === "not_an_image"
    ? memoriesSr.notAnImage
    : memoriesSr.decodeFailed;
}

// Server refusals arrive as ConvexError whose data IS the guest-language
// dict string (convex/memories.ts throws the same memoriesSr constants this
// module imports — one shared vocabulary, compared by value, no parallel
// error-code system to drift).
function convexErrorData(error: unknown): string | null {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }
  return null;
}

export class MemoriesUploadQueue {
  private readonly backend: UploadBackend;
  private readonly prepare: PrepareFn;
  private readonly sniff: SniffFn;
  private readonly onEvent?: (event: UploadQueueEvent) => void;
  private readonly maxAutoAttempts: number;

  private items: QueueItem[] = [];
  private quota: { limit: number; remaining: number } | null = null;
  private listeners = new Set<(snapshot: QueueSnapshot) => void>();
  private pumping = false;
  private disposed = false;
  private wake: (() => void) | null = null;
  private activeController: AbortController | null = null;
  private activeItem: QueueItem | null = null;
  private lifecycleWired = false;
  private unloadWired = false;

  constructor(options: UploadQueueOptions) {
    this.backend = options.backend;
    this.prepare = options.prepare ?? prepareForUpload;
    this.sniff = options.sniff ?? sniffFile;
    this.onEvent = options.onEvent;
    this.maxAutoAttempts =
      options.maxAutoAttempts ?? DEFAULT_MAX_AUTO_ATTEMPTS;
    const lifecycle =
      options.lifecycle ?? (typeof window !== "undefined" ? true : false);
    if (lifecycle && typeof window !== "undefined") {
      this.wireLifecycle();
    }
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  enqueue(files: Iterable<File>): UploadItemSnapshot[] {
    if (this.disposed) return [];
    const added: QueueItem[] = [];
    for (const file of files) {
      const item: QueueItem = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        state: "queued",
        phase: "idle",
        progress: 0,
        attempt: 0,
        sniffed: false,
        photoId: null,
        uploadUrl: null,
        storageId: null,
        maxImageDimension: null,
        prepared: null,
        errorMessage: null,
        canRetry: false,
        removed: false,
        kicked: false,
        lastProgressAt: 0,
        enqueuedAt: Date.now(),
        finishedAt: null,
      };
      this.items.push(item);
      added.push(item);
      this.event(item.id, "enqueued", file.name);
    }
    this.emit();
    void this.pump();
    return added.map((item) => this.snapshotItem(item));
  }

  /** Manual retry of a failed item. REUSES the item's photoId and any already
   * prepared/uploaded bytes — it never re-reserves (STEP 0 contract). */
  retry(itemId: string): void {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item || item.state !== "failed" || !item.canRetry) return;
    item.state = "queued";
    item.phase = "idle";
    item.attempt = 0;
    item.errorMessage = null;
    item.progress = 0;
    item.finishedAt = null;
    this.event(item.id, "manual_retry", item.photoId ?? undefined);
    this.emit();
    void this.pump();
  }

  /** Remove an item. A pending item's reservation is released so the guest
   * gets the quota slot back immediately; a `ready` item stays saved (removing
   * a saved photo is deleteMyPhoto's job, not the queue's). */
  remove(itemId: string): void {
    const item = this.items.find((entry) => entry.id === itemId);
    if (!item) return;
    item.removed = true;
    if (this.activeItem === item) {
      // runItem sees `removed` after the abort and does the release + drop.
      this.activeController?.abort();
      this.wake?.();
      return;
    }
    if (item.photoId && item.state !== "ready") {
      this.releaseSlot(item);
    }
    this.drop(item);
  }

  /** Wake the pump: cut any backoff wait short and abort a transfer that has
   * made no progress for STALE_TRANSFER_MS (the dead socket a resumed page is
   * left holding). Wired to visibilitychange/pageshow/online. */
  kick(reason: string): void {
    if (this.disposed) return;
    this.event(null, "kick", reason);
    const item = this.activeItem;
    if (
      item &&
      (item.phase === "putting" || item.phase === "committing") &&
      Date.now() - item.lastProgressAt > STALE_TRANSFER_MS
    ) {
      item.kicked = true;
      this.event(item.id, "stale_transfer_abort", item.phase);
      this.activeController?.abort();
    }
    if (item && item.phase === "waiting_retry") {
      item.kicked = true;
    }
    this.wake?.();
    void this.pump();
  }

  subscribe(listener: (snapshot: QueueSnapshot) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): QueueSnapshot {
    return {
      items: this.items.map((item) => this.snapshotItem(item)),
      quota: this.quota ? { ...this.quota } : null,
      hasPendingWork: this.hasPendingWork(),
    };
  }

  dispose(): void {
    this.disposed = true;
    this.activeController?.abort();
    this.wake?.();
    this.unwireLifecycle();
    this.listeners.clear();
  }

  // ---------------------------------------------------------------------------
  // The pump — sequential by construction
  // ---------------------------------------------------------------------------

  private async pump(): Promise<void> {
    if (this.pumping || this.disposed) return;
    this.pumping = true;
    try {
      for (;;) {
        const item = this.items.find((entry) => entry.state === "queued");
        if (!item || this.disposed) break;
        this.activeItem = item;
        await this.runItem(item);
        this.activeItem = null;
      }
    } finally {
      this.activeItem = null;
      this.pumping = false;
    }
  }

  private async runItem(item: QueueItem): Promise<void> {
    for (;;) {
      if (this.disposed) return;
      if (item.removed) {
        if (item.photoId && item.state !== "ready") this.releaseSlot(item);
        this.drop(item);
        return;
      }
      try {
        await this.attempt(item);
        return; // ready (or removed mid-flight, handled next loop entry)
      } catch (error) {
        if (item.removed || this.disposed) {
          if (item.photoId && item.state !== "ready") this.releaseSlot(item);
          this.drop(item);
          return;
        }
        const verdict = this.classify(error);
        if (verdict.kind === "terminal") {
          // Definitive: free the slot NOW (best-effort — the 24h reaper is
          // the backstop), then show an honest failure. Not retryable: the
          // reservation is gone, and re-adding the file is a new upload.
          if (item.photoId) this.releaseSlot(item);
          this.fail(item, verdict.message, false);
          return;
        }
        if (verdict.resetStorage) {
          item.storageId = null;
        }
        // A failure with the network known-down does not spend the retry
        // budget — park until connectivity returns (the online kick cuts the
        // hold short) and try again as if nothing was burned.
        if (
          typeof navigator !== "undefined" &&
          navigator.onLine === false
        ) {
          this.setPhase(item, "waiting_retry");
          this.event(item.id, "offline_hold", verdict.detail);
          await this.sleep(OFFLINE_HOLD_MS);
          continue;
        }
        item.attempt += 1;
        this.event(
          item.id,
          "retry_scheduled",
          `attempt=${item.attempt} ${verdict.detail}`,
        );
        if (item.attempt >= this.maxAutoAttempts) {
          // Transient failures exhausted: keep the slot — the photoId (and
          // any prepared bytes) are exactly what a manual retry resumes with.
          this.fail(item, memoriesSr.uploadFailed, true);
          return;
        }
        const delay = item.kicked ? 0 : backoffDelay(item.attempt);
        item.kicked = false;
        this.setPhase(item, "waiting_retry");
        await this.sleep(delay);
      }
    }
  }

  private async attempt(item: QueueItem): Promise<void> {
    this.transition(item, "uploading");

    // 0. SNIFF the bytes — before anything touches the server, so a
    //    non-image is rejected clearly and EARLY, in the guest's language,
    //    without ever consuming (and then having to release) a quota slot.
    //    By content, never by extension or MIME: phones lie about both.
    if (!item.sniffed) {
      this.setPhase(item, "sniffing");
      const format = await this.sniff(item.file);
      if (format === "unknown") {
        throw new TerminalFailure(memoriesSr.notAnImage);
      }
      item.sniffed = true;
      this.event(item.id, "sniffed", format);
    }

    // 1. THE SLOT — minted exactly once per item (STEP 0 contract). Retries
    //    renew the short-lived upload URL against the same photoId instead.
    if (!item.photoId) {
      this.setPhase(item, "reserving");
      const reservation = await this.backend.reserve();
      item.photoId = reservation.photoId;
      item.uploadUrl = reservation.uploadUrl;
      item.maxImageDimension = reservation.maxImageDimension;
      this.quota = {
        limit: reservation.limit,
        remaining: reservation.remaining,
      };
      this.event(item.id, "reserved", item.photoId);
      this.emit();
    }

    // 2. PREPARE — once per item; cached so retries never re-decode or
    //    re-encode. The plan dimension comes from the reservation response.
    if (!item.prepared) {
      this.setPhase(item, "preparing");
      try {
        item.prepared = await this.prepare(
          item.file,
          item.maxImageDimension ?? Number.MAX_SAFE_INTEGER,
        );
      } catch (error) {
        if (error instanceof PrepareError) {
          throw new TerminalFailure(prepareErrorMessage(error.reason), error);
        }
        throw new TerminalFailure(memoriesSr.decodeFailed, error);
      }
      this.event(
        item.id,
        "prepared",
        `${item.prepared.sourceBytes}B → ${item.prepared.preparedBytes}B (${item.prepared.width}×${item.prepared.height})`,
      );
      this.emit();
    }

    // 3. TRANSFER the JPEG — skipped when a previous attempt already landed
    //    the blob (then only the process call is retried).
    if (!item.storageId) {
      if (!item.uploadUrl) {
        this.setPhase(item, "renewing");
        const renewed = await this.backend.renewUploadUrl(item.photoId);
        if (renewed.alreadyReady) {
          // A pre-lock run committed and we never saw the response — the
          // server, not the client, says this photo is saved.
          this.succeed(item);
          return;
        }
        item.uploadUrl = renewed.uploadUrl;
      }
      this.setPhase(item, "putting");
      item.lastProgressAt = Date.now();
      const controller = new AbortController();
      this.activeController = controller;
      try {
        item.storageId = await this.backend.putOriginal(
          item.uploadUrl,
          item.prepared.blob,
          (fraction) => {
            item.progress = fraction;
            item.lastProgressAt = Date.now();
            this.emit();
          },
          controller.signal,
        );
      } finally {
        // The URL is single-use and short-lived: consumed on success, suspect
        // after any failure — the next attempt renews either way.
        item.uploadUrl = null;
        this.activeController = null;
      }
    }

    // 4. PROCESS — the server transform + Convex commit. `ready` is declared
    //    on the server's 200 and nowhere else.
    this.transition(item, "processing");
    this.setPhase(item, "committing");
    item.lastProgressAt = Date.now();
    const controller = new AbortController();
    this.activeController = controller;
    let outcome: ProcessOutcome;
    try {
      outcome = await this.backend.process(
        item.photoId,
        item.storageId,
        controller.signal,
      );
    } finally {
      this.activeController = null;
    }
    if (outcome.ok) {
      this.succeed(item);
      return;
    }
    if (outcome.code === BLOB_MISSING_CODE) {
      throw new RetryableFailure(outcome.code, true);
    }
    if (RETRYABLE_HTTP.has(outcome.status)) {
      throw new RetryableFailure(`http_${outcome.status}`);
    }
    throw new TerminalFailure(memoriesSr.uploadRejected, outcome);
  }

  // ---------------------------------------------------------------------------
  // Failure classification
  // ---------------------------------------------------------------------------

  private classify(error: unknown):
    | { kind: "terminal"; message: string }
    | { kind: "retryable"; detail: string; resetStorage: boolean } {
    if (error instanceof TerminalFailure) {
      return { kind: "terminal", message: error.userMessage };
    }
    if (error instanceof RetryableFailure) {
      return {
        kind: "retryable",
        detail: error.detail,
        resetStorage: error.resetStorage,
      };
    }
    const convexData = convexErrorData(error);
    if (convexData !== null) {
      // Server refusal in guest language. Only the burst throttle is worth
      // waiting out; quota/window/session refusals do not fix themselves.
      if (convexData === memoriesSr.rateLimited) {
        return { kind: "retryable", detail: "rate_limited", resetStorage: false };
      }
      return { kind: "terminal", message: convexData };
    }
    // Network failures, aborted transfers, stalled sockets: retry.
    const detail = error instanceof Error ? error.name : "unknown";
    return { kind: "retryable", detail, resetStorage: false };
  }

  // ---------------------------------------------------------------------------
  // State plumbing
  // ---------------------------------------------------------------------------

  private transition(item: QueueItem, state: UploadItemState): void {
    if (item.state !== state) {
      item.state = state;
      this.event(item.id, "state", state);
      this.emit();
    }
  }

  private setPhase(item: QueueItem, phase: UploadItemPhase): void {
    if (item.phase !== phase) {
      item.phase = phase;
      this.event(item.id, "phase", phase);
      this.emit();
    }
  }

  private succeed(item: QueueItem): void {
    item.progress = 1;
    item.phase = "idle";
    item.finishedAt = Date.now();
    this.transition(item, "ready");
  }

  private fail(item: QueueItem, message: string, canRetry: boolean): void {
    item.errorMessage = message;
    item.canRetry = canRetry;
    item.phase = "idle";
    item.finishedAt = Date.now();
    this.transition(item, "failed");
  }

  private releaseSlot(item: QueueItem): void {
    if (!item.photoId) return;
    const photoId = item.photoId;
    this.event(item.id, "release", photoId);
    // Fire-and-forget: a failed release is the reaper's problem, never the
    // guest's — nothing in the UI waits on it.
    void this.backend.release(photoId).catch(() => undefined);
  }

  private drop(item: QueueItem): void {
    this.items = this.items.filter((entry) => entry !== item);
    this.event(item.id, "removed");
    this.emit();
  }

  private hasPendingWork(): boolean {
    return this.items.some(
      (item) =>
        item.state === "queued" ||
        item.state === "uploading" ||
        item.state === "processing",
    );
  }

  private snapshotItem(item: QueueItem): UploadItemSnapshot {
    return {
      id: item.id,
      name: item.name,
      state: item.state,
      phase: item.phase,
      progress: item.progress,
      attempt: item.attempt,
      photoId: item.photoId,
      errorMessage: item.errorMessage,
      canRetry: item.canRetry,
      sourceBytes: item.file.size,
      preparedBytes: item.prepared?.preparedBytes ?? null,
      sourceFormat: item.prepared?.sourceFormat ?? null,
      width: item.prepared?.width ?? null,
      height: item.prepared?.height ?? null,
      enqueuedAt: item.enqueuedAt,
      finishedAt: item.finishedAt,
    };
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.syncUnloadWarning(snapshot.hasPendingWork);
    for (const listener of this.listeners) listener(snapshot);
  }

  private event(itemId: string | null, type: string, detail?: string): void {
    this.onEvent?.({ at: Date.now(), itemId, type, detail });
  }

  private sleep(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.wake = null;
        resolve();
      }, ms);
      this.wake = () => {
        clearTimeout(timer);
        this.wake = null;
        resolve();
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Browser lifecycle — resume kicks and the navigate-away warning
  // ---------------------------------------------------------------------------

  private readonly onVisibility = () => {
    if (document.visibilityState === "visible") this.kick("visible");
  };
  private readonly onPageShow = () => this.kick("pageshow");
  private readonly onOnline = () => this.kick("online");
  private readonly onBeforeUnload = (event: BeforeUnloadEvent) => {
    // The browser shows its own generic leave-page dialog; custom copy is
    // ignored by every modern browser, so none is provided.
    event.preventDefault();
    event.returnValue = "";
  };

  private wireLifecycle(): void {
    if (this.lifecycleWired) return;
    this.lifecycleWired = true;
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pageshow", this.onPageShow);
    window.addEventListener("online", this.onOnline);
  }

  private unwireLifecycle(): void {
    if (typeof window === "undefined") return;
    if (this.lifecycleWired) {
      document.removeEventListener("visibilitychange", this.onVisibility);
      window.removeEventListener("pageshow", this.onPageShow);
      window.removeEventListener("online", this.onOnline);
      this.lifecycleWired = false;
    }
    if (this.unloadWired) {
      window.removeEventListener("beforeunload", this.onBeforeUnload);
      this.unloadWired = false;
    }
  }

  private syncUnloadWarning(pending: boolean): void {
    if (!this.lifecycleWired || typeof window === "undefined") return;
    if (pending && !this.unloadWired) {
      window.addEventListener("beforeunload", this.onBeforeUnload);
      this.unloadWired = true;
    } else if (!pending && this.unloadWired) {
      window.removeEventListener("beforeunload", this.onBeforeUnload);
      this.unloadWired = false;
    }
  }
}
