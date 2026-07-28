export const SCANME_DESIGN_VERSION = 1 as const;

export const SCANME_PRESET_KEYS = [
  "gentle",
  "lux",
  "ios",
  "frosty",
  "noir",
  "neon",
  "nature",
] as const;

export const SCANME_DESIGN_PRESET_KEYS = [
  ...SCANME_PRESET_KEYS,
  "custom",
] as const;

export const DESTINATION_PRESENTATIONS = ["button", "social"] as const;

export type ScanMePresetKey = (typeof SCANME_PRESET_KEYS)[number];
export type ScanMeDesignPresetKey = (typeof SCANME_DESIGN_PRESET_KEYS)[number];
export type DestinationPresentation =
  (typeof DESTINATION_PRESENTATIONS)[number];
export type ScanMeDesignState = "uninitialized" | "ready";

export type ScanMeBackground =
  | {
      kind: "solid";
      color: string;
    }
  | {
      kind: "gradient";
      from: string;
      to: string;
      angle: number;
      overlayColor: string;
      overlayOpacity: number;
    }
  | {
      kind: "pattern";
      pattern: "grid" | "dots" | "waves";
      backgroundColor: string;
      patternColor: string;
      opacity: number;
    }
  | {
      kind: "image";
      builtInAsset?: "nature";
      fit: "cover" | "contain";
      position: "center" | "top" | "bottom";
      overlayColor: string;
      overlayOpacity: number;
    };

export type ScanMeDesignColors = {
  page: string;
  surface: string;
  title: string;
  body: string;
  accent: string;
  border: string;
  focus: string;
  button: string;
  buttonHover: string;
  buttonText: string;
};

export type ScanMeButtonDesign = {
  variant: "solid" | "outline" | "glass";
  radius: number;
  borderWidth: number;
  shadow: "none" | "soft" | "elevated";
  paddingX: number;
  paddingY: number;
  animation: "none" | "lift" | "glow" | "liquid";
};

export type ScanMeTypographyDesign = {
  family: "mono" | "sans" | "serif";
  headingWeight: 400 | 500 | 600 | 700;
  bodyWeight: 400 | 500 | 600 | 700;
  alignment: "left" | "center" | "right";
  scale: "small" | "medium" | "large";
  lineHeight: number;
  verticalSpacing: number;
};

export type ScanMeDesignV1 = {
  version: typeof SCANME_DESIGN_VERSION;
  presetKey: ScanMeDesignPresetKey;
  autoContrast: boolean;
  background: ScanMeBackground;
  colors: ScanMeDesignColors;
  buttons: ScanMeButtonDesign;
  typography: ScanMeTypographyDesign;
};

export type PaletteAnalysis = {
  original: string[];
  adjusted: string[];
  correctedRoles: string[];
};

export type ScanMeContrastIssue = {
  role: "title" | "body" | "buttonText" | "focus" | "border";
  foreground: string;
  background: string;
  minimum: number;
  ratio: number;
};

export type NormalizedScanMeDesign = {
  design: ScanMeDesignV1;
  corrections: string[];
};

