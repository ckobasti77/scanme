// Čitač JSON bloka GLB fajla, bez three-a (A01 §4.5). Radi u Node-u, edge okruženju i browseru:
// koristi samo DataView i TextDecoder. Fajl namerno nema importe.

export type GltfNode = {
  name?: string;
  mesh?: number;
  children?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  matrix?: number[];
  extras?: Record<string, unknown>;
};

export type GltfPrimitive = { attributes: Record<string, number>; indices?: number; material?: number; mode?: number };

export type GltfJson = {
  asset: { version: string; generator?: string };
  scene?: number;
  scenes?: Array<{ nodes?: number[] }>;
  nodes?: GltfNode[];
  meshes?: Array<{ name?: string; primitives: GltfPrimitive[] }>;
  materials?: Array<{ name?: string }>;
  accessors?: Array<{ count: number; type: string; componentType: number }>;
  textures?: unknown[];
  images?: unknown[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
};

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

/** Čita zaglavlje i JSON blok GLB-a (verzija 2). Baca grešku za neispravan fajl. */
export function readGlbJson(bytes: Uint8Array): { json: GltfJson; binLength: number } {
  if (bytes.byteLength < 20) throw new Error("GLB je prekratak");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("nije GLB (magic)");
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`nepodržana GLB verzija ${version}`);
  const length = view.getUint32(8, true);
  if (length > bytes.byteLength) throw new Error("GLB dužina je veća od fajla");
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON) throw new Error("prvi blok nije JSON");
  const jsonBytes = bytes.subarray(20, 20 + jsonLength);
  const json = JSON.parse(new TextDecoder().decode(jsonBytes)) as GltfJson;
  let binLength = 0;
  const next = 20 + jsonLength;
  if (next + 8 <= length && view.getUint32(next + 4, true) === CHUNK_BIN) binLength = view.getUint32(next, true);
  return { json, binLength };
}

export type GlbStats = {
  nodeNames: string[];
  partNodes: string[];
  decoNodes: string[];
  rootNames: string[];
  triangles: number;
  drawCalls: number;
  trianglesByNode: Record<string, number>;
  materialsByNode: Record<string, string[]>;
  extrasByNode: Record<string, Record<string, unknown>>;
  materialNames: string[];
  textures: number;
};

function primitiveTriangles(json: GltfJson, p: GltfPrimitive): number {
  const mode = p.mode ?? 4;
  if (mode !== 4) return 0;
  const count = p.indices !== undefined ? json.accessors?.[p.indices]?.count : json.accessors?.[p.attributes.POSITION]?.count;
  return Math.floor((count ?? 0) / 3);
}

/** Statistika iz JSON bloka: trouglovi i draw call-ovi po čvoru (instance se broje), extras. */
export function glbStats(json: GltfJson): GlbStats {
  const nodes = json.nodes ?? [];
  const stats: GlbStats = {
    nodeNames: [],
    partNodes: [],
    decoNodes: [],
    rootNames: [],
    triangles: 0,
    drawCalls: 0,
    trianglesByNode: {},
    materialsByNode: {},
    extrasByNode: {},
    materialNames: (json.materials ?? []).map((m) => m.name ?? ""),
    textures: (json.textures ?? []).length,
  };
  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  stats.rootNames = sceneRoots.map((i) => nodes[i]?.name ?? "");
  nodes.forEach((n) => {
    const name = n.name ?? "";
    stats.nodeNames.push(name);
    if (name.startsWith("part__")) stats.partNodes.push(name);
    if (name.startsWith("deco__")) stats.decoNodes.push(name);
    if (n.extras && name.startsWith("part__")) stats.extrasByNode[name] = n.extras;
    if (n.mesh === undefined) return;
    const mesh = json.meshes?.[n.mesh];
    if (!mesh) return;
    let tris = 0;
    const mats = new Set<string>();
    for (const p of mesh.primitives) {
      tris += primitiveTriangles(json, p);
      stats.drawCalls += 1;
      if (p.material !== undefined) mats.add(stats.materialNames[p.material] ?? "");
    }
    stats.triangles += tris;
    stats.trianglesByNode[name] = (stats.trianglesByNode[name] ?? 0) + tris;
    stats.materialsByNode[name] = [...mats].sort();
  });
  return stats;
}
