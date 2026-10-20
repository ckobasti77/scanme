import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import type { FairPassportCatalogEntry, FairPublicMapStand } from "@/lib/fair-contract";
import { AUTO_MOTO_FEST_2026_MAP } from "@/lib/fair-map/auto-moto-fest-2026";
import { buildFairMapView } from "@/lib/fair-map/view";
import { FairEventMapView } from "./fair-event-map";
import { MapSkeleton } from "@/app/sajam/[eventSlug]/_mapa/map-skeleton";
import { AmfTopographicMap } from "./amf-topographic-map";

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

  test("uses contours and the short legend, without model browsing or technical notes", () => {
    expect(html).toContain("data-amf-topographic");
    expect(html).toContain('data-heat-eligible="true" data-exhibit="audi"');
    expect(html).toContain('data-heat-eligible="false" data-exhibit="toyota"');
    expect(html).not.toContain('role="switch"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('data-amf-popup');
    expect(html).not.toMatch(/Poslednji sat|Gde je gužva|DEV|Dodirni izlagača|Štand\s+\d|m²/);
    expect(html).not.toMatch(/Vozila|Veće interesovanje|ScanMe usluga|bez merenja|Bez ScanMe/);
    expect(html).not.toContain('/model/');
    expect(html).toContain("Gužva");
    expect(html).toContain("Pečati");
    expect(html).toContain("1/1");
    expect(html).toContain('href="https://www.brosauto.rs/"');
  });
  test("the demo uses the same real exhibitors and website pop-up, not anonymous demo logos", () => {
    const demo = renderToStaticMarkup(createElement(AmfTopographicMap, { demo: true, eventSlug: "demo-auto-moto-fest-2026", view, rotation: null, display: false, initialLink: { stand: "hala-1" }, passportProgress: [] }));
    expect(demo).toContain('aria-label="Audi"');
    expect(demo).toContain('aria-label="Toyota"');
    expect(demo).not.toContain('/fair/demo/logo.svg');
    expect(demo).toContain('href="https://www.brosauto.rs/"');
    expect(demo).toContain('Demo simulacija toplotne mape');
    expect(demo).not.toContain('Pauziraj animaciju');
    expect(demo).not.toContain('zagrevaju i hlade u krug');
  });
  test("a completion belongs to Audi, not Volkswagen sharing the same location", () => {
    expect(html).toContain('aria-label="Audi. Pasoš je kompletiran"');
    expect(html).toContain('aria-label="Volkswagen"');
    expect(html).not.toContain('aria-label="Volkswagen. Pasoš je kompletiran"');
  });
  test("AUTO 1 is shortened; Geely and the large Vespa wordmark have no repeated label", () => {
    expect(html).toContain('aria-label="AUTO 1"');
    expect(html).not.toContain('>AUTO1.com<');
    const geely = html.match(/data-brand="geely"[^]*?<\/g>/)?.[0] ?? "";
    expect(geely).toContain("geely.svg");
    expect(geely.match(/>Geely</g)).toHaveLength(1); // Accessible SVG title only.
    const vespa = html.match(/data-brand="vespa"[^]*?<\/g>/)?.[0] ?? "";
    expect(vespa).toContain('viewBox="-0.1 7.7 24.2 8.6"');
    expect(vespa.match(/>Vespa</g)).toHaveLength(1);
    expect(vespa).not.toMatch(/<span[^>]*>Vespa<\/span>/);
  });
  test("an unpaid exhibitor still gets its website, never model links", () => {
    const unpaidView = buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [stand("Toyota", "hala-2", false)], []);
    const unpaid = renderToStaticMarkup(createElement(FairEventMapView, { eventSlug: "auto-moto-fest-2026", view: unpaidView, rotation: null, display: false, initialLink: { stand: "hala-2" }, passportProgress: [] }));
    expect(unpaid).toContain('href="https://www.toyota.rs/retailers/raavex-group-doo"');
    expect(unpaid).toContain('target="_blank" rel="noopener noreferrer"');
    expect(unpaid).not.toContain('/model/');
  });
  test.each(["honda-moto", "piaggio", "tvs", "motogrini", "aprilia"])("%s uses an actual logo without a duplicate text label", (key) => {
    const brand = html.match(new RegExp(`data-brand="${key}"[^]*?<\\/g>`))?.[0] ?? "";
    expect(brand).toMatch(/<img[^>]+src=/);
    expect(brand).not.toContain("<span");
  });
  test.each([
    ["audi", "-0.2 7.6 24.4 8.8"], ["dacia", "-0.2 8.4 24.4 7.2"],
    ["ford", "-0.2 7.3 24.4 9.4"], ["opel", "-0.2 4.3 24.4 15.4"],
  ])("%s uses a tight wide emblem instead of a padded square", (key, viewBox) => {
    const brand = html.match(new RegExp(`data-brand="${key}"[^]*?<\\/g>`))?.[0] ?? "";
    expect(brand).toContain(`viewBox="${viewBox}"`);
    expect(brand).toContain("wideHallLogo");
  });
  test("AMF loading keeps the portrait topographic frame", () => {
    const skeleton = renderToStaticMarkup(createElement(MapSkeleton, { autoMoto: true }));
    expect(skeleton).toContain('viewBox="0 0 1000 1450"');
    expect(skeleton).toContain('aria-busy="true"');
    expect(skeleton).not.toContain("1375 1080");
  });
  test("entrance wordmarks have no duplicate captions and Makete is text only", () => {
    const entrance = renderToStaticMarkup(createElement(FairEventMapView, { eventSlug: "auto-moto-fest-2026", view, rotation: null, display: false, initialLink: { zona: "ispred" }, passportProgress: [] }));
    for (const key of ["servoremont", "zepter", "goes", "benni", "xtreme", "nm", "auto-happy-foyer", "auto-happy-outdoor", "swm", "kia"]) {
      const brand = entrance.match(new RegExp(`data-brand="${key}"[^]*?<\\/g>`))?.[0] ?? "";
      expect(brand, key).toMatch(/<img|<image/);
      expect(brand, key).not.toContain("<span");
    }
    const makete = entrance.match(/data-brand="makete"[^]*?<\/g>/)?.[0] ?? "";
    expect(makete).not.toMatch(/<img|<image/);
    expect(makete.match(/>Makete<\/span>/g)).toHaveLength(1);
  });
});
