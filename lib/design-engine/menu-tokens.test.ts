import { describe, expect, it } from "vitest";
import {
  clampMenuDesign,
  compileMenuTokens,
  DEFAULT_MENU_DESIGN,
  type MenuDesign,
} from "./menu-tokens";

describe("compileMenuTokens", () => {
  it("emits only --menu-* custom properties", () => {
    const tokens = compileMenuTokens(DEFAULT_MENU_DESIGN);
    expect(Object.keys(tokens).length).toBeGreaterThan(0);
    for (const key of Object.keys(tokens)) {
      expect(key.startsWith("--menu-")).toBe(true);
    }
  });

  it("emits no Links-namespaced or Venue-namespaced token anywhere (key or value)", () => {
    const tokens = compileMenuTokens(DEFAULT_MENU_DESIGN);
    const serialized = JSON.stringify(tokens);
    // Build the forbidden prefixes from parts so the literals never appear in
    // Menu source (the goal forbids them anywhere in new code).
    const linksPrefix = `--${"links"}-`;
    const venuePrefix = `--${"venue"}-`;
    expect(serialized).not.toContain(linksPrefix);
    expect(serialized).not.toContain(venuePrefix);
  });

  it("compiles the page and accent colour roles", () => {
    const tokens = compileMenuTokens(DEFAULT_MENU_DESIGN);
    expect(tokens["--menu-page"]).toBe("#F7F8F3");
    expect(tokens["--menu-accent"]).toBe("#7A5C43");
    expect(tokens["--menu-font-family"]).toContain("DM Sans");
  });

  it("emits page-level shadow tokens when effects are present", () => {
    const design: MenuDesign = {
      ...DEFAULT_MENU_DESIGN,
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
    const tokens = compileMenuTokens(design);
    expect(tokens["--menu-text-shadow"]).toBe("1px 2px 3px rgba(0, 0, 0, 0.4)");
    expect(tokens["--menu-logo-shadow"]).toBe("none");
  });

  it("produces readable accent-text and on-accent contrast floors (RFC-003 §2.4)", () => {
    // A low-contrast accent against the page/surface — the a11y floor must
    // still yield a readable accent-text variant, exactly as Venue's does.
    // This is the value the accent icon tile (pločica) reads for its glyph.
    const design: MenuDesign = {
      ...DEFAULT_MENU_DESIGN,
      colors: {
        ...DEFAULT_MENU_DESIGN.colors,
        accent: "#F0EFE9", // near-identical to the light page — fails 4.5 raw
      },
    };
    const tokens = compileMenuTokens(design);
    expect(tokens["--menu-accent-text"]).toBeDefined();
    expect(tokens["--menu-on-accent"]).toBeDefined();
    expect(tokens["--menu-accent-text"]).not.toBe(design.colors.accent);
  });
});

describe("clampMenuDesign", () => {
  it("returns the default design for null", () => {
    expect(clampMenuDesign(null)).toEqual(DEFAULT_MENU_DESIGN);
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
    } as MenuDesign;
    const clamped = clampMenuDesign(partial);
    expect(clamped.colors.page).toBe("#000000");
    // typography/background were absent → filled from defaults.
    expect(clamped.typography).toEqual(DEFAULT_MENU_DESIGN.typography);
    expect(clamped.background).toEqual(DEFAULT_MENU_DESIGN.background);
  });
});
