// Raspored studija za kadriranje (A03 §5.1–§5.2, odluke E1 i E20). Čisto. Brojevi su isti kao u
// auto3d.module.css (--a3-inset, --a3-rail-w, --a3-panel-w, --a3-poster-left), da poster i canvas
// imaju isti kadar.
//
// - Od 1024 px: traka grupa levo, panel (lista ili kartica) desno. Kutija postera počinje iza
//   trake, a slobodna zona za kadar dela i grupe je između trake i panela, ispod prekidača režima
//   i iznad donje trake. Zona je ista i kad panel nije otvoren, da otvaranje kartice ne pomera
//   kameru.
// - Ispod 1024 px: studio je ceo poster, a panel je ispod studija. Na telefonu panel prelazi preko
//   dna studija (24 px, kao donji sheet), pa je donja traka toliko viša.
// - Kiosk (A10, 1920 × 1080): studio je ceo ekran i ceo poster. Levo je mesto za natpis i traku
//   grupa, desno za legendu, karticu dela i QR, a dole za titl ture; kadar dela i grupe je između
//   (brojevi su isti kao `.kiosk` u auto3d.module.css). Uži kiosk (telefon, tablet) ima uske margine.

import type { Rect } from "./framing";
import type { Viewport } from "./manifest";

export type StudioLayout = {
  width: number;
  height: number;
  posterBox: Rect;
  freeArea: Rect;
  viewport: Viewport;
};

export const RAILS_MIN_WIDTH = 1024;
export const RAILS_WIDE_WIDTH = 1280;

export const STUDIO_CHROME = {
  rails: { inset: 16, top: 76, bottom: 88 },
  stack: { inset: 12, top: 68, bottom: 76, sheetOverlap: 24 },
  kiosk: { left: 320, right: 376, top: 120, bottom: 240 },
  kioskNarrow: { inset: 16, top: 88, bottom: 160 },
} as const;

/** Širine trake grupa i panela za širinu prozora, ili null kad je raspored kao na telefonu. */
export function railsFor(windowWidth: number): { rail: number; panel: number } | null {
  if (windowWidth >= RAILS_WIDE_WIDTH) return { rail: 248, panel: 384 };
  if (windowWidth >= RAILS_MIN_WIDTH) return { rail: 216, panel: 344 };
  return null;
}

const MIN_AREA = 80;

function area(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w: Math.max(MIN_AREA, w), h: Math.max(MIN_AREA, h) };
}

export function studioLayout(width: number, height: number, viewport: Viewport, windowWidth: number): StudioLayout {
  const full: Rect = { x: 0, y: 0, w: width, h: height };
  if (viewport === "kiosk") {
    if (width < RAILS_MIN_WIDTH) {
      const n = STUDIO_CHROME.kioskNarrow;
      return { width, height, viewport, posterBox: full, freeArea: area(n.inset, n.top, width - 2 * n.inset, height - n.top - n.bottom) };
    }
    const c = STUDIO_CHROME.kiosk;
    return { width, height, viewport, posterBox: full, freeArea: area(c.left, c.top, width - c.left - c.right, height - c.top - c.bottom) };
  }
  const rails = viewport === "desktop" ? railsFor(windowWidth) : null;
  if (!rails) {
    const c = STUDIO_CHROME.stack;
    const bottom = c.bottom + (viewport === "telefon" ? c.sheetOverlap : 0);
    return { width, height, viewport, posterBox: full, freeArea: area(c.inset, c.top, width - 2 * c.inset, height - c.top - bottom) };
  }
  const c = STUDIO_CHROME.rails;
  const posterLeft = c.inset + rails.rail;
  const left = posterLeft + c.inset;
  const right = c.inset + rails.panel + c.inset;
  return {
    width,
    height,
    viewport,
    posterBox: { x: posterLeft, y: 0, w: Math.max(MIN_AREA, width - posterLeft), h: height },
    freeArea: area(left, c.top, width - left - right, height - c.top - c.bottom),
  };
}
