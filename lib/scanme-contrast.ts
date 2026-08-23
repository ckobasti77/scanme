import { layoutForPreset } from "./scanme-links-design";
import type { ScanMeLinksDesignV2 } from "./scanme-links-design";
import {
  clamp,
  colorToOklch,
  compositeColors,
  contrastRatio,
  harmoniousContrastColor,
  minimumContrast,
  mixColors,
  normalizeColorHex,
  oklchToHex,
  safeNeutralForBackgrounds,
  softenSuggestionColor,
} from "./scanme-color-science";
import {
  nearestPaletteColor,
  type PaletteTargetRole,
} from "./scanme-palette";

export type ContrastZone = "logo" | "title" | "body" | "button";

export type ContrastSuggestion = {
  color: string;
  label: string;
  role: PaletteTargetRole;
  overlayOpacity?: number;
};

export type ContrastIssue = {
  id: string;
  zone: ContrastZone;
  title: string;
  detail: string;
  ratio: number;
  required: number;
  suggestions: ContrastSuggestion[];
  // Advisory findings are informational (e.g. text over an unknown photo). They are
  // never rendered as a hard "poor" problem and never block publishing.
  advisory?: boolean;
};

export type ContrastQuality = "poor" | "good" | "excellent";

// What the page actually shows, threaded in from the editor so the analyzer never flags
// content that isn't there (e.g. an empty description) or a background that isn't visible.
export type ContrastContentInput = {
  hasTitle: boolean;
  hasDescription: boolean;
  destinationCount: number;
  hasLogo: boolean;
};

export type ContrastMediaInput = {
  hasImage: boolean;
  hasVideo: boolean;
};

export type AnalyzeScanMeContrastInput = {
  design: ScanMeLinksDesignV2;
  generatedPalette?: string[];
  logoPalette?: string[];
  content?: Partial<ContrastContentInput>;
  media?: Partial<ContrastMediaInput>;
};

// WCAG floors: text at AA-normal (4.5), non-text separation at AA-large / graphics (3).
// These are floors to clear, not targets to maximize — suggestions prefer the closest
// harmonious color that clears the floor rather than the highest possible ratio.
const CONTRAST_FLOORS = {
  title: 4.5,
  body: 4.5,
  buttonText: 4.5,
  icon: 3,
  buttonBg: 3,
  logo: 3,
} as const;
const MEDIA_OVERLAY_FLOOR = 4.5;

export function contrastQuality(
  ratio: number,
  required: number,
): ContrastQuality {
  if (ratio < required * 0.62) return "poor";
  if (ratio < required * 1.5) return "good";
  return "excellent";
}

export function contrastQualityLabel(ratio: number, required: number) {
  const quality = contrastQuality(ratio, required);
  if (quality === "poor") return "Loš kontrast";
  if (quality === "good") return "Dobar kontrast";
  return "Odličan kontrast";
}

// Severity for the UI: advisory findings sit outside the poor/good/excellent scale.
export function contrastSeverity(
  issue: ContrastIssue,
): "advisory" | ContrastQuality {
  return issue.advisory
    ? "advisory"
    : contrastQuality(issue.ratio, issue.required);
}

export function contrastSeverityLabel(issue: ContrastIssue) {
  if (issue.advisory) return "Preporuka";
  return contrastQualityLabel(issue.ratio, issue.required);
}

function uniqueColors(colors: string[]) {
  return Array.from(new Set(colors.map((color) => normalizeColorHex(color))));
}

type BackgroundContext = {
  // The effective, visible background color(s) behind the identity/text.
  samples: string[];
  // "unknown" only when a real photo/video is displayed — its pixels can't be sampled.
  certainty: "known" | "unknown";
  // Worst-case light/dark frames for a displayed photo/video (overlay over black/white).
  mediaWorst?: [string, string];
};

