import { describe, expect, test } from "vitest";
import { glbStats, readGlbJson, type GltfJson } from "./glb";

function makeGlb(json: GltfJson, bin = new Uint8Array(4)): Uint8Array {
  const enc = new TextEncoder().encode(JSON.stringify(json));
  const jsonLen = Math.ceil(enc.length / 4) * 4;
  const binLen = Math.ceil(bin.length / 4) * 4;
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, jsonLen, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(enc, 20);
  for (let i = enc.length; i < jsonLen; i++) out[20 + i] = 0x20;
  v.setUint32(20 + jsonLen, binLen, true);
  v.setUint32(24 + jsonLen, 0x004e4942, true);
  out.set(bin, 28 + jsonLen);
  return out;
}

const SAMPLE: GltfJson = {
  asset: { version: "2.0" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [
    { name: "limuzina", children: [1, 2, 3] },
    { name: "part__kocnice__disk_prednji__l", mesh: 0, extras: { part_id: "disk_prednji", system: "kocnice" } },
    { name: "part__kocnice__disk_prednji__d", mesh: 0 },
    { name: "deco__karoserija__pod", mesh: 1 },
  ],
  meshes: [
    { primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }, { attributes: { POSITION: 0 }, indices: 2, material: 1 }] },
    { primitives: [{ attributes: { POSITION: 0 }, indices: 2, material: 1 }] },
  ],
  materials: [{ name: "mat_brake_disc" }, { name: "mat_cast" }],
  accessors: [
    { count: 10, type: "VEC3", componentType: 5126 },
    { count: 30, type: "SCALAR", componentType: 5125 },
    { count: 12, type: "SCALAR", componentType: 5125 },
  ],
};

describe("čitač GLB JSON bloka", () => {
  test("čita JSON i dužinu binarnog bloka", () => {
    const { json, binLength } = readGlbJson(makeGlb(SAMPLE, new Uint8Array(8)));
    expect(json.nodes?.[1].name).toBe("part__kocnice__disk_prednji__l");
    expect(binLength).toBe(8);
  });

  test("broji trouglove i draw call-ove po instanci čvora", () => {
    const s = glbStats(readGlbJson(makeGlb(SAMPLE)).json);
    expect(s.partNodes).toEqual(["part__kocnice__disk_prednji__l", "part__kocnice__disk_prednji__d"]);
    expect(s.decoNodes).toEqual(["deco__karoserija__pod"]);
    expect(s.rootNames).toEqual(["limuzina"]);
    expect(s.trianglesByNode["part__kocnice__disk_prednji__l"]).toBe(14);
    expect(s.triangles).toBe(14 + 14 + 4);
    expect(s.drawCalls).toBe(5);
    expect(s.materialsByNode["part__kocnice__disk_prednji__l"]).toEqual(["mat_brake_disc", "mat_cast"]);
    expect(s.extrasByNode["part__kocnice__disk_prednji__l"]).toEqual({ part_id: "disk_prednji", system: "kocnice" });
  });

  test("odbija fajl koji nije GLB", () => {
    expect(() => readGlbJson(new Uint8Array(32))).toThrow(/magic/);
    expect(() => readGlbJson(new Uint8Array(8))).toThrow(/prekratak/);
  });
});
