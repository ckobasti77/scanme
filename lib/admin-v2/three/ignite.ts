import { ADMIN_STAGE_MOTION } from "@/lib/admin-v2/motion";
import type { RevealMode } from "@/lib/admin-v2/reveal/gate";

// ADMIN v3 V5 — „Skener pali“: on a full entrance the 2D picture of a stage waits
// as a shade and the scene lights up over it. Pure: whether the shade may be
// shown, how long it may last and which intro a scene gets. AdminStage holds the
// state and the timers.

/**
 * off: no shade (the server markup, and everything without the light-up);
 * wait: the 2D picture is dimmed, the scene is not up yet; lit: the scene has started over the shade;
 * lifted: the picture came back (the scene failed, was unavailable or took too long).
 */
export type ShadePhase = "off" | "wait" | "lit" | "lifted";

export type ShadeInput = {
  /** The caller asked for the light-up. */
  ignite: boolean;
  quiet: boolean;
  reducedMotion: boolean;
  /** The reveal mode of this visit. */
  mode: RevealMode;
  /** 3D is out by the user's choice, by the window width or by a pinned `off`. */
  excluded: boolean;
  /** `stageSession.webglKnown()`: false when WebGL is already known to be missing. */
  webglKnown: boolean | null;
  /** performance.now() of the navigation, and now. */
  enteredAt: number;
  now: number;
};

/** How long (ms) the shade may stand after the navigation, counted from `now` (0 when that is over). */
export function shadeRemainingMs(enteredAt: number, now: number): number {
  return Math.max(0, enteredAt + ADMIN_STAGE_MOTION.igniteDeadline * 1000 - now);
}

/** Whether the 2D picture may be dimmed to wait for the scene. */
export function mayShade(input: ShadeInput): boolean {
  return (
    input.ignite &&
    !input.quiet &&
    !input.reducedMotion &&
    input.mode === "full" &&
    !input.excluded &&
    input.webglKnown !== false &&
    shadeRemainingMs(input.enteredAt, input.now) > 0
  );
}

/**
 * The intro a scene gets. While the shade stands: the full one. After a shade that was lifted (or was never
 * shown for a page that asked for the light-up) a full entrance becomes the short one: the picture never dims twice.
 */
export function sceneIntro(input: { motion: boolean; mode: RevealMode; ignite: boolean; phase: ShadePhase }): RevealMode {
  if (!input.motion || input.mode === "none") return "none";
  if (input.phase === "wait" || input.phase === "lit") return "full";
  if (input.ignite && input.mode === "full") return "short";
  return input.mode;
}
