// K31 (outside lib/menu: it reads dictionaries through the @/ alias): the one form of every Menu page title (docs/menu/RECNIK.md §8).
//   panel, editor, konobarski panel:  "<Naziv> | ScanMe Menu"
//   javni meni:                       "<Naziv lokala> — Meni" (a page: "<Naziv lokala> — <Stranica>")
// Routes call these; none of them assembles a title by hand.

import { fmt } from "@/lib/i18n";
import { menuJavniSr } from "@/lib/i18n/sr/menu-javni";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";

/** Panel, editor and waiter panel: "Analitika | ScanMe Menu". */
export function menuNaslov(naziv: string): string {
  return fmt(menuPanelSr.meta.naslov, { naziv });
}

/** The public menu: "Kafana kod Mike — Meni", or "Kafana kod Mike — Doručak" for a page. */
export function javniNaslov(lokal: string, stranica?: string): string {
  return stranica
    ? fmt(menuJavniSr.meta.naslovStranice, { lokal, stranica })
    : fmt(menuJavniSr.meta.naslov, { lokal });
}
