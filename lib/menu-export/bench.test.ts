// Menu export — size/time/memory at 100 / 1000 / 2000 items, typical and
// pathological (every TEXT_MAX / MAX_VARIANTS_PER_ITEM bound maxed). Feeds
// docs/perf/menu-export.md (RFC-003 §3 Risk 6). Env-gated like the Memories
// bench:  RUN_MENU_EXPORT_BENCH=1 npx vitest run lib/menu-export/bench.test.ts

import { describe, expect, test } from "vitest";
import { defaults, itemDefaults, MAX_VARIANTS_PER_ITEM, type MenuModel } from "../menu-blocks";
import { buildMenuPdf } from "./pdf";
import { buildMenuXlsx } from "./xlsx";
import { TEST_LABELS, TEST_STAMP } from "./test-labels";

const run = process.env.RUN_MENU_EXPORT_BENCH === "1" ? test : test.skip;

function model(count: number, pathological: boolean): MenuModel {
  const groups = [];
  let made = 0;
  while (made < count) {
    const g = defaults("lista");
    g.base = { id: `g-${groups.length}`, title: `Grupa ${groups.length} — Šljivovica & Ćevapi` };
    const take = Math.min(50, count - made);
    for (let i = 0; i < take; i += 1) {
      g.items.push({
        ...itemDefaults(),
        id: `i-${made}`,
        name: pathological ? "Domaća kafa sa kajmakom ".repeat(5).slice(0, 120) : `Domaća kafa ${made}`,
        productType: "piće",
        priceRsd: 100 + made,
        description: pathological
          ? "Kajmak, ajvar, pršuta i domaći hleb, čuvena porcija. ".repeat(12).slice(0, 600)
          : "Kajmak, ajvar, pršuta — ide uz sve.",
        available: made % 7 !== 0,
        variants: Array.from(
          { length: pathological ? MAX_VARIANTS_PER_ITEM : made % 3 },
          (_, v) => ({ id: `v-${made}-${v}`, label: `Varijanta ${v}`, priceRsd: 250 + v * 10 }),
        ),
      });
      made += 1;
    }
    groups.push(g);
  }
  return { groups, dayparts: [] };
}

function mem(): number {
  const p = (globalThis as { process?: { memoryUsage?: () => { rss: number } } }).process;
  return p?.memoryUsage ? p.memoryUsage().rss : 0;
}

describe("menu export bench", () => {
  run("sizes and timings", () => {
    const rows: string[] = [];
    for (const items of [100, 1000, 2000]) {
      for (const pathological of [false, true]) {
        const m = model(items, pathological);
        const memBefore = mem();
        let t0 = performance.now();
        const pdf = buildMenuPdf({ businessName: "Kafana kod Đorđa", stamp: TEST_STAMP, model: m, labels: TEST_LABELS });
        const pdfMs = performance.now() - t0;
        t0 = performance.now();
        const xlsx = buildMenuXlsx({ stamp: TEST_STAMP, model: m, labels: TEST_LABELS });
        const xlsxMs = performance.now() - t0;
        const memAfter = mem();
        const pages = Number(/\/Count (\d+)/.exec(new TextDecoder("latin1").decode(pdf))![1]);
        rows.push(
          `| ${items} | ${pathological ? "pathological" : "typical"} | ${(pdf.length / 1024).toFixed(0)} KiB | ${pages} | ${pdfMs.toFixed(0)} ms | ${(xlsx.length / 1024).toFixed(0)} KiB | ${xlsxMs.toFixed(0)} ms | ${Math.ceil(pdf.length / 900_000)} / ${Math.ceil(xlsx.length / 900_000)} | ${((memAfter - memBefore) / 1024 / 1024).toFixed(1)} MiB |`,
        );
        expect(pdf.length).toBeLessThan(16 * 1024 * 1024);
      }
    }
    console.log(
      "\n| Items | Scenario | PDF | Pages | PDF build | XLSX | XLSX build | Chunks (pdf / xlsx) | RSS delta |\n|---:|---|---:|---:|---:|---:|---:|---|---:|\n" +
        rows.join("\n") +
        "\n",
    );
  });
});
