// Izbor kvaliteta 3D Rendgen pregledača (A03 §1.6, odluke E5, E16, E20). Čisto: ulaz su signali
// pregledača, izlaz je plan (koji GLB, DPR, MSAA, hover, automatsko učitavanje).

export type QualityInput = {
  /** Širina prozora u CSS px. */
  width: number;
  webgl2: boolean;
  /** WebGL renderer je CPU rasterizer (SwiftShader, llvmpipe…). */
  software: boolean;
  cores?: number;
  /** `navigator.deviceMemory` u GB (samo Chromium). */
  memory?: number;
  saveData?: boolean;
  /** `(hover: hover) and (pointer: fine)`. */
  finePointer: boolean;
  kiosk: boolean;
  /** `window.devicePixelRatio`. */
  dpr: number;
};

export type QualityPlan = {
  glb: "desktop" | "lite" | null;
  maxDpr: number;
  msaa: boolean;
  hover: boolean;
  maxPixels: number;
  autoload: boolean;
};

export const MAX_PIXELS = 4_200_000;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|basic render|software (adapter|rasterizer)/i;

export function isSoftwareRenderer(renderer: string): boolean {
  return SOFTWARE_RENDERER.test(renderer);
}

export function chooseQuality(q: QualityInput): QualityPlan {
  const autoload = q.saveData !== true;
  const base = { maxPixels: MAX_PIXELS, autoload };
  if (!q.webgl2) return { ...base, glb: null, maxDpr: 1, msaa: false, hover: false };
  if (q.software) return { ...base, glb: "lite", maxDpr: 1, msaa: false, hover: q.finePointer };
  // Kiosk na štandu nema ko da pritisne „Učitaj“, pa se učitava i uz Save-Data (A13).
  if (q.kiosk) return { ...base, autoload: true, glb: "desktop", maxDpr: 1.5, msaa: true, hover: false };
  if ((q.memory !== undefined && q.memory < 4) || (q.width < 1024 && !q.finePointer)) {
    return { ...base, glb: "lite", maxDpr: 1.5, msaa: true, hover: false };
  }
  if (q.width >= 1024 && q.finePointer && (q.cores ?? 4) >= 4) {
    return { ...base, glb: "desktop", maxDpr: 2, msaa: q.dpr < 1.5, hover: true };
  }
  return { ...base, glb: "lite", maxDpr: 1.5, msaa: true, hover: q.finePointer };
}

/** DPR canvasa: ne više od uređaja, plana i budžeta piksela, a najmanje 1. */
export function dprFor(cssW: number, cssH: number, deviceDpr: number, maxDpr: number, maxPixels = MAX_PIXELS): number {
  const byPixels = Math.sqrt(maxPixels / Math.max(1, cssW * cssH));
  return Math.max(1, Math.min(deviceDpr, maxDpr, byPixels));
}
