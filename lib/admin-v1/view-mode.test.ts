import { describe, expect, test } from "vitest";
import {
  createViewModeStore,
  nextRadioIndex,
  parseViewModeParam,
  readViewMode,
  resolveViewMode,
  viewModeStorageKey,
  writeViewMode,
} from "./view-mode";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const throwing = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("admin view mode (A1)", () => {
  test("the choice is saved per list key", () => {
    const storage = memoryStorage();
    expect(writeViewMode(storage, "klijenti.lista", "kartice")).toBe(true);
    expect(storage.data.get("scanme-admin-view:klijenti.lista")).toBe("kartice");
    expect(viewModeStorageKey("zadaci.lista")).toBe("scanme-admin-view:zadaci.lista");
    expect(readViewMode(storage, "klijenti.lista")).toBe("kartice");
    expect(readViewMode(storage, "zadaci.lista")).toBeNull();
  });

  test("unknown stored values and a missing storage read as no choice", () => {
    const storage = memoryStorage();
    storage.data.set("scanme-admin-view:x", "grid");
    expect(readViewMode(storage, "x")).toBeNull();
    expect(readViewMode(null, "x")).toBeNull();
    expect(writeViewMode(undefined, "x", "tabela")).toBe(false);
  });

  test("a throwing localStorage never throws and the switch still works for the session", () => {
    expect(readViewMode(throwing, "x")).toBeNull();
    expect(writeViewMode(throwing, "x", "kartice")).toBe(false);
    const store = createViewModeStore(() => throwing);
    expect(store.read("x")).toBeNull();
    expect(store.write("x", "kartice")).toBe(false);
    expect(store.read("x")).toBe("kartice");
    expect(store.read("y")).toBeNull();
  });

  test("the switch remembers the latest choice", () => {
    const storage = memoryStorage();
    const store = createViewModeStore(() => storage);
    expect(store.read("finansije.uplate")).toBeNull();
    store.write("finansije.uplate", "kartice");
    store.write("finansije.uplate", "tabela");
    expect(store.read("finansije.uplate")).toBe("tabela");
    // A fresh page (new store) reads the saved value back.
    expect(createViewModeStore(() => storage).read("finansije.uplate")).toBe("tabela");
  });

  test("explicit (URL/preview) value wins over the saved one; nothing = auto", () => {
    expect(resolveViewMode("kartice", "tabela")).toBe("kartice");
    expect(resolveViewMode(null, "tabela")).toBe("tabela");
    expect(resolveViewMode(undefined, null)).toBe("auto");
  });

  test("the ?prikaz= parameter accepts only the two views", () => {
    expect(parseViewModeParam("kartice")).toBe("kartice");
    expect(parseViewModeParam(["tabela", "kartice"])).toBe("tabela");
    expect(parseViewModeParam("grid")).toBeNull();
    expect(parseViewModeParam(undefined)).toBeNull();
  });

  test("radiogroup keyboard: arrows wrap, Home/End jump, other keys are ignored", () => {
    expect(nextRadioIndex(0, "ArrowRight", 2)).toBe(1);
    expect(nextRadioIndex(1, "ArrowRight", 2)).toBe(0);
    expect(nextRadioIndex(0, "ArrowLeft", 2)).toBe(1);
    expect(nextRadioIndex(0, "ArrowDown", 2)).toBe(1);
    expect(nextRadioIndex(1, "ArrowUp", 2)).toBe(0);
    expect(nextRadioIndex(1, "Home", 2)).toBe(0);
    expect(nextRadioIndex(0, "End", 2)).toBe(1);
    expect(nextRadioIndex(0, "Enter", 2)).toBeNull();
    expect(nextRadioIndex(0, "ArrowRight", 0)).toBeNull();
  });
});
