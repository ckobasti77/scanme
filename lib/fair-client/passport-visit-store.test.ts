import { describe, expect, it } from "vitest";
import { forgetPassportModelsSeen, markPassportModelsSeen, unreadPassportModelIds } from "./passport-visit-store";

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
});