// Resolve what is actually painted behind the content. Crucially, a "media" background
// with NO uploaded media renders exactly as the overlay composited over the page color —
// i.e. a plain solid — so it must produce the same (usually zero) warnings as before the
// media category was selected. Only a genuinely displayed photo/video is "unknown".
function resolveBackgroundContext(
  design: ScanMeLinksDesignV2,
  options: { mediaPresent: boolean },
): BackgroundContext {
  const background = design.background;
  switch (background.category) {
    case "flat":
      return { samples: [background.color], certainty: "known" };
    case "gradient":
      return {
        samples: uniqueColors([
          background.startColor,
          background.endColor,
          mixColors(background.startColor, background.endColor, 0.5),
        ]),
        certainty: "known",
      };
    case "pattern":
      return {
        samples: uniqueColors([
          background.backgroundColor,
          compositeColors(
            background.backgroundColor,
            background.patternColor,
            background.opacity,
          ),
        ]),
        certainty: "known",
      };
    case "texture":
      return {
        samples: uniqueColors([
          background.backgroundColor,
          compositeColors(
            background.backgroundColor,
            background.tintColor,
            background.intensity * 0.55,
          ),
        ]),
        certainty: "known",
      };
    case "animation":
      return {
        samples: uniqueColors([
          background.baseColor,
          mixColors(
            background.baseColor,
            background.accentColor,
            background.intensity * 0.65,
          ),
          background.accentColor,
        ]),
        certainty: "known",
      };
    case "media": {
      const effective = compositeColors(
        design.colors.page,
        background.overlayColor,
        background.overlayOpacity,
      );
      if (!options.mediaPresent) {
        // No upload yet → the overlay-over-page solid is exactly what shows.
        return { samples: [effective], certainty: "known" };
      }
      return {
        samples: [effective],
        certainty: "unknown",
        mediaWorst: [
          compositeColors(
            "#000000",
            background.overlayColor,
            background.overlayOpacity,
          ),
          compositeColors(
            "#FFFFFF",
            background.overlayColor,
            background.overlayOpacity,
          ),
        ],
      };
    }
  }
}

// Kept for the status-bar / "powered by" callers. Returns the worst-case frame pair only
// when a real photo/video is displayed (mediaPresent), otherwise the single visible tone.
export function backgroundContrastSamples(
  design: ScanMeLinksDesignV2,
  options: { mediaPresent?: boolean } = {},
) {
  const context = resolveBackgroundContext(design, {
    mediaPresent: options.mediaPresent ?? false,
  });
  return context.mediaWorst ?? context.samples;
}

// The one contract every suggestion list obeys: exactly three, always in this order, each
// tied to its own strategy. Foreground and background lists share the same three roles.
const SUGGESTION_LABELS = [
  "Iz palete",
  "Najmanja izmena",
  "Sigurna neutralna",
] as const;

// Find a softened, non-extreme tone near `seed` that clears `minimum` against `others` and
// isn't already `taken`. Keeps the seed's hue/chroma and walks its lightness outward, so a
// role's fallback still reads as a deliberate colour rather than a jump to black/white.
function distinctPassingTone(
  seed: string,
  others: string[],
  minimum: number,
  taken: string[],
) {
  const clears = (color: string) => minimumContrast(color, others) >= minimum;
  const start = softenSuggestionColor(seed);
  if (clears(start) && !taken.includes(start)) return start;
  const source = colorToOklch(start);
  // Track the most-separated UNTAKEN tone seen, so that even when no tone can clear the floor
  // (a genuinely impossible context — e.g. a logo with both a very light and very dark colour,
  // where no single background separates both), the three suggestions still stay DISTINCT and
  // as legible as possible rather than collapsing to a duplicate.
  let best: string | null = null;
  let bestScore = -1;
  const consider = (color: string) => {
    if (taken.includes(color)) return false;
    const score = minimumContrast(color, others);
    if (score > bestScore) {
      bestScore = score;
      best = color;
    }
    return score >= minimum;
  };
  consider(start);
  for (let delta = 0.03; delta <= 0.72; delta += 0.03) {
    for (const direction of [1, -1]) {
      const candidate = softenSuggestionColor(
        oklchToHex({
          mode: "oklch",
          l: clamp(source.l + direction * delta, 0.16, 0.9),
          c: source.c,
          h: source.h ?? 0,
        }),
      );
      if (consider(candidate)) return candidate;
    }
  }
  // No untaken tone clears the floor: return the most-separated distinct tone we found.
  return best ?? start;
}

