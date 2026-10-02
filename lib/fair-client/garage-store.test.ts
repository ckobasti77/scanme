import { describe, expect, test, vi } from "vitest";
import {
  FAIR_GARAGE_STORAGE_KEY,
  addFairGarageModel,
  createEmptyFairGarageDocument,
  getFairGarageModels,
  hasFairGarageModel,
  parseFairGarageDocument,
  readFairGarage,
  removeFairGarageModel,
  subscribeToFairGarage,
  writeFairGarage,
  type FairGarageStorageEvent,
} from "./garage-store";

const SNAPSHOT = {
  eventSlug: "elektromobilnost-2026",
  modelSlug: "model-a",
  brandName: "Brend",
  displayName: "Model A",
  priceText: "30.000 EUR",
};

describe("fair garage store", () => {
  test("empty and invalid payloads recover to an empty document", () => {
    expect(parseFairGarageDocument(null)).toEqual({
      document: createEmptyFairGarageDocument(),
      status: "empty",
    });
    expect(parseFairGarageDocument("not-json")).toEqual({
      document: createEmptyFairGarageDocument(),
      status: "invalid",
    });
    expect(parseFairGarageDocument('{"version":2,"events":{}}')).toEqual({
      document: createEmptyFairGarageDocument(),
      status: "invalid",
    });
  });

  test("valid payload parsing drops malformed and duplicate items without losing the event", () => {
    const result = parseFairGarageDocument(
      JSON.stringify({
        version: 1,
        events: {
          event_a: [
            { modelId: "model_a", savedAt: 10, lastKnown: SNAPSHOT },
            { modelId: "model_a", savedAt: 20 },
            { modelId: "", savedAt: 30 },
            { modelId: "model_b", savedAt: "bad" },
          ],
          broken_event: "not-an-array",
        },
      }),
    );

    expect(result.status).toBe("ok");
    expect(result.document.events.event_a).toEqual([
      { modelId: "model_a", savedAt: 10, lastKnown: SNAPSHOT },
    ]);
    expect(result.document.events.broken_event).toBeUndefined();
  });

  test("models are isolated by event and a repeated add is idempotent", () => {
    const first = addFairGarageModel(createEmptyFairGarageDocument(), {
      eventId: "event_a",
      modelId: "model_a",
      savedAt: 100,
      lastKnown: SNAPSHOT,
    });
    const second = addFairGarageModel(first, {
      eventId: "event_b",
      modelId: "model_a",
      savedAt: 200,
    });
    const repeated = addFairGarageModel(second, {
      eventId: "event_a",
      modelId: "model_a",
      savedAt: 999,
      lastKnown: { ...SNAPSHOT, priceText: "29.000 EUR" },
    });

    expect(getFairGarageModels(repeated, "event_a")).toEqual([
      {
        modelId: "model_a",
        savedAt: 100,
        lastKnown: { ...SNAPSHOT, priceText: "29.000 EUR" },
      },
    ]);
    expect(getFairGarageModels(repeated, "event_b")).toEqual([
      { modelId: "model_a", savedAt: 200 },
    ]);
  });

  test("remove only affects the requested event and removes an empty event bucket", () => {
    const withTwoEvents = addFairGarageModel(
      addFairGarageModel(createEmptyFairGarageDocument(), {
        eventId: "event_a",
        modelId: "model_a",
        savedAt: 100,
      }),
      { eventId: "event_b", modelId: "model_a", savedAt: 200 },
    );

    const removed = removeFairGarageModel(withTwoEvents, "event_a", "model_a");
    expect(removed.events.event_a).toBeUndefined();
    expect(hasFairGarageModel(removed, "event_b", "model_a")).toBe(true);
    expect(removeFairGarageModel(removed, "event_a", "missing")).toBe(removed);
  });

  test("storage failures are explicit instead of pretending persistence succeeded", () => {
    const unavailable = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };

    expect(readFairGarage(unavailable).status).toBe("unavailable");
    expect(writeFairGarage(unavailable, createEmptyFairGarageDocument())).toEqual({
      ok: false,
      reason: "storage_unavailable",
    });
  });

  test("read and write use one stable storage key", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    const document = addFairGarageModel(createEmptyFairGarageDocument(), {
      eventId: "event_a",
      modelId: "model_a",
      savedAt: 100,
    });

    expect(writeFairGarage(storage, document)).toEqual({ ok: true });
    expect(values.has(FAIR_GARAGE_STORAGE_KEY)).toBe(true);
    expect(readFairGarage(storage)).toEqual({ document, status: "ok" });
  });

  test("cross-tab subscription ignores unrelated keys and parses garage changes", () => {
    let listener: ((event: FairGarageStorageEvent) => void) | undefined;
    const source = {
      addEventListener: vi.fn(
        (_type: "storage", next: (event: FairGarageStorageEvent) => void) => {
          listener = next;
        },
      ),
      removeEventListener: vi.fn(),
    };
    const onChange = vi.fn();
    const unsubscribe = subscribeToFairGarage(source, onChange);

    listener?.({ key: "other", newValue: null });
    expect(onChange).not.toHaveBeenCalled();

    listener?.({
      key: FAIR_GARAGE_STORAGE_KEY,
      newValue: JSON.stringify({ version: 1, events: {} }),
    });
    expect(onChange).toHaveBeenCalledWith({
      document: createEmptyFairGarageDocument(),
      status: "ok",
    });

    listener?.({ key: FAIR_GARAGE_STORAGE_KEY, newValue: null });
    expect(onChange).toHaveBeenLastCalledWith({
      document: createEmptyFairGarageDocument(),
      status: "empty",
    });

    unsubscribe();
    expect(source.removeEventListener).toHaveBeenCalledWith("storage", listener);
  });
});
