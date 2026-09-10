// The publish-time availability conflict contract shared by the Menu write
// backend (convex/menu.ts) and the editor (components/menu/editor) — RFC-003
// §3 Risk 10, TASK-58. Pure: no Convex, no React, so the editor can import it
// without dragging the server module into the client bundle.
//
// A CONFLICT is a draft item that says `available: true` while the LIVE
// published row of the same item says `false` — the floor's "nema više" that a
// publish from a stale draft would silently resurrect. `publishDraft` refuses
// such a publish unless the caller says how to resolve it; the editor asks
// the owner, the admin's publish-on-behalf always keeps the live value.

export const AVAILABILITY_CONFLICT_CODE = "availability_conflict" as const;

export type AvailabilityConflictMode = "keepLive" | "overwrite";

export type AvailabilityConflictItem = { key: string; name: string };

export type AvailabilityConflictData = {
  code: typeof AVAILABILITY_CONFLICT_CODE;
  items: AvailabilityConflictItem[];
};

export function isAvailabilityConflict(data: unknown): data is AvailabilityConflictData {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { code?: unknown }).code === AVAILABILITY_CONFLICT_CODE &&
    Array.isArray((data as { items?: unknown }).items)
  );
}
