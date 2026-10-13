import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { describe, expect, test } from "vitest";

// ADMIN v3 V2 — the import boundary of `three` (plan §4.3, point 1). Only the
// files below may import the library as a value; nobody else may import them
// statically. A lazy chunk loads them through `import()`, which is allowed.
// V3 — the hall heat map moved onto the kit: `heat-map-3d.tsx` is now the React
// side of a scene (it loads `scenes/hall-scene.ts` through `import()`), so it
// left the allowed list and may be imported like any other component.

const ROOT = process.cwd();
const SELF = "lib/admin-v2/three/import-boundary.test.ts";

const ALLOWED_FILES = [
  "components/admin/three/stage.ts",
  "components/admin/three/post.ts",
  "components/admin/three/picking.ts",
  "components/admin/three/particles.ts",
];
const ALLOWED_DIR = "components/admin/three/scenes/";

const isAllowed = (path: string) => ALLOWED_FILES.includes(path) || path.startsWith(ALLOWED_DIR);
const isThree = (specifier: string) => specifier === "three" || specifier.startsWith("three/");

/** The lines of code: a line that starts with `//` and everything inside a block comment is dropped. */
function codeLines(lines: readonly string[]): string[] {
  const code: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    let rest = line;
    if (inBlock) {
      const end = rest.indexOf("*/");
      if (end === -1) continue;
      inBlock = false;
      rest = rest.slice(end + 2);
    }
    const trimmed = rest.trimStart();
    if (trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/", 2);
      if (end === -1) {
        inBlock = true;
        continue;
      }
      rest = trimmed.slice(end + 2);
    }
    code.push(rest);
  }
  return code;
}

const IMPORT_FROM = /(?:^|;)\s*import\s+(?!type\s)[^"'`;]*?\sfrom\s*["']([^"']+)["']/gm;
const IMPORT_BARE = /(?:^|;)\s*import\s*["']([^"']+)["']/gm;
const EXPORT_FROM = /(?:^|;)\s*export\s+(?!type\s)(?:\*(?:\s+as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/gm;
const REQUIRE = /\brequire\(\s*["']([^"']+)["']\s*\)/g;

/** The specifiers a source imports as values: not `import type`, not a dynamic `import()`, not a comment. */
function valueImports(lines: readonly string[]): string[] {
  const code = codeLines(lines).join("\n");
  const found: string[] = [];
  for (const pattern of [IMPORT_FROM, IMPORT_BARE, EXPORT_FROM, REQUIRE]) {
    for (const match of code.matchAll(pattern)) found.push(match[1]);
  }
  return found;
}

function sourcesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourcesUnder(full));
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const rel = (file: string) => relative(ROOT, file).split(sep).join("/");

/** Every path a specifier of `from` may mean (with and without the extension, or as a folder), relative to the repo root. */
function candidates(from: string, specifier: string): string[] {
  let target: string;
  if (specifier.startsWith("@/")) target = specifier.slice(2);
  else if (specifier.startsWith(".")) target = rel(join(ROOT, dirname(from), specifier));
  else return [];
  return [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`, `${target}/index.tsx`];
}

const files = ["app", "components", "lib"]
  .flatMap((dir) => sourcesUnder(join(ROOT, dir)))
  .map(rel)
  .filter((file) => file !== SELF);
const read = (file: string) => readFileSync(join(ROOT, file), "utf8").split(/\r?\n/);

describe("three import boundary", () => {
  test("only the allowed files import three as a value", () => {
    const outside = files.filter((file) => !isAllowed(file) && valueImports(read(file)).some(isThree));
    expect(outside).toEqual([]);
  });

  test("no file outside the allowed ones statically imports an allowed file", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (isAllowed(file)) continue;
      for (const specifier of valueImports(read(file))) {
        if (candidates(file, specifier).some(isAllowed)) offenders.push(`${file} -> ${specifier}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the check sees something: an allowed file exists and imports three", () => {
    const present = ALLOWED_FILES.filter((file) => existsSync(join(ROOT, file)));
    expect(present).toContain("components/admin/three/stage.ts");
    expect(present.every((file) => valueImports(read(file)).some(isThree))).toBe(true);
    // The scenes of the kit are there and each imports the library.
    for (const scene of ["constellation-scene.ts", "hall-scene.ts", "medal-scene.ts"]) {
      expect(valueImports(read(`${ALLOWED_DIR}${scene}`)).some(isThree), scene).toBe(true);
    }
  });
});

