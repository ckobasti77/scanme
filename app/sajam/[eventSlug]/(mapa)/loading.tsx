"use client";

import { useParams } from "next/navigation";
import { FairRouteLoading } from "@/components/fair/event-shell-loading";
import { fairEventHomeHidden } from "@/lib/fair-salon";
import { MapSkeleton } from "../_mapa/map-skeleton";

// Instant tab switch: the shell with "Mapa" active and the map skeleton while the page streams.
// An event with brand salons (Auto Expo) has no public home (404): no shell flashes before it.
export default function FairMapLoading() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  if (fairEventHomeHidden(eventSlug)) return null;
  return (
    <FairRouteLoading current="map">
      <MapSkeleton autoMoto={eventSlug.replace(/^test-/, "") === "auto-moto-fest-2026"} />
    </FairRouteLoading>
  );
}
