import { getFairRotationItem, getFairRotationSlot } from "../fair-client/rotation-slot";
import type { FairSponsoredModelCard, FairSponsoredRotationView } from "../fair-contract";
import type { FairMapLocation, FairMapZoneId } from "./types";
import type { FairMapView } from "./view";

// M2 — the map/display side of the 12 s Advanced rotation. The active item is
// ONLY Kodeks's lib/fair-client/rotation-slot.ts over the B5 projection
// (epochMs = publishedAt, intervalMs, items in snapshot order): every map and
// display with the same clock shows the same model. No second algorithm, no
// polling, no write.

export type FairMapRotationState = {
  item: FairSponsoredModelCard;
  slotNumber: number;
  nextSlotAt: number;
};

/** The active rotation item at `nowMs`, or null without a published, non-empty snapshot. */
export function fairMapRotationAt(rotation: FairSponsoredRotationView | null, nowMs: number): FairMapRotationState | null {
  if (!rotation) return null;
  const active = getFairRotationItem(rotation.items, { epochMs: rotation.epochMs, nowMs, intervalMs: rotation.intervalMs });
  return active ? { item: active.item, slotNumber: active.slot.slotNumber, nextSlotAt: active.slot.nextSlotAt } : null;
}

/** Slot number at `nowMs` (-1 without rotation): the value a client clock subscribes to. */
export function fairMapRotationSlotNumber(rotation: FairSponsoredRotationView | null, nowMs: number): number {
  if (!rotation) return -1;
  return getFairRotationSlot({ epochMs: rotation.epochMs, nowMs, intervalMs: rotation.intervalMs, itemCount: rotation.items.length })?.slotNumber ?? -1;
}

/** Where a stand location is on the event map: its zone, polygon and (if published there) the catalog stand id. */
export function locateFairMapStand(
  view: FairMapView,
  mapLocationId: string,
): { zoneId: FairMapZoneId; location: FairMapLocation; standId: string | null } | null {
  for (const zoneView of view.zones) {
    const location = zoneView.zone.locations.find((row) => row.kind === "stand" && row.id === mapLocationId);
    if (location) {
      const placed = zoneView.stands.find((row) => row.location.id === mapLocationId);
      return { zoneId: zoneView.zone.id, location, standId: placed?.stand.standId ?? null };
    }
  }
  return null;
}
