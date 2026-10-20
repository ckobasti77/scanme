// @vitest-environment node
//
// K21 + K14 — the JS budget of a plain menu link. The guest's actions
// (components/menu/gost) are a separate chunk: a menu opened without a scanned
// position must never download it. So nothing the public menu is made of
// (components/menu/javni, the /[slug]/meni routes) may import that folder
// statically, except
//   - `import type` lines (erased at build time),
//   - the guest routes and their wiring (listed explicitly below),
//   - javni-meni-uzivo.tsx and gost-razdelnik.tsx, which reach
//     `../gost/ostrvo` only through `dynamic(() => import("../gost/ostrvo"))`.
// javni-meni.tsx itself never touches the folder: the bar and the ordering in
// the detail reach it as props (`radnjeGosta`, `dodajUKorpu`).
//
// The sources are read as text (no bundler involved), like purity.test.ts.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const JAVNI_DIR = path.join(ROOT, "components", "menu", "javni");
const GOST_DIR = path.join(ROOT, "components", "menu", "gost");
const APP_MENI_DIR = path.join(ROOT, "app", "[slug]", "meni");

/** Guest routes and wiring: they render or pass the guest's components, so they may import them statically. */
const DOZVOLJENI_STATICKI = [
  "app/[slug]/meni/room-service/page.tsx",
  "app/[slug]/meni/zahtevi/page.tsx",
  "app/[slug]/meni/_lib/prikaz.tsx",
];

/** The two files that load the guest chunk lazily, and the one module they may load. */
const LENJI = ["components/menu/javni/javni-meni-uzivo.tsx", "components/menu/javni/gost-razdelnik.tsx"];
const LENJI_CILJ = path.join(GOST_DIR, "ostrvo");

