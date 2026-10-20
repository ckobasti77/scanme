"use client";

// ScanMe Menu V1 — Izgled: the colours (K17; master §15.2). Every tile is a
// SPECIMEN: one line of a menu — a card, a dish and its price — drawn in the
// palette's real roles (page, card, title, accent), so the venue compares
// what guests will read, not swatches. Curated palettes only, never the
// ScanMe panel palette; Premium palettes stay visible and locked on Standard.
// The venue's own brand palette comes from the builder below
// (brend-paleta.tsx) and appears here once it has passed the contrast check.

import type { MenuColors } from "@/lib/design-engine/menu-tokens";
import { fmt } from "@/lib/i18n/format";
import { ensureContrast } from "@/lib/scanme-color-science";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { brendUloge, paletaIzBrenda } from "@/lib/menu/identity/brand-palette";
import { jeBrendPaleta, MENU_BREND_PALETA, MENU_BREND_PALETA_TAMNA, MENU_JAVNE_PALETE } from "@/lib/menu/identity/palettes";
import { IzborKartica, type KarticaIzbora } from "./kontrole";

const t = menuStudioSr.izgled.boje;

/**
 * One menu line in the palette's colours: the active section in the accent
 * (as the guest sees it, readable), the card, the dish and its price.
 */
export function UzorakPalete({ boje }: { boje: MenuColors }) {
  const akcenat = ensureContrast(boje.accent, [boje.page], 4.5);
  return (
    <span
      data-uzorak-palete=""
      className="grid gap-1.5 rounded-[calc(var(--mp-radius-kontrola)-2px)] p-2 shadow-[0_0_0_1px_var(--mp-ivica)]"
      style={{ background: boje.page }}
    >
      <span className="flex items-baseline gap-2 text-[0.6875rem] font-semibold leading-none">
        <span className="border-b-2 pb-0.5" style={{ color: akcenat, ["--border" as string]: boje.accent }}>
          {t.uzorak.sekcija}
        </span>
        <span className="truncate" style={{ color: boje.body }}>
          {t.uzorak.druga}
        </span>
      </span>
      <span className="block rounded-[6px] border px-2 py-1.5" style={{ background: boje.surface, ["--border" as string]: boje.border }}>
        <span className="flex items-baseline justify-between gap-1.5 text-[0.75rem] font-semibold leading-tight">
          <span className="truncate" style={{ color: boje.title }}>
            {t.uzorak.naziv}
          </span>
          <span className="shrink-0 tabular-nums" style={{ color: boje.title }}>
            {t.uzorak.cena}
          </span>
        </span>
      </span>
    </span>
  );
}

/** The display name of a curated palette. */
export function imePalete(id: string): string {
  return (t.palete as Record<string, string>)[id] ?? id;
}

/** The venue's brand palette as stored (null when it has none or it would not be readable). */
export function brendBojeIzVrednosti(paletteId: string, brandColors: readonly string[] | null): MenuColors | null {
  const uloge = brendUloge(brandColors);
  if (!uloge) return null;
  const ishod = paletaIzBrenda(uloge, paletteId === MENU_BREND_PALETA_TAMNA ? "tamna" : "svetla");
  return ishod.ok ? ishod.boje : null;
}

export function Palete({
  paletteId,
  brandColors,
  premium,
  onIzbor,
  onemoguceno = false,
}: {
  paletteId: string;
  brandColors: readonly string[] | null;
  /** The account has Premium design variants. */
  premium: boolean;
  onIzbor: (paletteId: string) => void;
  onemoguceno?: boolean;
}) {
  // Standard before Premium, light before dark: the locked ones sit together at the end.
  const katalog = [...MENU_JAVNE_PALETE].sort(
    (a, b) => Number(a.premium) - Number(b.premium) || Number(a.ton === "tamna") - Number(b.ton === "tamna"),
  );
  const izabrana = paletteId === "default" ? "topla" : paletteId;
  const brendId = jeBrendPaleta(paletteId) ? paletteId : MENU_BREND_PALETA;
  const brend = brendBojeIzVrednosti(brendId, brandColors);
  const kartice: KarticaIzbora<string>[] = katalog.map((paleta) => ({
    vrednost: paleta.id,
    naziv: imePalete(paleta.id),
    opis: fmt(t.opisPalete, { ton: t.ton[paleta.ton], zaKoga: t.zaKoga[paleta.zaKoga] }),
    sadrzaj: <UzorakPalete boje={paleta.boje} />,
    zakljucano: paleta.premium && !premium,
    premium: paleta.premium && premium,
  }));
  if (brend) {
    kartice.push({ vrednost: brendId, naziv: t.brend.kartica, opis: t.brend.karticaOpis, sadrzaj: <UzorakPalete boje={brend} /> });
  }
  return (
    <IzborKartica
      oznaka={t.naslov}
      skrivenaOznaka
      vrednosti={kartice}
      izabrano={izabrana}
      onIzbor={onIzbor}
      onemoguceno={onemoguceno}
      razlog={t.zakljucano}
      kolone="grid-cols-2 @md:grid-cols-3"
      velicina="mala"
    />
  );
}
