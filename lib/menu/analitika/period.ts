// ScanMe Menu V1 (K29) — periods of the analytics: the last 7 / 30 / 90 days,
// a Premium custom period, the previous period of the same length, the
// comparison of the two, and the retention cut-offs. Days are Belgrade
// `YYYY-MM-DD` keys; arithmetic is on the calendar (no DST surprises).

import { addDays } from "../working-hours";
import { MAX_DANA_PERIODA, MENU_ANALYTICS_DAILY_MONTHS, MENU_ANALYTICS_RAW_DAYS, MIN_IMENILAC } from "./definicije";

export type Period = { od: string; do: string };

const DAN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAN_MS = 24 * 60 * 60 * 1000;

/** A real calendar day as `YYYY-MM-DD`. */
export function jeDan(value: string): boolean {
  const match = DAN.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const datum = new Date(Date.UTC(y, m - 1, d));
  return datum.getUTCFullYear() === y && datum.getUTCMonth() === m - 1 && datum.getUTCDate() === d;
}

/** Days from `od` to `do`, both included (0 or less when reversed). */
export function brojDana(period: Period): number {
  const [a, b] = [period.od, period.do].map((dan) => {
    const [y, m, d] = dan.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / DAN_MS) + 1;
}

/** Every day key of a period, oldest first. */
export function daniPerioda(period: Period): string[] {
  const n = brojDana(period);
  return Array.from({ length: Math.max(0, n) }, (_, index) => addDays(period.od, index));
}

/** The last `dana` days up to and including `danas`. */
export function poslednjihDana(danas: string, dana: number): Period {
  return { od: addDays(danas, -(dana - 1)), do: danas };
}

/** The period of the same length right before (Premium comparison). */
export function prethodniPeriod(period: Period): Period {
  const n = brojDana(period);
  return { od: addDays(period.od, -n), do: addDays(period.od, -1) };
}

/** The first day the daily aggregates still keep: the same date 24 months back (29 Feb → 28 Feb). */
export function najstarijiDanAgregata(danas: string): string {
  const [y, m, d] = danas.split("-").map(Number);
  const meseci = y * 12 + (m - 1) - MENU_ANALYTICS_DAILY_MONTHS;
  const godina = Math.floor(meseci / 12);
  const mesec = (meseci % 12) + 1;
  const poslednjiDan = new Date(Date.UTC(godina, mesec, 0)).getUTCDate();
  return `${godina}-${String(mesec).padStart(2, "0")}-${String(Math.min(d, poslednjiDan)).padStart(2, "0")}`;
}

/** Raw events received before this instant are deleted (90 days). */
export function granicaSirovih(sadaMs: number): number {
  return sadaMs - MENU_ANALYTICS_RAW_DAYS * DAN_MS;
}

export type GreskaPerioda = "neispravan" | "obrnut" | "predug" | "buducnost" | "van_cuvanja";

/** A Premium custom period: real days, in order, at most 366 days, not in the future, inside the 24 months. */
export function proveriPeriod(period: Period, danas: string): GreskaPerioda | null {
  if (!jeDan(period.od) || !jeDan(period.do) || !jeDan(danas)) return "neispravan";
  if (period.od > period.do) return "obrnut";
  if (brojDana(period) > MAX_DANA_PERIODA) return "predug";
  if (period.do > danas) return "buducnost";
  if (period.od < najstarijiDanAgregata(danas)) return "van_cuvanja";
  return null;
}

export type Poredjenje = {
  razlika: number;
  /** Change in percent (one decimal); null when the previous period is below the rule of 20. */
  procenat: number | null;
};

/** Now against the previous period: the difference always, the percentage only from 20 (§14.4). */
export function poredi(sada: number, pre: number): Poredjenje {
  const razlika = sada - pre;
  if (pre < MIN_IMENILAC) return { razlika, procenat: null };
  return { razlika, procenat: Math.round((razlika / pre) * 1000) / 10 };
}
