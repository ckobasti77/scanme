// TASK-16 STEP 5 — the queue's contract, proven against a scripted backend:
// strictly sequential (never two transfers in flight), a failure retries the
// SAME photoId through renewUploadUrl (reserveUpload is called exactly once
// per item, ever), a definitive failure calls releaseReservation, exhausted
// transient failures keep the slot for a manual retry, and a non-image is
// rejected before anything touches the server.

import { afterEach, describe, expect, test, vi } from "vitest";
import { memoriesSr } from "@/lib/i18n/sr/memories";
import { PrepareError, type PreparedImage } from "./prepare";
import {
  MemoriesUploadQueue,
  type ProcessOutcome,
  type QueueSnapshot,
  type UploadBackend,
} from "./queue";

afterEach(() => {
  vi.useRealTimers();
});

function file(name = "photo.jpg", size = 5000): File {
  return new File([new Uint8Array(size)], name, { type: "image/jpeg" });
}

function prepared(): PreparedImage {
  return {
    blob: new Blob([new Uint8Array(1000)]),
    width: 100,
    height: 75,
    sourceFormat: "jpeg",
    sourceBytes: 5000,
    preparedBytes: 1000,
  };
}

const okPrepare = async () => prepared();
const okSniff = async () => "jpeg" as const;

interface Script {
  /** Reject the Nth putOriginal call (1-based) with a network error. */
  failPuts?: number[];
  /** Fail every putOriginal call. */
  failAllPuts?: boolean;
  /** Outcome for the Nth process call (1-based); default committed. */
  processOutcomes?: ProcessOutcome[];
  /** Renew answers alreadyReady. */
  renewAlreadyReady?: boolean;
}

function makeBackend(script: Script = {}) {
  const calls: string[] = [];
  let photoCounter = 0;
  let putCount = 0;
  let processCount = 0;
  let transfersInFlight = 0;
  let maxTransfersInFlight = 0;

  const backend: UploadBackend = {
    async reserve() {
      photoCounter += 1;
      const photoId = `photo-${photoCounter}`;
      calls.push(`reserve→${photoId}`);
      return {
        photoId,
        uploadUrl: `url-${photoId}-0`,
        maxImageDimension: 2048,
        limit: 3,
        remaining: 3 - photoCounter,
      };
    },
    async renewUploadUrl(photoId) {
      calls.push(`renew:${photoId}`);
      if (script.renewAlreadyReady) return { alreadyReady: true };
      return { alreadyReady: false, uploadUrl: `url-${photoId}-renewed` };
    },
    async putOriginal(uploadUrl, _blob, onProgress) {
      putCount += 1;
      const thisPut = putCount;
      calls.push(`put:${uploadUrl}`);
      transfersInFlight += 1;
      maxTransfersInFlight = Math.max(maxTransfersInFlight, transfersInFlight);
      try {
        // Yield so overlapping items would actually overlap here.
        await Promise.resolve();
        if (script.failAllPuts || script.failPuts?.includes(thisPut)) {
          throw new Error("upload_network");
        }
        onProgress(1);
        return `storage-${thisPut}`;
      } finally {
        transfersInFlight -= 1;
      }
    },
    async process(photoId, storageId) {
      processCount += 1;
      calls.push(`process:${photoId}:${storageId}`);
      return (
        script.processOutcomes?.[processCount - 1] ?? { ok: true, status: 200 }
      );
    },
    async release(photoId) {
      calls.push(`release:${photoId}`);
    },
  };

  return {
    backend,
    calls,
    stats: () => ({ maxTransfersInFlight, putCount, processCount }),
  };
}

function makeQueue(backend: UploadBackend) {
  const snapshots: QueueSnapshot[] = [];
  const queue = new MemoriesUploadQueue({
    backend,
    prepare: okPrepare,
    sniff: okSniff,
    lifecycle: false,
  });
  queue.subscribe((snapshot) => snapshots.push(snapshot));
  return { queue, snapshots };
}

function states(queue: MemoriesUploadQueue) {
  return queue.getSnapshot().items.map((item) => item.state);
}

// Drive the queue to quiescence under fake timers: advance through every
// backoff until no item is queued/uploading/processing.
async function settle(queue: MemoriesUploadQueue, maxMs = 600_000) {
  let waited = 0;
  while (queue.getSnapshot().hasPendingWork && waited < maxMs) {
    await vi.advanceTimersByTimeAsync(1000);
    waited += 1000;
  }
  // A final flush for microtask tails.
  await vi.advanceTimersByTimeAsync(0);
}

