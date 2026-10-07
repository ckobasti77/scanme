import { describe, expect, test } from "vitest";
import type { FairGarageDocument } from "./garage-store";
import { fairGarageEventCount } from "./garage-view";

function item(modelId: string, eventSlug: string, savedAt = 1) {
  return {
    modelId,
    savedAt,
    lastKnown: { eventSlug, modelSlug: modelId, brandName: "JMEV", displayName: "eLight", priceText: "Cena na upit" },
  };
}

describe("fair garage header count", () => {
  test("counts every model the garage list shows for the event, whatever key it was saved under", () => {
    // Saved under the public slug key (fallback id) and under a different
    // event record (TEST event before the real import), never under the
    // current Convex event id the header badge receives.
    const document: FairGarageDocument = {
      version: 2,
      events: {
        "elektromobilnost-2026": [
          item("ev3", "elektromobilnost-2026", 3),
          item("elight", "elektromobilnost-2026", 2),
          item("ewind", "elektromobilnost-2026", 1),
        ],
        "old-test-event-id": [item("dolphin", "test-elektromobilnost-2026")],
        "amf-event-id": [item("rs3", "auto-moto-fest-2026")],
      },
      passportBadges: [],
    };

    expect(fairGarageEventCount(document, { eventId: "convex-event-id", eventSlug: "elektromobilnost-2026" })).toBe(4);
    expect(fairGarageEventCount(document, { eventId: "amf-event-id", eventSlug: "auto-moto-fest-2026" })).toBe(1);
    expect(fairGarageEventCount(document, { eventId: "convex-event-id", eventSlug: "test-elektromobilnost-2026" })).toBe(4);
  });

  test("does not count the same model twice when it exists under two keys", () => {
    const document: FairGarageDocument = {
      version: 2,
      events: {
        "convex-event-id": [item("ev3", "elektromobilnost-2026")],
        "elektromobilnost-2026": [item("ev3", "elektromobilnost-2026")],
      },
      passportBadges: [],
    };
    expect(fairGarageEventCount(document, { eventId: "convex-event-id", eventSlug: "elektromobilnost-2026" })).toBe(1);
  });
});
