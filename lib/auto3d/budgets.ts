// Budžeti fajlova 3D Rendgen limuzine (PLAN §5, A01 §4.4). Decimalni megabajti, strože od MiB.

export const BUDGET = {
  desktop: { maxBytes: 6_000_000, maxTriangles: 600_000, maxDrawCalls: 250 },
  lite: { maxBytes: 3_000_000, maxTriangles: 250_000, maxDrawCalls: 250 },
  maxNodes: 120,
  maxTextures: 0,
  posterAvifMaxBytes: 200_000,
  posterWebpMaxBytes: 350_000,
  og: { width: 1200, height: 630 },
} as const;

export const PUBLIC_DIR = "public/3d/auto3d";
export const FILES = {
  desktop: "limuzina.glb",
  lite: "limuzina-lite.glb",
  manifest: "limuzina.manifest.json",
} as const;
