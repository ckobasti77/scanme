import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFavoriteSync } from "./favorite-sync";

type Call = { modelId: string; resolve: () => void; reject: () => void };

function setup(confirmed?: string) {
  const calls: Call[] = [];
  const saved: string[] = [];
  const failed: Array<string | undefined> = [];
  const sync = createFavoriteSync({
    confirmed,
    delayMs: 300,
    send: (modelId) =>
      new Promise<string>((resolve, reject) => {
        calls.push({ modelId, resolve: () => resolve(modelId), reject: () => reject(new Error("x")) });
      }),
    onSaved: (modelId) => saved.push(modelId),
    onFailed: (value) => failed.push(value),
  });
  return { sync, calls, saved, failed };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

describe("createFavoriteSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("rapid A→B→A→C sends only C", async () => {
    const { sync, calls, saved } = setup();
    for (const id of ["A", "B", "A", "C"]) {
      sync.choose(id);
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(calls.map((call) => call.modelId)).toEqual(["C"]);
    calls[0].resolve();
    await settle();
    expect(saved).toEqual(["C"]);
  });

  it("a tap during a request queues the newest choice after it, in order", async () => {
    const { sync, calls, saved } = setup("A");
    sync.choose("B");
    await vi.advanceTimersByTimeAsync(300);
    expect(calls.map((call) => call.modelId)).toEqual(["B"]);
    sync.choose("A");
    await vi.advanceTimersByTimeAsync(300);
    sync.choose("C");
    await vi.advanceTimersByTimeAsync(300);
    // Still one request in flight: nothing is sent out of order.
    expect(calls).toHaveLength(1);
    calls[0].resolve();
    await settle();
    expect(saved).toEqual([]);
    expect(calls.map((call) => call.modelId)).toEqual(["B", "C"]);
    calls[1].resolve();
    await settle();
    expect(saved).toEqual(["C"]);
  });

  it("returning to the confirmed choice sends nothing", async () => {
    const { sync, calls } = setup("A");
    sync.choose("B");
    sync.choose("A");
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toHaveLength(0);
  });

  it("a failed final request rolls back to the last confirmed favorite", async () => {
    const { sync, calls, saved, failed } = setup("A");
    sync.choose("B");
    await vi.advanceTimersByTimeAsync(300);
    sync.choose("C");
    await vi.advanceTimersByTimeAsync(300);
    calls[0].resolve();
    await settle();
    calls[1].reject();
    await settle();
    expect(saved).toEqual([]);
    expect(failed).toEqual(["B"]);
  });

  it("a stale failure is ignored when a newer choice is waiting", async () => {
    const { sync, calls, saved, failed } = setup("A");
    sync.choose("B");
    await vi.advanceTimersByTimeAsync(300);
    sync.choose("C");
    await vi.advanceTimersByTimeAsync(300);
    calls[0].reject();
    await settle();
    expect(failed).toEqual([]);
    expect(calls.map((call) => call.modelId)).toEqual(["B", "C"]);
    calls[1].resolve();
    await settle();
    expect(saved).toEqual(["C"]);
  });

  it("dispose sends a pending choice at once", async () => {
    const { sync, calls } = setup("A");
    sync.choose("B");
    sync.dispose();
    expect(calls.map((call) => call.modelId)).toEqual(["B"]);
  });
});
