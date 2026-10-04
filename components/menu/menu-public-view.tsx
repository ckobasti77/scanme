"use client";

// The public Menu render's client controller (RFC-003 §4 TASK-52). It REUSES
// TASK-51's shipped render layer verbatim — MenuTemplate and, through it, the
// five shape renderers + the accent tiles — and adds only the two behaviours
// TASK-51 left to this task: the sticky scroll-spy nav (jump, never filter) and
// the single-open caret accordion. It holds the open group id, hands it to the
// shared caret and to MenuGroupRender via MenuAccordionProvider, and applies the
// PURE single-open rule `toggleAccordion` from lib/menu-blocks.ts — no rule is
// invented here. Separated from the subscription wrapper (menu-public.tsx) so
// the /dev preview can mount it with a fixture view.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toggleAccordion } from "@/lib/menu-blocks";
import { groupContainerId } from "./blocks/group-shell";
import { MenuAccordionProvider } from "./menu-accordion-context";
import {
  MenuItemSheetProvider,
  type MenuItemSheetValue,
} from "./menu-item-sheet-context";
import { MenuItemSheet } from "./menu-item-sheet";
import { MenuNav } from "./menu-nav";
import { MenuTemplate } from "./menu-template";
import { indexMenuItems, type MenuPageView } from "./menu-view";

export function MenuPublicView({
  view,
  slug,
}: {
  view: MenuPageView;
  slug: string;
}) {
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // Which group's own caret should receive focus once its collapse commits —
  // set only when the collapsing group currently holds keyboard focus (the
  // items it removes from the DOM would otherwise drop focus to <body>).
  const pendingFocusGroupId = useRef<string | null>(null);

  const toggle = useCallback((groupId: string) => {
    setOpenGroupId((current) => {
      const next = toggleAccordion(current, groupId);
      if (current && current !== next && typeof document !== "undefined") {
        const closingContainer = document.getElementById(
          groupContainerId(current),
        );
        const activeEl = document.activeElement;
        if (
          closingContainer &&
          activeEl &&
          closingContainer.contains(activeEl)
        ) {
          pendingFocusGroupId.current = current;
        }
      }
      return next;
    });
  }, []);
  useEffect(() => {
    const groupId = pendingFocusGroupId.current;
    if (!groupId) return;
    pendingFocusGroupId.current = null;
    document
      .querySelector<HTMLButtonElement>(`[data-menu-caret="${groupId}"]`)
      ?.focus();
  }, [openGroupId]);
  const accordionValue = useMemo(
    () => ({ openGroupId, toggle }),
    [openGroupId, toggle],
  );

  const openItem = useCallback(
    (itemId: string, triggerEl?: HTMLElement | null) => {
      openerRef.current =
        triggerEl ??
        (typeof document !== "undefined"
          ? (document.activeElement as HTMLElement | null)
          : null);
      setActiveItemId(itemId);
    },
    [],
  );

  const closeSheet = useCallback(() => {
    setActiveItemId(null);
    if (openerRef.current && typeof openerRef.current.focus === "function") {
      openerRef.current.focus();
    }
  }, []);

  const sheetValue = useMemo<MenuItemSheetValue>(
    () => ({ activeItemId, openItem, closeSheet }),
    [activeItemId, openItem, closeSheet],
  );

  const itemsById = useMemo(() => indexMenuItems(view.groups), [view.groups]);
  const activeItem = activeItemId ? itemsById.get(activeItemId) ?? null : null;

  return (
    <MenuAccordionProvider value={accordionValue}>
      <MenuItemSheetProvider value={sheetValue}>
        <MenuNav groups={view.groups} />
        <MenuTemplate view={view} businessSlug={slug} />
        {activeItem ? (
          <MenuItemSheet
            item={activeItem}
            itemsById={itemsById}
            onClose={closeSheet}
            onSelectItem={(id) => setActiveItemId(id)}
          />
        ) : null}
      </MenuItemSheetProvider>
    </MenuAccordionProvider>
  );
}

