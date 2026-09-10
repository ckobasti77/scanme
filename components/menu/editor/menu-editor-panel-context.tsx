"use client";

// Panel-side services (TASK-51; FORKED from
// components/venue/editor/venue-editor-panel-context.tsx). The registry's
// EditorPanel contract is deliberately just { group, onChange } — everything
// else a panel needs (uploads, the current page palette, local previews for
// images whose signed URL has not round-tripped yet, the daypart list a group
// binds to, the items a pairing can point at) rides on this context, provided
// once by the workspace. Keeps the panels prop-free and the registry seam
// narrow.

import { createContext, useContext } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import type { MenuColors } from "@/lib/design-engine/menu-tokens";
import type { MenuDaypart } from "@/lib/menu-blocks";
import { menuEditorSr as dict } from "@/lib/i18n/sr/menu-editor";
import type { PaletteSwatch } from "./menu-editor-fields";

export type MenuEditorUpload = (
  file: File,
  onProgress: (percent: number) => void,
) => Promise<string>; // resolves to the storage id

// An item as the "Ide uz" picker sees it: its id, its name, and the title of
// the group it sits in (so two "Šljivovica" rows are distinguishable).
export type PairableItem = { id: string; name: string; groupTitle: string };

export type MenuEditorPanelServices = {
  menuId: Id<"menus">;
  /** The CURRENT page palette's roles — the only colours any control offers. */
  swatches: PaletteSwatch[];
  upload: MenuEditorUpload;
  /** storageId → displayable URL: the editor query's signed URLs merged with
   * object URLs for files uploaded this session (so an image shows instantly,
   * before its signed URL round-trips). */
  mediaUrls: Record<string, string>;
  registerLocalMedia: (storageId: string, objectUrl: string) => void;
  /** The document's dayparts (§2.5) — what a group's daypart select offers. */
  dayparts: readonly MenuDaypart[];
  /** Every item in the menu (§2.3) — what a pairing can point at. */
  pairableItems: readonly PairableItem[];
};

const MenuEditorPanelContext = createContext<MenuEditorPanelServices | null>(
  null,
);

export const MenuEditorPanelProvider = MenuEditorPanelContext.Provider;

export function useMenuPanelServices(): MenuEditorPanelServices {
  const value = useContext(MenuEditorPanelContext);
  if (!value) {
    // Panels only mount inside the workspace; reaching this is a wiring bug.
    throw new Error("MenuEditorPanelProvider missing");
  }
  return value;
}

// The page palette as swatch options, labelled by role. One place defines the
// role → label pairing (a Record over MenuColors keys, so a new role is a
// type error here, not a silently missing swatch).
export function paletteSwatches(colors: MenuColors): PaletteSwatch[] {
  const labels: Record<keyof MenuColors, string> = {
    page: dict.rolePage,
    surface: dict.roleSurface,
    title: dict.roleTitle,
    body: dict.roleBody,
    accent: dict.roleAccent,
    border: dict.roleBorder,
    focus: dict.roleFocus,
    icon: dict.roleIcon,
  };
  return (Object.keys(labels) as (keyof MenuColors)[]).map((key) => ({
    key,
    label: labels[key],
    color: colors[key],
  }));
}