describe("sequentiality (the whole point)", () => {
  test("three items upload strictly one at a time, in order", async () => {
    vi.useFakeTimers();
    const { backend, calls, stats } = makeBackend();
    const { queue } = makeQueue(backend);
    queue.enqueue([file("a.jpg"), file("b.jpg"), file("c.jpg")]);
    await settle(queue);

    expect(states(queue)).toEqual(["ready", "ready", "ready"]);
    // Never two transfers in flight — the saturated-uplink invariant.
    expect(stats().maxTransfersInFlight).toBe(1);
    // Every call of item N precedes every call of item N+1.
    expect(calls).toEqual([
      "reserve→photo-1",
      "put:url-photo-1-0",
      "process:photo-1:storage-1",
      "reserve→photo-2",
      "put:url-photo-2-0",
      "process:photo-2:storage-2",
      "reserve→photo-3",
      "put:url-photo-3-0",
      "process:photo-3:storage-3",
    ]);
  });
});

describe("retries reuse the same photoId (STEP 0 contract)", () => {
  test("a failed transfer renews the URL and retries — reserve is called once", async () => {
    vi.useFakeTimers();
    const { backend, calls } = makeBackend({ failPuts: [1, 2] });
    const { queue } = makeQueue(backend);
    queue.enqueue([file()]);
    await settle(queue);

    expect(states(queue)).toEqual(["ready"]);
    expect(calls.filter((c) => c.startsWith("reserve")).length).toBe(1);
    // Two failures → two renews; the third transfer commits the SAME photo.
    expect(calls.filter((c) => c === "renew:photo-1").length).toBe(2);
    expect(calls.at(-1)).toBe("process:photo-1:storage-3");
    expect(calls.filter((c) => c.startsWith("release")).length).toBe(0);
  });

  test("a retryable process failure retries the commit with the same photoId and blob", async () => {
    vi.useFakeTimers();
    const { backend, calls } = makeBackend({
      processOutcomes: [{ ok: false, status: 503 }, { ok: true, status: 200 }],
    });
    const { queue } = makeQueue(backend);
    queue.enqueue([file()]);
    await settle(queue);

    expect(states(queue)).toEqual(["ready"]);
    // The blob already landed: no second put, no renew — just the commit again.
    expect(calls.filter((c) => c.startsWith("put")).length).toBe(1);
    expect(calls.filter((c) => c.startsWith("process")).length).toBe(2);
    expect(calls[calls.length - 1]).toBe("process:photo-1:storage-1");
  });

  test("pipeline:blob_missing re-uploads the original against the same photoId", async () => {
    vi.useFakeTimers();
    const { backend, calls } = makeBackend({
      processOutcomes: [
        { ok: false, status: 400, code: "pipeline:blob_missing" },
        { ok: true, status: 200 },
      ],
    });
    const { queue } = makeQueue(backend);
    queue.enqueue([file()]);
    await settle(queue);

    expect(states(queue)).toEqual(["ready"]);
    expect(calls.filter((c) => c.startsWith("reserve")).length).toBe(1);
    expect(calls.filter((c) => c.startsWith("put")).length).toBe(2);
    expect(calls.at(-1)).toBe("process:photo-1:storage-2");
  });

  test("renew answering alreadyReady marks the item saved without re-processing", async () => {
    vi.useFakeTimers();
    const { backend, calls } = makeBackend({
      failPuts: [1],
      renewAlreadyReady: true,
    });
    const { queue } = makeQueue(backend);
    queue.enqueue([file()]);
    await settle(queue);

    expect(states(queue)).toEqual(["ready"]);
    // One failed transfer, then the renew learned the pre-lock run committed.
    expect(calls.filter((c) => c.startsWith("process")).length).toBe(0);
  });
});

describe("definitive failures release the slot", () => {
  test("a definitive server rejection calls releaseReservation once", async () => {
    vi.useFakeTimers();
    const { backend, calls } = makeBackend({
      processOutcomes: [{ ok: false, status: 403 }],
    });
    const { queue } = makeQueue(backend);
    queue.enqueue([file()]);
    await settle(queue);

    const item = queue.getSnapshot().items[0];
    expect(item.state).toBe("failed");
    expect(item.canRetry).toBe(false);
    expect(item.errorMessage).toBe(memoriesSr.uploadRejected);
    expect(calls.filter((c) => c === "release:photo-1").length).toBe(1);
  });

  test("a decode failure after reserving releases the slot", async () => {
    vi.useFakeTimers();
    const { backend, calls } = makeBackend();
    const queue = new MemoriesUploadQueue({
      backend,
      sniff: okSniff,
      prepare: async () => {
        throw new PrepareError("decode_failed");
      },
      lifecycle: false,
    });
    queue.enqueue([file()]);
    await settle(queue);

    const item = queue.getSnapshot().items[0];
    expect(item.state).toBe("failed");
    expect(item.errorMessage).toBe(memoriesSr.decodeFailed);
    expect(calls).toEqual(["reserve→photo-1", "release:photo-1"]);
  });

  test("removing a pending item with a slot releases it", async () => {
    vi.useFakeTimers();
    const { backend, calls } = makeBackend({ failAllPuts: true });
    const { queue } = makeQueue(backend);
    const [item] = queue.enqueue([file()]);
    await settle(queue); // exhausts auto-retries → failed, slot kept
    expect(queue.getSnapshot().items[0].canRetry).toBe(true);

    queue.remove(item.id);
    await vi.advanceTimersByTimeAsync(0);
    expect(queue.getSnapshot().items).toHaveLength(0);
    expect(calls.filter((c) => c === "release:photo-1").length).toBe(1);
  });
});

