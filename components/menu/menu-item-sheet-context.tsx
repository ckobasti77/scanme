"use client";

// The Menu item bottom-sheet shared context (RFC-003 §2.5, §4 TASK-53).
// The public client controller (menu-public-view.tsx) provides it; item renders
// in all five group shapes consume it via useMenuItemTrigger. When NO provider is
// present — the editor preview, the SSR first paint before hydration, and the
// TASK-51/52 render tests — useMenuItemSheet returns null and useMenuItemTrigger
// returns an empty object, so items render without interactive button wrappers or
// handlers, byte-identical to previous tasks.

import {
  createContext,
  useCallback,
  useContext,
  type KeyboardEvent,
  type MouseEvent,
} from "react";

export type MenuItemSheetValue = {
  activeItemId: string | null;
  openItem: (itemId: string, triggerEl?: HTMLElement | null) => void;
  closeSheet: () => void;
};

const MenuItemSheetContext = createContext<MenuItemSheetValue | null>(null);

export const MenuItemSheetProvider = MenuItemSheetContext.Provider;

export function useMenuItemSheet(): MenuItemSheetValue | null {
  return useContext(MenuItemSheetContext);
}

export type MenuItemTriggerProps = {
  role?: "button";
  tabIndex?: 0;
  "aria-haspopup"?: "dialog";
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
};

/**
 * Returns accessibility and interaction props to attach to an item container
 * (<li> or <article>) so that clicking or pressing Enter/Space opens its bottom sheet.
 * If no MenuItemSheetProvider is in scope, returns an empty object (inert).
 */
export function useMenuItemTrigger(itemId: string): MenuItemTriggerProps {
  const sheet = useMenuItemSheet();

  const handleClick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      sheet?.openItem(itemId, event.currentTarget);
    },
    [sheet, itemId],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        sheet?.openItem(itemId, event.currentTarget);
      }
    },
    [sheet, itemId],
  );

  if (!sheet) return {};

  return {
    role: "button",
    tabIndex: 0,
    "aria-haspopup": "dialog",
    onClick: handleClick,
    onKeyDown: handleKeyDown,
  };
}
