/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import component from "../../components/fair/map/fair-event-map.tsx?raw";

// M1 guards (MASTER §10.1, §14; EDS §3): ScanMe green only on the ScanMe
// stand, and the public map never writes — no vote, impression or analytics.

describe("public map guards", () => {
  test("ScanMe green (#C6FF4A) is set once, only on the ScanMe location element", () => {
    expect(component.match(/#c6ff4a/gi)).toHaveLength(1);
    expect(component.match(/style=\{SCANME_STAND_STYLE\}/g)).toHaveLength(1);
    expect(component).toMatch(/<g className=\{styles\.scanmeLocation\} style=\{SCANME_STAND_STYLE\}/);
  });

  test("the only gateway call is the passport read; no vote, rating, survey or sponsored write", () => {
    const paths = new Set([...component.matchAll(/\/api\/fair\/[a-z/-]+/g)].map(([path]) => path));
    expect([...paths]).toEqual(["/api/fair/passport"]);
    for (const forbidden of ["audience-vote", "rating", "survey", "impression", "recordSponsoredAction", "sponsored", "analytics"]) {
      expect(component).not.toContain(forbidden);
    }
  });
});
