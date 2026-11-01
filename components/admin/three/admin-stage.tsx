"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useQuietMode } from "@/components/admin/admin-ui/admin-toast";
import { REDUCED_MOTION_QUERY } from "@/components/admin/frame/use-admin-gsap";
import { useAdminReveal } from "@/components/admin/reveal/use-admin-reveal";
import { ADMIN_STAGE_MOTION } from "@/lib/admin-v2/motion";
import { mayShade, sceneIntro, shadeRemainingMs, type ShadePhase } from "@/lib/admin-v2/three/ignite";
import type { StageQuality } from "@/lib/admin-v2/three/quality";
import { idleTimeoutMs, resolveStartAfterMs, startWaitMs, viewIs2D } from "@/lib/admin-v2/three/start";
import { cn } from "@/lib/utils";
import type { Stage } from "./stage";
import { sessionQuality, stageSession } from "./stage-session";

// ADMIN v3 V2 — the React side of the 3D kit. It never imports `three`: the
// stage and the scene arrive through `import()`, and only when
//   - the 2D view was not chosen and the window is wide enough,
//   - the host is near the screen,
//   - the entrance of the page is over (a second after the navigation),
//   - the browser is idle,
//   - and WebGL works here and the device is not weak (else the 2D fallback
//     stays): the one probe of the device is made right before the start, never
//     for a 2D view that was chosen.
// Until then, and whenever the scene cannot run (no WebGL, a lost context, a
// chunk that did not load, a scene that threw), the fallback is shown: a real
// 2D view of the same data with the same height, never a message. The text
// equivalent is always in the markup; the canvas is hidden from a screen reader.
// V5 — „Skener pali“ (`ignite`): on a full entrance the fallback waits as a shade
// and the scene lights up over it; the shade never outlives the scene's failure
// or `ADMIN_STAGE_MOTION.igniteDeadline`, and never comes twice.

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

/** The canvas fades in over the fallback. */
const FADE_MS = ADMIN_STAGE_MOTION.fade * 1000;
/** How long after the fade should have ended the fallback is taken away anyway. */
const COVER_GRACE_MS = 600;
/** The shade of the fallback comes and goes at the pace of a state change. */
const SHADE_TRANSITION = "opacity var(--admin-dur-2) linear";

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

