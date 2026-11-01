// ADMIN v2 X3 — number formats of the analytics charts (sr-RS: decimal comma).

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toLocaleString("sr-RS", { maximumFractionDigits: 1 });
}

/** A share 0–1 as "67,4 %"; null → "—". */
export function formatShare(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(Math.round(value * 1000) / 10).toLocaleString("sr-RS", { maximumFractionDigits: 1 })} %`;
}

/** A ratio as "1,7×". */
export function formatTimes(ratio: number): string {
  return `${(Math.round(ratio * 10) / 10).toLocaleString("sr-RS", { maximumFractionDigits: 1 })}×`;
}

/** A signed whole number: "+12", "−3", "0" (a real minus sign, as in the tables). */
export function formatSigned(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${formatCount(Math.abs(rounded))}`;
}

export type CountForms = readonly [one: string, few: string, many: string];

/** The Serbian form of a counted noun: 1 sken, 2–4 skena, 5+ skenova (21 sken, 22 skena, 11–14 skenova; a fraction takes the second form). */
export function plural(count: number, forms: CountForms): string {
  if (!Number.isInteger(count)) return forms[1];
  const last = Math.abs(count) % 10;
  const lastTwo = Math.abs(count) % 100;
  if (last === 1 && lastTwo !== 11) return forms[0];
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return forms[1];
  return forms[2];
}

/** A number with its noun: "39 skenova", "1 sken". */
export function countOf(count: number, forms: CountForms): string {
  return `${formatCount(count)} ${plural(count, forms)}`;
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** "Subota" → "subota" inside a sentence; a label that is not a plain word ("TEST dan 2") stays. */
export function lowerFirst(label: string): string {
  const second = label.charAt(1);
  if (!label || !second || second !== second.toLocaleLowerCase("sr") || second === second.toLocaleUpperCase("sr")) return label;
  return label.charAt(0).toLocaleLowerCase("sr") + label.slice(1);
}

export const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
