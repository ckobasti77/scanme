"use client";

// ScanMe Menu V1 — Izgled: the layout (K17; master §7.1). Three cards, each
// with a small LIVE picture of the layout: the venue's palette and faces and
// the first names and prices of the open page. Under them the Premium
// variant of the chosen layout (locked on Standard, with the reason).

import type { CSSProperties } from "react";
import { menuStudioSr } from "@/lib/i18n/sr/menu-studio";
import type { JavniIzgled } from "@/lib/menu/identity/public-tokens";
import { varijanteRasporeda } from "@/lib/menu/identity/varijante";
import type { MenuLayout } from "@/lib/menu/presentation";
import { cn } from "@/lib/utils";
import { IzborKartica, type KarticaIzbora } from "./kontrole";

const t = menuStudioSr.izgled.raspored;

const LAYOUTI: readonly MenuLayout[] = ["flow", "categories", "compact"];

export type MiniSadrzaj = {
  sekcije: string[];
  artikli: { naziv: string; cena: string }[];
};

/** What the miniatures show: the open page's first sections and articles, or stand-ins. */
export function miniSadrzaj(sekcije: readonly { naziv: string; redovi: readonly { naziv: string; cena: number | null }[] }[]): MiniSadrzaj {
  const cena = (rsd: number | null) => (rsd === null ? "" : new Intl.NumberFormat("sr-Latn-RS").format(rsd));
  const imena = sekcije.map((sekcija) => sekcija.naziv).filter(Boolean).slice(0, 4);
  const artikli = sekcije.flatMap((sekcija) => sekcija.redovi).slice(0, 3).map((red) => ({ naziv: red.naziv, cena: cena(red.cena) }));
  return {
    sekcije: imena.length >= 2 ? imena : [t.mini.sekcija, t.mini.druga, t.mini.treca, t.mini.cetvrta],
    artikli: artikli.length >= 2 ? artikli : t.mini.artikli.map((naziv, i) => ({ naziv, cena: ["690", "740", "820"][i] ?? "" })),
  };
}

const tekst = "block overflow-hidden text-ellipsis whitespace-nowrap";

