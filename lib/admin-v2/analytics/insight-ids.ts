// ADMIN v2 X3 — the ids of the „Uvidi“ rules (lib/admin-v2/analytics/insights.ts).
// On their own, without an import: the dictionary types (lib/i18n/types.ts)
// key the sentences by them, and those types are also read by the Convex
// type check, which does not know the app's `@/` paths.

export type InsightId =
  | "no_leads_one"
  | "no_leads_many"
  | "later_days"
  | "top_stand_today"
  | "top_stand_total"
  | "peak_hour"
  | "single_model"
  | "passport_low"
  | "package_gap"
  | "top_model";
