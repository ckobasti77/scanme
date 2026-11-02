import { ADMIN_STAGE_MOTION } from "@/lib/admin-v2/motion";
import type { StageQuality } from "@/lib/admin-v2/three/quality";

// ADMIN v3 V5 — when a scene of the 3D kit may start. Pure. The 2D view by
// choice, by width or by a dev pin is decided without asking the device
// anything (no WebGL context is made for it); the start waits for the entrance
// of the page and then for an idle browser.

/** The browser may take this long (ms) to be idle before the scene starts anyway. */
export const IDLE_TIMEOUT_MS = 1500;
/** The same for a scene that lights up over the shade: the picture should not wait long. */
export const IGNITE_IDLE_TIMEOUT_MS = 150;

/** The 2D view stays for good: the user chose it, the window is narrower than `flatBelow`, or the dev pin says `off`. */
export function viewIs2D(input: { flat: boolean; width: number; flatBelow: number; pinned: StageQuality | null }): boolean {
  return input.flat || input.width < input.flatBelow || input.pinned === "off";
}

/** `startAfterMs` of a stage: the given one, or the entrance of the page (a usable number, else the default). */
export function resolveStartAfterMs(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : ADMIN_STAGE_MOTION.startAfter * 1000;
}

/** How long (ms) from `now` until the scene may start: `startAfterMs` after the navigation. */
export function startWaitMs(enteredAt: number, startAfterMs: number, now: number): number {
  return Math.max(0, enteredAt + startAfterMs - now);
}

export function idleTimeoutMs(ignite: boolean): number {
  return ignite ? IGNITE_IDLE_TIMEOUT_MS : IDLE_TIMEOUT_MS;
}
