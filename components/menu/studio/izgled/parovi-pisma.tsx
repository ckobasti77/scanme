"use client";

// ScanMe Menu V1 — Izgled: the font pair (K17; master §15.2 "podržane
// kombinacije fontova"). Each card sets a dish name in the pair's heading
// face and a line in its text face — with č, ć, š, ž and đ, so the venue sees
// that Serbian reads well. Only the self-hosted Fontsource faces of the app.

import { fmt } from "@/lib/i18n/format";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import { FONT_STACKS, type DesignFontKey } from "@/lib/design-engine/typography";
import { MENU_PAROVI_FONTOVA, type ParFontova } from "@/lib/menu/identity/font-pairs";
import { IzborKartica, type KarticaIzbora } from "./kontrole";

const t = menuStudioSr.izgled.pismo;

/** The family name of a face as Fontsource names it ("Lora Variable" → "Lora"). */
export function imeLica(kljuc: DesignFontKey): string {
  const prvo = /"([^"]+)"/.exec(FONT_STACKS[kljuc])?.[1] ?? kljuc;
  return prvo.replace(/ Variable$/, "");
}

export function imePara(id: string): string {
  return (t.parovi as Record<string, string>)[id] ?? id;
}

/** Faces that read smaller at the same size (Cormorant) are set a step larger, so the pairs compare fairly. */
const VELICINA_LICA: Partial<Record<DesignFontKey, number>> = { "cormorant-garamond": 1.2 };

function UzorakPisma({ par }: { par: ParFontova }) {
  return (
    <span data-uzorak-pisma={par.id} className="grid gap-0.5 rounded-[calc(var(--mp-radius-kontrola)-2px)] bg-[var(--mp-povrsina-utisana)] px-2.5 py-2 text-[var(--mp-tekst)]">
      <span
        className="block truncate leading-tight"
        style={{ fontFamily: FONT_STACKS[par.naslov], fontWeight: par.tezinaNaslova, fontSize: `${1.0625 * (VELICINA_LICA[par.naslov] ?? 1)}rem` }}
      >
        {t.uzorakNaslov}
      </span>
      <span
        className="block truncate leading-snug text-[var(--mp-tekst-sporedni)]"
        style={{ fontFamily: FONT_STACKS[par.tekst], fontSize: `${0.8125 * (VELICINA_LICA[par.tekst] ?? 1)}rem` }}
      >
        {t.uzorakTekst}
      </span>
    </span>
  );
}

export function ParoviPisma({
  fontPairId,
  premium,
  onIzbor,
  onemoguceno = false,
}: {
  fontPairId: string;
  premium: boolean;
  onIzbor: (fontPairId: string) => void;
  onemoguceno?: boolean;
}) {
  const izabran = fontPairId === "default" ? "osnovni" : fontPairId;
  const kartice: KarticaIzbora<string>[] = MENU_PAROVI_FONTOVA.map((par) => ({
    vrednost: par.id,
    naziv: imePara(par.id),
    opis: par.naslov === par.tekst ? imeLica(par.naslov) : fmt(t.lica, { naslov: imeLica(par.naslov), tekst: imeLica(par.tekst) }),
    sadrzaj: <UzorakPisma par={par} />,
    zakljucano: par.premium && !premium,
    premium: par.premium && premium,
  }));
  return (
    <IzborKartica
      oznaka={t.naslov}
      skrivenaOznaka
      vrednosti={kartice}
      izabrano={izabran}
      onIzbor={onIzbor}
      onemoguceno={onemoguceno}
      razlog={t.zakljucano}
      kolone="grid-cols-2"
      velicina="mala"
    />
  );
}
