// Tipovi i validator manifesta 3D Rendgen limuzine (A01 §4.3).
//
// Manifest generišu Blender (`3d/auto3d/export.py`) i `3d/auto3d/optimize.mjs` iz scene; ručno se
// ne piše. Čuvar je bez zavisnosti (bez zod-a), da ga koriste i pregledač i testovi.

import { EXPLODE_WINDOWS, PARTS, SYSTEMS, type PartId, type SystemId } from "./catalog";

export type Vec3 = [number, number, number];

export type ManifestCamera = { position: Vec3; target: Vec3; fov: number; aspect: number };
export type Viewport = "desktop" | "telefon" | "kiosk";

export type ManifestFocus = { dist: number; az: number; el: number };

export type ManifestNode = {
  name: string;
  instance: string;
  pivot: Vec3;
  center: Vec3;
  size: Vec3;
  explode: { dir: Vec3; dist: number };
  focus: ManifestFocus;
};

export type ManifestPart = {
  id: PartId;
  system: SystemId;
  order: number;
  stage: 0 | 1 | 2 | 3;
  primary: string;
  nodes: ManifestNode[];
  materials: string[];
  triangles: { desktop: number; lite: number };
};

export type ManifestFile = { url: string; bytes: number; sha256: string; triangles: number; drawCalls: number; nodes: number };

export type ManifestPoster = { avif?: string; webp?: string; width: number; height: number; camera: string };

export type XrayLook = { tint: string; rim: string; rimPower: number; baseAlpha: number; rimAlpha: number };

export type Auto3dManifest = {
  schema: 1;
  model: "limuzina";
  generatedAt: string;
  source: { blender: string; scriptsHash: string };
  units: "m";
  axes: { up: "+Y"; front: "+Z"; left: "+X" };
  bbox: { min: Vec3; max: Vec3 };
  dims: { length: number; width: number; widthMirrors: number; height: number };
  files: {
    desktop: ManifestFile;
    lite: ManifestFile;
    posters: Record<string, ManifestPoster>;
    og: { url: string; width: number; height: number } | null;
  };
  look: { background: string; xray: { body: XrayLook; glass: XrayLook } };
  explode: { windows: Array<[number, number]>; easing: "cubicInOut" };
  cameras: { start: Record<Viewport, ManifestCamera>; rasklopljen: Record<Viewport, ManifestCamera> };
  systems: Array<{ id: SystemId; order: number; color: string; parts: PartId[] }>;
  parts: ManifestPart[];
  deco: Array<{ name: string; system: SystemId }>;
  materials: Array<{ name: string; xray?: "body" | "glass" }>;
  stats: { desktop: { triangles: number; drawCalls: number; nodes: number }; lite: { triangles: number; drawCalls: number; nodes: number } };
};

const SYSTEM_IDS = new Set<string>(SYSTEMS.map((s) => s.id));
const PART_IDS = new Set<string>(PARTS.map((p) => p.id));

function fail(path: string, msg: string): never {
  throw new Error(`manifest: ${path}: ${msg}`);
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function vec3(v: unknown, path: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(isNum)) fail(path, "očekivan [x, y, z]");
  return v as Vec3;
}

function obj(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(path, "očekivan objekat");
  return v as Record<string, unknown>;
}

function camera(v: unknown, path: string): ManifestCamera {
  const c = obj(v, path);
  vec3(c.position, `${path}.position`);
  vec3(c.target, `${path}.target`);
  if (!isNum(c.fov) || c.fov <= 0 || c.fov >= 120) fail(`${path}.fov`, "neispravan ugao");
  if (!isNum(c.aspect) || c.aspect <= 0) fail(`${path}.aspect`, "neispravan odnos");
  return c as unknown as ManifestCamera;
}

