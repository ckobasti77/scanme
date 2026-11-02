import { v } from "convex/values";
import {
  DIMENZIJE,
  KLIJENTSKE_VRSTE,
  KORACI,
  METRIKE,
  SERVERSKE_VRSTE,
  UREDJAJI,
  type Dimenzija,
  type KlijentskaVrsta,
  type Korak,
  type Metrika,
  type ServerskaVrsta,
  type Uredjaj,
} from "../../lib/menu/analitika/definicije";

// ScanMe Menu V1 (K29) — validators of the analytics tables
// (docs/menu/ANALITIKA-DEFINICIJE.md). The literal lists come from
// lib/menu/analitika/definicije.ts, so the schema and the rules cannot drift.

function literals<T extends string>(values: readonly T[]) {
  const [first, second, ...rest] = values.map((value) => v.literal(value));
  return v.union(first, second, ...rest);
}

export const menuAnalyticsKindValidator = literals<KlijentskaVrsta | ServerskaVrsta>([
  ...KLIJENTSKE_VRSTE,
  ...SERVERSKE_VRSTE,
]);
export const menuAnalyticsDeviceValidator = literals<Uredjaj>(UREDJAJI);
export const menuAnalyticsStepValidator = literals<Korak>(KORACI);
export const menuAnalyticsMetricValidator = literals<Metrika>(METRIKE);
export const menuAnalyticsDimensionValidator = literals<Dimenzija>(DIMENZIJE);

/** One browser event as the ingest receives it (cleaned by lib/menu/analitika/prijem.ts). */
export const menuAnalyticsIncomingEventValidator = v.object({
  vrsta: v.string(),
  stranica: v.optional(v.string()),
  artikal: v.optional(v.string()),
  kartica: v.optional(v.string()),
  jezik: v.optional(v.string()),
  korak: v.optional(v.string()),
  sesija: v.optional(v.string()),
});

/** metric → value (one day). */
export const menuAnalyticsTotalsValidator = v.record(v.string(), v.number());
/** metric → dimension → value → count (one day). */
export const menuAnalyticsBreakdownValidator = v.record(
  v.string(),
  v.record(v.string(), v.record(v.string(), v.number())),
);

/** The steps one session reached (the conversion flow). */
export const menuAnalyticsSessionStepsValidator = v.object({
  detalj: v.optional(v.boolean()),
  zahtev: v.optional(v.boolean()),
  porudzbina: v.optional(v.boolean()),
  rezervacija: v.optional(v.boolean()),
});
