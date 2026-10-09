/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import component from "../../components/fair/map/fair-event-map.tsx?raw";
import canvas from "../../components/fair/map/fair-map-canvas.tsx?raw";
import liveRotation from "../../components/fair/map/fair-map-live-rotation.ts?raw";
import rotation from "../../components/fair/map/fair-map-rotation.tsx?raw";
import heat from "../../components/fair/map/fair-map-heat.tsx?raw";

// M1 guards (MASTER §10.1, §14; EDS §3): ScanMe green only on the ScanMe
// stand, and the public map never writes — no vote, impression or analytics.
// N4: the map is split into several files, so every rule is checked over ALL
// of components/fair/map (stricter than one file), plus the test map's
// forbidden parts (route, "you are here", entrance choice) never come over.

const files = import.meta.glob("../../components/fair/map/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const all = Object.entries(files);
const mapCode = all.filter(([path]) => !path.endsWith("fair-map-overlay.tsx")).map(([, code]) => code).join("\n");
// SAJAM SUPER Korak 3: „Gde je gužva“ is the one other read; it is guarded on its own below.
const mapCodeWithoutHeat = all.filter(([path]) => !path.endsWith("fair-map-overlay.tsx") && !path.endsWith("fair-map-heat.tsx")).map(([, code]) => code).join("\n");

describe("public map guards", () => {
  test("ScanMe green (#6FC05D) is set once in the whole map, only on the ScanMe location element", () => {
    expect(mapCode.match(/#6fc05d/gi)).toHaveLength(1);
    expect(mapCode.match(/style=\{SCANME_STAND_STYLE\}/g)).toHaveLength(1);
    expect(canvas).toMatch(/<g className=\{styles\.scanmeLocation\} style=\{SCANME_STAND_STYLE\}>/);
    // …and only for the location of kind "scanme".
    expect(canvas).toMatch(/location\.kind === "scanme" \? \(\s*<g className=\{styles\.scanmeLocation\} style=\{SCANME_STAND_STYLE\}>/);
  });

  test("the only gateway calls are the passport read and the cached heat read; no vote, rating, survey or sponsored write anywhere in the map", () => {
    const paths = new Set([...mapCodeWithoutHeat.matchAll(/\/api\/fair\/[a-z/-]+/g)].map(([path]) => path));
    expect([...paths]).toEqual(["/api/fair/passport"]);
    for (const [path, code] of all) {
      if (path.endsWith("fair-map-rotation.tsx") || path.endsWith("fair-map-live-rotation.ts")) continue;
      for (const forbidden of ["audience-vote", "rating", "survey", "impression", "recordSponsoredAction", "sponsored", "analytics", "useMutation", "useAction"]) {
        expect(code, `${path}: ${forbidden}`).not.toContain(forbidden);
      }
    }
    expect(mapCodeWithoutHeat.match(/fetch\(/g)).toHaveLength(1);
  });

  test("SAJAM SUPER: the heat layer is one GET of the cached route a minute while on — no subscription, write or count", () => {
    expect(heat.match(/fetch\(/g)).toHaveLength(1);
    expect(heat).toContain("fetch(`/api/fair/heat/${encodeURIComponent(eventSlug)}`, { signal: current.signal })");
    expect(heat).toContain("window.setInterval(load, FAIR_HEAT_REFRESH_MS)");
    for (const forbidden of ["method:", "POST", "useQuery", "useMutation", "useAction", "convex/react", "audience-vote", "recordSponsoredAction", "analytics"]) {
      expect(heat, forbidden).not.toContain(forbidden);
    }
    // Off by default: the server and the first paint read an empty preference.
    expect(heat).toContain('useSyncExternalStore(subscribePreference, readPreference, () => "")');
    expect(heat).toContain('return { on: on === "on"');
  });

  test("N4: nothing of the test map's guidance comes over — no route, no 'you are here', no entrance choice, no polling", () => {
    for (const forbidden of ["routeFor", "youAreHere", "Vi ste ovde", "Prikaži put", "showRoute", "ENTRANCES", "ulaz=", "Dijkstra"]) {
      expect(mapCode, forbidden).not.toContain(forbidden);
    }
    // The only timers are the heat read (60 s, only while the switch is on) and its „pre X min“ clock.
    expect(mapCodeWithoutHeat).not.toContain("setInterval");
    expect(heat.match(/setInterval\(/g)).toHaveLength(2);
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
