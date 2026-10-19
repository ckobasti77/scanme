// Primena rasklapanja na čvorove (formula je u lib/auto3d/explode.ts, ista kao u Blenderu).
// Koren `limuzina` nema transformaciju, pa je pomeraj u prostoru roditelja isti kao u svetu.

import type { Box } from "@/lib/auto3d/framing";
import { explodeFactor, explodeOffset, type ExplodeWindows } from "@/lib/auto3d/explode";
import type { PartNode } from "./registry";

/** Radi u svakom frejmu rasklapanja, pa bez alokacija (A12): isti pomeraj kao `explodeOffset`. */
export function applyExplode(nodes: readonly PartNode[], p: number, windows: ExplodeWindows) {
  for (const n of nodes) {
    const k = n.dist * explodeFactor(p, n.stage, windows);
    n.object.position.set(n.base.x + n.dir[0] * k, n.base.y + n.dir[1] * k, n.base.z + n.dir[2] * k);
  }
}

/** Najveće x svih čvorova pri napretku p (za presek), bez alokacija. */
export function maxExplodedX(nodes: readonly PartNode[], p: number, windows: ExplodeWindows, floor: number): number {
  let maxX = floor;
  for (const n of nodes) {
    const x = n.box.max[0] + n.dir[0] * n.dist * explodeFactor(p, n.stage, windows);
    if (x > maxX) maxX = x;
  }
  return maxX;
}

/** Kutija čvora pri napretku p (sklopljena kutija + pomeraj). */
export function nodeBox(n: PartNode, p: number, windows: ExplodeWindows): Box {
  const o = explodeOffset(n.dir, n.dist, n.stage, p, windows);
  return {
    min: [n.box.min[0] + o[0], n.box.min[1] + o[1], n.box.min[2] + o[2]],
    max: [n.box.max[0] + o[0], n.box.max[1] + o[1], n.box.max[2] + o[2]],
  };
}
