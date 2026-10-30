import { fairSpecificationIcon, type FairModelSpecificationIcon } from "./model-view";

// Model page v2 (public/prototip/stranica-modela-v2.html): the four key-spec
// tiles under the hero and the grouped full list. Pure: no fetch, no storage.
// The exhibitor's flagged highlights win; with none flagged the tiles are
// picked by priority, so the strip is never empty while a spec exists.

export type FairKeySpecSource = { id: string; label: string; value: string; isHighlight: boolean };

export type FairKeySpecKind = FairModelSpecificationIcon | "tank" | "consumption" | "emissions" | "displacement" | "engines" | "wheels" | "screen" | "suspension" | "transmission" | "engine" | "fuel" | "drive" | "other";

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
  // A fuel tank or boot capacity is never a traction battery.
  if (/rezervoar/.test(fold(label))) return "tank";
  if (/prtljaznik/.test(fold(label))) return "other";
  return fairSpecificationIcon(label) ?? "other";
}

/** "Domet (CLTC)" → "CLTC"; "DC punjenje 30-80%" → "30-80%". */
function qualifierOf(label: string, kind: FairKeySpecKind): string {
  const parenthesis = label.match(/\(([^)]+)\)/);
  if (parenthesis && !/^(kw|ks|km\/h|sek\.?|kg)$/i.test(parenthesis[1])) return parenthesis[1].trim();
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
  const consumption = head.match(/^([\d.,]+(?:[–-][\d.,]+)?)\s*(l\/100\s*km)$/);
  if (consumption) return { value: consumption[1], unit: "l/100 km" };
  const match = head.match(/^([<>~≈]?\s?\d[\d.,]*(?:\s?[-–]\s?\d[\d.,]*)?)\s*([^\d\s][^\d]{0,7})?$/u);
  if (!match) return { value: raw.trim(), unit: "" };
  return { value: match[1].replace(/\s+/g, ""), unit: (match[2] ?? "").trim() };
}

function toKeySpec(item: FairKeySpecSource): FairKeySpec {
  const kind = kindOf(item.label);
  const { value, unit: parsedUnit } = splitSpecValue(item.value);
  const unit = parsedUnit || (/\bkw\s*\(ks\)/i.test(item.label) ? "kW" : "");
  return { id: item.id, kind, value, unit, qualifier: qualifierOf(item.label, kind), label: item.label };
}

