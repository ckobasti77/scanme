import { describe, expect, test } from "vitest";
import { previewAudience } from "@/components/admin/events/preview-analytics-fixtures";
import { deviceSummary } from "./devices";

// ADMIN v2 X3 — devices are one sentence: almost every scan is a phone; bots are named after it.
// Fixtures: 454 phones, 2 computers, 0 tablets, 0 unknown, 4 bots, a sample of 460.

const devices = previewAudience.devices;

describe("deviceSummary with the fixtures", () => {
  const summary = deviceSummary(devices)!;

  test("the total is the scans with a device kind; bots are not in it", () => {
    expect(summary.total).toBe(456);
    expect(summary.total).not.toBe(devices.sample);
    expect(summary.bots).toBe(4);
    expect(summary.sample).toBe(460);
  });

  test("the top kind is the phone with its share of the total", () => {
    expect(summary.top.kind).toBe("mobile");
    expect(summary.top.count).toBe(454);
    expect(summary.top.share).toBeCloseTo(454 / 456, 10);
  });

  test("the rest is the computer, then the tablet; an unknown kind with no scan is left out", () => {
    expect(summary.rest).toEqual([
      { kind: "desktop", count: 2 },
      { kind: "tablet", count: 0 },
    ]);
  });

  test("is not capped when the sample is whole", () => {
    expect(summary.capped).toBe(false);
  });
});

describe("deviceSummary: other mixes", () => {
  const mix = (over: Partial<typeof devices>) => ({ mobile: 0, tablet: 0, desktop: 0, unknown: 0, bots: 0, sample: 0, capped: false, ...over });

  test("an unknown kind with a scan is part of the rest, in order of size", () => {
    const summary = deviceSummary(mix({ mobile: 10, desktop: 2, unknown: 5, sample: 17 }))!;
    expect(summary.total).toBe(17);
    expect(summary.top.kind).toBe("mobile");
    expect(summary.rest.map((row) => row.kind)).toEqual(["unknown", "desktop", "tablet"]);
  });

  test("the top kind can be another kind", () => {
    const summary = deviceSummary(mix({ desktop: 8, mobile: 2, sample: 10 }))!;
    expect(summary.top).toEqual({ kind: "desktop", count: 8, share: 0.8 });
    expect(summary.rest.map((row) => row.kind)).toEqual(["mobile", "tablet"]);
  });

  test("the shares of the top and the rest add up to the total", () => {
    const summary = deviceSummary(mix({ mobile: 6, tablet: 3, desktop: 1, unknown: 2, sample: 12 }))!;
    expect(summary.top.count + summary.rest.reduce((total, row) => total + row.count, 0)).toBe(summary.total);
  });

  test("only bots: there is no device share to show", () => {
    expect(deviceSummary(mix({ bots: 9, sample: 9 }))).toBeNull();
  });

  test("all zero is null", () => {
    expect(deviceSummary(mix({}))).toBeNull();
  });

  test("a partial sample is flagged", () => {
    expect(deviceSummary(mix({ mobile: 3, sample: 3, capped: true }))!.capped).toBe(true);
  });

  test("no read yet is null", () => {
    expect(deviceSummary(undefined)).toBeNull();
  });
});
