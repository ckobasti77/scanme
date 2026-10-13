// ADMIN v3 V2 — the render loop gate of the 3D kit (plan §4.2, „Pauza“). Pure:
// whether the loop needs to ask for the next frame at all, and whether this
// frame is drawn. Ambient scenes draw at most `fps` times a second whatever
// the refresh rate of the screen is.

export type LoopState = {
  /** The tab is visible. */
  visible: boolean;
  /** The host is on the screen. */
  inView: boolean;
  /** Another scene has the stage (a dialog, a ceremony). */
  paused: boolean;
  /** A frame was asked for (data, size, theme, pointer). */
  dirty: boolean;
  /** The scene has an ambient loop. */
  ambient: boolean;
};

/** A frame may come this early (ms): rAF timestamps jitter, and a 60 Hz screen must still give 30 fps. */
export const FRAME_SLACK_MS = 2;

/** Whether the loop should ask for the next frame: visible, on screen, not paused and something to draw. */
export function loopActive(state: LoopState): boolean {
  return state.visible && state.inView && !state.paused && (state.dirty || state.ambient);
}

/** Whether this frame is drawn: a dirty scene at once, an ambient-only one when the frame gap is due. */
export function shouldRender(input: LoopState & { lastFrameAt: number; now: number; fps: number }): boolean {
  if (!loopActive(input)) return false;
  if (input.dirty) return true;
  if (input.lastFrameAt <= 0) return true;
  return input.now - input.lastFrameAt >= 1000 / input.fps - FRAME_SLACK_MS;
}
