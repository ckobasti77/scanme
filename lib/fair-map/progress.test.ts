import { describe, expect, test } from "vitest";
import type { FairPassportCatalogEntry, FairPassportProgress, FairPublicMapStand } from "../fair-contract";
import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { fairMapProgressByLocation } from "./progress";
import { buildFairMapView } from "./view";

const stand = (id: string, location: string, brandId: string): FairPublicMapStand => ({
  participationId: `TEST-participation-${id}`,
  exhibitorName: `TEST izlagač ${id}`,
  standId: `TEST-stand-${id}`,
  mapLocationId: location,
  code: `TEST-${id}`,
  displayName: `TEST lokacija ${id}`,
  brands: [
    {
      brandId,
      brandName: `TEST brend ${id}`,
      models: [0, 1].map((index) => ({ id: `${brandId}-model-${index}`, slug: `test-${id}-${index}`, displayName: `TEST model ${index}` })),
    },
  ],
});

const passport = (id: string, brandId: string, location: string): FairPassportCatalogEntry => ({
  passportId: id,
  eventId: "TEST-event",
  brandId,
  brandName: `TEST ${brandId}`,
  standMapLocationIds: [location],
  models: [0, 1].map((index) => ({ eventModelId: `${brandId}-model-${index}`, slug: `test-${brandId}-${index}`, displayName: `TEST model ${index}` })),
});

const passports = [passport("passport-new", "brand-new", "hala-1"), passport("passport-started", "brand-started", "hala-2"), passport("passport-done", "brand-done", "hala-3")];
const view = buildFairMapView(
  AUTO_MOTO_FEST_2026_MAP,
  [stand("new", "hala-1", "brand-new"), stand("started", "hala-2", "brand-started"), stand("done", "hala-3", "brand-done")],
  passports,
);
const progress: FairPassportProgress[] = [
  { passportId: "passport-started", stampedModelIds: ["brand-started-model-0"], stampedCount: 1, requiredCount: 2, completed: false },
  { passportId: "passport-done", stampedModelIds: ["brand-done-model-0", "brand-done-model-1"], stampedCount: 2, requiredCount: 2, completed: true },
];

describe("fairMapProgressByLocation", () => {
  test("distinguishes a new, started and completed passport location", () => {
    expect(Object.fromEntries(fairMapProgressByLocation(view, progress))).toEqual({
      "hala-1": { state: "available", stamped: 0, required: 2 },
      "hala-2": { state: "started", stamped: 1, required: 2 },
      "hala-3": { state: "complete", stamped: 2, required: 2 },
    });
  });

  test("keeps passport locations neutral while the visitor state loads", () => {
    expect([...fairMapProgressByLocation(view, null).values()]).toEqual([
      { state: "loading", stamped: 0, required: 2 },
      { state: "loading", stamped: 0, required: 2 },
      { state: "loading", stamped: 0, required: 2 },
    ]);
  });

  test("counts each passport once on a shared location and leaves non-passport stands unmarked", () => {
    const shared = buildFairMapView(
      AUTO_MOTO_FEST_2026_MAP,
      [stand("a", "hala-1", "brand-new"), stand("b", "hala-1", "brand-started"), stand("c", "hala-1", "brand-new"), stand("plain", "hala-5", "plain")],
      passports,
    );
    expect(Object.fromEntries(fairMapProgressByLocation(shared, progress))).toEqual({
      "hala-1": { state: "started", stamped: 1, required: 4 },
    });
  });
});
