import { isSoftwareRenderer, pickQuality, type StageQuality } from "@/lib/admin-v2/three/quality";

// ADMIN v3 V2 — what the 3D kit knows about this tab, without loading `three`:
// whether WebGL works here (asked once, on a throwaway canvas), how many
// contexts were lost and whether the regulator already lowered the quality.
// `AdminStage` reads it to choose between the scene and the 2D fallback before
// any chunk is requested; the stage writes the last two.

type Probe = { webgl: boolean; softwareRenderer: boolean };

let probe: Probe | null = null;
let contextLosses = 0;
let downgraded = false;
let kitLoaded = false;
const kitListeners = new Set<() => void>();

function probeWebgl(): Probe {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return { webgl: false, softwareRenderer: false };
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "") : "";
    // The probe context is given back at once: a page holds only a few of them.
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { webgl: true, softwareRenderer: isSoftwareRenderer(name) };
  } catch {
    return { webgl: false, softwareRenderer: false };
  }
}

type NavigatorHints = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };

/** The quality of a scene on this device right now (browser only). */
export function sessionQuality(userChoice: "2d" | null = null): StageQuality {
  probe ??= probeWebgl();
  const hints = navigator as NavigatorHints;
  return pickQuality({
    webgl: probe.webgl,
    softwareRenderer: probe.softwareRenderer,
    cores: typeof hints.hardwareConcurrency === "number" ? hints.hardwareConcurrency : null,
    memoryGb: typeof hints.deviceMemory === "number" ? hints.deviceMemory : null,
    saveData: hints.connection?.saveData === true,
    viewportWidth: window.innerWidth,
    contextLosses,
    userChoice,
    downgraded,
  });
}

export const stageSession = {
  contextLost() {
    contextLosses += 1;
  },
  /** The regulator lowered the quality: it stays low until the tab is closed. */
  downgrade() {
    downgraded = true;
  },
  downgraded: () => downgraded,
  /** V4 — the chunk of the kit (`three`) is in this tab: a page with a scene has loaded it. */
  kitLoaded: () => kitLoaded,
  markKitLoaded() {
    if (kitLoaded) return;
    kitLoaded = true;
    for (const listener of kitListeners) listener();
  },
  /** Called once the kit is in the tab (at once when it already is). */
  onKitLoaded(listener: () => void) {
    if (kitLoaded) {
      listener();
      return () => {};
    }
    kitListeners.add(listener);
    return () => {
      kitListeners.delete(listener);
    };
  },
};
