"use client";

// ScanMe Menu V1 — a conflict of the same value (K18; master §6.1: "konflikt
// iste vrednosti ne sme neprimetno pregaziti noviju izmenu"). One pattern for
// every field on the save queue (the inline price of a row, the fields of the
// article detail): the value saved meanwhile, this person's value, who else has
// the article open (from presence), and exactly two ways out — `Zadrži moju`
// (sent again over the saved value) and `Uzmi sačuvanu`. Nothing is written
// until the person chooses. When both wrote the same value there is nothing to
// choose: one `U redu`.
//
// Markup stays K10's (an alert box: the sentence, then the buttons) so the
// field's aria-describedby keeps pointing at it.

import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { OpisKonflikta } from "@/lib/menu/studio/conflict";
import { Dugme } from "../../zajednicko/dugme";

const t = menuStudioSr.objavljivanje.konflikt;

export const KONFLIKT_KLASA =
  "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[var(--mp-radius-kontrola)] border [--border:var(--mp-opasnost-ivica)] bg-[var(--mp-opasnost-meko)] px-3 py-1.5 text-sm font-medium text-[var(--mp-tekst)]";

export function KonfliktPolja({
  id,
  opis,
  tekst,
  zadrziMoju,
  uzmiSacuvanu,
  onZadrziMoju,
  onUzmiSacuvanu,
  prikaziMoju = false,
  className,
}: {
  id?: string;
  opis: OpisKonflikta;
  /** The sentence with the saved value ("U međuvremenu je sačuvana druga vrednost: 980 RSD."). */
  tekst: string;
  /** The button texts of this field (the price row names the person's own price on it). */
  zadrziMoju: string;
  uzmiSacuvanu: string;
  onZadrziMoju: () => void;
  onUzmiSacuvanu: () => void;
  /** Also say "Vaša vrednost: …" (fields whose buttons do not carry the values). */
  prikaziMoju?: boolean;
  className?: string;
}) {
  if (opis.ista) {
    return (
      <div id={id} role="alert" data-konflikt="ista" className={className ?? KONFLIKT_KLASA}>
        <p>{t.ista}</p>
        <Dugme vrsta="tiho" velicina="kompaktna" onClick={onUzmiSacuvanu}>
          {t.uRedu}
        </Dugme>
      </div>
    );
  }
  return (
    <div id={id} role="alert" data-konflikt="" className={className ?? KONFLIKT_KLASA}>
      <p>{tekst}</p>
      <p className="basis-full font-normal" data-konflikt-drugi={opis.drugi ? "" : undefined}>
        {prikaziMoju ? `${fmt(t.moja, { vrednost: opis.moja })} ` : null}
        {opis.drugi ? `${opis.drugi} ` : null}
        {t.nistaPrepisano}
      </p>
      <span className="flex flex-wrap gap-2">
        <Dugme vrsta="sekundarno" velicina="kompaktna" onClick={onZadrziMoju}>
          {zadrziMoju}
        </Dugme>
        <Dugme vrsta="sekundarno" velicina="kompaktna" onClick={onUzmiSacuvanu}>
          {uzmiSacuvanu}
        </Dugme>
      </span>
    </div>
  );
}
