import { describe, expect, it } from "vitest";
import type { FairPassportState } from "@/lib/fair-contract";
import {
  applyDevPassportStamps,
  devPassportProgressWithStamp,
  readDevPassportStampIds,
  writeDevPassportStampIds,
} from "./passport-dev-store";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

const state = {
  eventId: "event-1",
  catalog: [{
    passportId: "passport-1",
    eventId: "event-1",
    brandId: "brand-1",
    brandName: "TEST JMEV",
    standMapLocationIds: ["hala-12"],
    models: [
      { eventModelId: "model-1", slug: "ev3", displayName: "EV3" },
      { eventModelId: "model-2", slug: "elight", displayName: "ELIGHT" },
    ],
  }],
  progress: [],
} satisfies FairPassportState;

describe("passport DEV stamp store", () => {
  it("overrides progress locally and ignores model ids outside the passport", () => {
    const storage = memoryStorage();
    expect(writeDevPassportStampIds(storage, "event-1", "passport-1", ["model-1", "unknown"])).toBe(true);
    expect(readDevPassportStampIds(storage, "event-1", "passport-1")).toEqual(["model-1", "unknown"]);
    expect(applyDevPassportStamps(storage, state).progress[0]).toMatchObject({
      stampedModelIds: ["model-1"],
      stampedCount: 1,
      requiredCount: 2,
      completed: false,
    });
  });

  it("supports removing and re-adding a stamp without duplicates", () => {
    const base = applyDevPassportStamps(memoryStorage(), state).progress[0];
    const added = devPassportProgressWithStamp(base, "model-1", true);
    const duplicate = devPassportProgressWithStamp(added, "model-1", true);
    const removed = devPassportProgressWithStamp(duplicate, "model-1", false);
    expect(duplicate.stampedModelIds).toEqual(["model-1"]);
    expect(removed.stampedModelIds).toEqual([]);
  });
});
