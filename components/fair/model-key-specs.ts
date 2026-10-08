import { fairSpecificationIcon, type FairModelSpecificationIcon } from "./model-view";

// Model page v2 (public/prototip/stranica-modela-v2.html): the four key-spec
// tiles under the hero and the grouped full list. Pure: no fetch, no storage.
// The exhibitor's flagged highlights win; with none flagged the tiles are
// picked by priority, so the strip is never empty while a spec exists.

export type FairKeySpecSource = { id: string; label: string; value: string; isHighlight: boolean };

export type FairKeySpecKind = FairModelSpecificationIcon | "other";

export type FairKeySpec = {
  id: string;
  kind: FairKeySpecKind;
  /** Large figure ("330", "30,2"). */
  value: string;
  /** Small unit after the figure ("km", "kWh"); empty when the value has none. */
  unit: string;
  /** Qualifier from the label's parentheses ("CLTC"), shown under the short label. */
  qualifier: string;
  /** The exhibitor's own label, for kinds without an i18n short label. */
  label: string;
};

export const FAIR_KEY_SPECS_MAX = 4;

/** Priority when the exhibitor flagged nothing (owner brief, 2026-10-08). */
const PRIORITY: FairModelSpecificationIcon[] = ["range", "battery", "power", "charging", "speed", "acceleration"];

const fold = (value: string) =>
  value
    .toLocaleLowerCase("sr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

function kindOf(label: string): FairKeySpecKind {
  return fairSpecificationIcon(label) ?? "other";
}

/** "Domet (CLTC)" → "CLTC"; "DC punjenje 30-80%" → "30-80%". */
function qualifierOf(label: string, kind: FairKeySpecKind): string {
  const parenthesis = label.match(/\(([^)]+)\)/);
  if (parenthesis) return parenthesis[1].trim();
  if (kind === "charging" || kind === "acceleration") {
    const range = label.match(/\d+\s*[-–]\s*\d+\s*(%|km\/h)?/);
    if (range) return range[0].replace(/\s+/g, "");
  }
  return "";
}

/**
 * "330 km" → 330 / km; "Do 195 kW" → 195 / kW; "141 KS (104 kW)" → 141 / KS;
 * "70 kW / oko 1 h 12 min" → 70 / kW. Anything else stays whole, no unit.
 */
export function splitSpecValue(raw: string): { value: string; unit: string } {
  const head = raw.split(" / ")[0].replace(/\([^)]*\)/g, "").replace(/^do\s+/i, "").trim();
  const match = head.match(/^([<>~≈]?\s?\d[\d.,]*(?:\s?[-–]\s?\d[\d.,]*)?)\s*([^\d\s][^\d]{0,7})?$/u);
  if (!match) return { value: raw.trim(), unit: "" };
  return { value: match[1].replace(/\s+/g, ""), unit: (match[2] ?? "").trim() };
}

function toKeySpec(item: FairKeySpecSource): FairKeySpec {
  const kind = kindOf(item.label);
  const { value, unit } = splitSpecValue(item.value);
  return { id: item.id, kind, value, unit, qualifier: qualifierOf(item.label, kind), label: item.label };
}

export function fairModelKeySpecs(items: readonly FairKeySpecSource[]): FairKeySpec[] {
  const flagged = items.filter((item) => item.isHighlight);
  if (flagged.length > 0) return flagged.slice(0, FAIR_KEY_SPECS_MAX).map(toKeySpec);

  const picked: FairKeySpecSource[] = [];
  for (const kind of PRIORITY) {
    const candidates = items.filter((item) => !picked.includes(item) && kindOf(item.label) === kind);
    // DC charging is the one that matters on a fair floor; AC only as a last resort.
    const best =
      kind === "charging"
        ? candidates.find((item) => /\bdc\b/.test(fold(item.label))) ?? candidates.find((item) => !/\bac\b/.test(fold(item.label)))
        : candidates[0];
    if (best) picked.push(best);
    if (picked.length === FAIR_KEY_SPECS_MAX) break;
  }
  for (const item of items) {
    if (picked.length === FAIR_KEY_SPECS_MAX) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked.map(toKeySpec);
}

export type FairSpecGroup<T extends FairKeySpecSource> = { id: string; label: string; items: T[] };

const DRIVETRAIN: FairModelSpecificationIcon[] = ["power", "torque", "range", "battery", "charging"];
const DRIVETRAIN_WORDS = /pogon|motor|potrosnj|menjac|gorivo/;

/**
 * Server groups win. An import without groups arrives as ONE group; only then
 * is it split into "Pogon i baterija" and "Performanse i mere" (order kept).
 */
export function fairModelSpecGroups<T extends FairKeySpecSource>(
  groups: ReadonlyArray<FairSpecGroup<T>>,
  labels: { drivetrain: string; performance: string },
): FairSpecGroup<T>[] {
  if (groups.length !== 1) return [...groups];
  const [only] = groups;
  const drivetrain: T[] = [];
  const performance: T[] = [];
  for (const item of only.items) {
    const kind = fairSpecificationIcon(item.label);
    if ((kind && DRIVETRAIN.includes(kind)) || DRIVETRAIN_WORDS.test(fold(item.label))) drivetrain.push(item);
    else performance.push(item);
  }
  if (drivetrain.length === 0 || performance.length === 0) return [...groups];
  return [
    { id: `${only.id}-drivetrain`, label: labels.drivetrain, items: drivetrain },
    { id: `${only.id}-performance`, label: labels.performance, items: performance },
  ];
}
