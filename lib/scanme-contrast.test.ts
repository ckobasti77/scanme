import { describe, expect, it } from "vitest";
import type { ScanMeLinksBackgroundV2 } from "./scanme-links-design";
import { createDefaultScanMeLinksDesignV2 } from "./scanme-links-design";
import {
  analyzeScanMeContrast,
  backgroundContrastSamples,
  contrastQuality,
  contrastQualityLabel,
  mostCriticalPoorIssueId,
} from "./scanme-contrast";

const backgrounds: ScanMeLinksBackgroundV2[] = [
  { category: "flat", color: "#F7F1EA" },
  {
    category: "gradient",
    variant: "linear",
    startColor: "#F7F1EA",
    endColor: "#E2D4C9",
    angle: 145,
    centerX: 50,
    centerY: 50,
  },
  {
    category: "pattern",
    variant: "dots",
    backgroundColor: "#F7F1EA",
    patternColor: "#705C52",
    scale: 20,
    opacity: 0.3,
  },
  {
    category: "texture",
    variant: "paper",
    backgroundColor: "#F7F1EA",
    tintColor: "#B88A76",
    intensity: 0.35,
  },
  {
    category: "media",
    mediaType: "image",
    fit: "cover",
    zoom: 1,
    positionX: 50,
    positionY: 50,
    overlayColor: "#171918",
    overlayOpacity: 0.55,
  },
  {
    category: "animation",
    variant: "aurora",
    baseColor: "#18231E",
    accentColor: "#6E8F7E",
    speed: 1,
    intensity: 0.5,
  },
];

describe("ScanMe contrast assistant", () => {
  it.each(backgrounds.map((background) => [background.category, background]))(
    "samples %s backgrounds",
    (_, background) => {
      const design = {
        ...createDefaultScanMeLinksDesignV2("gentle"),
        background,
      };
      expect(backgroundContrastSamples(design).length).toBeGreaterThan(0);
    },
  );

  it("reports an AA issue and provides local palette-aware fixes", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#F7F1EA" };
    design.colors.title = "#E8E0D9";

    const issues = analyzeScanMeContrast(
      design,
      ["#F7F1EA", "#E5D8CE", "#C6FF4A", "#242623", "#315B52"],
      ["#C6FF4A"],
    );
    const titleIssue = issues.find((candidate) => candidate.id === "title-contrast");

    expect(titleIssue).toBeDefined();
    expect(titleIssue?.required).toBe(4.5);
    expect(titleIssue?.suggestions.length).toBeGreaterThanOrEqual(2);
    expect(titleIssue?.suggestions.length).toBeLessThanOrEqual(3);
  });

  it("offers an overlay repair for unstable media contrast", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = {
      category: "media",
      mediaType: "image",
      fit: "cover",
      zoom: 1,
      positionX: 50,
      positionY: 50,
      overlayColor: "#171918",
      overlayOpacity: 0.05,
    };

    const issues = analyzeScanMeContrast(design, [], []);
    const overlayIssue = issues.find((candidate) => candidate.id === "media-overlay");

    expect(overlayIssue).toBeDefined();
    expect(overlayIssue?.suggestions[0].role).toBe("background");
    expect(overlayIssue?.suggestions[0].overlayOpacity).toBe(0.78);
  });

  it("translates technical ratios into plain-language quality", () => {
    expect(contrastQualityLabel(2.2, 4.5)).toBe("Loš kontrast");
    expect(contrastQualityLabel(3.8, 4.5)).toBe("Dobar kontrast");
    expect(contrastQualityLabel(5.2, 4.5)).toBe("Dobar kontrast");
    expect(contrastQualityLabel(7.2, 4.5)).toBe("Odličan kontrast");
  });

  it("identifies only the most critical poor issue for automatic expansion", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#F7F1EA" };
    design.colors.title = "#F4EDE6";
    design.colors.body = "#B8AAA0";
    const issues = analyzeScanMeContrast(design);
    const criticalId = mostCriticalPoorIssueId(issues);

    expect(criticalId).toBeTruthy();
    const critical = issues.find((issue) => issue.id === criticalId);
    expect(critical).toBeDefined();
    expect(contrastQuality(critical!.ratio, critical!.required)).toBe("poor");
  });

  it("never recommends pure black or white as the safe neutral", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#F7F1EA" };
    design.colors.title = "#F4EDE6";
    const issue = analyzeScanMeContrast(design).find(
      (candidate) => candidate.id === "title-contrast",
    );
    const neutral = issue?.suggestions.find(
      (suggestion) => suggestion.label === "Sigurna neutralna",
    );

    expect(neutral).toBeDefined();
    expect(neutral?.color).not.toBe("#000000");
    expect(neutral?.color).not.toBe("#FFFFFF");
  });
});
