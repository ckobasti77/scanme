"use client";

// ScanMe Menu V1 (K30) — "Kretanje po danima": one metric by day (the trend of
// 7 and 30 days, master §14.1; 90 days and a custom period on Premium). The
// owner picks what to follow; the chart is one series with its table.

import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import type { IzvestajAnalitike } from "@/lib/menu/analitika/izvestaj";
import { METRIKE_TRENDA, type MetrikaTrenda } from "@/lib/menu/analitika/prikaz";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { Segment } from "./segment";
import { StubniGrafikon } from "./stubni-grafikon";
import { objasnjenjeId } from "./zajednicko";

const t = menuAnalitikaSr;

/** Where each trend metric is explained on the screen (the headline tiles, or the "poslato" sentence of its block). */
const OBJASNJENJE: Record<MetrikaTrenda, string> = {
  otvaranja: "otvaranja",
  detalji: "detalji",
  skenovi: "skenovi",
  zahtevi: "zahtevi-trend",
  rezervacije: "rezervacije-trend",
};

export function TrendBlok({
  izvestaj,
  danas,
  metrika,
  onMetrika,
  className,
}: {
  izvestaj: IzvestajAnalitike;
  danas: string;
  metrika: MetrikaTrenda;
  onMetrika: (metrika: MetrikaTrenda) => void;
  className?: string;
}) {
  const niz = izvestaj.metrike[metrika];
  const sopstveno = metrika === "zahtevi" || metrika === "rezervacije";
  return (
    <Kartica data-blok="trend" className={className}>
      <OkvirSekcije id="an-trend" naslov={t.trend.naslov} opis={t.trend.opis} nivo={3}>
        <Segment<MetrikaTrenda>
          oznaka={t.trend.izbor}
          skrivenaOznaka
          opcije={METRIKE_TRENDA.map((m) => ({ vrednost: m, tekst: t.metrike[m].naziv }))}
          izabrano={metrika}
          onIzbor={onMetrika}
        />
        {sopstveno ? (
          <p id={objasnjenjeId(OBJASNJENJE[metrika])} data-objasnjenje={OBJASNJENJE[metrika]} className="text-sm leading-relaxed text-[var(--mp-tekst-sporedni)]">
            {t.metrike[metrika].objasnjenje}
          </p>
        ) : null}
        <StubniGrafikon
          kljuc={`trend-${metrika}`}
          naziv={t.metrike[metrika].naziv}
          dani={izvestaj.dani}
          vrednosti={niz.poDanu}
          objasnjenje={objasnjenjeId(OBJASNJENJE[metrika])}
          danasJePoslednji={izvestaj.period.do === danas}
        />
      </OkvirSekcije>
    </Kartica>
  );
}
