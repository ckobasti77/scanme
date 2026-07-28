import {
  clampChroma,
  converter,
  formatHex,
  wcagContrast as culoriWcagContrast,
  type Color,
  type OklchColor,
} from "culori";
import type { AccentTokens } from "./scanme-links";
import {
  designForPreset,
  normalizeDesignHex,
  normalizeScanMeDesign,
  type PaletteAnalysis,
  type ScanMeDesignV1,
} from "./scanme-design";

const toOklch = converter("oklch");
const FALLBACK_BRAND = "#7A5C43";
const BLACK = "#11110F";
const WHITE = "#FFFFFF";

type PaletteColor = {
  hex: string;
  oklch: OklchColor;
};

export type GeneratedLogoTheme = {
  design: ScanMeDesignV1;
  paletteAnalysis: PaletteAnalysis;
};

function asHex(value: Color) {
  const formatted = formatHex(clampChroma(value, "oklch", "rgb"));
  if (!formatted) {
    throw new Error("Boju nije moguće prikazati u sRGB prostoru.");
  }
  return normalizeDesignHex(formatted);
}

function parsePaletteColor(value: string): PaletteColor | null {
  try {
    const hex = normalizeDesignHex(value);
    const oklch = toOklch(hex);
    return oklch ? { hex, oklch } : null;
  } catch {
    return null;
  }
}

function withOklch(
  source: OklchColor,
  values: Partial<Pick<OklchColor, "l" | "c" | "h">>,
) {
  return asHex({
    mode: "oklch",
    l: values.l ?? source.l,
    c: values.c ?? source.c,
    h: values.h ?? source.h ?? 0,
  });
}

function hueDistance(first: number | undefined, second: number | undefined) {
  const a = first ?? 0;
  const b = second ?? 0;
  const direct = Math.abs(a - b);
  return Math.min(direct, 360 - direct) / 180;
}

function perceptualDistance(first: PaletteColor, second: PaletteColor) {
  const averageChroma = (first.oklch.c + second.oklch.c) / 2;
  return Math.sqrt(
    (first.oklch.l - second.oklch.l) ** 2 +
      (first.oklch.c - second.oklch.c) ** 2 +
      (hueDistance(first.oklch.h, second.oklch.h) * averageChroma) ** 2,
  );
}

export function normalizeExtractedPalette(colors: string[], maximum = 10) {
  const parsed = colors
    .map(parsePaletteColor)
    .filter((color): color is PaletteColor => color !== null);
  const unique: PaletteColor[] = [];

  for (const color of parsed) {
    if (unique.some((candidate) => perceptualDistance(candidate, color) < 0.045)) {
      continue;
    }
    unique.push(color);
    if (unique.length === maximum) break;
  }

  return unique;
}

function chooseBrandColor(colors: PaletteColor[]) {
  const usable = colors.filter(
    ({ oklch }) =>
      oklch.l >= 0.14 &&
      oklch.l <= 0.9 &&
      oklch.c >= 0.035,
  );
  return (
    usable.sort((first, second) => {
      const firstScore =
        first.oklch.c * 2.4 - Math.abs(first.oklch.l - 0.58) * 0.45;
      const secondScore =
        second.oklch.c * 2.4 - Math.abs(second.oklch.l - 0.58) * 0.45;
      return secondScore - firstScore;
    })[0] ??
    colors.find(({ oklch }) => oklch.l > 0.08 && oklch.l < 0.94) ??
    parsePaletteColor(FALLBACK_BRAND)!
  );
}

function chooseAccentColor(colors: PaletteColor[], brand: PaletteColor) {
  return (
    colors
      .filter((color) => color.hex !== brand.hex && color.oklch.c >= 0.025)
      .sort(
        (first, second) =>
          perceptualDistance(second, brand) -
          perceptualDistance(first, brand),
      )[0] ?? brand
  );
}

