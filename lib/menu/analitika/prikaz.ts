// ScanMe Menu V1 (K30) — how the panel shows the analytics: which periods a
// plan may choose, when the screen has "too little data" (no percentages at
// all), the rule of 20 for every percentage, the comparison with the previous
// period in words, the number and date formats, the scale of a chart and the
// names of breakdown values. Pure: the Analitika section, the Početna card, the
// CSV and the izlog all use it (docs/menu/ANALITIKA-DEFINICIJE.md §2, §5).

import { DEFINICIJE, METRIKE, MIN_IMENILAC, OSTALO, procenat, sesijePouzdane, type Dimenzija, type Metrika } from "./definicije";
import type { IzvestajAnalitike } from "./izvestaj";
import { poslednjihDana, proveriPeriod, type GreskaPerioda, type Period, type Poredjenje } from "./period";

export type AnalitikaPlan = "standard" | "premium";

// -----------------------------------------------------------------------------
// Periods
// -----------------------------------------------------------------------------

export const BRZI_IZBORI = ["d7", "d30", "d90"] as const;
export type BrziIzbor = (typeof BRZI_IZBORI)[number];
export type IzborPerioda = { vrsta: BrziIzbor } | { vrsta: "izbor"; od: string; do: string };

const DANA: Record<BrziIzbor, number> = { d7: 7, d30: 30, d90: 90 };

/** Standard: the last 7 and 30 days. Premium: also 90 days and a period of its own (master §14.1). */
export function izborDozvoljen(vrsta: IzborPerioda["vrsta"], plan: AnalitikaPlan): boolean {
  return plan === "premium" || vrsta === "d7" || vrsta === "d30";
}

/** The days a choice covers, up to and including `danas`. */
export function periodIzbora(izbor: IzborPerioda, danas: string): Period {
  if (izbor.vrsta === "izbor") return { od: izbor.od, do: izbor.do };
  return poslednjihDana(danas, DANA[izbor.vrsta]);
}

/** Why a choice cannot be shown: a locked Premium choice, or a broken custom period. */
export function proveriIzbor(izbor: IzborPerioda, danas: string, plan: AnalitikaPlan): GreskaPerioda | "premium" | null {
  if (!izborDozvoljen(izbor.vrsta, plan)) return "premium";
  if (izbor.vrsta !== "izbor") return null;
  return proveriPeriod({ od: izbor.od, do: izbor.do }, danas);
}

// -----------------------------------------------------------------------------
// Too little data and the rule of 20
// -----------------------------------------------------------------------------

export type StanjePodataka = "prazno" | "malo" | "dovoljno";

/**
 * The base the screen's percentages stand on: the sessions when they are
 * measured, otherwise the menu opens (the closest count of visits).
 */
export function bazaPodataka(izvestaj: Pick<IzvestajAnalitike, "sesije" | "metrike">): number {
  return izvestaj.sesije.broj ?? izvestaj.metrike.otvaranja.ukupno;
}

/**
 * `prazno`: nothing was counted in the period. `malo`: fewer than 20 sessions
 * (or menu opens without sessions) — the screen shows numbers and no
 * percentage at all, with a message saying why. Otherwise every percentage
 * still needs its own denominator of 20 (`udeoPrikaza`).
 */
export function stanjePodataka(izvestaj: Pick<IzvestajAnalitike, "sesije" | "metrike">): StanjePodataka {
  const nesto = METRIKE.some((metrika) => izvestaj.metrike[metrika].ukupno > 0);
  if (!nesto) return "prazno";
  return bazaPodataka(izvestaj) < MIN_IMENILAC ? "malo" : "dovoljno";
}

/** A share in percent for the screen: never with too little data, never below a denominator of 20. */
export function udeoPrikaza(brojilac: number, imenilac: number, stanje: StanjePodataka): number | null {
  if (stanje !== "dovoljno") return null;
  return procenat(brojilac, imenilac);
}

export type SmerPromene = "vise" | "manje" | "isto";
export type Promena = { smer: SmerPromene; /** Always positive. */ razlika: number; /** Always positive; null below 20. */ procenat: number | null };

/** The comparison in words: more, fewer or the same, and by how much (the percentage under the rule of 20). */
export function promena(poredjenje: Poredjenje, stanje: StanjePodataka): Promena {
  const smer: SmerPromene = poredjenje.razlika > 0 ? "vise" : poredjenje.razlika < 0 ? "manje" : "isto";
  const deo = stanje === "dovoljno" && poredjenje.procenat !== null ? Math.abs(poredjenje.procenat) : null;
  return { smer, razlika: Math.abs(poredjenje.razlika), procenat: smer === "isto" ? null : deo };
}

/** The previous period counted nothing at all (a new venue, data before the launch): no comparison is honest. */
export function prethodniBezPodataka(izvestaj: Pick<IzvestajAnalitike, "prethodni">): boolean {
  const prethodni = izvestaj.prethodni;
  return prethodni !== null && METRIKE.every((metrika) => (prethodni.ukupno[metrika] ?? 0) === 0);
}

/**
 * Whether a metric's comparison line is shown (Premium). Not when the previous
 * period of that metric is 0 (e.g. scans before their first transfer: "+N"
 * would only say the data did not exist yet), and for sessions only when the
 * previous period's sessions were reliable too.
 */
export function poredjenjeDostupno(izvestaj: Pick<IzvestajAnalitike, "prethodni">, metrika: Metrika): boolean {
  const prethodni = izvestaj.prethodni;
  if (prethodni === null || prethodniBezPodataka(izvestaj)) return false;
  if ((prethodni.ukupno[metrika] ?? 0) === 0) return false;
  if (metrika === "sesije") return sesijePouzdane(prethodni.ukupno.otvaranjaSaSesijom ?? 0, prethodni.ukupno.otvaranja ?? 0);
  return true;
}

