/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import component from "../../components/fair/map/fair-event-map.tsx?raw";
import canvas from "../../components/fair/map/fair-map-canvas.tsx?raw";
import liveRotation from "../../components/fair/map/fair-map-live-rotation.ts?raw";
import rotation from "../../components/fair/map/fair-map-rotation.tsx?raw";

// M1 guards (MASTER §10.1, §14; EDS §3): ScanMe green only on the ScanMe
// stand, and the public map never writes — no vote, impression or analytics.
// N4: the map is split into several files, so every rule is checked over ALL
// of components/fair/map (stricter than one file), plus the test map's
// forbidden parts (route, "you are here", entrance choice) never come over.

const files = import.meta.glob("../../components/fair/map/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const all = Object.entries(files);
const mapCode = all.filter(([path]) => !path.endsWith("fair-map-overlay.tsx")).map(([, code]) => code).join("\n");

describe("public map guards", () => {
  test("ScanMe green (#C6FF4A) is set once in the whole map, only on the ScanMe location element", () => {
    expect(mapCode.match(/#c6ff4a/gi)).toHaveLength(1);
    expect(mapCode.match(/style=\{SCANME_STAND_STYLE\}/g)).toHaveLength(1);
    expect(canvas).toMatch(/<g className=\{styles\.scanmeLocation\} style=\{SCANME_STAND_STYLE\}>/);
    // …and only for the location of kind "scanme".
    expect(canvas).toMatch(/location\.kind === "scanme" \? \(\s*<g className=\{styles\.scanmeLocation\} style=\{SCANME_STAND_STYLE\}>/);
  });

  test("the only gateway call is the passport read; no vote, rating, survey or sponsored write anywhere in the map", () => {
    const paths = new Set([...mapCode.matchAll(/\/api\/fair\/[a-z/-]+/g)].map(([path]) => path));
    expect([...paths]).toEqual(["/api/fair/passport"]);
    for (const [path, code] of all) {
      if (path.endsWith("fair-map-rotation.tsx") || path.endsWith("fair-map-live-rotation.ts")) continue;
      for (const forbidden of ["audience-vote", "rating", "survey", "impression", "recordSponsoredAction", "sponsored", "analytics", "useMutation", "useAction"]) {
        expect(code, `${path}: ${forbidden}`).not.toContain(forbidden);
      }
    }
    expect(mapCode.match(/fetch\(/g)).toHaveLength(1);
  });

  test("N4: nothing of the test map's guidance comes over — no route, no 'you are here', no entrance choice, no polling", () => {
    for (const forbidden of ["routeFor", "youAreHere", "Vi ste ovde", "Prikaži put", "showRoute", "ENTRANCES", "ulaz=", "setInterval", "Dijkstra"]) {
      expect(mapCode, forbidden).not.toContain(forbidden);
    }
  });

  test("the M2 rotation only reads its server-provided projection: no request, vote or write", () => {
    for (const forbidden of ["fetch(", "/api/", "useMutation", "useQuery", "audience-vote", "recordSponsoredAction", "impression", "analytics", "setInterval"]) {
      expect(rotation).not.toContain(forbidden);
    }
    // The active slot comes only from Kodeks's rotation-slot.ts.
    expect(rotation).toContain('from "@/lib/fair-client/rotation-slot"');
    expect(rotation).not.toMatch(/Math.floor/);
  });

  test("K2: the live rotation is one reactive read of the map projection — no request, mutation or write", () => {
    expect(liveRotation.match(/useQuery\(/g)).toHaveLength(1);
    expect(liveRotation).toContain("useQuery(api.fairPublic.getSponsoredMapRotation, { eventSlug })");
    for (const forbidden of ["fetch(", "/api/", "useMutation", "useAction", "audience-vote", "recordSponsoredAction", "impression", "analytics", "setInterval", "router.refresh"]) {
      expect(liveRotation).not.toContain(forbidden);
    }
    // The public map takes its rotation only through this hook (the DEV preview passes a fixture to the same view).
    expect(component).toContain("useLiveFairMapRotation(props.eventSlug, props.initialRotation)");
    expect(mapCode.match(/useLiveFairMapRotation\(/g)).toHaveLength(2); // definition + the one call
    expect(mapCode.match(/useQuery\(/g)).toHaveLength(1);
  });
});
