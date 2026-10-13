import * as THREE from "three";
import { ADMIN_AMBIENT_FPS } from "@/lib/admin-v2/motion";
import { createRegulator, frameTargetMs, nextQuality } from "@/lib/admin-v2/three/budget";
import { loopActive, shouldRender, type LoopState } from "@/lib/admin-v2/three/loop";
import { STAGE_CONTEXT_LIMIT, stageDpr, type DrawQuality } from "@/lib/admin-v2/three/quality";
import { parseCssColor, themeOf, type StageTheme } from "@/lib/admin-v2/three/theme";
import { stageSession } from "./stage-session";

// ADMIN v3 V2 — the stage of the 3D kit (ZADATAK-V3 §3): the one life cycle of
// a WebGL renderer in the admin. A scene (components/admin/three/scenes/*) is
// given a stage and only adds its objects. The stage owns everything else:
//   - one renderer, device pixel ratio at most 2 (by quality: 1.25 or 1.5);
//   - a frame is drawn on demand (`invalidate`), an ambient loop at most 30
//     times a second, and nothing at all while the tab is hidden, the host is
//     off the screen or another scene has the stage;
//   - the theme from `html[data-theme]` and the colours from the admin tokens;
//   - a regulator that lowers the quality for good when frames are slow;
//   - `dispose()` of everything it was asked to `track`, of the renderer and of
//     its context.
// This file is loaded only through `import()` (lib/admin-v2/three/import-boundary.test.ts).

export type Stage = {
  readonly scene: THREE.Scene;
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly host: HTMLElement;
  readonly quality: DrawQuality;
  readonly theme: StageTheme;
  /** Frames drawn so far (dev: also `data-stage-frames` on the host). */
  readonly frames: number;
  /** The size of the host (CSS px). */
  readonly size: { width: number; height: number };
  readonly pixelRatio: number;
  setCamera(camera: THREE.Camera): void;
  /** Replaces the plain render of a frame (the bloom composer does); null puts it back. */
  setRender(render: ((delta: number) => void) | null): void;
  /** One frame, as soon as the stage may draw. */
  invalidate(): void;
  /** The ambient loop, at most 30 frames a second. */
  setAmbient(on: boolean): void;
  /** Before every drawn frame: seconds since the previous one and the time of the stage (it stands while the stage does). */
  onFrame(listener: (delta: number, time: number) => void): () => void;
  onTheme(listener: (theme: StageTheme) => void): () => void;
  onResize(listener: (width: number, height: number) => void): () => void;
  /** The regulator lowered the quality. */
  onQuality(listener: (quality: DrawQuality) => void): () => void;
  /** Disposed with the stage. */
  track<T extends { dispose(): void }>(item: T): T;
  /** An admin token as a colour; `fallback` when the token is missing or not a plain colour. */
  token(name: string, fallback: string): THREE.Color;
  /** Compiles the shaders of the scene without blocking the main thread where the browser can. */
  compile(): Promise<void>;
  dispose(): void;
};

export type StageOptions = {
  quality: DrawQuality;
  /** The token the scene is cleared with: bloom does not keep transparency, so the canvas is opaque. */
  surface?: { token: string; light: string; dark: string };
  /** A dialog or a ceremony: every other stage stands while this one lives. */
  exclusive?: boolean;
  /** Dev: the quality is pinned (the regulator is off). */
  pinned?: boolean;
  /** The context was lost: the caller shows the 2D fallback. */
  onUnavailable: () => void;
};

type Entry = { exclusive: boolean; pause(paused: boolean): void };

const stages = new Set<Entry>();
const DEV = process.env.NODE_ENV !== "production";
const DEFAULT_SURFACE = { token: "--admin-surface-strong", light: "#fffefa", dark: "#292e2b" };
/** A frame gap longer than this is a pause, not a slow frame (seconds). */
const DELTA_MAX = 0.1;

