import { describe, expect, test } from "vitest";
import { price } from "./engine";
import { recurringByPeriod } from "./summary";

describe("recurringByPeriod (RFC-002 §2.3 split-total bar)", () => {
  test("annual services + premium annual plan land in the annual bucket only", () => {
    const breakdown = price({
      items: [{ service: "venue", period: "annual" }],
      plan: "premium",
      planPeriod: "annual",
    });
    const recurring = recurringByPeriod(breakdown);
    expect(recurring.monthly).toBe(0);
    expect(recurring.annual).toBe(breakdown.totalRsd);
  });

  test("monthly and annual money stay two separate figures, never summed", () => {
    const breakdown = price({
      items: [
        { service: "links", period: "monthly" },
        { service: "review", period: "annual" },
      ],
      plan: "basic",
    });
    const recurring = recurringByPeriod(breakdown);
    const monthlyGroup = breakdown.groups.find((g) => g.period === "monthly");
    const annualGroup = breakdown.groups.find((g) => g.period === "annual");
    expect(recurring.monthly).toBe(monthlyGroup!.chargedRsd);
    expect(recurring.annual).toBe(annualGroup!.chargedRsd);
    // The two buckets add up to the services charged (Basic adds no plan line).
    expect(recurring.monthly + recurring.annual).toBe(breakdown.servicesChargedRsd);
  });

  test("the premium plan line joins its own period bucket", () => {
    const breakdown = price({
      items: [{ service: "memories", period: "monthly" }],
      plan: "premium",
      planPeriod: "monthly",
    });
    const recurring = recurringByPeriod(breakdown);
    expect(recurring.monthly).toBe(
      breakdown.groups[0].chargedRsd + breakdown.planLine.amountRsd,
    );
    expect(recurring.annual).toBe(0);
  });

  test("enterprise (on request) contributes no plan money", () => {
    const breakdown = price({
      items: [{ service: "venue", period: "annual" }],
      plan: "enterprise",
    });
    const recurring = recurringByPeriod(breakdown);
    expect(breakdown.planLine.onRequest).toBe(true);
    expect(recurring.annual).toBe(breakdown.servicesChargedRsd);
  });
});
