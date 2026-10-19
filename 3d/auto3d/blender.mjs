// Pokreće Blender bez prozora nad skriptom iz 3d/auto3d.
//
//   node 3d/auto3d/blender.mjs [--blend <fajl.blend>] [--timeout-min 20] <skripta.py> [-- <argumenti>]
//
// Blender se traži preko BLENDER_EXE, pa na podrazumevanoj putanji. Pokreće se sa
// `-b --factory-startup --python-exit-code 1`, a argumenti posle `--` idu skripti.
// Vraća izlazni kod Blendera (2 kad Blender ne postoji, 124 kad istekne vreme).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_EXE = "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const own = sep === -1 ? argv : argv.slice(0, sep);
const passthrough = sep === -1 ? [] : argv.slice(sep + 1);

let blend = null;
let timeoutMin = 20;
let script = null;
for (let i = 0; i < own.length; i++) {
  const a = own[i];
  if (a === "--blend") blend = own[++i];
  else if (a === "--timeout-min") timeoutMin = Number(own[++i]);
  else if (!script) script = a;
  else {
    console.error(`[blender.mjs] nepoznat argument: ${a}`);
    process.exit(2);
  }
}

if (!script) {
  console.error("[blender.mjs] upotreba: node 3d/auto3d/blender.mjs [--blend f.blend] <skripta.py> [-- argumenti]");
  process.exit(2);
}

const exe = process.env.BLENDER_EXE || DEFAULT_EXE;
if (!existsSync(exe)) {
  console.error(`[blender.mjs] Blender nije pronađen: ${exe}`);
  console.error("[blender.mjs] Postavi promenljivu BLENDER_EXE na putanju do blender.exe (Blender 5.1).");
  process.exit(2);
}

const scriptPath = resolve(script);
if (!existsSync(scriptPath)) {
  console.error(`[blender.mjs] skripta ne postoji: ${scriptPath}`);
  process.exit(2);
}
if (blend && !existsSync(resolve(blend))) {
  console.error(`[blender.mjs] .blend ne postoji: ${resolve(blend)} (prvo pokreni build.py)`);
  process.exit(2);
}

const args = ["-b", "--factory-startup", "-noaudio"];
if (blend) args.push(resolve(blend));
args.push("--python-exit-code", "1", "-P", scriptPath);
if (passthrough.length) args.push("--", ...passthrough);

const started = Date.now();
console.log(`[blender.mjs] ${script}${blend ? ` (${blend})` : ""} ${passthrough.join(" ")}`);
const child = spawn(exe, args, { stdio: "inherit" });
const timer = setTimeout(() => {
  console.error(`[blender.mjs] isteklo vreme (${timeoutMin} min), prekidam Blender`);
  child.kill();
  process.exitCode = 124;
}, timeoutMin * 60 * 1000);

child.on("error", (err) => {
  clearTimeout(timer);
  console.error(`[blender.mjs] Blender nije pokrenut: ${err.message}`);
  process.exit(2);
});
child.on("exit", (code) => {
  clearTimeout(timer);
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[blender.mjs] kraj: kod ${code ?? 1}, ${secs} s`);
  if (process.exitCode !== 124) process.exitCode = code ?? 1;
});
