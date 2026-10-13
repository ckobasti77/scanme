"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { REDUCED_MOTION_QUERY } from "@/components/admin/frame/use-admin-gsap";
import { useAdminReveal } from "@/components/admin/reveal/use-admin-reveal";
import { ADMIN_REVEAL } from "@/lib/admin-v2/motion";
import type { DrawQuality, StageQuality } from "@/lib/admin-v2/three/quality";
import { cn } from "@/lib/utils";
import type { Stage } from "./stage";
import { sessionQuality } from "./stage-session";

// ADMIN v3 V2 — the React side of the 3D kit. It never imports `three`: the
// stage and the scene arrive through `import()`, and only when
//   - WebGL works here and the device is not weak (else the 2D fallback stays),
//   - the host is near the screen,
//   - the entrance of the page is over (a second after the navigation),
//   - and the browser is idle.
// Until then, and whenever the scene cannot run (no WebGL, a lost context, a
// chunk that did not load, a scene that threw), the fallback is shown: a real
// 2D view of the same data with the same height, never a message. The text
// equivalent is always in the markup; the canvas is hidden from a screen reader.

/** How the scene enters: the full intro, the short one of a returning page, or its final state at once. */
export type StageIntro = "full" | "short" | "none";

export type StageRun = {
  intro: StageIntro;
  /** false with reduced motion and in the quiet mode: nothing turns, nothing pulses. */
  motion: boolean;
};

export type StageScene<Props> = {
  update(props: Props): void;
  /** Where the thing with this id is on the host (CSS px), for a tooltip or a line drawn in the DOM. */
  project?(id: string): { x: number; y: number } | null;
  dispose(): void;
};

export type StageSceneModule<Props> = {
  create(stage: Stage, props: Props, run: StageRun): StageScene<Props>;
};

/** The scene never starts before the page has entered (ms after the navigation). */
const START_AFTER_MS = 1000;
const IDLE_TIMEOUT_MS = 1500;
/** The canvas fades in over the fallback (the `media` choreography of the reveal engine). */
const FADE_MS = ADMIN_REVEAL.media * 1000;

type Mode = "flat" | "live";

/**
 * Dev (`?kvalitet=high|low|off`, or `window.__adminStageQuality` for a script that navigates on the client):
 * the quality is pinned, e.g. to see the bloom in a headless browser, whose WebGL is software.
 */
function pinnedQuality(): StageQuality | null {
  if (process.env.NODE_ENV === "production") return null;
  const value = new URLSearchParams(window.location.search).get("kvalitet") ?? (window as unknown as { __adminStageQuality?: unknown }).__adminStageQuality;
  return value === "high" || value === "low" || value === "off" ? value : null;
}

const watchReducedMotion = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const reducedMotionNow = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;
const noReducedMotion = () => false;

function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(run, 200);
  return () => window.clearTimeout(timer);
}

