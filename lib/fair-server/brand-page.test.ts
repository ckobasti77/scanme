// Sajam 2026 — the two gates of the brand-page projection
// (projectFairBrandPage, lib/fair-server/brand-page.ts): a model that never
// entered a paid package (capabilities.ratingMode "none" is the `included`
// tier, lib/fair-entitlements.ts:31) and a model of another brand (the
// passport payload also carries cross-brand favorites, see modelsById in
// lib/fair-server/passport-page.ts) never reach the page, and a brand without
// a single packaged model returns null — the same "nije pronađen" view as a
// brand that does not exist (card rule, brand-page.ts:79-81).
// Fixtures carry only the fields the projection actually reads; the unknown
// hop casts like the `as unknown as` hops in interactions.test.ts.

import { describe, expect, test } from "vitest";
import type { FairPassportCatalogEntry, FairPublicModel, FairRatingMode } from "../fair-contract";
import { fairBrandPageHref, projectFairBrandPage } from "./brand-page";

// Only the fields brand-page.ts:72-94 touches: the gate reads `capabilities`
// and `brandId`, the row projects `id`/`slug`/`displayName`/`priceText` and
// `rows[0].exhibitorName`. Optional fields stay absent — the projection's
// spread logic is not what these tests cover.
const model = (id: string, brandId: string, ratingMode: FairRatingMode) =>
  ({
    id,
    brandId,
    exhibitorName: "Auto Salon Avis",
    slug: `model-${id}`,
    displayName: `Model ${id}`,
    priceText: "24.990 €",
    capabilities: { ratingMode },
  }) as unknown as FairPublicModel;

// brandSlug must be what fairPassportBrandSlug(brandName) makes
// (lib/fair-passport.ts), so the fixture uses the plain case: "Volkswagen"
// -> "volkswagen". Only brand identity and the model references are set.
const entry = (brandId: string, brandName: string, modelIds: string[]) =>
  ({
    brandId,
    brandName,
    models: modelIds.map((eventModelId) => ({ eventModelId })),
  }) as unknown as FairPassportCatalogEntry;

const input = (catalog: FairPassportCatalogEntry[], models: FairPublicModel[]) => ({
  eventId: "event-1",
  eventName: "Sajam automobila 2026",
  eventSlug: "sajam-automobila-2026",
  eventCode: "sajam-automobila-2026",
  catalog,
  models,
  brandSlug: "volkswagen",
});

describe("projectFairBrandPage", () => {
  test("a model outside the package (ratingMode none) is dropped", () => {
    const data = projectFairBrandPage(
      input(
        [entry("brand-vw", "Volkswagen", ["m-1", "m-2"])],
        [model("m-1", "brand-vw", "overall"), model("m-2", "brand-vw", "none")],
      ),
    );
    // The free-ride entry is referenced by the passport and listed on the
    // map, yet it never joins the list — and it is not "no models": the
    // packaged sibling keeps the page alive.
    expect(data?.models.map((row) => row.id)).toEqual(["m-1"]);
  });

  test("a model of another brand is dropped even when packaged", () => {
    // Cross-brand favorite shape: the passport list names m-2, but its row
    // belongs to brand-seat — brand-page.ts:77 re-checks brandId for exactly
    // this payload.
    const data = projectFairBrandPage(
      input(
        [entry("brand-vw", "Volkswagen", ["m-1", "m-2"])],
        [model("m-1", "brand-vw", "dimensions"), model("m-2", "brand-seat", "overall")],
      ),
    );
    expect(data?.models.map((row) => row.id)).toEqual(["m-1"]);
  });

  test("a brand with no packaged model returns null, like a brand that does not exist", () => {
    // Gate one: the entry exists and lists models, every one of them
    // unbought — null, not an empty page (card rule).
    expect(
      projectFairBrandPage(
        input([entry("brand-vw", "Volkswagen", ["m-1", "m-2"])], [model("m-1", "brand-vw", "none"), model("m-2", "brand-vw", "none")]),
      ),
    ).toBeNull();
    // Gate two: the brand slug is not in the catalog at all — same null,
    // same view. m-3 is packaged and real, but belongs to another brand's
    // passport entry, so the volkswagen slug still finds nothing.
    expect(
      projectFairBrandPage(
        input([entry("brand-seat", "Seat", ["m-3"])], [model("m-3", "brand-seat", "overall")]),
      ),
    ).toBeNull();
  });
});

describe("standLabel (hero eyebrow \"Brend · Štand <stand>\")", () => {
  const onMap = (standMapLocationId: string) =>
    ({ ...model("m-1", "brand-vw", "overall"), standMapLocationId }) as FairPublicModel;
  const project = (standMapLocationId: string) =>
    projectFairBrandPage({
      ...input([entry("brand-vw", "Volkswagen", ["m-1"])], [onMap(standMapLocationId)]),
      eventCode: "auto-moto-fest-2026",
    });

  test("a numbered stand on the event map gives its label", () => {
    expect(project("hala-10")?.standLabel).toBe("10");
  });

  test("a location that is not a stand box, or not on the map, gives none", () => {
    expect(project("ne-postoji")).not.toHaveProperty("standLabel");
  });
});

describe("fairBrandPageHref (brand link on the model page and passport)", () => {
  const href = (catalog: FairPassportCatalogEntry[], models: FairPublicModel[], brandName = "Volkswagen") =>
    fairBrandPageHref({ catalog, models, eventSlug: "sajam-automobila-2026", brandName });

  test("a brand with a packaged model links to its brand page", () => {
    expect(href([entry("brand-vw", "Volkswagen", ["m-1"])], [model("m-1", "brand-vw", "overall")])).toBe(
      "/sajam/sajam-automobila-2026/brend/volkswagen",
    );
  });

  test("a brand with only free-tier models, or missing from the catalog, has no link", () => {
    expect(href([entry("brand-vw", "Volkswagen", ["m-1"])], [model("m-1", "brand-vw", "none")])).toBeNull();
    expect(href([entry("brand-seat", "Seat", ["m-3"])], [model("m-3", "brand-seat", "overall")])).toBeNull();
  });
});
