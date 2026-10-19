// @vitest-environment node
// Rasklapanje u pregledaču (applyExplode, maxExplodedX, nodeBox) radi bez alokacija, pa formulu ponavlja
// ručno; mora da daje isti pomeraj kao explodeOffset iz lib/auto3d/explode.ts (ista formula kao Blender).
// A13: paritet do sada nije bio testiran.

import { Object3D, Vector3 } from "three";
import { describe, expect, test } from "vitest";
import { EXPLODE_WINDOWS } from "@/lib/auto3d/catalog";
import { explodeOffset } from "@/lib/auto3d/explode";
import type { Vec3 } from "@/lib/auto3d/manifest";
import { applyExplode, maxExplodedX, nodeBox } from "./explode";
import type { PartNode } from "./registry";

function node(base: Vec3, dir: Vec3, dist: number, stage: number): PartNode {
  const object = new Object3D();
  object.position.set(...base);
  return {
    name: "part__motor__karter",
    partId: "karter",
    system: "motor",
    instance: "",
    object,
    meshes: [],
    base: new Vector3(...base),
    dir,
    dist,
    stage,
    focus: { dist: 2, az: 0, el: 0 },
    box: { min: [base[0] - 0.1, base[1] - 0.2, base[2] - 0.3], max: [base[0] + 0.1, base[1] + 0.2, base[2] + 0.3] },
  };
}

const s = Math.SQRT1_2;
const nodes = [node([0.4, 0.5, 1.2], [1, 0, 0], 0.8, 0), node([-0.3, 0.2, -1.1], [0, s, -s], 1.2, 1), node([0.1, 0.9, 0.3], [0, 1, 0], 0.5, 2), node([0.6, 0.3, 2.0], [s, 0, s], 0.9, 3)];
const STEPS = [0, 0.07, 0.2, 0.33, 0.5, 0.61, 0.8, 0.95, 1];

describe("rasklapanje u pregledaču = explodeOffset", () => {
  test("applyExplode: položaj = osnova + pomeraj, u svim fazama", () => {
    for (const p of STEPS) {
      applyExplode(nodes, p, EXPLODE_WINDOWS);
      for (const n of nodes) {
        const o = explodeOffset(n.dir, n.dist, n.stage, p, EXPLODE_WINDOWS);
        expect(n.object.position.x).toBeCloseTo(n.base.x + o[0], 9);
        expect(n.object.position.y).toBeCloseTo(n.base.y + o[1], 9);
        expect(n.object.position.z).toBeCloseTo(n.base.z + o[2], 9);
      }
    }
  });

  test("nodeBox i maxExplodedX prate isti pomeraj", () => {
    for (const p of STEPS) {
      let maxX = -10;
      for (const n of nodes) {
        const o = explodeOffset(n.dir, n.dist, n.stage, p, EXPLODE_WINDOWS);
        const b = nodeBox(n, p, EXPLODE_WINDOWS);
        for (let i = 0; i < 3; i++) {
          expect(b.min[i]).toBeCloseTo(n.box.min[i] + o[i], 9);
          expect(b.max[i]).toBeCloseTo(n.box.max[i] + o[i], 9);
        }
        maxX = Math.max(maxX, n.box.max[0] + o[0]);
      }
      expect(maxExplodedX(nodes, p, EXPLODE_WINDOWS, -10)).toBeCloseTo(maxX, 9);
      expect(maxExplodedX(nodes, p, EXPLODE_WINDOWS, 9)).toBe(9);
    }
  });
});
