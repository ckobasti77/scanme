// ScanMe Menu V1 — navigation of the client panel shell (K08, master §13.1).
//
// Pure and dependency-free except for the permission matrix: what a role SEES
// in the panel is decided by the same `roleCan` that Convex enforces
// (lib/menu/permissions.ts), never by a second table. The eight sections are
// in the locked order of master §13.1 — Analitika is second to last, right
// above Podešavanja — and a role only filters that list, it never reorders it.

import { roleCan, type MenuActor, type MenuPermission } from "./permissions";

/** The eight sections of the ScanMe Menu client panel, in order (master §13.1, ZAKLJUČANO). */
export const PANEL_NAV_SEKCIJE = [
  "pocetna",
  "editor",
  "operativa",
  "lokal",
  "funkcionalnosti",
  "tim",
  "analitika",
  "podesavanja",
] as const;
export type PanelNavSekcija = (typeof PANEL_NAV_SEKCIJE)[number];

/**
 * The permission a section needs to be shown. Početna and Editor need only
 * `menu.read` (an Urednik sees the menu status and the editor, K01 §4.1);
 * every other section needs the permission of the work done there.
 */
export const PANEL_SEKCIJA_DOZVOLA: Readonly<Record<PanelNavSekcija, MenuPermission>> = {
  pocetna: "menu.read",
  editor: "menu.read",
  operativa: "operations.read",
  lokal: "venue.edit",
  funkcionalnosti: "features.edit",
  tim: "team.manage",
  analitika: "analytics.read",
  podesavanja: "settings.edit",
};

/** URL segment under `/[slug]/client-panel/meni`; Početna is the index (null). */
export const PANEL_SEKCIJA_SEGMENT: Readonly<Record<PanelNavSekcija, string | null>> = {
  pocetna: null,
  editor: "editor",
  operativa: "operativa",
  lokal: "lokal",
  funkcionalnosti: "funkcionalnosti",
  tim: "tim",
  analitika: "analitika",
  podesavanja: "podesavanja",
};

export function sekcijaVidljiva(actor: MenuActor, sekcija: PanelNavSekcija): boolean {
  return roleCan(actor, PANEL_SEKCIJA_DOZVOLA[sekcija]);
}

/** The sections a role sees, in the locked order. */
export function vidljiveSekcije(actor: MenuActor): PanelNavSekcija[] {
  return PANEL_NAV_SEKCIJE.filter((sekcija) => sekcijaVidljiva(actor, sekcija));
}

/**
 * Whether a role gets the client panel at all. Osoblje (staff, PIN) works only
 * in the waiter panel (master §10.1, §10.6): it gets a clear message and a link
 * there, never an empty panel.
 */
export type PanelPristup =
  | { vrsta: "panel"; sekcije: PanelNavSekcija[] }
  | { vrsta: "konobarski-panel" };

export function panelPristup(actor: MenuActor): PanelPristup {
  const sekcije = vidljiveSekcije(actor);
  return sekcije.length === 0 ? { vrsta: "konobarski-panel" } : { vrsta: "panel", sekcije };
}

/** The section shown for the URL segment below the panel root; null for an unknown segment. */
export function sekcijaIzSegmenta(segment: string | null): PanelNavSekcija | null {
  if (segment === null) return "pocetna";
  return PANEL_NAV_SEKCIJE.find((sekcija) => PANEL_SEKCIJA_SEGMENT[sekcija] === segment) ?? null;
}

function slugDeo(slug: string): string {
  return encodeURIComponent(slug);
}

/** Root of the ScanMe Menu client panel of one venue. */
export function panelKoren(slug: string): string {
  return `/${slugDeo(slug)}/client-panel/meni`;
}

export function panelSekcijaHref(slug: string, sekcija: PanelNavSekcija): string {
  const segment = PANEL_SEKCIJA_SEGMENT[sekcija];
  return segment === null ? panelKoren(slug) : `${panelKoren(slug)}/${segment}`;
}

/** Every visible section with its link, in order. */
export function panelNavStavke(
  actor: MenuActor,
  href: (sekcija: PanelNavSekcija) => string,
): { sekcija: PanelNavSekcija; href: string }[] {
  return vidljiveSekcije(actor).map((sekcija) => ({ sekcija, href: href(sekcija) }));
}

/** The existing client panel with every other service of the venue (and the login). */
export function klijentskiPanelHref(slug: string): string {
  return `/${slugDeo(slug)}/client-panel`;
}

/**
 * The editor that "Editor" opens until the new editor exists (K10): the
 * existing editor of the venue's menu.
 */
export function postojeciEditorHref(slug: string): string {
  return `/${slugDeo(slug)}/meni/editor`;
}

/**
 * Entry of the waiter panel for a venue. The panel itself lives behind a
 * secret code (`/[slug]/konobar/[kod]`, K22) that the client panel never
 * reveals; this entry tells staff to open the link or QR code they were given.
 */
export function konobarskiPanelUlazHref(slug: string): string {
  return `/${slugDeo(slug)}/konobar`;
}

/**
 * Side navigation on a wide screen is collapsed into an icon rail while the
 * Editor is open, so the editor gets the width (docs/menu/MENU-UX.md §8).
 */
export function navSkupljenaPodrazumevano(sekcija: PanelNavSekcija | null): boolean {
  return sekcija === "editor";
}
