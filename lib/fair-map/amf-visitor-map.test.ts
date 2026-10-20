import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { fairMapReadDeepLink, fairMapSearch } from "./explore";
import { buildAutoMotoFestMapPreview, AUTO_MOTO_FEST_MAP_PREVIEW_SLUG } from "./preview-fixture";
import { fairMapBounds } from "./shape";
import { fairMapFit, fairMapFocus, fairMapLimits } from "./viewport";

vi.mock("convex/react", () => ({ useQuery: () => undefined }));
const { FairEventMapView } = await import("../../components/fair/map/fair-event-map");
const preview = buildAutoMotoFestMapPreview();
const content = AUTO_MOTO_FEST_2026_MAP.zones[0].image;

describe("AMF visitor map", () => {
  test.each([360, 375, 390, 430])("fits the entire hall at a %d px phone width", (width) => {
    const size = { width: width - 26, height: (width - 26) * content.height / content.width };
    const fit = fairMapFit(size, content, fairMapLimits(size, content, 12));
    expect(fit.x).toBeGreaterThanOrEqual(12 - 1e-6);
    expect(fit.y).toBeGreaterThanOrEqual(12 - 1e-6);
    expect(fit.x + content.width * fit.scale).toBeLessThanOrEqual(size.width - 12 + 1e-6);
    expect(fit.y + content.height * fit.scale).toBeLessThanOrEqual(size.height - 12 + 1e-6);
  });

  test("the exhibitor result and model deep link focus the same place above the phone sheet", () => {
    const result = fairMapSearch(preview.view, "sve", "Toyota")[0];
    const deepLink = fairMapReadDeepLink({ stand: result.place!.location.id, zona: "ispred" }, preview.view);
    expect(deepLink).toEqual({ zoneId: "hala", locationId: "hala-1" });
    const bounds = fairMapBounds(result.place!.location.polygon);
    const size = { width: 349, height: 274 };
    const focused = fairMapFocus(bounds, size, content, fairMapLimits(size, content, 12), 0.36);
    expect((bounds.minX + bounds.maxX) / 2 * focused.scale + focused.x).toBeCloseTo(size.width / 2);
    const centerY = (bounds.minY + bounds.maxY) / 2 * focused.scale + focused.y;
    // The camera can clamp at the hall's edge, but the exhibitor stays above the sheet.
    expect(centerY).toBeGreaterThan(0);
    expect(centerY).toBeLessThan(size.height * 0.45);
  });

  test("visitor markup uses brands, progress and one-tap directory without stand-number labels", () => {
    const html = renderToStaticMarkup(createElement(FairEventMapView, {
      eventSlug: AUTO_MOTO_FEST_MAP_PREVIEW_SLUG,
      view: preview.view,
      rotation: preview.rotation,
      display: false,
      initialLink: { stand: "hala-1" },
      passportProgress: preview.passportProgress,
    }));
    expect(html).toContain('aria-label="Prikaži spisak izlagača"');
    expect(html).toContain('data-progress="available"');
    expect(html).toContain('data-progress="started"');
    expect(html).toContain('data-progress="complete"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Hala: TEST Toyota. Pasoš je kompletiran"');
    expect(html).toContain(`href="/sajam/${AUTO_MOTO_FEST_MAP_PREVIEW_SLUG}/model/test-toyota-model-1"`);
    expect(html).not.toMatch(/Štand\s+(?:1|2|3|5|6)/i);
    expect(html).not.toContain('aria-hidden="true">6-7');
    expect(html).toContain('role="switch" aria-checked="false"');
  });
});
