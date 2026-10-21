"use client";

// ScanMe Menu V1 — Izgled: the ScanMe signature at the foot of the public
// menu (K17; master §2.2: "smanjen brending" is Premium). Both options say
// what the guest sees; on Standard the reduced signature stays visible,
// disabled, with one line of reason.

import { Lock } from "lucide-react";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { MenuBranding } from "@/lib/menu/presentation";
import { IzborSegment } from "../artikal/polja";

const t = menuStudioSr.izgled.brending;

export function Brending({
  brending,
  premium,
  onIzbor,
  onemoguceno = false,
}: {
  brending: MenuBranding;
  /** The account may reduce the signature (reducedBranding). */
  premium: boolean;
  onIzbor: (brending: MenuBranding) => void;
  onemoguceno?: boolean;
}) {
  return (
    <div className="grid max-w-[28rem] gap-2">
      <IzborSegment<MenuBranding>
        oznaka={t.naslov}
        skrivenaOznaka
        vrednosti={[
          { vrednost: "standard", tekst: t.vrednosti.standard },
          { vrednost: "reduced", tekst: t.vrednosti.reduced, onemoguceno: !premium },
        ]}
        izabrano={brending}
        onIzbor={onIzbor}
        onemoguceno={onemoguceno}
      />
      <ul className="grid gap-0.5 text-[0.8125rem] leading-snug text-[var(--mp-tekst-sporedni)]">
        <li>{t.opisi.standard}</li>
        <li>{t.opisi.reduced}</li>
      </ul>
      {premium ? null : (
        <p data-brending-zakljucano="" className="flex items-start gap-1.5 text-[0.8125rem] leading-snug text-[var(--mp-tekst)]">
          <Lock aria-hidden="true" strokeWidth={2} className="mt-0.5 size-3.5 shrink-0 text-[var(--mp-tekst-sporedni)]" />
          {t.zakljucano}
        </p>
      )}
    </div>
  );
}
