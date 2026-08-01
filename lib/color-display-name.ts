import { COOLORS_COLOR_NAMES } from "./coolors-color-name-data";

type LabColor = {
  l: number;
  a: number;
  b: number;
};

const MINIMUM_SIMILARITY = 0.7;

const COOLORS_COLOR_LABS = COOLORS_COLOR_NAMES.map(([hex, name]) => ({
  lab: hexToLab(`#${hex}`)!,
  name,
}));

export function colorDisplayName(value: string) {
  const target = hexToLab(value);
  if (!target) return "Custom Color";

  let closestName = "Custom Color";
  let closestSimilarity = MINIMUM_SIMILARITY;

  for (const candidate of COOLORS_COLOR_LABS) {
    const similarity = 1 - deltaE00(target, candidate.lab) / 100;
    if (similarity <= closestSimilarity) continue;

    closestName = candidate.name;
    closestSimilarity = similarity;
    if (similarity === 1) break;
  }

  return closestName;
}

function hexToLab(value: string): LabColor | null {
  const rgb = parseHex(value);
  if (!rgb) return null;

  const red = linearizeSrgb(rgb.r / 255);
  const green = linearizeSrgb(rgb.g / 255);
  const blue = linearizeSrgb(rgb.b / 255);

  const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047;
  const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
  const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883;

  const fx = labTransform(x);
  const fy = labTransform(y);
  const fz = labTransform(z);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function parseHex(value: string) {
  const raw = value.trim().replace(/^#/, "");
  const expanded =
    raw.length === 3
      ? raw
          .split("")
          .map((character) => character + character)
          .join("")
      : raw.length === 8
        ? raw.slice(0, 6)
        : raw;

  if (!/^[\da-f]{6}$/i.test(expanded)) return null;

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  };
}

function linearizeSrgb(channel: number) {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function labTransform(value: number) {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
}

function deltaE00(first: LabColor, second: LabColor) {
  const c1 = Math.hypot(first.a, first.b);
  const c2 = Math.hypot(second.a, second.b);
  const averageC = (c1 + c2) / 2;
  const averageC7 = averageC ** 7;
  const g = 0.5 * (1 - Math.sqrt(averageC7 / (averageC7 + 25 ** 7)));

  const a1Prime = (1 + g) * first.a;
  const a2Prime = (1 + g) * second.a;
  const c1Prime = Math.hypot(a1Prime, first.b);
  const c2Prime = Math.hypot(a2Prime, second.b);
  const h1Prime = hueDegrees(first.b, a1Prime);
  const h2Prime = hueDegrees(second.b, a2Prime);

  const deltaLPrime = second.l - first.l;
  const deltaCPrime = c2Prime - c1Prime;
  const deltaHuePrime = hueDifference(
    h1Prime,
    h2Prime,
    c1Prime * c2Prime,
  );
  const deltaHPrime =
    2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(toRadians(deltaHuePrime / 2));

  const averageLPrime = (first.l + second.l) / 2;
  const averageCPrime = (c1Prime + c2Prime) / 2;
  const averageHPrime = hueAverage(
    h1Prime,
    h2Prime,
    c1Prime * c2Prime,
  );

  const t =
    1 -
    0.17 * Math.cos(toRadians(averageHPrime - 30)) +
    0.24 * Math.cos(toRadians(2 * averageHPrime)) +
    0.32 * Math.cos(toRadians(3 * averageHPrime + 6)) -
    0.2 * Math.cos(toRadians(4 * averageHPrime - 63));
  const deltaTheta =
    30 * Math.exp(-(((averageHPrime - 275) / 25) ** 2));
  const averageCPrime7 = averageCPrime ** 7;
  const rC = 2 * Math.sqrt(averageCPrime7 / (averageCPrime7 + 25 ** 7));
  const sL =
    1 +
    (0.015 * (averageLPrime - 50) ** 2) /
      Math.sqrt(20 + (averageLPrime - 50) ** 2);
  const sC = 1 + 0.045 * averageCPrime;
  const sH = 1 + 0.015 * averageCPrime * t;
  const rT = -Math.sin(toRadians(2 * deltaTheta)) * rC;

  const lightness = deltaLPrime / sL;
  const chroma = deltaCPrime / sC;
  const hue = deltaHPrime / sH;

  return Math.sqrt(
    lightness ** 2 + chroma ** 2 + hue ** 2 + rT * chroma * hue,
  );
}

function hueDegrees(y: number, x: number) {
  const hue = (Math.atan2(y, x) * 180) / Math.PI;
  return hue >= 0 ? hue : hue + 360;
}

function hueDifference(first: number, second: number, chromaProduct: number) {
  if (chromaProduct === 0) return 0;
  const difference = second - first;
  if (Math.abs(difference) <= 180) return difference;
  return difference > 180 ? difference - 360 : difference + 360;
}

function hueAverage(first: number, second: number, chromaProduct: number) {
  if (chromaProduct === 0) return first + second;
  if (Math.abs(first - second) <= 180) return (first + second) / 2;
  return first + second < 360
    ? (first + second + 360) / 2
    : (first + second - 360) / 2;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
