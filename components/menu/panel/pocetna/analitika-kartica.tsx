// ScanMe Menu V1 (K30) — "Poslednjih 7 dana" on Početna (master §13.2, §13.3):
// the one darker card of the screen, a short look back with the same
// definitions as Analitika (convex/menuAnalytics.ts `pregled`, 7 days). It shows
// only numbers that no other block of Početna shows — menu opens (with the
// seven days as small columns), article opens, QR scans and the most opened
// article — never requests or reservations, which Pažnja and Sada already show
// as live operations. Every number points to its explanation ("Šta se broji").

import { ChartColumn } from "lucide-react";
import Link from "next/link";
import { fmt, srPluralCategory } from "@/lib/i18n/format";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import { menuPanelSr } from "@/lib/i18n/sr/menu-panel";
import type { IzvestajAnalitike } from "@/lib/menu/analitika/izvestaj";
import { danKratko, formatBroj, lepaSkala, stanjePodataka } from "@/lib/menu/analitika/prikaz";
import { cn } from "@/lib/utils";
import { Broj, objasnjenjeId, StaSeBroji, TekstSaBrojem } from "../analitika/zajednicko";
import { Dugme } from "../../zajednicko/dugme";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { PraznoStanje, UcitavanjeStanje } from "../../zajednicko/stanja";

const t = menuAnalitikaSr;
const K = (kljuc: string) => `pocetna-${kljuc}`;

function Stubici({ dani, vrednosti }: { dani: readonly string[]; vrednosti: readonly number[] }) {
  const skala = lepaSkala(Math.max(0, ...vrednosti));
  const opis = dani.map((dan, i) => `${danKratko(dan, t.meseci)} ${formatBroj(vrednosti[i] ?? 0)}`).join(", ");
  return (
    <div role="img" aria-label={fmt(t.pocetna.grafikon, { dani: opis })} className="grid gap-1">
      <div className="flex h-14 items-end gap-0.5 border-b [--border:var(--mp-ivica)]">
        {dani.map((dan, i) => {
          const vrednost = vrednosti[i] ?? 0;
          return (
            <div key={dan} title={`${danKratko(dan, t.meseci)}: ${formatBroj(vrednost)}`} className="flex h-full min-w-0 flex-1 items-end justify-center">
              <div
                className="w-full max-w-4 rounded-t-[4px] bg-[var(--mp-akcent)]"
                style={{ height: vrednost > 0 ? `max(2px, ${(vrednost / skala) * 100}%)` : "0" }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="flex justify-between text-xs text-[var(--mp-tekst-sporedni)]">
        <span>{dani.length > 0 ? danKratko(dani[0], t.meseci) : ""}</span>
        <span>{dani.length > 0 ? danKratko(dani[dani.length - 1], t.meseci) : ""}</span>
      </div>
    </div>
  );
}

function Stavka({ kljuc, vrednost, className }: { kljuc: "detalji" | "skenovi"; vrednost: number; className?: string }) {
  return (
    <div data-pocetna-broj={kljuc} className={cn("grid content-start gap-0.5", className)}>
      <span className="text-sm text-[var(--mp-tekst-sporedni)]">{t.metrike[kljuc].naziv}</span>
      <span className="text-2xl font-semibold leading-tight text-[var(--mp-tekst)]">
        <Broj kljuc={K(kljuc)} vrednost={vrednost} objasnjenje={objasnjenjeId(K(kljuc))} />
      </span>
    </div>
  );
}

export function AnalitikaKartica({
  izvestaj,
  href,
  className,
}: {
  /** undefined: loading; null: not available. */
  izvestaj: IzvestajAnalitike | null | undefined;
  /** Analitika in the panel (or in the izlog). */
  href: string;
  className?: string;
}) {
  let sadrzaj;
  if (izvestaj === undefined) {
    sadrzaj = <UcitavanjeStanje oblik="lista" redova={3} oznaka={t.pocetna.ucitavanje} />;
  } else if (izvestaj === null) {
    sadrzaj = <p className="text-sm text-[var(--mp-tekst)]">{t.pocetna.greska}</p>;
  } else if (stanjePodataka(izvestaj) === "prazno") {
    sadrzaj = <PraznoStanje nivo={3} ikonica={ChartColumn} naslov={t.pocetna.prazno} opis={t.pocetna.praznoOpis} className="py-4" />;
  } else {
    const otvaranja = izvestaj.metrike.otvaranja;
    const prvi = izvestaj.najotvaraniji[0];
    sadrzaj = (
      <div className="grid gap-4">
        <div data-pocetna-broj="otvaranja" className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-4">
          <div className="grid gap-0.5">
            <span className="text-sm text-[var(--mp-tekst-sporedni)]">{t.metrike.otvaranja.naziv}</span>
            <span className="text-4xl font-semibold leading-none tracking-[-0.02em] text-[var(--mp-tekst)]">
              <Broj kljuc={K("otvaranja")} vrednost={otvaranja.ukupno} objasnjenje={objasnjenjeId(K("otvaranja"))} />
            </span>
          </div>
          <Stubici dani={izvestaj.dani} vrednosti={otvaranja.poDanu} />
        </div>
        <div className="grid grid-cols-2 gap-4 border-t pt-3 [--border:var(--mp-ivica)]">
          <Stavka kljuc="detalji" vrednost={izvestaj.metrike.detalji.ukupno} />
          <Stavka kljuc="skenovi" vrednost={izvestaj.metrike.skenovi.ukupno} />
        </div>
        {prvi ? (
          <div data-pocetna-broj="najotvaraniji" className="grid gap-0.5 border-t pt-3 [--border:var(--mp-ivica)]">
            <span className="text-sm text-[var(--mp-tekst-sporedni)]">{t.pocetna.najotvaranijiArtikal}</span>
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 text-[var(--mp-tekst)]">
              <span className="min-w-0 break-words font-semibold">{prvi.naziv}</span>
              <span className="text-sm">
                <TekstSaBrojem sablon={t.najotvaraniji.broj[srPluralCategory(prvi.broj)]}>
                  <Broj kljuc={K("najotvaraniji")} vrednost={prvi.broj} objasnjenje={objasnjenjeId(K("najotvaraniji"))} />
                </TekstSaBrojem>
              </span>
            </span>
          </div>
        ) : null}
        <StaSeBroji
          stavke={[
            { kljuc: K("otvaranja"), tekst: t.metrike.otvaranja.objasnjenje },
            { kljuc: K("detalji"), tekst: t.metrike.detalji.objasnjenje },
            { kljuc: K("skenovi"), tekst: t.metrike.skenovi.objasnjenje },
            ...(prvi ? [{ kljuc: K("najotvaraniji"), tekst: t.pocetna.najotvaranijiObjasnjenje }] : []),
            { kljuc: K("kasnjenje"), tekst: t.kasnjenje },
          ]}
        />
      </div>
    );
  }

  return (
    <Kartica ton="istaknuta" data-blok="analitika" className={className}>
      <OkvirSekcije id="pocetna-analitika" naslov={menuPanelSr.pocetna.analitika.naslov} opis={t.pocetna.opis}>
        {sadrzaj}
        <div>
          <Dugme asChild vrsta="sekundarno">
            <Link href={href}>
              <ChartColumn aria-hidden="true" strokeWidth={1.75} />
              {t.pocetna.otvori}
            </Link>
          </Dugme>
        </div>
      </OkvirSekcije>
    </Kartica>
  );
}
