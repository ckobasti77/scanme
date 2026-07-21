import { describe, expect, test } from "vitest";
import { aggregateMetricRowsForRange } from "./metrics";

describe("Oduvek metrika", () => {
  test("koristi dnevne tačke kada podaci obuhvataju samo jedan mesec", () => {
    expect(aggregateMetricRowsForRange([
      { dateKey: "2026-07-03", count: 2 },
      { dateKey: "2026-07-05", count: 4 },
    ], "all", "2026-07-07")).toEqual([
      { dateKey: "2026-07-03", label: "03.07.", count: 2 },
      { dateKey: "2026-07-04", label: "04.07.", count: 0 },
      { dateKey: "2026-07-05", label: "05.07.", count: 4 },
      { dateKey: "2026-07-06", label: "06.07.", count: 0 },
      { dateKey: "2026-07-07", label: "07.07.", count: 0 },
    ]);
  });

  test("koristi mesečne tačke kada je od prvog skeniranja prošlo više meseci", () => {
    expect(aggregateMetricRowsForRange([
      { dateKey: "2026-05-20", count: 2 },
      { dateKey: "2026-05-21", count: 4 },
    ], "all", "2026-07-07")).toEqual([
      { dateKey: "2026-05", label: "maj 2026.", count: 6 },
      { dateKey: "2026-06", label: "jun 2026.", count: 0 },
      { dateKey: "2026-07", label: "jul 2026.", count: 0 },
    ]);
  });
});
