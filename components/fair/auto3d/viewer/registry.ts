// Registar delova iz učitane scene (A01 §4, A02 ODLUKE): klikabilni čvor `part__…` nosi extras u
// `userData` (GLTFLoader ga od čvora sa više materijala pravi kao Group, a decu `Mesh` imenuje
// `m__…`). Svaka mreža dobija `userData.a3` da picking i materijali znaju čija je.

import { Box3, Mesh, Vector3, type Material, type Object3D } from "three";
import type { Instance, PartId, SystemId } from "@/lib/auto3d/catalog";
import type { Auto3dManifest, ManifestFocus, Vec3 } from "@/lib/auto3d/manifest";
import type { Box } from "@/lib/auto3d/framing";

export type MeshTag = {
  key: string; // id dela ili ime deco čvora
  partId: PartId | null;
  instance: Instance | "";
  system: SystemId;
  slot: string;
};

export type PartNode = {
  name: string;
  partId: PartId;
  system: SystemId;
  instance: Instance | "";
  object: Object3D;
  meshes: Mesh[];
  base: Vector3;
  dir: Vec3;
  dist: number;
  stage: number;
  focus: ManifestFocus;
  /** Kutija sklopljenog čvora u prostoru sveta. */
  box: Box;
};

export type PartEntry = { id: PartId; system: SystemId; nodes: PartNode[] };

export type DecoNode = { name: string; system: SystemId; object: Object3D; meshes: Mesh[] };

export type Registry = {
  root: Object3D;
  parts: Map<PartId, PartEntry>;
  nodes: PartNode[];
  deco: DecoNode[];
  meshes: Mesh[];
  /** Izvorni materijali iz GLB-a (šabloni za lak; oslobađaju se pri dispose). */
  sources: Set<Material>;
};

function meshesOf(object: Object3D): Mesh[] {
  const out: Mesh[] = [];
  object.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

function toBox(b: Box3): Box {
  return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
}

export function buildRegistry(scene: Object3D, manifest: Auto3dManifest): Registry {
  scene.updateMatrixWorld(true);
  const root = scene.getObjectByName("limuzina") ?? scene;
  const byName = new Map(manifest.parts.flatMap((p) => p.nodes.map((n) => [n.name, { part: p, node: n }] as const)));
  const parts = new Map<PartId, PartEntry>();
  const nodes: PartNode[] = [];
  const deco: DecoNode[] = [];
  const meshes: Mesh[] = [];
  const sources = new Set<Material>();

  const tag = (list: Mesh[], t: Omit<MeshTag, "slot">) => {
    for (const m of list) {
      const mat = m.material as Material;
      sources.add(mat);
      m.userData.a3 = { ...t, slot: mat.name } satisfies MeshTag;
      meshes.push(m);
    }
  };

  for (const object of root.children) {
    const extras = object.userData as { part_id?: string; system?: string };
    if (extras.part_id && extras.system) {
      const m = byName.get(object.name);
      if (!m) {
        console.warn(`[auto3d] čvor ${object.name} nije u manifestu`);
        continue;
      }
      const list = meshesOf(object);
      const node: PartNode = {
        name: object.name,
        partId: m.part.id,
        system: m.part.system,
        instance: (m.node.instance || "") as Instance | "",
        object,
        meshes: list,
        base: object.position.clone(),
        dir: m.node.explode.dir,
        dist: m.node.explode.dist,
        stage: m.part.stage,
        focus: m.node.focus,
        box: toBox(new Box3().setFromObject(object, true)),
      };
      tag(list, { key: node.partId, partId: node.partId, instance: node.instance, system: node.system });
      nodes.push(node);
      const entry = parts.get(node.partId) ?? { id: node.partId, system: node.system, nodes: [] };
      entry.nodes.push(node);
      parts.set(node.partId, entry);
    } else if (object.name.startsWith("deco__")) {
      const system = object.name.split("__")[1] as SystemId;
      const list = meshesOf(object);
      tag(list, { key: object.name, partId: null, instance: "", system });
      deco.push({ name: object.name, system, object, meshes: list });
    }
  }

  // Primarna instanca (prva u manifestu) je prva u listi: fokus iz liste i deep link.
  for (const p of manifest.parts) {
    const entry = parts.get(p.id);
    if (entry) entry.nodes.sort((a, b) => p.nodes.findIndex((n) => n.name === a.name) - p.nodes.findIndex((n) => n.name === b.name));
  }
  const expected = manifest.parts.reduce((n, p) => n + p.nodes.length, 0);
  if (nodes.length !== expected) console.warn(`[auto3d] ${nodes.length} klikabilnih čvorova, manifest ih ima ${expected}`);
  return { root, parts, nodes, deco, meshes, sources };
}