/** A tiny picture of one layout in the venue's colours (decorative; the radio carries the name). */
export function MiniRaspored({ layout, izgled, sadrzaj }: { layout: MenuLayout; izgled: JavniIzgled; sadrzaj: MiniSadrzaj }) {
  const naslov: CSSProperties = { fontFamily: "var(--menu-heading-family)", fontWeight: "var(--menu-heading-weight)" as CSSProperties["fontWeight"] };
  return (
    <span
      data-mini-raspored={layout}
      style={{ ...(izgled.tokeni as CSSProperties), fontFamily: "var(--menu-font-family)" }}
      className="block aspect-[4/3] overflow-hidden rounded-[calc(var(--mp-radius-kontrola)-2px)] border bg-[var(--menu-page)] p-2 text-[9px] leading-[1.35] text-[var(--menu-body)] [--border:var(--menu-border)]"
    >
      {layout === "flow" ? (
        <span className="grid gap-1">
          <span className="flex gap-1">
            {sadrzaj.sekcije.slice(0, 3).map((ime, i) => (
              <span
                key={ime + i}
                className={cn(
                  "max-w-[45%] truncate rounded-full px-1.5 py-px",
                  i === 0 ? "bg-[var(--menu-accent)] text-[var(--menu-on-accent)]" : "text-[var(--menu-body-muted)]",
                )}
              >
                {ime}
              </span>
            ))}
          </span>
          <span style={naslov} className={cn(tekst, "pt-0.5 text-[11px] text-[var(--menu-title)]")}>
            {sadrzaj.sekcije[0]}
          </span>
          {sadrzaj.artikli.map((artikal, i) => (
            <span key={artikal.naziv + i} className="flex items-baseline gap-1 border-b pb-0.5 [--border:var(--menu-border)]">
              <span className={cn(tekst, "flex-1 text-[var(--menu-title)]")}>{artikal.naziv}</span>
              <span className="shrink-0 tabular-nums text-[var(--menu-title)]">{artikal.cena}</span>
            </span>
          ))}
        </span>
      ) : layout === "categories" ? (
        <span className="grid grid-cols-2 gap-1">
          {sadrzaj.sekcije.slice(0, 4).map((ime, i) => (
            <span key={ime + i} className="grid gap-0.5 rounded-[5px] border bg-[var(--menu-surface)] p-[3px] [--border:var(--menu-border)]">
              <span className="block h-3 rounded-[3px] bg-[color-mix(in_oklab,var(--menu-accent)_22%,var(--menu-surface))]" />
              <span style={naslov} className={cn(tekst, "text-[var(--menu-title)]")}>
                {ime}
              </span>
            </span>
          ))}
        </span>
      ) : (
        <span className="grid gap-1 text-center">
          <span style={naslov} className={cn(tekst, "text-[11px] text-[var(--menu-title)]")}>
            {sadrzaj.sekcije[0]}
          </span>
          <span className="mx-auto block h-px w-4 bg-[var(--menu-accent)]" />
          {sadrzaj.artikli.map((artikal, i) => (
            <span key={artikal.naziv + i} className="flex items-baseline gap-0.5 text-left">
              <span className={cn(tekst, "max-w-[60%] text-[var(--menu-title)]")}>{artikal.naziv}</span>
              <span className="min-w-1 flex-1 border-b border-dotted [--border:var(--menu-body-muted)]" />
              <span className="shrink-0 tabular-nums text-[var(--menu-title)]">{artikal.cena}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export function RasporedIzbor({
  layout,
  varijanta,
  izgled,
  sadrzaj,
  premium,
  onLayout,
  onVarijanta,
  onemoguceno = false,
}: {
  layout: MenuLayout;
  varijanta: string | null;
  /** The appearance with the CURRENT palette and faces (the miniatures follow it). */
  izgled: JavniIzgled;
  sadrzaj: MiniSadrzaj;
  /** The account has Premium design variants. */
  premium: boolean;
  onLayout: (layout: MenuLayout) => void;
  onVarijanta: (varijanta: string | null) => void;
  onemoguceno?: boolean;
}) {
  const kartice: KarticaIzbora<MenuLayout>[] = LAYOUTI.map((vrednost) => ({
    vrednost,
    naziv: t.layouti[vrednost].naziv,
    opis: t.layouti[vrednost].opis,
    sadrzaj: <MiniRaspored layout={vrednost} izgled={izgled} sadrzaj={sadrzaj} />,
  }));
  const varijante = varijanteRasporeda(layout);
  const opcije: KarticaIzbora<string>[] = [
    { vrednost: "osnovna", naziv: t.varijante.osnovna, opis: t.varijante.osnovnaOpis },
    ...varijante.map((v) => {
      const opis = t.varijante.opisi[v.id as keyof typeof t.varijante.opisi];
      return { vrednost: v.id, naziv: opis.naziv, opis: opis.opis, zakljucano: !premium, premium };
    }),
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <IzborKartica
          oznaka={t.naslov}
          skrivenaOznaka
          vrednosti={kartice}
          izabrano={layout}
          onIzbor={onLayout}
          onemoguceno={onemoguceno}
          // A narrow column (a phone) lists the layouts as rows — picture beside name and description;
          // from 28 rem three cards side by side, the description of the chosen one below.
          kolone="grid-cols-1 @md:grid-cols-3"
          kartica="grid-cols-[7rem_minmax(0,1fr)] items-center @md:grid-cols-1 @md:items-start"
          opisUzano
          velicina="mala"
        />
        <p data-opis-rasporeda="" className="hidden text-sm leading-snug text-[var(--mp-tekst-sporedni)] @md:block">
          <span className="font-semibold text-[var(--mp-tekst)]">{t.layouti[layout].naziv}:</span> {t.layouti[layout].opis}
        </p>
      </div>
      {varijante.length > 0 ? (
        <IzborKartica
          oznaka={t.varijante.naslov}
          vrednosti={opcije}
          izabrano={varijanta ?? "osnovna"}
          onIzbor={(vrednost) => onVarijanta(vrednost === "osnovna" ? null : vrednost)}
          razlog={t.varijante.zakljucano}
          onemoguceno={onemoguceno}
          kolone="grid-cols-1 @md:grid-cols-2"
        />
      ) : null}
    </div>
  );
}
