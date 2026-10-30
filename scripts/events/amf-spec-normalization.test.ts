import { expect, test } from "vitest";
import { normalizeAmfSpecs } from "../fair/normalize-amf-specs.mjs";

test("normalization preserves meaning, reorders MG dimensions and is idempotent", () => {
  const raw = [
    { label: "Dužina/Visina/Širina (mm)", value: "4670/1665/1890", order: 1 },
    { label: "Snaga kW (KS)", value: "165 (225)", order: 2 },
    { label: "Maksimalni obrtni moment", value: "400/1750-3250 Nm/min.", order: 3 },
    { label: "Prosečna potrošnja WLTP Kombinovano", value: "5,2/100 km", order: 4 },
  ];
  const normalized = normalizeAmfSpecs(raw);
  expect(normalized.map(s => [s.label, s.value])).toEqual([
    ["Snaga", "165 kW / 225 KS"],
    ["Obrtni moment", "400 Nm (1.750–3.250 o/min)"],
    ["Potrošnja (WLTP)", "5,2 l/100 km"],
    ["Dužina × širina × visina", "4.670 × 1.890 × 1.665 mm"],
  ]);
  expect(normalizeAmfSpecs(normalized)).toEqual(normalized);
});
