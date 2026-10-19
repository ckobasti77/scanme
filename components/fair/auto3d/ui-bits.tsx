"use client";

// Sitni zajednički delovi stranice /sajam/3d (A05): skrivena polja GET forme (linkovi rade i bez
// JS-a), strelice u listi dugmadi, hidratacija i fokus posle zatvaranja kartice.

import { useSyncExternalStore, type KeyboardEvent } from "react";
import type { SystemId } from "@/lib/auto3d/catalog";
import type { Mode } from "@/lib/auto3d/filter";

export const PANEL_ID = "a3-panel";
export const SEARCH_ID = "a3-search";
export const CARD_TITLE_ID = "a3-card-title";
export const STUDIO_ID = "a3-studio";
export const tabId = (tab: string) => `a3-tab-${tab}`;
export const tabPanelId = (tab: string) => `a3-tabpanel-${tab}`;

/** Bez JS-a dugmad u listama su `submit` GET forme na /sajam/3d; ova polja čuvaju grupu i režim. */
export function UrlHidden({ group, mode }: { group?: SystemId | null; mode: Mode }) {
  return (
    <>
      {group ? <input type="hidden" name="grupa" value={group} /> : null}
      {mode !== "rendgen" ? <input type="hidden" name="rezim" value={mode} /> : null}
    </>
  );
}

function visible(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0;
}

/** Strelice gore i dole, Home i End pomeraju fokus između dugmadi unutar `currentTarget`. */
export function listKeys(e: KeyboardEvent<HTMLElement>, selector = "button") {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(selector)).filter((el) => visible(el));
  const i = items.indexOf(document.activeElement as HTMLElement);
  if (i < 0 || items.length === 0) return;
  e.preventDefault();
  const n = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : e.key === "ArrowDown" ? Math.min(items.length - 1, i + 1) : Math.max(0, i - 1);
  items[n].focus();
}

const noop = () => () => {};

/** false na serveru i pri hidrataciji, true posle nje (bez razlike u markup-u pri hidrataciji). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/**
 * Posle zatvaranja kartice fokus ne sme da ostane na skrivenom elementu: vraća se na red tog dela
 * u listi (ako se vidi), a inače na studio.
 */
export function restoreFocus(part: string | null) {
  requestAnimationFrame(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active && active !== document.body && visible(active)) return;
    const row = part ? document.querySelector<HTMLElement>(`[data-part-row="${part}"]`) : null;
    if (row && visible(row)) row.focus({ preventScroll: false });
    else document.getElementById(STUDIO_ID)?.focus({ preventScroll: true });
  });
}