export function AdminStage<Props>({
  load,
  sceneProps,
  fallback,
  summary,
  flatBelow = 0,
  flat = false,
  onScene,
  className,
  children,
}: {
  /** The lazy scene: `() => import("./scenes/…")`. */
  load: () => Promise<StageSceneModule<Props>>;
  /** Memoized by the caller: a new object is a new `scene.update()`. */
  sceneProps: Props;
  fallback: ReactNode;
  /** The text equivalent (an `sr-only` element). */
  summary?: ReactNode;
  /** Below this window width (px) the 2D view stays. */
  flatBelow?: number;
  /** The user chose the 2D view. */
  flat?: boolean;
  /** The running scene, or null when the fallback is shown. */
  onScene?: (scene: StageScene<Props> | null) => void;
  className?: string;
  /** Drawn over the scene (a tooltip). */
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const scene = useRef<StageScene<Props> | null>(null);
  const props = useRef(sceneProps);
  const sceneCallback = useRef(onScene);
  const loader = useRef(load);
  const reveal = useAdminReveal();
  const entered = useRef(reveal);
  const [quiet] = useQuietMode();
  const reducedMotion = useSyncExternalStore(watchReducedMotion, reducedMotionNow, noReducedMotion);
  const [mode, setMode] = useState<Mode>("flat");
  const [covered, setCovered] = useState(false);

  useEffect(() => {
    props.current = sceneProps;
    scene.current?.update(sceneProps);
  }, [sceneProps]);
  useEffect(() => {
    sceneCallback.current = onScene;
    loader.current = load;
    entered.current = reveal;
  });

  useEffect(() => {
    const hostElement = host.current;
    const mountElement = mount.current;
    if (!hostElement || !mountElement) return;
    const pinned = pinnedQuality();
    const quality = pinned ?? (window.innerWidth < flatBelow ? "off" : sessionQuality(flat ? "2d" : null));
    hostElement.dataset.stageQuality = quality;
    if (quality === "off") return;

    let cancelled = false;
    let stage: Stage | null = null;
    let created: StageScene<Props> | null = null;
    const cleanups: Array<() => void> = [];

    const fail = () => {
      if (cancelled) return;
      cancelled = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      created?.dispose();
      stage?.dispose();
      created = null;
      stage = null;
      scene.current = null;
      sceneCallback.current?.(null);
      setMode("flat");
      setCovered(false);
    };

    const start = async (drawQuality: DrawQuality) => {
      try {
        const [kit, module] = await Promise.all([import("./stage"), loader.current()]);
        if (cancelled) return;
        stage = kit.createStage(mountElement, { quality: drawQuality, pinned: pinned !== null, onUnavailable: fail });
        if (!stage) return;
        const motion = !quiet && !reducedMotion;
        const intro: StageIntro = motion && entered.current.mode !== "none" ? entered.current.mode : "none";
        created = module.create(stage, props.current, { intro, motion });
        await stage.compile();
        if (cancelled) return;
        scene.current = created;
        // What arrived while the shaders were being compiled.
        created.update(props.current);
        stage.invalidate();
        setMode("live");
        sceneCallback.current?.(created);
        // The fallback leaves once the canvas has faded in over it.
        const timer = window.setTimeout(() => setCovered(true), motion ? FADE_MS + 40 : 0);
        cleanups.push(() => window.clearTimeout(timer));
      } catch {
        fail();
      }
    };

    // Near the screen, after the entrance of the page, when the browser is idle.
    const watcher = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watcher.disconnect();
        const wait = Math.max(0, entered.current.enteredAt + START_AFTER_MS - performance.now());
        const timer = window.setTimeout(() => {
          cleanups.push(whenIdle(() => void start(quality)));
        }, wait);
        cleanups.push(() => window.clearTimeout(timer));
      },
      { root: hostElement.closest('main[data-admin-frame="screen"]'), rootMargin: "300px" },
    );
    watcher.observe(hostElement);
    cleanups.push(() => watcher.disconnect());

    return () => {
      cancelled = true;
      for (const cleanup of cleanups.splice(0)) cleanup();
      created?.dispose();
      stage?.dispose();
      scene.current = null;
      sceneCallback.current?.(null);
      setMode("flat");
      setCovered(false);
    };
    // The quiet mode and reduced motion stop the ambient loop of a scene: switching either starts it again, still.
  }, [flat, flatBelow, quiet, reducedMotion]);

  const live = mode === "live";
  return (
    <div ref={host} data-admin-stage="" data-stage-state={live ? "live" : "flat"} className={cn("relative overflow-hidden", className)}>
      {summary}
      {covered ? null : <div data-stage-fallback="" className="absolute inset-0">{fallback}</div>}
      <div
        ref={mount}
        data-stage-mount=""
        className={cn("absolute inset-0", !quiet && "transition-opacity duration-300 motion-reduce:transition-none", live ? "opacity-100" : "pointer-events-none opacity-0")}
      />
      {children}
    </div>
  );
}