// Turn three ordered strategy seeds into three guaranteed-distinct, guaranteed-passing
// suggestions with the canonical labels. Each later role falls back off its own seed rather
// than borrowing an earlier role's colour, so all three stay meaningfully different.
function threeSuggestions(
  seeds: [string, string, string],
  others: string[],
  minimum: number,
  role: PaletteTargetRole,
): ContrastSuggestion[] {
  const taken: string[] = [];
  return seeds.map((seed, index) => {
    const color = distinctPassingTone(seed, others, minimum, taken);
    taken.push(color);
    return { color, role, label: SUGGESTION_LABELS[index] };
  });
}

function foregroundSuggestions(
  foreground: string,
  backgrounds: string[],
  minimum: number,
  role: PaletteTargetRole,
  palette: string[],
) {
  // 1. "Iz palete" — the closest palette colour that already clears the floor. When none
  //    does, push the nearest palette hue until it clears, so the slot stays palette-rooted.
  const fromPalette =
    nearestPaletteColor(
      foreground,
      palette,
      (color) => minimumContrast(color, backgrounds) >= minimum,
    ) ??
    harmoniousContrastColor(
      nearestPaletteColor(foreground, palette, () => true) ?? foreground,
      backgrounds,
      minimum,
    );
  // 2. "Najmanja izmena" — keep the current colour's hue/chroma, move lightness only enough
  //    to clear the floor: the smallest visible change to what the user already chose.
  const smallestChange = harmoniousContrastColor(foreground, backgrounds, minimum);
  // 3. "Sigurna neutralna" — the brand off-black/off-white that separates best.
  const safeNeutral = safeNeutralForBackgrounds(backgrounds);
  return threeSuggestions(
    [fromPalette, smallestChange, safeNeutral],
    backgrounds,
    minimum,
    role,
  );
}

// Walk a near-neutral seed toward `pole` lightness, keeping its hue, until it separates
// every foreground by `minimum`. Returns a softened, non-extreme background tone.
function backgroundTone(
  seed: string,
  foregrounds: string[],
  minimum: number,
  pole: number,
) {
  const source = colorToOklch(seed);
  for (let step = 0; step <= 40; step += 1) {
    const l = clamp(source.l + (pole - source.l) * (step / 40), 0.08, 0.97);
    const candidate = softenSuggestionColor(
      oklchToHex({ mode: "oklch", l, c: source.c, h: source.h ?? 0 }),
    );
    if (minimumContrast(candidate, foregrounds) >= minimum) return candidate;
  }
  return softenSuggestionColor(
    oklchToHex({
      mode: "oklch",
      l: clamp(pole, 0.08, 0.97),
      c: source.c,
      h: source.h ?? 0,
    }),
  );
}

// Background suggestions separate EVERY foreground given (e.g. all of a multi-colour logo's
// colours), not just the dominant one — and use the SAME three roles/labels as foreground.
// For a background the "smallest change" is the gentler of the two safe poles; the pole that
// separates every foreground best becomes the "safe neutral".
function backgroundSuggestions(
  foregrounds: string[],
  role: PaletteTargetRole,
  palette: string[],
) {
  const minimum = 3;
  const light = backgroundTone("#F7F1EA", foregrounds, minimum, 0.965);
  const dark = backgroundTone("#171918", foregrounds, minimum, 0.12);
  const fromPalette =
    nearestPaletteColor(
      foregrounds[0],
      palette,
      (color) => minimumContrast(color, foregrounds) >= minimum,
    ) ?? light;
  const [safeNeutral, smallestChange] =
    minimumContrast(dark, foregrounds) >= minimumContrast(light, foregrounds)
      ? [dark, light]
      : [light, dark];
  return threeSuggestions(
    [fromPalette, smallestChange, safeNeutral],
    foregrounds,
    minimum,
    role,
  );
}

