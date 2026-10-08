// Pure timing and geometry for the passport hold-to-unlock (port of
// public/prototip/pasos-otkljucavanje.html). The card component only writes
// transform/opacity/clip-path from these values; nothing here touches the DOM.

import type { FairPassportFavoriteResultView } from "@/lib/fair-contract";

export const PASSPORT_HOLD_MS = 1300;
export const PASSPORT_DRAIN_MS = 750;
/** One lap of the idle edge comet. */
export const PASSPORT_RIM_LAP_MS = 2400;
/** Where the visible comet tail starts inside the conic turn (80 %). */
export const PASSPORT_RIM_TAIL_DEG = 0.8 * 360;
export const PASSPORT_CELL_COUNT = 10;

/** Haptic tick thresholds: one per battery cell boundary. */
export const PASSPORT_CELL_TICKS = Array.from({ length: PASSPORT_CELL_COUNT }, (_, index) => index / PASSPORT_CELL_COUNT);

export type RimState = {
  /** Tail angle frozen when a press started; null while idling. */
  anchor: number | null;
  idleOffset: number;
  idleStart: number;
};

export type RimFrame = {
  /** Rotation of the comet layer. */
  tail: number;
  /** Rotation where the solid energy band starts. */
  start: number;
  /** Sweep of the energy band, 0–360. */
  fill: number;
  /** Opacity factor of the band (0–1). */
  body: number;
};

function turn(value: number) {
  return ((value % 360) + 360) % 360;
}

export function createRimState(now: number, idleOffset: number): RimState {
  return { anchor: null, idleOffset, idleStart: now };
}

/** Starts a charge exactly where the comet is now, so the fill never jumps. */
export function anchorRim(state: RimState, now: number): void {
  if (state.anchor === null) state.anchor = rimTail(state, 0, now);
}

function rimTail(state: RimState, progress: number, now: number) {
  return state.anchor !== null
    ? turn(state.anchor + progress * 360)
    : turn(state.idleOffset + ((now - state.idleStart) / PASSPORT_RIM_LAP_MS) * 360);
}

/**
 * One frame of the edge tracer. While charging/draining the comet advances
 * with the fill; once fully drained (and not held) it idles on from there.
 */
export function rimFrame(state: RimState, progress: number, holding: boolean, now: number): RimFrame {
  const tail = rimTail(state, progress, now);
  const start = turn((state.anchor ?? tail) + PASSPORT_RIM_TAIL_DEG);
  if (state.anchor !== null && progress <= 0.0001 && !holding) {
    state.idleOffset = state.anchor;
    state.idleStart = now;
    state.anchor = null;
  }
  return { tail, start, fill: Math.max(0, Math.min(1, progress)) * 360, body: Math.min(1, progress * 3) };
}

/** Index of the first haptic tick that has not fired yet at `progress`. */
export function nextTickIndex(progress: number): number {
  const index = PASSPORT_CELL_TICKS.findIndex((tick) => tick > progress);
  return index < 0 ? PASSPORT_CELL_TICKS.length : index;
}

/** Number of fully charged cells. */
export function litCellCount(progress: number): number {
  return Math.max(0, Math.min(PASSPORT_CELL_COUNT, Math.floor(progress * PASSPORT_CELL_COUNT + 1e-9)));
}

/** Early-release drain: ease-out cubic from `from` to 0 over `k` ∈ [0, 1]. */
export function drainProgress(from: number, k: number): number {
  const clamped = Math.max(0, Math.min(1, k));
  return from * Math.pow(1 - clamped, 3);
}

/**
 * The single ready card that runs the comet: the explicit choice, else the
 * deep-link target, else the first ready card in passport order.
 */
export function focusCardId(
  models: ReadonlyArray<{ eventModelId: string; slug: string }>,
  readyIds: ReadonlySet<string>,
  focusSlug: string | undefined,
  preferredId?: string | null,
): string | null {
  if (preferredId && readyIds.has(preferredId)) return preferredId;
  const target = focusSlug ? models.find((model) => model.slug === focusSlug) : undefined;
  if (target && readyIds.has(target.eventModelId)) return target.eventModelId;
  return models.find((model) => readyIds.has(model.eventModelId))?.eventModelId ?? null;
}

/** Filled = unlocked (seen) stamps; pending = stamped but still waiting for the hold. */
export function passportDotCounts(
  stampedModelIds: readonly string[],
  unreadIds: readonly string[],
): { filled: number; pending: number } {
  const unread = new Set(unreadIds);
  const pending = stampedModelIds.filter((id) => unread.has(id)).length;
  return { filled: stampedModelIds.length - pending, pending };
}

/** Font size of the seal's centre word so brand names stay inside the inner ring. */
export function sealCenterSize(text: string): number {
  const length = [...text.trim()].length;
  if (length <= 4) return 36;
  if (length === 5) return 31;
  if (length === 6) return 27;
  if (length === 7) return 24;
  return 21;
}

/** Ids with the highest public percentage (ties share the crown); empty below the threshold. */
export function favoriteLeaders(result: FairPassportFavoriteResultView | undefined): string[] {
  if (result?.state !== "public" || result.options.length === 0) return [];
  const top = Math.max(...result.options.map((option) => option.percentage));
  if (top <= 0) return [];
  return result.options.filter((option) => option.percentage === top).map((option) => option.eventModelId);
}

/** DEV fixture only: deterministic public split with the visitor's choice in front. */
export function devFavoriteResult(
  modelIds: readonly string[],
  favoriteId: string,
  threshold: "public" | "below",
): FairPassportFavoriteResultView {
  if (threshold === "below") return { state: "waiting_for_minimum" };
  const weights = [46, 31, 23, 17, 13, 11, 9, 7];
  const ordered = [favoriteId, ...modelIds.filter((id) => id !== favoriteId)];
  const used = weights.slice(0, ordered.length);
  const total = used.reduce((sum, value) => sum + value, 0);
  const percentages = used.map((value) => Math.floor((value / total) * 100));
  percentages[0] += 100 - percentages.reduce((sum, value) => sum + value, 0);
  const byId = new Map(ordered.map((id, index) => [id, percentages[index]]));
  return {
    state: "public",
    options: modelIds.map((id) => ({ eventModelId: id, percentage: byId.get(id) ?? 0 })),
  };
}
