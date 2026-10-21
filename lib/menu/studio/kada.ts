// ScanMe Menu V1 — "danas u 14:32", "juče u 9:05", "12. 10. u 9:05": when the
// live version was published, in Belgrade time (rules: lib/belgrade-time.ts).
// `sada` is passed in so the phrase is testable and stable during a render.

import { belgradeParts } from "../../belgrade-time";

export function kadaTekst(
  epoch: number,
  sada: number,
  reci: { danas: string; juce: string; datum: string },
): string {
  const p = belgradeParts(epoch);
  const d = belgradeParts(sada);
  const vreme = `${p.hour}:${String(p.minute).padStart(2, "0")}`;
  const dan = Date.UTC(p.year, p.month - 1, p.day);
  const danas = Date.UTC(d.year, d.month - 1, d.day);
  const razlika = Math.round((danas - dan) / 86_400_000);
  const sablon = razlika === 0 ? reci.danas : razlika === 1 ? reci.juce : reci.datum;
  return sablon
    .replace("{vreme}", vreme)
    .replace("{datum}", `${p.day}. ${p.month}.`);
}
