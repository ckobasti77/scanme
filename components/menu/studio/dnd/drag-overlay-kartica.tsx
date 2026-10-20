"use client";

// ScanMe Menu V1 — the "lifted" card under the pointer while dragging (K11,
// K09 §4.3): a light copy of the row or section with a deeper shadow and a
// slight lift (scale 1.02; none with reduced motion). The real card stays in
// the list as a dashed outline where it will land.

import { GripVertical } from "lucide-react";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { StudioRed, StudioSekcija } from "@/lib/menu/studio/model";
import { cn } from "@/lib/utils";
import { tekstCene } from "../red-artikla/red-artikla";

const t = menuStudioSr;

const podignuto =
  "pointer-events-none flex min-h-14 cursor-grabbing items-center gap-3 opacity-95 rounded-[var(--mp-radius-kontrola)] border-2 [--border:var(--mp-fokus)] bg-[var(--mp-povrsina)] px-3 py-2 text-[var(--mp-tekst)] shadow-[var(--mp-senka-md)]";

export function OverlayReda({ red, smanjenPokret }: { red: StudioRed; smanjenPokret: boolean }) {
  return (
    <div aria-hidden="true" data-podignuto="red" className={cn(podignuto, !smanjenPokret && "scale-[1.02]")}>
      <GripVertical strokeWidth={1.75} className="size-5 shrink-0 text-[var(--mp-tekst-sporedni)]" />
      <span className="min-w-0 flex-1 truncate font-medium">{red.artikal.naziv}</span>
      <span className="shrink-0 text-[0.9375rem] font-semibold tabular-nums">
        {red.artikal.varijante && red.artikal.cena === null ? t.red.varijante : tekstCene(red.artikal.cena)}
      </span>
    </div>
  );
}

export function OverlaySekcije({ sekcija, smanjenPokret }: { sekcija: StudioSekcija; smanjenPokret: boolean }) {
  return (
    <div aria-hidden="true" data-podignuto="sekcija" className={cn(podignuto, "min-h-[var(--mp-meta)]", !smanjenPokret && "scale-[1.02]")}>
      <GripVertical strokeWidth={1.75} className="size-5 shrink-0 text-[var(--mp-tekst-sporedni)]" />
      <span className="min-w-0 flex-1 truncate text-[1.0625rem] font-semibold">{sekcija.naziv}</span>
      <span className="shrink-0 text-sm text-[var(--mp-tekst-sporedni)]">
        {fmt(t.ponuda.artikli[srPluralCategory(sekcija.redovi.length)], { n: sekcija.redovi.length })}
      </span>
    </div>
  );
}
