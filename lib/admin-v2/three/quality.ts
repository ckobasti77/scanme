// ADMIN v3 V2 — quality of the shared 3D kit (plan §4.1–§4.2). Pure: what the
// device can do becomes `off` (draw the 2D fallback), `low` or `high`, and what
// each level costs. No DOM here; the stage reads the environment and passes it in.

export type StageQuality = "off" | "low" | "high";
export type DrawQuality = Exclude<StageQuality, "off">;

export type QualityEnv = {
  /** A WebGL context can be created. */
  webgl: boolean;
  /** SwiftShader, llvmpipe and the like (WEBGL_debug_renderer_info). */
  softwareRenderer: boolean;
  /** navigator.hardwareConcurrency; null when unknown. */
  cores: number | null;
  /** navigator.deviceMemory (GB); null when unknown. */
  memoryGb: number | null;
  /** navigator.connection.saveData. */
  saveData: boolean;
  /** window.innerWidth (px). */
  viewportWidth: number;
  /** WebGL contexts lost in this session. */
  contextLosses: number;
  /** The user chose the 2D view. */
  userChoice: "2d" | null;
  /** The regulator lowered the quality earlier in this session: it never goes back up. */
  downgraded: boolean;
};

/** Below this width the scene draws at `low`. */
export const QUALITY_PHONE_WIDTH = 768;
/** The hard limit of the device pixel ratio of any scene. */
export const STAGE_DPR_LIMIT = 2;
/** The most WebGL contexts of the kit alive at once. */
export const STAGE_CONTEXT_LIMIT = 2;

const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

/** A software renderer name (null, undefined and "" are not one). */
export function isSoftwareRenderer(name: string | null | undefined): boolean {
  return !!name && SOFTWARE_RENDERER.test(name);
}

/** `off` wins over `low`; a software renderer is `low`, never `off`; unknown cores or memory do not lower anything. */
export function pickQuality(env: QualityEnv): StageQuality {
  if (!env.webgl || (env.cores !== null && env.cores <= 2) || env.saveData || env.contextLosses >= 2 || env.userChoice === "2d") {
    return "off";
  }
  if (
    env.viewportWidth < QUALITY_PHONE_WIDTH ||
    (env.cores !== null && env.cores <= 4) ||
    (env.memoryGb !== null && env.memoryGb <= 4) ||
    env.softwareRenderer ||
    env.downgraded
  ) {
    return "low";
  }
  return "high";
}

export type QualityParams = { dprMax: number; bloom: boolean; particles: number; msaa: 0 | 2 };

const PARAMS: Readonly<Record<DrawQuality, QualityParams>> = {
  low: { dprMax: 1.25, bloom: false, particles: 150, msaa: 0 },
  high: { dprMax: 1.5, bloom: true, particles: 600, msaa: 2 },
};

export function qualityParams(quality: DrawQuality): QualityParams {
  return { ...PARAMS[quality] };
}

/** min(devicePixelRatio, the quality's cap, the hard limit), at least 1; NaN or ≤ 0 gives 1. */
export function stageDpr(devicePixelRatio: number, quality: DrawQuality): number {
  if (Number.isNaN(devicePixelRatio) || devicePixelRatio <= 0) return 1;
  return Math.max(1, Math.min(devicePixelRatio, PARAMS[quality].dprMax, STAGE_DPR_LIMIT));
}
