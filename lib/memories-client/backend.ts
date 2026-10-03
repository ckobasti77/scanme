import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  ProcessOutcome,
  RenewResult,
  ReserveResult,
  UploadBackend,
} from "./queue";

// TASK-16 — the real transport behind the queue. Three legs, three protocols:
//
//  - Convex mutations (reserve / renew / release) over ConvexHttpClient with
//    the { code, guestKey } capability pair. The guestKey comes from
//    GET /m/[code]/whoami — client JS cannot read the HttpOnly cookie itself.
//  - The original's transfer: an XHR POST straight to the short-lived Convex
//    storage upload URL. XHR, not fetch, because upload progress events are
//    the only honest per-photo progress a guest can see AND they feed the
//    stall watchdog: a transfer that stops progressing for
//    PUT_STALL_TIMEOUT_MS is aborted and retried instead of hanging forever
//    on a socket iOS silently killed during a lock.
//  - The process call: POST /m/[code]/process (the cookie-scoped alias of
//    /api/m/[code]/process — the guest cookie is Path=/m/[code], so only URLs
//    under that path ever carry it). Same-origin fetch sends the cookie by
//    default; a hard timeout bounds the sharp stage's worst case.

// No upload progress for this long → the socket is dead (a locked phone's
// transfer never errors on its own). Generous enough for a saturated hall
// network to deliver SOME bytes; the queue retries with a fresh URL.
export const PUT_STALL_TIMEOUT_MS = 45_000;
// ConvexHttpClient has no per-call timeout or abort: a mutation await on a
// silently dead socket (a locked phone, a dying hall AP) hangs until the OS
// kills the socket — the guest stares at "reserving" forever (TASK-24 Run 2).
// Race every mutation against this deadline instead. The payload is a few
// hundred bytes: a socket that delivers nothing for 20 s is dead, not slow, so
// abandoning a mutation whose commit would still land (an orphan quota slot
// until the 24 h reaper) is a ~never case, while the guest's worst wait per
// attempt becomes bounded. The timeout is thrown as a plain retryable error —
// the queue's existing classify() → backoff/offline-hold path handles it.
export const MUTATION_TIMEOUT_MS = 20_000;
// The process route decodes + encodes three variants; production p95 is a few
// seconds. Past this, assume the function died and let the queue retry — the
// commit is idempotent per photoId, so a retry of a run that actually
// finished answers 200/alreadyReady.
export const PROCESS_TIMEOUT_MS = 90_000;

export interface UploadBackendOptions {
  /** The space code from the card (/m/[code]). */
  code: string;
  /** The guest's bearer key, from GET /m/[code]/whoami. */
  guestKey: string;
  /** NEXT_PUBLIC_CONVEX_URL. */
  convexUrl: string;
}

// Race a hung mutation against the deadline. The abandoned promise is
// swallowed (its eventual settle is nobody's business — the retry path owns
// the item from here); the thrown error's name is the queue's event detail.
function withDeadline<T>(promise: Promise<T>, leg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`convex_client_timeout:${leg}`);
      error.name = "mutation_timeout";
      reject(error);
    }, MUTATION_TIMEOUT_MS);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
    // If the deadline won, the original promise still settles later — absorb
    // it so an abandoned rejection never surfaces as unhandled.
    promise.catch(() => undefined);
  });
}

export function createUploadBackend(
  options: UploadBackendOptions,
): UploadBackend {
  const convex = new ConvexHttpClient(options.convexUrl);
  const { code, guestKey } = options;

  // skipQueue on every mutation is part of the timeout fix, not a tuning
  // knob: ConvexHttpClient serializes queued mutations per instance, so one
  // hung call (release is fire-and-forget and shares the client) would pin
  // the FIFO and every timed-out retry would re-enqueue behind the same dead
  // socket forever. The queue is strictly sequential by construction, so the
  // client-side FIFO adds no ordering we need.
  const skip = { skipQueue: true };

  return {
    async reserve(): Promise<ReserveResult> {
      return await withDeadline(
        convex.mutation(api.memories.reserveUpload, { code, guestKey }, skip),
        "reserve",
      );
    },

    async renewUploadUrl(photoId: string): Promise<RenewResult> {
      return await withDeadline(
        convex.mutation(
          api.memories.renewUploadUrl,
          {
            code,
            guestKey,
            photoId: photoId as Id<"memoriesPhotos">,
          },
          skip,
        ),
        "renew",
      );
    },

    putOriginal(
      uploadUrl: string,
      blob: Blob,
      onProgress: (fraction: number) => void,
      signal: AbortSignal,
    ): Promise<string> {
      return new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        let stallTimer: ReturnType<typeof setTimeout> | null = null;
        const clearStall = () => {
          if (stallTimer !== null) clearTimeout(stallTimer);
          stallTimer = null;
        };
        const armStall = () => {
          clearStall();
          stallTimer = setTimeout(() => {
            xhr.abort();
            reject(new Error("upload_stalled"));
          }, PUT_STALL_TIMEOUT_MS);
        };
        const onAbortSignal = () => xhr.abort();
        signal.addEventListener("abort", onAbortSignal, { once: true });
        const settle = (fn: () => void) => {
          clearStall();
          signal.removeEventListener("abort", onAbortSignal);
          fn();
        };

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && event.total > 0) {
            onProgress(event.loaded / event.total);
          }
          armStall();
        };
        xhr.onload = () =>
          settle(() => {
            if (xhr.status < 200 || xhr.status >= 300) {
              reject(new Error(`upload_http_${xhr.status}`));
              return;
            }
            try {
              const body = JSON.parse(xhr.responseText) as {
                storageId?: unknown;
              };
              if (typeof body.storageId === "string") {
                resolve(body.storageId);
              } else {
                reject(new Error("upload_bad_response"));
              }
            } catch (cause) {
              reject(
                cause instanceof Error
                  ? cause
                  : new Error("upload_bad_response"),
              );
            }
          });
        xhr.onerror = () => settle(() => reject(new Error("upload_network")));
        xhr.onabort = () => settle(() => reject(new Error("upload_aborted")));

        xhr.open("POST", uploadUrl);
        xhr.setRequestHeader("Content-Type", "image/jpeg");
        armStall();
        xhr.send(blob);
      });
    },

    async process(
      photoId: string,
      storageId: string,
      signal: AbortSignal,
    ): Promise<ProcessOutcome> {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        PROCESS_TIMEOUT_MS,
      );
      const onAbortSignal = () => controller.abort();
      signal.addEventListener("abort", onAbortSignal, { once: true });
      try {
        const response = await fetch(`/m/${encodeURIComponent(code)}/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId, storageId }),
          // Same-origin default already sends the path-scoped guest cookie;
          // explicit for the reader.
          credentials: "same-origin",
          signal: controller.signal,
        });
        let pipelineCode: string | undefined;
        try {
          const body = (await response.json()) as { code?: unknown };
          if (typeof body.code === "string") pipelineCode = body.code;
        } catch {
          // Non-JSON body (a proxy error page): the status is enough.
        }
        return { ok: response.ok, status: response.status, code: pipelineCode };
      } finally {
        clearTimeout(timeout);
        signal.removeEventListener("abort", onAbortSignal);
      }
    },

    async release(photoId: string): Promise<void> {
      await withDeadline(
        convex.mutation(
          api.memories.releaseReservation,
          {
            code,
            guestKey,
            photoId: photoId as Id<"memoriesPhotos">,
          },
          skip,
        ),
        "release",
      );
    },
  };
}
