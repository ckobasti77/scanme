// @vitest-environment node
//
// The golden-table gate (RFC-002 §2.1, TASK-01). Node environment because this
// file reads (and, under UPDATE_PRICING_GOLDEN=1, rewrites) golden.json from
// disk; every other pricing test runs in the project's default edge runtime.
//
//   npm test                  -> checks golden.json against the engine
//   npm run pricing:golden    -> regenerates golden.json from constants.ts

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { generateGoldenTable, serializeGoldenTable, type GoldenTable } from "./golden";

const GOLDEN_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "golden.json");
const REGENERATE = process.env.UPDATE_PRICING_GOLDEN === "1";

const generated = generateGoldenTable();
if (REGENERATE) {
  writeFileSync(GOLDEN_PATH, serializeGoldenTable(generated), "utf8");
}
const committed = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as GoldenTable;

describe("zlatna tabela cena", () => {
  test("pokriva 31 podskup usluga × svaku podelu perioda × 3 varijante plana", () => {
    // 3^5 - 1 = 242 (subset, period-split) pairs, times three plan variants.
    expect(generated.caseCount).toBe(726);
    expect(committed.caseCount).toBe(generated.caseCount);
    expect(committed.engineVersion).toBe(generated.engineVersion);
  });

  test("svaki slučaj se poklapa sa upisanom tabelom", () => {
    const byKey = new Map(committed.cases.map((entry) => [entry.key, entry]));
    for (const entry of generated.cases) {
      expect(byKey.get(entry.key), `nedostaje slučaj ${entry.key}`).toBeDefined();
      expect(byKey.get(entry.key), `cena se promenila za ${entry.key}`).toEqual(entry);
    }
    expect(byKey.size).toBe(generated.cases.length);
  });

  test("serijalizacija je stabilna — jedan slučaj po redu", () => {
    expect(serializeGoldenTable(generated)).toBe(readFileSync(GOLDEN_PATH, "utf8"));
  });
});
