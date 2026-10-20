"use client";

// ScanMe Menu V1 — Izgled: the guest tools above the menu (K17; master §7.2,
// §5.3): search, filters and the informative EUR prices exist only when the
// venue turns them on (K14 renders them). Filters are the article tags and
// "Akcija"; a guest sees only those the page's articles have, and there is
// never a price-range filter (master §20).

import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { MENU_FILTER_CODES } from "@/lib/menu/filters";
import { Prekidac } from "../../zajednicko/prekidac";

const t = menuStudioSr.izgled.zaGoste;

export function ZaGoste({
  pretraga,
  filteri,
  valuta,
  onemoguceno,
  onPretraga,
  onFilteri,
  onValuta,
}: {
  pretraga: boolean;
  filteri: readonly string[];
  valuta: boolean;
  onemoguceno: boolean;
  onPretraga: (ukljuceno: boolean) => void;
  /** On = every supported filter code (the guest sees only those the page has). */
  onFilteri: (kodovi: string[]) => void;
  onValuta: (ukljuceno: boolean) => void;
}) {
  return (
    <div className="grid gap-1">
      <Prekidac naziv={t.pretraga} opis={t.pretragaOpis} checked={pretraga} disabled={onemoguceno} onChange={(event) => onPretraga(event.target.checked)} />
      <Prekidac
        naziv={t.filteri}
        opis={t.filteriOpis}
        checked={filteri.length > 0}
        disabled={onemoguceno}
        onChange={(event) => onFilteri(event.target.checked ? [...MENU_FILTER_CODES] : [])}
      />
      <Prekidac naziv={t.valuta} opis={t.valutaOpis} checked={valuta} disabled={onemoguceno} onChange={(event) => onValuta(event.target.checked)} />
    </div>
  );
}
