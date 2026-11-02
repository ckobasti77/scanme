// @vitest-environment node
//
// ScanMe Menu V1 (K02) — lib/menu/** is pure: Convex bundles it, the browser
// bundles it, and tests run it without Next or a DOM. A runtime import of
// Next, React, the `@/` alias or a Node built-in breaks one of those. Route
// handler logic (lib/menu/http/**) and the test seed (lib/menu/testkit/**) are
// the only exceptions. `import type` lines are allowed everywhere.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(__dirname);
const EXEMPT_DIRS = new Set(["http", "testkit"]);
const FORBIDDEN = [/^next(\/|$)/, /^react(\/|$|-dom)/, /^@\//, /^node:/];

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (dir === ROOT && EXEMPT_DIRS.has(entry)) continue;
      files.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

function runtimeImports(source: string): string[] {
  const specifiers: string[] = [];
  const pattern = /^\s*(import|export)\s+(?!type\b)[^'"]*?from\s+["']([^"']+)["']/gm;
  for (const match of source.matchAll(pattern)) specifiers.push(match[2]);
  for (const match of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specifiers.push(match[1]);
  return specifiers;
}

describe("lib/menu purity", () => {
  const files = sourceFiles(ROOT);

  test("there are files to check", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  test("no runtime import of next, react, the @/ alias or node built-ins", () => {
    const offenders = files.flatMap((file) =>
      runtimeImports(readFileSync(file, "utf8"))
        .filter((specifier) => FORBIDDEN.some((rule) => rule.test(specifier)))
        .map((specifier) => `${path.relative(ROOT, file)} → ${specifier}`),
    );
    expect(offenders).toEqual([]);
  });
});