const RAW_PRESET_DESIGNS: Record<ScanMePresetKey, ScanMeDesignV1> = {
  gentle: {
    version: 1,
    presetKey: "gentle",
    autoContrast: true,
    background: { kind: "solid", color: "#F8F3EA" },
    colors: {
      page: "#F8F3EA",
      surface: "#FFFDFC",
      title: "#191815",
      body: "#514B44",
      accent: "#7A5C43",
      border: "#8B7563",
      focus: "#6C4D37",
      button: "#F8F3EA",
      buttonHover: "#EFE7DF",
      buttonText: "#2A211B",
    },
    buttons: {
      variant: "outline",
      radius: 14,
      borderWidth: 1,
      shadow: "none",
      paddingX: 20,
      paddingY: 16,
      animation: "lift",
    },
    typography: {
      family: "mono",
      headingWeight: 700,
      bodyWeight: 500,
      alignment: "center",
      scale: "medium",
      lineHeight: 1.5,
      verticalSpacing: 24,
    },
  },
  lux: {
    version: 1,
    presetKey: "lux",
    autoContrast: true,
    background: { kind: "solid", color: "#11100F" },
    colors: {
      page: "#11100F",
      surface: "#1B1917",
      title: "#F8E7BA",
      body: "#D8C69D",
      accent: "#C79A3B",
      border: "#A9853B",
      focus: "#F0C76B",
      button: "#C79A3B",
      buttonHover: "#DAB35B",
      buttonText: "#17120A",
    },
    buttons: {
      variant: "solid",
      radius: 12,
      borderWidth: 1,
      shadow: "soft",
      paddingX: 20,
      paddingY: 16,
      animation: "glow",
    },
    typography: {
      family: "serif",
      headingWeight: 700,
      bodyWeight: 500,
      alignment: "center",
      scale: "medium",
      lineHeight: 1.45,
      verticalSpacing: 24,
    },
  },
  ios: {
    version: 1,
    presetKey: "ios",
    autoContrast: true,
    background: {
      kind: "gradient",
      from: "#EDF7FF",
      to: "#D8EBFF",
      angle: 145,
      overlayColor: "#FFFFFF",
      overlayOpacity: 0,
    },
    colors: {
      page: "#E4F1FF",
      surface: "#FFFFFF",
      title: "#17212B",
      body: "#43576B",
      accent: "#0A67B5",
      border: "#3979AA",
      focus: "#075A9E",
      button: "#FFFFFF",
      buttonHover: "#EAF4FF",
      buttonText: "#164D78",
    },
    buttons: {
      variant: "glass",
      radius: 18,
      borderWidth: 1,
      shadow: "soft",
      paddingX: 20,
      paddingY: 16,
      animation: "lift",
    },
    typography: {
      family: "sans",
      headingWeight: 700,
      bodyWeight: 500,
      alignment: "center",
      scale: "medium",
      lineHeight: 1.45,
      verticalSpacing: 22,
    },
  },
  frosty: {
    version: 1,
    presetKey: "frosty",
    autoContrast: true,
    background: {
      kind: "gradient",
      from: "#E8F4F8",
      to: "#CDE2EA",
      angle: 160,
      overlayColor: "#FFFFFF",
      overlayOpacity: 0.08,
    },
    colors: {
      page: "#DCECF2",
      surface: "#F7FCFE",
      title: "#19323D",
      body: "#3A5966",
      accent: "#397D98",
      border: "#527B8A",
      focus: "#245D75",
      button: "#F4FBFD",
      buttonHover: "#D9EBF1",
      buttonText: "#183E4E",
    },
    buttons: {
      variant: "glass",
      radius: 18,
      borderWidth: 1,
      shadow: "soft",
      paddingX: 20,
      paddingY: 16,
      animation: "lift",
    },
    typography: {
      family: "sans",
      headingWeight: 600,
      bodyWeight: 500,
      alignment: "center",
      scale: "medium",
      lineHeight: 1.5,
      verticalSpacing: 24,
    },
  },
  noir: {
    version: 1,
    presetKey: "noir",
    autoContrast: true,
    background: { kind: "solid", color: "#080808" },
    colors: {
      page: "#080808",
      surface: "#151515",
      title: "#FAFAF7",
      body: "#C9C9C4",
      accent: "#F4F4EE",
      border: "#7C7C76",
      focus: "#FFFFFF",
      button: "#111111",
      buttonHover: "#242424",
      buttonText: "#FAFAF7",
    },
    buttons: {
      variant: "outline",
      radius: 8,
      borderWidth: 1,
      shadow: "none",
      paddingX: 20,
      paddingY: 16,
      animation: "lift",
    },
    typography: {
      family: "mono",
      headingWeight: 700,
      bodyWeight: 500,
      alignment: "center",
      scale: "medium",
      lineHeight: 1.45,
      verticalSpacing: 24,
    },
  },
  neon: {
    version: 1,
    presetKey: "neon",
    autoContrast: true,
    background: {
      kind: "gradient",
      from: "#09070A",
      to: "#160A14",
      angle: 145,
      overlayColor: "#000000",
      overlayOpacity: 0,
    },
    colors: {
      page: "#0E080D",
      surface: "#1B1019",
      title: "#FFF5FD",
      body: "#E6B9DA",
      accent: "#FF32C8",
      border: "#D931AA",
      focus: "#FF76D8",
      button: "#301028",
      buttonHover: "#501440",
      buttonText: "#FFF5FD",
    },
    buttons: {
      variant: "outline",
      radius: 12,
      borderWidth: 1,
      shadow: "elevated",
      paddingX: 20,
      paddingY: 16,
      animation: "glow",
    },
    typography: {
      family: "mono",
      headingWeight: 700,
      bodyWeight: 500,
      alignment: "center",
      scale: "medium",
      lineHeight: 1.45,
      verticalSpacing: 24,
    },
  },
  nature: {
    version: 1,
    presetKey: "nature",
    autoContrast: true,
    background: {
      kind: "image",
      builtInAsset: "nature",
      fit: "cover",
      position: "center",
      overlayColor: "#F7F4E9",
      overlayOpacity: 0.72,
    },
    colors: {
      page: "#EFF1E5",
      surface: "#FBFCF5",
      title: "#203125",
      body: "#48594B",
      accent: "#4D6E52",
      border: "#607663",
      focus: "#35563C",
      button: "#F8FAF2",
      buttonHover: "#E5ECD8",
      buttonText: "#29422E",
    },
    buttons: {
      variant: "glass",
      radius: 14,
      borderWidth: 1,
      shadow: "soft",
      paddingX: 20,
      paddingY: 16,
      animation: "lift",
    },
    typography: {
      family: "serif",
      headingWeight: 600,
      bodyWeight: 400,
      alignment: "center",
      scale: "medium",
      lineHeight: 1.5,
      verticalSpacing: 24,
    },
  },
};

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    throw new Error("Vrednost dizajna mora biti konačan broj.");
  }
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeDesignHex(value: string) {
  const normalized = value.trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(normalized)) {
    throw new Error("Boja mora biti HEX vrednost u formatu #RRGGBB.");
  }
  return normalized;
}