describe("exhausted transient failures keep the slot for a manual retry", () => {
  test("failed(canRetry) → retry() resumes with the SAME photoId, never re-reserving", async () => {
    vi.useFakeTimers();
    const script: Script = { failAllPuts: true };
    const { backend, calls } = makeBackend(script);
    const { queue } = makeQueue(backend);
    const [item] = queue.enqueue([file()]);
    await settle(queue);

    const failed = queue.getSnapshot().items[0];
    expect(failed.state).toBe("failed");
    expect(failed.canRetry).toBe(true);
    expect(failed.errorMessage).toBe(memoriesSr.uploadFailed);
    expect(failed.photoId).toBe("photo-1");
    // The slot was NOT released — it is what the retry resumes with.
    expect(calls.filter((c) => c.startsWith("release")).length).toBe(0);

    script.failAllPuts = false;
    queue.retry(item.id);
    await settle(queue);

    expect(states(queue)).toEqual(["ready"]);
    expect(calls.filter((c) => c.startsWith("reserve")).length).toBe(1);
    expect(calls.at(-1)).toMatch(/^process:photo-1:/);
  });
});

describe("non-images are rejected early", () => {
  test("an unknown format fails before any server call", async () => {
    vi.useFakeTimers();
    const { backend, calls } = makeBackend();
    const queue = new MemoriesUploadQueue({
      backend,
      prepare: okPrepare,
      sniff: async () => "unknown" as const,
      lifecycle: false,
    });
    queue.enqueue([file("not-a-photo.txt")]);
    await settle(queue);

    const item = queue.getSnapshot().items[0];
    expect(item.state).toBe("failed");
    expect(item.canRetry).toBe(false);
    expect(item.errorMessage).toBe(memoriesSr.notAnImage);
    expect(calls).toEqual([]); // nothing reserved, nothing to release
  });

  test("a failed item does not block the rest of the batch", async () => {
    vi.useFakeTimers();
    const { backend } = makeBackend();
    let first = true;
    const queue = new MemoriesUploadQueue({
      backend,
      prepare: okPrepare,
      sniff: async () => {
        if (first) {
          first = false;
          return "unknown" as const;
        }
        return "jpeg" as const;
      },
      lifecycle: false,
    });
    queue.enqueue([file("garbage.bin"), file("real.jpg")]);
    await settle(queue);
    expect(states(queue)).toEqual(["failed", "ready"]);
  });
});

describe("offline hold (locked phone with the radio down)", () => {
  test("failures while navigator.onLine === false spend no retry budget; the online kick resumes", async () => {
    vi.useFakeTimers();
    const script: Script = { failAllPuts: true };
    const { backend, calls } = makeBackend(script);
    const { queue } = makeQueue(backend);

    vi.stubGlobal("navigator", { onLine: false });
    try {
      queue.enqueue([file()]);
      // Minutes pass — far beyond what six backoff attempts would survive.
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      const held = queue.getSnapshot().items[0];
      expect(held.state).toBe("uploading"); // parked, NOT failed
      expect(held.attempt).toBe(0); // the budget is untouched

      // The phone unlocks: network back, the online listener kicks the queue.
      script.failAllPuts = false;
      vi.stubGlobal("navigator", { onLine: true });
      queue.kick("online");
      await settle(queue);
      expect(states(queue)).toEqual(["ready"]);
      expect(calls.filter((c) => c.startsWith("reserve")).length).toBe(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("quota surface", () => {
  test("the snapshot carries the last reservation's limit/remaining", async () => {
    vi.useFakeTimers();
    const { backend } = makeBackend();
    const { queue } = makeQueue(backend);
    queue.enqueue([file(), file()]);
    await settle(queue);
    expect(queue.getSnapshot().quota).toEqual({ limit: 3, remaining: 1 });
  });
});
