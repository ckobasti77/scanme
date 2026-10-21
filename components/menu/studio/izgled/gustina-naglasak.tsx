"use client";

// ScanMe Menu V1 — Izgled: density and emphasis (K17; master §15.2 "razumno
// podešavanje gustine i naglašavanja"). Three steps of space and two of
// emphasis — never a free value per gap (master §15.2, §20).

import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { MenuDensity, MenuEmphasis } from "@/lib/menu/presentation";
import { IzborSegment } from "../artikal/polja";

const t = menuStudioSr.izgled;

export function GustinaIzbor({
  gustina,
  onIzbor,
  onemoguceno = false,
}: {
  gustina: MenuDensity;
  onIzbor: (gustina: MenuDensity) => void;
  onemoguceno?: boolean;
}) {
  return (
    <div className="max-w-[26rem]">
    <IzborSegment<MenuDensity>
      oznaka={t.gustina.naslov}
      skrivenaOznaka
      vrednosti={(["airy", "standard", "dense"] as const).map((vrednost) => ({ vrednost, tekst: t.gustina.vrednosti[vrednost] }))}
      izabrano={gustina}
      onIzbor={onIzbor}
      onemoguceno={onemoguceno}
    />
    </div>
  );
}

export function NaglasakIzbor({
  naglasak,
  onIzbor,
  onemoguceno = false,
}: {
  naglasak: MenuEmphasis;
  onIzbor: (naglasak: MenuEmphasis) => void;
  onemoguceno?: boolean;
}) {
  return (
    <div className="max-w-[26rem]">
    <IzborSegment<MenuEmphasis>
      oznaka={t.naglasak.naslov}
      skrivenaOznaka
      vrednosti={(["calm", "bold"] as const).map((vrednost) => ({ vrednost, tekst: t.naglasak.vrednosti[vrednost] }))}
      izabrano={naglasak}
      onIzbor={onIzbor}
      onemoguceno={onemoguceno}
    />
    </div>
  );
}
