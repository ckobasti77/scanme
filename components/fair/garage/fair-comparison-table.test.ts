import { describe, expect, test } from "vitest";
import type { FairPublicModel } from "@/lib/fair-contract";
import { fairLiveModelView } from "@/lib/fair-client/garage-view";
import { fairComparisonRows } from "./fair-comparison-table";

function live(id: string, groups: FairPublicModel["specificationGroups"]): FairPublicModel {
  return {
    id,
    eventId: "event",
    eventSlug: "auto-moto-fest-2026",
    eventTitle: "Auto Moto Fest 2026",
    participationId: "participation",
    exhibitorName: "Izlagač",
    brandId: "brand",
    brandName: "Škoda",
    standId: "stand",
    standMapLocationId: "s1",
    slug: id,
    displayName: id,
    priceText: "od 30.000 €",
    specificationGroups: groups,
    capabilities: {} as FairPublicModel["capabilities"],
  };
}

function group(label: string, items: Array<[string, string]>): FairPublicModel["specificationGroups"][number] {
  return {
    id: label,
    label,
    order: 0,
    items: items.map(([itemLabel, value], order) => ({ id: itemLabel, label: itemLabel, value, order, isHighlight: false })),
  };
}

describe("fairComparisonRows", () => {
  test("keeps first-seen order and fills a missing or empty row with the given text", () => {
    const left = fairLiveModelView(
      live("kodiaq", [group("Motor", [["Snaga", "150 KS"], ["Gorivo", " "]])]),
      "auto-moto-fest-2026",
    );
    const right = fairLiveModelView(
      live("karoq", [group("Motor", [["Snaga", "116 KS"], ["Menjač", "DSG"]])]),
      "auto-moto-fest-2026",
    );
    expect(fairComparisonRows([left, right], "—").map((row) => [row.label, ...row.values])).toEqual([
      ["Snaga", "150 KS", "116 KS"],
      ["Gorivo", "—", "—"],
      ["Menjač", "—", "DSG"],
    ]);
  });

  test("returns no rows unless both models carry live data", () => {
    const view = fairLiveModelView(live("kodiaq", []), "auto-moto-fest-2026");
    expect(fairComparisonRows([view, { ...view, id: "x", live: undefined }], "—")).toEqual([]);
  });
});
