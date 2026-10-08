import { describe, expect, test } from "vitest";
import { fairMapLocationSummary } from "@/lib/fair-map";
import { buildFairMapPreview } from "@/lib/fair-map/preview-fixture";
import { fairMapSummaryText } from "./fair-map-text";

// D1 (RN nisko): "3 m²" never breaks between the number and m² on a 360 px
// phone, and a box of a split stand (13-2) says its m² belong to the group.

const preview = buildFairMapPreview();
const header = (locationId: string) => fairMapSummaryText(fairMapLocationSummary(preview.view, locationId)!);

describe("fairMapSummaryText", () => {
  test("a stand with its own area: number and m² joined by a no-break space", () => {
    expect(header("ispred-14")).toBe("Štand 14 · Ispred hale · 3 m²");
    expect(header("hala-2")).toBe("Štand 2 · Hala · 490 m²");
    expect(header("hala-12")).not.toMatch(/\d m²/);
  });

  test("a box of a split stand shows the group's area as a total", () => {
    expect(header("ispred-13-2")).toBe("Štand 13 · Ispred hale · 12 m² ukupno");
    expect(header("ispred-15-1")).toBe("Štand 15 · Ispred hale · 12 m² ukupno");
  });

  test("a place without an organizer area has no m² at all", () => {
    expect(header("zadnji-deo")).not.toContain("m²");
  });
});
