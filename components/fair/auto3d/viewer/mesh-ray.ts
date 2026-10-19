// Brži tačan raycast velikih mreža (A12, A03 R4: picking bez BVH paketa). Trouglovi mreže su podeljeni
// u uzastopne grupe od 256, svaka sa kutijom u lokalnom prostoru (meshopt redosled drži susedne trouglove
// blizu). Zrak proverava samo trouglove grupa čiju kutiju seče, istim testom trougla kao `Mesh.raycast`
// (strana materijala, near/far). Male mreže, mreže sa grupama i morph mrežama idu kroz three.

import { BackSide, Box3, FrontSide, Matrix4, Ray, Vector3, type BufferGeometry, type Material, type Mesh, type Raycaster } from "three";

export type MeshHit = { distance: number; point: Vector3 };

const CHUNK = 256;
/** Ispod ovoga three-ov raycast je dovoljno brz. */
const MIN_TRIANGLES = 2048;

type Chunks = { boxes: Box3[]; triangles: number };

const cache = new WeakMap<BufferGeometry, Chunks | null>();
const inverse = new Matrix4();
const local = new Ray();
const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const hitLocal = new Vector3();
const hitWorld = new Vector3();

function vertexIndex(geometry: BufferGeometry, i: number): number {
  return geometry.index ? geometry.index.getX(i) : i;
}

function chunksOf(geometry: BufferGeometry): Chunks | null {
  const cached = cache.get(geometry);
  if (cached !== undefined) return cached;
  let out: Chunks | null = null;
  const pos = geometry.attributes.position;
  const count = geometry.index ? geometry.index.count : pos?.count ?? 0;
  const range = geometry.drawRange;
  const fullRange = range.start === 0 && range.count >= count;
  if (pos && fullRange && geometry.groups.length === 0 && !geometry.morphAttributes.position && count / 3 >= MIN_TRIANGLES) {
    const triangles = Math.floor(count / 3);
    const boxes: Box3[] = [];
    for (let t0 = 0; t0 < triangles; t0 += CHUNK) {
      const box = new Box3();
      const t1 = Math.min(triangles, t0 + CHUNK);
      for (let i = t0 * 3; i < t1 * 3; i++) box.expandByPoint(a.fromBufferAttribute(pos, vertexIndex(geometry, i)));
      boxes.push(box);
    }
    out = { boxes, triangles };
  }
  cache.set(geometry, out);
  return out;
}

/** Unapred pravi kutije grupa (idle posle `ready`), da prvi hover preko velike mreže ne kasni. */
export function prepareMesh(mesh: Mesh) {
  if (!Array.isArray(mesh.material)) chunksOf(mesh.geometry);
}

/** Najbliži pogodak zraka u mrežu koji prihvata `accept` (svet), kao prvi prihvaćen iz `intersectObject`. */
export function nearestHit(raycaster: Raycaster, mesh: Mesh, accept?: (point: Vector3) => boolean): MeshHit | null {
  const geometry = mesh.geometry;
  const chunks = Array.isArray(mesh.material) ? null : chunksOf(geometry);
  if (!chunks) {
    for (const h of raycaster.intersectObject(mesh, false)) if (!accept || accept(h.point)) return { distance: h.distance, point: h.point };
    return null;
  }
  const side = (mesh.material as Material).side;
  const pos = geometry.attributes.position;
  inverse.copy(mesh.matrixWorld).invert();
  local.copy(raycaster.ray).applyMatrix4(inverse);
  let best: MeshHit | null = null;
  for (let k = 0; k < chunks.boxes.length; k++) {
    if (!local.intersectsBox(chunks.boxes[k])) continue;
    const t1 = Math.min(chunks.triangles, (k + 1) * CHUNK);
    for (let t = k * CHUNK; t < t1; t++) {
      a.fromBufferAttribute(pos, vertexIndex(geometry, t * 3));
      b.fromBufferAttribute(pos, vertexIndex(geometry, t * 3 + 1));
      c.fromBufferAttribute(pos, vertexIndex(geometry, t * 3 + 2));
      const p = side === BackSide ? local.intersectTriangle(c, b, a, true, hitLocal) : local.intersectTriangle(a, b, c, side === FrontSide, hitLocal);
      if (!p) continue;
      hitWorld.copy(hitLocal).applyMatrix4(mesh.matrixWorld);
      const distance = raycaster.ray.origin.distanceTo(hitWorld);
      if (distance < raycaster.near || distance > raycaster.far) continue;
      if (best && distance >= best.distance) continue;
      if (accept && !accept(hitWorld)) continue;
      best = { distance, point: hitWorld.clone() };
    }
  }
  return best;
}
