import { describe, expect, test } from "vitest";
import { FAIR_PRE_EVENT_CATEGORIES, FAIR_PURGE_CATEGORIES, fairIsPreEvent } from "./fair-contract";
import { fairPackageActivationAt, fairTierAt } from "./fair-entitlements";

// Sajam 2026 P1 (Aleksa, 8. 10. 2026) — the two pure rules: what is
// pre-event, and when a package's rights start.

const ELEKTROMOBILNOST_STARTS_AT = Date.parse("2026-10-09T00:00:00+02:00");
const event = { startsAt: ELEKTROMOBILNOST_STARTS_AT };

describe("fairIsPreEvent — the boundary is the event's startsAt", () => {
  test("elektromobilnost-2026: 2026-10-09T00:00+02:00 is 2026-10-08T22:00Z", () => {
    expect(ELEKTROMOBILNOST_STARTS_AT).toBe(Date.UTC(2026, 9, 8, 22, 0, 0));
  });

  test("−1 ms is pre-event, the boundary itself and +1 ms belong to the fair", () => {
    expect(fairIsPreEvent(ELEKTROMOBILNOST_STARTS_AT - 1, event)).toBe(true);
    expect(fairIsPreEvent(ELEKTROMOBILNOST_STARTS_AT, event)).toBe(false);
    expect(fairIsPreEvent(ELEKTROMOBILNOST_STARTS_AT + 1, event)).toBe(false);
  });

  test("the day before (8. 10. tests) is pre-event; the whole fair and later are not", () => {
    expect(fairIsPreEvent(Date.parse("2026-10-08T12:00:00+02:00"), event)).toBe(true);
    expect(fairIsPreEvent(Date.parse("2026-10-08T23:59:59.999+02:00"), event)).toBe(true);
    expect(fairIsPreEvent(Date.parse("2026-10-09T03:00:00+02:00"), event)).toBe(false);
    expect(fairIsPreEvent(Date.parse("2026-10-12T03:17:00+02:00"), event)).toBe(false);
  });

  test("each event has its own boundary (Auto Moto Fest starts 30. 10. in CET)", () => {
    const amf = { startsAt: Date.parse("2026-10-30T00:00:00+01:00") };
    const day1 = Date.parse("2026-10-09T10:00:00+02:00");
    expect(fairIsPreEvent(day1, event)).toBe(false);
    expect(fairIsPreEvent(day1, amf)).toBe(true);
    expect(fairIsPreEvent(amf.startsAt - 1, amf)).toBe(true);
    expect(fairIsPreEvent(amf.startsAt, amf)).toBe(false);
  });

  test("the reset categories are purge categories, without visitors and shared collections", () => {
    expect(FAIR_PRE_EVENT_CATEGORIES.every((category) => (FAIR_PURGE_CATEGORIES as readonly string[]).includes(category))).toBe(true);
    expect(FAIR_PRE_EVENT_CATEGORIES).not.toContain("visitors");
    expect(FAIR_PRE_EVENT_CATEGORIES).not.toContain("share_collections");
  });
});

describe("fairPackageActivationAt — rights start at assignment", () => {
  const assignedAt = Date.parse("2026-10-08T10:00:00+02:00");

  test("a future package_active_from (the fair's first day) no longer delays the rights", () => {
    expect(fairPackageActivationAt(Date.parse("2026-10-09T00:00:00+02:00"), assignedAt)).toBe(assignedAt);
    expect(fairPackageActivationAt(assignedAt + 1, assignedAt)).toBe(assignedAt);
  });

  test("no value means the assignment moment; a past value is kept", () => {
    expect(fairPackageActivationAt(undefined, assignedAt)).toBe(assignedAt);
    const past = Date.parse("2026-10-01T09:00:00+02:00");
    expect(fairPackageActivationAt(past, assignedAt)).toBe(past);
    expect(fairPackageActivationAt(assignedAt, assignedAt)).toBe(assignedAt);
  });

  test("a package assigned on 8. 10. is in force at once (tier history)", () => {
    const activatedAt = fairPackageActivationAt(Date.parse("2026-10-09T00:00:00+02:00"), assignedAt);
    const history = { initialTier: "included" as const, startedAt: assignedAt, activations: [{ toTier: "starter" as const, activatedAt }] };
    expect(fairTierAt(history, assignedAt)).toBe("starter");
    expect(fairTierAt(history, assignedAt - 1)).toBe("included");
  });
});
