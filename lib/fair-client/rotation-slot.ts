export const FAIR_MAP_ROTATION_INTERVAL_MS = 12_000;
export const FAIR_GARAGE_ROTATION_INTERVAL_MS = 8_000;

export type FairRotationSlot = {
  index: number;
  slotNumber: number;
  slotStartedAt: number;
  nextSlotAt: number;
  progress: number;
};

type FairRotationSlotInput = {
  epochMs: number;
  nowMs: number;
  intervalMs: number;
  itemCount: number;
};

export function getFairRotationSlot({
  epochMs,
  nowMs,
  intervalMs,
  itemCount,
}: FairRotationSlotInput): FairRotationSlot | null {
  if (
    !Number.isFinite(epochMs) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0 ||
    !Number.isInteger(itemCount) ||
    itemCount <= 0
  ) {
    return null;
  }

  const elapsedMs = Math.max(0, nowMs - epochMs);
  const slotNumber = Math.floor(elapsedMs / intervalMs);
  const elapsedInSlot = elapsedMs - slotNumber * intervalMs;

  return {
    index: slotNumber % itemCount,
    slotNumber,
    slotStartedAt: epochMs + slotNumber * intervalMs,
    nextSlotAt: epochMs + (slotNumber + 1) * intervalMs,
    progress: elapsedInSlot / intervalMs,
  };
}

export function getFairRotationItem<T>(
  items: readonly T[],
  input: Omit<FairRotationSlotInput, "itemCount">,
): { item: T; slot: FairRotationSlot } | null {
  const slot = getFairRotationSlot({ ...input, itemCount: items.length });
  if (!slot) return null;
  return { item: items[slot.index], slot };
}

export type FairSponsoredTimeline = {
  mode: "shared" | "local";
  index: number;
  slotNumber: number;
  intervalMs: number;
  startedAtMs: number;
  durationMs: number;
  switchAtMs: number;
  barStartProgress: number;
  paused: { progress: number; remainingMs: number } | null;
};

export type FairSponsoredTimelineTiming = {
  index: number;
  slotNumber: number;
  startedAtMs: number;
  barStartProgress: number;
  barDurationMs: number;
  barEndAtMs: number;
  switchAtMs: number;
  paused: boolean;
};

export function createSponsoredTimeline(
  input: FairRotationSlotInput,
): FairSponsoredTimeline | null {
  const slot = getFairRotationSlot(input);
  if (!slot) return null;
  const durationMs = Math.max(1, slot.nextSlotAt - input.nowMs);
  return {
    mode: "shared",
    index: slot.index,
    slotNumber: slot.slotNumber,
    intervalMs: input.intervalMs,
    startedAtMs: input.nowMs,
    durationMs,
    switchAtMs: input.nowMs + durationMs,
    barStartProgress: Math.min(1, Math.max(0, slot.progress)),
    paused: null,
  };
}

/**
 * A new swipe may start only while no slide runs: nothing incoming and no
 * slide tween (swipe release or auto advance) before its onComplete.
 */
export function canStartSponsoredSwipe(state: { itemCount: number; sliding: boolean; incomingIndex: number | null }): boolean {
  return state.itemCount > 1 && !state.sliding && state.incomingIndex === null;
}

export function swipeSponsoredTimeline(
  current: FairSponsoredTimeline | null,
  input: {
    nextIndex: number;
    nowMs: number;
    intervalMs: number;
    itemCount: number;
  },
): FairSponsoredTimeline | null {
  const { nextIndex, nowMs, intervalMs, itemCount } = input;
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0 ||
    !Number.isInteger(itemCount) ||
    itemCount <= 0
  ) {
    return null;
  }
  const normalizedIndex = ((nextIndex % itemCount) + itemCount) % itemCount;
  return {
    mode: "local",
    index: normalizedIndex,
    slotNumber: (current?.slotNumber ?? 0) + 1,
    intervalMs,
    startedAtMs: nowMs,
    durationMs: intervalMs,
    switchAtMs: nowMs + intervalMs,
    barStartProgress: 0,
    paused: null,
  };
}

