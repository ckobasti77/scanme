export const SERVICE_IDS = ["reviews", "venue", "memories", "loyalty"] as const;

export type ServiceId = (typeof SERVICE_IDS)[number];

export type MarketingTheme = "light" | "dark";

export function isServiceId(value: unknown): value is ServiceId {
  return typeof value === "string" && SERVICE_IDS.includes(value as ServiceId);
}
