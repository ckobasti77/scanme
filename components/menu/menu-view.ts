// Shared types + media resolution for the Menu render layer (TASK-51; the
// public route and its view queries land with §4 TASK-52). FORKED from
// components/venue/venue-view.ts (RFC-003 §1.a): the same two rules —
// (1) embedded storage ids are swapped for the query's SIGNED URLs before any
// renderer runs, and (2) a bare id that the map missed renders NOTHING, never
// a guessed `/api/storage/{id}` URL (RFC-003 §3 Risk #4; the Venue TASK-12
// bug that produced six invisible images).

import type { MenuDesign } from "@/lib/design-engine/menu-tokens";
import type { MenuDaypart, MenuGroup, MenuItem } from "@/lib/menu-blocks";

// Context every group renderer receives next to its group payload.
export type MenuRenderContext = {
  businessSlug: string;
  businessName: string;
};

// The render-ready page: what the public route (TASK-52) and the editor
// preview both hand the template. `design` is the pure model shape (null ⇒ the
// engine default); `groups` carry OPAQUE storage ids that `blockImageUrls`
// resolves.
export type MenuPageView = {
  businessName: string;
  design: MenuDesign | null;
  groups: MenuGroup[];
  /** Signed URL per storage id embedded in items (photo/video). Items store
   * bare ids; a bare id has NO public URL, so the template substitutes these
   * before the renderers run. */
  blockImageUrls: Record<string, string>;
};

// The public query's return (§4 TASK-54): the render-ready page PLUS the
// daypart fields the live subscription seam needs. A superset of MenuPageView,
// so the render layer (MenuPublicView → MenuTemplate) keeps consuming the
// smaller type unchanged — only MenuPublic reads `dayparts` (to resolve the
// clock daypart client-side). `groups` are already daypart-FILTERED by the
// query; `activeDaypartKey` is the effective daypart the query filtered by
// (override applied); `daypartOverride` is the pinned key or null.
export type MenuLiveView = MenuPageView & {
  dayparts: MenuDaypart[];
  daypartOverride: string | null;
  activeDaypartKey: string | null;
};

// Substitute item-embedded storage ids with their resolved (signed) URLs —
// the map the queries build with ctx.storage.getUrl(). Pure: items without
// media pass through untouched; an id the map misses is left as-is
// (menuStorageUrl then drops it rather than guessing a URL).
export function resolveMenuMedia(
  groups: MenuGroup[],
  urls: Record<string, string> | undefined,
): MenuGroup[] {
  if (!urls || Object.keys(urls).length === 0) return groups;
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) => resolveItemMedia(item, urls)),
  }));
}

function resolveItemMedia(
  item: MenuItem,
  urls: Record<string, string>,
): MenuItem {
  if (!item.photoStorageId && !item.videoStorageId) return item;
  return {
    ...item,
    photoStorageId: item.photoStorageId
      ? (urls[item.photoStorageId] ?? item.photoStorageId)
      : item.photoStorageId,
    videoStorageId: item.videoStorageId
      ? (urls[item.videoStorageId] ?? item.videoStorageId)
      : item.videoStorageId,
  };
}

// Media reference → displayable URL. After resolveMenuMedia the value is a
// URL (signed by the query) or a fixture path; a bare storage id can only mean
// the file was deleted or the map missed it. Render nothing (the accent tile
// takes over, §2.4) instead of a broken image.
export function menuStorageUrl(storageId: string | undefined): string | null {
  if (!storageId) return null;
  if (storageId.startsWith("/") || storageId.startsWith("http")) {
    return storageId;
  }
  return null;
}

// Every item of the menu by id — the lookup "Ide uz" pairings resolve through
// (the item sheet, §4 TASK-53) and the editor's pairing picker uses.
export function indexMenuItems(groups: MenuGroup[]): Map<string, MenuItem> {
  const map = new Map<string, MenuItem>();
  for (const group of groups) {
    for (const item of group.items) map.set(item.id, item);
  }
  return map;
}

// RSD price text: thousands grouped with a dot, no decimals (menu prices are
// whole dinars). Deliberately not Intl — identical output in every runtime.
export function formatRsd(price: number): string {
  const rounded = Math.round(price);
  const digits = String(Math.abs(rounded));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return rounded < 0 ? `-${grouped}` : grouped;
}
