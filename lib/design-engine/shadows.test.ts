import { describe, expect, it } from "vitest";
import type { ScanMeLinksShadowV2 } from "../scanme-links-design";
import { logoShadowCss, shadowCss } from "./shadows";

const shadow = (overrides: Partial<ScanMeLinksShadowV2>): ScanMeLinksShadowV2 => ({
  enabled: true,
  color: "#336699",
  x: 2,
  y: 4,
  blur: 8,
  opacity: 0.5,
  ...overrides,
});

describe("shadowCss", () => {
  it("returns the transparent no-op shadow when disabled", () => {
    expect(shadowCss(shadow({ enabled: false }))).toBe("0 0 0 transparent");
  });

  it("returns the transparent no-op shadow at zero opacity", () => {
    expect(shadowCss(shadow({ opacity: 0 }))).toBe("0 0 0 transparent");
  });

  it("renders a colored shadow with its hex color as rgba", () => {
    expect(shadowCss(shadow({}))).toBe(
      "2px 4px 8px rgba(51, 102, 153, 0.5)",
    );
  });

  it("renders negative offsets and zero blur verbatim", () => {
    expect(
      shadowCss(shadow({ color: "#000000", x: -6, y: 12, blur: 0, opacity: 1 })),
    ).toBe("-6px 12px 0px rgba(0, 0, 0, 1)");
  });

  it("falls back to color-mix for non-6-digit-hex colors", () => {
    expect(shadowCss(shadow({ color: "gold", x: 1, y: 1, blur: 2 }))).toBe(
      "1px 1px 2px color-mix(in srgb, gold 50%, transparent)",
    );
  });
});

describe("logoShadowCss", () => {
  it("returns none when disabled", () => {
    expect(logoShadowCss(shadow({ enabled: false }))).toBe("none");
  });

  it("returns none at zero opacity", () => {
    expect(logoShadowCss(shadow({ opacity: 0 }))).toBe("none");
  });

  it("wraps the colored shadow in drop-shadow()", () => {
    expect(logoShadowCss(shadow({}))).toBe(
      "drop-shadow(2px 4px 8px rgba(51, 102, 153, 0.5))",
    );
  });

  it("renders offset shadows inside drop-shadow()", () => {
    expect(
      logoShadowCss(
        shadow({ color: "#000000", x: -6, y: 12, blur: 0, opacity: 1 }),
      ),
    ).toBe("drop-shadow(-6px 12px 0px rgba(0, 0, 0, 1))");
  });
});