export function advanceSponsoredTimeline(
  current: FairSponsoredTimeline,
  input: {
    nowMs: number;
    epochMs: number;
    itemCount: number;
    forceShared?: boolean;
  },
): FairSponsoredTimeline {
  const { nowMs, epochMs, itemCount, forceShared = false } = input;
  if (itemCount <= 0) return current;

  if (current.mode === "local" && !forceShared) {
    return {
      mode: "local",
      index: (current.index + 1) % itemCount,
      slotNumber: current.slotNumber + 1,
      intervalMs: current.intervalMs,
      startedAtMs: nowMs,
      durationMs: current.intervalMs,
      switchAtMs: nowMs + current.intervalMs,
      barStartProgress: 0,
      paused: null,
    };
  }

  const effectiveNow = Math.max(nowMs, current.switchAtMs);
  const slot = getFairRotationSlot({
    epochMs,
    nowMs: effectiveNow,
    intervalMs: current.intervalMs,
    itemCount,
  });
  if (!slot) {
    return {
      mode: "shared",
      index: (current.index + 1) % itemCount,
      slotNumber: current.slotNumber + 1,
      intervalMs: current.intervalMs,
      startedAtMs: nowMs,
      durationMs: current.intervalMs,
      switchAtMs: nowMs + current.intervalMs,
      barStartProgress: 0,
      paused: null,
    };
  }
  const durationMs = Math.max(1, slot.nextSlotAt - nowMs);
  const progress = Math.min(
    1,
    Math.max(0, (nowMs - slot.slotStartedAt) / current.intervalMs),
  );
  return {
    mode: "shared",
    index: slot.index,
    slotNumber: slot.slotNumber,
    intervalMs: current.intervalMs,
    startedAtMs: nowMs,
    durationMs,
    switchAtMs: nowMs + durationMs,
    barStartProgress: progress,
    paused: null,
  };
}

export function pauseSponsoredTimeline(
  current: FairSponsoredTimeline,
  nowMs: number,
): FairSponsoredTimeline {
  if (current.paused !== null) return current;
  const elapsedMs = Math.max(
    0,
    Math.min(current.durationMs, nowMs - current.startedAtMs),
  );
  const remainingMs = Math.max(1, current.durationMs - elapsedMs);
  const span = 1 - current.barStartProgress;
  const progress = Math.min(
    1,
    Math.max(
      0,
      current.barStartProgress +
        (current.durationMs > 0 ? (elapsedMs / current.durationMs) * span : 0),
    ),
  );
  return {
    ...current,
    paused: { progress, remainingMs },
  };
}

export function resumeSponsoredTimeline(
  current: FairSponsoredTimeline,
  nowMs: number,
): FairSponsoredTimeline {
  if (current.paused === null) return current;
  const { progress, remainingMs } = current.paused;
  return {
    ...current,
    mode: "local",
    startedAtMs: nowMs,
    durationMs: remainingMs,
    switchAtMs: nowMs + remainingMs,
    barStartProgress: progress,
    paused: null,
  };
}

export function getSponsoredTimelineTiming(
  timeline: FairSponsoredTimeline,
): FairSponsoredTimelineTiming {
  const barDurationMs = timeline.paused
    ? timeline.paused.remainingMs
    : timeline.durationMs;
  const barStartProgress = timeline.paused
    ? timeline.paused.progress
    : timeline.barStartProgress;
  const barEndAtMs = timeline.startedAtMs + barDurationMs;
  return {
    index: timeline.index,
    slotNumber: timeline.slotNumber,
    startedAtMs: timeline.startedAtMs,
    barStartProgress,
    barDurationMs,
    barEndAtMs,
    switchAtMs: timeline.switchAtMs,
    paused: timeline.paused !== null,
  };
}
