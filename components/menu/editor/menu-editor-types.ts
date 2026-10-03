// Shared types for the standalone Menu editor (TASK-51). FORKED from
// components/venue/editor/venue-editor-types.ts: the data shape is the
// inferred return of the editor query — one source of truth, no hand-copied
// view models.

import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { MenuDesign } from "@/lib/design-engine/menu-tokens";
import type { MenuDaypart, MenuGroup } from "@/lib/menu-blocks";

export type MenuEditorData = NonNullable<
  FunctionReturnType<typeof api.menu.editorBySlug>
>;
export type MenuEditorMenu = NonNullable<MenuEditorData["menu"]>;

// The Menu panel-id list. One list + one copy map drive both the desktop rail
// and the mobile dock. No "event", no "settings", no "analytics" — a menu is
// one document per business; dayparts (§2.5) get their own panel.
export const MENU_EDITOR_PANEL_IDS = [
  "groups",
  "style",
  "background",
  "text",
  "color",
  "dayparts",
  "help",
] as const;

export type MenuEditorPanelId = (typeof MENU_EDITOR_PANEL_IDS)[number];

// Selection: a group, the page itself, or nothing. Items are edited inside
// their group's panel (nested lists), so they are not a selection kind.
export type MenuEditorSelection =
  | { kind: "group"; id: string }
  | { kind: "page" }
  | null;

// The editable document: the inline model (groups with their items, variants
// and pairings; dayparts; the daypart override) plus the page-level design
// document. All of it flows through ONE history (undo covers a palette change
// exactly like an item edit) and ONE autosave payload.
export type MenuEditorDocument = {
  groups: MenuGroup[];
  dayparts: MenuDaypart[];
  daypartOverride?: string;
  design: MenuDesign | null;
};

export type MenuEditorSaveState = "saved" | "saving" | "error";

export type MenuPreviewDevice = "phone" | "desktop";

export type MenuEditorDocumentSetter = (
  next:
    | MenuEditorDocument
    | ((current: MenuEditorDocument) => MenuEditorDocument),
  group?: string,
) => void;

// The stored model brands storage ids as Id<"_storage">; the pure model types
// them as strings. Runtime shape is identical — cast at the boundary, exactly
// as convex/menu.ts and menu-view.ts do.
export type StoredMenuModel = MenuEditorMenu["draftModel"];

export function draftToDocument(menu: MenuEditorMenu): MenuEditorDocument {
  const model = menu.draftModel as unknown as {
    groups: MenuGroup[];
    dayparts: MenuDaypart[];
    daypartOverride?: string;
  };
  return {
    groups: model.groups,
    dayparts: model.dayparts,
    ...(model.daypartOverride !== undefined
      ? { daypartOverride: model.daypartOverride }
      : {}),
    // Stored design shape → pure model shape; runtime-identical.
    design: menu.draftDesign as unknown as MenuDesign | null,
  };
}

export function documentToModelArg(
  document: MenuEditorDocument,
): StoredMenuModel {
  const model = {
    groups: document.groups,
    dayparts: document.dayparts,
    ...(document.daypartOverride !== undefined
      ? { daypartOverride: document.daypartOverride }
      : {}),
  };
  return model as unknown as StoredMenuModel;
}

// Stable stringify (recursively sorted keys). Convex returns stored objects
// with sorted keys while locally-built groups keep literal insertion order, so
// naive JSON.stringify would call two identical documents different.
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
