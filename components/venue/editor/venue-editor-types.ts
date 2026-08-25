// Shared types for the standalone Venue editor (TASK-10). The data shape is
// the inferred return of the TASK-10 editor query — one source of truth, no
// hand-copied view models (the venue-view.ts precedent).

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { VenueBlock } from "@/lib/venue-blocks";

export type VenueEditorData = NonNullable<
  FunctionReturnType<typeof api.venue.editorBySlug>
>;
export type VenueEditorEvent = NonNullable<VenueEditorData["event"]>;

// The Venue panel-id list (RFC-001 §2.5). One list + one copy map drive both
// the desktop rail and the mobile dock.
export const VENUE_EDITOR_PANEL_IDS = [
  "blocks",
  "event",
  "style",
  "background",
  "text",
  "color",
  "settings",
  "analytics",
  "help",
] as const;

export type VenueEditorPanelId = (typeof VENUE_EDITOR_PANEL_IDS)[number];

// Selection (RFC §2.5): a block, the page itself, or nothing.
export type VenueEditorSelection =
  | { kind: "block"; id: string }
  | { kind: "page" }
  | null;

// The editable document. TASK-10's palette edits only the block list; the
// display name and page design ride along read-only from the editor query and
// join the document when their panels arrive (TASK-11).
export type VenueEditorDocument = {
  blocks: VenueBlock[];
};

export type VenueEditorSaveState = "saved" | "saving" | "error";

export type VenuePreviewDevice = "phone" | "desktop";

export type VenueEditorDocumentSetter = (
  next:
    | VenueEditorDocument
    | ((current: VenueEditorDocument) => VenueEditorDocument),
  group?: string,
) => void;

// The stored blocks brand storage ids as Id<"_storage">; the pure block model
// types them as strings. Runtime shape is identical — cast at the boundary,
// exactly as convex/venue.ts and venue-view.ts do.
export function draftBlocksToDocument(
  blocks: VenueEditorEvent["draftBlocks"],
): VenueBlock[] {
  return blocks as unknown as VenueBlock[];
}

export function documentBlocksToArg(
  blocks: VenueBlock[],
): VenueEditorEvent["draftBlocks"] {
  return blocks as unknown as VenueEditorEvent["draftBlocks"];
}

// Stable stringify (recursively sorted keys). Convex returns stored objects
// with sorted keys while locally-built blocks keep literal insertion order, so
// naive JSON.stringify would call two identical blocks different.
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
