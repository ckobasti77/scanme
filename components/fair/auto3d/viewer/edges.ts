// Bela ivica dela (A03 §2.3, odluka E2 — bez postprocesa): EdgesGeometry se pravi lenjo i kešira po
// geometriji. Izbor: vidljive ivice jače, skrivene (kroz karoseriju) slabije. Hover: samo vidljive,
// slabije, da se vidi i na svetlim delovima (felne, enterijer) gde posvetljenje boje ne dolazi do izražaja.

import { EdgesGeometry, LineBasicMaterial, LineSegments, type BufferGeometry, type Mesh, type Plane } from "three";

export class SelectionEdges {
  private cache: Map<string, EdgesGeometry>;
  private lines: LineSegments[] = [];
  private visibleMat: LineBasicMaterial;
  private hiddenMat: LineBasicMaterial | null;

  constructor(opts: { visible: number; hidden: number | null }, cache = new Map<string, EdgesGeometry>()) {
    this.cache = cache;
    this.visibleMat = new LineBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: opts.visible, depthWrite: false, toneMapped: false });
    this.hiddenMat =
      opts.hidden === null
        ? null
        : new LineBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: opts.hidden, depthWrite: false, depthTest: false, toneMapped: false });
  }

  /** Ivice prate presek (A10). */
  setClipping(plane: Plane) {
    this.visibleMat.clippingPlanes = [plane];
    if (this.hiddenMat) this.hiddenMat.clippingPlanes = [plane];
  }

  /** Keš ivica (deli se između izbora i hover-a). */
  get edgeCache(): Map<string, EdgesGeometry> {
    return this.cache;
  }

  private edgesOf(geometry: BufferGeometry): EdgesGeometry {
    let e = this.cache.get(geometry.uuid);
    if (!e) {
      e = new EdgesGeometry(geometry, 30);
      this.cache.set(geometry.uuid, e);
    }
    return e;
  }

  show(meshes: Mesh[]) {
    this.clear();
    for (const mesh of meshes) {
      const e = this.edgesOf(mesh.geometry);
      const passes: Array<[LineBasicMaterial, number]> = [[this.visibleMat, 10]];
      if (this.hiddenMat) passes.unshift([this.hiddenMat, 11]);
      for (const [mat, order] of passes) {
        const line = new LineSegments(e, mat);
        line.renderOrder = order;
        line.raycast = () => {};
        line.name = "a3_edges";
        mesh.add(line);
        this.lines.push(line);
      }
    }
  }

  clear() {
    for (const l of this.lines) l.parent?.remove(l);
    this.lines = [];
  }

  dispose() {
    this.clear();
    for (const e of this.cache.values()) e.dispose();
    this.cache.clear();
    this.visibleMat.dispose();
    this.hiddenMat?.dispose();
  }
}
