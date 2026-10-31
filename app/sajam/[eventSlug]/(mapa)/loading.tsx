"use client";

import { useParams } from "next/navigation";
import { FairRouteLoading } from "@/components/fair/event-shell-loading";
import { MapSkeleton } from "../_mapa/map-skeleton";

// Instant tab switch: the shell with "Mapa" active and the map skeleton while the page streams.
export default function FairMapLoading() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  return (
    <FairRouteLoading current="map">
      <MapSkeleton autoMoto={eventSlug.replace(/^test-/, "") === "auto-moto-fest-2026"} />
    </FairRouteLoading>
  );
}
