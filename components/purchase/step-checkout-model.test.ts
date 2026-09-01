import { describe, expect, it } from "vitest";
import type { PurchaseSelection } from "@/lib/offer-url";
import { createDefaultProductSelection } from "@/lib/scanme-pricing";
import { recurringByPeriod } from "@/lib/pricing/summary";
import {
  checkoutTotals,
  hasSplitterLine,
  orderPeriod,
  orderedServices,
} from "./step-checkout-model";
import { priceSelection } from "./step-services-model";

function selection(partial: Partial<PurchaseSelection> = {}): PurchaseSelection {
  return {
    services: [],
    plan: "basic",
    products: [],
    step: 4,
    ...partial,
  };
}

describe("step-checkout-model", () => {
  it("lists owned services in canonical order regardless of selection order", () => {
    const sel = selection({
      services: [
        { service: "review", period: "monthly" },
        { service: "venue", period: "monthly" },
        { service: "links", period: "monthly" },
      ],
    });
    // Canonical order is links, venue, memories, menu, review.
    expect(orderedServices(sel)).toEqual(["links", "venue", "review"]);
  });

  it("reads the recurring split from the SAME engine call the shell's bar uses", () => {
    const sel = selection({
      services: [{ service: "memories", period: "annual" }],
      plan: "premium",
      planPeriod: "annual",
    });
    const breakdown = priceSelection(sel)!;
    expect(checkoutTotals(sel).recurring).toEqual(recurringByPeriod(breakdown));
  });

  it("an empty cart yields zeroed recurring money without calling the engine", () => {
    expect(checkoutTotals(selection()).recurring).toEqual({ monthly: 0, annual: 0 });
  });

  it("orderPeriod follows the Premium plan period, else the services' shared period", () => {
    expect(
      orderPeriod(
        selection({
          services: [{ service: "memories", period: "monthly" }],
          plan: "premium",
          planPeriod: "annual",
        }),
      ),
    ).toBe("annual");
    expect(
      orderPeriod(
        selection({
          services: [
            { service: "links", period: "monthly" },
            { service: "review", period: "monthly" },
          ],
        }),
      ),
    ).toBe("monthly");
  });

  it("detects a splitter line only when a physical line is bound to 2+ services", () => {
    const single = selection({
      services: [
        { service: "links", period: "monthly" },
        { service: "venue", period: "monthly" },
      ],
      products: [createDefaultProductSelection("two-piece-stand")],
      // No hand binding → the model binds the single/first service silently.
    });
    expect(hasSplitterLine(single)).toBe(false);

    const split = selection({
      ...single,
      bindings: { "two-piece-stand": ["links", "venue"] },
    });
    expect(hasSplitterLine(split)).toBe(true);
  });
});
