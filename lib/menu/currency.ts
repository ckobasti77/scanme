// ScanMe Menu V1 (K14, plan K12 §6.5, P6) — the informative EUR price
// (master §5.3). RSD in whole dinars is the only price that counts; EUR is a
// second, approximate line under it ("~ 12,70 EUR"), never a replacement.
// The rate is the NBS middle rate kept by convex/menuFx.ts. Without a fresh
// rate the switch does not show at all.
//
//   kursJeSvez   the rate's date is at most MENU_KURS_SVEZINA_DANA Belgrade
//                calendar days old (a weekend or a holiday has no new list)
//   eurIzRsd     RSD → EUR, rounded half up to cents
//   formatEur    "~ 1.234,50 EUR": a thousands dot, a decimal comma, always two decimals

import { belgradeParts } from "../belgrade-time";

/** The latest stored rate (convex/menuFx.ts `current`). */
export type MenuKurs = {
  /** RSD for 1 EUR (NBS middle rate). */
  rate: number;
  /** The date the rate applies to, "YYYY-MM-DD" (Belgrade). */
  effectiveDate: string;
  fetchedAt: number;
};

/** A rate older than this many Belgrade calendar days is not shown (Friday's list still serves on Tuesday). */
export const MENU_KURS_SVEZINA_DANA = 4;

/** A plausible EUR/RSD rate; anything outside is a broken source, never shown. */
export const MENU_KURS_MIN = 50;
export const MENU_KURS_MAX = 500;

const DATUM = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAN_MS = 24 * 60 * 60 * 1000;

export function jeIspravanKurs(rate: number): boolean {
  return Number.isFinite(rate) && rate >= MENU_KURS_MIN && rate <= MENU_KURS_MAX;
}

/** "YYYY-MM-DD" → days since the epoch, or null for an impossible date. */
function danIzDatuma(datum: string): number | null {
  const match = DATUM.exec(datum);
  if (!match) return null;
  const [godina, mesec, dan] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(godina, mesec - 1, dan);
  const provera = new Date(utc);
  if (provera.getUTCFullYear() !== godina || provera.getUTCMonth() !== mesec - 1 || provera.getUTCDate() !== dan) return null;
  return utc / DAN_MS;
}

/** True for a real calendar date "YYYY-MM-DD" ("2026-02-31" is not). */
export function jeIspravanDatum(datum: string): boolean {
  return danIzDatuma(datum) !== null;
}

/** Today's Belgrade calendar day as days since the epoch. */
function beogradskiDan(sadaMs: number): number {
  const parts = belgradeParts(sadaMs);
  return Date.UTC(parts.year, parts.month - 1, parts.day) / DAN_MS;
}

/**
 * True when the rate applies to today or to one of the last
 * MENU_KURS_SVEZINA_DANA Belgrade days. A date in the future, an impossible
 * date and an implausible rate are never fresh.
 */
export function kursJeSvez(kurs: Pick<MenuKurs, "rate" | "effectiveDate"> | null | undefined, sadaMs: number): boolean {
  if (!kurs || !jeIspravanKurs(kurs.rate)) return false;
  const dan = danIzDatuma(kurs.effectiveDate);
  if (dan === null) return false;
  const razlika = beogradskiDan(sadaMs) - dan;
  return razlika >= 0 && razlika <= MENU_KURS_SVEZINA_DANA;
}

/** RSD → EUR, rounded half up to the cent (the float noise of the division is removed first). */
export function eurIzRsd(rsd: number, rate: number): number {
  const centi = Number(((rsd * 100) / rate).toPrecision(12));
  return Math.round(centi) / 100;
}

/** "1.234,50": the amount with a thousands dot and a decimal comma, always two decimals. */
export function iznosEur(eur: number): string {
  const centi = Math.round(Math.abs(eur) * 100);
  const celi = String(Math.floor(centi / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decimale = String(centi % 100).padStart(2, "0");
  return `${eur < 0 ? "-" : ""}${celi},${decimale}`;
}

/** "~ 12,70 EUR" for an RSD price. */
export function formatEur(rsd: number, rate: number): string {
  return `~ ${iznosEur(eurIzRsd(rsd, rate))} EUR`;
}

/** The rate's date as Belgrade shows it: "16. 10. 2026.". */
export function datumKursa(effectiveDate: string): string {
  const match = DATUM.exec(effectiveDate);
  return match ? `${Number(match[3])}. ${Number(match[2])}. ${match[1]}.` : effectiveDate;
}
