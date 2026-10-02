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
