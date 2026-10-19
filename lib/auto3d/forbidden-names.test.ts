// @vitest-environment node
// Nijedan fajl ovog runa ne sme da nosi imena iz reference (rules.md): klijent, proizvod,
// globali i ease imena. Reči „sklopljen“ i „rasklopljen“ (imena postera) su dozvoljene.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { readGlbJson } from "./glb";

const ROOT = process.cwd();
const DIRS = ["3d/auto3d", "lib/auto3d", "components/fair/auto3d", "app/sajam/3d"];
const FILES = ["lib/i18n/sr/fair-auto3d.ts", "lib/i18n/sr/fair-auto3d-delovi.ts"];
const TEXT = /\.(py|mjs|ts|tsx|css|json|md)$/;
const SELF = resolve(ROOT, "lib/auto3d/forbidden-names.test.ts");

const FORBIDDEN: RegExp[] = [
  new RegExp(Buffer.from("ZXVyb21vdG9ycw==", "base64").toString(), "i"),
  new RegExp(Buffer.from("b2VtIHBhcnRz", "base64").toString(), "i"),
  /\bSKLOP\b/,
  /sklop3d/i,
  /sklop_car/i,
  /\[sklop\]/i,
  /\bsk-[a-z]/,
  /\bsk\.[a-z]/,
  /\bsk_[a-z]/,
];

function walk(dir: string, out: string[]) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "__pycache__" || name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT.test(name)) out.push(p);
  }
}

function files(): string[] {
  const out: string[] = [];
  for (const d of DIRS) walk(resolve(ROOT, d), out);
  for (const f of FILES) if (existsSync(resolve(ROOT, f))) out.push(resolve(ROOT, f));
  const pub = resolve(ROOT, "public/3d/auto3d");
  if (existsSync(pub)) for (const n of readdirSync(pub)) if (n.endsWith(".json")) out.push(join(pub, n));
  return out.filter((f) => resolve(f) !== SELF);
}

describe("zabranjena imena iz reference", () => {
  test("nema ih u fajlovima ovog runa", () => {
    const hits: string[] = [];
    // Test ne sme da prođe naprazno, kad putanje ne postoje (A13).
    expect(files().length).toBeGreaterThan(100);
    for (const f of files()) {
      const text = readFileSync(f, "utf8");
      for (const re of FORBIDDEN) if (re.test(text)) hits.push(`${f}: ${re}`);
    }
    expect(hits).toEqual([]);
  });

  test("nema ih u imenima čvorova i materijala GLB-ova", () => {
    for (const f of ["limuzina.glb", "limuzina-lite.glb"]) {
      const p = resolve(ROOT, "public/3d/auto3d", f);
      expect(existsSync(p), f).toBe(true);
      const { json } = readGlbJson(new Uint8Array(readFileSync(p)));
      const names = [...(json.nodes ?? []).map((n) => n.name ?? ""), ...(json.materials ?? []).map((m) => m.name ?? "")].join("\n");
      for (const re of FORBIDDEN) expect(re.test(names), `${f}: ${re}`).toBe(false);
    }
  });
});
