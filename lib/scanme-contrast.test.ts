import { describe, expect, it } from "vitest";
import type { ScanMeLinksBackgroundV2 } from "./scanme-links-design";
import { createDefaultScanMeLinksDesignV2 } from "./scanme-links-design";
import {
  analyzeScanMeContrast,
  backgroundContrastSamples,
  contrastQualityLabel,
  contrastSeverityLabel,
} from "./scanme-contrast";
import { contrastRatio, minimumContrast, normalizeColorHex } from "./scanme-color-science";
import { layoutForPreset } from "./scanme-links-design";

const SUGGESTION_ORDER = [
  "Iz palete",
  "Najmanja izmena",
  "Sigurna neutralna",
] as const;

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

function mediaBackground(overlayOpacity: number): ScanMeLinksBackgroundV2 {
  return {
    category: "media",
    mediaType: "image",
    fit: "cover",
    zoom: 1,
    positionX: 50,
    positionY: 50,
    overlayColor: "#171918",
    overlayOpacity,
  };
}

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

    const issues = analyzeScanMeContrast({
      design,
      generatedPalette: ["#F7F1EA", "#E5D8CE", "#C6FF4A", "#242623", "#315B52"],
      logoPalette: ["#C6FF4A"],
    });
    const titleIssue = issues.find((candidate) => candidate.id === "title-contrast");

    expect(titleIssue).toBeDefined();
    expect(titleIssue?.required).toBe(4.5);
    expect(titleIssue?.suggestions).toHaveLength(3);
    for (const suggestion of titleIssue?.suggestions ?? []) {
      expect(suggestion.color).not.toBe("#000000");
      expect(suggestion.color).not.toBe("#FFFFFF");
    }
  });

  it("stays silent for an image background with no upload and no description", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = mediaBackground(0.12);
    design.background = {
      ...design.background,
      overlayColor: design.colors.page,
    } as ScanMeLinksBackgroundV2;

    const issues = analyzeScanMeContrast({
      design,
      content: {
        hasTitle: true,
        hasDescription: false,
        destinationCount: 0,
        hasLogo: false,
      },
      media: { hasImage: false, hasVideo: false },
    });

    expect(issues).toHaveLength(0);
  });

  it("only flags the description when there is description text", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#F7F1EA" };
    design.colors.body = "#F4EDE6"; // clashes with the page

    const withoutText = analyzeScanMeContrast({
      design,
      content: {
        hasTitle: false,
        hasDescription: false,
        destinationCount: 0,
        hasLogo: false,
      },
    });
    expect(
      withoutText.some((candidate) => candidate.id === "body-contrast"),
    ).toBe(false);

    const withText = analyzeScanMeContrast({
      design,
      content: {
        hasTitle: false,
        hasDescription: true,
        destinationCount: 0,
        hasLogo: false,
      },
    });
    expect(
      withText.some((candidate) => candidate.id === "body-contrast"),
    ).toBe(true);
  });

  it("offers an overlay repair as an advisory only when media is displayed", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = mediaBackground(0.05);

    const issues = analyzeScanMeContrast({
      design,
      media: { hasImage: true, hasVideo: false },
    });
    const overlayIssue = issues.find((candidate) => candidate.id === "media-overlay");

    expect(overlayIssue).toBeDefined();
    expect(overlayIssue?.advisory).toBe(true);
    expect(overlayIssue?.suggestions[0].role).toBe("background");
    // Overlay opacity is now the dynamic minimum needed for legibility, within a sane band.
    const overlayOpacity = overlayIssue?.suggestions[0].overlayOpacity ?? 0;
    expect(overlayOpacity).toBeGreaterThanOrEqual(0.4);
    expect(overlayOpacity).toBeLessThanOrEqual(0.9);
    // Page-background text findings are folded into the advisory, not emitted separately.
    expect(issues.some((candidate) => candidate.id === "title-contrast")).toBe(false);
    expect(issues.some((candidate) => candidate.id === "body-contrast")).toBe(false);
  });

  it("translates technical ratios into plain-language quality", () => {
    expect(contrastQualityLabel(2.2, 4.5)).toBe("Loš kontrast");
    expect(contrastQualityLabel(3.8, 4.5)).toBe("Dobar kontrast");
    expect(contrastQualityLabel(5.2, 4.5)).toBe("Dobar kontrast");
    expect(contrastQualityLabel(7.2, 4.5)).toBe("Odličan kontrast");
  });

  it("never recommends pure black or white as the safe neutral", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#F7F1EA" };
    design.colors.title = "#F4EDE6";
    const issue = analyzeScanMeContrast({ design }).find(
      (candidate) => candidate.id === "title-contrast",
    );
    const neutral = issue?.suggestions.find(
      (suggestion) => suggestion.label === "Sigurna neutralna",
    );

    expect(neutral).toBeDefined();
    expect(neutral?.color).not.toBe("#000000");
    expect(neutral?.color).not.toBe("#FFFFFF");
  });

  // Human-eye correctness: the analyzer must judge text against the colour actually painted
  // behind it. Invisible combos flag; genuinely readable combos do not.
  it("flags invisible text but not high-contrast text (flat)", () => {
    const invisible = createDefaultScanMeLinksDesignV2("gentle");
    invisible.background = { category: "flat", color: "#FFFFFF" };
    invisible.colors.page = "#FFFFFF";
    invisible.colors.title = "#FFFFFF";
    expect(
      analyzeScanMeContrast({ design: invisible, content: { hasTitle: true, hasDescription: false, destinationCount: 0, hasLogo: false } })
        .some((i) => i.id === "title-contrast"),
    ).toBe(true);

    const readable = createDefaultScanMeLinksDesignV2("gentle");
    readable.background = { category: "flat", color: "#0A1F44" };
    readable.colors.page = "#0A1F44";
    readable.colors.title = "#FFFFFF";
    expect(
      analyzeScanMeContrast({ design: readable, content: { hasTitle: true, hasDescription: false, destinationCount: 0, hasLogo: false } })
        .some((i) => i.id === "title-contrast"),
    ).toBe(false);
  });

  it("does not flag readable white text on a fully dark gradient", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = {
      category: "gradient",
      variant: "linear",
      startColor: "#0A1F44",
      endColor: "#101828",
      angle: 145,
      centerX: 50,
      centerY: 50,
    };
    design.colors.title = "#FFFFFF";
    expect(
      analyzeScanMeContrast({ design, content: { hasTitle: true, hasDescription: false, destinationCount: 0, hasLogo: false } })
        .some((i) => i.id === "title-contrast"),
    ).toBe(false);
  });

  it("flags logo visibility when any extracted logo colour blends into the background", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#FFFFFF" };
    // Dominant colour separates fine, but a near-white logo colour disappears on white.
    const issues = analyzeScanMeContrast({
      design,
      logoPalette: ["#123A8A", "#F4F6FF"],
      content: { hasTitle: false, hasDescription: false, destinationCount: 0, hasLogo: true },
    });
    expect(issues.some((i) => i.id === "logo-background")).toBe(true);
  });
});