function hexChannels(value: string) {
  const color = normalizeDesignHex(value);
  return [
    Number.parseInt(color.slice(1, 3), 16),
    Number.parseInt(color.slice(3, 5), 16),
    Number.parseInt(color.slice(5, 7), 16),
  ] as const;
}

function channelLuminance(channel: number) {
  const value = channel / 255;
  return value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4;
}

export function wcagContrast(foreground: string, background: string) {
  const foregroundChannels = hexChannels(foreground);
  const backgroundChannels = hexChannels(background);
  const foregroundLuminance =
    0.2126 * channelLuminance(foregroundChannels[0]) +
    0.7152 * channelLuminance(foregroundChannels[1]) +
    0.0722 * channelLuminance(foregroundChannels[2]);
  const backgroundLuminance =
    0.2126 * channelLuminance(backgroundChannels[0]) +
    0.7152 * channelLuminance(backgroundChannels[1]) +
    0.0722 * channelLuminance(backgroundChannels[2]);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixHex(first: string, second: string, amount: number) {
  const a = hexChannels(first);
  const b = hexChannels(second);
  return `#${a
    .map((channel, index) =>
      Math.round(channel + (b[index] - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`.toUpperCase();
}

function accessibleVariant(
  foreground: string,
  backgrounds: string[],
  minimum: number,
) {
  const normalized = normalizeDesignHex(foreground);
  if (
    backgrounds.every(
      (background) => wcagContrast(normalized, background) >= minimum,
    )
  ) {
    return normalized;
  }
  const candidates: Array<{ color: string; step: number }> = [];
  for (const target of ["#000000", "#FFFFFF"]) {
    for (let step = 1; step <= 100; step += 1) {
      const color = mixHex(normalized, target, step / 100);
      if (
        backgrounds.every(
          (background) => wcagContrast(color, background) >= minimum,
        )
      ) {
        candidates.push({ color, step });
        break;
      }
    }
  }
  candidates.sort((a, b) => a.step - b.step);
  return candidates[0]?.color ?? normalized;
}

function normalizeBackground(background: ScanMeBackground): ScanMeBackground {
  switch (background.kind) {
    case "solid":
      return { kind: "solid", color: normalizeDesignHex(background.color) };
    case "gradient":
      return {
        kind: "gradient",
        from: normalizeDesignHex(background.from),
        to: normalizeDesignHex(background.to),
        angle: Math.round(clamp(background.angle, 0, 360)),
        overlayColor: normalizeDesignHex(background.overlayColor),
        overlayOpacity: clamp(background.overlayOpacity, 0, 0.9),
      };
    case "pattern":
      return {
        kind: "pattern",
        pattern: background.pattern,
        backgroundColor: normalizeDesignHex(background.backgroundColor),
        patternColor: normalizeDesignHex(background.patternColor),
        opacity: clamp(background.opacity, 0.02, 0.5),
      };
    case "image":
      return {
        kind: "image",
        ...(background.builtInAsset
          ? { builtInAsset: background.builtInAsset }
          : {}),
        fit: background.fit,
        position: background.position,
        overlayColor: normalizeDesignHex(background.overlayColor),
        overlayOpacity: clamp(background.overlayOpacity, 0, 0.9),
      };
  }
}

function contrastIssues(colors: ScanMeDesignColors): ScanMeContrastIssue[] {
  const checks: Array<{
    role: ScanMeContrastIssue["role"];
    foreground: string;
    backgrounds: string[];
    minimum: number;
  }> = [
    { role: "title", foreground: colors.title, backgrounds: [colors.page], minimum: 4.5 },
    { role: "body", foreground: colors.body, backgrounds: [colors.page], minimum: 4.5 },
    {
      role: "buttonText",
      foreground: colors.buttonText,
      backgrounds: [colors.button, colors.buttonHover],
      minimum: 4.5,
    },
    { role: "focus", foreground: colors.focus, backgrounds: [colors.page], minimum: 3 },
    { role: "border", foreground: colors.border, backgrounds: [colors.page], minimum: 3 },
  ];
  return checks.flatMap((check) =>
    check.backgrounds.flatMap((background) => {
      const ratio = wcagContrast(check.foreground, background);
      return ratio < check.minimum
        ? [
            {
              role: check.role,
              foreground: check.foreground,
              background,
              minimum: check.minimum,
              ratio,
            },
          ]
        : [];
    }),
  );
}

export function scanMeContrastIssues(design: ScanMeDesignV1) {
  return contrastIssues(design.colors);
}

export function normalizePaletteAnalysis(
  analysis: PaletteAnalysis | undefined,
): PaletteAnalysis | undefined {
  if (!analysis) return undefined;
  if (analysis.original.length > 10 || analysis.adjusted.length > 10) {
    throw new Error("Paleta može imati najviše deset boja.");
  }
  if (analysis.correctedRoles.length > 20) {
    throw new Error("Lista korekcija palete je predugačka.");
  }
  return {
    original: analysis.original.map(normalizeDesignHex),
    adjusted: analysis.adjusted.map(normalizeDesignHex),
    correctedRoles: analysis.correctedRoles.map((role) => {
      const normalized = role.trim();
      if (!normalized || normalized.length > 40) {
        throw new Error("Uloga korigovane boje nije ispravna.");
      }
      return normalized;
    }),
  };
}

export function normalizeScanMeDesign(
  value: ScanMeDesignV1,
): NormalizedScanMeDesign {
  if (value.version !== SCANME_DESIGN_VERSION) {
    throw new Error("Verzija ScanMe Links dizajna nije podržana.");
  }
  const colors: ScanMeDesignColors = {
    page: normalizeDesignHex(value.colors.page),
    surface: normalizeDesignHex(value.colors.surface),
    title: normalizeDesignHex(value.colors.title),
    body: normalizeDesignHex(value.colors.body),
    accent: normalizeDesignHex(value.colors.accent),
    border: normalizeDesignHex(value.colors.border),
    focus: normalizeDesignHex(value.colors.focus),
    button: normalizeDesignHex(value.colors.button),
    buttonHover: normalizeDesignHex(value.colors.buttonHover),
    buttonText: normalizeDesignHex(value.colors.buttonText),
  };
  const corrections: string[] = [];
  const correctedColors = { ...colors };
  const correctionChecks: Array<{
    role: keyof Pick<
      ScanMeDesignColors,
      "title" | "body" | "buttonText" | "focus" | "border"
    >;
    backgrounds: string[];
    minimum: number;
  }> = [
    { role: "title", backgrounds: [colors.page], minimum: 4.5 },
    { role: "body", backgrounds: [colors.page], minimum: 4.5 },
    {
      role: "buttonText",
      backgrounds: [colors.button, colors.buttonHover],
      minimum: 4.5,
    },
    { role: "focus", backgrounds: [colors.page], minimum: 3 },
    { role: "border", backgrounds: [colors.page], minimum: 3 },
  ];
  if (value.autoContrast && value.presetKey !== "custom") {
    for (const check of correctionChecks) {
      const corrected = accessibleVariant(
        correctedColors[check.role],
        check.backgrounds,
        check.minimum,
      );
      if (corrected !== correctedColors[check.role]) {
        correctedColors[check.role] = corrected;
        corrections.push(check.role);
      }
    }
  }

  const design: ScanMeDesignV1 = {
    version: SCANME_DESIGN_VERSION,
    presetKey: value.presetKey,
    autoContrast: value.autoContrast,
    background: normalizeBackground(value.background),
    colors: correctedColors,
    buttons: {
      variant: value.buttons.variant,
      radius: Math.round(clamp(value.buttons.radius, 0, 32)),
      borderWidth: Math.round(clamp(value.buttons.borderWidth, 0, 3)),
      shadow: value.buttons.shadow,
      paddingX: Math.round(clamp(value.buttons.paddingX, 16, 32)),
      paddingY: Math.round(clamp(value.buttons.paddingY, 12, 24)),
      animation: value.buttons.animation,
    },
    typography: {
      family: value.typography.family,
      headingWeight: value.typography.headingWeight,
      bodyWeight: value.typography.bodyWeight,
      alignment: value.typography.alignment,
      scale: value.typography.scale,
      lineHeight: clamp(value.typography.lineHeight, 1.1, 1.8),
      verticalSpacing: Math.round(
        clamp(value.typography.verticalSpacing, 12, 40),
      ),
    },
  };
  return { design, corrections };
}

export function designForPreset(presetKey: ScanMePresetKey) {
  return normalizeScanMeDesign(
    structuredClone(RAW_PRESET_DESIGNS[presetKey]),
  ).design;
}

export const PRESET_DESIGNS = Object.fromEntries(
  SCANME_PRESET_KEYS.map((presetKey) => [
    presetKey,
    designForPreset(presetKey),
  ]),
) as Record<ScanMePresetKey, ScanMeDesignV1>;

export const DEFAULT_SCANME_DESIGN = PRESET_DESIGNS.gentle;

export function normalizeScanMeDescription(value: string) {
  const normalized = value.trim();
  if (normalized.length > 160) {
    throw new Error("Opis može imati najviše 160 karaktera.");
  }
  return normalized;
}

export function legacyScanMeDesign(input: {
  accent: string;
  accentTokens: {
    strong: string;
    soft: string;
    border: string;
    focus: string;
    onAccent: string;
  };
}) {
  const base = structuredClone(DEFAULT_SCANME_DESIGN);
  base.presetKey = "custom";
  base.colors.accent = normalizeDesignHex(input.accent);
  base.colors.button = normalizeDesignHex(input.accent);
  base.colors.buttonHover = normalizeDesignHex(input.accentTokens.strong);
  base.colors.buttonText = normalizeDesignHex(input.accentTokens.onAccent);
  base.colors.border = normalizeDesignHex(input.accentTokens.border);
  base.colors.focus = normalizeDesignHex(input.accentTokens.focus);
  base.colors.surface = normalizeDesignHex(input.accentTokens.soft);
  return normalizeScanMeDesign(base).design;
}