function repairContrast(
  foreground: string,
  backgrounds: string[],
  minimum: number,
) {
  if (
    backgrounds.every(
      (background) => culoriWcagContrast(foreground, background) >= minimum,
    )
  ) {
    return foreground;
  }

  const source = toOklch(foreground);
  if (!source) return foreground;

  const candidates: Array<{ hex: string; distance: number }> = [];
  for (const targetLightness of [0, 1]) {
    for (let step = 1; step <= 100; step += 1) {
      const amount = step / 100;
      const hex = withOklch(source, {
        l: source.l + (targetLightness - source.l) * amount,
        c: Math.max(0, source.c * (1 - amount * 0.35)),
      });
      if (
        backgrounds.every(
          (background) => culoriWcagContrast(hex, background) >= minimum,
        )
      ) {
        candidates.push({ hex, distance: amount });
        break;
      }
    }
  }

  candidates.sort((first, second) => first.distance - second.distance);
  return candidates[0]?.hex ?? foreground;
}

function recordRepair(
  role: string,
  foreground: string,
  backgrounds: string[],
  minimum: number,
  correctedRoles: string[],
) {
  const repaired = repairContrast(foreground, backgrounds, minimum);
  if (repaired !== foreground) correctedRoles.push(role);
  return repaired;
}

export function generateScanMeDesignFromPalette(
  colors: string[],
): GeneratedLogoTheme {
  const original = colors
    .map(parsePaletteColor)
    .filter((color): color is PaletteColor => color !== null)
    .slice(0, 10)
    .map((color) => color.hex);
  const usable = normalizeExtractedPalette(colors);
  const brand = chooseBrandColor(usable);
  const accentSource = chooseAccentColor(usable, brand);
  const correctedRoles: string[] = [];

  const page = withOklch(brand.oklch, {
    l: 0.965,
    c: Math.min(0.025, brand.oklch.c * 0.16),
  });
  const surface = withOklch(brand.oklch, {
    l: 0.992,
    c: Math.min(0.012, brand.oklch.c * 0.08),
  });
  const lightButton = brand.oklch.l >= 0.62;
  const buttonColor = withOklch(brand.oklch, {
    l: lightButton ? 0.78 : 0.4,
    c: Math.min(0.18, Math.max(0.04, brand.oklch.c)),
  });
  const buttonOklch = toOklch(buttonColor) ?? brand.oklch;
  const buttonHover = withOklch(buttonOklch, {
    l: lightButton ? 0.7 : 0.32,
  });
  const titleCandidate = withOklch(brand.oklch, {
    l: 0.2,
    c: Math.min(0.045, brand.oklch.c * 0.35),
  });
  const bodyCandidate = withOklch(brand.oklch, {
    l: 0.34,
    c: Math.min(0.035, brand.oklch.c * 0.24),
  });
  const accent = withOklch(accentSource.oklch, {
    l: Math.min(0.66, Math.max(0.38, accentSource.oklch.l)),
    c: Math.min(0.22, Math.max(0.045, accentSource.oklch.c)),
  });
  const accentOklch = toOklch(accent) ?? accentSource.oklch;
  const borderCandidate = withOklch(accentOklch, {
    l: Math.min(0.56, accentOklch.l),
    c: Math.min(0.08, accentOklch.c),
  });
  const focusCandidate = withOklch(accentOklch, {
    l: Math.min(0.5, accentOklch.l),
    c: Math.min(0.16, Math.max(0.05, accentOklch.c)),
  });
  const buttonTextCandidate = lightButton ? BLACK : WHITE;

  const design = designForPreset("gentle");
  design.presetKey = "custom";
  design.background = { kind: "solid", color: page };
  design.colors = {
    page,
    surface,
    title: recordRepair(
      "title",
      titleCandidate,
      [page],
      4.5,
      correctedRoles,
    ),
    body: recordRepair(
      "body",
      bodyCandidate,
      [page],
      4.5,
      correctedRoles,
    ),
    accent,
    border: recordRepair(
      "border",
      borderCandidate,
      [page],
      3,
      correctedRoles,
    ),
    focus: recordRepair(
      "focus",
      focusCandidate,
      [page],
      3,
      correctedRoles,
    ),
    button: buttonColor,
    buttonHover,
    buttonText: recordRepair(
      "buttonText",
      buttonTextCandidate,
      [buttonColor, buttonHover],
      4.5,
      correctedRoles,
    ),
  };

  const normalized = normalizeScanMeDesign(design);
  const mergedCorrections = Array.from(
    new Set([...correctedRoles, ...normalized.corrections]),
  );
  const adjusted = Array.from(
    new Set([
      normalized.design.colors.accent,
      normalized.design.colors.button,
      normalized.design.colors.buttonHover,
      normalized.design.colors.title,
      normalized.design.colors.body,
      normalized.design.colors.page,
      normalized.design.colors.surface,
      normalized.design.colors.border,
    ]),
  ).slice(0, 10);

  return {
    design: normalized.design,
    paletteAnalysis: {
      original: original.length ? original : [FALLBACK_BRAND],
      adjusted,
      correctedRoles: mergedCorrections,
    },
  };
}

