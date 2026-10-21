// Provera tipova za noćni run MENI (pušta je runner kao proveru "typecheck", a agenti isto tako).
//
//   node .nocni-run/meni/alati/typecheck.mjs
//
// 1) `next typegen` napravi tipove ruta (PageProps, RouteContext) i za stranice koje je korak
//    upravo dodao, pa tsc ne pada samo zato što dev server ili build još nisu pokrenuti;
// 2) `tsc --noEmit` nad celim projektom. Izlazni kod je kod tsc-a.
// Pokreće se iz korena repoa. Ne menja kod; `next typegen` piše samo u .next/ i next-env.d.ts.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const tscBin = path.join(root, "node_modules", "typescript", "bin", "tsc");

function run(label, file, args) {
  if (!existsSync(file)) {
    console.error(`[typecheck] ${label}: ne postoji ${file} (pokreni iz korena repoa)`);
    return 1;
  }
  const r = spawnSync(process.execPath, [file, ...args], { cwd: root, stdio: "inherit" });
  if (r.error) {
    console.error(`[typecheck] ${label}: ${r.error.message}`);
    return 1;
  }
  return r.status ?? 1;
}

const gen = run("next typegen", nextBin, ["typegen"]);
if (gen !== 0) console.error(`[typecheck] next typegen je vratio ${gen}; nastavljam sa tsc`);
const code = run("tsc", tscBin, ["--noEmit"]);
console.log(code === 0 ? "[typecheck] tsc: bez grešaka" : `[typecheck] tsc: izlaz ${code}`);
process.exit(code);
