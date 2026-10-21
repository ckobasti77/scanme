// ScanMe Menu V1 (K13, plan K12 §5.1) — the automatic contrast check of a
// public-menu palette. K13 proves the curated palettes with it; K17 uses it to
// refuse a brand palette that would not be readable (master §15.2: a curated,
// readable result for every venue, MENU-UX §10 contrast 4.5:1).
//
// The accent is checked as TEXT after ensureContrast, exactly as
// compileMenuTokens derives `--menu-accent-text`; the raw border is not
// checked, because inputs get the derived `--menu-input-border` (3:1).

import type { MenuColors } from "../../design-engine/menu-tokens";
import { contrastRatio, ensureContrast } from "../../scanme-color-science";

export const MENU_KONTRAST_TEKST = 4.5;
export const MENU_KONTRAST_FOKUS = 3;

export type KontrastGreska = { par: string; odnos: number; prag: number };

export type KontrastIshod = { ok: boolean; greske: KontrastGreska[] };

export function proveriKontrast(boje: MenuColors): KontrastIshod {
  const greske: KontrastGreska[] = [];
  const proveri = (par: string, prednja: string, pozadina: string, prag: number) => {
    const odnos = contrastRatio(prednja, pozadina);
    if (!(odnos >= prag)) greske.push({ par, odnos: Math.round(odnos * 100) / 100, prag });
  };
  for (const [ime, pozadina] of [
    ["page", boje.page],
    ["surface", boje.surface],
  ] as const) {
    proveri(`title/${ime}`, boje.title, pozadina, MENU_KONTRAST_TEKST);
    proveri(`body/${ime}`, boje.body, pozadina, MENU_KONTRAST_TEKST);
    proveri(`focus/${ime}`, boje.focus, pozadina, MENU_KONTRAST_FOKUS);
  }
  const accentText = ensureContrast(boje.accent, [boje.page, boje.surface], MENU_KONTRAST_TEKST);
  proveri("accent-text/page", accentText, boje.page, MENU_KONTRAST_TEKST);
  return { ok: greske.length === 0, greske };
}
