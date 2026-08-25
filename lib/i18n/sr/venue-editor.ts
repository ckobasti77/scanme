import type { VenueEditorDict } from "../types";

// Venue editor copy. The one string that genuinely exists today is the shared
// editor-access denial (convex/lib/access.ts requireServiceEditorAccess). The
// `{product}` placeholder is filled via fmt(). The rest of the editor copy
// (panelCopy, aria-labels) arrives with the editor in TASK-06+.
export const venueEditorSr = {
  editorAccessDisabled:
    "Uređivanje {product} stranice nije omogućeno za klijenta.",
} as const satisfies VenueEditorDict;
