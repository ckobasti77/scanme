// TASK-25 Step 0 item 1 — the transport's mutation deadline. TASK-24 Run 2
// proved ConvexHttpClient has no per-call timeout: a mutation await on a
// silently dead socket hangs until the OS gives up, and the guest watches a
// "reserving" spinner that never resolves. These tests pin the two halves of
// the fix: every Convex mutation leg (a) rejects with a retryable
// `mutation_timeout` at MUTATION_TIMEOUT_MS instead of hanging, and (b) is
// sent with { skipQueue: true } so one hung call can never pin the client's
// per-instance mutation FIFO and starve every retry behind it.
import { afterEach, describe, expect, test, vi } from "vitest";

const mutationCalls: Array<{ args: unknown; options: unknown }> = [];
let mutationImpl: () => Promise<unknown> = () => new Promise(() => undefined);

vi.mock("convex/browser", () => ({
  ConvexHttpClient: class {
    mutation(_ref: unknown, args: unknown, options: unknown): Promise<unknown> {
      mutationCalls.push({ args, options });
      return mutationImpl();
    }
  },
}));

import { createUploadBackend, MUTATION_TIMEOUT_MS } from "./backend";

function makeBackend() {
  return createUploadBackend({
    code: "TESTCODE",
    guestKey: "guest-key",
    convexUrl: "https://example.convex.cloud",
  });
}

afterEach(() => {
  vi.useRealTimers();
  mutationCalls.length = 0;
  mutationImpl = () => new Promise(() => undefined);
});

describe("mutation deadline (the spinner that never resolves)", () => {
  test("a reserve on a dead socket rejects with mutation_timeout at the deadline", async () => {
    vi.useFakeTimers();
    const backend = makeBackend();
    const outcome = backend.reserve().then(
      () => "resolved",
      (error: Error) => error,
    );
    await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS - 1);
    // Not yet — the deadline is generous on purpose.
    await vi.advanceTimersByTimeAsync(2);
    const settled = await outcome;
    expect(settled).toBeInstanceOf(Error);
    expect((settled as Error).name).toBe("mutation_timeout");
    expect((settled as Error).message).toBe("convex_client_timeout:reserve");
  });

  test("renew and release carry the same deadline", async () => {
    vi.useFakeTimers();
    const backend = makeBackend();
    const renew = backend.renewUploadUrl("photo-1").then(
      () => "resolved",
      (error: Error) => error.message,
    );
    const release = backend.release("photo-1").then(
      () => "resolved",
      (error: Error) => error.message,
    );
    await vi.advanceTimersByTimeAsync(MUTATION_TIMEOUT_MS + 1);
    expect(await renew).toBe("convex_client_timeout:renew");
    expect(await release).toBe("convex_client_timeout:release");
  });

  test("a mutation that answers in time passes its value through", async () => {
    vi.useFakeTimers();
    mutationImpl = () => Promise.resolve({ alreadyReady: true });
    const backend = makeBackend();
    const result = await backend.renewUploadUrl("photo-1");
    expect(result).toEqual({ alreadyReady: true });
  });

  test("every mutation leg bypasses the client FIFO with skipQueue", async () => {
    vi.useFakeTimers();
    mutationImpl = () => Promise.resolve({});
    const backend = makeBackend();
    await backend.reserve().catch(() => undefined);
    await backend.renewUploadUrl("photo-1").catch(() => undefined);
    await backend.release("photo-1").catch(() => undefined);
    expect(mutationCalls).toHaveLength(3);
    for (const call of mutationCalls) {
      expect(call.options).toEqual({ skipQueue: true });
    }
  });
});