export function createStage(host: HTMLElement, options: StageOptions): Stage | null {
  if (stages.size >= STAGE_CONTEXT_LIMIT) return null;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: options.quality === "high", alpha: false, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  const surface = options.surface ?? DEFAULT_SURFACE;
  let quality = options.quality;
  let theme = themeOf(document.documentElement.getAttribute("data-theme"));
  let disposed = false;
  /** The shaders are being compiled: the loop waits, so the first frame is not the one that blocks on them. */
  let compiling = false;
  let camera: THREE.Camera | null = null;
  let customRender: ((delta: number) => void) | null = null;
  let width = Math.max(1, host.clientWidth);
  let height = Math.max(1, host.clientHeight);

  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setPixelRatio(stageDpr(window.devicePixelRatio || 1, quality));
  renderer.setSize(width, height, false);
  const canvas = renderer.domElement;
  canvas.className = "absolute inset-0 block h-full w-full";
  canvas.setAttribute("aria-hidden", "true");
  // A vertical swipe over the scene still scrolls the page.
  canvas.style.touchAction = "pan-y";
  host.append(canvas);

  const scene = new THREE.Scene();
  const tracked: Array<{ dispose(): void }> = [];
  const frameListeners = new Set<(delta: number, time: number) => void>();
  const themeListeners = new Set<(theme: StageTheme) => void>();
  const resizeListeners = new Set<(width: number, height: number) => void>();
  const qualityListeners = new Set<(quality: DrawQuality) => void>();

  const token = (name: string, fallback: string) => {
    const parsed = parseCssColor(getComputedStyle(host).getPropertyValue(name));
    return parsed ? new THREE.Color().setRGB(parsed[0], parsed[1], parsed[2], THREE.SRGBColorSpace) : new THREE.Color(fallback);
  };
  const paintSurface = () => {
    scene.background = token(surface.token, surface[theme]);
  };
  paintSurface();

  // --- the loop ---------------------------------------------------------------
  const state: LoopState = { visible: document.visibilityState === "visible", inView: true, paused: false, dirty: false, ambient: false };
  const regulator = createRegulator();
  let raf = 0;
  let lastFrameAt = 0;
  let time = 0;
  let frames = 0;
  /** The previous frame was drawn by this run of the loop, and it was asked for (not ambient). */
  let chained: "none" | "ambient" | "asked" = "none";

  const regulate = (gap: number, asked: boolean) => {
    if (options.pinned || quality === "low") return;
    // A gap says how fast the device is only between two frames of the same kind drawn in a row.
    if (chained === "none" || (asked && chained !== "asked")) return;
    const target = frameTargetMs(asked);
    regulator.push(gap, target);
    const ratio = regulator.ratio();
    if (ratio === null) return;
    const next = nextQuality(ratio * target, target, quality);
    if (next === quality) return;
    quality = next;
    stageSession.downgrade();
    renderer.setPixelRatio(stageDpr(window.devicePixelRatio || 1, quality));
    renderer.setSize(width, height, false);
    for (const listener of qualityListeners) listener(quality);
  };

  const draw = (now: number) => {
    const gap = lastFrameAt > 0 ? now - lastFrameAt : 0;
    const delta = Math.min(gap / 1000, DELTA_MAX);
    const asked = state.dirty;
    state.dirty = false;
    lastFrameAt = now;
    time += delta;
    for (const listener of frameListeners) listener(delta, time);
    if (customRender) customRender(delta);
    else if (camera) renderer.render(scene, camera);
    frames += 1;
    if (DEV) host.dataset.stageFrames = String(frames);
    regulate(gap, asked);
    chained = asked ? "asked" : "ambient";
  };

  const loop = (): LoopState => ({ ...state, paused: state.paused || compiling });
  const tick = (now: number) => {
    raf = 0;
    if (disposed) return;
    try {
      if (shouldRender({ ...loop(), lastFrameAt, now, fps: ADMIN_AMBIENT_FPS })) draw(now);
    } catch {
      // A scene that throws in a frame would stand frozen: the caller shows the 2D fallback instead.
      options.onUnavailable();
      return;
    }
    schedule();
  };
  function schedule() {
    if (raf || disposed) return;
    if (loopActive(loop())) {
      raf = requestAnimationFrame(tick);
      return;
    }
    // The loop stands: the next gap is a pause, not a measure of the device.
    chained = "none";
    regulator.reset();
  }
  const invalidate = () => {
    state.dirty = true;
    schedule();
  };

  // --- what the stage listens to ----------------------------------------------
  const onVisibility = () => {
    state.visible = document.visibilityState === "visible";
    // A hidden tab gets no frames, also not the one already asked for: the gap that follows is a pause.
    chained = "none";
    regulator.reset();
    schedule();
  };
  document.addEventListener("visibilitychange", onVisibility);

  const inView = new IntersectionObserver((entries) => {
    state.inView = entries.some((entry) => entry.isIntersecting);
    schedule();
  });
  inView.observe(host);

  const resize = new ResizeObserver(() => {
    const nextWidth = Math.max(1, host.clientWidth);
    const nextHeight = Math.max(1, host.clientHeight);
    if (nextWidth === width && nextHeight === height) return;
    width = nextWidth;
    height = nextHeight;
    renderer.setSize(width, height, false);
    for (const listener of resizeListeners) listener(width, height);
    invalidate();
  });
  resize.observe(host);

  const themeWatch = new MutationObserver(() => {
    const next = themeOf(document.documentElement.getAttribute("data-theme"));
    if (next === theme) return;
    theme = next;
    paintSurface();
    for (const listener of themeListeners) listener(theme);
    invalidate();
  });
  themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

  const onContextLost = (event: Event) => {
    event.preventDefault();
    stageSession.contextLost();
    options.onUnavailable();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  // --- the registry: a scene in a dialog pauses the others ----------------------
  const entry: Entry = {
    exclusive: options.exclusive === true,
    pause(paused) {
      state.paused = paused;
      schedule();
    },
  };
  if (entry.exclusive) for (const other of stages) other.pause(true);
  else if ([...stages].some((other) => other.exclusive)) state.paused = true;
  stages.add(entry);

  const subscribe = <T>(listeners: Set<T>, listener: T) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    scene,
    renderer,
    canvas,
    host,
    get quality() {
      return quality;
    },
    get theme() {
      return theme;
    },
    get frames() {
      return frames;
    },
    get size() {
      return { width, height };
    },
    get pixelRatio() {
      return renderer.getPixelRatio();
    },
    setCamera(next) {
      camera = next;
    },
    setRender(render) {
      customRender = render;
      invalidate();
    },
    invalidate,
    setAmbient(on) {
      state.ambient = on;
      schedule();
    },
    onFrame: (listener) => subscribe(frameListeners, listener),
    onTheme: (listener) => subscribe(themeListeners, listener),
    onResize: (listener) => subscribe(resizeListeners, listener),
    onQuality: (listener) => subscribe(qualityListeners, listener),
    track(item) {
      tracked.push(item);
      return item;
    },
    token,
    async compile() {
      if (!camera || disposed) return;
      compiling = true;
      try {
        await renderer.compileAsync(scene, camera);
      } catch {
        // The first frame compiles what is left.
      } finally {
        compiling = false;
        schedule();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      inView.disconnect();
      resize.disconnect();
      themeWatch.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      stages.delete(entry);
      if (entry.exclusive && ![...stages].some((other) => other.exclusive)) for (const other of stages) other.pause(false);
      frameListeners.clear();
      themeListeners.clear();
      resizeListeners.clear();
      qualityListeners.clear();
      try {
        for (const item of tracked.splice(0).reverse()) item.dispose();
      } finally {
        // Whatever a scene left behind, the context and the canvas go.
        scene.clear();
        renderer.dispose();
        renderer.forceContextLoss();
        canvas.remove();
        if (DEV) delete host.dataset.stageFrames;
      }
    },
  };
}
