// Shared types for the Venue render layer (TASK-09). The view models are the
// inferred return types of the TASK-08 public queries — one source of truth,
// no hand-copied shapes.

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { VenueBlock } from "@/lib/venue-blocks";

export type VenuePageView = NonNullable<
  FunctionReturnType<typeof api.venue.publicVenueView>
>;
export type VenuePageState = NonNullable<
  FunctionReturnType<typeof api.venue.publicVenuePageState>
>;
export type ArchivedEventView = FunctionReturnType<
  typeof api.venue.archivedEvents
>[number];

// The page's three lives (RFC-001 §2.2): before / live / after.
export type VenueLifecycle = "before" | "live" | "after";

// Context every block renderer receives next to its block payload.
export type VenueRenderContext = {
  businessSlug: string;
  eventSlug: string;
  eventTitle: string;
  displayName: string;
  eventStartsAt: number | null;
  eventEndsAt: number | null;
  lifecycle: VenueLifecycle;
  /** Resolved archive data, present when the page fetched it (pastEvents/after). */
  pastEvents: ArchivedEventView[] | null;
};

// The view model stores blocks with Convex-branded storage ids; the pure block
// model types them as strings. Runtime shape is identical — cast at the
// boundary exactly as convex/venue.ts does.
export function viewBlocks(view: VenuePageView): VenueBlock[] {
  return view.blocks as unknown as VenueBlock[];
}

// A stored storage id resolves to the deployment's public file URL. Convex
// serves storage documents at {deployment}/api/storage/{id} — the same URLs
// ctx.storage.getUrl() returns for top-level media in the view model.
export function venueStorageUrl(storageId: string | undefined): string | null {
  if (!storageId) return null;
  // Fixture affordance: a real storage id is an opaque token, never a path or
  // URL, so path-shaped values (dev preview, render smoke) pass through.
  if (storageId.startsWith("/") || storageId.startsWith("http")) {
    return storageId;
  }
  const base = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}/api/storage/${storageId}`;
}
