"use client";

// ScanMe Menu V1 (K28) — the invitation page in the izlog
// (`/dev/menu-panel-preview?poziv=vazeca|istekla|nevazeca|prijava|drugi-nalog|prihvaceno`):
// the real screen with "Demo restoran" inviting an Urednik; accepting succeeds locally.

import { useState } from "react";
import { IZLOG_SADA } from "@/components/menu/fixtures";
import type { PanelPoziv } from "@/lib/menu/izlog-params";
import { Prihvatanje } from "../panel/poziv/prihvatanje";

const DAN = 24 * 60 * 60 * 1000;

export function PozivIzlog({ stanje, pocetnaHref }: { stanje: PanelPoziv; pocetnaHref: string }) {
  const [prihvaceno, setPrihvaceno] = useState(false);
  return (
    <Prihvatanje
      stanje={prihvaceno ? "prihvaceno" : stanje}
      lokal="Demo restoran"
      uloga="editor"
      istice={IZLOG_SADA + 5 * DAN}
      prijavaHref={pocetnaHref}
      panelHref={pocetnaHref}
      onPrihvati={() => setPrihvaceno(true)}
    />
  );
}
