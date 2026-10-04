"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { FairSponsoredRotationView } from "@/lib/fair-contract";

// K2 (RF finding 2) — the map and fair displays follow the published Advanced
// snapshot and its audience results live: one reactive read of the B5
// projection over the Convex client (ConvexClientProvider in app/layout.tsx).
// The server-rendered projection stays the first state until the subscription
// answers, so nothing flashes or empties. A new publish, a withdrawn model or a
// new result arrives without a reload; the active slot is still picked from the
// snapshot's epoch by rotation-slot.ts, so every display stays on the same
// model. A query only: nothing here votes or writes.

/** Live map rotation: the server-rendered `initial` until the subscription answers, then the current projection (null = no rotation). */
export function useLiveFairMapRotation(eventSlug: string, initial: FairSponsoredRotationView | null): FairSponsoredRotationView | null {
  const live = useQuery(api.fairPublic.getSponsoredMapRotation, { eventSlug });
  return live === undefined ? initial : live;
}