function compactSpec(item: FairKeySpecSource): FairKeySpec {
  const spec = toKeySpec(item);
  const label = fold(item.label);
  if (spec.kind === "charging") {
    const charging = item.value.match(/(?:^|za\s+)(\d+(?:[.,]\d+)?)\s*(min|h|kW)\b/);
    if (charging) return { ...spec, value: charging[1], unit: charging[2] };
  }
  if (/potrosnj/.test(label)) spec.kind = "consumption";
  else if (/emisija co/.test(label)) spec.kind = "emissions";
  else if (/^zapremina$/.test(label)) spec.kind = "displacement";
  else if (/dostupni motori/.test(label)) {
    const volumes = [...new Set(item.value.match(/\d[.,]\d(?=\s*l|–litarski|-litarski)/g))];
    if (volumes.length) return { ...spec, kind: "engines", value: volumes.join(" / "), unit: "l", qualifier: "" };
  } else if (/naplatci|tockovi|ekran|tabla/.test(label)) {
    const inches = item.value.match(/^(\d+(?:[.,]\d+)?)"/);
    if (inches) return { ...spec, kind: /naplatci|tockovi/.test(label) ? "wheels" : "screen", value: inches[1], unit: "″", qualifier: "" };
  } else if (/ogibljenje/.test(label) && item.value === "Sportsko ogibljenje") {
    return { ...spec, kind: "suspension", value: "Sportsko", unit: "", qualifier: "" };
  } else if (/^menjac/.test(label)) {
    // "Automatski, 8 brzina" → 8 brzina · automatski; "Automatski E-CVT" → E-CVT · automatski.
    const type = /automat/.test(fold(item.value)) ? "automatski" : /rucn|manuel/.test(fold(item.value)) ? "ručni" : "";
    const gears = item.value.match(/(\d+)\s*brzin/) ?? item.value.match(/\((\d+)\)/);
    if (gears) return { ...spec, kind: "transmission", value: gears[1], unit: gears[0].includes("brzin") ? "brzina" : "", qualifier: type };
    const code = item.value.match(/\b(E-CVT|CVT|DSG|DCT)\b/);
    if (code) return { ...spec, kind: "transmission", value: code[1], unit: "", qualifier: type };
  } else if (/^motor$/.test(label)) {
    // "1,5 EcoBoost" → 1,5 l · EcoBoost: the displacement is the figure, the family its qualifier.
    const engine = item.value.match(/^(\d+[.,]\d)\s*(.*)$/);
    if (engine) return { ...spec, kind: "engine", value: engine[1], unit: "l", qualifier: engine[2].replace(/^(?:T|l|L)\b\s*/, "").split(/\s*[,/(]\s*|\s+/)[0] ?? "", label: "Motor" };
  } else if (/^gorivo$/.test(label)) {
    const [fuel, ...rest] = item.value.split(/,\s*/);
    return { ...spec, kind: "fuel", value: fuel, unit: "", qualifier: rest.join(", "), label: "Gorivo" };
  } else if (/^pogon$/.test(label)) {
    return { ...spec, kind: "drive", label: "Pogon" };
  }
  return spec;
}

export function fairModelKeySpecs(items: readonly FairKeySpecSource[], compact = false): FairKeySpec[] {
  if (compact) {
    const parsed = items.map(compactSpec);
    const priority: FairKeySpecKind[] = ["range", "battery", "power", "charging", "speed", "acceleration", "tank", "torque", "displacement", "consumption", "engines", "wheels", "screen", "suspension", "transmission"];
    // Flagged tiles (AMF curation, 30 Oct 2026): EV order first, then power, engine, gearbox, consumption.
    const flaggedOrder: FairKeySpecKind[] = ["range", "battery", "power", "charging", "engine", "transmission", "consumption", "emissions", "torque", "fuel", "drive"];
    const byRank = (order: FairKeySpecKind[]) => (a: FairKeySpec, b: FairKeySpec) => {
      const rank = (kind: FairKeySpecKind) => { const index = order.indexOf(kind); return index < 0 ? 99 : index; };
      return rank(a.kind) - rank(b.kind);
    };
    const flagged = parsed.filter((_, index) => items[index].isHighlight);
    const candidates = [...(flagged.length ? flagged : parsed)].sort(byRank(flagged.length ? flaggedOrder : priority));
    // Unconfirmed equipment/engine descriptions stay complete in the full list;
    // only compact measurements (or a short equipment value) belong in tiles.
    return candidates.filter((s) => s.unit || s.value.length <= 8).slice(0, FAIR_KEY_SPECS_MAX);
  }
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

/** Only positive powertrain evidence; mHEV alternatives do not confirm a battery. */
export function fairModelHasTractionBattery(items: readonly FairKeySpecSource[]): boolean {
  return items.some((item) => /baterij/.test(fold(item.label)) && /kwh/i.test(item.value)
    || /motor|pogon/.test(fold(item.label)) && /elektric|hibrid|hybrid|\bhev\b/.test(fold(item.value)));
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
  labels: { drivetrain: string; performance: string; fallback?: string },
): FairSpecGroup<T>[] {
  if (groups.length !== 1) return [...groups];
  const [only] = groups;
  const drivetrain: T[] = [];
  const performance: T[] = [];
  for (const item of only.items) {
    const kind = fairSpecificationIcon(item.label);
    if ((kind && DRIVETRAIN.includes(kind)) || DRIVETRAIN_WORDS.test(fold(item.label)) || (labels.fallback && /^(zapremina|rezervoar)$/.test(fold(item.label)))) drivetrain.push(item);
    else performance.push(item);
  }
  if (drivetrain.length === 0 || performance.length === 0) return labels.fallback ? [{ ...only, label: labels.fallback }] : [...groups];
  return [
    { id: `${only.id}-drivetrain`, label: labels.drivetrain, items: drivetrain },
    { id: `${only.id}-performance`, label: labels.performance, items: performance },
  ];
}
