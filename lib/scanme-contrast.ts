import type { ScanMeLinksDesignV2 } from "./scanme-links-design";
import {
  compositeColors,
  contrastRatio,
  ensureContrast,
  minimumContrast,
  mixColors,
  normalizeColorHex,
  safeNeutralForBackgrounds,
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
};

export type ContrastQuality = "poor" | "good" | "excellent";

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

export function mostCriticalPoorIssueId(issues: ContrastIssue[]) {
  return [...issues]
    .filter((candidate) =>
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

export function backgroundContrastSamples(design: ScanMeLinksDesignV2) {
  const background = design.background;
  switch (background.category) {
    case "flat":
      return [background.color];
    case "gradient":
      return uniqueColors([
        background.startColor,
        background.endColor,
        mixColors(background.startColor, background.endColor, 0.5),
      ]);
    case "pattern":
      return uniqueColors([
        background.backgroundColor,
        compositeColors(
          background.backgroundColor,
          background.patternColor,
          background.opacity,
        ),
      ]);
    case "texture":
      return uniqueColors([
        background.backgroundColor,
        compositeColors(
          background.backgroundColor,
          background.tintColor,
          background.intensity * 0.55,
        ),
      ]);
    case "animation":
      return uniqueColors([
        background.baseColor,
        mixColors(
          background.baseColor,
          background.accentColor,
          background.intensity * 0.65,
        ),
        background.accentColor,
      ]);
    case "media":
      return uniqueColors([
        compositeColors("#000000", background.overlayColor, background.overlayOpacity),
        compositeColors("#FFFFFF", background.overlayColor, background.overlayOpacity),
      ]);
  }
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
  const adjusted = ensureContrast(foreground, backgrounds, minimum);
  const neutral = safeNeutralForBackgrounds(backgrounds);
  const candidates = uniqueColors([nearest ?? adjusted, adjusted, neutral]);

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
  const candidates = uniqueColors([
    ...palette.filter((color) => contrastRatio(foreground, color) >= 3),
    ensureContrast("#F7F1EA", foreground, 3),
    ensureContrast("#171918", foreground, 3),
  ]).slice(0, 3);
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
  design: ScanMeLinksDesignV2,
  generatedPalette: string[] = [],
  logoPalette: string[] = [],
) {
  const backgrounds = backgroundContrastSamples(design);
  const palette = uniqueColors([
    ...generatedPalette,
    ...logoPalette,
    ...Object.values(design.colors),
  ]);
  const issues: ContrastIssue[] = [];
  const media = design.background.category === "media";

  if (media) {
    const identityRatio = Math.min(
      minimumContrast(design.colors.title, backgrounds),
      minimumContrast(design.colors.body, backgrounds),
    );
    if (identityRatio < 4.5) {
      issues.push({
        id: "media-overlay",
        zone: "title",
        title: "Pozadina iza identiteta",
        detail: "Medij nema dovoljno stabilan kontrast kroz svetle i tamne kadrove.",
        ratio: identityRatio,
        required: 4.5,
        suggestions: backgroundSuggestions(
          design.colors.title,
          "background",
          palette,
          true,
        ),
      });
    }
  }

  if (logoPalette.length) {
    const logoContrast = Math.min(
      ...logoPalette.map((color) => minimumContrast(color, backgrounds)),
    );
    if (logoContrast < 3) {
      issues.push({
        id: "logo-background",
        zone: "logo",
        title: "Vidljivost logotipa",
        detail: "Logotip se ne odvaja dovoljno jasno od pozadine.",
        ratio: logoContrast,
        required: 3,
        suggestions: backgroundSuggestions(
          logoPalette[0],
          "background",
          palette,
          media,
        ),
      });
    }
  }

  const titleIssue = issue(
    "title-contrast",
    "title",
    "Kontrast naslova",
    design.colors.title,
    backgrounds,
    4.5,
    "title",
    palette,
    "Naslov se previše stapa sa pozadinom.",
  );
  const bodyIssue = issue(
    "body-contrast",
    "body",
    "Kontrast opisa",
    design.colors.body,
    backgrounds,
    4.5,
    "body",
    palette,
    "Opis se ne odvaja dovoljno jasno od pozadine.",
  );
  const buttonTextIssue = issue(
    "button-text-contrast",
    "button",
    "Tekst na dugmetu",
    design.colors.buttonText,
    [design.colors.button],
    4.5,
    "buttonText",
    palette,
    "Tekst na dugmetu nije dovoljno lak za čitanje.",
  );
  const iconIssue = issue(
    "icon-contrast",
    "button",
    "Ikonica na površini",
    design.colors.icon,
    [design.colors.surface],
    3,
    "icon",
    palette,
    "Ikonica se previše stapa sa površinom dugmeta.",
  );
  const buttonRatio = minimumContrast(design.colors.button, backgrounds);
  if (buttonRatio < 3) {
    issues.push({
      id: "button-background-contrast",
      zone: "button",
      title: "Dugme prema pozadini",
      detail: "Dugme se ne odvaja dovoljno jasno od pozadine.",
      ratio: buttonRatio,
      required: 3,
      suggestions: foregroundSuggestions(
        design.colors.button,
        backgrounds,
        3,
        "button",
        palette,
      ),
    });
  }

  for (const candidate of [titleIssue, bodyIssue, buttonTextIssue, iconIssue]) {
    if (candidate) issues.push(candidate);
  }
  return issues;
}
