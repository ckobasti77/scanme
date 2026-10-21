import type { AnalyticsData, AnalyticsModel, ModelAnalyticsData } from "./types";

// ADMIN v2 X3 — the detail of one model (opened from the leaderboard): how it
// stands against the average model of its stand and of the fair, its scans per
// day split into first scans (unique) and repeated ones, and its ratings.

export type ModelComparison = {
  model: number;
  /** Average scans per model on the same map location; null when the model is alone there. */
  standAverage: number | null;
  standModels: number;
  /** Average scans per model across the fair. */
  fairAverage: number | null;
  fairModels: number;
  /** The longest of the three (bar scale). */
  max: number;
};

const average = (models: readonly AnalyticsModel[]) => (models.length ? Math.round((models.reduce((total, row) => total + row.scans.total, 0) / models.length) * 10) / 10 : null);

export function modelComparison(model: AnalyticsModel, data: AnalyticsData): ModelComparison {
  const stand = data.models.filter((row) => (row.mapLocationId || row.standCode) === (model.mapLocationId || model.standCode));
  const standAverage = stand.length > 1 ? average(stand) : null;
  const fairAverage = average(data.models);
  return {
    model: model.scans.total,
    standAverage,
    standModels: stand.length,
    fairAverage,
    fairModels: data.models.length,
    max: Math.max(model.scans.total, standAverage ?? 0, fairAverage ?? 0),
  };
}

export type ModelDay = { dateKey: string; label: string; scans: number; unique: number; repeated: number };

/** Per fair day: first scans of a visitor (unique) and every scan after the first (repeated). */
export function modelDays(detail: ModelAnalyticsData): { days: ModelDay[]; max: number; scans: number; unique: number; repeated: number } {
  const days = detail.days.map((day) => ({ dateKey: day.dateKey, label: day.label, scans: day.scans, unique: day.uniquePerModel, repeated: Math.max(0, day.scans - day.uniquePerModel) }));
  const total = (key: "scans" | "unique" | "repeated") => days.reduce((acc, day) => acc + day[key], 0);
  return { days, max: Math.max(0, ...days.map((day) => day.scans)), scans: total("scans"), unique: total("unique"), repeated: total("repeated") };
}

export type RatingBar = { stars: number; count: number; share: number };

/** The five rating buckets (1 … 5 by whole star), the highest first, with their share of all ratings. */
export function ratingBars(detail: ModelAnalyticsData): RatingBar[] {
  const { buckets, count } = detail.ratings;
  return buckets.map((value, index) => ({ stars: index + 1, count: value, share: count > 0 ? value / count : 0 })).reverse();
}
