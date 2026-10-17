import { describe, expect, it } from "vitest";
import {
  forgetPassportModelsSeen,
  markPassportModelsSeen,
  markPassportSealShown,
  passportSealShown,
  passportStuckAt,
  unreadPassportModelIds,
} from "./passport-visit-store";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("passport visit store", () => {
  it("keeps unseen stamps scoped to event and passport", () => {
    const storage = memoryStorage();
    expect(unreadPassportModelIds(storage, "event-a", "passport-a", ["m1", "m2"])).toEqual(["m1", "m2"]);
    expect(markPassportModelsSeen(storage, "event-a", "passport-a", ["m1"])).toBe(true);
    expect(unreadPassportModelIds(storage, "event-a", "passport-a", ["m1", "m2"])).toEqual(["m2"]);
    expect(unreadPassportModelIds(storage, "event-b", "passport-a", ["m1"])).toEqual(["m1"]);
  });

  it("does not duplicate model ids", () => {
    const storage = memoryStorage();
    markPassportModelsSeen(storage, "event-a", "passport-a", ["m1", "m1"]);
    markPassportModelsSeen(storage, "event-a", "passport-a", ["m1", "m2"]);
    expect(unreadPassportModelIds(storage, "event-a", "passport-a", ["m1", "m2", "m3"])).toEqual(["m3"]);
  });

  it("can forget a DEV stamp so re-adding it animates again", () => {
    const storage = memoryStorage();
    markPassportModelsSeen(storage, "event-a", "passport-a", ["m1", "m2"]);
    expect(forgetPassportModelsSeen(storage, "event-a", "passport-a", ["m1"])).toBe(true);
    expect(unreadPassportModelIds(storage, "event-a", "passport-a", ["m1", "m2"])).toEqual(["m1"]);
  });

  it("keeps the first sticking moment of a stamp and forgets it with the stamp", () => {
    const storage = memoryStorage();
    markPassportModelsSeen(storage, "event-a", "passport-a", ["m1"], 1000);
    markPassportModelsSeen(storage, "event-a", "passport-a", ["m1", "m2"], 2000);
    markPassportModelsSeen(storage, "event-a", "passport-a", ["m3"]);
    expect(passportStuckAt(storage, "event-a", "passport-a")).toEqual({ m1: 1000, m2: 2000 });
    expect(unreadPassportModelIds(storage, "event-a", "passport-a", ["m1", "m2", "m3"])).toEqual([]);
    forgetPassportModelsSeen(storage, "event-a", "passport-a", ["m1"]);
    expect(passportStuckAt(storage, "event-a", "passport-a")).toEqual({ m2: 2000 });
    expect(passportStuckAt(storage, "event-b", "passport-a")).toEqual({});
  });

  it("reads a document written before stuckAt existed", () => {
    const storage = memoryStorage();
    storage.setItem("scanme:fair-passport-visits:v1", JSON.stringify({ version: 1, seen: { "event-a:passport-a": ["m1"] } }));
    expect(unreadPassportModelIds(storage, "event-a", "passport-a", ["m1", "m2"])).toEqual(["m2"]);
    expect(passportStuckAt(storage, "event-a", "passport-a")).toEqual({});
  });

  it("remembers the overview seal per passport and keeps the stamps", () => {
    const storage = memoryStorage();
    markPassportModelsSeen(storage, "event-a", "passport-a", ["m1"], 1000);
    expect(passportSealShown(storage, "event-a", "passport-a")).toBe(false);
    expect(markPassportSealShown(storage, "event-a", "passport-a")).toBe(true);
    markPassportSealShown(storage, "event-a", "passport-a");
    expect(passportSealShown(storage, "event-a", "passport-a")).toBe(true);
    expect(passportSealShown(storage, "event-a", "passport-b")).toBe(false);
    expect(passportSealShown(storage, "event-b", "passport-a")).toBe(false);
    expect(passportStuckAt(storage, "event-a", "passport-a")).toEqual({ m1: 1000 });
  });

  it("lets the seal land again after a stamp is un-stuck", () => {
    const storage = memoryStorage();
    markPassportModelsSeen(storage, "event-a", "passport-a", ["m1"]);
    markPassportSealShown(storage, "event-a", "passport-a");
    forgetPassportModelsSeen(storage, "event-a", "passport-a", ["m1"]);
    expect(passportSealShown(storage, "event-a", "passport-a")).toBe(false);
  });
});
