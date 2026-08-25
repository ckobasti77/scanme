import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  deriveRoleColors,
  deriveVenueRoleColors,
  generateMaterialRoles,
  VENUE_ROLES,
} from "./palette";

// A 5-colour palette in `[background, surface, accent, text, button]` order —
// the order `generateMaterialRoles` returns.
const PALETTE = ["#101418", "#1B2027", "#E4B363", "#F4F6F8", "#E4B363"];

describe("deriveRoleColors", () => {
  it("returns exactly the Venue role set from a 5-colour palette", () => {
    const colors = deriveVenueRoleColors(PALETTE);
    expect(Object.keys(colors).sort()).toEqual([...VENUE_ROLES].sort());
    for (const role of VENUE_ROLES) {
      expect(colors[role]).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("projects an arbitrary role list out of the same expansion", () => {
    const colors = deriveRoleColors(["page", "accent"] as const, PALETTE);
    expect(Object.keys(colors).sort()).toEqual(["accent", "page"]);
    // `page` echoes the normalized first palette colour.
    expect(colors.page.toLowerCase()).toBe("#101418");
  });

  it("derives readable body text against the page (contrast ≥ 4.5)", () => {
    const colors = deriveVenueRoleColors(PALETTE);
    expect(contrastRatio(colors.body, colors.page)).toBeGreaterThanOrEqual(4.5);
  });

  it("throws for a palette shorter than five colours", () => {
    expect(() => deriveVenueRoleColors(["#000000"])).toThrow();
  });

  it("throws for an unknown role name", () => {
    expect(() =>
      deriveRoleColors(["not-a-role"] as unknown as readonly "page"[], PALETTE),
    ).toThrow();
  });
});

describe("re-exports", () => {
  it("re-exports the Material-colour helper", () => {
    expect(typeof generateMaterialRoles).toBe("function");
  });
});