// -----------------------------------------------------------------------------
// Formats
// -----------------------------------------------------------------------------

/** 1284 → "1.284" (Serbian thousands separator, no Intl dependency). */
export function formatBroj(n: number): string {
  const ceo = Math.round(n);
  const znak = ceo < 0 ? "-" : "";
  return znak + String(Math.abs(ceo)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** 12.5 → "12,5%", 40 → "40%". */
export function formatProcenat(p: number): string {
  const zaokruzeno = Math.round(p * 10) / 10;
  const tekst = Number.isInteger(zaokruzeno) ? String(zaokruzeno) : zaokruzeno.toFixed(1).replace(".", ",");
  return `${tekst}%`;
}

function delovi(dan: string): [number, number, number] {
  const [y, m, d] = dan.split("-").map(Number);
  return [y, m, d];
}

/** "2026-10-15" → "15. okt". */
export function danKratko(dan: string, meseci: readonly string[]): string {
  const [, m, d] = delovi(dan);
  return `${d}. ${meseci[m - 1] ?? ""}`.trim();
}

/** "15. okt – 21. okt 2026"; across years both years. */
export function opsegTekst(period: Period, meseci: readonly string[], sablon = "{od} – {do}"): string {
  const [y1] = delovi(period.od);
  const [y2] = delovi(period.do);
  const od = y1 === y2 ? danKratko(period.od, meseci) : `${danKratko(period.od, meseci)} ${y1}`;
  return sablon.replace("{od}", od).replace("{do}", `${danKratko(period.do, meseci)} ${y2}`);
}

// -----------------------------------------------------------------------------
// Charts
// -----------------------------------------------------------------------------

/** A clean top of the value axis: 1, 2, 2.5, 5 × 10^k at or above the largest value (at least 1). */
export function lepaSkala(max: number): number {
  if (!(max > 0)) return 1;
  const red = 10 ** Math.floor(Math.log10(max));
  for (const korak of [1, 2, 2.5, 5, 10]) {
    const vrednost = korak * red;
    if (vrednost >= max) return Number.isInteger(vrednost) ? vrednost : Math.ceil(vrednost);
  }
  return 10 * red;
}

/** The index of the largest value (the first of equals), or -1 for an empty or all-zero series. */
export function indeksNajveceg(niz: readonly number[]): number {
  let indeks = -1;
  let najveci = 0;
  niz.forEach((broj, i) => {
    if (broj > najveci) {
      najveci = broj;
      indeks = i;
    }
  });
  return indeks;
}

// -----------------------------------------------------------------------------
// Breakdowns (Premium filters)
// -----------------------------------------------------------------------------

/** The metrics the trend chart offers (the counts a venue acts on). */
export const METRIKE_TRENDA = ["otvaranja", "detalji", "skenovi", "zahtevi", "rezervacije"] as const;
export type MetrikaTrenda = (typeof METRIKE_TRENDA)[number];

/** The metrics a breakdown offers; each keeps its own dimensions (definitions §5). */
export const METRIKE_RASPODELE = ["otvaranja", "detalji", "skenovi", "zahtevi", "zahteviOtkazani", "rezervacije"] as const;
export type MetrikaRaspodele = (typeof METRIKE_RASPODELE)[number];

export function dimenzijeMetrike(metrika: MetrikaRaspodele): readonly Dimenzija[] {
  return DEFINICIJE[metrika].dimenzije;
}

/** The first dimension of a metric when the chosen one does not belong to it. */
export function uskladiDimenziju(metrika: MetrikaRaspodele, dimenzija: Dimenzija | null): Dimenzija | null {
  if (dimenzija === null) return null;
  const dozvoljene = dimenzijeMetrike(metrika);
  return dozvoljene.includes(dimenzija) ? dimenzija : (dozvoljene[0] ?? null);
}

export type NaziviRaspodele = {
  ostalo: string;
  uklonjeno: string;
  bezNaziva: string;
  sat: string;
  uredjaji: Readonly<Record<string, string>>;
  kanali: Readonly<Record<string, string>>;
  ko: Readonly<Record<string, string>>;
  vrsteZahteva: Readonly<Record<string, string>>;
  jezici: Readonly<Record<string, string>>;
};

const velikoPrvo = (tekst: string) => tekst.charAt(0).toUpperCase() + tekst.slice(1);

/** What the panel and the CSV call one value of a breakdown. */
export function nazivVrednosti(dimenzija: Dimenzija, vrednost: string, naziv: string | null, nazivi: NaziviRaspodele): string {
  if (vrednost === OSTALO) return nazivi.ostalo;
  switch (dimenzija) {
    case "stranica":
    case "artikal":
    case "kartica":
      if (naziv === null) return nazivi.uklonjeno;
      return naziv.trim() === "" ? nazivi.bezNaziva : naziv;
    case "sat": {
      const sat = Number(vrednost);
      if (!Number.isInteger(sat) || sat < 0 || sat > 23) return vrednost;
      const dva = (n: number) => String(n).padStart(2, "0");
      return nazivi.sat.replace("{od}", dva(sat)).replace("{do}", dva((sat + 1) % 24));
    }
    case "uredjaj":
      return nazivi.uredjaji[vrednost] ?? vrednost;
    case "kanal":
      return nazivi.kanali[vrednost] ?? vrednost;
    case "ko":
      return nazivi.ko[vrednost] ?? vrednost;
    case "zahtev":
      return nazivi.vrsteZahteva[vrednost] ?? vrednost;
    case "jezik":
      return nazivi.jezici[vrednost] ? velikoPrvo(nazivi.jezici[vrednost]) : vrednost.toUpperCase();
  }
}
