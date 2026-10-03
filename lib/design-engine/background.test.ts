import { describe, expect, it } from "vitest";
import type { ScanMeLinksBackgroundV2 } from "../scanme-links-design";
import { backgroundPresentation } from "./background";

describe("backgroundPresentation", () => {
  it("renders a flat background as a self-colored gradient with no detail", () => {
    expect(
      backgroundPresentation({ category: "flat", color: "#112233" }),
    ).toEqual({
      baseImage: "linear-gradient(#112233, #112233)",
      detailImage: "none",
      detailSize: "auto",
      detailOpacity: 0,
    });
  });

  it("renders a linear gradient with its angle", () => {
    const background: ScanMeLinksBackgroundV2 = {
      category: "gradient",
      variant: "linear",
      startColor: "#000000",
      endColor: "#ffffff",
      angle: 45,
      centerX: 50,
      centerY: 50,
    };
    expect(backgroundPresentation(background)).toEqual({
      baseImage: "linear-gradient(45deg, #000000, #ffffff)",
      detailImage: "none",
      detailSize: "auto",
      detailOpacity: 0,
    });
  });

  it("renders a radial gradient centered at centerX/centerY", () => {
    const background: ScanMeLinksBackgroundV2 = {
      category: "gradient",
      variant: "radial",
      startColor: "#000000",
      endColor: "#ffffff",
      angle: 45,
      centerX: 25,
      centerY: 75,
    };
    expect(backgroundPresentation(background).baseImage).toBe(
      "radial-gradient(circle at 25% 75%, #000000, #ffffff)",
    );
  });

  const pattern = (
    variant: "grid" | "checker" | "dots" | "waves",
    scale = 12,
  ): ScanMeLinksBackgroundV2 => ({
    category: "pattern",
    variant,
    backgroundColor: "#111111",
    patternColor: "#ff0000",
    scale,
    opacity: 0.5,
  });

  it("renders every pattern variant with the pattern color at full alpha", () => {
    expect(backgroundPresentation(pattern("grid"))).toEqual({
      baseImage: "linear-gradient(#111111, #111111)",
      detailImage:
        "linear-gradient(rgba(255, 0, 0, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 0, 0, 1) 1px, transparent 1px), linear-gradient(#111111, #111111)",
      detailSize: "12px 12px",
      detailOpacity: 0.5,
    });
    expect(backgroundPresentation(pattern("checker")).detailImage).toBe(
      "conic-gradient(from 90deg at 1px 1px, transparent 90deg, rgba(255, 0, 0, 1) 0)",
    );
    expect(backgroundPresentation(pattern("dots")).detailImage).toBe(
      "radial-gradient(circle, rgba(255, 0, 0, 1) 1.5px, transparent 1.7px), linear-gradient(#111111, #111111)",
    );
    expect(backgroundPresentation(pattern("waves")).detailImage).toBe(
      "radial-gradient(ellipse at 50% 100%, transparent 65%, rgba(255, 0, 0, 1) 66%, transparent 69%), linear-gradient(#111111, #111111)",
    );
  });

  it("doubles the tile width for waves and floors the pattern scale at 4", () => {
    expect(backgroundPresentation(pattern("waves")).detailSize).toBe(
      "24px 12px",
    );
    expect(backgroundPresentation(pattern("dots", 2)).detailSize).toBe(
      "4px 4px",
    );
  });

  const texture = (
    variant: "paper" | "linen" | "wood" | "metal",
  ): ScanMeLinksBackgroundV2 => ({
    category: "texture",
    variant,
    backgroundColor: "#fafafa",
    tintColor: "#00ff00",
    intensity: 0.75,
  });

  it("renders every texture variant with an 85%-alpha tint", () => {
    expect(backgroundPresentation(texture("paper"))).toEqual({
      baseImage: "linear-gradient(#fafafa, #fafafa)",
      detailImage:
        "radial-gradient(circle at 20% 30%, rgba(0, 255, 0, 0.85) 0 .65px, transparent .8px), radial-gradient(circle at 75% 68%, rgba(0, 255, 0, 0.85) 0 .55px, transparent .75px), linear-gradient(#fafafa, #fafafa)",
      detailSize: "17px 19px",
      detailOpacity: 0.75,
    });
    expect(backgroundPresentation(texture("linen")).detailImage).toBe(
      "repeating-linear-gradient(0deg, rgba(0, 255, 0, 0.85) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(0, 255, 0, 0.85) 0 1px, transparent 1px 5px), linear-gradient(#fafafa, #fafafa)",
    );
    expect(backgroundPresentation(texture("wood")).detailImage).toBe(
      "repeating-radial-gradient(ellipse at -20% 50%, transparent 0 15px, rgba(0, 255, 0, 0.85) 16px 17px, transparent 18px 29px), linear-gradient(#fafafa, #fafafa)",
    );
    expect(backgroundPresentation(texture("metal")).detailImage).toBe(
      "repeating-linear-gradient(105deg, transparent 0 3px, rgba(0, 255, 0, 0.85) 4px, transparent 5px 9px), linear-gradient(120deg, #fafafa, color-mix(in srgb, #fafafa 74%, white), #fafafa)",
    );
  });

  it("sizes texture tiles per variant", () => {
    expect(backgroundPresentation(texture("paper")).detailSize).toBe(
      "17px 19px",
    );
    expect(backgroundPresentation(texture("wood")).detailSize).toBe(
      "80px 46px",
    );
    expect(backgroundPresentation(texture("linen")).detailSize).toBe("auto");
    expect(backgroundPresentation(texture("metal")).detailSize).toBe("auto");
  });

  it("defers media backgrounds to the page color token", () => {
    const background: ScanMeLinksBackgroundV2 = {
      category: "media",
      mediaType: "image",
      fit: "cover",
      zoom: 1,
      positionX: 50,
      positionY: 50,
      overlayColor: "#000000",
      overlayOpacity: 0.2,
    };
    expect(backgroundPresentation(background)).toEqual({
      baseImage: "linear-gradient(var(--links-page), var(--links-page))",
      detailImage: "none",
      detailSize: "auto",
      detailOpacity: 0,
    });
  });

  it("renders animation backgrounds on their base color", () => {
    const background: ScanMeLinksBackgroundV2 = {
      category: "animation",
      variant: "aurora",
      baseColor: "#123456",
      accentColor: "#654321",
      speed: 1,
      intensity: 0.5,
    };
    expect(backgroundPresentation(background)).toEqual({
      baseImage: "linear-gradient(#123456, #123456)",
      detailImage: "none",
      detailSize: "auto",
      detailOpacity: 0,
    });
  });
});
