// Picking (A03 §1.5): pretprolaz po kutijama mreža (bez BVH-a), pa tačan raycast od najbliže.
// Rendgen ljuska i staklo „propuštaju“: bira se neprozirni deo iza njih, a ljuska tek ako iza nema ničega.
// Raycaster ne gleda `visible`, pa lista za picking sadrži samo vidljive i neprigušene mreže.

import { Box3, Ray, Raycaster, Vector2, Vector3, type Camera, type Mesh } from "three";
import type { Instance, PartId } from "@/lib/auto3d/catalog";
import type { Mode } from "@/lib/auto3d/filter";
import { GLASSY } from "@/lib/auto3d/xray";
import { nearestHit } from "./mesh-ray";
import type { MeshTag } from "./registry";

export type PickHit = { partId: PartId; instance: Instance | "" };

export class Picker {
  private raycaster = new Raycaster();
  private ndc = new Vector2();
  private list: Mesh[] = [];
  private boxes: Box3[] = [];
  private dirty = true;
  private hitPoint = new Vector3();
  private tmpDir = new Vector3();
  /** Delovi koji su providni jer zaklanjaju izabrani deo: klik prolazi kroz njih. */
  ghosts: ReadonlySet<string> = new Set();
  lastMs = 0;

  setPickables(meshes: Mesh[]) {
    this.list = meshes;
    this.dirty = true;
  }

  /** Kutije se računaju ponovo posle rasklapanja. */
  invalidate() {
    this.dirty = true;
  }

  /** Kutije u svetu; postojeći Box3 objekti se ponovo koriste (rasklapanje ih obnavlja često). */
  private refresh() {
    const n = this.list.length;
    for (let i = 0; i < n; i++) {
      const m = this.list[i];
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const box = this.boxes[i] ?? (this.boxes[i] = new Box3());
      box.copy(m.geometry.boundingBox as Box3).applyMatrix4(m.matrixWorld);
    }
    this.boxes.length = n;
    this.dirty = false;
  }

  /** Ljuska u rendgenu, staklo i providni zaklanjači: klik prolazi kroz njih do neprozirnog dela. */
  private seeThrough(tag: MeshTag, mode: Mode): boolean {
    return GLASSY.has(tag.slot) || (mode !== "lak" && tag.system === "karoserija") || this.ghosts.has(tag.key);
  }

  pick(x: number, y: number, width: number, height: number, camera: Camera, mode: Mode, sectionX: number | null): PickHit | null {
    const t0 = performance.now();
    if (this.dirty) this.refresh();
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, camera);
    const ray: Ray = this.raycaster.ray;
    const candidates: Array<{ i: number; d: number }> = [];
    for (let i = 0; i < this.boxes.length; i++) {
      const p = ray.intersectBox(this.boxes[i], this.hitPoint);
      if (p) candidates.push({ i, d: ray.origin.distanceTo(p) });
    }
    candidates.sort((a, b) => a.d - b.d);
    // Prvo neprozirni delovi (od najbližeg; staje se kad je pogodak bliži od sledeće kutije). Providne
    // mreže (velika ljuska karoserije) se seku samo ako iza njih nema ničega: rezultat je isti, a
    // tačan raycast ljuske je najskuplji deo picking-a (A12: p95 3,7 ms → ispod 2 ms).
    const accept = sectionX === null ? undefined : (p: Vector3) => p.x <= sectionX;
    const hitOf = (i: number) => nearestHit(this.raycaster, this.list[i], accept);
    let opaque: { d: number; tag: MeshTag } | null = null;
    for (const c of candidates) {
      if (opaque && c.d > opaque.d) break;
      const tag = this.list[c.i].userData.a3 as MeshTag;
      if (!tag?.partId || this.seeThrough(tag, mode)) continue;
      const hit = hitOf(c.i);
      if (hit && (!opaque || hit.distance < opaque.d)) opaque = { d: hit.distance, tag };
    }
    let passed: { d: number; tag: MeshTag } | null = null;
    if (!opaque) {
      for (const c of candidates) {
        if (passed && c.d > passed.d) break;
        const tag = this.list[c.i].userData.a3 as MeshTag;
        if (!tag?.partId || !this.seeThrough(tag, mode)) continue;
        const hit = hitOf(c.i);
        if (hit && (!passed || hit.distance < passed.d)) passed = { d: hit.distance, tag };
      }
    }
    this.lastMs = performance.now() - t0;
    const best = opaque ?? passed;
    return best?.tag.partId ? { partId: best.tag.partId, instance: best.tag.instance } : null;
  }

  /**
   * Prvi neprozirni deo na duži od `from` do `to` (rendgen ljuska i staklo propuštaju), ili null.
   * Služi kameri da izabere ugao iz kog se izabrani deo vidi (A04: točak je zaklanjao turbopunjač).
   */
  firstOpaque(from: Vector3, to: Vector3, mode: Mode, skip: ReadonlySet<string>): string | null {
    if (this.dirty) this.refresh();
    const dir = this.tmpDir.subVectors(to, from);
    const far = dir.length();
    if (far < 1e-6) return null;
    dir.divideScalar(far);
    this.raycaster.set(from, dir);
    this.raycaster.far = far;
    const ray = this.raycaster.ray;
    const candidates: Array<{ i: number; d: number }> = [];
    for (let i = 0; i < this.boxes.length; i++) {
      const p = ray.intersectBox(this.boxes[i], this.hitPoint);
      if (p) {
        const d = ray.origin.distanceTo(p);
        if (d <= far) candidates.push({ i, d });
      }
    }
    candidates.sort((a, b) => a.d - b.d);
    let best: { d: number; key: string } | null = null;
    for (const c of candidates) {
      if (best && c.d > best.d) break;
      const mesh = this.list[c.i];
      const tag = mesh.userData.a3 as MeshTag;
      if (!tag || skip.has(tag.key)) continue;
      if (GLASSY.has(tag.slot) || (mode !== "lak" && tag.system === "karoserija")) continue;
      const hit = nearestHit(this.raycaster, mesh);
      if (hit && (!best || hit.distance < best.d)) best = { d: hit.distance, key: tag.key };
    }
    this.raycaster.far = Infinity;
    return best?.key ?? null;
  }
}