describe("valueImports", () => {
  test("a value import counts, a type import does not", () => {
    expect(valueImports(['import * as THREE from "three";'])).toEqual(["three"]);
    expect(valueImports(['import { Scene } from "three/examples/jsm/controls/OrbitControls.js";'])).toEqual([
      "three/examples/jsm/controls/OrbitControls.js",
    ]);
    expect(valueImports(['import type { Scene } from "three";'])).toEqual([]);
    expect(valueImports(["import type * as THREE from 'three';"])).toEqual([]);
  });

  test("a mixed import counts as a value", () => {
    expect(valueImports(['import { type Scene, WebGLRenderer } from "three";'])).toEqual(["three"]);
  });

  test("a dynamic import() does not count", () => {
    expect(valueImports(['const load = () => import("three");'])).toEqual([]);
    expect(valueImports(['  const stage = await import("./stage");'])).toEqual([]);
    expect(valueImports(['load={() => import("@/components/admin/three/scenes/constellation-scene")}'])).toEqual([]);
  });

  test("a commented import does not count", () => {
    expect(valueImports(['// import * as THREE from "three";'])).toEqual([]);
    expect(valueImports(['   // import * as THREE from "three";'])).toEqual([]);
    expect(valueImports(["/*", 'import * as THREE from "three";', "*/", 'import { a } from "./a";'])).toEqual(["./a"]);
    expect(valueImports(['/* import * as THREE from "three"; */'])).toEqual([]);
    expect(valueImports(["/**", ' * import * as THREE from "three";', " */"])).toEqual([]);
  });

  test("export from counts, export type from does not", () => {
    expect(valueImports(['export * from "./stage";'])).toEqual(["./stage"]);
    expect(valueImports(['export * as Stage from "./stage";'])).toEqual(["./stage"]);
    expect(valueImports(['export { createStage } from "./stage";'])).toEqual(["./stage"]);
    expect(valueImports(['export type { Stage } from "./stage";'])).toEqual([]);
    expect(valueImports(["export const x = 1;"])).toEqual([]);
  });

  test("a side-effect import and a multi-line import count", () => {
    expect(valueImports(['import "three/examples/jsm/loaders/GLTFLoader.js";'])).toEqual(["three/examples/jsm/loaders/GLTFLoader.js"]);
    expect(valueImports(["import {", "  A,", "  type B,", '} from "three";'])).toEqual(["three"]);
    expect(valueImports(["import type {", "  A,", '} from "three";'])).toEqual([]);
  });

  test("require counts", () => {
    expect(valueImports(['const THREE = require("three");'])).toEqual(["three"]);
  });

  test("a code line after a closed block comment still counts", () => {
    expect(valueImports(["/* note */", 'import { a } from "three";'])).toEqual(["three"]);
  });
});

describe("candidates", () => {
  test("resolves the alias and relative paths, with and without extension", () => {
    expect(candidates("components/admin/x.tsx", "@/components/admin/three/stage")).toContain("components/admin/three/stage.ts");
    expect(candidates("components/admin/x.tsx", "./three/stage")).toContain("components/admin/three/stage.ts");
    expect(candidates("components/admin/frame/x.tsx", "../three/scenes")).toContain("components/admin/three/scenes/index.ts");
    expect(candidates("components/admin/x.tsx", "react")).toEqual([]);
  });

  test("the allowed set knows the scenes folder; the React side of a scene is outside it", () => {
    expect(isAllowed("components/admin/three/scenes/hall-scene.ts")).toBe(true);
    expect(isAllowed("components/admin/events/analytics/heat-map-3d.tsx")).toBe(false);
    expect(isAllowed("components/admin/three/admin-stage.tsx")).toBe(false);
    // V4: the medal is a scene; its React side and the Vitrina are not.
    expect(isAllowed("components/admin/three/scenes/medal-scene.ts")).toBe(true);
    expect(isAllowed("components/admin/game/medal-stage.tsx")).toBe(false);
    expect(isAllowed("components/admin/game/vitrina.tsx")).toBe(false);
  });
});
