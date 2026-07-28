import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAccentTokens,
  generateScanMeDesignFromPalette,
  normalizeExtractedPalette,
  selectAccentCandidates,
} from "../../lib/accent-palette";
import {
  validateSvgSourceSafety,
  withObjectUrl,
} from "../../lib/logo-palette.client";
import {
  designForPreset,
  scanMeContrastIssues,
  SCANME_PRESET_KEYS,
  wcagContrast,
} from "../../lib/scanme-design";

describe("ScanMe palette generation", () => {
  it("filters invalid and perceptually duplicate swatches", () => {
    const palette = normalizeExtractedPalette([
      "#7A5C43",
      "#7a5c43",
      "#7B5D44",
      "not-a-color",
      "#146C43",
    ]);

    expect(palette.map((color) => color.hex)).toEqual([
      "#7A5C43",
      "#146C43",
    ]);
  });

  it.each([
    ["vibrant", ["#FF4B2B", "#F6C945", "#14213D", "#F7F4ED"]],
    ["nearly white", ["#FFFFFF", "#FAFAFA", "#F4F4F4"]],
    ["nearly black", ["#000000", "#090909", "#151515"]],
    ["low saturation", ["#8B8B87", "#C4C3BE", "#484944"]],
    ["empty", []],
  ])("creates an accessible theme from a %s palette", (_name, colors) => {
    const result = generateScanMeDesignFromPalette(colors);

    expect(result.design.presetKey).toBe("custom");
    expect(scanMeContrastIssues(result.design)).toEqual([]);
    expect(result.paletteAnalysis.original.length).toBeGreaterThan(0);
    expect(result.paletteAnalysis.adjusted.length).toBeGreaterThan(0);
  });

  it("keeps every built-in preset WCAG-valid", () => {
    for (const presetKey of SCANME_PRESET_KEYS) {
      expect(scanMeContrastIssues(designForPreset(presetKey))).toEqual([]);
    }
  });

  it("returns three distinct, usable accent candidates", () => {
    const accents = selectAccentCandidates([
      "#A51D68",
      "#A61E69",
      "#E3C565",
      "#17324D",
    ]);

    expect(accents).toHaveLength(3);
    expect(new Set(accents).size).toBe(3);
  });

  it("repairs legacy accent tokens to readable text", () => {
    const tokens = createAccentTokens("#FFF400");

    expect(wcagContrast(tokens.onAccent, tokens.accent)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

describe("ScanMe logo safety helpers", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  afterEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
    vi.restoreAllMocks();
  });

  it("always releases temporary object URLs", async () => {
    const create = vi.fn(() => "blob:scanme-logo");
    const revoke = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: create,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revoke,
    });

    await expect(
      withObjectUrl({} as Blob, async () => {
        throw new Error("decode failed");
      }),
    ).rejects.toThrow("decode failed");
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith("blob:scanme-logo");
  });

  it("rejects executable and remotely-linked SVG sources", () => {
    expect(() =>
      validateSvgSourceSafety(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    ).toThrow();
    expect(() =>
      validateSvgSourceSafety(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.com/a.png"/></svg>',
      ),
    ).toThrow();
    expect(() =>
      validateSvgSourceSafety(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="/private/a.png"/></svg>',
      ),
    ).toThrow();
    expect(() =>
      validateSvgSourceSafety(
        '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="10" r="8"/></svg>',
      ),
    ).not.toThrow();
  });
});
