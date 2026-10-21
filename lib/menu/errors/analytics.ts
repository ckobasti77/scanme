// ScanMe Menu V1 (K29) — machine error codes of the analytics queries
// (docs/menu/ANALITIKA-DEFINICIJE.md §8). Dependency-free like ./core.ts; the
// Serbian text lives in the `menu-domen` dictionary (`errors[code]`).
export const ANALYTICS_ERROR = {
  /** A Premium period that is not real days, reversed, longer than 366 days, in the future or older than 24 months. */
  invalidPeriod: "analytics/invalid_period",
} as const;

export type AnalyticsErrorCode = (typeof ANALYTICS_ERROR)[keyof typeof ANALYTICS_ERROR];
