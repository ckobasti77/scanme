import { describe, expect, test } from "vitest";
import { previewAnalytics, previewAudience, previewEngagement } from "@/components/admin/events/preview-analytics-fixtures";
import { depthOfInterest, passportFunnel } from "./depth";

// ADMIN v2 X3 — depth of interest and the passport funnel.
// Fixtures: 310 visitors, 431 visitor–model pairs = 222 + 2·62 + 3·19 + 4·7.

const data = previewAnalytics;
const audience = previewAudience;
const engagement = previewEngagement;

describe("depthOfInterest", () => {
  const depth = depthOfInterest(data, audience, engagement)!;

  test("four buckets in order with their visitors", () => {
    expect(depth.buckets.map((bucket) => bucket.id)).toEqual(["one", "two", "three", "fourPlus"]);
    expect(depth.buckets.map((bucket) => bucket.visitors)).toEqual([222, 62, 19, 7]);
    expect(depth.visitors).toBe(310);
  });

  test("the shares add up to 1", () => {
    expect(depth.buckets.reduce((total, bucket) => total + bucket.share, 0)).toBeCloseTo(1, 10);
    expect(depth.buckets[0].share).toBeCloseTo(222 / 310, 10);
  });

  test("models per visitor is unique per model / distinct visitors", () => {
    expect(data.kpis.uniquePerModel.total).toBe(431);
    expect(depth.modelsPerVisitor).toBeCloseTo(431 / 310, 10);
  });

  test("is not capped when the visitor read is whole", () => {
    expect(depth.capped).toBe(false);
  });

  test("without the engagement read there is nothing to show", () => {
    expect(depthOfInterest(data, audience, undefined)).toBeNull();
  });

  test("without the audience read the visitors of the buckets are the denominator", () => {
    const alone = depthOfInterest(data, undefined, engagement)!;
    expect(alone.buckets.map((bucket) => bucket.visitors)).toEqual([222, 62, 19, 7]);
    expect(alone.modelsPerVisitor).toBeCloseTo(431 / 310, 10);
  });

  test("the audience's visitor total is preferred for models per visitor", () => {
    const other = depthOfInterest(data, { ...audience, visitors: { ...audience.visitors, total: 400 } }, engagement)!;
    expect(other.modelsPerVisitor).toBeCloseTo(431 / 400, 10);
  });

  test("no visitors: zero shares and no ratio", () => {
    const none = depthOfInterest(data, undefined, { ...engagement, depth: { one: 0, two: 0, three: 0, fourPlus: 0, visitors: 0 } })!;
    expect(none.buckets.every((bucket) => bucket.share === 0)).toBe(true);
    expect(none.modelsPerVisitor).toBeNull();
  });

  test("a partial visitor read is flagged", () => {
    const partial = depthOfInterest(data, audience, { ...engagement, capped: { ...engagement.capped, visitors: true } })!;
    expect(partial.capped).toBe(true);
  });
});

describe("passportFunnel", () => {
  test("stamps, completed passports and the share of stamp visitors that completes", () => {
    const funnel = passportFunnel(audience, engagement)!;
    expect(funnel.stamps).toBe(210);
    expect(funnel.completed).toBe(5);
    expect(funnel.stampVisitors).toBe(164);
    expect(funnel.stampVisitors).toBe(engagement.stampVisitors);
    // Per visitor with a stamp, not per stamp: a passport needs several stamps.
    expect(funnel.completion).toBeCloseTo(5 / engagement.stampVisitors, 10);
    expect(funnel.completion).not.toBeCloseTo(5 / 210, 3);
    expect(funnel.capped).toBe(false);
  });

  test("without the engagement read the stamp visitors and the completion are unknown", () => {
    const funnel = passportFunnel(audience, undefined)!;
    expect(funnel.stampVisitors).toBeNull();
    expect(funnel.stamps).toBe(210);
    expect(funnel.completed).toBe(5);
    expect(funnel.completion).toBeNull();
  });

  test("without the audience read there is no funnel", () => {
    expect(passportFunnel(undefined, engagement)).toBeNull();
    expect(passportFunnel(undefined, undefined)).toBeNull();
  });

  test("no visitor with a stamp: completion is null, not zero", () => {
    const funnel = passportFunnel({ ...audience, stamps: { total: 0, passportsCompleted: 0, capped: false } }, { ...engagement, stampVisitors: 0 })!;
    expect(funnel.completion).toBeNull();
    expect(funnel.stamps).toBe(0);
    expect(funnel.stampVisitors).toBe(0);
  });

  test("a stamp visitor but no completed passport is a real zero", () => {
    const funnel = passportFunnel({ ...audience, stamps: { total: 40, passportsCompleted: 0, capped: false } }, engagement)!;
    expect(funnel.completion).toBe(0);
  });

  test("capped when either read is partial", () => {
    expect(passportFunnel({ ...audience, stamps: { ...audience.stamps, capped: true } }, engagement)!.capped).toBe(true);
    expect(passportFunnel(audience, { ...engagement, capped: { ...engagement.capped, stamps: true } })!.capped).toBe(true);
    expect(passportFunnel(audience, { ...engagement, capped: { ...engagement.capped, visitors: true } })!.capped).toBe(false);
  });
});