function izvorniFajlovi(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...izvorniFajlovi(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const rel = (fajl: string) => path.relative(ROOT, fajl).split(path.sep).join("/");
const procitaj = (relativno: string) => readFileSync(path.join(ROOT, ...relativno.split("/")), "utf8");

type Uvoz = {
  specifier: string;
  /** `tip`: `import type` / `export type … from`; `dinamicki`: `import("…")`. */
  vrsta: "staticki" | "tip" | "dinamicki";
  /** The text right before a dynamic import (to see it is wrapped in next/dynamic). */
  pre: string;
};

function uvozi(izvor: string): Uvoz[] {
  const out: Uvoz[] = [];
  for (const m of izvor.matchAll(/^\s*import\s+(type\s+)?[^'"]*?from\s+["']([^"']+)["']/gm)) {
    out.push({ specifier: m[2], vrsta: m[1] ? "tip" : "staticki", pre: "" });
  }
  for (const m of izvor.matchAll(/^\s*export\s+(type\s+)?(?:\*|\{)[^'"]*?from\s+["']([^"']+)["']/gm)) {
    out.push({ specifier: m[2], vrsta: m[1] ? "tip" : "staticki", pre: "" });
  }
  for (const m of izvor.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) {
    out.push({ specifier: m[1], vrsta: "staticki", pre: "" });
  }
  for (const m of izvor.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    out.push({ specifier: m[1], vrsta: "staticki", pre: "" });
  }
  for (const m of izvor.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    const od = m.index ?? 0;
    out.push({ specifier: m[1], vrsta: "dinamicki", pre: izvor.slice(Math.max(0, od - 60), od) });
  }
  return out;
}

/** The absolute path a relative or `@/` specifier points to; null for a package. */
function razresi(fajl: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return path.join(ROOT, ...specifier.slice(2).split("/"));
  if (specifier.startsWith(".")) return path.resolve(path.dirname(fajl), specifier);
  return null;
}

function uGostu(fajl: string, uvoz: Uvoz): boolean {
  const cilj = razresi(fajl, uvoz.specifier);
  return cilj !== null && (cilj === GOST_DIR || cilj.startsWith(GOST_DIR + path.sep));
}

const JAVNI = izvorniFajlovi(JAVNI_DIR);
const APP = izvorniFajlovi(APP_MENI_DIR);
const SVI = [...JAVNI, ...APP];

describe("the scanner itself", () => {
  const par = (izvor: string) => uvozi(izvor).map((uvoz) => [uvoz.vrsta, uvoz.specifier]);

  test("it tells static, type-only and dynamic imports apart", () => {
    expect(par('import { A } from "../gost/ostrvo";')).toEqual([["staticki", "../gost/ostrvo"]]);
    expect(par('import B from "@/components/menu/gost/model";')).toEqual([["staticki", "@/components/menu/gost/model"]]);
    expect(par('import type { C } from "../gost/ostrvo";')).toEqual([["tip", "../gost/ostrvo"]]);
    expect(par('import "../gost/gost.module.css";')).toEqual([["staticki", "../gost/gost.module.css"]]);
    expect(par('export { D } from "../gost/ostrvo";')).toEqual([["staticki", "../gost/ostrvo"]]);
    expect(par('export type { E } from "../gost/ostrvo";')).toEqual([["tip", "../gost/ostrvo"]]);
    expect(par('const F = dynamic(() => import("../gost/ostrvo"));')).toEqual([["dinamicki", "../gost/ostrvo"]]);
    expect(par('const G = require("../gost/ostrvo");')).toEqual([["staticki", "../gost/ostrvo"]]);
  });

  test("it reads a multi-line import and ignores code that only mentions the word", () => {
    const viseRedova = ["import {", "  H,", "  I,", '} from "../gost/ostrvo";'].join("\n");
    expect(par(viseRedova)).toEqual([["staticki", "../gost/ostrvo"]]);
    expect(par('const J = "from ../gost/ostrvo"; // import K from "../gost/ostrvo"')).toEqual([]);
  });

  test("it resolves both the relative and the alias form into the guest folder, and nothing else", () => {
    const fajl = path.join(JAVNI_DIR, "probni.tsx");
    const gost = (specifier: string) => uGostu(fajl, { specifier, vrsta: "staticki", pre: "" });
    expect(gost("../gost/ostrvo")).toBe(true);
    expect(gost("../gost")).toBe(true);
    expect(gost("@/components/menu/gost/model")).toBe(true);
    expect(gost("./gost-razdelnik")).toBe(false);
    expect(gost("../izlog/gost-izlog")).toBe(false);
    expect(gost("@/lib/i18n/sr/menu-gost")).toBe(false);
    expect(gost("react")).toBe(false);
  });
});

describe("the JS budget of a plain menu link", () => {
  test("there are files to check, and the explicit lists still name real files", () => {
    expect(JAVNI.length).toBeGreaterThan(10);
    expect(APP.length).toBeGreaterThan(3);
    const poznati = new Set(SVI.map(rel));
    for (const fajl of [...DOZVOLJENI_STATICKI, ...LENJI, "components/menu/javni/javni-meni.tsx"]) {
      expect(poznati.has(fajl), fajl).toBe(true);
    }
    // The guest folder exists and has its entry points.
    for (const ime of ["ostrvo.tsx", "gost-panel.tsx", "dodaj-u-korpu.tsx", "moji-zahtevi.tsx"]) {
      expect(statSync(path.join(GOST_DIR, ime)).isFile(), ime).toBe(true);
    }
  });

  test("no static import of components/menu/gost, except type-only imports and the guest routes", () => {
    const prekrsaji = SVI.filter((fajl) => !DOZVOLJENI_STATICKI.includes(rel(fajl))).flatMap((fajl) =>
      uvozi(readFileSync(fajl, "utf8"))
        .filter((uvoz) => uvoz.vrsta === "staticki" && uGostu(fajl, uvoz))
        .map((uvoz) => `${rel(fajl)} → ${uvoz.specifier}`),
    );
    expect(prekrsaji).toEqual([]);
  });

  test("the guest chunk is reached lazily, only as dynamic(() => import(\"../gost/ostrvo\")), only from the two lazy files", () => {
    const lenji = new Set(LENJI);
    const dinamicki = SVI.flatMap((fajl) =>
      uvozi(readFileSync(fajl, "utf8"))
        .filter((uvoz) => uvoz.vrsta === "dinamicki" && uGostu(fajl, uvoz))
        .map((uvoz) => ({ fajl: rel(fajl), uvoz, cilj: razresi(fajl, uvoz.specifier) })),
    );

    // Nobody else loads it dynamically, and nobody loads anything else of it.
    expect(dinamicki.filter((red) => !lenji.has(red.fajl)).map((red) => `${red.fajl} → ${red.uvoz.specifier}`)).toEqual([]);
    expect(dinamicki.filter((red) => red.cilj !== LENJI_CILJ).map((red) => `${red.fajl} → ${red.uvoz.specifier}`)).toEqual([]);
    // Every one of them is wrapped in next/dynamic.
    expect(
      dinamicki.filter((red) => !/\bdynamic\(\s*\(\)\s*=>\s*$/.test(red.uvoz.pre)).map((red) => `${red.fajl} → ${red.uvoz.specifier}`),
    ).toEqual([]);

    // And both lazy files really do it (the budget design has not quietly gone away).
    for (const fajl of LENJI) {
      expect(dinamicki.filter((red) => red.fajl === fajl).length, fajl).toBeGreaterThan(0);
      expect(procitaj(fajl), fajl).toMatch(/import\s+dynamic\s+from\s+["']next\/dynamic["']/);
    }
  });

  test("the lazy files import the guest folder statically only as types", () => {
    for (const fajl of LENJI) {
      const uGostuUvozi = uvozi(procitaj(fajl)).filter((uvoz) => uGostu(path.join(ROOT, ...fajl.split("/")), uvoz));
      expect(uGostuUvozi.filter((uvoz) => uvoz.vrsta === "staticki"), fajl).toEqual([]);
      expect(uGostuUvozi.filter((uvoz) => uvoz.vrsta === "tip").length, fajl).toBeGreaterThan(0);
    }
  });

  test("javni-meni.tsx never imports from the guest folder at all: no static, type-only or dynamic import", () => {
    const fajl = path.join(JAVNI_DIR, "javni-meni.tsx");
    const izvor = readFileSync(fajl, "utf8");
    expect(uvozi(izvor).filter((uvoz) => uGostu(fajl, uvoz)).map((uvoz) => uvoz.specifier)).toEqual([]);
    expect(izvor).not.toMatch(/next\/dynamic/);
    // The guest UI reaches it only through these two slots.
    expect(izvor).toContain("radnjeGosta");
    expect(izvor).toContain("dodajUKorpu");
  });

  test("the article detail takes the ordering as a slot, with no import of the guest folder", () => {
    const fajl = path.join(JAVNI_DIR, "detalj.tsx");
    const izvor = readFileSync(fajl, "utf8");
    expect(uvozi(izvor).filter((uvoz) => uGostu(fajl, uvoz))).toEqual([]);
    expect(izvor).toContain("poruci");
  });
});
