import type { ScanMeLinksDesignV2 } from "./scanme-links-design";
import {
  compositeColors,
  contrastRatio,
  harmoniousContrastColor,
  minimumContrast,
  mixColors,
  normalizeColorHex,
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

export function mostCriticalPoorIssueId(issues: ContrastIssue[]) {
  return [...issues]
    .filter(
      (candidate) =>
        !candidate.advisory &&
        contrastQuality(candidate.ratio, candidate.required) === "poor",
    )
    .sort(
      (first, second) =>
        first.ratio / first.required - second.ratio / second.required,
    )[0]?.id;
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

function foregroundSuggestions(
  foreground: string,
  backgrounds: string[],
  minimum: number,
  role: PaletteTargetRole,
  palette: string[],
) {
  const nearest = nearestPaletteColor(
    foreground,
    palette,
    (color) => minimumContrast(color, backgrounds) >= minimum,
  );
  const harmonious = harmoniousContrastColor(foreground, backgrounds, minimum);
  const neutral = safeNeutralForBackgrounds(backgrounds);
  const candidates = uniqueColors(
    [nearest ?? harmonious, harmonious, neutral].map(softenSuggestionColor),
  );

  return candidates.slice(0, 3).map((color, index) => ({
    color,
    role,
    label:
      index === 0 && nearest
        ? "Iz palete"
        : index === candidates.length - 1
          ? "Sigurna neutralna"
          : "Najmanja izmena",
  }));
}

function backgroundSuggestions(
  foreground: string,
  role: PaletteTargetRole,
  palette: string[],
  media: boolean,
) {
  const candidates = uniqueColors(
    [
      ...palette.filter((color) => contrastRatio(foreground, color) >= 3),
      harmoniousContrastColor("#F7F1EA", foreground, 3),
      harmoniousContrastColor("#171918", foreground, 3),
    ].map(softenSuggestionColor),
  ).slice(0, 3);
  return candidates.map((color, index) => ({
    color,
    role,
    label: index === 0 ? "Iz palete" : index === 1 ? "Mirna svetla" : "Mirna tamna",
    ...(media ? { overlayOpacity: 0.78 } : {}),
  }));
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
        suggestions: backgroundSuggestions(
          design.colors.title,
          "background",
          palette,
          true,
        ),
      });
    }
  }

  // Logo visibility — advisory (logos often self-contrast or carry padding); judge only
  // the dominant logo color, not every color it contains.
  if (content.hasLogo && logoPalette.length) {
    const logoContrast = minimumContrast(logoPalette[0], backgrounds);
    if (logoContrast < CONTRAST_FLOORS.logo) {
      issues.push({
        id: "logo-background",
        zone: "logo",
        title: "Vidljivost logotipa",
        detail: "Logotip se možda ne odvaja dovoljno jasno od pozadine.",
        ratio: logoContrast,
        required: CONTRAST_FLOORS.logo,
        advisory: true,
        suggestions: backgroundSuggestions(
          logoPalette[0],
          "background",
          palette,
          mediaPresent,
        ),
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
    const iconIssue = issue(
      "icon-contrast",
      "button",
      "Ikonica na površini",
      design.colors.icon,
      [design.colors.surface],
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