/** Proverava oblik manifesta i vraća ga tipizovanog. Baca grešku sa putanjom do problema. */
export function parseManifest(input: unknown): Auto3dManifest {
  const m = obj(input, "$");
  if (m.schema !== 1) fail("schema", "očekivana verzija 1");
  if (m.model !== "limuzina") fail("model", "očekivano 'limuzina'");
  if (m.units !== "m") fail("units", "očekivani metri");
  const axes = obj(m.axes, "axes");
  if (axes.up !== "+Y" || axes.front !== "+Z" || axes.left !== "+X") fail("axes", "očekivane glTF ose (+Y gore, +Z napred, +X levo)");
  const bbox = obj(m.bbox, "bbox");
  vec3(bbox.min, "bbox.min");
  vec3(bbox.max, "bbox.max");
  const files = obj(m.files, "files");
  for (const key of ["desktop", "lite"] as const) {
    const f = obj(files[key], `files.${key}`);
    if (typeof f.url !== "string" || !f.url.startsWith("/3d/auto3d/")) fail(`files.${key}.url`, "očekivana putanja /3d/auto3d/");
    for (const k of ["bytes", "triangles", "drawCalls", "nodes"]) if (!isNum(f[k])) fail(`files.${key}.${k}`, "očekivan broj");
  }
  obj(files.posters, "files.posters");
  const look = obj(m.look, "look");
  if (typeof look.background !== "string") fail("look.background", "očekivana boja");
  const explode = obj(m.explode, "explode");
  const windows = explode.windows;
  if (!Array.isArray(windows) || windows.length !== EXPLODE_WINDOWS.length) fail("explode.windows", "očekivana 4 prozora");
  windows.forEach((w, i) => {
    if (!Array.isArray(w) || w.length !== 2 || !isNum(w[0]) || !isNum(w[1]) || w[0] >= w[1]) fail(`explode.windows[${i}]`, "neispravan prozor");
  });
  const cams = obj(m.cameras, "cameras");
  for (const state of ["start", "rasklopljen"] as const) {
    const s = obj(cams[state], `cameras.${state}`);
    for (const vp of ["desktop", "telefon", "kiosk"] as const) camera(s[vp], `cameras.${state}.${vp}`);
  }
  if (!Array.isArray(m.systems) || m.systems.length !== SYSTEMS.length) fail("systems", `očekivano ${SYSTEMS.length} sistema`);
  m.systems.forEach((s, i) => {
    const so = obj(s, `systems[${i}]`);
    if (!SYSTEM_IDS.has(String(so.id))) fail(`systems[${i}].id`, `nepoznat sistem ${String(so.id)}`);
    if (typeof so.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(so.color)) fail(`systems[${i}].color`, "očekivana heks boja");
  });
  if (!Array.isArray(m.parts)) fail("parts", "očekivan niz");
  m.parts.forEach((p, i) => {
    const po = obj(p, `parts[${i}]`);
    const at = `parts[${i}]`;
    if (!PART_IDS.has(String(po.id))) fail(`${at}.id`, `nepoznat deo ${String(po.id)}`);
    if (!SYSTEM_IDS.has(String(po.system))) fail(`${at}.system`, "nepoznat sistem");
    if (![0, 1, 2, 3].includes(po.stage as number)) fail(`${at}.stage`, "faza mora biti 0–3");
    if (!Array.isArray(po.nodes) || po.nodes.length === 0) fail(`${at}.nodes`, "deo bez čvorova");
    po.nodes.forEach((n, j) => {
      const no = obj(n, `${at}.nodes[${j}]`);
      if (typeof no.name !== "string" || !no.name.startsWith("part__")) fail(`${at}.nodes[${j}].name`, "očekivano part__…");
      vec3(no.pivot, `${at}.nodes[${j}].pivot`);
      vec3(no.center, `${at}.nodes[${j}].center`);
      vec3(no.size, `${at}.nodes[${j}].size`);
      const ex = obj(no.explode, `${at}.nodes[${j}].explode`);
      const d = vec3(ex.dir, `${at}.nodes[${j}].explode.dir`);
      const len = Math.hypot(d[0], d[1], d[2]);
      if (Math.abs(len - 1) > 1e-3) fail(`${at}.nodes[${j}].explode.dir`, "smer mora biti jedinični");
      if (!isNum(ex.dist) || ex.dist < 0 || ex.dist > 2) fail(`${at}.nodes[${j}].explode.dist`, "dist mora biti 0–2 m");
      const f = obj(no.focus, `${at}.nodes[${j}].focus`);
      if (!isNum(f.dist) || !isNum(f.az) || !isNum(f.el)) fail(`${at}.nodes[${j}].focus`, "očekivani dist, az, el");
    });
    if (po.primary !== (po.nodes[0] as { name: string }).name) fail(`${at}.primary`, "primarni čvor mora biti prvi");
  });
  return m as unknown as Auto3dManifest;
}
