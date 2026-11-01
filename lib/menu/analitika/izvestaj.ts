// ScanMe Menu V1 (K30) — the shape of what the analytics queries return
// (convex/menuAnalytics.ts `pregled`, `period`, `raspodela`), written out as
// plain types so the panel, the Početna card, the CSV and the izlog fixtures
// share it without importing Convex. The query result is assignable to these
// types (ids are strings here); the route passes it as is.

import type { Dimenzija, Metrika } from "./definicije";
import type { Period, Poredjenje } from "./period";

export type MetrikaNiz = { ukupno: number; poDanu: readonly number[] };
export type IshodZahteva = { poslato: number; prihvaceno: number; zavrseno: number; otkazano: number };
export type VrstaZahteva = "call" | "bill" | "order";
export const VRSTE_ZAHTEVA: readonly VrstaZahteva[] = ["call", "bill", "order"];

export type IzvestajAnalitike = {
  period: Period & { dana: number };
  /** Every day of the period, oldest first (`YYYY-MM-DD`, Belgrade). */
  dani: readonly string[];
  metrike: Readonly<Record<Metrika, MetrikaNiz>>;
  zahtevi: Readonly<Record<VrstaZahteva, IshodZahteva>>;
  porudzbinePoKanalu: { standard: number; roomService: number };
  zahteviOtkazao: { gost: number; osoblje: number };
  rezervacije: {
    poslato: number;
    prihvaceno: number;
    odbijeno: number;
    predlozeno: number;
    realizovano: number;
    otkazano: number;
    otkazao: { gost: number; osoblje: number };
  };
  /** `broj` is null when sessions are not measured or not reliable (definitions §3). */
  sesije: { broj: number | null; pokrivenost: number | null };
  najotvaraniji: readonly { artikal: string; naziv: string; broj: number }[];
  skenovi: readonly { kartica: string; naziv: string; broj: number }[];
  /** Premium `period` only, and only with reliable sessions. */
  konverzije: {
    sesije: number;
    saDetaljem: number;
    saZahtevom: number;
    saPorudzbinom: number;
    saRezervacijom: number;
    udeo: { detalj: number | null; zahtev: number | null; porudzbina: number | null; rezervacija: number | null };
  } | null;
  /** Premium `period` with `poredi`: the previous period of the same length. */
  prethodni: {
    period: Period;
    ukupno: Readonly<Record<Metrika, number>>;
    poredjenje: Readonly<Record<Metrika, Poredjenje>>;
  } | null;
};

export type RaspodelaAnalitike = {
  period: Period & { dana: number };
  dani: readonly string[];
  metrika: Metrika;
  dimenzija: Dimenzija;
  /** At most 20 values, the largest first; `naziv` is given for pages, articles and cards. */
  vrednosti: readonly { vrednost: string; naziv: string | null; ukupno: number; poDanu: readonly number[] }[];
  ostalo: MetrikaNiz;
};
