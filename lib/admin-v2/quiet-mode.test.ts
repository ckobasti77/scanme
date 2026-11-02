import { describe, expect, it } from "vitest";
import { advanceLedger, missionBoard } from "./missions";
import { QUIET_MODE_KEY, celebrationsOn, createQuietModeStore, readQuietMode, writeQuietMode } from "./quiet-mode";
import { ADMIN_TOAST_MAX, createToastStore } from "./toast";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

const broken = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("the quiet mode is kept in this browser", () => {
  it("is off until it is turned on", () => {
    expect(readQuietMode(memoryStorage())).toBe(false);
    expect(readQuietMode(memoryStorage({ [QUIET_MODE_KEY]: "1" }))).toBe(true);
    expect(readQuietMode(memoryStorage({ [QUIET_MODE_KEY]: "da" }))).toBe(false);
  });

  it("is written on and removed off", () => {
    const storage = memoryStorage();
    expect(writeQuietMode(storage, true)).toBe(true);
    expect(storage.values.get(QUIET_MODE_KEY)).toBe("1");
    expect(writeQuietMode(storage, false)).toBe(true);
    expect(storage.values.has(QUIET_MODE_KEY)).toBe(false);
  });

  it("a storage that throws, or none at all, is never an error: the mode is off and the write says it was not kept", () => {
    expect(readQuietMode(broken)).toBe(false);
    expect(readQuietMode(null)).toBe(false);
    expect(readQuietMode(undefined)).toBe(false);
    expect(writeQuietMode(broken, true)).toBe(false);
    expect(writeQuietMode(broken, false)).toBe(false);
    expect(writeQuietMode(null, true)).toBe(false);
  });
});

describe("the quiet mode of a tab", () => {
  it("starts from the stored choice and writes a change through", () => {
    const storage = memoryStorage({ [QUIET_MODE_KEY]: "1" });
    const store = createQuietModeStore(() => storage);
    expect(store.get()).toBe(true);
    store.set(false);
    expect(store.get()).toBe(false);
    expect(storage.values.has(QUIET_MODE_KEY)).toBe(false);
  });

  it("tells its listeners about a change, once, and not about the same value", () => {
    const store = createQuietModeStore(() => memoryStorage());
    let calls = 0;
    const stop = store.subscribe(() => {
      calls += 1;
    });
    store.set(true);
    store.set(true);
    expect(calls).toBe(1);
    stop();
    store.set(false);
    expect(calls).toBe(1);
  });

  it("with a storage that throws the choice still holds while the page is open", () => {
    const store = createQuietModeStore(() => broken);
    expect(store.get()).toBe(false);
    expect(() => store.set(true)).not.toThrow();
    expect(store.get()).toBe(true);
  });

  it("without a storage (the server) it is off", () => {
    expect(createQuietModeStore(() => null).get()).toBe(false);
  });
});

describe("what the quiet mode turns off", () => {
  it("celebrations and toasts are on only while it is off", () => {
    expect(celebrationsOn(false)).toBe(true);
    expect(celebrationsOn(true)).toBe(false);
  });

  it("a toast is not shown while it is on, and is shown again when it is turned off", () => {
    let quiet = true;
    const toasts = createToastStore(() => quiet);
    expect(toasts.push({ key: "hour:39", title: "TEST novi rekord sata" })).toBe(false);
    expect(toasts.snapshot()).toEqual([]);
    quiet = false;
    expect(toasts.push({ key: "hour:39", title: "TEST novi rekord sata" })).toBe(true);
    expect(toasts.snapshot().map((toast) => toast.key)).toEqual(["hour:39"]);
  });

  it("the progress of the missions stays: the quiet mode hides nothing that informs", () => {
    const mission = { id: "a", label: "TEST misija", tone: "hitno" as const };
    const start = advanceLedger(null, [{ ...mission, count: 3 }], "2026-10-12").ledger;
    const step = advanceLedger(start, [{ ...mission, count: 1 }], "2026-10-12");
    // The ledger and the board do not know the quiet mode at all: „2 od 3“ beside the row is the same with it on.
    expect(missionBoard([{ ...mission, count: 1 }], step.ledger).rows[0].progress).toEqual({ done: 2, total: 3 });
  });
});

describe("the toasts of the frame", () => {
  const store = () => createToastStore(() => false);

  it("the same toast is not stacked while it is on the screen", () => {
    const toasts = store();
    expect(toasts.push({ key: "hour:39", title: "TEST" })).toBe(true);
    expect(toasts.push({ key: "hour:39", title: "TEST" })).toBe(false);
    expect(toasts.snapshot()).toHaveLength(1);
  });

  it("never more than the limit: the oldest leaves", () => {
    const toasts = store();
    for (let index = 0; index <= ADMIN_TOAST_MAX; index += 1) toasts.push({ key: `k${index}`, title: `TEST ${index}` });
    expect(toasts.snapshot().map((toast) => toast.key)).toEqual(Array.from({ length: ADMIN_TOAST_MAX }, (_, index) => `k${index + 1}`));
  });

  it("dismiss removes one, clear removes all, and both tell the listeners only when something changed", () => {
    const toasts = store();
    let calls = 0;
    toasts.subscribe(() => {
      calls += 1;
    });
    toasts.push({ key: "a", title: "TEST a" });
    toasts.push({ key: "b", title: "TEST b" });
    const [first] = toasts.snapshot();
    toasts.dismiss(first.id);
    toasts.dismiss(first.id);
    expect(toasts.snapshot().map((toast) => toast.key)).toEqual(["b"]);
    toasts.clear();
    toasts.clear();
    expect(toasts.snapshot()).toEqual([]);
    expect(calls).toBe(4);
  });

  it("the empty list is one stable value (a store read by useSyncExternalStore)", () => {
    const toasts = store();
    const empty = toasts.snapshot();
    toasts.push({ key: "a", title: "TEST" });
    toasts.clear();
    expect(toasts.snapshot()).toBe(empty);
  });
});
