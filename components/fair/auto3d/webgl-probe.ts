// Provera WebGL2 bez three-a (A03 §1.4): pravi privremeni kontekst, čita ime renderera i odmah ga
// oslobađa. Rezultat se pamti za celu stranicu.

export type WebGLProbe = { webgl2: boolean; renderer: string };

let cache: WebGLProbe | null = null;

export function probeWebGL2(): WebGLProbe {
  if (cache) return cache;
  if (typeof window === "undefined" || typeof WebGL2RenderingContext === "undefined") {
    cache = { webgl2: false, renderer: "" };
    return cache;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", { failIfMajorPerformanceCaveat: false });
    let renderer = "";
    if (gl) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
    cache = { webgl2: Boolean(gl), renderer };
  } catch {
    cache = { webgl2: false, renderer: "" };
  }
  return cache;
}
