import { describe, expect, test } from "vitest";
import type { FairPublicModel } from "@/lib/fair-contract";
import { FAIR_GARAGE_MAX_MODELS } from "@/lib/fair-contract";
import { createEmptyFairGarageDocument, type FairGarageDocument } from "./garage-store";
import { fairGarageEventCount, fairGarageItemsForEvent, fairGarageRestore, type FairGarageEventView } from "./garage-view";

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

describe("garage email restore (?vrati=)", () => {
  const event = { publicSlug: "auto-moto-fest-2026", dataSlug: "auto-moto-fest-2026", event: null, fallbackId: "auto-moto-fest-2026", fallbackTitle: "AMF", fallbackDates: "", passportCatalog: [], sponsoredRotation: null } satisfies FairGarageEventView;
  const live = (id: string, eventSlug = "auto-moto-fest-2026") =>
    ({ id, eventId: "amf-event-id", eventSlug, slug: id, brandName: "Ford", displayName: `Ford ${id}`, priceText: "od 27.490 €" }) as FairPublicModel;

  test("adds only the missing models, in order, without duplicates", () => {
    const start: FairGarageDocument = { version: 2, events: { "amf-event-id": [item("kuga", "auto-moto-fest-2026", 5)] }, passportBadges: [] };
    const first = fairGarageRestore(start, event, [live("kodiaq"), live("kuga"), live("grenadier"), live("ev3", "elektromobilnost-2026")], 100);
    expect(first.added).toBe(2);
    expect(fairGarageItemsForEvent(first.document, event).map((entry) => entry.modelId).sort()).toEqual(["grenadier", "kodiaq", "kuga"]);
    const again = fairGarageRestore(first.document, event, [live("kodiaq"), live("kuga"), live("grenadier")], 200);
    expect(again.added).toBe(0);
    expect(again.document).toBe(first.document);
  });

  test("fills an empty garage and respects the garage maximum", () => {
    const empty = fairGarageRestore(createEmptyFairGarageDocument(), event, [live("a"), live("b"), live("c")], 100);
    expect(empty.added).toBe(3);
    const full: FairGarageDocument = { version: 2, events: { "amf-event-id": Array.from({ length: FAIR_GARAGE_MAX_MODELS - 1 }, (_, index) => item(`m${index}`, "auto-moto-fest-2026")) }, passportBadges: [] };
    const capped = fairGarageRestore(full, event, [live("x"), live("y")], 100);
    expect(capped.added).toBe(1);
    expect(fairGarageItemsForEvent(capped.document, event)).toHaveLength(FAIR_GARAGE_MAX_MODELS);
  });
});
