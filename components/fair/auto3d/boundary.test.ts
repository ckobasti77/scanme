// @vitest-environment node
// Granica three-a (rules.md, A03 §1.1): three se uvozi samo iz components/fair/auto3d/viewer/**, a
// modul ./viewer samo dinamičkim import()-om iz viewer-island.tsx. Tako three ne ulazi u zajedničke
// chunk-ove drugih strana ni u prvo učitavanje /sajam/3d.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = process.cwd();
const CODE = /\.(ts|tsx|mts|js|mjs)$/;

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (CODE.test(name) && !name.endsWith(".test.ts") && !name.endsWith(".test.tsx")) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split(sep).join("/");

/** Specifikatori statičkih uvoza (i `export … from`), bez `import type`. */
function staticImports(src: string): string[] {
  const out: string[] = [];
  const re = /^\s*(import|export)\s+(?!type\b)[^;]*?\sfrom\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;
  for (const m of src.matchAll(re)) out.push(m[2] ?? m[3]);
  return out;
}

function dynamicImports(src: string): string[] {
  return [...src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)].map((m) => m[1]);
}

const isThree = (s: string) => s === "three" || s.startsWith("three/");

const AUTO3D = resolve(ROOT, "components/fair/auto3d");
const VIEWER = resolve(AUTO3D, "viewer");
// Admin V2 ima svoj, lenjo učitan three kit (components/admin/three/**,
// sopstvena granica u lib/admin-v2/three/import-boundary.test.ts).
const ADMIN_THREE = resolve(ROOT, "components/admin/three");
const files = [
  ...walk(resolve(ROOT, "app")),
  ...walk(resolve(ROOT, "components")),
  ...walk(resolve(ROOT, "lib")),
];

describe("granica three-a", () => {
  test("three se statički uvozi samo iz components/fair/auto3d/viewer/**", () => {
    const offenders = files
      .filter((f) => !f.startsWith(VIEWER + sep))
      .filter((f) => !f.startsWith(ADMIN_THREE + sep))
      .filter((f) => staticImports(readFileSync(f, "utf8")).some(isThree) || dynamicImports(readFileSync(f, "utf8")).some(isThree))
      .map(rel);
    expect(offenders).toEqual([]);
  });

  test("./viewer se učitava samo dinamički, iz viewer-island.tsx", () => {
    const staticUsers: string[] = [];
    const dynamicUsers: string[] = [];
    for (const f of files) {
      if (f.startsWith(VIEWER + sep)) continue;
      const src = readFileSync(f, "utf8");
      const pointsAtViewer = (s: string) => /(^|\/)viewer(\/index)?$/.test(s) && (s.startsWith(".") || s.includes("fair/auto3d/viewer"));
      // Statički uvoz bilo kog modula iz viewer/** (npr. ./viewer/camera-rig) vukao bi three u prvo učitavanje (A13).
      const pointsIntoViewer = (s: string) => /(^|\/)viewer(\/|$)/.test(s) && (s.startsWith(".") || s.includes("fair/auto3d/viewer"));
      if (staticImports(src).some(pointsIntoViewer)) staticUsers.push(rel(f));
      if (dynamicImports(src).some(pointsAtViewer)) dynamicUsers.push(rel(f));
    }
    expect(staticUsers).toEqual([]);
    expect(dynamicUsers).toEqual(["components/fair/auto3d/viewer-island.tsx"]);
  });

  test("lib/auto3d je čist: bez react-a i three-a; viewer/** bez react-a", () => {
    for (const f of walk(resolve(ROOT, "lib/auto3d"))) {
      const imports = staticImports(readFileSync(f, "utf8"));
      expect(imports.filter((s) => s === "react" || isThree(s)), rel(f)).toEqual([]);
    }
    for (const f of walk(VIEWER)) {
      const imports = staticImports(readFileSync(f, "utf8"));
      expect(imports.filter((s) => s === "react" || s.startsWith("react/")), rel(f)).toEqual([]);
    }
  });

  test("three postoji u viewer/** (granica nije prazna)", () => {
    const users = walk(VIEWER).filter((f) => staticImports(readFileSync(f, "utf8")).some(isThree));
    expect(users.length).toBeGreaterThan(3);
  });
});

describe("linkovi na /sajam/3d", () => {
  // A13: next/link na istu rutu menja samo searchParams, a store scene se pravi jednom (RendgenApp),
  // pa ?tura=1, ?kiosk=1 i ?deo= iz linka ne bi krenuli. Linkovi stranice su obični <a>.
  test("UI scene ne uvozi next/link", () => {
    const users = walk(AUTO3D).filter((f) => staticImports(readFileSync(f, "utf8")).includes("next/link"));
    expect(users.map(rel)).toEqual([]);
  });
});
