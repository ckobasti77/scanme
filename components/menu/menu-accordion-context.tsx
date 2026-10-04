// The single-open caret accordion's shared state (RFC-003 §2.1, §4 TASK-52).
// The public client controller (menu-public-view.tsx) provides it; the shared
// caret (blocks/item-parts.tsx `MoreCaret`) consumes it. When NO provider is
// present — the editor preview, the SSR first paint before hydration, and the
// TASK-51 render tests — `useMenuAccordion()` returns null and the caret falls
// back to its static label, byte-identical to TASK-51. The single-open RULE
// itself is the pure `toggleAccordion` in lib/menu-blocks.ts; this only carries
// the current open group id and the toggle across the render tree.

"use client";

import { createContext, useContext } from "react";

export type MenuAccordionValue = {
  openGroupId: string | null;
  toggle: (groupId: string) => void;
};

const MenuAccordionContext = createContext<MenuAccordionValue | null>(null);

export const MenuAccordionProvider = MenuAccordionContext.Provider;

export function useMenuAccordion(): MenuAccordionValue | null {
  return useContext(MenuAccordionContext);
}
