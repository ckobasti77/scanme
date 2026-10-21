"use client";

// ScanMe Menu V1 (K30) — the Analitika section of the client panel (master
// §13, §14; docs/menu/ANALITIKA-DEFINICIJE.md). One job: help a decision with
// numbers that explain themselves. Order: header with the CSV button, the
// period, then "Kako gosti koriste meni" (opens, article opens, scans,
// sessions; the trend by day), requests and reservations side by side, the
// most opened articles and the scans per QR card side by side, the Premium
// blocks (guest flow, breakdown) or — on Standard — what Premium adds, and
// "Kako brojimo". Too little data (fewer than 20 sessions, or menu opens when
// sessions are not measured) shows numbers and a plain message, never a
// percentage; an empty period says so. Presentational: the route
// (analitika-ruta.tsx) and the izlog pass the report and the choices.

import { ChartColumn, Info } from "lucide-react";
import { fmt } from "@/lib/i18n/format";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import type { IzvestajAnalitike, RaspodelaAnalitike } from "@/lib/menu/analitika/izvestaj";
import {
  opsegTekst,
  periodIzbora,
  stanjePodataka,
  type AnalitikaPlan,
  type IzborPerioda,
  type MetrikaTrenda,
} from "@/lib/menu/analitika/prikaz";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { GreskaStanje, PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";
import { ZaglavljeSaStatusom } from "../../zajednicko/zaglavlje-sa-statusom";
import {
  KakoBrojimo,
  KarticeBlok,
  NajotvaranijiBlok,
  Pokazatelji,
  PoredjenjeObjasnjenje,
  PremiumKartica,
  RezervacijeBlok,
  TokBlok,
  ZahteviBlok,
} from "./blokovi";
import { CsvDugme } from "./csv-dugme";
import { PeriodIzbor } from "./period-izbor";
import { RaspodelaBlok, type IzborRaspodele } from "./raspodela";
import { TrendBlok } from "./trend";

const t = menuAnalitikaSr;

export type AnalitikaEkranProps = {
  plan: AnalitikaPlan;
  /** Today in Belgrade (`YYYY-MM-DD`), from the device clock. */
  danas: string;
  izbor: IzborPerioda;
  onIzbor: (izbor: IzborPerioda) => void;
  /** undefined: loading; null: failed or no access. */
  izvestaj: IzvestajAnalitike | null | undefined;
  onPonovo?: () => void;
  trend: MetrikaTrenda;
  onTrend: (metrika: MetrikaTrenda) => void;
  raspodela: IzborRaspodele;
  onRaspodela: (izbor: IzborRaspodele) => void;
  /** The breakdown for `raspodela` (Premium, only with a dimension). */
  raspodelaPodaci: RaspodelaAnalitike | null | undefined;
  /** For the CSV file name. */
  slug: string;
  /** Podešavanja › Brend i nalog (package and Premium); null when the role cannot open it. */
  paketHref: string | null;
};

function MaloPodataka() {
  return (
    <div
      data-stanje="malo-podataka"
      className="flex items-start gap-3 rounded-[var(--mp-radius-kartica)] border bg-[var(--mp-povrsina)] p-4 [--border:var(--mp-ivica)]"
    >
      <Info aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-[var(--mp-info)]" />
      <div className="grid gap-1">
        <p className="font-semibold text-[var(--mp-tekst)]">{t.stanja.maloNaslov}</p>
        <p className="max-w-[75ch] text-sm leading-relaxed text-[var(--mp-tekst)]">{t.stanja.maloOpis}</p>
      </div>
    </div>
  );
}

function Telo(props: AnalitikaEkranProps & { izvestaj: IzvestajAnalitike }) {
  const { izvestaj, plan } = props;
  const stanje = stanjePodataka(izvestaj);
  const premium = plan === "premium";
  const premiumBlokovi = premium ? (
    <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
      <TokBlok izvestaj={izvestaj} stanje={stanje} className="xl:self-start" />
      <RaspodelaBlok
        izbor={props.raspodela}
        onIzbor={props.onRaspodela}
        podaci={props.raspodelaPodaci}
        stanje={stanje}
        ukupnoMetrike={{
          otvaranja: izvestaj.metrike.otvaranja.ukupno,
          detalji: izvestaj.metrike.detalji.ukupno,
          skenovi: izvestaj.metrike.skenovi.ukupno,
          zahtevi: izvestaj.metrike.zahtevi.ukupno,
          zahteviOtkazani: izvestaj.metrike.zahteviOtkazani.ukupno,
          rezervacije: izvestaj.metrike.rezervacije.ukupno,
        }}
        className="xl:self-start"
      />
    </div>
  ) : (
    <PremiumKartica paketHref={props.paketHref} />
  );

  if (stanje === "prazno") {
    return (
      <>
        <Kartica data-stanje="prazno">
          <PraznoStanje ikonica={ChartColumn} naslov={t.stanja.praznoNaslov} opis={t.stanja.praznoOpis} />
        </Kartica>
        {premium ? null : premiumBlokovi}
        <KakoBrojimo />
      </>
    );
  }

  return (
    <>
      {stanje === "malo" ? <MaloPodataka /> : null}
      <OkvirSekcije id="an-meni" naslov={t.meniNaslov}>
        <Pokazatelji izvestaj={izvestaj} stanje={stanje} />
        <PoredjenjeObjasnjenje izvestaj={izvestaj} />
        <TrendBlok izvestaj={izvestaj} danas={props.danas} metrika={props.trend} onMetrika={props.onTrend} />
      </OkvirSekcije>
      <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
        <ZahteviBlok izvestaj={izvestaj} stanje={stanje} className="xl:self-start" />
        <RezervacijeBlok izvestaj={izvestaj} stanje={stanje} className="xl:self-start" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2 xl:gap-6">
        <NajotvaranijiBlok izvestaj={izvestaj} className="xl:self-start" />
        <KarticeBlok izvestaj={izvestaj} className="xl:self-start" />
      </div>
      {premiumBlokovi}
      <KakoBrojimo />
    </>
  );
}

export function AnalitikaEkran(props: AnalitikaEkranProps) {
  const { plan, danas, izbor, izvestaj } = props;
  const period = izvestaj?.period ?? periodIzbora(izbor, danas);
  const raspodelaNaEkranu = plan === "premium" && props.raspodela.dimenzija && props.raspodelaPodaci ? props.raspodelaPodaci : null;
  return (
    <>
      <ZaglavljeSaStatusom
        naslov={t.naslov}
        opis={t.opis}
        radnje={<CsvDugme plan={plan} izvestaj={izvestaj} raspodela={raspodelaNaEkranu} slug={props.slug} />}
      />
      <div className="grid gap-6">
        <div className="grid gap-2">
          <PeriodIzbor plan={plan} danas={danas} izbor={izbor} onIzbor={props.onIzbor} />
          <p className="text-sm text-[var(--mp-tekst-sporedni)]">
            <span className="font-semibold text-[var(--mp-tekst)]">
              {fmt(t.period.prikazano, { opseg: opsegTekst(period, t.meseci, t.period.opseg) })}
            </span>{" "}
            · {t.kasnjenje}
          </p>
        </div>
        {izvestaj === undefined ? (
          <UcitavanjeStanje oblik="kartice" oznaka={t.ucitavanje} />
        ) : izvestaj === null ? (
          <GreskaStanje naslov={t.greskaNaslov} onPonovo={props.onPonovo} />
        ) : (
          <Telo {...props} izvestaj={izvestaj} />
        )}
      </div>
    </>
  );
}
