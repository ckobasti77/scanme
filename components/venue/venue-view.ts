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

// Substitute block-embedded storage ids with their resolved (signed) URLs —
// the map the queries build with ctx.storage.getUrl(). Pure and shallow-safe:
// blocks without media pass through untouched; an id the map misses is left
// as-is (venueStorageUrl then drops it rather than guessing a URL). Used by
// viewBlocks for the public page and by the editor preview for draft blocks.
export function resolveVenueBlockMedia(
  blocks: VenueBlock[],
  urls: Record<string, string> | undefined,
): VenueBlock[] {
  if (!urls || Object.keys(urls).length === 0) return blocks;
  return blocks.map((block) => {
    if (block.type === "gallery") {
      return {
        ...block,
        props: {
          ...block.props,
          items: block.props.items.map((item) => ({
            ...item,
            storageId: urls[item.storageId] ?? item.storageId,
          })),
        },
      };
    }
    if (block.type === "profileCards") {
      return {
        ...block,
        props: {
          ...block.props,
          items: block.props.items.map((item) => ({
            ...item,
            imageStorageId: item.imageStorageId
              ? urls[item.imageStorageId] ?? item.imageStorageId
              : item.imageStorageId,
          })),
        },
      };
    }
    if (block.type === "programTimeline") {
      return {
        ...block,
        props: {
          ...block.props,
          items: block.props.items.map((item) => ({
            ...item,
            imageStorageId: item.imageStorageId
              ? urls[item.imageStorageId] ?? item.imageStorageId
              : item.imageStorageId,
          })),
        },
      };
    }
    return block;
  });
}

// The view model stores blocks with Convex-branded storage ids; the pure block
// model types them as strings. Runtime shape is identical — cast at the
// boundary exactly as convex/venue.ts does. Embedded media ids are swapped for
// the query's signed URLs here, BEFORE any renderer runs.
export function viewBlocks(view: VenuePageView): VenueBlock[] {
  return resolveVenueBlockMedia(
    view.blocks as unknown as VenueBlock[],
    view.blockImageUrls,
  );
}

// Media reference → displayable URL. After resolveVenueBlockMedia the value is
// a URL (signed by the query) or a fixture path; a bare storage id can only
// mean the file was deleted or the map missed it, and an unsigned
// `/api/storage/{id}` guess is REJECTED by Convex (the Step-0 TASK-12 gap: six
// invisible broken gallery images read as a ~300px void on the public page).
// Render nothing instead of a broken image.
export function venueStorageUrl(storageId: string | undefined): string | null {
  if (!storageId) return null;
  if (storageId.startsWith("/") || storageId.startsWith("http")) {
    return storageId;
  }
  return null;
}
