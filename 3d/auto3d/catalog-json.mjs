// Upisuje katalog delova (lib/auto3d/catalog.ts) kao JSON za Blender skripte.
//
//   node 3d/auto3d/catalog-json.mjs
//
// Izlaz: output/auto3d/catalog.json (lokalno, ne commituje se). Node 22 sam uklanja TypeScript
// tipove pri uvozu, pa katalog ima jedan izvor istine.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DECO_NODES, EXPLODE_WINDOWS, PARTS, ROOT_NODE, SYSTEMS, partNodes } from "../../lib/auto3d/catalog.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const out = resolve(ROOT, "output/auto3d/catalog.json");
mkdirSync(dirname(out), { recursive: true });
const data = {
  root: ROOT_NODE,
  systems: SYSTEMS.map((s, order) => ({ id: s.id, order, color: s.color })),
  parts: PARTS.map((p, order) => ({ id: p.id, system: p.system, order, instances: [...p.instances], nodes: partNodes(p) })),
  deco: [...DECO_NODES],
  explodeWindows: EXPLODE_WINDOWS.map((w) => [...w]),
};
writeFileSync(out, JSON.stringify(data, null, 1) + "\n", "utf8");
console.log(`katalog: ${data.parts.length} delova, ${data.parts.reduce((n, p) => n + p.nodes.length, 0)} čvorova -> ${out}`);