// Bug 1 + 2: every suggestion list is exactly three, in a fixed role order, all distinct,
// all actually clearing the floor — never silently collapsed to two/one, never a mislabelled
// first entry.
function isNearExtreme(color: string) {
  const hex = normalizeColorHex(color);
  return hex === "#000000" || hex === "#FFFFFF";
}

function expectThreeOrdered(
  suggestions: { color: string; label: string }[] | undefined,
) {
  expect(suggestions).toBeDefined();
  expect(suggestions).toHaveLength(3);
  expect(suggestions?.map((s) => s.label)).toEqual([...SUGGESTION_ORDER]);
  const colors = suggestions!.map((s) => normalizeColorHex(s.color));
  expect(new Set(colors).size).toBe(3);
  for (const color of colors) expect(isNearExtreme(color)).toBe(false);
}

describe("ScanMe contrast — exactly three guaranteed suggestions", () => {
  it("text suggestions: three ordered, distinct, each clearing 4.5:1 over the page", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#F7F1EA" };
    design.colors.page = "#F7F1EA";
    design.colors.title = "#E8E0D9"; // barely visible on the page

    const issue = analyzeScanMeContrast({
      design,
      generatedPalette: ["#F7F1EA", "#E5D8CE", "#C6FF4A", "#242623", "#315B52"],
    }).find((candidate) => candidate.id === "title-contrast");

    expectThreeOrdered(issue?.suggestions);
    const samples = backgroundContrastSamples(design);
    for (const suggestion of issue!.suggestions) {
      expect(minimumContrast(suggestion.color, samples)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("still returns three distinct passing text suggestions with no palette to draw from", () => {
    // Regression: when `nearest` was null the array could collapse below three and the first
    // entry lost its "Iz palete" label. It must still be three, in order, all passing.
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#7C7A72" }; // mid tone — hard case
    design.colors.page = "#7C7A72";
    design.colors.title = "#82807A";

    const issue = analyzeScanMeContrast({ design }).find(
      (candidate) => candidate.id === "title-contrast",
    );

    expectThreeOrdered(issue?.suggestions);
  });

  it("the first suggestion is drawn from the palette when one clears the floor", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#F7F1EA" };
    design.colors.page = "#F7F1EA";
    design.colors.title = "#E8E0D9";
    const palette = ["#F7F1EA", "#E5D8CE", "#C6FF4A", "#1C1E1B", "#315B52"];

    const issue = analyzeScanMeContrast({
      design,
      generatedPalette: palette,
    }).find((candidate) => candidate.id === "title-contrast");

    expect(issue?.suggestions[0].label).toBe("Iz palete");
    // The analyzer draws "Iz palete" from the merged palette (generated + logo + design
    // colours). The chosen colour must be a real member of that set and clear the floor.
    const mergedPalette = new Set(
      [...palette, ...Object.values(design.colors)].map((color) =>
        normalizeColorHex(color),
      ),
    );
    expect(mergedPalette.has(normalizeColorHex(issue!.suggestions[0].color))).toBe(true);
    expect(
      minimumContrast(issue!.suggestions[0].color, backgroundContrastSamples(design)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("button-text suggestions clear 4.5:1 against the button surface", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.colors.button = "#DED2C4";
    design.colors.buttonText = "#E7DED4"; // too close to the button

    const issue = analyzeScanMeContrast({
      design,
      content: { hasTitle: false, hasDescription: false, destinationCount: 2, hasLogo: false },
    }).find((candidate) => candidate.id === "button-text-contrast");

    expectThreeOrdered(issue?.suggestions);
    for (const suggestion of issue!.suggestions) {
      expect(contrastRatio(suggestion.color, design.colors.button)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("icon suggestions clear 3:1 against the surface the icon sits on", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.colors.surface = "#E8DFD4";
    design.colors.button = "#E8DFD4";
    design.colors.icon = "#E2D8CC"; // blends into the surface

    const issue = analyzeScanMeContrast({
      design,
      content: { hasTitle: false, hasDescription: false, destinationCount: 2, hasLogo: false },
    }).find((candidate) => candidate.id === "icon-contrast");

    expectThreeOrdered(issue?.suggestions);
    const backdrop =
      layoutForPreset(design.presetKey) === "inline-icon"
        ? design.colors.button
        : design.colors.surface;
    for (const suggestion of issue!.suggestions) {
      expect(contrastRatio(suggestion.color, backdrop)).toBeGreaterThanOrEqual(3);
    }
  });

  it("background/overlay suggestions use the SAME three labels and order (bug 2)", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = mediaBackground(0.05);

    const overlayIssue = analyzeScanMeContrast({
      design,
      media: { hasImage: true, hasVideo: false },
    }).find((candidate) => candidate.id === "media-overlay");

    expectThreeOrdered(overlayIssue?.suggestions);
    // The old labels are gone.
    const labels = overlayIssue!.suggestions.map((s) => s.label);
    expect(labels).not.toContain("Mirna svetla");
    expect(labels).not.toContain("Mirna tamna");
  });

  it("logo-background suggestions separate every logo colour and stay ordered", () => {
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#FFFFFF" };
    design.colors.page = "#FFFFFF";
    const logoColors = ["#123A8A", "#F4F6FF"];

    const issue = analyzeScanMeContrast({
      design,
      logoPalette: logoColors,
      content: { hasTitle: false, hasDescription: false, destinationCount: 0, hasLogo: true },
    }).find((candidate) => candidate.id === "logo-background");

    expectThreeOrdered(issue?.suggestions);
    // "Iz palete" background must clear every logo colour (>= 3:1), not just the dominant one.
    expect(minimumContrast(issue!.suggestions[0].color, logoColors)).toBeGreaterThanOrEqual(3);
  });

  it("still gives three DISTINCT background suggestions when no tone can clear every logo colour", () => {
    // A logo carrying both a very light and a very dark colour: no single background can
    // separate both at 3:1 (impossible context). The advisory must still degrade to three
    // distinct, best-effort tones — never two identical swatches.
    const design = createDefaultScanMeLinksDesignV2("gentle");
    design.background = { category: "flat", color: "#FEFBFE" };
    design.colors.page = "#FEFBFE";
    const logoColors = ["#1F60A7", "#6FA2E0", "#446C95"]; // dark + light + mid blue

    const issue = analyzeScanMeContrast({
      design,
      logoPalette: logoColors,
      content: { hasTitle: false, hasDescription: false, destinationCount: 0, hasLogo: true },
    }).find((candidate) => candidate.id === "logo-background");

    expect(issue).toBeDefined();
    expect(issue?.suggestions).toHaveLength(3);
    expect(issue?.suggestions.map((s) => s.label)).toEqual([...SUGGESTION_ORDER]);
    const colors = issue!.suggestions.map((s) => normalizeColorHex(s.color));
    expect(new Set(colors).size).toBe(3); // all distinct, even in the impossible case
  });

  it("samples the real ScanMe tones for every background category (point 14)", () => {
    const gradient = {
      ...createDefaultScanMeLinksDesignV2("gentle"),
      background: {
        category: "gradient",
        variant: "linear",
        startColor: "#0A1F44",
        endColor: "#101828",
        angle: 145,
        centerX: 50,
        centerY: 50,
      },
    } as const;
    const gradientSamples = backgroundContrastSamples(gradient);
    expect(gradientSamples).toContain(normalizeColorHex("#0A1F44"));
    expect(gradientSamples).toContain(normalizeColorHex("#101828"));

    const pattern = {
      ...createDefaultScanMeLinksDesignV2("gentle"),
      background: {
        category: "pattern",
        variant: "dots",
        backgroundColor: "#F7F1EA",
        patternColor: "#705C52",
        scale: 20,
        opacity: 0.3,
      },
    } as const;
    expect(backgroundContrastSamples(pattern)).toContain(normalizeColorHex("#F7F1EA"));

    // A displayed photo can't be sampled → the worst-case light/dark overlay frames (a pair).
    const media = {
      ...createDefaultScanMeLinksDesignV2("gentle"),
      background: mediaBackground(0.55),
    };
    expect(backgroundContrastSamples(media, { mediaPresent: true })).toHaveLength(2);
  });

  it("labels a poor issue red and an advisory as needs-check (point 15)", () => {
    // Red / poor: title invisible on the page.
    const poor = createDefaultScanMeLinksDesignV2("gentle");
    poor.background = { category: "flat", color: "#F7F1EA" };
    poor.colors.page = "#F7F1EA";
    poor.colors.title = "#F4EDE6";
    const poorIssue = analyzeScanMeContrast({ design: poor }).find(
      (i) => i.id === "title-contrast",
    );
    expect(poorIssue).toBeDefined();
    expect(contrastSeverityLabel(poorIssue!)).toBe("Loš kontrast");

    // Orange / advisory: a displayed photo the analyzer can't fully judge.
    const advisory = createDefaultScanMeLinksDesignV2("gentle");
    advisory.background = mediaBackground(0.05);
    const advisoryIssue = analyzeScanMeContrast({
      design: advisory,
      media: { hasImage: true, hasVideo: false },
    }).find((i) => i.id === "media-overlay");
    expect(advisoryIssue?.advisory).toBe(true);
    expect(contrastSeverityLabel(advisoryIssue!)).toBe("Preporuka");
  });
});