export function createAccentTokens(hex: string): AccentTokens {
  const accent = normalizeDesignHex(hex);
  const accentOklch = toOklch(accent);
  const soft = accentOklch
    ? withOklch(accentOklch, {
        l: 0.94,
        c: Math.min(0.035, accentOklch.c * 0.2),
      })
    : "#EFE7DF";
  const strong = accentOklch
    ? withOklch(accentOklch, {
        l: 0.34,
        c: Math.min(0.12, accentOklch.c),
      })
    : "#493628";
  return {
    accent,
    strong,
    soft,
    border: accentOklch
      ? repairContrast(
          withOklch(accentOklch, {
            l: Math.min(0.58, accentOklch.l),
            c: Math.min(0.08, accentOklch.c),
          }),
          [soft],
          3,
        )
      : "#CDBCAD",
    focus: accentOklch
      ? repairContrast(
          withOklch(accentOklch, {
            l: Math.min(0.5, accentOklch.l),
            c: Math.min(0.15, Math.max(0.04, accentOklch.c)),
          }),
          [soft],
          3,
        )
      : "#6C4D37",
    onAccent: repairContrast(
      culoriWcagContrast(BLACK, accent) >=
        culoriWcagContrast(WHITE, accent)
        ? BLACK
        : WHITE,
      [accent],
      4.5,
    ),
  };
}

export function selectAccentCandidates(colors: string[]) {
  const unique = normalizeExtractedPalette(colors);
  const brand = chooseBrandColor(unique);
  const ordered = [
    brand,
    ...unique
      .filter((color) => color.hex !== brand.hex)
      .sort(
        (first, second) =>
          perceptualDistance(second, brand) -
          perceptualDistance(first, brand),
      ),
  ]
    .slice(0, 3)
    .map((color) => createAccentTokens(color.hex).accent);

  while (ordered.length < 3) {
    const seed = toOklch(ordered[0] ?? FALLBACK_BRAND)!;
    const next = withOklch(seed, {
      l: ordered.length === 1 ? Math.max(0.18, seed.l - 0.16) : 0.88,
      c: Math.max(0.025, seed.c * 0.65),
    });
    if (!ordered.includes(next)) ordered.push(next);
    else break;
  }
  return ordered.slice(0, 3);
}

export async function extractAccentCandidates(
  file: File,
  options?: { signal?: AbortSignal },
) {
  const { extractLogoColors } = await import("./logo-palette.client");
  return selectAccentCandidates(await extractLogoColors(file, options));
}

export async function extractLogoTheme(
  file: File,
  options?: { signal?: AbortSignal },
) {
  const prepared = await prepareLogoTheme(file, options);
  return {
    design: prepared.design,
    paletteAnalysis: prepared.paletteAnalysis,
  };
}

export async function prepareLogoTheme(
  file: File,
  options?: { signal?: AbortSignal },
) {
  const { extractLogoColors, rasterizeSvgLogo } = await import(
    "./logo-palette.client"
  );
  const uploadFile = await rasterizeSvgLogo(file, options);
  const generated = generateScanMeDesignFromPalette(
    await extractLogoColors(uploadFile, options),
  );
  return { uploadFile, ...generated };
}
