import type { Id } from "@/convex/_generated/dataModel";
import type { EventAnalyticsData, EventAudienceData } from "@/components/admin/events/analytics-logic";
import { fairHeatCap, fairHeatLevel } from "@/lib/fair-heat";

// SAJAM SUPER Korak 4 — TEST numbers of `analitika` for the dev preview
// (/dev/admin-events-preview/analitika): the real map locations of
// Elektromobilnost, invented TEST counts. Never shown outside `next dev`.

const AT = Date.parse("2026-10-09T15:20:00+02:00");
const CUTOFF = Date.parse("2026-10-09T08:00:00+02:00");
const id = (value: string) => value as Id<"fairEventModels">;

type Model = EventAnalyticsData["models"][number];
const model = (key: string, name: string, brandName: string, exhibitorName: string, standCode: string, mapLocationId: string, tier: Model["tier"], scans: [number, number], unique: [number, number], leads: number, votes: number, rating: [number, number] | null): Model => ({
  eventModelId: id(`test-preview-${key}`),
  name,
  brandName,
  exhibitorName,
  standCode,
  mapLocationId,
  tier,
  scans: { today: scans[0], total: scans[1] },
  uniquePerModel: { today: unique[0], total: unique[1] },
  leads,
  votes,
  rating: rating ? { average: rating[0], count: rating[1] } : null,
});

const models: Model[] = [
  model("jmev-ev3", "EV3", "TEST JMEV", "TEST CUBI d.o.o.", "9", "hala-9", "advanced", [41, 41], [33, 33], 6, 28, [4.4, 19]),
  model("jmev-yi", "YI", "TEST JMEV", "TEST CUBI d.o.o.", "9", "hala-9", "advanced", [29, 29], [24, 24], 4, 17, [4.1, 11]),
  model("jmev-ewind", "EWIND", "TEST JMEV", "TEST CUBI d.o.o.", "9", "hala-9", "advanced", [18, 18], [15, 15], 2, 9, [3.9, 7]),
  model("mazda-cx-60", "CX-60", "TEST Mazda", "TEST Grand Motors", "6", "hala-6", "included", [22, 22], [19, 19], 0, 0, null),
  model("chery-tiggo-9", "Tiggo 9 PHEV", "TEST Chery", "TEST Grand Motors", "6", "hala-6", "included", [14, 14], [12, 12], 0, 0, null),
  model("foton-eview", "eView", "TEST Foton", "TEST AUTO MIG", "6", "hala-6", "included", [9, 9], [8, 8], 0, 0, null),
  model("yudo-air", "Air Ultra", "TEST Yudo", "TEST Ferum", "1A", "hala-1a", "starter", [11, 11], [9, 9], 1, 0, [4, 5]),
  model("bentu-mango", "Mango", "TEST BENTU", "TEST BENTU", "1B", "hala-1b", "included", [5, 5], [5, 5], 0, 0, null),
];

const hours = [
  [8, 6, 5], [9, 15, 13], [10, 24, 20], [11, 31, 25], [12, 29, 24], [13, 22, 18], [14, 12, 10], [15, 10, 10],
].map(([hour, scans, unique]) => ({ dateKey: "2026-10-09", hour, scans, uniquePerModel: unique }));

const heatCounts = new Map([["hala-9", 72], ["hala-6", 39], ["hala-1a", 9], ["hala-1b", 5]]);
const hourCounts = new Map([["hala-9", 11], ["hala-6", 7.5], ["hala-1a", 2]]);
const heatRows = (counts: Map<string, number>, period: "today" | "hour") => {
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const cap = fairHeatCap(counts.values(), period);
  return [...counts].map(([locationId, count]) => ({ locationId, count, share: Math.round((count / total) * 1000) / 1000, level: fairHeatLevel(count, cap) }));
};

export const previewAnalytics: EventAnalyticsData = {
  at: AT,
  cutoff: CUTOFF,
  todayKey: "2026-10-09",
  capped: false,
  kpis: {
    scans: { today: 149, total: 149 },
    uniquePerModel: { today: 125, total: 125 },
    leads: { today: 13, total: 13, interest: 9, testDrive: 4, capped: false },
    audienceVotes: 54,
    surveys: { total: 8, capped: false },
    shares: { total: 6, capped: false },
  },
  days: [
    { dateKey: "2026-10-09", label: "Petak", scans: 149, uniquePerModel: 125 },
    { dateKey: "2026-10-10", label: "Subota", scans: 0, uniquePerModel: 0 },
    { dateKey: "2026-10-11", label: "Nedelja", scans: 0, uniquePerModel: 0 },
  ],
  hours,
  models,
  heat: { today: heatRows(heatCounts, "today"), hour: heatRows(hourCounts, "hour") },
};

export const previewAudience: EventAudienceData = {
  visitors: { today: 71, total: 71, capped: false },
  models: models.map((row) => ({ eventModelId: row.eventModelId, visitors: row.uniquePerModel.total })),
  locations: [
    { locationId: "hala-9", visitors: 49 },
    { locationId: "hala-6", visitors: 34 },
    { locationId: "hala-1a", visitors: 9 },
    { locationId: "hala-1b", visitors: 5 },
  ],
  devices: { mobile: 131, tablet: 4, desktop: 9, unknown: 5, bots: 3, sample: 149, capped: false },
  stamps: { total: 72, passportsCompleted: 11, capped: false },
};
