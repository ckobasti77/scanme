// Dekodiranje GLB-a (EXT_meshopt_compression + KHR_mesh_quantization). Bafer preuzima ostrvo
// (`glb-fetch.ts`, paralelno sa ovim modulom). MeshoptDecoder radi bez web worker-a (odluka E17):
// dekodiranje 1–6 MB traje ≈ 5–15 ms.

import type { Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

export async function parseModel(buffer: ArrayBuffer): Promise<Group> {
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.parseAsync(buffer, "");
  return gltf.scene;
}
