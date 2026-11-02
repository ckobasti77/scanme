// ScanMe Menu V1 (K30) — the Premium CSV export of the analytics (master §14.1).
// Two shapes: the chosen period day by day (one column per metric, Serbian
// headers, a "Ukupno" row), or — when a breakdown is chosen — that breakdown
// day by day (one column per value). Only aggregate counts: no session id, no
// guest name or contact, nothing per person. For Excel: UTF-8 with a BOM, `;`
// between fields (the list separator of Excel with Serbian regional settings),
// CRLF line ends, ISO dates. A text field that Excel would run as a formula
// (=, +, -, @) gets a leading apostrophe.

import { menuAnalitikaSr } from "../../i18n/sr/menu-analitika";
import type { MenuAnalitikaDict } from "../../i18n/types";
import type { Metrika } from "./definicije";
import type { IzvestajAnalitike, RaspodelaAnalitike } from "./izvestaj";

export const CSV_BOM = "﻿";
export const CSV_SEPARATOR = ";";
const KRAJ_REDA = "\r\n";

type CsvTekst = MenuAnalitikaDict["csv"];
type CsvKolona = keyof CsvTekst["kolone"];

/** One field: numbers as digits, text quoted when needed and never a formula. */
export function csvPolje(vrednost: string | number): string {
  if (typeof vrednost === "number") return Number.isFinite(vrednost) ? String(Math.round(vrednost)) : "";
  const bezbedno = /^[=+\-@\t\r]/.test(vrednost) ? `'${vrednost}` : vrednost;
  return /[;"\r\n]|^\s|\s$/.test(bezbedno) ? `"${bezbedno.replace(/"/g, '""')}"` : bezbedno;
}

function red(polja: readonly (string | number)[]): string {
  return polja.map(csvPolje).join(CSV_SEPARATOR);
}

function dokument(redovi: readonly string[]): string {
  return CSV_BOM + redovi.join(KRAJ_REDA) + KRAJ_REDA;
}

const OSNOVNE: readonly CsvKolona[] = [
  "otvaranja",
  "detalji",
  "skenovi",
  "zahtevi",
  "porudzbine",
  "zahteviPrihvaceni",
  "zahteviZavrseni",
  "zahteviOtkazani",
  "rezervacije",
  "rezervacijePrihvacene",
  "rezervacijePredlozi",
  "rezervacijeOdbijene",
  "rezervacijeRealizovane",
  "rezervacijeOtkazane",
];
const KONVERZIJE: readonly CsvKolona[] = [
  "sesijeSaDetaljem",
  "sesijeSaZahtevom",
  "sesijeSaPorudzbinom",
  "sesijeSaRezervacijom",
];

/** The metric columns of the period table: sessions only when they are reliable, the flow only with it. */
export function kolonePerioda(izvestaj: Pick<IzvestajAnalitike, "sesije" | "konverzije">): CsvKolona[] {
  const kolone = [...OSNOVNE];
  if (izvestaj.sesije.broj !== null) kolone.push("sesije");
  if (izvestaj.konverzije !== null) kolone.push(...KONVERZIJE);
  return kolone;
}

/** The chosen period, day by day, with a total row. */
export function csvPerioda(izvestaj: IzvestajAnalitike, tekst: CsvTekst = menuAnalitikaSr.csv): string {
  const kolone = kolonePerioda(izvestaj);
  const metrika = (kolona: CsvKolona) => izvestaj.metrike[kolona as Metrika];
  const redovi = [red([tekst.datum, ...kolone.map((kolona) => tekst.kolone[kolona])])];
  izvestaj.dani.forEach((dan, indeks) => {
    redovi.push(red([dan, ...kolone.map((kolona) => metrika(kolona).poDanu[indeks] ?? 0)]));
  });
  redovi.push(red([tekst.ukupno, ...kolone.map((kolona) => metrika(kolona).ukupno)]));
  return dokument(redovi);
}

/** A breakdown, day by day: one column per value, then "Ostalo" and the day's total. */
export function csvRaspodele(
  raspodela: RaspodelaAnalitike,
  naziv: (vrednost: RaspodelaAnalitike["vrednosti"][number]) => string,
  tekst: CsvTekst = menuAnalitikaSr.csv,
  ostalo: string = menuAnalitikaSr.raspodela.ostalo,
): string {
  const vrednosti = raspodela.vrednosti;
  const redovi = [red([tekst.datum, ...vrednosti.map(naziv), ostalo, tekst.ukupno])];
  raspodela.dani.forEach((dan, indeks) => {
    const brojevi = [...vrednosti.map((v) => v.poDanu[indeks] ?? 0), raspodela.ostalo.poDanu[indeks] ?? 0];
    redovi.push(red([dan, ...brojevi, brojevi.reduce((a, b) => a + b, 0)]));
  });
  const ukupno = [...vrednosti.map((v) => v.ukupno), raspodela.ostalo.ukupno];
  redovi.push(red([tekst.ukupno, ...ukupno, ukupno.reduce((a, b) => a + b, 0)]));
  return dokument(redovi);
}

/** `scanme-analitika-demo-restoran-2026-09-22-2026-10-21[-otvaranja-jezik].csv` (only safe characters). */
export function imeCsvFajla(
  opcije: { slug?: string; od: string; do: string; metrika?: string; dimenzija?: string },
  osnova: string = menuAnalitikaSr.csv.fajl,
): string {
  const delovi = [osnova, opcije.slug, opcije.od, opcije.do, opcije.metrika, opcije.dimenzija]
    .filter((deo): deo is string => typeof deo === "string" && deo !== "")
    .map((deo) => deo.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter((deo) => deo !== "");
  return `${delovi.join("-")}.csv`;
}
