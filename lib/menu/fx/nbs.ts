// ScanMe Menu V1 (K14, plan K12 §6.5) — reads the NBS middle rate for EUR out
// of the JSON of the configured source (MENU_FX_URL, convex/menuFx.ts). The
// expected shape is the one public relays of the NBS exchange list use:
//
//   { "code": "EUR", "date": "2026-10-16", "parity": 1, "exchange_middle": 117.2 }
//
// `parity` (units of the currency the rate is for) is optional and defaults to
// 1. Anything else — another currency, a missing or impossible date, an
// implausible rate — is refused (null), so a broken source never shows a
// wrong price. Pure; the tests feed it fixture JSON, never the network.

import { jeIspravanDatum, jeIspravanKurs } from "../currency";

export type NbsKurs = { rate: number; effectiveDate: string };

function broj(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && /^\d+(?:[.,]\d+)?$/.test(value.trim())) return Number(value.trim().replace(",", "."));
  return null;
}

export function parseNbsMiddleRate(json: unknown): NbsKurs | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null;
  const row = json as Record<string, unknown>;
  if (typeof row.code === "string" && row.code.trim().toUpperCase() !== "EUR") return null;
  const date = typeof row.date === "string" ? row.date.trim().slice(0, 10) : "";
  if (!jeIspravanDatum(date)) return null;
  const middle = broj(row.exchange_middle);
  const parity = row.parity === undefined ? 1 : broj(row.parity);
  if (middle === null || parity === null || parity <= 0) return null;
  const rate = Math.round((middle / parity) * 10000) / 10000;
  return jeIspravanKurs(rate) ? { rate, effectiveDate: date } : null;
}
