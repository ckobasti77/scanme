import { describe, expect, it } from "vitest";
import {
  clampVenueDesign,
  compileVenueTokens,
  DEFAULT_VENUE_DESIGN,
  type VenueDesign,
} from "./venue-tokens";

describe("compileVenueTokens", () => {
  it("emits only --venue-* custom properties", () => {
    const tokens = compileVenueTokens(DEFAULT_VENUE_DESIGN);
    expect(Object.keys(tokens).length).toBeGreaterThan(0);
    for (const key of Object.keys(tokens)) {
      expect(key.startsWith("--venue-")).toBe(true);
    }
  });

  it("emits no Links-namespaced token anywhere (key or value)", () => {
    const tokens = compileVenueTokens(DEFAULT_VENUE_DESIGN);
    const serialized = JSON.stringify(tokens);
    // Build the forbidden prefix from parts so the literal never appears in
    // Venue source (the goal forbids it anywhere in new code).
    const linksPrefix = `--${"links"}-`;
    expect(serialized).not.toContain(linksPrefix);
  });

  it("compiles the page and accent colour roles", () => {
    const tokens = compileVenueTokens(DEFAULT_VENUE_DESIGN);
    expect(tokens["--venue-page"]).toBe("#F7F8F3");
    expect(tokens["--venue-accent"]).toBe("#7A5C43");
    expect(tokens["--venue-font-family"]).toContain("DM Sans");
  });

  it("emits page-level shadow tokens when effects are present", () => {
    const design: VenueDesign = {
      ...DEFAULT_VENUE_DESIGN,
      effects: {
        textShadow: {
          enabled: true,
          color: "#000000",
          x: 1,
          y: 2,
          blur: 3,
          opacity: 0.4,
        },
        logoShadow: {
          enabled: false,
          color: "#000000",
          x: 0,
          y: 0,
          blur: 0,
          opacity: 0,
        },
      },
    };
    const tokens = compileVenueTokens(design);
    expect(tokens["--venue-text-shadow"]).toBe(
      "1px 2px 3px rgba(0, 0, 0, 0.4)",
    );
    expect(tokens["--venue-logo-shadow"]).toBe("none");
  });
});

describe("clampVenueDesign", () => {
  it("returns the default design for null", () => {
    expect(clampVenueDesign(null)).toEqual(DEFAULT_VENUE_DESIGN);
  });

  it("fills missing top-level keys from defaults", () => {
    const partial = {
      version: 1,
      colors: {
        page: "#000000",
        surface: "#111111",
        title: "#ffffff",
        body: "#eeeeee",
        accent: "#ff8800",
        border: "#222222",
        focus: "#ff8800",
        icon: "#ff8800",
      },
    } as VenueDesign;
    const clamped = clampVenueDesign(partial);
    expect(clamped.colors.page).toBe("#000000");
    // typography/background were absent → filled from defaults.
    expect(clamped.typography).toEqual(DEFAULT_VENUE_DESIGN.typography);
    expect(clamped.background).toEqual(DEFAULT_VENUE_DESIGN.background);
  });
});
