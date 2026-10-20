// ADMIN v2 X3 — colours of the analytics charts (ZADATAK §4, dataviz method).
// The values are CSS custom properties of `.admin-v1` (app/globals.css), one
// set per theme, validated on the admin surfaces:
//   categorical  --admin-chart-1 … 8, always in this order; a colour follows
//                its entity (an exhibitor, a day), never its rank;
//   sequential   --admin-seq-100 … 700, one blue from light to dark (matrices);
//                `--admin-seq-on-*` is the text colour on that step;
//   the hall heat map keeps the scale of „Gde je gužva“ (lib/fair-heat.ts).
// Status colours (--admin-success/warning/danger) are never series colours.

export const CHART_SLOTS = 8;

export const chartColor = (slot: number) => `var(--admin-chart-${slot})`;
/** Everything past the eighth entity ("Ostalo") and the de-emphasised context series. */
export const CHART_OTHER_COLOR = "var(--admin-chart-other)";

export type EntityColor = { slot: number | null; color: string };

/**
 * One colour per entity key, in the fixed slot order. The keys are sorted, so
 * the same set of entities always gets the same colours whatever their rank or
 * the order they arrive in; the ninth and later share the "other" colour.
 */
export function entityColors(keys: readonly string[]): Map<string, EntityColor> {
  const sorted = [...new Set(keys)].sort((a, b) => a.localeCompare(b, "sr", { numeric: true }));
  return new Map(sorted.map((key, index) => [key, index < CHART_SLOTS ? { slot: index + 1, color: chartColor(index + 1) } : { slot: null, color: CHART_OTHER_COLOR }]));
}

export const SEQ_STEPS = [100, 200, 300, 400, 500, 600, 700] as const;
export type SeqStep = (typeof SEQ_STEPS)[number];

export const seqColor = (step: SeqStep) => `var(--admin-seq-${step})`;
export const seqInk = (step: SeqStep) => `var(--admin-seq-on-${step})`;

/** The step of `value` on a scale 0…max: null for no value, else 100 (near zero) … 700 (the maximum). */
export function seqStep(value: number, max: number): SeqStep | null {
  if (!(value > 0) || !(max > 0)) return null;
  const index = Math.min(SEQ_STEPS.length - 1, Math.floor((Math.min(value, max) / max) * SEQ_STEPS.length));
  return SEQ_STEPS[index];
}
