// Pravi 3D Rendgen limuzinu od nule iz verzionisanih skripti (A01 §3.4).
//
//   node 3d/auto3d/pipeline.mjs                     sve faze redom
//   node 3d/auto3d/pipeline.mjs build export optimize
//
// Faze: catalog, build, measure, collide, export, optimize, render, posters, images.
// Svaka faza zaustavlja lanac na prvoj grešci. Blender se pokreće kroz blender.mjs.
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const node = (...args) => [process.execPath, ["--no-warnings", ...args]];
const blender = (args) => node("3d/auto3d/blender.mjs", ...args);
const DESKTOP = "output/auto3d/limuzina.blend";
const LITE = "output/auto3d/limuzina-lite.blend";

const STAGES = {
  catalog: [node("3d/auto3d/catalog-json.mjs")],
  build: [
    blender(["3d/auto3d/build.py", "--", "--quality", "desktop"]),
    blender(["3d/auto3d/build.py", "--", "--quality", "lite"]),
  ],
  measure: [blender(["--blend", DESKTOP, "3d/auto3d/measure.py", "--", "--strict"])],
  collide: [
    blender(["--blend", DESKTOP, "3d/auto3d/collide.py", "--", "--inventory", "--motion", "--steps", "40", "--strict"]),
    blender(["--blend", LITE, "3d/auto3d/collide.py", "--", "--motion", "--steps", "40", "--strict"]),
  ],
  export: [
    blender(["--blend", DESKTOP, "3d/auto3d/export.py", "--", "--quality", "desktop"]),
    blender(["--blend", LITE, "3d/auto3d/export.py", "--", "--quality", "lite"]),
  ],
  optimize: [node("3d/auto3d/optimize.mjs")],
  render: [blender(["--blend", DESKTOP, "3d/auto3d/render.py", "--", "--set", "qa", "--tag", "pipeline"])],
  posters: [blender(["--blend", DESKTOP, "3d/auto3d/posters.py", "--", "--set", "all"])],
  images: [node("3d/auto3d/images.mjs"), node("3d/auto3d/optimize.mjs")],
};

const wanted = process.argv.slice(2);
const order = wanted.length ? wanted : Object.keys(STAGES);
const started = Date.now();
for (const name of order) {
  const steps = STAGES[name];
  if (!steps) {
    console.error(`[pipeline] nepoznata faza: ${name} (postoje: ${Object.keys(STAGES).join(", ")})`);
    process.exit(2);
  }
  for (const [cmd, args] of steps) {
    const t = Date.now();
    console.log(`\n[pipeline] ${name}: ${args.slice(1).join(" ")}`);
    const r = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit" });
    if (r.status !== 0) {
      console.error(`[pipeline] faza ${name} nije uspela (kod ${r.status})`);
      process.exit(r.status ?? 1);
    }
    console.log(`[pipeline] ${name} gotovo za ${((Date.now() - t) / 1000).toFixed(1)} s`);
  }
}
console.log(`\n[pipeline] sve gotovo za ${((Date.now() - started) / 1000).toFixed(0)} s`);
