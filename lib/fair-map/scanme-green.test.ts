import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { AUTO_MOTO_FEST_2026_MAP } from "./auto-moto-fest-2026";
import { ELEKTROMOBILNOST_2026_MAP } from "./elektromobilnost-2026";
import { buildFairMapPreview, FAIR_MAP_PREVIEW_SLUG } from "./preview-fixture";
import { fairMapPointsAttr } from "./shape";
import { buildFairMapView, type FairMapView } from "./view";

// D1 (RN N5 and the low AMF finding) — the ScanMe stand (`ispred-14`, EDS
// §5.1) is ScanMe green whatever the data: with its stand row, without one,
// and after a tap on a phone (hover never paints over it); a placeholder
// ScanMe location that is not on the organizer map is not drawn at all.

vi.mock("convex/react", () => ({ useQuery: () => undefined }));
const { FairEventMapView } = await import("../../components/fair/map/fair-event-map");

const css = readFileSync(join(process.cwd(), "components/fair/map/fair-event-map.module.css"), "utf8").replace(/\r\n/g, "\n");
const preview = buildFairMapPreview();
const allStands = preview.view.zones.flatMap((zone) => zone.stands.map((row) => row.stand));

function render(view: FairMapView, eventSlug = FAIR_MAP_PREVIEW_SLUG) {
  return renderToStaticMarkup(
    createElement(FairEventMapView, { eventSlug, view, rotation: null, display: false, initialLink: { zona: "ispred" }, passportProgress: [] }),
  );
}

/** The opening tag of the `<g>` drawing location kind "scanme". */
function scanmeTags(html: string) {
  return [...html.matchAll(/<g [^>]*data-kind="scanme"[^>]*>/g)].map((match) => match[0]);
}

describe("ScanMe stand 14 is always ScanMe green (RN N5)", () => {
  test("with its stand row: the one interactive ScanMe location, green", () => {
    const html = render(preview.view);
    const tags = scanmeTags(html);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('data-location-id="ispred-14"');
    expect(tags[0]).toContain('role="button"');
    expect(html.match(/--fair-map-scanme:#C6FF4A/g)).toHaveLength(1);
  });

  test("without any stand on ispred-14 it is still drawn green (not the grey empty box), only not interactive", () => {
    const view = buildFairMapView(
      ELEKTROMOBILNOST_2026_MAP,
      allStands.filter((stand) => stand.mapLocationId !== "ispred-14"),
      [],
      preview.view.withoutLocation,
    );
    expect(view.zones.flatMap((zone) => zone.locations).some((row) => row.location.id === "ispred-14")).toBe(false);
    const html = render(view);
    const tags = scanmeTags(html);
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('aria-hidden="true"');
    expect(tags[0]).not.toContain("data-location-id");
    expect(tags[0]).not.toContain('role="button"');
    expect(tags[0]).not.toContain("tabindex");
    expect(html.match(/--fair-map-scanme:#C6FF4A/g)).toHaveLength(1);
    // The green group holds the ScanMe polygon itself.
    const points = fairMapPointsAttr(ELEKTROMOBILNOST_2026_MAP.zones.flatMap((zone) => zone.locations).find((row) => row.id === "ispred-14")!.polygon);
    expect(html).toMatch(new RegExp(`--fair-map-scanme:#C6FF4A"><polygon [^>]*points="${points}"`));
    expect(html.split(`points="${points}"`)).toHaveLength(2);
  });

  test("hover only where a pointer hovers, and never on the ScanMe stand (a tap on a phone left it white before)", () => {
    const hoverBlocks = [...css.matchAll(/@media \(hover: hover\) \{([\s\S]*?)\n\}/g)].map((match) => match[1]);
    const outside = hoverBlocks.reduce((rest, block) => rest.replace(block, ""), css);
    expect(outside).not.toMatch(/\.stand[^{,]*:hover/);
    const hoverRules = hoverBlocks.join("\n").match(/[^{}]*\.stand[^{]*:hover[^{]*\{/g) ?? [];
    expect(hoverRules.length).toBeGreaterThan(0);
    for (const rule of hoverRules) expect(rule).toContain(':not([data-kind="scanme"])');
    // The green itself stays a plain, unconditional rule.
    expect(outside).toMatch(/\.scanmeLocation \.standShape \{\s*fill: var\(--fair-map-scanme\);/);
  });
});

describe("no ScanMe placeholder on a map without an organizer ScanMe stand (AMF)", () => {
  test("the AMF placeholder location is neither drawn nor numbered", () => {
    const placeholder = AUTO_MOTO_FEST_2026_MAP.zones.flatMap((zone) => zone.locations).find((row) => row.kind === "scanme")!;
    expect(placeholder.placement).toBe("placeholder");
    const html = render(buildFairMapView(AUTO_MOTO_FEST_2026_MAP, [], []), "test-auto-moto-fest-2026");
    expect(html).not.toContain(`points="${fairMapPointsAttr(placeholder.polygon)}"`);
    expect(scanmeTags(html)).toHaveLength(0);
    expect(html).not.toContain(">ScanMe</span>");
    expect(html).not.toContain("--fair-map-scanme");
  });
});
