"use client";

// Panel-side services (TASK-12). The registry's EditorPanel contract is
// deliberately just { block, onChange } — everything else a panel needs
// (uploads, the current page palette, local previews for images whose signed
// URL hasn't round-tripped yet) rides on this context, provided once by the
// workspace. Keeps the twelve panels prop-free and the registry seam narrow.

import { createContext, useContext } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { VenueColors } from "@/lib/design-engine/venue-tokens";
import { venueEditorSr as dict } from "@/lib/i18n/sr/venue-editor";
import type { PaletteSwatch } from "./venue-editor-fields";

export type VenueEditorUpload = (
  file: File,
  onProgress: (percent: number) => void,
) => Promise<string>; // resolves to the storage id

export type VenueEditorPanelServices = {
  eventId: Id<"events">;
  /** The CURRENT page palette's roles — the only colours any control offers. */
  swatches: PaletteSwatch[];
  upload: VenueEditorUpload;
  /** storageId → displayable URL: the editor query's signed URLs merged with
   * object URLs for files uploaded this session (so an image shows instantly,
   * before its signed URL round-trips). */
  mediaUrls: Record<string, string>;
  registerLocalMedia: (storageId: string, objectUrl: string) => void;
};

const VenueEditorPanelContext =
  createContext<VenueEditorPanelServices | null>(null);

export const VenueEditorPanelProvider = VenueEditorPanelContext.Provider;

export function useVenuePanelServices(): VenueEditorPanelServices {
  const value = useContext(VenueEditorPanelContext);
  if (!value) {
    // Panels only mount inside the workspace; reaching this is a wiring bug.
    throw new Error("VenueEditorPanelProvider missing");
  }
  return value;
}

// The page palette as swatch options, labelled by role. One place defines the
// role → label pairing (a Record over VenueColors keys, so a new role is a
// type error here, not a silently missing swatch).
export function paletteSwatches(colors: VenueColors): PaletteSwatch[] {
  const labels: Record<keyof VenueColors, string> = {
    page: dict.rolePage,
    surface: dict.roleSurface,
    title: dict.roleTitle,
    body: dict.roleBody,
    accent: dict.roleAccent,
    border: dict.roleBorder,
    focus: dict.roleFocus,
    icon: dict.roleIcon,
  };
  return (Object.keys(labels) as (keyof VenueColors)[]).map((key) => ({
    key,
    label: labels[key],
    color: colors[key],
  }));
}
