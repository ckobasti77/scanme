import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { FairPassportCatalogEntry, FairPublicMapStand } from "@/lib/fair-contract";
import { AUTO_MOTO_FEST_2026_MAP } from "@/lib/fair-map/auto-moto-fest-2026";
import { buildFairMapView } from "@/lib/fair-map/view";
import { FairEventMapView } from "./fair-event-map";
import { MapSkeleton } from "@/app/sajam/[eventSlug]/_mapa/map-skeleton";

function stand(name: string, location: string, heatEligible: boolean): FairPublicMapStand {
  return {
    participationId: `fixture-${name}`, exhibitorName: name, standId: `fixture-stand-${name}`, mapLocationId: location, code: "fixture", displayName: name,
    brands: [{ brandId: `fixture-brand-${name}`, brandName: name, models: [{ id: `fixture-model-${name}`, slug: `fixture-${name.toLowerCase()}`, displayName: `${name} model` }] }],
    ...{ heatEligible },
  };
}

describe("canonical AMF visitor markup", () => {
  const passport: FairPassportCatalogEntry = { passportId: "fixture-passport-audi", eventId: "fixture-event", brandId: "fixture-brand-Audi", brandName: "Audi", standMapLocationIds: ["hala-1"], models: [{ eventModelId: "fixture-model-Audi", slug: "fixture-audi", displayName: "Audi model" }] };
  const view = buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [stand("Audi", "hala-1", true), stand("Toyota", "hala-2", false)], [passport]);
  const html = renderToStaticMarkup(createElement(FairEventMapView, { eventSlug: "auto-moto-fest-2026", view, rotation: null, display: false, initialLink: { stand: "hala-1" }, passportProgress: [{ passportId: passport.passportId, stampedModelIds: ["fixture-model-Audi"], stampedCount: 1, requiredCount: 1, completed: true }] }));

  test("uses the accepted contours, no switch, periods, numbered stands or auto-open dialog", () => {
    expect(html).toContain("data-amf-topographic");
    expect(html).toContain('data-heat-eligible="true" data-exhibit="audi"');
    expect(html).toContain('data-heat-eligible="false" data-exhibit="toyota"');
    expect(html).not.toContain('role="switch"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toMatch(/Poslednji sat|Gde je gužva|DEV|Dodirni izlagača|Štand\s+\d|m²/);
    expect(html).toContain("Vozila");
    expect(html).toContain("Narandžasto: ScanMe usluga. Sivo: bez merenja.");
  });
  test("a completion belongs to Audi, not Volkswagen sharing the same location", () => {
    expect(html).toContain('aria-label="Audi. Pasoš je kompletiran"');
    expect(html).toContain('aria-label="Volkswagen. Bez ScanMe merenja"');
    expect(html).not.toContain('aria-label="Volkswagen. Pasoš je kompletiran"');
  });
  test("AMF loading keeps the portrait topographic frame", () => {
    const skeleton = renderToStaticMarkup(createElement(MapSkeleton, { autoMoto: true }));
    expect(skeleton).toContain('viewBox="0 0 1000 1380"');
    expect(skeleton).toContain('aria-busy="true"');
    expect(skeleton).not.toContain("1375 1080");
  });
});
