// @vitest-environment node
// Ugovor GLB ⇔ manifest ⇔ katalog ⇔ rečnik i budžeti (PLAN §5, A01 §4.5).

import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";
import { fairAuto3dDeloviSr } from "@/lib/i18n/sr/fair-auto3d-delovi";
import { BUDGET, FILES, PUBLIC_DIR } from "./budgets";
import { DECO_NODES, DECO_NODE_PATTERN, PARTS, PART_NODE_PATTERN, ROOT_NODE, SYSTEMS, partNodes } from "./catalog";
import { glbStats, readGlbJson } from "./glb";
import { parseManifest } from "./manifest";

const ROOT = process.cwd();
const pub = (f: string) => resolve(ROOT, PUBLIC_DIR, f);
const manifest = parseManifest(JSON.parse(readFileSync(pub(FILES.manifest), "utf8")));
const glbs = {
  desktop: readGlbJson(new Uint8Array(readFileSync(pub(FILES.desktop)))).json,
  lite: readGlbJson(new Uint8Array(readFileSync(pub(FILES.lite)))).json,
};
const stats = { desktop: glbStats(glbs.desktop), lite: glbStats(glbs.lite) };
const catalogNodes = PARTS.flatMap((p) => partNodes(p)).sort();
const systemIds = new Set<string>(SYSTEMS.map((s) => s.id));

/** Širina i visina JPEG-a iz SOF markera (baseline ili progresivni). */
function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  let i = 2;
  while (i + 8 < bytes.length && bytes[i] === 0xff) {
    const marker = bytes[i + 1];
    if (marker >= 0xc0 && marker <= 0xc2) return { width: (bytes[i + 7] << 8) | bytes[i + 8], height: (bytes[i + 5] << 8) | bytes[i + 6] };
    i += 2 + ((bytes[i + 2] << 8) | bytes[i + 3]);
  }
  throw new Error("JPEG bez SOF markera");
}

describe.each(["desktop", "lite"] as const)("GLB %s", (q) => {
  const s = stats[q];

  test("čvorovi part__* ⇔ katalog (ni manjak ni višak)", () => {
    expect([...s.partNodes].sort()).toEqual(catalogNodes);
  });

  test("imena: koren limuzina, part__/deco__ po ugovoru, nema drugih imena", () => {
    expect(s.rootNames).toEqual([ROOT_NODE]);
    expect([...s.decoNodes].sort()).toEqual([...DECO_NODES].sort());
    for (const n of s.nodeNames) {
      expect(n === ROOT_NODE || PART_NODE_PATTERN.test(n) || DECO_NODE_PATTERN.test(n) || /^fx__[a-z0-9_]+$/.test(n), `ime čvora ${n}`).toBe(true);
    }
    // three.js deli mrežu sa više materijala na decu imenovanu po mreži: deca ne smeju da liče na part__ čvor
    for (const m of glbs[q].meshes ?? []) expect(m.name ?? "", "ime mreže").toMatch(/^m__/);
  });

  test("extras su potpuni i odgovaraju katalogu", () => {
    for (const p of PARTS) {
      for (const name of partNodes(p)) {
        const ex = s.extrasByNode[name] as Record<string, unknown>;
        expect(ex, name).toBeDefined();
        expect(ex.part_id).toBe(p.id);
        expect(ex.system).toBe(p.system);
        expect(systemIds.has(String(ex.system))).toBe(true);
        expect(ex.instance).toBe(name.split("__")[3] ?? "");
        const d = ex.explode_dir as number[];
        expect(Math.abs(Math.hypot(d[0], d[1], d[2]) - 1)).toBeLessThan(1e-3);
        expect(ex.explode_dist as number).toBeGreaterThanOrEqual(0);
        expect(ex.explode_dist as number).toBeLessThanOrEqual(2);
        expect([0, 1, 2, 3]).toContain(ex.explode_stage);
        const f = ex.focus as Record<string, number>;
        expect(typeof f.dist === "number" && typeof f.az === "number" && typeof f.el === "number").toBe(true);
      }
    }
  });

  test("budžet veličine, trouglova, draw call-ova i čvorova; bez tekstura", () => {
    const b = BUDGET[q];
    expect(statSync(pub(FILES[q])).size).toBeLessThanOrEqual(b.maxBytes);
    expect(s.triangles).toBeLessThanOrEqual(b.maxTriangles);
    expect(s.drawCalls).toBeLessThanOrEqual(b.maxDrawCalls);
    expect(s.nodeNames.length).toBeLessThanOrEqual(BUDGET.maxNodes);
    expect(s.textures).toBe(BUDGET.maxTextures);
  });

  test("kompresija: samo meshopt i kvantizacija", () => {
    // Pregledač (viewer/loader.ts) ima samo MeshoptDecoder: Draco GLB bi prošao test, a pao u pregledaču (A13).
    for (const e of glbs[q].extensionsRequired ?? []) {
      expect(["EXT_meshopt_compression", "KHR_mesh_quantization"]).toContain(e);
    }
  });
});

