import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { fairMapSr as dict } from "../i18n/sr/fair-map";
import { fairMapLocationSummary } from "./explore";
import { buildFairMapPreview, FAIR_MAP_PREVIEW_SLUG } from "./preview-fixture";

// N4 — server markup of the key map v2 states over the real exhibitor list
// (preview fixture): the sheet/panel of a shared stand, an exhibitor without a
// published car, the ScanMe stand, a deep link and the fair display. The live
// rotation hook is not used here (FairEventMapView takes the rotation), and
// convex/react is mocked so any query or write attempt would show up.

const convex = vi.hoisted(() => ({ calls: 0 }));
vi.mock("convex/react", () => ({
  useQuery: () => {
    convex.calls += 1;
    return undefined;
  },
}));

const { FairEventMapView } = await import("../../components/fair/map/fair-event-map");
const { FairMapStandDetail } = await import("../../components/fair/map/fair-map-detail");

const preview = buildFairMapPreview();
const passportInfo = () => ({ label: "1/2", aria: "TEST pasoš" });

function detail(locationId: string) {
  const summary = fairMapLocationSummary(preview.view, locationId)!;
  return renderToStaticMarkup(createElement(FairMapStandDetail, { summary, eventSlug: FAIR_MAP_PREVIEW_SLUG, passportInfo, headingId: "t" }));
}

function page(props: { stand?: string; zona?: string; display?: boolean }) {
  return renderToStaticMarkup(
    createElement(FairEventMapView, {
      eventSlug: FAIR_MAP_PREVIEW_SLUG,
      view: preview.view,
      rotation: preview.rotation,
      display: props.display ?? false,
      initialLink: { stand: props.stand, zona: props.zona },
      passportProgress: preview.passportProgress,
    }),
  );
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("stand detail (sheet on a phone, panel on a computer)", () => {
  test("a shared stand: header with zone and m², every exhibitor with logo and website (new tab, noopener noreferrer), TEST models as links, the passport badge", () => {
    const html = detail("hala-2");
    expect(html).toContain("Štand 2 · Hala · 490\u00A0m²");
    for (const name of ["BYD", "Citroën", "Farizon", "Geely", "Motogrini", "Toyota"]) expect(html).toContain(`>${name}</h3>`);
    expect(count(html, 'target="_blank" rel="noopener noreferrer"')).toBe(6);
    expect(html).toContain('href="https://byd-auto.rs/"');
    expect(html).toContain('src="/sajam/izlagaci/2026/byd.webp"');
    expect(html).toContain(`href="/sajam/${FAIR_MAP_PREVIEW_SLUG}/model/test-model-a"`);
    expect(html).toContain(`href="/sajam/${FAIR_MAP_PREVIEW_SLUG}/model/test-model-d"`);
    expect(html).toContain(`${dict.passportLabel} · 1/2`);
    // Exhibitors without a published car get the quiet line, nothing invented.
    expect(count(html, dict.noModels)).toBe(4);
  });

  test("an exhibitor without a published car: name, logo, website and one quiet line", () => {
    const html = detail("hala-11");
    expect(html).toContain("Štand 11 · Hala · 120\u00A0m²");
    expect(html).toContain(">Škoda</h3>");
    expect(html).toContain(dict.noModels);
    expect(html).not.toContain("/model/");
  });

  test("the ScanMe stand has its own short text: ScanMe + Enigma IT, digital partner of the fair", () => {
    const html = detail("ispred-14");
    expect(html).toContain("Štand 14 · Ispred hale · 3\u00A0m²");
    expect(html).toContain(dict.scanmeBody);
    expect(html).toContain(">Enigma IT</h3>");
    expect(html).toContain(">ScanMe</h3>");
  });

  test("a partner point and the open rear area read as places, not stand numbers", () => {
    expect(detail("hala-partner-10b")).toContain("Partner sajma, uz 10B · Hala");
    expect(detail("zadnji-deo")).toContain(">Zadnji deo</h2>");
  });
});

describe("the page", () => {
  test("phone first: search + Pronađi ScanMe in one row, three zones, the map with its controls under it, then the category filters with counts, the list; no intro, no organizer underlay, no route, no 'you are here'", () => {
    const html = page({});
    expect(html).not.toContain(dict.introTitle);
    expect(html).toContain(dict.findScanMe);
    expect(html).toContain('id="fair-map-search"');
    // Reading order: search, ScanMe, zones, map, its controls, filters.
    const order = ['id="fair-map-search"', dict.findScanMe, `aria-label="${dict.zoneSwitchLabel}"`, 'data-zone="', `aria-label="${dict.zoomIn}"`, `aria-label="${dict.filtersLabel}"`].map((needle) => html.indexOf(needle));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(html).not.toContain("Originalna mapa");
    expect(html).not.toContain("/sajam/mape/");
    for (const zone of ["Hala", "Ispred hale", "Zadnji deo"]) expect(html).toContain(`>${zone}</button>`);
    expect(html).toContain(`aria-label="${dict.categories.automobili}, 17 izlagača"`);
    expect(html).toContain(`aria-label="${dict.categories.scanme}, 2 izlagača"`);
    expect(count(html, 'data-zone="')).toBe(3);
    expect(html).toContain(dict.directoryTitle);
    expect(html).not.toContain("role=\"dialog\"");
    for (const forbidden of ["Vi ste ovde", "Prikaži put", "Severni ulaz"]) expect(html).not.toContain(forbidden);
    expect(convex.calls).toBe(0);
  });

  test("?stand=hala-2 opens the shared stand: the sheet (phone first) and the panel carry all six exhibitors; the zone follows the stand", () => {
    const html = page({ stand: "hala-2", zona: "ispred" });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="fair-map-sheet-title"');
    expect(count(html, ">Motogrini</h3>")).toBe(2);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Hala<\/button>/);
    expect(html).toContain('data-location-id="hala-2" data-kind="stand" data-selected="true"');
  });

  test("?prikaz=ekran: the fair display — every zone, the legend, the rotation; no search, no sheet, no touch controls", () => {
    const html = page({ display: true, stand: "hala-2" });
    expect(html).toContain('data-display="on"');
    expect(html).not.toContain('id="fair-map-search"');
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain(dict.zoomIn);
    expect(html).toContain(dict.displayHint);
    expect(html).toContain(dict.categories.hrana);
    expect(count(html, 'data-zone="')).toBe(3);
  });
});
