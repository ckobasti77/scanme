import { describe, expect, it } from "vitest";
import { compositeColors, contrastRatio } from "./scanme-color-science";
import {
  SCANME_LINKS_PRESET_CAPABILITIES,
  createDefaultScanMeLinksDesignV2,
  normalizeDesignForPreset,
  type ScanMeLinksPresetKey,
} from "./scanme-links-design";
import {
  SCANME_LINKS_VARIATIONS,
  applyVariation,
  findVariation,
} from "./scanme-links-variations";

const PRESETS_WITH_VARIATIONS = (
  Object.keys(SCANME_LINKS_VARIATIONS) as ScanMeLinksPresetKey[]
).filter((presetKey) => SCANME_LINKS_VARIATIONS[presetKey].length > 0);

/**
 * The title is display-sized in every one of these presets (`scale: "large"`),
 * so WCAG's 3:1 large-text threshold is the bar. Button labels render at body
 * size and take the 4.5:1 bar.
 */
const LARGE_TEXT_MIN = 3;
const BODY_TEXT_MIN = 4.5;

describe("ScanMe Links variations", () => {
  it("covers each editorial preset with four variations", () => {
    expect(PRESETS_WITH_VARIATIONS).toHaveLength(4);
    for (const presetKey of PRESETS_WITH_VARIATIONS) {
      expect(SCANME_LINKS_VARIATIONS[presetKey]).toHaveLength(4);
    }
  });

  it("uses globally unique, preset-prefixed keys", () => {
    const keys = PRESETS_WITH_VARIATIONS.flatMap((presetKey) =>
      SCANME_LINKS_VARIATIONS[presetKey].map((variation) => {
        expect(variation.key.startsWith(`${presetKey}-`)).toBe(true);
        return variation.key;
      }),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("only names backgrounds, fonts and button variants the preset allows", () => {
    for (const presetKey of PRESETS_WITH_VARIATIONS) {
      const capability = SCANME_LINKS_PRESET_CAPABILITIES[presetKey];
      for (const variation of SCANME_LINKS_VARIATIONS[presetKey]) {
        expect(capability.allowedBackgroundCategories).toContain(
          variation.background.category,
        );
        if (variation.typography?.fontKey) {
          expect(capability.fonts).toContain(variation.typography.fontKey);
        }
        if (variation.buttons?.variant) {
          expect(capability.allowedButtonVariants).toContain(
            variation.buttons.variant,
          );
        }
      }
    }
  });

  // normalizeDesignForPreset resets anything the preset disallows, so a
  // variation that survives it unchanged is one the editor will actually show.
  it("survives normalisation without being reset", () => {
    for (const presetKey of PRESETS_WITH_VARIATIONS) {
      for (const variation of SCANME_LINKS_VARIATIONS[presetKey]) {
        const applied = applyVariation(
          createDefaultScanMeLinksDesignV2(presetKey),
          variation,
        );
        const normalized = normalizeDesignForPreset(applied, presetKey);

        expect(normalized.variationKey).toBe(variation.key);
        expect(normalized.colors).toEqual(variation.colors);
        expect(normalized.background.category).toBe(
          variation.background.category,
        );
        expect(findVariation(presetKey, normalized.variationKey)).toBe(
          variation,
        );
      }
    }
  });

  it("drops a variation key that belongs to a different preset", () => {
    const design = createDefaultScanMeLinksDesignV2("urban-pop");
    const normalized = normalizeDesignForPreset(
      { ...design, variationKey: "artisan-craft-2" },
      "urban-pop",
    );
    expect(normalized.variationKey).toBeUndefined();
  });

  it("keeps readable text on every variation", () => {
    for (const presetKey of PRESETS_WITH_VARIATIONS) {
      for (const variation of SCANME_LINKS_VARIATIONS[presetKey]) {
        const { colors } = variation;
        const titleBackdrop =
          variation.background.category === "gradient"
            ? variation.background.startColor
            : colors.page;

        // Urban Pop paints a 3px stroke in `accent` behind the title fill (see
        // the [data-preset="urban-pop"] .title rule), so its titles have two
        // ways to stay legible: the fill separating from the page, or the
        // stroke outlining the glyphs against it. Whichever edge does the work
        // is the one worth measuring.
        const titleContrast =
          presetKey === "urban-pop"
            ? Math.max(
                contrastRatio(colors.title, titleBackdrop),
                Math.min(
                  contrastRatio(colors.accent, titleBackdrop),
                  contrastRatio(colors.title, colors.accent),
                ),
              )
            : contrastRatio(colors.title, titleBackdrop);

        expect(
          titleContrast,
          `${variation.key}: title on background`,
        ).toBeGreaterThanOrEqual(LARGE_TEXT_MIN);

        expect(
          contrastRatio(colors.body, titleBackdrop),
          `${variation.key}: description on background`,
        ).toBeGreaterThanOrEqual(LARGE_TEXT_MIN);

        // A glass button never paints `colors.button`: the .glass rule fills it
        // with `surface` at 66% over the page, so that composite is the surface
        // the label actually sits on.
        const buttonVariant =
          variation.buttons?.variant ??
          createDefaultScanMeLinksDesignV2(presetKey).buttons.variant;
        const buttonBackdrop =
          buttonVariant === "glass"
            ? compositeColors(colors.page, colors.surface, 0.66)
            : colors.button;

        expect(
          contrastRatio(colors.buttonText, buttonBackdrop),
          `${variation.key}: button label on ${buttonVariant} button`,
        ).toBeGreaterThanOrEqual(BODY_TEXT_MIN);
      }
    }
  });
});
