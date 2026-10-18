// ScanMe Menu V1 (K13, plan K12 §5.2) — the curated palettes of the public
// menu. A palette is the venue's identity on the guest's phone: never the
// ScanMe black-and-green of the panel and the admin (master §15.2, mockup
// README 00 and 04), so there is no "scanme" palette and no green accent.
// Every palette passes lib/menu/identity/contrast.ts on its page and surface
// (the test proves it); the WCAG ratios were computed in K12 with culori.
//
// `topla` is the "default" palette: the exact colours of DEFAULT_MENU_DESIGN,
// so a venue that never chose anything looks as the legacy menu did. K17 lets
// the venue pick one in Izgled; the published `paletteId` resolves here.

import type { MenuColors } from "../../design-engine/menu-tokens";

export type JavnaPaletaTon = "svetla" | "tamna";

export type JavnaPaleta = {
  id: string;
  ton: JavnaPaletaTon;
  boje: MenuColors;
  /** Who the palette was made for (the K17 picker groups by it). */
  zaKoga: "kafic" | "restoran" | "prestizni" | "opste";
};

const svetla = (
  id: string,
  zaKoga: JavnaPaleta["zaKoga"],
  page: string,
  surface: string,
  title: string,
  body: string,
  accent: string,
  border: string,
): JavnaPaleta => ({
  id,
  ton: "svetla",
  zaKoga,
  boje: { page, surface, title, body, accent, border, focus: accent, icon: accent },
});

export const MENU_JAVNE_PALETE: readonly JavnaPaleta[] = [
  svetla("topla", "opste", "#F7F8F3", "#FFFFFF", "#161916", "#3A3F3A", "#7A5C43", "#DADED2"),
  // Roasted coffee, not the cream-and-terracotta stock look (K13 design review).
  svetla("espresso", "kafic", "#F7F3EE", "#FFFFFF", "#2B1E16", "#4D3E34", "#6A3B22", "#E4DAD0"),
  svetla("bordo", "restoran", "#F7F2F0", "#FFFFFF", "#22171A", "#4A3A3E", "#8C2633", "#E8DADA"),
  svetla("more", "restoran", "#F2F6F7", "#FFFFFF", "#102027", "#33454D", "#1F5F7A", "#D5E1E5"),
  svetla("kamen", "prestizni", "#F4F2EE", "#FBFAF8", "#141414", "#3A3835", "#6E5A3C", "#DFDBD3"),
  {
    id: "ponoc",
    ton: "tamna",
    zaKoga: "prestizni",
    boje: {
      page: "#121417",
      surface: "#1A1D21",
      title: "#F3EEE6",
      body: "#D2CBC0",
      accent: "#C8A46A",
      border: "#2C3036",
      focus: "#E2C48E",
      icon: "#C8A46A",
    },
  },
  {
    id: "ugalj",
    ton: "tamna",
    zaKoga: "kafic",
    boje: {
      page: "#161413",
      surface: "#201D1B",
      title: "#F6F1EA",
      body: "#D8CFC4",
      accent: "#E08A4F",
      border: "#34302C",
      focus: "#F0A774",
      icon: "#E08A4F",
    },
  },
];

export const MENU_PODRAZUMEVANA_PALETA = "topla";

const PO_ID = new Map(MENU_JAVNE_PALETE.map((paleta) => [paleta.id, paleta]));

/** The palette of a published `paletteId`; "default" and unknown ids give `topla`. Never throws. */
export function paletaPoId(id: string | null | undefined): JavnaPaleta {
  return PO_ID.get(id ?? "") ?? (PO_ID.get(MENU_PODRAZUMEVANA_PALETA) as JavnaPaleta);
}

export function jePoznataPaleta(id: string): boolean {
  return PO_ID.has(id);
}