function whenIdle(run: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(run, { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = window.setTimeout(run, Math.min(200, timeout));
  return () => window.clearTimeout(timer);
}

/** The scene first, then the stage: a scene whose `dispose` throws must not keep the context. Nothing throws out. */
function release(created: { dispose(): void } | null, stage: { dispose(): void } | null): void {
  try {
    created?.dispose();
  } catch {
    // The stage below still takes the renderer and its context down.
  } finally {
    try {
      stage?.dispose();
    } catch {
      // Nothing more to do: the stage left its registry before it disposed.
    }
  }
}

export function AdminStage<Props>({
  load,
  sceneProps,
  fallback,
  summary,
  flatBelow = 0,
  flat = false,
  eager = false,
  exclusive = false,
  startAfterMs,
  ignite = false,
  onScene,
  onUnavailable,
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
  /** V4 — a scene the user asked for (a dialog, a ceremony): it does not wait for the entrance of the page nor for an idle browser. */
  eager?: boolean;
  /** V4 — a scene in a dialog or a ceremony: every other scene stands while this one lives. */
  exclusive?: boolean;
  /** V5 — the scene may start this soon after the navigation (ms). Default: ADMIN_STAGE_MOTION.startAfter * 1000. */
  startAfterMs?: number;
  /** V5 — „Skener pali“: on a full entrance the 2D picture waits as a shade and the scene lights up over it. */
  ignite?: boolean;
  /** The running scene, or null when the fallback is shown. */
  onScene?: (scene: StageScene<Props> | null) => void;
  /** The scene cannot run here (no WebGL, a weak device, a lost context, a chunk that did not load): the fallback stays. Not called for a 2D view that was chosen or for a narrow window. */
  onUnavailable?: () => void;
  className?: string;
  /** Drawn over the scene (a tooltip). */
  children?: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mount = useRef<HTMLDivElement>(null);
  const scene = useRef<StageScene<Props> | null>(null);
  const props = useRef(sceneProps);
  const sceneCallback = useRef(onScene);
  const unavailable = useRef(onUnavailable);
  /** Takes the running scene down and shows the fallback (set while a scene runs). */
  const failScene = useRef<(() => void) | null>(null);
  const loader = useRef(load);
  const reveal = useAdminReveal();
  const entered = useRef(reveal);
  const [quiet] = useQuietMode();
  const reducedMotion = useSyncExternalStore(watchReducedMotion, reducedMotionNow, noReducedMotion);
  const [mode, setMode] = useState<Mode>("flat");
  const [covered, setCovered] = useState(false);
  const startAfter = useRef(startAfterMs);
  const lightUp = useRef(ignite);
  // The shade of the fallback (V5). The ref is what the effects read; the state is what is drawn. `spent`
  // is the visit (its `enteredAt`) whose shade is over: lifted, or its scene is up. A visit is dimmed once.
  const shade = useRef<ShadePhase>("off");
  const shadeVisit = useRef<number | null>(null);
  const spent = useRef<number | null>(null);
  const [shadePhase, setShadePhase] = useState<ShadePhase>("off");
  const setShade = useCallback((next: ShadePhase) => {
    shade.current = next;
    setShadePhase(next);
  }, []);
  /** The picture comes back (the scene failed, is unavailable or is not up in time). */
  const liftShade = useCallback(() => {
    if (shade.current !== "wait" && shade.current !== "lit") return;
    spent.current = shadeVisit.current;
    setShade("lifted");
  }, [setShade]);

  // The shade is set before the first paint of the page that asked for it, never in the server markup (no
  // JavaScript, no shade). The reveal state of a visit arrives from the frame in its own layout effect, which
  // runs after this one: this effect runs again when it does, still before the paint.
  useLayoutEffect(() => {
    const may = mayShade({
      ignite,
      quiet,
      reducedMotion,
      mode: reveal.mode,
      excluded: viewIs2D({ flat, width: window.innerWidth, flatBelow, pinned: pinnedQuality() }),
      webglKnown: stageSession.webglKnown(),
      enteredAt: reveal.enteredAt,
      now: performance.now(),
    });
    if (!may) {
      liftShade();
      return;
    }
    if (spent.current === reveal.enteredAt) return;
    shadeVisit.current = reveal.enteredAt;
    if (shade.current !== "lit") setShade("wait");
    // A scene that has not even started in time leaves the picture as it was. One that is being built over the
    // shade (`lit`) is left to arrive: lifting the shade under it would dim the picture a second time.
    const timer = window.setTimeout(() => {
      if (!scene.current && shade.current !== "lit") liftShade();
    }, shadeRemainingMs(reveal.enteredAt, performance.now()));
    return () => window.clearTimeout(timer);
  }, [ignite, quiet, reducedMotion, flat, flatBelow, reveal.mode, reveal.enteredAt, liftShade, setShade]);

  useEffect(() => {
    props.current = sceneProps;
    try {
      scene.current?.update(sceneProps);
    } catch {
      // A scene that throws on new data would take the page down: the 2D fallback stays instead.
      failScene.current?.();
    }
  }, [sceneProps]);
  useEffect(() => {
    sceneCallback.current = onScene;
    unavailable.current = onUnavailable;
    loader.current = load;
    entered.current = reveal;
    startAfter.current = startAfterMs;
    lightUp.current = ignite;
  });

  useEffect(() => {
    const hostElement = host.current;
    const mountElement = mount.current;
    if (!hostElement || !mountElement) return;
    const pinned = pinnedQuality();
    delete hostElement.dataset.stageQuality;
    // The 2D view by choice, by width or by a pinned `off` is decided here, without asking the device anything:
    // no WebGL context is made for it, not even a probe.
    if (viewIs2D({ flat, width: window.innerWidth, flatBelow, pinned })) {
      hostElement.dataset.stageQuality = "off";
      // Not a failure, except for the dev pin, which stands for a device that cannot draw the scene.
      if (pinned === "off" && !flat && window.innerWidth >= flatBelow) unavailable.current?.();
      return;
    }
    // The quality is known when the pin says it; else it is known right before the start, after the probe.
    if (pinned) hostElement.dataset.stageQuality = pinned;

    let cancelled = false;
    let stage: Stage | null = null;
    let created: StageScene<Props> | null = null;
    const cleanups: Array<() => void> = [];

    const fail = () => {
      if (cancelled) return;
      cancelled = true;
      failScene.current = null;
      for (const cleanup of cleanups.splice(0)) cleanup();
      release(created, stage);
      created = null;
      stage = null;
      scene.current = null;
      sceneCallback.current?.(null);
      setMode("flat");
      setCovered(false);
      liftShade();
      unavailable.current?.();
    };

    failScene.current = fail;
    const start = async () => {
      try {
        // The one probe of the device (a throwaway WebGL context): the scene is about to start, so it is worth it.
        const drawQuality: StageQuality = pinned ?? sessionQuality(null);
        hostElement.dataset.stageQuality = drawQuality;
        if (drawQuality === "off") {
          liftShade();
          unavailable.current?.();
          return;
        }
        const [kit, module] = await Promise.all([import("./stage"), loader.current()]);
        if (cancelled) return;
        stage = kit.createStage(mountElement, { quality: drawQuality, pinned: pinned !== null, exclusive, onUnavailable: fail });
        if (!stage) {
          liftShade();
          unavailable.current?.();
          return;
        }
        const motion = !quiet && !reducedMotion;
        // Over the shade the scene lights up with the full intro; a shade that was lifted never gets a second one.
        const intro: StageIntro = sceneIntro({ motion, mode: entered.current.mode, ignite: lightUp.current, phase: shade.current });
        if (shade.current === "wait") setShade("lit");
        created = module.create(stage, props.current, { intro, motion });
        await stage.compile();
        if (cancelled) return;
        // The passes of the composer compile now, while the canvas is still invisible, not in the first frame of the fade.
        stage.warm();
        scene.current = created;
        // The scene is up: this visit's shade has done its work and is not set again.
        if (shade.current === "lit") spent.current = shadeVisit.current;
        // What arrived while the shaders were being compiled.
        created.update(props.current);
        stage.invalidate();
        setMode("live");
        sceneCallback.current?.(created);
        // The fallback leaves once the canvas has faded in over it: when the fade itself says it is over, not after
        // a fixed time. The first frames of a scene can hold the main thread, the fade then starts late, and a
        // timer would take the picture away under a canvas that is still half clear (a blink of the bare surface).
        if (!motion) setCovered(true);
        else {
          const cover = (event?: TransitionEvent) => {
            if (event && (event.target !== mountElement || event.propertyName !== "opacity")) return;
            setCovered(true);
          };
          mountElement.addEventListener("transitionend", cover);
          // A fade that never reports its end (a tab that went to the background) is not waited for.
          const timer = window.setTimeout(() => cover(), FADE_MS + COVER_GRACE_MS);
          cleanups.push(() => {
            mountElement.removeEventListener("transitionend", cover);
            window.clearTimeout(timer);
          });
        }
      } catch {
        fail();
      }
    };

    // Near the screen, after the entrance of the page, when the browser is idle.
    const watcher = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watcher.disconnect();
        if (eager) {
          void start();
          return;
        }
        const wait = startWaitMs(entered.current.enteredAt, resolveStartAfterMs(startAfter.current), performance.now());
        const timer = window.setTimeout(() => {
          cleanups.push(whenIdle(() => void start(), idleTimeoutMs(lightUp.current)));
        }, wait);
        cleanups.push(() => window.clearTimeout(timer));
      },
      { root: hostElement.closest('main[data-admin-frame="screen"]'), rootMargin: "300px" },
    );
    watcher.observe(hostElement);
    cleanups.push(() => watcher.disconnect());

    return () => {
      cancelled = true;
      failScene.current = null;
      for (const cleanup of cleanups.splice(0)) cleanup();
      release(created, stage);
      scene.current = null;
      sceneCallback.current?.(null);
      setMode("flat");
      setCovered(false);
    };
    // The quiet mode and reduced motion stop the ambient loop of a scene: switching either starts it again, still.
  }, [flat, flatBelow, quiet, reducedMotion, eager, exclusive, liftShade, setShade]);

  const live = mode === "live";
  const shaded = shadePhase === "wait" || shadePhase === "lit";
  // While the canvas fades in, the 2D picture under it steps back to the shade: the two are not framed alike
  // (the scene has perspective), and two full pictures over each other would read as a double image.
  const handover = live && !covered && !quiet;
  const shadeStyle = shaded || handover ? { opacity: ADMIN_STAGE_MOTION.shade, transition: SHADE_TRANSITION } : shadePhase === "lifted" ? { opacity: 1, transition: SHADE_TRANSITION } : undefined;
  return (
    <div
      ref={host}
      data-admin-stage=""
      data-stage-state={live ? "live" : "flat"}
      data-stage-ignite={shaded ? shadePhase : undefined}
      className={cn("relative overflow-hidden", className)}
    >
      {summary}
      {covered ? null : (
        <div data-stage-fallback="" className="absolute inset-0" style={shadeStyle}>
          {fallback}
        </div>
      )}
      <div
        ref={mount}
        data-stage-mount=""
        className={cn("absolute inset-0", !quiet && "transition-opacity motion-reduce:transition-none", live ? "opacity-100" : "pointer-events-none opacity-0")}
        style={quiet ? undefined : { transitionDuration: `${ADMIN_STAGE_MOTION.fade}s` }}
      />
      {children}
    </div>
  );
}