// Smallest overlay opacity that lifts `foreground` to `minimum` contrast over the worst
// media frames — dims the photo only as much as legibility actually needs (no fixed value).
function minOverlayOpacity(
  foreground: string,
  overlayColor: string,
  frames: string[],
  minimum: number,
  range: { min: number; max: number } = { min: 0.4, max: 0.9 },
) {
  for (let opacity = range.min; opacity < range.max; opacity += 0.05) {
    const worst = Math.min(
      ...frames.map((frame) =>
        contrastRatio(foreground, compositeColors(frame, overlayColor, opacity)),
      ),
    );
    if (worst >= minimum) return Math.round(opacity * 100) / 100;
  }
  return range.max;
}

function issue(
  id: string,
  zone: ContrastZone,
  title: string,
  foreground: string,
  backgrounds: string[],
  required: number,
  role: PaletteTargetRole,
  palette: string[],
  detail: string,
): ContrastIssue | null {
  const ratio = minimumContrast(foreground, backgrounds);
  if (ratio >= required) return null;
  return {
    id,
    zone,
    title,
    detail,
    ratio,
    required,
    suggestions: foregroundSuggestions(
      foreground,
      backgrounds,
      required,
      role,
      palette,
    ),
  };
}

export function analyzeScanMeContrast(
  input: AnalyzeScanMeContrastInput,
): ContrastIssue[] {
  const { design } = input;
  const generatedPalette = input.generatedPalette ?? [];
  const logoPalette = input.logoPalette ?? [];
  // Missing content defaults to permissive so simple callers keep working.
  const content: ContrastContentInput = {
    hasTitle: input.content?.hasTitle ?? true,
    hasDescription: input.content?.hasDescription ?? true,
    destinationCount: input.content?.destinationCount ?? 1,
    hasLogo: input.content?.hasLogo ?? false,
  };
  const media: ContrastMediaInput = {
    hasImage: input.media?.hasImage ?? false,
    hasVideo: input.media?.hasVideo ?? false,
  };

  const background = design.background;
  const mediaPresent =
    background.category === "media" &&
    (background.mediaType === "video" ? media.hasVideo : media.hasImage);
  const context = resolveBackgroundContext(design, { mediaPresent });
  const backgrounds = context.samples;
  const pageBackgroundKnown = context.certainty === "known";

  const palette = uniqueColors([
    ...generatedPalette,
    ...logoPalette,
    ...Object.values(design.colors),
  ]);
  const issues: ContrastIssue[] = [];

  // A displayed photo/video has unknown pixels — fold title/description legibility into a
  // single advisory keyed off the overlay's worst-case frames instead of hard-failing.
  if (
    mediaPresent &&
    context.mediaWorst &&
    (content.hasTitle || content.hasDescription)
  ) {
    const zoneColors = [
      ...(content.hasTitle ? [design.colors.title] : []),
      ...(content.hasDescription ? [design.colors.body] : []),
    ];
    const ratio = Math.min(
      ...zoneColors.map((color) => minimumContrast(color, context.mediaWorst!)),
    );
    if (ratio < MEDIA_OVERLAY_FLOOR) {
      issues.push({
        id: "media-overlay",
        zone: "title",
        title: "Pozadina iza identiteta",
        detail:
          "Preko slike ili videa tekst može da varira kroz svetle i tamne delove. Pojačajte prekrivač (overlay) za sigurniju čitljivost.",
        ratio,
        required: MEDIA_OVERLAY_FLOOR,
        advisory: true,
        // Each overlay suggestion carries the *minimum* opacity that makes the title legible
        // over the worst media frames, so the photo stays as visible as possible.
        suggestions: backgroundSuggestions(
          [design.colors.title],
          "background",
          palette,
        ).map((suggestion) => ({
          ...suggestion,
          overlayOpacity: minOverlayOpacity(
            design.colors.title,
            suggestion.color,
            context.mediaWorst!,
            MEDIA_OVERLAY_FLOOR,
          ),
        })),
      });
    }
  }

  // Logo visibility — advisory (logos often self-contrast or carry padding). Judge every
  // extracted logo colour against the background, and flag when the weakest one blends in.
  if (content.hasLogo && logoPalette.length) {
    const logoColors = uniqueColors(logoPalette);
    const logoContrast = Math.min(
      ...logoColors.map((color) => minimumContrast(color, backgrounds)),
    );
    if (logoContrast < CONTRAST_FLOORS.logo) {
      const suggestions = backgroundSuggestions(logoColors, "background", palette);
      issues.push({
        id: "logo-background",
        zone: "logo",
        title: "Vidljivost logotipa",
        detail: "Logotip se možda ne odvaja dovoljno jasno od pozadine.",
        ratio: logoContrast,
        required: CONTRAST_FLOORS.logo,
        advisory: true,
        suggestions:
          mediaPresent && context.mediaWorst
            ? suggestions.map((suggestion) => ({
                ...suggestion,
                overlayOpacity: minOverlayOpacity(
                  logoColors[0],
                  suggestion.color,
                  context.mediaWorst!,
                  CONTRAST_FLOORS.logo,
                ),
              }))
            : suggestions,
      });
    }
  }

  // Title & description vs the page background — only when the background is known and the
  // text actually exists.
  if (pageBackgroundKnown && content.hasTitle) {
    const titleIssue = issue(
      "title-contrast",
      "title",
      "Kontrast naslova",
      design.colors.title,
      backgrounds,
      CONTRAST_FLOORS.title,
      "title",
      palette,
      "Naslov se previše stapa sa pozadinom.",
    );
    if (titleIssue) issues.push(titleIssue);
  }
  if (pageBackgroundKnown && content.hasDescription) {
    const bodyIssue = issue(
      "body-contrast",
      "body",
      "Kontrast opisa",
      design.colors.body,
      backgrounds,
      CONTRAST_FLOORS.body,
      "body",
      palette,
      "Opis se ne odvaja dovoljno jasno od pozadine.",
    );
    if (bodyIssue) issues.push(bodyIssue);
  }

  // Button text & icon are judged against the button/surface itself, so they hold
  // regardless of the page background — but only when there are buttons to judge.
  if (content.destinationCount > 0) {
    const buttonTextIssue = issue(
      "button-text-contrast",
      "button",
      "Tekst na dugmetu",
      design.colors.buttonText,
      [design.colors.button],
      CONTRAST_FLOORS.buttonText,
      "buttonText",
      palette,
      "Tekst na dugmetu nije dovoljno lak za čitanje.",
    );
    if (buttonTextIssue) issues.push(buttonTextIssue);
    // Which surface the icon is read against depends on the layout: the
    // float-icon presets seat it in a `surface`-filled circle, while the
    // inline-icon presets keep a transparent tile directly on the button.
    const iconBackdrop =
      layoutForPreset(design.presetKey) === "inline-icon"
        ? design.colors.button
        : design.colors.surface;
    const iconIssue = issue(
      "icon-contrast",
      "button",
      "Ikonica na površini",
      design.colors.icon,
      [iconBackdrop],
      CONTRAST_FLOORS.icon,
      "icon",
      palette,
      "Ikonica se previše stapa sa površinom dugmeta.",
    );
    if (iconIssue) issues.push(iconIssue);

    // Button vs page background — skip when the button is structurally separated by an
    // outline/glass variant or a drop shadow, which a flat color ratio can't see.
    const structurallySeparated =
      design.buttons.variant !== "solid" || design.buttons.shadow.enabled;
    if (!structurallySeparated) {
      const buttonRatio = minimumContrast(design.colors.button, backgrounds);
      if (buttonRatio < CONTRAST_FLOORS.buttonBg) {
        issues.push({
          id: "button-background-contrast",
          zone: "button",
          title: "Dugme prema pozadini",
          detail: "Dugme se ne odvaja dovoljno jasno od pozadine.",
          ratio: buttonRatio,
          required: CONTRAST_FLOORS.buttonBg,
          ...(mediaPresent ? { advisory: true } : {}),
          suggestions: foregroundSuggestions(
            design.colors.button,
            backgrounds,
            CONTRAST_FLOORS.buttonBg,
            "button",
            palette,
          ),
        });
      }
    }
  }

  return issues;
}
