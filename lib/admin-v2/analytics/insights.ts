import { depthOfInterest, passportFunnel } from "./depth";
import { formatCount, formatShare, formatTimes, hourLabel, lowerFirst, sum } from "./format";
import { leaderboard } from "./leaderboard";
import type { InsightId } from "./insight-ids";
import { hourMatrix } from "./matrix";
import { packageGap, packageRows, standRanking } from "./stands";
import type { AnalyticsData, AudienceData, EngagementData } from "./types";

// ADMIN v2 X3 — „Uvidi“: three to six short sentences computed from the
// numbers by fixed rules, never by a model. The rules run in this order (the
// most important first) and the first six that hold are shown. Each rule
// returns the values of its sentence; the sentence itself is in the dictionary
// (adminEventsSr.analytics.v2.insights.items).

export const INSIGHT_LIMIT = 6;

export const INSIGHT_RULES = {
  /** Later days against the first day: at least this many times more scans per day. */
  laterDaysTimes: 1.3,
  /** The leading stand holds at least this share of the scans. */
  topStandShare: 0.4,
  /** At least this share of the visitors scanned one model only. */
  singleModelShare: 0.6,
  /** Visitors with a stamp who completed a passport: below this share. */
  passportCompletion: 0.05,
  /** The best package has at least this many times more scans per model than the weakest. */
  packageTimes: 2,
  /** The leading model holds at least this share of all scans. */
  topModelShare: 0.2,
} as const;

export type { InsightId };

export type Insight = {
  id: InsightId;
  /** `problem` goes with the danger icon and its text; everything else is a plain fact. */
  tone: "problem" | "fact";
  /** The placeholders of the sentence, already formatted. */
  values: Record<string, string | number>;
};

export type InsightTexts = {
  /** Label of a package tier ("advanced" → "Napredni"). */
  tier: (tier: string) => string;
  /** " i " */
  and: string;
  /** „Ostali dani“, when more than two days are compared with the first. */
  otherDays: string;
  /** A number of scans with its noun ("39 skenova"). */
  scans: (count: number) => string;
};

export function analyticsInsights(
  input: { data: AnalyticsData; audience: AudienceData | undefined; engagement: EngagementData | undefined },
  texts: InsightTexts,
): Insight[] {
  const { data, audience, engagement } = input;
  const out: Insight[] = [];
  const scans = data.kpis.scans.total;
  if (scans === 0) return out;
  const activeDays = data.days.filter((day) => day.scans > 0);

  // 1. No lead at all.
  if (data.kpis.leads.total === 0) {
    const days = activeDays.length;
    out.push(days % 10 === 1 && days % 100 !== 11 ? { id: "no_leads_one", tone: "problem", values: { days } } : { id: "no_leads_many", tone: "problem", values: { days } });
  }

  // 2. The later days against the first one, per day.
  const [first, ...later] = activeDays;
  if (first && later.length) {
    const times = sum(later.map((day) => day.scans)) / later.length / first.scans;
    if (times >= INSIGHT_RULES.laterDaysTimes) {
      const days = later.length <= 2 ? later.map((day, index) => (index === 0 ? day.label : lowerFirst(day.label))).join(texts.and) : texts.otherDays;
      out.push({ id: "later_days", tone: "fact", values: { days, times: formatTimes(times), first: lowerFirst(first.label) } });
    }
  }

  // 3. The leading stand: of today's scans on a fair day, else of all scans.
  const stands = standRanking(data, audience);
  const today = data.kpis.scans.today;
  if (today > 0) {
    const top = [...stands].sort((a, b) => b.scansToday - a.scansToday)[0];
    if (top && top.scansToday / today >= INSIGHT_RULES.topStandShare) out.push({ id: "top_stand_today", tone: "fact", values: { stand: top.standCode, share: formatShare(top.scansToday / today) } });
  } else if (stands[0] && stands[0].scans / scans >= INSIGHT_RULES.topStandShare) {
    out.push({ id: "top_stand_total", tone: "fact", values: { stand: stands[0].standCode, share: formatShare(stands[0].scans / scans) } });
  }

  // 4. The busiest hour of the fair.
  const peak = hourMatrix(data.days, data.hours.map((row) => ({ dateKey: row.dateKey, hour: row.hour, value: row.scans }))).peak;
  if (peak) out.push({ id: "peak_hour", tone: "fact", values: { day: lowerFirst(peak.label), hour: hourLabel(peak.hour), scans: texts.scans(peak.value) } });

  // 5. Most visitors scan one model.
  const depth = depthOfInterest(data, audience, engagement);
  const single = depth?.buckets.find((bucket) => bucket.id === "one");
  if (depth && single && depth.visitors > 0 && single.share >= INSIGHT_RULES.singleModelShare) {
    out.push({ id: "single_model", tone: "fact", values: { share: formatShare(single.share) } });
  }

  // 6. Few of the visitors who got a stamp complete a passport.
  const passport = passportFunnel(audience, engagement);
  if (passport && passport.completion !== null && passport.completion < INSIGHT_RULES.passportCompletion) {
    out.push({ id: "passport_low", tone: "fact", values: { completed: formatCount(passport.completed), visitors: formatCount(passport.stampVisitors), share: formatShare(passport.completion) } });
  }

  // 7. Packages differ a lot in scans per model (a correlation, the sentence says so).
  const gap = packageGap(packageRows(data, engagement));
  if (gap && gap.times >= INSIGHT_RULES.packageTimes) {
    out.push({ id: "package_gap", tone: "fact", values: { best: texts.tier(gap.best.tier), worst: lowerFirst(texts.tier(gap.worst.tier)), times: formatTimes(gap.times) } });
  }

  // 8. One model carries a large part of the fair.
  const leader = leaderboard(data, audience, engagement)[0];
  if (leader && leader.fairShare !== null && leader.fairShare >= INSIGHT_RULES.topModelShare) {
    out.push({ id: "top_model", tone: "fact", values: { model: `${leader.brandName} ${leader.name}`.trim(), share: formatShare(leader.fairShare) } });
  }

  return out.slice(0, INSIGHT_LIMIT);
}
