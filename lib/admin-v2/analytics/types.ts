import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";

// ADMIN v2 X3 — the four reads behind `Događaji → Analitika` (convex/fairEventAnalytics.ts).
// The pure functions of this folder turn them into what each chart draws.

export type AnalyticsData = FunctionReturnType<typeof api.fairEventAnalytics.getEventAnalytics>;
export type AudienceData = FunctionReturnType<typeof api.fairEventAnalytics.getEventAudience>;
export type EngagementData = FunctionReturnType<typeof api.fairEventAnalytics.getEventEngagement>;
export type ModelAnalyticsData = FunctionReturnType<typeof api.fairEventAnalytics.getModelAnalytics>;

export type AnalyticsModel = AnalyticsData["models"][number];
export type AnalyticsHeatRow = AnalyticsData["heat"]["today"][number];
