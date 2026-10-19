// Optimizuje sirove GLB-ove iz Blendera i piše konačni manifest (A01 §3.6, P6).
//
//   node 3d/auto3d/optimize.mjs            meshopt preko `npx -y @gltf-transform/cli@4.5.1`
//   node 3d/auto3d/optimize.mjs --copy     bez kompresije (samo kopija; za probu kad nema mreže)
//
// Pojedinačne komande (dedup -> prune -> weld -> meshopt), nikad `optimize`: ona spljošti
// hijerarhiju i spaja čvorove. `--materials false` čuva imena slotova, `--keep-leaves true`
// čuva prazne čvorove, a meshopt `medium` ne pravi trake u fresnel ivici.
// CLI se ne dodaje u package.json.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = resolve(ROOT, "output/auto3d");
const PUB = resolve(ROOT, "public/3d/auto3d");
const TMP = resolve(ROOT, ".nocni-run/auto3d/tmp/optimize");
const CLI = "@gltf-transform/cli@4.5.1";
const copyOnly = process.argv.includes("--copy");

mkdirSync(PUB, { recursive: true });
mkdirSync(TMP, { recursive: true });

function npx(args) {
  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(cmd, ["-y", CLI, ...args], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", shell: process.platform === "win32" });
  if (r.status !== 0) {
    process.stderr.write(r.stdout ?? "");
    process.stderr.write(r.stderr ?? "");
    throw new Error(`gltf-transform ${args[0]} nije uspeo (kod ${r.status})`);
  }
}

function q(p) {
  return process.platform === "win32" ? `"${p}"` : p;
}

function optimise(rawName, outName) {
  const raw = resolve(OUT, rawName);
  if (!existsSync(raw)) throw new Error(`${raw} ne postoji: pokreni export.py`);
  const out = resolve(PUB, outName);
  if (copyOnly) {
    copyFileSync(raw, out);
  } else {
    const t1 = resolve(TMP, "t1.glb");
    const t2 = resolve(TMP, "t2.glb");
    const t3 = resolve(TMP, "t3.glb");
    npx(["dedup", q(raw), q(t1), "--materials", "false"]);
    npx(["prune", q(t1), q(t2), "--keep-leaves", "true"]);
    npx(["weld", q(t2), q(t3)]);
    npx(["meshopt", q(t3), q(out), "--level", "medium"]);
    for (const t of [t1, t2, t3]) rmSync(t, { force: true });
  }
  const bytes = readFileSync(out);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  console.log(`${outName}: ${(bytes.length / 1e6).toFixed(2)} MB`);
  return { url: `/3d/auto3d/${outName}`, bytes: bytes.length, sha256 };
}

const desktopBase = JSON.parse(readFileSync(resolve(OUT, "manifest.base.json"), "utf8"));
const litePath = resolve(OUT, "manifest.lite.json");
const liteBase = existsSync(litePath) ? JSON.parse(readFileSync(litePath, "utf8")) : null;

const desktop = optimise("limuzina.raw.glb", "limuzina.glb");
const liteRaw = existsSync(resolve(OUT, "limuzina-lite.raw.glb"));
const lite = liteRaw ? optimise("limuzina-lite.raw.glb", "limuzina-lite.glb") : null;
if (!lite) {
  // privremeno (A02): lite je kopija desktop GLB-a dok A09 ne napravi pravi
  copyFileSync(resolve(PUB, "limuzina.glb"), resolve(PUB, "limuzina-lite.glb"));
}

const manifest = desktopBase;
const dStats = desktopBase.stats.desktop;
const lStats = liteBase ? liteBase.stats.lite : dStats;
const liteFile = lite ?? { ...desktop, url: "/3d/auto3d/limuzina-lite.glb" };
manifest.files = {
  desktop: { ...desktop, triangles: dStats.triangles, drawCalls: dStats.drawCalls, nodes: dStats.nodes },
  lite: { ...liteFile, triangles: lStats.triangles, drawCalls: lStats.drawCalls, nodes: lStats.nodes },
  posters: {},
  og: null,
};
for (const p of manifest.parts) {
  const lp = liteBase?.parts.find((x) => x.id === p.id);
  p.triangles = { desktop: p.triangles.desktop, lite: lp ? lp.triangles.lite : p.triangles.desktop };
}
// posteri i OG koji postoje u public/3d/auto3d
const POSTERS = [
  ["sklopljen-desktop", 1920, 1080, "start.desktop"],
  ["rasklopljen-desktop", 1920, 1080, "rasklopljen.desktop"],
  ["sklopljen-telefon", 1080, 1350, "start.telefon"],
  ["rasklopljen-telefon", 1080, 1350, "rasklopljen.telefon"],
];
for (const [key, width, height, camera] of POSTERS) {
  const avif = existsSync(resolve(PUB, `poster-${key}.avif`));
  const webp = existsSync(resolve(PUB, `poster-${key}.webp`));
  if (!avif && !webp) continue;
  manifest.files.posters[key] = {
    ...(avif ? { avif: `/3d/auto3d/poster-${key}.avif` } : {}),
    ...(webp ? { webp: `/3d/auto3d/poster-${key}.webp` } : {}),
    width,
    height,
    camera,
  };
}
if (existsSync(resolve(PUB, "og.jpg"))) manifest.files.og = { url: "/3d/auto3d/og.jpg", width: 1200, height: 630 };
manifest.stats = { desktop: dStats, lite: lStats };

const outPath = resolve(PUB, "limuzina.manifest.json");
writeFileSync(outPath, JSON.stringify(manifest, null, 1) + "\n", "utf8");
console.log(`manifest: ${outPath} (${manifest.parts.length} delova)`);
