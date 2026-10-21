"use client";

// ScanMe Menu V1 (K30) — the Premium breakdown ("filteri", master §14.1): one
// metric split by one dimension for the chosen period (definitions §5: at most
// 20 values, the rest is "Ostalo"; combined filters are not offered in V1).
// Two native selects with visible labels, then a ranked list; a share of the
// whole only under the rule of 20.

import { useId } from "react";
import { fmt } from "@/lib/i18n/format";
import { menuAnalitikaSr } from "@/lib/i18n/sr/menu-analitika";
import type { Dimenzija } from "@/lib/menu/analitika/definicije";
import type { RaspodelaAnalitike } from "@/lib/menu/analitika/izvestaj";
import {
  dimenzijeMetrike,
  METRIKE_RASPODELE,
  nazivVrednosti,
  udeoPrikaza,
  uskladiDimenziju,
  type MetrikaRaspodele,
  type StanjePodataka,
} from "@/lib/menu/analitika/prikaz";
import { POLJE_KLASA, Polje } from "../../lokal/zajednicko";
import { Kartica } from "../../zajednicko/kartica";
import { OkvirSekcije } from "../../zajednicko/okvir-sekcije";
import { UcitavanjeStanje } from "../../zajednicko/stanja";
import { RangLista, type RangStavka } from "./rang-lista";
import { NAZIVI_RASPODELE, Objasnjenje, objasnjenjeId } from "./zajednicko";

const t = menuAnalitikaSr.raspodela;
const BEZ = "";
const SAMO_BROJ = { one: "{n}", few: "{n}", many: "{n}" } as const;

export type IzborRaspodele = { metrika: MetrikaRaspodele; dimenzija: Dimenzija | null };

/**
 * The rows of a breakdown: the values, then "Ostalo" when it counted anything, then "Bez podatka" —
 * the part of the metric's total that carried no value of this dimension (an open from a plain link
 * has no QR card). Shares are of the metric's total for the period, so the rows add up to it.
 */
export function stavkeRaspodele(raspodela: RaspodelaAnalitike, stanje: StanjePodataka, ukupnoMetrike: number): RangStavka[] {
  const zbirVrednosti = raspodela.vrednosti.reduce((a, v) => a + v.ukupno, 0) + raspodela.ostalo.ukupno;
  const bezPodatka = Math.max(0, ukupnoMetrike - zbirVrednosti);
  const ukupno = zbirVrednosti + bezPodatka;
  const stavke: RangStavka[] = raspodela.vrednosti.map((v) => ({
    kljuc: v.vrednost,
    naziv: nazivVrednosti(raspodela.dimenzija, v.vrednost, v.naziv, NAZIVI_RASPODELE),
    broj: v.ukupno,
    udeo: udeoPrikaza(v.ukupno, ukupno, stanje),
  }));
  if (raspodela.ostalo.ukupno > 0) {
    stavke.push({
      kljuc: "ostalo",
      naziv: t.ostalo,
      broj: raspodela.ostalo.ukupno,
      udeo: udeoPrikaza(raspodela.ostalo.ukupno, ukupno, stanje),
      ostalo: true,
    });
  }
  if (bezPodatka > 0) {
    stavke.push({
      kljuc: "bez-podatka",
      naziv: raspodela.dimenzija === "kartica" ? t.bezKartice : t.bezPodatka,
      broj: bezPodatka,
      udeo: udeoPrikaza(bezPodatka, ukupno, stanje),
      ostalo: true,
    });
  }
  return stavke;
}

export function RaspodelaBlok({
  izbor,
  onIzbor,
  podaci,
  stanje,
  ukupnoMetrike,
  className,
}: {
  /** The period total of each metric (the report on the screen): the base of the shares. */
  ukupnoMetrike: Readonly<Record<MetrikaRaspodele, number>>;
  izbor: IzborRaspodele;
  onIzbor: (izbor: IzborRaspodele) => void;
  /** undefined: loading; null: not loaded (error); absent dimension: nothing asked. */
  podaci: RaspodelaAnalitike | null | undefined;
  stanje: StanjePodataka;
  className?: string;
}) {
  const id = useId();
  const metrikaNaziv = t.metrike[izbor.metrika];
  const dimenzijaNaziv = izbor.dimenzija ? t.dimenzije[izbor.dimenzija] : "";
  const stavke = izbor.dimenzija && podaci ? stavkeRaspodele(podaci, stanje, ukupnoMetrike[podaci.metrika as MetrikaRaspodele] ?? 0) : [];

  return (
    <Kartica data-blok="raspodela" className={className}>
      <OkvirSekcije id="an-raspodela" naslov={t.naslov} opis={t.opis}>
        <div className="flex flex-wrap gap-3">
          <Polje id={`${id}-metrika`} oznaka={t.metrika} className="w-full sm:w-60">
            {(aria) => (
              <select
                {...aria}
                value={izbor.metrika}
                onChange={(event) => {
                  const metrika = event.target.value as MetrikaRaspodele;
                  onIzbor({ metrika, dimenzija: uskladiDimenziju(metrika, izbor.dimenzija) });
                }}
                className={POLJE_KLASA}
              >
                {METRIKE_RASPODELE.map((m) => (
                  <option key={m} value={m}>
                    {t.metrike[m]}
                  </option>
                ))}
              </select>
            )}
          </Polje>
          <Polje id={`${id}-dimenzija`} oznaka={t.dimenzija} className="w-full sm:w-60">
            {(aria) => (
              <select
                {...aria}
                value={izbor.dimenzija ?? BEZ}
                onChange={(event) =>
                  onIzbor({ metrika: izbor.metrika, dimenzija: event.target.value === BEZ ? null : (event.target.value as Dimenzija) })
                }
                className={POLJE_KLASA}
              >
                <option value={BEZ}>{t.nema}</option>
                {dimenzijeMetrike(izbor.metrika).map((d) => (
                  <option key={d} value={d}>
                    {t.dimenzije[d]}
                  </option>
                ))}
              </select>
            )}
          </Polje>
        </div>
        {izbor.dimenzija ? (
          <div className="grid gap-3" aria-live="polite">
            <Objasnjenje kljuc="raspodela">{fmt(t.objasnjenje, { metrika: metrikaNaziv, dimenzija: dimenzijaNaziv })}</Objasnjenje>
            {podaci === undefined ? (
              <UcitavanjeStanje oblik="lista" redova={4} oznaka={t.ucitavanje} />
            ) : podaci === null || stavke.length === 0 ? (
              <p className="text-sm text-[var(--mp-tekst-sporedni)]">{t.prazno}</p>
            ) : (
              <RangLista kljuc="raspodela" stavke={stavke} jedinica={SAMO_BROJ} objasnjenje={objasnjenjeId("raspodela")} />
            )}
          </div>
        ) : null}
      </OkvirSekcije>
    </Kartica>
  );
}