describe("manifest ⇔ GLB ⇔ katalog ⇔ rečnik", () => {
  test("isti delovi, redosled i čvorovi kao u katalogu", () => {
    expect(manifest.parts.map((p) => p.id)).toEqual(PARTS.map((p) => p.id));
    for (const p of PARTS) {
      const mp = manifest.parts.find((x) => x.id === p.id)!;
      expect(mp.system).toBe(p.system);
      expect(mp.nodes.map((n) => n.name)).toEqual(partNodes(p));
      expect(mp.primary).toBe(partNodes(p)[0]);
    }
    expect(manifest.systems.map((s) => s.id)).toEqual(SYSTEMS.map((s) => s.id));
  });

  test("rasklapanje i fokus u manifestu jednaki su extras-ima desktop GLB-a", () => {
    for (const mp of manifest.parts) {
      for (const n of mp.nodes) {
        const ex = stats.desktop.extrasByNode[n.name] as Record<string, unknown>;
        expect(n.explode.dir).toEqual(ex.explode_dir);
        expect(n.explode.dist).toBe(ex.explode_dist);
        expect(mp.stage).toBe(ex.explode_stage);
        expect(n.focus).toEqual(ex.focus);
      }
    }
  });

  test("statistika u manifestu odgovara JSON bloku GLB-a", () => {
    expect(manifest.files.desktop.triangles).toBe(stats.desktop.triangles);
    expect(manifest.files.desktop.drawCalls).toBe(stats.desktop.drawCalls);
    expect(manifest.files.lite.triangles).toBe(stats.lite.triangles);
    expect(manifest.files.lite.drawCalls).toBe(stats.lite.drawCalls);
    expect(manifest.files.desktop.bytes).toBe(statSync(pub(FILES.desktop)).size);
    expect(manifest.files.lite.bytes).toBe(statSync(pub(FILES.lite)).size);
  });

  test("geometrija ostaje u obrisu auta (nema zalutalih temena)", () => {
    expect(manifest.bbox.min[1]).toBeGreaterThanOrEqual(-0.01);
    expect(manifest.bbox.min[2]).toBeGreaterThanOrEqual(-2.7);
    expect(manifest.bbox.max[2]).toBeLessThanOrEqual(2.45);
    expect(Math.max(Math.abs(manifest.bbox.min[0]), Math.abs(manifest.bbox.max[0]))).toBeLessThanOrEqual(1.1);
    expect(manifest.bbox.max[1]).toBeLessThanOrEqual(1.5);
  });

  test("svaki deo iz manifesta ima tekst u rečniku", () => {
    for (const mp of manifest.parts) {
      const copy = fairAuto3dDeloviSr.parts[mp.id];
      expect(copy.name.length).toBeGreaterThan(0);
      expect(copy.specs.length).toBeGreaterThanOrEqual(3);
    }
  });

  test("og.jpg je 1200 × 630 (PLAN §5), kao u manifestu", () => {
    const og = manifest.files.og;
    expect(og).not.toBeNull();
    const size = jpegSize(new Uint8Array(readFileSync(resolve(ROOT, "public" + og!.url))));
    expect(size).toEqual(BUDGET.og);
    expect({ width: og!.width, height: og!.height }).toEqual(BUDGET.og);
  });

  test("posteri postoje i AVIF je u budžetu", () => {
    for (const [key, p] of Object.entries(manifest.files.posters)) {
      if (p.avif) expect(statSync(resolve(ROOT, "public" + p.avif)).size, key).toBeLessThanOrEqual(BUDGET.posterAvifMaxBytes);
      if (p.webp) expect(statSync(resolve(ROOT, "public" + p.webp)).size, key).toBeLessThanOrEqual(BUDGET.posterWebpMaxBytes);
    }
    expect(manifest.files.posters["sklopljen-desktop"]).toBeDefined();
  });
});

describe("validator manifesta", () => {
  test("odbija neispravan smer rasklapanja i nepoznat deo", () => {
    const raw = JSON.parse(readFileSync(pub(FILES.manifest), "utf8"));
    const bad = structuredClone(raw);
    bad.parts[0].nodes[0].explode.dir = [1, 1, 0];
    expect(() => parseManifest(bad)).toThrow(/jedinični/);
    const bad2 = structuredClone(raw);
    bad2.parts[0].id = "nepostojeci_deo";
    expect(() => parseManifest(bad2)).toThrow(/nepoznat deo/);
  });
});
